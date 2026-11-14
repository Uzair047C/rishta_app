import { Module, Global } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { REDIS_THROTTLER_STORAGE, redisThrottlerStorageProvider } from './redis-throttler-storage';
import { throttlerKeyGenerator } from './throttler-options';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: (redisStorage: any) => ({
        throttlers: [
          { name: 'default', ttl: 60_000, limit: 100 },
        ],
        getTracker: throttlerKeyGenerator,
        ...(redisStorage ? { storage: redisStorage } : {}),
      }),
      inject: [REDIS_THROTTLER_STORAGE],
    }),
  ],
  providers: [
    redisThrottlerStorageProvider,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [REDIS_THROTTLER_STORAGE, ThrottlerModule],
})
export class ThrottlerConfigModule {}