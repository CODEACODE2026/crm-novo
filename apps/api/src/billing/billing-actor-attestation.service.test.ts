import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingActorAttestationService,
  billingActorAttestationPayload,
  billingActorOperations,
  billingExecutionTransitionAttestationContext,
  billingPixAnalyzeOrphanWebhookAttestationContext,
  billingPixCorrelateOrphanWebhookAttestationContext,
  billingPixPrepareCreateAttestationContext,
  billingPixOrphanWebhookEventId,
  billingPixQuarantineOrphanWebhookAttestationContext,
  billingPixReconcileCreateResultAttestationContext,
  billingPixRecordCreateResultAttestationContext,
  billingPixReserveAttestationContext,
  billingReceivableAmendAttestationContext,
  canonicalBillingActorValue,
  validateBillingPixOrphanWebhookMetadata,
  validateBillingPixOrphanWebhookMetadataText,
  validateWellFormedUtf16Text,
} from './billing-actor-attestation.service';
import { BillingPixWebhookQuarantineService } from './billing-pix-webhook-quarantine.service';

const secrets = {
  BILLING_ACTOR_USER_KEY_ID: 'user-v1',
  BILLING_ACTOR_USER_SIGNING_SECRET: 'u'.repeat(32),
  BILLING_ACTOR_SYSTEM_KEY_ID: 'system-v1',
  BILLING_ACTOR_SYSTEM_SIGNING_SECRET: 's'.repeat(32),
  BILLING_ACTOR_WEBHOOK_KEY_ID: 'webhook-v1',
  BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: 'w'.repeat(32),
};

const ids = {
  user: '11111111-1111-4111-8111-111111111111',
  execution: '22222222-2222-4222-8222-222222222222',
  dispatch: '33333333-3333-4333-8333-333333333333',
  receivable: '44444444-4444-4444-8444-444444444444',
  paymentIntent: '55555555-5555-4555-8555-555555555555',
  attempt: '77777777-7777-4777-8777-777777777777',
};
const financialSetDigest = 'a'.repeat(64);
const unicodeWhiteSpaceVectors = [
  ['U+0020 SPACE', '\u0020'],
  ['U+0009 TAB', '\u0009'],
  ['U+000A LINE FEED', '\u000a'],
  ['U+000B VERTICAL TAB', '\u000b'],
  ['U+000C FORM FEED', '\u000c'],
  ['U+000D CARRIAGE RETURN', '\u000d'],
  ['U+0085 NEXT LINE', '\u0085'],
  ['U+00A0 NO-BREAK SPACE', '\u00a0'],
  ['U+1680 OGHAM SPACE MARK', '\u1680'],
  ['U+2000 EN QUAD', '\u2000'],
  ['U+2001 EM QUAD', '\u2001'],
  ['U+2002 EN SPACE', '\u2002'],
  ['U+2003 EM SPACE', '\u2003'],
  ['U+2004 THREE-PER-EM SPACE', '\u2004'],
  ['U+2005 FOUR-PER-EM SPACE', '\u2005'],
  ['U+2006 SIX-PER-EM SPACE', '\u2006'],
  ['U+2007 FIGURE SPACE', '\u2007'],
  ['U+2008 PUNCTUATION SPACE', '\u2008'],
  ['U+2009 THIN SPACE', '\u2009'],
  ['U+200A HAIR SPACE', '\u200a'],
  ['U+2028 LINE SEPARATOR', '\u2028'],
  ['U+2029 PARAGRAPH SEPARATOR', '\u2029'],
  ['U+202F NARROW NO-BREAK SPACE', '\u202f'],
  ['U+205F MEDIUM MATHEMATICAL SPACE', '\u205f'],
  ['U+3000 IDEOGRAPHIC SPACE', '\u3000'],
] as const;
const malformedUtf16Vectors = [
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
  ['high surrogate between valid characters', 'trans\ud800action-id'],
  ['NBSP followed by a lone high surrogate', '\u00a0\ud800transaction-id'],
] as const;

describe('BillingActorAttestationService', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(1_798_761_600_000));

  it('builds deterministic orphan webhook identities and operation-bound attestations', () => {
    const input = {
      provider: 'DEPIX',
      providerTransactionId: 'tx-30',
      eventKey: 'event-30',
      rawBodyDigest: 'b'.repeat(64),
    };
    const eventId = billingPixOrphanWebhookEventId(input);
    expect(eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(billingPixOrphanWebhookEventId(input)).toBe(eventId);
    expect(billingPixOrphanWebhookEventId({ ...input, providerTransactionId: 'tx-31' })).not.toBe(
      eventId,
    );

    const context = billingPixQuarantineOrphanWebhookAttestationContext({
      ...input,
      eventId,
      externalStatus: 'WAITING_PAYMENT',
      rawBodyBytes: 30,
      receivedAt: '2026-10-27T14:10:00.123Z',
    });
    expect(context).toMatchObject({
      operation: billingActorOperations.pixQuarantineOrphanWebhook,
      billingExecutionId: eventId,
      messageDispatchId: eventId,
      receivableId: null,
      financialSetDigest: input.rawBodyDigest,
      expectedVersion: 0,
    });
    expect(service().forWebhook('DEPIX', input.eventKey, context)).toMatchObject({
      actorType: 'WEBHOOK',
      actorPrincipal: 'DEPIX:event-30',
    });
  });

  it('binds 7C analysis and correlation to distinct operation targets', () => {
    const eventId = '88888888-8888-4888-8888-888888888888';
    const analysis = billingPixAnalyzeOrphanWebhookAttestationContext({
      eventId,
      rawBodyDigest: 'b'.repeat(64),
      reasonCode: 'NO_DURABLE_ATTEMPT',
    });
    expect(analysis).toMatchObject({
      operation: billingActorOperations.pixAnalyzeOrphanWebhook,
      billingExecutionId: eventId,
      messageDispatchId: eventId,
      financialSetDigest: 'b'.repeat(64),
      expectedVersion: 0,
    });

    const correlation = billingPixCorrelateOrphanWebhookAttestationContext({
      billingExecutionId: ids.execution,
      messageDispatchId: ids.dispatch,
      financialSetDigest,
      expectedVersion: 8,
      owner: 'correlation-worker',
      token: 'lease-token',
      eventId,
      attemptId: ids.attempt,
      creationKey: 'bpx1:creation-key',
      provider: 'DEPIX',
      providerTransactionId: 'tx-7c',
      paymentIntentId: ids.paymentIntent,
    });
    expect(correlation).toMatchObject({
      operation: billingActorOperations.pixCorrelateOrphanWebhook,
      billingExecutionId: ids.execution,
      messageDispatchId: ids.dispatch,
      financialSetDigest,
      expectedVersion: 8,
    });
    expect(correlation.argumentsDigest).not.toBe(analysis.argumentsDigest);
  });

  it('rejects non-canonical orphan webhook evidence before signing', () => {
    const valid = {
      provider: 'DEPIX',
      providerTransactionId: 'tx-30',
      eventKey: 'event-30',
      rawBodyDigest: 'b'.repeat(64),
    };
    const eventId = billingPixOrphanWebhookEventId(valid);
    const context = {
      ...valid,
      eventId,
      externalStatus: 'WAITING_PAYMENT',
      rawBodyBytes: 30,
      receivedAt: '2026-10-27T14:10:00.123Z',
    };
    expect(() =>
      billingPixQuarantineOrphanWebhookAttestationContext({ ...context, rawBodyBytes: 0 }),
    ).toThrow(/raw body size/);
    expect(() =>
      billingPixQuarantineOrphanWebhookAttestationContext({
        ...context,
        receivedAt: '2026-10-27T14:10:00Z',
      }),
    ).toThrow(/millisecond precision/);
    expect(() => billingPixOrphanWebhookEventId({ ...valid, eventKey: ' event-30' })).not.toThrow();
    expect(billingPixOrphanWebhookEventId({ ...valid, eventKey: ' event-30' })).toBe(eventId);
  });

  it('validates the exact metadata contract before orphan identity or persistence', () => {
    expect(
      validateBillingPixOrphanWebhookMetadata({
        provider: 'FASTFLOW',
        providerTransactionId: 'x'.repeat(255),
        eventKey: 'transaction.paid',
        externalStatus: 'paid',
      }),
    ).toEqual({
      provider: 'FASTFLOW',
      providerTransactionId: 'x'.repeat(255),
      eventKey: 'transaction.paid',
      externalStatus: 'paid',
    });
    expect(() =>
      validateBillingPixOrphanWebhookMetadataText('x'.repeat(256), 'Webhook field'),
    ).toThrow(/at most 255/);
    for (const value of [' spaced', 'spaced ', 'line\nbreak', 'cobranc\u0327a', '']) {
      expect(() => validateBillingPixOrphanWebhookMetadataText(value, 'Webhook field')).toThrow();
    }
    expect(validateBillingPixOrphanWebhookMetadataText('cobrança-東京', 'Webhook field')).toBe(
      'cobrança-東京',
    );
    expect(validateBillingPixOrphanWebhookMetadataText('cobrança\u00a0pix', 'Webhook field')).toBe(
      'cobrança\u00a0pix',
    );
  });

  it.each(malformedUtf16Vectors)('rejects malformed UTF-16: %s', (_label, value) => {
    expect(() => validateWellFormedUtf16Text(value, 'Webhook field')).toThrow(/well-formed UTF-16/);
    expect(() => validateBillingPixOrphanWebhookMetadataText(value, 'Webhook field')).toThrow(
      /well-formed UTF-16/,
    );
  });

  it.each([
    ['rocket surrogate pair', '\ud83d\ude80'],
    ['supplementary CJK character', '\ud840\udc00'],
    ['literal replacement character', '\ufffd'],
    ['legitimate NFC Unicode', 'cobrança-東京'],
  ])('preserves well-formed Unicode exactly: %s', (_label, value) => {
    expect(validateWellFormedUtf16Text(value, 'Webhook field')).toBe(value);
    expect(validateBillingPixOrphanWebhookMetadataText(value, 'Webhook field')).toBe(value);
  });

  it('counts valid astral characters as codepoints without truncation', () => {
    const valid = '\ud83d\ude80'.repeat(255);
    expect(validateBillingPixOrphanWebhookMetadataText(valid, 'Webhook field')).toBe(valid);
    expect(() =>
      validateBillingPixOrphanWebhookMetadataText(`${valid}\ud83d\ude80`, 'Webhook field'),
    ).toThrow(/at most 255/);
  });

  it.each(unicodeWhiteSpaceVectors)(
    'rejects %s at either metadata edge and as the entire identity',
    (_label, whitespace) => {
      for (const value of [
        `${whitespace}transaction-id`,
        `transaction-id${whitespace}`,
        `${whitespace}transaction-id${whitespace}`,
        whitespace,
        whitespace.repeat(2),
      ]) {
        expect(() => validateBillingPixOrphanWebhookMetadataText(value, 'Webhook field')).toThrow();
      }
    },
  );

  it.each(['provider', 'providerTransactionId', 'eventKey', 'externalStatus'] as const)(
    'applies the same Unicode edge policy to %s',
    (field) => {
      const metadata = {
        provider: 'FASTFLOW',
        providerTransactionId: 'transaction-id',
        eventKey: 'transaction.paid',
        externalStatus: 'paid',
      };
      metadata[field] = `\u00a0${metadata[field]}`;
      expect(() => validateBillingPixOrphanWebhookMetadata(metadata)).toThrow(
        /Unicode White_Space/,
      );
    },
  );

  it.each(['provider', 'providerTransactionId', 'eventKey', 'externalStatus'] as const)(
    'applies well-formed UTF-16 validation to %s',
    (field) => {
      const metadata = {
        provider: 'FASTFLOW',
        providerTransactionId: 'transaction-id',
        eventKey: 'transaction.paid',
        externalStatus: 'paid',
      };
      metadata[field] = `${metadata[field]}\ud800`;
      expect(() => validateBillingPixOrphanWebhookMetadata(metadata)).toThrow(/well-formed UTF-16/);
    },
  );

  it.each([
    ['leading NBSP', '\u00a0transaction-id'],
    ['NBSP only', '\u00a0\u00a0'],
    ['trailing OGHAM SPACE MARK', 'transaction-id\u1680'],
    ['mixed Unicode White_Space only', '\u00a0\u2009\u3000'],
  ])('rejects direct 7A quarantine metadata with %s before signing or SQL', async (_label, id) => {
    const prisma = { $queryRaw: vi.fn() };
    const actors = { forWebhook: vi.fn() };
    const quarantine = new BillingPixWebhookQuarantineService(prisma as never, actors as never);

    await expect(
      quarantine.persistAuthenticatedOrphan({
        provider: 'FASTFLOW',
        providerTransactionId: id,
        eventKey: 'transaction.paid',
        externalStatus: 'paid',
        rawBody: Buffer.from('{"status":"paid"}', 'utf8'),
        receivedAt: new Date('2026-10-27T16:00:00.000Z'),
      }),
    ).rejects.toThrow(/Unicode White_Space/);
    expect(actors.forWebhook).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it.each(malformedUtf16Vectors)(
    'rejects direct 7A malformed UTF-16 with %s before signing or SQL',
    async (_label, id) => {
      const prisma = { $queryRaw: vi.fn() };
      const actors = { forWebhook: vi.fn() };
      const quarantine = new BillingPixWebhookQuarantineService(prisma as never, actors as never);

      await expect(
        quarantine.persistAuthenticatedOrphan({
          provider: 'FASTFLOW',
          providerTransactionId: id,
          eventKey: 'transaction.paid',
          externalStatus: 'paid',
          rawBody: Buffer.from('{"status":"paid"}', 'utf8'),
          receivedAt: new Date('2026-10-27T16:00:00.000Z'),
        }),
      ).rejects.toThrow(/well-formed UTF-16/);
      expect(actors.forWebhook).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each(['provider', 'providerTransactionId', 'eventKey', 'externalStatus'] as const)(
    'rejects malformed UTF-16 in direct 7A %s before signing or SQL',
    async (field) => {
      const prisma = { $queryRaw: vi.fn() };
      const actors = { forWebhook: vi.fn() };
      const quarantine = new BillingPixWebhookQuarantineService(prisma as never, actors as never);
      const input = {
        provider: 'FASTFLOW',
        providerTransactionId: 'transaction-id',
        eventKey: 'transaction.paid',
        externalStatus: 'paid',
        rawBody: Buffer.from('{"status":"paid"}', 'utf8'),
        receivedAt: new Date('2026-10-27T16:00:00.000Z'),
      };
      input[field] = `${input[field]}\ud800`;

      await expect(quarantine.persistAuthenticatedOrphan(input as never)).rejects.toThrow(
        /well-formed UTF-16/,
      );
      expect(actors.forWebhook).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['USER', () => service().forUser(ids.user, amendContext()), ids.user],
    [
      'SYSTEM',
      () => service().forSystem(' billing-scheduler ', amendContext()),
      'billing-scheduler',
    ],
    ['WEBHOOK', () => service().forWebhook('DEPIX', ' event-1 ', amendContext()), 'DEPIX:event-1'],
  ] as const)(
    'creates a canonical context-bound signed %s assertion',
    (type, create, principal) => {
      const assertion = create();
      const expected = createHmac('sha256', secrets[`BILLING_ACTOR_${type}_SIGNING_SECRET`])
        .update(billingActorAttestationPayload(assertion), 'utf8')
        .digest('hex');
      expect(assertion).toMatchObject({
        actorType: type,
        actorPrincipal: principal,
        operation: billingActorOperations.receivableAmend,
        billingExecutionId: ids.execution,
        messageDispatchId: ids.dispatch,
        receivableId: ids.receivable,
        expectedVersion: 7,
      });
      expect(assertion.actorSignature).toBe(expected);
    },
  );

  it('uses explicit typed lengths and distinguishes null from empty UTF-8 text', () => {
    expect(canonicalBillingActorValue('S', null)).toBe('S0:');
    expect(canonicalBillingActorValue('S', '')).toBe('S1:0:');
    expect(canonicalBillingActorValue('S', 'cobrança')).toBe('S1:9:cobrança');
    expect(billingActorAttestationPayload(fixedUnsignedAttestation())).toBe(
      'V1:16:billing-actor:v2' +
        'E1:24:billing.receivable.amend' +
        `U1:36:${ids.execution}` +
        `U1:36:${ids.dispatch}` +
        `U1:36:${ids.receivable}` +
        `H1:64:${financialSetDigest}` +
        'I1:1:7' +
        `H1:64:${amendContext().argumentsDigest}` +
        'E1:6:SYSTEM' +
        'U0:' +
        'S1:16:receivable-cycle' +
        'I1:10:1798761600' +
        'U1:36:66666666-6666-4666-8666-666666666666' +
        'S1:9:system-v1',
    );
  });

  it('rejects absent fields instead of treating them as null', () => {
    const missingActor = { ...fixedUnsignedAttestation() } as Record<string, unknown>;
    delete missingActor.actorUserId;
    expect(() => billingActorAttestationPayload(missingActor as never)).toThrow(
      /field actorUserId is missing/,
    );

    const missingTarget = { ...fixedUnsignedAttestation() } as Record<string, unknown>;
    delete missingTarget.receivableId;
    expect(() => billingActorAttestationPayload(missingTarget as never)).toThrow(
      /field receivableId is missing/,
    );
  });

  it('trims only ASCII spaces, matching PostgreSQL btrim semantics', () => {
    const ascii = billingPixReserveAttestationContext({
      ...reserveInput(),
      owner: ' worker ',
    });
    const plain = billingPixReserveAttestationContext(reserveInput());
    const nonBreaking = billingPixReserveAttestationContext({
      ...reserveInput(),
      owner: '\u00a0worker\u00a0',
    });
    expect(ascii.argumentsDigest).toBe(plain.argumentsDigest);
    expect(nonBreaking.argumentsDigest).not.toBe(plain.argumentsDigest);
  });

  it('accepts only canonical UUID and lowercase SHA-256 input domains', () => {
    expect(
      billingPixReserveAttestationContext({
        ...reserveInput(),
        billingExecutionId: ids.execution.toUpperCase(),
      }).billingExecutionId,
    ).toBe(ids.execution);
    for (const billingExecutionId of [
      ` ${ids.execution}`,
      `${ids.execution} `,
      `\u00a0${ids.execution}\u00a0`,
      `${ids.execution}\n`,
      ids.execution.slice(1),
    ]) {
      expect(() =>
        billingPixReserveAttestationContext({ ...reserveInput(), billingExecutionId }),
      ).toThrow();
    }
    for (const digest of [
      ` ${financialSetDigest}`,
      `${financialSetDigest}\u00a0`,
      financialSetDigest.toUpperCase(),
      financialSetDigest.slice(1),
      `${financialSetDigest}0`,
      `g${financialSetDigest.slice(1)}`,
    ]) {
      expect(() =>
        billingPixReserveAttestationContext({ ...reserveInput(), financialSetDigest: digest }),
      ).toThrow(/SHA-256|forbidden/);
    }
  });

  it.each(['2024-02-29', '2026-02-28', '2026-04-30', '2026-12-31'])(
    'accepts the real calendar date %s',
    (dueDate) => {
      expect(() =>
        billingReceivableAmendAttestationContext({ ...amendInput(), dueDate }),
      ).not.toThrow();
    },
  );

  it.each([
    '2026-02-29',
    '2026-02-31',
    '2026-04-31',
    '2026-06-31',
    '2026-09-31',
    '2026-11-31',
    '2026-01-00',
    '2026-00-01',
    '2026-13-01',
    '0000-01-01',
    '2026-1-01',
  ])('rejects the invalid calendar date %s', (dueDate) => {
    expect(() => billingReceivableAmendAttestationContext({ ...amendInput(), dueDate })).toThrow(
      /date/,
    );
  });

  it('rejects a Date object because its original lexical representation is unrecoverable', () => {
    const normalizedInvalidInput = new Date('2026-02-31');
    expect(() =>
      billingReceivableAmendAttestationContext({
        ...amendInput(),
        dueDate: normalizedInvalidInput as never,
      }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it.each(['0.01', '9999999999.99', '50', '50.00'])(
    'accepts the positive NUMERIC(12,2) amendment amount %s',
    (amount) => {
      expect(() =>
        billingReceivableAmendAttestationContext({ ...amendInput(), amount }),
      ).not.toThrow();
    },
  );

  it.each([
    '0',
    '-0.01',
    '0.001',
    '10000000000.00',
    '999999999999999999999.99',
    '1e3',
    '01.00',
    'NaN',
    'Infinity',
  ])('rejects the out-of-contract amendment amount %s', (amount) => {
    expect(() => billingReceivableAmendAttestationContext({ ...amendInput(), amount })).toThrow(
      /amount|decimal|NUMERIC/,
    );
  });

  it('binds operation, target, version and every relevant argument into different digests', () => {
    const reserve = billingPixReserveAttestationContext({
      billingExecutionId: ids.execution,
      messageDispatchId: ids.dispatch,
      financialSetDigest,
      expectedVersion: 7,
      owner: 'worker',
      token: 'lease-token',
      creationKey: 'pix-key',
      reason: 'Reserva PIX autorizada.',
    });
    const transition = billingExecutionTransitionAttestationContext({
      billingExecutionId: ids.execution,
      messageDispatchId: ids.dispatch,
      financialSetDigest,
      expectedVersion: 7,
      owner: 'worker',
      token: 'lease-token',
      status: 'WAITING_PIX',
      pixStatus: 'CONFIRMED',
      deliveryStatus: 'NOT_READY',
      paymentIntentId: ids.paymentIntent,
      reason: 'Transição autorizada.',
      reconciliationEvidence: null,
    });
    expect(reserve.operation).not.toBe(transition.operation);
    expect(reserve.argumentsDigest).not.toBe(transition.argumentsDigest);
    expect(
      billingPixReserveAttestationContext({
        ...reserveInput(),
        billingExecutionId: '77777777-7777-4777-8777-777777777777',
      }),
    ).not.toEqual(reserve);
    expect(
      billingPixReserveAttestationContext({ ...reserveInput(), expectedVersion: 8 }),
    ).not.toEqual(reserve);
    expect(
      billingPixReserveAttestationContext({ ...reserveInput(), creationKey: 'other-key' }),
    ).not.toEqual(reserve);
  });

  it('binds preparation and every persisted provider-result field to distinct HMAC operations', () => {
    const shared = {
      billingExecutionId: ids.execution,
      messageDispatchId: ids.dispatch,
      financialSetDigest,
      expectedVersion: 8,
      owner: 'worker',
      token: 'lease-token',
      attemptId: ids.attempt,
      creationKey: `bpx1:${'b'.repeat(64)}`,
      provider: 'DEPIX',
      reason: 'Controlled simulated creation.',
    };
    const prepared = billingPixPrepareCreateAttestationContext(shared);
    const result = billingPixRecordCreateResultAttestationContext({
      ...shared,
      expectedVersion: 9,
      resultKind: 'CONFIRMED',
      providerTransactionId: 'provider-123',
      amount: '30.00',
      externalStatus: 'WAITING_PAYMENT',
      externalDepixId: null,
      blockchainTxId: null,
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: null,
      expiresAt: '2026-11-23T23:59:59.000Z',
      failureCode: null,
      failureMessage: null,
    });
    expect(prepared.operation).toBe('billing.pix.prepare-create');
    expect(result.operation).toBe('billing.pix.record-create-result');
    expect(result.argumentsDigest).not.toBe(prepared.argumentsDigest);
    expect(
      billingPixRecordCreateResultAttestationContext({
        ...shared,
        expectedVersion: 9,
        resultKind: 'CONFIRMED',
        providerTransactionId: 'provider-124',
        amount: '30.00',
        externalStatus: 'WAITING_PAYMENT',
        externalDepixId: null,
        blockchainTxId: null,
        pixCopyPaste: 'pix-copy-paste',
        qrCodeData: null,
        expiresAt: '2026-11-23T23:59:59.000Z',
        failureCode: null,
        failureMessage: null,
      }).argumentsDigest,
    ).not.toBe(result.argumentsDigest);

    const reconciliation = billingPixReconcileCreateResultAttestationContext({
      ...shared,
      expectedVersion: 10,
      resultKind: 'CONFIRMED',
      providerTransactionId: 'provider-123',
      amount: '30.00',
      externalStatus: 'WAITING_PAYMENT',
      externalDepixId: null,
      blockchainTxId: null,
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: null,
      expiresAt: '2026-11-23T23:59:59.000Z',
      failureCode: null,
      reconciliationEvidence: 'Identified GET confirmed the exact remote transaction.',
    });
    expect(reconciliation.operation).toBe('billing.pix.reconcile-create-result');
    expect(reconciliation.argumentsDigest).not.toBe(result.argumentsDigest);
    expect(
      billingPixReconcileCreateResultAttestationContext({
        ...shared,
        expectedVersion: 10,
        resultKind: 'CONFIRMED',
        providerTransactionId: 'provider-123',
        amount: '30.00',
        externalStatus: 'WAITING_PAYMENT',
        externalDepixId: null,
        blockchainTxId: null,
        pixCopyPaste: 'pix-copy-paste',
        qrCodeData: null,
        expiresAt: '2026-11-23T23:59:59.000Z',
        failureCode: null,
        reconciliationEvidence: 'Different evidence.',
      }).argumentsDigest,
    ).not.toBe(reconciliation.argumentsDigest);
  });

  it.each(['principal\nforged', 'principal\u0000forged', 'principal\u007fforged'])(
    'rejects forbidden principal control characters: %j',
    (principal) => {
      expect(() => service().forSystem(principal, amendContext())).toThrow(
        /forbidden control characters/,
      );
    },
  );

  it('requires NFC normalization before signing', () => {
    expect(() => service().forSystem('cobranc\u0327a', amendContext())).toThrow(
      /NFC normalization/,
    );
  });

  it('fails closed when a signing credential is absent', () => {
    const subject = new BillingActorAttestationService(new ConfigService({}));
    expect(() => subject.forSystem('billing-scheduler', amendContext())).toThrow(
      'BILLING_ACTOR_SYSTEM_KEY_ID is required',
    );
  });
});

function service() {
  return new BillingActorAttestationService(new ConfigService(secrets));
}

function amendContext() {
  return billingReceivableAmendAttestationContext(amendInput());
}

function amendInput() {
  return {
    billingExecutionId: ids.execution,
    messageDispatchId: ids.dispatch,
    receivableId: ids.receivable,
    financialSetDigest,
    expectedVersion: 7,
    amount: '50.00',
    dueDate: '2026-11-23',
    description: 'Renovação — Plano Pró',
    reason: 'Ajuste administrativo autorizado.',
  };
}

function reserveInput() {
  return {
    billingExecutionId: ids.execution,
    messageDispatchId: ids.dispatch,
    financialSetDigest,
    expectedVersion: 7,
    owner: 'worker',
    token: 'lease-token',
    creationKey: 'pix-key',
    reason: 'Reserva PIX autorizada.',
  };
}

function fixedUnsignedAttestation() {
  return {
    ...amendContext(),
    actorType: 'SYSTEM' as const,
    actorUserId: null,
    actorPrincipal: 'receivable-cycle',
    actorIssuedAt: 1_798_761_600,
    actorNonce: '66666666-6666-4666-8666-666666666666',
    actorKeyId: 'system-v1',
  };
}
