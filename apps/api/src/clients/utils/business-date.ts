import { BadRequestException } from '@nestjs/common';

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseBusinessDate(input: string) {
  if (!businessDatePattern.test(input)) {
    throw new BadRequestException('Data deve usar o formato YYYY-MM-DD.');
  }

  const date = new Date(`${input}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || formatBusinessDate(date) !== input) {
    throw new BadRequestException('Data invalida.');
  }

  return date;
}

export function formatBusinessDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
