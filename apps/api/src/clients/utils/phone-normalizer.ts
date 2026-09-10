import { BadRequestException } from '@nestjs/common';

export function normalizeBrazilPhone(input: string) {
  const digits = input.replace(/\D/g, '');

  if (!digits) {
    throw new BadRequestException('Telefone e obrigatorio.');
  }

  const normalized = digits.startsWith('55') ? digits : `55${digits}`;

  if (!/^55\d{10,11}$/.test(normalized)) {
    throw new BadRequestException('Telefone invalido para o padrao Brasil.');
  }

  return normalized;
}
