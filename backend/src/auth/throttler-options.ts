import { ThrottlerModuleOptions, ThrottlerGetTrackerFunction } from '@nestjs/throttler';

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'default',
      ttl: 60_000,
      limit: 100,
    },
  ],
};

/**
 * Custom key generator for throttling.
 * - If authenticated, key by user ID
 * - Otherwise, key by IP address
 */
export const throttlerKeyGenerator: ThrottlerGetTrackerFunction = (req: any): string => {
  const user = req.user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  // Get IP, respecting trust proxy
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
};