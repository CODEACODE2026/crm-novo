import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { reportingBucketKeys, resolveReportingPeriod } from './reporting-period';

const now = new Date('2026-10-31T12:00:00.000Z');

describe('reporting periods', () => {
  it.each([
    ['today', '2026-10-31', '2026-10-31', '2026-10-30', '2026-10-30'],
    ['last_7_days', '2026-10-25', '2026-10-31', '2026-10-18', '2026-10-24'],
    ['this_month', '2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30'],
    ['previous_month', '2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'],
    ['last_3_months', '2026-08-01', '2026-10-31', '2026-05-01', '2026-07-31'],
    ['this_year', '2026-01-01', '2026-10-31', '2025-01-01', '2025-10-31'],
    ['previous_year', '2025-01-01', '2025-12-31', '2024-01-01', '2024-12-31'],
  ] as const)(
    'resolves %s with its equivalent comparison',
    (preset, start, end, previousStart, previousEnd) => {
      const resolved = resolveReportingPeriod({ preset }, now);
      expect(resolved.period).toMatchObject({ startDate: start, endDate: end });
      expect(resolved.comparisonPeriod).toMatchObject({
        startDate: previousStart,
        endDate: previousEnd,
      });
    },
  );

  it('uses São Paulo midnight as an inclusive/exclusive UTC timestamp range', () => {
    const resolved = resolveReportingPeriod(
      { preset: 'custom', startDate: '2026-10-01', endDate: '2026-10-02' },
      now,
    );
    expect(resolved.period.startTimestamp.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(resolved.period.endExclusiveTimestamp.toISOString()).toBe('2026-10-03T03:00:00.000Z');
    expect(resolved.comparisonPeriod).toMatchObject({
      startDate: '2026-09-29',
      endDate: '2026-09-30',
    });
  });

  it('clamps leap-year comparison dates', () => {
    const resolved = resolveReportingPeriod(
      { preset: 'this_year' },
      new Date('2024-02-29T15:00:00.000Z'),
    );
    expect(resolved.comparisonPeriod.endDate).toBe('2023-02-28');
  });

  it('rejects incomplete, inverted, and preset-mixed custom periods', () => {
    expect(() =>
      resolveReportingPeriod({ preset: 'custom', startDate: '2026-10-01' }, now),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveReportingPeriod(
        { preset: 'custom', startDate: '2026-10-31', endDate: '2026-10-01' },
        now,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveReportingPeriod(
        { preset: 'today', startDate: '2026-10-31', endDate: '2026-10-31' },
        now,
      ),
    ).toThrow(BadRequestException);
  });

  it('fills every expected day and month bucket', () => {
    const daily = resolveReportingPeriod(
      { preset: 'custom', startDate: '2026-10-01', endDate: '2026-10-03' },
      now,
    );
    const monthly = resolveReportingPeriod({ preset: 'last_3_months' }, now);
    expect(reportingBucketKeys(daily.period, daily.granularity)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(reportingBucketKeys(monthly.period, monthly.granularity)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });
});
