import { Module, Global } from '@nestjs/common';
import { PgBossService } from './pg-boss.service';
import { OutboxWorker } from './outbox.worker';
import { SlaWorker } from './sla.worker';

export const PG_BOSS_SERVICE = 'PG_BOSS_SERVICE';

@Global()
@Module({
  providers: [
    { provide: PG_BOSS_SERVICE, useClass: PgBossService },
    OutboxWorker,
    SlaWorker,
  ],
  exports: [PG_BOSS_SERVICE, OutboxWorker, SlaWorker],
})
export class PgBossModule {}