import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { FinancialTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { DashboardSummaryDto } from './dto/dashboard-summary.dto';

const operationalTimeZone = 'America/Sao_Paulo';
const recentLimit = 8;

type DateSeriesPoint = {
  period: string;
  entries: Prisma.Decimal;
  expenses: Prisma.Decimal;
  received: Prisma.Decimal;
};

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(query: DashboardSummaryDto) {
    const range = this.getPeriod(query);
    const today = this.today();
    const todayEnd = new Date(`${formatBusinessDate(today)}T23:59:59.999Z`);
    const tomorrow = this.addDays(today, 1);
    const nextSevenDays = this.addDays(today, 7);
    const chartStart =
      query.startDate || query.endDate ? range.startDate : this.addMonths(today, -5);
    const chartGrouping = this.daysBetween(chartStart, range.endDate) > 62 ? 'month' : 'day';

    const [
      activeClients,
      inactiveClients,
      canceledClients,
      newClients,
      dueTodayCount,
      upcomingDueCount,
      overdueClientsCount,
      received,
      entries,
      expenses,
      pendingReceivables,
      overdueReceivables,
      renewalsCount,
      renewedAmount,
      dueToday,
      upcomingDue,
      overdueReceivableList,
      recentActivity,
      transactionSeries,
      receivedSeries,
      waitingPixCount,
      failedPixCount,
      billingScheduledToday,
      billingFailed,
      activeRecoveryCampaigns,
      failedRecoveryDispatches,
      pendingWaitlistContacts,
      qualifiedReferralsAwaitingReward,
    ] = await this.prisma.$transaction([
      this.prisma.clientReference.count({ where: { status: 'ATIVO' } }),
      this.prisma.clientReference.count({ where: { status: 'INATIVO' } }),
      this.prisma.clientReference.count({ where: { status: 'CANCELADO' } }),
      this.prisma.client.count({
        where: { createdAt: { gte: range.startDateTime, lte: range.endDateTime } },
      }),
      this.prisma.clientReference.count({ where: { status: 'ATIVO', dueDate: today } }),
      this.prisma.clientReference.count({
        where: { status: 'ATIVO', dueDate: { gte: tomorrow, lte: nextSevenDays } },
      }),
      this.prisma.clientReference.count({ where: { status: 'ATIVO', dueDate: { lt: today } } }),
      this.prisma.financialTransaction.aggregate({
        where: {
          type: 'ENTRADA',
          origin: 'RECEIVABLE_PAYMENT',
          transactionDate: { gte: range.startDate, lte: range.endDate },
        },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { type: 'ENTRADA', transactionDate: { gte: range.startDate, lte: range.endDate } },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { type: 'SAIDA', transactionDate: { gte: range.startDate, lte: range.endDate } },
        _sum: { amount: true },
      }),
      this.prisma.receivable.aggregate({
        where: { status: 'PENDENTE', dueDate: { gte: today, lte: range.endDate } },
        _sum: { amount: true },
      }),
      this.prisma.receivable.aggregate({
        where: { status: 'PENDENTE', dueDate: { lt: today, gte: range.startDate } },
        _sum: { amount: true },
      }),
      this.prisma.renewal.count({
        where: { createdAt: { gte: range.startDateTime, lte: range.endDateTime } },
      }),
      this.prisma.renewal.aggregate({
        where: { createdAt: { gte: range.startDateTime, lte: range.endDateTime } },
        _sum: { amount: true },
      }),
      this.prisma.clientReference.findMany({
        where: { status: 'ATIVO', dueDate: today },
        include: { client: true, plan: true },
        orderBy: [{ reference: 'asc' }],
        take: 10,
      }),
      this.prisma.clientReference.findMany({
        where: { status: 'ATIVO', dueDate: { gte: tomorrow, lte: nextSevenDays } },
        include: { client: true, plan: true },
        orderBy: [{ dueDate: 'asc' }, { reference: 'asc' }],
        take: 10,
      }),
      this.prisma.receivable.findMany({
        where: { status: 'PENDENTE', dueDate: { lt: today } },
        include: { client: true, clientReference: true },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 10,
      }),
      this.prisma.clientEvent.findMany({
        include: { client: true },
        orderBy: { createdAt: 'desc' },
        take: recentLimit,
      }),
      this.prisma.financialTransaction.groupBy({
        by: ['transactionDate', 'type'],
        where: { transactionDate: { gte: chartStart, lte: range.endDate } },
        _sum: { amount: true },
        orderBy: { transactionDate: 'asc' },
      }),
      this.prisma.financialTransaction.groupBy({
        by: ['transactionDate'],
        where: {
          type: 'ENTRADA',
          origin: 'RECEIVABLE_PAYMENT',
          transactionDate: { gte: chartStart, lte: range.endDate },
        },
        _sum: { amount: true },
        orderBy: { transactionDate: 'asc' },
      }),
      this.prisma.paymentIntent.count({
        where: { status: { in: ['CREATED', 'WAITING_PAYMENT'] } },
      }),
      this.prisma.paymentIntent.count({ where: { status: 'FAILED' } }),
      this.prisma.messageDispatch.count({
        where: {
          origin: 'BILLING',
          status: 'SCHEDULED',
          scheduledFor: { gte: today, lte: todayEnd },
        },
      }),
      this.prisma.messageDispatch.count({ where: { origin: 'BILLING', status: 'FAILED' } }),
      this.prisma.recoveryCampaign.count({ where: { status: 'ATIVA' } }),
      this.prisma.messageDispatch.count({ where: { origin: 'RECOVERY', status: 'FAILED' } }),
      this.prisma.whatsAppPendingContact.count({ where: { status: 'PENDENTE' } }),
      this.prisma.referral.count({ where: { status: 'QUALIFIED', appliedAt: null } }),
    ]);

    const entriesTotal = this.decimalToNumber(entries._sum.amount);
    const expensesTotal = this.decimalToNumber(expenses._sum.amount);
    const series = this.buildSeries(transactionSeries, receivedSeries, chartGrouping);

    return {
      period: {
        startDate: formatBusinessDate(range.startDate),
        endDate: formatBusinessDate(range.endDate),
        label: range.label,
      },
      today: formatBusinessDate(today),
      clients: {
        active: activeClients,
        inactive: inactiveClients,
        canceled: canceledClients,
        newInPeriod: newClients,
        distribution: [
          { status: 'ATIVO', total: activeClients },
          { status: 'INATIVO', total: inactiveClients },
          { status: 'CANCELADO', total: canceledClients },
        ],
      },
      dueDates: {
        dueToday: dueTodayCount,
        upcomingSevenDays: upcomingDueCount,
        overdueClients: overdueClientsCount,
      },
      finance: {
        received: this.formatDecimal(received._sum.amount),
        receivablePending: this.formatDecimal(pendingReceivables._sum.amount),
        receivableOverdue: this.formatDecimal(overdueReceivables._sum.amount),
        entries: entriesTotal.toFixed(2),
        expenses: expensesTotal.toFixed(2),
        balance: (entriesTotal - expensesTotal).toFixed(2),
      },
      renewals: {
        count: renewalsCount,
        amount: this.formatDecimal(renewedAmount._sum.amount),
      },
      pending: {
        counts: {
          overdueReceivables: overdueReceivableList.length,
          waitingPix: waitingPixCount,
          failedPix: failedPixCount,
          billingScheduledToday,
          billingFailed,
          activeRecoveryCampaigns,
          failedRecoveryDispatches,
          pendingWaitlistContacts,
          qualifiedReferralsAwaitingReward,
        },
        items: [
          {
            label: 'Contas vencidas',
            count: overdueReceivableList.length,
            action: 'finance',
          },
          {
            label: 'PIX aguardando pagamento',
            count: waitingPixCount,
            action: 'finance',
          },
          {
            label: 'PIX com falha',
            count: failedPixCount,
            action: 'finance',
          },
          {
            label: 'Cobrancas agendadas hoje',
            count: billingScheduledToday,
            action: 'billing',
          },
          {
            label: 'Cobrancas com erro',
            count: billingFailed,
            action: 'billing',
          },
          {
            label: 'Campanhas de recuperacao ativas',
            count: activeRecoveryCampaigns,
            action: 'automations',
          },
          {
            label: 'Campanhas com falha',
            count: failedRecoveryDispatches,
            action: 'automations',
          },
          {
            label: 'Contatos na lista de espera',
            count: pendingWaitlistContacts,
            action: 'waitlist',
          },
          {
            label: 'Indicacoes qualificadas aguardando beneficio',
            count: qualifiedReferralsAwaitingReward,
            action: 'clients',
          },
        ].filter((item) => item.count > 0),
      },
      charts: {
        grouping: chartGrouping,
        cashflow: series.map((point) => ({
          period: point.period,
          entries: point.entries.toFixed(2),
          expenses: point.expenses.toFixed(2),
        })),
        received: series.map((point) => ({
          period: point.period,
          amount: point.received.toFixed(2),
        })),
        clients: [
          { label: 'Ativos', value: activeClients },
          { label: 'Inativos', value: inactiveClients },
          { label: 'Cancelados', value: canceledClients },
        ],
      },
      lists: {
        dueToday: dueToday.map((client) => this.presentClientDue(client)),
        upcomingDue: upcomingDue.map((client) => this.presentClientDue(client)),
        overdueReceivables: overdueReceivableList.map((receivable) =>
          this.presentOverdueReceivable(receivable, today),
        ),
        recentActivity: recentActivity.map((event) => ({
          id: event.id,
          type: event.type,
          title: event.title,
          description: event.description,
          createdAt: event.createdAt,
          client: {
            id: event.client.id,
            name: event.client.name,
            reference: event.client.reference,
          },
        })),
      },
    };
  }

  private getPeriod(query: DashboardSummaryDto) {
    if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
      throw new BadRequestException('Informe startDate e endDate juntos.');
    }

    const startDate = query.startDate
      ? parseBusinessDate(query.startDate)
      : this.monthStart(this.today());
    const endDate = query.endDate ? parseBusinessDate(query.endDate) : this.monthEnd(startDate);

    if (startDate.getTime() > endDate.getTime()) {
      throw new BadRequestException('startDate deve ser menor ou igual a endDate.');
    }

    return {
      startDate,
      endDate,
      startDateTime: startDate,
      endDateTime: new Date(`${formatBusinessDate(endDate)}T23:59:59.999Z`),
      label: query.startDate ? 'periodo_personalizado' : 'mes_atual',
    };
  }

  private today() {
    return parseBusinessDate(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: operationalTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
  }

  private monthStart(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private monthEnd(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  private addDays(date: Date, days: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  }

  private addMonths(date: Date, months: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  }

  private daysBetween(startDate: Date, endDate: Date) {
    return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  }

  private buildSeries(
    transactionRows: Array<{
      transactionDate: Date;
      type: FinancialTransactionType;
      _sum?: { amount?: Prisma.Decimal | null } | undefined;
    }>,
    receivedRows: Array<{
      transactionDate: Date;
      _sum?: { amount?: Prisma.Decimal | null } | undefined;
    }>,
    grouping: 'day' | 'month',
  ) {
    const points = new Map<string, DateSeriesPoint>();
    const emptyPoint = (period: string): DateSeriesPoint => ({
      period,
      entries: new Prisma.Decimal(0),
      expenses: new Prisma.Decimal(0),
      received: new Prisma.Decimal(0),
    });

    for (const row of transactionRows) {
      const period = this.formatSeriesPeriod(row.transactionDate, grouping);
      const point = points.get(period) ?? emptyPoint(period);
      const amount = row._sum?.amount ?? new Prisma.Decimal(0);

      if (row.type === 'ENTRADA') {
        point.entries = point.entries.plus(amount);
      } else {
        point.expenses = point.expenses.plus(amount);
      }

      points.set(period, point);
    }

    for (const row of receivedRows) {
      const period = this.formatSeriesPeriod(row.transactionDate, grouping);
      const point = points.get(period) ?? emptyPoint(period);
      point.received = point.received.plus(row._sum?.amount ?? new Prisma.Decimal(0));
      points.set(period, point);
    }

    return [...points.values()].sort((left, right) => left.period.localeCompare(right.period));
  }

  private formatSeriesPeriod(date: Date, grouping: 'day' | 'month') {
    const formatted = formatBusinessDate(date);
    return grouping === 'month' ? formatted.slice(0, 7) : formatted;
  }

  private presentClientDue(
    clientReference: Prisma.ClientReferenceGetPayload<{ include: { client: true; plan: true } }>,
  ) {
    return {
      id: clientReference.client.id,
      clientReferenceId: clientReference.id,
      name: clientReference.client.name,
      reference: clientReference.reference,
      planName: clientReference.plan.name,
      recurringValue: clientReference.recurringValue.toFixed(2),
      dueDate: formatBusinessDate(clientReference.dueDate),
      status: clientReference.status,
    };
  }

  private presentOverdueReceivable(
    receivable: Prisma.ReceivableGetPayload<{ include: { client: true; clientReference: true } }>,
    today: Date,
  ) {
    return {
      id: receivable.id,
      clientId: receivable.clientId,
      clientName: receivable.client.name,
      clientReference: receivable.clientReference.reference,
      description: receivable.description,
      dueDate: formatBusinessDate(receivable.dueDate),
      amount: receivable.amount.toFixed(2),
      daysOverdue: Math.max(1, this.daysBetween(receivable.dueDate, today)),
    };
  }

  private formatDecimal(value: Prisma.Decimal | null) {
    return (value ?? new Prisma.Decimal(0)).toFixed(2);
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return Number(this.formatDecimal(value));
  }
}
