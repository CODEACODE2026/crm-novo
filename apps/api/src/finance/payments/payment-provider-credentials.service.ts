import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import {
  PaymentProviderCode,
  PaymentProviderEnvironment,
  type PaymentProviderCredential,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenEncryptionService } from '../../whatsapp/security/token-encryption.service';
import {
  SavePaymentProviderCredentialDto,
  SavePaymentProviderWhatsAppPixSettingsDto,
  SavePaymentWebhookSecretDto,
} from '../dto/save-payment-provider-credential.dto';
import {
  FastDepixApiClient,
  type FastDepixWebhookRegistrationResponse,
} from './fastdepix-api.client';
import { MercadoPagoApiClient } from './mercado-pago-api.client';

const configurableProviders = [
  'FASTFLOW',
  'FASTPIX',
  'FASTPAY',
  'MERCADO_PAGO',
] satisfies PaymentProviderCode[];
const defaultPixProviders = ['FASTFLOW', 'FASTPAY'] satisfies PaymentProviderCode[];
const supportedWebhookEvents = [
  'transaction.created',
  'transaction.approved',
  'transaction.paid',
  'transaction.expired',
  'transaction.refunded',
] as const;

export type MercadoPagoCredentialAccess = {
  token: string;
  credentialId: string;
  environment: PaymentProviderEnvironment;
  credentialFingerprint: string;
  accountIdHash: string;
  proofExpiresAt: Date;
};

@Injectable()
export class PaymentProviderCredentialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(FastDepixApiClient) private readonly apiClient: FastDepixApiClient,
    @Inject(MercadoPagoApiClient) private readonly mercadoPagoApiClient: MercadoPagoApiClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async list() {
    const [credentials, whatsappPixSettings] = await Promise.all([
      this.prisma.paymentProviderCredential.findMany({
        where: { provider: { in: [...configurableProviders] } },
        orderBy: [{ provider: 'asc' }, { active: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.paymentProviderWhatsAppPixSettings.findMany({
        where: { provider: { in: [...configurableProviders] } },
      }),
    ]);

    return configurableProviders.map((provider) => {
      const environment =
        provider === 'MERCADO_PAGO'
          ? this.currentMercadoPagoEnvironment()
          : PaymentProviderEnvironment.PRODUCTION;
      const credential = credentials.find(
        (item) =>
          item.provider === provider &&
          item.active &&
          (provider !== 'MERCADO_PAGO' || item.environment === environment),
      );
      const whatsappPixSetting = whatsappPixSettings.find(
        (item) => item.provider === provider && item.environment === environment,
      );
      return credential
        ? this.present(credential, whatsappPixSetting?.merchantName ?? null)
        : {
            provider,
            ...(provider === 'MERCADO_PAGO' ? { environment } : {}),
            whatsappPixMerchantName: whatsappPixSetting?.merchantName ?? null,
            configured: false,
            status:
              provider === 'MERCADO_PAGO' && !this.mercadoPagoEnabled()
                ? 'DESABILITADO'
                : 'NAO_CONFIGURADO',
          };
    });
  }

  async saveWhatsAppPixSettings(
    provider: PaymentProviderCode,
    dto: SavePaymentProviderWhatsAppPixSettingsDto,
    actorUserId: string,
  ) {
    this.ensureConfigurableProvider(provider);
    const environment = this.resolveCredentialEnvironment(provider, dto.environment);
    const merchantName = dto.merchantName.trim();
    if (merchantName.length < 2 || merchantName.length > 25) {
      throw new BadRequestException('Nome do recebedor PIX no WhatsApp invalido.');
    }

    const settings = await this.prisma.paymentProviderWhatsAppPixSettings.upsert({
      where: { provider_environment: { provider, environment } },
      create: { provider, environment, merchantName, updatedByUserId: actorUserId },
      update: { merchantName, updatedByUserId: actorUserId },
    });

    return {
      provider: settings.provider,
      environment: settings.environment,
      merchantName: settings.merchantName,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async save(dto: SavePaymentProviderCredentialDto) {
    this.ensureConfigurableProvider(dto.provider);
    const environment = this.resolveCredentialEnvironment(dto.provider, dto.environment);
    this.ensureMercadoPagoProductionBlocked(dto.provider, environment);
    const trimmedToken = dto.token.trim();
    const validation = await this.validateTokenForProvider(dto.provider, trimmedToken, environment);

    await this.prisma.paymentProviderCredential.updateMany({
      where: { provider: dto.provider, environment, active: true, companyId: null },
      data: { active: false },
    });

    const credential = await this.prisma.paymentProviderCredential.create({
      data: {
        provider: dto.provider,
        environment,
        name: dto.name.trim(),
        tokenEncrypted: this.encryption.encrypt(trimmedToken),
        tokenLastFour: trimmedToken.slice(-4),
        active: true,
        defaultForPix: this.canBeDefaultForPix(dto.provider) && !(await this.hasDefaultProvider()),
        validatedAt: new Date(),
        lastValidationStatus:
          validation.mercadoPagoProof?.status === 'VERIFIED_TEST'
            ? 'VALIDO_AMBIENTE_TEST'
            : (validation.mercadoPagoProof?.status ?? 'VALIDO'),
        ...(validation.mercadoPagoProof
          ? {
              environmentProofStatus: validation.mercadoPagoProof.status,
              environmentProofEnvironment: validation.mercadoPagoProof.environment,
              environmentProofAccountIdHash: validation.mercadoPagoProof.accountIdHash,
              environmentProofCredentialFingerprint:
                validation.mercadoPagoProof.credentialFingerprint,
              environmentProofVerifiedAt: validation.mercadoPagoProof.verifiedAt,
              environmentProofExpiresAt: validation.mercadoPagoProof.expiresAt,
            }
          : {}),
        companyId: null,
      },
    });

    return {
      ...this.present(credential),
      providerLabel: validation.provider_label ?? null,
      partner: validation.parceiro ?? null,
    };
  }

  async test(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    if (provider === 'MERCADO_PAGO') {
      this.ensureMercadoPagoProductionBlocked(provider, this.currentMercadoPagoEnvironment());
    }
    const credential = await this.getActiveCredential(provider);
    const token = this.encryption.decrypt(credential.tokenEncrypted);
    const validation = await this.validateTokenForProvider(provider, token, credential.environment);

    const updated = await this.prisma.paymentProviderCredential.update({
      where: { id: credential.id },
      data: {
        validatedAt: new Date(),
        lastValidationStatus:
          validation.mercadoPagoProof?.status === 'VERIFIED_TEST'
            ? 'VALIDO_AMBIENTE_TEST'
            : (validation.mercadoPagoProof?.status ?? 'VALIDO'),
        ...(validation.mercadoPagoProof
          ? {
              environmentProofStatus: validation.mercadoPagoProof.status,
              environmentProofEnvironment: validation.mercadoPagoProof.environment,
              environmentProofAccountIdHash: validation.mercadoPagoProof.accountIdHash,
              environmentProofCredentialFingerprint:
                validation.mercadoPagoProof.credentialFingerprint,
              environmentProofVerifiedAt: validation.mercadoPagoProof.verifiedAt,
              environmentProofExpiresAt: validation.mercadoPagoProof.expiresAt,
            }
          : {}),
      },
    });

    return {
      ...this.present(updated),
      providerLabel: validation.provider_label ?? null,
      partner: validation.parceiro ?? null,
    };
  }

  async deactivate(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    const credential = await this.getActiveCredential(provider);
    const updated = await this.prisma.paymentProviderCredential.update({
      where: { id: credential.id },
      data: {
        active: false,
        defaultForPix: false,
        lastValidationStatus: 'DESATIVADO',
        environmentProofStatus:
          provider === 'MERCADO_PAGO' ? 'INVALIDATED' : credential.environmentProofStatus,
        environmentProofExpiresAt:
          provider === 'MERCADO_PAGO' ? new Date() : credential.environmentProofExpiresAt,
      },
    });

    return this.present(updated);
  }

  async setDefaultProvider(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    this.ensureDefaultPixProvider(provider);
    const credential = await this.getActiveCredential(provider);

    await this.prisma.$transaction([
      this.prisma.paymentProviderCredential.updateMany({
        where: { companyId: null, defaultForPix: true },
        data: { defaultForPix: false },
      }),
      this.prisma.paymentProviderCredential.update({
        where: { id: credential.id },
        data: { defaultForPix: true },
      }),
    ]);

    return this.present({ ...credential, defaultForPix: true });
  }

  async saveWebhookSecret(provider: PaymentProviderCode, dto: SavePaymentWebhookSecretDto) {
    this.ensureConfigurableProvider(provider);
    const credential = await this.getActiveCredential(provider);
    const secret = dto.secret.trim();
    const updated = await this.prisma.paymentProviderCredential.update({
      where: { id: credential.id },
      data: {
        webhookSecretEncrypted: this.encryption.encrypt(secret),
        webhookSecretLastFour: secret.slice(-4),
        webhookConfiguredAt: new Date(),
      },
    });

    return this.present(updated);
  }

  async registerWebhook(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    this.ensureAutomaticWebhookRegistrationProvider(provider);
    const credential = await this.getActiveCredential(provider);
    const publicUrl = this.getPublicWebhookUrl(provider);
    const token = this.encryption.decrypt(credential.tokenEncrypted);

    const registered = await this.apiClient.registerWebhook(token, {
      url: publicUrl,
      events: [...supportedWebhookEvents],
    });
    const secret = await this.resolveRegisteredWebhookSecret(token, publicUrl, registered);

    const updated = await this.prisma.paymentProviderCredential.update({
      where: { id: credential.id },
      data: {
        webhookSecretEncrypted: this.encryption.encrypt(secret),
        webhookSecretLastFour: secret.slice(-4),
        webhookConfiguredAt: new Date(),
        webhookUrl: publicUrl,
        webhookRegisteredAt: new Date(),
      },
    });

    return this.present(updated);
  }

  async getActiveToken(provider: PaymentProviderCode) {
    const credential = await this.prisma.paymentProviderCredential.findFirst({
      where: {
        provider,
        active: true,
        companyId: null,
        ...(provider === 'MERCADO_PAGO'
          ? { environment: this.currentMercadoPagoEnvironment() }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      return null;
    }

    return this.encryption.decrypt(credential.tokenEncrypted);
  }

  async getActiveMercadoPagoAccess(): Promise<MercadoPagoCredentialAccess> {
    const credential = await this.getActiveCredential('MERCADO_PAGO');
    const token = this.encryption.decrypt(credential.tokenEncrypted);
    const fingerprint = this.hashProofValue(`credential:${token}`);
    const now = new Date();

    if (
      credential.environment !== 'TEST' ||
      this.currentMercadoPagoEnvironment() !== 'TEST' ||
      credential.environmentProofStatus !== 'VERIFIED_TEST' ||
      credential.environmentProofEnvironment !== 'TEST' ||
      !credential.environmentProofAccountIdHash ||
      !credential.environmentProofCredentialFingerprint ||
      credential.environmentProofCredentialFingerprint !== fingerprint ||
      !credential.environmentProofVerifiedAt ||
      !credential.environmentProofExpiresAt ||
      credential.environmentProofExpiresAt <= now
    ) {
      throw new BadRequestException('Credencial Mercado Pago sem prova TEST valida e vigente.');
    }

    return {
      token,
      credentialId: credential.id,
      environment: credential.environment,
      credentialFingerprint: fingerprint,
      accountIdHash: credential.environmentProofAccountIdHash,
      proofExpiresAt: credential.environmentProofExpiresAt,
    };
  }

  async getDefaultProvider() {
    const credential = await this.prisma.paymentProviderCredential.findFirst({
      where: {
        provider: { in: [...defaultPixProviders] },
        active: true,
        defaultForPix: true,
        companyId: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return credential?.provider ?? null;
  }

  async ensureEligiblePixCreationProvider(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    if (provider === 'MERCADO_PAGO') {
      this.ensureMercadoPagoProductionBlocked(provider, this.currentMercadoPagoEnvironment());
    }
    if (provider === 'MERCADO_PAGO' && !this.mercadoPagoEnabled()) {
      throw new BadRequestException('Mercado Pago esta desabilitado neste ambiente.');
    }
    await this.getActiveCredential(provider);
  }

  async getWebhookSecret(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
    const credential = await this.getActiveCredential(provider);

    if (!credential.webhookSecretEncrypted) {
      throw new NotFoundException('Webhook secret de pagamentos nao configurado.');
    }

    return this.encryption.decrypt(credential.webhookSecretEncrypted);
  }

  private async getActiveCredential(provider: PaymentProviderCode) {
    const credential = await this.prisma.paymentProviderCredential.findFirst({
      where: {
        provider,
        active: true,
        companyId: null,
        ...(provider === 'MERCADO_PAGO'
          ? { environment: this.currentMercadoPagoEnvironment() }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      throw new NotFoundException('Credencial de pagamento nao configurada.');
    }

    return credential;
  }

  private async hasDefaultProvider() {
    const count = await this.prisma.paymentProviderCredential.count({
      where: {
        provider: { in: [...defaultPixProviders] },
        active: true,
        defaultForPix: true,
        companyId: null,
      },
    });

    return count > 0;
  }

  private async validateTokenForProvider(
    provider: PaymentProviderCode,
    token: string,
    environment: PaymentProviderEnvironment = 'PRODUCTION',
  ) {
    if (provider === 'MERCADO_PAGO') {
      const user = await this.mercadoPagoApiClient.getCurrentUser(token);
      const id = user.id === undefined || user.id === null ? '' : String(user.id).trim();

      if (!id) {
        throw new BadRequestException('Mercado Pago nao confirmou a conta da credencial.');
      }

      const mercadoPagoProof = this.buildMercadoPagoEnvironmentProof(user, token, environment);

      return {
        provider_label: 'Mercado Pago',
        parceiro: {
          id,
          name: user.nickname?.trim() || 'Conta Mercado Pago',
        },
        mercadoPagoProof,
      };
    }

    const validation = await this.apiClient.authMe(token);
    const realProvider = validation.api_provider?.toLowerCase();
    const expected = provider.toLowerCase();

    if (realProvider !== expected) {
      const realLabel = this.labelForProvider(realProvider);
      throw new BadRequestException(
        `A chave informada pertence ao ${realLabel} e nao ao ${this.labelForProvider(expected)}.`,
      );
    }

    return { ...validation, mercadoPagoProof: null };
  }

  private buildMercadoPagoEnvironmentProof(
    user: Awaited<ReturnType<MercadoPagoApiClient['getCurrentUser']>>,
    token: string,
    environment: PaymentProviderEnvironment,
  ) {
    const id = user.id === undefined || user.id === null ? '' : String(user.id).trim();
    const verifiedAt = new Date();

    if (environment !== 'TEST') {
      return {
        status: 'PRODUCTION_NOT_HOMOLOGATED',
        environment,
        accountIdHash: id ? this.hashProofValue(`account:${id}`) : null,
        credentialFingerprint: this.hashProofValue(`credential:${token}`),
        verifiedAt,
        expiresAt: null,
      };
    }

    const tags = Array.isArray(user.tags)
      ? user.tags.filter((value): value is string => typeof value === 'string')
      : [];
    const signals = [
      typeof user.nickname === 'string' && /^test/i.test(user.nickname.trim()),
      typeof user.email === 'string' && /@testuser\.com$/i.test(user.email.trim()),
      tags.some((tag) => tag.toLowerCase() === 'test_user' || tag.toLowerCase().includes('test')),
      user.test_data !== undefined && user.test_data !== null,
    ].filter(Boolean).length;

    if (user.site_id !== 'MLB' || signals < 2) {
      throw new BadRequestException(
        'Mercado Pago nao comprovou identidade oficial de vendedor TEST.',
      );
    }

    return {
      status: 'VERIFIED_TEST',
      environment: 'TEST' as const,
      accountIdHash: this.hashProofValue(`account:${id}`),
      credentialFingerprint: this.hashProofValue(`credential:${token}`),
      verifiedAt,
      expiresAt: new Date(verifiedAt.getTime() + this.environmentProofTtlMs()),
    };
  }

  private environmentProofTtlMs() {
    const configured = Number(
      this.config.get<string>('MERCADO_PAGO_ENVIRONMENT_PROOF_TTL_MINUTES') ?? '1440',
    );
    const minutes =
      Number.isFinite(configured) && configured >= 5 && configured <= 10_080 ? configured : 1440;
    return minutes * 60_000;
  }

  private hashProofValue(value: string) {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }

  private ensureConfigurableProvider(provider: PaymentProviderCode) {
    if (!configurableProviders.includes(provider as (typeof configurableProviders)[number])) {
      throw new BadRequestException('Provider de pagamento nao configuravel nesta versao.');
    }
  }

  private ensureMercadoPagoProductionBlocked(
    provider: PaymentProviderCode,
    environment: PaymentProviderEnvironment,
  ) {
    if (provider === 'MERCADO_PAGO' && environment === 'PRODUCTION') {
      throw new BadRequestException(
        'Mercado Pago PRODUCTION permanece bloqueado ate homologacao separada.',
      );
    }
  }

  private ensureDefaultPixProvider(provider: PaymentProviderCode) {
    if (!this.canBeDefaultForPix(provider)) {
      throw new BadRequestException(
        provider === 'FASTPIX'
          ? 'FastPIX e um provider alternativo manual nesta versao.'
          : 'Provider disponivel apenas para selecao manual nesta versao.',
      );
    }
  }

  private canBeDefaultForPix(provider: PaymentProviderCode) {
    return defaultPixProviders.includes(provider as (typeof defaultPixProviders)[number]);
  }

  private labelForProvider(provider: string | undefined) {
    if (provider === 'fastflow') return 'FastFlow';
    if (provider === 'fastpix') return 'FastPIX';
    if (provider === 'fastpay') return 'FastPay';
    if (provider === 'depix') return 'Depix';
    if (provider === 'mercado_pago') return 'Mercado Pago';
    return provider || 'provider desconhecido';
  }

  private getPublicWebhookUrl(provider: PaymentProviderCode) {
    const publicUrl =
      this.config.get<string>('CRM_API_PUBLIC_URL')?.trim() ||
      this.config.get<string>('CRM_PUBLIC_URL')?.trim();

    if (!publicUrl) {
      throw new BadRequestException(
        'CRM_API_PUBLIC_URL deve estar configurada para registrar webhook.',
      );
    }

    const url = new URL(`/payment-webhooks/${provider.toLowerCase()}`, publicUrl);

    if (url.protocol !== 'https:') {
      throw new BadRequestException('Webhook de pagamentos exige URL publica HTTPS.');
    }

    const hostname = url.hostname.toLowerCase();
    const invalidHost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    if (invalidHost) {
      throw new BadRequestException('Webhook de pagamentos nao pode usar localhost ou IP privado.');
    }

    return url.toString();
  }

  private async resolveRegisteredWebhookSecret(
    token: string,
    publicUrl: string,
    registered: FastDepixWebhookRegistrationResponse,
  ) {
    const directSecret = registered.secret_key?.trim();

    if (directSecret) {
      return directSecret;
    }

    const webhooks = await this.apiClient.listWebhooks(token);
    const matches = webhooks.filter((webhook) => webhook.url === publicUrl);

    if (matches.length === 0) {
      throw new BadRequestException('Webhook registrado, mas secret_key nao foi localizado.');
    }

    if (matches.length > 1) {
      throw new BadRequestException(
        'Mais de um webhook encontrado para a URL informada. Revise o cadastro no provider.',
      );
    }

    const secret = matches[0]?.secret_key?.trim();

    if (!secret) {
      throw new BadRequestException('Webhook localizado sem secret_key retornado pelo provider.');
    }

    return secret;
  }

  private tryBuildPublicWebhookUrl(provider: PaymentProviderCode) {
    try {
      return this.getPublicWebhookUrl(provider);
    } catch {
      return null;
    }
  }

  private present(
    credential: PaymentProviderCredential,
    whatsappPixMerchantName: string | null = null,
  ) {
    const status = credential.active
      ? credential.lastValidationStatus === 'VALIDO' ||
        (credential.environmentProofStatus === 'VERIFIED_TEST' &&
          credential.environmentProofExpiresAt !== null &&
          credential.environmentProofExpiresAt > new Date())
        ? 'VALIDO'
        : 'CONFIGURADO'
      : 'NAO_CONFIGURADO';

    return {
      id: credential.id,
      provider: credential.provider,
      environment: credential.environment,
      name: credential.name,
      whatsappPixMerchantName,
      configured: credential.active,
      active: credential.active,
      tokenMask:
        credential.provider === 'MERCADO_PAGO'
          ? `mp_************${credential.tokenLastFour}`
          : `fdpx_************${credential.tokenLastFour}`,
      webhookSecretConfigured: Boolean(credential.webhookSecretEncrypted),
      webhookSecretMask: credential.webhookSecretLastFour
        ? `whsec_************${credential.webhookSecretLastFour}`
        : null,
      webhookConfiguredAt: credential.webhookConfiguredAt?.toISOString() ?? null,
      webhookUrl: credential.webhookUrl ?? this.tryBuildPublicWebhookUrl(credential.provider),
      webhookRegisteredAt: credential.webhookRegisteredAt?.toISOString() ?? null,
      defaultForPix: credential.defaultForPix,
      validatedAt: credential.validatedAt?.toISOString() ?? null,
      lastValidationStatus: credential.lastValidationStatus,
      environmentProofStatus: credential.environmentProofStatus,
      environmentProofVerifiedAt: credential.environmentProofVerifiedAt?.toISOString() ?? null,
      environmentProofExpiresAt: credential.environmentProofExpiresAt?.toISOString() ?? null,
      status,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }

  private resolveCredentialEnvironment(
    provider: PaymentProviderCode,
    environment: PaymentProviderEnvironment | undefined,
  ) {
    if (provider === 'MERCADO_PAGO') {
      return environment ?? this.currentMercadoPagoEnvironment();
    }

    if (environment && environment !== 'PRODUCTION') {
      throw new BadRequestException(
        'Ambiente separado de credencial e suportado apenas para Mercado Pago nesta versao.',
      );
    }

    return 'PRODUCTION' as const;
  }

  private currentMercadoPagoEnvironment(): PaymentProviderEnvironment {
    return this.config.get<string>('MERCADO_PAGO_ENVIRONMENT') === 'PRODUCTION'
      ? 'PRODUCTION'
      : 'TEST';
  }

  private mercadoPagoEnabled() {
    return this.config.get<string>('MERCADO_PAGO_ENABLED') === 'true';
  }

  private ensureAutomaticWebhookRegistrationProvider(provider: PaymentProviderCode) {
    if (provider === 'MERCADO_PAGO') {
      throw new BadRequestException(
        'Webhook Mercado Pago deve ser configurado no painel oficial nesta fase.',
      );
    }
  }
}
