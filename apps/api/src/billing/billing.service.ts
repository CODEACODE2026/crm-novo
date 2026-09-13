import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type Client,
  type ClientReference,
  type BillingAutomationSettings,
  type MessageDispatch,
  type MessageTemplate,
  type Plan,
  type Receivable,
  type WhatsAppConnection,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
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

type BillingDispatch = MessageDispatch & {
  client: Client | null;
  clientReference: (ClientReference & { plan?: Plan | null }) | null;
  receivable:
    (Receivable & { clientReference?: (ClientReference & { plan?: Plan | null }) | null }) | null;
  template: MessageTemplate | null;
  whatsAppConnection: WhatsAppConnection | null;
};

@Injectable()
export class BillingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(TokenEncryptionService) private readonly encryption: TokenEncryptionService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BillingTemplateRenderer) private readonly renderer: BillingTemplateRenderer,
  ) {}

  async reconcile(now = new Date()) {
    const settings = await this.getAutomationSettings();
    const template = await this.ensureDefaultTemplate();
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

    if (!template.active || !connection) {
      const referencesCount = clients.reduce(
        (total, client) => total + this.billingReferencesForClient(client).length,
        0,
      );
      return { created, kept, canceled, skipped: referencesCount };
    }

    const clientReferences = clients.flatMap((client) =>
      this.billingReferencesForClient(client).map((reference) => ({ client, reference })),
    );

    for (const { client, reference } of clientReferences) {
      if (!this.isClientReferenceEligibleForScheduling(client, reference)) {
        skipped += 1;
        continue;
      }

      const receivable = this.findReceivableForReferenceDueDate(reference);
      const expectedKey = receivable
        ? this.buildIdempotencyKey(
            client.id,
            receivable.id,
            reference.dueDate,
            reference.billingNoticeDays,
            template.id,
          )
        : null;

      canceled += await this.cancelObsoleteFutureDispatches(client.id, reference.id, expectedKey);

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

      const scheduledFor = this.calculateScheduledFor(
        reference.dueDate,
        reference.billingNoticeDays,
        settings,
      );
      const renderedContent = this.renderForClientReference(
        template.content,
        client,
        reference,
        receivable,
      );
      const idempotencyKey = expectedKey ?? '';

      try {
        const rescheduled = await this.rescheduleExistingFutureDispatch(
          idempotencyKey,
          scheduledFor,
          now,
        );

        if (rescheduled) {
          kept += 1;
          continue;
        }

        const dispatch = await this.prisma.messageDispatch.create({
          data: {
            clientId: client.id,
            clientReferenceId: reference.id,
            receivableId: receivable.id,
            templateId: template.id,
            whatsAppConnectionId: connection.id,
            phone: normalizeBrazilPhone(client.phoneNormalized),
            body: renderedContent,
            renderedContent,
            origin: 'BILLING',
            status: 'SCHEDULED',
            requestId: idempotencyKey,
            idempotencyKey,
            scheduledFor,
            nextAttemptAt: scheduledFor,
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
          template: true,
          whatsAppConnection: true,
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
        take: 10,
      }),
    ]);

    return {
      scheduled,
      sent,
      failed,
      ignoredOrCanceled,
      scheduledToday,
      sentToday,
      failedToday,
      next: next.map((dispatch) => this.presentDispatch(dispatch)),
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
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });

    if (
      (dto.enabled === true && !current.enabled) ||
      (dto.sendTime !== undefined && dto.sendTime !== current.sendTime) ||
      (dto.timezone !== undefined && dto.timezone !== current.timezone)
    ) {
      await this.reconcile();
    }

    return this.presentSettings(next);
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

  async getDispatch(id: string) {
    const dispatch = await this.prisma.messageDispatch.findUnique({
      where: { id },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        receivable: { include: { clientReference: { include: { plan: true } } } },
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

    const updated = await this.prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });

    return this.presentTemplate(updated);
  }

  async previewTemplate(id: string, dto: PreviewMessageTemplateDto) {
    const template = await this.prisma.messageTemplate.findUnique({ where: { id } });

    if (!template) {
      throw new NotFoundException('Template nao encontrado.');
    }

    return {
      templateId: template.id,
      renderedContent: this.renderer.render(dto.content?.trim() || template.content, {
        nome: dto.name?.trim() || 'Bruno',
        primeiroNome: this.firstName(dto.name?.trim() || 'Bruno'),
        valor: dto.value?.trim() || 'R$ 50,00',
        vencimento: dto.dueDate?.trim() || '15/09/2026',
        plano: dto.plan?.trim() || 'Mensal',
        referencia: dto.reference?.trim() || 'bruno1499',
        pix: '000201...',
      }),
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
    const dispatch = await this.prisma.messageDispatch.findUnique({
      where: { id },
      include: {
        client: true,
        clientReference: { include: { plan: true } },
        receivable: { include: { clientReference: { include: { plan: true } } } },
        template: true,
        whatsAppConnection: true,
      },
    });

    if (!dispatch) {
      return { id, status: 'missing' };
    }

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
            template: true,
            whatsAppConnection: true,
          },
        });

        if (dispatch.client && dispatch.receivable) {
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
              description: `Vencimento: ${formatBusinessDate(dispatch.receivable.dueDate)}. Valor: ${this.formatCurrency(dispatch.receivable.amount)}.`,
              metadata: {
                messageDispatchId: id,
                receivableId: dispatch.receivable.id,
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
      dispatch.template.type !== 'BILLING_DUE' ||
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

    if (
      !dispatch.client ||
      intent.clientId !== dispatch.client.id ||
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
    clientReferenceId: string,
    expectedKey: string | null,
  ) {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        clientId,
        clientReferenceId,
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        ...(expectedKey ? { idempotencyKey: { not: expectedKey } } : {}),
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
    idempotencyKey: string,
    scheduledFor: Date,
    now: Date,
  ) {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        origin: 'BILLING',
        idempotencyKey,
        status: { in: ['SCHEDULED', 'FAILED'] },
        scheduledFor: { gt: now },
      },
      data: {
        scheduledFor,
        nextAttemptAt: scheduledFor,
        errorCode: null,
        errorMessage: null,
      },
    });

    return result.count > 0;
  }

  private async cancelNoLongerEligibleDispatches() {
    const result = await this.prisma.messageDispatch.updateMany({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [
          { client: { is: null } },
          { clientReference: { is: null } },
          { clientReference: { is: { status: { not: 'ATIVO' } } } },
          { receivable: { is: null } },
          { receivable: { is: { status: { not: 'PENDENTE' } } } },
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

  private buildDispatchWhere(query: ListBillingDispatchesDto): Prisma.MessageDispatchWhereInput {
    const where: Prisma.MessageDispatchWhereInput = { origin: 'BILLING' };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
        {
          receivable: { clientReference: { reference: { contains: search, mode: 'insensitive' } } },
        },
        { phone: { contains: search } },
      ];
    }

    if (query.startDate || query.endDate) {
      where.scheduledFor = {
        ...(query.startDate ? { gte: parseBusinessDate(query.startDate) } : {}),
        ...(query.endDate ? { lte: this.endOfBusinessDate(query.endDate) } : {}),
      };
    }

    if (query.dueDate) {
      where.receivable = { dueDate: parseBusinessDate(query.dueDate) };
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
      pix: '',
    });
  }

  private buildIdempotencyKey(
    clientId: string,
    receivableId: string,
    dueDate: Date,
    billingNoticeDays: number,
    templateId: string,
  ) {
    return `billing:${clientId}:${receivableId}:${formatBusinessDate(dueDate)}:${billingNoticeDays}:${templateId}`;
  }

  private parseIdempotencyKey(key: string) {
    const parts = key.split(':');

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
      },
    });
  }

  private presentSettings(settings: BillingAutomationSettings) {
    return {
      id: settings.id,
      enabled: settings.enabled,
      sendTime: settings.sendTime,
      timezone: settings.timezone,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
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
      variables: this.renderer.variables,
    };
  }

  private presentDispatch(dispatch: BillingDispatch) {
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
      client: dispatch.client
        ? {
            id: dispatch.client.id,
            name: dispatch.client.name,
            reference:
              dispatch.clientReference?.reference ??
              dispatch.receivable?.clientReference?.reference ??
              dispatch.client.reference,
            status:
              dispatch.clientReference?.status ??
              dispatch.receivable?.clientReference?.status ??
              dispatch.client.status,
            planName:
              dispatch.clientReference?.plan?.name ??
              dispatch.receivable?.clientReference?.plan?.name ??
              null,
          }
        : null,
      clientReference:
        (dispatch.clientReference ?? dispatch.receivable?.clientReference)
          ? {
              id: (dispatch.clientReference ?? dispatch.receivable?.clientReference)!.id,
              reference: (dispatch.clientReference ?? dispatch.receivable?.clientReference)!
                .reference,
              status: (dispatch.clientReference ?? dispatch.receivable?.clientReference)!.status,
            }
          : null,
      receivable: dispatch.receivable
        ? {
            id: dispatch.receivable.id,
            amount: dispatch.receivable.amount.toString(),
            dueDate: formatBusinessDate(dispatch.receivable.dueDate),
            status: dispatch.receivable.status,
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
