import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { ConfigService } from '@nestjs/config';

export interface QueryResultLike {
  rows: any[];
  rowCount: number | null;
}

/** Anything that can run SQL — the Pool, or a client inside a transaction. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
}

/** Extended Queryable with reader methods (available on Db, but not on raw PoolClient) */
export interface ExtendedQueryable extends Queryable {
  one<T>(sql: string, params?: unknown[]): Promise<T | null>;
  oneOrNone<T>(sql: string, params?: unknown[]): Promise<T | null>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * The read shapes every caller needs. Defined once here and inherited by both
 * Db and Repo, so the SQL-running code is not duplicated across them.
 */
abstract class Reader {
  abstract query(sql: string, params?: unknown[]): Promise<QueryResultLike>;

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.query(sql, params)).rows as T[];
  }

  async one<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return ((await this.query(sql, params)).rows[0] ?? null) as T | null;
  }

  async oneOrNone<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return ((await this.query(sql, params)).rows[0] ?? null) as T | null;
  }

  async count(sql: string, params: unknown[] = []): Promise<number> {
    const rows = (await this.query(sql, params)).rows as { n: number | string }[];
    return Number(rows[0]?.n ?? 0);
  }
}

/**
 * Generic table gateway. One class serves every table: the only thing that
 * varies is the table name, so it is a constructor argument rather than a
 * subclass per entity.
 *
 * Table and column names are interpolated into SQL. That is safe because they
 * come from server-authored code — never from a request body.
 */
export class Repo<T> extends Reader {
  private readonly allowedColumns: Set<string>;

  constructor(
    private readonly conn: Queryable,
    readonly table: string,
    allowedColumns?: string[]
  ) {
    super();
    this.allowedColumns = new Set(allowedColumns ?? []);
  }

  query(sql: string, params: unknown[] = []): Promise<QueryResultLike> {
    return this.conn.query(sql, params);
  }

  byId(id: string): Promise<T | null> {
    return this.one<T>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
  }

  /** INSERT built from the object's own keys — one path for every table. */
  async insert(dto: Record<string, unknown>): Promise<T> {
    if (this.allowedColumns.size > 0) {
      for (const key of Object.keys(dto)) {
        if (!this.allowedColumns.has(key)) {
          throw new Error(`Unknown column: ${key} for table ${this.table}`);
        }
      }
    }
    const keys = Object.keys(dto);
    const cols = keys.map((k) => `"${k}"`).join(', ');
    const holes = keys.map((_, i) => `$${i + 1}`).join(', ');
    const row = await this.one<T>(
      `INSERT INTO ${this.table} (${cols}) VALUES (${holes}) RETURNING *`,
      Object.values(dto),
    );
    return row as T;
  }

  /** UPDATE built from the object's own keys. */
  async set(id: string, dto: Record<string, unknown>): Promise<T | null> {
    if (this.allowedColumns.size > 0) {
      for (const key of Object.keys(dto)) {
        if (!this.allowedColumns.has(key)) {
          throw new Error(`Unknown column: ${key} for table ${this.table}`);
        }
      }
    }
    const keys = Object.keys(dto);
    if (!keys.length) return this.byId(id);
    const assignments = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ');
    return this.one<T>(
      `UPDATE ${this.table} SET ${assignments} WHERE id = $1 RETURNING *`,
      [id, ...Object.values(dto)],
    );
  }

  async remove(id: string): Promise<number> {
    return (await this.query(`DELETE FROM ${this.table} WHERE id = $1`, [id])).rowCount ?? 0;
  }
}

function buildSslConfig(config: ConfigService): false | { rejectUnauthorized: boolean; ca?: string } {
  const sslMode = config.get<string>('DATABASE_SSL') ?? 'false';
  if (sslMode !== 'true') {
    return false;
  }

  const insecure = config.get<string>('DATABASE_SSL_INSECURE') === 'true';
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  if (insecure && isProduction) {
    throw new Error('DATABASE_SSL_INSECURE=true is not allowed in production');
  }

  const ca = config.get<string>('DATABASE_SSL_CA');
  return {
    rejectUnauthorized: !insecure,
    ca: ca || undefined,
  };
}

@Injectable()
export class Db extends Reader implements Queryable, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Db.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    super();

    const max = config.get<number>('DB_POOL_MAX') ?? 10;
    const connectionTimeoutMillis = 5000;
    const idleTimeoutMillis = 30000;
    const statementTimeout = 10000;

    this.pool = new Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      max,
      ssl: buildSslConfig(config),
      connectionTimeoutMillis,
      idleTimeoutMillis,
      // statement_timeout is set per-query via SET statement_timeout = ...
      // We'll set it on each connection in onModuleInit
    });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected pool error', err);
    });
  }

  onModuleInit() {
    // Set statement_timeout on each connection
    this.pool.on('connect', async (client: PoolClient) => {
      try {
        await client.query('SET statement_timeout = 10000');
      } catch (err) {
        this.logger.warn('Failed to set statement_timeout', err);
      }
    });
  }

  query(sql: string, params: unknown[] = []): Promise<QueryResultLike> {
    return this.pool.query(sql, params);
  }

  /** A table gateway, bound to a transaction connection when one is supplied. */
  repo<T>(table: string, conn: Queryable = this, allowedColumns?: string[]): Repo<T> {
    return new Repo<T>(conn, table, allowedColumns);
  }

  /** Runs fn in a transaction, rolling back on any throw. */
  async tx<R>(
    fn: (conn: ExtendedQueryable) => Promise<R>,
    options?: { isolation?: 'read_committed' | 'repeatable_read' | 'serializable'; lockTimeout?: number }
  ): Promise<R> {
    const client: PoolClient = await this.pool.connect();
    let originalErr: unknown;

    // Wrap client with Reader methods
    const txConn: ExtendedQueryable = {
      query: (sql, params) => client.query(sql, params),
      one: <T,>(sql: string, params?: unknown[]) => client.query(sql, params).then(r => (r.rows[0] ?? null) as T | null),
      oneOrNone: <T,>(sql: string, params?: unknown[]) => client.query(sql, params).then(r => (r.rows[0] ?? null) as T | null),
      all: <T,>(sql: string, params?: unknown[]) => client.query(sql, params).then(r => r.rows as T[]),
    };

    try {
      if (options?.isolation) {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolation.toUpperCase().replace('_', ' ')}`);
      }
      if (options?.lockTimeout) {
        await client.query(`SET lock_timeout = ${options.lockTimeout}`);
      }
      await client.query('BEGIN');
      const out = await fn(txConn);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      originalErr = err;
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        this.logger.error('ROLLBACK failed', rbErr);
        // On rollback failure, release with true to destroy the client
        client.release(true);
        // Attach rollback error as cause to original error
        if (originalErr instanceof Error && rbErr instanceof Error) {
          (originalErr as Error & { cause?: Error }).cause = rbErr;
        }
        throw originalErr;
      }
      throw originalErr;
    } finally {
      client.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
