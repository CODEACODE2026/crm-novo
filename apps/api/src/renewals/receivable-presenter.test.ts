import { describe, expect, it } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import {
  buildRenewalReceivableDescription,
  getReceivableDisplayStatus,
} from './receivable-presenter';

describe('receivable presenter', () => {
  it('builds a consistent renewal receivable description', () => {
    expect(buildRenewalReceivableDescription('Mensal')).toBe('Renovacao - Plano Mensal');
  });

  it('keeps pending receivables pending when due date is not overdue', () => {
    expect(
      getReceivableDisplayStatus(
        'PENDENTE',
        parseBusinessDate('2026-10-10'),
        parseBusinessDate('2026-10-10'),
      ),
    ).toBe('PENDENTE');
  });

  it('calculates overdue receivables without persisting VENCIDO', () => {
    expect(
      getReceivableDisplayStatus(
        'PENDENTE',
        parseBusinessDate('2026-10-10'),
        parseBusinessDate('2026-10-11'),
      ),
    ).toBe('VENCIDO');
  });

  it('does not mark paid or canceled receivables as overdue', () => {
    expect(
      getReceivableDisplayStatus(
        'PAGO',
        parseBusinessDate('2026-10-10'),
        parseBusinessDate('2026-10-11'),
      ),
    ).toBe('PAGO');
    expect(
      getReceivableDisplayStatus(
        'CANCELADO',
        parseBusinessDate('2026-10-10'),
        parseBusinessDate('2026-10-11'),
      ),
    ).toBe('CANCELADO');
  });
});
