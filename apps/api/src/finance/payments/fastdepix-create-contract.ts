import type { FastDepixTransactionResponse } from './fastdepix-api.client';

export type FastDepixCreateRequest = {
  amount: number;
  user: { name: string };
  payer_phone: string;
  notification_url?: string;
};

export type FastDepixPaymentState =
  'WAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'REFUNDED' | 'FAILED';

export type FastDepixTransactionSnapshot = {
  providerTransactionId: string;
  state: FastDepixPaymentState;
  externalStatus: string | null;
  amount: string;
  externalDepixId?: string | null;
  blockchainTxId?: string | null;
  pixCopyPaste?: string | null;
  qrCodeData?: string | null;
  expiresAt: Date | null;
  paidAt: Date | null;
};

export type FastDepixTransactionLookupOutcome =
  | { kind: 'FOUND'; transaction: FastDepixTransactionSnapshot }
  | { kind: 'NOT_FOUND'; providerTransactionId: string }
  | {
      kind: 'REMOTE_RESULT_UNCERTAIN';
      providerTransactionId: string;
      code: string;
      message: string;
    };

export type FastDepixCreateOutcome =
  | {
      kind: 'CONFIRMED';
      requestDispatched: true;
      remoteEffect: 'CONFIRMED';
      automaticRetryEligible: false;
      providerTransactionId: string;
      response: FastDepixTransactionResponse;
    }
  | {
      kind: 'HTTP_REJECTION_OBSERVED';
      requestDispatched: true;
      remoteEffect: 'UNKNOWN';
      automaticRetryEligible: false;
      httpStatus: number;
      code: string;
      message: string;
    }
  | {
      kind: 'PRE_CALL_FAILURE';
      requestDispatched: false;
      remoteEffect: 'ABSENT_PROVEN';
      automaticRetryEligible: true;
      code: string;
      message: string;
    }
  | {
      kind: 'REMOTE_RESULT_UNCERTAIN';
      requestDispatched: true;
      remoteEffect: 'UNKNOWN';
      automaticRetryEligible: false;
      providerTransactionId: string | null;
      code: string;
      message: string;
      httpStatus: number | null;
    };

export const fastDepixObservedCreateRejectionStatuses = new Set([
  400, 401, 403, 404, 405, 415, 422,
]);

export function normalizeFastDepixProviderTransactionId(value: unknown) {
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}
