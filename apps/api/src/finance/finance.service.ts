import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  FinancialTransactionOrigin,
  FinancialTransactionType,
  PaymentProviderCode,
  PaymentIntentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { RecoveryService } from '../recovery/recovery.service';
import { ReferralsService } from '../referrals/referrals.service';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
  parseSaoPauloBusinessDate,
  getBusinessDateDay,
} from '../clients/utils/business-date';
import { getReceivableDisplayStatus } from '../renewals/receivable-presenter';
import { CancelReceivableDto } from './dto/cancel-receivable.dto';
import { CreateFinancialCategoryDto } from './dto/create-financial-category.dto';
import { CreateManualTransactionDto } from './dto/create-manual-transaction.dto';
import { CreateReceivablesPixDto } from './dto/create-receivables-pix.dto';
import { FinancialSummaryDto } from './dto/financial-summary.dto';
import { ListFinancialTransactionsDto } from './dto/list-financial-transactions.dto';
import { ListReceivablesDto } from './dto/list-receivables.dto';
import { PaymentIntentsSummaryDto } from './dto/payment-intents-summary.dto';
import { PayReceivableDto } from './dto/pay-receivable.dto';
import { PayReceivablesDto } from './dto/pay-receivables.dto';
import {
  ReconcileReceivablePixDto,
  ReconcileReceivablePixPreviewDto,
} from './dto/reconcile-receivable-pix.dto';
import {
  ReplaceReceivablePixDto,
  ReplaceReceivablePixPreviewDto,
} from './dto/replace-receivable-pix.dto';
import { UpdateFinancialCategoryDto } from './dto/update-financial-category.dto';
import { UpdateManualTransactionDto } from './dto/update-manual-transaction.dto';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentProviderStatus,
  type PaymentProviderTransaction,
} from './payments/payment-provider';
import { PaymentProviderCredentialsService } from './payments/payment-provider-credentials.service';

const pageSizeLimit = 100;
const activePixStatuses: PaymentIntentStatus[] = ['CREATED', 'WAITING_PAYMENT'];
const pixExpirationMinutes = 30;
const supportedTransactionWebhookEvents = new Set([
  'transaction.created',
  'transaction.approved',
  'transaction.paid',
  'transaction.expired',
  'transaction.refunded',
]);
const ignoredPaymentWebhookEvents = [
  'commission.calculated',
  'withdrawal.created',
  'withdrawal.tx_id_provided',
  'withdrawal.status_changed',
  'med.created',
];

type ReceivableWithRelations = Prisma.ReceivableGetPayload<{
  include: {
    client: true;
    clientReference: { include: { plan: true } };
    renewal: true;
    paymentTransaction: true;
    paymentIntents: { orderBy: { createdAt: 'desc' } };
  };
}>;

type TransactionWithRelations = Prisma.FinancialTransactionGetPayload<{
  include: {
    category: true;
    client: true;
    clientReference: true;
    receivable: { include: { clientReference: true } };
  };
}>;

type PaymentWebhookStatus = PaymentProviderStatus & {
  eventKey: string;
};

type IgnoredPaymentWebhook = {
  ignored: true;
  reason: string;
};

type PixReconciliationBlocker = {
  code: string;
  message: string;
};

type PixReplacementBlocker = {
  code: string;
  message: string;
};

type GroupReceivable = Prisma.ReceivableGetPayload<{
  include: {
    client: true;
    clientReference: { include: { plan: true } };
    paymentTransaction: true;
  };
}>;

@Injectable()
export class FinanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
    @Inject(PaymentProviderCredentialsService)
    private readonly paymentCredentials: PaymentProviderCredentialsService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional()
    @Inject(ReferralsService)
    private readonly referralsService?: ReferralsService,
    @Optional()
    @Inject(ReceivableCycleService)
    private readonly receivableCycleService?: ReceivableCycleService,
    @Optional()
    @Inject(RecoveryService)
    private readonly recoveryService?: RecoveryService,
  ) {}

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
    const name = this.normalizeCategoryName(dto.name);
    await this.ensureCategoryNameAvailable(name, dto.type);

    try {
      return await this.prisma.financialCategory.create({
        data: {
          name,
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
    const name = dto.name !== undefined ? this.normalizeCategoryName(dto.name) : undefined;
    const type = dto.type ?? existing.type;

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

    if (name !== undefined || dto.type !== undefined) {
      await this.ensureCategoryNameAvailable(name ?? existing.name, type, id);
    }

    try {
      return await this.prisma.financialCategory.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
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
          clientReference: { include: { plan: true } },
          renewal: true,
          paymentTransaction: true,
          paymentIntents: { orderBy: { createdAt: 'desc' } },
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

  async receivablesSummary(query: ListReceivablesDto) {
    const baseWhere = this.buildReceivableWhere(query, { includeStatus: false });
    const today = parseBusinessDate(formatBusinessDate(new Date()));

    const [pending, paid, overdue, canceled] = await this.prisma.$transaction([
      this.prisma.receivable.aggregate({
        where: { AND: [baseWhere, { status: 'PENDENTE' }, { dueDate: { gte: today } }] },
        _sum: { amount: true },
      }),
      this.prisma.receivable.aggregate({
        where: { AND: [baseWhere, { status: 'PAGO' }] },
        _sum: { amount: true },
      }),
      this.prisma.receivable.aggregate({
        where: { AND: [baseWhere, { status: 'PENDENTE' }, { dueDate: { lt: today } }] },
        _sum: { amount: true },
      }),
      this.prisma.receivable.aggregate({
        where: { AND: [baseWhere, { status: 'CANCELADO' }] },
        _sum: { amount: true },
      }),
    ]);

    return {
      pendingAmount: this.formatDecimal(pending._sum.amount),
      paidAmount: this.formatDecimal(paid._sum.amount),
      overdueAmount: this.formatDecimal(overdue._sum.amount),
      canceledAmount: this.formatDecimal(canceled._sum.amount),
    };
  }

  async getReceivable(id: string) {
    const receivable = await this.prisma.receivable.findUnique({
      where: { id },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        renewal: true,
        paymentTransaction: true,
        paymentIntents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!receivable) {
      throw new NotFoundException('Conta a receber nao encontrada.');
    }

    return this.presentReceivable(receivable);
  }

  async createReceivablePix(id: string, actorUserId: string) {
    try {
      const intent = await this.prisma.$transaction(async (tx) => {
        await this.acquirePixCreationLocks(tx, [id]);

        const receivable = await tx.receivable.findUnique({
          where: { id },
          include: {
            client: true,
            clientReference: { include: { plan: true } },
            renewal: true,
            paymentTransaction: true,
            paymentIntents: {
              where: { status: { in: [...activePixStatuses] } },
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!receivable) {
          throw new NotFoundException('Conta a receber nao encontrada.');
        }

        if (receivable.status !== 'PENDENTE') {
          throw new ConflictException('Apenas contas pendentes podem gerar PIX.');
        }

        const activeIntent = await this.findActivePixForReceivables(tx, [receivable.id]);

        if (activeIntent) {
          return activeIntent;
        }

        const expiresAt = new Date(Date.now() + pixExpirationMinutes * 60 * 1000);
        const providerPix = await this.paymentProvider.createPix({
          receivableId: receivable.id,
          amount: receivable.amount,
          description: receivable.description,
          expiresAt,
          clientName: receivable.client.name,
          payerPhone: receivable.client.phoneNormalized,
          notificationUrl: this.getPaymentNotificationUrl(),
        });

        const created = await tx.paymentIntent.create({
          data: {
            receivableId: receivable.id,
            provider: providerPix.provider,
            providerTransactionId: this.normalizeCreatedProviderTransactionId(
              providerPix.providerTransactionId,
            ),
            externalStatus: providerPix.externalStatus,
            externalDepixId: providerPix.externalDepixId,
            blockchainTxId: providerPix.blockchainTxId,
            status: providerPix.status,
            amount: providerPix.amount,
            pixCopyPaste: providerPix.pixCopyPaste,
            qrCodeData: providerPix.qrCodeData,
            expiresAt: providerPix.expiresAt,
            lastSyncAt: new Date(),
          },
        });

        await tx.clientEvent.create({
          data: {
            clientId: receivable.clientId,
            type: 'PIX_PAYMENT_INTENT_CREATED',
            title: 'PIX gerado.',
            description: `${this.formatCurrency(receivable.amount)} referente a ${receivable.description}.`,
            metadata: {
              receivableId: receivable.id,
              paymentIntentId: created.id,
              provider: created.provider,
              providerTransactionId: created.providerTransactionId,
            },
            createdByUserId: actorUserId,
          },
        });

        return created;
      });

      return this.presentPaymentIntent(intent);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const activeIntent = await this.prisma.paymentIntent.findFirst({
          where: { receivableId: id, status: { in: [...activePixStatuses] } },
          orderBy: { createdAt: 'desc' },
        });

        if (activeIntent) {
          return this.presentPaymentIntent(activeIntent);
        }

        throw new ConflictException('Ja existe um PIX ativo para esta conta a receber.');
      }

      throw error;
    }
  }

  async previewReceivablePixReplacement(id: string, dto: ReplaceReceivablePixPreviewDto) {
    const inspection = await this.inspectReceivableForPixReplacement(this.prisma, id, dto.provider);
    return this.presentPixReplacementPreview(inspection, dto.provider);
  }

  async replaceReceivablePix(id: string, dto: ReplaceReceivablePixDto, actorUserId: string) {
    try {
      const intent = await this.prisma.$transaction(async (tx) => {
        await this.acquirePixCreationLocks(tx, [id]);

        const inspection = await this.inspectReceivableForPixReplacement(tx, id, dto.provider);

        if (!inspection.currentIntent) {
          throw new ConflictException('Nenhum PIX elegivel para substituicao.');
        }

        const { receivable, currentIntent } = inspection;
        if (dto.idempotencyKey) {
          const existingPaymentIntentId = await this.findPaymentIntentIdByPixCreationEvent(
            tx,
            receivable.clientId,
            'idempotencyKey',
            dto.idempotencyKey,
          );
          if (existingPaymentIntentId) {
            return tx.paymentIntent.findUniqueOrThrow({ where: { id: existingPaymentIntentId } });
          }
        }

        if (currentIntent.id !== dto.expectedCurrentIntentId) {
          throw new ConflictException('PIX atual mudou. Gere uma nova previa antes de substituir.');
        }

        this.throwPixReplacementBlockers(inspection.blockers);

        const expiresAt = new Date(Date.now() + pixExpirationMinutes * 60 * 1000);
        const providerPix = await this.paymentProvider.createPix({
          provider: dto.provider,
          receivableId: receivable.id,
          amount: receivable.amount,
          description: receivable.description,
          expiresAt,
          clientName: receivable.client.name,
          payerPhone: receivable.client.phoneNormalized,
          notificationUrl: this.getPaymentNotificationUrl(),
        });

        await tx.paymentIntent.update({
          where: { id: currentIntent.id },
          data: { status: 'SUPERSEDED' },
        });

        const created = await tx.paymentIntent.create({
          data: {
            receivableId: receivable.id,
            provider: providerPix.provider,
            providerTransactionId: this.normalizeCreatedProviderTransactionId(
              providerPix.providerTransactionId,
            ),
            externalStatus: providerPix.externalStatus,
            externalDepixId: providerPix.externalDepixId,
            blockchainTxId: providerPix.blockchainTxId,
            status: providerPix.status,
            amount: providerPix.amount,
            pixCopyPaste: providerPix.pixCopyPaste,
            qrCodeData: providerPix.qrCodeData,
            expiresAt: providerPix.expiresAt,
            lastSyncAt: new Date(),
          },
        });

        await tx.clientEvent.create({
          data: {
            clientId: receivable.clientId,
            type: 'PIX_PAYMENT_INTENT_CREATED',
            title: 'Novo PIX gerado para substituir tentativa anterior.',
            description:
              dto.reason?.trim() ||
              'Operador gerou nova tentativa de PIX sem cancelar a transacao anterior no provider.',
            metadata: {
              receivableId: receivable.id,
              previousPaymentIntentId: currentIntent.id,
              previousProvider: currentIntent.provider,
              previousProviderTransactionId: currentIntent.providerTransactionId,
              paymentIntentId: created.id,
              provider: created.provider,
              providerTransactionId: created.providerTransactionId,
              replacement: true,
              idempotencyKey: dto.idempotencyKey ?? null,
            },
            createdByUserId: actorUserId,
          },
        });

        return created;
      });

      return this.presentPaymentIntent(intent);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Ja existe um PIX ativo para esta conta a receber.');
      }

      throw error;
    }
  }

  async createReceivablesPix(dto: CreateReceivablesPixDto, actorUserId: string) {
    const receivableIds = this.uniqueReceivableIds(dto.receivableIds);

    try {
      const intent = await this.prisma.$transaction(async (tx) => {
        await this.acquirePixCreationLocks(tx, receivableIds);

        const receivables = await this.findGroupedPaymentReceivables(tx, receivableIds);
        await this.ensureNoActivePixForReceivables(tx, receivableIds);

        const client = receivables[0]!.client;
        const totalAmount = this.sumReceivables(receivables);
        const description = this.buildPaymentGroupDescription(receivables);
        const expiresAt = new Date(Date.now() + pixExpirationMinutes * 60 * 1000);

        const paymentGroup = await tx.paymentGroup.create({
          data: {
            clientId: client.id,
            status: 'WAITING_PAYMENT',
            totalAmount,
            createdByUserId: actorUserId,
            items: {
              create: receivables.map((receivable) => ({
                receivableId: receivable.id,
                amount: receivable.amount,
              })),
            },
          },
        });

        const providerPix = await this.paymentProvider.createPix({
          receivableId: paymentGroup.id,
          amount: totalAmount,
          description,
          expiresAt,
          clientName: client.name,
          payerPhone: client.phoneNormalized,
          notificationUrl: this.getPaymentNotificationUrl(),
        });

        const created = await tx.paymentIntent.create({
          data: {
            paymentGroupId: paymentGroup.id,
            provider: providerPix.provider,
            providerTransactionId: this.normalizeCreatedProviderTransactionId(
              providerPix.providerTransactionId,
            ),
            externalStatus: providerPix.externalStatus,
            externalDepixId: providerPix.externalDepixId,
            blockchainTxId: providerPix.blockchainTxId,
            status: providerPix.status,
            amount: providerPix.amount,
            pixCopyPaste: providerPix.pixCopyPaste,
            qrCodeData: providerPix.qrCodeData,
            expiresAt: providerPix.expiresAt,
            lastSyncAt: new Date(),
          },
        });

        await tx.clientEvent.create({
          data: {
            clientId: client.id,
            type: 'PIX_PAYMENT_INTENT_CREATED',
            title: 'PIX agrupado gerado.',
            description: `${this.formatCurrency(totalAmount)} referente a ${receivables.length} contas a receber.`,
            metadata: {
              paymentGroupId: paymentGroup.id,
              paymentIntentId: created.id,
              receivableIds,
              amount: totalAmount.toString(),
              provider: created.provider,
              providerTransactionId: created.providerTransactionId,
            },
            createdByUserId: actorUserId,
          },
        });

        return created;
      });

      return this.presentPaymentIntent(intent);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Ja existe um PIX ativo ou conflito para este agrupamento.');
      }

      throw error;
    }
  }

  async payReceivables(dto: PayReceivablesDto, actorUserId: string) {
    const receivableIds = this.uniqueReceivableIds(dto.receivableIds);
    const paymentDate = parseBusinessDate(dto.paymentDate);

    const result = await this.prisma.$transaction(async (tx) => {
      const receivables = await this.findGroupedPaymentReceivables(tx, receivableIds);
      const category = dto.categoryId
        ? await this.ensureActiveCategory(tx, dto.categoryId, 'ENTRADA')
        : await this.ensureRenewalCategory(tx);
      const totalAmount = this.sumReceivables(receivables);

      const paymentGroup = await tx.paymentGroup.create({
        data: {
          clientId: receivables[0]!.clientId,
          status: 'PAID',
          totalAmount,
          paidAt: paymentDate,
          createdByUserId: actorUserId,
          items: {
            create: receivables.map((receivable) => ({
              receivableId: receivable.id,
              amount: receivable.amount,
            })),
          },
        },
      });

      const transactions = [];

      for (const receivable of receivables) {
        const createdTransaction = await tx.financialTransaction.create({
          data: {
            type: 'ENTRADA',
            origin: 'RECEIVABLE_PAYMENT',
            categoryId: category.id,
            clientId: receivable.clientId,
            clientReferenceId: receivable.clientReferenceId,
            receivableId: receivable.id,
            paymentGroupId: paymentGroup.id,
            description: `Recebimento agrupado: ${receivable.description}`,
            amount: receivable.amount,
            transactionDate: paymentDate,
            notes: this.optionalTrim(dto.notes),
            createdByUserId: actorUserId,
          },
        });
        transactions.push(createdTransaction);

        await tx.receivable.update({
          where: { id: receivable.id },
          data: { status: 'PAGO', paidAt: paymentDate },
        });

        await tx.clientEvent.create({
          data: {
            clientId: receivable.clientId,
            type: 'PAYMENT_REGISTERED',
            title: 'Pagamento agrupado registrado.',
            description: `${this.formatCurrency(receivable.amount)} recebido referente a ${receivable.description}.`,
            metadata: {
              paymentGroupId: paymentGroup.id,
              receivableId: receivable.id,
              financialTransactionId: createdTransaction.id,
              amount: receivable.amount.toString(),
              paymentDate: formatBusinessDate(paymentDate),
            },
            createdByUserId: actorUserId,
          },
        });

        await this.processPaidReceivableCycle(tx, receivable.id, actorUserId, {
          receivableWasPending: true,
        });
      }

      await tx.clientEvent.create({
        data: {
          clientId: paymentGroup.clientId,
          type: 'PAYMENT_REGISTERED',
          title: 'Pagamento agrupado confirmado.',
          description: `${receivables.length} contas quitadas. Total: ${this.formatCurrency(totalAmount)}.`,
          metadata: {
            paymentGroupId: paymentGroup.id,
            receivableIds,
            amount: totalAmount.toString(),
            paymentDate: formatBusinessDate(paymentDate),
          },
          createdByUserId: actorUserId,
        },
      });

      return { paymentGroup, transactions };
    });

    return {
      id: result.paymentGroup.id,
      clientId: result.paymentGroup.clientId,
      status: result.paymentGroup.status,
      totalAmount: result.paymentGroup.totalAmount.toFixed(2),
      paidAt: result.paymentGroup.paidAt ? formatBusinessDate(result.paymentGroup.paidAt) : null,
      receivableIds,
      transactionIds: result.transactions.map((transaction) => transaction.id),
      createdAt: result.paymentGroup.createdAt.toISOString(),
      updatedAt: result.paymentGroup.updatedAt.toISOString(),
    };
  }

  async listPaymentIntents(receivableId: string) {
    await this.ensureReceivableExists(receivableId);
    const intents = await this.prisma.paymentIntent.findMany({
      where: { receivableId },
      orderBy: { createdAt: 'desc' },
    });

    return intents.map((intent) => this.presentPaymentIntent(intent));
  }

  async previewReceivablePixReconciliation(
    receivableId: string,
    dto: ReconcileReceivablePixPreviewDto,
  ) {
    const providerTransactionId = this.normalizeExternalTransactionId(dto.providerTransactionId);
    const local = await this.inspectReceivableForPixReconciliation(
      this.prisma,
      receivableId,
      dto.provider,
      providerTransactionId,
    );

    if (local.blockers.length > 0) {
      return this.presentPixReconciliationPreview({
        receivable: local.receivable,
        provider: dto.provider,
        providerTransactionId,
        transaction: null,
        blockers: local.blockers,
      });
    }

    const transaction = await this.fetchProviderTransaction(dto.provider, providerTransactionId);
    const blockers = this.validateProviderTransactionForReconciliation(
      local.receivable,
      dto.provider,
      providerTransactionId,
      transaction,
    );

    return this.presentPixReconciliationPreview({
      receivable: local.receivable,
      provider: dto.provider,
      providerTransactionId,
      transaction,
      blockers,
    });
  }

  async reconcileReceivablePix(
    receivableId: string,
    dto: ReconcileReceivablePixDto,
    actorUserId: string,
  ) {
    const providerTransactionId = this.normalizeExternalTransactionId(dto.providerTransactionId);
    const providerTransaction = await this.fetchProviderTransaction(
      dto.provider,
      providerTransactionId,
    );
    const intent = await this.prisma.$transaction(async (tx) => {
      await this.acquirePixCreationLocks(tx, [receivableId]);

      const existing = await tx.paymentIntent.findFirst({
        where: { provider: dto.provider, providerTransactionId },
      });

      if (existing) {
        return existing;
      }

      const local = await this.inspectReceivableForPixReconciliation(
        tx,
        receivableId,
        dto.provider,
        providerTransactionId,
      );
      this.throwPixReconciliationBlockers(local.blockers);

      const blockers = this.validateProviderTransactionForReconciliation(
        local.receivable,
        dto.provider,
        providerTransactionId,
        providerTransaction,
      );
      this.throwPixReconciliationBlockers(blockers);

      const created = await tx.paymentIntent.create({
        data: {
          receivableId,
          provider: dto.provider,
          providerTransactionId,
          externalStatus: providerTransaction.externalStatus,
          externalDepixId: providerTransaction.externalDepixId,
          blockchainTxId: providerTransaction.blockchainTxId,
          status:
            providerTransaction.status === 'PAID' ? 'WAITING_PAYMENT' : providerTransaction.status,
          amount: local.receivable.amount,
          pixCopyPaste: providerTransaction.pixCopyPaste,
          qrCodeData: providerTransaction.qrCodeData,
          expiresAt: providerTransaction.expiresAt,
          lastSyncAt: new Date(),
          paidAt: null,
          failureCode: providerTransaction.failureCode,
          failureMessage: providerTransaction.failureMessage,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: local.receivable.clientId,
          type: 'PIX_PAYMENT_INTENT_CREATED',
          title: 'PIX reconciliado.',
          description:
            dto.reason?.trim() ||
            'Reconciliação de PIX criado no provider apos falha de persistencia local.',
          metadata: {
            receivableId,
            paymentIntentId: created.id,
            provider: dto.provider,
            providerTransactionId,
            reconciliation: true,
            idempotencyKey: dto.idempotencyKey ?? null,
          },
          createdByUserId: actorUserId,
        },
      });

      return created;
    });

    if (providerTransaction.status === 'PAID' && intent.status !== 'PAID') {
      return this.applyProviderStatus(intent.id, providerTransaction, actorUserId);
    }

    return this.presentPaymentIntent(intent);
  }

  async paymentIntentsSummary(query: PaymentIntentsSummaryDto) {
    const total = await this.prisma.paymentIntent.count({
      where: {
        OR: [
          { receivable: { clientId: query.clientId } },
          { paymentGroup: { clientId: query.clientId } },
        ],
      },
    });

    return { total };
  }

  async syncPaymentIntent(id: string, actorUserId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });

    if (!intent) {
      throw new NotFoundException('Intencao de pagamento nao encontrada.');
    }

    if (!intent.providerTransactionId) {
      throw new ConflictException('Intencao de pagamento sem transacao do provider.');
    }

    const providerStatus = await this.paymentProvider.getPixStatus(
      intent.providerTransactionId,
      intent.provider,
    );

    return this.applyProviderStatus(intent.id, providerStatus, actorUserId);
  }

  async confirmMockPaymentIntent(id: string, actorUserId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });

    if (!intent) {
      throw new NotFoundException('Intencao de pagamento nao encontrada.');
    }

    if (!intent.providerTransactionId) {
      throw new ConflictException('Intencao de pagamento sem transacao do provider.');
    }

    if (intent.provider !== 'MOCK') {
      throw new ConflictException('Confirmacao mock permitida apenas para provider MOCK.');
    }

    if (!this.paymentProvider.markPixPaid) {
      throw new ConflictException('Provider atual nao suporta confirmacao mock.');
    }

    await this.paymentProvider.markPixPaid(intent.providerTransactionId);
    const providerStatus = await this.paymentProvider.getPixStatus(
      intent.providerTransactionId,
      intent.provider,
    );

    return this.applyProviderStatus(intent.id, providerStatus, actorUserId);
  }

  async cancelPaymentIntent(id: string, actorUserId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });

    if (!intent) {
      throw new NotFoundException('Intencao de pagamento nao encontrada.');
    }

    if (!intent.providerTransactionId) {
      throw new ConflictException('Intencao de pagamento sem transacao do provider.');
    }

    if (intent.status === 'PAID') {
      throw new ConflictException('PIX pago nao pode ser cancelado por esta rotina.');
    }

    if (!this.paymentProvider.cancelPix) {
      throw new ConflictException('Provider atual nao suporta cancelamento de PIX.');
    }

    const providerStatus = await this.paymentProvider.cancelPix(
      intent.providerTransactionId,
      intent.provider,
    );

    return this.applyProviderStatus(intent.id, providerStatus, actorUserId);
  }

  async processPaymentWebhook(
    provider: PaymentProviderCode,
    signature: string | undefined,
    rawBody: Buffer | undefined,
    payload: unknown,
  ) {
    this.ensureWebhookProvider(provider);

    if (!rawBody?.length) {
      throw new BadRequestException('Raw body obrigatorio para validar webhook.');
    }

    const secret = await this.getConfiguredWebhookSecret(provider);
    this.verifyWebhookSignature(signature, rawBody, secret);

    const normalized = this.normalizeWebhookPayload(provider, payload);
    if ('ignored' in normalized) {
      return normalized;
    }

    const intent = await this.prisma.paymentIntent.findFirst({
      where: {
        provider,
        providerTransactionId: normalized.providerTransactionId,
      },
    });

    if (!intent) {
      throw new NotFoundException('Intencao de pagamento nao encontrada para webhook.');
    }

    const eventKey = normalized.eventKey;

    try {
      await this.prisma.paymentWebhookEvent.create({
        data: {
          provider,
          providerTransactionId: normalized.providerTransactionId,
          status: normalized.externalStatus ?? normalized.status,
          eventKey,
          paymentIntentId: intent.id,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        return this.presentPaymentIntent(intent);
      }

      throw error;
    }

    return this.applyProviderStatus(intent.id, normalized, null);
  }

  async payReceivable(id: string, dto: PayReceivableDto, actorUserId: string) {
    const paymentDate = parseBusinessDate(dto.paymentDate);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const receivable = await tx.receivable.findUnique({
          where: { id },
          include: {
            client: true,
            clientReference: { include: { plan: true } },
            renewal: true,
            paymentTransaction: true,
            paymentIntents: { orderBy: { createdAt: 'desc' } },
          },
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
            clientReferenceId: receivable.clientReferenceId,
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

        await this.processPaidReceivableCycle(tx, receivable.id, actorUserId, {
          receivableWasPending: true,
        });

        return tx.financialTransaction.findUniqueOrThrow({
          where: { id: createdTransaction.id },
          include: {
            category: true,
            client: true,
            clientReference: true,
            receivable: { include: { clientReference: true } },
          },
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
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          renewal: true,
          paymentTransaction: true,
          paymentIntents: { orderBy: { createdAt: 'desc' } },
        },
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
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          renewal: true,
          paymentTransaction: true,
          paymentIntents: { orderBy: { createdAt: 'desc' } },
        },
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

      await this.recoveryService?.cancelActiveForReceivable(
        tx,
        existing.id,
        'RECEIVABLE_CANCELED',
        'Conta a receber cancelada durante campanha de recuperacao.',
      );

      await this.cancelFutureBillingDispatchesForReceivable(
        tx,
        existing.id,
        'RECEIVABLE_CANCELED',
        'Cobranca futura cancelada porque a conta a receber foi cancelada.',
      );

      return updated;
    });

    return this.presentReceivable(receivable);
  }

  private async applyProviderStatus(
    id: string,
    providerStatus: PaymentProviderStatus,
    actorUserId: string | null,
  ) {
    const synced = await this.prisma.$transaction(async (tx) => {
      const current = await tx.paymentIntent.findUnique({ where: { id } });

      if (!current) {
        throw new NotFoundException('Intencao de pagamento nao encontrada.');
      }

      if (
        current.provider !== providerStatus.provider ||
        current.providerTransactionId !== providerStatus.providerTransactionId
      ) {
        throw new ConflictException('Status do provider nao corresponde a intencao de pagamento.');
      }

      if (providerStatus.status !== 'PAID') {
        const nextStatus =
          current.status === 'SUPERSEDED' && activePixStatuses.includes(providerStatus.status)
            ? 'SUPERSEDED'
            : providerStatus.status;
        const updated = await tx.paymentIntent.update({
          where: { id },
          data: {
            status: nextStatus,
            externalStatus: providerStatus.externalStatus,
            externalDepixId: providerStatus.externalDepixId,
            blockchainTxId: providerStatus.blockchainTxId,
            lastSyncAt: new Date(),
            failureCode: providerStatus.failureCode,
            failureMessage: providerStatus.failureMessage,
          },
        });

        if (current.paymentGroupId) {
          await tx.paymentGroup.update({
            where: { id: current.paymentGroupId },
            data: { status: this.paymentGroupStatusFromIntent(providerStatus.status) },
          });
        }

        if (providerStatus.status === 'REFUNDED' && current.receivableId) {
          const receivable = await tx.receivable.findUnique({
            where: { id: current.receivableId },
          });

          if (receivable) {
            const existingEvent = await tx.clientEvent.findFirst({
              where: {
                clientId: receivable.clientId,
                type: 'PIX_PAYMENT_STATUS_UPDATED',
                metadata: { path: ['paymentIntentId'], equals: id },
              },
            });

            if (!existingEvent) {
              await tx.clientEvent.create({
                data: {
                  clientId: receivable.clientId,
                  type: 'PIX_PAYMENT_STATUS_UPDATED',
                  title: 'PIX estornado no provider.',
                  description:
                    'Status refunded recebido. Historico financeiro preservado para conciliacao futura.',
                  metadata: {
                    receivableId: receivable.id,
                    paymentIntentId: id,
                    provider: current.provider,
                    providerTransactionId: current.providerTransactionId,
                    externalStatus: providerStatus.externalStatus,
                  },
                  createdByUserId: actorUserId,
                },
              });
            }
          }
        }

        return updated;
      }

      const paidAt = providerStatus.paidAt ?? new Date();
      const paidBusinessDate = parseSaoPauloBusinessDate(paidAt);

      if (current.paymentGroupId) {
        return this.applyPaidPaymentGroupStatus(
          tx,
          current,
          providerStatus,
          paidAt,
          paidBusinessDate,
          actorUserId,
        );
      }

      const acquired = await tx.paymentIntent.updateMany({
        where: { id, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          externalStatus: providerStatus.externalStatus,
          externalDepixId: providerStatus.externalDepixId,
          blockchainTxId: providerStatus.blockchainTxId,
          paidAt,
          lastSyncAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });

      if (acquired.count !== 1) {
        return tx.paymentIntent.update({
          where: { id },
          data: {
            externalStatus: providerStatus.externalStatus,
            externalDepixId: providerStatus.externalDepixId,
            blockchainTxId: providerStatus.blockchainTxId,
            lastSyncAt: new Date(),
            failureCode: providerStatus.failureCode,
            failureMessage: providerStatus.failureMessage,
          },
        });
      }

      if (!current.receivableId) {
        throw new ConflictException('Intencao de pagamento sem conta a receber vinculada.');
      }

      const receivable = await tx.receivable.findUnique({
        where: { id: current.receivableId },
        include: { paymentTransaction: true },
      });

      if (!receivable) {
        throw new NotFoundException('Conta a receber nao encontrada.');
      }

      const receivableWasPending = receivable.status === 'PENDENTE';

      if (receivableWasPending) {
        await tx.receivable.update({
          where: { id: receivable.id },
          data: { status: 'PAGO', paidAt: paidBusinessDate },
        });
      }

      if (!receivable.paymentTransaction) {
        const category = await this.ensureRenewalCategory(tx);
        const createdTransaction = await tx.financialTransaction.create({
          data: {
            type: 'ENTRADA',
            origin: 'RECEIVABLE_PAYMENT',
            categoryId: category.id,
            clientId: receivable.clientId,
            clientReferenceId: receivable.clientReferenceId,
            receivableId: receivable.id,
            description: `Recebimento PIX: ${receivable.description}`,
            amount: receivable.amount,
            transactionDate: paidBusinessDate,
            notes: `PIX ${current.provider}`,
            createdByUserId: actorUserId,
          },
        });

        const existingEvent = await tx.clientEvent.findFirst({
          where: {
            clientId: receivable.clientId,
            type: 'PAYMENT_REGISTERED',
            metadata: { path: ['paymentIntentId'], equals: id },
          },
        });

        if (!existingEvent) {
          await tx.clientEvent.create({
            data: {
              clientId: receivable.clientId,
              type: 'PAYMENT_REGISTERED',
              title: 'Pagamento PIX confirmado.',
              description: `${this.formatCurrency(receivable.amount)} recebido referente a ${receivable.description}.`,
              metadata: {
                receivableId: receivable.id,
                paymentIntentId: id,
                financialTransactionId: createdTransaction.id,
                amount: receivable.amount.toString(),
                paymentDate: formatBusinessDate(paidBusinessDate),
                provider: current.provider,
                providerTransactionId: current.providerTransactionId,
              },
              createdByUserId: actorUserId,
            },
          });
        }
      }

      await this.processPaidReceivableCycle(tx, receivable.id, actorUserId, {
        receivableWasPending,
      });

      return tx.paymentIntent.findUniqueOrThrow({ where: { id } });
    });

    return this.presentPaymentIntent(synced);
  }

  async listTransactions(query: ListFinancialTransactionsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildTransactionWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialTransaction.findMany({
        where,
        include: {
          category: true,
          client: true,
          clientReference: true,
          receivable: { include: { clientReference: true } },
        },
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
      include: {
        category: true,
        client: true,
        clientReference: true,
        receivable: { include: { clientReference: true } },
      },
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
    if (dto.clientReferenceId !== undefined) {
      await this.ensureClientReference(dto.clientReferenceId, dto.clientId);
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
        ...(dto.clientReferenceId !== undefined
          ? { clientReferenceId: dto.clientReferenceId }
          : {}),
      },
      include: {
        category: true,
        client: true,
        clientReference: true,
        receivable: { include: { clientReference: true } },
      },
    });

    return this.presentTransaction(transaction);
  }

  async removeManualTransaction(id: string) {
    const existing = await this.prisma.financialTransaction.findUnique({
      where: { id },
      include: {
        category: true,
        client: true,
        clientReference: true,
        receivable: { include: { clientReference: true } },
      },
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
    if (dto.clientReferenceId) {
      await this.ensureClientReference(dto.clientReferenceId, dto.clientId);
    }

    const transactionId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialTransaction.create({
        data: {
          type,
          origin: 'MANUAL',
          categoryId: category.id,
          clientId: dto.clientId ?? null,
          clientReferenceId: dto.clientReferenceId ?? null,
          description: dto.description.trim(),
          amount: dto.amount,
          transactionDate,
          notes: this.optionalTrim(dto.notes),
          createdByUserId: actorUserId,
        },
        include: {
          category: true,
          client: true,
          clientReference: true,
          receivable: { include: { clientReference: true } },
        },
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
      include: {
        category: true,
        client: true,
        clientReference: true,
        receivable: { include: { clientReference: true } },
      },
    });

    return this.presentTransaction(transaction);
  }

  private buildReceivableWhere(
    query: ListReceivablesDto,
    options: { includeStatus?: boolean } = {},
  ): Prisma.ReceivableWhereInput {
    const where: Prisma.ReceivableWhereInput = {};
    const includeStatus = options.includeStatus ?? true;

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.clientReferenceId) {
      where.clientReferenceId = query.clientReferenceId;
    }

    if (includeStatus && query.status === 'VENCIDO') {
      where.status = 'PENDENTE';
      where.dueDate = { lt: parseBusinessDate(formatBusinessDate(new Date())) };
    } else if (includeStatus && query.status && query.status !== 'VENCIDO') {
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
          { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
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
    if (query.clientReferenceId) where.clientReferenceId = query.clientReferenceId;

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
          { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
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

  private async ensureClientReference(id: string, clientId?: string) {
    const reference = await this.prisma.clientReference.findUnique({ where: { id } });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    if (clientId && reference.clientId !== clientId) {
      throw new BadRequestException('Referencia nao pertence ao cliente informado.');
    }

    return reference;
  }

  private async processPaidReceivableCycle(
    tx: Prisma.TransactionClient,
    receivableId: string,
    actorUserId: string | null,
    options: { receivableWasPending: boolean },
  ) {
    if (options.receivableWasPending) {
      await this.cancelFutureBillingDispatchesForReceivable(
        tx,
        receivableId,
        'RECEIVABLE_PAID',
        'Cobranca futura cancelada porque a conta a receber foi paga.',
      );

      await this.recoveryService?.cancelActiveForReceivable(
        tx,
        receivableId,
        'RECEIVABLE_PAID',
        'Conta a receber paga durante campanha de recuperacao.',
      );
    }

    await this.activateClientAfterInitialPayment(tx, receivableId, actorUserId);
    await this.advanceClientReferenceAfterRenewalPayment(tx, receivableId, actorUserId, options);
  }

  private async applyPaidPaymentGroupStatus(
    tx: Prisma.TransactionClient,
    current: Prisma.PaymentIntentGetPayload<object>,
    providerStatus: PaymentProviderStatus,
    paidAt: Date,
    paidBusinessDate: Date,
    actorUserId: string | null,
  ) {
    const group = await tx.paymentGroup.findUnique({
      where: { id: current.paymentGroupId ?? '' },
      include: {
        items: {
          include: {
            receivable: {
              include: {
                client: true,
                clientReference: { include: { plan: true } },
                paymentTransaction: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Agrupamento de pagamento nao encontrado.');
    }

    if (current.status === 'PAID' || group.status === 'PAID') {
      return tx.paymentIntent.update({
        where: { id: current.id },
        data: {
          externalStatus: providerStatus.externalStatus,
          externalDepixId: providerStatus.externalDepixId,
          blockchainTxId: providerStatus.blockchainTxId,
          lastSyncAt: new Date(),
          failureCode: providerStatus.failureCode,
          failureMessage: providerStatus.failureMessage,
        },
      });
    }

    const invalid = group.items.find(
      (item) =>
        item.receivable.status !== 'PENDENTE' ||
        Boolean(item.receivable.paymentTransaction) ||
        !item.amount.equals(item.receivable.amount),
    );

    if (invalid) {
      throw new ConflictException(
        'Pagamento agrupado possui conta divergente. Revise o agrupamento antes de confirmar.',
      );
    }

    const acquired = await tx.paymentIntent.updateMany({
      where: { id: current.id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        externalStatus: providerStatus.externalStatus,
        externalDepixId: providerStatus.externalDepixId,
        blockchainTxId: providerStatus.blockchainTxId,
        paidAt,
        lastSyncAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });

    if (acquired.count !== 1) {
      return tx.paymentIntent.update({
        where: { id: current.id },
        data: {
          externalStatus: providerStatus.externalStatus,
          externalDepixId: providerStatus.externalDepixId,
          blockchainTxId: providerStatus.blockchainTxId,
          lastSyncAt: new Date(),
          failureCode: providerStatus.failureCode,
          failureMessage: providerStatus.failureMessage,
        },
      });
    }

    await tx.paymentGroup.update({
      where: { id: group.id },
      data: { status: 'PAID', paidAt: paidBusinessDate },
    });

    const category = await this.ensureRenewalCategory(tx);
    const receivableIds = group.items.map((item) => item.receivableId);

    for (const item of group.items) {
      const { receivable } = item;
      const createdTransaction = await tx.financialTransaction.create({
        data: {
          type: 'ENTRADA',
          origin: 'RECEIVABLE_PAYMENT',
          categoryId: category.id,
          clientId: receivable.clientId,
          clientReferenceId: receivable.clientReferenceId,
          receivableId: receivable.id,
          paymentGroupId: group.id,
          description: `Recebimento PIX agrupado: ${receivable.description}`,
          amount: receivable.amount,
          transactionDate: paidBusinessDate,
          notes: `PIX ${current.provider}`,
          createdByUserId: actorUserId,
        },
      });

      await tx.receivable.update({
        where: { id: receivable.id },
        data: { status: 'PAGO', paidAt: paidBusinessDate },
      });

      await tx.clientEvent.create({
        data: {
          clientId: receivable.clientId,
          type: 'PAYMENT_REGISTERED',
          title: 'Pagamento PIX agrupado confirmado.',
          description: `${this.formatCurrency(receivable.amount)} recebido referente a ${receivable.description}.`,
          metadata: {
            paymentGroupId: group.id,
            receivableId: receivable.id,
            paymentIntentId: current.id,
            financialTransactionId: createdTransaction.id,
            amount: receivable.amount.toString(),
            paymentDate: formatBusinessDate(paidBusinessDate),
            provider: current.provider,
            providerTransactionId: current.providerTransactionId,
          },
          createdByUserId: actorUserId,
        },
      });

      await this.processPaidReceivableCycle(tx, receivable.id, actorUserId, {
        receivableWasPending: true,
      });
    }

    await tx.clientEvent.create({
      data: {
        clientId: group.clientId,
        type: 'PAYMENT_REGISTERED',
        title: 'Pagamento agrupado confirmado.',
        description: `${group.items.length} contas quitadas. Total: ${this.formatCurrency(group.totalAmount)}.`,
        metadata: {
          paymentGroupId: group.id,
          paymentIntentId: current.id,
          receivableIds,
          amount: group.totalAmount.toString(),
          paymentDate: formatBusinessDate(paidBusinessDate),
          provider: current.provider,
          providerTransactionId: current.providerTransactionId,
        },
        createdByUserId: actorUserId,
      },
    });

    return tx.paymentIntent.findUniqueOrThrow({ where: { id: current.id } });
  }

  private paymentGroupStatusFromIntent(status: PaymentIntentStatus) {
    if (status === 'EXPIRED' || status === 'CANCELED' || status === 'FAILED') {
      return status;
    }

    if (status === 'PAID') {
      return 'PAID';
    }

    return 'WAITING_PAYMENT';
  }

  private async cancelFutureBillingDispatchesForReceivable(
    tx: Prisma.TransactionClient,
    receivableId: string,
    errorCode: string,
    errorMessage: string,
  ) {
    await tx.messageDispatch.updateMany({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [{ receivableId }, { items: { some: { receivableId } } }],
      },
      data: {
        status: 'CANCELED',
        errorCode,
        errorMessage,
        nextAttemptAt: null,
      },
    });
  }

  private async activateClientAfterInitialPayment(
    tx: Prisma.TransactionClient,
    receivableId: string,
    actorUserId: string | null,
  ) {
    const receivable = await tx.receivable.findUnique({
      where: { id: receivableId },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { plan: true } },
      },
    });

    if (!receivable || receivable.purpose !== 'INITIAL_ACTIVATION') {
      return;
    }

    const reference = receivable.clientReference ?? receivable.client;

    if (receivable.status !== 'PAGO') {
      return;
    }

    if (!['PENDENTE_PAGAMENTO', 'ATIVO'].includes(reference.status)) {
      return;
    }

    if (reference.status === 'PENDENTE_PAGAMENTO') {
      const previousStatus = reference.status;
      const anchorDay = reference.billingAnchorDay;
      const nextDueDate = addCalendarMonthsPreservingAnchor(
        receivable.dueDate,
        'plan' in reference ? reference.plan.durationMonths : receivable.client.plan.durationMonths,
        anchorDay,
      );

      if (tx.clientReference) {
        await tx.clientReference.update({
          where: { id: receivable.clientReferenceId },
          data: {
            status: 'ATIVO',
            dueDate: nextDueDate,
            billingAnchorDay: anchorDay,
          },
        });

        await this.receivableCycleService?.ensureCurrentCycleReceivable(
          receivable.clientReferenceId,
          tx,
        );
      } else {
        await tx.client.update({
          where: { id: receivable.clientId },
          data: {
            status: 'ATIVO',
            dueDate: nextDueDate,
            billingAnchorDay: anchorDay,
          },
        });
      }

      await tx.clientStatusHistory.create({
        data: {
          clientId: receivable.clientId,
          ...(receivable.clientReferenceId
            ? { clientReferenceId: receivable.clientReferenceId }
            : {}),
          previousStatus,
          newStatus: 'ATIVO',
          reason: 'Ativacao automatica apos pagamento inicial.',
          changedByUserId: actorUserId,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: receivable.clientId,
          type: 'STATUS_CHANGED',
          title: 'Referencia ativada pelo primeiro pagamento.',
          description: `Status alterado de ${previousStatus} para ATIVO. Proximo vencimento: ${formatBusinessDate(nextDueDate)}.`,
          metadata: {
            receivableId,
            clientReferenceId: receivable.clientReferenceId,
            previousStatus,
            newStatus: 'ATIVO',
            originalDueDate: formatBusinessDate(receivable.dueDate),
            nextDueDate: formatBusinessDate(nextDueDate),
            billingAnchorDay: anchorDay,
            planId: reference.planId,
            durationMonths:
              'plan' in reference
                ? reference.plan.durationMonths
                : receivable.client.plan.durationMonths,
          },
          createdByUserId: actorUserId,
        },
      });
    }

    if (!this.referralsService) {
      throw new ConflictException('Servico de indicacoes indisponivel para qualificar indicacao.');
    }

    await this.referralsService.qualifyAfterInitialActivation(
      tx,
      receivable.clientId,
      receivableId,
      actorUserId,
    );
  }

  private async advanceClientReferenceAfterRenewalPayment(
    tx: Prisma.TransactionClient,
    receivableId: string,
    actorUserId: string | null,
    options: { receivableWasPending: boolean },
  ) {
    if (!options.receivableWasPending) {
      return;
    }

    const receivable = await tx.receivable.findUnique({
      where: { id: receivableId },
      include: {
        clientReference: { include: { plan: true } },
      },
    });

    if (
      !receivable ||
      receivable.purpose !== 'RENEWAL' ||
      receivable.status !== 'PAGO' ||
      !receivable.clientReference ||
      receivable.clientReferenceId !== receivable.clientReference.id
    ) {
      return;
    }

    const reference = receivable.clientReference;

    if (
      reference.status !== 'ATIVO' ||
      formatBusinessDate(reference.dueDate) !== formatBusinessDate(receivable.dueDate)
    ) {
      return;
    }

    const paidBusinessDate = receivable.paidAt ?? receivable.dueDate;
    const paidAfterCurrentDueDate =
      formatBusinessDate(paidBusinessDate) > formatBusinessDate(reference.dueDate);
    const baseDate = paidAfterCurrentDueDate ? paidBusinessDate : reference.dueDate;
    const anchorDay = paidAfterCurrentDueDate
      ? getBusinessDateDay(paidBusinessDate)
      : reference.billingAnchorDay;
    const nextDueDate = addCalendarMonthsPreservingAnchor(
      baseDate,
      reference.plan.durationMonths,
      anchorDay,
    );

    await tx.clientReference.update({
      where: { id: reference.id },
      data: {
        dueDate: nextDueDate,
        billingAnchorDay: anchorDay,
      },
    });

    await this.receivableCycleService?.ensureCurrentCycleReceivable(reference.id, tx);

    await tx.clientEvent.create({
      data: {
        clientId: receivable.clientId,
        type: 'CLIENT_RENEWED',
        title: 'Ciclo renovado apos pagamento.',
        description: `Proximo vencimento: ${formatBusinessDate(nextDueDate)}.`,
        metadata: {
          receivableId,
          clientReferenceId: reference.id,
          previousDueDate: formatBusinessDate(receivable.dueDate),
          paidDate: receivable.paidAt ? formatBusinessDate(receivable.paidAt) : null,
          nextDueDate: formatBusinessDate(nextDueDate),
          billingAnchorDay: anchorDay,
          cycleBaseDate: formatBusinessDate(baseDate),
          planId: reference.planId,
          durationMonths: reference.plan.durationMonths,
        },
        createdByUserId: actorUserId,
      },
    });
  }

  private async ensureReceivableExists(id: string) {
    const exists = await this.prisma.receivable.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Conta a receber nao encontrada.');
    }
  }

  private ensureWebhookProvider(provider: PaymentProviderCode) {
    if (provider !== 'FASTFLOW' && provider !== 'FASTPAY') {
      throw new BadRequestException('Provider de webhook de pagamento nao suportado.');
    }
  }

  private async inspectReceivableForPixReconciliation(
    tx: Pick<Prisma.TransactionClient, 'receivable' | 'paymentIntent'>,
    receivableId: string,
    provider: PaymentProviderCode,
    providerTransactionId: string,
  ) {
    const blockers: PixReconciliationBlocker[] = [];
    const receivable = await tx.receivable.findUnique({
      where: { id: receivableId },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        renewal: true,
        paymentTransaction: true,
        paymentIntents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!receivable) {
      throw new NotFoundException('Conta a receber nao encontrada.');
    }

    if (receivable.status === 'PAGO') {
      blockers.push({
        code: 'RECEIVABLE_ALREADY_PAID',
        message: 'Conta a receber ja esta paga.',
      });
    }

    if (receivable.status === 'CANCELADO') {
      blockers.push({
        code: 'RECEIVABLE_CANCELED',
        message: 'Conta a receber cancelada nao pode receber reconciliacao PIX.',
      });
    }

    const sameTransaction = await tx.paymentIntent.findFirst({
      where: { provider, providerTransactionId },
    });

    if (sameTransaction) {
      blockers.push({
        code: 'ALREADY_RECONCILED',
        message: 'Ja existe intencao local para esta transacao do provider.',
      });
    }

    const activeIntent = await this.findActivePixForReceivables(tx, [receivableId]);

    if (activeIntent) {
      blockers.push({
        code: 'ACTIVE_INTENT_EXISTS',
        message: 'Ja existe PIX ativo para esta conta a receber.',
      });
    }

    return { receivable, blockers };
  }

  private async inspectReceivableForPixReplacement(
    tx: Pick<Prisma.TransactionClient, 'receivable' | 'paymentIntent'>,
    receivableId: string,
    provider: PaymentProviderCode,
  ) {
    const blockers: PixReplacementBlocker[] = [];
    const receivable = await tx.receivable.findUnique({
      where: { id: receivableId },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        renewal: true,
        paymentTransaction: true,
        paymentIntents: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    });

    if (!receivable) {
      throw new NotFoundException('Conta a receber nao encontrada.');
    }

    if (receivable.status === 'PAGO') {
      blockers.push({
        code: 'RECEIVABLE_ALREADY_PAID',
        message: 'Conta a receber ja esta paga.',
      });
    }

    if (receivable.status === 'CANCELADO') {
      blockers.push({
        code: 'RECEIVABLE_CANCELED',
        message: 'Conta a receber cancelada nao pode gerar novo PIX.',
      });
    }

    const currentIntent = this.findCurrentReceivablePixIntent(receivable.paymentIntents);

    if (!currentIntent) {
      blockers.push({
        code: 'NO_WAITING_PAYMENT_INTENT',
        message: 'Nao existe PIX aguardando pagamento elegivel para substituicao.',
      });
    } else {
      if (currentIntent.paymentGroupId) {
        blockers.push({
          code: 'GROUPED_PIX_NOT_SUPPORTED',
          message: 'PIX agrupado nao pode ser substituido individualmente nesta fase.',
        });
      }

      if (currentIntent.status !== 'WAITING_PAYMENT') {
        blockers.push({
          code: 'INTENT_STATUS_NOT_SUPPORTED',
          message: 'Apenas PIX com status WAITING_PAYMENT pode ser substituido nesta fase.',
        });
      }

      if (currentIntent.provider !== provider) {
        blockers.push({
          code: 'PROVIDER_MISMATCH',
          message: 'Provider informado nao corresponde ao PIX atual.',
        });
      }
    }

    const activeIntent = await this.findActivePixForReceivables(tx, [receivableId]);

    if (activeIntent?.paymentGroupId) {
      blockers.push({
        code: 'GROUPED_PIX_NOT_SUPPORTED',
        message: 'Ja existe PIX agrupado ativo para esta conta.',
      });
    }

    if (activeIntent && currentIntent && activeIntent.id !== currentIntent.id) {
      blockers.push({
        code: 'ACTIVE_INTENT_CONFLICT',
        message: 'Existe outro PIX ativo para esta conta.',
      });
    }

    return { receivable, currentIntent, blockers };
  }

  private async findPaymentIntentIdByPixCreationEvent(
    tx: Pick<Prisma.TransactionClient, 'clientEvent'>,
    clientId: string,
    metadataKey: 'idempotencyKey' | 'paymentIntentId',
    metadataValue: string,
  ) {
    const event = await tx.clientEvent.findFirst({
      where: {
        clientId,
        type: 'PIX_PAYMENT_INTENT_CREATED',
        metadata: { path: [metadataKey], equals: metadataValue },
      },
    });
    const metadata =
      typeof event?.metadata === 'object' && event.metadata !== null
        ? (event.metadata as Record<string, unknown>)
        : null;

    return typeof metadata?.paymentIntentId === 'string' ? metadata.paymentIntentId : null;
  }

  private findCurrentReceivablePixIntent(intents: Array<Prisma.PaymentIntentGetPayload<object>>) {
    return (
      [...intents]
        .filter(
          (intent) =>
            intent.receivableId &&
            !intent.paymentGroupId &&
            activePixStatuses.includes(intent.status),
        )
        .sort((left, right) => {
          const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();
          return createdDiff || right.id.localeCompare(left.id);
        })[0] ?? null
    );
  }

  private presentPixReplacementPreview(
    inspection: Awaited<ReturnType<FinanceService['inspectReceivableForPixReplacement']>>,
    provider: PaymentProviderCode,
  ) {
    const { receivable, currentIntent, blockers } = inspection;

    return {
      replaceable: blockers.length === 0,
      provider,
      receivable: {
        id: receivable.id,
        clientId: receivable.clientId,
        clientName: receivable.client.name,
        status: receivable.status,
        amount: receivable.amount.toFixed(2),
        paidAt: receivable.paidAt ? formatBusinessDate(receivable.paidAt) : null,
      },
      currentIntent: currentIntent ? this.presentPaymentIntent(currentIntent) : null,
      warning:
        'Um novo PIX sera criado para esta cobranca. O PIX atual continuara registrado no historico e podera continuar existindo no provedor.',
      impact:
        blockers.length === 0
          ? [
              'Criar uma nova tentativa de PIX',
              'Marcar somente o status local da tentativa anterior como SUPERSEDED',
              'Preservar externalStatus e dados historicos do PIX anterior',
              'Nao criar FinancialTransaction',
              'Nao baixar a conta a receber',
            ]
          : ['Nenhuma alteracao sera aplicada enquanto houver bloqueios.'],
      blockers,
    };
  }

  private throwPixReplacementBlockers(blockers: PixReplacementBlocker[]) {
    if (blockers.length === 0) return;

    throw new ConflictException(blockers.map((blocker) => blocker.message).join(' '));
  }

  private async fetchProviderTransaction(
    provider: PaymentProviderCode,
    providerTransactionId: string,
  ) {
    if (!this.paymentProvider.getPixTransaction) {
      throw new ConflictException('Provider atual nao suporta consulta completa de transacao PIX.');
    }

    return this.paymentProvider.getPixTransaction(providerTransactionId, provider);
  }

  private validateProviderTransactionForReconciliation(
    receivable: Pick<ReceivableWithRelations, 'amount'>,
    provider: PaymentProviderCode,
    providerTransactionId: string,
    transaction: PaymentProviderTransaction,
  ) {
    const blockers: PixReconciliationBlocker[] = [];

    if (transaction.provider !== provider) {
      blockers.push({
        code: 'PROVIDER_MISMATCH',
        message: 'Provider retornado nao corresponde ao provider solicitado.',
      });
    }

    if (transaction.providerTransactionId !== providerTransactionId) {
      blockers.push({
        code: 'TRANSACTION_ID_MISMATCH',
        message: 'ID retornado pelo provider nao corresponde ao ID solicitado.',
      });
    }

    if (!transaction.amount.equals(receivable.amount)) {
      blockers.push({
        code: 'AMOUNT_MISMATCH',
        message: 'Valor retornado pelo provider nao corresponde ao valor da conta a receber.',
      });
    }

    if (!this.isKnownExternalPaymentStatus(transaction.externalStatus, transaction.status)) {
      blockers.push({
        code: 'UNKNOWN_PROVIDER_STATUS',
        message: 'Status externo desconhecido. Reconciliacao bloqueada.',
      });
    }

    if (transaction.status === 'WAITING_PAYMENT' && !transaction.pixCopyPaste) {
      blockers.push({
        code: 'MISSING_PIX_PAYLOAD',
        message: 'Provider nao retornou copia-e-cola PIX para uma transacao pendente.',
      });
    }

    return blockers;
  }

  private throwPixReconciliationBlockers(blockers: PixReconciliationBlocker[]) {
    if (blockers.length > 0) {
      throw new ConflictException(blockers[0]!.message);
    }
  }

  private presentPixReconciliationPreview(input: {
    receivable: ReceivableWithRelations;
    provider: PaymentProviderCode;
    providerTransactionId: string;
    transaction: PaymentProviderTransaction | null;
    blockers: PixReconciliationBlocker[];
  }) {
    return {
      adoptable: input.blockers.length === 0,
      provider: input.provider,
      providerTransactionId: input.providerTransactionId,
      receivable: {
        id: input.receivable.id,
        clientId: input.receivable.clientId,
        clientName: input.receivable.client.name,
        status: input.receivable.status,
        amount: this.formatDecimal(input.receivable.amount),
        paidAt: input.receivable.paidAt?.toISOString() ?? null,
      },
      external: input.transaction
        ? {
            provider: input.transaction.provider,
            providerTransactionId: input.transaction.providerTransactionId,
            status: input.transaction.status,
            externalStatus: input.transaction.externalStatus,
            amount: this.formatDecimal(input.transaction.amount),
            expiresAt: input.transaction.expiresAt?.toISOString() ?? null,
            paidAt: input.transaction.paidAt?.toISOString() ?? null,
            hasPixCopyPaste: Boolean(input.transaction.pixCopyPaste),
            hasQrCodeData: Boolean(input.transaction.qrCodeData),
            externalDepixId: input.transaction.externalDepixId,
            blockchainTxId: input.transaction.blockchainTxId,
          }
        : null,
      impact: this.describePixReconciliationImpact(input.transaction),
      blockers: input.blockers,
      warning:
        'Esta acao vinculara ao CRM um PIX que ja existe no provedor. Nenhum novo PIX sera criado.',
    };
  }

  private describePixReconciliationImpact(transaction: PaymentProviderTransaction | null) {
    if (!transaction) return [];
    if (transaction.status === 'PAID') {
      return [
        'Criar PaymentIntent local',
        'Processar pagamento pela regra financeira existente',
        'Baixar Receivable',
        'Criar uma FinancialTransaction se ainda nao existir',
      ];
    }
    if (transaction.status === 'EXPIRED') {
      return [
        'Criar PaymentIntent historico EXPIRED',
        'Manter Receivable PENDENTE',
        'Nao criar PIX novo',
        'Nao criar FinancialTransaction',
      ];
    }
    return [
      'Criar PaymentIntent local',
      'Manter Receivable PENDENTE',
      'Nao criar PIX novo',
      'Nao criar FinancialTransaction',
    ];
  }

  private normalizeExternalTransactionId(value: string) {
    const normalized = this.stringFrom(value)?.trim();

    if (!normalized) {
      throw new BadRequestException('Transaction ID do provider e obrigatorio.');
    }

    return normalized;
  }

  private normalizeCreatedProviderTransactionId(value: unknown) {
    const normalized = this.stringFrom(value)?.trim();

    if (!normalized) {
      throw new ConflictException('Provider retornou PIX sem transaction ID valido.');
    }

    return normalized;
  }

  private isKnownExternalPaymentStatus(externalStatus: string | null, status: PaymentIntentStatus) {
    if (status === 'PAID' || status === 'EXPIRED' || status === 'CANCELED') return true;
    if (status === 'REFUNDED' || status === 'FAILED') return true;
    if (status !== 'WAITING_PAYMENT') return false;

    const normalized = externalStatus?.trim().toLowerCase();
    return normalized === 'pending' || normalized === 'approved' || normalized === 'under_review';
  }

  private verifyWebhookSignature(signature: string | undefined, rawBody: Buffer, secret: string) {
    if (!signature?.startsWith('sha256=')) {
      throw new UnauthorizedException('Assinatura do webhook de pagamento invalida.');
    }

    const received = Buffer.from(signature.slice('sha256='.length), 'hex');
    const expected = createHmac('sha256', secret).update(rawBody).digest();

    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException('Assinatura do webhook de pagamento invalida.');
    }
  }

  private normalizeWebhookPayload(
    provider: PaymentProviderCode,
    payload: unknown,
  ): PaymentWebhookStatus | IgnoredPaymentWebhook {
    const body = this.asRecord(payload) ?? {};
    const eventName = this.stringFrom(body.event)?.trim().toLowerCase() ?? null;

    if (eventName && !eventName.startsWith('transaction.')) {
      if (
        ignoredPaymentWebhookEvents.some(
          (ignored) => eventName === ignored || eventName.startsWith('withdrawal.'),
        )
      ) {
        return { ignored: true, reason: 'unsupported_payment_event' };
      }

      throw new BadRequestException('Evento de webhook de pagamento nao suportado.');
    }

    if (eventName && !supportedTransactionWebhookEvents.has(eventName)) {
      return { ignored: true, reason: 'unsupported_transaction_event' };
    }

    const rootTransactionId = this.stringFrom(body.transaction_id ?? body.id);
    const rootStatus = this.stringFrom(body.status)?.trim().toLowerCase() ?? null;
    const nestedData = this.asRecord(body.data);
    const data = rootTransactionId || rootStatus ? body : (nestedData ?? body);
    const transactionId = this.stringFrom(data.transaction_id ?? data.id);
    const externalStatus = this.stringFrom(data.status)?.trim().toLowerCase() ?? null;
    const paymentProvider = this.stringFrom(data.payment_provider)?.trim().toLowerCase() ?? null;

    if (!transactionId || !externalStatus) {
      throw new BadRequestException('Webhook de pagamento sem transacao ou status.');
    }

    if (paymentProvider && paymentProvider !== provider.toLowerCase()) {
      throw new BadRequestException('Provider do webhook nao corresponde a rota informada.');
    }

    const eventKey =
      eventName && supportedTransactionWebhookEvents.has(eventName)
        ? eventName
        : `transaction.${externalStatus}`;

    return {
      provider,
      providerTransactionId: transactionId,
      externalStatus,
      externalDepixId: this.stringFrom(data.depix_transaction_id),
      blockchainTxId: this.stringFrom(data.blockchain_tx_id),
      status: this.mapExternalPaymentStatus(externalStatus),
      paidAt: externalStatus === 'paid' ? (this.dateFrom(data.paid_at) ?? new Date()) : null,
      failureCode: null,
      failureMessage: null,
      eventKey,
    };
  }

  private async getConfiguredWebhookSecret(provider: PaymentProviderCode) {
    try {
      return await this.paymentCredentials.getWebhookSecret(provider);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('Webhook de pagamento nao autorizado.');
      }

      throw error;
    }
  }

  private mapExternalPaymentStatus(status: string): PaymentIntentStatus {
    if (status === 'paid') return 'PAID';
    if (status === 'expired') return 'EXPIRED';
    if (status === 'cancelled' || status === 'canceled') return 'CANCELED';
    if (status === 'refunded') return 'REFUNDED';
    if (status === 'pending' || status === 'approved' || status === 'under_review') {
      return 'WAITING_PAYMENT';
    }

    return 'WAITING_PAYMENT';
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private stringFrom(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    return null;
  }

  private dateFrom(value: unknown): Date | null {
    const raw = this.stringFrom(value);

    if (!raw) return null;

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

  private uniqueReceivableIds(receivableIds: string[]) {
    const unique = [...new Set(receivableIds)];

    if (!unique.length) {
      throw new BadRequestException('Selecione ao menos uma conta a receber.');
    }

    return unique;
  }

  private async findGroupedPaymentReceivables(
    tx: Prisma.TransactionClient,
    receivableIds: string[],
  ) {
    const receivables = await tx.receivable.findMany({
      where: { id: { in: receivableIds } },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        paymentTransaction: true,
      },
    });

    if (receivables.length !== receivableIds.length) {
      throw new NotFoundException('Uma ou mais contas a receber nao foram encontradas.');
    }

    const ordered = receivableIds.map((id) =>
      receivables.find((receivable) => receivable.id === id)!,
    );
    const clientId = ordered[0]!.clientId;

    if (ordered.some((receivable) => receivable.clientId !== clientId)) {
      throw new ConflictException('Pagamento agrupado permite somente contas do mesmo cliente.');
    }

    const invalid = ordered.find((receivable) => receivable.status !== 'PENDENTE');

    if (invalid) {
      throw new ConflictException('Pagamento agrupado permite somente contas pendentes.');
    }

    const paid = ordered.find((receivable) => receivable.paymentTransaction);

    if (paid) {
      throw new ConflictException('Uma ou mais contas selecionadas ja possuem baixa financeira.');
    }

    return ordered;
  }

  private async acquirePixCreationLocks(tx: Prisma.TransactionClient, receivableIds: string[]) {
    const executable = tx as Prisma.TransactionClient & {
      $executeRawUnsafe?: (query: string, ...values: unknown[]) => Promise<unknown>;
    };

    if (!executable.$executeRawUnsafe) {
      return;
    }

    for (const receivableId of [...new Set(receivableIds)].sort()) {
      await executable.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        `pix:receivable:${receivableId}`,
      );
    }
  }

  private async ensureNoActivePixForReceivables(
    tx: Prisma.TransactionClient,
    receivableIds: string[],
  ) {
    const activeIntent = await this.findActivePixForReceivables(tx, receivableIds);

    if (activeIntent) {
      throw new ConflictException('Ja existe um PIX ativo para uma das contas selecionadas.');
    }
  }

  private findActivePixForReceivables(
    tx: Pick<Prisma.TransactionClient, 'paymentIntent'>,
    receivableIds: string[],
  ) {
    return tx.paymentIntent.findFirst({
      where: {
        status: { in: [...activePixStatuses] },
        OR: [
          { receivableId: { in: receivableIds } },
          { paymentGroup: { items: { some: { receivableId: { in: receivableIds } } } } },
        ],
      },
    });
  }

  private sumReceivables(receivables: Pick<GroupReceivable, 'amount'>[]) {
    return receivables.reduce(
      (total, receivable) => total.add(receivable.amount),
      new Prisma.Decimal('0.00'),
    );
  }

  private buildPaymentGroupDescription(receivables: GroupReceivable[]) {
    const references = receivables
      .map((receivable) => receivable.clientReference?.reference)
      .filter(Boolean)
      .join(', ');

    return `Pagamento agrupado: ${receivables.length} contas${references ? ` (${references})` : ''}`;
  }

  private presentReceivable(receivable: ReceivableWithRelations) {
    return {
      id: receivable.id,
      clientId: receivable.clientId,
      clientReferenceId: receivable.clientReferenceId,
      renewalId: receivable.renewalId,
      purpose: receivable.purpose,
      description: receivable.description,
      amount: receivable.amount.toFixed(2),
      dueDate: formatBusinessDate(receivable.dueDate),
      status: receivable.status,
      displayStatus: getReceivableDisplayStatus(receivable.status, receivable.dueDate),
      paidAt: receivable.paidAt ? formatBusinessDate(receivable.paidAt) : null,
      canceledAt: receivable.canceledAt?.toISOString() ?? null,
      cancelReason: receivable.cancelReason,
      paymentTransactionId: receivable.paymentTransaction?.id ?? null,
      paymentIntents: receivable.paymentIntents.map((intent) => this.presentPaymentIntent(intent)),
      createdAt: receivable.createdAt,
      updatedAt: receivable.updatedAt,
      client: {
        id: receivable.client.id,
        name: receivable.client.name,
        reference: receivable.clientReference?.reference ?? receivable.client.reference,
      },
      clientReference: receivable.clientReference
        ? {
            id: receivable.clientReference.id,
            reference: receivable.clientReference.reference,
            planName: receivable.clientReference.plan.name,
            status: receivable.clientReference.status,
          }
        : null,
      renewal: receivable.renewal
        ? {
            id: receivable.renewal.id,
            planName: receivable.renewal.planName,
          }
        : null,
    };
  }

  private presentPaymentIntent(intent: Prisma.PaymentIntentGetPayload<object>) {
    return {
      id: intent.id,
      receivableId: intent.receivableId,
      paymentGroupId: intent.paymentGroupId ?? null,
      provider: intent.provider,
      providerTransactionId: intent.providerTransactionId,
      externalStatus: intent.externalStatus,
      externalDepixId: intent.externalDepixId,
      blockchainTxId: intent.blockchainTxId,
      status: intent.status,
      amount: intent.amount.toFixed(2),
      pixCopyPaste: intent.pixCopyPaste,
      qrCodeData: intent.qrCodeData,
      expiresAt: intent.expiresAt?.toISOString() ?? null,
      paidAt: intent.paidAt?.toISOString() ?? null,
      lastSyncAt: intent.lastSyncAt?.toISOString() ?? null,
      failureCode: intent.failureCode,
      failureMessage: intent.failureMessage,
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
    };
  }

  private presentTransaction(transaction: TransactionWithRelations) {
    return {
      id: transaction.id,
      type: transaction.type,
      origin: transaction.origin,
      categoryId: transaction.categoryId,
      clientId: transaction.clientId,
      clientReferenceId:
        transaction.clientReferenceId ?? transaction.receivable?.clientReferenceId ?? null,
      receivableId: transaction.receivableId,
      paymentGroupId: transaction.paymentGroupId ?? null,
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
            reference:
              transaction.clientReference?.reference ??
              transaction.receivable?.clientReference?.reference ??
              transaction.client.reference,
          }
        : null,
      clientReference:
        (transaction.clientReference ?? transaction.receivable?.clientReference)
          ? {
              id: (transaction.clientReference ?? transaction.receivable?.clientReference)!.id,
              reference: (transaction.clientReference ?? transaction.receivable?.clientReference)!
                .reference,
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

  private getPaymentNotificationUrl() {
    const explicit = this.config.get<string>('FASTDEPIX_NOTIFICATION_URL')?.trim();

    if (explicit) {
      return explicit;
    }

    return null;
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeCategoryName(name: string) {
    const normalized = name.trim();

    if (!normalized) {
      throw new BadRequestException('Informe o nome da categoria.');
    }

    return normalized;
  }

  private async ensureCategoryNameAvailable(
    name: string,
    type: FinancialTransactionType,
    ignoreId?: string,
  ) {
    const existing = await this.prisma.financialCategory.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        type,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException('Ja existe uma categoria com este nome.');
    }
  }

  private handleCategoryError(error: unknown): never {
    if (this.isUniqueConstraint(error)) {
      throw new ConflictException('Ja existe uma categoria com este nome.');
    }

    throw error;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
