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

  it('uses DELETE /transactions/:id to cancel a provider transaction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: 75148, status: 'cancelled' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(client.cancelTransaction('secret-token', '75148')).resolves.toMatchObject({
      id: 75148,
      status: 'cancelled',
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://fastdepix.space/api/v1/transactions/75148');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer secret-token');
    expect(url).not.toContain('secret-token');
    expect(String(init.body)).not.toContain('secret-token');
  });

  it.each([
    [400, 400, 'Transação já expirada.'],
    [401, 502, 'Credencial do provider invalida ou nao autorizada.'],
    [403, 502, 'Credencial do provider invalida ou nao autorizada.'],
    [404, 404, 'Transacao de pagamento nao encontrada no provider.'],
    [409, 409, 'Provider de pagamentos recusou a operacao no status atual.'],
    [429, 429, 'Limite da API de pagamentos atingido. Tente novamente em instantes.'],
    [500, 502, 'Provider de pagamentos retornou erro temporario.'],
  ])(
    'translates provider HTTP %s to CRM HTTP %s without exposing provider auth as CRM auth',
    async (providerStatus, expectedStatus, expectedMessage) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: providerStatus,
          json: () => Promise.resolve({ message: 'Transação já expirada.' }),
        }),
      );
      const client = new FastDepixApiClient({
        get: (key: string) =>
          key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
      } as never);

      await expect(client.cancelTransaction('secret-token', '75148')).rejects.toMatchObject({
        message: expectedMessage,
        status: expectedStatus,
      });
    },
  );

  it('translates provider timeout to service unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        return Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }),
    );
    const client = new FastDepixApiClient({
      get: (key: string) => {
        if (key === 'FASTDEPIX_BASE_URL') return 'https://fastdepix.space/api/v1/';
        if (key === 'PAYMENT_PROVIDER_HTTP_TIMEOUT_MS') return '10';
        return undefined;
      },
    } as never);

    await expect(client.cancelTransaction('secret-token', '75148')).rejects.toMatchObject({
      message: 'Tempo limite da API de pagamentos excedido.',
      status: 503,
    });
  });

  it('classifies a confirmed creation only when a remote transaction id exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { id: 75148, status: 'pending' } }),
      }),
    );
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind: 'CONFIRMED',
      requestDispatched: true,
      remoteEffect: 'CONFIRMED',
      automaticRetryEligible: false,
      providerTransactionId: '75148',
    });
  });

  it('keeps a successful response without transaction id ambiguous and non-retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: {} }) }),
    );
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind: 'REMOTE_RESULT_UNCERTAIN',
      requestDispatched: true,
      remoteEffect: 'UNKNOWN',
      automaticRetryEligible: false,
      providerTransactionId: null,
      code: 'FASTDEPIX_SUCCESS_WITHOUT_TRANSACTION_ID',
    });
  });

  it.each([
    [400, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_400'],
    [401, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_401'],
    [403, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_403'],
    [404, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_404'],
    [405, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_405'],
    [415, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_415'],
    [422, 'HTTP_REJECTION_OBSERVED', 'FASTDEPIX_REJECTED_422'],
    [409, 'REMOTE_RESULT_UNCERTAIN', 'FASTDEPIX_HTTP_409_UNCERTAIN'],
    [429, 'REMOTE_RESULT_UNCERTAIN', 'FASTDEPIX_HTTP_429_UNCERTAIN'],
    [500, 'REMOTE_RESULT_UNCERTAIN', 'FASTDEPIX_HTTP_500_UNCERTAIN'],
    [502, 'REMOTE_RESULT_UNCERTAIN', 'FASTDEPIX_HTTP_502_UNCERTAIN'],
    [503, 'REMOTE_RESULT_UNCERTAIN', 'FASTDEPIX_HTTP_503_UNCERTAIN'],
  ])('classifies provider HTTP %s conservatively', async (status, kind, code) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({ message: 'provider response' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind,
      code,
      requestDispatched: true,
      remoteEffect: 'UNKNOWN',
      automaticRetryEligible: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('marks local validation failure as proven pre-call and does not invoke fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({ get: () => 'not-a-url' } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind: 'PRE_CALL_FAILURE',
      requestDispatched: false,
      remoteEffect: 'ABSENT_PROVEN',
      automaticRetryEligible: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats transport timeout after dispatch as ambiguous', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    );
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind: 'REMOTE_RESULT_UNCERTAIN',
      requestDispatched: true,
      remoteEffect: 'UNKNOWN',
      automaticRetryEligible: false,
      code: 'FASTDEPIX_TRANSPORT_UNCERTAIN',
    });
  });

  it('treats a generic transport failure after dispatch as ambiguous and non-retryable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network reset'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new FastDepixApiClient({
      get: (key: string) =>
        key === 'FASTDEPIX_BASE_URL' ? 'https://fastdepix.space/api/v1/' : undefined,
    } as never);

    await expect(
      client.createTransactionClassified('secret-token', {
        amount: 30,
        user: { name: 'Luiz' },
        payer_phone: '971529846014',
      }),
    ).resolves.toMatchObject({
      kind: 'REMOTE_RESULT_UNCERTAIN',
      requestDispatched: true,
      remoteEffect: 'UNKNOWN',
      automaticRetryEligible: false,
      code: 'FASTDEPIX_TRANSPORT_UNCERTAIN',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
