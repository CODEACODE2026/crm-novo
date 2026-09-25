import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KiragoProviderError } from './kirago-provider.error';
import { KiragoHttpClient } from './kirago-http.client';

describe('KiragoHttpClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps 403 responses to the selected instance auth failure code', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 })),
    );
    const config = new ConfigService({
      KIRAGO_BASE_URL: 'https://kirago.example/',
    });
    const client = new KiragoHttpClient(config);

    await expect(
      client.request('/session/connect', {
        method: 'POST',
        headers: { token: 'instance-token' },
        body: { Subscribe: ['Message'], Immediate: true },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      }),
    ).rejects.toMatchObject({
      code: 'KIRAGO_INSTANCE_AUTH_FAILED',
      httpStatus: 403,
      message: 'Falha de autenticacao da instancia Kirago. HTTP 403: {"message":"forbidden"}',
      details: {
        method: 'POST',
        path: '/session/connect',
        status: 403,
        responseBody: '{"message":"forbidden"}',
      },
    } satisfies Partial<KiragoProviderError>);
  });

  it('keeps sanitized provider response details on non-auth errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'invalid', token: 'secret-value' }), {
          status: 422,
        }),
      ),
    );
    const config = new ConfigService({
      KIRAGO_BASE_URL: 'https://kirago.example/',
    });
    const client = new KiragoHttpClient(config);

    await expect(
      client.request('/chat/send/text', {
        method: 'POST',
        headers: { token: 'instance-token' },
        body: { Phone: '5544999999999', Body: 'Oi', Id: 'request-id' },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      }),
    ).rejects.toMatchObject({
      code: 'WHATSAPP_PROVIDER_ERROR',
      httpStatus: 422,
      message:
        'Falha ao comunicar com a Kirago. HTTP 422: {"message":"invalid","token":"[redacted]"}',
      details: {
        method: 'POST',
        path: '/chat/send/text',
        status: 422,
        responseBody: '{"message":"invalid","token":"[redacted]"}',
      },
    } satisfies Partial<KiragoProviderError>);
  });

  it('maps 429 responses to a Kirago rate-limit error instead of auth failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'too many requests' }), { status: 429 }),
        ),
    );
    const config = new ConfigService({
      KIRAGO_BASE_URL: 'https://kirago.example/',
    });
    const client = new KiragoHttpClient(config);

    await expect(
      client.request('/chat/send/buttons', {
        method: 'POST',
        headers: { Authorization: 'Bearer instance-token' },
        body: { phone: '5544999999999' },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      }),
    ).rejects.toMatchObject({
      code: 'KIRAGO_RATE_LIMITED',
      httpStatus: 429,
      message: 'Falha ao comunicar com a Kirago. HTTP 429: {"message":"too many requests"}',
      details: {
        method: 'POST',
        path: '/chat/send/buttons',
        status: 429,
        responseBody: '{"message":"too many requests"}',
      },
    } satisfies Partial<KiragoProviderError>);
  });
});
