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

export function getBusinessDateDay(date: Date) {
  return date.getUTCDate();
}

export function addCalendarMonthsPreservingAnchor(date: Date, months: number, anchorDay: number) {
  if (!Number.isInteger(months) || months < 1) {
    throw new BadRequestException('Duracao do plano invalida.');
  }

  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new BadRequestException('Dia ancora de vencimento invalido.');
  }

  const targetYear = date.getUTCFullYear();
  const targetMonthIndex = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);

  return new Date(Date.UTC(targetYear, targetMonthIndex, day));
}
