import { Module, Global } from '@nestjs/common';
import { PgBossService } from './pg-boss.service';
import { OutboxWorker } from './outbox.worker';

@Global()
@Module({
  providers: [PgBossService, OutboxWorker],
  exports: [PgBossService],
})
export class PgBossModule {}