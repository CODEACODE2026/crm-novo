const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseBusinessDate(input: string) {
  if (!businessDatePattern.test(input)) {
    throw new RangeError('Business date must use YYYY-MM-DD.');
  }

  const date = new Date(`${input}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || formatBusinessDate(date) !== input) {
    throw new RangeError('Invalid business date.');
  }

  return date;
}

export function formatBusinessDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonthsPreservingAnchor(date: Date, months: number, anchorDay: number) {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError('Invalid month duration.');
  }

  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new RangeError('Invalid billing anchor day.');
  }

  const targetYear = date.getUTCFullYear();
  const targetMonthIndex = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);

  return new Date(Date.UTC(targetYear, targetMonthIndex, day));
}
