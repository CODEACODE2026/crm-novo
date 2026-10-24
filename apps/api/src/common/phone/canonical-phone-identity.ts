import type { CountryCode } from 'libphonenumber-js';
import { normalizePhone } from './phone-normalizer';

export type CanonicalPhoneIdentitySource =
  'PERSISTED_E164' | 'EXPLICIT_E164' | 'NATIONAL_WITH_COUNTRY';

export type CanonicalPhoneIdentityInput = {
  phone?: string | null;
  phoneNormalized?: string | null;
  phoneE164?: string | null;
  defaultCountry?: CountryCode;
};

export type CanonicalPhoneIdentityResult =
  | {
      status: 'valid';
      e164: string;
      digits: string;
      country: CountryCode;
      countryCallingCode: string;
      source: CanonicalPhoneIdentitySource;
    }
  | {
      status: 'blocked';
      reason:
        | 'GROUP_NOT_PHONE'
        | 'IDENTITY_MISMATCH'
        | 'INVALID_PHONE'
        | 'LID_NOT_PHONE'
        | 'MISSING_PHONE'
        | 'UNRECOGNIZED_COUNTRY';
    };

/**
 * Resolves one canonical global phone identity without applying operational policy.
 * Country is evidence about the number, never authorization for an operation.
 */
export function resolveCanonicalPhoneIdentity(
  input: CanonicalPhoneIdentityInput,
): CanonicalPhoneIdentityResult {
  const values = [input.phone, input.phoneNormalized, input.phoneE164]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.some((value) => value.toLowerCase().endsWith('@lid'))) {
    return { status: 'blocked', reason: 'LID_NOT_PHONE' };
  }
  if (values.some((value) => value.toLowerCase().endsWith('@g.us'))) {
    return { status: 'blocked', reason: 'GROUP_NOT_PHONE' };
  }

  const persistedE164 = input.phoneE164?.trim();
  const original = input.phone?.trim();
  const primary = persistedE164 || original;
  if (!primary) {
    return { status: 'blocked', reason: 'MISSING_PHONE' };
  }

  const canonical = normalizeCandidate(primary, input.defaultCountry);
  if (canonical.status !== 'valid') {
    return { status: 'blocked', reason: 'INVALID_PHONE' };
  }
  if (!canonical.country) {
    return { status: 'blocked', reason: 'UNRECOGNIZED_COUNTRY' };
  }

  const normalized = input.phoneNormalized?.trim();
  if (normalized && normalized !== canonical.digits) {
    return { status: 'blocked', reason: 'IDENTITY_MISMATCH' };
  }

  if (persistedE164 && original) {
    const originalIdentity = normalizeCandidate(
      original,
      input.defaultCountry ?? canonical.country,
    );
    if (originalIdentity.status !== 'valid' || originalIdentity.e164 !== canonical.e164) {
      return { status: 'blocked', reason: 'IDENTITY_MISMATCH' };
    }
  }

  return {
    status: 'valid',
    e164: canonical.e164,
    digits: canonical.digits,
    country: canonical.country,
    countryCallingCode: canonical.countryCallingCode,
    source: persistedE164
      ? 'PERSISTED_E164'
      : primary.startsWith('+')
        ? 'EXPLICIT_E164'
        : 'NATIONAL_WITH_COUNTRY',
  };
}

function normalizeCandidate(value: string, defaultCountry?: CountryCode) {
  return normalizePhone(value, value.startsWith('+') || !defaultCountry ? {} : { defaultCountry });
}
