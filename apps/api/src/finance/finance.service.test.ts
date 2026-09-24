import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { CreateFinancialCategoryDto } from './dto/create-financial-category.dto';
import { FinanceService } from './finance.service';

const actorUserId = '22222222-2222-4222-8222-222222222222';

function createAdvisoryLockSimulator() {
  const tails = new Map<string, Promise<void>>();

  return async (key: string, releaseLocks: Array<() => void>) => {
    const previous = tails.get(key) ?? Promise.resolve();
    let releaseCurrent: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    tails.set(
      key,
      previous.then(() => current),
    );
    await previous;
    releaseLocks.push(releaseCurrent);
  };
}

type TestCategory = {
  active: boolean;
  id: string;
  name: string;
  type: 'ENTRADA' | 'SAIDA';
};

function categoryMatchesWhere(
  category: TestCategory,
  where: {
    active?: boolean;
    id?: string;
    name?: string | { equals: string; mode?: 'insensitive' };
    NOT?: { id?: string };
    type?: string;
  },
) {
  const nameMatches =
    where.name === undefined
      ? true
      : typeof where.name === 'string'
        ? category.name === where.name
        : where.name.mode === 'insensitive'
          ? category.name.toLocaleLowerCase('pt-BR') ===
            where.name.equals.toLocaleLowerCase('pt-BR')
          : category.name === where.name.equals;

  return (
    (where.id === undefined || category.id === where.id) &&
    nameMatches &&
    (where.type === undefined || category.type === where.type) &&
    (where.active === undefined || category.active === where.active) &&
    (where.NOT?.id === undefined || category.id !== where.NOT.id)
  );
}

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
    status: 'ATIVO' as 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const plan = {
    id: client.planId,
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('50.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const clientReference = {
    id: '99999999-9999-4999-8999-999999999999',
    clientId: client.id,
    reference: client.reference,
    planId: client.planId,
    recurringValue: client.recurringValue,
    dueDate: client.dueDate,
    billingAnchorDay: client.billingAnchorDay,
    billingNoticeDays: client.billingNoticeDays,
    notes: client.notes,
    status: client.status,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    plan,
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
    clientReferenceId: clientReference.id,
    renewalId: renewal.id as string | null,
    purpose: 'RENEWAL' as 'RENEWAL' | 'INITIAL_ACTIVATION',
    description: 'Renovacao - Plano Mensal',
    amount: new Prisma.Decimal('50.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    status: 'PENDENTE',
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
  const acquireAdvisoryLock = createAdvisoryLockSimulator();
  const lockContext = new AsyncLocalStorage<Array<() => void>>();
  const executeRawUnsafe = vi.fn(async (_query: string, ...values: unknown[]) => {
    await acquireAdvisoryLock(String(values[0]), lockContext.getStore() ?? []);
    return 0;
  });
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
    getPixTransaction: vi.fn(),
    cancelPix: vi.fn(),
    markPixPaid: vi.fn(),
  };

  const tx = {
    $executeRawUnsafe: executeRawUnsafe,
    financialCategory: {
      findFirst: ({
        where,
      }: {
        where: {
          id?: string;
          name?: string | { equals: string; mode?: 'insensitive' };
          type?: string;
          active?: boolean;
          NOT?: { id?: string };
        };
      }) =>
        Promise.resolve(
          categories.find((category) => categoryMatchesWhere(category, where)) ?? null,
        ),
      findMany: () =>
        Promise.resolve(
          [...categories].sort((left, right) => {
            if (left.type !== right.type) return left.type.localeCompare(right.type);
            if (left.active !== right.active) return left.active ? -1 : 1;
            return left.name.localeCompare(right.name);
          }),
        ),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(categories.find((category) => category.id === where.id) ?? null),
      create: ({
        data,
      }: {
        data: { active: boolean; name: string; type: 'ENTRADA' | 'SAIDA' };
      }) => {
        const duplicate = categories.some(
          (category) => category.name === data.name && category.type === data.type,
        );

        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate category', {
            clientVersion: 'test',
            code: 'P2002',
          });
        }

        const category = {
          id: `category-${categories.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        categories.push(category);
        return Promise.resolve(category);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<{ active: boolean; name: string; type: 'ENTRADA' | 'SAIDA' }>;
      }) => {
        const category = categories.find((item) => item.id === where.id);
        if (!category) throw new Error('Category not found');

        const nextName = data.name ?? category.name;
        const nextType = data.type ?? category.type;
        const duplicate = categories.some(
          (item) => item.id !== category.id && item.name === nextName && item.type === nextType,
        );

        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError('Duplicate category', {
            clientVersion: 'test',
            code: 'P2002',
          });
        }

        Object.assign(category, data, { updatedAt: new Date() });
        return Promise.resolve(category);
      },
      delete: ({ where }: { where: { id: string } }) => {
        const index = categories.findIndex((category) => category.id === where.id);
        if (index === -1) throw new Error('Category not found');
        const [category] = categories.splice(index, 1);
        return Promise.resolve(category);
      },
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
          clientReference,
          receivable: { ...receivable, clientReference },
        });
      },
    },
    clientReference: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === clientReference.id ? clientReference : null),
      update: ({ data }: { data: Partial<typeof clientReference> }) => {
        Object.assign(clientReference, data);
        Object.assign(client, data);
        return Promise.resolve(clientReference);
      },
    },
    receivable: {
      findUnique: (args?: {
        include?: { paymentIntents?: { where?: { status?: { in: string[] } } } };
      }) => {
        const allowedStatuses = args?.include?.paymentIntents?.where?.status?.in;

        return Promise.resolve({
          ...receivable,
          client: { ...client, plan },
          clientReference: { ...clientReference, plan },
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
          client: { ...client, plan },
          clientReference: { ...clientReference, plan },
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
        where: {
          OR?: Array<{ receivableId?: { in: string[] } }>;
          provider?: string;
          providerTransactionId?: string;
          receivableId?: string;
          status?: { in: string[] };
        };
      }) =>
        Promise.resolve(
          paymentIntents.find((intent) => {
            const ids = where.OR?.[0]?.receivableId?.in;
            return (
              (ids === undefined || ids.includes(String(intent.receivableId))) &&
              (where.status === undefined || where.status.in.includes(String(intent.status))) &&
              (where.receivableId === undefined || intent.receivableId === where.receivableId) &&
              (where.provider === undefined || intent.provider === where.provider) &&
              (where.providerTransactionId === undefined ||
                intent.providerTransactionId === where.providerTransactionId)
            );
          }) ?? null,
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
    client: {
      update: ({ data }: { data: Partial<typeof client> }) => {
        Object.assign(client, data);
        return Promise.resolve(client);
      },
    },
    clientStatusHistory: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        events.push({ type: 'CLIENT_STATUS_HISTORY', ...data });
        return Promise.resolve(data);
      },
    },
    clientEvent: {
      findFirst: ({
        where,
      }: {
        where: { clientId?: string; type?: string; metadata?: { path: string[]; equals: string } };
      }) =>
        Promise.resolve(
          events.find((event) => {
            const metadataKey = where.metadata?.path[0];

            return (
              (where.clientId === undefined || event.clientId === where.clientId) &&
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
    messageDispatch: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    client,
    clientReference,
    plan,
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
        update: tx.client.update,
        count: ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === client.id ? 1 : 0),
      },
      clientStatusHistory: tx.clientStatusHistory,
      messageDispatch: tx.messageDispatch,
      receivable: tx.receivable,
      paymentIntent: tx.paymentIntent,
      paymentWebhookEvent: tx.paymentWebhookEvent,
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        const releaseLocks: Array<() => void> = [];
        const snapshots = {
          client: { ...client },
          clientReference: { ...clientReference },
          receivable: { ...receivable },
          transactions: transactions.map((transaction) => ({ ...transaction })),
          events: events.map((event) => ({ ...event })),
          paymentIntents: paymentIntents.map((intent) => ({ ...intent })),
          webhookEvents: webhookEvents.map((event) => ({ ...event })),
        };
        return lockContext.run(releaseLocks, async () => {
          try {
            return await callback(tx);
          } catch (error) {
            Object.assign(client, snapshots.client);
            Object.assign(clientReference, snapshots.clientReference);
            Object.assign(receivable, snapshots.receivable);
            transactions.splice(0, transactions.length, ...snapshots.transactions);
            events.splice(0, events.length, ...snapshots.events);
            paymentIntents.splice(0, paymentIntents.length, ...snapshots.paymentIntents);
            webhookEvents.splice(0, webhookEvents.length, ...snapshots.webhookEvents);
            throw error;
          } finally {
            releaseLocks.reverse().forEach((release) => release());
          }
        });
      },
    },
    provider,
    credentials: { getWebhookSecret: vi.fn().mockResolvedValue('webhook-secret') },
    config: { get: () => undefined },
    webhookEvents,
    tx,
  };
}

function createWebhookSignature(payload: string, secret = 'webhook-secret') {
  return `sha256=${createHmac('sha256', secret).update(Buffer.from(payload)).digest('hex')}`;
}

function reconciliationTransaction(
  overrides: Partial<{
    provider: 'FASTFLOW' | 'FASTPAY' | 'MOCK';
    providerTransactionId: string;
    externalStatus: string | null;
    status: 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'FAILED' | 'REFUNDED';
    amount: Prisma.Decimal;
    pixCopyPaste: string | null;
    qrCodeData: string | null;
    expiresAt: Date | null;
    paidAt: Date | null;
  }> = {},
) {
  return {
    provider: overrides.provider ?? ('FASTFLOW' as const),
    providerTransactionId: overrides.providerTransactionId ?? '75148',
    externalStatus: overrides.externalStatus ?? 'pending',
    externalDepixId: null,
    blockchainTxId: null,
    status: overrides.status ?? ('WAITING_PAYMENT' as const),
    amount: overrides.amount ?? new Prisma.Decimal('30.00'),
    pixCopyPaste: overrides.pixCopyPaste === undefined ? 'pix-copy-paste' : overrides.pixCopyPaste,
    qrCodeData: overrides.qrCodeData === undefined ? 'qr-code-data' : overrides.qrCodeData,
    expiresAt:
      overrides.expiresAt === undefined
        ? new Date('2026-09-24T01:00:00.000Z')
        : overrides.expiresAt,
    paidAt: overrides.paidAt ?? null,
    failureCode: null,
    failureMessage: null,
  };
}

async function createFastFlowWaitingPix(
  service: FinanceService,
  fake: ReturnType<typeof createFinancePrisma>,
) {
  fake.receivable.id = '0699aa7a-23d0-4463-9501-daf92c930bea';
  fake.receivable.amount = new Prisma.Decimal('30.00');
  const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
  Object.assign(fake.paymentIntents[0]!, {
    provider: 'FASTFLOW',
    providerTransactionId: '75148',
    externalStatus: 'pending',
    amount: new Prisma.Decimal('30.00'),
    pixCopyPaste: 'old-pix-copy-paste',
    qrCodeData: 'old-qr-code-data',
    expiresAt: new Date('2026-09-24T01:00:00.000Z'),
  });
  fake.provider.createPix.mockClear();

  return { ...intent, provider: 'FASTFLOW' as const, providerTransactionId: '75148' };
}

function createFinanceService(fake: ReturnType<typeof createFinancePrisma>) {
  return new FinanceService(
    fake.prisma as never,
    fake.provider,
    fake.credentials as never,
    fake.config as never,
  );
}

type SummaryReceivable = {
  amount: Prisma.Decimal;
  client: { name: string };
  clientId: string;
  clientReference: { reference: string };
  clientReferenceId: string;
  description: string;
  dueDate: Date;
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
};

function createReceivablesSummaryPrisma(receivables: SummaryReceivable[]) {
  const matchesStringFilter = (value: string, filter: { contains: string }) =>
    value.toLocaleLowerCase().includes(filter.contains.toLocaleLowerCase());
  const matchesDateFilter = (value: Date, filter: { gte?: Date; lte?: Date; lt?: Date }) => {
    const time = value.getTime();

    if (filter.gte && time < filter.gte.getTime()) return false;
    if (filter.lte && time > filter.lte.getTime()) return false;
    if (filter.lt && time >= filter.lt.getTime()) return false;
    return true;
  };
  const matchesWhere = (receivable: SummaryReceivable, where: Record<string, unknown>): boolean => {
    if (Array.isArray(where.AND)) {
      return where.AND.every((item) => matchesWhere(receivable, item as Record<string, unknown>));
    }

    if (Array.isArray(where.OR)) {
      return where.OR.some((item) => matchesWhere(receivable, item as Record<string, unknown>));
    }

    if (where.clientId && receivable.clientId !== where.clientId) return false;
    if (where.clientReferenceId && receivable.clientReferenceId !== where.clientReferenceId) {
      return false;
    }
    if (where.status && receivable.status !== where.status) return false;
    if (where.dueDate) {
      const dueDate = where.dueDate;

      if (dueDate instanceof Date && receivable.dueDate.getTime() !== dueDate.getTime()) {
        return false;
      }
      if (!(dueDate instanceof Date) && !matchesDateFilter(receivable.dueDate, dueDate)) {
        return false;
      }
    }
    if (where.description) {
      const filter = where.description as { contains: string };
      if (!matchesStringFilter(receivable.description, filter)) return false;
    }
    if (where.client) {
      const clientWhere = where.client as { name?: { contains: string } };
      if (clientWhere.name && !matchesStringFilter(receivable.client.name, clientWhere.name)) {
        return false;
      }
    }
    if (where.clientReference) {
      const referenceWhere = where.clientReference as { reference?: { contains: string } };
      if (
        referenceWhere.reference &&
        !matchesStringFilter(receivable.clientReference.reference, referenceWhere.reference)
      ) {
        return false;
      }
    }

    return true;
  };

  const receivable = {
    aggregate: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      const amount = receivables
        .filter((item) => matchesWhere(item, where))
        .reduce((total, item) => total.add(item.amount), new Prisma.Decimal('0.00'));

      return Promise.resolve({ _sum: { amount } });
    }),
  };

  return {
    receivable,
    $transaction: <T>(items: Array<Promise<T>>) => Promise.all(items),
  };
}

type SummaryPaymentIntent = {
  id: string;
  receivableClientId?: string | null;
  paymentGroupClientId?: string | null;
  status: string;
};

function createPaymentIntentsSummaryPrisma(paymentIntents: SummaryPaymentIntent[]) {
  return {
    paymentIntent: {
      count: vi.fn(
        ({
          where,
        }: {
          where: {
            OR: Array<{
              receivable?: { clientId: string };
              paymentGroup?: { clientId: string };
            }>;
          };
        }) => {
          const total = paymentIntents.filter((intent) =>
            where.OR.some((filter) => {
              if (filter.receivable)
                return intent.receivableClientId === filter.receivable.clientId;
              if (filter.paymentGroup) {
                return intent.paymentGroupClientId === filter.paymentGroup.clientId;
              }
              return false;
            }),
          ).length;

          return Promise.resolve(total);
        },
      ),
    },
  };
}

function createCycleRecorder(fake: ReturnType<typeof createFinancePrisma>) {
  const nextReceivables: Array<Record<string, unknown>> = [];
  const cycle = {
    ensureCurrentCycleReceivable: vi.fn().mockImplementation((clientReferenceId: string) => {
      const receivable = {
        clientReferenceId,
        purpose: 'RENEWAL',
        dueDate: fake.clientReference.dueDate,
        amount: fake.clientReference.recurringValue,
        status: 'PENDENTE',
      };
      nextReceivables.push(receivable);
      return Promise.resolve({ action: 'created', receivable });
    }),
  };

  return { cycle, nextReceivables };
}

function createReferralQualificationDouble(
  status: 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'CANCELED' = 'PENDING',
) {
  const referral = {
    id: 'referral-1',
    status,
    qualifiedAt:
      status === 'QUALIFIED' || status === 'REWARDED' ? new Date('2026-09-01T00:00:00.000Z') : null,
  };
  const referrals = {
    qualifyAfterInitialActivation: vi.fn(() => {
      if (referral.status !== 'PENDING') {
        return Promise.resolve(null);
      }

      referral.status = 'QUALIFIED';
      referral.qualifiedAt = new Date('2026-09-15T00:00:00.000Z');
      return Promise.resolve(referral);
    }),
  };

  return { referral, referrals };
}

function createGroupedFinancePrisma(options: { rollbackOnError?: boolean } = {}) {
  const rollbackOnError = options.rollbackOnError ?? true;
  const entryCategory = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Renovação',
    type: 'ENTRADA' as const,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const client = {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Cliente Agrupado',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'AGR-001',
    planId: '55555555-5555-4555-8555-555555555555',
    recurringValue: new Prisma.Decimal('30.00'),
    dueDate: parseBusinessDate('2026-09-20'),
    billingAnchorDay: 20,
    billingNoticeDays: 5,
    notes: null,
    status: 'ATIVO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const otherClient = {
    ...client,
    id: '44444444-4444-4444-8444-444444444445',
    reference: 'AGR-002',
  };
  const plans = [
    { id: '55555555-5555-4555-8555-555555555551', name: 'Mensal', durationMonths: 1 },
    { id: '55555555-5555-4555-8555-555555555552', name: 'Bimestral', durationMonths: 2 },
    { id: '55555555-5555-4555-8555-555555555553', name: 'Trimestral', durationMonths: 3 },
  ].map((plan) => ({
    ...plan,
    defaultValue: new Prisma.Decimal('30.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const references = [
    {
      id: '99999999-9999-4999-8999-999999999991',
      clientId: client.id,
      reference: 'ref-01',
      planId: plans[0]!.id,
      recurringValue: new Prisma.Decimal('30.00'),
      dueDate: parseBusinessDate('2026-09-20'),
      billingAnchorDay: 20,
      plan: plans[0]!,
    },
    {
      id: '99999999-9999-4999-8999-999999999992',
      clientId: client.id,
      reference: 'ref-02',
      planId: plans[1]!.id,
      recurringValue: new Prisma.Decimal('40.00'),
      dueDate: parseBusinessDate('2026-09-25'),
      billingAnchorDay: 25,
      plan: plans[1]!,
    },
    {
      id: '99999999-9999-4999-8999-999999999993',
      clientId: client.id,
      reference: 'ref-03',
      planId: plans[2]!.id,
      recurringValue: new Prisma.Decimal('50.00'),
      dueDate: parseBusinessDate('2026-09-20'),
      billingAnchorDay: 20,
      plan: plans[2]!,
    },
  ].map((reference) => ({
    billingNoticeDays: 5,
    notes: null,
    status: 'ATIVO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...reference,
  }));
  const receivables = [
    { id: '77777777-7777-4777-8777-777777777771', amount: '30.00', reference: references[0]! },
    { id: '77777777-7777-4777-8777-777777777772', amount: '40.00', reference: references[1]! },
    { id: '77777777-7777-4777-8777-777777777773', amount: '50.00', reference: references[2]! },
  ].map((item) => ({
    id: item.id,
    clientId: client.id,
    clientReferenceId: item.reference.id,
    renewalId: null,
    purpose: 'RENEWAL' as const,
    description: `Renovacao - ${item.reference.reference}`,
    amount: new Prisma.Decimal(item.amount),
    dueDate: item.reference.dueDate,
    status: 'PENDENTE',
    paidAt: null as Date | null,
    canceledAt: null as Date | null,
    cancelReason: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  const transactions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const paymentGroups: Array<Record<string, unknown>> = [];
  const paymentIntents: Array<Record<string, unknown>> = [];
  const acquireAdvisoryLock = createAdvisoryLockSimulator();
  const lockContext = new AsyncLocalStorage<Array<() => void>>();
  const executeRawUnsafe = vi.fn(async (_query: string, ...values: unknown[]) => {
    await acquireAdvisoryLock(String(values[0]), lockContext.getStore() ?? []);
    return 0;
  });
  let failTransactionAt = 0;

  const decorateReceivable = (receivable: (typeof receivables)[number]) => {
    const reference = references.find((item) => item.id === receivable.clientReferenceId)!;
    const targetClient = receivable.clientId === client.id ? client : otherClient;

    return {
      ...receivable,
      client: targetClient,
      clientReference: reference,
      paymentTransaction:
        transactions.find((transaction) => transaction.receivableId === receivable.id) ?? null,
      paymentIntents: paymentIntents.filter((intent) => intent.receivableId === receivable.id),
    };
  };

  const tx = {
    $executeRawUnsafe: executeRawUnsafe,
    financialCategory: {
      findFirst: () => Promise.resolve(entryCategory),
    },
    receivable: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          receivables
            .filter((receivable) => where.id.in.includes(receivable.id))
            .map(decorateReceivable),
        ),
      findUnique: ({ where }: { where: { id: string } }) => {
        const receivable = receivables.find((item) => item.id === where.id);
        return Promise.resolve(receivable ? decorateReceivable(receivable) : null);
      },
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<(typeof receivables)[number]>;
      }) => {
        const receivable = receivables.find((item) => item.id === where.id);
        if (!receivable) throw new Error('Receivable not found');
        Object.assign(receivable, data);
        return Promise.resolve(decorateReceivable(receivable));
      },
    },
    paymentGroup: {
      create: ({
        data,
      }: {
        data: Record<string, unknown> & {
          items: { create: Array<Record<string, unknown>> };
        };
      }) => {
        const group = {
          id: `payment-group-${paymentGroups.length + 1}`,
          createdAt: new Date('2026-09-20T00:00:00.000Z'),
          updatedAt: new Date('2026-09-20T00:00:00.000Z'),
          ...data,
          items: data.items.create.map((item: Record<string, unknown>, index: number) => ({
            id: `payment-group-item-${paymentGroups.length + 1}-${index + 1}`,
            paymentGroupId: `payment-group-${paymentGroups.length + 1}`,
            createdAt: new Date('2026-09-20T00:00:00.000Z'),
            ...item,
          })),
        };
        paymentGroups.push(group);
        return Promise.resolve(group);
      },
      findUnique: ({ where }: { where: { id: string } }) => {
        const group = paymentGroups.find((item) => item.id === where.id);
        if (!group) return Promise.resolve(null);

        return Promise.resolve({
          ...group,
          items: (group.items as Array<Record<string, unknown>>).map((item) => ({
            ...item,
            receivable: decorateReceivable(
              receivables.find((receivable) => receivable.id === item.receivableId)!,
            ),
          })),
        });
      },
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const group = paymentGroups.find((item) => item.id === where.id);
        if (!group) throw new Error('Payment group not found');
        Object.assign(group, data, { updatedAt: new Date('2026-09-20T00:01:00.000Z') });
        return Promise.resolve(group);
      },
    },
    paymentIntent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const intent = {
          id: `intent-${paymentIntents.length + 1}`,
          receivableId: null,
          paymentGroupId: null,
          createdAt: new Date('2026-09-20T00:00:00.000Z'),
          updatedAt: new Date('2026-09-20T00:00:00.000Z'),
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
        where: {
          status: { in: string[] };
          OR?: Array<{ receivableId?: { in: string[] } }>;
        };
      }) => {
        const ids = where.OR?.[0]?.receivableId?.in ?? [];
        return Promise.resolve(
          paymentIntents.find((intent) => {
            const status = String(intent.status);
            const receivableId =
              typeof intent.receivableId === 'string' ? intent.receivableId : null;
            const paymentGroupId =
              typeof intent.paymentGroupId === 'string' ? intent.paymentGroupId : null;

            if (!where.status.in.includes(status)) return false;
            if (receivableId && ids.includes(receivableId)) return true;
            const group = paymentGroups.find((item) => item.id === paymentGroupId);
            return (group?.items as Array<Record<string, unknown>> | undefined)?.some(
              (item) => typeof item.receivableId === 'string' && ids.includes(item.receivableId),
            );
          }) ?? null,
        );
      },
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
        Object.assign(intent, data, { updatedAt: new Date('2026-09-20T00:01:00.000Z') });
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
        Object.assign(intent, data, { updatedAt: new Date('2026-09-20T00:01:00.000Z') });
        return Promise.resolve({ count: 1 });
      },
    },
    financialTransaction: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        if (failTransactionAt && transactions.length + 1 === failTransactionAt) {
          throw new Error('forced grouped rollback');
        }
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
    },
    clientReference: {
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const reference = references.find((item) => item.id === where.id);
        if (!reference) throw new Error('Reference not found');
        Object.assign(reference, data);
        return Promise.resolve(reference);
      },
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return Promise.resolve(data);
      },
    },
    messageDispatch: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
      const releaseLocks: Array<() => void> = [];
      const snapshots = {
        receivables: receivables.map((receivable) => ({ ...receivable })),
        references: references.map((reference) => ({ ...reference })),
        transactions: transactions.map((transaction) => ({ ...transaction })),
        events: events.map((event) => ({ ...event })),
        paymentGroups: paymentGroups.map((group) => ({
          ...group,
          items: Array.isArray(group.items)
            ? group.items.map((item: Record<string, unknown>) => ({ ...item }))
            : group.items,
        })),
        paymentIntents: paymentIntents.map((intent) => ({ ...intent })),
      };
      return lockContext.run(releaseLocks, async () => {
        try {
          return await callback(tx);
        } catch (error) {
          if (rollbackOnError) {
            receivables.splice(
              0,
              receivables.length,
              ...(snapshots.receivables as typeof receivables),
            );
            references.splice(0, references.length, ...(snapshots.references as typeof references));
            transactions.splice(0, transactions.length, ...snapshots.transactions);
            events.splice(0, events.length, ...snapshots.events);
            paymentGroups.splice(0, paymentGroups.length, ...snapshots.paymentGroups);
            paymentIntents.splice(0, paymentIntents.length, ...snapshots.paymentIntents);
          }
          throw error;
        } finally {
          releaseLocks.reverse().forEach((release) => release());
        }
      });
    },
  };
  const provider = {
    createPix: vi.fn((input: { amount: Prisma.Decimal }) =>
      Promise.resolve({
        provider: 'MOCK' as const,
        providerTransactionId: `group-provider-${paymentIntents.length + 1}`,
        externalStatus: 'pending',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'WAITING_PAYMENT' as const,
        amount: input.amount,
        pixCopyPaste: `MOCK-GROUP|${input.amount.toFixed(2)}`,
        qrCodeData: null,
        expiresAt: new Date('2026-09-20T00:30:00.000Z'),
      }),
    ),
    getPixStatus: vi.fn(),
    getPixTransaction: vi.fn(),
    cancelPix: vi.fn(),
    markPixPaid: vi.fn(),
  };
  const recovery = {
    cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined),
  };
  const nextReceivables: Array<Record<string, unknown>> = [];
  const cycle = {
    ensureCurrentCycleReceivable: vi.fn().mockImplementation((clientReferenceId: string) => {
      const reference = references.find((item) => item.id === clientReferenceId)!;
      const receivable = {
        clientReferenceId,
        purpose: 'RENEWAL',
        dueDate: reference.dueDate,
        amount: reference.recurringValue,
        status: 'PENDENTE',
      };
      nextReceivables.push(receivable);
      return Promise.resolve({ action: 'created', receivable });
    }),
  };

  return {
    client,
    otherClient,
    references,
    receivables,
    transactions,
    events,
    paymentGroups,
    paymentIntents,
    nextReceivables,
    prisma,
    provider,
    config: { get: () => undefined },
    cycle,
    recovery,
    setFailTransactionAt: (index: number) => {
      failTransactionAt = index;
    },
  };
}

describe('FinanceService', () => {
  it('rejects empty or whitespace-only financial category names', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    for (const name of ['', ' ', '  ', '\t', '\n']) {
      await expect(service.createCategory({ name, type: 'ENTRADA' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('trims financial category names before persisting', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.createCategory({ name: ' Marketing ', type: 'SAIDA' }),
    ).resolves.toMatchObject({
      name: 'Marketing',
      type: 'SAIDA',
    });
  });

  it('keeps max length validation for financial category names', () => {
    const dto = plainToInstance(CreateFinancialCategoryDto, {
      name: 'x'.repeat(121),
      type: 'ENTRADA',
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'name')).toBe(true);
    expect(JSON.stringify(errors)).toContain('Nome da categoria muito longo.');
  });

  it('rejects normalized duplicate category names inside the same type', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    await service.createCategory({ name: 'Compra', type: 'SAIDA' });

    await expect(service.createCategory({ name: ' compra ', type: 'SAIDA' })).rejects.toThrow(
      'Ja existe uma categoria com este nome.',
    );
  });

  it('rejects normalized duplicate names when the existing category is inactive', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    const category = await service.createCategory({ name: 'Marketing', type: 'ENTRADA' });
    await service.updateCategory(category.id, { active: false });

    await expect(service.createCategory({ name: ' marketing ', type: 'ENTRADA' })).rejects.toThrow(
      'Ja existe uma categoria com este nome.',
    );
  });

  it('allows the same normalized category name for entry and expense types', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.createCategory({ name: 'Marketing', type: 'ENTRADA' }),
    ).resolves.toMatchObject({
      name: 'Marketing',
      type: 'ENTRADA',
    });
    await expect(
      service.createCategory({ name: ' marketing ', type: 'SAIDA' }),
    ).resolves.toMatchObject({
      name: 'marketing',
      type: 'SAIDA',
    });
  });

  it('rejects normalized duplicate category names on update inside the same type', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    await service.createCategory({ name: 'Marketing', type: 'ENTRADA' });
    const commercial = await service.createCategory({ name: 'Comercial', type: 'ENTRADA' });

    await expect(service.updateCategory(commercial.id, { name: ' marketing ' })).rejects.toThrow(
      'Ja existe uma categoria com este nome.',
    );
  });

  it('allows updating a category with its own normalized name', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never, {} as never, {} as never, {} as never);

    const category = await service.createCategory({ name: 'Marketing', type: 'ENTRADA' });

    await expect(
      service.updateCategory(category.id, { name: ' Marketing ' }),
    ).resolves.toMatchObject({
      id: category.id,
      name: 'Marketing',
      type: 'ENTRADA',
    });
  });

  it('keeps enum validation for invalid financial category types', () => {
    const dto = plainToInstance(CreateFinancialCategoryDto, {
      name: 'Marketing',
      type: 'INVALIDO',
    });

    const errors = validateSync(dto);

    expect(errors.some((error) => error.property === 'type')).toBe(true);
  });

  it('summarizes all payment intents for a client without double counting grouped PIX', async () => {
    const clientA = '550e8400-e29b-41d4-a716-446655440000';
    const clientB = '550e8400-e29b-41d4-a716-446655440001';
    const prisma = createPaymentIntentsSummaryPrisma([
      { id: 'intent-a1-1', receivableClientId: clientA, status: 'WAITING_PAYMENT' },
      { id: 'intent-a1-2', receivableClientId: clientA, status: 'PAID' },
      { id: 'intent-a2-1', receivableClientId: clientA, status: 'CANCELED' },
      { id: 'intent-group-a', paymentGroupClientId: clientA, status: 'EXPIRED' },
      { id: 'intent-b1-1', receivableClientId: clientB, status: 'WAITING_PAYMENT' },
      { id: 'intent-b-group', paymentGroupClientId: clientB, status: 'PAID' },
    ]);
    const service = new FinanceService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.paymentIntentsSummary({ clientId: clientA })).resolves.toEqual({
      total: 4,
    });
    expect(prisma.paymentIntent.count).toHaveBeenCalledWith({
      where: {
        OR: [{ receivable: { clientId: clientA } }, { paymentGroup: { clientId: clientA } }],
      },
    });
  });

  it('summarizes receivables amounts by period without double counting overdue pending items', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    const prisma = createReceivablesSummaryPrisma([
      {
        amount: new Prisma.Decimal('999.00'),
        client: { name: 'Bruno Agosto' },
        clientId: 'client-august',
        clientReference: { reference: 'AGO' },
        clientReferenceId: 'ref-august',
        description: 'Fora agosto',
        dueDate: parseBusinessDate('2026-08-31'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('100.00'),
        client: { name: 'Bruno Setembro' },
        clientId: 'client-bruno',
        clientReference: { reference: 'SET-001' },
        clientReferenceId: 'ref-bruno',
        description: 'Pendente futuro',
        dueDate: parseBusinessDate('2026-09-30'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('200.00'),
        client: { name: 'Bruno Setembro' },
        clientId: 'client-bruno',
        clientReference: { reference: 'SET-001' },
        clientReferenceId: 'ref-bruno',
        description: 'Pendente vencido',
        dueDate: parseBusinessDate('2026-09-01'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('300.00'),
        client: { name: 'Cliente Pago' },
        clientId: 'client-paid',
        clientReference: { reference: 'SET-002' },
        clientReferenceId: 'ref-paid',
        description: 'Recebido setembro',
        dueDate: parseBusinessDate('2026-09-15'),
        status: 'PAGO',
      },
      {
        amount: new Prisma.Decimal('400.00'),
        client: { name: 'Cliente Cancelado' },
        clientId: 'client-canceled',
        clientReference: { reference: 'SET-003' },
        clientReferenceId: 'ref-canceled',
        description: 'Cancelado setembro',
        dueDate: parseBusinessDate('2026-09-30'),
        status: 'CANCELADO',
      },
      {
        amount: new Prisma.Decimal('999.00'),
        client: { name: 'Bruno Outubro' },
        clientId: 'client-october',
        clientReference: { reference: 'OUT' },
        clientReferenceId: 'ref-october',
        description: 'Fora outubro',
        dueDate: parseBusinessDate('2026-10-01'),
        status: 'PAGO',
      },
    ]);
    const service = new FinanceService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.receivablesSummary({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    ).resolves.toEqual({
      canceledAmount: '400.00',
      overdueAmount: '200.00',
      paidAmount: '300.00',
      pendingAmount: '100.00',
    });

    vi.useRealTimers();
  });

  it('classifies pending receivables by current business date across historical and future periods', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    const prisma = createReceivablesSummaryPrisma([
      {
        amount: new Prisma.Decimal('80.00'),
        client: { name: 'Cliente Agosto' },
        clientId: 'client-august',
        clientReference: { reference: 'AGO-001' },
        clientReferenceId: 'ref-august',
        description: 'Pendente histórico',
        dueDate: parseBusinessDate('2026-08-15'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('50.00'),
        client: { name: 'Cliente Hoje' },
        clientId: 'client-today',
        clientReference: { reference: 'HOJE-001' },
        clientReferenceId: 'ref-today',
        description: 'Pendente hoje',
        dueDate: parseBusinessDate('2026-09-19'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('120.00'),
        client: { name: 'Cliente Outubro' },
        clientId: 'client-october',
        clientReference: { reference: 'OUT-001' },
        clientReferenceId: 'ref-october',
        description: 'Pendente futuro',
        dueDate: parseBusinessDate('2026-10-15'),
        status: 'PENDENTE',
      },
    ]);
    const service = new FinanceService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.receivablesSummary({ startDate: '2026-08-01', endDate: '2026-08-31' }),
    ).resolves.toMatchObject({ overdueAmount: '80.00', pendingAmount: '0.00' });
    await expect(
      service.receivablesSummary({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    ).resolves.toMatchObject({ overdueAmount: '0.00', pendingAmount: '50.00' });
    await expect(
      service.receivablesSummary({ startDate: '2026-10-01', endDate: '2026-10-31' }),
    ).resolves.toMatchObject({ overdueAmount: '0.00', pendingAmount: '120.00' });

    vi.useRealTimers();
  });

  it('keeps receivables summary independent from pagination and table status filters', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    const prisma = createReceivablesSummaryPrisma([
      {
        amount: new Prisma.Decimal('100.00'),
        client: { name: 'Bruno Silva' },
        clientId: 'client-bruno',
        clientReference: { reference: 'BRU-001' },
        clientReferenceId: 'ref-bruno',
        description: 'Mensalidade Bruno',
        dueDate: parseBusinessDate('2026-09-30'),
        status: 'PENDENTE',
      },
      {
        amount: new Prisma.Decimal('250.00'),
        client: { name: 'Bruno Silva' },
        clientId: 'client-bruno',
        clientReference: { reference: 'BRU-001' },
        clientReferenceId: 'ref-bruno',
        description: 'Pago Bruno',
        dueDate: parseBusinessDate('2026-09-15'),
        status: 'PAGO',
      },
      {
        amount: new Prisma.Decimal('700.00'),
        client: { name: 'Soraia Lima' },
        clientId: 'client-soraia',
        clientReference: { reference: 'SOR-001' },
        clientReferenceId: 'ref-soraia',
        description: 'Pago Soraia',
        dueDate: parseBusinessDate('2026-09-15'),
        status: 'PAGO',
      },
    ]);
    const service = new FinanceService(prisma as never, {} as never, {} as never, {} as never);
    const baseQuery = {
      endDate: '2026-09-30',
      page: 1,
      pageSize: 10,
      search: 'Bruno',
      startDate: '2026-09-01',
    };

    const all = await service.receivablesSummary(baseQuery);
    const paidPageTwo = await service.receivablesSummary({
      ...baseQuery,
      page: 2,
      status: 'PAGO',
    });
    const canceledPageThree = await service.receivablesSummary({
      ...baseQuery,
      page: 3,
      status: 'CANCELADO',
    });

    expect(all).toEqual({
      canceledAmount: '0.00',
      overdueAmount: '0.00',
      paidAmount: '250.00',
      pendingAmount: '100.00',
    });
    expect(paidPageTwo).toEqual(all);
    expect(canceledPageThree).toEqual(all);

    vi.useRealTimers();
  });

  it('pays three selected receivables from the same client as one manual payment group', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
      fake.recovery as never,
    );

    const group = await service.payReceivables(
      {
        receivableIds: fake.receivables.map((receivable) => receivable.id),
        paymentDate: '2026-09-20',
        categoryId: '11111111-1111-4111-8111-111111111111',
      },
      actorUserId,
    );

    expect(group).toMatchObject({ status: 'PAID', totalAmount: '120.00' });
    expect(fake.receivables.every((receivable) => receivable.status === 'PAGO')).toBe(true);
    expect(fake.transactions).toHaveLength(3);
    expect(fake.transactions.every((transaction) => transaction.paymentGroupId === group.id)).toBe(
      true,
    );
    expect(fake.cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(3);
    expect(fake.recovery.cancelActiveForReceivable).toHaveBeenCalledTimes(3);
    expect(fake.nextReceivables).toHaveLength(3);
    expect(fake.prisma.messageDispatch.updateMany).toHaveBeenCalledTimes(3);
    expect(fake.prisma.messageDispatch.updateMany).toHaveBeenCalledWith({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [
          { receivableId: fake.receivables[0]!.id },
          { items: { some: { receivableId: fake.receivables[0]!.id } } },
        ],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'RECEIVABLE_PAID',
        errorMessage: 'Cobranca futura cancelada porque a conta a receber foi paga.',
        nextAttemptAt: null,
      },
    });
  });

  it('allows paying one selected receivable and later another grouped selection', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
      fake.recovery as never,
    );

    await service.payReceivables(
      { receivableIds: [fake.receivables[0]!.id], paymentDate: '2026-09-20' },
      actorUserId,
    );
    await service.payReceivables(
      {
        receivableIds: [fake.receivables[1]!.id, fake.receivables[2]!.id],
        paymentDate: '2026-09-25',
      },
      actorUserId,
    );

    expect(fake.paymentGroups).toHaveLength(2);
    expect(fake.transactions).toHaveLength(3);
    expect(fake.receivables.every((receivable) => receivable.status === 'PAGO')).toBe(true);
  });

  it('rejects grouped payments with different clients or ineligible statuses', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    fake.receivables[2]!.clientId = fake.otherClient.id;

    await expect(
      service.payReceivables(
        {
          receivableIds: [fake.receivables[0]!.id, fake.receivables[2]!.id],
          paymentDate: '2026-09-20',
        },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);

    fake.receivables[2]!.clientId = fake.client.id;
    fake.receivables[1]!.status = 'PAGO';

    await expect(
      service.payReceivables(
        {
          receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id],
          paymentDate: '2026-09-20',
        },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);

    fake.receivables[1]!.status = 'CANCELADO';

    await expect(
      service.createReceivablesPix(
        { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('advances each grouped renewal by its own due date and plan duration', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
      fake.recovery as never,
    );

    await service.payReceivables(
      {
        receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id],
        paymentDate: '2026-09-27',
      },
      actorUserId,
    );

    expect(fake.references[0]!.dueDate).toEqual(parseBusinessDate('2026-10-27'));
    expect(fake.references[0]!.billingAnchorDay).toBe(27);
    expect(fake.references[1]!.dueDate).toEqual(parseBusinessDate('2026-11-27'));
    expect(fake.references[1]!.billingAnchorDay).toBe(27);
  });

  it('creates one grouped PIX for the selected total and confirms it idempotently', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
      fake.recovery as never,
    );

    const intent = await service.createReceivablesPix(
      { receivableIds: fake.receivables.map((receivable) => receivable.id) },
      actorUserId,
    );
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      paidAt: new Date('2026-09-20T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.provider.createPix).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal('120.00') }),
    );
    expect(fake.transactions).toHaveLength(3);
    expect(fake.prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(fake.prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      `pix:receivable:${fake.receivables[0]!.id}`,
    );
    expect(fake.paymentIntents[0]!.status).toBe('PAID');
    expect(fake.paymentGroups[0]!.status).toBe('PAID');
    expect(fake.cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(3);
    expect(fake.recovery.cancelActiveForReceivable).toHaveBeenCalledTimes(3);
  });

  it('persists a grouped PIX when the provider result has a normalized numeric transaction ID', async () => {
    const fake = createGroupedFinancePrisma();
    fake.provider.createPix.mockResolvedValueOnce({
      provider: 'FASTFLOW',
      providerTransactionId: '75149',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('80.00'),
      pixCopyPaste: 'pix-copy-paste-grouped',
      qrCodeData: null,
      expiresAt: new Date('2026-09-20T00:30:00.000Z'),
    } as never);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.createReceivablesPix(
      { receivableIds: [fake.receivables[0]!.id, fake.receivables[2]!.id] },
      actorUserId,
    );

    expect(intent).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: '75149',
      status: 'WAITING_PAYMENT',
      amount: '80.00',
    });
    expect(fake.paymentIntents.at(0)).toMatchObject({
      paymentGroupId: fake.paymentGroups.at(0)!.id,
      providerTransactionId: '75149',
    });
    expect(typeof fake.paymentIntents.at(0)!.providerTransactionId).toBe('string');
  });

  it('serializes concurrent grouped PIX creation for the same receivables', async () => {
    const fake = createGroupedFinancePrisma({ rollbackOnError: false });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const ids = [fake.receivables[0]!.id, fake.receivables[1]!.id];

    const results = await Promise.allSettled([
      service.createReceivablesPix({ receivableIds: ids }, actorUserId),
      service.createReceivablesPix({ receivableIds: [...ids].reverse() }, actorUserId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentGroups).toHaveLength(1);
    expect(fake.paymentIntents).toHaveLength(1);
  });

  it('locks grouped receivables in sorted order', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const shuffled = [fake.receivables[2]!.id, fake.receivables[0]!.id, fake.receivables[1]!.id];

    await service.createReceivablesPix({ receivableIds: shuffled }, actorUserId);

    expect(fake.prisma.$executeRawUnsafe.mock.calls.map((call) => call[1])).toEqual(
      [...shuffled].sort().map((id) => `pix:receivable:${id}`),
    );
  });

  it('serializes individual and grouped PIX creation for the same receivable', async () => {
    const fake = createGroupedFinancePrisma({ rollbackOnError: false });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const ids = [fake.receivables[0]!.id, fake.receivables[1]!.id];

    const results = await Promise.allSettled([
      service.createReceivablePix(ids[0]!, actorUserId),
      service.createReceivablesPix({ receivableIds: ids }, actorUserId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentGroups.length).toBeLessThanOrEqual(1);
  });

  it('keeps concurrent grouped paid sync to one effective write-off', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
    );
    const intent = await service.createReceivablesPix(
      { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
      actorUserId,
    );
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      paidAt: new Date('2026-09-20T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    const results = await Promise.allSettled([
      service.syncPaymentIntent(intent.id, actorUserId),
      service.syncPaymentIntent(intent.id, actorUserId),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(fake.transactions).toHaveLength(2);
    expect(fake.cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(2);
    expect(fake.paymentGroups[0]!.status).toBe('PAID');
  });

  it('keeps grouped PIX receivables pending when provider expires the intent', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablesPix(
      { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
      actorUserId,
    );
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      externalStatus: 'expired',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'EXPIRED',
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.receivables.every((receivable) => receivable.status === 'PENDENTE')).toBe(true);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.paymentGroups[0]!.status).toBe('EXPIRED');
  });

  it.each(['CANCELED', 'FAILED'] as const)(
    'keeps grouped PIX receivables pending when provider returns %s',
    async (status) => {
      const fake = createGroupedFinancePrisma();
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
      );
      const intent = await service.createReceivablesPix(
        { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
        actorUserId,
      );
      fake.provider.getPixStatus.mockResolvedValue({
        provider: 'MOCK',
        providerTransactionId: intent.providerTransactionId,
        externalStatus: status.toLowerCase(),
        externalDepixId: null,
        blockchainTxId: null,
        status,
        paidAt: null,
        failureCode: status,
        failureMessage: null,
      });

      await service.syncPaymentIntent(intent.id, actorUserId);

      expect(fake.receivables.every((receivable) => receivable.status === 'PENDENTE')).toBe(true);
      expect(fake.transactions).toHaveLength(0);
      expect(fake.paymentGroups[0]!.status).toBe(status);
    },
  );

  it('rejects grouped PIX confirmation when an item was paid before provider confirmation', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
    );
    const intent = await service.createReceivablesPix(
      { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
      actorUserId,
    );
    fake.receivables[0]!.status = 'PAGO';
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      paidAt: new Date('2026-09-20T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await expect(service.syncPaymentIntent(intent.id, actorUserId)).rejects.toThrow(
      ConflictException,
    );
    expect(fake.transactions).toHaveLength(0);
    expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
  });

  it('rejects grouped PIX confirmation when an item amount changed after creation', async () => {
    const fake = createGroupedFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
    );
    const intent = await service.createReceivablesPix(
      { receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id] },
      actorUserId,
    );
    fake.receivables[1]!.amount = new Prisma.Decimal('45.00');
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      paidAt: new Date('2026-09-20T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await expect(service.syncPaymentIntent(intent.id, actorUserId)).rejects.toThrow(
      ConflictException,
    );
    expect(fake.transactions).toHaveLength(0);
    expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
  });

  it('rolls back the full manual group when one item fails', async () => {
    const fake = createGroupedFinancePrisma();
    fake.setFailTransactionAt(2);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      fake.cycle as never,
    );

    await expect(
      service.payReceivables(
        {
          receivableIds: [fake.receivables[0]!.id, fake.receivables[1]!.id],
          paymentDate: '2026-09-20',
        },
        actorUserId,
      ),
    ).rejects.toThrow('forced grouped rollback');

    expect(fake.paymentGroups).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.receivables.every((receivable) => receivable.status === 'PENDENTE')).toBe(true);
  });

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
    expect(fake.tx.messageDispatch.updateMany).toHaveBeenCalledWith({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [
          { receivableId: fake.receivable.id },
          { items: { some: { receivableId: fake.receivable.id } } },
        ],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'RECEIVABLE_PAID',
        errorMessage: 'Cobranca futura cancelada porque a conta a receber foi paga.',
        nextAttemptAt: null,
      },
    });

    await expect(
      service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
        actorUserId,
      ),
    ).rejects.toThrow('Apenas contas pendentes podem receber baixa.');
    expect(fake.transactions).toHaveLength(1);
  });

  it('activates a pending client from manual payment using the original due date cycle', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'PENDENTE_PAGAMENTO';
    fake.clientReference.dueDate = parseBusinessDate('2026-09-10');
    fake.clientReference.billingAnchorDay = 10;
    fake.receivable.purpose = 'INITIAL_ACTIVATION';
    fake.receivable.renewalId = null;
    fake.receivable.dueDate = parseBusinessDate('2026-09-10');
    const { referral, referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-15', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.status).toBe('ATIVO');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-10'));
    expect(fake.transactions).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'STATUS_CHANGED')).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'CLIENT_STATUS_HISTORY')).toHaveLength(1);
    expect(referral.status).toBe('QUALIFIED');
    expect(referral.qualifiedAt).toBeInstanceOf(Date);
    expect(referrals.qualifyAfterInitialActivation).toHaveBeenCalledWith(
      fake.tx,
      fake.client.id,
      fake.receivable.id,
      actorUserId,
    );
  });

  it('ensures the next renewal receivable after initial activation payment', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'PENDENTE_PAGAMENTO';
    fake.clientReference.dueDate = parseBusinessDate('2026-09-10');
    fake.clientReference.billingAnchorDay = 10;
    fake.receivable.purpose = 'INITIAL_ACTIVATION';
    fake.receivable.renewalId = null;
    fake.receivable.dueDate = parseBusinessDate('2026-09-10');
    const cycle = {
      ensureCurrentCycleReceivable: vi.fn().mockResolvedValue({ action: 'created' }),
    };
    const { referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-15', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.status).toBe('ATIVO');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-10'));
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      fake.clientReference.id,
      fake.tx,
    );
  });

  it('activates a pending reference after initial activation payment without referral', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'PENDENTE_PAGAMENTO';
    fake.clientReference.dueDate = parseBusinessDate('2026-09-10');
    fake.clientReference.billingAnchorDay = 10;
    fake.receivable.purpose = 'INITIAL_ACTIVATION';
    fake.receivable.renewalId = null;
    fake.receivable.dueDate = parseBusinessDate('2026-09-10');
    const referrals = {
      qualifyAfterInitialActivation: vi.fn().mockResolvedValue(null),
    };
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-15', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.status).toBe('ATIVO');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-10'));
    expect(referrals.qualifyAfterInitialActivation).toHaveBeenCalledWith(
      fake.tx,
      fake.client.id,
      fake.receivable.id,
      actorUserId,
    );
  });

  it('qualifies referral for an already active reference after initial activation payment', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'ATIVO';
    fake.clientReference.dueDate = parseBusinessDate('2026-10-10');
    fake.clientReference.billingAnchorDay = 10;
    fake.receivable.purpose = 'INITIAL_ACTIVATION';
    fake.receivable.renewalId = null;
    fake.receivable.dueDate = parseBusinessDate('2026-09-10');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const { referral, referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-15', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.clientReference.status).toBe('ATIVO');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-10'));
    expect(fake.clientReference.billingAnchorDay).toBe(10);
    expect(referral.status).toBe('QUALIFIED');
    expect(referral.qualifiedAt).toBeInstanceOf(Date);
    expect(cycle.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expect(nextReceivables).toHaveLength(0);
    expect(fake.events.filter((event) => event.type === 'STATUS_CHANGED')).toHaveLength(0);
    expect(fake.events.filter((event) => event.type === 'CLIENT_STATUS_HISTORY')).toHaveLength(0);
    expect(referrals.qualifyAfterInitialActivation).toHaveBeenCalledWith(
      fake.tx,
      fake.client.id,
      fake.receivable.id,
      actorUserId,
    );
  });

  it.each(['INATIVO' as const, 'CANCELADO' as const])(
    'does not qualify referral for %s reference after initial activation payment',
    async (status) => {
      const fake = createFinancePrisma();
      fake.clientReference.status = status;
      fake.clientReference.dueDate = parseBusinessDate('2026-10-10');
      fake.receivable.purpose = 'INITIAL_ACTIVATION';
      fake.receivable.renewalId = null;
      fake.receivable.dueDate = parseBusinessDate('2026-09-10');
      const { referral, referrals } = createReferralQualificationDouble();
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
        referrals as never,
      );

      await service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-09-15', categoryId: fake.entryCategory.id },
        actorUserId,
      );

      expect(fake.clientReference.status).toBe(status);
      expect(referral.status).toBe('PENDING');
      expect(referrals.qualifyAfterInitialActivation).not.toHaveBeenCalled();
      expect(fake.events.filter((event) => event.type === 'STATUS_CHANGED')).toHaveLength(0);
    },
  );

  it('does not qualify referral after renewal payment', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'ATIVO';
    fake.receivable.purpose = 'RENEWAL';
    const { cycle } = createCycleRecorder(fake);
    const { referral, referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(referral.status).toBe('PENDING');
    expect(referrals.qualifyAfterInitialActivation).not.toHaveBeenCalled();
  });

  it.each(['QUALIFIED' as const, 'REWARDED' as const, 'CANCELED' as const])(
    'does not regress a %s referral after initial activation payment',
    async (status) => {
      const fake = createFinancePrisma();
      fake.clientReference.status = 'ATIVO';
      fake.receivable.purpose = 'INITIAL_ACTIVATION';
      fake.receivable.renewalId = null;
      const { referral, referrals } = createReferralQualificationDouble(status);
      const originalQualifiedAt = referral.qualifiedAt;
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
        referrals as never,
      );

      await service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
        actorUserId,
      );

      expect(referral.status).toBe(status);
      expect(referral.qualifiedAt).toBe(originalQualifiedAt);
      expect(referrals.qualifyAfterInitialActivation).toHaveBeenCalledWith(
        fake.tx,
        fake.client.id,
        fake.receivable.id,
        actorUserId,
      );
    },
  );

  it('advances the current reference cycle after manual renewal payment', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.clientReference.recurringValue = new Prisma.Decimal('30.00');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-14', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-09-14'));
    expect(fake.transactions).toHaveLength(1);
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-14'));
    expect(fake.clientReference.billingAnchorDay).toBe(14);
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      fake.clientReference.id,
      fake.tx,
    );
    expect(nextReceivables).toEqual([
      {
        clientReferenceId: fake.clientReference.id,
        purpose: 'RENEWAL',
        dueDate: parseBusinessDate('2026-10-14'),
        amount: new Prisma.Decimal('30.00'),
        status: 'PENDENTE',
      },
    ]);
    expect(
      fake.events.filter(
        (event) =>
          event.type === 'CLIENT_RENEWED' &&
          typeof event.metadata === 'object' &&
          event.metadata !== null &&
          'receivableId' in event.metadata &&
          event.metadata.receivableId === fake.receivable.id,
      ),
    ).toHaveLength(1);

    await expect(
      service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-09-14', categoryId: fake.entryCategory.id },
        actorUserId,
      ),
    ).rejects.toThrow('Apenas contas pendentes podem receber baixa.');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-14'));
    expect(fake.transactions).toHaveLength(1);
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    expect(nextReceivables).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'CLIENT_RENEWED')).toHaveLength(1);
  });

  it('keeps the current anchor when a renewal is paid before due date', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-10', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-09-10'));
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-14'));
    expect(fake.clientReference.billingAnchorDay).toBe(14);
    expect(nextReceivables[0]).toMatchObject({
      dueDate: parseBusinessDate('2026-10-14'),
      status: 'PENDENTE',
    });
  });

  it.each([
    ['um dia atrasado', '2026-09-15', '2026-10-15', 15],
    ['varios dias atrasado', '2026-09-17', '2026-10-17', 17],
  ])(
    'moves the renewal anchor to payment date when manually paid %s',
    async (_case, paymentDate, expectedDueDate, expectedAnchor) => {
      const fake = createFinancePrisma();
      fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
      fake.clientReference.billingAnchorDay = 14;
      fake.receivable.dueDate = parseBusinessDate('2026-09-14');
      const { cycle, nextReceivables } = createCycleRecorder(fake);
      const recovery = { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) };
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
        undefined,
        cycle as never,
        recovery as never,
      );

      await service.payReceivable(
        fake.receivable.id,
        { paymentDate, categoryId: fake.entryCategory.id },
        actorUserId,
      );

      expect(fake.receivable.dueDate).toEqual(parseBusinessDate('2026-09-14'));
      expect(fake.receivable.paidAt).toEqual(parseBusinessDate(paymentDate));
      expect(fake.clientReference.dueDate).toEqual(parseBusinessDate(expectedDueDate));
      expect(fake.clientReference.billingAnchorDay).toBe(expectedAnchor);
      expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
      expect(nextReceivables[0]).toMatchObject({
        clientReferenceId: fake.clientReference.id,
        purpose: 'RENEWAL',
        dueDate: parseBusinessDate(expectedDueDate),
        status: 'PENDENTE',
      });
      expect(recovery.cancelActiveForReceivable).toHaveBeenCalledWith(
        fake.tx,
        fake.receivable.id,
        'RECEIVABLE_PAID',
        'Conta a receber paga durante campanha de recuperacao.',
      );
    },
  );

  it.each([
    ['Mensal', 1, '2026-10-14'],
    ['Bimestral', 2, '2026-11-14'],
    ['Trimestral', 3, '2026-12-14'],
    ['Semestral', 6, '2027-03-14'],
    ['Anual', 12, '2027-09-14'],
  ])(
    'advances renewal payment using the real %s plan duration',
    async (_planName, durationMonths, expectedDueDate) => {
      const fake = createFinancePrisma();
      fake.plan.durationMonths = durationMonths;
      fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
      fake.clientReference.billingAnchorDay = 14;
      fake.receivable.dueDate = parseBusinessDate('2026-09-14');
      const { cycle, nextReceivables } = createCycleRecorder(fake);
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
        undefined,
        cycle as never,
      );

      await service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-09-14', categoryId: fake.entryCategory.id },
        actorUserId,
      );

      expect(fake.clientReference.dueDate).toEqual(parseBusinessDate(expectedDueDate));
      expect(nextReceivables).toHaveLength(1);
      expect(nextReceivables[0]).toMatchObject({
        clientReferenceId: fake.clientReference.id,
        purpose: 'RENEWAL',
        dueDate: parseBusinessDate(expectedDueDate),
        status: 'PENDENTE',
      });
    },
  );

  it.each([
    ['Mensal', 1, '2026-10-17'],
    ['Bimestral', 2, '2026-11-17'],
    ['Trimestral', 3, '2026-12-17'],
    ['Semestral', 6, '2027-03-17'],
    ['Anual', 12, '2027-09-17'],
  ])(
    'uses the late payment date with the real %s plan duration',
    async (_planName, durationMonths, expectedDueDate) => {
      const fake = createFinancePrisma();
      fake.plan.durationMonths = durationMonths;
      fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
      fake.clientReference.billingAnchorDay = 14;
      fake.receivable.dueDate = parseBusinessDate('2026-09-14');
      const { cycle, nextReceivables } = createCycleRecorder(fake);
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
        undefined,
        cycle as never,
      );

      await service.payReceivable(
        fake.receivable.id,
        { paymentDate: '2026-09-17', categoryId: fake.entryCategory.id },
        actorUserId,
      );

      expect(fake.clientReference.dueDate).toEqual(parseBusinessDate(expectedDueDate));
      expect(fake.clientReference.billingAnchorDay).toBe(17);
      expect(nextReceivables[0]).toMatchObject({
        dueDate: parseBusinessDate(expectedDueDate),
        status: 'PENDENTE',
      });
    },
  );

  it('preserves billingAnchorDay 31 when renewal advances into February', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-01-31');
    fake.clientReference.billingAnchorDay = 31;
    fake.receivable.dueDate = parseBusinessDate('2026-01-31');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-01-31', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-02-28'));
    expect(fake.clientReference.billingAnchorDay).toBe(31);
    expect(nextReceivables).toHaveLength(1);
    expect(nextReceivables[0]).toMatchObject({
      dueDate: parseBusinessDate('2026-02-28'),
      status: 'PENDENTE',
    });
  });

  it('resets anchor 31 to the real late payment day instead of February carryover', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-01-31');
    fake.clientReference.billingAnchorDay = 31;
    fake.receivable.dueDate = parseBusinessDate('2026-01-31');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-02-03', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.receivable.dueDate).toEqual(parseBusinessDate('2026-01-31'));
    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-02-03'));
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-03-03'));
    expect(fake.clientReference.billingAnchorDay).toBe(3);
    expect(nextReceivables[0]).toMatchObject({
      dueDate: parseBusinessDate('2026-03-03'),
      status: 'PENDENTE',
    });
  });

  it('advances the current reference cycle after PIX renewal confirmation', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: new Date('2026-09-14T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-14'));
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    expect(nextReceivables).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'CLIENT_RENEWED')).toHaveLength(1);
  });

  it('advances PIX renewal from the late provider payment business date', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTPAY';
    fake.paymentIntents.at(0)!.providerTransactionId = 'fastpay-tx-1';
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'FASTPAY',
      providerTransactionId: 'fastpay-tx-1',
      status: 'PAID',
      paidAt: new Date('2026-09-17T15:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-09-17'));
    expect(fake.transactions).toHaveLength(1);
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-17'));
    expect(fake.clientReference.billingAnchorDay).toBe(17);
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    expect(nextReceivables).toHaveLength(1);
  });

  it('uses Sao Paulo business date for PIX payment near UTC day boundary', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    const { cycle, nextReceivables } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: new Date('2026-09-15T01:30:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-09-14'));
    expect(fake.transactions[0]).toMatchObject({
      transactionDate: parseBusinessDate('2026-09-14'),
    });
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-14'));
    expect(fake.clientReference.billingAnchorDay).toBe(14);
    expect(nextReceivables[0]).toMatchObject({
      dueDate: parseBusinessDate('2026-10-14'),
      status: 'PENDENTE',
    });
  });

  it('does not advance unrelated references after a late renewal payment', async () => {
    const fake = createFinancePrisma();
    const secondReference = {
      ...fake.clientReference,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      reference: 'FIN-002',
      dueDate: parseBusinessDate('2026-09-20'),
      billingAnchorDay: 20,
    };
    fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
    fake.clientReference.billingAnchorDay = 14;
    fake.receivable.dueDate = parseBusinessDate('2026-09-14');
    (fake.tx.clientReference as { update: unknown }).update = ({
      where,
      data,
    }: {
      where: { id: string };
      data: object;
    }) => {
      const target = where.id === fake.clientReference.id ? fake.clientReference : secondReference;
      Object.assign(target, data);
      return Promise.resolve(target);
    };
    const { cycle } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-09-17', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-17'));
    expect(secondReference.dueDate).toEqual(parseBusinessDate('2026-09-20'));
    expect(secondReference.billingAnchorDay).toBe(20);
  });

  it('does not advance another reference when receivable relation is inconsistent', async () => {
    const fake = createFinancePrisma();
    fake.receivable.clientReferenceId = '88888888-8888-4888-8888-888888888888';
    const originalDueDate = fake.clientReference.dueDate;
    const { cycle } = createCycleRecorder(fake);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
      cycle as never,
    );

    await service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    expect(fake.clientReference.dueDate).toEqual(originalDueDate);
    expect(cycle.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expect(fake.events.filter((event) => event.type === 'CLIENT_RENEWED')).toHaveLength(0);
  });

  it.each([
    ['INITIAL_ACTIVATION' as const, 'PENDENTE' as const],
    ['RENEWAL' as const, 'CANCELADO' as const],
    ['RENEWAL' as const, 'PAGO' as const],
  ])('does not advance cycle for %s receivable with %s status', async (purpose, status) => {
    const fake = createFinancePrisma();
    fake.receivable.purpose = purpose;
    fake.receivable.status = status;
    const originalDueDate = fake.clientReference.dueDate;
    const { cycle } = createCycleRecorder(fake);
    const { referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
      cycle as never,
    );

    const payment = service.payReceivable(
      fake.receivable.id,
      { paymentDate: '2026-10-10', categoryId: fake.entryCategory.id },
      actorUserId,
    );

    if (status === 'PENDENTE') {
      await payment;
    } else {
      await expect(payment).rejects.toThrow('Apenas contas pendentes podem receber baixa.');
    }

    expect(fake.clientReference.dueDate).toEqual(originalDueDate);
    expect(cycle.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expect(fake.events.filter((event) => event.type === 'CLIENT_RENEWED')).toHaveLength(0);
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
    expect(fake.tx.messageDispatch.updateMany).toHaveBeenCalledWith({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [
          { receivableId: fake.receivable.id },
          { items: { some: { receivableId: fake.receivable.id } } },
        ],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'RECEIVABLE_CANCELED',
        errorMessage: 'Cobranca futura cancelada porque a conta a receber foi cancelada.',
        nextAttemptAt: null,
      },
    });
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
    expect(fake.tx.$executeRawUnsafe).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      `pix:receivable:${fake.receivable.id}`,
    );
  });

  it('persists an individual PIX when the provider returns a string transaction ID', async () => {
    const fake = createFinancePrisma();
    fake.provider.createPix.mockResolvedValueOnce({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-10-10T00:30:00.000Z'),
    } as never);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);

    expect(intent).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      status: 'WAITING_PAYMENT',
      amount: '30.00',
    });
    expect(fake.paymentIntents.at(0)).toMatchObject({
      providerTransactionId: '75148',
      status: 'WAITING_PAYMENT',
    });
  });

  it('rolls back local writes when PaymentIntent.create fails after provider success', async () => {
    const fake = createFinancePrisma();
    fake.provider.createPix.mockResolvedValueOnce({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-10-10T00:30:00.000Z'),
    } as never);
    fake.tx.paymentIntent.create = vi.fn(() => {
      throw new Prisma.PrismaClientValidationError(
        'Argument providerTransactionId: Expected String or Null, provided Int.',
        { clientVersion: 'test' },
      );
    });
    fake.prisma.paymentIntent.create = fake.tx.paymentIntent.create;
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(service.createReceivablePix(fake.receivable.id, actorUserId)).rejects.toThrow(
      'Expected String or Null',
    );

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
  });

  it('preserves local state when provider rejects PIX creation credentials', async () => {
    const fake = createFinancePrisma();
    fake.provider.createPix.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(service.createReceivablePix(fake.receivable.id, actorUserId)).rejects.toThrow(
      BadGatewayException,
    );

    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
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

  it('serializes concurrent PIX creation for the same receivable', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const [first, second] = await Promise.all([
      service.createReceivablePix(fake.receivable.id, actorUserId),
      service.createReceivablePix(fake.receivable.id, actorUserId),
    ]);

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

  it('previews PIX replacement without provider calls or writes', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const current = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    const preview = await service.previewReceivablePixReplacement(fake.receivable.id, {
      provider: current.provider,
    });

    expect(preview).toMatchObject({
      replaceable: true,
      provider: current.provider,
      currentIntent: { id: current.id, status: 'WAITING_PAYMENT' },
      blockers: [],
    });
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
  });

  it('creates a new PIX attempt and marks the previous local intent as superseded', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const previousStored = { ...fake.paymentIntents[0] };
    fake.provider.createPix.mockClear();

    const next = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: previous.provider,
        expectedCurrentIntentId: previous.id,
        reason: 'QR expirado',
        idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}`,
      },
      actorUserId,
    );

    expect(next.id).not.toBe(previous.id);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
    expect(fake.paymentIntents).toHaveLength(2);
    expect(fake.paymentIntents[0]).toMatchObject({
      id: previousStored.id,
      status: 'SUPERSEDED',
      providerTransactionId: previousStored.providerTransactionId,
      pixCopyPaste: previousStored.pixCopyPaste,
      qrCodeData: previousStored.qrCodeData,
      externalStatus: previousStored.externalStatus,
      amount: previousStored.amount,
    });
    expect(fake.paymentIntents[1]).toMatchObject({
      receivableId: fake.receivable.id,
      provider: previous.provider,
      status: 'WAITING_PAYMENT',
      amount: fake.receivable.amount,
    });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.receivable.paidAt).toBeNull();
    expect(fake.transactions).toHaveLength(0);
  });

  it('settles a superseded old PIX when the provider later reports it paid', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const oldIntent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: oldIntent.provider,
        expectedCurrentIntentId: oldIntent.id,
        idempotencyKey: `pix-replace:${oldIntent.id}`,
      },
      actorUserId,
    );
    fake.provider.getPixStatus.mockResolvedValue({
      provider: oldIntent.provider,
      providerTransactionId: oldIntent.providerTransactionId,
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      paidAt: new Date('2026-10-10T12:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(oldIntent.id, actorUserId);

    expect(fake.paymentIntents[0]).toMatchObject({ id: oldIntent.id, status: 'PAID' });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('does not create a second financial transaction when both replaced PIX attempts are paid', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const oldIntent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const newIntent = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: oldIntent.provider,
        expectedCurrentIntentId: oldIntent.id,
        idempotencyKey: `pix-replace:${oldIntent.id}`,
      },
      actorUserId,
    );

    fake.provider.getPixStatus.mockImplementation((providerTransactionId: string) =>
      Promise.resolve({
        provider: oldIntent.provider,
        providerTransactionId,
        externalStatus: 'paid',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'PAID' as const,
        paidAt: new Date('2026-10-10T12:00:00.000Z'),
        failureCode: null,
        failureMessage: null,
      }),
    );

    await service.syncPaymentIntent(oldIntent.id, actorUserId);
    await service.syncPaymentIntent(newIntent.id, actorUserId);

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.paymentIntents.map((intent) => intent.status)).toEqual(['PAID', 'PAID']);
  });

  it('does not create a second financial transaction when the new PIX is paid before the old one', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const oldIntent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const newIntent = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: oldIntent.provider,
        expectedCurrentIntentId: oldIntent.id,
        idempotencyKey: `pix-replace:${oldIntent.id}`,
      },
      actorUserId,
    );

    fake.provider.getPixStatus.mockImplementation((providerTransactionId: string) =>
      Promise.resolve({
        provider: oldIntent.provider,
        providerTransactionId,
        externalStatus: 'paid',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'PAID' as const,
        paidAt: new Date('2026-10-10T12:00:00.000Z'),
        failureCode: null,
        failureMessage: null,
      }),
    );

    await service.syncPaymentIntent(newIntent.id, actorUserId);
    await service.syncPaymentIntent(oldIntent.id, actorUserId);

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.paymentIntents.map((intent) => intent.status)).toEqual(['PAID', 'PAID']);
  });

  it('keeps the previous PIX intact when replacement provider creation fails', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const previousStored = { ...fake.paymentIntents[0] };
    fake.provider.createPix.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${previous.id}`,
        },
        actorUserId,
      ),
    ).rejects.toThrow('provider unavailable');

    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]).toMatchObject(previousStored);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('rolls back local replacement state when persistence fails after provider success', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.prisma.paymentIntent.create = vi.fn(() => {
      throw new Error('forced local persistence failure');
    });

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${previous.id}`,
        },
        actorUserId,
      ),
    ).rejects.toThrow('forced local persistence failure');

    expect(fake.provider.createPix).toHaveBeenCalledTimes(2);
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]).toMatchObject({ id: previous.id, status: 'WAITING_PAYMENT' });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('keeps double-click replacement idempotent with the same key', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();
    const idempotencyKey = `pix-replace:${fake.receivable.id}:${previous.id}`;

    const [first, second] = await Promise.all([
      service.replaceReceivablePix(
        fake.receivable.id,
        { provider: previous.provider, expectedCurrentIntentId: previous.id, idempotencyKey },
        actorUserId,
      ),
      service.replaceReceivablePix(
        fake.receivable.id,
        { provider: previous.provider, expectedCurrentIntentId: previous.id, idempotencyKey },
        actorUserId,
      ),
    ]);

    expect(second.id).toBe(first.id);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents).toHaveLength(2);
  });

  it('blocks a second replacement with a different key before creating another provider PIX', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}:a`,
        },
        actorUserId,
      ),
    ).resolves.toMatchObject({ status: 'WAITING_PAYMENT' });

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}:b`,
        },
        actorUserId,
      ),
    ).rejects.toThrow('PIX atual mudou');

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents.filter((intent) => intent.status === 'SUPERSEDED')).toHaveLength(1);
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
    expect(fake.paymentIntents).toHaveLength(2);
  });

  it('blocks repeated replacement without idempotency before creating another provider PIX', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        { provider: previous.provider, expectedCurrentIntentId: previous.id },
        actorUserId,
      ),
    ).resolves.toMatchObject({ status: 'WAITING_PAYMENT' });

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        { provider: previous.provider, expectedCurrentIntentId: previous.id },
        actorUserId,
      ),
    ).rejects.toThrow('PIX atual mudou');

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents.filter((intent) => intent.status === 'SUPERSEDED')).toHaveLength(1);
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
  });

  it('blocks a third replacement attempt before creating another provider PIX', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}:a`,
        },
        actorUserId,
      ),
    ).resolves.toMatchObject({ status: 'WAITING_PAYMENT' });

    await Promise.all([
      expect(
        service.replaceReceivablePix(
          fake.receivable.id,
          {
            provider: previous.provider,
            expectedCurrentIntentId: previous.id,
            idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}:b`,
          },
          actorUserId,
        ),
      ).rejects.toThrow('PIX atual mudou'),
      expect(
        service.replaceReceivablePix(
          fake.receivable.id,
          {
            provider: previous.provider,
            expectedCurrentIntentId: previous.id,
            idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}:c`,
          },
          actorUserId,
        ),
      ).rejects.toThrow('PIX atual mudou'),
    ]);

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
    expect(fake.paymentIntents).toHaveLength(2);
  });

  it('allows a later legitimate replacement when the expected current intent advances', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const first = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    const second = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: first.provider,
        expectedCurrentIntentId: first.id,
        idempotencyKey: `pix-replace:${fake.receivable.id}:${first.id}`,
      },
      actorUserId,
    );
    const secondPreview = await service.previewReceivablePixReplacement(fake.receivable.id, {
      provider: second.provider,
    });
    const third = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: second.provider,
        expectedCurrentIntentId: second.id,
        idempotencyKey: `pix-replace:${fake.receivable.id}:${second.id}`,
      },
      actorUserId,
    );

    expect(secondPreview).toMatchObject({
      replaceable: true,
      currentIntent: { id: second.id, status: 'WAITING_PAYMENT' },
    });
    expect(third.id).not.toBe(second.id);
    expect(fake.provider.createPix).toHaveBeenCalledTimes(2);
    expect(fake.paymentIntents.map((intent) => intent.status)).toEqual([
      'SUPERSEDED',
      'SUPERSEDED',
      'WAITING_PAYMENT',
    ]);
    expect(
      fake.paymentIntents.filter(
        (intent) => intent.status === 'CREATED' || intent.status === 'WAITING_PAYMENT',
      ),
    ).toHaveLength(1);
  });

  it('keeps one financial transaction when multiple attempts in a replacement chain are paid', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const first = await service.createReceivablePix(fake.receivable.id, actorUserId);
    const second = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: first.provider,
        expectedCurrentIntentId: first.id,
        idempotencyKey: `pix-replace:${fake.receivable.id}:${first.id}`,
      },
      actorUserId,
    );
    const third = await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: second.provider,
        expectedCurrentIntentId: second.id,
        idempotencyKey: `pix-replace:${fake.receivable.id}:${second.id}`,
      },
      actorUserId,
    );

    fake.provider.getPixStatus.mockImplementation((providerTransactionId: string) =>
      Promise.resolve({
        provider: first.provider,
        providerTransactionId,
        externalStatus: 'paid',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'PAID' as const,
        paidAt: new Date('2026-10-10T12:00:00.000Z'),
        failureCode: null,
        failureMessage: null,
      }),
    );

    await service.syncPaymentIntent(first.id, actorUserId);
    await service.syncPaymentIntent(second.id, actorUserId);
    await service.syncPaymentIntent(third.id, actorUserId);

    expect(fake.paymentIntents.map((intent) => intent.status)).toEqual(['PAID', 'PAID', 'PAID']);
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('serializes normal create and replacement for the same receivable', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const previous = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.createPix.mockClear();

    const [replacement] = await Promise.all([
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: previous.provider,
          expectedCurrentIntentId: previous.id,
          idempotencyKey: `pix-replace:${fake.receivable.id}:${previous.id}`,
        },
        actorUserId,
      ),
      service.createReceivablePix(fake.receivable.id, actorUserId),
    ]);

    expect(fake.provider.createPix).toHaveBeenCalledTimes(1);
    expect(fake.paymentIntents).toHaveLength(2);
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
    expect(replacement.status).toBe('WAITING_PAYMENT');
  });

  it('blocks normal PIX reconciliation while the original replacement intent is active', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    await createFastFlowWaitingPix(service, fake);

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
    });

    expect(preview.adoptable).toBe(false);
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'ACTIVE_INTENT_EXISTS' }),
    );
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
    expect(fake.paymentIntents).toHaveLength(1);
  });

  it('previews replacement recovery for the 75148 to 75739 case without writes', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    const preview = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
    });

    expect(preview).toMatchObject({
      recoverable: true,
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      expectedCurrentIntentId: current.id,
      currentIntent: { id: current.id, providerTransactionId: '75148' },
      external: { providerTransactionId: '75739', status: 'WAITING_PAYMENT', amount: '30.00' },
      blockers: [],
    });
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('keeps replacement recovery preview strictly read-only with explicit write counters', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );
    let paymentIntentCreates = 0;
    let paymentIntentUpdates = 0;
    let receivableUpdates = 0;
    let transactionCreates = 0;
    let clientEventCreates = 0;
    const originalPaymentIntentCreate = fake.prisma.paymentIntent.create;
    const originalPaymentIntentUpdate = fake.prisma.paymentIntent.update;
    const originalReceivableUpdate = fake.prisma.receivable.update;
    const originalTransactionCreate = fake.prisma.financialTransaction.create;
    const originalClientEventCreate = fake.tx.clientEvent.create;
    fake.prisma.paymentIntent.create = (args) => {
      paymentIntentCreates += 1;
      return originalPaymentIntentCreate(args);
    };
    fake.prisma.paymentIntent.update = (args) => {
      paymentIntentUpdates += 1;
      return originalPaymentIntentUpdate(args);
    };
    fake.prisma.receivable.update = (args) => {
      receivableUpdates += 1;
      return originalReceivableUpdate(args);
    };
    fake.prisma.financialTransaction.create = (args) => {
      transactionCreates += 1;
      return originalTransactionCreate(args);
    };
    fake.tx.clientEvent.create = (args) => {
      clientEventCreates += 1;
      return originalClientEventCreate(args);
    };

    const preview = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: 75739 as never,
    });

    expect(preview.recoverable).toBe(true);
    expect(preview.providerTransactionId).toBe('75739');
    expect(paymentIntentCreates).toBe(0);
    expect(paymentIntentUpdates).toBe(0);
    expect(receivableUpdates).toBe(0);
    expect(transactionCreates).toBe(0);
    expect(clientEventCreates).toBe(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('recovers the 75148 to 75739 waiting-payment replacement without creating or canceling PIX', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    const currentStored = { ...fake.paymentIntents[0] };
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    const recovered = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    expect(recovered).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      status: 'WAITING_PAYMENT',
      amount: '30.00',
    });
    expect(fake.paymentIntents).toHaveLength(2);
    expect(fake.paymentIntents[0]).toMatchObject({
      id: currentStored.id,
      provider: currentStored.provider,
      providerTransactionId: currentStored.providerTransactionId,
      pixCopyPaste: currentStored.pixCopyPaste,
      qrCodeData: currentStored.qrCodeData,
      externalStatus: currentStored.externalStatus,
      amount: currentStored.amount,
      status: 'SUPERSEDED',
    });
    expect(fake.paymentIntents[1]).toMatchObject({
      receivableId: fake.receivable.id,
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      status: 'WAITING_PAYMENT',
      amount: fake.receivable.amount,
    });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('recovers a paid replacement through existing settlement', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({
        providerTransactionId: '75739',
        externalStatus: 'paid',
        status: 'PAID',
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
      }),
    );

    const recovered = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    expect(recovered.status).toBe('PAID');
    expect(fake.paymentIntents).toHaveLength(2);
    expect(fake.paymentIntents[0]).toMatchObject({ id: current.id, status: 'SUPERSEDED' });
    expect(fake.paymentIntents[1]).toMatchObject({
      providerTransactionId: '75739',
      status: 'PAID',
    });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it.each(['EXPIRED', 'CANCELED', 'FAILED', 'REFUNDED'] as const)(
    'blocks replacement recovery for terminal provider status %s',
    async (status) => {
      const fake = createFinancePrisma();
      const service = createFinanceService(fake);
      const current = await createFastFlowWaitingPix(service, fake);
      fake.provider.getPixTransaction.mockResolvedValue(
        reconciliationTransaction({
          providerTransactionId: '75739',
          externalStatus: status.toLowerCase(),
          status,
          pixCopyPaste: null,
          qrCodeData: null,
        }),
      );

      const preview = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
      });

      expect(preview.recoverable).toBe(false);
      expect(preview.expectedCurrentIntentId).toBe(current.id);
      expect(preview.blockers).toContainEqual(
        expect.objectContaining({ code: 'TERMINAL_STATUS_NOT_RECOVERABLE' }),
      );
      await expect(
        service.recoverReceivablePixReplacement(
          fake.receivable.id,
          {
            provider: 'FASTFLOW',
            providerTransactionId: '75739',
            expectedCurrentIntentId: current.id,
          },
          actorUserId,
        ),
      ).rejects.toThrow(ConflictException);
      expect(fake.paymentIntents).toHaveLength(1);
      expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
      expect(fake.transactions).toHaveLength(0);
      expect(fake.provider.createPix).not.toHaveBeenCalled();
      expect(fake.provider.cancelPix).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'unknown status',
      reconciliationTransaction({ providerTransactionId: '75739', externalStatus: 'mystery' }),
    ],
    [
      'amount mismatch',
      reconciliationTransaction({
        providerTransactionId: '75739',
        amount: new Prisma.Decimal('31.00'),
      }),
    ],
    ['id mismatch', reconciliationTransaction({ providerTransactionId: '99999' })],
  ])('blocks replacement recovery on %s', async (_label, transaction) => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(transaction);

    await expect(
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it.each(['29.99', '30.01'])(
    'blocks replacement recovery when B amount is %s for a 30.00 receivable',
    async (amount) => {
      const fake = createFinancePrisma();
      const service = createFinanceService(fake);
      const current = await createFastFlowWaitingPix(service, fake);
      fake.provider.getPixTransaction.mockResolvedValue(
        reconciliationTransaction({
          providerTransactionId: '75739',
          amount: new Prisma.Decimal(amount),
        }),
      );

      const preview = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
      });

      expect(preview.recoverable).toBe(false);
      expect(preview.blockers).toContainEqual(expect.objectContaining({ code: 'AMOUNT_MISMATCH' }));
      await expect(
        service.recoverReceivablePixReplacement(
          fake.receivable.id,
          {
            provider: 'FASTFLOW',
            providerTransactionId: '75739',
            expectedCurrentIntentId: current.id,
          },
          actorUserId,
        ),
      ).rejects.toThrow(ConflictException);
      expect(fake.paymentIntents).toHaveLength(1);
      expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
      expect(fake.receivable.status).toBe('PENDENTE');
      expect(fake.transactions).toHaveLength(0);
    },
  );

  it('handles duplicate replacement recovery without creating a second local B intent', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    const first = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );
    const second = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    expect(second.id).toBe(first.id);
    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('blocks replacement recovery when B already belongs to another receivable', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.paymentIntents.push({
      id: 'intent-other-receivable',
      receivableId: 'other-receivable-id',
      paymentGroupId: null,
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'other-pix-copy-paste',
      qrCodeData: 'other-qr-code-data',
      expiresAt: new Date('2026-09-24T01:00:00.000Z'),
      paidAt: null,
      lastSyncAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    });

    await expect(
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow('Ja existe intencao local para esta transacao do provider.');
    expect(fake.paymentIntents[0]).toMatchObject({ id: current.id, status: 'WAITING_PAYMENT' });
    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(1);
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
    expect(fake.transactions).toHaveLength(0);
  });

  it('blocks replacement recovery before writes when the expected current intent changed', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.createPix.mockResolvedValueOnce({
      provider: 'FASTFLOW',
      providerTransactionId: '88888',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: fake.receivable.amount,
      pixCopyPaste: 'pix-88888',
      qrCodeData: 'qr-88888',
      expiresAt: new Date('2026-09-24T02:00:00.000Z'),
    } as never);
    await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    await expect(
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow('PIX atual mudou');
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(0);
  });

  it('serializes double replacement recovery to one B intent', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    await Promise.all([
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ]);

    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(1);
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('keeps replacement recovery and normal replacement from both winning operational state', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    await expect(
      service.replaceReceivablePix(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow('PIX atual mudou');
    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(1);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
  });

  it('keeps replacement recovery and reconciliation from duplicating B', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );

    const recovered = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );
    const reconciled = await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75739' },
      actorUserId,
    );

    expect(reconciled.id).toBe(recovered.id);
    expect(
      fake.paymentIntents.filter((intent) => intent.providerTransactionId === '75739'),
    ).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
  });

  it('syncs recovered waiting-payment B to paid through existing settlement', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );
    fake.provider.getPixStatus.mockResolvedValue(
      reconciliationTransaction({
        providerTransactionId: '75739',
        externalStatus: 'paid',
        status: 'PAID',
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
      }),
    );
    const recovered = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );

    await service.syncPaymentIntent(recovered.id, actorUserId);
    await service.syncPaymentIntent(recovered.id, actorUserId);

    expect(fake.paymentIntents[0]).toMatchObject({ id: current.id, status: 'SUPERSEDED' });
    expect(fake.paymentIntents[1]).toMatchObject({ id: recovered.id, status: 'PAID' });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('processes webhook after recovered waiting-payment B and keeps sync replay idempotent', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );
    fake.provider.getPixStatus.mockResolvedValue(
      reconciliationTransaction({
        providerTransactionId: '75739',
        externalStatus: 'paid',
        status: 'PAID',
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
      }),
    );
    const recovered = await service.recoverReceivablePixReplacement(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
        expectedCurrentIntentId: current.id,
      },
      actorUserId,
    );
    const rawPayload = JSON.stringify({
      event: 'transaction.paid',
      id: '75739',
      status: 'paid',
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );
    await service.syncPaymentIntent(recovered.id, actorUserId);

    expect(fake.paymentIntents[0]).toMatchObject({ id: current.id, status: 'SUPERSEDED' });
    expect(fake.paymentIntents[1]).toMatchObject({ id: recovered.id, status: 'PAID' });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.webhookEvents).toHaveLength(1);
  });

  it('rolls back replacement recovery local writes when creating B fails', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '75739' }),
    );
    const originalCreate = fake.prisma.paymentIntent.create;
    fake.prisma.paymentIntent.create = (args) => {
      if (args.data.providerTransactionId === '75739') {
        throw new Error('forced recovery persistence failure');
      }
      return originalCreate(args);
    };

    await expect(
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow('forced recovery persistence failure');
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]).toMatchObject({ id: current.id, status: 'WAITING_PAYMENT' });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('blocks replacement recovery for grouped PIX and paid or canceled receivables', async () => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    await createFastFlowWaitingPix(service, fake);
    fake.paymentIntents[0]!.paymentGroupId = 'group-1';

    const grouped = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
    });

    expect(grouped.recoverable).toBe(false);
    expect(grouped.blockers).toContainEqual(
      expect.objectContaining({ code: 'GROUPED_PIX_NOT_SUPPORTED' }),
    );
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();

    for (const status of ['PAGO', 'CANCELADO'] as const) {
      fake.receivable.status = status;
      const preview = await service.previewReceivablePixReplacementRecovery(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75739',
      });
      expect(preview.recoverable).toBe(false);
    }
  });

  it.each([
    ['400', new BadRequestException('provider 400')],
    ['401', new BadGatewayException('provider 401')],
    ['403', new BadGatewayException('provider 403')],
    ['409', new ConflictException('provider 409')],
    ['429', new BadGatewayException('provider 429')],
    ['500', new BadGatewayException('provider 500')],
    ['timeout', new Error('provider timeout')],
  ])('keeps replacement recovery write-free on provider error %s', async (_label, error) => {
    const fake = createFinancePrisma();
    const service = createFinanceService(fake);
    const current = await createFastFlowWaitingPix(service, fake);
    fake.provider.getPixTransaction.mockRejectedValue(error);

    await expect(
      service.recoverReceivablePixReplacement(
        fake.receivable.id,
        {
          provider: 'FASTFLOW',
          providerTransactionId: '75739',
          expectedCurrentIntentId: current.id,
        },
        actorUserId,
      ),
    ).rejects.toThrow();
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]!.status).toBe('WAITING_PAYMENT');
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.provider.cancelPix).not.toHaveBeenCalled();
  });

  it('keeps a superseded PIX superseded when sync still returns waiting payment', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const oldIntent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    await service.replaceReceivablePix(
      fake.receivable.id,
      {
        provider: oldIntent.provider,
        expectedCurrentIntentId: oldIntent.id,
        idempotencyKey: `pix-replace:${oldIntent.id}`,
      },
      actorUserId,
    );
    fake.provider.getPixStatus.mockResolvedValue({
      provider: oldIntent.provider,
      providerTransactionId: oldIntent.providerTransactionId,
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(oldIntent.id, actorUserId);

    expect(fake.paymentIntents[0]).toMatchObject({
      id: oldIntent.id,
      status: 'SUPERSEDED',
      externalStatus: 'pending',
    });
    expect(
      fake.paymentIntents.filter((intent) => intent.status === 'WAITING_PAYMENT'),
    ).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
  });

  it('rejects mock confirmation for real payment providers', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';

    await expect(service.confirmMockPaymentIntent(intent.id, actorUserId)).rejects.toThrow(
      'Confirmacao mock permitida apenas para provider MOCK.',
    );
    expect(fake.provider.markPixPaid).not.toHaveBeenCalled();
    expect(fake.transactions).toHaveLength(0);
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
      paidAt: new Date('2026-10-10T15:00:00.000Z'),
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

  it('syncs a payment intent using the string provider transaction ID contract', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = '75148';
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });

    await expect(service.syncPaymentIntent(intent.id, actorUserId)).resolves.toMatchObject({
      providerTransactionId: '75148',
      status: 'WAITING_PAYMENT',
    });
    expect(fake.provider.getPixStatus).toHaveBeenCalledWith('75148', 'FASTFLOW');
  });

  it('preserves an existing PIX when provider rejects sync credentials', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = '75148';
    fake.provider.getPixStatus.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );

    await expect(service.syncPaymentIntent(intent.id, actorUserId)).rejects.toThrow(
      BadGatewayException,
    );

    expect(fake.paymentIntents.at(0)).toMatchObject({
      status: 'WAITING_PAYMENT',
      externalStatus: 'pending',
    });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('cancels a pending PIX after provider confirmation without paying the receivable', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = '75148';
    fake.provider.cancelPix.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'cancelled',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'CANCELED',
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });

    const canceled = await service.cancelPaymentIntent(intent.id, actorUserId);

    expect(fake.provider.cancelPix).toHaveBeenCalledWith('75148', 'FASTFLOW');
    expect(canceled).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      status: 'CANCELED',
    });
    expect(fake.paymentIntents.at(0)).toMatchObject({
      status: 'CANCELED',
      externalStatus: 'cancelled',
    });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.receivable.paidAt).toBeNull();
    expect(fake.transactions).toHaveLength(0);
  });

  it('preserves local PIX state when provider rejects cancellation', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = '75148';
    fake.provider.cancelPix.mockRejectedValue(new BadRequestException('Transação já expirada.'));

    await expect(service.cancelPaymentIntent(intent.id, actorUserId)).rejects.toThrow(
      'Transação já expirada.',
    );

    expect(fake.paymentIntents.at(0)).toMatchObject({
      status: 'WAITING_PAYMENT',
      externalStatus: 'pending',
    });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.receivable.paidAt).toBeNull();
    expect(fake.transactions).toHaveLength(0);
  });

  it('preserves local state when reconciliation preview provider credentials are rejected', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
      }),
    ).rejects.toThrow(BadGatewayException);

    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('preserves local state when reconciliation confirm provider credentials are rejected', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockRejectedValueOnce(
      new BadGatewayException('Credencial do provider invalida ou nao autorizada.'),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
    ).rejects.toThrow(BadGatewayException);

    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('previews an orphan external PIX without local writes', async () => {
    const fake = createFinancePrisma();
    fake.receivable.id = '0699aa7a-23d0-4463-9501-daf92c930bea';
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: 'depix-75148',
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-09-24T01:00:00.000Z'),
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: 75148 as never,
    });

    expect(preview).toMatchObject({
      adoptable: true,
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      external: {
        providerTransactionId: '75148',
        status: 'WAITING_PAYMENT',
        amount: '30.00',
        hasPixCopyPaste: true,
        hasQrCodeData: true,
      },
      impact: [
        'Criar PaymentIntent local',
        'Manter Receivable PENDENTE',
        'Nao criar PIX novo',
        'Nao criar FinancialTransaction',
      ],
    });
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
  });

  it('blocks PIX reconciliation preview on amount mismatch', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('31.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: null,
      expiresAt: null,
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
    });

    expect(preview.adoptable).toBe(false);
    expect(preview.blockers).toContainEqual(expect.objectContaining({ code: 'AMOUNT_MISMATCH' }));
    expect(fake.paymentIntents).toHaveLength(0);
  });

  it.each([
    ['29.99', 'AMOUNT_MISMATCH'],
    ['30.01', 'AMOUNT_MISMATCH'],
  ])('blocks PIX reconciliation preview when provider amount is %s', async (amount, code) => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ amount: new Prisma.Decimal(amount) }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
    });

    expect(preview.adoptable).toBe(false);
    expect(preview.blockers).toContainEqual(expect.objectContaining({ code }));
    expect(fake.paymentIntents).toHaveLength(0);
  });

  it('blocks PIX reconciliation preview on provider transaction ID mismatch', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ providerTransactionId: '99999' }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
    });

    expect(preview.adoptable).toBe(false);
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'TRANSACTION_ID_MISMATCH' }),
    );
    expect(fake.paymentIntents).toHaveLength(0);
  });

  it('rejects empty PIX reconciliation transaction IDs', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ['paid', 'PAID' as const],
    ['expired', 'EXPIRED' as const],
  ])('previews reconciliable %s provider status without writes', async (externalStatus, status) => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({
        externalStatus,
        status,
        paidAt: status === 'PAID' ? new Date('2026-09-24T01:00:00.000Z') : null,
      }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
    });

    expect(preview).toMatchObject({ adoptable: true, external: { status } });
    if (status === 'PAID') {
      expect(preview.impact).toEqual([
        'Criar PaymentIntent local',
        'Processar pagamento pela regra financeira existente',
        'Baixar Receivable',
        'Criar uma FinancialTransaction se ainda nao existir',
      ]);
    } else {
      expect(preview.impact).toEqual([
        'Criar PaymentIntent historico EXPIRED',
        'Manter Receivable PENDENTE',
        'Nao criar PIX novo',
        'Nao criar FinancialTransaction',
      ]);
    }
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
  });

  it('confirms pending orphan PIX adoption without writing off the receivable', async () => {
    const fake = createFinancePrisma();
    fake.receivable.id = '0699aa7a-23d0-4463-9501-daf92c930bea';
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-09-24T01:00:00.000Z'),
      paidAt: null,
      failureCode: null,
      failureMessage: null,
    });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.reconcileReceivablePix(
      fake.receivable.id,
      {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
        reason: 'Reconciliação de PIX criado no provider após falha de persistência local.',
      },
      actorUserId,
    );

    expect(intent).toMatchObject({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      status: 'WAITING_PAYMENT',
      amount: '30.00',
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
    });
    expect(fake.provider.createPix).not.toHaveBeenCalled();
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it.each([
    ['EXPIRED' as const, 'expired'],
    ['CANCELED' as const, 'canceled'],
    ['REFUNDED' as const, 'refunded'],
    ['FAILED' as const, 'failed'],
  ])(
    'confirms %s orphan PIX as historical intent without financial write-off',
    async (status, externalStatus) => {
      const fake = createFinancePrisma();
      fake.receivable.amount = new Prisma.Decimal('30.00');
      fake.provider.getPixTransaction.mockResolvedValue(
        reconciliationTransaction({ status, externalStatus, pixCopyPaste: null, qrCodeData: null }),
      );
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
      );

      const intent = await service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      );

      expect(intent.status).toBe(status);
      expect(fake.paymentIntents).toHaveLength(1);
      expect(fake.receivable.status).toBe('PENDENTE');
      expect(fake.transactions).toHaveLength(0);
      expect(fake.provider.createPix).not.toHaveBeenCalled();
    },
  );

  it('blocks unknown provider status without local writes', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(
      reconciliationTransaction({ externalStatus: 'mystery', status: 'WAITING_PAYMENT' }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it.each(['PAGO', 'CANCELADO'] as const)(
    'blocks PIX reconciliation when receivable is %s',
    async (status) => {
      const fake = createFinancePrisma();
      fake.receivable.status = status;
      fake.receivable.amount = new Prisma.Decimal('30.00');
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        {} as never,
        fake.config as never,
      );

      const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
      });

      expect(preview.adoptable).toBe(false);
      expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
      expect(fake.paymentIntents).toHaveLength(0);
    },
  );

  it('returns an existing same-transaction intent idempotently on confirm', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.paymentIntents.push({
      id: 'intent-existing',
      receivableId: fake.receivable.id,
      paymentGroupId: null,
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: 'qr-code-data',
      expiresAt: new Date('2026-09-24T01:00:00.000Z'),
      paidAt: null,
      lastSyncAt: new Date('2026-09-24T00:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
      createdAt: new Date('2026-09-24T00:00:00.000Z'),
      updatedAt: new Date('2026-09-24T00:00:00.000Z'),
    });
    fake.provider.getPixTransaction.mockResolvedValue(reconciliationTransaction());
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );

    expect(intent.id).toBe('intent-existing');
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
  });

  it('blocks reconciliation when another active intent exists for the receivable', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.paymentIntents.push({
      id: 'intent-active',
      receivableId: fake.receivable.id,
      paymentGroupId: null,
      provider: 'FASTFLOW',
      providerTransactionId: '11111',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-active',
      qrCodeData: null,
      expiresAt: new Date('2026-09-24T01:00:00.000Z'),
      paidAt: null,
      lastSyncAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const preview = await service.previewReceivablePixReconciliation(fake.receivable.id, {
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
    });

    expect(preview.adoptable).toBe(false);
    expect(preview.blockers).toContainEqual(
      expect.objectContaining({ code: 'ACTIVE_INTENT_EXISTS' }),
    );
    expect(fake.provider.getPixTransaction).not.toHaveBeenCalled();
  });

  it('confirms paid orphan PIX through existing settlement idempotently', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue({
      provider: 'FASTFLOW',
      providerTransactionId: '75148',
      externalStatus: 'paid',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'PAID',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: null,
      expiresAt: null,
      paidAt: new Date('2026-09-24T01:00:00.000Z'),
      failureCode: null,
      failureMessage: null,
    });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );
    await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );

    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]).toMatchObject({
      status: 'PAID',
      providerTransactionId: '75148',
    });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('blocks confirm when provider changes from preview pending to mismatched paid amount', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction
      .mockResolvedValueOnce({
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
        externalStatus: 'pending',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'WAITING_PAYMENT',
        amount: new Prisma.Decimal('30.00'),
        pixCopyPaste: 'pix-copy-paste',
        qrCodeData: null,
        expiresAt: null,
        paidAt: null,
        failureCode: null,
        failureMessage: null,
      })
      .mockResolvedValueOnce({
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
        externalStatus: 'paid',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'PAID',
        amount: new Prisma.Decimal('31.00'),
        pixCopyPaste: 'pix-copy-paste',
        qrCodeData: null,
        expiresAt: null,
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
        failureCode: null,
        failureMessage: null,
      });
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
      }),
    ).resolves.toMatchObject({ adoptable: true });

    await expect(
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
  });

  it('reconsults provider on confirm and settles when preview pending becomes paid', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction
      .mockResolvedValueOnce(reconciliationTransaction())
      .mockResolvedValueOnce(
        reconciliationTransaction({
          externalStatus: 'paid',
          status: 'PAID',
          paidAt: new Date('2026-09-24T01:00:00.000Z'),
        }),
      );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
      }),
    ).resolves.toMatchObject({ adoptable: true, external: { status: 'WAITING_PAYMENT' } });

    const paid = await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );

    expect(paid.status).toBe('PAID');
    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it.each([
    ['not found', new NotFoundException('Transacao de pagamento nao encontrada no provider.')],
    ['timeout', new Error('Tempo limite da API de pagamentos excedido.')],
  ])('keeps confirm write-free when provider returns %s', async (_label, error) => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockRejectedValue(error);
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
    ).rejects.toThrow();
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
  });

  it('keeps preview write-free when provider times out', async () => {
    const fake = createFinancePrisma();
    fake.provider.getPixTransaction.mockRejectedValue(new Error('provider timeout'));
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await expect(
      service.previewReceivablePixReconciliation(fake.receivable.id, {
        provider: 'FASTFLOW',
        providerTransactionId: '75148',
      }),
    ).rejects.toThrow('provider timeout');
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('keeps double pending reconciliation confirm to one PaymentIntent', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(reconciliationTransaction());
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    await Promise.all([
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
      service.reconcileReceivablePix(
        fake.receivable.id,
        { provider: 'FASTFLOW', providerTransactionId: '75148' },
        actorUserId,
      ),
    ]);

    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.transactions).toHaveLength(0);
    expect(fake.provider.createPix).not.toHaveBeenCalled();
  });

  it('syncs a reconciled pending PIX to paid through existing settlement', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(reconciliationTransaction());
    fake.provider.getPixStatus.mockResolvedValue(
      reconciliationTransaction({
        externalStatus: 'paid',
        status: 'PAID',
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
      }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
    );

    const intent = await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );
    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]!.status).toBe('PAID');
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('processes webhook after pending reconciliation and keeps sync replay idempotent', async () => {
    const fake = createFinancePrisma();
    fake.receivable.amount = new Prisma.Decimal('30.00');
    fake.provider.getPixTransaction.mockResolvedValue(reconciliationTransaction());
    fake.provider.getPixStatus.mockResolvedValue(
      reconciliationTransaction({
        externalStatus: 'paid',
        status: 'PAID',
        paidAt: new Date('2026-09-24T01:00:00.000Z'),
      }),
    );
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );

    const intent = await service.reconcileReceivablePix(
      fake.receivable.id,
      { provider: 'FASTFLOW', providerTransactionId: '75148' },
      actorUserId,
    );
    const rawPayload = JSON.stringify({
      event: 'transaction.paid',
      id: '75148',
      status: 'paid',
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.paymentIntents).toHaveLength(1);
    expect(fake.paymentIntents[0]!.status).toBe('PAID');
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
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
      paidAt: new Date('2026-10-10T15:00:00.000Z'),
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

  it('activates once from paid PIX replay and keeps the cycle based on the initial due date', async () => {
    const fake = createFinancePrisma();
    fake.clientReference.status = 'PENDENTE_PAGAMENTO';
    fake.clientReference.dueDate = parseBusinessDate('2026-01-31');
    fake.clientReference.billingAnchorDay = 31;
    fake.receivable.purpose = 'INITIAL_ACTIVATION';
    fake.receivable.renewalId = null;
    fake.receivable.dueDate = parseBusinessDate('2026-01-31');
    const { referrals } = createReferralQualificationDouble();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      referrals as never,
    );
    const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.provider.getPixStatus.mockResolvedValue({
      provider: 'MOCK',
      providerTransactionId: intent.providerTransactionId,
      status: 'PAID',
      paidAt: parseBusinessDate('2026-02-05'),
      failureCode: null,
      failureMessage: null,
    });

    await service.syncPaymentIntent(intent.id, actorUserId);
    await service.syncPaymentIntent(intent.id, actorUserId);

    expect(fake.clientReference.status).toBe('ATIVO');
    expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-02-28'));
    expect(fake.clientReference.billingAnchorDay).toBe(31);
    expect(fake.transactions).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'STATUS_CHANGED')).toHaveLength(1);
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
      paidAt: new Date('2026-10-10T15:00:00.000Z'),
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
    const rawPayload = JSON.stringify({
      transaction_id: 22116,
      status: 'paid',
      amount: 29.99,
      net_amount: 28.99,
      payment_provider: 'fastflow',
      end_to_end_id: 'E0000020820260819035839016774525',
      payer_name: 'Cliente Teste',
      payer_phone: null,
      created_at: '2026-08-19 00:58:19',
      updated_at: '2026-08-19 00:59:01',
      paid_at: '2026-08-19 00:59:01',
    });
    fake.paymentIntents.at(0)!.providerTransactionId = '22116';

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
    expect(fake.webhookEvents.at(0)).toMatchObject({
      eventKey: 'transaction.paid',
      providerTransactionId: '22116',
      status: 'paid',
    });
  });

  it('uses the webhook paid instant as Sao Paulo business date for late FastFlow renewal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T15:00:00.000Z'));
    try {
      const fake = createFinancePrisma();
      fake.clientReference.dueDate = parseBusinessDate('2026-09-14');
      fake.clientReference.billingAnchorDay = 14;
      fake.receivable.dueDate = parseBusinessDate('2026-09-14');
      const { cycle, nextReceivables } = createCycleRecorder(fake);
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        fake.credentials as never,
        fake.config as never,
        undefined,
        cycle as never,
      );
      const intent = await service.createReceivablePix(fake.receivable.id, actorUserId);
      fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
      fake.paymentIntents.at(0)!.providerTransactionId = 'tx-late-fastflow';
      const rawPayload = JSON.stringify({ transaction_id: 'tx-late-fastflow', status: 'paid' });

      await service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      );

      expect(intent.id).toBe('intent-1');
      expect(fake.receivable.paidAt).toEqual(parseBusinessDate('2026-09-17'));
      expect(fake.clientReference.dueDate).toEqual(parseBusinessDate('2026-10-17'));
      expect(fake.clientReference.billingAnchorDay).toBe(17);
      expect(nextReceivables[0]).toMatchObject({
        dueDate: parseBusinessDate('2026-10-17'),
        status: 'PENDENTE',
      });
    } finally {
      vi.useRealTimers();
    }
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
    expect(fake.webhookEvents).toHaveLength(0);
  });

  it('validates signatures against the received raw body bytes, not a re-stringified payload', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-raw-body';
    const parsedPayload = { transaction_id: 'tx-raw-body', status: 'paid' };
    const compactRaw = JSON.stringify(parsedPayload);
    const spacedRaw = JSON.stringify(parsedPayload, null, 2);

    await expect(
      service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(spacedRaw),
        Buffer.from(compactRaw),
        parsedPayload,
      ),
    ).rejects.toThrow('Assinatura do webhook de pagamento invalida.');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.webhookEvents).toHaveLength(0);

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(compactRaw),
      Buffer.from(compactRaw),
      parsedPayload,
    );

    expect(fake.transactions).toHaveLength(1);
    expect(fake.webhookEvents).toHaveLength(1);
  });

  it('rejects invalid signatures with incompatible buffer sizes as a controlled error', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-short-signature';
    const rawPayload = JSON.stringify({ transaction_id: 'tx-short-signature', status: 'paid' });

    await expect(
      service.processPaymentWebhook(
        'FASTFLOW',
        'sha256=abc',
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      ),
    ).rejects.toThrow('Assinatura do webhook de pagamento invalida.');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.webhookEvents).toHaveLength(0);
  });

  it.each([
    [
      'missing signature',
      undefined,
      Buffer.from(JSON.stringify({ transaction_id: 'tx-123', status: 'paid' })),
    ],
    [
      'missing raw body',
      createWebhookSignature(JSON.stringify({ transaction_id: 'tx-123', status: 'paid' })),
      undefined,
    ],
  ])(
    'rejects payment webhooks with %s before financial effects',
    async (_label, signature, rawBody) => {
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

      await expect(
        service.processPaymentWebhook('FASTFLOW', signature, rawBody, {
          transaction_id: 'tx-123',
          status: 'paid',
        }),
      ).rejects.toThrow();
      expect(fake.transactions).toHaveLength(0);
      expect(fake.webhookEvents).toHaveLength(0);
    },
  );

  it('rejects payment webhooks when the configured secret is absent', async () => {
    const fake = createFinancePrisma();
    fake.credentials.getWebhookSecret.mockRejectedValueOnce(new NotFoundException('missing'));
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
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      ),
    ).rejects.toThrow('Webhook de pagamento nao autorizado.');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.webhookEvents).toHaveLength(0);
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

  it('keeps numeric and string webhook transaction IDs idempotent for the same FastFlow event', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = '75148';
    const numericPayload = JSON.stringify({
      transaction_id: 75148,
      status: 'paid',
      payment_provider: 'fastflow',
    });
    const stringPayload = JSON.stringify({
      transaction_id: '75148',
      status: 'paid',
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(numericPayload),
      Buffer.from(numericPayload),
      JSON.parse(numericPayload),
    );
    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(stringPayload),
      Buffer.from(stringPayload),
      JSON.parse(stringPayload),
    );

    expect(fake.transactions).toHaveLength(1);
    expect(fake.webhookEvents).toHaveLength(1);
    expect(fake.webhookEvents.at(0)).toMatchObject({
      providerTransactionId: '75148',
      status: 'paid',
      eventKey: 'transaction.paid',
    });
  });

  it('keeps approved and paid webhooks as distinct idempotent transaction states', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-approved-paid';

    const approvedPayload = JSON.stringify({
      transaction_id: 'tx-approved-paid',
      status: 'approved',
      payment_provider: 'fastflow',
    });
    const paidPayload = JSON.stringify({
      transaction_id: 'tx-approved-paid',
      status: 'paid',
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(approvedPayload),
      Buffer.from(approvedPayload),
      JSON.parse(approvedPayload),
    );
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(paidPayload),
      Buffer.from(paidPayload),
      JSON.parse(paidPayload),
    );
    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(paidPayload),
      Buffer.from(paidPayload),
      JSON.parse(paidPayload),
    );

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'PAYMENT_REGISTERED')).toHaveLength(1);
    expect(fake.webhookEvents.map((event) => event.eventKey)).toEqual([
      'transaction.approved',
      'transaction.paid',
    ]);
  });

  it('rejects provider mismatch from a signed transaction payload', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-provider-mismatch';
    const rawPayload = JSON.stringify({
      transaction_id: 'tx-provider-mismatch',
      status: 'paid',
      payment_provider: 'fastpay',
    });

    await expect(
      service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      ),
    ).rejects.toThrow('Provider do webhook nao corresponde a rota informada.');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.webhookEvents).toHaveLength(0);
  });

  it('accepts legacy nested transaction payloads without making them the primary contract', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTPAY';
    fake.paymentIntents.at(0)!.providerTransactionId = 'legacy-tx';
    const rawPayload = JSON.stringify({
      event: 'transaction.paid',
      data: { transaction_id: 'legacy-tx', status: 'paid' },
    });

    await service.processPaymentWebhook(
      'FASTPAY',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );

    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it('keeps root transaction fields authoritative when legacy data is also present', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-root-wins';
    const rawPayload = JSON.stringify({
      event: 'transaction.paid',
      transaction_id: 'tx-root-wins',
      status: 'paid',
      payment_provider: 'fastflow',
      data: { transaction_id: 'tx-legacy-wrong', status: 'expired' },
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );

    expect(fake.paymentIntents.at(0)).toMatchObject({ status: 'PAID', externalStatus: 'paid' });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
  });

  it.each([
    ['commission.calculated', 'commission-1'],
    ['withdrawal.status_changed', 'withdrawal-1'],
    ['med.created', 'med-1'],
  ])(
    'ignores signed non-transaction payment event %s without financial effects',
    async (event, id) => {
      const fake = createFinancePrisma();
      const service = new FinanceService(
        fake.prisma as never,
        fake.provider,
        fake.credentials as never,
        fake.config as never,
      );
      const rawPayload = JSON.stringify({ event, id });

      const result = await service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      );

      expect(result).toEqual({ ignored: true, reason: 'unsupported_payment_event' });
      expect(fake.receivable.status).toBe('PENDENTE');
      expect(fake.transactions).toHaveLength(0);
      expect(fake.webhookEvents).toHaveLength(0);
    },
  );

  it('rejects signed unknown events safely without financial effects', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    const rawPayload = JSON.stringify({ event: 'account.updated', id: 'event-unknown' });

    await expect(
      service.processPaymentWebhook(
        'FASTFLOW',
        createWebhookSignature(rawPayload),
        Buffer.from(rawPayload),
        JSON.parse(rawPayload),
      ),
    ).rejects.toThrow('Evento de webhook de pagamento nao suportado.');
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
    expect(fake.webhookEvents).toHaveLength(0);
  });

  it.each([
    ['pending', 'WAITING_PAYMENT'],
    ['approved', 'WAITING_PAYMENT'],
    ['expired', 'EXPIRED'],
    ['refunded', 'REFUNDED'],
  ])('processes flat %s webhook without receivable write-off', async (externalStatus, status) => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = `tx-${externalStatus}`;
    const rawPayload = JSON.stringify({
      transaction_id: `tx-${externalStatus}`,
      status: externalStatus,
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(rawPayload),
      Buffer.from(rawPayload),
      JSON.parse(rawPayload),
    );

    expect(fake.paymentIntents.at(0)).toMatchObject({ status, externalStatus });
    expect(fake.receivable.status).toBe('PENDENTE');
    expect(fake.transactions).toHaveLength(0);
  });

  it('preserves receivable and financial history when a paid webhook is later refunded', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      fake.credentials as never,
      fake.config as never,
    );
    await service.createReceivablePix(fake.receivable.id, actorUserId);
    fake.paymentIntents.at(0)!.provider = 'FASTFLOW';
    fake.paymentIntents.at(0)!.providerTransactionId = 'tx-paid-refunded';
    const paidPayload = JSON.stringify({
      transaction_id: 'tx-paid-refunded',
      status: 'paid',
      payment_provider: 'fastflow',
    });
    const refundedPayload = JSON.stringify({
      transaction_id: 'tx-paid-refunded',
      status: 'refunded',
      payment_provider: 'fastflow',
    });

    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(paidPayload),
      Buffer.from(paidPayload),
      JSON.parse(paidPayload),
    );
    await service.processPaymentWebhook(
      'FASTFLOW',
      createWebhookSignature(refundedPayload),
      Buffer.from(refundedPayload),
      JSON.parse(refundedPayload),
    );

    expect(fake.paymentIntents.at(0)).toMatchObject({
      status: 'REFUNDED',
      externalStatus: 'refunded',
    });
    expect(fake.receivable.status).toBe('PAGO');
    expect(fake.transactions).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'PAYMENT_REGISTERED')).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'PIX_PAYMENT_STATUS_UPDATED')).toHaveLength(
      1,
    );
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
