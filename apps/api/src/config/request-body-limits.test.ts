import type { Server } from 'node:http';
import express, { json } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  kiragoWebhookBodyLimit,
  kiragoWebhookBodyLimitBytes,
  legacyCutoverActivateBodyLimit,
  legacyCutoverActivateBodyLimitBytes,
} from './request-body-limits';

const uuidPayload = (count: number) =>
  JSON.stringify({
    clientReferenceIds: Array.from(
      { length: count },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    ),
  });

const kiragoPayload = (
  targetBytes: number,
  message: Record<string, unknown> = { imageMessage: { mimetype: 'image/jpeg' } },
) => {
  const payload = {
    type: 'Message',
    instanceName: 'CRM Principal',
    event: {
      Info: { ID: 'provider-message-id', IsFromMe: false },
      Message: message,
    },
  };
  const media = (payload.event.Message.imageMessage ??
    payload.event.Message.documentMessage ??
    payload.event.Message) as Record<string, unknown>;
  const currentBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  media.safePadding = 'x'.repeat(Math.max(0, targetBytes - currentBytes));

  return JSON.stringify(payload);
};

async function startBodyLimitApp() {
  const app = express();
  let mediaDebugReached = false;

  app.use('/whatsapp/webhook/kirago', json({ limit: kiragoWebhookBodyLimit }));
  app.use('/whatsapp/webhook/kirago', (req, _res, next) => {
    const body = req.body as
      | {
          event?: { Message?: { imageMessage?: unknown; documentMessage?: unknown } };
        }
      | undefined;

    mediaDebugReached =
      process.env.WHATSAPP_MEDIA_DEBUG === 'true' &&
      Boolean(body?.event?.Message?.imageMessage ?? body?.event?.Message?.documentMessage);
    next();
  });
  app.post('/whatsapp/webhook/kirago', (req, res) => {
    const body = req.body as { event?: { Message?: unknown } };

    res.status(201).json({
      received: true,
      mediaDebugReached,
      hasMessage: Boolean(body.event?.Message),
    });
  });
  app.use('/payment-webhooks', json({ limit: '64kb' }));
  app.post('/payment-webhooks/fastdepix', (_req, res) => {
    res.status(201).json({ ok: true });
  });
  app.use('/legacy-import/cutover/activate', json({ limit: legacyCutoverActivateBodyLimit }));
  app.post('/legacy-import/cutover/activate', (req, res) => {
    res
      .status(201)
      .json({ count: (req.body as { clientReferenceIds?: string[] }).clientReferenceIds?.length });
  });
  app.use(json({ limit: '1mb' }));
  app.post('/clients', (_req, res) => {
    res.status(201).json({ ok: true });
  });

  const server = app.listen(0, '127.0.0.1');

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const address = server.address() as Exclude<ReturnType<Server['address']>, string | null>;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function postJson(baseUrl: string, path: string, body: string) {
  return fetch(`${baseUrl}${path}`, {
    body,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

describe('request body limits', () => {
  let server: Server | null = null;

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve();
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    server = null;
  });

  it('keeps cutover activation body limit scoped and large enough for 500 UUIDs', async () => {
    expect(legacyCutoverActivateBodyLimit).toBe('64kb');

    const payload = uuidPayload(500);
    const payloadBytes = Buffer.byteLength(payload, 'utf8');

    expect(payloadBytes).toBe(19_524);
    expect(payloadBytes).toBeLessThan(legacyCutoverActivateBodyLimitBytes / 3);

    const started = await startBodyLimitApp();
    server = started.server;

    const response = await fetch(`${started.baseUrl}/legacy-import/cutover/activate`, {
      body: payload,
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ count: 500 });
  });

  it('keeps the Kirago webhook JSON parser scoped and large enough for observed media payloads', async () => {
    expect(kiragoWebhookBodyLimit).toBe('8mb');
    expect(kiragoWebhookBodyLimitBytes).toBe(8 * 1024 * 1024);

    const started = await startBodyLimitApp();
    server = started.server;

    for (const targetBytes of [250 * 1024, 4_600_000, 6 * 1024 * 1024]) {
      const response = await postJson(
        started.baseUrl,
        '/whatsapp/webhook/kirago',
        kiragoPayload(targetBytes),
      );

      expect(response.status, `${targetBytes} bytes`).toBe(201);
      expect(await response.json()).toMatchObject({
        received: true,
        hasMessage: true,
      });
    }
  });

  it('rejects Kirago webhook JSON payloads above the dedicated limit with 413', async () => {
    const started = await startBodyLimitApp();
    server = started.server;

    const response = await postJson(
      started.baseUrl,
      '/whatsapp/webhook/kirago',
      kiragoPayload(kiragoWebhookBodyLimitBytes + 1024),
    );

    expect(response.status).toBe(413);
  });

  it('keeps normal Kirago text webhook payloads working', async () => {
    const started = await startBodyLimitApp();
    server = started.server;

    const response = await postJson(
      started.baseUrl,
      '/whatsapp/webhook/kirago',
      kiragoPayload(4 * 1024, { conversation: 'Texto normal' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      received: true,
      mediaDebugReached: false,
    });
  });

  it('keeps unrelated JSON endpoints on the existing global 1mb limit', async () => {
    const started = await startBodyLimitApp();
    server = started.server;

    const response = await postJson(
      started.baseUrl,
      '/clients',
      JSON.stringify({ safePadding: 'x'.repeat(1024 * 1024 + 1024) }),
    );

    expect(response.status).toBe(413);
  });

  it('keeps payment webhooks on their existing 64kb limit', async () => {
    const started = await startBodyLimitApp();
    server = started.server;

    const accepted = await postJson(
      started.baseUrl,
      '/payment-webhooks/fastdepix',
      JSON.stringify({ safePadding: 'x'.repeat(32 * 1024) }),
    );
    const rejected = await postJson(
      started.baseUrl,
      '/payment-webhooks/fastdepix',
      JSON.stringify({ safePadding: 'x'.repeat(70 * 1024) }),
    );

    expect(accepted.status).toBe(201);
    expect(rejected.status).toBe(413);
  });

  it('allows WHATSAPP_MEDIA_DEBUG media instrumentation to be reached after parsing', async () => {
    const previousFlag = process.env.WHATSAPP_MEDIA_DEBUG;
    process.env.WHATSAPP_MEDIA_DEBUG = 'true';

    try {
      const started = await startBodyLimitApp();
      server = started.server;

      const response = await postJson(
        started.baseUrl,
        '/whatsapp/webhook/kirago',
        kiragoPayload(100 * 1024),
      );

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        mediaDebugReached: true,
      });
    } finally {
      if (previousFlag === undefined) {
        delete process.env.WHATSAPP_MEDIA_DEBUG;
      } else {
        process.env.WHATSAPP_MEDIA_DEBUG = previousFlag;
      }
    }
  });
});
