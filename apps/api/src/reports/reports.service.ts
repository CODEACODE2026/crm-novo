import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { MessageDispatchOrigin, Prisma } from '@prisma/client';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { getReceivableDisplayStatus } from '../renewals/receivable-presenter';
import { ListReportDto } from './dto/list-report.dto';

export type ReportType =
  'clients' | 'renewals' | 'receivables' | 'finance' | 'billing' | 'recovery';

const reportTypes = ['clients', 'renewals', 'receivables', 'finance', 'billing', 'recovery'];
const jsonLimit = 200;
const csvLimit = 1000;

@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(type: ReportType, query: ListReportDto) {
    this.ensureType(type);

    if (type === 'clients') return this.clients(query, jsonLimit);
    if (type === 'renewals') return this.renewals(query, jsonLimit);
    if (type === 'receivables') return this.receivables(query, jsonLimit);
    if (type === 'finance') return this.finance(query, jsonLimit);
    if (type === 'billing') return this.billing(query, jsonLimit);
    return this.recovery(query, jsonLimit);
  }

  async csv(type: ReportType, query: ListReportDto) {
    this.ensureType(type);
    const report = await this.listForCsv(type, query);
    const content = this.toCsv(report.columns, report.rows);

    return {
      filename: `crm-novo-${type}-${formatBusinessDate(new Date())}.csv`,
      content,
    };
  }

  private async listForCsv(type: ReportType, query: ListReportDto) {
    if (type === 'clients') return this.clients(query, csvLimit);
    if (type === 'renewals') return this.renewals(query, csvLimit);
    if (type === 'receivables') return this.receivables(query, csvLimit);
    if (type === 'finance') return this.finance(query, csvLimit);
    if (type === 'billing') return this.billing(query, csvLimit);
    return this.recovery(query, csvLimit);
  }

  private async clients(query: ListReportDto, take: number) {
    const where: Prisma.ClientWhereInput = {};
    const createdRange = this.dateRange(query);

    if (createdRange) where.createdAt = createdRange;
    if (query.clientStatus) where.status = query.clientStatus;
    if (query.planId) where.planId = query.planId;
    if (query.dueDate) where.dueDate = parseBusinessDate(query.dueDate);
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { phoneNormalized: { contains: search } },
      ];
    }

    const [items, total, byStatus, byPlan] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: { plan: true },
        orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { name: 'asc' }],
        take,
      }),
      this.prisma.client.count({ where }),
      this.prisma.client.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.client.groupBy({
        by: ['planId'],
        where,
        _count: { planId: true },
        orderBy: { planId: 'asc' },
      }),
    ]);

    return {
      columns: ['Cliente', 'Referencia', 'Telefone', 'Plano', 'Status', 'Vencimento', 'Cadastro'],
      rows: items.map((client) => ({
        Cliente: client.name,
        Referencia: client.reference,
        Telefone: client.phoneNormalized,
        Plano: client.plan.name,
        Status: client.status,
        Vencimento: formatBusinessDate(client.dueDate),
        Cadastro: this.formatDateTime(client.createdAt),
      })),
      total,
      limited: total > take,
      summary: {
        byStatus: byStatus.map((item) => ({
          status: item.status,
          total: this.groupCount(item._count, 'status'),
        })),
        byPlan: byPlan.map((item) => ({
          planId: item.planId,
          total: this.groupCount(item._count, 'planId'),
        })),
      },
    };
  }

  private async renewals(query: ListReportDto, take: number) {
    const where: Prisma.RenewalWhereInput = {};
    const createdRange = this.dateRange(query);

    if (createdRange) where.createdAt = createdRange;
    if (query.planId) where.planId = query.planId;
    if (query.search) {
      const search = query.search.trim();
      where.client = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total, amount] = await this.prisma.$transaction([
      this.prisma.renewal.findMany({
        where,
        include: { client: true, plan: true },
        orderBy: [{ createdAt: 'desc' }],
        take,
      }),
      this.prisma.renewal.count({ where }),
      this.prisma.renewal.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      columns: [
        'Cliente',
        'Referencia',
        'Plano',
        'Valor',
        'Vencimento anterior',
        'Novo vencimento',
        'Renovacao',
      ],
      rows: items.map((renewal) => ({
        Cliente: renewal.client.name,
        Referencia: renewal.client.reference,
        Plano: renewal.planName,
        Valor: renewal.amount.toFixed(2),
        'Vencimento anterior': formatBusinessDate(renewal.previousDueDate),
        'Novo vencimento': formatBusinessDate(renewal.newDueDate),
        Renovacao: this.formatDateTime(renewal.createdAt),
      })),
      total,
      limited: total > take,
      summary: { amount: this.formatDecimal(amount._sum.amount) },
    };
  }

  private async receivables(query: ListReportDto, take: number) {
    const where: Prisma.ReceivableWhereInput = {};
    const dueRange = this.dateRange(query);
    const today = this.today();

    if (dueRange) where.dueDate = dueRange;
    if (query.receivableStatus) where.status = query.receivableStatus;
    if (query.receivableDisplayStatus === 'VENCIDO') {
      where.status = 'PENDENTE';
      where.dueDate = { ...(where.dueDate as Prisma.DateTimeFilter), lt: today };
    } else if (query.receivableDisplayStatus) {
      where.status = query.receivableDisplayStatus;
    }
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        {
          client: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [items, total, amount] = await this.prisma.$transaction([
      this.prisma.receivable.findMany({
        where,
        include: { client: true, paymentTransaction: true },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.receivable.count({ where }),
      this.prisma.receivable.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      columns: ['Cliente', 'Referencia', 'Descricao', 'Valor', 'Vencimento', 'Situacao', 'Pago em'],
      rows: items.map((receivable) => ({
        Cliente: receivable.client.name,
        Referencia: receivable.client.reference,
        Descricao: receivable.description,
        Valor: receivable.amount.toFixed(2),
        Vencimento: formatBusinessDate(receivable.dueDate),
        Situacao: getReceivableDisplayStatus(receivable.status, receivable.dueDate, today),
        'Pago em': receivable.paidAt ? formatBusinessDate(receivable.paidAt) : '',
      })),
      total,
      limited: total > take,
      summary: { amount: this.formatDecimal(amount._sum.amount) },
    };
  }

  private async finance(query: ListReportDto, take: number) {
    const where: Prisma.FinancialTransactionWhereInput = {};
    const dateRange = this.dateRange(query);

    if (dateRange) where.transactionDate = dateRange;
    if (query.transactionType) where.type = query.transactionType;
    if (query.transactionOrigin) where.origin = query.transactionOrigin;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [items, total, entries, expenses] = await this.prisma.$transaction([
      this.prisma.financialTransaction.findMany({
        where,
        include: { category: true, client: true },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.financialTransaction.count({ where }),
      this.prisma.financialTransaction.aggregate({
        where: { ...where, type: 'ENTRADA' },
        _sum: { amount: true },
      }),
      this.prisma.financialTransaction.aggregate({
        where: { ...where, type: 'SAIDA' },
        _sum: { amount: true },
      }),
    ]);

    const entriesTotal = Number(this.formatDecimal(entries._sum.amount));
    const expensesTotal = Number(this.formatDecimal(expenses._sum.amount));

    return {
      columns: ['Data', 'Tipo', 'Origem', 'Categoria', 'Cliente', 'Descricao', 'Valor'],
      rows: items.map((transaction) => ({
        Data: formatBusinessDate(transaction.transactionDate),
        Tipo: transaction.type,
        Origem: transaction.origin,
        Categoria: transaction.category.name,
        Cliente: transaction.client?.name ?? '',
        Descricao: transaction.description,
        Valor: transaction.amount.toFixed(2),
      })),
      total,
      limited: total > take,
      summary: {
        entries: entriesTotal.toFixed(2),
        expenses: expensesTotal.toFixed(2),
        balance: (entriesTotal - expensesTotal).toFixed(2),
      },
    };
  }

  private async billing(query: ListReportDto, take: number) {
    const where: Prisma.MessageDispatchWhereInput = { origin: MessageDispatchOrigin.BILLING };
    const scheduledRange = this.dateRange(query);

    if (scheduledRange) where.scheduledFor = scheduledRange;
    if (query.dispatchStatus) where.status = query.dispatchStatus;
    if (query.dueDate) where.receivable = { dueDate: parseBusinessDate(query.dueDate) };
    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { phone: { contains: search } },
        {
          client: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [items, total, byStatus] = await this.prisma.$transaction([
      this.prisma.messageDispatch.findMany({
        where,
        include: { client: true, receivable: true },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        take,
      }),
      this.prisma.messageDispatch.count({ where }),
      this.prisma.messageDispatch.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    return {
      columns: [
        'Cliente',
        'Referencia',
        'Telefone',
        'Vencimento',
        'Status',
        'Tentativas',
        'Agendada',
      ],
      rows: items.map((dispatch) => ({
        Cliente: dispatch.client?.name ?? '',
        Referencia: dispatch.client?.reference ?? '',
        Telefone: dispatch.phone,
        Vencimento: dispatch.receivable ? formatBusinessDate(dispatch.receivable.dueDate) : '',
        Status: dispatch.status,
        Tentativas: String(dispatch.attempts),
        Agendada: dispatch.scheduledFor ? this.formatDateTime(dispatch.scheduledFor) : '',
      })),
      total,
      limited: total > take,
      summary: {
        byStatus: byStatus.map((item) => ({
          status: item.status,
          total: this.groupCount(item._count, 'status'),
        })),
      },
    };
  }

  private async recovery(query: ListReportDto, take: number) {
    const where: Prisma.RecoveryCampaignWhereInput = {};
    const startedRange = this.dateRange(query);

    if (startedRange) where.startedAt = startedRange;
    if (query.recoveryStatus) where.status = query.recoveryStatus;
    if (query.search) {
      const search = query.search.trim();
      where.client = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [items, total, byStatus] = await this.prisma.$transaction([
      this.prisma.recoveryCampaign.findMany({
        where,
        include: {
          client: true,
          steps: { orderBy: { stepNumber: 'asc' } },
        },
        orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
        take,
      }),
      this.prisma.recoveryCampaign.count({ where }),
      this.prisma.recoveryCampaign.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    return {
      columns: ['Cliente', 'Referencia', 'Inicio', 'Etapa atual', 'Status', 'Resultado'],
      rows: items.map((campaign) => {
        const currentStep =
          campaign.steps.find((step) => ['SCHEDULED', 'FAILED'].includes(step.status)) ??
          campaign.steps.at(-1);

        return {
          Cliente: campaign.client.name,
          Referencia: campaign.client.reference,
          Inicio: formatBusinessDate(campaign.startedAt),
          'Etapa atual': currentStep
            ? `${currentStep.stepNumber} (${currentStep.delayDays} dias)`
            : '',
          Status: campaign.status,
          Resultado: campaign.cancelReason ?? (campaign.completedAt ? 'Concluida' : ''),
        };
      }),
      total,
      limited: total > take,
      summary: {
        byStatus: byStatus.map((item) => ({
          status: item.status,
          total: this.groupCount(item._count, 'status'),
        })),
      },
    };
  }

  private ensureType(type: string): asserts type is ReportType {
    if (!reportTypes.includes(type)) {
      throw new BadRequestException('Relatorio nao encontrado.');
    }
  }

  private dateRange(query: ListReportDto) {
    if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
      throw new BadRequestException('Informe startDate e endDate juntos.');
    }

    if (!query.startDate || !query.endDate) return undefined;

    const start = parseBusinessDate(query.startDate);
    const end = parseBusinessDate(query.endDate);

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate deve ser menor ou igual a endDate.');
    }

    return { gte: start, lte: new Date(`${formatBusinessDate(end)}T23:59:59.999Z`) };
  }

  private today() {
    return parseBusinessDate(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
  }

  private toCsv(columns: string[], rows: Array<Record<string, string>>) {
    const escape = (value: string) => {
      const normalized = value.replace(/\r?\n/g, ' ').trim();
      return /[",;]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
    };
    const lines = [columns.join(';')];

    for (const row of rows) {
      lines.push(columns.map((column) => escape(row[column] ?? '')).join(';'));
    }

    return `\uFEFF${lines.join('\n')}`;
  }

  private formatDecimal(value: Prisma.Decimal | null) {
    return (value ?? new Prisma.Decimal(0)).toFixed(2);
  }

  private groupCount(count: unknown, key: string) {
    if (typeof count === 'object' && count !== null && key in count) {
      return Number((count as Record<string, number>)[key] ?? 0);
    }

    return 0;
  }

  private formatDateTime(value: Date) {
    return value.toISOString();
  }
}
