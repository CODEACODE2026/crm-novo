import type {
  Client,
  ClientMessageDispatch,
  ClientReference,
  ClientStatus,
  MessageDispatch,
  Receivable,
} from '../../lib/crm-api';
import { formatCurrency, formatDate } from '../../lib/crm-api';

type BillingDispatchLike = ClientMessageDispatch | MessageDispatch;

export type ClientReferenceStatusSummaryItem =
  | {
      count: number;
      label: string;
      status: ClientStatus;
      tone: 'success' | 'warning' | 'info' | 'danger';
    }
  | {
      count: 0;
      label: 'Sem referências';
      status: null;
      tone: 'muted';
    };

const referenceStatusOrder: ClientStatus[] = [
  'ATIVO',
  'PENDENTE_PAGAMENTO',
  'INATIVO',
  'CANCELADO',
];

const referenceStatusSummaryLabels = {
  ATIVO: {
    multiple: 'ativas',
    single: 'ATIVO',
    singular: 'ativa',
    tone: 'success',
  },
  PENDENTE_PAGAMENTO: {
    multiple: 'pendentes',
    single: 'PENDENTE',
    singular: 'pendente',
    tone: 'warning',
  },
  INATIVO: {
    multiple: 'inativas',
    single: 'INATIVO',
    singular: 'inativa',
    tone: 'info',
  },
  CANCELADO: {
    multiple: 'canceladas',
    single: 'CANCELADO',
    singular: 'cancelada',
    tone: 'danger',
  },
} satisfies Record<
  ClientStatus,
  {
    multiple: string;
    single: string;
    singular: string;
    tone: Exclude<ClientReferenceStatusSummaryItem['tone'], 'muted'>;
  }
>;

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

export function clientReferenceStatusSummary(
  client: Pick<Client, 'references'>,
): ClientReferenceStatusSummaryItem[] {
  const references = client.references ?? [];

  if (!references.length) {
    return [{ count: 0, label: 'Sem referências', status: null, tone: 'muted' }];
  }

  if (references.length === 1 && references[0]) {
    const status = references[0].status;
    const metadata = referenceStatusSummaryLabels[status];

    return [{ count: 1, label: metadata.single, status, tone: metadata.tone }];
  }

  const counts = references.reduce(
    (summary, reference) => {
      summary[reference.status] += 1;
      return summary;
    },
    {
      ATIVO: 0,
      CANCELADO: 0,
      INATIVO: 0,
      PENDENTE_PAGAMENTO: 0,
    } satisfies Record<ClientStatus, number>,
  );

  return referenceStatusOrder
    .filter((status) => counts[status] > 0)
    .map((status) => {
      const count = counts[status];
      const metadata = referenceStatusSummaryLabels[status];
      const label = `${count} ${count === 1 ? metadata.singular : metadata.multiple}`;

      return { count, label, status, tone: metadata.tone };
    });
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

export function dispatchStatusTone(status: BillingDispatchLike['status']) {
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
  dispatch: Pick<BillingDispatchLike, 'clientReference' | 'client' | 'itemCount' | 'items'>,
) {
  const count = dispatch.itemCount ?? dispatch.items?.length;

  if (count && count > 1) return `${count} referências`;
  if (count === 1)
    return dispatch.items?.[0]?.reference ?? dispatch.clientReference?.reference ?? '1 referência';

  return dispatch.clientReference?.reference ?? dispatch.client?.reference ?? '-';
}

export function dispatchTotalAmountLabel(
  dispatch: Pick<BillingDispatchLike, 'totalAmount' | 'items'>,
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
