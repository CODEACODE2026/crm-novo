import { describe, expect, it } from 'vitest';
import {
  APP_TIMEZONE,
  USER_ROLE_ADMIN,
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from './index';

describe('shared contracts', () => {
  it('keeps the operational timezone explicit', () => {
    expect(APP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('exposes the initial admin role', () => {
    expect(USER_ROLE_ADMIN).toBe('ADMIN');
  });

  it.each([
    ['2027-10-16', 1, 16, '2027-11-16'],
    ['2027-01-31', 1, 31, '2027-02-28'],
    ['2028-01-31', 1, 31, '2028-02-29'],
    ['2027-01-30', 1, 30, '2027-02-28'],
    ['2027-03-31', 1, 31, '2027-04-30'],
    ['2027-12-16', 1, 16, '2028-01-16'],
  ])('adds %i month(s) to %s with anchor %i as %s', (input, months, anchorDay, expected) => {
    const newDate = addCalendarMonthsPreservingAnchor(parseBusinessDate(input), months, anchorDay);

    expect(formatBusinessDate(newDate)).toBe(expected);
  });

  it('rejects invalid business dates and billing anchors', () => {
    expect(() => parseBusinessDate('2027-02-31')).toThrow(RangeError);
    expect(() => addCalendarMonthsPreservingAnchor(parseBusinessDate('2027-10-16'), 1, 32)).toThrow(
      RangeError,
    );
  });
});
