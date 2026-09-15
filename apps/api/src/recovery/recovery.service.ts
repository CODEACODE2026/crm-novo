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
  type Receivable,
  type RecoveryAutomationSettings,
  type RecoveryCampaign,
  type RecoveryCampaignStep,
  type WhatsAppConnection,
} from '@prisma/client';
import { BillingTemplateRenderer } from '../billing/billing-template-renderer';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { PrismaService } from '../common/prisma/prisma.service';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp/provider/whatsapp-provider';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { ListRecoveryCampaignsDto } from './dto/list-recovery-campaigns.dto';
import { UpdateRecoveryAutomationSettingsDto } from './dto/update-recovery-automation-settings.dto';

const maxAttempts = 3;
const retryDelayMinutes = 15;
const pageSizeLimit = 100;
const defaultRecoverySendTime = '09:00';
const defaultRecoveryTimezone = 'America/Sao_Paulo';
const defaultRecoverySendIntervalSeconds = 8;
const minRecoverySendIntervalSeconds = 3;
const maxRecoverySendIntervalSeconds = 300;
const recoveryStepTemplates = [
  {
    stepNumber: 1,
    enabledKey: 'day3Enabled',
    offsetKey: 'day3OffsetDays',
    templateType: 'RECOVERY_DAY_3' as const,
  },
  {
    stepNumber: 2,
    enabledKey: 'day10Enabled',
    offsetKey: 'day10OffsetDays',
    templateType: 'RECOVERY_DAY_7' as const,
  },
  {
    stepNumber: 3,
    enabledKey: 'day15Enabled',
    offsetKey: 'day15OffsetDays',
    templateType: 'RECOVERY_DAY_15' as const,
  },
  {
    stepNumber: 4,
    enabledKey: 'day30Enabled',
    offsetKey: 'day30OffsetDays',
    templateType: 'RECOVERY_DAY_30' as const,
  },
] as const;

type Transaction = Prisma.TransactionClient;
type RecoveryClient = Client & { plan: Plan };
type RecoveryReference = ClientReference & { client: Client; plan: Plan };
type RecoveryCampaignWithRelations = RecoveryCampaign & {
  client: RecoveryClient;
  clientReference: ClientReference & { client: Client; plan: Plan };
  receivable: Receivable | null;
  steps: Array<
    RecoveryCampaignStep & {
      template: MessageTemplate | null;
      dispatch: MessageDispatch | null;
    }
  >;
};
type RecoveryStepConfig = {
  stepNumber: number;
  delayDays: number;
  templateType: (typeof recoveryStepTemplates)[number]['templateType'];
};
type RecoveryDispatch = MessageDispatch & {
  client: RecoveryClient | null;
  clientReference: RecoveryReference | null;
  receivable: Receivable | null;
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
    tx: Transaction | PrismaService,
    client: RecoveryClient,
    nextStatus: 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO',
    options: { actorUserId?: string } = {},
  ) {
    if (nextStatus === 'INATIVO') {
      return;
    }

    if (nextStatus === 'ATIVO') {
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
    options: { actorUserId?: string } = {},
  ) {
    if (nextStatus === 'INATIVO') {
      return;
    }

    if (nextStatus === 'ATIVO') {
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
    const today = this.today();
    const overdueReceivables = await this.prisma.receivable.findMany({
      where: {
        status: 'PENDENTE',
        dueDate: { lt: today },
        clientReference: { status: { in: ['ATIVO', 'INATIVO'] } },
      },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const campaigns = await this.prisma.recoveryCampaign.findMany({
      where: { status: 'ATIVA' },
      include: {
        client: { include: { plan: true } },
        clientReference: { include: { client: true, plan: true } },
        receivable: true,
        steps: { include: { template: true, dispatch: true }, orderBy: { stepNumber: 'asc' } },
      },
    });

    let kept = 0;
    let created = 0;
    let canceled = 0;
    let completed = 0;
    const activeReceivableIds = new Set(
      campaigns.map((campaign) => campaign.receivableId).filter(Boolean),
    );

    for (const receivable of overdueReceivables) {
      if (activeReceivableIds.has(receivable.id)) {
        continue;
      }

      const campaign = await this.startCampaignForReceivable(this.prisma, receivable);

      if (campaign) {
        created += 1;
        activeReceivableIds.add(receivable.id);
      }
    }

    for (const campaign of campaigns) {
      if (!campaign.receivable) {
        await this.prisma.$transaction((tx) =>
          this.cancelCampaignById(
            tx,
            campaign.id,
            'Campanha legada sem conta a receber vinculada.',
            'LEGACY_RECOVERY_WITHOUT_RECEIVABLE',
            undefined,
          ),
        );
        canceled += 1;
        continue;
      }

      if (campaign.receivable.status === 'PAGO') {
        await this.prisma.$transaction((tx) =>
          this.closeActiveReceivableCampaigns(
            tx,
            campaign.receivableId!,
            'RECEIVABLE_PAID',
            'Conta a receber paga durante campanha de recuperacao.',
          ),
        );
        completed += 1;
        continue;
      }

      if (campaign.receivable.status !== 'PENDENTE') {
        await this.prisma.$transaction((tx) =>
          this.closeActiveReceivableCampaigns(
            tx,
            campaign.receivableId!,
            'RECEIVABLE_NOT_PENDING',
            'Conta a receber deixou de estar pendente.',
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

  async processDue(now = new Date(), limit = 20, options: { automatic?: boolean } = {}) {
    const settings = await this.getAutomationSettings();

    if (options.automatic && !settings.enabled) {
      return { processed: 0, results: [], skipped: 'RECOVERY_AUTOMATION_DISABLED' };
    }

    const effectiveLimit = options.automatic ? 1 : Math.max(Math.min(limit, 100), 1);
    const candidates = await this.prisma.messageDispatch.findMany({
      where: {
        origin: 'RECOVERY',
        status: { in: ['SCHEDULED', 'FAILED'] },
        attempts: { lt: maxAttempts },
        scheduledFor: { lte: now },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      take: effectiveLimit,
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

  async getSettings() {
    return this.presentSettings(await this.getAutomationSettings());
  }

  async updateSettings(dto: UpdateRecoveryAutomationSettingsDto) {
    const current = await this.getAutomationSettings();
    const nextValues = {
      enabled: dto.enabled ?? current.enabled,
      sendTime: dto.sendTime ?? current.sendTime,
      timezone: dto.timezone ?? current.timezone,
      sendIntervalSeconds: dto.sendIntervalSeconds ?? current.sendIntervalSeconds,
      day3Enabled: dto.day3Enabled ?? current.day3Enabled,
      day3OffsetDays: dto.day3OffsetDays ?? current.day3OffsetDays,
      day10Enabled: dto.day10Enabled ?? current.day10Enabled,
      day10OffsetDays: dto.day10OffsetDays ?? current.day10OffsetDays,
      day15Enabled: dto.day15Enabled ?? current.day15Enabled,
      day15OffsetDays: dto.day15OffsetDays ?? current.day15OffsetDays,
      day30Enabled: dto.day30Enabled ?? current.day30Enabled,
      day30OffsetDays: dto.day30OffsetDays ?? current.day30OffsetDays,
    };

    this.validateSettings(nextValues);

    const next = await this.prisma.recoveryAutomationSettings.update({
      where: { scope: 'global' },
      data: nextValues,
    });

    if (next.enabled) {
      await this.reconcile();
    }

    return this.presentSettings(next);
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
          receivable: true,
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
        receivable: true,
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
    receivableId?: string,
    settings?: RecoveryAutomationSettings,
  ) {
    if (client.status === 'CANCELADO') {
      return null;
    }

    const existing = await tx.recoveryCampaign.findFirst({
      where: {
        ...(receivableId ? { receivableId } : { clientId: client.id }),
        status: 'ATIVA',
      },
    });

    if (existing) {
      return existing;
    }

    const effectiveSettings = settings ?? (await this.getAutomationSettings(tx));
    const stepsConfig = this.buildRecoverySteps(effectiveSettings);

    if (!stepsConfig.length) {
      return null;
    }

    const templates = await this.ensureRecoveryTemplates(tx);
    const connection = await this.findOperationalConnection(tx, null);
    const campaign = await tx.recoveryCampaign.create({
      data: {
        clientId: client.id,
        clientReferenceId: clientReferenceId ?? (await this.findPrimaryReferenceId(tx, client.id)),
        receivableId: receivableId ?? (await this.findPrimaryReceivableId(tx, client.id)),
        status: 'ATIVA',
        startedAt,
      },
    });

    for (const step of stepsConfig) {
      const template = templates.get(step.templateType);

      if (!template) {
        throw new BadRequestException(`Template ${step.templateType} indisponivel.`);
      }

      const scheduledFor = await this.calculateThrottledScheduledFor(
        tx,
        startedAt,
        step.delayDays,
        effectiveSettings,
      );

      if (!template.active) {
        await tx.recoveryCampaignStep.create({
          data: {
            campaignId: campaign.id,
            stepNumber: step.stepNumber,
            delayDays: step.delayDays,
            templateId: template.id,
            scheduledFor,
            status: 'IGNORED',
            canceledAt: new Date(),
          },
        });
        continue;
      }

      const renderedContent = this.renderForClient(template.content, client, step.delayDays);
      const idempotencyKey = this.buildIdempotencyKey(
        client.id,
        campaign.receivableId!,
        campaign.id,
        step.stepNumber,
      );
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
          receivableId: campaign.receivableId!,
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
        description: `Etapas agendadas: ${stepsConfig
          .map((step) => `${step.delayDays} dias`)
          .join(', ')}.`,
        metadata: { recoveryCampaignId: campaign.id },
        ...(actorUserId ? { createdByUserId: actorUserId } : {}),
      },
    });

    return campaign;
  }

  private async startCampaignForReceivable(
    tx: Transaction | PrismaService,
    receivable: Receivable & {
      client: RecoveryClient;
      clientReference: RecoveryReference;
    },
  ) {
    if (receivable.clientReference.status === 'CANCELADO' || receivable.status !== 'PENDENTE') {
      return null;
    }

    return this.startCampaign(
      tx,
      {
        ...this.referenceAsRecoveryClient(receivable.clientReference),
        recurringValue: receivable.amount,
        dueDate: receivable.dueDate,
      },
      receivable.dueDate,
      undefined,
      receivable.clientReferenceId,
      receivable.id,
    );
  }

  private async reconcileCampaign(campaign: RecoveryCampaignWithRelations) {
    let kept = 0;
    let created = 0;
    let canceled = 0;
    const settings = await this.getAutomationSettings(this.prisma);
    const stepsConfig = this.buildRecoverySteps(settings);
    const expectedStepNumbers = new Set(stepsConfig.map((step) => step.stepNumber));
    const templates = await this.ensureRecoveryTemplates(this.prisma);
    const connection = await this.findOperationalConnection(this.prisma, null);

    for (const expected of stepsConfig) {
      const step = campaign.steps.find((item) => item.stepNumber === expected.stepNumber);
      const template = templates.get(expected.templateType);

      if (!template?.active) {
        if (step) {
          canceled += await this.cancelStepAndDispatch(
            this.prisma,
            step,
            'RECOVERY_TEMPLATE_INACTIVE',
            'Template de recuperacao indisponivel.',
            'IGNORED',
          );
        } else {
          const scheduledFor = await this.calculateThrottledScheduledFor(
            this.prisma,
            campaign.startedAt,
            expected.delayDays,
            settings,
          );
          await this.prisma.recoveryCampaignStep.create({
            data: {
              campaignId: campaign.id,
              stepNumber: expected.stepNumber,
              delayDays: expected.delayDays,
              templateId: template?.id ?? null,
              scheduledFor,
              status: 'IGNORED',
              canceledAt: new Date(),
            },
          });
          canceled += 1;
        }
        continue;
      }

      if (step?.dispatch) {
        if (
          ['SCHEDULED', 'FAILED'].includes(step.status) &&
          ['SCHEDULED', 'FAILED'].includes(step.dispatch.status)
        ) {
          const nextScheduledFor = await this.calculateThrottledScheduledFor(
            this.prisma,
            campaign.startedAt,
            expected.delayDays,
            settings,
            step.dispatch.id,
          );

          if (
            step.delayDays !== expected.delayDays ||
            step.scheduledFor.getTime() !== nextScheduledFor.getTime()
          ) {
            await this.prisma.$transaction(async (tx) => {
              await tx.recoveryCampaignStep.update({
                where: { id: step.id },
                data: {
                  delayDays: expected.delayDays,
                  scheduledFor: nextScheduledFor,
                  status: 'SCHEDULED',
                },
              });
              await tx.messageDispatch.update({
                where: { id: step.dispatch!.id },
                data: {
                  scheduledFor: nextScheduledFor,
                  nextAttemptAt: nextScheduledFor,
                  status: 'SCHEDULED',
                  errorCode: null,
                  errorMessage: null,
                  whatsAppConnectionId: connection?.id ?? step.dispatch!.whatsAppConnectionId,
                },
              });
            });
          }
        }
        kept += 1;
        continue;
      }

      const scheduledFor =
        step?.scheduledFor ??
        (await this.calculateThrottledScheduledFor(
          this.prisma,
          campaign.startedAt,
          expected.delayDays,
          settings,
        ));
      const renderedContent = this.renderForClient(
        template.content,
        this.recoveryClientFromCampaign(campaign),
        expected.delayDays,
      );
      const idempotencyKey = this.buildIdempotencyKey(
        campaign.clientId,
        campaign.receivableId!,
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

    for (const staleStep of campaign.steps.filter(
      (step) => !expectedStepNumbers.has(step.stepNumber),
    )) {
      canceled += await this.cancelStepAndDispatch(
        this.prisma,
        staleStep,
        'RECOVERY_STEP_DISABLED',
        'Etapa de recuperacao desativada na configuracao.',
      );
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
        receivable: true,
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
            receivable: true,
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

    if (referenceStatus !== 'ATIVO' && referenceStatus !== 'INATIVO') {
      return {
        code: 'CLIENT_REFERENCE_NOT_RECOVERABLE',
        message: 'Referencia nao esta elegivel para recuperacao financeira.',
      };
    }

    if (!dispatch.receivable) {
      return {
        code: 'RECEIVABLE_MISSING',
        message: 'Conta a receber da recuperacao nao encontrada.',
      };
    }

    if (dispatch.receivable.status === 'PAGO') {
      await this.prisma.$transaction((tx) =>
        this.closeActiveReceivableCampaigns(
          tx,
          dispatch.receivable!.id,
          'RECEIVABLE_PAID',
          'Conta a receber paga durante campanha de recuperacao.',
        ),
      );
      return { code: 'RECEIVABLE_PAID', message: 'Conta a receber paga antes do envio.' };
    }

    if (dispatch.receivable.status !== 'PENDENTE') {
      await this.prisma.$transaction((tx) =>
        this.closeActiveReceivableCampaigns(
          tx,
          dispatch.receivable!.id,
          'RECEIVABLE_NOT_PENDING',
          'Conta a receber deixou de estar pendente.',
        ),
      );
      return {
        code: 'RECEIVABLE_NOT_PENDING',
        message: 'Conta a receber deixou de estar pendente.',
      };
    }

    if (dispatch.receivableId !== dispatch.recoveryCampaign?.receivableId) {
      return {
        code: 'RECOVERY_RECEIVABLE_MISMATCH',
        message: 'Campanha de recuperacao nao corresponde a conta a receber.',
      };
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
      intent.receivableId !== dispatch.receivable.id ||
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
    const status = [
      'CLIENT_CANCELED',
      'RECOVERY_NOT_ACTIVE',
      'RECEIVABLE_PAID',
      'RECEIVABLE_NOT_PENDING',
    ].includes(errorCode)
      ? 'CANCELED'
      : 'IGNORED';
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.messageDispatch.update({
        where: { id: dispatch.id },
        data: { status, errorCode, errorMessage, nextAttemptAt: null },
        include: {
          client: { include: { plan: true } },
          clientReference: { include: { client: true, plan: true } },
          receivable: true,
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
        receivable: true,
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

  async cancelActiveForReceivable(
    tx: Transaction,
    receivableId: string,
    errorCode = 'RECEIVABLE_PAID',
    reason = 'Conta a receber deixou de estar pendente.',
  ) {
    await this.closeActiveReceivableCampaigns(tx, receivableId, errorCode, reason);
  }

  private async closeActiveReceivableCampaigns(
    tx: Transaction,
    receivableId: string,
    errorCode: string,
    reason: string,
  ) {
    const campaigns = await tx.recoveryCampaign.findMany({
      where: { receivableId, status: 'ATIVA' },
    });

    for (const campaign of campaigns) {
      const status = errorCode === 'RECEIVABLE_PAID' ? 'CONCLUIDA' : 'CANCELADA';
      await tx.recoveryCampaign.update({
        where: { id: campaign.id },
        data:
          status === 'CONCLUIDA'
            ? { status, completedAt: new Date(), cancelReason: reason }
            : { status, canceledAt: new Date(), cancelReason: reason },
      });
      await this.cancelFutureDispatches(tx, campaign.id, errorCode, reason);
      await tx.clientEvent.create({
        data: {
          clientId: campaign.clientId,
          type:
            status === 'CONCLUIDA' ? 'RECOVERY_CAMPAIGN_COMPLETED' : 'RECOVERY_CAMPAIGN_CANCELED',
          title:
            status === 'CONCLUIDA'
              ? 'Campanha de recuperacao encerrada por pagamento.'
              : 'Campanha de recuperacao cancelada.',
          description: reason,
          metadata: { recoveryCampaignId: campaign.id, receivableId },
        },
      });
    }
  }

  private async findPrimaryReferenceId(tx: Transaction | PrismaService, clientId: string) {
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

  private async findPrimaryReceivableId(tx: Transaction | PrismaService, clientId: string) {
    const receivable = await tx.receivable.findFirst({
      where: { clientId, status: 'PENDENTE' },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (!receivable) {
      throw new NotFoundException('Conta a receber pendente nao encontrada.');
    }

    return receivable.id;
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
    status: 'CANCELED' | 'IGNORED' = 'CANCELED',
  ) {
    if (!step) {
      return 0;
    }

    await tx.recoveryCampaignStep.update({
      where: { id: step.id },
      data: { status, canceledAt: new Date() },
    });

    if (step.dispatch && ['SCHEDULED', 'FAILED'].includes(step.dispatch.status)) {
      await tx.messageDispatch.update({
        where: { id: step.dispatch.id },
        data: { status, errorCode, errorMessage, nextAttemptAt: null },
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
    const types = recoveryStepTemplates.map((step) => step.templateType);
    const savedTemplates = await tx.messageTemplate.findMany({
      where: { type: { in: types } },
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    });
    const templates = new Map<string, MessageTemplate>();

    for (const template of savedTemplates) {
      if (!templates.has(template.type)) {
        templates.set(template.type, template);
      }
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

  calculateScheduledFor(
    base: Date,
    delayDays: number,
    settings?: Pick<RecoveryAutomationSettings, 'sendTime' | 'timezone'>,
  ) {
    const [year = 0, month = 1, day = 1] = formatBusinessDate(base).split('-').map(Number);
    const scheduledDate = new Date(Date.UTC(year, month - 1, day + delayDays));
    const yyyyMmDd = formatBusinessDate(scheduledDate);
    const sendTime = settings?.sendTime ?? this.getSendTime();

    return new Date(`${yyyyMmDd}T${sendTime}:00-03:00`);
  }

  private renderForClient(template: string, client: RecoveryClient, diasAtraso: number) {
    return this.renderer.render(template, {
      nome: client.name,
      primeiroNome: this.firstName(client.name),
      valor: this.formatCurrency(client.recurringValue),
      vencimento: this.formatDisplayDate(client.dueDate),
      plano: client.plan.name,
      referencia: client.reference,
      diasAtraso: String(diasAtraso),
      pix: '',
    });
  }

  private recoveryClientFromCampaign(campaign: RecoveryCampaignWithRelations): RecoveryClient {
    return {
      ...this.referenceAsRecoveryClient(campaign.clientReference),
      recurringValue: campaign.receivable?.amount ?? campaign.clientReference.recurringValue,
      dueDate: campaign.receivable?.dueDate ?? campaign.clientReference.dueDate,
    };
  }

  private buildIdempotencyKey(
    clientId: string,
    receivableId: string,
    campaignId: string,
    stepNumber: number,
  ) {
    return `recovery:${clientId}:${receivableId}:${campaignId}:${stepNumber}`;
  }

  private parseIdempotencyKey(key: string) {
    const parts = key.split(':');

    if (parts.length !== 5 || parts[0] !== 'recovery') {
      return null;
    }

    const stepNumber = Number(parts[4]);

    if (!Number.isInteger(stepNumber) || stepNumber < 1) {
      return null;
    }

    return { clientId: parts[1], receivableId: parts[2], campaignId: parts[3], stepNumber };
  }

  private getSendTime() {
    const hour = Number(this.config.get<string>('RECOVERY_SEND_HOUR') ?? '9');
    const legacyTime =
      Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? `${String(hour).padStart(2, '0')}:00`
        : defaultRecoverySendTime;
    const configured = this.config.get<string>('RECOVERY_SEND_TIME') ?? legacyTime;

    return /^([01]\d|2[0-3]):[0-5]\d$/.test(configured) ? configured : defaultRecoverySendTime;
  }

  private today() {
    return parseBusinessDate(formatBusinessDate(new Date()));
  }

  private isRecoveryTemplate(type: string) {
    return recoveryStepTemplates.some((step) => step.templateType === type);
  }

  private async getAutomationSettings(tx: Transaction | PrismaService = this.prisma) {
    return tx.recoveryAutomationSettings.upsert({
      where: { scope: 'global' },
      update: {},
      create: {
        scope: 'global',
        enabled: false,
        sendTime: this.getSendTime(),
        timezone: defaultRecoveryTimezone,
        sendIntervalSeconds: defaultRecoverySendIntervalSeconds,
        day3Enabled: true,
        day3OffsetDays: 3,
        day10Enabled: true,
        day10OffsetDays: 7,
        day15Enabled: true,
        day15OffsetDays: 15,
        day30Enabled: true,
        day30OffsetDays: 30,
      },
    });
  }

  private buildRecoverySteps(settings: RecoveryAutomationSettings): RecoveryStepConfig[] {
    return recoveryStepTemplates
      .filter((step) => Boolean(settings[step.enabledKey]))
      .map((step) => ({
        stepNumber: step.stepNumber,
        delayDays: Number(settings[step.offsetKey]),
        templateType: step.templateType,
      }));
  }

  private async calculateThrottledScheduledFor(
    tx: Transaction | PrismaService,
    base: Date,
    delayDays: number,
    settings: RecoveryAutomationSettings,
    excludingDispatchId?: string,
  ) {
    const scheduledFor = this.calculateScheduledFor(base, delayDays, settings);
    const nextDay = new Date(scheduledFor.getTime() + 24 * 60 * 60 * 1000);
    const existingForDay = await tx.messageDispatch.count({
      where: {
        origin: 'RECOVERY',
        status: { in: ['SCHEDULED', 'FAILED'] },
        ...(excludingDispatchId ? { id: { not: excludingDispatchId } } : {}),
        scheduledFor: {
          gte: scheduledFor,
          lt: nextDay,
        },
      },
    });

    return new Date(
      scheduledFor.getTime() +
        existingForDay * this.normalizeSendIntervalSeconds(settings.sendIntervalSeconds) * 1000,
    );
  }

  private validateSettings(
    settings: Pick<
      RecoveryAutomationSettings,
      | 'sendTime'
      | 'timezone'
      | 'sendIntervalSeconds'
      | 'day3Enabled'
      | 'day3OffsetDays'
      | 'day10Enabled'
      | 'day10OffsetDays'
      | 'day15Enabled'
      | 'day15OffsetDays'
      | 'day30Enabled'
      | 'day30OffsetDays'
    >,
  ) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.sendTime)) {
      throw new BadRequestException('Horario de recuperacao invalido.');
    }

    if (settings.timezone !== defaultRecoveryTimezone) {
      throw new BadRequestException('Timezone de recuperacao invalido.');
    }

    this.normalizeSendIntervalSeconds(settings.sendIntervalSeconds);

    const offsets = recoveryStepTemplates.map((step) => Number(settings[step.offsetKey]));

    if (offsets.some((offset) => !Number.isInteger(offset) || offset <= 0)) {
      throw new BadRequestException('Dias das etapas de recuperacao devem ser maiores que zero.');
    }

    if (new Set(offsets).size !== offsets.length) {
      throw new BadRequestException('Dias das etapas de recuperacao nao podem se repetir.');
    }

    for (let index = 1; index < offsets.length; index += 1) {
      if (offsets[index]! <= offsets[index - 1]!) {
        throw new BadRequestException(
          'Dias das etapas de recuperacao devem estar em ordem crescente.',
        );
      }
    }
  }

  private normalizeSendIntervalSeconds(value: number) {
    if (
      !Number.isInteger(value) ||
      value < minRecoverySendIntervalSeconds ||
      value > maxRecoverySendIntervalSeconds
    ) {
      throw new BadRequestException('Intervalo entre mensagens de recuperacao invalido.');
    }

    return value;
  }

  private presentSettings(settings: RecoveryAutomationSettings) {
    return {
      id: settings.id,
      enabled: settings.enabled,
      sendTime: settings.sendTime,
      timezone: settings.timezone,
      sendIntervalSeconds: settings.sendIntervalSeconds,
      steps: recoveryStepTemplates.map((step) => ({
        stepNumber: step.stepNumber,
        enabled: Boolean(settings[step.enabledKey]),
        offsetDays: Number(settings[step.offsetKey]),
        templateType: step.templateType,
      })),
      day3Enabled: settings.day3Enabled,
      day3OffsetDays: settings.day3OffsetDays,
      day10Enabled: settings.day10Enabled,
      day10OffsetDays: settings.day10OffsetDays,
      day15Enabled: settings.day15Enabled,
      day15OffsetDays: settings.day15OffsetDays,
      day30Enabled: settings.day30Enabled,
      day30OffsetDays: settings.day30OffsetDays,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
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

  private daysOverdue(dueDate: Date) {
    const due = parseBusinessDate(formatBusinessDate(dueDate)).getTime();
    const today = this.today().getTime();

    return Math.max(0, Math.floor((today - due) / (24 * 60 * 60 * 1000)));
  }

  private presentCampaign(campaign: RecoveryCampaignWithRelations) {
    return {
      id: campaign.id,
      clientId: campaign.clientId,
      clientReferenceId: campaign.clientReferenceId,
      receivableId: campaign.receivableId,
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
      clientReference: {
        id: campaign.clientReference.id,
        reference: campaign.clientReference.reference,
        status: campaign.clientReference.status,
      },
      receivable: campaign.receivable
        ? {
            id: campaign.receivable.id,
            description: campaign.receivable.description,
            amount: campaign.receivable.amount.toString(),
            dueDate: campaign.receivable.dueDate.toISOString(),
            status: campaign.receivable.status,
            daysOverdue: this.daysOverdue(campaign.receivable.dueDate),
          }
        : null,
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
