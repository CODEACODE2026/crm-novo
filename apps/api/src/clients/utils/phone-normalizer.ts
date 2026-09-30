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
