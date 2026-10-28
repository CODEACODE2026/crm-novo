import {
  BillingActorType,
  BillingAuditOrigin,
  BillingDeliveryStatus,
  BillingExecutionStatus,
  BillingPixStatus,
  type PaymentProviderCode,
} from '@prisma/client';

type TransitionMap<T extends string> = Readonly<Record<T, ReadonlySet<T>>>;

const executionTransitions: TransitionMap<BillingExecutionStatus> = {
  SCHEDULED: new Set(['PROCESSING', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED']),
  PROCESSING: new Set([
    'WAITING_PIX',
    'READY_TO_SEND',
    'COMPLETED',
    'BLOCKED',
    'REVIEW_REQUIRED',
    'CANCELED',
  ]),
  WAITING_PIX: new Set(['READY_TO_SEND', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED']),
  READY_TO_SEND: new Set(['PROCESSING', 'COMPLETED', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELED']),
  COMPLETED: new Set(),
  BLOCKED: new Set(['REVIEW_REQUIRED', 'CANCELED']),
  REVIEW_REQUIRED: new Set(['SCHEDULED', 'CANCELED']),
  CANCELED: new Set(),
};

const pixTransitions: TransitionMap<BillingPixStatus> = {
  NOT_STARTED: new Set(['RESERVED', 'CANCELED']),
  RESERVED: new Set(['CREATING', 'FAILED', 'CANCELED']),
  CREATING: new Set(['CONFIRMED', 'AMBIGUOUS', 'FAILED']),
  CONFIRMED: new Set(['PAID', 'EXPIRED', 'CANCELED', 'SUPERSEDED']),
  AMBIGUOUS: new Set(['CONFIRMED', 'FAILED', 'CANCELED', 'SUPERSEDED']),
  FAILED: new Set(['RESERVED', 'CANCELED']),
  EXPIRED: new Set(['SUPERSEDED', 'CANCELED']),
  PAID: new Set(),
  CANCELED: new Set(),
  SUPERSEDED: new Set(['RESERVED', 'CANCELED']),
};

const deliveryTransitions: TransitionMap<BillingDeliveryStatus> = {
  NOT_READY: new Set(['READY', 'CANCELED']),
  READY: new Set(['SENDING', 'CANCELED']),
  SENDING: new Set(['SENT', 'AMBIGUOUS', 'FAILED']),
  SENT: new Set(),
  AMBIGUOUS: new Set(['SENT', 'FAILED', 'CANCELED']),
  FAILED: new Set(['READY', 'CANCELED']),
  CANCELED: new Set(),
};

export type BillingActor =
  | { type: 'USER'; userId: string }
  | { type: 'SYSTEM'; component: string }
  | { type: 'WEBHOOK'; provider: PaymentProviderCode; eventKey: string };

export interface BillingAuditActorData {
  actorType: BillingActorType;
  actorUserId: string | null;
  origin: BillingAuditOrigin;
  metadata: Record<string, string>;
}

export function billingAuditActorData(actor: BillingActor): BillingAuditActorData {
  if (actor.type === 'USER') {
    const userId = actor.userId.trim();
    if (!userId) throw new Error('Billing USER actor requires a userId.');
    return {
      actorType: BillingActorType.USER,
      actorUserId: userId,
      origin: BillingAuditOrigin.BILLING,
      metadata: {},
    };
  }

  if (actor.type === 'SYSTEM') {
    const component = actor.component.trim();
    if (!component) throw new Error('Billing SYSTEM actor requires a component.');
    return {
      actorType: BillingActorType.SYSTEM,
      actorUserId: null,
      origin: BillingAuditOrigin.BILLING,
      metadata: { component },
    };
  }

  const eventKey = actor.eventKey.trim();
  if (!eventKey) throw new Error('Billing WEBHOOK actor requires an eventKey.');
  return {
    actorType: BillingActorType.WEBHOOK,
    actorUserId: null,
    origin: BillingAuditOrigin.BILLING,
    metadata: { provider: actor.provider, eventKey },
  };
}

export function assertBillingExecutionTransition(
  from: BillingExecutionStatus,
  to: BillingExecutionStatus,
) {
  assertTransition('BillingExecution', executionTransitions, from, to);
}

export function assertBillingPixTransition(from: BillingPixStatus, to: BillingPixStatus) {
  assertTransition('Billing PIX', pixTransitions, from, to);
}

export function assertBillingDeliveryTransition(
  from: BillingDeliveryStatus,
  to: BillingDeliveryStatus,
) {
  assertTransition('Billing delivery', deliveryTransitions, from, to);
}

function assertTransition<T extends string>(
  label: string,
  transitions: TransitionMap<T>,
  from: T,
  to: T,
) {
  if (from === to) return;
  if (!transitions[from].has(to)) {
    throw new Error(`${label} transition ${from} -> ${to} is not allowed.`);
  }
}
