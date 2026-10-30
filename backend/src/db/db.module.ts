import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { Db } from './db';

@Global()
@Module({
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('DATABASE_URL');
        if (!databaseUrl) {
          throw new Error('DATABASE_URL is not configured');
        }
        const pool = new Pool({
          connectionString: databaseUrl,
          max: config.get<number>('DB_POOL_MAX') ?? 20,
          statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS') ?? 30_000,
          idle_in_transaction_session_timeout: 15_000,
        });
        // Graceful shutdown
        const shutdown = async () => {
          await pool.end();
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        return pool;
      },
      inject: [ConfigService],
    },
    {
      provide: Db,
      useFactory: (pool: Pool) => new Db(pool),
      inject: ['PG_POOL'],
    },
  ],
  exports: [Db, 'PG_POOL'],
})
export class DbModule {}