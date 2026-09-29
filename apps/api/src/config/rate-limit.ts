import type { ThrottlerOptions } from '@nestjs/throttler';

export const rateLimitTtlMs = 60_000;
export const authenticatedAdminRateLimit = 300;
export const loginRateLimit = 8;

export const rateLimitThrottlers = [
  { name: 'default', ttl: rateLimitTtlMs, limit: authenticatedAdminRateLimit },
] satisfies ThrottlerOptions[];

export const loginThrottle = {
  default: { ttl: rateLimitTtlMs, limit: loginRateLimit },
};
