import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type Client,
  type ClientReference,
  type BillingAutomationSettings,
  type MessageDispatch,
  type MessageDispatchItem,
  type MessageTemplate,
  type Plan,
  type Receivable,
  type WhatsAppConnection,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from '../whatsapp/provider/whatsapp-provider';
import { TokenEncryptionService } from '../whatsapp/security/token-encryption.service';
import { ListBillingDispatchesDto } from './dto/list-billing-dispatches.dto';
import { PreviewMessageTemplateDto } from './dto/preview-message-template.dto';
import { UpdateBillingAutomationSettingsDto } from './dto/update-billing-automation-settings.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';
import { BillingTemplateRenderer } from './billing-template-renderer';

const pageSizeLimit = 100;
const maxAttempts = 3;
const retryDelayMinutes = 15;
const defaultBillingSendTime = '09:00';
const defaultBillingTimezone = 'America/Sao_Paulo';
const defaultBillingSendIntervalSeconds = 8;
const minBillingSendIntervalSeconds = 3;
const maxBillingSendIntervalSeconds = 300;

type BillingDispatch = MessageDispatch & {
  client: Client | null;
  clientReference: (ClientReference & { plan?: Plan | null }) | null;
  receivable:
    (Receivable & { clientReference?: (ClientReference & { plan?: Plan | null }) | null }) | null;
  items?: BillingDispatchItem[];
  template: MessageTemplate | null;
  whatsAppConnection: WhatsAppConnection | null;
};

type BillingDispatchItem = MessageDispatchItem & {
  clientReference: ClientReference & { plan?: Plan | null };
  receivable: Receivable & {
    clientReference?: (ClientReference & { plan?: Plan | null }) | null;
  };
};

type BillingReconcileItem = {
  client: Client;
  reference: ClientReference & { plan: Plan; receivables: Receivable[] };
  receivable: Receivable;
  baseScheduledFor: Date;
  scheduledFor: Date;
  businessSendDate: string;
};

type BillingReconcileGroup = {
  client: Client;
  items: BillingReconcileItem[];
  idempotencyKey: string;
  baseScheduledFor: Date;
  scheduledFor: Date;
  businessSendDate: string;
};

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BillingTemplateRenderer) private readonly renderer: BillingTemplateRenderer,
    @Optional()
    @Inject(ReceivableCycleService)
    private readonly receivableCycleService?: ReceivableCycleService,
  ) {}

  async reconcile(now = new Date()) {
    const settings = await this.getAutomationSettings();
    const template = await this.ensureDefaultTemplate();
    const groupedTemplate = await this.ensureGroupedTemplate();
    const connection = await this.findOperationalConnection(null);
    const clients = await this.prisma.client.findMany({
      where: {
        references: {
          some: { status: 'ATIVO', billingNoticeDays: { gte: 0 }, recurringValue: { gt: 0 } },
        },
      },
      include: {
        references: {
          where: { status: 'ATIVO', billingNoticeDays: { gte: 0 }, recurringValue: { gt: 0 } },
          include: {
            plan: true,
            receivables: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    let created = 0;
    let kept = 0;
    let canceled = 0;
    let skipped = 0;

    canceled += await this.cancelNoLongerEligibleDispatches();

    if ((!template.active && !groupedTemplate.active) || !connection) {
      const referencesCount = clients.reduce(
        (total, client) => total + this.billingReferencesForClient(client).length,
        0,
      );
      return { created, kept, canceled, skipped: referencesCount };
    }

    const candidates: BillingReconcileItem[] = [];

    for (const client of clients) {
      for (const reference of this.billingReferencesForClient(client)) {
        if (!this.isClientReferenceEligibleForScheduling(client, reference)) {
          skipped += 1;
          continue;
        }

        const receivable = this.findReceivableForReferenceDueDate(reference);

        if (!receivable) {
          skipped += 1;
          continue;
        }

        if (receivable.status !== 'PENDENTE') {
          skipped += 1;
          continue;
        }

        if (this.isCreateIneligible(client, reference, receivable, template, connection)) {
          skipped += 1;
          continue;
        }

        const baseScheduledFor = this.calculateScheduledFor(
          reference.dueDate,
          reference.billingNoticeDays,
          settings,
        );
        const businessSendDate = formatBusinessDate(baseScheduledFor);

        candidates.push({
          client,
          reference,
          receivable,
          baseScheduledFor,
          scheduledFor: baseScheduledFor,
          businessSendDate,
        });
      }
    }

    const scheduledGroups = this.scheduleBillingBatch(
      this.groupBillingCandidates(candidates),
      settings.sendIntervalSeconds,
    );

    for (const group of scheduledGroups) {
      const selectedTemplate = group.items.length > 1 ? groupedTemplate : template;

      if (!selectedTemplate.active) {
        skipped += group.items.length;
        continue;
      }

      canceled += await this.cancelObsoleteFutureDispatches(
        group.client.id,
        group.businessSendDate,
        group.idempotencyKey,
      );

      const firstItem = group.items[0]!;
      const renderedContent =
        group.items.length > 1
          ? this.renderForClientReferenceGroup(selectedTemplate.content, group.client, group.items)
          : this.renderForClientReference(
              selectedTemplate.content,
              group.client,
              firstItem.reference,
              firstItem.receivable,
            );

      try {
        const rescheduled = await this.rescheduleExistingFutureDispatch(
          group,
          selectedTemplate,
          renderedContent,
          now,
        );

        if (rescheduled) {
          kept += 1;
          continue;
        }

        const dispatch = await this.prisma.messageDispatch.create({
          data: {
            clientId: group.client.id,
            clientReferenceId: firstItem.reference.id,
            receivableId: firstItem.receivable.id,
            templateId: selectedTemplate.id,
            whatsAppConnectionId: connection.id,
            phone: normalizeBrazilPhone(group.client.phoneNormalized),
            body: renderedContent,
            renderedContent,
            origin: 'BILLING',
            status: 'SCHEDULED',
            requestId: group.idempotencyKey,
            idempotencyKey: group.idempotencyKey,
            scheduledFor: group.scheduledFor,
            nextAttemptAt: group.scheduledFor,
            items: {
              create: this.buildDispatchItemCreateInput(group.items),
            },
          },
        });

        if (dispatch) {
          created += 1;
        } else {
          kept += 1;
        }
      } catch (error) {
        if (this.isUniqueConstraint(error)) {
          kept += 1;
          continue;
        }

        throw error;
      }
    }

    return { created, kept, canceled, skipped };
  }

  async processDue(now = new Date(), limit = 20, options: { automatic?: boolean } = {}) {
    const settings = await this.getAutomationSettings();

    if (options.automatic && !settings.enabled) {
      return { processed: 0, results: [], skipped: 'BILLING_AUTOMATION_DISABLED' };
    }

    const automaticWindow = options.automatic
      ? this.businessDayWindow(now, settings.timezone)
      : null;
    const effectiveLimit = Math.min(Math.max(limit, 1), 1);
    const candidates = await this.prisma.messageDispatch.findMany({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        attempts: { lt: maxAttempts },
        scheduledFor: {
          lte: now,
          ...(automaticWindow ? { gte: automaticWindow.start } : {}),
        },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
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

  async sendNow(id: string) {
    const now = new Date();
    const dispatch = await this.prisma.messageDispatch.findUnique({ where: { id } });

    if (!dispatch || dispatch.origin !== 'BILLING') {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    if (!['SCHEDULED', 'FAILED'].includes(dispatch.status)) {
      throw new ConflictException('Apenas cobrancas agendadas ou com falha podem ser enviadas.');
    }

    await this.prisma.messageDispatch.update({
      where: { id },
      data: { scheduledFor: now, nextAttemptAt: now },
    });

    const acquired = await this.acquireDispatch(id, now);

    if (!acquired) {
      return { processed: 0, results: [] };
    }

    return { processed: 1, results: [await this.processAcquired(id, now)] };
  }

  async summary() {
    const settings = await this.getAutomationSettings();
    const today = this.businessDayWindow(new Date(), settings.timezone);
    const [
      scheduled,
      sent,
      failed,
      ignoredOrCanceled,
      scheduledToday,
      sentToday,
      failedToday,
      next,
    ] = await this.prisma.$transaction([
      this.prisma.messageDispatch.count({ where: { origin: 'BILLING', status: 'SCHEDULED' } }),
      this.prisma.messageDispatch.count({ where: { origin: 'BILLING', status: 'SENT' } }),
      this.prisma.messageDispatch.count({ where: { origin: 'BILLING', status: 'FAILED' } }),
      this.prisma.messageDispatch.count({
        where: { origin: 'BILLING', status: { in: ['IGNORED', 'CANCELED'] } },
      }),
      this.prisma.messageDispatch.count({
        where: {
          origin: 'BILLING',
          status: 'SCHEDULED',
          scheduledFor: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.messageDispatch.count({
        where: {
          origin: 'BILLING',
          status: 'SENT',
          sentAt: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.messageDispatch.count({
        where: {
          origin: 'BILLING',
          status: 'FAILED',
          updatedAt: { gte: today.start, lte: today.end },
        },
      }),
      this.prisma.messageDispatch.findMany({
        where: {
          origin: 'BILLING',
          status: { in: ['SCHEDULED', 'FAILED'] },
          scheduledFor: { gte: today.start },
        },
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          receivable: { include: { clientReference: { include: { plan: true } } } },
          items: {
            include: {
              clientReference: { include: { plan: true } },
              receivable: { include: { clientReference: { include: { plan: true } } } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          },
          template: true,
          whatsAppConnection: true,
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
        take: 10,
      }),
    ]);

    const cycleIssues = this.receivableCycleService
      ? await this.receivableCycleService.listOperationalIssues(10)
      : [];

    return {
      scheduled,
      sent,
      failed,
      ignoredOrCanceled,
      scheduledToday,
      sentToday,
      failedToday,
      next: next.map((dispatch) => this.presentDispatch(dispatch)),
      cycleIssues,
      settings: this.presentSettings(settings),
    };
  }

  async getSettings() {
    return this.presentSettings(await this.getAutomationSettings());
  }

  async updateSettings(dto: UpdateBillingAutomationSettingsDto) {
    const current = await this.getAutomationSettings();
    const next = await this.prisma.billingAutomationSettings.update({
      where: { scope: 'global' },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.sendTime !== undefined ? { sendTime: dto.sendTime } : {}),
        ...(dto.sendIntervalSeconds !== undefined
          ? { sendIntervalSeconds: dto.sendIntervalSeconds }
          : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });

    if (
      (dto.enabled === true && !current.enabled) ||
      (dto.sendTime !== undefined && dto.sendTime !== current.sendTime) ||
      (dto.sendIntervalSeconds !== undefined &&
        dto.sendIntervalSeconds !== current.sendIntervalSeconds) ||
      (dto.timezone !== undefined && dto.timezone !== current.timezone)
    ) {
      await this.reconcile();
    }

    return this.presentSettings(next);
  }

  async reconcileReceivables() {
    return this.currentCycle().reconcileCurrentCycles();
  }

  async previewCurrentCycleReceivable(clientReferenceId: string) {
    return this.currentCycle().previewCurrentCycleReceivable(clientReferenceId);
  }

  async generateCurrentCycleReceivable(clientReferenceId: string) {
    const result = await this.currentCycle().ensureCurrentCycleReceivable(clientReferenceId);
    await this.reconcile();
    return result;
  }

  async listDispatches(query: ListBillingDispatchesDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildDispatchWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.messageDispatch.findMany({
        where,
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          receivable: { include: { clientReference: { include: { plan: true } } } },
          items: {
            include: {
              clientReference: { include: { plan: true } },
              receivable: { include: { clientReference: { include: { plan: true } } } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          },
          template: true,
          whatsAppConnection: true,
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.messageDispatch.count({ where }),
    ]);

    return {
      items: items.map((dispatch) => this.presentDispatch(dispatch)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async dispatchesSummary(query: ListBillingDispatchesDto) {
    const where = this.buildDispatchWhere(query, { includeStatus: false });

    const [scheduled, sent, failed, ignoredOrCanceled] = await this.prisma.$transaction([
      this.prisma.messageDispatch.count({
        where: { ...where, status: { in: ['PENDING', 'SCHEDULED', 'PROCESSING'] } },
      }),
      this.prisma.messageDispatch.count({ where: { ...where, status: 'SENT' } }),
      this.prisma.messageDispatch.count({ where: { ...where, status: 'FAILED' } }),
      this.prisma.messageDispatch.count({
        where: { ...where, status: { in: ['IGNORED', 'CANCELED'] } },
      }),
    ]);

    return {
      scheduled,
      sent,
      failed,
      ignoredOrCanceled,
    };
  }

  async getDispatch(id: string) {
    const dispatch = await this.prisma.messageDispatch.findUnique({
      where: { id },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        receivable: { include: { clientReference: { include: { plan: true } } } },
        items: {
          include: {
            clientReference: { include: { plan: true } },
            receivable: { include: { clientReference: { include: { plan: true } } } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        },
        template: true,
        whatsAppConnection: true,
      },
    });

    if (!dispatch || dispatch.origin !== 'BILLING') {
      throw new NotFoundException('Cobranca nao encontrada.');
    }

    return this.presentDispatch(dispatch);
  }

  async listTemplates() {
    const templates = await this.prisma.messageTemplate.findMany({
      orderBy: [{ type: 'asc' }, { active: 'desc' }, { name: 'asc' }],
    });

    return templates.map((template) => this.presentTemplate(template));
  }

  async updateTemplate(id: string, dto: UpdateMessageTemplateDto) {
    const current = await this.prisma.messageTemplate.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Template nao encontrado.');
    }

    if (dto.content !== undefined && !dto.content.trim()) {
      throw new BadRequestException('Template nao pode ficar vazio.');
    }

    const content = dto.content?.trim();
    const name = dto.name?.trim();

    if (content !== undefined) {
      this.validateTemplateContent(content);
    }

    try {
      const updated = await this.prisma.messageTemplate.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(content !== undefined ? { content } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });

      return this.presentTemplate(updated);
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        throw new ConflictException('Ja existe um template com este tipo e nome.');
      }
      throw error;
    }
  }

  async previewTemplate(id: string, dto: PreviewMessageTemplateDto) {
    const template = await this.prisma.messageTemplate.findUnique({ where: { id } });

    if (!template) {
      throw new NotFoundException('Template nao encontrado.');
    }

    const content = dto.content?.trim() || template.content;
    this.validateTemplateContent(content);

    return {
      templateId: template.id,
      renderedContent: this.renderer.render(
        content,
        this.renderer.previewContextForType(template.type, {
          nome: dto.name?.trim(),
          valor: dto.value?.trim(),
          vencimento: dto.dueDate?.trim(),
          plano: dto.plan?.trim(),
          referencia: dto.reference?.trim(),
          diasAtraso: dto.daysOverdue?.trim(),
        }),
      ),
    };
  }

  calculateScheduledFor(
    dueDate: Date,
    billingNoticeDays: number,
    settings?: Pick<BillingAutomationSettings, 'sendTime' | 'timezone'>,
  ) {
    if (!Number.isInteger(billingNoticeDays) || billingNoticeDays < 0) {
      throw new BadRequestException('Dias de aviso de cobranca invalidos.');
    }

    const [yearPart, monthPart, dayPart] = formatBusinessDate(dueDate).split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const scheduledDate = new Date(Date.UTC(year, month - 1, day - billingNoticeDays));
    const yyyyMmDd = formatBusinessDate(scheduledDate);
    const sendTime = settings?.sendTime ?? this.getSendTime();
    const timezone = settings?.timezone ?? defaultBillingTimezone;

    if (timezone !== defaultBillingTimezone) {
      throw new BadRequestException('Timezone de cobranca invalido.');
    }

    return new Date(`${yyyyMmDd}T${sendTime}:00-03:00`);
  }

  scheduleBillingBatch<T extends BillingReconcileItem | BillingReconcileGroup>(
    items: T[],
    intervalSeconds: number,
  ) {
    const safeIntervalSeconds = this.normalizeSendIntervalSeconds(intervalSeconds);
    const offsetsByBaseTime = new Map<string, number>();

    return [...items]
      .sort((left, right) =>
        'items' in left && 'items' in right
          ? this.compareBillingReconcileGroups(left, right)
          : this.compareBillingReconcileItems(
              left as BillingReconcileItem,
              right as BillingReconcileItem,
            ),
      )
      .map((item) => {
        const baseKey = item.baseScheduledFor.toISOString();
        const offset = offsetsByBaseTime.get(baseKey) ?? 0;
        offsetsByBaseTime.set(baseKey, offset + 1);

        return {
          ...item,
          scheduledFor: new Date(
            item.baseScheduledFor.getTime() + offset * safeIntervalSeconds * 1000,
          ),
        };
      });
  }

  private groupBillingCandidates(items: BillingReconcileItem[]): BillingReconcileGroup[] {
    const groups = new Map<string, BillingReconcileGroup>();

    for (const item of items) {
      const idempotencyKey = this.buildGroupedIdempotencyKey(item.client.id, item.businessSendDate);
      const existing = groups.get(idempotencyKey);

      if (existing) {
        existing.items.push(item);
        continue;
      }

      groups.set(idempotencyKey, {
        client: item.client,
        items: [item],
        idempotencyKey,
        baseScheduledFor: item.baseScheduledFor,
        scheduledFor: item.scheduledFor,
        businessSendDate: item.businessSendDate,
      });
    }

    return [...groups.values()].map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => this.compareBillingReconcileItems(left, right)),
    }));
  }

  private async acquireDispatch(id: string, now: Date) {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        id,
        origin: 'BILLING',
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
    let dispatch = await this.prisma.messageDispatch.findUnique({
      where: { id },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        receivable: { include: { clientReference: { include: { plan: true } } } },
        items: {
          include: {
            clientReference: { include: { plan: true } },
            receivable: { include: { clientReference: { include: { plan: true } } } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        },
        template: true,
        whatsAppConnection: true,
      },
    });

    if (!dispatch) {
      return { id, status: 'missing' };
    }

    const refreshed = await this.refreshDispatchItemsBeforeSend(dispatch);

    if ('code' in refreshed) {
      const status = refreshed.code === 'RECEIVABLE_CANCELED' ? 'CANCELED' : 'IGNORED';
      const updated = await this.prisma.messageDispatch.update({
        where: { id },
        data: { status, errorCode: refreshed.code, errorMessage: refreshed.message },
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          receivable: { include: { clientReference: { include: { plan: true } } } },
          items: {
            include: {
              clientReference: { include: { plan: true } },
              receivable: { include: { clientReference: { include: { plan: true } } } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          },
          template: true,
          whatsAppConnection: true,
        },
      });

      return this.presentDispatch(updated);
    }

    dispatch = refreshed;

    const ineligible = this.findIneligibleReason(dispatch);

    if (ineligible) {
      const status = ineligible.code === 'RECEIVABLE_CANCELED' ? 'CANCELED' : 'IGNORED';
      const updated = await this.prisma.messageDispatch.update({
        where: { id },
        data: { status, errorCode: ineligible.code, errorMessage: ineligible.message },
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          receivable: { include: { clientReference: { include: { plan: true } } } },
          items: {
            include: {
              clientReference: { include: { plan: true } },
              receivable: { include: { clientReference: { include: { plan: true } } } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          },
          template: true,
          whatsAppConnection: true,
        },
      });

      return this.presentDispatch(updated);
    }

    const connection = await this.findOperationalConnection(dispatch.whatsAppConnectionId);

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
          },
          include: {
            client: true,
            clientReference: { include: { plan: true } },
            receivable: { include: { clientReference: { include: { plan: true } } } },
            items: {
              include: {
                clientReference: { include: { plan: true } },
                receivable: { include: { clientReference: { include: { plan: true } } } },
              },
              orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
            },
            template: true,
            whatsAppConnection: true,
          },
        });

        const dispatchItems = this.dispatchItems(dispatch);

        if (dispatch.client && dispatchItems.length) {
          const existingEvent = await tx.clientEvent.findFirst({
            where: {
              clientId: dispatch.client.id,
              type: 'WHATSAPP_MESSAGE_SENT',
              metadata: { path: ['messageDispatchId'], equals: id },
            },
          });

          if (existingEvent) {
            return sent;
          }

          await tx.clientEvent.create({
            data: {
              clientId: dispatch.client.id,
              type: 'WHATSAPP_MESSAGE_SENT',
              title: 'Cobranca automatica enviada pelo WhatsApp.',
              description:
                dispatchItems.length > 1
                  ? `${dispatchItems.length} referencias. Total: ${this.formatCurrency(
                      this.sumDispatchItems(dispatchItems),
                    )}.`
                  : `Vencimento: ${formatBusinessDate(
                      dispatchItems[0]!.receivable.dueDate,
                    )}. Valor: ${this.formatCurrency(dispatchItems[0]!.receivable.amount)}.`,
              metadata: {
                messageDispatchId: id,
                receivableId: dispatchItems[0]!.receivable.id,
                receivableIds: dispatchItems.map((item) => item.receivable.id),
                clientReferenceIds: dispatchItems.map((item) => item.clientReference.id),
                templateId: dispatch.templateId,
              },
            },
          });
        }

        return sent;
      });

      return this.presentDispatch(updated);
    } catch (error) {
      return this.markRetry(dispatch, 'PROVIDER_ERROR', this.sanitizeError(error), now);
    }
  }

  private async refreshDispatchItemsBeforeSend(dispatch: BillingDispatch) {
    const originalItems = this.dispatchItems(dispatch);

    if (!dispatch.client) {
      return { code: 'CLIENT_MISSING', message: 'Cliente da cobranca nao encontrado.' };
    }

    if (!originalItems.length) {
      return { code: 'RECEIVABLE_MISSING', message: 'Conta a receber nao encontrada.' };
    }

    const currentReceivables = await this.prisma.receivable.findMany({
      where: { id: { in: originalItems.map((item) => item.receivable.id) } },
      include: { clientReference: { include: { plan: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
    const currentById = new Map(
      currentReceivables.map((receivable) => [receivable.id, receivable]),
    );
    const activeItems = originalItems
      .map((item) => {
        const receivable = currentById.get(item.receivable.id);
        if (!receivable || receivable.status !== 'PENDENTE') return null;
        if (receivable.clientReference.status !== 'ATIVO') return null;

        return {
          ...item,
          receivable,
          clientReference: receivable.clientReference,
        };
      })
      .filter(Boolean) as BillingDispatchItem[];

    if (!activeItems.length) {
      const allCanceled = currentReceivables.length
        ? currentReceivables.every(
            (receivable) =>
              receivable.status === 'CANCELADO' ||
              receivable.clientReference.status === 'CANCELADO',
          )
        : false;

      return {
        code: allCanceled ? 'RECEIVABLE_CANCELED' : 'RECEIVABLE_NO_LONGER_PENDING',
        message: 'Nenhum item elegivel restou para envio.',
      };
    }

    const groupedIntent = this.parseIdempotencyKey(dispatch.idempotencyKey ?? dispatch.requestId);

    if (groupedIntent && 'businessSendDate' in groupedIntent) {
      const settings = await this.getAutomationSettings();
      const stillMatchesIntent = activeItems.every((item) => {
        const expectedScheduledFor = this.calculateScheduledFor(
          item.receivable.dueDate,
          item.clientReference.billingNoticeDays,
          settings,
        );

        return (
          formatBusinessDate(expectedScheduledFor) === groupedIntent.businessSendDate &&
          formatBusinessDate(item.receivable.dueDate) ===
            formatBusinessDate(item.clientReference.dueDate)
        );
      });

      if (!stillMatchesIntent) {
        return {
          code: 'BILLING_INTENT_MISMATCH',
          message: 'Intencao de cobranca nao corresponde ao ciclo atual.',
        };
      }
    }

    const template =
      activeItems.length > 1
        ? await this.ensureGroupedTemplate()
        : await this.ensureDefaultTemplate();

    if (!template.active) {
      return { code: 'TEMPLATE_INACTIVE', message: 'Template de cobranca indisponivel.' };
    }

    const renderedContent = this.renderForDispatchItems(
      template.content,
      dispatch.client,
      activeItems,
    );
    const firstItem = activeItems[0]!;

    return this.prisma.$transaction(async (tx) => {
      await tx.messageDispatchItem.deleteMany({ where: { messageDispatchId: dispatch.id } });

      return tx.messageDispatch.update({
        where: { id: dispatch.id },
        data: {
          clientReferenceId: firstItem.clientReference.id,
          receivableId: firstItem.receivable.id,
          templateId: template.id,
          body: renderedContent,
          renderedContent,
          items: {
            create: activeItems.map((item) => ({
              receivableId: item.receivable.id,
              clientReferenceId: item.clientReference.id,
              amount: item.receivable.amount,
              dueDate: item.receivable.dueDate,
              referenceSnapshot: item.clientReference.reference,
              statusSnapshot: item.receivable.status,
            })),
          },
        },
        include: {
          client: true,
          clientReference: { include: { plan: true } },
          receivable: { include: { clientReference: { include: { plan: true } } } },
          items: {
            include: {
              clientReference: { include: { plan: true } },
              receivable: { include: { clientReference: { include: { plan: true } } } },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          },
          template: true,
          whatsAppConnection: true,
        },
      });
    });
  }

  private findIneligibleReason(dispatch: BillingDispatch) {
    if (dispatch.origin !== 'BILLING' || dispatch.status !== 'PROCESSING') {
      return {
        code: 'DISPATCH_NOT_PROCESSABLE',
        message: 'Cobranca nao esta disponivel para envio.',
      };
    }

    const dispatchReference =
      dispatch.clientReference ?? dispatch.receivable?.clientReference ?? null;

    if (!dispatchReference || dispatchReference.status !== 'ATIVO') {
      return { code: 'CLIENT_REFERENCE_NOT_ACTIVE', message: 'Referencia nao esta ativa.' };
    }

    try {
      normalizeBrazilPhone(dispatch.phone);
    } catch {
      return { code: 'INVALID_PHONE', message: 'Telefone da cobranca invalido.' };
    }

    if (!dispatch.receivable) {
      return { code: 'RECEIVABLE_MISSING', message: 'Conta a receber nao encontrada.' };
    }

    if (dispatch.receivable.status === 'PAGO') {
      return { code: 'RECEIVABLE_PAID', message: 'Conta a receber ja paga.' };
    }

    if (dispatch.receivable.status === 'CANCELADO') {
      return { code: 'RECEIVABLE_CANCELED', message: 'Conta a receber cancelada.' };
    }

    if (dispatch.receivable.status !== 'PENDENTE') {
      return { code: 'RECEIVABLE_NOT_PENDING', message: 'Conta a receber nao esta pendente.' };
    }

    if (
      !dispatch.template ||
      !['BILLING_DUE', 'BILLING_DUE_GROUPED'].includes(dispatch.template.type) ||
      !dispatch.template.active
    ) {
      return { code: 'TEMPLATE_INACTIVE', message: 'Template de cobranca indisponivel.' };
    }

    const intent = this.parseIdempotencyKey(dispatch.idempotencyKey ?? dispatch.requestId);

    if (!intent) {
      return {
        code: 'INVALID_BILLING_INTENT',
        message: 'Chave de idempotencia de cobranca invalida.',
      };
    }

    if (!dispatch.client || intent.clientId !== dispatch.client.id) {
      return {
        code: 'BILLING_INTENT_MISMATCH',
        message: 'Intencao de cobranca nao corresponde aos dados atuais.',
      };
    }

    if ('businessSendDate' in intent) {
      return null;
    }

    if (
      intent.receivableId !== dispatch.receivable.id ||
      intent.templateId !== dispatch.template.id
    ) {
      return {
        code: 'BILLING_INTENT_MISMATCH',
        message: 'Intencao de cobranca nao corresponde aos dados atuais.',
      };
    }

    if (
      formatBusinessDate(dispatch.receivable.dueDate) !== intent.dueDate ||
      formatBusinessDate(dispatchReference.dueDate) !== intent.dueDate
    ) {
      return { code: 'DUE_DATE_CHANGED', message: 'Vencimento da cobranca mudou antes do envio.' };
    }

    if (dispatchReference.billingNoticeDays !== intent.billingNoticeDays) {
      return {
        code: 'BILLING_NOTICE_CHANGED',
        message: 'Dias de aviso da cobranca mudaram antes do envio.',
      };
    }

    return null;
  }

  private isCreateIneligible(
    client: Client,
    reference: ClientReference,
    receivable: Receivable,
    template: MessageTemplate,
    connection: WhatsAppConnection | null,
  ) {
    try {
      normalizeBrazilPhone(client.phoneNormalized);
    } catch {
      return true;
    }

    return (
      reference.status !== 'ATIVO' ||
      receivable.status !== 'PENDENTE' ||
      formatBusinessDate(receivable.dueDate) !== formatBusinessDate(reference.dueDate) ||
      reference.billingNoticeDays < 0 ||
      !template.active ||
      !connection ||
      connection.status !== 'CONNECTED' ||
      !connection.connected ||
      !connection.loggedIn
    );
  }

  private billingReferencesForClient(
    client: Client &
      Partial<{
        plan: Plan;
        receivables: Receivable[];
        references: Array<ClientReference & { plan: Plan; receivables: Receivable[] }>;
      }>,
  ) {
    return client.references ?? [];
  }

  private dispatchItems(dispatch: BillingDispatch): BillingDispatchItem[] {
    if (dispatch.items?.length) {
      return dispatch.items;
    }

    const reference = dispatch.clientReference ?? dispatch.receivable?.clientReference ?? null;

    if (!dispatch.receivable || !reference) {
      return [];
    }

    return [
      {
        id: `${dispatch.id}:${dispatch.receivable.id}`,
        messageDispatchId: dispatch.id,
        receivableId: dispatch.receivable.id,
        clientReferenceId: reference.id,
        amount: dispatch.receivable.amount,
        dueDate: dispatch.receivable.dueDate,
        referenceSnapshot: reference.reference,
        statusSnapshot: dispatch.receivable.status,
        createdAt: dispatch.createdAt,
        updatedAt: dispatch.updatedAt,
        clientReference: reference,
        receivable: dispatch.receivable,
      },
    ];
  }

  private buildDispatchItemCreateInput(items: BillingReconcileItem[]) {
    return items.map((item) => ({
      receivableId: item.receivable.id,
      clientReferenceId: item.reference.id,
      amount: item.receivable.amount,
      dueDate: item.receivable.dueDate,
      referenceSnapshot: item.reference.reference,
      statusSnapshot: item.receivable.status,
    }));
  }

  private sumDispatchItems(items: Array<Pick<BillingDispatchItem, 'receivable'>>) {
    return items.reduce((total, item) => total + Number(item.receivable.amount), 0);
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
        client: true,
        clientReference: { include: { plan: true } },
        receivable: { include: { clientReference: { include: { plan: true } } } },
        items: {
          include: {
            clientReference: { include: { plan: true } },
            receivable: { include: { clientReference: { include: { plan: true } } } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        },
        template: true,
        whatsAppConnection: true,
      },
    });

    return this.presentDispatch(updated);
  }

  private findReceivableForReferenceDueDate(
    reference: ClientReference & { receivables: Receivable[] },
  ) {
    const clientDueDate = formatBusinessDate(reference.dueDate);
    return (
      reference.receivables.find(
        (receivable) =>
          receivable.purpose === 'RENEWAL' &&
          formatBusinessDate(receivable.dueDate) === clientDueDate,
      ) ?? null
    );
  }

  private isClientReferenceEligibleForScheduling(client: Client, reference: ClientReference) {
    if (reference.status !== 'ATIVO') {
      return false;
    }

    if (
      !client.phoneNormalized ||
      reference.billingNoticeDays < 0 ||
      Number(reference.recurringValue) <= 0
    ) {
      return false;
    }

    try {
      normalizeBrazilPhone(client.phoneNormalized);
      return true;
    } catch {
      return false;
    }
  }

  private async cancelObsoleteFutureDispatches(
    clientId: string,
    businessSendDate: string,
    expectedKey: string,
  ) {
    const window = this.businessDateWindowFromDate(businessSendDate);
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        clientId,
        origin: 'BILLING',
        status: 'SCHEDULED',
        scheduledFor: { gte: window.start, lte: window.end },
        idempotencyKey: { not: expectedKey },
      },
      data: {
        status: 'CANCELED',
        errorCode: 'OBSOLETE_BILLING_INTENT',
        errorMessage: 'Cobranca futura substituida por nova regra de vencimento ou aviso.',
      },
    });

    return result.count;
  }

  private async rescheduleExistingFutureDispatch(
    group: BillingReconcileGroup,
    template: MessageTemplate,
    renderedContent: string,
    now: Date,
  ) {
    const existing = await this.prisma.messageDispatch.findFirst({
      where: {
        origin: 'BILLING',
        idempotencyKey: group.idempotencyKey,
        status: 'SCHEDULED',
        scheduledFor: { gt: now },
      },
      select: { id: true },
    });

    if (!existing) return false;

    const firstItem = group.items[0]!;

    await this.prisma.$transaction(async (tx) => {
      await tx.messageDispatchItem.deleteMany({ where: { messageDispatchId: existing.id } });
      await tx.messageDispatch.update({
        where: { id: existing.id },
        data: {
          clientReferenceId: firstItem.reference.id,
          receivableId: firstItem.receivable.id,
          templateId: template.id,
          body: renderedContent,
          renderedContent,
          scheduledFor: group.scheduledFor,
          nextAttemptAt: group.scheduledFor,
          errorCode: null,
          errorMessage: null,
          items: { create: this.buildDispatchItemCreateInput(group.items) },
        },
      });
    });

    return true;
  }

  private async cancelNoLongerEligibleDispatches() {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        origin: 'BILLING',
        status: 'SCHEDULED',
        OR: [
          { client: { is: null } },
          { template: { is: null } },
          { template: { is: { active: false } } },
        ],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'BILLING_INTENT_NO_LONGER_ELIGIBLE',
        errorMessage: 'Cobranca futura cancelada por perda de elegibilidade.',
      },
    });

    return result.count;
  }

  private buildDispatchWhere(
    query: ListBillingDispatchesDto,
    options: { includeStatus?: boolean } = {},
  ): Prisma.MessageDispatchWhereInput {
    const includeStatus = options.includeStatus ?? true;
    const where: Prisma.MessageDispatchWhereInput = { origin: 'BILLING' };
    const and: Prisma.MessageDispatchWhereInput[] = [];

    if (includeStatus && query.status) {
      where.status = query.status;
    }

    if (query.clientId) {
      and.push({
        OR: [
          { clientId: query.clientId },
          { clientReference: { clientId: query.clientId } },
          { receivable: { clientId: query.clientId } },
          { items: { some: { clientReference: { clientId: query.clientId } } } },
          { items: { some: { receivable: { clientId: query.clientId } } } },
        ],
      });
    }

    if (query.clientReferenceId) {
      and.push({
        OR: [
          { clientReferenceId: query.clientReferenceId },
          { receivable: { clientReferenceId: query.clientReferenceId } },
          { items: { some: { clientReferenceId: query.clientReferenceId } } },
        ],
      });
    }

    if (query.search) {
      const search = query.search.trim();
      if (search) {
        and.push({
          OR: [
            { client: { name: { contains: search, mode: 'insensitive' } } },
            { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
            {
              receivable: {
                clientReference: { reference: { contains: search, mode: 'insensitive' } },
              },
            },
            {
              items: {
                some: {
                  clientReference: { reference: { contains: search, mode: 'insensitive' } },
                },
              },
            },
            { phone: { contains: search } },
          ],
        });
      }
    }

    if (query.startDate || query.endDate) {
      where.scheduledFor = {
        ...(query.startDate ? { gte: parseBusinessDate(query.startDate) } : {}),
        ...(query.endDate ? { lte: this.endOfBusinessDate(query.endDate) } : {}),
      };
    }

    if (query.dueDate) {
      const dueDate = parseBusinessDate(query.dueDate);
      and.push({
        OR: [{ receivable: { dueDate } }, { items: { some: { dueDate } } }],
      });
    }

    if (and.length) {
      where.AND = and;
    }

    return where;
  }

  private async ensureDefaultTemplate() {
    return this.prisma.messageTemplate.upsert({
      where: { type_name: { type: 'BILLING_DUE', name: 'Cobranca padrao' } },
      update: {},
      create: {
        name: 'Cobranca padrao',
        type: 'BILLING_DUE',
        content:
          'Bom dia, *{{primeiroNome}}*! Seu serviço vence em {{vencimento}} no valor de {{valor}}. Queria saber se tem interesse em renovar?',
        active: true,
      },
    });
  }

  private async ensureGroupedTemplate() {
    return this.prisma.messageTemplate.upsert({
      where: { type_name: { type: 'BILLING_DUE_GROUPED', name: 'Cobranca agrupada' } },
      update: {},
      create: {
        name: 'Cobranca agrupada',
        type: 'BILLING_DUE_GROUPED',
        content:
          'Olá, {{primeiroNome}}!\n\nVocê possui {{quantidade}} serviços com cobrança programada:\n\n{{itens}}\n\nTotal: {{valorTotal}}',
        active: true,
      },
    });
  }

  private async findOperationalConnection(id: string | null) {
    const where = id ? { id } : undefined;
    return this.prisma.whatsAppConnection.findFirst({
      where: {
        ...(where ?? {}),
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private renderForClientReference(
    template: string,
    client: Client,
    reference: ClientReference & { plan: Plan },
    receivable: Receivable,
  ) {
    return this.renderer.render(template, {
      nome: client.name,
      primeiroNome: this.firstName(client.name),
      valor: this.formatCurrency(receivable.amount),
      vencimento: this.formatDisplayDate(receivable.dueDate),
      plano: reference.plan.name,
      referencia: reference.reference,
      diasAtraso: '',
      pix: '',
      quantidade: '',
      itens: '',
      valorTotal: '',
    });
  }

  private renderForClientReferenceGroup(
    template: string,
    client: Client,
    items: BillingReconcileItem[],
  ) {
    return this.renderer.render(template, {
      nome: client.name,
      primeiroNome: this.firstName(client.name),
      valor: '',
      vencimento: '',
      plano: '',
      referencia: '',
      diasAtraso: '',
      pix: '',
      quantidade: String(items.length),
      itens: items
        .map(
          (item) =>
            `• ${item.reference.reference} — ${this.formatCurrency(
              item.receivable.amount,
            )} — vence ${this.formatDisplayDate(item.receivable.dueDate)}`,
        )
        .join('\n'),
      valorTotal: this.formatCurrency(
        items.reduce((total, item) => total + Number(item.receivable.amount), 0),
      ),
    });
  }

  private renderForDispatchItems(template: string, client: Client, items: BillingDispatchItem[]) {
    const firstItem = items[0]!;

    if (items.length === 1) {
      return this.renderForClientReference(
        template,
        client,
        firstItem.clientReference as ClientReference & { plan: Plan },
        firstItem.receivable,
      );
    }

    return this.renderer.render(template, {
      nome: client.name,
      primeiroNome: this.firstName(client.name),
      valor: '',
      vencimento: '',
      plano: '',
      referencia: '',
      diasAtraso: '',
      pix: '',
      quantidade: String(items.length),
      itens: items
        .map(
          (item) =>
            `• ${item.clientReference.reference} — ${this.formatCurrency(
              item.receivable.amount,
            )} — vence ${this.formatDisplayDate(item.receivable.dueDate)}`,
        )
        .join('\n'),
      valorTotal: this.formatCurrency(this.sumDispatchItems(items)),
    });
  }

  private buildGroupedIdempotencyKey(clientId: string, businessSendDate: string) {
    return `billing-group:${clientId}:${businessSendDate}`;
  }

  private parseIdempotencyKey(key: string) {
    const parts = key.split(':');

    if (parts.length === 3 && parts[0] === 'billing-group') {
      return {
        clientId: parts[1],
        businessSendDate: parts[2],
      };
    }

    if (parts.length !== 6 || parts[0] !== 'billing') {
      return null;
    }

    const billingNoticeDays = Number(parts[4]);

    if (!Number.isInteger(billingNoticeDays) || billingNoticeDays < 0) {
      return null;
    }

    return {
      clientId: parts[1],
      receivableId: parts[2],
      dueDate: parts[3],
      billingNoticeDays,
      templateId: parts[5],
    };
  }

  private getSendTime() {
    const hour = Number(this.config.get<string>('BILLING_SEND_HOUR') ?? '9');
    const legacyTime =
      Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? `${String(hour).padStart(2, '0')}:00`
        : defaultBillingSendTime;
    const configured = this.config.get<string>('BILLING_SEND_TIME') ?? legacyTime;

    return /^([01]\d|2[0-3]):[0-5]\d$/.test(configured) ? configured : defaultBillingSendTime;
  }

  private async getAutomationSettings() {
    return this.prisma.billingAutomationSettings.upsert({
      where: { scope: 'global' },
      update: {},
      create: {
        scope: 'global',
        enabled: false,
        sendTime: defaultBillingSendTime,
        timezone: defaultBillingTimezone,
        sendIntervalSeconds: defaultBillingSendIntervalSeconds,
      },
    });
  }

  private presentSettings(settings: BillingAutomationSettings) {
    return {
      id: settings.id,
      enabled: settings.enabled,
      sendTime: settings.sendTime,
      sendIntervalSeconds: settings.sendIntervalSeconds,
      timezone: settings.timezone,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  private compareBillingReconcileItems(left: BillingReconcileItem, right: BillingReconcileItem) {
    return (
      left.baseScheduledFor.getTime() - right.baseScheduledFor.getTime() ||
      left.reference.dueDate.getTime() - right.reference.dueDate.getTime() ||
      left.reference.createdAt.getTime() - right.reference.createdAt.getTime() ||
      left.reference.id.localeCompare(right.reference.id) ||
      left.receivable.createdAt.getTime() - right.receivable.createdAt.getTime() ||
      left.receivable.id.localeCompare(right.receivable.id)
    );
  }

  private compareBillingReconcileGroups(left: BillingReconcileGroup, right: BillingReconcileGroup) {
    return (
      left.baseScheduledFor.getTime() - right.baseScheduledFor.getTime() ||
      left.client.createdAt.getTime() - right.client.createdAt.getTime() ||
      left.client.id.localeCompare(right.client.id)
    );
  }

  private normalizeSendIntervalSeconds(value: number) {
    if (
      !Number.isInteger(value) ||
      value < minBillingSendIntervalSeconds ||
      value > maxBillingSendIntervalSeconds
    ) {
      throw new BadRequestException('Intervalo entre mensagens de cobranca invalido.');
    }

    return value;
  }

  private currentCycle() {
    if (!this.receivableCycleService) {
      throw new ConflictException('Servico de ciclo financeiro indisponivel.');
    }

    return this.receivableCycleService;
  }

  private businessDayWindow(now: Date, timezone: string) {
    if (timezone !== defaultBillingTimezone) {
      throw new BadRequestException('Timezone de cobranca invalido.');
    }

    const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const yyyyMmDd = local.toISOString().slice(0, 10);

    return {
      start: new Date(`${yyyyMmDd}T00:00:00-03:00`),
      end: new Date(`${yyyyMmDd}T23:59:59.999-03:00`),
    };
  }

  private businessDateWindowFromDate(yyyyMmDd: string) {
    return {
      start: new Date(`${yyyyMmDd}T00:00:00-03:00`),
      end: new Date(`${yyyyMmDd}T23:59:59.999-03:00`),
    };
  }

  private endOfBusinessDate(value: string) {
    const date = parseBusinessDate(value);
    return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
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

  private presentTemplate(template: MessageTemplate) {
    return {
      ...template,
      variables: this.renderer.effectiveVariablesForType(template.type),
      supportedVariables: this.renderer.variables,
    };
  }

  private validateTemplateContent(content: string) {
    if (content.length > 1000) {
      throw new BadRequestException('Template deve ter no maximo 1000 caracteres.');
    }

    const unsupported = this.renderer.unsupportedVariables(content);

    if (unsupported.length) {
      throw new BadRequestException(
        `Variaveis nao suportadas no template: ${unsupported
          .map((variable) => `{{${variable}}}`)
          .join(', ')}.`,
      );
    }
  }

  private presentDispatch(dispatch: BillingDispatch) {
    const items = this.dispatchItems(dispatch);
    const totalAmount = items.length ? this.sumDispatchItems(items) : null;
    const distinctDueDates = [...new Set(items.map((item) => formatBusinessDate(item.dueDate)))];
    const primaryItem = items[0] ?? null;

    return {
      id: dispatch.id,
      clientId: dispatch.clientId,
      clientReferenceId: dispatch.clientReferenceId,
      receivableId: dispatch.receivableId,
      templateId: dispatch.templateId,
      whatsAppConnectionId: dispatch.whatsAppConnectionId,
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
      createdAt: dispatch.createdAt.toISOString(),
      updatedAt: dispatch.updatedAt.toISOString(),
      itemCount: items.length,
      totalAmount: totalAmount !== null ? totalAmount.toFixed(2) : null,
      dueDateLabel: distinctDueDates.length > 1 ? 'Vários' : (distinctDueDates[0] ?? null),
      items: items.map((item) => ({
        id: item.id,
        receivableId: item.receivable.id,
        clientReferenceId: item.clientReference.id,
        reference: item.clientReference.reference,
        amount: item.receivable.amount.toString(),
        dueDate: formatBusinessDate(item.receivable.dueDate),
        status: item.receivable.status,
      })),
      client: dispatch.client
        ? {
            id: dispatch.client.id,
            name: dispatch.client.name,
            reference:
              (items.length > 1
                ? `${items.length} referencias`
                : primaryItem?.clientReference.reference) ??
              dispatch.clientReference?.reference ??
              dispatch.client.reference,
            status:
              primaryItem?.clientReference.status ??
              dispatch.clientReference?.status ??
              dispatch.client.status,
            planName:
              (items.length > 1 ? null : primaryItem?.clientReference.plan?.name) ??
              dispatch.clientReference?.plan?.name ??
              null,
          }
        : null,
      clientReference:
        ((items.length === 1 ? primaryItem?.clientReference : null) ??
        dispatch.clientReference ??
        dispatch.receivable?.clientReference)
          ? {
              id: ((items.length === 1 ? primaryItem?.clientReference : null) ??
                dispatch.clientReference ??
                dispatch.receivable?.clientReference)!.id,
              reference: ((items.length === 1 ? primaryItem?.clientReference : null) ??
                dispatch.clientReference ??
                dispatch.receivable?.clientReference)!.reference,
              status: ((items.length === 1 ? primaryItem?.clientReference : null) ??
                dispatch.clientReference ??
                dispatch.receivable?.clientReference)!.status,
            }
          : null,
      receivable:
        (primaryItem?.receivable ?? dispatch.receivable)
          ? {
              id: (primaryItem?.receivable ?? dispatch.receivable)!.id,
              amount: (primaryItem?.receivable ?? dispatch.receivable)!.amount.toString(),
              dueDate: formatBusinessDate(
                (primaryItem?.receivable ?? dispatch.receivable)!.dueDate,
              ),
              status: (primaryItem?.receivable ?? dispatch.receivable)!.status,
            }
          : null,
      template: dispatch.template
        ? {
            id: dispatch.template.id,
            name: dispatch.template.name,
            type: dispatch.template.type,
            active: dispatch.template.active,
          }
        : null,
      connection: dispatch.whatsAppConnection
        ? {
            id: dispatch.whatsAppConnection.id,
            name: dispatch.whatsAppConnection.name,
            provider: dispatch.whatsAppConnection.provider,
          }
        : null,
    };
  }

  private isUniqueConstraint(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private sanitizeError(error: unknown) {
    const fallback = 'Falha ao enviar cobranca.';

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
