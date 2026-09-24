import { Module, NotFoundException } from '@nestjs/common';
import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PaymentProviderCode, Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FinanceService } from '../finance.service';
import { FastDepixApiClient } from './fastdepix-api.client';
import { FastFlowPaymentProvider, FastPayPaymentProvider } from './fastdepix-payment.provider';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';
import { PaymentProviderRegistryService } from './payment-provider-registry.service';
import { TokenEncryptionService } from '../../whatsapp/security/token-encryption.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const fixedNow = new Date('2026-09-24T00:00:00.000Z');
let configuredProvider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'> = 'FASTFLOW';
let credentialActive = true;

const apiClient = {
  createTransaction: vi.fn(),
  getTransaction: vi.fn(),
  cancelTransaction: vi.fn(),
  authMe: vi.fn(),
  registerWebhook: vi.fn(),
  listWebhooks: vi.fn(),
};

const encryption = {
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace('encrypted:', '')),
};

const config = {
  get: vi.fn((key: string) =>
    key === 'FASTDEPIX_NOTIFICATION_URL'
      ? 'https://crm.example.test/payment-webhooks/fastflow'
      : undefined,
  ),
};

type TransactionCallback = (tx: typeof prisma) => Promise<unknown>;

const prisma = {
  $transaction: vi.fn(async (operation: unknown) => {
    if (typeof operation === 'function') {
      return (operation as TransactionCallback)(prisma);
    }

    return Promise.all(operation as Array<Promise<unknown>>);
  }),
  $executeRawUnsafe: vi.fn(),
  paymentProviderCredential: {
    findFirst: vi.fn(),
  },
  receivable: {
    findUnique: vi.fn(),
  },
  paymentIntent: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  clientEvent: {
    create: vi.fn(),
  },
};

@Module({
  providers: [
    FinanceService,
    FastFlowPaymentProvider,
    FastPayPaymentProvider,
    MockPaymentProvider,
    PaymentProviderCredentialsService,
    PaymentProviderRegistryService,
    { provide: PAYMENT_PROVIDER, useExisting: PaymentProviderRegistryService },
    { provide: FastDepixApiClient, useValue: apiClient },
    { provide: PrismaService, useValue: prisma },
    { provide: TokenEncryptionService, useValue: encryption },
    { provide: ConfigService, useValue: config },
  ],
})
class PaymentProviderDiTestModule {}

function activeCredential() {
  return {
    id: `credential-${configuredProvider.toLowerCase()}`,
    provider: configuredProvider,
    active: credentialActive,
    defaultForPix: true,
    companyId: null,
    tokenEncrypted: `encrypted:${configuredProvider.toLowerCase()}-active-token`,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
}

function findCredential({ where }: { where: Record<string, unknown> }) {
  if (!credentialActive) {
    return Promise.resolve(null);
  }

  if (where.defaultForPix === true) {
    return Promise.resolve(activeCredential());
  }

  if (where.provider === configuredProvider && where.active === true) {
    return Promise.resolve(activeCredential());
  }

  return Promise.resolve(null);
}

function pixInput(provider: PaymentProviderCode = 'FASTFLOW') {
  return {
    receivableId: 'receivable-1',
    amount: new Prisma.Decimal('123.45'),
    description: 'Mensalidade setembro',
    expiresAt: new Date('2026-09-24T00:30:00.000Z'),
    clientName: 'Cliente Teste',
    payerPhone: '5544999999999',
    notificationUrl:
      provider === 'FASTPAY'
        ? 'https://crm.example.test/payment-webhooks/fastpay'
        : 'https://crm.example.test/payment-webhooks/fastflow',
  };
}

function mockProviderPixResponse() {
  apiClient.createTransaction.mockResolvedValue({
    id: 'fastdepix-transaction-1',
    status: 'pending',
    amount: '123.45',
    depix_transaction_id: 'depix-1',
    blockchain_tx_id: null,
    qr_code: 'qr-code-data',
    qr_code_text: 'pix-copy-paste',
    qr_code_expires_at: '2026-09-24T00:30:00.000Z',
  });
}

function mockReceivable() {
  prisma.receivable.findUnique.mockResolvedValue({
    id: 'receivable-1',
    clientId: 'client-1',
    clientReferenceId: 'reference-1',
    renewalId: null,
    purpose: 'MENSALIDADE',
    description: 'Mensalidade setembro',
    amount: new Prisma.Decimal('123.45'),
    dueDate: new Date('2026-09-24T00:00:00.000Z'),
    status: 'PENDENTE',
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    client: {
      id: 'client-1',
      name: 'Cliente Teste',
      reference: 'CLI-1',
      phoneNormalized: '5544999999999',
    },
    clientReference: {
      id: 'reference-1',
      reference: 'REF-1',
      status: 'ATIVO',
      plan: { name: 'Plano Base' },
    },
    renewal: null,
    paymentTransaction: null,
    paymentIntents: [],
  });
}

function mockCreatedIntent() {
  prisma.paymentIntent.create.mockImplementation(({ data }) =>
    Promise.resolve({
      id: 'payment-intent-1',
      receivableId: data.receivableId,
      paymentGroupId: null,
      provider: data.provider,
      providerTransactionId: data.providerTransactionId,
      externalStatus: data.externalStatus,
      externalDepixId: data.externalDepixId,
      blockchainTxId: data.blockchainTxId,
      status: data.status,
      amount: data.amount,
      pixCopyPaste: data.pixCopyPaste,
      qrCodeData: data.qrCodeData,
      expiresAt: data.expiresAt,
      paidAt: null,
      lastSyncAt: data.lastSyncAt,
      failureCode: null,
      failureMessage: null,
      createdAt: fixedNow,
      updatedAt: fixedNow,
    }),
  );
}

describe('Payment provider DI pipeline', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    vi.clearAllMocks();
    configuredProvider = 'FASTFLOW';
    credentialActive = true;
    prisma.paymentProviderCredential.findFirst.mockImplementation(findCredential);
    prisma.paymentIntent.findFirst.mockResolvedValue(null);
    prisma.clientEvent.create.mockResolvedValue({ id: 'event-1' });
    mockProviderPixResponse();
    mockReceivable();
    mockCreatedIntent();
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('declares explicit FastDepix dependencies for FastFlow and FastPay runtime DI', () => {
    const fastFlowDeps = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      FastFlowPaymentProvider,
    ) as Array<{ index: number; param: unknown }> | undefined;
    const fastPayDeps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, FastPayPaymentProvider) as
      Array<{ index: number; param: unknown }> | undefined;

    expect(fastFlowDeps).toEqual(
      expect.arrayContaining([
        { index: 0, param: FastDepixApiClient },
        { index: 1, param: PaymentProviderCredentialsService },
      ]),
    );
    expect(fastPayDeps).toEqual(
      expect.arrayContaining([
        { index: 0, param: FastDepixApiClient },
        { index: 1, param: PaymentProviderCredentialsService },
      ]),
    );
  });

  it('resolves FastFlowPaymentProvider via Nest and creates PIX with one active token lookup', async () => {
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    expect(provider).toMatchObject({
      apiClient,
      credentials: expect.any(PaymentProviderCredentialsService),
    });

    const result = await provider.createPix(pixInput());

    expect(result).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: 'fastdepix-transaction-1',
      externalStatus: 'pending',
      amount: new Prisma.Decimal('123.45'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-09-24T00:30:00.000Z'),
    });
    expect(JSON.stringify(result)).not.toContain('fastflow-active-token');

    expect(prisma.paymentProviderCredential.findFirst).toHaveBeenCalledTimes(1);
    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
    expect(apiClient.createTransaction).toHaveBeenCalledWith('fastflow-active-token', {
      amount: 123.45,
      user: { name: 'Cliente Teste' },
      payer_phone: '5544999999999',
      notification_url: 'https://crm.example.test/payment-webhooks/fastflow',
    });
  });

  it('normalizes numeric FastFlow transaction IDs to the internal string contract', async () => {
    apiClient.createTransaction.mockResolvedValueOnce({
      id: 75148,
      status: 'pending',
      amount: '30.00',
      depix_transaction_id: 'depix-1',
      blockchain_tx_id: null,
      qr_code: 'qr-code-data',
      qr_code_text: 'pix-copy-paste',
      qr_code_expires_at: '2026-09-24T00:30:00.000Z',
    });
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    const result = await provider.createPix({
      ...pixInput(),
      amount: new Prisma.Decimal('30.00'),
    });

    expect(result.providerTransactionId).toBe('75148');
    expect(typeof result.providerTransactionId).toBe('string');
  });

  it('keeps string FastFlow transaction IDs unchanged', async () => {
    apiClient.createTransaction.mockResolvedValueOnce({
      id: '75148',
      status: 'pending',
      amount: '30.00',
      depix_transaction_id: 'depix-1',
      blockchain_tx_id: null,
      qr_code: 'qr-code-data',
      qr_code_text: 'pix-copy-paste',
      qr_code_expires_at: '2026-09-24T00:30:00.000Z',
    });
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    await expect(provider.createPix(pixInput())).resolves.toMatchObject({
      providerTransactionId: '75148',
    });
  });

  it('keeps alphanumeric FastFlow transaction IDs as opaque strings', async () => {
    apiClient.createTransaction.mockResolvedValueOnce({
      id: 'abc-123',
      status: 'pending',
      amount: '30.00',
      depix_transaction_id: 'depix-1',
      blockchain_tx_id: null,
      qr_code: 'qr-code-data',
      qr_code_text: 'pix-copy-paste',
      qr_code_expires_at: '2026-09-24T00:30:00.000Z',
    });
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    await expect(provider.createPix(pixInput())).resolves.toMatchObject({
      providerTransactionId: 'abc-123',
    });
  });

  it.each([undefined, null, '', ' '])(
    'rejects missing FastFlow transaction ID %s without creating a local intent',
    async (id) => {
      apiClient.createTransaction.mockResolvedValueOnce({
        id,
        status: 'pending',
        amount: '30.00',
        depix_transaction_id: 'depix-1',
        blockchain_tx_id: null,
        qr_code: 'qr-code-data',
        qr_code_text: 'pix-copy-paste',
        qr_code_expires_at: '2026-09-24T00:30:00.000Z',
      });
      app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
        logger: false,
      });
      const service = app.get(FinanceService);

      await expect(service.createReceivablePix('receivable-1', 'user-1')).rejects.toThrow(
        'Resposta da API de pagamentos sem transacao obrigatoria.',
      );
      expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
    },
  );

  it('resolves FastPayPaymentProvider via Nest and creates PIX without undefined deps', async () => {
    configuredProvider = 'FASTPAY';
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastPayPaymentProvider);

    expect(provider).toMatchObject({
      apiClient,
      credentials: expect.any(PaymentProviderCredentialsService),
    });

    const result = await provider.createPix(pixInput('FASTPAY'));

    expect(result).toMatchObject({
      provider: 'FASTPAY',
      providerTransactionId: 'fastdepix-transaction-1',
      pixCopyPaste: 'pix-copy-paste',
    });
    expect(JSON.stringify(result)).not.toContain('fastpay-active-token');
    expect(prisma.paymentProviderCredential.findFirst).toHaveBeenCalledTimes(1);
    expect(apiClient.createTransaction).toHaveBeenCalledWith('fastpay-active-token', {
      amount: 123.45,
      user: { name: 'Cliente Teste' },
      payer_phone: '5544999999999',
      notification_url: 'https://crm.example.test/payment-webhooks/fastpay',
    });
  });

  it('resolves PaymentProviderRegistryService via Nest and selects FastFlow without undefined deps', async () => {
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const registry = app.get(PaymentProviderRegistryService);
    expect(app.get(MockPaymentProvider)).toBeDefined();
    expect(app.get(FastFlowPaymentProvider)).toBeDefined();
    expect(app.get(FastPayPaymentProvider)).toBeDefined();

    await expect(registry.createPix(pixInput())).resolves.toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: 'fastdepix-transaction-1',
    });

    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('resolves PaymentProviderRegistryService via Nest and selects FastPay without undefined deps', async () => {
    configuredProvider = 'FASTPAY';
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const registry = app.get(PaymentProviderRegistryService);

    await expect(registry.createPix(pixInput('FASTPAY'))).resolves.toMatchObject({
      provider: 'FASTPAY',
      providerTransactionId: 'fastdepix-transaction-1',
    });

    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
    expect(apiClient.createTransaction).toHaveBeenCalledWith(
      'fastpay-active-token',
      expect.objectContaining({
        notification_url: 'https://crm.example.test/payment-webhooks/fastpay',
      }),
    );
  });

  it('runs FinanceService.createReceivablePix through registry, credentials and mocked provider client', async () => {
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const service = app.get(FinanceService);

    await expect(service.createReceivablePix('receivable-1', 'user-1')).resolves.toMatchObject({
      id: 'payment-intent-1',
      provider: 'FASTFLOW',
      providerTransactionId: 'fastdepix-transaction-1',
      pixCopyPaste: 'pix-copy-paste',
    });

    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: 'FASTFLOW',
          providerTransactionId: 'fastdepix-transaction-1',
          pixCopyPaste: 'pix-copy-paste',
        }),
      }),
    );
    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('runs FinanceService.createReceivablePix through FastFlow with a numeric provider transaction ID', async () => {
    apiClient.createTransaction.mockResolvedValueOnce({
      id: 75148,
      status: 'pending',
      amount: '30.00',
      depix_transaction_id: 'depix-1',
      blockchain_tx_id: null,
      qr_code: 'qr-code-data',
      qr_code_text: 'pix-copy-paste',
      qr_code_expires_at: '2026-09-24T00:30:00.000Z',
    });
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const service = app.get(FinanceService);

    await expect(service.createReceivablePix('receivable-1', 'user-1')).resolves.toMatchObject({
      id: 'payment-intent-1',
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      status: 'WAITING_PAYMENT',
      amount: '30.00',
    });
    expect(prisma.paymentIntent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerTransactionId: '75148',
          amount: new Prisma.Decimal('30.00'),
          status: 'WAITING_PAYMENT',
        }),
      }),
    );
  });

  it('runs FinanceService.createReceivablePix through the FastPay pipeline with mocked HTTP', async () => {
    configuredProvider = 'FASTPAY';
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const service = app.get(FinanceService);

    await expect(service.createReceivablePix('receivable-1', 'user-1')).resolves.toMatchObject({
      id: 'payment-intent-1',
      provider: 'FASTPAY',
      providerTransactionId: 'fastdepix-transaction-1',
      pixCopyPaste: 'pix-copy-paste',
    });

    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.paymentIntent.create).toHaveBeenCalledTimes(1);
  });

  it('returns a controlled error when FastFlow has no active credential', async () => {
    prisma.paymentProviderCredential.findFirst.mockResolvedValue(null);
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    await expect(provider.createPix({ ...pixInput(), notificationUrl: null })).rejects.toThrow(
      NotFoundException,
    );

    expect(apiClient.createTransaction).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('returns a controlled error when FastPay has no active credential', async () => {
    configuredProvider = 'FASTPAY';
    prisma.paymentProviderCredential.findFirst.mockResolvedValue(null);
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastPayPaymentProvider);

    await expect(
      provider.createPix({ ...pixInput('FASTPAY'), notificationUrl: null }),
    ).rejects.toThrow(NotFoundException);

    expect(apiClient.createTransaction).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
  });

  it('does not use an inactive credential for provider createPix', async () => {
    credentialActive = false;
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const provider = app.get(FastFlowPaymentProvider);

    await expect(provider.createPix(pixInput())).rejects.toThrow(NotFoundException);

    expect(apiClient.createTransaction).not.toHaveBeenCalled();
  });

  it('keeps provider errors from creating a local payment intent', async () => {
    apiClient.createTransaction.mockRejectedValueOnce(
      new NotFoundException('Transacao de pagamento nao encontrada no provider.'),
    );
    app = await NestFactory.createApplicationContext(PaymentProviderDiTestModule, {
      logger: false,
    });
    const service = app.get(FinanceService);

    await expect(service.createReceivablePix('receivable-1', 'user-1')).rejects.toThrow(
      NotFoundException,
    );

    expect(apiClient.createTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.paymentIntent.create).not.toHaveBeenCalled();
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });
});
