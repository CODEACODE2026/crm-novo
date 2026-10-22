import { describe, expect, it } from 'vitest';

import { resolveBrazilianOperationalPhone } from './brazilian-operational-phone';

describe('resolveBrazilianOperationalPhone', () => {
  it('preserves a canonical Brazilian identity', () => {
    expect(
      resolveBrazilianOperationalPhone({
        phone: '+55 (11) 99999-1234',
        phoneNormalized: '5511999991234',
        phoneE164: '+5511999991234',
      }),
    ).toEqual({ status: 'valid', digits: '5511999991234', e164: '+5511999991234' });
  });

  it('preserves a legacy Brazilian identity without canonical data', () => {
    expect(
      resolveBrazilianOperationalPhone({
        phone: '(11) 99999-1234',
        phoneNormalized: '5511999991234',
      }),
    ).toEqual({ status: 'valid', digits: '5511999991234', e164: '+5511999991234' });
  });

  it('accepts the isolated Brazilian eight and nine digit mobile alias', () => {
    expect(
      resolveBrazilianOperationalPhone({
        phone: '(11) 9821-2815',
        phoneNormalized: '551198212815',
        phoneE164: '+5511998212815',
      }),
    ).toEqual({ status: 'valid', digits: '5511998212815', e164: '+5511998212815' });
  });

  it.each(['+14076390665', '+351912345678', '+447911123456', '+5491123456789'])(
    'blocks an international canonical identity %s',
    (phoneE164) => {
      expect(
        resolveBrazilianOperationalPhone({
          phone: phoneE164,
          phoneNormalized: '5511999991234',
          phoneE164,
        }),
      ).toEqual({ status: 'blocked', reason: 'INTERNATIONAL_PHONE' });
    },
  );

  it('blocks the known legacy corruption signature instead of accepting fabricated 55', () => {
    expect(
      resolveBrazilianOperationalPhone({
        phone: '+1 (407) 639-0665',
        phoneNormalized: '5514076390665',
      }),
    ).toEqual({ status: 'blocked', reason: 'INTERNATIONAL_PHONE' });
  });

  it('blocks a mismatch between canonical and legacy identities', () => {
    expect(
      resolveBrazilianOperationalPhone({
        phone: '(11) 99999-1234',
        phoneNormalized: '5511999991234',
        phoneE164: '+5511988884321',
      }),
    ).toEqual({ status: 'blocked', reason: 'PHONE_IDENTITY_MISMATCH' });
  });

  it('blocks malformed legacy data without returning operational digits', () => {
    expect(resolveBrazilianOperationalPhone({ phone: 'invalid', phoneNormalized: '123' })).toEqual({
      status: 'blocked',
      reason: 'INVALID_PHONE',
    });
  });
});
