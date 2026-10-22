import { comparePhoneIdentities, normalizePhone } from './phone-normalizer';

export type BrazilianOperationalPhoneInput = {
  phone?: string | null;
  phoneNormalized: string;
  phoneE164?: string | null;
};

export type BrazilianOperationalPhoneResult =
  | { status: 'valid'; digits: string; e164: string }
  | {
      status: 'blocked';
      reason: 'INTERNATIONAL_PHONE' | 'INVALID_PHONE' | 'PHONE_IDENTITY_MISMATCH';
    };

export function resolveBrazilianOperationalPhone(
  input: BrazilianOperationalPhoneInput,
): BrazilianOperationalPhoneResult {
  const canonical = input.phoneE164 ? normalizePhone(input.phoneE164) : null;

  if (canonical && canonical.status !== 'valid') {
    return { status: 'blocked', reason: 'INVALID_PHONE' };
  }

  if (canonical?.status === 'valid' && canonical.country !== 'BR') {
    return { status: 'blocked', reason: 'INTERNATIONAL_PHONE' };
  }

  const original = input.phone?.trim();
  const explicit = original?.startsWith('+') ? normalizePhone(original) : null;

  if (explicit && explicit.status !== 'valid') {
    return { status: 'blocked', reason: 'INVALID_PHONE' };
  }

  if (explicit?.status === 'valid' && explicit.country !== 'BR') {
    return { status: 'blocked', reason: 'INTERNATIONAL_PHONE' };
  }

  const legacy = normalizeLegacyBrazilianIdentity(input.phoneNormalized);

  if (legacy.status !== 'valid' || legacy.country !== 'BR') {
    return { status: 'blocked', reason: 'INVALID_PHONE' };
  }

  if (
    canonical?.status === 'valid' &&
    comparePhoneIdentities(canonical.e164, legacy.e164).status !== 'match'
  ) {
    return { status: 'blocked', reason: 'PHONE_IDENTITY_MISMATCH' };
  }

  if (explicit?.status === 'valid') {
    if (comparePhoneIdentities(explicit.e164, legacy.e164).status !== 'match') {
      return { status: 'blocked', reason: 'PHONE_IDENTITY_MISMATCH' };
    }

    if (
      canonical?.status === 'valid' &&
      comparePhoneIdentities(explicit.e164, canonical.e164).status !== 'match'
    ) {
      return { status: 'blocked', reason: 'PHONE_IDENTITY_MISMATCH' };
    }
  }

  return {
    status: 'valid',
    digits: legacy.digits,
    e164: canonical?.status === 'valid' ? canonical.e164 : legacy.e164,
  };
}

function normalizeLegacyBrazilianIdentity(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (digits.startsWith('55') && [12, 13].includes(digits.length)) {
    return normalizePhone(`+${digits}`);
  }

  return normalizePhone(trimmed, { defaultCountry: 'BR' });
}
