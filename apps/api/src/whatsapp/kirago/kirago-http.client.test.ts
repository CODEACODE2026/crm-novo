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
        providerMessage: 'forbidden',
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
      message: 'Falha ao comunicar com a Kirago. HTTP 422: {"message":"invalid"}',
      details: {
        method: 'POST',
        path: '/chat/send/text',
        status: 422,
        providerMessage: 'invalid',
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
        providerMessage: 'too many requests',
      },
    } satisfies Partial<KiragoProviderError>);
  });

  it('extracts safe provider diagnostics from an edit HTTP 400 without request secrets', async () => {
    const phone = '5544999988776';
    const body = 'conteudo muito reservado';
    const id = '2f419d6d-d81a-4ed8-9f38-c6ff02d37390';
    const token = 'instance-token-sensitive';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 400,
            message: `invalid Phone ${phone} token=${token}`,
            data: { Details: `cannot edit Body ${body} Id ${id}` },
            Phone: phone,
            Body: body,
            token,
          }),
          { status: 400 },
        ),
      ),
    );
    const client = new KiragoHttpClient(
      new ConfigService({ KIRAGO_BASE_URL: 'https://kirago.example/' }),
    );

    const error = await client
      .request('/chat/send/edit', {
        method: 'POST',
        headers: { token },
        body: { Phone: phone, Id: id, Body: body, mentionAll: false },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'WHATSAPP_PROVIDER_ERROR',
      httpStatus: 400,
      details: {
        method: 'POST',
        path: '/chat/send/edit',
        status: 400,
        providerCode: '400',
        providerMessage: 'invalid Phone [redacted] token=[redacted]',
        providerDetails: 'cannot edit Body [redacted] Id [redacted]',
      },
    } satisfies Partial<KiragoProviderError>);
    const serialized = JSON.stringify(error);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(phone);
    expect(serialized).not.toContain(body);
    expect(serialized).not.toContain(id);
  });

  it('extracts Details from a root-level HTTP 400 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 400, Details: 'message cannot be edited' }), {
          status: 400,
        }),
      ),
    );
    const client = new KiragoHttpClient(
      new ConfigService({ KIRAGO_BASE_URL: 'https://kirago.example/' }),
    );

    await expect(
      client.request('/chat/send/edit', {
        method: 'POST',
        headers: { token: 'instance-token' },
        body: { Phone: '5544999999999', Id: 'provider-id', Body: 'Novo texto' },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      }),
    ).rejects.toMatchObject({
      httpStatus: 400,
      details: {
        method: 'POST',
        path: '/chat/send/edit',
        status: 400,
        providerCode: '400',
        providerDetails: 'message cannot be edited',
      },
    } satisfies Partial<KiragoProviderError>);
  });

  it('extracts message and details from a nested provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 400,
            error: { message: 'edit rejected', details: 'message window expired' },
          }),
          { status: 400 },
        ),
      ),
    );
    const client = new KiragoHttpClient(
      new ConfigService({ KIRAGO_BASE_URL: 'https://kirago.example/' }),
    );

    await expect(
      client.request('/chat/send/edit', {
        method: 'POST',
        headers: { token: 'instance-token' },
        body: { Phone: '5544999999999', Id: 'provider-id', Body: 'Novo texto' },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      }),
    ).rejects.toMatchObject({
      details: {
        method: 'POST',
        path: '/chat/send/edit',
        status: 400,
        providerCode: '400',
        providerMessage: 'edit rejected',
        providerDetails: 'message window expired',
      },
    } satisfies Partial<KiragoProviderError>);
  });

  it('sanitizes and truncates an arbitrary non-JSON provider error without log injection', async () => {
    const phone = '5544999988776';
    const body = 'conteudo muito reservado';
    const id = '2f419d6d-d81a-4ed8-9f38-c6ff02d37390';
    const token = 'instance-token-sensitive';
    const responseText = `invalid\u0000\nPhone ${phone}\tId ${id}\rBody ${body} token=${token} ${'x'.repeat(240)}`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(responseText, { status: 400 })));
    const client = new KiragoHttpClient(
      new ConfigService({ KIRAGO_BASE_URL: 'https://kirago.example/' }),
    );

    const error = (await client
      .request('/chat/send/edit', {
        method: 'POST',
        headers: { token },
        body: { Phone: phone, Id: id, Body: body, mentionAll: false },
        authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
      })
      .catch((caught: unknown) => caught)) as KiragoProviderError;
    const providerMessage = error.details?.providerMessage ?? '';

    expect(providerMessage.length).toBeLessThanOrEqual(160);
    expect(hasControlCharacter(providerMessage)).toBe(false);
    expect(providerMessage).not.toContain(phone);
    expect(providerMessage).not.toContain(id);
    expect(providerMessage).not.toContain(body);
    expect(providerMessage).not.toContain(token);
    expect(providerMessage).toContain('[redacted]');
  });
});

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}
