import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { StreamService } from './stream.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationService } from '../moderation/moderation.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [StreamService, ModerationService],
  exports: [StreamService],
})
export class ChatModule {}
