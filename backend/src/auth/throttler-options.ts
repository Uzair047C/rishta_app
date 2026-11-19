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
 * IP resolution respects TRUST_PROXY setting:
 * - If TRUST_PROXY=true (behind LB): uses req.ip (trusts X-Forwarded-For from trusted proxy)
 * - If TRUST_PROXY=false (no LB): uses req.socket.remoteAddress (ignores X-Forwarded-For)
 */
export const throttlerKeyGenerator: ThrottlerGetTrackerFunction = (req: any): string => {
  const user = req.user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  // Get IP - Express req.ip automatically respects trust proxy setting
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
};