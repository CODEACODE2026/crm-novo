import { createHash } from 'node:crypto';

export interface BillingExecutionIdentityInput {
  clientId: string;
  cycleKey: string;
  receivables: readonly {
    id: string;
    amount: string | number;
    dueDate: string | Date;
  }[];
}

export interface BillingExecutionIdentity {
  executionKey: string;
  receivableSetHash: string;
  receivableIds: readonly string[];
}

export function buildBillingExecutionIdentity(
  input: BillingExecutionIdentityInput,
): BillingExecutionIdentity {
  const clientId = requireIdentityPart('clientId', input.clientId);
  const cycleKey = requireIdentityPart('cycleKey', input.cycleKey);
  const receivables = input.receivables.map((receivable) => ({
    id: requireIdentityPart('receivableId', receivable.id),
    amount: normalizeAmount(receivable.amount),
    dueDate: normalizeDueDate(receivable.dueDate),
  }));
  const receivableIds = receivables.map(({ id }) => id);

  if (receivableIds.length === 0) {
    throw new Error('Billing execution requires at least one receivableId.');
  }
  if (new Set(receivableIds).size !== receivableIds.length) {
    throw new Error('Billing execution receivableIds must be unique.');
  }

  receivables.sort((left, right) => left.id.localeCompare(right.id));
  receivableIds.sort((left, right) => left.localeCompare(right));
  const receivableSetHash = sha256(
    receivables.map(({ id, amount, dueDate }) => `${id}|${amount}|${dueDate}`).join('\n'),
  );
  const executionKey = `billing-execution:v2:${sha256(
    [clientId, cycleKey, receivableSetHash].join('\n'),
  )}`;

  return { executionKey, receivableSetHash, receivableIds };
}

function normalizeAmount(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Billing execution receivable amount must be positive.');
  }
  return amount.toFixed(2);
}

function normalizeDueDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Billing execution receivable dueDate is invalid.');
  }
  return date.toISOString().slice(0, 10);
}

function requireIdentityPart(label: string, value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Billing execution ${label} is required.`);
  return normalized;
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
