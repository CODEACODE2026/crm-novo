import type { Client, ClientReference } from '../../lib/crm-api';
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
