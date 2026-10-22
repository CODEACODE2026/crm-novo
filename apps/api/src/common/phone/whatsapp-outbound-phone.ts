import { resolveBrazilianOperationalPhone } from './brazilian-operational-phone';
import { comparePhoneIdentities, normalizePhone } from './phone-normalizer';

export type WhatsAppOutboundOperation =
  'BR_OPERATIONAL' | 'MANUAL_CONVERSATION_TEXT' | 'MANUAL_CONVERSATION_ACTION';

export type WhatsAppOutboundPhoneInput = {
  phone?: string | null;
  phoneNormalized?: string | null;
  phoneE164?: string | null;
  operation: WhatsAppOutboundOperation;
  internationalManualTextEnabled?: boolean;
  internationalMessageActionsEnabled?: boolean;
};

export type WhatsAppOutboundPhoneResult =
  | {
      status: 'allowed';
      kind:
        | 'BR_OPERATIONAL'
        | 'INTERNATIONAL_MANUAL_TEXT_ALLOWED'
        | 'INTERNATIONAL_MANUAL_ACTION_ALLOWED';
      digits: string;
      e164: string;
    }
  | {
      status: 'blocked';
      reason:
        | 'BLOCKED_INVALID'
        | 'BLOCKED_MISSING'
        | 'BLOCKED_MISMATCH'
        | 'BLOCKED_LID'
        | 'BLOCKED_GROUP'
        | 'BLOCKED_FLAG_DISABLED'
        | 'BLOCKED_UNSUPPORTED_OPERATION';
    };

export function resolveWhatsAppOutboundPhone(
  input: WhatsAppOutboundPhoneInput,
): WhatsAppOutboundPhoneResult {
  const values = [input.phone, input.phoneNormalized, input.phoneE164]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim());

  if (values.some((value) => value.toLowerCase().endsWith('@lid'))) {
    return { status: 'blocked', reason: 'BLOCKED_LID' };
  }
  if (values.some((value) => value.toLowerCase().endsWith('@g.us'))) {
    return { status: 'blocked', reason: 'BLOCKED_GROUP' };
  }

  const canonical = input.phoneE164?.trim() ? normalizePhone(input.phoneE164) : null;
  if (canonical && canonical.status !== 'valid') {
    return { status: 'blocked', reason: 'BLOCKED_INVALID' };
  }

  if (canonical?.status === 'valid' && canonical.country !== 'BR') {
    const normalized = input.phoneNormalized?.trim() ?? '';
    if (!normalized) return { status: 'blocked', reason: 'BLOCKED_MISSING' };
    if (normalized !== canonical.digits) {
      return { status: 'blocked', reason: 'BLOCKED_MISMATCH' };
    }

    const original = input.phone?.trim();
    if (original) {
      const originalIdentity = normalizePhone(original.startsWith('+') ? original : `+${original}`);
      if (originalIdentity.status !== 'valid') {
        return { status: 'blocked', reason: 'BLOCKED_INVALID' };
      }
      if (comparePhoneIdentities(originalIdentity.e164, canonical.e164).status !== 'match') {
        return { status: 'blocked', reason: 'BLOCKED_MISMATCH' };
      }
    }

    if (input.operation === 'BR_OPERATIONAL') {
      return { status: 'blocked', reason: 'BLOCKED_UNSUPPORTED_OPERATION' };
    }
    const enabled =
      input.operation === 'MANUAL_CONVERSATION_TEXT'
        ? input.internationalManualTextEnabled
        : input.internationalMessageActionsEnabled;
    if (!enabled) {
      return { status: 'blocked', reason: 'BLOCKED_FLAG_DISABLED' };
    }

    return {
      status: 'allowed',
      kind:
        input.operation === 'MANUAL_CONVERSATION_TEXT'
          ? 'INTERNATIONAL_MANUAL_TEXT_ALLOWED'
          : 'INTERNATIONAL_MANUAL_ACTION_ALLOWED',
      digits: canonical.digits,
      e164: canonical.e164,
    };
  }

  if (!input.phoneNormalized?.trim()) {
    return { status: 'blocked', reason: 'BLOCKED_MISSING' };
  }

  if (!canonical && !hasSafeLegacyBrazilianShape(input.phoneNormalized)) {
    return { status: 'blocked', reason: 'BLOCKED_INVALID' };
  }

  const brazilian = resolveBrazilianOperationalPhone({
    phoneNormalized: input.phoneNormalized,
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.phoneE164 !== undefined ? { phoneE164: input.phoneE164 } : {}),
  });
  if (brazilian.status !== 'valid') {
    return {
      status: 'blocked',
      reason:
        brazilian.reason === 'PHONE_IDENTITY_MISMATCH' ? 'BLOCKED_MISMATCH' : 'BLOCKED_INVALID',
    };
  }

  return {
    status: 'allowed',
    kind: 'BR_OPERATIONAL',
    digits: brazilian.digits,
    e164: brazilian.e164,
  };
}

function hasSafeLegacyBrazilianShape(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  if (national.length === 11) return national[2] === '9';
  if (national.length === 10) return /^[2-9]$/.test(national[2] ?? '');
  return false;
}
