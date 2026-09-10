import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { formatBusinessDate, parseBusinessDate } from './business-date';

describe('business date helpers', () => {
  it('round-trips a due date without timezone day drift', () => {
    const dueDate = parseBusinessDate('2026-10-10');

    expect(formatBusinessDate(dueDate)).toBe('2026-10-10');
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseBusinessDate('2026-02-31')).toThrow(BadRequestException);
  });
});
