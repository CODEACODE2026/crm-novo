import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import {
  MercadoPagoApiClient,
  type MercadoPagoOrderPayment,
  type MercadoPagoOrderResponse,
} from './mercado-pago-api.client';
import {
  PaymentProviderCredentialsService,
  type MercadoPagoCredentialAccess,
} from './payment-provider-credentials.service';
import type {
  CreatePixInput,
  PaymentProvider,
  PaymentProviderPix,
  PaymentProviderStatus,
  PaymentProviderTransaction,
} from './payment-provider';

@Injectable()
export class MercadoPagoPaymentProvider implements PaymentProvider {
  private static readonly MAX_QR_IMAGE_BYTES = 1_048_576;
  constructor(
    @Inject(MercadoPagoApiClient) private readonly apiClient: MercadoPagoApiClient,
    @Inject(PaymentProviderCredentialsService)
    private readonly credentials: PaymentProviderCredentialsService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async createPix(input: CreatePixInput): Promise<PaymentProviderPix> {
    this.assertEnabled();
    this.assertTestEnvironment();
    const email = this.requireEmail(input.payerEmail);
    const idempotencyKey = this.requireIdentifier(input.idempotencyKey, 'idempotencia', 128);
    const externalReference = this.requireExternalReference(input.externalReference);
    const access = await this.credentials.getActiveMercadoPagoAccess();
    const amount = input.amount.toFixed(2);
    const response = await this.apiClient.createOrder(access.token, idempotencyKey, {
      type: 'online',
      total_amount: amount,
      external_reference: externalReference,
      processing_mode: 'automatic',
      transactions: {
        payments: [
          {
            amount,
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: this.expirationDuration(input.expiresAt),
          },
        ],
      },
      payer: {
        email,
        ...(this.sandboxAproEnabled() ? { first_name: 'APRO' as const } : {}),
      },
    });

    if (response.external_reference?.trim() !== externalReference) {
      throw new BadGatewayException('Mercado Pago retornou referencia externa divergente.');
    }

    if (response.currency && response.currency !== 'BRL') {
      throw new BadGatewayException('Mercado Pago retornou moeda divergente da cobranca.');
    }

    const responsePaymentMethod = response.transactions?.payments?.[0]?.payment_method;
    if (responsePaymentMethod?.id !== 'pix' || responsePaymentMethod.type !== 'bank_transfer') {
      throw new BadGatewayException('Mercado Pago retornou meio de pagamento divergente.');
    }

    const transaction = this.normalizeOrder(response, input.expiresAt, access);

    if (!transaction.pixCopyPaste) {
      throw new BadGatewayException('Mercado Pago retornou order sem Pix Copia e Cola.');
    }

    if (!transaction.amount.equals(input.amount)) {
      throw new BadGatewayException('Mercado Pago retornou valor divergente da cobranca.');
    }

    return {
      provider: transaction.provider,
      providerEnvironment: transaction.environment ?? this.currentEnvironment(),
      providerTransactionId: transaction.providerTransactionId,
      externalReference: transaction.externalReference ?? null,
      externalStatus: transaction.externalStatus,
      externalDepixId: transaction.externalDepixId,
      blockchainTxId: transaction.blockchainTxId,
      status: transaction.status,
      amount: transaction.amount,
      pixCopyPaste: transaction.pixCopyPaste,
      qrCodeData: transaction.qrCodeData,
      expiresAt: transaction.expiresAt ?? input.expiresAt,
      providerCredentialId: transaction.providerCredentialId ?? null,
      providerCredentialFingerprint: transaction.providerCredentialFingerprint ?? null,
      providerAccountIdHash: transaction.providerAccountIdHash ?? null,
      providerApplicationId: transaction.providerApplicationId ?? null,
      environmentProofExpiresAt: transaction.environmentProofExpiresAt ?? null,
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
    this.assertEnabled();
    this.assertTestEnvironment();
    const orderId = this.requireIdentifier(providerTransactionId, 'order', 160);
    const access = await this.credentials.getActiveMercadoPagoAccess();
    const response = await this.apiClient.getOrder(access.token, orderId);
    return this.normalizeOrder(response, null, access);
  }

  private normalizeOrder(
    response: MercadoPagoOrderResponse,
    fallbackExpiresAt: Date | null,
    access: MercadoPagoCredentialAccess,
  ): PaymentProviderTransaction {
    const orderId = this.requireResponseIdentifier(response.id, 'order');
    const payment = response.transactions?.payments?.[0];
    const paymentId = this.requireResponseIdentifier(payment?.id, 'pagamento');
    const applicationId = this.requireResponseIdentifier(
      response.integration_data?.application_id,
      'aplicacao',
    );
    const status = this.normalizeStatus(response, payment);
    const amount = this.parseAmount(
      payment?.paid_amount ?? payment?.amount ?? response.total_amount,
    );
    const paidAt = status === 'PAID' ? this.parseDate(payment?.date_approved) : null;

    return {
      provider: 'MERCADO_PAGO',
      providerTransactionId: orderId,
      externalStatus: this.externalStatus(response.status, response.status_detail),
      externalDepixId: paymentId,
      blockchainTxId: null,
      status,
      amount,
      pixCopyPaste: payment?.payment_method?.qr_code?.trim() || null,
      qrCodeData: this.normalizeQrCodeData(payment?.payment_method?.qr_code_base64),
      expiresAt: this.parseExpiration(payment, response, fallbackExpiresAt),
      paidAt,
      failureCode: status === 'FAILED' ? response.status_detail?.trim() || 'failed' : null,
      failureMessage: null,
      externalReference: response.external_reference?.trim() || null,
      currency: response.currency?.trim() || response.currency_id?.trim() || null,
      environment: this.currentEnvironment(),
      paymentMethodId: payment?.payment_method?.id?.trim() || null,
      paymentMethodType: payment?.payment_method?.type?.trim() || null,
      liveMode: typeof response.live_mode === 'boolean' ? response.live_mode : null,
      paymentCount: response.transactions?.payments?.length ?? 0,
      orderTotalAmount:
        response.total_amount === undefined ? null : this.parseAmount(response.total_amount),
      orderTotalPaidAmount:
        response.total_paid_amount === undefined
          ? null
          : this.parseNonNegativeAmount(response.total_paid_amount),
      countryCode: response.country_code?.trim() || null,
      orderStatus: response.status?.trim() || null,
      orderStatusDetail: response.status_detail?.trim() || null,
      paymentStatus: payment?.status?.trim() || null,
      paymentStatusDetail: payment?.status_detail?.trim() || null,
      providerCredentialId: access.credentialId,
      providerCredentialFingerprint: access.credentialFingerprint,
      providerAccountIdHash: access.accountIdHash,
      providerApplicationId: applicationId,
      environmentProofExpiresAt: access.proofExpiresAt,
    };
  }

  private normalizeStatus(
    response: MercadoPagoOrderResponse,
    payment: MercadoPagoOrderPayment | undefined,
  ) {
    const normalizedStatus = response.status?.trim().toLowerCase();
    const normalizedDetail = response.status_detail?.trim().toLowerCase();
    const paymentStatus = payment?.status?.trim().toLowerCase();
    const paymentDetail = payment?.status_detail?.trim().toLowerCase();

    if (
      normalizedStatus === 'processed' &&
      normalizedDetail === 'accredited' &&
      paymentStatus === 'processed' &&
      paymentDetail === 'accredited'
    ) {
      return 'PAID';
    }
    if (
      normalizedStatus === 'action_required' ||
      normalizedStatus === 'processing' ||
      normalizedStatus === 'created'
    ) {
      return 'WAITING_PAYMENT';
    }
    if (normalizedDetail === 'expired') return 'EXPIRED';
    if (normalizedStatus === 'canceled') return 'CANCELED';
    if (normalizedStatus === 'refunded' || normalizedDetail === 'partially_refunded') {
      return 'REFUNDED';
    }
    if (normalizedStatus === 'failed' || normalizedStatus === 'charged_back') return 'FAILED';

    return 'WAITING_PAYMENT';
  }

  private parseAmount(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadGatewayException('Mercado Pago retornou order sem valor valido.');
    }

    try {
      const amount = new Prisma.Decimal(value);
      if (!amount.isPositive()) throw new Error('non-positive');
      return amount;
    } catch {
      throw new BadGatewayException('Mercado Pago retornou order sem valor valido.');
    }
  }

  private parseNonNegativeAmount(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadGatewayException('Mercado Pago retornou total pago invalido.');
    }

    try {
      const amount = new Prisma.Decimal(value);
      if (amount.isNegative()) throw new Error('negative');
      return amount;
    } catch {
      throw new BadGatewayException('Mercado Pago retornou total pago invalido.');
    }
  }

  private parseExpiration(
    payment: MercadoPagoOrderPayment | undefined,
    response: MercadoPagoOrderResponse,
    fallback: Date | null,
  ) {
    const direct = this.parseDate(payment?.expiration_time);
    if (direct) return direct;

    const durationMs = this.parseIsoDuration(payment?.expiration_time);
    const createdAt = this.parseDate(response.created_date);
    if (durationMs !== null && createdAt) return new Date(createdAt.getTime() + durationMs);

    return fallback;
  }

  private parseIsoDuration(value: string | undefined) {
    if (!value) return null;
    const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!match) return null;
    const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match;
    return (
      Number(days) * 86_400_000 +
      Number(hours) * 3_600_000 +
      Number(minutes) * 60_000 +
      Number(seconds) * 1_000
    );
  }

  private expirationDuration(expiresAt: Date) {
    const seconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
    if (seconds < 1_800 || seconds > 2_592_000) {
      throw new BadRequestException(
        'Vencimento Pix Mercado Pago deve ficar entre 30 minutos e 30 dias.',
      );
    }
    return `PT${seconds}S`;
  }

  private requireEmail(value: string | undefined) {
    const email = value?.trim();
    if (!email || !isEmail(email)) {
      throw new BadRequestException('E-mail valido e obrigatorio para gerar Pix Mercado Pago.');
    }
    return email;
  }

  private requireIdentifier(value: string | undefined, label: string, maxLength: number) {
    const normalized = value?.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(`Identificador de ${label} Mercado Pago invalido.`);
    }
    return normalized;
  }

  private requireExternalReference(value: string | undefined) {
    const normalized = value?.trim();
    if (!normalized || normalized.length > 64 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
      throw new BadRequestException('Referencia externa Mercado Pago invalida.');
    }
    return normalized;
  }

  private requireResponseIdentifier(value: unknown, label: string) {
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'string' && value.trim()) return value.trim();
    throw new BadGatewayException(`Mercado Pago retornou order sem ID de ${label}.`);
  }

  private externalStatus(status: string | undefined, detail: string | undefined) {
    const normalizedStatus = status?.trim() || 'unknown';
    const normalizedDetail = detail?.trim();
    return normalizedDetail ? `${normalizedStatus}/${normalizedDetail}` : normalizedStatus;
  }

  private parseDate(value: string | undefined) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeQrCodeData(value: string | undefined) {
    const normalized = value?.trim();
    if (!normalized) return null;

    const dataUriMatch = normalized.match(
      /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/i,
    );
    const declaredMime = dataUriMatch?.[1]?.toLowerCase();
    const encoded = dataUriMatch?.[2] ?? normalized;

    if (
      encoded.length > Math.ceil((MercadoPagoPaymentProvider.MAX_QR_IMAGE_BYTES * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) ||
      encoded.length % 4 !== 0
    ) {
      throw new BadGatewayException('Mercado Pago retornou QR Code em formato invalido.');
    }

    const image = Buffer.from(encoded, 'base64');
    const canonical = image.toString('base64');
    if (
      image.length === 0 ||
      image.length > MercadoPagoPaymentProvider.MAX_QR_IMAGE_BYTES ||
      canonical !== encoded
    ) {
      throw new BadGatewayException('Mercado Pago retornou QR Code em formato invalido.');
    }

    const detectedMime = this.detectQrImageMime(image);
    if (!detectedMime || (declaredMime && declaredMime !== detectedMime)) {
      throw new BadGatewayException('Mercado Pago retornou QR Code em formato invalido.');
    }

    return `data:${detectedMime};base64,${canonical}`;
  }

  private detectQrImageMime(image: Buffer): 'image/png' | 'image/jpeg' | null {
    if (
      image.length >= 24 &&
      image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
      image.subarray(12, 16).toString('ascii') === 'IHDR'
    ) {
      return 'image/png';
    }

    if (
      image.length >= 16 &&
      image[0] === 0xff &&
      image[1] === 0xd8 &&
      image[image.length - 2] === 0xff &&
      image[image.length - 1] === 0xd9
    ) {
      return 'image/jpeg';
    }

    return null;
  }

  private currentEnvironment() {
    return this.config.get<string>('MERCADO_PAGO_ENVIRONMENT') === 'PRODUCTION'
      ? ('PRODUCTION' as const)
      : ('TEST' as const);
  }

  private sandboxAproEnabled() {
    const enabled = this.config.get<string>('MERCADO_PAGO_SANDBOX_APRO_ENABLED') === 'true';
    if (!enabled) return false;

    if (this.currentEnvironment() !== 'TEST') {
      throw new ServiceUnavailableException(
        'Simulacao APRO do Mercado Pago e permitida somente no ambiente TEST.',
      );
    }

    return true;
  }

  private assertEnabled() {
    if (this.config.get<string>('MERCADO_PAGO_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('Mercado Pago esta desabilitado neste ambiente.');
    }
  }

  private assertTestEnvironment() {
    if (this.currentEnvironment() === 'PRODUCTION') {
      throw new ServiceUnavailableException(
        'Mercado Pago PRODUCTION permanece bloqueado ate homologacao separada.',
      );
    }
  }
}
