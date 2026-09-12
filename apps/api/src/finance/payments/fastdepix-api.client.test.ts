import { describe, expect, it, vi } from 'vitest';
import { FastDepixApiClient } from './fastdepix-api.client';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

describe('FastDepixApiClient', () => {
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
    vi.unstubAllGlobals();
  });
});
