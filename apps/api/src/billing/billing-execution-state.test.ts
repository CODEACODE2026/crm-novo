import {
  BillingDeliveryStatus,
  BillingExecutionStatus,
  BillingPixStatus,
  PaymentProviderCode,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  assertBillingDeliveryTransition,
  assertBillingExecutionTransition,
  assertBillingPixTransition,
  billingAuditActorData,
} from './billing-execution-state';

describe('Billing execution state contracts', () => {
  it('accepts restart-safe progress and explicit review transitions', () => {
    expect(() =>
      assertBillingExecutionTransition(
        BillingExecutionStatus.SCHEDULED,
        BillingExecutionStatus.PROCESSING,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingExecutionTransition(
        BillingExecutionStatus.REVIEW_REQUIRED,
        BillingExecutionStatus.SCHEDULED,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingPixTransition(BillingPixStatus.FAILED, BillingPixStatus.RESERVED),
    ).not.toThrow();
    expect(() =>
      assertBillingDeliveryTransition(BillingDeliveryStatus.FAILED, BillingDeliveryStatus.READY),
    ).not.toThrow();
  });

  it('rejects terminal and unsafe shortcut transitions', () => {
    expect(() =>
      assertBillingExecutionTransition(
        BillingExecutionStatus.COMPLETED,
        BillingExecutionStatus.PROCESSING,
      ),
    ).toThrow('COMPLETED -> PROCESSING');
    expect(() =>
      assertBillingPixTransition(BillingPixStatus.NOT_STARTED, BillingPixStatus.CONFIRMED),
    ).toThrow('NOT_STARTED -> CONFIRMED');
    expect(() =>
      assertBillingDeliveryTransition(BillingDeliveryStatus.NOT_READY, BillingDeliveryStatus.SENT),
    ).toThrow('NOT_READY -> SENT');
  });

  it('normalizes typed USER, SYSTEM and WEBHOOK audit actors without fake users', () => {
    expect(billingAuditActorData({ type: 'USER', userId: ' user-id ' })).toMatchObject({
      actorType: 'USER',
      actorUserId: 'user-id',
      origin: 'BILLING',
    });
    expect(billingAuditActorData({ type: 'SYSTEM', component: ' billing-worker ' })).toMatchObject({
      actorType: 'SYSTEM',
      actorUserId: null,
      metadata: { component: 'billing-worker' },
    });
    expect(
      billingAuditActorData({
        type: 'WEBHOOK',
        provider: PaymentProviderCode.DEPIX,
        eventKey: ' event-1 ',
      }),
    ).toMatchObject({
      actorType: 'WEBHOOK',
      actorUserId: null,
      metadata: { provider: 'DEPIX', eventKey: 'event-1' },
    });
  });

  it('rejects actors without their required identity', () => {
    expect(() => billingAuditActorData({ type: 'USER', userId: '  ' })).toThrow();
    expect(() => billingAuditActorData({ type: 'SYSTEM', component: '\t' })).toThrow();
    expect(() =>
      billingAuditActorData({
        type: 'WEBHOOK',
        provider: PaymentProviderCode.DEPIX,
        eventKey: '\n',
      }),
    ).toThrow();
  });
});
