import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Db } from '../db/db';
import { PgBossService } from './pg-boss.service';

/**
 * Scaling plan §6 — "Report SLAs: review within 24h; cron alert if breached".
 * Rows get sla_deadline from migration 0015; this worker counts breached
 * open/reviewing items hourly and logs a loud alert. Alerting destination is
 * whatever scrapes the logs (Sentry/Datadog alert on this message) — no extra
 * wiring until an ops stack exists.
 */
@Injectable()
export class SlaWorker implements OnModuleInit {
  private readonly log = new Logger(SlaWorker.name);

  constructor(
    private readonly db: Db,
    private readonly pgBoss: PgBossService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.schedule('sla.check', '0 * * * *', {}, { timezone: 'UTC' });
    await this.pgBoss.subscribe('sla.check', async () => { await this.check(); }, { teamSize: 1, teamConcurrency: 1 });
    this.log.log('SLA breach check scheduled (hourly)');
  }

  async check(): Promise<{ breachedFlags: number; breachedReports: number }> {
    const [flags, reports] = await Promise.all([
      this.db.count(`SELECT count(*) FROM moderation_flags WHERE status IN ('open','reviewing') AND sla_deadline < now()`),
      this.db.count(`SELECT count(*) FROM reports WHERE status IN ('open','reviewing') AND sla_deadline < now()`),
    ]);
    if (flags > 0 || reports > 0) {
      this.log.error(`SLA_BREACH: ${flags} moderation flags and ${reports} reports past their 24h review deadline`);
    }
    return { breachedFlags: flags, breachedReports: reports };
  }
}
