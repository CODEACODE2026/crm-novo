import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderCode, type PaymentProviderCredential } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenEncryptionService } from '../../whatsapp/security/token-encryption.service';
import {
  SavePaymentProviderCredentialDto,
  SavePaymentWebhookSecretDto,
} from '../dto/save-payment-provider-credential.dto';
import {
  FastDepixApiClient,
  type FastDepixWebhookRegistrationResponse,
} from './fastdepix-api.client';

const configurableProviders = ['FASTFLOW', 'FASTPAY'] satisfies PaymentProviderCode[];
const supportedWebhookEvents = [
  'transaction.created',
  'transaction.approved',
  'transaction.paid',
  'transaction.expired',
  'transaction.refunded',
] as const;

@Injectable()
export class PaymentProviderCredentialsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(FastDepixApiClient) private readonly apiClient: FastDepixApiClient,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async list() {
    const credentials = await this.prisma.paymentProviderCredential.findMany({
      where: { provider: { in: [...configurableProviders] } },
      orderBy: [{ provider: 'asc' }, { active: 'desc' }, { createdAt: 'desc' }],
    });

    return configurableProviders.map((provider) => {
      const credential = credentials.find((item) => item.provider === provider && item.active);
      return credential
        ? this.present(credential)
        : {
            provider,
            configured: false,
            status: 'NAO_CONFIGURADO',
          };
    });
  }

  async save(dto: SavePaymentProviderCredentialDto) {
    this.ensureConfigurableProvider(dto.provider);
    const trimmedToken = dto.token.trim();
    const validation = await this.validateTokenForProvider(dto.provider, trimmedToken);

    await this.prisma.paymentProviderCredential.updateMany({
      where: { provider: dto.provider, active: true, companyId: null },
      data: { active: false },
    });

    const credential = await this.prisma.paymentProviderCredential.create({
      data: {
        provider: dto.provider,
        name: dto.name.trim(),
        tokenEncrypted: this.encryption.encrypt(trimmedToken),
        tokenLastFour: trimmedToken.slice(-4),
        active: true,
        defaultForPix: !(await this.hasDefaultProvider()),
        validatedAt: new Date(),
        lastValidationStatus: 'VALIDO',
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
    const credential = await this.getActiveCredential(provider);
    const token = this.encryption.decrypt(credential.tokenEncrypted);
    const validation = await this.validateTokenForProvider(provider, token);

    const updated = await this.prisma.paymentProviderCredential.update({
      where: { id: credential.id },
      data: { validatedAt: new Date(), lastValidationStatus: 'VALIDO' },
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
      data: { active: false, defaultForPix: false, lastValidationStatus: 'DESATIVADO' },
    });

    return this.present(updated);
  }

  async setDefaultProvider(provider: PaymentProviderCode) {
    this.ensureConfigurableProvider(provider);
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
      where: { provider, active: true, companyId: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!credential) {
      return null;
    }

    return this.encryption.decrypt(credential.tokenEncrypted);
  }

  async getDefaultProvider() {
    const credential = await this.prisma.paymentProviderCredential.findFirst({
      where: {
        provider: { in: [...configurableProviders] },
        active: true,
        defaultForPix: true,
        companyId: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return credential?.provider ?? null;
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
      where: { provider, active: true, companyId: null },
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
        provider: { in: [...configurableProviders] },
        active: true,
        defaultForPix: true,
        companyId: null,
      },
    });

    return count > 0;
  }

  private async validateTokenForProvider(provider: PaymentProviderCode, token: string) {
    const validation = await this.apiClient.authMe(token);
    const realProvider = validation.api_provider?.toLowerCase();
    const expected = provider.toLowerCase();

    if (realProvider !== expected) {
      const realLabel = this.labelForProvider(realProvider);
      throw new BadRequestException(
        `A chave informada pertence ao ${realLabel} e nao ao ${this.labelForProvider(expected)}.`,
      );
    }

    return validation;
  }

  private ensureConfigurableProvider(provider: PaymentProviderCode) {
    if (!configurableProviders.includes(provider as (typeof configurableProviders)[number])) {
      throw new BadRequestException('Provider de pagamento nao configuravel nesta versao.');
    }
  }

  private labelForProvider(provider: string | undefined) {
    if (provider === 'fastflow') return 'FastFlow';
    if (provider === 'fastpay') return 'FastPay';
    if (provider === 'depix') return 'Depix';
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

  private present(credential: PaymentProviderCredential) {
    const status = credential.active
      ? credential.lastValidationStatus === 'VALIDO'
        ? 'VALIDO'
        : 'CONFIGURADO'
      : 'NAO_CONFIGURADO';

    return {
      id: credential.id,
      provider: credential.provider,
      name: credential.name,
      configured: credential.active,
      active: credential.active,
      tokenMask: `fdpx_************${credential.tokenLastFour}`,
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
      status,
      createdAt: credential.createdAt.toISOString(),
      updatedAt: credential.updatedAt.toISOString(),
    };
  }
}
