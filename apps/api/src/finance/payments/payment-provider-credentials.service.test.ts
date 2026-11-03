import {
  BadRequestException,
  BadGatewayException,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenEncryptionService } from '../../whatsapp/security/token-encryption.service';
import { FastDepixApiClient } from './fastdepix-api.client';
import { MercadoPagoApiClient } from './mercado-pago-api.client';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

function createService(
  apiProvider = 'fastflow',
  configValues: Record<string, string | undefined> = {
    CRM_API_PUBLIC_URL: 'https://crm.example.test',
  },
) {
  const records: Array<Record<string, unknown>> = [];
  const decryptedValues = new Map<string, string>();
  const prisma = {
    paymentProviderCredential: {
      findMany: vi.fn().mockResolvedValue(records),
      count: vi.fn(({ where }) =>
        Promise.resolve(
          records.filter(
            (record) =>
              record.active === where.active && record.defaultForPix === where.defaultForPix,
          ).length,
        ),
      ),
      updateMany: vi.fn(({ where, data }) => {
        const matching = records.filter(
          (record) =>
            (where.provider === undefined || record.provider === where.provider) &&
            (where.environment === undefined || record.environment === where.environment) &&
            (where.active === undefined || record.active === where.active),
        );
        matching.forEach((record) => Object.assign(record, data));
        return Promise.resolve({ count: matching.length });
      }),
      create: vi.fn(({ data }) => {
        const record = {
          id: `credential-${records.length + 1}`,
          createdAt: new Date('2026-09-11T00:00:00.000Z'),
          updatedAt: new Date('2026-09-11T00:00:00.000Z'),
          ...data,
        };
        records.push(record);
        return Promise.resolve(record);
      }),
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          records.find(
            (record) =>
              record.provider === where.provider &&
              record.active === where.active &&
              (where.environment === undefined || record.environment === where.environment),
          ) ?? null,
        ),
      ),
      update: vi.fn(({ where, data }) => {
        const record = records.find((item) => item.id === where.id);
        if (!record) throw new Error('credential not found');
        Object.assign(record, data, { updatedAt: new Date('2026-09-11T00:01:00.000Z') });
        return Promise.resolve(record);
      }),
    },
  };
  const encryption = {
    encrypt: vi.fn((value: string) => {
      const encrypted = `encrypted:${value.slice(-4)}`;
      decryptedValues.set(encrypted, value);
      return encrypted;
    }),
    decrypt: vi.fn(
      (value: string) => decryptedValues.get(value) ?? value.replace('encrypted:', 'token-'),
    ),
  };
  const apiClient = {
    authMe: vi.fn().mockResolvedValue({
      api_provider: apiProvider,
      provider_label: apiProvider,
      parceiro: { id: 'partner-id', name: 'Parceiro', email: 'ops@example.com' },
    }),
    registerWebhook: vi.fn().mockResolvedValue({
      id: 12,
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: ['transaction.paid'],
      secret_key: 'fake_webhook_secret_123',
      is_active: true,
    }),
    listWebhooks: vi.fn().mockResolvedValue([]),
  };
  const mercadoPagoApiClient = {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: 123,
      nickname: 'TEST_USER',
      site_id: 'MLB',
      email: 'testuser123@testuser.com',
      tags: ['test_user'],
      test_data: { sandbox: true },
    }),
  };

  return {
    service: new PaymentProviderCredentialsService(
      prisma as never,
      encryption as never,
      apiClient as never,
      mercadoPagoApiClient as never,
      {
        get: (key: string) => configValues[key],
      } as never,
    ),
    prisma,
    encryption,
    apiClient,
    mercadoPagoApiClient,
    records,
  };
}

function createPaymentCredentialDeps() {
  const records: Array<Record<string, unknown>> = [];
  const prisma = {
    paymentProviderCredential: {
      findMany: vi.fn().mockResolvedValue(records),
      count: vi.fn(({ where }) =>
        Promise.resolve(
          records.filter(
            (record) =>
              record.active === where.active && record.defaultForPix === where.defaultForPix,
          ).length,
        ),
      ),
      updateMany: vi.fn(({ where, data }) => {
        const matching = records.filter(
          (record) =>
            (where.provider === undefined || record.provider === where.provider) &&
            (where.environment === undefined || record.environment === where.environment) &&
            (where.active === undefined || record.active === where.active),
        );
        matching.forEach((record) => Object.assign(record, data));
        return Promise.resolve({ count: matching.length });
      }),
      create: vi.fn(({ data }) => {
        const record = {
          id: `credential-${records.length + 1}`,
          createdAt: new Date('2026-09-11T00:00:00.000Z'),
          updatedAt: new Date('2026-09-11T00:00:00.000Z'),
          ...data,
        };
        records.push(record);
        return Promise.resolve(record);
      }),
      findFirst: vi.fn(({ where }) =>
        Promise.resolve(
          records.find(
            (record) =>
              record.provider === where.provider &&
              record.active === where.active &&
              (where.environment === undefined || record.environment === where.environment),
          ) ?? null,
        ),
      ),
      update: vi.fn(({ where, data }) => {
        const record = records.find((item) => item.id === where.id);
        if (!record) throw new Error('credential not found');
        Object.assign(record, data, { updatedAt: new Date('2026-09-11T00:01:00.000Z') });
        return Promise.resolve(record);
      }),
    },
  };
  const encryption = {
    encrypt: vi.fn((value: string) => `encrypted:${value.slice(-4)}`),
    decrypt: vi.fn((value: string) => value.replace('encrypted:', 'token-')),
  };

  return { prisma, encryption, records };
}

const nestCredentialDeps = createPaymentCredentialDeps();

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
  providers: [
    PaymentProviderCredentialsService,
    FastDepixApiClient,
    MercadoPagoApiClient,
    { provide: PrismaService, useValue: nestCredentialDeps.prisma },
    { provide: TokenEncryptionService, useValue: nestCredentialDeps.encryption },
  ],
})
class PaymentProviderCredentialsTestModule {}

describe('PaymentProviderCredentialsService', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    nestCredentialDeps.records.splice(0);
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('saves encrypted FastFlow credentials and returns only a token mask', async () => {
    const fake = createService('fastflow');

    const result = await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    expect(result).toMatchObject({
      provider: 'FASTFLOW',
      tokenMask: 'fdpx_************A7F2',
      status: 'VALIDO',
    });
    expect(fake.records.at(0)?.tokenEncrypted).toBe('encrypted:A7F2');
    expect(JSON.stringify(result)).not.toContain('fdpx_test_token_A7F2');
  });

  it('saves encrypted FastPIX credentials independently from FastFlow', async () => {
    const fake = createService('fastpix');

    const result = await fake.service.save({
      provider: 'FASTPIX',
      name: 'FastPIX alternativo',
      token: 'fdpx_fastpix_token_B8P9',
    });

    expect(result).toMatchObject({
      provider: 'FASTPIX',
      tokenMask: 'fdpx_************B8P9',
      status: 'VALIDO',
    });
    expect(fake.records.at(0)).toMatchObject({
      provider: 'FASTPIX',
      tokenEncrypted: 'encrypted:B8P9',
      defaultForPix: false,
    });
    expect(JSON.stringify(result)).not.toContain('fdpx_fastpix_token_B8P9');
  });

  it('stores a Mercado Pago TEST credential and keeps it non-default', async () => {
    const fake = createService('fastflow', {
      CRM_API_PUBLIC_URL: 'https://crm.example.test',
      MERCADO_PAGO_ENVIRONMENT: 'TEST',
      MERCADO_PAGO_ENABLED: 'true',
    });

    await fake.service.save({
      provider: 'MERCADO_PAGO',
      environment: 'TEST',
      name: 'Mercado Pago teste',
      token: 'APP_USR_test_token_T3ST',
    });
    expect(fake.mercadoPagoApiClient.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(fake.records[0]).toEqual(
      expect.objectContaining({
        provider: 'MERCADO_PAGO',
        environment: 'TEST',
        active: true,
        defaultForPix: false,
        environmentProofStatus: 'VERIFIED_TEST',
        environmentProofEnvironment: 'TEST',
        environmentProofAccountIdHash: expect.stringMatching(/^sha256:/),
        environmentProofCredentialFingerprint: expect.stringMatching(/^sha256:/),
        environmentProofVerifiedAt: expect.any(Date),
        environmentProofExpiresAt: expect.any(Date),
      }),
    );
    await expect(fake.service.getActiveToken('MERCADO_PAGO')).resolves.toBe(
      'APP_USR_test_token_T3ST',
    );
  });

  it('binds active Mercado Pago access to a valid TEST proof and rejects token rotation or expiry', async () => {
    const fake = createService('fastflow', {
      MERCADO_PAGO_ENVIRONMENT: 'TEST',
      MERCADO_PAGO_ENABLED: 'true',
      MERCADO_PAGO_ENVIRONMENT_PROOF_TTL_MINUTES: '60',
    });
    await fake.service.save({
      provider: 'MERCADO_PAGO',
      environment: 'TEST',
      name: 'Mercado Pago teste',
      token: 'APP_USR_test_token_T3ST',
    });

    await expect(fake.service.getActiveMercadoPagoAccess()).resolves.toMatchObject({
      credentialId: 'credential-1',
      environment: 'TEST',
      credentialFingerprint: expect.stringMatching(/^sha256:/),
      accountIdHash: expect.stringMatching(/^sha256:/),
    });

    fake.records[0]!.tokenEncrypted = 'encrypted:ROTATED';
    await expect(fake.service.getActiveMercadoPagoAccess()).rejects.toThrow(
      'sem prova TEST valida e vigente',
    );

    fake.records[0]!.tokenEncrypted = 'encrypted:T3ST';
    fake.records[0]!.environmentProofExpiresAt = new Date(Date.now() - 1);
    await expect(fake.service.getActiveMercadoPagoAccess()).rejects.toThrow(
      'sem prova TEST valida e vigente',
    );
  });

  it('rejects TEST proof when the authenticated seller identity lacks official sandbox evidence', async () => {
    const fake = createService('fastflow', {
      MERCADO_PAGO_ENVIRONMENT: 'TEST',
      MERCADO_PAGO_ENABLED: 'true',
    });
    fake.mercadoPagoApiClient.getCurrentUser.mockResolvedValueOnce({
      id: 456,
      nickname: 'SELLER_REAL',
      site_id: 'MLB',
      email: 'seller@example.com',
      tags: [],
    });

    await expect(
      fake.service.save({
        provider: 'MERCADO_PAGO',
        environment: 'TEST',
        name: 'Credencial divergente',
        token: 'APP_USR_not_test_PR0D',
      }),
    ).rejects.toThrow('nao comprovou identidade oficial de vendedor TEST');
    expect(fake.records).toHaveLength(0);
  });

  it('blocks a PRODUCTION credential before validation or persistence', async () => {
    const fake = createService('fastflow', {
      MERCADO_PAGO_ENVIRONMENT: 'PRODUCTION',
      MERCADO_PAGO_ENABLED: 'true',
    });
    await expect(
      fake.service.save({
        provider: 'MERCADO_PAGO',
        environment: 'PRODUCTION',
        name: 'Mercado Pago producao',
        token: 'APP_USR_prod_token_PR0D',
      }),
    ).rejects.toThrow('PRODUCTION permanece bloqueado');
    expect(fake.mercadoPagoApiClient.getCurrentUser).not.toHaveBeenCalled();
    expect(fake.prisma.paymentProviderCredential.updateMany).not.toHaveBeenCalled();
    expect(fake.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(fake.records).toHaveLength(0);
  });

  it('stores a Mercado Pago webhook secret for the active environment without automatic registration', async () => {
    const fake = createService('fastflow', {
      CRM_API_PUBLIC_URL: 'https://crm.example.test',
      MERCADO_PAGO_ENVIRONMENT: 'TEST',
      MERCADO_PAGO_ENABLED: 'false',
    });
    await fake.service.save({
      provider: 'MERCADO_PAGO',
      environment: 'TEST',
      name: 'Mercado Pago teste',
      token: 'APP_USR_test_token_T3ST',
    });

    const result = await fake.service.saveWebhookSecret('MERCADO_PAGO', {
      secret: 'mercado_pago_webhook_secret_TEST',
    });

    expect(fake.records.at(0)).toMatchObject({
      provider: 'MERCADO_PAGO',
      environment: 'TEST',
      webhookSecretEncrypted: 'encrypted:TEST',
      webhookSecretLastFour: 'TEST',
    });
    expect(result.webhookSecretConfigured).toBe(true);
    expect(fake.apiClient.registerWebhook).not.toHaveBeenCalled();
  });

  it('keeps automatic Mercado Pago webhook registration blocked from the FastDepix client', async () => {
    const fake = createService('fastflow', {
      CRM_API_PUBLIC_URL: 'https://crm.example.test',
      MERCADO_PAGO_ENVIRONMENT: 'TEST',
      MERCADO_PAGO_ENABLED: 'true',
    });
    await fake.service.save({
      provider: 'MERCADO_PAGO',
      environment: 'TEST',
      name: 'Mercado Pago teste',
      token: 'APP_USR_test_token_T3ST',
    });

    await expect(fake.service.registerWebhook('MERCADO_PAGO')).rejects.toThrow(
      'Webhook Mercado Pago deve ser configurado no painel oficial nesta fase.',
    );
    expect(fake.apiClient.registerWebhook).not.toHaveBeenCalled();
  });

  it('does not allow FastPIX to become the default PIX provider', async () => {
    const fake = createService('fastpix');
    await fake.service.save({
      provider: 'FASTPIX',
      name: 'FastPIX alternativo',
      token: 'fdpx_fastpix_token_B8P9',
    });

    await expect(fake.service.setDefaultProvider('FASTPIX')).rejects.toThrow(
      'FastPIX e um provider alternativo manual nesta versao.',
    );
    expect(fake.records.at(0)?.defaultForPix).toBe(false);
  });

  it('rejects a FastPay token when saving it in the FastFlow card', async () => {
    const fake = createService('fastpay');

    await expect(
      fake.service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow errado',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fake.records).toHaveLength(0);
  });

  it('does not persist credentials when the provider rejects the token', async () => {
    const fake = createService('fastflow');
    fake.apiClient.authMe.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );

    await expect(
      fake.service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow invalido',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(fake.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(fake.records).toHaveLength(0);
  });

  it('does not persist credentials when the provider is unavailable during validation', async () => {
    const fake = createService('fastflow');
    fake.apiClient.authMe.mockRejectedValueOnce(
      new ServiceUnavailableException('API de pagamentos indisponivel no momento.'),
    );

    await expect(
      fake.service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow indisponivel',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(fake.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(fake.records).toHaveLength(0);
  });

  it('saves credentials through Nest DI after validating authMe over mocked HTTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            api_provider: 'fastflow',
            provider_label: 'FastFlow',
            parceiro: { id: 'partner-id' },
          },
        }),
    });
    vi.stubEnv('FASTDEPIX_BASE_URL', 'https://fastdepix.space/api/v1/');
    vi.stubEnv('PAYMENT_PROVIDER_HTTP_TIMEOUT_MS', '1500');
    vi.stubGlobal('fetch', fetchMock);
    app = await NestFactory.createApplicationContext(PaymentProviderCredentialsTestModule, {
      logger: false,
    });
    const service = app.get(PaymentProviderCredentialsService);

    const result = await service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fastdepix.space/api/v1/auth/me');
    expect(result).toMatchObject({
      provider: 'FASTFLOW',
      status: 'VALIDO',
      providerLabel: 'FastFlow',
    });
    expect(nestCredentialDeps.prisma.paymentProviderCredential.create).toHaveBeenCalledTimes(1);
    expect(nestCredentialDeps.records).toHaveLength(1);
  });

  it('does not persist credentials when mocked authMe returns provider 401', async () => {
    vi.stubEnv('FASTDEPIX_BASE_URL', 'https://fastdepix.space/api/v1/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      }),
    );
    app = await NestFactory.createApplicationContext(PaymentProviderCredentialsTestModule, {
      logger: false,
    });
    const service = app.get(PaymentProviderCredentialsService);

    await expect(
      service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow invalido',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(nestCredentialDeps.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(nestCredentialDeps.records).toHaveLength(0);
  });

  it('does not persist credentials when mocked authMe returns provider 500', async () => {
    vi.stubEnv('FASTDEPIX_BASE_URL', 'https://fastdepix.space/api/v1/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'temporary failure' }),
      }),
    );
    app = await NestFactory.createApplicationContext(PaymentProviderCredentialsTestModule, {
      logger: false,
    });
    const service = app.get(PaymentProviderCredentialsService);

    await expect(
      service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow indisponivel',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(nestCredentialDeps.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(nestCredentialDeps.records).toHaveLength(0);
  });

  it('does not persist credentials when mocked authMe times out', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubEnv('FASTDEPIX_BASE_URL', 'https://fastdepix.space/api/v1/');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    app = await NestFactory.createApplicationContext(PaymentProviderCredentialsTestModule, {
      logger: false,
    });
    const service = app.get(PaymentProviderCredentialsService);

    await expect(
      service.save({
        provider: 'FASTFLOW',
        name: 'FastFlow timeout',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(nestCredentialDeps.prisma.paymentProviderCredential.create).not.toHaveBeenCalled();
    expect(nestCredentialDeps.records).toHaveLength(0);
  });

  it('keeps the credential record and reports provider auth failure when testing connection', async () => {
    const fake = createService('fastflow');
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });
    fake.apiClient.authMe.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );

    await expect(fake.service.test('FASTFLOW')).rejects.toThrow(BadGatewayException);

    expect(fake.records).toHaveLength(1);
    expect(fake.prisma.paymentProviderCredential.update).not.toHaveBeenCalled();
  });

  it('keeps webhook state unchanged when provider rejects webhook registration credentials', async () => {
    const fake = createService('fastflow');
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });
    fake.apiClient.registerWebhook.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );

    await expect(fake.service.registerWebhook('FASTFLOW')).rejects.toThrow(BadGatewayException);

    expect(fake.prisma.paymentProviderCredential.update).not.toHaveBeenCalled();
    expect(fake.records[0]).not.toHaveProperty('webhookSecretEncrypted');
    expect(fake.records[0]).not.toHaveProperty('webhookUrl');
    expect(fake.records[0]).not.toHaveProperty('webhookRegisteredAt');
  });

  it('registers webhook with transaction events and stores returned secret encrypted', async () => {
    const fake = createService('fastflow');
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    const result = await fake.service.registerWebhook('FASTFLOW');

    expect(fake.apiClient.registerWebhook).toHaveBeenCalledWith('fdpx_test_token_A7F2', {
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: [
        'transaction.created',
        'transaction.approved',
        'transaction.paid',
        'transaction.expired',
        'transaction.refunded',
      ],
    });
    expect(fake.records.at(0)).toMatchObject({
      webhookSecretEncrypted: 'encrypted:_123',
      webhookSecretLastFour: '_123',
      webhookUrl: 'https://crm.example.test/payment-webhooks/fastflow',
    });
    expect(JSON.stringify(result)).not.toContain('fake_webhook_secret_123');
    expect(result.webhookSecretConfigured).toBe(true);
    expect(fake.apiClient.listWebhooks).not.toHaveBeenCalled();
  });

  it('registers FastPIX webhook at provider-specific URL and stores its own secret encrypted', async () => {
    const fake = createService('fastpix');
    fake.apiClient.registerWebhook.mockResolvedValueOnce({
      id: 14,
      url: 'https://crm.example.test/payment-webhooks/fastpix',
      events: ['transaction.paid'],
      secret_key: 'fastpix_webhook_secret_456',
      is_active: true,
    });
    await fake.service.save({
      provider: 'FASTPIX',
      name: 'FastPIX alternativo',
      token: 'fdpx_fastpix_token_B8P9',
    });

    const result = await fake.service.registerWebhook('FASTPIX');

    expect(fake.apiClient.registerWebhook).toHaveBeenCalledWith('fdpx_fastpix_token_B8P9', {
      url: 'https://crm.example.test/payment-webhooks/fastpix',
      events: [
        'transaction.created',
        'transaction.approved',
        'transaction.paid',
        'transaction.expired',
        'transaction.refunded',
      ],
    });
    expect(fake.records.at(0)).toMatchObject({
      provider: 'FASTPIX',
      webhookSecretEncrypted: 'encrypted:_456',
      webhookSecretLastFour: '_456',
      webhookUrl: 'https://crm.example.test/payment-webhooks/fastpix',
    });
    expect(JSON.stringify(result)).not.toContain('fastpix_webhook_secret_456');
  });

  it('keeps legacy CRM_PUBLIC_URL as fallback for payment webhook registration', async () => {
    const fake = createService('fastflow', {
      CRM_PUBLIC_URL: 'https://legacy-crm.example.test',
    });
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    await fake.service.registerWebhook('FASTFLOW');

    expect(fake.apiClient.registerWebhook).toHaveBeenCalledWith('fdpx_test_token_A7F2', {
      url: 'https://legacy-crm.example.test/payment-webhooks/fastflow',
      events: [
        'transaction.created',
        'transaction.approved',
        'transaction.paid',
        'transaction.expired',
        'transaction.refunded',
      ],
    });
  });

  it('rejects payment webhook registration without a public API URL', async () => {
    const fake = createService('fastflow', {});
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    await expect(fake.service.registerWebhook('FASTFLOW')).rejects.toThrow(
      'CRM_API_PUBLIC_URL deve estar configurada para registrar webhook.',
    );
    expect(fake.apiClient.registerWebhook).not.toHaveBeenCalled();
  });

  it('falls back to GET webhooks and refuses ambiguous webhook URLs', async () => {
    const fake = createService('fastflow');
    fake.apiClient.registerWebhook.mockResolvedValueOnce({
      id: 12,
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: ['transaction.paid'],
      is_active: true,
    });
    fake.apiClient.listWebhooks.mockResolvedValueOnce([
      {
        id: 12,
        url: 'https://crm.example.test/payment-webhooks/fastflow',
        events: [
          'transaction.created',
          'transaction.approved',
          'transaction.paid',
          'transaction.expired',
          'transaction.refunded',
        ],
        secret_key: 'fallback_secret_456',
        is_active: true,
      },
    ]);
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    await fake.service.registerWebhook('FASTFLOW');

    expect(fake.apiClient.listWebhooks).toHaveBeenCalledWith('fdpx_test_token_A7F2');
    expect(fake.records.at(0)).toMatchObject({
      webhookSecretEncrypted: 'encrypted:_456',
      webhookSecretLastFour: '_456',
    });

    fake.apiClient.registerWebhook.mockResolvedValueOnce({
      id: 13,
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: ['transaction.paid'],
      is_active: true,
    });
    fake.apiClient.listWebhooks.mockResolvedValueOnce([
      {
        id: 12,
        url: 'https://crm.example.test/payment-webhooks/fastflow',
        secret_key: 'one',
      },
      {
        id: 13,
        url: 'https://crm.example.test/payment-webhooks/fastflow',
        secret_key: 'two',
      },
    ]);

    await expect(fake.service.registerWebhook('FASTFLOW')).rejects.toThrow(BadRequestException);
  });

  it('does not persist webhook data when fallback GET finds zero exact matches', async () => {
    const fake = createService('fastflow');
    fake.apiClient.registerWebhook.mockResolvedValueOnce({
      id: 12,
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: ['transaction.paid'],
      is_active: true,
    });
    fake.apiClient.listWebhooks.mockResolvedValueOnce([]);
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    await expect(fake.service.registerWebhook('FASTFLOW')).rejects.toThrow(BadRequestException);

    expect(fake.records.at(0)?.webhookSecretEncrypted).toBeUndefined();
    expect(fake.records.at(0)?.webhookSecretLastFour).toBeUndefined();
    expect(fake.records.at(0)?.webhookRegisteredAt).toBeUndefined();
  });

  it('matches fallback webhooks by exact URL and ignores similar URLs', async () => {
    const fake = createService('fastflow');
    fake.apiClient.registerWebhook.mockResolvedValueOnce({
      id: 12,
      url: 'https://crm.example.test/payment-webhooks/fastflow',
      events: ['transaction.paid'],
      is_active: true,
    });
    fake.apiClient.listWebhooks.mockResolvedValueOnce([
      {
        id: 11,
        url: 'https://crm.example.test/payment-webhooks/fastflow-test',
        secret_key: 'similar_url_secret',
        is_active: true,
      },
      {
        id: 12,
        url: 'https://crm.example.test/payment-webhooks/fastflow',
        secret_key: 'exact_url_secret',
        is_active: true,
      },
    ]);
    await fake.service.save({
      provider: 'FASTFLOW',
      name: 'FastFlow principal',
      token: 'fdpx_test_token_A7F2',
    });

    await fake.service.registerWebhook('FASTFLOW');

    expect(fake.records.at(0)).toMatchObject({
      webhookSecretEncrypted: 'encrypted:cret',
      webhookSecretLastFour: 'cret',
      webhookUrl: 'https://crm.example.test/payment-webhooks/fastflow',
    });
  });
});
