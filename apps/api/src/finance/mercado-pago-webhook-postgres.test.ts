import { createHmac, randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FinanceService } from './finance.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('Mercado Pago webhook PostgreSQL concurrency', () => {
  const prisma = new PrismaClient();
  const createdIds = {
    users: new Set<string>(),
    categories: new Set<string>(),
    receivables: new Set<string>(),
    intents: new Set<string>(),
    credentials: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.paymentWebhookDelivery.deleteMany({
      where: { paymentIntentId: { in: [...createdIds.intents] } },
    });
    await prisma.paymentWebhookEvent.deleteMany({
      where: { paymentIntentId: { in: [...createdIds.intents] } },
    });
    await prisma.receivableAuditEvent.deleteMany({
      where: { paymentIntentId: { in: [...createdIds.intents] } },
    });
    await prisma.financialTransaction.deleteMany({
      where: { receivableId: { in: [...createdIds.receivables] } },
    });
    await prisma.paymentIntent.deleteMany({ where: { id: { in: [...createdIds.intents] } } });
    await prisma.paymentProviderCredential.deleteMany({
      where: { id: { in: [...createdIds.credentials] } },
    });
    await prisma.receivable.deleteMany({ where: { id: { in: [...createdIds.receivables] } } });
    await prisma.financialCategory.deleteMany({
      where: { id: { in: [...createdIds.categories] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [...createdIds.users] } } });
    await prisma.$disconnect();
  });

  it('allows webhook and manual sync to create one financial settlement', async () => {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        name: 'WEBHOOK1 QA',
        email: `webhook1-${suffix}@example.test`,
        passwordHash: 'not-used-in-test',
      },
    });
    createdIds.users.add(user.id);
    const category = await prisma.financialCategory.create({
      data: { name: `WEBHOOK1 ${suffix}`, type: 'ENTRADA' },
    });
    createdIds.categories.add(category.id);
    const receivable = await prisma.receivable.create({
      data: {
        purpose: 'MANUAL_CHARGE',
        description: 'Mercado Pago WEBHOOK1 concurrency proof',
        amount: new Prisma.Decimal('50.00'),
        dueDate: new Date('2026-11-02T00:00:00.000Z'),
        financialCategoryId: category.id,
        payerName: 'WEBHOOK1 QA',
        payerPhone: '+55 11 99999-0000',
        payerPhoneNormalized: '5511999990000',
      },
    });
    createdIds.receivables.add(receivable.id);
    const credentialFingerprint = `sha256:credential-${suffix}`;
    const accountIdHash = `sha256:account-${suffix}`;
    const applicationId = `sandbox-application-${suffix}`;
    const credential = await prisma.paymentProviderCredential.create({
      data: {
        provider: 'MERCADO_PAGO',
        environment: 'TEST',
        name: `ENV-PROOF-FIX1 ${suffix}`,
        tokenEncrypted: 'not-a-real-token',
        tokenLastFour: 'TEST',
        environmentProofStatus: 'VERIFIED_TEST',
        environmentProofEnvironment: 'TEST',
        environmentProofAccountIdHash: accountIdHash,
        environmentProofCredentialFingerprint: credentialFingerprint,
        environmentProofVerifiedAt: new Date(),
        environmentProofExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdIds.credentials.add(credential.id);
    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: receivable.id,
        provider: 'MERCADO_PAGO',
        providerEnvironment: 'TEST',
        providerTransactionId: `ORD-${suffix}`,
        providerExternalReference: `REF-${suffix}`,
        providerCredentialId: credential.id,
        providerCredentialFingerprint: credentialFingerprint,
        providerAccountIdHash: accountIdHash,
        providerApplicationId: applicationId,
        externalDepixId: `PAY-${suffix}`,
        externalStatus: 'action_required/waiting_transfer',
        status: 'WAITING_PAYMENT',
        amount: new Prisma.Decimal('50.00'),
      },
    });
    createdIds.intents.add(intent.id);
    const transaction = {
      provider: 'MERCADO_PAGO' as const,
      providerTransactionId: intent.providerTransactionId!,
      externalReference: intent.providerExternalReference,
      externalDepixId: intent.externalDepixId,
      externalStatus: 'processed/accredited',
      blockchainTxId: null,
      status: 'PAID' as const,
      amount: new Prisma.Decimal('50.00'),
      pixCopyPaste: null,
      qrCodeData: null,
      expiresAt: null,
      paidAt: new Date('2026-11-02T12:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
      currency: 'BRL',
      environment: 'TEST' as const,
      paymentMethodId: 'pix',
      paymentMethodType: 'bank_transfer',
      liveMode: false,
      paymentCount: 1,
      orderTotalAmount: new Prisma.Decimal('50.00'),
      orderTotalPaidAmount: new Prisma.Decimal('50.00'),
      countryCode: 'BRA',
      orderStatus: 'processed',
      orderStatusDetail: 'accredited',
      paymentStatus: 'processed',
      paymentStatusDetail: 'accredited',
      providerCredentialId: credential.id,
      providerCredentialFingerprint: credentialFingerprint,
      providerAccountIdHash: accountIdHash,
      providerApplicationId: applicationId,
      environmentProofExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    let releaseWebhookGet!: (value: typeof transaction) => void;
    const getPixTransaction = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof transaction>((resolve) => {
            releaseWebhookGet = resolve;
          }),
      )
      .mockResolvedValue(transaction);
    const provider = {
      createPix: () => Promise.reject(new Error('not used')),
      getPixStatus: () => Promise.resolve(transaction),
      getPixTransaction,
    };
    const service = new FinanceService(
      prisma as never,
      provider,
      {
        getWebhookSecret: () => Promise.resolve('webhook-secret'),
        getActiveMercadoPagoAccess: () =>
          Promise.resolve({
            token: 'not-a-real-token',
            credentialId: credential.id,
            environment: 'TEST',
            credentialFingerprint,
            accountIdHash,
            proofExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
          }),
      } as never,
      { get: (key: string) => (key === 'MERCADO_PAGO_ENVIRONMENT' ? 'TEST' : undefined) } as never,
    );
    const requestId = `REQ-${suffix}`;
    const timestamp = String(Date.now());
    const manifest = `id:${intent.providerTransactionId};request-id:${requestId};ts:${timestamp};`;
    const signature = `ts=${timestamp},v1=${createHmac('sha256', 'webhook-secret')
      .update(manifest)
      .digest('hex')}`;

    const payload = {
      action: 'order.processed',
      type: 'order',
      live_mode: false,
      data: { id: intent.providerTransactionId },
    };
    const metadata = { requestId, dataId: intent.providerTransactionId!, topic: 'order' };
    const webhook = service.processPaymentWebhook(
      'MERCADO_PAGO',
      signature,
      undefined,
      payload,
      metadata,
    );

    await vi.waitFor(() => expect(getPixTransaction).toHaveBeenCalledTimes(1));
    await expect(
      service.processPaymentWebhook('MERCADO_PAGO', signature, undefined, payload, metadata),
    ).rejects.toThrow('ja esta em processamento');

    await service.syncPaymentIntent(intent.id, user.id);
    releaseWebhookGet(transaction);
    await webhook;

    await expect(
      prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent.id } }),
    ).resolves.toMatchObject({
      status: 'PAID',
      externalDepixId: intent.externalDepixId,
    });
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } }),
    ).resolves.toMatchObject({
      status: 'PAGO',
    });
    await expect(
      prisma.financialTransaction.count({ where: { receivableId: receivable.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.receivableAuditEvent.count({
        where: { receivableId: receivable.id, eventType: 'PAID' },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.paymentWebhookDelivery.count({
        where: { paymentIntentId: intent.id, status: 'COMPLETED' },
      }),
    ).resolves.toBe(1);
    expect(getPixTransaction).toHaveBeenCalledTimes(2);
  });
});
