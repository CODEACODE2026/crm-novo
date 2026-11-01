import { BadRequestException } from '@nestjs/common';

export const reportingTimeZone = 'America/Sao_Paulo';

export const reportingPeriodPresets = [
  'today',
  'last_7_days',
  'this_month',
  'previous_month',
  'last_3_months',
  'last_6_months',
  'last_12_months',
  'this_year',
  'previous_year',
  'custom',
] as const;

export type ReportingPeriodPreset = (typeof reportingPeriodPresets)[number];
export type ReportingGranularity = 'day' | 'month' | 'year';

export type ReportingDateRange = {
  startDate: string;
  endDate: string;
  startTimestamp: Date;
  endExclusiveTimestamp: Date;
};

export type ResolvedReportingPeriod = {
  preset: ReportingPeriodPreset;
  timezone: typeof reportingTimeZone;
  period: ReportingDateRange;
  comparisonPeriod: ReportingDateRange;
  granularity: ReportingGranularity;
};

type ResolveReportingPeriodInput = {
  preset?: ReportingPeriodPreset;
  startDate?: string;
  endDate?: string;
};

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function resolveReportingPeriod(
  input: ResolveReportingPeriodInput,
  now = new Date(),
): ResolvedReportingPeriod {
  const preset = input.preset ?? 'this_month';
  const today = dateInTimeZone(now);
  let startDate: string;
  let endDate: string;
  let comparisonStart: string;
  let comparisonEnd: string;

  if (preset !== 'custom' && (input.startDate || input.endDate)) {
    throw new BadRequestException('startDate e endDate são permitidos apenas com preset=custom.');
  }

  if (preset === 'custom') {
    if (!input.startDate || !input.endDate) {
      throw new BadRequestException('Informe startDate e endDate para o período personalizado.');
    }
    startDate = parseBusinessDate(input.startDate);
    endDate = parseBusinessDate(input.endDate);
    assertOrdered(startDate, endDate);
    const days = daysInclusive(startDate, endDate);
    comparisonEnd = addDays(startDate, -1);
    comparisonStart = addDays(comparisonEnd, -(days - 1));
  } else if (preset === 'today') {
    startDate = today;
    endDate = today;
    comparisonStart = addDays(today, -1);
    comparisonEnd = comparisonStart;
  } else if (preset === 'last_7_days') {
    startDate = addDays(today, -6);
    endDate = today;
    comparisonEnd = addDays(startDate, -1);
    comparisonStart = addDays(comparisonEnd, -6);
  } else if (preset === 'this_month') {
    startDate = monthStart(today);
    endDate = today;
    comparisonStart = monthStart(addMonths(startDate, -1));
    comparisonEnd = minDate(addMonths(endDate, -1), monthEnd(comparisonStart));
  } else if (preset === 'previous_month') {
    endDate = addDays(monthStart(today), -1);
    startDate = monthStart(endDate);
    comparisonEnd = addDays(startDate, -1);
    comparisonStart = monthStart(comparisonEnd);
  } else if (preset === 'this_year') {
    startDate = `${today.slice(0, 4)}-01-01`;
    endDate = today;
    comparisonStart = `${Number(today.slice(0, 4)) - 1}-01-01`;
    comparisonEnd = addYearsClamped(endDate, -1);
  } else if (preset === 'previous_year') {
    const year = Number(today.slice(0, 4)) - 1;
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    comparisonStart = `${year - 1}-01-01`;
    comparisonEnd = `${year - 1}-12-31`;
  } else {
    const months = preset === 'last_3_months' ? 3 : preset === 'last_6_months' ? 6 : 12;
    startDate = monthStart(addMonths(today, -(months - 1)));
    endDate = today;
    comparisonEnd = addDays(startDate, -1);
    comparisonStart = monthStart(addMonths(comparisonEnd, -(months - 1)));
  }

  const days = daysInclusive(startDate, endDate);
  const granularity: ReportingGranularity = days <= 31 ? 'day' : days <= 730 ? 'month' : 'year';

  return {
    preset,
    timezone: reportingTimeZone,
    period: toRange(startDate, endDate),
    comparisonPeriod: toRange(comparisonStart, comparisonEnd),
    granularity,
  };
}

export function reportingBucketKeys(range: ReportingDateRange, granularity: ReportingGranularity) {
  const keys: string[] = [];
  let cursor = range.startDate;

  while (cursor <= range.endDate) {
    const key =
      granularity === 'day'
        ? cursor
        : granularity === 'month'
          ? cursor.slice(0, 7)
          : cursor.slice(0, 4);
    if (keys.at(-1) !== key) keys.push(key);
    cursor =
      granularity === 'day'
        ? addDays(cursor, 1)
        : granularity === 'month'
          ? monthStart(addMonths(cursor, 1))
          : addYearsClamped(`${cursor.slice(0, 4)}-01-01`, 1);
  }

  return keys;
}

export function reportingBucketKey(date: Date | string, granularity: ReportingGranularity) {
  const value =
    typeof date === 'string'
      ? parseBusinessDate(date.slice(0, 10))
      : date.toISOString().slice(0, 10);
  return granularity === 'day'
    ? value
    : granularity === 'month'
      ? value.slice(0, 7)
      : value.slice(0, 4);
}

function toRange(startDate: string, endDate: string): ReportingDateRange {
  return {
    startDate,
    endDate,
    startTimestamp: zonedStart(startDate),
    endExclusiveTimestamp: zonedStart(addDays(endDate, 1)),
  };
}

function dateInTimeZone(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: reportingTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  if (!year || !month || !day)
    throw new BadRequestException('Não foi possível resolver a data atual.');
  return `${year}-${month}-${day}`;
}

function zonedStart(date: string) {
  const [year, month, day] = parseBusinessDate(date).split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new BadRequestException('Data inválida.');
  }
  const localAsUtc = Date.UTC(year, month - 1, day);
  let candidate = localAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const next = localAsUtc - zoneOffsetMs(new Date(candidate));
    if (next === candidate) break;
    candidate = next;
  }

  return new Date(candidate);
}

function zoneOffsetMs(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: reportingTimeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  const represented = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return represented - value.getTime();
}

function parseBusinessDate(value: string) {
  if (!businessDatePattern.test(value)) throw new BadRequestException('Data deve usar YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Data inválida.');
  }
  return value;
}

function assertOrdered(startDate: string, endDate: string) {
  if (startDate > endDate)
    throw new BadRequestException('startDate deve ser menor ou igual a endDate.');
}

function addDays(value: string, days: number) {
  const date = new Date(`${parseBusinessDate(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number) {
  const date = new Date(`${parseBusinessDate(value)}T00:00:00.000Z`);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, lastDay));
  return date.toISOString().slice(0, 10);
}

function addYearsClamped(value: string, years: number) {
  const date = new Date(`${parseBusinessDate(value)}T00:00:00.000Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years, month, 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(Number(value.slice(8, 10)), lastDay));
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  return `${parseBusinessDate(value).slice(0, 7)}-01`;
}

function monthEnd(value: string) {
  const start = new Date(`${monthStart(value)}T00:00:00.000Z`);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

function minDate(left: string, right: string) {
  return left < right ? left : right;
}

function daysInclusive(startDate: string, endDate: string) {
  assertOrdered(startDate, endDate);
  return (
    Math.round(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}
