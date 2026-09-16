import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export interface QueryResultLike {
  rows: any[];
  rowCount: number | null;
}

/** Anything that can run SQL — the Pool, or a client inside a transaction. */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
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
  constructor(private readonly conn: Queryable, readonly table: string) {
    super();
  }

  query(sql: string, params: unknown[] = []): Promise<QueryResultLike> {
    return this.conn.query(sql, params);
  }

  byId(id: string): Promise<T | null> {
    return this.one<T>(`SELECT * FROM ${this.table} WHERE id = $1`, [id]);
  }

  /** INSERT built from the object's own keys — one path for every table. */
  async insert(dto: Record<string, unknown>): Promise<T> {
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

@Injectable()
export class Db extends Reader implements Queryable, OnModuleDestroy {
  /** ponytail: fixed pool of 10. Raise max if p99 latency tracks pool wait. */
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  });

  query(sql: string, params: unknown[] = []): Promise<QueryResultLike> {
    return this.pool.query(sql, params);
  }

  /** A table gateway, bound to a transaction connection when one is supplied. */
  repo<T>(table: string, conn: Queryable = this): Repo<T> {
    return new Repo<T>(conn, table);
  }

  /** Runs fn in a transaction, rolling back on any throw. */
  async tx<R>(fn: (conn: Queryable) => Promise<R>): Promise<R> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  onModuleDestroy() {
    return this.pool.end();
  }
}
