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
    // Schedule the outbox processor to run every 10 seconds
    await this.pgBoss.schedule(
      'outbox.process',
      '*/10 * * * * *', // Every 10 seconds (pg-boss supports seconds)
      {},
      { timezone: 'UTC' },
    );

    // Also define the worker for this job
    await this.pgBoss.subscribe('outbox.process', async () => {
      await this.processBatch();
    }, { teamSize: 1, teamConcurrency: 1 });

    this.log.log('Outbox worker scheduled');
  }

  async processBatch(batchSize = 100): Promise<number> {
    const jobs = await this.db.all<{
      id: number;
      type: string;
      payload: any;
      attempts: number;
    }>(
      `SELECT id, type, payload, attempts
       FROM outbox
       WHERE processed_at IS NULL
         AND attempts < $1
       ORDER BY created_at
       LIMIT $2`,
      [this.MAX_ATTEMPTS, batchSize],
    );

    if (!jobs.length) return 0;

    let processed = 0;
    for (const job of jobs) {
      try {
        await this.processJob(job);
        await this.db.query(
          'UPDATE outbox SET processed_at = now() WHERE id = $1',
          [job.id],
        );
        processed++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const nextAttempt = job.attempts + 1;

        if (nextAttempt >= this.MAX_ATTEMPTS) {
          // Dead letter - mark as processed but log error
          await this.db.query(
            `UPDATE outbox
             SET processed_at = now(), attempts = $2, last_error = $3
             WHERE id = $1`,
            [job.id, nextAttempt, errorMessage],
          );
          this.log.error(`Outbox job ${job.id} dead-lettered after ${nextAttempt} attempts: ${errorMessage}`);
        } else {
          // Retry with exponential backoff
          const delayMs = this.BASE_DELAY_MS * Math.pow(2, job.attempts);
          await this.db.query(
            `UPDATE outbox
             SET attempts = $2, last_error = $3
             WHERE id = $1`,
            [job.id, nextAttempt, errorMessage],
          );
          this.log.warn(`Outbox job ${job.id} failed (attempt ${nextAttempt}/${this.MAX_ATTEMPTS}), will retry in ${delayMs}ms: ${errorMessage}`);
        }
      }
    }

    if (processed > 0) {
      this.log.debug(`Processed ${processed} outbox jobs`);
    }
    return processed;
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