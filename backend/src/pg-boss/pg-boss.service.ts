import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// pg-boss is ESM-only, so we use require for dynamic import
type PgBossInstance = {
  start: (options?: any) => Promise<any>;
  stop: (options?: any) => Promise<void>;
  send: (name: string, data?: object | null, options?: any) => Promise<string | null>;
  work: (name: string, options: any, handler: (job: any) => Promise<void>) => Promise<string>;
  schedule: (name: string, cron: string, data: any, options?: any) => Promise<void>;
};

@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PgBossService.name);
  private boss: PgBossInstance | null = null;
  private readonly connectionString: string;

  constructor(private readonly config: ConfigService) {
    this.connectionString = this.config.get<string>('DATABASE_URL') ?? '';
  }

  async onModuleInit(): Promise<void> {
    if (!this.connectionString) {
      this.log.warn('DATABASE_URL not set, PgBoss not started');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PgBoss = require('pg-boss').default;
    const boss = new PgBoss(this.connectionString, {
      schema: 'public',
      archiveCompletedJobsEvery: '1 hour',
      archiveCompletedJobsOlderThan: '1 day',
      deleteArchivedJobsEvery: '1 day',
      deleteArchivedJobsOlderThan: '7 days',
    });

    await boss.start();
    this.boss = boss;
    this.log.log('PgBoss started');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss != null) {
      await this.boss.stop();
      this.log.log('PgBoss stopped');
    }
  }

  /**
   * Send a job to the queue.
   */
  async send<T extends Record<string, unknown>>(name: string, data: T): Promise<string> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    const result = await this.boss.send(name, data);
    if (!result) throw new Error('Failed to send job');
    return result;
  }

  /**
   * Subscribe to a job queue with a handler.
   */
  async subscribe<T extends Record<string, unknown>>(
    name: string,
    handler: (job: { data: T; id: string; name: string }) => Promise<void>,
    options: { teamSize?: number; teamConcurrency?: number } = {},
  ): Promise<void> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    await this.boss.work(name, options, handler);
    this.log.log(`Subscribed to job queue: ${name}`);
  }

  /**
   * Schedule a recurring job.
   */
  async schedule<T extends Record<string, unknown>>(
    name: string,
    cron: string,
    data: T,
    options: { timezone?: string } = {},
  ): Promise<void> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    await this.boss.schedule(name, cron, data, options);
    this.log.log(`Scheduled recurring job: ${name} (${cron})`);
  }

  getBoss(): PgBossInstance | null {
    return this.boss;
  }
}