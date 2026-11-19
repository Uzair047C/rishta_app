import { Module, Global } from '@nestjs/common';
import { PgBossService } from './pg-boss.service';
import { OutboxWorker } from './outbox.worker';
import { NotificationsModule } from '../notifications/notifications.module';
import { DbModule } from '../db/db.module';

export const PG_BOSS_SERVICE = 'PG_BOSS_SERVICE';

@Global()
@Module({
  imports: [NotificationsModule, DbModule],
  providers: [
    PgBossService,
    { provide: PG_BOSS_SERVICE, useExisting: PgBossService },
    OutboxWorker,
  ],
  exports: [PgBossService, PG_BOSS_SERVICE, OutboxWorker],
})
export class PgBossModule {}