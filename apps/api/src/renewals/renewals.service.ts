import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  getBusinessDateDay,
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
