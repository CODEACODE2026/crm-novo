import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialTransactionOrigin, FinancialTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { getReceivableDisplayStatus } from '../renewals/receivable-presenter';
import { CancelReceivableDto } from './dto/cancel-receivable.dto';
import { CreateFinancialCategoryDto } from './dto/create-financial-category.dto';
import { CreateManualTransactionDto } from './dto/create-manual-transaction.dto';
import { FinancialSummaryDto } from './dto/financial-summary.dto';
import { ListFinancialTransactionsDto } from './dto/list-financial-transactions.dto';
import { ListReceivablesDto } from './dto/list-receivables.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';
import { UpdateFinancialCategoryDto } from './dto/update-financial-category.dto';
import { UpdateManualTransactionDto } from './dto/update-manual-transaction.dto';

const pageSizeLimit = 100;

type ReceivableWithRelations = Prisma.ReceivableGetPayload<{
  include: {
    client: true;
    renewal: true;
    paymentTransaction: true;
  };
}>;

type TransactionWithRelations = Prisma.FinancialTransactionGetPayload<{
  include: {
    category: true;
    client: true;
    receivable: true;
  };
}>;

@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listCategories() {
    const categories = await this.prisma.financialCategory.findMany({
      orderBy: [{ type: 'asc' }, { active: 'desc' }, { name: 'asc' }],
    });

    return categories;
  }

  async getCategory(id: string) {
    const category = await this.prisma.financialCategory.findUnique({ where: { id } });

    if (!category) {
      throw new NotFoundException('Categoria financeira nao encontrada.');
    }

    return category;
  }

  async createCategory(dto: CreateFinancialCategoryDto) {
    try {
      return await this.prisma.financialCategory.create({
        data: {
          name: dto.name.trim(),
          type: dto.type,
          active: dto.active ?? true,
        },
      });
    } catch (error) {
      this.handleCategoryError(error);
    }
  }

  async updateCategory(id: string, dto: UpdateFinancialCategoryDto) {
    const existing = await this.getCategory(id);

    if (dto.type !== undefined && dto.type !== existing.type) {
      const linkedTransactions = await this.prisma.financialTransaction.count({
        where: { categoryId: id },
      });

      if (linkedTransactions > 0) {
        throw new ConflictException(
          'Categoria financeira com movimentacoes vinculadas nao pode mudar de tipo.',
        );
      }
    }

    try {
      return await this.prisma.financialCategory.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
    } catch (error) {
      this.handleCategoryError(error);
    }
  }

  async removeCategory(id: string) {
    await this.getCategory(id);

    const linkedTransactions = await this.prisma.financialTransaction.count({
      where: { categoryId: id },
    });

    if (linkedTransactions > 0) {
      return this.prisma.financialCategory.update({
        where: { id },
        data: { active: false },
      });
    }

    return this.prisma.financialCategory.delete({ where: { id } });
  }

  async listReceivables(query: ListReceivablesDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildReceivableWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.receivable.findMany({
        where,
        include: {
          client: true,
          renewal: true,
          paymentTransaction: true,
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.receivable.count({ where }),
    ]);

    return {
      items: items.map((receivable) => this.presentReceivable(receivable)),
      pagination: this.presentPagination(page, pageSize, total),
    };
  }

  async getReceivable(id: string) {
    const receivable = await this.prisma.receivable.findUnique({
      where: { id },
      include: {
        client: true,
        renewal: true,
        paymentTransaction: true,
      },
    });

    if (!receivable) {
      throw new NotFoundException('Conta a receber nao encontrada.');
    }

    return this.presentReceivable(receivable);
  }

  async payReceivable(id: string, dto: PayReceivableDto, actorUserId: string) {
    const paymentDate = parseBusinessDate(dto.paymentDate);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const receivable = await tx.receivable.findUnique({
          where: { id },
          include: { client: true, renewal: true, paymentTransaction: true },
        });

        if (!receivable) {
          throw new NotFoundException('Conta a receber nao encontrada.');
        }

        if (receivable.status !== 'PENDENTE') {
          throw new ConflictException('Apenas contas pendentes podem receber baixa.');
        }

        if (receivable.paymentTransaction) {
          throw new ConflictException('Esta conta a receber ja possui baixa financeira.');
        }

        const category = dto.categoryId
          ? await this.ensureActiveCategory(tx, dto.categoryId, 'ENTRADA')
          : await this.ensureRenewalCategory(tx);
        const description = `Recebimento: ${receivable.description}`;

        const createdTransaction = await tx.financialTransaction.create({
          data: {
            type: 'ENTRADA',
            origin: 'RECEIVABLE_PAYMENT',
            categoryId: category.id,
            clientId: receivable.clientId,
            receivableId: receivable.id,
            description,
            amount: receivable.amount,
            transactionDate: paymentDate,
            notes: this.optionalTrim(dto.notes),
            createdByUserId: actorUserId,
          },
        });

        await tx.receivable.update({
          where: { id: receivable.id },
          data: {
            status: 'PAGO',
            paidAt: paymentDate,
          },
        });

        await tx.clientEvent.create({
          data: {
            clientId: receivable.clientId,
            type: 'PAYMENT_REGISTERED',
            title: 'Pagamento registrado.',
            description: `${this.formatCurrency(receivable.amount)} recebido referente a ${receivable.description}.`,
            metadata: {
              receivableId: receivable.id,
              financialTransactionId: createdTransaction.id,
              amount: receivable.amount.toString(),
              paymentDate: formatBusinessDate(paymentDate),
            },
            createdByUserId: actorUserId,
          },
        });

        return tx.financialTransaction.findUniqueOrThrow({
          where: { id: createdTransaction.id },
          include: { category: true, client: true, receivable: true },
        });
      });

      return this.presentTransaction(transaction);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta conta a receber ja possui baixa financeira.');
      }

      throw error;
    }
  }

  async cancelReceivable(id: string, dto: CancelReceivableDto, actorUserId: string) {
    const reason = dto.reason.trim();

    if (!reason) {
      throw new BadRequestException('Motivo obrigatorio para cancelar conta a receber.');
    }

    const receivable = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.receivable.findUnique({
        where: { id },
        include: { client: true, renewal: true, paymentTransaction: true },
      });

      if (!existing) {
        throw new NotFoundException('Conta a receber nao encontrada.');
      }

      if (existing.status !== 'PENDENTE') {
        throw new ConflictException('Apenas contas pendentes podem ser canceladas.');
      }

      const updated = await tx.receivable.update({
        where: { id: existing.id },
        data: {
          status: 'CANCELADO',
          canceledAt: new Date(),
          cancelReason: reason,
        },
        include: { client: true, renewal: true, paymentTransaction: true },
      });

      await tx.clientEvent.create({
        data: {
          clientId: existing.clientId,
          type: 'RECEIVABLE_CANCELED',
          title: 'Conta a receber cancelada.',
          description: `Motivo: ${reason}`,
          metadata: {
            receivableId: existing.id,
            reason,
          },
          createdByUserId: actorUserId,
        },
      });

      return updated;
    });

    return this.presentReceivable(receivable);
  }

  async listTransactions(query: ListFinancialTransactionsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildTransactionWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialTransaction.findMany({
        where,
        include: { category: true, client: true, receivable: true },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    return {
      items: items.map((transaction) => this.presentTransaction(transaction)),
      pagination: this.presentPagination(page, pageSize, total),
    };
  }

  async getTransaction(id: string) {
    const transaction = await this.prisma.financialTransaction.findUnique({
      where: { id },
      include: { category: true, client: true, receivable: true },
    });

    if (!transaction) {
      throw new NotFoundException('Movimentacao financeira nao encontrada.');
    }

    return this.presentTransaction(transaction);
  }

  async createManualEntry(dto: CreateManualTransactionDto, actorUserId: string) {
    return this.createManualTransaction('ENTRADA', dto, actorUserId);
  }

  async createManualExpense(dto: CreateManualTransactionDto, actorUserId: string) {
    return this.createManualTransaction('SAIDA', dto, actorUserId);
  }

  async updateManualTransaction(id: string, dto: UpdateManualTransactionDto) {
    const existing = await this.prisma.financialTransaction.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Movimentacao financeira nao encontrada.');
    }

    this.ensureManualEditable(existing);

    const category =
      dto.categoryId !== undefined
        ? await this.ensureActiveCategory(this.prisma, dto.categoryId, existing.type)
        : null;

    if (dto.clientId !== undefined) {
      await this.ensureClientExists(dto.clientId);
    }

    const transaction = await this.prisma.financialTransaction.update({
      where: { id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.transactionDate !== undefined
          ? { transactionDate: parseBusinessDate(dto.transactionDate) }
          : {}),
        ...(dto.notes !== undefined ? { notes: this.optionalTrim(dto.notes) } : {}),
        ...(category ? { categoryId: category.id } : {}),
        ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
      },
      include: { category: true, client: true, receivable: true },
    });

    return this.presentTransaction(transaction);
  }

  async removeManualTransaction(id: string) {
    const existing = await this.prisma.financialTransaction.findUnique({
      where: { id },
      include: { category: true, client: true, receivable: true },
    });

    if (!existing) {
      throw new NotFoundException('Movimentacao financeira nao encontrada.');
    }

    this.ensureManualEditable(existing);
    await this.prisma.financialTransaction.delete({ where: { id } });

    return this.presentTransaction(existing);
  }

  async summary(query: FinancialSummaryDto) {
    const { startDate, endDate } = this.getSummaryRange(query);
    const today = parseBusinessDate(formatBusinessDate(new Date()));

    const [received, entries, expenses, pendingReceivables, overdueReceivables] =
      await this.prisma.$transaction([
        this.prisma.financialTransaction.aggregate({
          where: {
            type: 'ENTRADA',
            origin: 'RECEIVABLE_PAYMENT',
            transactionDate: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            type: 'ENTRADA',
            transactionDate: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        }),
        this.prisma.financialTransaction.aggregate({
          where: {
            type: 'SAIDA',
            transactionDate: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        }),
        this.prisma.receivable.aggregate({
          where: {
            status: 'PENDENTE',
            dueDate: { gte: today, lte: endDate },
          },
          _sum: { amount: true },
        }),
        this.prisma.receivable.aggregate({
          where: {
            status: 'PENDENTE',
            dueDate: { lt: today, gte: startDate },
          },
          _sum: { amount: true },
        }),
      ]);

    const entriesTotal = this.decimalToNumber(entries._sum.amount);
    const expensesTotal = this.decimalToNumber(expenses._sum.amount);

    return {
      startDate: formatBusinessDate(startDate),
      endDate: formatBusinessDate(endDate),
      received: this.formatDecimal(received._sum.amount),
      receivablePending: this.formatDecimal(pendingReceivables._sum.amount),
      receivableOverdue: this.formatDecimal(overdueReceivables._sum.amount),
      entries: entriesTotal.toFixed(2),
      expenses: expensesTotal.toFixed(2),
      balance: (entriesTotal - expensesTotal).toFixed(2),
    };
  }

  private async createManualTransaction(
    type: FinancialTransactionType,
    dto: CreateManualTransactionDto,
    actorUserId: string,
  ) {
    const category = await this.ensureActiveCategory(this.prisma, dto.categoryId, type);
    const transactionDate = parseBusinessDate(dto.transactionDate);

    if (dto.clientId) {
      await this.ensureClientExists(dto.clientId);
    }

    const transactionId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialTransaction.create({
        data: {
          type,
          origin: 'MANUAL',
          categoryId: category.id,
          clientId: dto.clientId ?? null,
          description: dto.description.trim(),
          amount: dto.amount,
          transactionDate,
          notes: this.optionalTrim(dto.notes),
          createdByUserId: actorUserId,
        },
        include: { category: true, client: true, receivable: true },
      });

      if (dto.clientId && type === 'ENTRADA') {
        await tx.clientEvent.create({
          data: {
            clientId: dto.clientId,
            type: 'FINANCIAL_TRANSACTION_CREATED',
            title: 'Entrada manual registrada.',
            description: `${this.formatCurrency(dto.amount)} registrado como ${dto.description.trim()}.`,
            metadata: {
              financialTransactionId: created.id,
              amount: dto.amount.toFixed(2),
              transactionDate: formatBusinessDate(transactionDate),
            },
            createdByUserId: actorUserId,
          },
        });
      }

      return created.id;
    });

    const transaction = await this.prisma.financialTransaction.findUniqueOrThrow({
      where: { id: transactionId },
      include: { category: true, client: true, receivable: true },
    });

    return this.presentTransaction(transaction);
  }

  private buildReceivableWhere(query: ListReceivablesDto): Prisma.ReceivableWhereInput {
    const where: Prisma.ReceivableWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.status === 'VENCIDO') {
      where.status = 'PENDENTE';
      where.dueDate = { lt: parseBusinessDate(formatBusinessDate(new Date())) };
    } else if (query.status) {
      where.status = query.status;
    }

    if (query.dueDate) {
      where.dueDate = parseBusinessDate(query.dueDate);
    }

    if (query.startDate || query.endDate) {
      where.dueDate = {
        ...(typeof where.dueDate === 'object' && !Array.isArray(where.dueDate)
          ? where.dueDate
          : {}),
        ...(query.startDate ? { gte: parseBusinessDate(query.startDate) } : {}),
        ...(query.endDate ? { lte: parseBusinessDate(query.endDate) } : {}),
      };
    }

    if (query.search) {
      const search = query.search.trim();

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { client: { reference: { contains: search, mode: 'insensitive' } } },
        ];
      }
    }

    return where;
  }

  private buildTransactionWhere(
    query: ListFinancialTransactionsDto,
  ): Prisma.FinancialTransactionWhereInput {
    const where: Prisma.FinancialTransactionWhereInput = {};

    if (query.type) where.type = query.type;
    if (query.origin) where.origin = query.origin;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.clientId) where.clientId = query.clientId;

    if (query.startDate || query.endDate) {
      where.transactionDate = {
        ...(query.startDate ? { gte: parseBusinessDate(query.startDate) } : {}),
        ...(query.endDate ? { lte: parseBusinessDate(query.endDate) } : {}),
      };
    }

    if (query.search) {
      const search = query.search.trim();

      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { client: { name: { contains: search, mode: 'insensitive' } } },
          { client: { reference: { contains: search, mode: 'insensitive' } } },
        ];
      }
    }

    return where;
  }

  private async ensureRenewalCategory(tx: Prisma.TransactionClient | PrismaService) {
    const category = await tx.financialCategory.findFirst({
      where: { name: 'Renovação', type: 'ENTRADA', active: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria Renovação ativa nao encontrada.');
    }

    return category;
  }

  private async ensureActiveCategory(
    tx: Prisma.TransactionClient | PrismaService,
    id: string,
    type: FinancialTransactionType,
  ) {
    const category = await tx.financialCategory.findFirst({
      where: { id, active: true },
    });

    if (!category) {
      throw new NotFoundException('Categoria financeira ativa nao encontrada.');
    }

    if (category.type !== type) {
      throw new BadRequestException('Categoria incompativel com o tipo da movimentacao.');
    }

    return category;
  }

  private async ensureClientExists(id: string) {
    const exists = await this.prisma.client.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Cliente nao encontrado.');
    }
  }

  private ensureManualEditable(transaction: {
    origin: FinancialTransactionOrigin;
    receivableId: string | null;
  }) {
    if (transaction.origin !== 'MANUAL' || transaction.receivableId) {
      throw new ConflictException(
        'Movimentacao originada de conta a receber nao pode ser editada diretamente.',
      );
    }
  }

  private getSummaryRange(query: FinancialSummaryDto) {
    if (query.startDate || query.endDate) {
      const startDate = query.startDate ? parseBusinessDate(query.startDate) : this.monthStart();
      const endDate = query.endDate ? parseBusinessDate(query.endDate) : this.monthEnd(startDate);

      return { startDate, endDate };
    }

    const startDate = this.monthStart();
    return { startDate, endDate: this.monthEnd(startDate) };
  }

  private monthStart(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private monthEnd(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  private presentReceivable(receivable: ReceivableWithRelations) {
    return {
      id: receivable.id,
      clientId: receivable.clientId,
      renewalId: receivable.renewalId,
      description: receivable.description,
      amount: receivable.amount.toFixed(2),
      dueDate: formatBusinessDate(receivable.dueDate),
      status: receivable.status,
      displayStatus: getReceivableDisplayStatus(receivable.status, receivable.dueDate),
      paidAt: receivable.paidAt ? formatBusinessDate(receivable.paidAt) : null,
      canceledAt: receivable.canceledAt?.toISOString() ?? null,
      cancelReason: receivable.cancelReason,
      paymentTransactionId: receivable.paymentTransaction?.id ?? null,
      createdAt: receivable.createdAt,
      updatedAt: receivable.updatedAt,
      client: {
        id: receivable.client.id,
        name: receivable.client.name,
        reference: receivable.client.reference,
      },
      renewal: {
        id: receivable.renewal.id,
        planName: receivable.renewal.planName,
      },
    };
  }

  private presentTransaction(transaction: TransactionWithRelations) {
    return {
      id: transaction.id,
      type: transaction.type,
      origin: transaction.origin,
      categoryId: transaction.categoryId,
      clientId: transaction.clientId,
      receivableId: transaction.receivableId,
      description: transaction.description,
      amount: transaction.amount.toFixed(2),
      transactionDate: formatBusinessDate(transaction.transactionDate),
      notes: transaction.notes,
      createdByUserId: transaction.createdByUserId,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      category: transaction.category,
      client: transaction.client
        ? {
            id: transaction.client.id,
            name: transaction.client.name,
            reference: transaction.client.reference,
          }
        : null,
    };
  }

  private presentPagination(page: number, pageSize: number, total: number) {
    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private formatDecimal(value: Prisma.Decimal | null) {
    return (value ?? new Prisma.Decimal(0)).toFixed(2);
  }

  private decimalToNumber(value: Prisma.Decimal | null) {
    return Number(this.formatDecimal(value));
  }

  private formatCurrency(value: Prisma.Decimal | number) {
    return `R$ ${Number(value).toFixed(2)}`;
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private handleCategoryError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ja existe uma categoria financeira com este nome e tipo.');
    }

    throw error;
  }
}
