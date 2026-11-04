import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MercadoPagoApiClient } from './mercado-pago-api.client';

const config = {
  get: vi.fn((key: string) => {
    if (key === 'MERCADO_PAGO_API_BASE_URL') return 'https://orders.example.test';
    if (key === 'MERCADO_PAGO_IDENTITY_BASE_URL') return 'https://identity.example.test';
    if (key === 'MERCADO_PAGO_HTTP_TIMEOUT_MS') return '1000';
    return 'test';
  }),
};

describe('MercadoPagoApiClient', () => {
  const client = new MercadoPagoApiClient(config as unknown as ConfigService);

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates an order with backend authorization and idempotency headers', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'ORD-1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.createOrder('test-access-token', 'intent-1', {
        type: 'online',
        total_amount: '50.00',
        external_reference: 'intent-1',
        processing_mode: 'automatic',
        transactions: {
          payments: [
            {
              amount: '50.00',
              payment_method: { id: 'pix', type: 'bank_transfer' },
              expiration_time: 'PT1800S',
            },
          ],
        },
        payer: { email: 'cliente@example.com', first_name: 'APRO' },
      }),
    ).resolves.toEqual({ id: 'ORD-1' });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://orders.example.test/v1/orders');
    expect(request?.method).toBe('POST');
    expect(request?.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      'X-Idempotency-Key': 'intent-1',
    });
    expect(typeof request?.body).toBe('string');
    const requestBody =
      typeof request?.body === 'string' ? (JSON.parse(request.body) as unknown) : null;
    expect(requestBody).toMatchObject({
      payer: { email: 'cliente@example.com', first_name: 'APRO' },
    });
  });

  it('consults orders and validates credentials against the official identity endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'ORD-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 123, nickname: 'TEST' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client.getOrder('token', 'ORD/1');
    await client.getCurrentUser('token');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://orders.example.test/v1/orders/ORD%2F1');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://identity.example.test/users/me');
  });

  it('returns a sanitized timeout error without exposing credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(Object.assign(new Error('aborted test-access-token'), { name: 'AbortError' }));
            });
          }),
      ),
    );

    await expect(client.getOrder('test-access-token', 'ORD-1')).rejects.toEqual(
      new ServiceUnavailableException('Tempo limite da API Mercado Pago excedido.'),
    );
  });
});
