import { describe, expect, it } from 'vitest';
import { resolveWhatsAppOutboundPhone } from './whatsapp-outbound-phone';

describe('resolveWhatsAppOutboundPhone', () => {
  it.each([
    ['US', '+14076390665', '14076390665'],
    ['CA', '+14165550123', '14165550123'],
    ['PT', '+351912345678', '351912345678'],
    ['GB', '+447911123456', '447911123456'],
    ['AR', '+5491123456789', '5491123456789'],
  ])(
    'allows proven %s identity for operational WhatsApp without a country flag',
    (_country, e164, digits) => {
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation: 'MANUAL_CONVERSATION_TEXT',
        }),
      ).toMatchObject({
        status: 'allowed',
        kind: 'INTERNATIONAL_MANUAL_TEXT_ALLOWED',
        digits,
        e164,
      });
    },
  );

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

  it('allows an international operational identity when legacy flags are disabled', () => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
        operation: 'MANUAL_CONVERSATION_TEXT',
      }),
    ).toMatchObject({
      status: 'allowed',
      kind: 'INTERNATIONAL_MANUAL_TEXT_ALLOWED',
      globalOperation: true,
    });
  });

  it.each([
    ['MANUAL_CONVERSATION_TEXT', 'globalManualTextEnabled', '+14076390665', '14076390665'],
    ['MANUAL_CONVERSATION_ACTION', 'globalMessageActionsEnabled', '+351912345678', '351912345678'],
    ['MANUAL_CONVERSATION_MEDIA', 'globalManualMediaEnabled', '+819012345678', '819012345678'],
    ['MANUAL_CONVERSATION_VOICE', 'globalManualVoiceEnabled', '+61412345678', '61412345678'],
  ] as const)(
    'authorizes %s globally without receiving a country allowlist',
    (operation, flag, e164, digits) => {
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation,
          [flag]: true,
        }),
      ).toMatchObject({ status: 'allowed', digits, e164, globalOperation: true });
    },
  );

  it.each([
    [false, false, 'allowed', true],
    [false, true, 'allowed', true],
    [true, false, 'allowed', true],
    [true, true, 'allowed', true],
  ] as const)(
    'keeps global=%s legacy=%s compatible without geographic authorization',
    (globalEnabled, legacyEnabled, status, globalOperation) => {
      const result = resolveWhatsAppOutboundPhone({
        phone: '+819012345678',
        phoneNormalized: '819012345678',
        phoneE164: '+819012345678',
        operation: 'MANUAL_CONVERSATION_TEXT',
        globalManualTextEnabled: globalEnabled,
        internationalManualTextEnabled: legacyEnabled,
      });

      expect(result.status).toBe(status);
      if (result.status === 'allowed') {
        expect(result.globalOperation === true).toBe(globalOperation);
      }
    },
  );

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
    'allows proven %s identity for a manual message action without a country flag',
    (_, e164, digits) => {
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation: 'MANUAL_CONVERSATION_ACTION',
          internationalManualTextEnabled: true,
        }),
      ).toMatchObject({
        status: 'allowed',
        kind: 'INTERNATIONAL_MANUAL_ACTION_ALLOWED',
        digits,
        e164,
      });
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation: 'MANUAL_CONVERSATION_ACTION',
          internationalMessageActionsEnabled: true,
        }),
      ).toMatchObject({
        status: 'allowed',
        kind: 'INTERNATIONAL_MANUAL_ACTION_ALLOWED',
        digits,
        e164,
      });
    },
  );

  it.each([
    ['US', '+14076390665', '14076390665'],
    ['CA', '+14165550123', '14165550123'],
    ['PT', '+351912345678', '351912345678'],
    ['GB', '+447911123456', '447911123456'],
    ['AR', '+5491123456789', '5491123456789'],
  ])('allows proven %s identity for manual PIX only with its own flag', (_, e164, digits) => {
    expect(
      resolveWhatsAppOutboundPhone({
        phone: e164,
        phoneNormalized: digits,
        phoneE164: e164,
        operation: 'MANUAL_PIX',
        internationalManualTextEnabled: true,
      }),
    ).toEqual({ status: 'blocked', reason: 'BLOCKED_FLAG_DISABLED' });
    expect(
      resolveWhatsAppOutboundPhone({
        phone: e164,
        phoneNormalized: digits,
        phoneE164: e164,
        operation: 'MANUAL_PIX',
        internationalManualPixEnabled: true,
      }),
    ).toEqual({ status: 'allowed', kind: 'INTERNATIONAL_MANUAL_PIX_ALLOWED', digits, e164 });
  });

  it.each([
    [
      'MANUAL_CONVERSATION_MEDIA',
      'internationalManualMediaEnabled',
      'INTERNATIONAL_MANUAL_MEDIA_ALLOWED',
    ],
    [
      'MANUAL_CONVERSATION_VOICE',
      'internationalManualVoiceEnabled',
      'INTERNATIONAL_MANUAL_VOICE_ALLOWED',
    ],
  ] as const)(
    'authorizes %s with canonical E.164 identity independently of legacy flags',
    (operation, flag, kind) => {
      const identity = {
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
        operation,
      };

      expect(resolveWhatsAppOutboundPhone(identity)).toMatchObject({
        status: 'allowed',
        kind,
        digits: '14076390665',
        e164: '+14076390665',
      });
      expect(resolveWhatsAppOutboundPhone({ ...identity, [flag]: true })).toMatchObject({
        status: 'allowed',
        kind,
        digits: '14076390665',
        e164: '+14076390665',
      });
      expect(
        resolveWhatsAppOutboundPhone({
          ...identity,
          phoneNormalized: '5514076390665',
          [flag]: true,
        }),
      ).toEqual({ status: 'blocked', reason: 'BLOCKED_MISMATCH' });
    },
  );

  it.each([
    ['Brasil', '+5511999991234', '5511999991234'],
    ['Estados Unidos', '+14155550100', '14155550100'],
    ['Portugal', '+351912345678', '351912345678'],
    ['Emirados Arabes', '+971501234567', '971501234567'],
  ])('applies the same operational policy to %s', (_country, e164, digits) => {
    for (const operation of [
      'MANUAL_CONVERSATION_TEXT',
      'MANUAL_CONVERSATION_ACTION',
      'MANUAL_CONVERSATION_MEDIA',
      'MANUAL_CONVERSATION_VOICE',
      'AUTO_REPLY',
    ] as const) {
      expect(
        resolveWhatsAppOutboundPhone({
          phone: e164,
          phoneNormalized: digits,
          phoneE164: e164,
          operation,
        }).status,
      ).toBe('allowed');
    }
  });
});
