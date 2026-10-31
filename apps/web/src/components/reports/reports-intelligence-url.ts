import type { ReportsIntelligencePreset } from '../../lib/crm-api';

export const reportsIntelligenceSections = ['overview', 'finance', 'clients', 'renewals'] as const;

export type ReportsIntelligenceSection = (typeof reportsIntelligenceSections)[number];

export const reportsIntelligencePresets = [
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
] as const satisfies readonly ReportsIntelligencePreset[];

export type ReportsIntelligenceLocation = {
  section: ReportsIntelligenceSection;
  preset: ReportsIntelligencePreset;
  startDate?: string;
  endDate?: string;
};

const businessDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportsIntelligenceLocation(search: string): ReportsIntelligenceLocation {
  const params = new URLSearchParams(search);
  const requestedSection = params.get('section');
  const requestedPreset = params.get('period');
  const section = reportsIntelligenceSections.includes(
    requestedSection as ReportsIntelligenceSection,
  )
    ? (requestedSection as ReportsIntelligenceSection)
    : 'overview';
  const preset = reportsIntelligencePresets.includes(requestedPreset as ReportsIntelligencePreset)
    ? (requestedPreset as ReportsIntelligencePreset)
    : 'this_month';
  const startDate = params.get('startDate') ?? undefined;
  const endDate = params.get('endDate') ?? undefined;

  return {
    section,
    preset,
    ...(preset === 'custom' && startDate && businessDatePattern.test(startDate)
      ? { startDate }
      : {}),
    ...(preset === 'custom' && endDate && businessDatePattern.test(endDate) ? { endDate } : {}),
  };
}

export function buildReportsIntelligencePath(location: ReportsIntelligenceLocation) {
  const params = new URLSearchParams();
  if (location.section !== 'overview') params.set('section', location.section);
  if (location.preset !== 'this_month') params.set('period', location.preset);
  if (location.preset === 'custom' && location.startDate && location.endDate) {
    params.set('startDate', location.startDate);
    params.set('endDate', location.endDate);
  }

  const query = params.toString();
  return `/dashboard/relatorios${query ? `?${query}` : ''}`;
}

export function isValidCustomReportsPeriod(startDate?: string, endDate?: string) {
  return Boolean(
    startDate &&
    endDate &&
    businessDatePattern.test(startDate) &&
    businessDatePattern.test(endDate) &&
    startDate <= endDate,
  );
}
