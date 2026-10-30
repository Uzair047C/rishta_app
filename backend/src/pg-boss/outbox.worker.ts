import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Db } from '../db/db';
import { PgBossService } from './pg-boss.service';
import { PushService } from '../notifications/push.service';

@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly log = new Logger(OutboxWorker.name);
  private readonly MAX_ATTEMPTS = 5;
  private readonly BASE_DELAY_MS = 1000; // 1s, 2s, 4s, 8s, 16s

  constructor(
    private readonly db: Db,
    private readonly pgBoss: PgBossService,
    private readonly push: PushService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Schedule the outbox processor to run every minute (pg-boss minimum)
    await this.pgBoss.schedule(
      'outbox.process',
      '* * * * *', // Every minute
      {},
      { timezone: 'UTC' },
    );

    // Also define the worker for this job
    await this.pgBoss.subscribe('outbox.process', async (jobs: { id: string; name: string; data: { type: string; payload: any } }[]) => {
      // pg-boss v10+ passes array of jobs with {id, name, data}
      for (const job of jobs) {
        await this.processJob({
          id: parseInt(job.id, 10),
          type: job.data.type,
          payload: job.data.payload,
        });
      }
    }, { teamSize: 1, teamConcurrency: 1 });

    this.log.log('Outbox worker scheduled (every minute)');
  }

  // Public method to trigger outbox processing immediately (e.g., after like/match)
  async processBatch(batchSize = 100): Promise<number> {
    // Use FOR UPDATE SKIP LOCKED to avoid double-processing
    const client = await this.db.getPool().connect();
    try {
      await client.query('BEGIN');

      const jobsResult = await client.query(
        `SELECT id, type, payload, attempts
         FROM outbox
         WHERE processed_at IS NULL
           AND dead_at IS NULL
           AND next_attempt_at <= now()
         ORDER BY id
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [batchSize],
      );

      if (!jobsResult.rowCount) {
        await client.query('COMMIT');
        return 0;
      }

      let processed = 0;
      for (const job of jobsResult.rows) {
        try {
          await this.processJob(job);
          await client.query(
            'UPDATE outbox SET processed_at = now() WHERE id = $1',
            [job.id],
          );
          processed++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          const nextAttempt = job.attempts + 1;

          if (nextAttempt >= this.MAX_ATTEMPTS) {
            // Dead letter - set dead_at, not processed_at
            await client.query(
              `UPDATE outbox
               SET attempts = $2, last_error = $3, dead_at = now()
               WHERE id = $1`,
              [job.id, nextAttempt, errorMessage],
            );
            this.log.error(`Outbox job ${job.id} dead-lettered after ${nextAttempt} attempts: ${errorMessage}`);
          } else {
            // Retry with exponential backoff
            const delayMs = this.BASE_DELAY_MS * Math.pow(2, job.attempts);
            const nextAttemptAt = new Date(Date.now() + delayMs);
            await client.query(
              `UPDATE outbox
               SET attempts = $2, last_error = $3, next_attempt_at = $4
               WHERE id = $1`,
              [job.id, nextAttempt, errorMessage, nextAttemptAt],
            );
            this.log.warn(`Outbox job ${job.id} failed (attempt ${nextAttempt}/${this.MAX_ATTEMPTS}), will retry at ${nextAttemptAt.toISOString()}: ${errorMessage}`);
          }
        }
      }

      await client.query('COMMIT');
      if (processed > 0) {
        this.log.debug(`Processed ${processed} outbox jobs`);
      }
      return processed;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async processJob(job: { id: number; type: string; payload: any }): Promise<void> {
    switch (job.type) {
      case 'new_like':
        await this.push.toUser(job.payload.toUserId, 'new_like', { fromUserId: job.payload.fromUserId });
        break;
      case 'new_match':
        for (const userId of job.payload.userIds) {
          await this.push.toUser(userId, 'new_match', { matchId: job.payload.matchId });
        }
        break;
      default:
        this.log.warn(`Unknown outbox job type: ${job.type}`);
    }
  }
}