import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReferralRewardType } from '@prisma/client';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplyReferralRewardDto } from './dto/apply-referral-reward.dto';
import { CancelReferralDto } from './dto/cancel-referral.dto';
import { ListReferralsDto } from './dto/list-referrals.dto';

type ReferralTx = Prisma.TransactionClient | PrismaService;

type ReferralWithClients = Prisma.ReferralGetPayload<{
  include: {
    referredClient: { include: { references: true } };
    referrerClient: { include: { references: true } };
    rewardClientReference: true;
  };
}>;

export type CreateReferralInput = {
  referredClientId: string;
  referrerClientId?: string | null | undefined;
  rewardType?: ReferralRewardType | undefined;
  rewardValue?: number | Prisma.Decimal | null | undefined;
  rewardDescription?: string | null | undefined;
  actorUserId?: string | null | undefined;
};

const pageSizeLimit = 100;

@Injectable()
export class ReferralsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: ListReferralsDto) {
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.referral.findMany({
        where,
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
        orderBy: [{ createdAt: 'desc' }],
        take: pageSizeLimit,
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      items: items.map((referral) => this.presentReferral(referral)),
      pagination: { page: 1, pageSize: pageSizeLimit, total, totalPages: 1 },
    };
  }

  async summary() {
    const [pending, qualified, rewarded, canceled, awaitingReward] = await this.prisma.$transaction(
      [
        this.prisma.referral.count({ where: { status: 'PENDING' } }),
        this.prisma.referral.count({ where: { status: 'QUALIFIED' } }),
        this.prisma.referral.count({ where: { status: 'REWARDED' } }),
        this.prisma.referral.count({ where: { status: 'CANCELED' } }),
        this.prisma.referral.count({ where: { status: 'QUALIFIED', appliedAt: null } }),
      ],
    );

    return { pending, qualified, rewarded, canceled, awaitingReward };
  }

  async get(id: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
      },
    });

    if (!referral) {
      throw new NotFoundException('Indicacao nao encontrada.');
    }

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
          createdByUserId: input.actorUserId ?? null,
        },
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
      data: { status: 'QUALIFIED', qualifiedAt },
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

    return tx.referral.findUnique({ where: { id: referral.id } });
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
      data: { status: 'CANCELED', canceledAt, cancellationReason },
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

    return tx.referral.findUnique({ where: { id: referral.id } });
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
      let appliedPreviousDueDate: Date | null = null;
      let appliedNewDueDate: Date | null = null;
      const data: Prisma.ReferralUpdateInput = {
        status: 'REWARDED',
        appliedAt: new Date(),
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

        await tx.clientReference.update({
          where: { id: rewardReference.id },
          data: {
            dueDate: appliedNewDueDate,
            billingAnchorDay: rewardReference.billingAnchorDay,
          },
        });

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

      return updated;
    });

    return this.presentReferral(referral);
  }

  async cancel(id: string, dto: CancelReferralDto, actorUserId: string) {
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

      const updated = await tx.referral.update({
        where: { id },
        data: {
          status: 'CANCELED',
          canceledAt: new Date(),
          cancellationReason: dto.reason.trim(),
        },
        include: {
          referredClient: { include: { references: true } },
          referrerClient: { include: { references: true } },
          rewardClientReference: true,
        },
      });

      await tx.clientEvent.create({
        data: {
          clientId: current.referredClientId,
          type: 'REFERRAL_CANCELED',
          title: 'Indicacao cancelada.',
          description: dto.reason.trim(),
          metadata: { referralId: current.id, referrerClientId: current.referrerClientId },
          createdByUserId: actorUserId,
        },
      });

      return updated;
    });

    return this.presentReferral(referral);
  }

  private buildWhere(query: ListReferralsDto): Prisma.ReferralWhereInput {
    const where: Prisma.ReferralWhereInput = {};

    if (query.status) where.status = query.status;
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

  private presentReferral(referral: ReferralWithClients) {
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

    if (rewardType === 'CREDIT' && rewardValue === undefined) {
      throw new BadRequestException('Valor do credito e obrigatorio.');
    }
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
