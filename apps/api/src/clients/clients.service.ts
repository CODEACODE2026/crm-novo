import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientStatus, PaymentProviderCode, Prisma } from '@prisma/client';
import type { CountryCode } from 'libphonenumber-js';
import { listSupportedPhoneCountries, normalizePhone } from '../common/phone/phone-normalizer';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  isClientPreferredPixProvider,
  paymentProviderDisplayName,
} from '../finance/payments/client-pix-provider-preference';
import { PlansService } from '../plans/plans.service';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { RecoveryService } from '../recovery/recovery.service';
import { ReferralsService } from '../referrals/referrals.service';
import { getReceivableDisplayStatus } from '../renewals/receivable-presenter';
import { CreateClientReferenceDto } from './dto/create-client-reference.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { DeleteClientConfirmationDto } from './dto/delete-client-confirmation.dto';
import { ListClientEventsDto } from './dto/list-client-events.dto';
import { ListClientOptionsDto } from './dto/list-client-options.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { UpdateClientReferenceStatusDto } from './dto/update-client-reference-status.dto';
import { UpdateClientReferenceDto } from './dto/update-client-reference.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { formatBusinessDate, getBusinessDateDay, parseBusinessDate } from './utils/business-date';
import { normalizeBrazilPhone } from './utils/phone-normalizer';

const pageSizeLimit = 100;
const allowedSortFields = ['name', 'dueDate', 'createdAt'] as const;
const allowedSortDirections = ['asc', 'desc'] as const;
const legacyOperationalClientFields = [
  'reference',
  'planId',
  'recurringValue',
  'dueDate',
  'billingAnchorDay',
  'billingNoticeDays',
  'status',
] as const;

type ClientWithRelations = Prisma.ClientGetPayload<{
  include: {
    plan: true;
    renewals: { orderBy: { createdAt: 'desc' }; include: { receivable: true } };
    receivables: { orderBy: { createdAt: 'desc' }; include: { paymentIntents: true } };
    messageDispatches: { orderBy: { createdAt: 'desc' }; take: 20 };
    statusHistory: { orderBy: { createdAt: 'desc' } };
    events: { orderBy: { createdAt: 'desc' } };
    recoveryCampaigns: {
      orderBy: { startedAt: 'desc' };
      include: {
        steps: { include: { template: true; dispatch: true }; orderBy: { stepNumber: 'asc' } };
      };
    };
    referralsReceived: {
      orderBy: { createdAt: 'desc' };
      include: { referredClientReference: true; referrerClient: true };
    };
    referralsMade: {
      orderBy: { createdAt: 'desc' };
      include: { referredClient: true; referredClientReference: true };
    };
    references: { orderBy: { createdAt: 'asc' }; include: { plan: true } };
  };
}>;

type ClientDetailWithRelations = Prisma.ClientGetPayload<{
  include: {
    plan: true;
    renewals: { orderBy: { createdAt: 'desc' }; include: { receivable: true } };
    events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]; take: 5 };
    recoveryCampaigns: {
      orderBy: { startedAt: 'desc' };
      include: {
        steps: { include: { template: true; dispatch: true }; orderBy: { stepNumber: 'asc' } };
      };
    };
    referralsReceived: {
      orderBy: { createdAt: 'desc' };
      include: { referredClientReference: true; referrerClient: true };
    };
    referralsMade: {
      orderBy: { createdAt: 'desc' };
      include: { referredClient: true; referredClientReference: true };
    };
    references: { orderBy: { createdAt: 'asc' }; include: { plan: true } };
  };
}>;
type ClientReferenceWithPlan = Prisma.ClientReferenceGetPayload<{ include: { plan: true } }>;

@Injectable()
export class ClientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlansService) private readonly plansService: PlansService,
    @Inject(RecoveryService) private readonly recoveryService: RecoveryService,
    @Inject(ReferralsService) private readonly referralsService: ReferralsService,
    @Optional()
    @Inject(ReceivableCycleService)
    private readonly receivableCycleService?: ReceivableCycleService,
    @Optional()
    @Inject(ConfigService)
    private readonly configService?: ConfigService,
  ) {}

  phoneCapabilities() {
    const internationalClientWriteEnabled = this.internationalClientWriteEnabled();
    const enabled = this.internationalPhoneEnabled() || internationalClientWriteEnabled;

    return {
      enabled,
      internationalWriteEnabled: internationalClientWriteEnabled,
      internationalClientWriteEnabled,
      internationalWhatsAppSendEnabled: false,
      internationalManualTextSendEnabled:
        this.configService?.get<string>('PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED') === 'true',
      internationalMessageActionsEnabled:
        this.configService?.get<string>('PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED') === 'true',
      internationalManualPixEnabled:
        this.configService?.get<string>('PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED') === 'true',
      internationalBillingSendEnabled:
        this.configService?.get<string>('PHONE_INTERNATIONAL_BILLING_ENABLED') === 'true',
      defaultCountry: 'BR' as const,
      supportedCountries: enabled ? listSupportedPhoneCountries() : [],
    };
  }

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
          receivables: {
            orderBy: { createdAt: 'desc' },
            include: { paymentIntents: { orderBy: { createdAt: 'desc' } } },
          },
          statusHistory: { orderBy: { createdAt: 'desc' } },
          events: { orderBy: { createdAt: 'desc' } },
          messageDispatches: { orderBy: { createdAt: 'desc' }, take: 20 },
          recoveryCampaigns: {
            orderBy: { startedAt: 'desc' },
            include: {
              steps: {
                include: { template: true, dispatch: true },
                orderBy: { stepNumber: 'asc' },
              },
            },
          },
          referralsReceived: {
            orderBy: { createdAt: 'desc' },
            include: { referredClientReference: true, referrerClient: true },
          },
          referralsMade: {
            orderBy: { createdAt: 'desc' },
            include: { referredClient: true, referredClientReference: true },
          },
          references: { orderBy: { createdAt: 'asc' }, include: { plan: true } },
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

  async options(query: ListClientOptionsDto) {
    const search = query.search?.trim() ?? '';

    if (!search) {
      return [];
    }

    const normalizedPhone = this.tryNormalizePhone(search);
    const items = await this.prisma.client.findMany({
      where: this.buildOptionWhere(search, normalizedPhone),
      select: {
        email: true,
        id: true,
        name: true,
        phoneNormalized: true,
        preferredPixProvider: true,
        references: { select: { reference: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { name: 'asc' },
      take: Math.min(query.limit ?? 20, 20),
    });

    return items.map((client) => ({
      id: client.id,
      email: client.email,
      name: client.name,
      reference: this.referenceSummary(client.references),
      phoneNormalized: client.phoneNormalized,
      preferredPixProvider: client.preferredPixProvider,
    }));
  }

  async get(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        plan: true,
        renewals: { orderBy: { createdAt: 'desc' }, include: { receivable: true } },
        events: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5 },
        recoveryCampaigns: {
          orderBy: { startedAt: 'desc' },
          include: {
            steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
          },
        },
        referralsReceived: {
          orderBy: { createdAt: 'desc' },
          include: { referredClientReference: true, referrerClient: true },
        },
        referralsMade: {
          orderBy: { createdAt: 'desc' },
          include: { referredClient: true, referredClientReference: true },
        },
        references: { orderBy: { createdAt: 'asc' }, include: { plan: true } },
      },
    });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    return this.presentClient(client);
  }

  async listEvents(id: string, query: ListClientEventsDto) {
    await this.ensureExists(id);

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, pageSizeLimit);
    const where: Prisma.ClientEventWhereInput = { clientId: id };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientEvent.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.clientEvent.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async create(dto: CreateClientDto, actorUserId: string) {
    const dueDate = parseBusinessDate(dto.dueDate);
    const phoneIdentity = this.prepareClientPhone(dto.phone, dto.phoneCountry);
    const generateInitialReceivable = dto.generateInitialReceivable ?? false;

    await this.plansService.ensureActivePlan(dto.planId);

    try {
      const client = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            phoneNormalized: phoneIdentity.phoneNormalized,
            phoneE164: phoneIdentity.phoneE164,
            email: this.optionalTrim(dto.email),
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            preferredPixProvider: this.resolvePreferredPixProvider(dto.preferredPixProvider),
            notes: this.optionalTrim(dto.notes),
          },
          include: { plan: true },
        });

        const clientReference = await tx.clientReference.create({
          data: {
            clientId: created.id,
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            internationalBillingEnabled: dto.internationalBillingEnabled ?? false,
            status: generateInitialReceivable ? 'PENDENTE_PAGAMENTO' : 'ATIVO',
          },
        });

        if (generateInitialReceivable) {
          await tx.receivable.create({
            data: {
              clientId: created.id,
              clientReferenceId: clientReference.id,
              purpose: 'INITIAL_ACTIVATION',
              description: `Cobranca inicial de ativacao - ${created.plan.name}`,
              amount: dto.recurringValue,
              dueDate,
              status: 'PENDENTE',
            },
          });
        } else {
          await this.currentCycle().ensureCurrentCycleReceivable(clientReference.id, tx);
        }

        await tx.clientEvent.create({
          data: {
            clientId: created.id,
            type: 'CLIENT_CREATED',
            title: 'Cliente cadastrado.',
            metadata: {
              clientReferenceId: clientReference.id,
              generateInitialReceivable,
              referenceStatus: clientReference.status,
            },
            createdByUserId: actorUserId,
          },
        });

        await this.referralsService.createPending(tx, {
          referredClientId: created.id,
          referredClientReferenceId: clientReference.id,
          referrerClientId: dto.referrerClientId,
          rewardType: dto.referralRewardType,
          rewardValue: dto.referralRewardValue,
          rewardDescription: dto.referralRewardDescription,
          actorUserId,
        });

        return created;
      });

      return this.get(client.id);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(id: string, dto: UpdateClientDto, actorUserId: string) {
    this.rejectLegacyOperationalClientFields(dto);
    await this.ensureExists(id);

    const data: Prisma.ClientUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      const phoneIdentity = this.prepareClientPhone(dto.phone, dto.phoneCountry);
      data.phone = dto.phone.trim();
      data.phoneNormalized = phoneIdentity.phoneNormalized;
      data.phoneE164 = phoneIdentity.phoneE164;
    } else if (dto.phoneCountry !== undefined) {
      throw new BadRequestException(
        'O pais do telefone so pode ser alterado junto com o telefone.',
      );
    }

    if (dto.email !== undefined) {
      data.email = this.optionalTrim(dto.email);
    }

    if (dto.notes !== undefined) {
      data.notes = this.optionalTrim(dto.notes);
    }

    if (dto.preferredPixProvider !== undefined) {
      data.preferredPixProvider = this.resolvePreferredPixProvider(dto.preferredPixProvider);
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

  async listReferences(clientId: string) {
    await this.ensureExists(clientId);
    const references = await this.prisma.clientReference.findMany({
      where: { clientId },
      include: { plan: true },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    return references.map((reference) => this.presentClientReference(reference));
  }

  async getReference(id: string) {
    const reference = await this.prisma.clientReference.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    return this.presentClientReference(reference);
  }

  async createReference(clientId: string, dto: CreateClientReferenceDto, actorUserId: string) {
    await this.ensureExists(clientId);
    await this.plansService.ensureActivePlan(dto.planId);
    if (
      !dto.referrerClientId &&
      (dto.referralRewardType !== undefined ||
        dto.referralRewardValue !== undefined ||
        dto.referralRewardDescription !== undefined)
    ) {
      throw new BadRequestException(
        'Cliente indicador obrigatorio quando houver configuracao de indicacao.',
      );
    }
    const dueDate = parseBusinessDate(dto.dueDate);

    try {
      const reference = await this.prisma.$transaction(async (tx) => {
        const created = await tx.clientReference.create({
          data: {
            clientId,
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            internationalBillingEnabled: dto.internationalBillingEnabled ?? false,
            notes: this.optionalTrim(dto.notes),
            status: 'PENDENTE_PAGAMENTO',
          },
          include: { plan: true },
        });

        await tx.receivable.create({
          data: {
            clientId,
            clientReferenceId: created.id,
            purpose: 'INITIAL_ACTIVATION',
            description: `Cobranca inicial de ativacao - ${created.plan.name}`,
            amount: dto.recurringValue,
            dueDate,
            status: 'PENDENTE',
          },
        });

        await tx.clientEvent.create({
          data: {
            clientId,
            type: 'CLIENT_UPDATED',
            title: `Referencia ${created.reference} adicionada aguardando pagamento.`,
            metadata: {
              clientReferenceId: created.id,
              reference: created.reference,
              referenceStatus: created.status,
              initialReceivablePurpose: 'INITIAL_ACTIVATION',
            },
            createdByUserId: actorUserId,
          },
        });

        if (dto.referrerClientId) {
          await this.referralsService.createPending(tx, {
            referredClientId: clientId,
            referredClientReferenceId: created.id,
            referrerClientId: dto.referrerClientId,
            rewardType: dto.referralRewardType,
            rewardValue: dto.referralRewardValue,
            rewardDescription: dto.referralRewardDescription,
            origin: 'MANUAL',
            actorUserId,
          });
        }

        return created;
      });

      return this.presentClientReference(reference);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async updateReference(id: string, dto: UpdateClientReferenceDto, actorUserId: string) {
    const current = await this.prisma.clientReference.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    const data: Prisma.ClientReferenceUpdateInput = {};

    if (dto.reference !== undefined) data.reference = dto.reference.trim();
    if (dto.planId !== undefined) {
      await this.plansService.ensureActivePlan(dto.planId);
      data.plan = { connect: { id: dto.planId } };
    }
    if (dto.recurringValue !== undefined) data.recurringValue = dto.recurringValue;
    if (dto.dueDate !== undefined) {
      const dueDate = parseBusinessDate(dto.dueDate);
      data.dueDate = dueDate;
      data.billingAnchorDay = getBusinessDateDay(dueDate);
    }
    if (dto.billingNoticeDays !== undefined) data.billingNoticeDays = dto.billingNoticeDays;
    if (dto.internationalBillingEnabled !== undefined) {
      data.internationalBillingEnabled = dto.internationalBillingEnabled;
    }
    if (dto.notes !== undefined) data.notes = this.optionalTrim(dto.notes);

    const cycleChanged =
      dto.dueDate !== undefined || dto.recurringValue !== undefined || dto.planId !== undefined;
    const internationalBillingDisabled =
      current.internationalBillingEnabled && dto.internationalBillingEnabled === false;

    try {
      const reference = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.clientReference.update({
          where: { id },
          data,
          include: { plan: true },
        });

        if (current.status === 'ATIVO' && cycleChanged) {
          const moved = await this.currentCycle().updatePendingCurrentCycleReceivable(
            id,
            current.dueDate,
            {
              dueDate: updated.dueDate,
              amount: updated.recurringValue,
              planName: updated.plan.name,
            },
            tx,
          );

          if (!moved) {
            await this.currentCycle().ensureCurrentCycleReceivable(id, tx);
          }

          await this.cancelFutureReferenceBillingDispatches(
            tx,
            id,
            'CLIENT_REFERENCE_CYCLE_CHANGED',
            'Cobranca futura cancelada porque o ciclo da referencia foi alterado.',
          );
        }

        if (internationalBillingDisabled) {
          await this.cancelFutureReferenceBillingDispatches(
            tx,
            id,
            'INTERNATIONAL_BILLING_OPT_IN_REVOKED',
            'Cobranca futura cancelada porque a autorizacao internacional foi revogada.',
          );
        }

        await tx.clientEvent.create({
          data: {
            clientId: current.clientId,
            type: 'CLIENT_UPDATED',
            title: `Referencia ${current.reference} atualizada.`,
            metadata: { clientReferenceId: id },
            createdByUserId: actorUserId,
          },
        });

        return tx.clientReference.findUniqueOrThrow({ where: { id }, include: { plan: true } });
      });

      return this.presentClientReference(reference);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private currentCycle() {
    if (!this.receivableCycleService) {
      throw new ConflictException('Servico de ciclo financeiro indisponivel.');
    }

    return this.receivableCycleService;
  }

  async updateReferenceStatus(
    id: string,
    dto: UpdateClientReferenceStatusDto,
    actorUserId: string,
  ) {
    const reference = await this.prisma.clientReference.findUnique({
      where: { id },
      include: { plan: true, client: true },
    });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    const reason = this.optionalTrim(dto.reason);
    if (this.requiresReason(dto.status) && !reason) {
      throw new BadRequestException(
        'Justificativa obrigatoria para inativar ou cancelar referencia.',
      );
    }

    if (reference.status === 'CANCELADO' && dto.status === 'ATIVO') {
      throw new ConflictException('Referencia cancelada nao pode ser reativada nesta etapa.');
    }

    if (reference.status === dto.status) {
      return this.presentClientReference(reference);
    }

    const changedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.clientReference.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === 'INATIVO'
            ? {
                inactivatedAt: changedAt,
                inactivationReason: reason,
                inactivatedByUserId: actorUserId,
              }
            : {}),
          ...(dto.status === 'CANCELADO'
            ? {
                canceledAt: changedAt,
                cancellationReason: reason,
                canceledByUserId: actorUserId,
              }
            : {}),
        },
      });
      await tx.clientStatusHistory.create({
        data: {
          clientId: reference.clientId,
          clientReferenceId: id,
          previousStatus: reference.status,
          newStatus: dto.status,
          reason,
          changedByUserId: actorUserId,
        },
      });
      await tx.clientEvent.create({
        data: {
          clientId: reference.clientId,
          type: 'STATUS_CHANGED',
          title: `Status da referencia ${reference.reference} alterado de ${reference.status} para ${dto.status}.`,
          description: reason ? `Motivo: ${reason}` : null,
          metadata: {
            clientReferenceId: id,
            previousStatus: reference.status,
            newStatus: dto.status,
          },
          createdByUserId: actorUserId,
        },
      });

      await this.recoveryService.handleClientReferenceStatusChange(tx, reference, dto.status, {
        actorUserId,
      });

      if (dto.status === 'INATIVO' || dto.status === 'CANCELADO') {
        await this.cancelFutureReferenceBillingDispatches(
          tx,
          id,
          dto.status === 'CANCELADO' ? 'CLIENT_REFERENCE_CANCELED' : 'CLIENT_REFERENCE_INACTIVE',
          dto.status === 'CANCELADO'
            ? 'Referencia cancelada antes do envio da cobranca.'
            : 'Referencia inativada antes do envio da cobranca.',
        );
      }

      if (reference.status === 'INATIVO' && dto.status === 'ATIVO') {
        await this.currentCycle().ensureCurrentCycleReceivable(id, tx);
      }

      if (reference.status === 'PENDENTE_PAGAMENTO' && dto.status === 'CANCELADO') {
        await this.referralsService.cancelPendingForReferenceBeforePayment(
          tx,
          reference.clientId,
          reference.id,
          reason,
          actorUserId,
        );
      }
    });

    return this.getReference(id);
  }

  async previewRemoveReference(id: string) {
    const reference = await this.prisma.clientReference.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    return {
      target: this.presentClientReference(reference),
      counts: await this.countReferenceRemovalTargets(id),
    };
  }

  async removeReference(id: string, dto: DeleteClientConfirmationDto) {
    this.ensureDeleteConfirmed(dto);
    const preview = await this.previewRemoveReference(id);
    if (preview.counts.referralsReceived > 0) {
      throw new ConflictException(
        'Referencia vinculada a indicacao nao pode ser removida; utilize cancelamento.',
      );
    }
    const counts = await this.runDestructiveRemoval(() => this.deleteReferenceTree(id));

    return { id, removed: true, counts };
  }

  async previewRemove(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id }, include: { plan: true } });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    return {
      target: {
        id: client.id,
        name: client.name,
        reference: client.reference,
      },
      counts: await this.countClientRemovalTargets(id),
    };
  }

  async remove(id: string, dto: DeleteClientConfirmationDto) {
    this.ensureDeleteConfirmed(dto);
    const preview = await this.previewRemove(id);
    if (preview.counts.referralsReceived > 0 || preview.counts.referralsMade > 0) {
      throw new ConflictException(
        'Cliente vinculado a indicacao nao pode ser removido; preserve o historico da indicacao.',
      );
    }
    const counts = await this.runDestructiveRemoval(() => this.deleteClientTree(id));

    return { id, removed: true, counts };
  }

  async updateStatus(id: string, dto: UpdateClientStatusDto, actorUserId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { references: { include: { plan: true }, orderBy: { createdAt: 'asc' } } },
    });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    if (client.references.length !== 1) {
      throw new ConflictException(
        client.references.length > 1
          ? 'Cliente possui multiplas referencias. Altere o status pela referencia operacional especifica.'
          : 'Cliente nao possui referencia operacional para alteracao de status.',
      );
    }

    const [reference] = client.references;
    if (!reference) {
      throw new ConflictException(
        'Cliente nao possui referencia operacional para alteracao de status.',
      );
    }

    await this.updateReferenceStatus(reference.id, dto, actorUserId);
    return this.get(id);
  }

  private buildWhere(query: ListClientsDto): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {};
    const referenceFilters: Prisma.ClientReferenceWhereInput = {};

    if (query.search) {
      const search = query.search.trim();
      const normalizedPhone = this.tryNormalizePhone(search);

      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { references: { some: { reference: { contains: search, mode: 'insensitive' } } } },
        ...this.buildPhoneSearchConditions(search),
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
      ];
    }

    if (query.name) {
      where.name = { contains: query.name.trim(), mode: 'insensitive' };
    }

    if (query.reference) {
      referenceFilters.reference = { contains: query.reference.trim(), mode: 'insensitive' };
    }

    if (query.phone) {
      const canonical = this.tryNormalizeCanonicalPhone(query.phone);
      if (canonical) {
        where.phoneE164 = canonical;
      } else {
        where.phoneNormalized = { contains: normalizeBrazilPhone(query.phone) };
      }
    }

    if (query.status) {
      referenceFilters.status = query.status;
    }

    if (query.planId) {
      referenceFilters.planId = query.planId;
    }

    if (query.dueDate) {
      referenceFilters.dueDate = parseBusinessDate(query.dueDate);
    }

    if (Object.keys(referenceFilters).length > 0) {
      where.references = { some: referenceFilters };
    }

    return where;
  }

  private buildOptionWhere(
    search: string,
    normalizedPhone: string | null,
  ): Prisma.ClientWhereInput {
    return {
      OR: [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { references: { some: { reference: { contains: search, mode: 'insensitive' } } } },
        ...this.buildPhoneSearchConditions(search),
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
      ],
    };
  }

  private buildPhoneSearchConditions(search: string): Prisma.ClientWhereInput[] {
    const conditions: Prisma.ClientWhereInput[] = [
      { phone: { contains: search, mode: 'insensitive' } },
    ];

    const canonical = this.tryNormalizeCanonicalPhone(search);
    if (canonical) {
      conditions.push({ phoneE164: canonical });
      return conditions;
    }

    for (const term of this.phoneSearchTerms(search)) {
      conditions.push({ phoneNormalized: { contains: term } });
    }

    return conditions;
  }

  private phoneSearchTerms(search: string) {
    const digits = search.replace(/\D/g, '');

    if (digits.length < 4) {
      return [];
    }

    const terms = new Set([digits]);

    if (digits.startsWith('55')) {
      const withoutCountryCode = digits.slice(2);
      if (withoutCountryCode.length >= 4) {
        terms.add(withoutCountryCode);
      }
    } else {
      terms.add(`55${digits}`);
    }

    return [...terms];
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
    client:
      | Prisma.ClientGetPayload<{ include: { plan: true } }>
      | ClientWithRelations
      | ClientDetailWithRelations,
  ) {
    const phoneIdentity = client.phoneE164 ? normalizePhone(client.phoneE164) : null;

    return {
      ...client,
      phoneCountry: phoneIdentity?.status === 'valid' ? phoneIdentity.country : null,
      recurringValue: client.recurringValue.toString(),
      dueDate: formatBusinessDate(client.dueDate),
      plan: {
        ...client.plan,
        defaultValue: client.plan.defaultValue.toString(),
      },
      ...('renewals' in client
        ? {
            references: client.references.map((reference) =>
              this.presentClientReference(reference),
            ),
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
            ...('receivables' in client
              ? {
                  receivables: client.receivables.map((receivable) => ({
                    ...receivable,
                    amount: receivable.amount.toString(),
                    dueDate: formatBusinessDate(receivable.dueDate),
                    displayStatus: getReceivableDisplayStatus(
                      receivable.status,
                      receivable.dueDate,
                    ),
                    paymentIntents: receivable.paymentIntents.map((intent) => ({
                      ...intent,
                      amount: intent.amount.toString(),
                      expiresAt: intent.expiresAt?.toISOString() ?? null,
                      paidAt: intent.paidAt?.toISOString() ?? null,
                      lastSyncAt: intent.lastSyncAt?.toISOString() ?? null,
                    })),
                  })),
                }
              : {}),
            ...('messageDispatches' in client
              ? {
                  messageDispatches: client.messageDispatches.map((dispatch) => ({
                    id: dispatch.id,
                    phone: dispatch.phone,
                    body: dispatch.body,
                    renderedContent: dispatch.renderedContent,
                    origin: dispatch.origin,
                    status: dispatch.status,
                    scheduledFor: dispatch.scheduledFor?.toISOString() ?? null,
                    attempts: dispatch.attempts,
                    errorCode: dispatch.errorCode,
                    errorMessage: dispatch.errorMessage,
                    sentAt: dispatch.sentAt?.toISOString() ?? null,
                    createdAt: dispatch.createdAt.toISOString(),
                  })),
                }
              : {}),
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
            referralsReceived: (client.referralsReceived ?? []).map((referral) =>
              this.presentReceivedReferral(referral),
            ),
            referralReceived:
              (client.referralsReceived ?? []).length === 1 && client.referralsReceived?.[0]
                ? this.presentReceivedReferral(client.referralsReceived[0])
                : null,
            referralsMade: {
              total: client.referralsMade.length,
              qualified: client.referralsMade.filter((referral) => referral.status === 'QUALIFIED')
                .length,
              rewarded: client.referralsMade.filter((referral) => referral.status === 'REWARDED')
                .length,
              items: client.referralsMade.map((referral) => ({
                id: referral.id,
                referredClientId: referral.referredClientId,
                referredClientReferenceId: referral.referredClientReferenceId,
                status: referral.status,
                rewardType: referral.rewardType,
                rewardValue: referral.rewardValue?.toString() ?? null,
                rewardDescription: referral.rewardDescription,
                qualifiedAt: referral.qualifiedAt?.toISOString() ?? null,
                appliedAt: referral.appliedAt?.toISOString() ?? null,
                referredClient: {
                  id: referral.referredClient.id,
                  name: referral.referredClient.name,
                  reference: referral.referredClient.reference,
                  status: referral.referredClient.status,
                },
                referredClientReference: referral.referredClientReference
                  ? {
                      id: referral.referredClientReference.id,
                      reference: referral.referredClientReference.reference,
                      status: referral.referredClientReference.status,
                    }
                  : null,
              })),
            },
          }
        : {}),
    };
  }

  private presentReceivedReferral(referral: ClientWithRelations['referralsReceived'][number]) {
    return {
      id: referral.id,
      referredClientReferenceId: referral.referredClientReferenceId,
      referrerClientId: referral.referrerClientId,
      status: referral.status,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue?.toString() ?? null,
      rewardDescription: referral.rewardDescription,
      qualifiedAt: referral.qualifiedAt?.toISOString() ?? null,
      appliedAt: referral.appliedAt?.toISOString() ?? null,
      canceledAt: referral.canceledAt?.toISOString() ?? null,
      referredClientReference: referral.referredClientReference
        ? {
            id: referral.referredClientReference.id,
            reference: referral.referredClientReference.reference,
            status: referral.referredClientReference.status,
          }
        : null,
      referrerClient: {
        id: referral.referrerClient.id,
        name: referral.referrerClient.name,
        reference: referral.referrerClient.reference,
        status: referral.referrerClient.status,
      },
    };
  }

  private presentClientReference(reference: ClientReferenceWithPlan) {
    return {
      id: reference.id,
      clientId: reference.clientId,
      reference: reference.reference,
      planId: reference.planId,
      recurringValue: reference.recurringValue.toString(),
      dueDate: formatBusinessDate(reference.dueDate),
      billingAnchorDay: reference.billingAnchorDay,
      billingNoticeDays: reference.billingNoticeDays,
      internationalBillingEnabled: reference.internationalBillingEnabled,
      status: reference.status,
      notes: reference.notes,
      inactivatedAt: reference.inactivatedAt?.toISOString() ?? null,
      inactivationReason: reference.inactivationReason,
      inactivatedByUserId: reference.inactivatedByUserId,
      canceledAt: reference.canceledAt?.toISOString() ?? null,
      cancellationReason: reference.cancellationReason,
      canceledByUserId: reference.canceledByUserId,
      createdAt: reference.createdAt.toISOString(),
      updatedAt: reference.updatedAt.toISOString(),
      plan: {
        ...reference.plan,
        defaultValue: reference.plan.defaultValue.toString(),
      },
    };
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.client.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Cliente nao encontrado.');
    }
  }

  private async countReferenceRemovalTargets(clientReferenceId: string) {
    const receivableIds = await this.findReceivableIdsByReference(clientReferenceId);
    const paymentIntentIds = await this.findPaymentIntentIdsByReceivables(receivableIds);
    const [
      renewals,
      renewalReversals,
      reactivations,
      receivables,
      paymentIntents,
      paymentWebhookEvents,
      paymentGroupItems,
      messageDispatchItems,
      campaigns,
      campaignSteps,
      dispatches,
      billingResponses,
      financialTransactions,
      statusHistory,
      referralsReceived,
      referralsUpdated,
    ] = await this.prisma.$transaction([
      this.prisma.renewal.count({ where: { clientReferenceId } }),
      this.prisma.renewalReversal.count({ where: { clientReferenceId } }),
      this.prisma.clientReferenceReactivation.count({ where: { clientReferenceId } }),
      this.prisma.receivable.count({ where: { clientReferenceId } }),
      this.prisma.paymentIntent.count({ where: { receivableId: { in: receivableIds } } }),
      this.prisma.paymentWebhookEvent.count({
        where: { paymentIntentId: { in: paymentIntentIds } },
      }),
      this.prisma.paymentGroupItem.count({ where: { receivableId: { in: receivableIds } } }),
      this.prisma.messageDispatchItem.count({
        where: { OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }] },
      }),
      this.prisma.recoveryCampaign.count({ where: { clientReferenceId } }),
      this.prisma.recoveryCampaignStep.count({
        where: { campaign: { clientReferenceId } },
      }),
      this.prisma.messageDispatch.count({
        where: { OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }] },
      }),
      this.prisma.billingResponse.count({ where: { clientReferenceId } }),
      this.prisma.financialTransaction.count({
        where: { OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }] },
      }),
      this.prisma.clientStatusHistory.count({ where: { clientReferenceId } }),
      this.prisma.referral.count({ where: { referredClientReferenceId: clientReferenceId } }),
      this.prisma.referral.count({ where: { rewardClientReferenceId: clientReferenceId } }),
    ]);

    return {
      total:
        1 +
        renewals +
        renewalReversals +
        reactivations +
        receivables +
        paymentIntents +
        paymentWebhookEvents +
        paymentGroupItems +
        messageDispatchItems +
        campaigns +
        campaignSteps +
        dispatches +
        billingResponses +
        financialTransactions +
        statusHistory +
        referralsReceived +
        referralsUpdated,
      clientReferences: 1,
      renewals,
      renewalReversals,
      reactivations,
      receivables,
      paymentIntents,
      paymentWebhookEvents,
      paymentGroupItems,
      messageDispatchItems,
      recoveryCampaigns: campaigns,
      recoveryCampaignSteps: campaignSteps,
      messageDispatches: dispatches,
      billingResponses,
      financialTransactions,
      statusHistory,
      referralsReceived,
      referralsUpdated,
    };
  }

  private async countClientRemovalTargets(clientId: string) {
    const clientReferenceIds = await this.findReferenceIdsByClient(clientId);
    const receivableIds = await this.findReceivableIdsByClient(clientId);
    const paymentGroupIds = await this.findPaymentGroupIdsByClient(clientId);
    const paymentIntentIds = await this.findPaymentIntentIdsByReceivablesOrGroups(
      receivableIds,
      paymentGroupIds,
    );
    const campaignIds = await this.findRecoveryCampaignIdsByClient(clientId);
    const [
      references,
      renewals,
      renewalReversals,
      reactivations,
      receivables,
      paymentIntents,
      paymentWebhookEvents,
      paymentGroups,
      paymentGroupItems,
      messageDispatchItems,
      campaigns,
      campaignSteps,
      dispatches,
      billingResponses,
      financialTransactions,
      statusHistory,
      events,
      referralsReceived,
      referralsMade,
      referralsUpdated,
      whatsappPendingContacts,
      whatsappInboundMessages,
    ] = await this.prisma.$transaction([
      this.prisma.clientReference.count({ where: { clientId } }),
      this.prisma.renewal.count({ where: { clientId } }),
      this.prisma.renewalReversal.count({ where: { clientId } }),
      this.prisma.clientReferenceReactivation.count({ where: { clientId } }),
      this.prisma.receivable.count({ where: { clientId } }),
      this.prisma.paymentIntent.count({
        where: {
          OR: [
            { receivableId: { in: receivableIds } },
            { paymentGroupId: { in: paymentGroupIds } },
          ],
        },
      }),
      this.prisma.paymentWebhookEvent.count({
        where: { paymentIntentId: { in: paymentIntentIds } },
      }),
      this.prisma.paymentGroup.count({ where: { clientId } }),
      this.prisma.paymentGroupItem.count({ where: { receivableId: { in: receivableIds } } }),
      this.prisma.messageDispatchItem.count({
        where: {
          OR: [
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
          ],
        },
      }),
      this.prisma.recoveryCampaign.count({ where: { clientId } }),
      this.prisma.recoveryCampaignStep.count({
        where: { campaign: { clientId } },
      }),
      this.prisma.messageDispatch.count({
        where: {
          OR: [
            { clientId },
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
            { recoveryCampaignId: { in: campaignIds } },
          ],
        },
      }),
      this.prisma.billingResponse.count({ where: { clientId } }),
      this.prisma.financialTransaction.count({
        where: {
          OR: [
            { clientId },
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
          ],
        },
      }),
      this.prisma.clientStatusHistory.count({ where: { clientId } }),
      this.prisma.clientEvent.count({ where: { clientId } }),
      this.prisma.referral.count({ where: { referredClientId: clientId } }),
      this.prisma.referral.count({ where: { referrerClientId: clientId } }),
      this.prisma.referral.count({
        where: {
          rewardClientReferenceId: { in: clientReferenceIds },
          NOT: { OR: [{ referredClientId: clientId }, { referrerClientId: clientId }] },
        },
      }),
      this.prisma.whatsAppPendingContact.count({ where: { clientId } }),
      this.prisma.whatsAppInboundMessage.count({ where: { clientId } }),
    ]);

    return {
      total:
        1 +
        references +
        renewals +
        renewalReversals +
        reactivations +
        receivables +
        paymentIntents +
        paymentWebhookEvents +
        paymentGroups +
        paymentGroupItems +
        messageDispatchItems +
        campaigns +
        campaignSteps +
        dispatches +
        billingResponses +
        financialTransactions +
        statusHistory +
        events +
        referralsReceived +
        referralsMade +
        referralsUpdated +
        whatsappPendingContacts +
        whatsappInboundMessages,
      clients: 1,
      clientReferences: references,
      renewals,
      renewalReversals,
      reactivations,
      receivables,
      paymentIntents,
      paymentWebhookEvents,
      paymentGroups,
      paymentGroupItems,
      messageDispatchItems,
      recoveryCampaigns: campaigns,
      recoveryCampaignSteps: campaignSteps,
      messageDispatches: dispatches,
      billingResponses,
      financialTransactions,
      statusHistory,
      clientEvents: events,
      referralsReceived,
      referralsMade,
      referralsUpdated,
      whatsappPendingContacts,
      whatsappInboundMessages,
    };
  }

  private async deleteReferenceTree(clientReferenceId: string) {
    const counts = await this.countReferenceRemovalTargets(clientReferenceId);
    const receivableIds = await this.findReceivableIdsByReference(clientReferenceId);
    const paymentIntentIds = await this.findPaymentIntentIdsByReceivables(receivableIds);
    const renewalIds = await this.findRenewalIdsByReference(clientReferenceId);

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.deleteMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
      });
      await tx.billingResponse.deleteMany({ where: { clientReferenceId } });
      await tx.messageDispatchItem.deleteMany({
        where: { OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }] },
      });
      await tx.messageDispatch.deleteMany({
        where: {
          OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }],
        },
      });
      await tx.recoveryCampaign.deleteMany({ where: { clientReferenceId } });
      await tx.financialTransaction.deleteMany({
        where: {
          OR: [{ clientReferenceId }, { receivableId: { in: receivableIds } }],
        },
      });
      await tx.paymentGroupItem.deleteMany({ where: { receivableId: { in: receivableIds } } });
      await tx.paymentIntent.deleteMany({ where: { receivableId: { in: receivableIds } } });
      await tx.renewalReversal.deleteMany({
        where: { OR: [{ clientReferenceId }, { renewalId: { in: renewalIds } }] },
      });
      await tx.clientReferenceReactivation.deleteMany({ where: { clientReferenceId } });
      await tx.receivable.deleteMany({ where: { clientReferenceId } });
      await tx.renewal.deleteMany({ where: { clientReferenceId } });
      await tx.clientStatusHistory.deleteMany({ where: { clientReferenceId } });
      await tx.referral.updateMany({
        where: { rewardClientReferenceId: clientReferenceId },
        data: { rewardClientReferenceId: null },
      });
      await tx.clientReference.delete({ where: { id: clientReferenceId } });
    });

    return counts;
  }

  private async deleteClientTree(clientId: string) {
    const counts = await this.countClientRemovalTargets(clientId);
    const clientReferenceIds = await this.findReferenceIdsByClient(clientId);
    const receivableIds = await this.findReceivableIdsByClient(clientId);
    const paymentGroupIds = await this.findPaymentGroupIdsByClient(clientId);
    const paymentIntentIds = await this.findPaymentIntentIdsByReceivablesOrGroups(
      receivableIds,
      paymentGroupIds,
    );
    const campaignIds = await this.findRecoveryCampaignIdsByClient(clientId);
    const renewalIds = await this.findRenewalIdsByClient(clientId);

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.deleteMany({
        where: { paymentIntentId: { in: paymentIntentIds } },
      });
      await tx.billingResponse.deleteMany({ where: { clientId } });
      await tx.referral.updateMany({
        where: { rewardClientReferenceId: { in: clientReferenceIds } },
        data: { rewardClientReferenceId: null },
      });
      await tx.whatsAppInboundMessage.deleteMany({ where: { clientId } });
      await tx.whatsAppPendingContact.deleteMany({ where: { clientId } });
      await tx.messageDispatchItem.deleteMany({
        where: {
          OR: [
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
          ],
        },
      });
      await tx.messageDispatch.deleteMany({
        where: {
          OR: [
            { clientId },
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
            { recoveryCampaignId: { in: campaignIds } },
          ],
        },
      });
      await tx.recoveryCampaign.deleteMany({ where: { clientId } });
      await tx.financialTransaction.deleteMany({
        where: {
          OR: [
            { clientId },
            { clientReferenceId: { in: clientReferenceIds } },
            { receivableId: { in: receivableIds } },
            { paymentGroupId: { in: paymentGroupIds } },
          ],
        },
      });
      await tx.paymentGroupItem.deleteMany({ where: { receivableId: { in: receivableIds } } });
      await tx.paymentIntent.deleteMany({
        where: {
          OR: [
            { receivableId: { in: receivableIds } },
            { paymentGroupId: { in: paymentGroupIds } },
          ],
        },
      });
      await tx.paymentGroup.deleteMany({ where: { clientId } });
      await tx.renewalReversal.deleteMany({
        where: { OR: [{ clientId }, { renewalId: { in: renewalIds } }] },
      });
      await tx.clientReferenceReactivation.deleteMany({ where: { clientId } });
      await tx.receivable.deleteMany({ where: { clientId } });
      await tx.renewal.deleteMany({ where: { clientId } });
      await tx.clientStatusHistory.deleteMany({ where: { clientId } });
      await tx.clientEvent.deleteMany({ where: { clientId } });
      await tx.clientReference.deleteMany({ where: { clientId } });
      await tx.client.delete({ where: { id: clientId } });
    });

    return counts;
  }

  private async findReferenceIdsByClient(clientId: string) {
    const references = await this.prisma.clientReference.findMany({
      where: { clientId },
      select: { id: true },
    });

    return references.map((reference) => reference.id);
  }

  private async findReceivableIdsByClient(clientId: string) {
    const receivables = await this.prisma.receivable.findMany({
      where: { clientId },
      select: { id: true },
    });

    return receivables.map((receivable) => receivable.id);
  }

  private async findReceivableIdsByReference(clientReferenceId: string) {
    const receivables = await this.prisma.receivable.findMany({
      where: { clientReferenceId },
      select: { id: true },
    });

    return receivables.map((receivable) => receivable.id);
  }

  private async findPaymentIntentIdsByReceivables(receivableIds: string[]) {
    if (!receivableIds.length) {
      return [];
    }

    const intents = await this.prisma.paymentIntent.findMany({
      where: { receivableId: { in: receivableIds } },
      select: { id: true },
    });

    return intents.map((intent) => intent.id);
  }

  private async findPaymentIntentIdsByReceivablesOrGroups(
    receivableIds: string[],
    paymentGroupIds: string[],
  ) {
    if (!receivableIds.length && !paymentGroupIds.length) {
      return [];
    }

    const intents = await this.prisma.paymentIntent.findMany({
      where: {
        OR: [{ receivableId: { in: receivableIds } }, { paymentGroupId: { in: paymentGroupIds } }],
      },
      select: { id: true },
    });

    return intents.map((intent) => intent.id);
  }

  private async findPaymentGroupIdsByClient(clientId: string) {
    const groups = await this.prisma.paymentGroup.findMany({
      where: { clientId },
      select: { id: true },
    });

    return groups.map((group) => group.id);
  }

  private async findRenewalIdsByClient(clientId: string) {
    const renewals = await this.prisma.renewal.findMany({
      where: { clientId },
      select: { id: true },
    });

    return renewals.map((renewal) => renewal.id);
  }

  private async findRenewalIdsByReference(clientReferenceId: string) {
    const renewals = await this.prisma.renewal.findMany({
      where: { clientReferenceId },
      select: { id: true },
    });

    return renewals.map((renewal) => renewal.id);
  }

  private async findRecoveryCampaignIdsByClient(clientId: string) {
    const campaigns = await this.prisma.recoveryCampaign.findMany({
      where: { clientId },
      select: { id: true },
    });

    return campaigns.map((campaign) => campaign.id);
  }

  private async cancelFutureReferenceBillingDispatches(
    tx: Prisma.TransactionClient,
    clientReferenceId: string,
    errorCode: string,
    errorMessage: string,
  ) {
    await tx.messageDispatch.updateMany({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [{ clientReferenceId }, { items: { some: { clientReferenceId } } }],
      },
      data: {
        status: 'CANCELED',
        errorCode,
        errorMessage,
        nextAttemptAt: null,
      },
    });
  }

  private requiresReason(status: ClientStatus) {
    return status === 'INATIVO' || status === 'CANCELADO';
  }

  private ensureDeleteConfirmed(dto: DeleteClientConfirmationDto) {
    if (dto.confirmation !== 'REMOVER') {
      throw new BadRequestException('Confirmacao invalida para remocao destrutiva.');
    }
  }

  private async runDestructiveRemoval<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(
          'Nao foi possivel remover porque ainda existem vinculos relacionados nao tratados.',
        );
      }

      throw error;
    }
  }

  private rejectLegacyOperationalClientFields(dto: UpdateClientDto) {
    const receivedLegacyFields = legacyOperationalClientFields.filter((field) => field in dto);

    if (receivedLegacyFields.length > 0) {
      throw new BadRequestException(
        `Atualize campos operacionais pela referencia do cliente: ${receivedLegacyFields.join(', ')}.`,
      );
    }
  }

  private optionalTrim(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private internationalPhoneEnabled() {
    return this.configService?.get<string>('PHONE_INTERNATIONAL_ENABLED') === 'true';
  }

  private internationalClientWriteEnabled() {
    return this.configService?.get<string>('PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED') === 'true';
  }

  private internationalPhoneInputEnabled() {
    return this.internationalPhoneEnabled() || this.internationalClientWriteEnabled();
  }

  private prepareClientPhone(phone: string, phoneCountry?: string) {
    const trimmed = phone.trim();

    if (!this.internationalPhoneInputEnabled()) {
      if (phoneCountry !== undefined) {
        throw new BadRequestException('O cadastro internacional de telefone esta desabilitado.');
      }

      if (trimmed.startsWith('+')) {
        const explicit = normalizePhone(trimmed);
        if (explicit.status === 'valid' && explicit.country !== 'BR') {
          throw new BadRequestException('O cadastro internacional de telefone esta desabilitado.');
        }
      }

      return { phoneNormalized: normalizeBrazilPhone(phone), phoneE164: null };
    }

    const normalized = normalizePhone(
      phone,
      phoneCountry ? { defaultCountry: phoneCountry as CountryCode } : {},
    );
    if (normalized.status !== 'valid') {
      const message =
        normalized.status === 'ambiguous'
          ? 'Selecione o pais do telefone.'
          : 'Telefone invalido para o pais selecionado.';
      throw new BadRequestException(message);
    }

    if (phoneCountry && normalized.country !== phoneCountry) {
      throw new BadRequestException('O DDI informado nao corresponde ao pais selecionado.');
    }

    if (normalized.country !== 'BR' && !this.internationalClientWriteEnabled()) {
      throw new ConflictException(
        'Telefone internacional validado, mas o cadastro internacional esta desabilitado.',
      );
    }

    return {
      phoneNormalized:
        normalized.country === 'BR' ? normalizeBrazilPhone(normalized.e164) : normalized.digits,
      phoneE164: normalized.e164,
    };
  }

  private tryNormalizeCanonicalPhone(value: string) {
    if (!this.internationalPhoneInputEnabled()) return null;
    const normalized = normalizePhone(value);
    return normalized.status === 'valid' ? normalized.e164 : null;
  }

  private resolvePreferredPixProvider(provider?: PaymentProviderCode | null) {
    if (!provider) return null;

    if (!isClientPreferredPixProvider(provider)) {
      throw new BadRequestException(
        `Provider PIX nao permitido para preferencia do cliente: ${paymentProviderDisplayName(
          provider,
        )}.`,
      );
    }

    return provider;
  }

  private tryNormalizePhone(value: string) {
    if (this.internationalPhoneInputEnabled() && value.trim().startsWith('+')) {
      const normalized = normalizePhone(value);
      if (normalized.status === 'valid' && normalized.country !== 'BR') return null;
    }

    try {
      return normalizeBrazilPhone(value);
    } catch {
      return null;
    }
  }

  private referenceSummary(references: Array<{ reference: string }>) {
    if (references.length === 0) return '';
    return references.map((reference) => reference.reference).join(', ');
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = this.uniqueConstraintTarget(error);

      if (this.targetIncludes(target, 'reference')) {
        throw new ConflictException('Ja existe um cliente com esta referencia.');
      }

      if (this.targetIncludes(target, 'phoneNormalized')) {
        throw new ConflictException('Ja existe um cliente cadastrado com este telefone.');
      }

      if (this.targetIncludesAll(target, ['clientReferenceId', 'purpose', 'dueDate'])) {
        throw new ConflictException(
          'Ja existe uma conta a receber para esta referencia neste vencimento.',
        );
      }

      throw new ConflictException('Registro duplicado.');
    }

    throw error;
  }

  private uniqueConstraintTarget(error: Prisma.PrismaClientKnownRequestError) {
    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.map((field) => String(field));
    }

    if (typeof target === 'string') {
      return [target];
    }

    return [];
  }

  private targetIncludes(target: string[], field: string) {
    return target.some((item) => item === field || item.includes(field));
  }

  private targetIncludesAll(target: string[], fields: string[]) {
    return fields.every((field) => this.targetIncludes(target, field));
  }
}
