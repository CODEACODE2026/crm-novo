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
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
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

function createGroupedFinancePrisma() {
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
    };
  };

  const tx = {
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
      try {
        return await callback(tx);
      } catch (error) {
        receivables.splice(0, receivables.length, ...(snapshots.receivables as typeof receivables));
        references.splice(0, references.length, ...(snapshots.references as typeof references));
        transactions.splice(0, transactions.length, ...snapshots.transactions);
        events.splice(0, events.length, ...snapshots.events);
        paymentGroups.splice(0, paymentGroups.length, ...snapshots.paymentGroups);
        paymentIntents.splice(0, paymentIntents.length, ...snapshots.paymentIntents);
        throw error;
      }
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
    expect(fake.paymentIntents[0]!.status).toBe('PAID');
    expect(fake.paymentGroups[0]!.status).toBe('PAID');
    expect(fake.cycle.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(3);
    expect(fake.recovery.cancelActiveForReceivable).toHaveBeenCalledTimes(3);
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
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
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
    const service = new FinanceService(
      fake.prisma as never,
      fake.provider,
      {} as never,
      fake.config as never,
      undefined,
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
