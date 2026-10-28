import { Prisma, type PaymentProviderCode } from '@prisma/client';
import { createHash } from 'node:crypto';
import { canonicalBillingActorValue } from './billing-actor-attestation.service';

export const billingPixCreationKeyVersion = 'billing-pix-creation:v1';
export const billingPixExpirationPolicyVersion = 'billing-pix-expiration:v1';

export function canonicalBillingPixAmount(value: Prisma.Decimal.Value): string {
  if (!Prisma.Decimal.isDecimal(value) && typeof value !== 'string') {
    throw new Error('Billing PIX amount must be provided as a decimal string or Prisma.Decimal.');
  }

  const source = Prisma.Decimal.isDecimal(value) ? value.toFixed() : value;
  if (!/^-?\d+(?:\.\d+)?$/u.test(source)) {
    throw new Error('Billing PIX amount must use plain decimal notation.');
  }

  const decimal = new Prisma.Decimal(source);
  if (!decimal.isFinite() || decimal.abs().gt('9999999999.99')) {
    throw new Error('Billing PIX amount exceeds PostgreSQL NUMERIC(12,2).');
  }
  if (decimal.decimalPlaces() > 2) {
    throw new Error('Billing PIX amount must be exactly representable in cents.');
  }
  if (decimal.isNegative() && !decimal.isZero()) {
    throw new Error('Billing PIX amount cannot be negative.');
  }

  return decimal.isZero() ? '0.00' : decimal.toFixed(2);
}

export function buildBillingPixCreationKey(input: {
  executionId: string;
  provider: PaymentProviderCode;
  cycleKey: string;
  receivableSetHash: string;
  totalAmount: Prisma.Decimal.Value;
}) {
  const total = canonicalBillingPixAmount(input.totalAmount);
  const payload = [
    canonicalBillingActorValue('V', billingPixCreationKeyVersion),
    canonicalBillingActorValue('U', input.executionId),
    canonicalBillingActorValue('E', input.provider),
    canonicalBillingActorValue('S', input.cycleKey),
    canonicalBillingActorValue('H', input.receivableSetHash),
    canonicalBillingActorValue('M', total),
    canonicalBillingActorValue('V', billingPixExpirationPolicyVersion),
  ].join('');

  return `bpx1:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}
