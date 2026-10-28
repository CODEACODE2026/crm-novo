import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID } from 'node:crypto';

export const billingActorOperations = {
  pixReserve: 'billing.pix.reserve',
  pixPrepareCreate: 'billing.pix.prepare-create',
  pixRecordCreateResult: 'billing.pix.record-create-result',
  pixReconcileCreateResult: 'billing.pix.reconcile-create-result',
  pixQuarantineOrphanWebhook: 'billing.pix.quarantine-orphan-webhook',
  pixAnalyzeOrphanWebhook: 'billing.pix.analyze-orphan-webhook',
  pixCorrelateOrphanWebhook: 'billing.pix.correlate-orphan-webhook',
  executionTransition: 'billing.execution.transition',
  receivableAmend: 'billing.receivable.amend',
} as const;

export const billingPixOrphanWebhookEvidenceVersion = 'billing-pix-orphan-webhook:v1';
const billingPixOrphanWebhookIdentityVersion = 'billing-pix-orphan-webhook-id:v1';

export type BillingActorOperation =
  (typeof billingActorOperations)[keyof typeof billingActorOperations];

export type BillingActorAttestationContext = {
  operation: BillingActorOperation;
  billingExecutionId: string;
  messageDispatchId: string;
  receivableId: string | null;
  financialSetDigest: string;
  expectedVersion: number;
  argumentsDigest: string;
};

export type BillingActorAttestation = BillingActorAttestationContext & {
  actorType: 'USER' | 'SYSTEM' | 'WEBHOOK';
  actorUserId: string | null;
  actorPrincipal: string;
  actorIssuedAt: number;
  actorNonce: string;
  actorKeyId: string;
  actorSignature: string;
};

type AttestationKind = BillingActorAttestation['actorType'];
type CanonicalType = 'V' | 'E' | 'S' | 'U' | 'I' | 'H' | 'D' | 'M';
type CanonicalValue = readonly [CanonicalType, string | null];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

@Injectable()
export class BillingActorAttestationService {
  /**
   * Trust boundary: PostgreSQL runtime roles cannot mint these assertions because they cannot
   * read the signing keys. The NestJS API currently holds the USER, SYSTEM and WEBHOOK secrets,
   * so compromise of this process compromises all three issuers; HMAC proves authorization by
   * this process, not cryptographic isolation between components inside it. Callers may use the
   * WEBHOOK issuer only after the provider-specific webhook authentication has succeeded.
   */
  constructor(private readonly config: ConfigService) {}

  forUser(userId: string, context: BillingActorAttestationContext): BillingActorAttestation {
    const normalized = canonicalUuid(userId, 'Billing USER id');
    return this.sign('USER', normalized, normalized, context);
  }

  forSystem(component: string, context: BillingActorAttestationContext): BillingActorAttestation {
    return this.sign(
      'SYSTEM',
      null,
      canonicalPrincipal(component, 'Billing SYSTEM component'),
      context,
    );
  }

  forWebhook(
    provider: string,
    eventKey: string,
    context: BillingActorAttestationContext,
  ): BillingActorAttestation {
    const normalizedProvider = canonicalPrincipal(provider, 'Billing WEBHOOK provider');
    const normalizedEventKey = canonicalPrincipal(eventKey, 'Billing WEBHOOK event key');
    return this.sign('WEBHOOK', null, `${normalizedProvider}:${normalizedEventKey}`, context);
  }

  private sign(
    actorType: AttestationKind,
    actorUserId: string | null,
    actorPrincipal: string,
    context: BillingActorAttestationContext,
  ): BillingActorAttestation {
    const normalizedContext = canonicalContext(context);
    const actorIssuedAt = Math.floor(Date.now() / 1000);
    const actorNonce = randomUUID();
    const actorKeyId = canonicalPrincipal(
      this.required(`BILLING_ACTOR_${actorType}_KEY_ID`),
      `Billing ${actorType} key id`,
    );
    const secret = this.required(`BILLING_ACTOR_${actorType}_SIGNING_SECRET`);
    const unsigned = {
      ...normalizedContext,
      actorType,
      actorUserId,
      actorPrincipal,
      actorIssuedAt,
      actorNonce,
      actorKeyId,
    };
    return {
      ...unsigned,
      actorSignature: createHmac('sha256', secret)
        .update(billingActorAttestationPayload(unsigned), 'utf8')
        .digest('hex'),
    };
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) throw new Error(`${key} is required for trusted Billing authorship.`);
    return value;
  }
}

export function billingActorAttestationPayload(
  input: Omit<BillingActorAttestation, 'actorSignature'>,
): string {
  requireOwnFields(input, [
    'actorType',
    'actorUserId',
    'actorPrincipal',
    'actorIssuedAt',
    'actorNonce',
    'actorKeyId',
  ]);
  const context = canonicalContext(input);
  const actorPrincipal = canonicalPrincipal(input.actorPrincipal, 'Billing actor principal');
  const actorKeyId = canonicalPrincipal(input.actorKeyId, 'Billing actor key id');
  const actorUserId = input.actorUserId
    ? canonicalUuid(input.actorUserId, 'Billing actor user id')
    : null;
  const actorNonce = canonicalUuid(input.actorNonce, 'Billing actor nonce');
  if (!Number.isSafeInteger(input.actorIssuedAt) || input.actorIssuedAt < 0) {
    throw new Error('Billing actor issued-at must be a non-negative safe integer.');
  }
  return canonicalEncode([
    ['V', 'billing-actor:v2'],
    ['E', context.operation],
    ['U', context.billingExecutionId],
    ['U', context.messageDispatchId],
    ['U', context.receivableId],
    ['H', context.financialSetDigest],
    ['I', String(context.expectedVersion)],
    ['H', context.argumentsDigest],
    ['E', input.actorType],
    ['U', actorUserId],
    ['S', actorPrincipal],
    ['I', String(input.actorIssuedAt)],
    ['U', actorNonce],
    ['S', actorKeyId],
  ]);
}

export function billingPixReserveAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  creationKey: string;
  reason: string;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.pixReserve,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['S', canonicalRequiredText(input.creationKey, 'Billing PIX creation key')],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
    ]),
  });
}

export function billingPixPrepareCreateAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  attemptId: string;
  creationKey: string;
  provider: string;
  reason: string;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.pixPrepareCreate,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['U', canonicalUuid(input.attemptId, 'Billing PIX attempt id')],
      ['S', canonicalRequiredText(input.creationKey, 'Billing PIX creation key')],
      ['E', canonicalRequiredText(input.provider, 'Billing PIX provider')],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
    ]),
  });
}

export function billingPixRecordCreateResultAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  attemptId: string;
  creationKey: string;
  provider: string;
  resultKind: string;
  providerTransactionId: string | null;
  amount: Prisma.Decimal.Value | null;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  pixCopyPaste: string | null;
  qrCodeData: string | null;
  expiresAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  reason: string;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.pixRecordCreateResult,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['U', canonicalUuid(input.attemptId, 'Billing PIX attempt id')],
      ['S', canonicalRequiredText(input.creationKey, 'Billing PIX creation key')],
      ['E', canonicalRequiredText(input.provider, 'Billing PIX provider')],
      ['E', canonicalRequiredText(input.resultKind, 'FastDepix result kind')],
      ['S', canonicalOptionalText(input.providerTransactionId, 'Provider transaction id')],
      [
        'M',
        input.amount === null
          ? null
          : canonicalNumeric12Scale2(input.amount, 'PIX amount').canonical,
      ],
      ['S', canonicalOptionalText(input.externalStatus, 'Provider external status')],
      ['S', canonicalOptionalText(input.externalDepixId, 'Provider Depix id')],
      ['S', canonicalOptionalText(input.blockchainTxId, 'Blockchain transaction id')],
      ['S', canonicalOptionalText(input.pixCopyPaste, 'PIX copy-and-paste payload')],
      ['S', canonicalOptionalText(input.qrCodeData, 'PIX QR code payload')],
      ['S', canonicalOptionalText(input.expiresAt, 'PIX expiration instant')],
      ['S', canonicalOptionalText(input.failureCode, 'PIX failure code')],
      ['S', canonicalOptionalText(input.failureMessage, 'PIX failure message')],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
    ]),
  });
}

export function billingPixReconcileCreateResultAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  attemptId: string;
  creationKey: string;
  provider: string;
  resultKind: 'CONFIRMED' | 'REVIEW_REQUIRED';
  providerTransactionId: string;
  amount: Prisma.Decimal.Value | null;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  pixCopyPaste: string | null;
  qrCodeData: string | null;
  expiresAt: string | null;
  failureCode: string | null;
  reconciliationEvidence: string;
  reason: string;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.pixReconcileCreateResult,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['U', canonicalUuid(input.attemptId, 'Billing PIX attempt id')],
      ['S', canonicalRequiredText(input.creationKey, 'Billing PIX creation key')],
      ['E', canonicalRequiredText(input.provider, 'Billing PIX provider')],
      ['E', canonicalRequiredText(input.resultKind, 'Billing PIX reconciliation result')],
      ['S', canonicalRequiredText(input.providerTransactionId, 'Provider transaction id')],
      [
        'M',
        input.amount === null
          ? null
          : canonicalNumeric12Scale2(input.amount, 'PIX amount').canonical,
      ],
      ['S', canonicalOptionalText(input.externalStatus, 'Provider external status')],
      ['S', canonicalOptionalText(input.externalDepixId, 'Provider Depix id')],
      ['S', canonicalOptionalText(input.blockchainTxId, 'Blockchain transaction id')],
      ['S', canonicalOptionalText(input.pixCopyPaste, 'PIX copy-and-paste payload')],
      ['S', canonicalOptionalText(input.qrCodeData, 'PIX QR code payload')],
      ['S', canonicalOptionalText(input.expiresAt, 'PIX expiration instant')],
      ['S', canonicalOptionalText(input.failureCode, 'PIX reconciliation failure code')],
      ['S', canonicalRequiredText(input.reconciliationEvidence, 'PIX reconciliation evidence')],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
    ]),
  });
}

export function billingPixOrphanWebhookEventId(input: {
  provider: string;
  providerTransactionId: string;
  eventKey: string;
  rawBodyDigest: string;
}): string {
  const digest = createHash('sha256')
    .update(
      canonicalEncode([
        ['V', billingPixOrphanWebhookIdentityVersion],
        ['E', canonicalRequiredText(input.provider, 'Webhook provider')],
        ['S', canonicalPrincipal(input.providerTransactionId, 'Webhook provider transaction id')],
        ['S', canonicalPrincipal(input.eventKey, 'Webhook event key')],
        ['H', canonicalDigest(input.rawBodyDigest, 'Webhook raw body digest')],
      ]),
      'utf8',
    )
    .digest('hex');
  const uuidHex = `${digest.slice(0, 12)}5${digest.slice(13, 16)}8${digest.slice(17, 32)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
}

export function validateBillingPixOrphanWebhookMetadataText(value: string, label: string): string {
  const canonical = canonicalExactText(validateWellFormedUtf16Text(value, label), label);
  if (hasUnicodeWhiteSpaceAtEitherEdge(canonical)) {
    throw new Error(`${label} must not contain outer Unicode White_Space.`);
  }
  if (!canonical) throw new Error(`${label} is required.`);
  if (Array.from(canonical).length > 255) {
    throw new Error(`${label} must contain at most 255 characters.`);
  }
  return canonical;
}

/**
 * Rejects unpaired or out-of-order UTF-16 surrogate code units without
 * normalizing, replacing or otherwise rewriting the original value.
 */
export function validateWellFormedUtf16Text(value: string, label: string): string {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new Error(`${label} must contain well-formed UTF-16.`);
      }
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        throw new Error(`${label} must contain well-formed UTF-16.`);
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`${label} must contain well-formed UTF-16.`);
    }
  }
  return value;
}

/**
 * Unicode White_Space binary property (25 code points): U+0009..U+000D,
 * U+0020, U+0085, U+00A0, U+1680, U+2000..U+200A, U+2028, U+2029,
 * U+202F, U+205F and U+3000. Only identity edges are forbidden; values are
 * rejected exactly as received and are never trimmed or rewritten.
 */
function hasUnicodeWhiteSpaceAtEitherEdge(value: string): boolean {
  const characters = Array.from(value);
  if (characters.length === 0) return false;
  return (
    isUnicodeWhiteSpace(characters[0]!) || isUnicodeWhiteSpace(characters[characters.length - 1]!)
  );
}

function isUnicodeWhiteSpace(character: string): boolean {
  const codePoint = character.codePointAt(0)!;
  return (
    (codePoint >= 0x0009 && codePoint <= 0x000d) ||
    codePoint === 0x0020 ||
    codePoint === 0x0085 ||
    codePoint === 0x00a0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
}

export function validateBillingPixOrphanWebhookMetadata(input: {
  provider: string;
  providerTransactionId: string;
  eventKey: string;
  externalStatus: string;
}) {
  return {
    provider: validateBillingPixOrphanWebhookMetadataText(input.provider, 'Webhook provider'),
    providerTransactionId: validateBillingPixOrphanWebhookMetadataText(
      input.providerTransactionId,
      'Webhook provider transaction id',
    ),
    eventKey: validateBillingPixOrphanWebhookMetadataText(input.eventKey, 'Webhook event key'),
    externalStatus: validateBillingPixOrphanWebhookMetadataText(
      input.externalStatus,
      'Webhook external status',
    ),
  };
}

export function billingPixQuarantineOrphanWebhookAttestationContext(input: {
  eventId: string;
  provider: string;
  providerTransactionId: string;
  eventKey: string;
  externalStatus: string;
  rawBodyDigest: string;
  rawBodyBytes: number;
  receivedAt: string;
}): BillingActorAttestationContext {
  const eventId = canonicalUuid(input.eventId, 'Orphan webhook event id');
  if (
    !Number.isSafeInteger(input.rawBodyBytes) ||
    input.rawBodyBytes < 1 ||
    input.rawBodyBytes > 1_048_576
  ) {
    throw new Error('Webhook raw body size must be between 1 and 1048576 bytes.');
  }
  const receivedAt = canonicalInstant(input.receivedAt, 'Webhook received-at');
  return canonicalContext({
    operation: billingActorOperations.pixQuarantineOrphanWebhook,
    billingExecutionId: eventId,
    messageDispatchId: eventId,
    receivableId: null,
    financialSetDigest: canonicalDigest(input.rawBodyDigest, 'Webhook raw body digest'),
    expectedVersion: 0,
    argumentsDigest: operationArgumentsDigest([
      ['E', canonicalRequiredText(input.provider, 'Webhook provider')],
      ['S', canonicalPrincipal(input.providerTransactionId, 'Webhook provider transaction id')],
      ['S', canonicalPrincipal(input.eventKey, 'Webhook event key')],
      ['S', canonicalPrincipal(input.externalStatus, 'Webhook external status')],
      ['H', canonicalDigest(input.rawBodyDigest, 'Webhook raw body digest')],
      ['I', String(input.rawBodyBytes)],
      ['S', receivedAt],
    ]),
  });
}

export function billingPixAnalyzeOrphanWebhookAttestationContext(input: {
  eventId: string;
  rawBodyDigest: string;
  reasonCode: string;
}): BillingActorAttestationContext {
  const eventId = canonicalUuid(input.eventId, 'Orphan webhook event id');
  return canonicalContext({
    operation: billingActorOperations.pixAnalyzeOrphanWebhook,
    billingExecutionId: eventId,
    messageDispatchId: eventId,
    receivableId: null,
    financialSetDigest: canonicalDigest(input.rawBodyDigest, 'Webhook raw body digest'),
    expectedVersion: 0,
    argumentsDigest: operationArgumentsDigest([
      ['U', eventId],
      ['E', 'REVIEW_REQUIRED'],
      ['E', canonicalRequiredText(input.reasonCode, 'Orphan correlation reason code')],
    ]),
  });
}

export function billingPixCorrelateOrphanWebhookAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  eventId: string;
  attemptId: string;
  creationKey: string;
  provider: string;
  providerTransactionId: string;
  paymentIntentId: string | null;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.pixCorrelateOrphanWebhook,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['U', canonicalUuid(input.eventId, 'Orphan webhook event id')],
      ['U', canonicalUuid(input.attemptId, 'Billing PIX attempt id')],
      ['S', canonicalRequiredText(input.creationKey, 'Billing PIX creation key')],
      ['E', canonicalRequiredText(input.provider, 'Billing PIX provider')],
      ['S', canonicalPrincipal(input.providerTransactionId, 'Webhook provider transaction id')],
      [
        'U',
        input.paymentIntentId
          ? canonicalUuid(input.paymentIntentId, 'Billing PaymentIntent id')
          : null,
      ],
    ]),
  });
}

export function billingExecutionTransitionAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  financialSetDigest: string;
  expectedVersion: number;
  owner: string;
  token: string;
  status: string;
  pixStatus: string;
  deliveryStatus: string;
  paymentIntentId: string | null;
  reason: string;
  reconciliationEvidence: string | null;
}): BillingActorAttestationContext {
  return canonicalContext({
    operation: billingActorOperations.executionTransition,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: null,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['S', canonicalRequiredText(input.owner, 'Billing lease owner')],
      ['S', canonicalRequiredText(input.token, 'Billing lease token')],
      ['E', canonicalRequiredText(input.status, 'Billing execution status')],
      ['E', canonicalRequiredText(input.pixStatus, 'Billing PIX status')],
      ['E', canonicalRequiredText(input.deliveryStatus, 'Billing delivery status')],
      [
        'U',
        input.paymentIntentId ? canonicalUuid(input.paymentIntentId, 'PaymentIntent id') : null,
      ],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
      ['S', canonicalOptionalText(input.reconciliationEvidence, 'Billing reconciliation evidence')],
    ]),
  });
}

export function billingReceivableAmendAttestationContext(input: {
  billingExecutionId: string;
  messageDispatchId: string;
  receivableId: string;
  financialSetDigest: string;
  expectedVersion: number;
  amount: Prisma.Decimal.Value;
  /** Strict lexical boundary. Convert trusted, already-typed database dates explicitly at call sites. */
  dueDate: string;
  description: string;
  reason: string;
}): BillingActorAttestationContext {
  const amount = canonicalNumeric12Scale2(input.amount, 'Billing amount');
  if (amount.decimal.lte(0)) throw new Error('Billing amount must be positive.');
  return canonicalContext({
    operation: billingActorOperations.receivableAmend,
    billingExecutionId: input.billingExecutionId,
    messageDispatchId: input.messageDispatchId,
    receivableId: input.receivableId,
    financialSetDigest: input.financialSetDigest,
    expectedVersion: input.expectedVersion,
    argumentsDigest: operationArgumentsDigest([
      ['M', amount.canonical],
      ['D', canonicalDate(input.dueDate)],
      ['S', canonicalExactText(input.description, 'Billing receivable description')],
      ['S', canonicalRequiredText(input.reason, 'Billing mutation reason')],
    ]),
  });
}

export function canonicalBillingActorValue(type: CanonicalType, value: string | null): string {
  if (!(['V', 'E', 'S', 'U', 'I', 'H', 'D', 'M'] as string[]).includes(type)) {
    throw new Error('Unsupported Billing canonical type.');
  }
  if (value === null) return `${type}0:`;
  if (containsControlCharacters(value)) {
    throw new Error('Billing canonical value contains forbidden control characters.');
  }
  if (value.normalize('NFC') !== value) {
    throw new Error('Billing canonical value must use NFC normalization.');
  }
  return `${type}1:${Buffer.byteLength(value, 'utf8')}:${value}`;
}

function operationArgumentsDigest(values: readonly CanonicalValue[]): string {
  return createHash('sha256')
    .update(canonicalEncode([['V', 'billing-operation-args:v1'], ...values]), 'utf8')
    .digest('hex');
}

function canonicalEncode(values: readonly CanonicalValue[]): string {
  return values.map(([type, value]) => canonicalBillingActorValue(type, value)).join('');
}

function canonicalContext(input: BillingActorAttestationContext): BillingActorAttestationContext {
  requireOwnFields(input, [
    'operation',
    'billingExecutionId',
    'messageDispatchId',
    'receivableId',
    'financialSetDigest',
    'expectedVersion',
    'argumentsDigest',
  ]);
  if (!(Object.values(billingActorOperations) as string[]).includes(input.operation)) {
    throw new Error('Unsupported Billing actor operation.');
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error('Billing expectedVersion must be a non-negative safe integer.');
  }
  return {
    operation: input.operation,
    billingExecutionId: canonicalUuid(input.billingExecutionId, 'BillingExecution id'),
    messageDispatchId: canonicalUuid(input.messageDispatchId, 'MessageDispatch id'),
    receivableId: input.receivableId ? canonicalUuid(input.receivableId, 'Receivable id') : null,
    financialSetDigest: canonicalDigest(input.financialSetDigest, 'Billing financial set digest'),
    expectedVersion: input.expectedVersion,
    argumentsDigest: canonicalDigest(input.argumentsDigest, 'Billing arguments digest'),
  };
}

function canonicalUuid(value: string, label: string): string {
  const normalized = canonicalExactText(value, label).toLowerCase();
  if (!uuidPattern.test(normalized)) throw new Error(`${label} must be a canonical UUID.`);
  return normalized;
}

function canonicalDigest(value: string, label: string): string {
  const canonical = canonicalExactText(value, label);
  if (!sha256Pattern.test(canonical)) throw new Error(`${label} must be a SHA-256 hex digest.`);
  return canonical;
}

function canonicalNumeric12Scale2(
  value: Prisma.Decimal.Value,
  label: string,
): { decimal: Prisma.Decimal; canonical: string } {
  const source = Prisma.Decimal.isDecimal(value) ? value.toFixed() : String(value);
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(source)) {
    throw new Error(`${label} must be a plain decimal with at most two fractional digits.`);
  }
  const decimal = new Prisma.Decimal(source);
  if (!decimal.isFinite() || decimal.abs().gt('9999999999.99')) {
    throw new Error(`${label} exceeds PostgreSQL NUMERIC(12,2).`);
  }
  return { decimal, canonical: decimal.toFixed(2) };
}

function canonicalPrincipal(value: string, label: string): string {
  const normalized = canonicalRequiredText(value, label);
  if (Array.from(normalized).length > 255) {
    throw new Error(`${label} must contain at most 255 characters.`);
  }
  return normalized;
}

function canonicalRequiredText(value: string, label: string): string {
  const normalized = trimAsciiSpaces(canonicalExactText(value, label));
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function canonicalOptionalText(value: string | null, label: string): string | null {
  if (value === null) return null;
  const normalized = trimAsciiSpaces(canonicalExactText(value, label));
  return normalized || null;
}

function canonicalExactText(value: string, label: string): string {
  if (containsControlCharacters(value))
    throw new Error(`${label} contains forbidden control characters.`);
  if (value.normalize('NFC') !== value) throw new Error(`${label} must use NFC normalization.`);
  return value;
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function trimAsciiSpaces(value: string): string {
  return value.replace(/^ +| +$/gu, '');
}

function requireOwnFields(input: object, fields: readonly string[]): void {
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) {
      throw new Error(`Billing canonical payload field ${field} is missing.`);
    }
  }
}

function canonicalDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error('Billing due date must be YYYY-MM-DD.');
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year === 0 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]!) {
    throw new Error('Billing due date is not a real calendar date.');
  }
  return value;
}

function canonicalInstant(value: string, label: string): string {
  const canonical = canonicalExactText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(canonical)) {
    throw new Error(`${label} must be an ISO-8601 UTC instant with millisecond precision.`);
  }
  const parsed = new Date(canonical);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
    throw new Error(`${label} must be a valid canonical instant.`);
  }
  return canonical;
}
