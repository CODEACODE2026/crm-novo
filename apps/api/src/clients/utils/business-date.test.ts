import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from './business-date';

describe('business date helpers', () => {
  it('round-trips a due date without timezone day drift', () => {
    const dueDate = parseBusinessDate('2026-10-10');

    expect(formatBusinessDate(dueDate)).toBe('2026-10-10');
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseBusinessDate('2026-02-31')).toThrow(BadRequestException);
  });

  it.each([
    ['2026-10-10', 1, 10, '2026-11-10'],
    ['2026-10-10', 2, 10, '2026-12-10'],
    ['2026-10-10', 3, 10, '2027-01-10'],
    ['2026-10-10', 6, 10, '2027-04-10'],
    ['2026-10-10', 12, 10, '2027-10-10'],
    ['2026-01-31', 1, 31, '2026-02-28'],
    ['2026-02-28', 1, 31, '2026-03-31'],
    ['2028-01-31', 1, 31, '2028-02-29'],
    ['2026-11-30', 3, 30, '2027-02-28'],
    ['2026-12-31', 1, 31, '2027-01-31'],
  ])('adds %i month(s) to %s with anchor %i as %s', (input, months, anchorDay, expected) => {
    const newDate = addCalendarMonthsPreservingAnchor(parseBusinessDate(input), months, anchorDay);

    expect(formatBusinessDate(newDate)).toBe(expected);
  });
});
