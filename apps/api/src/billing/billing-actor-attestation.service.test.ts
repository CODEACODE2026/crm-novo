import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BillingActorAttestationService,
  billingActorAttestationPayload,
  billingActorOperations,
  billingExecutionTransitionAttestationContext,
  billingPixPrepareCreateAttestationContext,
  billingPixReconcileCreateResultAttestationContext,
  billingPixRecordCreateResultAttestationContext,
  billingPixReserveAttestationContext,
  billingReceivableAmendAttestationContext,
  canonicalBillingActorValue,
} from './billing-actor-attestation.service';

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

describe('BillingActorAttestationService', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(1_798_761_600_000));

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
