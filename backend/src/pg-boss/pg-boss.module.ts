import { Module, Global } from '@nestjs/common';
import { PgBossService } from './pg-boss.service';
import { OutboxWorker } from './outbox.worker';
import { SlaWorker } from './sla.worker';
import { NotificationsModule } from '../notifications/notifications.module';

export const PG_BOSS_SERVICE = 'PG_BOSS_SERVICE';

@Global()
@Module({
  imports: [NotificationsModule], // OutboxWorker needs PushService
  providers: [
    PgBossService, // class token — workers inject PgBossService directly
    { provide: PG_BOSS_SERVICE, useClass: PgBossService }, // legacy string token
    OutboxWorker,
    SlaWorker,
  ],
  exports: [PG_BOSS_SERVICE, PgBossService, OutboxWorker, SlaWorker],
})
export class PgBossModule {}