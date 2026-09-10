import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate } from './crm-api';

describe('CRM UI formatters', () => {
  it('formats business dates without timezone conversion', () => {
    expect(formatDate('2026-10-10')).toBe('10/10/2026');
  });

  it('formats BRL values', () => {
    expect(formatCurrency('50.00')).toContain('50,00');
  });
});
