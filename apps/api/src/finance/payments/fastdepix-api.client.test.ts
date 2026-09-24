import { Module } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FastDepixApiClient } from './fastdepix-api.client';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  providers: [FastDepixApiClient],
})
class FastDepixApiClientTestModule {}

describe('FastDepixApiClient', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('declares ConfigService injection explicitly for runtime DI', () => {
    const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, FastDepixApiClient) as
      Array<{ index: number; param: unknown }> | undefined;

    expect(deps).toContainEqual({ index: 0, param: ConfigService });
  });

  it('resolves authMe through the Nest container with mocked HTTP and configured timeout', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            api_provider: 'fastflow',
            provider_label: 'FastFlow',
            parceiro: { id: 'partner-id' },
          },
        }),
    });
    vi.stubEnv('FASTDEPIX_BASE_URL', 'https://fastdepix.space/api/v1/');
    vi.stubEnv('PAYMENT_PROVIDER_HTTP_TIMEOUT_MS', '1500');
    vi.stubGlobal('fetch', fetchMock);
    app = await NestFactory.createApplicationContext(FastDepixApiClientTestModule, {
      logger: false,
    });
    const client = app.get(FastDepixApiClient);

    await expect(client.authMe('secret-token')).resolves.toMatchObject({
      api_provider: 'fastflow',
      parceiro: { id: 'partner-id' },
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://fastdepix.space/api/v1/auth/me');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(String(init.body)).not.toContain('secret-token');
  });

  it('uses bearer auth and keeps the token out of URL/body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ api_provider: 'fastflow' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await client.createTransaction('secret-token', {
      amount: 50,
      user: { name: 'Cliente' },
      payer_phone: '5544999999999',
      notification_url: 'https://crm.example.com/payment-webhooks/fastdepix',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://fastdepix.space/api/v1/transactions');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(url).not.toContain('secret-token');
    expect(String(init.body)).not.toContain('secret-token');
  });

  it('registers payment webhooks with the documented transaction events', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            id: 12,
            url: 'https://crm.example.test/payment-webhooks/fastflow',
            events: ['transaction.paid'],
            secret_key: 'fake_webhook_secret_123',
            is_active: true,
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await client.registerWebhook('mock-token', {
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: [
        'transaction.created',
        'transaction.approved',
        'transaction.paid',
        'transaction.expired',
        'transaction.refunded',
      ],
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://fastdepix.space/api/v1/webhooks/register');
    expect(init.headers.Authorization).toBe('Bearer mock-token');
    expect(JSON.parse(String(init.body))).toEqual({
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: [
        'transaction.created',
        'transaction.approved',
        'transaction.paid',
        'transaction.expired',
        'transaction.refunded',
      ],
    });
    expect(String(init.body)).not.toContain('Bearer');
  });
});
