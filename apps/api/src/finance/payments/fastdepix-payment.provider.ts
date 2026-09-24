import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProviderCode, Prisma } from '@prisma/client';
import { FastDepixApiClient, type FastDepixTransactionResponse } from './fastdepix-api.client';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';
import type {
  CreatePixInput,
  PaymentProvider,
  PaymentProviderPix,
  PaymentProviderStatus,
  PaymentProviderTransaction,
} from './payment-provider';

abstract class BaseFastDepixPaymentProvider implements PaymentProvider {
  protected constructor(
    private readonly apiClient: FastDepixApiClient,
    private readonly credentials: PaymentProviderCredentialsService,
    private readonly providerCode: PaymentProviderCode,
  ) {}

  async createPix(input: CreatePixInput): Promise<PaymentProviderPix> {
    this.ensureWithinProviderLimit(input.amount);
    const token = await this.credentials.getActiveToken(this.providerCode);

    if (!token) {
      throw new NotFoundException('Credencial de pagamento nao configurada.');
    }

    const response = await this.apiClient.createTransaction(token, {
      amount: Number(input.amount.toFixed(2)),
      user: { name: input.clientName },
      payer_phone: input.payerPhone,
      ...(input.notificationUrl ? { notification_url: input.notificationUrl } : {}),
    });
    const providerTransactionId = this.normalizeProviderTransactionId(response.id);
    const pixCopyPaste = response.qr_code_text;

    if (!pixCopyPaste) {
      throw new BadRequestException('Resposta da API de pagamentos sem dados PIX obrigatorios.');
    }

    return {
      provider: this.providerCode,
      providerTransactionId,
      externalStatus: response.status ?? null,
      externalDepixId: response.depix_transaction_id ?? null,
      blockchainTxId: response.blockchain_tx_id ?? null,
      status: this.normalizeStatus(response.status),
      amount: new Prisma.Decimal(response.amount ?? input.amount),
      pixCopyPaste,
      qrCodeData: response.qr_code ?? null,
      expiresAt: this.parseExpiration(response, input.expiresAt) ?? input.expiresAt,
    };
  }

  async getPixStatus(providerTransactionId: string): Promise<PaymentProviderStatus> {
    const transaction = await this.getPixTransaction(providerTransactionId);

    return {
      provider: transaction.provider,
      providerTransactionId: transaction.providerTransactionId,
      externalStatus: transaction.externalStatus,
      externalDepixId: transaction.externalDepixId,
      blockchainTxId: transaction.blockchainTxId,
      status: transaction.status,
      paidAt: transaction.paidAt,
      failureCode: transaction.failureCode,
      failureMessage: transaction.failureMessage,
    };
  }

  async getPixTransaction(providerTransactionId: string): Promise<PaymentProviderTransaction> {
    const token = await this.credentials.getActiveToken(this.providerCode);

    if (!token) {
      throw new NotFoundException('Credencial de pagamento nao configurada.');
    }

    const response = await this.apiClient.getTransaction(token, providerTransactionId);
    const normalizedStatus = this.normalizeStatus(response.status);

    return {
      provider: this.providerCode,
      providerTransactionId: this.normalizeProviderTransactionId(
        response.id ?? providerTransactionId,
      ),
      externalStatus: response.status ?? null,
      externalDepixId: response.depix_transaction_id ?? null,
      blockchainTxId: response.blockchain_tx_id ?? null,
      status: normalizedStatus,
      amount: new Prisma.Decimal(response.amount ?? 0),
      pixCopyPaste: response.qr_code_text ?? null,
      qrCodeData: response.qr_code ?? null,
      expiresAt: this.parseExpiration(response, null),
      paidAt: normalizedStatus === 'PAID' ? (this.parseDate(response.paid_at) ?? new Date()) : null,
      failureCode: null,
      failureMessage: null,
    };
  }

  async cancelPix(providerTransactionId: string): Promise<PaymentProviderStatus> {
    const token = await this.credentials.getActiveToken(this.providerCode);

    if (!token) {
      throw new NotFoundException('Credencial de pagamento nao configurada.');
    }

    const response = await this.apiClient.cancelTransaction(token, providerTransactionId);

    return {
      provider: this.providerCode,
      providerTransactionId,
      externalStatus: response.status ?? 'cancelled',
      externalDepixId: response.depix_transaction_id ?? null,
      blockchainTxId: response.blockchain_tx_id ?? null,
      status: 'CANCELED',
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    };
  }

  private normalizeStatus(status: string | undefined) {
    const normalized = status?.trim().toLowerCase();

    if (normalized === 'paid') {
      return 'PAID';
    }

    if (normalized === 'pending' || normalized === 'approved' || normalized === 'under_review') {
      return 'WAITING_PAYMENT';
    }
    if (normalized === 'expired') return 'EXPIRED';
    if (normalized === 'canceled' || normalized === 'cancelled') return 'CANCELED';
    if (normalized === 'refunded') return 'REFUNDED';
    if (normalized === 'failed' || normalized === 'error') return 'FAILED';

    return 'WAITING_PAYMENT';
  }

  private normalizeProviderTransactionId(value: unknown) {
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized) return normalized;
    }

    throw new BadRequestException('Resposta da API de pagamentos sem transacao obrigatoria.');
  }

  private parseExpiration(response: FastDepixTransactionResponse, fallback: Date | null) {
    const value = response.qr_code_expires_at;

    if (!value) return fallback;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
  }

  private parseDate(value: string | undefined) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private ensureWithinProviderLimit(amount: Prisma.Decimal) {
    if (this.providerCode === 'FASTFLOW' && amount.gt(new Prisma.Decimal(5000))) {
      throw new BadRequestException('FastFlow permite no maximo R$ 5.000 por transacao.');
    }
  }
}

@Injectable()
export class FastFlowPaymentProvider extends BaseFastDepixPaymentProvider {
  constructor(
    @Inject(FastDepixApiClient) apiClient: FastDepixApiClient,
    @Inject(PaymentProviderCredentialsService) credentials: PaymentProviderCredentialsService,
  ) {
    super(apiClient, credentials, 'FASTFLOW');
  }
}

@Injectable()
export class FastPayPaymentProvider extends BaseFastDepixPaymentProvider {
  constructor(
    @Inject(FastDepixApiClient) apiClient: FastDepixApiClient,
    @Inject(PaymentProviderCredentialsService) credentials: PaymentProviderCredentialsService,
  ) {
    super(apiClient, credentials, 'FASTPAY');
  }
}
