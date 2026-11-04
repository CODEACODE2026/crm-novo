import type {
  PaymentIntentStatus,
  PaymentProviderCode,
  PaymentProviderEnvironment,
  Prisma,
} from '@prisma/client';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentProviderPix = {
  provider: PaymentProviderCode;
  providerEnvironment?: PaymentProviderEnvironment;
  providerTransactionId: string;
  externalReference?: string | null;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  status: PaymentIntentStatus;
  amount: Prisma.Decimal;
  pixCopyPaste: string;
  qrCodeData: string | null;
  expiresAt: Date;
  providerCredentialId?: string | null;
  providerCredentialFingerprint?: string | null;
  providerAccountIdHash?: string | null;
  providerApplicationId?: string | null;
  environmentProofExpiresAt?: Date | null;
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
  externalReference?: string | null;
  currency?: string | null;
  environment?: PaymentProviderEnvironment;
  paymentMethodId?: string | null;
  paymentMethodType?: string | null;
  liveMode?: boolean | null;
  paymentCount?: number;
  orderTotalAmount?: Prisma.Decimal | null;
  orderTotalPaidAmount?: Prisma.Decimal | null;
  countryCode?: string | null;
  orderStatus?: string | null;
  orderStatusDetail?: string | null;
  paymentStatus?: string | null;
  paymentStatusDetail?: string | null;
  providerCredentialId?: string | null;
  providerCredentialFingerprint?: string | null;
  providerAccountIdHash?: string | null;
  providerApplicationId?: string | null;
  environmentProofExpiresAt?: Date | null;
};

export type CreatePixInput = {
  receivableId: string;
  provider?: PaymentProviderCode;
  amount: Prisma.Decimal;
  description: string;
  expiresAt: Date;
  clientName: string;
  payerEmail?: string;
  payerPhone?: string;
  idempotencyKey?: string;
  externalReference?: string;
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
