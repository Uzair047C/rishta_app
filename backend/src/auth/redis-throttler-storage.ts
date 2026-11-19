import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { RedisThrottlerStorage } from '@nestjs-redis/throttler-storage';

/**
 * Provider token for Redis throttler storage.
 * Use with ThrottlerModule.forRootAsync inject: [REDIS_THROTTLER_STORAGE]
 */
export const REDIS_THROTTLER_STORAGE = 'REDIS_THROTTLER_STORAGE';

/**
 * Factory for Redis throttler storage provider.
 * Returns a RedisThrottlerStorage instance when REDIS_URL is configured.
 * In production, REDIS_URL is required (fail closed).
 */
export const redisStorageFactory = async (config: ConfigService) => {
  const redisUrl = config.get<string>('REDIS_URL');
  const isProduction = process.env.NODE_ENV === 'production';

  if (!redisUrl) {
    if (isProduction) {
      throw new Error('REDIS_URL is required in production for distributed rate limiting');
    }
    console.warn('REDIS_URL not set, falling back to in-memory rate limiting (not suitable for multi-instance)');
    return null;
  }

  const redis = createClient({ url: redisUrl }) as RedisClientType;

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  try {
    await redis.connect();
  } catch (err) {
    if (isProduction) {
      throw new Error(`Failed to connect to Redis in production: ${err}`);
    }
    console.error('Failed to connect to Redis, falling back to in-memory:', err);
    return null;
  }

  return new RedisThrottlerStorage(redis);
};

/**
 * Provider for Redis throttler storage.
 * Use in modules' providers array to make REDIS_THROTTLER_STORAGE available.
 */
export const redisThrottlerStorageProvider = {
  provide: REDIS_THROTTLER_STORAGE,
  useFactory: redisStorageFactory,
  inject: [ConfigService],
};