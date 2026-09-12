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
    } satisfies Partial<KiragoProviderError>);
  });
});
