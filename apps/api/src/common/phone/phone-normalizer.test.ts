import { describe, expect, it } from 'vitest';
import { comparePhoneIdentities, normalizePhone } from './phone-normalizer';

describe('normalizePhone', () => {
  it.each([
    ['+1 (407) 639-0665', '+14076390665', '1', 'US'],
    ['+351 912 345 678', '+351912345678', '351', 'PT'],
    ['+44 20 7946 0958', '+442079460958', '44', 'GB'],
    ['+54 9 11 5555-3934', '+5491155553934', '54', 'AR'],
    ['+1 416 555 0100', '+14165550100', '1', 'CA'],
  ])('normalizes explicit international phone %s', (input, e164, callingCode, country) => {
    expect(normalizePhone(input)).toEqual({
      status: 'valid',
      original: input,
      e164,
      digits: e164.slice(1),
      countryCallingCode: callingCode,
      country,
    });
  });

  it.each([
    ['+55 (11) 3333-2222', '+551133332222'],
    ['(11) 99999-1234', '+5511999991234'],
    ['11 9999-1234', '+5511999991234'],
    ['55 11 99999-1234', '+5511999991234'],
  ])('normalizes Brazilian phone %s with explicit evidence', (input, e164) => {
    const result = normalizePhone(input, { defaultCountry: 'BR' });
    expect(result).toMatchObject({ status: 'valid', e164, country: 'BR' });
  });

  it('does not apply the Brazilian ninth digit rule to foreign phones', () => {
    expect(normalizePhone('+1 407 999 1234')).toMatchObject({
      status: 'valid',
      e164: '+14079991234',
      country: 'US',
    });
  });

  it('uses an explicit country for a national number', () => {
    expect(normalizePhone('407 639-0665', { defaultCountry: 'US' })).toMatchObject({
      status: 'valid',
      e164: '+14076390665',
      country: 'US',
    });
  });

  it('does not override an explicit international country with the default country', () => {
    expect(normalizePhone('+1 (407) 639-0665', { defaultCountry: 'BR' })).toMatchObject({
      status: 'valid',
      e164: '+14076390665',
      country: 'US',
    });
  });

  it('rejects a national number that is incompatible with the selected country', () => {
    expect(normalizePhone('12345', { defaultCountry: 'BR' })).toMatchObject({
      status: 'invalid',
      reason: 'INVALID_PHONE',
    });
  });

  it('does not fabricate an ISO country when the numbering plan cannot determine one', () => {
    expect(normalizePhone('+800 1234 5678')).toMatchObject({
      status: 'valid',
      e164: '+80012345678',
      countryCallingCode: '800',
      country: null,
    });
  });

  it.each(['14076390665', '4076390665', '11 99999-1234', '001 407 639 0665'])(
    'keeps national or prefix-ambiguous input unresolved: %s',
    (input) => {
      expect(normalizePhone(input)).toEqual({
        status: 'ambiguous',
        original: input,
        reason: 'COUNTRY_REQUIRED',
      });
    },
  );

  it('does not assume that 00 is an international prefix when a country is supplied', () => {
    expect(normalizePhone('001 407 639 0665', { defaultCountry: 'US' })).toMatchObject({
      status: 'invalid',
    });
  });

  it.each([
    ['', 'EMPTY'],
    ['abc', 'INVALID_CHARACTERS'],
    ['+1 CALL NOW', 'INVALID_CHARACTERS'],
    ['＋１ ４０７ ６３９ ０６６５', 'INVALID_CHARACTERS'],
    ['()', 'INVALID_PHONE'],
    ['---', 'INVALID_PHONE'],
    ['123456789@lid', 'LID_NOT_PHONE'],
    ['+1', 'TOO_SHORT'],
    ['+999 123456789', 'INVALID_COUNTRY'],
    ['+14076390665123456789', 'TOO_LONG'],
  ] as const)('returns a safe failure for %j', (input, reason) => {
    expect(normalizePhone(input)).toEqual({ status: 'invalid', original: input, reason });
  });

  it('rejects oversized input before parsing it', () => {
    const input = '1'.repeat(129);
    expect(normalizePhone(input, { defaultCountry: 'US' })).toEqual({
      status: 'invalid',
      original: input,
      reason: 'TOO_LONG',
    });
  });

  it('preserves the original input without logging or rewriting it in failures', () => {
    const input = '  +1 (407) 639-0665  ';
    expect(normalizePhone(input)).toMatchObject({ status: 'valid', original: input });
  });
});

describe('comparePhoneIdentities', () => {
  it('matches equal canonical identities across formatting differences', () => {
    expect(comparePhoneIdentities('+1 (407) 639-0665', '+14076390665')).toEqual({
      status: 'match',
      reason: 'CANONICAL',
    });
  });

  it('matches Brazilian legacy and canonical mobile aliases only with Brazilian evidence', () => {
    expect(comparePhoneIdentities('+55 11 9999-1234', '+55 11 99999-1234')).toEqual({
      status: 'match',
      reason: 'CANONICAL',
    });

    expect(comparePhoneIdentities('+55 11 8888-1234', '+55 11 98888-1234')).toEqual({
      status: 'match',
      reason: 'BRAZIL_MOBILE_ALIAS',
    });
  });

  it('does not match different countries by suffix', () => {
    expect(comparePhoneIdentities('+1 202 555 0123', '+44 20 7555 0123')).toEqual({
      status: 'different',
      reason: 'CANONICAL_MISMATCH',
    });
  });

  it('does not apply Brazilian aliases to foreign phones', () => {
    expect(comparePhoneIdentities('+1 407 888 1234', '+1 407 9888 1234')).not.toMatchObject({
      status: 'match',
    });
  });

  it('does not positively match ambiguous input', () => {
    expect(comparePhoneIdentities('4076390665', '+1 407 639-0665')).toEqual({
      status: 'unresolved',
      side: 'left',
      reason: 'COUNTRY_REQUIRED',
    });
  });

  it('keeps LID and invalid identities unresolved', () => {
    expect(comparePhoneIdentities('123456789@lid', '+1 407 639-0665')).toEqual({
      status: 'unresolved',
      side: 'left',
      reason: 'LID_NOT_PHONE',
    });
    expect(comparePhoneIdentities('+1', '+1 407 639-0665')).toEqual({
      status: 'unresolved',
      side: 'left',
      reason: 'TOO_SHORT',
    });
  });

  it('compares national inputs only when both countries are explicit', () => {
    expect(
      comparePhoneIdentities('407 639-0665', '4076390665', {
        leftCountry: 'US',
        rightCountry: 'US',
      }),
    ).toEqual({ status: 'match', reason: 'CANONICAL' });
  });
});
