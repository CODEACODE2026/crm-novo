import { PaymentProviderCode, Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildBillingPixCreationKey, canonicalBillingPixAmount } from './billing-pix-creation-key';

const base = {
  executionId: '11111111-1111-4111-8111-111111111111',
  provider: PaymentProviderCode.DEPIX,
  cycleKey: '2026-11',
  receivableSetHash: 'a'.repeat(64),
  totalAmount: '30.00',
};

describe('Billing PIX creation key', () => {
  it('is deterministic and independent from worker, retry and time', () => {
    expect(buildBillingPixCreationKey(base)).toBe(buildBillingPixCreationKey({ ...base }));
    expect(buildBillingPixCreationKey(base)).toMatch(/^bpx1:[0-9a-f]{64}$/u);
  });

  it.each([
    ['execution', { executionId: '22222222-2222-4222-8222-222222222222' }],
    ['provider', { provider: PaymentProviderCode.FASTPIX }],
    ['cycle', { cycleKey: '2026-12' }],
    ['financial set', { receivableSetHash: 'b'.repeat(64) }],
    ['amount', { totalAmount: '30.01' }],
  ])('changes when %s changes', (_label, change) => {
    expect(buildBillingPixCreationKey({ ...base, ...change })).not.toBe(
      buildBillingPixCreationKey(base),
    );
  });

  it.each([
    ['30.00', '30.00'],
    ['30.01', '30.01'],
    ['30.0000', '30.00'],
    ['30.0100', '30.01'],
    ['00030.00', '30.00'],
    ['9999999999.99', '9999999999.99'],
    ['0.00', '0.00'],
    ['-0.00', '0.00'],
  ])('canonicalizes valid monetary input %s', (input, expected) => {
    expect(canonicalBillingPixAmount(input)).toBe(expected);
    expect(canonicalBillingPixAmount(new Prisma.Decimal(input))).toBe(expected);
  });

  it.each([
    '30.001',
    '30.005',
    '0.001',
    '10000000000.00',
    '999999999999999999999.99',
    'NaN',
    'Infinity',
    '-Infinity',
    '1e3',
    '-0.01',
    ' 30.00',
    '30.00 ',
  ])('rejects invalid monetary string %s before hashing', (input) => {
    expect(() => buildBillingPixCreationKey({ ...base, totalAmount: input })).toThrow();
  });

  it.each([
    new Prisma.Decimal('30.001'),
    new Prisma.Decimal('30.005'),
    new Prisma.Decimal('0.001'),
    new Prisma.Decimal('10000000000.00'),
    new Prisma.Decimal('NaN'),
    new Prisma.Decimal('Infinity'),
    new Prisma.Decimal('-0.01'),
  ])('rejects invalid Prisma.Decimal %s before hashing', (input) => {
    expect(() => buildBillingPixCreationKey({ ...base, totalAmount: input })).toThrow();
  });

  it('rejects JavaScript numbers to avoid accepting already-rounded input', () => {
    expect(() => buildBillingPixCreationKey({ ...base, totalAmount: 30.001 })).toThrow(
      /decimal string or Prisma.Decimal/u,
    );
  });

  it('preserves valid keys while separating distinct cent values', () => {
    const canonical = buildBillingPixCreationKey(base);
    expect(canonical).toBe('bpx1:bc12d474330d2a66ff8359aa48caad58c25b6da6b81dbe4afea1f33cb8edcdbb');
    expect(buildBillingPixCreationKey({ ...base, totalAmount: new Prisma.Decimal('30.00') })).toBe(
      canonical,
    );
    expect(buildBillingPixCreationKey({ ...base, totalAmount: '030.000' })).toBe(canonical);
    expect(buildBillingPixCreationKey({ ...base, totalAmount: '-0.00' })).toBe(
      buildBillingPixCreationKey({ ...base, totalAmount: '0.00' }),
    );
    expect(buildBillingPixCreationKey({ ...base, totalAmount: '30.01' })).not.toBe(canonical);
  });
});
