import 'reflect-metadata';
import type { Server } from 'node:http';
import { Controller, Get, Module, Post, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authenticatedAdminRateLimit,
  loginRateLimit,
  loginThrottle,
  rateLimitThrottlers,
  rateLimitTtlMs,
} from './rate-limit';

@Controller()
class RateLimitTestController {
  @Post('auth/login')
  @Throttle(loginThrottle)
  login() {
    return { ok: true };
  }

  @Get('auth/me')
  me() {
    return { user: { role: 'ADMIN' } };
  }

  @Get('plans')
  plans() {
    return [];
  }

  @Get('clients')
  clients() {
    return { items: [], pagination: { page: 1, total: 0 } };
  }

  @Get('dashboard/summary')
  dashboardSummary(@Req() request: Request) {
    return { ok: true, ip: request.ip };
  }

  @Post('payment-webhooks/fastdepix')
  paymentWebhook() {
    return { ok: true };
  }

  @Post('whatsapp/webhook/kirago')
  kiragoWebhook() {
    return { ok: true };
  }

  @Post('legacy-import/clients/preview')
  legacyImportPreview() {
    return { ok: true };
  }
}

async function createRateLimitApp(options: { defaultLimit?: number } = {}) {
  const defaultLimit = options.defaultLimit ?? authenticatedAdminRateLimit;
  const defaultThrottler = rateLimitThrottlers[0];

  if (!defaultThrottler) {
    throw new Error('Default throttler is not configured.');
  }

  @Module({
    imports: [
      ThrottlerModule.forRoot([
        {
          name: defaultThrottler.name,
          ttl: defaultThrottler.ttl,
          limit: defaultLimit,
        },
      ]),
    ],
    controllers: [RateLimitTestController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class RateLimitTestModule {}

  const app = await NestFactory.create(RateLimitTestModule, { logger: false });
  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: string) => void;
  };
  expressApp.set('trust proxy', 'loopback');

  await app.listen(0, '127.0.0.1');
  const address = (app.getHttpServer() as Server).address();

  if (!address || typeof address === 'string') {
    throw new Error('Rate limit test server did not expose a TCP port.');
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function request(baseUrl: string, path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

describe('rate limit policy', () => {
  let app: INestApplication | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  it('uses one global authenticated API limiter and keeps login as a strict route override', () => {
    expect(rateLimitThrottlers).toEqual([{ name: 'default', ttl: rateLimitTtlMs, limit: 300 }]);
    expect(loginThrottle).toEqual({ default: { ttl: rateLimitTtlMs, limit: 8 } });
  });

  it('keeps login on a strict 8/minute-equivalent policy', async () => {
    const started = await createRateLimitApp({ defaultLimit: 20 });
    app = started.app;

    for (let index = 0; index < loginRateLimit; index += 1) {
      const response = await request(started.baseUrl, '/auth/login', { method: 'POST' });
      expect(response.status).toBe(201);
      expect(response.headers.get('x-ratelimit-limit')).toBe(String(loginRateLimit));
    }

    const blocked = await request(started.baseUrl, '/auth/login', { method: 'POST' });
    expect(blocked.status).toBe(429);
  });

  it('allows normal authenticated Dashboard load and repeated human filter changes', async () => {
    const started = await createRateLimitApp({ defaultLimit: 20 });
    app = started.app;

    const initialDashboardLoad = ['/auth/me', '/plans', '/clients', '/dashboard/summary'];

    for (const path of initialDashboardLoad) {
      expect((await request(started.baseUrl, path)).status, path).toBe(200);
    }

    for (let index = 0; index < 12; index += 1) {
      const response = await request(started.baseUrl, `/dashboard/summary?filter=${index}`);
      expect(response.status, `filter change ${index}`).toBe(200);
    }
  });

  it('still returns 429 with rate-limit headers for abusive authenticated API bursts', async () => {
    const started = await createRateLimitApp({ defaultLimit: 3 });
    app = started.app;

    for (let index = 0; index < 3; index += 1) {
      const response = await request(started.baseUrl, `/dashboard/summary?burst=${index}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('x-ratelimit-limit')).toBe('3');
    }

    const blocked = await request(started.baseUrl, '/dashboard/summary?burst=blocked');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
  });

  it('tracks clients by the trusted X-Forwarded-For IP behind the loopback proxy', async () => {
    const started = await createRateLimitApp({ defaultLimit: 2 });
    app = started.app;

    const firstIpHeaders = { 'x-forwarded-for': '203.0.113.10' };
    const secondIpHeaders = { 'x-forwarded-for': '203.0.113.11' };

    expect(
      (await request(started.baseUrl, '/dashboard/summary', { headers: firstIpHeaders })).status,
    ).toBe(200);
    expect(
      (await request(started.baseUrl, '/dashboard/summary?again=1', { headers: firstIpHeaders }))
        .status,
    ).toBe(200);
    expect(
      (await request(started.baseUrl, '/dashboard/summary?blocked=1', { headers: firstIpHeaders }))
        .status,
    ).toBe(429);

    const secondIpResponse = await request(started.baseUrl, '/dashboard/summary', {
      headers: secondIpHeaders,
    });
    expect(secondIpResponse.status).toBe(200);
    expect(await secondIpResponse.json()).toMatchObject({ ip: '203.0.113.11' });
  });

  it('keeps webhook and legacy import routes under the authenticated API limiter without special breakage', async () => {
    const started = await createRateLimitApp({ defaultLimit: 6 });
    app = started.app;

    for (const path of [
      '/payment-webhooks/fastdepix',
      '/whatsapp/webhook/kirago',
      '/legacy-import/clients/preview',
    ]) {
      const response = await request(started.baseUrl, path, {
        body: JSON.stringify({ ok: true }),
        method: 'POST',
      });

      expect(response.status, path).toBe(201);
      expect(response.headers.get('x-ratelimit-limit')).toBe('6');
    }
  });
});
