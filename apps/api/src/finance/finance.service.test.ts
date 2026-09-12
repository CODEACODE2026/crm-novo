import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { FinanceService } from './finance.service';

const actorUserId = '22222222-2222-4222-8222-222222222222';

function createFinancePrisma() {
  const entryCategory = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Renovação',
    type: 'ENTRADA' as const,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const expenseCategory = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Servidor',
    type: 'SAIDA' as const,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const client = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Cliente Financeiro',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'FIN-001',
    planId: '55555555-5555-4555-8555-555555555555',
    recurringValue: new Prisma.Decimal('50.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 5,
    notes: null,
    status: 'ATIVO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const renewal = {
    id: '66666666-6666-4666-8666-666666666666',
    clientId: client.id,
    planId: client.planId,
    planName: 'Mensal',
    previousDueDate: parseBusinessDate('2026-09-10'),
    newDueDate: parseBusinessDate('2026-10-10'),
    amount: new Prisma.Decimal('50.00'),
    idempotencyKey: 'renewal-key',
    createdByUserId: actorUserId,
    createdAt: new Date(),
  };
  const receivable = {
    id: '77777777-7777-4777-8777-777777777777',
    clientId: client.id,
    renewalId: renewal.id,
    description: 'Renovacao - Plano Mensal',
    amount: new Prisma.Decimal('50.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    status: 'PENDENTE' as const,
    paidAt: null as Date | null,
    canceledAt: null as Date | null,
    cancelReason: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const categories = [entryCategory, expenseCategory];
  const transactions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const paymentIntents: Array<Record<string, unknown>> = [];
  const webhookEvents: Array<Record<string, unknown>> = [];
  const provider = {
    createPix: vi.fn(() => {
      const providerTransactionId = `mock-provider-${paymentIntents.length + 1}`;

      return Promise.resolve({
        provider: 'MOCK' as const,
        providerTransactionId,
        externalStatus: 'pending',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'WAITING_PAYMENT' as const,
        amount: receivable.amount,
        pixCopyPaste: `MOCK-PIX|${providerTransactionId}|50.00`,
        qrCodeData: `mock://pix/${providerTransactionId}`,
        expiresAt: new Date('2026-10-10T00:30:00.000Z'),
      });
    }),
    getPixStatus: vi.fn(),
    markPixPaid: vi.fn(),
  };

  const tx = {
    financialCategory: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; name?: string; type?: string; active?: boolean };
      }) =>
        Promise.resolve(
          categories.find(
            (category) =>
              (where.id === undefined || category.id === where.id) &&
              (where.name === undefined || category.name === where.name) &&
              (where.type === undefined || category.type === where.type) &&
              (where.active === undefined || category.active === where.active),
          ) ?? null,
        ),
    },
    financialTransaction: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        if (
          data.receivableId &&
          transactions.some((transaction) => transaction.receivableId === data.receivableId)
        ) {
          throw new ConflictException('duplicate receivable transaction');
        }

        const transaction = {
          id: `transaction-${transactions.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        transactions.push(transaction);
        return Promise.resolve(transaction);
      },
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const transaction = transactions.find((item) => item.id === where.id);

        if (!transaction) {
          throw new Error('Transaction not found');
        }

        return Promise.resolve({
          ...transaction,
          category: categories.find((category) => category.id === transaction.categoryId),
          client,
          receivable,
        });
      },
    },
    receivable: {
      findUnique: (args?: {
        include?: { paymentIntents?: { where?: { status?: { in: string[] } } } };
      }) => {
        const allowedStatuses = args?.include?.paymentIntents?.where?.status?.in;

        return Promise.resolve({
          ...receivable,
          client,
          renewal,
          paymentTransaction:
            transactions.find((transaction) => transaction.receivableId === receivable.id) ?? null,
          paymentIntents: allowedStatuses
            ? paymentIntents.filter((intent) => allowedStatuses.includes(String(intent.status)))
            : paymentIntents,
        });
      },
      update: ({ data }: { data: Partial<typeof receivable> }) => {
        Object.assign(receivable, data);
        return Promise.resolve({
          ...receivable,
          client,
          renewal,
          paymentTransaction: null,
          paymentIntents,
        });
      },
      count: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === receivable.id ? 1 : 0),
    },
    paymentIntent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const intent = {
          id: `intent-${paymentIntents.length + 1}`,
          createdAt: new Date('2026-10-10T00:00:00.000Z'),
          updatedAt: new Date('2026-10-10T00:00:00.000Z'),
          paidAt: null,
          lastSyncAt: null,
          failureCode: null,
          failureMessage: null,
          ...data,
        };
        paymentIntents.push(intent);
        return Promise.resolve(intent);
      },
      findFirst: ({
        where,
      }: {
        where: { receivableId?: string; provider?: string; providerTransactionId?: string };
      }) =>
        Promise.resolve(
          paymentIntents.find(
            (intent) =>
              (where.receivableId === undefined || intent.receivableId === where.receivableId) &&
              (where.provider === undefined || intent.provider === where.provider) &&
              (where.providerTransactionId === undefined ||
                intent.providerTransactionId === where.providerTransactionId),
          ) ?? null,
        ),
      findMany: ({ where }: { where: { receivableId: string } }) =>
        Promise.resolve(
          paymentIntents.filter((intent) => intent.receivableId === where.receivableId),
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(paymentIntents.find((intent) => intent.id === where.id) ?? null),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const intent = paymentIntents.find((item) => item.id === where.id);
        if (!intent) throw new Error('Intent not found');
        return Promise.resolve(intent);
      },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const intent = paymentIntents.find((item) => item.id === where.id);
        if (!intent) throw new Error('Intent not found');
        Object.assign(intent, data, { updatedAt: new Date('2026-10-10T00:01:00.000Z') });
        return Promise.resolve(intent);
      },
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; status?: { not: string } };
        data: Record<string, unknown>;
      }) => {
        const intent = paymentIntents.find((item) => item.id === where.id);

        if (!intent || (where.status?.not && intent.status === where.status.not)) {
          return Promise.resolve({ count: 0 });
        }

        Object.assign(intent, data, { updatedAt: new Date('2026-10-10T00:01:00.000Z') });
        return Promise.resolve({ count: 1 });
      },
    },
    clientEvent: {
      findFirst: ({
        where,
      }: {
        where: { type?: string; metadata?: { path: string[]; equals: string } };
      }) =>
        Promise.resolve(
          events.find((event) => {
            const metadataKey = where.metadata?.path[0];

            return (
              (where.type === undefined || event.type === where.type) &&
              typeof event.metadata === 'object' &&
              event.metadata !== null &&
              metadataKey !== undefined &&
              metadataKey in event.metadata &&
              (event.metadata as Record<string, unknown>)[metadataKey] === where.metadata?.equals
            );
          }) ?? null,
        ),
      create: ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return Promise.resolve(data);
      },
    },
    paymentWebhookEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        if (
          webhookEvents.some(
            (event) =>
              event.provider === data.provider &&
              event.providerTransactionId === data.providerTransactionId &&
              event.status === data.status &&
              event.eventKey === data.eventKey,
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate webhook', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }

        webhookEvents.push(data);
        return Promise.resolve(data);
      },
    },
  };

  return {
    entryCategory,
    expenseCategory,
    receivable,
    paymentIntents,
    transactions,
    events,
    prisma: {
      financialCategory: tx.financialCategory,
      financialTransaction: {
        ...tx.financialTransaction,
        findUnique: ({ where }: { where: { id: string } }) =>
          tx.financialTransaction.findUniqueOrThrow({ where }).catch(() => null),
      },
      client: {
        count: ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === client.id ? 1 : 0),
      },
      receivable: tx.receivable,
      paymentIntent: tx.paymentIntent,
      paymentWebhookEvent: tx.paymentWebhookEvent,
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    },
    provider,
    credentials: { getWebhookSecret: vi.fn().mockResolvedValue('webhook-secret') },
    config: { get: () => undefined },
    webhookEvents,
  };
}

function createWebhookSignature(payload: string, secret = 'webhook-secret') {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`;
}

describe('FinanceService', () => {
  it('pays a pending receivable once and registers the client timeline', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const transaction = await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-10-10'));
    expect(fake.transactions).toHaveLength(1);
    expect(transaction).toMatchObject({
      type: 'ENTRADA',
      origin: 'RECEIVABLE_PAYMENT',
      amount: '50.00',
      clientId: '44444444-4444-4444-8444-444444444444',
      receivableId: fake.receivable.id,
    });
    expect(
      fake.events.some(
        (event) =>
          event.type === 'PAYMENT_REGISTERED' &&
          typeof event.metadata === 'object' &&
          event.metadata !== null &&
          'receivableId' in event.metadata &&
          event.metadata.receivableId === fake.receivable.id,
      ),
    ).toBe(true);

    await expect(
      service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
        actorUserId,
      ),
    ).rejects.toThrow('Apenas contas pendentes podem receber baixa.');
    expect(fake.transactions).toHaveLength(1);
  });

  it('cancels only pending receivables with a reason and no financial transaction', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await service.cancelReceivable(
      fake.receivable.id,
      { reason: 'Cobrança criada incorretamente.' },
      actorUserId,
    );

    expect(fake.receivable.status).toBe('CANCELADO');
    expect(fake.receivable.cancelReason).toBe('Cobrança criada incorretamente.');
    expect(fake.receivable.canceledAt).toBeInstanceOf(Date);
    expect(fake.transactions).toHaveLength(0);
    expect(
      fake.events.some(
        (event) =>
          event.type === 'RECEIVABLE_CANCELED' &&
          typeof event.metadata === 'object' &&
          event.metadata !== null &&
          'receivableId' in event.metadata &&
          event.metadata.receivableId === fake.receivable.id,
      ),
    ).toBe(true);
  });

  it('rejects an expense using an entry category', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.createManualExpense(
        {
          description: 'Servidor VPS',
          amount: 80,
          categoryId: fake.entryCategory.id,
          transactionDate: '2026-10-10',
        },
        actorUserId,
      ),
    ).rejects.toThrow('Categoria incompativel com o tipo da movimentacao.');
  });

  it('generates a mock PIX for a pending receivable', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);

    expect(intent).toMatchObject({
      receivableId: fake.receivable.id,
      provider: 'MOCK',
      status: 'WAITING_PAYMENT',
      amount: '50.00',
      expiresAt: '2026-10-10T00:30:00.000Z',
    });
    expect(intent.pixCopyPaste).toContain('MOCK-PIX');
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
  });

  it('does not silently create another active PIX for the same receivable', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const first = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const second = await service.createReceivablePix(fake.receivable.id, actorUserId);

    expect(second.id).toBe(first.id);
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
  });

  it('keeps expired PIX history and allows a new PIX', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const expired = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.status = 'EXPIRED';
    const renewed = await service.createReceivablePix(fake.receivable.id, actorUserId);

    expect(expired.id).not.toBe(renewed.id);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.paymentIntents.map((intent) => intent.status)).toEqual([
      'EXPIRED',
      'WAITING_PAYMENT',
    ]);
  });

  it('confirms mock paid through provider sync and creates one financial write-off with timeline', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: parseBusinessDate('2026-10-10'),
      failureCode: null,
      failureMessage: null,
    });

    const paid = await service.syncPaymentIntent(intent.id, actorUserId);

    expect(paid.status).toBe('PAID');
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-10-10'));
    expect(fake.transactions).toHaveLength(1);
    expect(fake.transactions[0]).toMatchObject({
      origin: 'RECEIVABLE_PAYMENT',
      receivableId: fake.receivable.id,
    });
    expect(
      fake.events.filter(
        (event) =>
          event.type === 'PAYMENT_REGISTERED' &&
          typeof event.metadata === 'object' &&
          event.metadata !== null &&
          'paymentIntentId' in event.metadata &&
          event.metadata.paymentIntentId === intent.id,
      ),
    ).toHaveLength(1);
  });

  it('keeps repeated paid sync idempotent', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: parseBusinessDate('2026-10-10'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.transactions).toHaveLength(1);
    expect(
      fake.events.filter(
        (event) =>
          event.type === 'PAYMENT_REGISTERED' &&
          typeof event.metadata === 'object' &&
          event.metadata !== null &&
          'paymentIntentId' in event.metadata &&
          event.metadata.paymentIntentId === intent.id,
      ),
    ).toHaveLength(1);
  });

  it('keeps concurrent paid sync to one financial write-off', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: parseBusinessDate('2026-10-10'),
      failureCode: null,
      failureMessage: null,
    });

    await Promise.all([
      service.syncPaymentIntent(intent.id, actorUserId),
      service.syncPaymentIntent(intent.id, actorUserId),
    ]);

    expect(fake.transactions).toHaveLength(1);
  });

  it('processes a valid paid webhook once with HMAC over raw body', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-123';
    const rawPayload = JSON.stringify({ transaction_id: 'tx-123', status: 'paid' });

    const result = await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );

    expect(result).toMatchObject({ id: intent.id, status: 'PAID', externalStatus: 'paid' });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.webhookEvents).toHaveLength(1);
  });

  it('rejects payment webhooks with an invalid signature', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-123';
    const rawPayload = JSON.stringify({ transaction_id: 'tx-123', status: 'paid' });

    await expect(
      service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(`${rawPayload}changed`),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      ),
    ).rejects.toThrow('Assinatura do webhook de pagamento invalida.');
    expect(fake.transactions).toHaveLength(0);
  });

  it('keeps repeated paid webhooks idempotent', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTPAY';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-456';
    const rawPayload = JSON.stringify({ transaction_id: 'tx-456', status: 'paid' });

    await service.processPaymentWebhook(
      'FASTPAY',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );
    await service.processPaymentWebhook(
      'FASTPAY',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );

    expect(fake.transactions).toHaveLength(1);
    expect(fake.webhookEvents).toHaveLength(1);
  });

  it('does not write off approved or refunded statuses from provider callbacks', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-789';

    for (const status of ['approved', 'refunded']) {
      const rawPayload = JSON.stringify({ transaction_id: 'tx-789', status });
      await service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      );
    }

    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.paymentIntents.at(0)).toMatchObject({
      status: 'REFUNDED',
      externalStatus: 'refunded',
    });
  });
});
