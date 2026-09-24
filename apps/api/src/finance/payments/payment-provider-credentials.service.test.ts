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
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

function createService(apiProvider = 'fastflow') {
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
      updateMany: vi.fn(({ data }) => {
        records.forEach((record) => Object.assign(record, data));
        return Promise.resolve({ count: records.length });
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
            (record) => record.provider === where.provider && record.active === where.active,
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

  return {
    service: new PaymentProviderCredentialsService(
      prisma as never,
      encryption as never,
      apiClient as never,
      {
        get: (key: string) => (key === 'CRM_PUBLIC_URL' ? 'https://crm.example.test' : undefined),
      } as never,
    ),
    prisma,
    encryption,
    apiClient,
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
      updateMany: vi.fn(({ data }) => {
        records.forEach((record) => Object.assign(record, data));
        return Promise.resolve({ count: records.length });
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
            (record) => record.provider === where.provider && record.active === where.active,
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

    expect(fake.apiClient.registerWebhook).toHaveBeenCalledWith('token-A7F2', {
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

    expect(fake.apiClient.listWebhooks).toHaveBeenCalledWith('token-A7F2');
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
