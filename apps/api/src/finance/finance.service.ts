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
import { ReferralsService } from '../referrals/referrals.service';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from '../clients/utils/business-date';
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
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type PaymentProviderStatus,
} from './payments/payment-provider';
import { PaymentProviderCredentialsService } from './payments/payment-provider-credentials.service';

const pageSizeLimit = 100;
const activePixStatuses = ['CREATED', 'WAITING_PAYMENT'] satisfies PaymentIntentStatus[];
const pixExpirationMinutes = 30;

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

        const billingResponse = await tx.billingResponse.findFirst({
          where: { receivableId: receivable.id },
          orderBy: { createdAt: 'desc' },
        });

        if (billingResponse && billingResponse.decision !== 'ACCEPTED') {
          throw new ConflictException('Cliente ainda nao aceitou renovar esta cobranca.');
        }

        const activeIntent = receivable.paymentIntents[0];

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
            providerTransactionId: providerPix.providerTransactionId,
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

  async listPaymentIntents(receivableId: string) {
    await this.ensureReceivableExists(receivableId);
    const intents = await this.prisma.paymentIntent.findMany({
      where: { receivableId },
      orderBy: { createdAt: 'desc' },
    });

    return intents.map((intent) => this.presentPaymentIntent(intent));
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

    const secret = await this.paymentCredentials.getWebhookSecret(provider);
    this.verifyWebhookSignature(signature, rawBody, secret);

    const normalized = this.normalizeWebhookPayload(provider, payload);
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

        await this.activateClientAfterInitialPayment(tx, receivable.id, actorUserId);

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
        const updated = await tx.paymentIntent.update({
          where: { id },
          data: {
            status: providerStatus.status,
            externalStatus: providerStatus.externalStatus,
            externalDepixId: providerStatus.externalDepixId,
            blockchainTxId: providerStatus.blockchainTxId,
            lastSyncAt: new Date(),
            failureCode: providerStatus.failureCode,
            failureMessage: providerStatus.failureMessage,
          },
        });

        if (providerStatus.status === 'REFUNDED') {
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

      const receivable = await tx.receivable.findUnique({
        where: { id: current.receivableId },
        include: { paymentTransaction: true },
      });

      if (!receivable) {
        throw new NotFoundException('Conta a receber nao encontrada.');
      }

      if (receivable.status === 'PENDENTE') {
        await tx.receivable.update({
          where: { id: receivable.id },
          data: { status: 'PAGO', paidAt },
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
            transactionDate: paidAt,
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
                paymentDate: formatBusinessDate(paidAt),
                provider: current.provider,
                providerTransactionId: current.providerTransactionId,
              },
              createdByUserId: actorUserId,
            },
          });
        }
      }

      await this.activateClientAfterInitialPayment(tx, receivable.id, actorUserId);

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

  private buildReceivableWhere(query: ListReceivablesDto): Prisma.ReceivableWhereInput {
    const where: Prisma.ReceivableWhereInput = {};

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.clientReferenceId) {
      where.clientReferenceId = query.clientReferenceId;
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

    if (receivable.status !== 'PAGO' || reference.status !== 'PENDENTE_PAGAMENTO') {
      return;
    }

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

    await this.referralsService?.qualifyAfterInitialActivation(
      tx,
      receivable.clientId,
      receivableId,
      actorUserId,
    );
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
  ): PaymentWebhookStatus {
    const body = this.asRecord(payload) ?? {};
    const data = this.asRecord(body.data) ?? body;
    const transactionId = this.stringFrom(data.transaction_id ?? data.id);
    const externalStatus = this.stringFrom(data.status)?.trim().toLowerCase() ?? null;

    if (!transactionId || !externalStatus) {
      throw new BadRequestException('Webhook de pagamento sem transacao ou status.');
    }

    return {
      provider,
      providerTransactionId: transactionId,
      externalStatus,
      externalDepixId: this.stringFrom(data.depix_transaction_id),
      blockchainTxId: this.stringFrom(data.blockchain_tx_id),
      status: this.mapExternalPaymentStatus(externalStatus),
      paidAt: externalStatus === 'paid' ? new Date() : null,
      failureCode: null,
      failureMessage: null,
      eventKey: this.stringFrom(body.event) ?? `transaction.${externalStatus}`,
    };
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

  private handleCategoryError(error: unknown): never {
    if (this.isUniqueConstraint(error)) {
      throw new ConflictException('Ja existe uma categoria financeira com este nome e tipo.');
    }

    throw error;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
