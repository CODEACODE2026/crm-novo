export const fastDepixSupportedWebhookEvents = [
  'transaction.created',
  'transaction.approved',
  'transaction.paid',
  'transaction.expired',
  'transaction.refunded',
] as const;

export const fastDepixSupportedWebhookEventSet = new Set<string>(fastDepixSupportedWebhookEvents);

// These are the remote transaction states already normalized by the existing
// FastDepix provider adapter. New states require an explicit contract update.
export const fastDepixSupportedTransactionStatuses = [
  'paid',
  'pending',
  'approved',
  'under_review',
  'expired',
  'canceled',
  'cancelled',
  'refunded',
  'failed',
  'error',
] as const;

export const fastDepixSupportedTransactionStatusSet = new Set<string>(
  fastDepixSupportedTransactionStatuses,
);
