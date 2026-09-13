import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type Client,
  type ClientReference,
  type MessageDispatch,
  type MessageTemplate,
  type Plan,
  Prisma,
  type RecoveryCampaign,
  type RecoveryCampaignStep,
  type WhatsAppConnection,
} from '@prisma/client';
import { BillingTemplateRenderer } from '../billing/billing-template-renderer';
import { formatBusinessDate } from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { PrismaService } from '../common/prisma/prisma.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp/provider/whatsapp-provider';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { ListRecoveryCampaignsDto } from './dto/list-recovery-campaigns.dto';

const maxAttempts = 3;
const retryDelayMinutes = 15;
const pageSizeLimit = 100;
const recoverySteps = [
  { stepNumber: 1, delayDays: 3, templateType: 'RECOVERY_DAY_3' as const },
  { stepNumber: 2, delayDays: 10, templateType: 'RECOVERY_DAY_10' as const },
  { stepNumber: 3, delayDays: 15, templateType: 'RECOVERY_DAY_15' as const },
  { stepNumber: 4, delayDays: 30, templateType: 'RECOVERY_DAY_30' as const },
];

type Transaction = Prisma.TransactionClient;
type RecoveryClient = Client & { plan: Plan };
type RecoveryReference = ClientReference & { client: Client; plan: Plan };
type RecoveryCampaignWithRelations = RecoveryCampaign & {
  client: RecoveryClient;
  clientReference: ClientReference & { client: Client; plan: Plan };
  steps: Array<
    RecoveryCampaignStep & {
      template: MessageTemplate | null;
      dispatch: MessageDispatch | null;
    }
  >;
};
type RecoveryDispatch = MessageDispatch & {
  client: RecoveryClient | null;
  clientReference: RecoveryReference | null;
  template: MessageTemplate | null;
  whatsAppConnection: WhatsAppConnection | null;
  recoveryCampaign:
    | (RecoveryCampaign & {
        steps: RecoveryCampaignStep[];
      })
    | null;
  recoveryStep: RecoveryCampaignStep | null;
};

@Injectable()
export class RecoveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BillingTemplateRenderer) private readonly renderer: BillingTemplateRenderer,
  ) {}

  async handleClientStatusChange(
    tx: Transaction,
    client: RecoveryClient,
    nextStatus: 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO',
    options: { startRecovery?: boolean; actorUserId?: string; changedAt?: Date } = {},
  ) {
    const changedAt = options.changedAt ?? new Date();

    if (nextStatus === 'INATIVO') {
      if (options.startRecovery) {
        await this.startCampaign(tx, client, changedAt, options.actorUserId);
      } else {
        await this.cancelActiveCampaigns(
          tx,
          client.id,
          'RECOVERY_NOT_REQUESTED',
          'Recuperacao automatica nao solicitada na inativacao.',
          options.actorUserId,
        );
      }
      return;
    }

    if (nextStatus === 'ATIVO') {
      await this.cancelActiveCampaignsAfterReactivation(tx, client.id, options.actorUserId);
      return;
    }

    if (nextStatus === 'CANCELADO') {
      await this.cancelActiveCampaigns(
        tx,
        client.id,
        'CLIENT_CANCELED',
        'Cliente cancelado durante campanha de recuperacao.',
        options.actorUserId,
      );
    }
  }

  async handleClientReferenceStatusChange(
    tx: Transaction,
    reference: RecoveryReference,
    nextStatus: 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO',
    options: { startRecovery?: boolean; actorUserId?: string; changedAt?: Date } = {},
  ) {
    const changedAt = options.changedAt ?? new Date();
    const recoveryClient = this.referenceAsRecoveryClient(reference);

    if (nextStatus === 'INATIVO') {
      if (options.startRecovery) {
        await this.startCampaign(tx, recoveryClient, changedAt, options.actorUserId, reference.id);
      } else {
        await this.cancelActiveReferenceCampaigns(
          tx,
          reference.id,
          'RECOVERY_NOT_REQUESTED',
          'Recuperacao automatica nao solicitada na inativacao da referencia.',
          options.actorUserId,
        );
      }
      return;
    }

    if (nextStatus === 'ATIVO') {
      await this.cancelActiveCampaignsAfterReactivation(
        tx,
        reference.clientId,
        options.actorUserId,
        reference.id,
      );
      return;
    }

    if (nextStatus === 'CANCELADO') {
      await this.cancelActiveReferenceCampaigns(
        tx,
        reference.id,
        'CLIENT_REFERENCE_CANCELED',
        'Referencia cancelada durante campanha de recuperacao.',
        options.actorUserId,
      );
    }
  }

  async reconcile() {
    const campaigns = await this.prisma.recoveryCampaign.findMany({
      where: { status: 'ATIVA' },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
      },
    });

    let kept = 0;
    let created = 0;
    let canceled = 0;
    const completed = 0;

    for (const campaign of campaigns) {
      if (campaign.clientReference.status === 'ATIVO') {
        await this.prisma.$transaction((tx) =>
          this.cancelActiveCampaignsAfterReactivation(
            tx,
            campaign.clientId,
            undefined,
            campaign.clientReferenceId,
          ),
        );
        canceled += 1;
        continue;
      }

      if (campaign.clientReference.status === 'CANCELADO') {
        await this.prisma.$transaction((tx) =>
          this.cancelActiveReferenceCampaigns(
            tx,
            campaign.clientReferenceId,
            'CLIENT_REFERENCE_CANCELED',
            'Referencia cancelada durante campanha de recuperacao.',
            undefined,
          ),
        );
        canceled += 1;
        continue;
      }

      const result = await this.reconcileCampaign(campaign);
      kept += result.kept;
      created += result.created;
      canceled += result.canceled;
    }

    return { kept, created, canceled, completed };
  }

  async processDue(now = new Date(), limit = 20) {
    const candidates = await this.prisma.messageDispatch.findMany({
      where: {
        origin: 'RECOVERY',
        status: { in: ['SCHEDULED', 'FAILED'] },
        attempts: { lt: maxAttempts },
        scheduledFor: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: limit,
    });

    const results = [];

    for (const candidate of candidates) {
      const acquired = await this.acquireDispatch(candidate.id, now);

      if (!acquired) {
        continue;
      }

      results.push(await this.processAcquired(candidate.id, now));
    }

    return { processed: results.length, results };
  }

  async summary() {
    const [active, completed, canceled, scheduled, failed] = await this.prisma.$transaction([
      this.prisma.recoveryCampaign.count({ where: { status: 'ATIVA' } }),
      this.prisma.recoveryCampaign.count({ where: { status: 'CONCLUIDA' } }),
      this.prisma.recoveryCampaign.count({ where: { status: 'CANCELADA' } }),
      this.prisma.messageDispatch.count({ where: { origin: 'RECOVERY', status: 'SCHEDULED' } }),
      this.prisma.messageDispatch.count({ where: { origin: 'RECOVERY', status: 'FAILED' } }),
    ]);

    return { active, completed, canceled, scheduled, failed };
  }

  async listCampaigns(query: ListRecoveryCampaignsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where: Prisma.RecoveryCampaignWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [campaigns, total] = await this.prisma.$transaction([
      this.prisma.recoveryCampaign.findMany({
        where,
        include: {
          client: { include: { plan: true } },
          clientReference: { include: { client: true, plan: true } },
          steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
        },
        orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.recoveryCampaign.count({ where }),
    ]);

    return {
      items: campaigns.map((campaign) => this.presentCampaign(campaign)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.recoveryCampaign.findUnique({
      where: { id },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha de recuperacao nao encontrada.');
    }

    return this.presentCampaign(campaign);
  }

  async cancelCampaign(id: string, reason: string) {
    const campaign = await this.prisma.recoveryCampaign.findUnique({
      where: { id },
      include: { client: { include: { plan: true } } },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha de recuperacao nao encontrada.');
    }

    if (campaign.status !== 'ATIVA') {
      throw new ConflictException('Apenas campanhas ativas podem ser canceladas.');
    }

    await this.prisma.$transaction((tx) =>
      this.cancelCampaignById(tx, campaign.id, reason, 'MANUAL_RECOVERY_CANCEL', undefined),
    );

    return this.getCampaign(id);
  }

  private async startCampaign(
    tx: Transaction,
    client: RecoveryClient,
    startedAt: Date,
    actorUserId?: string,
    clientReferenceId?: string,
  ) {
    if (client.status === 'CANCELADO') {
      return null;
    }

    const existing = await tx.recoveryCampaign.findFirst({
      where: {
        clientId: client.id,
        ...(clientReferenceId ? { clientReferenceId } : {}),
        status: 'ATIVA',
      },
    });

    if (existing) {
      return existing;
    }

    const templates = await this.ensureRecoveryTemplates(tx);
    const connection = await this.findOperationalConnection(tx, null);
    const campaign = await tx.recoveryCampaign.create({
      data: {
        clientId: client.id,
        clientReferenceId: clientReferenceId ?? (await this.findPrimaryReferenceId(tx, client.id)),
        status: 'ATIVA',
        startedAt,
      },
    });

    for (const step of recoverySteps) {
      const template = templates.get(step.templateType);

      if (!template) {
        throw new BadRequestException(`Template ${step.templateType} indisponivel.`);
      }

      const scheduledFor = this.calculateScheduledFor(startedAt, step.delayDays);
      const renderedContent = this.renderForClient(template.content, client);
      const idempotencyKey = this.buildIdempotencyKey(client.id, campaign.id, step.stepNumber);
      const createdStep = await tx.recoveryCampaignStep.create({
        data: {
          campaignId: campaign.id,
          stepNumber: step.stepNumber,
          delayDays: step.delayDays,
          templateId: template.id,
          scheduledFor,
          status: 'SCHEDULED',
        },
      });
      const dispatch = await tx.messageDispatch.create({
        data: {
          clientId: client.id,
          clientReferenceId: clientReferenceId ?? campaign.clientReferenceId,
          recoveryCampaignId: campaign.id,
          templateId: template.id,
          whatsAppConnectionId: connection?.id ?? null,
          phone: normalizeBrazilPhone(client.phoneNormalized),
          body: renderedContent,
          renderedContent,
          origin: 'RECOVERY',
          status: 'SCHEDULED',
          requestId: idempotencyKey,
          idempotencyKey,
          scheduledFor,
          nextAttemptAt: scheduledFor,
        },
      });

      await tx.recoveryCampaignStep.update({
        where: { id: createdStep.id },
        data: { dispatchId: dispatch.id },
      });
    }

    await tx.clientEvent.create({
      data: {
        clientId: client.id,
        type: 'RECOVERY_CAMPAIGN_STARTED',
        title: 'Campanha automatica de recuperacao iniciada.',
        description: 'Etapas agendadas: 3, 10, 15 e 30 dias.',
        metadata: { recoveryCampaignId: campaign.id },
        ...(actorUserId ? { createdByUserId: actorUserId } : {}),
      },
    });

    return campaign;
  }

  private async reconcileCampaign(campaign: RecoveryCampaignWithRelations) {
    let kept = 0;
    let created = 0;
    let canceled = 0;
    const templates = await this.ensureRecoveryTemplates(this.prisma);
    const connection = await this.findOperationalConnection(this.prisma, null);

    for (const expected of recoverySteps) {
      const step = campaign.steps.find((item) => item.stepNumber === expected.stepNumber);
      const template = templates.get(expected.templateType);

      if (!template?.active) {
        canceled += await this.cancelStepAndDispatch(
          this.prisma,
          step,
          'RECOVERY_TEMPLATE_INACTIVE',
          'Template de recuperacao indisponivel.',
        );
        continue;
      }

      if (step?.dispatch) {
        kept += 1;
        continue;
      }

      const scheduledFor =
        step?.scheduledFor ?? this.calculateScheduledFor(campaign.startedAt, expected.delayDays);
      const renderedContent = this.renderForClient(
        template.content,
        this.referenceAsRecoveryClient(campaign.clientReference),
      );
      const idempotencyKey = this.buildIdempotencyKey(
        campaign.clientId,
        campaign.id,
        expected.stepNumber,
      );

      try {
        await this.prisma.$transaction(async (tx) => {
          const ensuredStep =
            step ??
            (await tx.recoveryCampaignStep.create({
              data: {
                campaignId: campaign.id,
                stepNumber: expected.stepNumber,
                delayDays: expected.delayDays,
                templateId: template.id,
                scheduledFor,
                status: 'SCHEDULED',
              },
            }));
          const dispatch = await tx.messageDispatch.create({
            data: {
              clientId: campaign.clientId,
              clientReferenceId: campaign.clientReferenceId,
              recoveryCampaignId: campaign.id,
              templateId: template.id,
              whatsAppConnectionId: connection?.id ?? null,
              phone: normalizeBrazilPhone(campaign.client.phoneNormalized),
              body: renderedContent,
              renderedContent,
              origin: 'RECOVERY',
              status: 'SCHEDULED',
              requestId: idempotencyKey,
              idempotencyKey,
              scheduledFor,
              nextAttemptAt: scheduledFor,
            },
          });
          await tx.recoveryCampaignStep.update({
            where: { id: ensuredStep.id },
            data: { dispatchId: dispatch.id, templateId: template.id, status: 'SCHEDULED' },
          });
        });
        created += 1;
      } catch (error) {
        if (this.isUniqueConstraint(error)) {
          kept += 1;
          continue;
        }
        throw error;
      }
    }

    return { kept, created, canceled };
  }

  private async acquireDispatch(id: string, now: Date) {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        id,
        origin: 'RECOVERY',
        status: { in: ['SCHEDULED', 'FAILED'] },
        attempts: { lt: maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        errorCode: null,
        errorMessage: null,
      },
    });

    return result.count === 1;
  }

  private async processAcquired(id: string, now: Date) {
    const dispatch = await this.prisma.messageDispatch.findUnique({
      where: { id },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        template: true,
        whatsAppConnection: true,
        recoveryCampaign: { include: { steps: true } },
        recoveryStep: true,
      },
    });

    if (!dispatch) {
      return { id, status: 'missing' };
    }

    const ineligible = await this.findIneligibleReason(dispatch);

    if (ineligible) {
      const updated = await this.markIneligible(dispatch, ineligible.code, ineligible.message);
      return this.presentDispatch(updated);
    }

    const connection = await this.findOperationalConnection(
      this.prisma,
      dispatch.whatsAppConnectionId,
    );

    if (!connection) {
      return this.markRetry(
        dispatch,
        'WHATSAPP_CONNECTION_UNAVAILABLE',
        'Conexao WhatsApp indisponivel.',
        now,
      );
    }

    const body = dispatch.renderedContent ?? dispatch.body;
    const requestId = dispatch.idempotencyKey ?? dispatch.requestId;

    try {
      const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
      const result = await this.provider.sendText(instanceToken, {
        phone: dispatch.phone,
        body,
        requestId,
      });

      const updated = await this.prisma.$transaction(async (tx) => {
        const sent = await tx.messageDispatch.update({
          where: { id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            errorCode: null,
            errorMessage: null,
            nextAttemptAt: null,
            whatsAppConnectionId: connection.id,
          },
          include: {
            client: { include: { plan: true } },
            clientReference: { include: { client: true, plan: true } },
            template: true,
            whatsAppConnection: true,
            recoveryCampaign: { include: { steps: true } },
            recoveryStep: true,
          },
        });

        if (dispatch.recoveryStep) {
          await tx.recoveryCampaignStep.update({
            where: { id: dispatch.recoveryStep.id },
            data: { status: 'SENT', sentAt: new Date() },
          });
        }

        if (dispatch.client && dispatch.recoveryCampaign && dispatch.recoveryStep) {
          await this.ensureSentTimelineEvent(tx, dispatch.client.id, id, {
            campaignId: dispatch.recoveryCampaign.id,
            stepNumber: dispatch.recoveryStep.stepNumber,
            delayDays: dispatch.recoveryStep.delayDays,
          });

          await this.completeIfFinished(tx, dispatch.recoveryCampaign.id);
        }

        return sent;
      });

      return this.presentDispatch(updated);
    } catch (error) {
      return this.markRetry(dispatch, 'PROVIDER_ERROR', this.sanitizeError(error), now);
    }
  }

  private async findIneligibleReason(dispatch: RecoveryDispatch) {
    if (dispatch.origin !== 'RECOVERY' || dispatch.status !== 'PROCESSING') {
      return {
        code: 'DISPATCH_NOT_PROCESSABLE',
        message: 'Recuperacao nao esta disponivel para envio.',
      };
    }

    if (!dispatch.client) {
      return { code: 'CLIENT_MISSING', message: 'Cliente da recuperacao nao encontrado.' };
    }

    const referenceStatus = dispatch.clientReference?.status ?? dispatch.client.status;

    if (referenceStatus === 'ATIVO') {
      await this.prisma.$transaction((tx) =>
        this.cancelActiveCampaignsAfterReactivation(
          tx,
          dispatch.client!.id,
          undefined,
          dispatch.clientReferenceId ?? undefined,
        ),
      );
      return { code: 'CLIENT_REACTIVATED', message: 'Referencia reativada antes do envio.' };
    }

    if (referenceStatus === 'CANCELADO') {
      await this.prisma.$transaction((tx) =>
        dispatch.clientReferenceId
          ? this.cancelActiveReferenceCampaigns(
              tx,
              dispatch.clientReferenceId,
              'CLIENT_REFERENCE_CANCELED',
              'Referencia cancelada durante campanha de recuperacao.',
              undefined,
            )
          : this.cancelActiveCampaigns(
              tx,
              dispatch.client!.id,
              'CLIENT_CANCELED',
              'Cliente cancelado durante campanha de recuperacao.',
              undefined,
            ),
      );
      return { code: 'CLIENT_CANCELED', message: 'Referencia cancelada antes do envio.' };
    }

    if (referenceStatus !== 'INATIVO') {
      return { code: 'CLIENT_NOT_INACTIVE', message: 'Referencia nao esta inativa.' };
    }

    if (!dispatch.recoveryCampaign || dispatch.recoveryCampaign.status !== 'ATIVA') {
      return { code: 'RECOVERY_NOT_ACTIVE', message: 'Campanha de recuperacao nao esta ativa.' };
    }

    if (!dispatch.recoveryStep || dispatch.recoveryStep.status !== 'SCHEDULED') {
      return { code: 'RECOVERY_STEP_NOT_SCHEDULED', message: 'Etapa nao esta agendada.' };
    }

    if (
      !dispatch.template ||
      !this.isRecoveryTemplate(dispatch.template.type) ||
      !dispatch.template.active
    ) {
      return { code: 'TEMPLATE_INACTIVE', message: 'Template de recuperacao indisponivel.' };
    }

    const intent = this.parseIdempotencyKey(dispatch.idempotencyKey ?? dispatch.requestId);

    if (
      !intent ||
      intent.clientId !== dispatch.client.id ||
      intent.campaignId !== dispatch.recoveryCampaign.id ||
      intent.stepNumber !== dispatch.recoveryStep.stepNumber
    ) {
      return {
        code: 'RECOVERY_INTENT_MISMATCH',
        message: 'Intencao de recuperacao nao corresponde aos dados atuais.',
      };
    }

    try {
      normalizeBrazilPhone(dispatch.phone);
    } catch {
      return { code: 'INVALID_PHONE', message: 'Telefone da recuperacao invalido.' };
    }

    return null;
  }

  private async markIneligible(
    dispatch: RecoveryDispatch,
    errorCode: string,
    errorMessage: string,
  ) {
    const status =
      errorCode === 'CLIENT_CANCELED' || errorCode === 'RECOVERY_NOT_ACTIVE'
        ? 'CANCELED'
        : 'IGNORED';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.messageDispatch.update({
        where: { id: dispatch.id },
        data: { status, errorCode, errorMessage, nextAttemptAt: null },
        include: {
          client: { include: { plan: true } },
          clientReference: { include: { client: true, plan: true } },
          template: true,
          whatsAppConnection: true,
          recoveryCampaign: { include: { steps: true } },
          recoveryStep: true,
        },
      });

      if (dispatch.recoveryStep) {
        await tx.recoveryCampaignStep.update({
          where: { id: dispatch.recoveryStep.id },
          data: {
            status: status === 'CANCELED' ? 'CANCELED' : 'IGNORED',
            canceledAt: new Date(),
          },
        });
      }

      return updated;
    });
  }

  private async markRetry(
    dispatch: Pick<MessageDispatch, 'id' | 'attempts'>,
    errorCode: string,
    errorMessage: string,
    now: Date,
  ) {
    const attempts = dispatch.attempts + 1;
    const exhausted = attempts >= maxAttempts;
    const updated = await this.prisma.messageDispatch.update({
      where: { id: dispatch.id },
      data: {
        status: 'FAILED',
        errorCode,
        errorMessage,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + retryDelayMinutes * 60 * 1000),
      },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        template: true,
        whatsAppConnection: true,
        recoveryCampaign: { include: { steps: true } },
        recoveryStep: true,
      },
    });

    if (exhausted && updated.recoveryStep) {
      await this.prisma.recoveryCampaignStep.update({
        where: { id: updated.recoveryStep.id },
        data: { status: 'FAILED' },
      });
    }

    return this.presentDispatch(updated);
  }

  private async cancelActiveCampaignsAfterReactivation(
    tx: Transaction,
    clientId: string,
    actorUserId?: string,
    clientReferenceId?: string,
  ) {
    const campaigns = await tx.recoveryCampaign.findMany({
      where: { clientId, ...(clientReferenceId ? { clientReferenceId } : {}), status: 'ATIVA' },
    });

    for (const campaign of campaigns) {
      await tx.recoveryCampaign.update({
        where: { id: campaign.id },
        data: {
          status: 'CANCELADA',
          canceledAt: new Date(),
          cancelReason: 'Campanha de recuperação encerrada após reativação do cliente.',
        },
      });
      await this.cancelFutureDispatches(
        tx,
        campaign.id,
        'CLIENT_REACTIVATED',
        'Cliente reativado antes da proxima etapa.',
      );
      await tx.clientEvent.create({
        data: {
          clientId,
          type: 'RECOVERY_CAMPAIGN_CANCELED',
          title: 'Campanha de recuperação encerrada após reativação do cliente.',
          metadata: { recoveryCampaignId: campaign.id },
          ...(actorUserId ? { createdByUserId: actorUserId } : {}),
        },
      });
    }
  }

  private async cancelActiveCampaigns(
    tx: Transaction,
    clientId: string,
    errorCode: string,
    reason: string,
    actorUserId?: string,
  ) {
    const campaigns = await tx.recoveryCampaign.findMany({
      where: { clientId, status: 'ATIVA' },
    });

    for (const campaign of campaigns) {
      await this.cancelCampaignById(tx, campaign.id, reason, errorCode, actorUserId);
    }
  }

  private async cancelActiveReferenceCampaigns(
    tx: Transaction,
    clientReferenceId: string,
    errorCode: string,
    reason: string,
    actorUserId?: string,
  ) {
    const campaigns = await tx.recoveryCampaign.findMany({
      where: { clientReferenceId, status: 'ATIVA' },
    });

    for (const campaign of campaigns) {
      await this.cancelCampaignById(tx, campaign.id, reason, errorCode, actorUserId);
    }
  }

  private async findPrimaryReferenceId(tx: Transaction, clientId: string) {
    if (!tx.clientReference) {
      return clientId;
    }

    const reference = await tx.clientReference.findFirst({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
    });

    if (!reference) {
      throw new NotFoundException('Referencia do cliente nao encontrada.');
    }

    return reference.id;
  }

  private referenceAsRecoveryClient(reference: RecoveryReference): RecoveryClient {
    return {
      ...reference.client,
      reference: reference.reference,
      planId: reference.planId,
      recurringValue: reference.recurringValue,
      dueDate: reference.dueDate,
      billingAnchorDay: reference.billingAnchorDay,
      billingNoticeDays: reference.billingNoticeDays,
      status: reference.status,
      plan: reference.plan,
    };
  }

  private async cancelCampaignById(
    tx: Transaction,
    campaignId: string,
    reason: string,
    errorCode: string,
    actorUserId?: string,
  ) {
    const campaign = await tx.recoveryCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'CANCELADA',
        canceledAt: new Date(),
        cancelReason: reason,
      },
    });

    await this.cancelFutureDispatches(tx, campaignId, errorCode, reason);
    await tx.clientEvent.create({
      data: {
        clientId: campaign.clientId,
        type: 'RECOVERY_CAMPAIGN_CANCELED',
        title: 'Campanha de recuperacao cancelada.',
        description: reason,
        metadata: { recoveryCampaignId: campaignId },
        ...(actorUserId ? { createdByUserId: actorUserId } : {}),
      },
    });
  }

  private async cancelFutureDispatches(
    tx: Transaction,
    campaignId: string,
    errorCode: string,
    errorMessage: string,
  ) {
    await tx.messageDispatch.updateMany({
      where: {
        recoveryCampaignId: campaignId,
        origin: 'RECOVERY',
        status: { in: ['SCHEDULED', 'FAILED'] },
      },
      data: {
        status: 'CANCELED',
        errorCode,
        errorMessage,
        nextAttemptAt: null,
      },
    });
    await tx.recoveryCampaignStep.updateMany({
      where: {
        campaignId,
        status: { in: ['SCHEDULED', 'FAILED'] },
      },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });
  }

  private async cancelStepAndDispatch(
    tx: Transaction | PrismaService,
    step: (RecoveryCampaignStep & { dispatch: MessageDispatch | null }) | undefined,
    errorCode: string,
    errorMessage: string,
  ) {
    if (!step) {
      return 0;
    }

    await tx.recoveryCampaignStep.update({
      where: { id: step.id },
      data: { status: 'CANCELED', canceledAt: new Date() },
    });

    if (step.dispatch && ['SCHEDULED', 'FAILED'].includes(step.dispatch.status)) {
      await tx.messageDispatch.update({
        where: { id: step.dispatch.id },
        data: { status: 'CANCELED', errorCode, errorMessage, nextAttemptAt: null },
      });
      return 1;
    }

    return 0;
  }

  private async completeIfFinished(tx: Transaction, campaignId: string) {
    const remaining = await tx.recoveryCampaignStep.count({
      where: {
        campaignId,
        status: { in: ['SCHEDULED', 'FAILED'] },
      },
    });

    if (remaining > 0) {
      return;
    }

    const campaign = await tx.recoveryCampaign.findUnique({ where: { id: campaignId } });

    if (!campaign || campaign.status !== 'ATIVA') {
      return;
    }

    await tx.recoveryCampaign.update({
      where: { id: campaignId },
      data: { status: 'CONCLUIDA', completedAt: new Date() },
    });
  }

  private async ensureSentTimelineEvent(
    tx: Transaction,
    clientId: string,
    dispatchId: string,
    metadata: { campaignId: string; stepNumber: number; delayDays: number },
  ) {
    const existing = await tx.clientEvent.findFirst({
      where: {
        clientId,
        type: 'WHATSAPP_MESSAGE_SENT',
        metadata: { path: ['messageDispatchId'], equals: dispatchId },
      },
    });

    if (existing) {
      return;
    }

    await tx.clientEvent.create({
      data: {
        clientId,
        type: 'WHATSAPP_MESSAGE_SENT',
        title: 'Mensagem automatica de recuperacao enviada.',
        description: `Etapa: ${metadata.delayDays} dias.`,
        metadata: {
          messageDispatchId: dispatchId,
          recoveryCampaignId: metadata.campaignId,
          recoveryStepNumber: metadata.stepNumber,
          recoveryDelayDays: metadata.delayDays,
        },
      },
    });
  }

  private async ensureRecoveryTemplates(tx: Transaction | PrismaService) {
    const defaults = [
      {
        type: 'RECOVERY_DAY_3' as const,
        name: 'Recuperacao 3 dias',
        content:
          'Olá, *{{primeiroNome}}*! Passando para saber se tem interesse em renovar seu serviço de suporte. Se quiser continuar, posso te ajudar com a renovação.',
      },
      {
        type: 'RECOVERY_DAY_10' as const,
        name: 'Recuperacao 10 dias',
        content:
          'Olá, *{{primeiroNome}}*! Seu serviço continua inativo no momento. Caso queira reativar, me chama que posso te ajudar com a renovação.',
      },
      {
        type: 'RECOVERY_DAY_15' as const,
        name: 'Recuperacao 15 dias',
        content:
          'Oi, *{{primeiroNome}}*! Só passando novamente para saber se deseja voltar a utilizar o serviço. Se tiver interesse, posso organizar a renovação para você.',
      },
      {
        type: 'RECOVERY_DAY_30' as const,
        name: 'Recuperacao 30 dias',
        content:
          'Olá, *{{primeiroNome}}*! Este é nosso último lembrete automático sobre a reativação do serviço. Se quiser voltar futuramente, é só entrar em contato.',
      },
    ];
    const templates = new Map<string, MessageTemplate>();

    for (const template of defaults) {
      const saved = await tx.messageTemplate.upsert({
        where: { type_name: { type: template.type, name: template.name } },
        update: {},
        create: { ...template, active: true },
      });
      templates.set(saved.type, saved);
    }

    return templates;
  }

  private async findOperationalConnection(tx: Transaction | PrismaService, id: string | null) {
    return tx.whatsAppConnection.findFirst({
      where: {
        ...(id ? { id } : {}),
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  calculateScheduledFor(base: Date, delayDays: number) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(base);
    const year = Number(parts.find((part) => part.type === 'year')?.value);
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    const day = Number(parts.find((part) => part.type === 'day')?.value);
    const scheduledDate = new Date(Date.UTC(year, month - 1, day + delayDays));
    const yyyyMmDd = formatBusinessDate(scheduledDate);
    const hour = String(this.getSendHour()).padStart(2, '0');

    return new Date(`${yyyyMmDd}T${hour}:00:00-03:00`);
  }

  private renderForClient(template: string, client: RecoveryClient) {
    return this.renderer.render(template, {
      nome: client.name,
      primeiroNome: this.firstName(client.name),
      valor: this.formatCurrency(client.recurringValue),
      vencimento: this.formatDisplayDate(client.dueDate),
      plano: client.plan.name,
      referencia: client.reference,
      pix: '',
    });
  }

  private buildIdempotencyKey(clientId: string, campaignId: string, stepNumber: number) {
    return `recovery:${clientId}:${campaignId}:${stepNumber}`;
  }

  private parseIdempotencyKey(key: string) {
    const parts = key.split(':');

    if (parts.length !== 4 || parts[0] !== 'recovery') {
      return null;
    }

    const stepNumber = Number(parts[3]);

    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return null;
    }

    return { clientId: parts[1], campaignId: parts[2], stepNumber };
  }

  private getSendHour() {
    const configured = Number(this.config.get<string>('RECOVERY_SEND_HOUR') ?? '9');
    return Number.isInteger(configured) && configured >= 0 && configured <= 23 ? configured : 9;
  }

  private isRecoveryTemplate(type: string) {
    return recoverySteps.some((step) => step.templateType === type);
  }

  private firstName(name: string) {
    return name.trim().split(/\s+/)[0] || name.trim();
  }

  private formatDisplayDate(date: Date) {
    const [year, month, day] = formatBusinessDate(date).split('-');
    return `${day}/${month}/${year}`;
  }

  private formatCurrency(value: Prisma.Decimal | number | string) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(value),
    );
  }

  private presentCampaign(campaign: RecoveryCampaignWithRelations) {
    return {
      id: campaign.id,
      clientId: campaign.clientId,
      status: campaign.status,
      startedAt: campaign.startedAt.toISOString(),
      completedAt: campaign.completedAt?.toISOString() ?? null,
      canceledAt: campaign.canceledAt?.toISOString() ?? null,
      cancelReason: campaign.cancelReason,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString(),
      client: {
        id: campaign.client.id,
        name: campaign.client.name,
        reference: campaign.clientReference.reference,
        status: campaign.clientReference.status,
        planName: campaign.clientReference.plan.name,
      },
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
    };
  }

  private presentDispatch(dispatch: RecoveryDispatch) {
    return {
      id: dispatch.id,
      clientId: dispatch.clientId,
      templateId: dispatch.templateId,
      recoveryCampaignId: dispatch.recoveryCampaignId,
      phone: dispatch.phone,
      body: dispatch.body,
      renderedContent: dispatch.renderedContent,
      origin: dispatch.origin,
      status: dispatch.status,
      requestId: dispatch.requestId,
      idempotencyKey: dispatch.idempotencyKey,
      scheduledFor: dispatch.scheduledFor?.toISOString() ?? null,
      nextAttemptAt: dispatch.nextAttemptAt?.toISOString() ?? null,
      attempts: dispatch.attempts,
      providerMessageId: dispatch.providerMessageId,
      errorCode: dispatch.errorCode,
      errorMessage: dispatch.errorMessage,
      sentAt: dispatch.sentAt?.toISOString() ?? null,
    };
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private sanitizeError(error: unknown) {
    const fallback = 'Falha ao enviar recuperacao.';

    if (error instanceof Error && error.message) {
      return error.message
        .replace(/authorization\s*[:=]\s*bearer\s+[^\s,;]+/gi, 'Authorization: [redacted]')
        .replace(/(token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .replace(/([?&](?:token|secret|api[_-]?key)=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, 240);
    }

    return fallback;
  }
}
