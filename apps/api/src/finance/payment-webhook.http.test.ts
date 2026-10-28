import { Controller, Inject, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Prisma } from '@prisma/client';
import { createHmac, createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { json } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceService } from './finance.service';
import { PaymentWebhookController } from './payment-webhook.controller';

const secret = 'payment-webhook-http-test-secret';
const unicodeWhiteSpaceVectors = [
  ['U+0020', '\u0020'],
  ['U+0009', '\u0009'],
  ['U+000A', '\u000a'],
  ['U+000B', '\u000b'],
  ['U+000C', '\u000c'],
  ['U+000D', '\u000d'],
  ['U+0085', '\u0085'],
  ['U+00A0', '\u00a0'],
  ['U+1680', '\u1680'],
  ['U+2000', '\u2000'],
  ['U+2001', '\u2001'],
  ['U+2002', '\u2002'],
  ['U+2003', '\u2003'],
  ['U+2004', '\u2004'],
  ['U+2005', '\u2005'],
  ['U+2006', '\u2006'],
  ['U+2007', '\u2007'],
  ['U+2008', '\u2008'],
  ['U+2009', '\u2009'],
  ['U+200A', '\u200a'],
  ['U+2028', '\u2028'],
  ['U+2029', '\u2029'],
  ['U+202F', '\u202f'],
  ['U+205F', '\u205f'],
  ['U+3000', '\u3000'],
] as const;
const malformedUtf16TransactionIds = [
  ['lone U+D800', '\ud800'],
  ['lone U+DC00', '\udc00'],
  ['lone U+DBFF', '\udbff'],
  ['lone U+DFFF', '\udfff'],
  ['high surrogate followed by ASCII', '\ud800A'],
  ['ASCII followed by low surrogate', 'A\udc00'],
  ['low surrogate before high surrogate', '\udc00\ud800'],
  ['two high surrogates', '\ud800\udbff'],
  ['two low surrogates', '\udc00\udfff'],
  ['high surrogate at the beginning', '\ud800transaction-id'],
  ['low surrogate at the end', 'transaction-id\udc00'],
  ['malformed surrogate between valid characters', 'trans\ud800action-id'],
  ['NBSP combined with malformed surrogate', '\u00a0\ud800transaction-id'],
] as const;

const state = {
  flag: 'true' as string | undefined,
  known: false,
  persistence: 'success' as 'success' | 'failure' | 'conflict',
  evidence: new Set<string>(),
};

const knownIntent = {
  id: '11111111-1111-4111-8111-111111111111',
  receivableId: '22222222-2222-4222-8222-222222222222',
  paymentGroupId: null,
  provider: 'FASTFLOW',
  providerTransactionId: 'known-http',
  externalStatus: 'paid',
  externalDepixId: null,
  blockchainTxId: null,
  status: 'PAID',
  amount: new Prisma.Decimal('30.00'),
  pixCopyPaste: 'known-pix',
  qrCodeData: null,
  expiresAt: null,
  paidAt: new Date('2026-10-27T12:00:00.000Z'),
  lastSyncAt: new Date('2026-10-27T12:00:00.000Z'),
  failureCode: null,
  failureMessage: null,
  createdAt: new Date('2026-10-27T11:00:00.000Z'),
  updatedAt: new Date('2026-10-27T12:00:00.000Z'),
};

const prisma = {
  paymentIntent: {
    findFirst: vi.fn(() => (state.known ? knownIntent : null)),
  },
  paymentWebhookEvent: {
    create: vi.fn(() => {
      throw new Prisma.PrismaClientKnownRequestError('known redelivery', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }),
  },
};

const quarantine = {
  persistAuthenticatedOrphan: vi.fn((input: { rawBody: Buffer }) => {
    if (state.persistence === 'failure') throw new Error('database unavailable');
    if (state.persistence === 'conflict') {
      throw new Prisma.PrismaClientKnownRequestError('identity conflict', {
        code: 'P2010',
        clientVersion: 'test',
        meta: { code: '23505' },
      });
    }
    const digest = createHash('sha256').update(input.rawBody).digest('hex');
    const inserted = !state.evidence.has(digest);
    state.evidence.add(digest);
    return {
      eventId: '33333333-3333-5333-8333-333333333333',
      inserted,
      rawBodyDigest: digest,
    };
  }),
};

const finance = new FinanceService(
  prisma as never,
  {} as never,
  { getWebhookSecret: () => secret } as never,
  {
    get: (key: string) =>
      key === 'PHONE_GLOBAL_BILLING_ORPHAN_WEBHOOK_ENABLED' ? state.flag : undefined,
  } as never,
  undefined,
  undefined,
  undefined,
  quarantine as never,
);

@Controller('payment-webhooks')
class PaymentWebhookHttpController extends PaymentWebhookController {
  constructor(@Inject(FinanceService) service: FinanceService) {
    super(service);
  }
}

@Module({
  controllers: [PaymentWebhookHttpController],
  providers: [{ provide: FinanceService, useValue: finance }],
})
class PaymentWebhookHttpTestModule {}

function signature(body: string) {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(body)).digest('hex')}`;
}

describe('POST /payment-webhooks/:provider HTTP contract', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(PaymentWebhookHttpTestModule, {
      logger: false,
    });
    app.use(
      '/payment-webhooks',
      json({
        limit: '64kb',
        verify: (request, _response, buffer) => {
          (request as typeof request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
        },
      }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    state.flag = 'true';
    state.known = false;
    state.persistence = 'success';
    state.evidence.clear();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  async function post(
    body: string,
    options: { provider?: string; signature?: string | null } = {},
  ) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const signed = options.signature === undefined ? signature(body) : options.signature;
    if (signed !== null) headers['x-webhook-signature'] = signed;
    return fetch(`${baseUrl}/payment-webhooks/${options.provider ?? 'fastflow'}`, {
      method: 'POST',
      headers,
      body,
    });
  }

  it.each([
    [
      'explicit supported event',
      { event: 'transaction.paid', transaction_id: 'explicit', status: 'paid' },
    ],
    ['supported status fallback', { transaction_id: 'fallback', status: 'approved' }],
    ['255-character transaction id', { transaction_id: 'x'.repeat(255), status: 'paid' }],
  ])('returns 201 for valid authenticated orphan: %s', async (_label, payload) => {
    const response = await post(JSON.stringify(payload));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ quarantined: true, processed: false });
    expect(quarantine.persistAuthenticatedOrphan).toHaveBeenCalledOnce();
  });

  it('preserves the explicit unknown transaction-event ignore contract', async () => {
    const response = await post(
      JSON.stringify({ event: 'transaction.future', transaction_id: 'future', status: 'paid' }),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ignored: true,
      reason: 'unsupported_transaction_event',
    });
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it.each(malformedUtf16TransactionIds)(
    'returns 400 before Prisma lookup for malformed UTF-16: %s',
    async (_label, transactionId) => {
      const response = await post(
        JSON.stringify({ transaction_id: transactionId, status: 'paid' }),
      );
      expect(response.status).toBe(400);
      expect(prisma.paymentIntent.findFirst).not.toHaveBeenCalled();
      expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['rocket surrogate pair', '\ud83d\ude80'],
    ['supplementary CJK character', '\ud840\udc00'],
    ['literal replacement character', '\ufffd'],
    ['literal escape text', '\\uD800'],
    ['255 astral codepoints', '\ud83d\ude80'.repeat(255)],
  ])('accepts well-formed or literal transaction identity: %s', async (_label, transactionId) => {
    const response = await post(JSON.stringify({ transaction_id: transactionId, status: 'paid' }));
    expect(response.status).toBe(201);
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledOnce();
    expect(quarantine.persistAuthenticatedOrphan).toHaveBeenCalledOnce();
  });

  it('returns 400 for 256 valid astral codepoints after the Prisma lookup', async () => {
    const response = await post(
      JSON.stringify({ transaction_id: '\ud83d\ude80'.repeat(256), status: 'paid' }),
    );
    expect(response.status).toBe(400);
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledOnce();
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it.each(
    unicodeWhiteSpaceVectors.flatMap(([label, whitespace]) => [
      [`${label} leading`, `${whitespace}transaction-id`],
      [`${label} trailing`, `transaction-id${whitespace}`],
      [`${label} only`, whitespace.repeat(2)],
    ]),
  )(
    'returns 400 without persistence for Unicode White_Space: %s',
    async (_label, transactionId) => {
      const response = await post(
        JSON.stringify({ transaction_id: transactionId, status: 'paid' }),
      );
      expect(response.status).toBe(400);
      expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['NBSP on both edges', '\u00a0transaction-id\u00a0'],
    ['mixed whitespace only', '\u00a0\u2009\u3000'],
    ['ASCII plus NBSP prefix', '\u0020\u00a0transaction-id'],
    ['mixed Unicode suffix', 'transaction-id\u202f\u205f\u3000'],
  ])('returns 400 for combined external whitespace: %s', async (_label, transactionId) => {
    const response = await post(JSON.stringify({ transaction_id: transactionId, status: 'paid' }));
    expect(response.status).toBe(400);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it.each([
    ['eventKey', { event: '\u00a0transaction.paid', transaction_id: 'tx', status: 'paid' }],
    ['externalStatus', { transaction_id: 'tx', status: 'paid\u3000' }],
    ['provider', { transaction_id: 'tx', status: 'paid', payment_provider: '\u1680fastflow' }],
  ])('returns 400 when %s has external Unicode White_Space', async (_label, payload) => {
    const response = await post(JSON.stringify(payload));
    expect(response.status).toBe(400);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it.each([
    ['legitimate NFC Unicode', 'cobrança-東京'],
    ['internal NBSP', 'cobrança\u00a0pix'],
  ])('keeps valid non-edge Unicode accepted: %s', async (_label, transactionId) => {
    const response = await post(JSON.stringify({ transaction_id: transactionId, status: 'paid' }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ quarantined: true, processed: false });
    expect(quarantine.persistAuthenticatedOrphan).toHaveBeenCalledOnce();
  });

  it.each([
    ['future fallback status', { transaction_id: 'future', status: 'provider_future_status' }],
    ['256-character transaction id', { transaction_id: 'x'.repeat(256), status: 'paid' }],
    ['empty transaction id', { transaction_id: '', status: 'paid' }],
    ['transaction id with outer space', { transaction_id: ' tx-space', status: 'paid' }],
    ['transaction id with control', { transaction_id: 'tx\ncontrol', status: 'paid' }],
    ['transaction id outside NFC', { transaction_id: 'cobranc\u0327a', status: 'paid' }],
    [
      'event key above limit',
      { event: `transaction.${'x'.repeat(245)}`, transaction_id: 'tx', status: 'paid' },
    ],
    ['external status above limit', { transaction_id: 'tx', status: 'p'.repeat(256) }],
  ])('returns 400 without persistence for canonical violation: %s', async (_label, payload) => {
    const response = await post(JSON.stringify(payload));
    expect(response.status).toBe(400);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('returns 400 for unexpected route provider and malformed JSON', async () => {
    const provider = await post(JSON.stringify({ transaction_id: 'tx', status: 'paid' }), {
      provider: 'unknown',
    });
    expect(provider.status).toBe(400);
    const malformed = await post('{"transaction_id":');
    expect(malformed.status).toBe(400);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid HMAC even when content is otherwise valid', async () => {
    const response = await post(JSON.stringify({ transaction_id: 'tx', status: 'paid' }), {
      signature: 'sha256=invalid',
    });
    expect(response.status).toBe(401);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('checks the external HMAC before interpreting malformed UTF-16', async () => {
    const response = await post(JSON.stringify({ transaction_id: '\ud800', status: 'paid' }), {
      signature: 'sha256=invalid',
    });
    expect(response.status).toBe(401);
    expect(prisma.paymentIntent.findFirst).not.toHaveBeenCalled();
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('preserves flag false 404 and known webhook legacy 201 with either flag value', async () => {
    state.flag = 'false';
    const orphan = await post(JSON.stringify({ transaction_id: 'orphan', status: 'paid' }));
    expect(orphan.status).toBe(404);

    state.known = true;
    for (const flag of ['false', 'true']) {
      state.flag = flag;
      const known = await post(JSON.stringify({ transaction_id: 'known-http', status: 'paid' }));
      expect(known.status).toBe(201);
      await expect(known.json()).resolves.toMatchObject({ id: knownIntent.id, status: 'PAID' });
    }
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('does not apply quarantine-only canonical rules before a known webhook lookup', async () => {
    state.known = true;
    const response = await post(
      JSON.stringify({ transaction_id: ' known-but-well-formed', status: 'paid' }),
    );
    expect(response.status).toBe(201);
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledOnce();
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });

  it('returns duplicate=true on identical redelivery without a second evidence insert', async () => {
    const body = JSON.stringify({ transaction_id: 'redelivery', status: 'paid' });
    const first = await post(body);
    const second = await post(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    await expect(first.json()).resolves.toMatchObject({ duplicate: false });
    await expect(second.json()).resolves.toMatchObject({ duplicate: true });
    expect(state.evidence).toHaveLength(1);
  });

  it('keeps real persistence failure as 500 and identity conflict as 409', async () => {
    const body = JSON.stringify({ transaction_id: 'failure', status: 'paid' });
    state.persistence = 'failure';
    const failure = await post(body);
    expect(failure.status).toBe(500);

    state.persistence = 'conflict';
    const conflict = await post(body);
    expect(conflict.status).toBe(409);
  });

  it('keeps the existing 64 KiB HTTP body limit', async () => {
    const response = await post(
      JSON.stringify({
        transaction_id: 'too-large',
        status: 'paid',
        padding: 'x'.repeat(70 * 1024),
      }),
    );
    expect(response.status).toBe(413);
    expect(quarantine.persistAuthenticatedOrphan).not.toHaveBeenCalled();
  });
});
