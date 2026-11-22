import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { StreamService } from './stream.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ChatController],
  providers: [StreamService],
  exports: [StreamService],
})
export class ChatModule {}
