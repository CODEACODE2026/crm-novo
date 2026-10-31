import { describe, expect, it } from 'vitest';
import {
  buildReportsIntelligencePath,
  isValidCustomReportsPeriod,
  parseReportsIntelligenceLocation,
} from './reports-intelligence-url';

describe('reports intelligence URL state', () => {
  it('uses the canonical overview and current-month defaults', () => {
    expect(parseReportsIntelligenceLocation('')).toEqual({
      section: 'overview',
      preset: 'this_month',
    });
    expect(buildReportsIntelligencePath({ section: 'overview', preset: 'this_month' })).toBe(
      '/dashboard/relatorios',
    );
  });

  it('round-trips a custom period and an unfinished section', () => {
    const location = parseReportsIntelligenceLocation(
      '?section=finance&period=custom&startDate=2026-01-02&endDate=2026-02-03',
    );
    expect(location).toEqual({
      section: 'finance',
      preset: 'custom',
      startDate: '2026-01-02',
      endDate: '2026-02-03',
    });
    expect(buildReportsIntelligencePath(location)).toBe(
      '/dashboard/relatorios?section=finance&period=custom&startDate=2026-01-02&endDate=2026-02-03',
    );
  });

  it('rejects unknown URL values and invalid custom ranges', () => {
    expect(parseReportsIntelligenceLocation('?section=csv&period=future')).toEqual({
      section: 'overview',
      preset: 'this_month',
    });
    expect(isValidCustomReportsPeriod('2026-10-01', '2026-10-31')).toBe(true);
    expect(isValidCustomReportsPeriod('2026-10-31', '2026-10-01')).toBe(false);
    expect(isValidCustomReportsPeriod('31/10/2026', '2026-10-31')).toBe(false);
  });
});
