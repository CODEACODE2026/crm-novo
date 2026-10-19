import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  Prisma,
  type Referral,
  type ReferralHistoryAction,
  type ReferralOrigin,
  ReferralRewardType,
} from '@prisma/client';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { ApplyReferralRewardDto } from './dto/apply-referral-reward.dto';
import { CancelReferralDto } from './dto/cancel-referral.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { ListReferralsDto } from './dto/list-referrals.dto';
import { UpdateReferralDto } from './dto/update-referral.dto';
import {
  inspectReferralQualificationEvidence,
  lockReferralInitialActivationEvidence,
} from './referral-qualification';

type ReferralTx = Prisma.TransactionClient | PrismaService;

type ReferralWithClients = Prisma.ReferralGetPayload<{
  include: {
    referredClient: { include: { references: true } };
    referrerClient: { include: { references: true } };
    rewardClientReference: true;
  };
}>;

type ReferralWithHistory = Prisma.ReferralGetPayload<{
  include: {
    referredClient: { include: { references: true } };
    referrerClient: { include: { references: true } };
    rewardClientReference: true;
    history: { include: { actor: { select: { id: true; name: true } } } };
  };
}>;

export type CreateReferralInput = {
  referredClientId: string;
  referrerClientId?: string | null | undefined;
  rewardType?: ReferralRewardType | undefined;
  rewardValue?: number | Prisma.Decimal | null | undefined;
  rewardDescription?: string | null | undefined;
  origin?: ReferralOrigin | undefined;
  actorUserId?: string | null | undefined;
};

const pageSizeLimit = 100;

@Injectable()
export class ReferralsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(ReceivableCycleService)
    private readonly receivableCycleService?: ReceivableCycleService,
  ) {}

  async list(query: ListReferralsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.referral.findMany({
        where,
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      items: items.map((referral) => this.presentReferral(referral)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async summary(query: ListReferralsDto = {}) {
    const baseWhere = this.buildWhere(query, { includeStatus: false });

    const [total, pending, qualified, rewarded, canceled, awaitingReward] =
      await this.prisma.$transaction([
        this.prisma.referral.count({ where: baseWhere }),
        this.prisma.referral.count({ where: { AND: [baseWhere, { status: 'PENDING' }] } }),
        this.prisma.referral.count({ where: { AND: [baseWhere, { status: 'QUALIFIED' }] } }),
        this.prisma.referral.count({ where: { AND: [baseWhere, { status: 'REWARDED' }] } }),
        this.prisma.referral.count({ where: { AND: [baseWhere, { status: 'CANCELED' }] } }),
        this.prisma.referral.count({
          where: { AND: [baseWhere, { status: 'QUALIFIED', appliedAt: null }] },
        }),
      ]);

    return { total, pending, qualified, rewarded, canceled, awaitingReward };
  }

  async get(id: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
        history: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });

    if (!referral) {
      throw new NotFoundException('Indicacao nao encontrada.');
    }

    return this.presentReferral(referral);
  }

  async createManual(dto: CreateReferralDto, actorUserId: string) {
    const referralId = await this.prisma.$transaction(async (tx) => {
      await lockReferralInitialActivationEvidence(tx, dto.referredClientId);

      const created = await this.createPending(tx, {
        referredClientId: dto.referredClientId,
        referrerClientId: dto.referrerClientId,
        rewardType: dto.rewardType,
        rewardValue: dto.rewardValue,
        rewardDescription: dto.rewardDescription,
        origin: 'MANUAL',
        actorUserId,
      });

      if (!created) {
        throw new BadRequestException('Cliente indicador obrigatorio para indicacao manual.');
      }

      const evidence = await inspectReferralQualificationEvidence(
        tx,
        created.status,
        created.referredClientId,
      );

      if (evidence.eligible && evidence.receivable) {
        await this.qualifyAfterInitialActivation(
          tx,
          created.referredClientId,
          evidence.receivable.id,
          actorUserId,
        );
      }

      return created.id;
    });

    return this.get(referralId);
  }

  async update(id: string, dto: UpdateReferralDto, actorUserId: string) {
    const referral = await this.prisma.$transaction(async (tx) => {
      const current = await tx.referral.findUnique({
        where: { id },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });

      if (!current) throw new NotFoundException('Indicacao nao encontrada.');
      if (current.status !== 'PENDING') {
        throw new ConflictException('Apenas indicacoes pendentes podem ser editadas.');
      }
      if (current.referredClientId === dto.referrerClientId) {
        throw new BadRequestException('Cliente nao pode indicar a si mesmo.');
      }

      this.validateRewardInput(dto.rewardType, dto.rewardValue, dto.rewardDescription);
      const referrer = await tx.client.findUnique({ where: { id: dto.referrerClientId } });
      if (!referrer) throw new NotFoundException('Cliente indicador nao encontrado.');

      const updated = await tx.referral.updateMany({
        where: {
          id,
          status: 'PENDING',
          updatedAt: new Date(dto.expectedUpdatedAt),
        },
        data: {
          referrerClientId: dto.referrerClientId,
          rewardType: dto.rewardType,
          rewardValue: dto.rewardType === 'CREDIT' ? (dto.rewardValue ?? null) : null,
          rewardDescription: this.optionalTrim(dto.rewardDescription),
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Indicacao alterada por outro processo. Atualize os dados e tente novamente.',
        );
      }

      const next = await tx.referral.findUnique({
        where: { id },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });
      if (!next) throw new NotFoundException('Indicacao nao encontrada.');

      await this.recordHistory(tx, {
        referralId: id,
        action: 'UPDATED',
        actorUserId,
        before: current,
        after: next,
      });

      return next;
    });

    return this.presentReferral(referral);
  }

  async createPending(tx: ReferralTx, input: CreateReferralInput) {
    if (!input.referrerClientId) {
      return null;
    }

    this.validateRewardInput(
      input.rewardType ?? 'FREE_MONTH',
      input.rewardValue,
      input.rewardDescription,
    );

    if (input.referredClientId === input.referrerClientId) {
      throw new BadRequestException('Cliente nao pode indicar a si mesmo.');
    }

    const [referredClient, referrerClient] = await Promise.all([
      tx.client.findUnique({ where: { id: input.referredClientId } }),
      tx.client.findUnique({ where: { id: input.referrerClientId } }),
    ]);

    if (!referredClient) {
      throw new NotFoundException('Cliente indicado nao encontrado.');
    }

    if (!referrerClient) {
      throw new NotFoundException('Cliente indicador nao encontrado.');
    }

    try {
      const referral = await tx.referral.create({
        data: {
          referredClientId: input.referredClientId,
          referrerClientId: input.referrerClientId,
          rewardType: input.rewardType ?? 'FREE_MONTH',
          rewardValue: input.rewardValue ?? null,
          rewardDescription: this.optionalTrim(input.rewardDescription),
          origin: input.origin ?? 'AUTOMATIC',
          createdByUserId: input.actorUserId ?? null,
        },
      });

      await this.recordHistory(tx, {
        referralId: referral.id,
        action: 'CREATED',
        actorUserId: input.actorUserId ?? null,
        after: referral,
      });

      await tx.clientEvent.createMany({
        data: [
          {
            clientId: referredClient.id,
            type: 'REFERRAL_CREATED',
            title: `Cliente cadastrado por indicacao de ${referrerClient.name}.`,
            metadata: { referralId: referral.id, referrerClientId: referrerClient.id },
            createdByUserId: input.actorUserId ?? null,
          },
          {
            clientId: referrerClient.id,
            type: 'REFERRAL_CREATED',
            title: `${referredClient.name} cadastrado como sua indicacao.`,
            metadata: { referralId: referral.id, referredClientId: referredClient.id },
            createdByUserId: input.actorUserId ?? null,
          },
        ],
      });

      return referral;
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Cliente indicado ja possui indicacao principal.');
      }

      throw error;
    }
  }

  async qualifyAfterInitialActivation(
    tx: Prisma.TransactionClient,
    referredClientId: string,
    receivableId: string,
    actorUserId: string | null,
  ) {
    const referral = await tx.referral.findUnique({
      where: { referredClientId },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
      },
    });

    if (!referral || referral.status !== 'PENDING') {
      return null;
    }

    const qualifiedAt = new Date();
    const updated = await tx.referral.updateMany({
      where: { id: referral.id, status: 'PENDING' },
      data: { status: 'QUALIFIED', qualifiedAt, qualificationReceivableId: receivableId },
    });

    if (updated.count !== 1) {
      return null;
    }

    await tx.clientEvent.createMany({
      data: [
        {
          clientId: referral.referredClientId,
          type: 'REFERRAL_QUALIFIED',
          title: 'Indicacao qualificada pelo primeiro pagamento.',
          metadata: { referralId: referral.id, receivableId },
          createdByUserId: actorUserId,
        },
        {
          clientId: referral.referrerClientId,
          type: 'REFERRAL_QUALIFIED',
          title: `Indicacao de ${referral.referredClient.name} qualificada.`,
          metadata: { referralId: referral.id, referredClientId, receivableId },
          createdByUserId: actorUserId,
        },
      ],
    });

    const qualified = await tx.referral.findUnique({ where: { id: referral.id } });
    if (qualified) {
      await this.recordHistory(tx, {
        referralId: referral.id,
        action: 'QUALIFIED',
        actorUserId,
        before: referral,
        after: qualified,
      });
    }

    return qualified;
  }

  async cancelPendingForClientBeforePayment(
    tx: Prisma.TransactionClient,
    referredClientId: string,
    reason: string | null,
    actorUserId: string | null,
  ) {
    const referral = await tx.referral.findUnique({
      where: { referredClientId },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
      },
    });

    if (!referral || referral.status !== 'PENDING') {
      return null;
    }

    const canceledAt = new Date();
    const cancellationReason = reason || 'Cliente indicado cancelado antes do primeiro pagamento.';
    const updated = await tx.referral.updateMany({
      where: { id: referral.id, status: 'PENDING' },
      data: {
        status: 'CANCELED',
        canceledAt,
        canceledByUserId: actorUserId,
        cancellationReason,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    await tx.clientEvent.create({
      data: {
        clientId: referral.referredClientId,
        type: 'REFERRAL_CANCELED',
        title: 'Indicacao cancelada antes do primeiro pagamento.',
        description: cancellationReason,
        metadata: { referralId: referral.id, referrerClientId: referral.referrerClientId },
        createdByUserId: actorUserId,
      },
    });

    const canceled = await tx.referral.findUnique({ where: { id: referral.id } });
    if (canceled) {
      await this.recordHistory(tx, {
        referralId: referral.id,
        action: 'CANCELED',
        actorUserId,
        reason: cancellationReason,
        before: referral,
        after: canceled,
      });
    }

    return canceled;
  }

  async applyReward(id: string, dto: ApplyReferralRewardDto, actorUserId: string) {
    const referral = await this.prisma.$transaction(async (tx) => {
      const current = await tx.referral.findUnique({
        where: { id },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Indicacao nao encontrada.');
      }

      if (current.status !== 'QUALIFIED') {
        throw new ConflictException('Apenas indicacoes qualificadas podem receber beneficio.');
      }

      const rewardDescription = this.resolveRewardDescription(current, dto);
      const rewardValue = this.resolveRewardValue(current, dto);
      const appliedAt = new Date();
      const claimed = await tx.referral.updateMany({
        where: { id, status: 'QUALIFIED' },
        data: { status: 'REWARDED', appliedAt },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Indicacao alterada por outro processo. Atualize os dados e tente novamente.',
        );
      }

      let appliedPreviousDueDate: Date | null = null;
      let appliedNewDueDate: Date | null = null;
      const data: Prisma.ReferralUpdateInput = {
        rewardValue,
        rewardDescription,
      };

      if (current.rewardType === 'FREE_MONTH') {
        if (!dto.clientReferenceId) {
          throw new BadRequestException('Referencia beneficiada obrigatoria para FREE_MONTH.');
        }

        const rewardReference = await tx.clientReference.findFirst({
          where: {
            id: dto.clientReferenceId,
            clientId: current.referrerClientId,
            status: { in: ['ATIVO', 'PENDENTE_PAGAMENTO', 'INATIVO'] },
          },
        });

        if (!rewardReference) {
          throw new NotFoundException('Referencia beneficiada nao encontrada para o indicador.');
        }

        appliedPreviousDueDate = rewardReference.dueDate;
        appliedNewDueDate = addCalendarMonthsPreservingAnchor(
          rewardReference.dueDate,
          1,
          rewardReference.billingAnchorDay,
        );

        const canceledReceivable =
          await this.receivableCycleService?.cancelPendingCurrentCycleReceivable(
            rewardReference.id,
            rewardReference.dueDate,
            'Ciclo bonificado por indicacao FREE_MONTH.',
            tx,
          );

        if (canceledReceivable) {
          await this.cancelFutureBillingDispatchesForReceivable(
            tx,
            canceledReceivable.id,
            'FREE_MONTH_RECEIVABLE_CANCELED',
            'Cobranca futura cancelada porque o ciclo foi bonificado por indicacao FREE_MONTH.',
          );
        }

        await tx.clientReference.update({
          where: { id: rewardReference.id },
          data: {
            dueDate: appliedNewDueDate,
            billingAnchorDay: rewardReference.billingAnchorDay,
          },
        });

        await this.receivableCycleService?.ensureCurrentCycleReceivable(rewardReference.id, tx);

        data.appliedPreviousDueDate = appliedPreviousDueDate;
        data.appliedNewDueDate = appliedNewDueDate;
        data.rewardClientReference = { connect: { id: rewardReference.id } };
      }

      const updated = await tx.referral.update({
        where: { id },
        data,
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: current.referrerClientId,
          type: 'REFERRAL_REWARD_APPLIED',
          title: `Beneficio de indicacao aplicado: ${this.rewardLabel(updated)}.`,
          description:
            current.rewardType === 'FREE_MONTH'
              ? `Vencimento alterado de ${formatBusinessDate(appliedPreviousDueDate!)} para ${formatBusinessDate(appliedNewDueDate!)}.`
              : rewardDescription,
          metadata: {
            referralId: current.id,
            referredClientId: current.referredClientId,
            rewardType: current.rewardType,
            appliedPreviousDueDate: appliedPreviousDueDate
              ? formatBusinessDate(appliedPreviousDueDate)
              : null,
            appliedNewDueDate: appliedNewDueDate ? formatBusinessDate(appliedNewDueDate) : null,
          },
          createdByUserId: actorUserId,
        },
      });

      await this.recordHistory(tx, {
        referralId: current.id,
        action: 'REWARD_APPLIED',
        actorUserId,
        before: current,
        after: updated,
      });

      return updated;
    });

    return this.presentReferral(referral);
  }

  async cancel(id: string, dto: CancelReferralDto, actorUserId: string) {
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('Motivo do cancelamento deve ter ao menos 3 caracteres.');
    }

    const referral = await this.prisma.$transaction(async (tx) => {
      const current = await tx.referral.findUnique({
        where: { id },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });

      if (!current) {
        throw new NotFoundException('Indicacao nao encontrada.');
      }

      if (current.status === 'REWARDED') {
        throw new ConflictException('Indicacao ja recompensada nao pode ser cancelada.');
      }

      if (current.status === 'CANCELED') {
        return current;
      }

      const canceledAt = new Date();
      const claimed = await tx.referral.updateMany({
        where: { id, status: current.status },
        data: {
          status: 'CANCELED',
          canceledAt,
          canceledByUserId: actorUserId,
          cancellationReason: reason,
        },
      });

      if (claimed.count !== 1) {
        throw new ConflictException(
          'Indicacao alterada por outro processo. Atualize os dados e tente novamente.',
        );
      }

      const updated = await tx.referral.findUnique({
        where: { id },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });
      if (!updated) throw new NotFoundException('Indicacao nao encontrada.');

      await tx.clientEvent.create({
        data: {
          clientId: current.referredClientId,
          type: 'REFERRAL_CANCELED',
          title: 'Indicacao cancelada.',
          description: reason,
          metadata: { referralId: current.id, referrerClientId: current.referrerClientId },
          createdByUserId: actorUserId,
        },
      });

      await this.recordHistory(tx, {
        referralId: current.id,
        action: 'CANCELED',
        actorUserId,
        reason,
        before: current,
        after: updated,
      });

      return updated;
    });

    return this.presentReferral(referral);
  }

  private buildWhere(
    query: ListReferralsDto,
    options: { includeStatus?: boolean } = {},
  ): Prisma.ReferralWhereInput {
    const where: Prisma.ReferralWhereInput = {};
    const includeStatus = options.includeStatus ?? true;

    if (includeStatus && query.status) where.status = query.status;
    if (query.referrerClientId) where.referrerClientId = query.referrerClientId;

    const createdRange = this.dateRange(query.startDate, query.endDate);
    if (createdRange) where.createdAt = createdRange;

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { referredClient: { name: { contains: search, mode: 'insensitive' } } },
        {
          referredClient: {
            references: { some: { reference: { contains: search, mode: 'insensitive' } } },
          },
        },
        { referredClient: { phoneNormalized: { contains: search } } },
        { referrerClient: { name: { contains: search, mode: 'insensitive' } } },
        {
          referrerClient: {
            references: { some: { reference: { contains: search, mode: 'insensitive' } } },
          },
        },
        { referrerClient: { phoneNormalized: { contains: search } } },
      ];
    }

    return where;
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

  private presentReferral(referral: ReferralWithClients | ReferralWithHistory) {
    const previewNewDueDate =
      referral.status === 'QUALIFIED' &&
      referral.rewardType === 'FREE_MONTH' &&
      referral.rewardClientReference
        ? addCalendarMonthsPreservingAnchor(
            referral.rewardClientReference.dueDate,
            1,
            referral.rewardClientReference.billingAnchorDay,
          )
        : null;

    const history = 'history' in referral ? referral.history : undefined;

    return {
      ...referral,
      rewardValue: referral.rewardValue?.toString() ?? null,
      qualifiedAt: referral.qualifiedAt?.toISOString() ?? null,
      appliedAt: referral.appliedAt?.toISOString() ?? null,
      canceledAt: referral.canceledAt?.toISOString() ?? null,
      appliedPreviousDueDate: referral.appliedPreviousDueDate
        ? formatBusinessDate(referral.appliedPreviousDueDate)
        : null,
      appliedNewDueDate: referral.appliedNewDueDate
        ? formatBusinessDate(referral.appliedNewDueDate)
        : null,
      createdAt: referral.createdAt.toISOString(),
      updatedAt: referral.updatedAt.toISOString(),
      referredClient: this.presentClientSummary(referral.referredClient),
      referrerClient: this.presentClientSummary(referral.referrerClient),
      rewardLabel: this.rewardLabel(referral),
      ...(history
        ? {
            history: history.map((entry) => ({
              id: entry.id,
              action: entry.action,
              actor: entry.actor,
              reason: entry.reason,
              before: entry.before,
              after: entry.after,
              createdAt: entry.createdAt.toISOString(),
            })),
          }
        : {}),
      rewardPreview:
        referral.status === 'QUALIFIED'
          ? {
              referrerStatus:
                referral.rewardClientReference?.status ??
                this.uniqueReference(referral.referrerClient)?.status ??
                referral.referrerClient.status,
              selectedClientReferenceId: referral.rewardClientReferenceId,
              selectedReference: referral.rewardClientReference?.reference ?? null,
              currentDueDate: referral.rewardClientReference
                ? formatBusinessDate(referral.rewardClientReference.dueDate)
                : null,
              newDueDate: previewNewDueDate ? formatBusinessDate(previewNewDueDate) : null,
              requiresClientReferenceSelection: referral.rewardType === 'FREE_MONTH',
            }
          : null,
    };
  }

  private presentClientSummary(client: ReferralWithClients['referredClient']) {
    const uniqueReference = this.uniqueReference(client);

    return {
      id: client.id,
      name: client.name,
      reference: uniqueReference?.reference ?? `${client.references.length} referencias`,
      phone: client.phone,
      phoneNormalized: client.phoneNormalized,
      status: uniqueReference?.status ?? client.status,
      dueDate: uniqueReference ? formatBusinessDate(uniqueReference.dueDate) : undefined,
      billingAnchorDay: uniqueReference?.billingAnchorDay,
    };
  }

  private uniqueReference(client: ReferralWithClients['referredClient']) {
    return client.references.length === 1 ? client.references[0] : null;
  }

  private validateRewardInput(
    rewardType: ReferralRewardType,
    rewardValue: number | Prisma.Decimal | null | undefined,
    rewardDescription: string | null | undefined,
  ) {
    if (rewardType === 'CUSTOM' && !this.optionalTrim(rewardDescription)) {
      throw new BadRequestException('Descricao do beneficio customizado e obrigatoria.');
    }

    if (rewardType === 'CREDIT' && (rewardValue === undefined || rewardValue === null)) {
      throw new BadRequestException('Valor do credito e obrigatorio.');
    }
  }

  private async recordHistory(
    tx: ReferralTx,
    input: {
      referralId: string;
      action: ReferralHistoryAction;
      actorUserId: string | null;
      reason?: string | null;
      before?: Pick<
        Referral,
        | 'referredClientId'
        | 'referrerClientId'
        | 'status'
        | 'origin'
        | 'rewardType'
        | 'rewardValue'
        | 'rewardDescription'
        | 'qualificationReceivableId'
        | 'rewardClientReferenceId'
        | 'qualifiedAt'
        | 'appliedAt'
        | 'canceledAt'
        | 'cancellationReason'
        | 'appliedPreviousDueDate'
        | 'appliedNewDueDate'
      >;
      after?: Pick<
        Referral,
        | 'referredClientId'
        | 'referrerClientId'
        | 'status'
        | 'origin'
        | 'rewardType'
        | 'rewardValue'
        | 'rewardDescription'
        | 'qualificationReceivableId'
        | 'rewardClientReferenceId'
        | 'qualifiedAt'
        | 'appliedAt'
        | 'canceledAt'
        | 'cancellationReason'
        | 'appliedPreviousDueDate'
        | 'appliedNewDueDate'
      >;
    },
  ) {
    await tx.referralHistory.create({
      data: {
        referralId: input.referralId,
        action: input.action,
        actorUserId: input.actorUserId,
        reason: input.reason ?? null,
        ...(input.before ? { before: this.historySnapshot(input.before) } : {}),
        ...(input.after ? { after: this.historySnapshot(input.after) } : {}),
      },
    });
  }

  private historySnapshot(
    referral: Pick<
      Referral,
      | 'referredClientId'
      | 'referrerClientId'
      | 'status'
      | 'origin'
      | 'rewardType'
      | 'rewardValue'
      | 'rewardDescription'
      | 'qualificationReceivableId'
      | 'rewardClientReferenceId'
      | 'qualifiedAt'
      | 'appliedAt'
      | 'canceledAt'
      | 'cancellationReason'
      | 'appliedPreviousDueDate'
      | 'appliedNewDueDate'
    >,
  ): Prisma.InputJsonObject {
    return {
      referredClientId: referral.referredClientId,
      referrerClientId: referral.referrerClientId,
      status: referral.status,
      origin: referral.origin,
      rewardType: referral.rewardType,
      rewardValue: referral.rewardValue?.toString() ?? null,
      rewardDescription: referral.rewardDescription,
      qualificationReceivableId: referral.qualificationReceivableId,
      rewardClientReferenceId: referral.rewardClientReferenceId,
      qualifiedAt: referral.qualifiedAt?.toISOString() ?? null,
      appliedAt: referral.appliedAt?.toISOString() ?? null,
      canceledAt: referral.canceledAt?.toISOString() ?? null,
      cancellationReason: referral.cancellationReason,
      appliedPreviousDueDate: referral.appliedPreviousDueDate
        ? formatBusinessDate(referral.appliedPreviousDueDate)
        : null,
      appliedNewDueDate: referral.appliedNewDueDate
        ? formatBusinessDate(referral.appliedNewDueDate)
        : null,
    };
  }

  private resolveRewardValue(referral: ReferralWithClients, dto: ApplyReferralRewardDto) {
    if (referral.rewardType !== 'CREDIT') {
      return referral.rewardValue;
    }

    const value = dto.rewardValue ?? referral.rewardValue;

    if (value === null || value === undefined) {
      throw new BadRequestException('Valor do credito e obrigatorio.');
    }

    return value;
  }

  private resolveRewardDescription(referral: ReferralWithClients, dto: ApplyReferralRewardDto) {
    if (referral.rewardType === 'FREE_MONTH') {
      return referral.rewardDescription ?? '1 mes gratis';
    }

    const description = this.optionalTrim(dto.rewardDescription) ?? referral.rewardDescription;

    if (referral.rewardType === 'CUSTOM' && !description) {
      throw new BadRequestException('Descricao do beneficio customizado e obrigatoria.');
    }

    if (referral.rewardType === 'CREDIT') {
      return description ?? 'Credito registrado para integracao financeira futura.';
    }

    return description;
  }

  private rewardLabel(
    referral: Pick<ReferralWithClients, 'rewardType' | 'rewardValue' | 'rewardDescription'>,
  ) {
    if (referral.rewardType === 'FREE_MONTH') return '1 mes gratis';
    if (referral.rewardType === 'CREDIT') {
      return `credito de ${referral.rewardValue?.toString() ?? 'valor pendente'}`;
    }

    return referral.rewardDescription ?? 'beneficio customizado';
  }

  private dateRange(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return null;

    const start = startDate ? parseBusinessDate(startDate) : parseBusinessDate('1970-01-01');
    const end = endDate ? parseBusinessDate(endDate) : parseBusinessDate('2999-12-31');
    return { gte: start, lte: new Date(`${formatBusinessDate(end)}T23:59:59.999Z`) };
  }

  private optionalTrim(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
