import type { Server } from 'node:http';
import express, { json } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
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

async function startBodyLimitApp() {
  const app = express();
  app.use('/legacy-import/cutover/activate', json({ limit: legacyCutoverActivateBodyLimit }));
  app.post('/legacy-import/cutover/activate', (req, res) => {
    res
      .status(201)
      .json({ count: (req.body as { clientReferenceIds?: string[] }).clientReferenceIds?.length });
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
});
