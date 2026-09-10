import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
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
      findUnique: () =>
        Promise.resolve({
          ...receivable,
          client,
          renewal,
          paymentTransaction:
            transactions.find((transaction) => transaction.receivableId === receivable.id) ?? null,
        }),
      update: ({ data }: { data: Partial<typeof receivable> }) => {
        Object.assign(receivable, data);
        return Promise.resolve({ ...receivable, client, renewal, paymentTransaction: null });
      },
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return Promise.resolve(data);
      },
    },
  };

  return {
    entryCategory,
    expenseCategory,
    receivable,
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
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    },
  };
}

describe('FinanceService', () => {
  it('pays a pending receivable once and registers the client timeline', async () => {
    const fake = createFinancePrisma();
    const service = new FinanceService(fake.prisma as never);

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
    const service = new FinanceService(fake.prisma as never);

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
    const service = new FinanceService(fake.prisma as never);

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
});
