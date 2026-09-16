import { describe, expect, it } from 'vitest';
import type { Client, ClientReference, Plan, Receivable } from '../../lib/crm-api';
import {
  clientDisplayStatus,
  clientInitial,
  clientNextDueSummary,
  clientOperationalSummary,
  clientPlanSummary,
  clientReceivableTotals,
  clientReferenceCountLabel,
  clientReferenceSummary,
  dispatchReferenceSummary,
  dispatchReferenceSummaryFromDispatch,
  dispatchStatusTone,
  dispatchTotalAmountLabel,
  isClientBillingDispatch,
  receivableStatusTone,
  receivableVisualStatus,
  referenceStatusRequiresReason,
  summarizeClientBillingDispatches,
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

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    amount: '100.00',
    canceledAt: null,
    clientId: 'client-1',
    clientReference: { id: 'reference-1', reference: 'REF-001', status: 'ATIVO' },
    clientReferenceId: 'reference-1',
    createdAt: '2026-09-01',
    description: 'Mensalidade',
    displayStatus: 'PENDENTE',
    dueDate: '2026-09-20',
    id: 'receivable-1',
    paidAt: null,
    paymentIntents: [],
    purpose: 'RENEWAL',
    renewalId: null,
    status: 'PENDENTE',
    updatedAt: '2026-09-01',
    ...overrides,
  };
}

function dispatch(
  overrides: Partial<Parameters<typeof isClientBillingDispatch>[0]> & {
    status?: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELED' | 'IGNORED';
  } = {},
) {
  return {
    attempts: 0,
    body: 'Mensagem',
    clientId: 'client-1',
    clientReferenceId: 'reference-1',
    createdAt: '2026-09-01',
    errorCode: null,
    errorMessage: null,
    id: `dispatch-${overrides.origin ?? 'BILLING'}-${overrides.status ?? 'SCHEDULED'}`,
    origin: 'BILLING' as const,
    phone: '554491665359',
    receivableId: 'receivable-1',
    renderedContent: null,
    scheduledFor: null,
    sentAt: null,
    status: 'SCHEDULED' as const,
    ...overrides,
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

  it('classifies receivable visual statuses and totals', () => {
    const pending = receivable({ amount: '100.00', displayStatus: 'PENDENTE', status: 'PENDENTE' });
    const paid = receivable({
      amount: '50.00',
      displayStatus: 'PAGO',
      id: 'receivable-2',
      status: 'PAGO',
    });
    const overdue = receivable({
      amount: '25.00',
      displayStatus: 'VENCIDO',
      id: 'receivable-3',
      status: 'PENDENTE',
    });
    const canceled = receivable({
      amount: '10.00',
      displayStatus: 'CANCELADO',
      id: 'receivable-4',
      status: 'CANCELADO',
    });

    expect(receivableVisualStatus(overdue)).toBe('VENCIDO');
    expect(receivableStatusTone(pending)).toBe('warning');
    expect(receivableStatusTone(paid)).toBe('success');
    expect(receivableStatusTone(overdue)).toBe('overdue');
    expect(receivableStatusTone(canceled)).toBe('danger');
    expect(clientReceivableTotals([pending, paid, overdue, canceled])).toEqual({
      canceled: 10,
      overdue: 25,
      paid: 50,
      pending: 100,
    });
  });

  it('summarizes consolidated billing references and dispatch tones', () => {
    expect(dispatchReferenceSummary(0)).toBe('-');
    expect(dispatchReferenceSummary(1)).toBe('1 referência');
    expect(dispatchReferenceSummary(3)).toBe('3 referências');
    expect(dispatchStatusTone('SENT')).toBe('success');
    expect(dispatchStatusTone('FAILED')).toBe('danger');
    expect(dispatchStatusTone('SCHEDULED')).toBe('warning');
  });

  it('keeps recovery out of the client billing dispatch scope', () => {
    expect(isClientBillingDispatch(dispatch({ origin: 'BILLING' }))).toBe(true);
    expect(isClientBillingDispatch(dispatch({ origin: 'MANUAL' }))).toBe(true);
    expect(isClientBillingDispatch(dispatch({ origin: 'INITIAL_ACTIVATION' }))).toBe(true);
    expect(isClientBillingDispatch(dispatch({ origin: 'RECOVERY' }))).toBe(false);

    expect(
      summarizeClientBillingDispatches([
        dispatch({ origin: 'BILLING', status: 'SCHEDULED' }),
        dispatch({ origin: 'BILLING', status: 'SENT' }),
        dispatch({ origin: 'MANUAL', status: 'FAILED' }),
        dispatch({ origin: 'RECOVERY', status: 'SCHEDULED' }),
        dispatch({ origin: 'RECOVERY', status: 'FAILED' }),
      ]),
    ).toEqual({ failed: 1, scheduled: 1, sent: 1 });
  });

  it('uses MessageDispatch item data for billing reference label and total', () => {
    const dispatch = {
      clientReference: { id: 'reference-a', reference: 'teste01', status: 'ATIVO' as const },
      itemCount: 3,
      items: [
        {
          amount: '30.00',
          clientReferenceId: 'reference-a',
          dueDate: '2026-09-15',
          id: 'item-a',
          receivableId: 'receivable-a',
          reference: 'teste01',
          status: 'PENDENTE' as const,
        },
        {
          amount: '30.00',
          clientReferenceId: 'reference-b',
          dueDate: '2026-09-15',
          id: 'item-b',
          receivableId: 'receivable-b',
          reference: 'teste02',
          status: 'PENDENTE' as const,
        },
        {
          amount: '30.00',
          clientReferenceId: 'reference-c',
          dueDate: '2026-09-15',
          id: 'item-c',
          receivableId: 'receivable-c',
          reference: 'teste03',
          status: 'PENDENTE' as const,
        },
      ],
      totalAmount: '90.00',
    };

    expect(dispatchReferenceSummaryFromDispatch(dispatch)).toBe('3 referências');
    expect(dispatchTotalAmountLabel(dispatch)).toMatch(/^R\$\s?90,00$/u);
  });

  it('does not invent a billing total from unrelated client receivables', () => {
    expect(dispatchTotalAmountLabel({})).toBe('-');
  });

  it('requires reason only for inactive and canceled reference status changes', () => {
    expect(referenceStatusRequiresReason('ATIVO')).toBe(false);
    expect(referenceStatusRequiresReason('PENDENTE_PAGAMENTO')).toBe(false);
    expect(referenceStatusRequiresReason('INATIVO')).toBe(true);
    expect(referenceStatusRequiresReason('CANCELADO')).toBe(true);
  });
});
