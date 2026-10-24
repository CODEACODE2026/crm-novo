import { describe, expect, it } from 'vitest';
import { resolveCanonicalPhoneIdentity } from './canonical-phone-identity';

describe('resolveCanonicalPhoneIdentity', () => {
  it.each([
    ['BR', '+5511999991234', '5511999991234'],
    ['US', '+14076390665', '14076390665'],
    ['PT', '+351912345678', '351912345678'],
    ['JP', '+819012345678', '819012345678'],
  ] as const)(
    'resolves a canonical %s identity without changing its DDI',
    (country, e164, digits) => {
      expect(resolveCanonicalPhoneIdentity({ phone: e164 })).toMatchObject({
        status: 'valid',
        country,
        e164,
        digits,
        source: 'EXPLICIT_E164',
      });
    },
  );

  it('resolves a national number only with an explicit country context', () => {
    expect(
      resolveCanonicalPhoneIdentity({ phone: '407 639-0665', defaultCountry: 'US' }),
    ).toMatchObject({ status: 'valid', e164: '+14076390665', country: 'US' });
    expect(resolveCanonicalPhoneIdentity({ phone: '407 639-0665' })).toEqual({
      status: 'blocked',
      reason: 'INVALID_PHONE',
    });
  });

  it('rejects persisted identity divergence instead of matching by suffix', () => {
    expect(
      resolveCanonicalPhoneIdentity({
        phone: '+14076390665',
        phoneNormalized: '3514076390665',
        phoneE164: '+14076390665',
      }),
    ).toEqual({ status: 'blocked', reason: 'IDENTITY_MISMATCH' });
  });

  it.each([
    ['BR', '(11) 99999-1234', '5511999991234', '+5511999991234'],
    ['PT', '912 345 678', '351912345678', '+351912345678'],
  ] as const)(
    'validates a persisted %s E.164 identity against its national display value',
    (country, phone, phoneNormalized, phoneE164) => {
      expect(resolveCanonicalPhoneIdentity({ phone, phoneNormalized, phoneE164 })).toMatchObject({
        status: 'valid',
        country,
        e164: phoneE164,
        digits: phoneNormalized,
        source: 'PERSISTED_E164',
      });
    },
  );

  it('never fabricates DDI 55 for a foreign national number', () => {
    expect(
      resolveCanonicalPhoneIdentity({ phone: '912 345 678', defaultCountry: 'PT' }),
    ).toMatchObject({ status: 'valid', e164: '+351912345678', digits: '351912345678' });
  });

  it.each([
    ['5511999991234@lid', 'LID_NOT_PHONE'],
    ['5511999991234@g.us', 'GROUP_NOT_PHONE'],
  ] as const)('rejects non-phone WhatsApp identity %s', (phone, reason) => {
    expect(resolveCanonicalPhoneIdentity({ phone })).toEqual({ status: 'blocked', reason });
  });
});
