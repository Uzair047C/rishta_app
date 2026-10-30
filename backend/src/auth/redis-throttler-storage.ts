import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';
import { RedisThrottlerStorage } from '@nestjs-redis/throttler-storage';

/**
 * Factory for Redis throttler storage.
 * Returns a RedisThrottlerStorage instance when REDIS_URL is configured,
 * otherwise returns null to fall back to in-memory storage.
 */
export const redisStorageFactory = async (config: ConfigService) => {
  const redisUrl = config.get<string>('REDIS_URL');
  if (!redisUrl) {
    return null;
  }

  const redis = createClient({ url: redisUrl }) as RedisClientType;

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  try {
    await redis.connect();
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    return null;
  }

  return new RedisThrottlerStorage(redis);
};