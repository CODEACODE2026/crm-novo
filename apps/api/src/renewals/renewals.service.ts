import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ClientStatus,
  type MessageDispatchStatus,
  type PaymentIntentStatus,
  type PaymentProviderCode,
  type ReceivableStatus,
  Prisma,
} from '@prisma/client';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  getBusinessDateDay,
  parseSaoPauloBusinessDate,
} from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { RecoveryService } from '../recovery/recovery.service';
import { CreateRenewalDto } from './dto/create-renewal.dto';
import { RenewalPreviewDto } from './dto/renewal-preview.dto';
import {
  buildRenewalReceivableDescription,
  getReceivableDisplayStatus,
} from './receivable-presenter';

type RenewalResult = Prisma.RenewalGetPayload<{
  include: {
    client: { include: { plan: true } };
    clientReference: { include: { client: true; plan: true } };
    receivable: true;
  };
}>;

type RevertPreviewBlockerCode =
  | 'ALREADY_REVERTED'
  | 'FINANCIAL_TRANSACTION_EXISTS'
  | 'LEGACY_RENEWAL'
  | 'NOT_LATEST_RENEWAL'
  | 'PIX_CANNOT_BE_CANCELED'
  | 'PIX_PAID'
  | 'RECEIVABLE_NOT_FOUND'
  | 'RECEIVABLE_PAID'
  | 'REFERENCE_STATE_CHANGED'
  | 'PREVIOUS_CYCLE_PAID'
  | 'PREVIOUS_CYCLE_CANCELED'
  | 'PREVIOUS_CYCLE_OVERDUE_RECEIVABLE_MISSING';

type RevertPreviewWarningCode =
  'PREVIOUS_CYCLE_RECEIVABLE_MISSING' | 'PREVIOUS_DUE_DATE_PAST' | 'SENT_BILLING_WILL_BE_PRESERVED';

type RevertPreviewIssue<TCode extends string> = {
  code: TCode;
  message: string;
};

type RenewalRevertPreview = {
  reversible: boolean;
  renewal: {
    id: string;
    status: string;
    createdAt: Date;
  };
  current: {
    planId: string;
    planName: string;
    amount: string;
    dueDate: string;
    billingAnchorDay: number;
    status: ClientStatus;
  };
  restore: {
    planId: string | null;
    planName: string | null;
    amount: string | null;
    dueDate: string | null;
    billingAnchorDay: number | null;
    status: ClientStatus | null;
  };
  receivable: {
    id: string | null;
    status: ReceivableStatus | null;
    amount: string | null;
    dueDate: string | null;
    action: 'CANCEL' | 'PRESERVE_CANCELED' | 'BLOCK_PAID' | 'NONE';
  };
  pix: {
    total: number;
    active: number;
    paid: number;
    action: 'CANCEL_REQUIRED' | 'PRESERVE_HISTORY' | 'BLOCK_PAID' | 'NONE';
  };
  billing: {
    futureToCancel: number;
    sentToPreserve: number;
  };
  recovery: {
    active: boolean;
    action: 'CANCEL' | 'NONE';
  };
  previousCycle: {
    dueDate: string | null;
    receivableId: string | null;
    status: ReceivableStatus | 'INEXISTENTE';
    action: 'PRESERVE' | 'NONE' | 'BLOCK_PRESERVE_PAID' | 'BLOCK_PRESERVE_CANCELED';
  };
  blockers: RevertPreviewIssue<RevertPreviewBlockerCode>[];
  warnings: RevertPreviewIssue<RevertPreviewWarningCode>[];
};

type RenewalRevertPreviewRecord = Prisma.RenewalGetPayload<{
  include: {
    clientReference: { include: { plan: true } };
    receivable: {
      include: {
        paymentTransaction: true;
        paymentIntents: true;
        paymentGroupItems: {
          include: {
            paymentGroup: {
              include: {
                paymentIntents: true;
                financialTransactions: true;
              };
            };
          };
        };
        messageDispatches: true;
        messageDispatchItems: { include: { messageDispatch: true } };
        recoveryCampaigns: true;
      };
    };
  };
}>;

const activePixStatuses: readonly PaymentIntentStatus[] = ['CREATED', 'WAITING_PAYMENT'];
const safelyCancelablePixProviders: readonly PaymentProviderCode[] = [
  'MOCK',
  'FASTFLOW',
  'FASTPAY',
];
const futureBillingStatuses: readonly MessageDispatchStatus[] = [
  'PENDING',
  'SCHEDULED',
  'PROCESSING',
];

@Injectable()
export class RenewalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecoveryService) private readonly recoveryService: RecoveryService,
  ) {}

  async preview(clientId: string, dto: RenewalPreviewDto) {
    const reference = await this.findPrimaryReference(clientId);
    return this.previewReference(reference.id, dto);
  }

  async previewReference(clientReferenceId: string, dto: RenewalPreviewDto) {
    const { reference, plan, newDueDate, anchorDay } = await this.buildPreview(
      clientReferenceId,
      dto,
    );
    const client = reference.client;

    return {
      clientId: client.id,
      clientReferenceId: reference.id,
      reference: reference.reference,
      clientName: client.name,
      clientStatus: reference.status,
      currentPlan: {
        id: reference.plan.id,
        name: reference.plan.name,
        durationMonths: reference.plan.durationMonths,
      },
      selectedPlan: {
        id: plan.id,
        name: plan.name,
        durationMonths: plan.durationMonths,
      },
      planChanged: reference.planId !== plan.id,
      amount: dto.amount.toFixed(2),
      previousDueDate: formatBusinessDate(reference.dueDate),
      newDueDate: formatBusinessDate(newDueDate),
      billingAnchorDay: anchorDay,
      receivableDescription: buildRenewalReceivableDescription(plan.name),
    };
  }

  async create(clientId: string, dto: CreateRenewalDto, actorUserId: string) {
    const reference = await this.findPrimaryReference(clientId);
    return this.createForReference(reference.id, dto, actorUserId);
  }

  async previewRevert(clientReferenceId: string, renewalId: string): Promise<RenewalRevertPreview> {
    const renewal = await this.prisma.renewal.findUnique({
      where: { id: renewalId },
      include: {
        clientReference: { include: { plan: true } },
        receivable: {
          include: {
            paymentTransaction: true,
            paymentIntents: true,
            paymentGroupItems: {
              include: {
                paymentGroup: {
                  include: {
                    paymentIntents: true,
                    financialTransactions: true,
                  },
                },
              },
            },
            messageDispatches: true,
            messageDispatchItems: { include: { messageDispatch: true } },
            recoveryCampaigns: true,
          },
        },
      },
    });

    if (!renewal || renewal.clientReferenceId !== clientReferenceId) {
      throw new NotFoundException('Renovacao da referencia nao encontrada.');
    }

    const [latestRenewal, previousCycleReceivable] = await Promise.all([
      this.prisma.renewal.findFirst({
        where: { clientReferenceId },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.prisma.receivable.findUnique({
        where: {
          clientReferenceId_purpose_dueDate: {
            clientReferenceId,
            purpose: 'RENEWAL',
            dueDate: renewal.previousDueDate,
          },
        },
      }),
    ]);

    return this.buildRevertPreview(renewal, latestRenewal?.id ?? null, previousCycleReceivable);
  }

  async createForReference(clientReferenceId: string, dto: CreateRenewalDto, actorUserId: string) {
    const existing = await this.prisma.renewal.findUnique({
      where: {
        clientReferenceId_idempotencyKey: {
          clientReferenceId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        receivable: true,
      },
    });

    if (existing) {
      return this.presentRenewalResult(existing, true);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reference = await tx.clientReference.findUnique({
          where: { id: clientReferenceId },
          include: { client: true, plan: true },
        });

        if (!reference) {
          throw new NotFoundException('Referencia do cliente nao encontrada.');
        }

        const plan = await tx.plan.findFirst({ where: { id: dto.planId, active: true } });

        if (!plan) {
          throw new NotFoundException('Plano ativo nao encontrado.');
        }

        const client = reference.client;
        const anchorDay = reference.billingAnchorDay ?? getBusinessDateDay(reference.dueDate);
        const newStatus = 'ATIVO';
        const newDueDate = addCalendarMonthsPreservingAnchor(
          reference.dueDate,
          plan.durationMonths,
          anchorDay,
        );
        const previousStatus = reference.status;
        const planChanged = reference.planId !== plan.id;
        const receivableDescription = buildRenewalReceivableDescription(plan.name);
        const reactivationDescription =
          previousStatus === 'ATIVO' ? null : this.buildReactivationDescription(previousStatus);

        const renewal = await tx.renewal.create({
          data: {
            clientId: client.id,
            clientReferenceId: reference.id,
            planId: plan.id,
            previousPlanId: reference.planId,
            previousPlanName: reference.plan.name,
            previousAmount: reference.recurringValue,
            previousDueDate: reference.dueDate,
            previousBillingAnchorDay: reference.billingAnchorDay,
            previousStatus,
            newDueDate,
            newBillingAnchorDay: anchorDay,
            newStatus,
            amount: dto.amount,
            planName: plan.name,
            durationMonths: plan.durationMonths,
            idempotencyKey: dto.idempotencyKey,
            createdByUserId: actorUserId,
          },
        });

        await tx.receivable.create({
          data: {
            clientId: client.id,
            clientReferenceId: reference.id,
            renewalId: renewal.id,
            description: receivableDescription,
            amount: dto.amount,
            dueDate: newDueDate,
            status: 'PENDENTE',
          },
        });

        await tx.clientReference.update({
          where: { id: reference.id },
          data: {
            dueDate: newDueDate,
            billingAnchorDay: anchorDay,
            planId: plan.id,
            recurringValue: dto.amount,
            status: newStatus,
          },
        });

        if (previousStatus !== newStatus) {
          await tx.clientStatusHistory.create({
            data: {
              clientId: client.id,
              clientReferenceId: reference.id,
              previousStatus,
              newStatus,
              reason: reactivationDescription,
              changedByUserId: actorUserId,
            },
          });

          await this.recoveryService.handleClientReferenceStatusChange(
            tx,
            { ...reference, status: newStatus },
            newStatus,
            { actorUserId },
          );
        }

        await tx.clientEvent.create({
          data: {
            clientId: client.id,
            type: 'CLIENT_RENEWED',
            title: `Referencia ${reference.reference} renovada.`,
            description: this.buildTimelineDescription({
              amount: dto.amount,
              newDueDate,
              planChanged,
              previousDueDate: reference.dueDate,
              previousPlanName: reference.plan.name,
              reactivationDescription,
              selectedPlanName: plan.name,
            }),
            metadata: {
              renewalId: renewal.id,
              clientReferenceId: reference.id,
              reference: reference.reference,
              planId: plan.id,
              previousPlanId: reference.planId,
              previousPlanName: reference.plan.name,
              previousDueDate: formatBusinessDate(reference.dueDate),
              previousBillingAnchorDay: reference.billingAnchorDay,
              previousStatus,
              newDueDate: formatBusinessDate(newDueDate),
              newBillingAnchorDay: anchorDay,
              newStatus,
              amount: dto.amount,
            },
            createdByUserId: actorUserId,
          },
        });

        return tx.renewal.findUniqueOrThrow({
          where: { id: renewal.id },
          include: {
            client: { include: { plan: true } },
            clientReference: { include: { client: true, plan: true } },
            receivable: true,
          },
        });
      });

      return this.presentRenewalResult(result, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingAfterConflict = await this.prisma.renewal.findUnique({
          where: {
            clientReferenceId_idempotencyKey: {
              clientReferenceId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          include: {
            client: { include: { plan: true } },
            clientReference: { include: { client: true, plan: true } },
            receivable: true,
          },
        });

        if (existingAfterConflict) {
          return this.presentRenewalResult(existingAfterConflict, true);
        }

        throw new ConflictException('Renovacao duplicada.');
      }

      throw error;
    }
  }

  private async buildPreview(clientReferenceId: string, dto: RenewalPreviewDto) {
    const [reference, plan] = await Promise.all([
      this.prisma.clientReference.findUnique({
        where: { id: clientReferenceId },
        include: { client: true, plan: true },
      }),
      this.prisma.plan.findFirst({ where: { id: dto.planId, active: true } }),
    ]);

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    if (!plan) {
      throw new NotFoundException('Plano ativo nao encontrado.');
    }

    const anchorDay = reference.billingAnchorDay ?? getBusinessDateDay(reference.dueDate);
    const newDueDate = addCalendarMonthsPreservingAnchor(
      reference.dueDate,
      plan.durationMonths,
      anchorDay,
    );

    return { reference, plan, newDueDate, anchorDay };
  }

  private buildRevertPreview(
    renewal: RenewalRevertPreviewRecord,
    latestRenewalId: string | null,
    previousCycleReceivable: {
      id: string;
      status: ReceivableStatus;
      dueDate: Date;
    } | null,
  ): RenewalRevertPreview {
    const blockers: RevertPreviewIssue<RevertPreviewBlockerCode>[] = [];
    const warnings: RevertPreviewIssue<RevertPreviewWarningCode>[] = [];
    const reference = renewal.clientReference;
    const receivable = renewal.receivable;
    const snapshotComplete = this.hasCompleteRevertSnapshot(renewal);
    const paymentIntents = receivable ? this.collectPaymentIntents(receivable) : [];
    const billingDispatches = receivable ? this.collectBillingDispatches(receivable) : [];
    const futureToCancel = billingDispatches.filter((dispatch) =>
      futureBillingStatuses.includes(dispatch.status),
    ).length;
    const sentToPreserve = billingDispatches.filter(
      (dispatch) => dispatch.status === 'SENT',
    ).length;
    const activePix = paymentIntents.filter((intent) => activePixStatuses.includes(intent.status));
    const paidPix = paymentIntents.filter((intent) => intent.status === 'PAID');
    const hasUnsafeActivePix = activePix.some(
      (intent) => !safelyCancelablePixProviders.includes(intent.provider),
    );
    const hasFinancialTransaction =
      Boolean(receivable?.paymentTransaction) ||
      Boolean(
        receivable?.paymentGroupItems.some(
          (item) => item.paymentGroup.financialTransactions.length > 0,
        ),
      );
    const activeRecovery = Boolean(
      receivable?.recoveryCampaigns.some((campaign) => campaign.status === 'ATIVA'),
    );
    const today = parseSaoPauloBusinessDate(new Date());
    const previousDueDatePast = renewal.previousDueDate < today;

    if (!snapshotComplete) {
      blockers.push({
        code: 'LEGACY_RENEWAL',
        message:
          'Esta renovacao foi criada antes do suporte a reversao e nao possui snapshot completo do estado anterior.',
      });
    }

    if (renewal.status === 'REVERTED') {
      blockers.push({
        code: 'ALREADY_REVERTED',
        message: 'Esta renovacao ja foi revertida.',
      });
    }

    if (latestRenewalId !== renewal.id) {
      blockers.push({
        code: 'NOT_LATEST_RENEWAL',
        message: 'Somente a ultima renovacao da referencia pode ser revertida.',
      });
    }

    if (snapshotComplete && !this.referenceMatchesRenewalState(renewal)) {
      blockers.push({
        code: 'REFERENCE_STATE_CHANGED',
        message:
          'A referencia foi alterada depois da renovacao e nao corresponde ao estado novo esperado.',
      });
    }

    if (!receivable) {
      blockers.push({
        code: 'RECEIVABLE_NOT_FOUND',
        message: 'Renovacao sem conta a receber vinculada.',
      });
    } else if (receivable.status === 'PAGO') {
      blockers.push({
        code: 'RECEIVABLE_PAID',
        message: 'Conta a receber da renovacao ja foi paga.',
      });
    }

    if (hasFinancialTransaction) {
      blockers.push({
        code: 'FINANCIAL_TRANSACTION_EXISTS',
        message: 'Existe transacao financeira vinculada a conta a receber da renovacao.',
      });
    }

    if (paidPix.length > 0) {
      blockers.push({
        code: 'PIX_PAID',
        message: 'Existe PIX pago vinculado a cobranca da renovacao.',
      });
    }

    if (hasUnsafeActivePix) {
      blockers.push({
        code: 'PIX_CANNOT_BE_CANCELED',
        message: 'Existe PIX ativo sem cancelamento seguro suportado pelo provider.',
      });
    }

    if (sentToPreserve > 0) {
      warnings.push({
        code: 'SENT_BILLING_WILL_BE_PRESERVED',
        message: 'Mensagens de cobranca ja enviadas serao preservadas como historico.',
      });
    }

    if (!previousCycleReceivable) {
      warnings.push({
        code: 'PREVIOUS_CYCLE_RECEIVABLE_MISSING',
        message: 'Nao existe conta a receber historica para o vencimento anterior.',
      });

      if (previousDueDatePast) {
        blockers.push({
          code: 'PREVIOUS_CYCLE_OVERDUE_RECEIVABLE_MISSING',
          message:
            'O vencimento anterior ja passou e nao ha cobranca historica para preservar; esta versao nao cria cobranca vencida automaticamente.',
        });
      }
    } else if (previousCycleReceivable.status === 'PAGO') {
      blockers.push({
        code: 'PREVIOUS_CYCLE_PAID',
        message: 'O ciclo anterior ja possui cobranca paga e nao sera reutilizado automaticamente.',
      });
    } else if (previousCycleReceivable.status === 'CANCELADO') {
      blockers.push({
        code: 'PREVIOUS_CYCLE_CANCELED',
        message: 'O ciclo anterior possui cobranca cancelada e nao sera reativado automaticamente.',
      });
    }

    if (previousDueDatePast) {
      warnings.push({
        code: 'PREVIOUS_DUE_DATE_PAST',
        message: 'O vencimento a restaurar ja passou e exige ciencia operacional.',
      });
    }

    return {
      reversible: blockers.length === 0,
      renewal: {
        id: renewal.id,
        status: renewal.status,
        createdAt: renewal.createdAt,
      },
      current: {
        planId: reference.planId,
        planName: reference.plan.name,
        amount: reference.recurringValue.toString(),
        dueDate: formatBusinessDate(reference.dueDate),
        billingAnchorDay: reference.billingAnchorDay,
        status: reference.status,
      },
      restore: {
        planId: renewal.previousPlanId,
        planName: renewal.previousPlanName,
        amount: renewal.previousAmount?.toString() ?? null,
        dueDate: renewal.previousDueDate ? formatBusinessDate(renewal.previousDueDate) : null,
        billingAnchorDay: renewal.previousBillingAnchorDay,
        status: renewal.previousStatus,
      },
      receivable: {
        id: receivable?.id ?? null,
        status: receivable?.status ?? null,
        amount: receivable?.amount.toString() ?? null,
        dueDate: receivable ? formatBusinessDate(receivable.dueDate) : null,
        action: this.receivableRevertAction(receivable?.status ?? null),
      },
      pix: {
        total: paymentIntents.length,
        active: activePix.length,
        paid: paidPix.length,
        action:
          paidPix.length > 0
            ? 'BLOCK_PAID'
            : activePix.length > 0
              ? 'CANCEL_REQUIRED'
              : paymentIntents.length > 0
                ? 'PRESERVE_HISTORY'
                : 'NONE',
      },
      billing: {
        futureToCancel,
        sentToPreserve,
      },
      recovery: {
        active: activeRecovery,
        action: activeRecovery ? 'CANCEL' : 'NONE',
      },
      previousCycle: {
        dueDate: renewal.previousDueDate ? formatBusinessDate(renewal.previousDueDate) : null,
        receivableId: previousCycleReceivable?.id ?? null,
        status: previousCycleReceivable?.status ?? 'INEXISTENTE',
        action: this.previousCycleAction(previousCycleReceivable?.status ?? null),
      },
      blockers,
      warnings,
    };
  }

  private hasCompleteRevertSnapshot(renewal: RenewalRevertPreviewRecord) {
    return (
      renewal.previousPlanId != null &&
      renewal.previousPlanName != null &&
      renewal.previousAmount != null &&
      renewal.previousDueDate != null &&
      renewal.previousBillingAnchorDay != null &&
      renewal.previousStatus != null &&
      renewal.planId != null &&
      renewal.planName != null &&
      renewal.amount != null &&
      renewal.newDueDate != null &&
      renewal.newBillingAnchorDay != null &&
      renewal.newStatus != null
    );
  }

  private referenceMatchesRenewalState(renewal: RenewalRevertPreviewRecord) {
    const reference = renewal.clientReference;

    return (
      reference.planId === renewal.planId &&
      reference.recurringValue.equals(renewal.amount) &&
      formatBusinessDate(reference.dueDate) === formatBusinessDate(renewal.newDueDate) &&
      reference.billingAnchorDay === renewal.newBillingAnchorDay &&
      reference.status === renewal.newStatus
    );
  }

  private collectPaymentIntents(receivable: NonNullable<RenewalRevertPreviewRecord['receivable']>) {
    const intents = new Map<string, (typeof receivable.paymentIntents)[number]>();

    for (const intent of receivable.paymentIntents) {
      intents.set(intent.id, intent);
    }

    for (const item of receivable.paymentGroupItems) {
      for (const intent of item.paymentGroup.paymentIntents) {
        intents.set(intent.id, intent);
      }
    }

    return [...intents.values()];
  }

  private collectBillingDispatches(
    receivable: NonNullable<RenewalRevertPreviewRecord['receivable']>,
  ) {
    const dispatches = new Map<string, (typeof receivable.messageDispatches)[number]>();

    for (const dispatch of receivable.messageDispatches) {
      if (dispatch.origin === 'BILLING') {
        dispatches.set(dispatch.id, dispatch);
      }
    }

    for (const item of receivable.messageDispatchItems) {
      const dispatch = item.messageDispatch;
      if (dispatch.origin === 'BILLING') {
        dispatches.set(dispatch.id, dispatch);
      }
    }

    return [...dispatches.values()];
  }

  private receivableRevertAction(status: ReceivableStatus | null) {
    if (status === 'PENDENTE') return 'CANCEL';
    if (status === 'CANCELADO') return 'PRESERVE_CANCELED';
    if (status === 'PAGO') return 'BLOCK_PAID';
    return 'NONE';
  }

  private previousCycleAction(status: ReceivableStatus | null) {
    if (status === 'PENDENTE') return 'PRESERVE';
    if (status === 'PAGO') return 'BLOCK_PRESERVE_PAID';
    if (status === 'CANCELADO') return 'BLOCK_PRESERVE_CANCELED';
    return 'NONE';
  }

  private async findPrimaryReference(clientId: string) {
    const reference = await this.prisma.clientReference.findFirst({
      where: { clientId },
      include: { client: true, plan: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    return reference;
  }

  private presentRenewalResult(result: RenewalResult, idempotentReplay: boolean) {
    if (!result.receivable) {
      throw new ConflictException('Renovacao sem conta a receber vinculada.');
    }

    return {
      idempotentReplay,
      client: {
        ...result.client,
        dueDate: formatBusinessDate(result.clientReference.dueDate),
        recurringValue: result.clientReference.recurringValue.toString(),
        plan: {
          ...result.clientReference.plan,
          defaultValue: result.clientReference.plan.defaultValue.toString(),
        },
      },
      clientReference: {
        id: result.clientReference.id,
        reference: result.clientReference.reference,
        status: result.clientReference.status,
      },
      renewal: {
        id: result.id,
        clientId: result.clientId,
        clientReferenceId: result.clientReferenceId,
        planId: result.planId,
        planName: result.planName,
        durationMonths: result.durationMonths,
        previousPlanId: result.previousPlanId,
        previousPlanName: result.previousPlanName,
        previousAmount: result.previousAmount?.toString() ?? null,
        previousDueDate: formatBusinessDate(result.previousDueDate),
        previousBillingAnchorDay: result.previousBillingAnchorDay,
        previousStatus: result.previousStatus,
        newDueDate: formatBusinessDate(result.newDueDate),
        newBillingAnchorDay: result.newBillingAnchorDay,
        newStatus: result.newStatus,
        amount: result.amount.toString(),
        status: result.status,
        createdAt: result.createdAt,
      },
      receivable: {
        ...result.receivable,
        amount: result.receivable.amount.toString(),
        dueDate: formatBusinessDate(result.receivable.dueDate),
        displayStatus: getReceivableDisplayStatus(
          result.receivable.status,
          result.receivable.dueDate,
        ),
      },
      newDueDate: formatBusinessDate(result.newDueDate),
    };
  }

  private buildTimelineDescription({
    amount,
    newDueDate,
    planChanged,
    previousDueDate,
    previousPlanName,
    reactivationDescription,
    selectedPlanName,
  }: {
    amount: number;
    newDueDate: Date;
    planChanged: boolean;
    previousDueDate: Date;
    previousPlanName: string;
    reactivationDescription: string | null;
    selectedPlanName: string;
  }) {
    const lines = [
      `Plano: ${selectedPlanName}`,
      `Valor: R$ ${amount.toFixed(2)}`,
      `Vencimento anterior: ${formatBusinessDate(previousDueDate)}`,
      `Novo vencimento: ${formatBusinessDate(newDueDate)}`,
    ];

    if (reactivationDescription) {
      lines.push(reactivationDescription);
    }

    if (planChanged) {
      lines.push(
        `Plano alterado de ${previousPlanName} para ${selectedPlanName} durante a renovacao.`,
      );
    }

    return lines.join('\n');
  }

  private buildReactivationDescription(
    previousStatus: 'PENDENTE_PAGAMENTO' | 'INATIVO' | 'CANCELADO',
  ) {
    if (previousStatus === 'CANCELADO') {
      return 'Referencia cancelada foi reativada atraves de renovacao.';
    }

    if (previousStatus === 'PENDENTE_PAGAMENTO') {
      return 'Referencia pendente de pagamento foi ativada atraves de renovacao.';
    }

    return 'Referencia inativa foi reativada atraves de renovacao.';
  }
}
