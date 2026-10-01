import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatBusinessDate,
  getBusinessDateDay,
  parseBusinessDate,
} from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReferenceReactivationDto } from './dto/create-reference-reactivation.dto';

type ReactivationWithRelations = Prisma.ClientReferenceReactivationGetPayload<{
  include: {
    client: true;
    clientReference: { include: { plan: true } };
    plan: true;
    receivable: { include: { paymentIntents: { orderBy: { createdAt: 'desc' } } } };
  };
}>;

@Injectable()
export class ReactivationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createForReference(
    clientReferenceId: string,
    dto: CreateReferenceReactivationDto,
    actorUserId: string,
  ) {
    const existing = await this.prisma.clientReferenceReactivation.findUnique({
      where: {
        clientReferenceId_idempotencyKey: {
          clientReferenceId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: this.includeRelations(),
    });

    if (existing) {
      return this.present(existing, true);
    }

    const activationDate = parseBusinessDate(dto.activationDate);
    const billingAnchorDay = getBusinessDateDay(activationDate);

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          await this.lockReferenceGraph(tx, clientReferenceId);

          const reference = await tx.clientReference.findUnique({
            where: { id: clientReferenceId },
            include: { client: true, plan: true },
          });

          if (!reference) {
            throw new NotFoundException('Referencia do cliente nao encontrada.');
          }

          if (reference.status !== 'CANCELADO') {
            throw new ConflictException({
              code: 'REFERENCE_NOT_CANCELED',
              message: 'Somente referencia CANCELADA pode iniciar reativacao.',
              currentStatus: reference.status,
            });
          }

          const plan = await tx.plan.findFirst({ where: { id: dto.planId, active: true } });

          if (!plan) {
            throw new NotFoundException('Plano ativo nao encontrado.');
          }

          const pending = await tx.clientReferenceReactivation.findFirst({
            where: { clientReferenceId, status: 'PENDING' },
            include: this.includeRelations(),
            orderBy: { createdAt: 'asc' },
          });

          if (pending) {
            throw new ConflictException({
              code: 'PENDING_REACTIVATION_EXISTS',
              message: 'Referencia ja possui reativacao pendente.',
              reactivation: this.present(pending, true),
            });
          }

          const receivable = await tx.receivable.create({
            data: {
              clientId: reference.clientId,
              clientReferenceId: reference.id,
              purpose: 'REACTIVATION',
              description: `Reativacao - Plano ${plan.name}`,
              amount: dto.amount,
              dueDate: activationDate,
              status: 'PENDENTE',
            },
          });

          const reactivation = await tx.clientReferenceReactivation.create({
            data: {
              clientId: reference.clientId,
              clientReferenceId: reference.id,
              receivableId: receivable.id,
              planId: plan.id,
              previousPlanId: reference.planId,
              previousPlanName: reference.plan.name,
              previousAmount: reference.recurringValue,
              previousDueDate: reference.dueDate,
              previousBillingAnchorDay: reference.billingAnchorDay,
              previousStatus: reference.status,
              activationDate,
              billingAnchorDay,
              recurringValue: dto.amount,
              idempotencyKey: dto.idempotencyKey,
              createdByUserId: actorUserId,
            },
          });

          await tx.clientEvent.create({
            data: {
              clientId: reference.clientId,
              type: 'CLIENT_REFERENCE_REACTIVATION_REQUESTED',
              title: `Reativacao da referencia ${reference.reference} solicitada.`,
              description: `Aguardando pagamento da reativacao de ${this.formatCurrency(
                new Prisma.Decimal(dto.amount),
              )}.`,
              metadata: {
                reactivationId: reactivation.id,
                receivableId: receivable.id,
                clientReferenceId: reference.id,
                reference: reference.reference,
                previousPlanId: reference.planId,
                previousPlanName: reference.plan.name,
                previousAmount: reference.recurringValue.toString(),
                previousDueDate: formatBusinessDate(reference.dueDate),
                previousBillingAnchorDay: reference.billingAnchorDay,
                previousStatus: reference.status,
                planId: plan.id,
                planName: plan.name,
                amount: dto.amount.toFixed(2),
                activationDate: formatBusinessDate(activationDate),
                billingAnchorDay,
              },
              createdByUserId: actorUserId,
            },
          });

          return tx.clientReferenceReactivation.findUniqueOrThrow({
            where: { id: reactivation.id },
            include: this.includeRelations(),
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return this.present(result, false);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const pending = await this.prisma.clientReferenceReactivation.findFirst({
          where: { clientReferenceId, status: 'PENDING' },
          include: this.includeRelations(),
          orderBy: { createdAt: 'asc' },
        });

        if (pending) {
          throw new ConflictException({
            code: 'PENDING_REACTIVATION_EXISTS',
            message: 'Referencia ja possui reativacao pendente.',
            reactivation: this.present(pending, true),
          });
        }

        const existingAfterConflict = await this.prisma.clientReferenceReactivation.findUnique({
          where: {
            clientReferenceId_idempotencyKey: {
              clientReferenceId,
              idempotencyKey: dto.idempotencyKey,
            },
          },
          include: this.includeRelations(),
        });

        if (existingAfterConflict) {
          return this.present(existingAfterConflict, true);
        }

        throw new ConflictException('Reativacao duplicada.');
      }

      throw error;
    }
  }

  private includeRelations() {
    return {
      client: true,
      clientReference: { include: { plan: true } },
      plan: true,
      receivable: { include: { paymentIntents: { orderBy: { createdAt: 'desc' as const } } } },
    };
  }

  private async lockReferenceGraph(tx: Prisma.TransactionClient, clientReferenceId: string) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT cr.id
      FROM "client_references" cr
      JOIN "clients" c ON c.id = cr."clientId"
      WHERE cr.id = ${clientReferenceId}::uuid
      FOR UPDATE OF cr, c
    `);
  }

  private present(reactivation: ReactivationWithRelations, alreadyExisted: boolean) {
    return {
      id: reactivation.id,
      alreadyExisted,
      clientId: reactivation.clientId,
      clientReferenceId: reactivation.clientReferenceId,
      receivableId: reactivation.receivableId,
      status: reactivation.status,
      idempotencyKey: reactivation.idempotencyKey,
      activationDate: formatBusinessDate(reactivation.activationDate),
      billingAnchorDay: reactivation.billingAnchorDay,
      recurringValue: reactivation.recurringValue.toString(),
      paidAt: reactivation.paidAt?.toISOString() ?? null,
      canceledAt: reactivation.canceledAt?.toISOString() ?? null,
      cancelReason: reactivation.cancelReason,
      createdAt: reactivation.createdAt.toISOString(),
      updatedAt: reactivation.updatedAt.toISOString(),
      plan: {
        id: reactivation.plan.id,
        name: reactivation.plan.name,
        durationMonths: reactivation.plan.durationMonths,
        defaultValue: reactivation.plan.defaultValue.toString(),
        active: reactivation.plan.active,
      },
      previous: {
        planId: reactivation.previousPlanId,
        planName: reactivation.previousPlanName,
        amount: reactivation.previousAmount?.toString() ?? null,
        dueDate: reactivation.previousDueDate
          ? formatBusinessDate(reactivation.previousDueDate)
          : null,
        billingAnchorDay: reactivation.previousBillingAnchorDay,
        status: reactivation.previousStatus,
      },
      client: {
        id: reactivation.client.id,
        name: reactivation.client.name,
        status: reactivation.client.status,
      },
      clientReference: {
        id: reactivation.clientReference.id,
        reference: reactivation.clientReference.reference,
        status: reactivation.clientReference.status,
        planId: reactivation.clientReference.planId,
        recurringValue: reactivation.clientReference.recurringValue.toString(),
        dueDate: formatBusinessDate(reactivation.clientReference.dueDate),
        billingAnchorDay: reactivation.clientReference.billingAnchorDay,
      },
      receivable: {
        id: reactivation.receivable.id,
        clientId: reactivation.receivable.clientId,
        clientReferenceId: reactivation.receivable.clientReferenceId,
        renewalId: reactivation.receivable.renewalId,
        purpose: reactivation.receivable.purpose,
        description: reactivation.receivable.description,
        amount: reactivation.receivable.amount.toString(),
        dueDate: formatBusinessDate(reactivation.receivable.dueDate),
        status: reactivation.receivable.status,
        displayStatus: reactivation.receivable.status,
        paidAt: reactivation.receivable.paidAt
          ? formatBusinessDate(reactivation.receivable.paidAt)
          : null,
        canceledAt: reactivation.receivable.canceledAt?.toISOString() ?? null,
        cancelReason: reactivation.receivable.cancelReason,
        createdAt: reactivation.receivable.createdAt.toISOString(),
        updatedAt: reactivation.receivable.updatedAt.toISOString(),
        client: {
          id: reactivation.client.id,
          name: reactivation.client.name,
          reference: reactivation.client.reference,
        },
        clientReference: {
          id: reactivation.clientReference.id,
          reference: reactivation.clientReference.reference,
          status: reactivation.clientReference.status,
          planName: reactivation.plan.name,
        },
        paymentIntents: reactivation.receivable.paymentIntents.map((intent) => ({
          id: intent.id,
          receivableId: intent.receivableId,
          paymentGroupId: intent.paymentGroupId,
          provider: intent.provider,
          providerTransactionId: intent.providerTransactionId,
          externalStatus: intent.externalStatus,
          externalDepixId: intent.externalDepixId,
          blockchainTxId: intent.blockchainTxId,
          status: intent.status,
          amount: intent.amount.toString(),
          pixCopyPaste: intent.pixCopyPaste,
          qrCodeData: intent.qrCodeData,
          failureCode: intent.failureCode,
          failureMessage: intent.failureMessage,
          createdAt: intent.createdAt.toISOString(),
          updatedAt: intent.updatedAt.toISOString(),
          expiresAt: intent.expiresAt?.toISOString() ?? null,
          paidAt: intent.paidAt?.toISOString() ?? null,
          lastSyncAt: intent.lastSyncAt?.toISOString() ?? null,
        })),
      },
    };
  }

  private formatCurrency(value: Prisma.Decimal) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(value));
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
