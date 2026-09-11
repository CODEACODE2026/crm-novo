import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { RecoveryService } from '../recovery/recovery.service';
import { getReceivableDisplayStatus } from '../renewals/receivable-presenter';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { formatBusinessDate, getBusinessDateDay, parseBusinessDate } from './utils/business-date';
import { normalizeBrazilPhone } from './utils/phone-normalizer';

const pageSizeLimit = 100;
const allowedSortFields = ['name', 'dueDate', 'createdAt'] as const;
const allowedSortDirections = ['asc', 'desc'] as const;

type ClientWithRelations = Prisma.ClientGetPayload<{
  include: {
    plan: true;
    renewals: { orderBy: { createdAt: 'desc' }; include: { receivable: true } };
    receivables: { orderBy: { createdAt: 'desc' } };
    statusHistory: { orderBy: { createdAt: 'desc' } };
    events: { orderBy: { createdAt: 'desc' } };
    recoveryCampaigns: {
      orderBy: { startedAt: 'desc' };
      include: {
        steps: { include: { template: true; dispatch: true }; orderBy: { stepNumber: 'asc' } };
      };
    };
  };
}>;

@Injectable()
export class ClientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlansService) private readonly plansService: PlansService,
    @Inject(RecoveryService) private readonly recoveryService: RecoveryService,
  ) {}

  async list(query: ListClientsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        include: {
          plan: true,
          renewals: { orderBy: { createdAt: 'desc' }, include: { receivable: true } },
          receivables: { orderBy: { createdAt: 'desc' } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
          events: { orderBy: { createdAt: 'desc' } },
          recoveryCampaigns: {
            orderBy: { startedAt: 'desc' },
            include: {
              steps: {
                include: { template: true, dispatch: true },
                orderBy: { stepNumber: 'asc' },
              },
            },
          },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items: items.map((client) => this.presentClient(client)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        plan: true,
        renewals: { orderBy: { createdAt: 'desc' }, include: { receivable: true } },
        receivables: { orderBy: { createdAt: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'desc' } },
        events: { orderBy: { createdAt: 'desc' } },
        recoveryCampaigns: {
          orderBy: { startedAt: 'desc' },
          include: {
            steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    return this.presentClient(client);
  }

  async create(dto: CreateClientDto, actorUserId: string) {
    const dueDate = parseBusinessDate(dto.dueDate);
    const phoneNormalized = normalizeBrazilPhone(dto.phone);

    await this.plansService.ensureActivePlan(dto.planId);

    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            phoneNormalized,
            email: this.optionalTrim(dto.email),
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            notes: this.optionalTrim(dto.notes),
          },
          include: { plan: true },
        });

        await tx.clientEvent.create({
          data: {
            clientId: created.id,
            type: 'CLIENT_CREATED',
            title: 'Cliente cadastrado.',
            createdByUserId: actorUserId,
          },
        });

        return created;
      });

      return this.get(client.id);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateClientDto, actorUserId: string) {
    await this.ensureExists(id);

    const data: Prisma.ClientUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim();
      data.phoneNormalized = normalizeBrazilPhone(dto.phone);
    }

    if (dto.email !== undefined) {
      data.email = this.optionalTrim(dto.email);
    }

    if (dto.reference !== undefined) {
      data.reference = dto.reference.trim();
    }

    if (dto.planId !== undefined) {
      await this.plansService.ensureActivePlan(dto.planId);
      data.plan = { connect: { id: dto.planId } };
    }

    if (dto.recurringValue !== undefined) {
      data.recurringValue = dto.recurringValue;
    }

    if (dto.dueDate !== undefined) {
      const dueDate = parseBusinessDate(dto.dueDate);
      data.dueDate = dueDate;
      data.billingAnchorDay = getBusinessDateDay(dueDate);
    }

    if (dto.billingNoticeDays !== undefined) {
      data.billingNoticeDays = dto.billingNoticeDays;
    }

    if (dto.notes !== undefined) {
      data.notes = this.optionalTrim(dto.notes);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data });
        await tx.clientEvent.create({
          data: {
            clientId: id,
            type: 'CLIENT_UPDATED',
            title: 'Cliente atualizado.',
            createdByUserId: actorUserId,
          },
        });
      });

      return this.get(id);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateStatus(id: string, dto: UpdateClientStatusDto, actorUserId: string) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: { plan: true } });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    const reason = this.optionalTrim(dto.reason);

    if (this.requiresReason(dto.status) && !reason) {
      throw new BadRequestException('Justificativa obrigatoria para inativar ou cancelar cliente.');
    }

    if (client.status === dto.status) {
      return this.get(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: { status: dto.status },
      });

      await tx.clientStatusHistory.create({
        data: {
          clientId: id,
          previousStatus: client.status,
          newStatus: dto.status,
          reason,
          changedByUserId: actorUserId,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: id,
          type: 'STATUS_CHANGED',
          title: `Status alterado de ${client.status} para ${dto.status}.`,
          description: reason ? `Motivo: ${reason}` : null,
          createdByUserId: actorUserId,
        },
      });

      await this.recoveryService.handleClientStatusChange(tx, client, dto.status, {
        startRecovery: dto.startRecovery === true,
        actorUserId,
      });
    });

    return this.get(id);
  }

  private buildWhere(query: ListClientsDto): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {};

    if (query.search) {
      const search = query.search.trim();
      const normalizedPhone = this.tryNormalizePhone(search);

      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
      ];
    }

    if (query.name) {
      where.name = { contains: query.name.trim(), mode: 'insensitive' };
    }

    if (query.reference) {
      where.reference = { contains: query.reference.trim(), mode: 'insensitive' };
    }

    if (query.phone) {
      where.phoneNormalized = { contains: normalizeBrazilPhone(query.phone) };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.planId) {
      where.planId = query.planId;
    }

    if (query.dueDate) {
      where.dueDate = parseBusinessDate(query.dueDate);
    }

    return where;
  }

  private buildOrderBy(query: ListClientsDto): Prisma.ClientOrderByWithRelationInput {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortDirection = query.sortDirection ?? 'desc';

    if (!allowedSortFields.includes(sortBy)) {
      throw new BadRequestException('Campo de ordenacao invalido.');
    }

    if (!allowedSortDirections.includes(sortDirection)) {
      throw new BadRequestException('Direcao de ordenacao invalida.');
    }

    return { [sortBy]: sortDirection };
  }

  private presentClient(
    client: Prisma.ClientGetPayload<{ include: { plan: true } }> | ClientWithRelations,
  ) {
    return {
      ...client,
      recurringValue: client.recurringValue.toString(),
      dueDate: formatBusinessDate(client.dueDate),
      plan: {
        ...client.plan,
        defaultValue: client.plan.defaultValue.toString(),
      },
      ...('renewals' in client
        ? {
            renewals: client.renewals.map((renewal) => ({
              ...renewal,
              previousDueDate: formatBusinessDate(renewal.previousDueDate),
              newDueDate: formatBusinessDate(renewal.newDueDate),
              amount: renewal.amount.toString(),
              receivable: renewal.receivable
                ? {
                    ...renewal.receivable,
                    amount: renewal.receivable.amount.toString(),
                    dueDate: formatBusinessDate(renewal.receivable.dueDate),
                    displayStatus: getReceivableDisplayStatus(
                      renewal.receivable.status,
                      renewal.receivable.dueDate,
                    ),
                  }
                : null,
            })),
            receivables: client.receivables.map((receivable) => ({
              ...receivable,
              amount: receivable.amount.toString(),
              dueDate: formatBusinessDate(receivable.dueDate),
              displayStatus: getReceivableDisplayStatus(receivable.status, receivable.dueDate),
            })),
            recoveryCampaigns: client.recoveryCampaigns.map((campaign) => ({
              id: campaign.id,
              clientId: campaign.clientId,
              status: campaign.status,
              startedAt: campaign.startedAt.toISOString(),
              completedAt: campaign.completedAt?.toISOString() ?? null,
              canceledAt: campaign.canceledAt?.toISOString() ?? null,
              cancelReason: campaign.cancelReason,
              steps: campaign.steps.map((step) => ({
                id: step.id,
                campaignId: step.campaignId,
                stepNumber: step.stepNumber,
                delayDays: step.delayDays,
                templateId: step.templateId,
                dispatchId: step.dispatchId,
                scheduledFor: step.scheduledFor.toISOString(),
                status: step.status,
                sentAt: step.sentAt?.toISOString() ?? null,
                canceledAt: step.canceledAt?.toISOString() ?? null,
                template: step.template
                  ? {
                      id: step.template.id,
                      name: step.template.name,
                      type: step.template.type,
                      active: step.template.active,
                    }
                  : null,
                dispatch: step.dispatch
                  ? {
                      id: step.dispatch.id,
                      status: step.dispatch.status,
                      attempts: step.dispatch.attempts,
                      scheduledFor: step.dispatch.scheduledFor?.toISOString() ?? null,
                      nextAttemptAt: step.dispatch.nextAttemptAt?.toISOString() ?? null,
                      sentAt: step.dispatch.sentAt?.toISOString() ?? null,
                      errorCode: step.dispatch.errorCode,
                      errorMessage: step.dispatch.errorMessage,
                    }
                  : null,
              })),
            })),
          }
        : {}),
    };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.client.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Cliente nao encontrado.');
    }
  }

  private requiresReason(status: ClientStatus) {
    return status === 'INATIVO' || status === 'CANCELADO';
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private tryNormalizePhone(value: string) {
    try {
      return normalizeBrazilPhone(value);
    } catch {
      return null;
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';

      if (target.includes('reference')) {
        throw new ConflictException('Ja existe um cliente com esta referencia.');
      }

      if (target.includes('phoneNormalized')) {
        throw new ConflictException('Ja existe um cliente cadastrado com este telefone.');
      }

      throw new ConflictException('Registro duplicado.');
    }

    throw error;
  }
}
