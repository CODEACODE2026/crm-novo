import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ClientStatus,
  type MessageDispatchStatus,
  type PaymentIntentStatus,
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
import { RevertRenewalDto } from './dto/revert-renewal.dto';
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
  | 'PIX_ACTIVE'
  | 'PIX_PAID'
  | 'RECEIVABLE_NOT_FOUND'
  | 'RECEIVABLE_PAID'
  | 'REFERENCE_STATE_CHANGED'
  | 'PREVIOUS_CYCLE_PAID'
  | 'PREVIOUS_CYCLE_FINANCIAL_TRANSACTION_EXISTS'
  | 'PREVIOUS_CYCLE_PIX_ACTIVE'
  | 'PREVIOUS_CYCLE_PIX_PAID'
  | 'PREVIOUS_CYCLE_OVERDUE_RECEIVABLE_MISSING';

type RevertPreviewWarningCode =
  | 'PREVIOUS_CYCLE_CANCELED'
  | 'PREVIOUS_CYCLE_RECEIVABLE_MISSING'
  | 'PREVIOUS_DUE_DATE_PAST'
  | 'SENT_BILLING_WILL_BE_PRESERVED';

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
    action: 'PRESERVE' | 'PRESERVE_CANCELED' | 'NONE' | 'BLOCK_PRESERVE_PAID';
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

type RevertPreviewReceivableFinancialRecord = Prisma.ReceivableGetPayload<{
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
  };
}>;

type RenewalReversalResult = Prisma.RenewalReversalGetPayload<{
  include: {
    renewal: { include: { receivable: true } };
    clientReference: { include: { plan: true } };
  };
}>;

const activePixStatuses: readonly PaymentIntentStatus[] = ['CREATED', 'WAITING_PAYMENT'];
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
    return this.loadRevertPreview(this.prisma, clientReferenceId, renewalId);
  }

  async revert(
    clientReferenceId: string,
    renewalId: string,
    dto: RevertRenewalDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.renewalReversal.findFirst({
      where: {
        OR: [{ renewalId }, { clientReferenceId, idempotencyKey: dto.idempotencyKey }],
      },
      include: {
        renewal: { include: { receivable: true } },
        clientReference: { include: { plan: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      if (existing.renewalId !== renewalId || existing.clientReferenceId !== clientReferenceId) {
        throw new ConflictException('Chave de idempotencia ja usada em outra reversao.');
      }

      return this.presentReversalResult(existing, true, {
        billingCanceled: 0,
        receivableCanceled: existing.renewal.receivable?.status === 'CANCELADO',
        recoveryAction: 'NONE',
      });
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          const preview = await this.loadRevertPreview(tx, clientReferenceId, renewalId);

          if (!preview.reversible) {
            throw new ConflictException({
              message: 'Renovacao nao elegivel para reversao.',
              blockers: preview.blockers,
              warnings: preview.warnings,
            });
          }

          const renewal = await tx.renewal.findUniqueOrThrow({
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

          if (!this.hasCompleteRevertSnapshot(renewal)) {
            throw new ConflictException('Snapshot de reversao incompleto.');
          }

          const currentReference = renewal.clientReference;
          const receivable = renewal.receivable;
          const previousPlanId = renewal.previousPlanId;
          const previousAmount = renewal.previousAmount;
          const previousBillingAnchorDay = renewal.previousBillingAnchorDay;
          const previousStatus = renewal.previousStatus;

          if (
            !receivable ||
            previousPlanId == null ||
            previousAmount == null ||
            previousBillingAnchorDay == null ||
            previousStatus == null
          ) {
            throw new ConflictException('Renovacao sem conta a receber ou snapshot completo.');
          }

          const reversal = await tx.renewalReversal.create({
            data: {
              renewalId: renewal.id,
              clientId: renewal.clientId,
              clientReferenceId: renewal.clientReferenceId,
              previousPlanId: renewal.previousPlanId,
              previousPlanName: renewal.previousPlanName,
              previousAmount: renewal.previousAmount,
              previousDueDate: renewal.previousDueDate,
              previousBillingAnchorDay: renewal.previousBillingAnchorDay,
              previousStatus: renewal.previousStatus,
              revertedFromPlanId: currentReference.planId,
              revertedFromPlanName: currentReference.plan.name,
              revertedFromAmount: currentReference.recurringValue,
              revertedFromDueDate: currentReference.dueDate,
              revertedFromBillingAnchorDay: currentReference.billingAnchorDay,
              revertedFromStatus: currentReference.status,
              reason: dto.reason,
              idempotencyKey: dto.idempotencyKey,
              createdByUserId: actorUserId,
            },
          });

          const receivableCanceled = receivable.status === 'PENDENTE';

          if (receivableCanceled) {
            await tx.receivable.update({
              where: { id: receivable.id },
              data: {
                status: 'CANCELADO',
                canceledAt: new Date(),
                cancelReason: `Reversao da renovacao ${renewal.id}: ${dto.reason}`,
              },
            });
          }

          const billingUpdate = await tx.messageDispatch.updateMany({
            where: {
              origin: 'BILLING',
              status: { in: [...futureBillingStatuses] },
              OR: [
                { receivableId: receivable.id },
                { items: { some: { receivableId: receivable.id } } },
              ],
            },
            data: {
              status: 'CANCELED',
              errorCode: 'RENEWAL_REVERTED',
              errorMessage: 'Cobranca futura cancelada por reversao de renovacao.',
              nextAttemptAt: null,
            },
          });

          const recoveryAction: 'CANCEL' | 'NONE' = preview.recovery.active ? 'CANCEL' : 'NONE';

          if (preview.recovery.active) {
            await this.recoveryService.cancelActiveForReceivable(
              tx,
              receivable.id,
              'RENEWAL_REVERTED',
              'Campanha de recuperacao cancelada por reversao de renovacao.',
            );
          }

          await tx.clientReference.update({
            where: { id: clientReferenceId },
            data: {
              planId: previousPlanId,
              recurringValue: previousAmount,
              dueDate: renewal.previousDueDate,
              billingAnchorDay: previousBillingAnchorDay,
              status: previousStatus,
            },
          });

          await tx.renewal.update({
            where: { id: renewal.id },
            data: { status: 'REVERTED' },
          });

          await tx.clientEvent.create({
            data: {
              clientId: renewal.clientId,
              type: 'RENEWAL_REVERTED',
              title: `Renovacao da referencia ${currentReference.reference} revertida.`,
              description: `Motivo: ${dto.reason}`,
              metadata: {
                renewalId: renewal.id,
                referenceId: renewal.clientReferenceId,
                reference: currentReference.reference,
                reason: dto.reason,
                revertedFrom: {
                  planId: currentReference.planId,
                  planName: currentReference.plan.name,
                  amount: currentReference.recurringValue.toString(),
                  dueDate: formatBusinessDate(currentReference.dueDate),
                  billingAnchorDay: currentReference.billingAnchorDay,
                  status: currentReference.status,
                },
                restoredTo: {
                  planId: renewal.previousPlanId,
                  planName: renewal.previousPlanName,
                  amount: renewal.previousAmount?.toString() ?? null,
                  dueDate: formatBusinessDate(renewal.previousDueDate),
                  billingAnchorDay: renewal.previousBillingAnchorDay,
                  status: renewal.previousStatus,
                },
                receivable: {
                  id: receivable.id,
                  previousStatus: receivable.status,
                  action: receivableCanceled ? 'CANCELED' : 'PRESERVED_CANCELED',
                },
                billingCanceled: billingUpdate.count,
                recoveryAction,
              },
              createdByUserId: actorUserId,
            },
          });

          const saved = await tx.renewalReversal.findUniqueOrThrow({
            where: { id: reversal.id },
            include: {
              renewal: { include: { receivable: true } },
              clientReference: { include: { plan: true } },
            },
          });

          return {
            reversal: saved,
            impacts: {
              billingCanceled: billingUpdate.count,
              receivableCanceled,
              recoveryAction,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return this.presentReversalResult(result.reversal, false, result.impacts);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingAfterConflict = await this.prisma.renewalReversal.findFirst({
          where: {
            OR: [{ renewalId }, { clientReferenceId, idempotencyKey: dto.idempotencyKey }],
          },
          include: {
            renewal: { include: { receivable: true } },
            clientReference: { include: { plan: true } },
          },
          orderBy: { createdAt: 'asc' },
        });

        if (existingAfterConflict) {
          return this.presentReversalResult(existingAfterConflict, true, {
            billingCanceled: 0,
            receivableCanceled: existingAfterConflict.renewal.receivable?.status === 'CANCELADO',
            recoveryAction: 'NONE',
          });
        }

        throw new ConflictException('Reversao duplicada.');
      }

      throw error;
    }
  }

  private async loadRevertPreview(
    client: Prisma.TransactionClient | PrismaService,
    clientReferenceId: string,
    renewalId: string,
  ): Promise<RenewalRevertPreview> {
    const renewal = await client.renewal.findUnique({
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
      client.renewal.findFirst({
        where: { clientReferenceId },
        orderBy: [{ createdAt: 'desc' }],
      }),
      client.receivable.findUnique({
        where: {
          clientReferenceId_purpose_dueDate: {
            clientReferenceId,
            purpose: 'RENEWAL',
            dueDate: renewal.previousDueDate,
          },
        },
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
    previousCycleReceivable: RevertPreviewReceivableFinancialRecord | null,
  ): RenewalRevertPreview {
    const blockers: RevertPreviewIssue<RevertPreviewBlockerCode>[] = [];
    const warnings: RevertPreviewIssue<RevertPreviewWarningCode>[] = [];
    const reference = renewal.clientReference;
    const receivable = renewal.receivable;
    const snapshotComplete = this.hasCompleteRevertSnapshot(renewal);
    const paymentIntents = receivable ? this.collectPaymentIntents(receivable) : [];
    const previousCyclePaymentIntents = previousCycleReceivable
      ? this.collectPaymentIntents(previousCycleReceivable)
      : [];
    const billingDispatches = receivable ? this.collectBillingDispatches(receivable) : [];
    const futureToCancel = billingDispatches.filter((dispatch) =>
      futureBillingStatuses.includes(dispatch.status),
    ).length;
    const sentToPreserve = billingDispatches.filter(
      (dispatch) => dispatch.status === 'SENT',
    ).length;
    const activePix = paymentIntents.filter((intent) => activePixStatuses.includes(intent.status));
    const paidPix = paymentIntents.filter((intent) => intent.status === 'PAID');
    const previousCycleActivePix = previousCyclePaymentIntents.filter((intent) =>
      activePixStatuses.includes(intent.status),
    );
    const previousCyclePaidPix = previousCyclePaymentIntents.filter(
      (intent) => intent.status === 'PAID',
    );
    const hasFinancialTransaction =
      Boolean(receivable?.paymentTransaction) ||
      Boolean(
        receivable?.paymentGroupItems.some(
          (item) => item.paymentGroup.financialTransactions.length > 0,
        ),
      );
    const previousCycleHasFinancialTransaction =
      Boolean(previousCycleReceivable?.paymentTransaction) ||
      Boolean(
        previousCycleReceivable?.paymentGroupItems.some(
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

    if (activePix.length > 0) {
      blockers.push({
        code: 'PIX_ACTIVE',
        message: 'Existe PIX ativo vinculado a cobranca da renovacao.',
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
      warnings.push({
        code: 'PREVIOUS_CYCLE_CANCELED',
        message:
          'Ciclo anterior com cobranca cancelada. A referencia sera restaurada para este ciclo, mas a cobranca anterior continuara cancelada e nao sera reativada.',
      });
    }

    if (previousCycleHasFinancialTransaction) {
      blockers.push({
        code: 'PREVIOUS_CYCLE_FINANCIAL_TRANSACTION_EXISTS',
        message: 'Existe transacao financeira vinculada a cobranca anterior.',
      });
    }

    if (previousCyclePaidPix.length > 0) {
      blockers.push({
        code: 'PREVIOUS_CYCLE_PIX_PAID',
        message: 'Existe PIX pago vinculado a cobranca anterior.',
      });
    }

    if (previousCycleActivePix.length > 0) {
      blockers.push({
        code: 'PREVIOUS_CYCLE_PIX_ACTIVE',
        message: 'Existe PIX ativo vinculado a cobranca anterior.',
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

  private collectPaymentIntents(receivable: RevertPreviewReceivableFinancialRecord) {
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
    if (status === 'CANCELADO') return 'PRESERVE_CANCELED';
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

  private presentReversalResult(
    result: RenewalReversalResult,
    idempotentReplay: boolean,
    impacts: {
      billingCanceled: number;
      receivableCanceled: boolean;
      recoveryAction: 'CANCEL' | 'NONE';
    },
  ) {
    const receivable = result.renewal.receivable;

    return {
      idempotentReplay,
      renewal: {
        id: result.renewal.id,
        clientId: result.renewal.clientId,
        clientReferenceId: result.renewal.clientReferenceId,
        status: result.renewal.status,
        newDueDate: formatBusinessDate(result.renewal.newDueDate),
        previousDueDate: formatBusinessDate(result.renewal.previousDueDate),
      },
      reference: {
        id: result.clientReference.id,
        reference: result.clientReference.reference,
        planId: result.clientReference.planId,
        planName: result.clientReference.plan.name,
        recurringValue: result.clientReference.recurringValue.toString(),
        dueDate: formatBusinessDate(result.clientReference.dueDate),
        billingAnchorDay: result.clientReference.billingAnchorDay,
        status: result.clientReference.status,
      },
      reversal: {
        id: result.id,
        renewalId: result.renewalId,
        clientId: result.clientId,
        clientReferenceId: result.clientReferenceId,
        reason: result.reason,
        idempotencyKey: result.idempotencyKey,
        createdByUserId: result.createdByUserId,
        createdAt: result.createdAt,
      },
      impacts: {
        receivable: receivable
          ? {
              id: receivable.id,
              status: receivable.status,
              canceled: impacts.receivableCanceled,
            }
          : null,
        billing: {
          futureCanceled: impacts.billingCanceled,
        },
        recovery: {
          action: impacts.recoveryAction,
        },
      },
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
