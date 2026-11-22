import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { StreamService } from './stream.service';

@Module({
  controllers: [ChatController],
  providers: [StreamService],
  exports: [StreamService],
})
export class ChatModule {}
