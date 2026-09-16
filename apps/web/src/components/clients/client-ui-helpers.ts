import type { Client, ClientMessageDispatch, ClientReference, Receivable } from '../../lib/crm-api';
import { formatCurrency, formatDate } from '../../lib/crm-api';

export function clientInitial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || 'C';
}

export function clientReferenceCountLabel(count: number) {
  if (count === 0) return '0 referências';
  if (count === 1) return '1 referência';
  return `${count} referências`;
}

export function clientReferenceSummary(references: ClientReference[] = []) {
  const reference = references[0];
  if (references.length === 1 && reference) return reference.reference;
  return clientReferenceCountLabel(references.length);
}

export function clientPlanSummary(references: ClientReference[] = []) {
  const reference = references[0];
  if (!reference) return '-';
  if (references.length === 1) return reference.plan.name;
  return 'Vários';
}

export function clientNextDueSummary(references: ClientReference[] = []) {
  const reference = references[0];
  if (!reference) return '-';
  if (references.length === 1) return formatDate(reference.dueDate);
  return 'Vários';
}

export function clientOperationalSummary(references: ClientReference[] = []) {
  const reference = references[0];
  if (!reference) return '-';
  if (references.length === 1) {
    return `${formatCurrency(reference.recurringValue)} | ${formatDate(reference.dueDate)}`;
  }

  return 'Vários';
}

export function clientDisplayStatus(client: Client) {
  const references = client.references ?? [];
  const reference = references[0];
  return references.length === 1 && reference ? reference.status : client.status;
}

export function receivableVisualStatus(receivable: Pick<Receivable, 'displayStatus' | 'status'>) {
  return receivable.displayStatus === 'VENCIDO' ? 'VENCIDO' : receivable.status;
}

export function receivableStatusTone(receivable: Pick<Receivable, 'displayStatus' | 'status'>) {
  const status = receivableVisualStatus(receivable);
  if (status === 'PAGO') return 'success';
  if (status === 'CANCELADO') return 'danger';
  if (status === 'VENCIDO') return 'overdue';
  return 'warning';
}

export function clientReceivableTotals(receivables: Receivable[] = []) {
  return receivables.reduce(
    (totals, receivable) => {
      const amount = Number(receivable.amount);
      const status = receivableVisualStatus(receivable);

      if (status === 'PAGO') totals.paid += amount;
      else if (status === 'CANCELADO') totals.canceled += amount;
      else if (status === 'VENCIDO') totals.overdue += amount;
      else totals.pending += amount;

      return totals;
    },
    { canceled: 0, overdue: 0, paid: 0, pending: 0 },
  );
}

export function dispatchStatusTone(status: ClientMessageDispatch['status']) {
  if (status === 'SENT') return 'success';
  if (status === 'FAILED' || status === 'CANCELED') return 'danger';
  if (status === 'PROCESSING') return 'info';
  return 'warning';
}

export function isClientBillingDispatch(dispatch: Pick<ClientMessageDispatch, 'origin'>) {
  return dispatch.origin !== 'RECOVERY';
}

export function summarizeClientBillingDispatches(dispatches: ClientMessageDispatch[] = []) {
  return dispatches.filter(isClientBillingDispatch).reduce(
    (summary, dispatch) => {
      if (dispatch.status === 'SENT') summary.sent += 1;
      else if (dispatch.status === 'FAILED') summary.failed += 1;
      else summary.scheduled += 1;

      return summary;
    },
    { failed: 0, scheduled: 0, sent: 0 },
  );
}

export function dispatchReferenceSummary(referenceCount: number) {
  if (referenceCount === 0) return '-';
  if (referenceCount === 1) return '1 referência';
  return `${referenceCount} referências`;
}

export function dispatchReferenceSummaryFromDispatch(
  dispatch: Pick<ClientMessageDispatch, 'clientReference' | 'client' | 'itemCount' | 'items'>,
) {
  const count = dispatch.itemCount ?? dispatch.items?.length;

  if (count && count > 1) return `${count} referências`;
  if (count === 1)
    return dispatch.items?.[0]?.reference ?? dispatch.clientReference?.reference ?? '1 referência';

  return dispatch.clientReference?.reference ?? dispatch.client?.reference ?? '-';
}

export function dispatchTotalAmountLabel(
  dispatch: Pick<ClientMessageDispatch, 'totalAmount' | 'items'>,
) {
  const explicitTotal = dispatch.totalAmount;

  if (explicitTotal !== undefined && explicitTotal !== null) {
    return formatCurrency(explicitTotal);
  }

  if (dispatch.items?.length) {
    return formatCurrency(dispatch.items.reduce((total, item) => total + Number(item.amount), 0));
  }

  return '-';
}

export function referenceStatusRequiresReason(status: Client['status']) {
  return status === 'INATIVO' || status === 'CANCELADO';
}
