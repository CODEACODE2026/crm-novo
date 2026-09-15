import { describe, expect, it } from 'vitest';
import type { Client, ClientReference, Plan } from '../../lib/crm-api';
import {
  clientDisplayStatus,
  clientInitial,
  clientNextDueSummary,
  clientOperationalSummary,
  clientPlanSummary,
  clientReferenceCountLabel,
  clientReferenceSummary,
} from './client-ui-helpers';

const plan: Plan = {
  active: true,
  defaultValue: '100.00',
  durationMonths: 1,
  id: 'plan-1',
  name: 'Mensal',
};

function reference(overrides: Partial<ClientReference> = {}): ClientReference {
  return {
    billingAnchorDay: 10,
    billingNoticeDays: 5,
    canceledAt: null,
    canceledByUserId: null,
    cancellationReason: null,
    clientId: 'client-1',
    createdAt: '2026-09-01',
    dueDate: '2026-09-20',
    id: 'reference-1',
    inactivatedAt: null,
    inactivatedByUserId: null,
    inactivationReason: null,
    notes: null,
    plan,
    planId: plan.id,
    recurringValue: '100.00',
    reference: 'REF-001',
    status: 'ATIVO',
    updatedAt: '2026-09-01',
    ...overrides,
  };
}

function client(references: ClientReference[] = []): Client {
  return {
    billingNoticeDays: 5,
    createdAt: '2026-09-01',
    dueDate: '2026-09-20',
    email: null,
    id: 'client-1',
    name: 'Atualiza',
    notes: null,
    phone: '554491665359',
    phoneNormalized: '554491665359',
    plan,
    planId: plan.id,
    recurringValue: '100.00',
    reference: 'LEGACY',
    references,
    status: 'PENDENTE_PAGAMENTO',
    updatedAt: '2026-09-01',
  };
}

describe('client UI helpers', () => {
  it('formats compact client initials', () => {
    expect(clientInitial('Atualiza')).toBe('A');
    expect(clientInitial('')).toBe('C');
  });

  it('keeps zero references explicit', () => {
    expect(clientReferenceCountLabel(0)).toBe('0 referências');
    expect(clientReferenceSummary([])).toBe('0 referências');
    expect(clientPlanSummary([])).toBe('-');
    expect(clientNextDueSummary([])).toBe('-');
    expect(clientOperationalSummary([])).toBe('-');
  });

  it('shows plan and due date only for one reference', () => {
    const refs = [reference()];

    expect(clientReferenceSummary(refs)).toBe('REF-001');
    expect(clientPlanSummary(refs)).toBe('Mensal');
    expect(clientNextDueSummary(refs)).toBe('20/09/2026');
    expect(clientOperationalSummary(refs)).toMatch(/^R\$\s?100,00 \| 20\/09\/2026$/u);
    expect(clientDisplayStatus(client(refs))).toBe('ATIVO');
  });

  it('uses safe summaries for multiple references', () => {
    const refs = [
      reference({ id: 'reference-1', reference: 'REF-001' }),
      reference({ id: 'reference-2', reference: 'REF-002', status: 'INATIVO' }),
      reference({ id: 'reference-3', reference: 'REF-003', status: 'CANCELADO' }),
    ];

    expect(clientReferenceSummary(refs)).toBe('3 referências');
    expect(clientPlanSummary(refs)).toBe('Vários');
    expect(clientNextDueSummary(refs)).toBe('Vários');
    expect(clientOperationalSummary(refs)).toBe('Vários');
    expect(clientDisplayStatus(client(refs))).toBe('PENDENTE_PAGAMENTO');
  });
});
