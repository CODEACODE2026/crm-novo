import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberWithError,
} from 'libphonenumber-js';

export type PhoneNormalizationFailureReason =
  | 'COUNTRY_REQUIRED'
  | 'EMPTY'
  | 'INVALID_CHARACTERS'
  | 'INVALID_COUNTRY'
  | 'INVALID_PHONE'
  | 'LID_NOT_PHONE'
  | 'TOO_LONG'
  | 'TOO_SHORT';

export type ValidPhoneNormalization = {
  status: 'valid';
  original: string;
  e164: string;
  digits: string;
  countryCallingCode: string;
  country: CountryCode | null;
};

export type FailedPhoneNormalization = {
  status: 'invalid' | 'ambiguous';
  original: string;
  reason: PhoneNormalizationFailureReason;
};

export type PhoneNormalizationResult = ValidPhoneNormalization | FailedPhoneNormalization;

export type NormalizePhoneOptions = {
  defaultCountry?: CountryCode;
};

export type PhoneIdentityComparison =
  | { status: 'match'; reason: 'CANONICAL' | 'BRAZIL_MOBILE_ALIAS' }
  | { status: 'different'; reason: 'CANONICAL_MISMATCH' }
  | {
      status: 'unresolved';
      reason: PhoneNormalizationFailureReason;
      side: 'left' | 'right';
    };

const supportedCharacters = /^[+\d\s().-]+$/;
const maxPhoneInputLength = 128;

export function listSupportedPhoneCountries() {
  return getCountries().map((country) => ({
    country,
    callingCode: getCountryCallingCode(country),
  }));
}

export function normalizePhone(
  input: string,
  options: NormalizePhoneOptions = {},
): PhoneNormalizationResult {
  const original = input;
  const trimmed = input.trim();

  if (!trimmed) {
    return { status: 'invalid', original, reason: 'EMPTY' };
  }

  if (trimmed.length > maxPhoneInputLength) {
    return { status: 'invalid', original, reason: 'TOO_LONG' };
  }

  if (/@lid$/i.test(trimmed)) {
    return { status: 'invalid', original, reason: 'LID_NOT_PHONE' };
  }

  if (!supportedCharacters.test(trimmed)) {
    return { status: 'invalid', original, reason: 'INVALID_CHARACTERS' };
  }

  if (!/\d/.test(trimmed)) {
    return { status: 'invalid', original, reason: 'INVALID_PHONE' };
  }

  const explicitInternational = trimmed.startsWith('+');
  if (!explicitInternational && !options.defaultCountry) {
    return { status: 'ambiguous', original, reason: 'COUNTRY_REQUIRED' };
  }

  if (options.defaultCountry && !isSupportedCountry(options.defaultCountry)) {
    return { status: 'invalid', original, reason: 'INVALID_COUNTRY' };
  }

  const parseInput = prepareBrazilLegacyInput(trimmed, options.defaultCountry);

  try {
    const phone = parsePhoneNumberWithError(parseInput, options.defaultCountry);

    if (!phone.isValid()) {
      return { status: 'invalid', original, reason: 'INVALID_PHONE' };
    }

    return {
      status: 'valid',
      original,
      e164: phone.number,
      digits: phone.number.slice(1),
      countryCallingCode: phone.countryCallingCode,
      country: phone.country ?? null,
    };
  } catch (error) {
    return {
      status: 'invalid',
      original,
      reason: parseFailureReason(error),
    };
  }
}

export function comparePhoneIdentities(
  left: string,
  right: string,
  options: {
    leftCountry?: CountryCode;
    rightCountry?: CountryCode;
  } = {},
): PhoneIdentityComparison {
  const leftResult = normalizePhone(
    left,
    options.leftCountry ? { defaultCountry: options.leftCountry } : {},
  );
  if (leftResult.status !== 'valid') {
    return { status: 'unresolved', reason: leftResult.reason, side: 'left' };
  }

  const rightResult = normalizePhone(
    right,
    options.rightCountry ? { defaultCountry: options.rightCountry } : {},
  );
  if (rightResult.status !== 'valid') {
    return { status: 'unresolved', reason: rightResult.reason, side: 'right' };
  }

  if (leftResult.e164 === rightResult.e164) {
    return { status: 'match', reason: 'CANONICAL' };
  }

  if (
    isBrazilian(leftResult) &&
    isBrazilian(rightResult) &&
    brazilMobileAliases(leftResult.digits).has(rightResult.digits)
  ) {
    return { status: 'match', reason: 'BRAZIL_MOBILE_ALIAS' };
  }

  return { status: 'different', reason: 'CANONICAL_MISMATCH' };
}

function prepareBrazilLegacyInput(input: string, defaultCountry?: CountryCode) {
  const digits = input.replace(/\D/g, '');
  const explicitlyBrazilian = input.startsWith('+') && digits.startsWith('55');
  const contextuallyBrazilian = defaultCountry === 'BR' && !input.startsWith('+');

  if (!explicitlyBrazilian && !contextuallyBrazilian) {
    return input;
  }

  const withCountryCode =
    explicitlyBrazilian || (digits.startsWith('55') && [12, 13].includes(digits.length))
      ? digits
      : `55${digits}`;
  const national = withCountryCode.slice(2);

  if (national.length === 10 && national[2] === '9') {
    return `+55${national.slice(0, 2)}9${national.slice(2)}`;
  }

  return `+${withCountryCode}`;
}

function isBrazilian(phone: ValidPhoneNormalization) {
  return phone.country === 'BR' && phone.countryCallingCode === '55';
}

function brazilMobileAliases(digits: string) {
  const aliases = new Set([digits]);

  if (/^55\d{2}[6-9]\d{7}$/.test(digits)) {
    aliases.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
  }

  if (/^55\d{2}9[6-9]\d{7}$/.test(digits)) {
    aliases.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
  }

  return aliases;
}

function parseFailureReason(error: unknown): PhoneNormalizationFailureReason {
  const code = error instanceof Error ? error.message : '';

  if (code === 'INVALID_COUNTRY') return 'INVALID_COUNTRY';
  if (code === 'TOO_SHORT') return 'TOO_SHORT';
  if (code === 'TOO_LONG') return 'TOO_LONG';
  return 'INVALID_PHONE';
}
