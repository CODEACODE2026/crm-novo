import type { PaymentIntentStatus, PaymentProviderCode, Prisma } from '@prisma/client';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderPix = {
  provider: PaymentProviderCode;
  providerTransactionId: string;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  status: PaymentIntentStatus;
  amount: Prisma.Decimal;
  pixCopyPaste: string;
  qrCodeData: string | null;
  expiresAt: Date;
};

export type PaymentProviderStatus = {
  provider: PaymentProviderCode;
  providerTransactionId: string;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  status: PaymentIntentStatus;
  paidAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type PaymentProviderTransaction = PaymentProviderStatus & {
  amount: Prisma.Decimal;
  pixCopyPaste: string | null;
  qrCodeData: string | null;
  expiresAt: Date | null;
};

export type CreatePixInput = {
  receivableId: string;
  amount: Prisma.Decimal;
  description: string;
  expiresAt: Date;
  clientName: string;
  payerPhone: string;
  notificationUrl: string | null;
};

export interface PaymentProvider {
  createPix(input: CreatePixInput): Promise<PaymentProviderPix>;
  getPixStatus(
    providerTransactionId: string,
    provider?: PaymentProviderCode,
  ): Promise<PaymentProviderStatus>;
  getPixTransaction?(
    providerTransactionId: string,
    provider?: PaymentProviderCode,
  ): Promise<PaymentProviderTransaction>;
  cancelPix?(
    providerTransactionId: string,
    provider?: PaymentProviderCode,
  ): Promise<PaymentProviderStatus>;
  expirePix?(providerTransactionId: string): Promise<PaymentProviderStatus>;
  markPixPaid?(providerTransactionId: string, paidAt?: Date): Promise<PaymentProviderStatus>;
  normalizeEvent?(event: unknown): PaymentProviderStatus | null;
}
