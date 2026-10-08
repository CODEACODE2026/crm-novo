import { BadRequestException } from '@nestjs/common';

export function normalizeBrazilPhone(input: string) {
  const digits = input.replace(/\D/g, '');

  if (!digits) {
    throw new BadRequestException('Telefone e obrigatorio.');
  }

  const withCountryCode = digits.startsWith('55') ? digits : `55${digits}`;
  const national = withCountryCode.slice(2);
  const normalized =
    national.length === 10 && national[2] === '9'
      ? `55${national.slice(0, 2)}9${national.slice(2)}`
      : withCountryCode;

  if (!/^55\d{10,11}$/.test(normalized)) {
    throw new BadRequestException('Telefone invalido para o padrao Brasil.');
  }

  return normalized;
}

export function brazilLegacyMobileVariant(phoneNormalized: string) {
  const digits = phoneNormalized.replace(/\D/g, '');

  if (!/^55\d{10}$/.test(digits)) {
    return null;
  }

  const areaCode = digits.slice(2, 4);
  const subscriber = digits.slice(4);

  if (!/^[6-9]\d{7}$/.test(subscriber)) {
    return null;
  }

  return `55${areaCode}9${subscriber}`;
}

export function brazilCanonicalMobileToLegacyVariant(phoneNormalized: string) {
  const digits = phoneNormalized.replace(/\D/g, '');

  if (!/^55\d{11}$/.test(digits)) {
    return null;
  }

  const areaCode = digits.slice(2, 4);
  const subscriber = digits.slice(4);

  if (!/^9[6-9]\d{7}$/.test(subscriber)) {
    return null;
  }

  return `55${areaCode}${subscriber.slice(1)}`;
}
