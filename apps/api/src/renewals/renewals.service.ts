import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  getBusinessDateDay,
} from '../clients/utils/business-date';
import { CreateRenewalDto } from './dto/create-renewal.dto';
import { RenewalPreviewDto } from './dto/renewal-preview.dto';
import {
  buildRenewalReceivableDescription,
  getReceivableDisplayStatus,
} from './receivable-presenter';

type RenewalResult = Prisma.RenewalGetPayload<{
  include: {
    client: { include: { plan: true } };
    receivable: true;
  };
}>;

@Injectable()
export class RenewalsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(clientId: string, dto: RenewalPreviewDto) {
    const { client, plan, newDueDate, anchorDay } = await this.buildPreview(clientId, dto);

    return {
      clientId: client.id,
      clientName: client.name,
      clientStatus: client.status,
      currentPlan: {
        id: client.plan.id,
        name: client.plan.name,
        durationMonths: client.plan.durationMonths,
      },
      selectedPlan: {
        id: plan.id,
        name: plan.name,
        durationMonths: plan.durationMonths,
      },
      planChanged: client.planId !== plan.id,
      amount: dto.amount.toFixed(2),
      previousDueDate: formatBusinessDate(client.dueDate),
      newDueDate: formatBusinessDate(newDueDate),
      billingAnchorDay: anchorDay,
      receivableDescription: buildRenewalReceivableDescription(plan.name),
    };
  }

  async create(clientId: string, dto: CreateRenewalDto, actorUserId: string) {
    const existing = await this.prisma.renewal.findUnique({
      where: {
        clientId_idempotencyKey: {
          clientId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: {
        client: { include: { plan: true } },
        receivable: true,
      },
    });

    if (existing) {
      return this.presentRenewalResult(existing, true);
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const client = await tx.client.findUnique({
          where: { id: clientId },
          include: { plan: true },
        });

        if (!client) {
          throw new NotFoundException('Cliente nao encontrado.');
        }

        const plan = await tx.plan.findFirst({
          where: { id: dto.planId, active: true },
        });

        if (!plan) {
          throw new NotFoundException('Plano ativo nao encontrado.');
        }

        const anchorDay = client.billingAnchorDay ?? getBusinessDateDay(client.dueDate);
        const newDueDate = addCalendarMonthsPreservingAnchor(
          client.dueDate,
          plan.durationMonths,
          anchorDay,
        );
        const previousStatus = client.status;
        const planChanged = client.planId !== plan.id;
        const receivableDescription = buildRenewalReceivableDescription(plan.name);
        const reactivationDescription =
          previousStatus === 'ATIVO' ? null : this.buildReactivationDescription(previousStatus);

        const renewal = await tx.renewal.create({
          data: {
            clientId: client.id,
            planId: plan.id,
            previousDueDate: client.dueDate,
            newDueDate,
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
            renewalId: renewal.id,
            description: receivableDescription,
            amount: dto.amount,
            dueDate: newDueDate,
            status: 'PENDENTE',
          },
        });

        await tx.client.update({
          where: { id: client.id },
          data: {
            dueDate: newDueDate,
            billingAnchorDay: anchorDay,
            planId: plan.id,
            recurringValue: dto.amount,
            status: 'ATIVO',
          },
        });

        if (previousStatus !== 'ATIVO') {
          await tx.clientStatusHistory.create({
            data: {
              clientId: client.id,
              previousStatus,
              newStatus: 'ATIVO',
              reason: reactivationDescription,
              changedByUserId: actorUserId,
            },
          });
        }

        await tx.clientEvent.create({
          data: {
            clientId: client.id,
            type: 'CLIENT_RENEWED',
            title: 'Cliente renovado.',
            description: this.buildTimelineDescription({
              amount: dto.amount,
              newDueDate,
              planChanged,
              previousDueDate: client.dueDate,
              previousPlanName: client.plan.name,
              reactivationDescription,
              selectedPlanName: plan.name,
            }),
            metadata: {
              renewalId: renewal.id,
              planId: plan.id,
              previousDueDate: formatBusinessDate(client.dueDate),
              newDueDate: formatBusinessDate(newDueDate),
              amount: dto.amount,
            },
            createdByUserId: actorUserId,
          },
        });

        return tx.renewal.findUniqueOrThrow({
          where: { id: renewal.id },
          include: {
            client: { include: { plan: true } },
            receivable: true,
          },
        });
      });

      return this.presentRenewalResult(result, false);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingAfterConflict = await this.prisma.renewal.findUnique({
          where: {
            clientId_idempotencyKey: {
              clientId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          include: {
            client: { include: { plan: true } },
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

  private async buildPreview(clientId: string, dto: RenewalPreviewDto) {
    const [client, plan] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: clientId },
        include: { plan: true },
      }),
      this.prisma.plan.findFirst({
        where: { id: dto.planId, active: true },
      }),
    ]);

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    if (!plan) {
      throw new NotFoundException('Plano ativo nao encontrado.');
    }

    const anchorDay = client.billingAnchorDay ?? getBusinessDateDay(client.dueDate);
    const newDueDate = addCalendarMonthsPreservingAnchor(
      client.dueDate,
      plan.durationMonths,
      anchorDay,
    );

    return { client, plan, newDueDate, anchorDay };
  }

  private presentRenewalResult(result: RenewalResult, idempotentReplay: boolean) {
    if (!result.receivable) {
      throw new ConflictException('Renovacao sem conta a receber vinculada.');
    }

    return {
      idempotentReplay,
      client: {
        ...result.client,
        dueDate: formatBusinessDate(result.client.dueDate),
        recurringValue: result.client.recurringValue.toString(),
        plan: {
          ...result.client.plan,
          defaultValue: result.client.plan.defaultValue.toString(),
        },
      },
      renewal: {
        id: result.id,
        clientId: result.clientId,
        planId: result.planId,
        planName: result.planName,
        durationMonths: result.durationMonths,
        previousDueDate: formatBusinessDate(result.previousDueDate),
        newDueDate: formatBusinessDate(result.newDueDate),
        amount: result.amount.toString(),
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

    return lines.join('\\n');
  }

  private buildReactivationDescription(previousStatus: 'INATIVO' | 'CANCELADO') {
    if (previousStatus === 'CANCELADO') {
      return 'Cliente cancelado foi reativado através de renovação.';
    }

    return 'Cliente inativo foi reativado através de renovação.';
  }
}
