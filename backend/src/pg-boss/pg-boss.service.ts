import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// pg-boss v10+ API - uses named exports and createQueue
type PgBossInstance = {
  start: (options?: any) => Promise<any>;
  stop: (options?: any) => Promise<void>;
  send: (name: string, data?: object | null, options?: any) => Promise<string | null>;
  work: (name: string, options: any, handler: (jobs: any[]) => Promise<void>) => Promise<string>;
  schedule: (name: string, cron: string, data: any, options?: any) => Promise<void>;
  createQueue: (name: string) => Promise<void>;
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
      this.log.error('DATABASE_URL not set, PgBoss cannot start');
      throw new Error('DATABASE_URL is required for PgBoss');
    }

    // pg-boss v10+ uses named export
    const { PgBoss } = require('pg-boss');
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
   * Ensure a queue exists before using it.
   */
  async ensureQueue(name: string): Promise<void> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    await this.boss.createQueue(name);
  }

  /**
   * Send a job to the queue.
   */
  async send<T extends Record<string, unknown>>(name: string, data: T): Promise<string> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    await this.ensureQueue(name);
    const result = await this.boss.send(name, data);
    if (!result) throw new Error('Failed to send job');
    return result;
  }

  /**
   * Subscribe to a job queue with a handler.
   * Note: pg-boss v10+ work handlers receive an ARRAY of jobs.
   */
  async subscribe<T extends Record<string, unknown>>(
    name: string,
    handler: (jobs: { data: T; id: string; name: string }[]) => Promise<void>,
    options: { teamSize?: number; teamConcurrency?: number } = {},
  ): Promise<void> {
    if (!this.boss) {
      throw new Error('PgBoss not initialized');
    }
    await this.ensureQueue(name);
    // Wrap handler to handle array of jobs
    const wrappedHandler = async (jobs: any[]) => {
      await handler(jobs as { data: T; id: string; name: string }[]);
    };
    await this.boss.work(name, options, wrappedHandler);
    this.log.log(`Subscribed to job queue: ${name}`);
  }

  /**
   * Schedule a recurring job.
   * pg-boss cron minimum is 1 minute.
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
    await this.ensureQueue(name);
    await this.boss.schedule(name, cron, data, options);
    this.log.log(`Scheduled recurring job: ${name} (${cron})`);
  }

  getBoss(): PgBossInstance | null {
    return this.boss;
  }
}