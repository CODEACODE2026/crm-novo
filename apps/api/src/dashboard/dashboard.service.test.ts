import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { DashboardService } from './dashboard.service';

function decimal(value: string | number) {
  return new Prisma.Decimal(value);
}

function createDashboardPrisma() {
  const plan = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: decimal('50.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const activeDueToday = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Cliente Hoje',
    phone: '44999999999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'HOJE',
    planId: plan.id,
    recurringValue: decimal('50.00'),
    dueDate: parseBusinessDate('2026-09-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 5,
    notes: null,
    status: 'ATIVO' as const,
    createdAt: new Date('2026-09-10T12:00:00.000Z'),
    updatedAt: new Date(),
    plan,
  };
  const activeTomorrow = {
    ...activeDueToday,
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Cliente Amanha',
    reference: 'AMANHA',
    dueDate: parseBusinessDate('2026-09-11'),
  };
  const activeOverdue = {
    ...activeDueToday,
    id: '44444444-4444-4444-8444-444444444444',
    name: 'Cliente Vencido',
    reference: 'VENCIDO',
    dueDate: parseBusinessDate('2026-09-01'),
  };
  const inactive = {
    ...activeDueToday,
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Cliente Inativo',
    reference: 'INATIVO',
    status: 'INATIVO' as const,
  };
  const canceled = {
    ...activeDueToday,
    id: '66666666-6666-4666-8666-666666666666',
    name: 'Cliente Cancelado',
    reference: 'CANCELADO',
    status: 'CANCELADO' as const,
  };
  const clients = [activeDueToday, activeTomorrow, activeOverdue, inactive, canceled];
  const receivables = [
    {
      id: '77777777-7777-4777-8777-777777777777',
      clientId: activeOverdue.id,
      renewalId: '88888888-8888-4888-8888-888888888888',
      description: 'Recebivel vencido',
      amount: decimal('40.00'),
      dueDate: parseBusinessDate('2026-09-01'),
      status: 'PENDENTE' as const,
      paidAt: null,
      canceledAt: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      client: activeOverdue,
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      clientId: activeTomorrow.id,
      renewalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      description: 'Recebivel futuro',
      amount: decimal('60.00'),
      dueDate: parseBusinessDate('2026-09-15'),
      status: 'PENDENTE' as const,
      paidAt: null,
      canceledAt: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      client: activeTomorrow,
    },
  ];
  const transactions = [
    {
      transactionDate: parseBusinessDate('2026-09-10'),
      type: 'ENTRADA' as const,
      origin: 'RECEIVABLE_PAYMENT' as const,
      amount: decimal('100.00'),
    },
    {
      transactionDate: parseBusinessDate('2026-09-10'),
      type: 'ENTRADA' as const,
      origin: 'MANUAL' as const,
      amount: decimal('50.00'),
    },
    {
      transactionDate: parseBusinessDate('2026-09-10'),
      type: 'SAIDA' as const,
      origin: 'MANUAL' as const,
      amount: decimal('80.00'),
    },
  ];
  const renewals = [{ createdAt: new Date('2026-09-10T12:00:00.000Z'), amount: decimal('125.00') }];
  const events = [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      clientId: activeDueToday.id,
      type: 'CLIENT_RENEWED' as const,
      title: 'Cliente renovado.',
      description: 'Renovacao registrada.',
      metadata: null,
      createdByUserId: null,
      createdAt: new Date('2026-09-10T13:00:00.000Z'),
      client: activeDueToday,
    },
  ];
  const paymentIntents = [{ status: 'WAITING_PAYMENT' }, { status: 'FAILED' }, { status: 'PAID' }];
  const dispatches = [
    {
      origin: 'BILLING',
      status: 'SCHEDULED',
      scheduledFor: new Date('2026-09-10T12:00:00.000Z'),
    },
    {
      origin: 'BILLING',
      status: 'FAILED',
      scheduledFor: new Date('2026-09-09T12:00:00.000Z'),
    },
    {
      origin: 'RECOVERY',
      status: 'FAILED',
      scheduledFor: new Date('2026-09-09T12:00:00.000Z'),
    },
  ];
  const recoveryCampaigns = [{ status: 'ATIVA' }, { status: 'CANCELADA' }];
  const pendingContacts = [{ status: 'PENDENTE' }, { status: 'APROVADO' }];
  const inDateRange = (date: Date, range: { gte?: Date; lte?: Date; lt?: Date }) =>
    (!range.gte || date.getTime() >= range.gte.getTime()) &&
    (!range.lte || date.getTime() <= range.lte.getTime()) &&
    (!range.lt || date.getTime() < range.lt.getTime());

  return {
    client: {
      count: ({
        where,
      }: {
        where: {
          status?: string;
          dueDate?: Date | { gte?: Date; lte?: Date; lt?: Date };
          createdAt?: { gte: Date; lte: Date };
        };
      }) =>
        Promise.resolve(
          clients.filter((client) => {
            if (where.status && client.status !== where.status) return false;
            if (where.createdAt && !inDateRange(client.createdAt, where.createdAt)) return false;
            if (where.dueDate instanceof Date) {
              return client.dueDate.getTime() === where.dueDate.getTime();
            }
            if (where.dueDate) return inDateRange(client.dueDate, where.dueDate);
            return true;
          }).length,
        ),
      findMany: ({
        where,
      }: {
        where: { dueDate?: Date | { gte?: Date; lte?: Date; lt?: Date } };
      }) =>
        Promise.resolve(
          clients
            .filter((client) => client.status === 'ATIVO')
            .filter((client) =>
              where.dueDate instanceof Date
                ? client.dueDate.getTime() === where.dueDate.getTime()
                : where.dueDate
                  ? inDateRange(client.dueDate, where.dueDate)
                  : true,
            ),
        ),
    },
    financialTransaction: {
      aggregate: ({
        where,
      }: {
        where: { type: string; origin?: string; transactionDate: { gte: Date; lte: Date } };
      }) =>
        Promise.resolve({
          _sum: {
            amount: transactions
              .filter((transaction) => transaction.type === where.type)
              .filter((transaction) => !where.origin || transaction.origin === where.origin)
              .filter((transaction) =>
                inDateRange(transaction.transactionDate, where.transactionDate),
              )
              .reduce((sum, transaction) => sum.plus(transaction.amount), decimal(0)),
          },
        }),
      groupBy: ({
        by,
        where,
      }: {
        by: string[];
        where: { type?: string; origin?: string; transactionDate: { gte: Date; lte: Date } };
      }) =>
        Promise.resolve(
          transactions
            .filter((transaction) => !where.type || transaction.type === where.type)
            .filter((transaction) => !where.origin || transaction.origin === where.origin)
            .filter((transaction) =>
              inDateRange(transaction.transactionDate, where.transactionDate),
            )
            .map((transaction) => ({
              transactionDate: transaction.transactionDate,
              ...(by.includes('type') ? { type: transaction.type } : {}),
              _sum: { amount: transaction.amount },
            })),
        ),
    },
    receivable: {
      aggregate: ({
        where,
      }: {
        where: { status: string; dueDate: { gte?: Date; lte?: Date; lt?: Date } };
      }) =>
        Promise.resolve({
          _sum: {
            amount: receivables
              .filter((receivable) => receivable.status === where.status)
              .filter((receivable) => inDateRange(receivable.dueDate, where.dueDate))
              .reduce((sum, receivable) => sum.plus(receivable.amount), decimal(0)),
          },
        }),
      findMany: () => Promise.resolve([receivables[0]]),
    },
    renewal: {
      count: ({ where }: { where: { createdAt: { gte: Date; lte: Date } } }) =>
        Promise.resolve(
          renewals.filter((renewal) => inDateRange(renewal.createdAt, where.createdAt)).length,
        ),
      aggregate: ({ where }: { where: { createdAt: { gte: Date; lte: Date } } }) =>
        Promise.resolve({
          _sum: {
            amount: renewals
              .filter((renewal) => inDateRange(renewal.createdAt, where.createdAt))
              .reduce((sum, renewal) => sum.plus(renewal.amount), decimal(0)),
          },
        }),
    },
    clientEvent: {
      findMany: () => Promise.resolve(events),
    },
    paymentIntent: {
      count: ({ where }: { where: { status: string | { in: string[] } } }) =>
        Promise.resolve(
          paymentIntents.filter((intent) => {
            if (typeof where.status === 'string') return intent.status === where.status;
            return where.status.in.includes(intent.status);
          }).length,
        ),
    },
    messageDispatch: {
      count: ({
        where,
      }: {
        where: {
          origin: string;
          status: string;
          scheduledFor?: { gte: Date; lte: Date };
        };
      }) =>
        Promise.resolve(
          dispatches
            .filter((dispatch) => dispatch.origin === where.origin)
            .filter((dispatch) => dispatch.status === where.status)
            .filter((dispatch) =>
              where.scheduledFor ? inDateRange(dispatch.scheduledFor, where.scheduledFor) : true,
            ).length,
        ),
    },
    recoveryCampaign: {
      count: ({ where }: { where: { status: string } }) =>
        Promise.resolve(
          recoveryCampaigns.filter((campaign) => campaign.status === where.status).length,
        ),
    },
    whatsAppPendingContact: {
      count: ({ where }: { where: { status: string } }) =>
        Promise.resolve(
          pendingContacts.filter((contact) => contact.status === where.status).length,
        ),
    },
    $transaction: async <T>(operations: Array<Promise<T>>) => Promise.all(operations),
  };
}

describe('DashboardService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarizes clients, due dates, finance, renewals and recent activity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T15:00:00.000Z'));
    const service = new DashboardService(createDashboardPrisma() as never);

    const summary = await service.summary({ startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(summary.clients).toMatchObject({
      active: 3,
      inactive: 1,
      canceled: 1,
      newInPeriod: 5,
    });
    expect(summary.dueDates).toEqual({
      dueToday: 1,
      upcomingSevenDays: 1,
      overdueClients: 1,
    });
    expect(summary.finance).toEqual({
      received: '100.00',
      receivablePending: '60.00',
      receivableOverdue: '40.00',
      entries: '150.00',
      expenses: '80.00',
      balance: '70.00',
    });
    expect(summary.renewals).toEqual({ count: 1, amount: '125.00' });
    expect(summary.pending.counts).toMatchObject({
      waitingPix: 1,
      failedPix: 1,
      billingScheduledToday: 1,
      billingFailed: 1,
      activeRecoveryCampaigns: 1,
      failedRecoveryDispatches: 1,
      pendingWaitlistContacts: 1,
    });
    expect(summary.pending.items.length).toBeGreaterThan(0);
    expect(summary.lists.dueToday).toHaveLength(1);
    expect(summary.lists.upcomingDue).toHaveLength(1);
    expect(summary.lists.overdueReceivables[0]).toMatchObject({ daysOverdue: 9 });
    expect(summary.lists.recentActivity[0]).toMatchObject({ title: 'Cliente renovado.' });
    expect(summary.charts.cashflow[0]).toMatchObject({
      period: '2026-09-10',
      entries: '150.00',
      expenses: '80.00',
    });
    expect(summary.charts.received[0]).toMatchObject({ amount: '100.00' });
  });

  it('uses America/Sao_Paulo for today near UTC day boundaries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T02:30:00.000Z'));
    const service = new DashboardService(createDashboardPrisma() as never);

    const summary = await service.summary({ startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(summary.today).toBe('2026-09-10');
    expect(summary.dueDates.dueToday).toBe(1);
  });

  it('returns zeroed dashboard data for periods without records', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T15:00:00.000Z'));
    const service = new DashboardService(createDashboardPrisma() as never);

    const summary = await service.summary({ startDate: '2025-01-01', endDate: '2025-01-31' });

    expect(summary.clients.newInPeriod).toBe(0);
    expect(summary.finance.entries).toBe('0.00');
    expect(summary.finance.expenses).toBe('0.00');
    expect(summary.finance.balance).toBe('0.00');
    expect(summary.renewals).toEqual({ count: 0, amount: '0.00' });
  });

  it('rejects incomplete or inverted custom periods', async () => {
    const service = new DashboardService(createDashboardPrisma() as never);

    await expect(service.summary({ startDate: '2026-09-01' })).rejects.toThrow(
      'Informe startDate e endDate juntos.',
    );
    await expect(
      service.summary({ startDate: '2026-10-01', endDate: '2026-09-01' }),
    ).rejects.toThrow('startDate deve ser menor ou igual a endDate.');
  });
});
