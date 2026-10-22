import { describe, expect, it } from 'vitest';
import { resolveWhatsAppOutboundPhone } from './whatsapp-outbound-phone';

describe('resolveWhatsAppOutboundPhone', () => {
  it.each([
    ['US', '+14076390665', '14076390665'],
    ['CA', '+14165550123', '14165550123'],
    ['PT', '+351912345678', '351912345678'],
    ['GB', '+447911123456', '447911123456'],
    ['AR', '+5491123456789', '5491123456789'],
  ])('allows proven %s identity only for manual text with the flag', (_country, e164, digits) => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: e164,
        phoneNormalized: digits,
        phoneE164: e164,
        operation: 'MANUAL_CONVERSATION_TEXT',
        internationalManualTextEnabled: true,
      }),
    ).toEqual({ status: 'allowed', kind: 'INTERNATIONAL_MANUAL_TEXT_ALLOWED', digits, e164 });
  });

  it('keeps valid legacy Brazilian identities operational without phoneE164', () => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: '(11) 99999-1234',
        phoneNormalized: '11999991234',
        phoneE164: null,
        operation: 'BR_OPERATIONAL',
      }),
    ).toEqual({
      status: 'allowed',
      kind: 'BR_OPERATIONAL',
      digits: '5511999991234',
      e164: '+5511999991234',
    });
  });

  it.each([
    ['masked mobile', '(11) 99999-1234', '11999991234', '5511999991234'],
    ['legacy mobile without ninth digit', '(11) 9999-1234', '1199991234', '5511999991234'],
    ['landline', '(11) 3333-1234', '1133331234', '551133331234'],
    ['stored country code', '+55 (11) 99999-1234', '5511999991234', '5511999991234'],
  ])('keeps Brazilian %s operational', (_case, phone, phoneNormalized, digits) => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone,
        phoneNormalized,
        phoneE164: null,
        operation: 'BR_OPERATIONAL',
      }),
    ).toMatchObject({ status: 'allowed', kind: 'BR_OPERATIONAL', digits });
  });

  it.each([
    [{ phone: '+14076390665', phoneNormalized: '14076390665', phoneE164: null }, 'BLOCKED_INVALID'],
    [{ phone: '14076390665', phoneNormalized: '14076390665', phoneE164: null }, 'BLOCKED_INVALID'],
    [
      { phone: '+14076390665', phoneNormalized: '5514076390665', phoneE164: '+14076390665' },
      'BLOCKED_MISMATCH',
    ],
    [{ phone: '123@lid', phoneNormalized: '123@lid', phoneE164: null }, 'BLOCKED_LID'],
    [{ phone: '123@g.us', phoneNormalized: '123@g.us', phoneE164: null }, 'BLOCKED_GROUP'],
    [{ phone: 'not-a-phone', phoneNormalized: 'not-a-phone', phoneE164: null }, 'BLOCKED_INVALID'],
    [{ phone: '', phoneNormalized: '', phoneE164: null }, 'BLOCKED_MISSING'],
  ])('fails closed for unsafe identity %j', (identity, reason) => {
    expect(
      resolveWhatsAppOutboundPhone({ ...identity, operation: 'MANUAL_CONVERSATION_TEXT' }),
    ).toEqual({ status: 'blocked', reason });
  });

  it('does not allow an international identity when the flag is disabled', () => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
        operation: 'MANUAL_CONVERSATION_TEXT',
      }),
    ).toEqual({ status: 'blocked', reason: 'BLOCKED_FLAG_DISABLED' });
  });

  it('never authorizes international identities for BR-only operations', () => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
        operation: 'BR_OPERATIONAL',
        internationalManualTextEnabled: true,
      }),
    ).toEqual({ status: 'blocked', reason: 'BLOCKED_UNSUPPORTED_OPERATION' });
  });

  it.each([
    ['US', '+14076390665', '14076390665'],
    ['CA', '+14165550123', '14165550123'],
    ['PT', '+351912345678', '351912345678'],
    ['GB', '+447911123456', '447911123456'],
    ['AR', '+5491123456789', '5491123456789'],
  ])(
    'allows proven %s identity for a manual message action only with its own flag',
    (_, e164, digits) => {
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation: 'MANUAL_CONVERSATION_ACTION',
          internationalManualTextEnabled: true,
        }),
      ).toEqual({ status: 'blocked', reason: 'BLOCKED_FLAG_DISABLED' });
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation: 'MANUAL_CONVERSATION_ACTION',
          internationalMessageActionsEnabled: true,
        }),
      ).toEqual({
        status: 'allowed',
        kind: 'INTERNATIONAL_MANUAL_ACTION_ALLOWED',
        digits,
        e164,
      });
    },
  );
});
