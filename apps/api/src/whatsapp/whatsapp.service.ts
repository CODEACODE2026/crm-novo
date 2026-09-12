import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageDispatch,
  MessageDispatchOrigin,
  Prisma,
  WhatsAppInboundMessageType,
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { PlansService } from '../plans/plans.service';
import {
  formatBusinessDate,
  getBusinessDateDay,
  parseBusinessDate,
} from '../clients/utils/business-date';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import {
  KiragoWebhookNormalizer,
  type NormalizedMessageType,
  type NormalizedWhatsAppMessage,
} from './kirago/kirago-webhook-normalizer';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import { ApproveWhatsAppPendingContactDto } from './dto/approve-whatsapp-pending-contact.dto';
import { CreateWhatsAppConnectionDto } from './dto/create-whatsapp-connection.dto';
import { ConfigureWhatsAppWebhookDto } from './dto/configure-whatsapp-webhook.dto';
import { IgnoreWhatsAppPendingContactDto } from './dto/ignore-whatsapp-pending-contact.dto';
import { ListWhatsAppPendingContactsDto } from './dto/list-whatsapp-pending-contacts.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';

const providerEvents = ['Message'];
const messagePreviewLimit = 80;
const pageSizeLimit = 100;

type InitialActivationResult = {
  initialReceivableId?: string | null;
  paymentIntentId?: string | null;
  messageDispatchId?: string | null;
  warning?: string | null;
  message?: string | null;
  reusedApproval?: boolean;
};

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    @Inject(PlansService)
    private readonly plansService: PlansService,
    @Inject(FinanceService)
    private readonly financeService: FinanceService,
    @Inject(TokenEncryptionService)
    private readonly encryption: TokenEncryptionService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(KiragoWebhookNormalizer)
    private readonly normalizer: KiragoWebhookNormalizer,
  ) {}

  async getConnection() {
    const connection = await this.findPrimaryConnection();
    return connection ? this.presentConnection(connection) : null;
  }

  async provisionConnection(dto: CreateWhatsAppConnectionDto) {
    const existing = await this.findPrimaryConnection();

    if (existing && existing.status !== 'ERROR') {
      throw new ConflictException('Ja existe uma conexao WhatsApp configurada.');
    }

    const instanceToken = this.generateInstanceToken();
    const webhookUrl = this.webhookUrl();
    const providerName = this.providerConnectionName(dto.name);
    const provisioned = await this.mapProviderError(() =>
      this.provider.provisionConnection({
        name: providerName,
        instanceToken,
        webhookUrl,
        events: providerEvents,
      }),
    );

    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        name: dto.name.trim(),
        provider: 'KIRAGO',
        providerUserId: provisioned.providerUserId,
        providerInstanceName: providerName,
        providerTokenEncrypted: this.encryption.encrypt(instanceToken),
        status: 'DISCONNECTED',
        webhookConfigured: provisioned.webhookConfigured,
      },
    });

    return this.presentConnection(connection);
  }

  async connect() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTING' },
    });

    try {
      await this.mapConnectionProviderError(connection, () => this.provider.connect(instanceToken));
    } catch (error) {
      if (!this.isRemoteInstanceMissingConflict(error)) {
        await this.prisma.whatsAppConnection.update({
          where: { id: connection.id },
          data: {
            status: 'DISCONNECTED',
            connected: false,
            loggedIn: false,
            lastStatusAt: new Date(),
          },
        });
      }
      throw error;
    }

    return this.refreshStatus(connection.id);
  }

  async refreshStatus(connectionId?: string) {
    const connection = connectionId
      ? await this.prisma.whatsAppConnection.findUnique({ where: { id: connectionId } })
      : await this.requireConnection();

    if (!connection) {
      throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const providerStatus = await this.mapConnectionProviderError(connection, () =>
      this.provider.getStatus(instanceToken),
    );
    const status = this.mapStatus(providerStatus.connected, providerStatus.loggedIn);
    const connectedAt =
      status === 'CONNECTED' && !connection.connectedAt ? new Date() : connection.connectedAt;

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status,
        connected: providerStatus.connected,
        loggedIn: providerStatus.loggedIn,
        phone: providerStatus.phone ?? connection.phone,
        lastStatusAt: new Date(),
        connectedAt,
      },
    });

    return this.presentConnection(updated);
  }

  async getQrCode() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const qrCode = await this.mapProviderError(() => this.provider.getQrCode(instanceToken));

    if (!qrCode) {
      throw new BadRequestException('QR Code nao disponivel para esta conexao.');
    }

    return { qrCode };
  }

  async disconnect() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.mapProviderError(() => this.provider.disconnect(instanceToken));

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        connected: false,
        loggedIn: false,
        lastStatusAt: new Date(),
      },
    });

    return this.presentConnection(updated);
  }

  async logout() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.mapProviderError(() => this.provider.logout(instanceToken));

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        connected: false,
        loggedIn: false,
        connectedAt: null,
        lastStatusAt: new Date(),
      },
    });

    return this.presentConnection(updated);
  }

  async getWebhook() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    return this.mapProviderError(() => this.provider.getWebhook(instanceToken));
  }

  async configureWebhook(dto: ConfigureWhatsAppWebhookDto = {}) {
    const connection = await this.requireConnection();
    const webhookUrl = this.webhookUrl(dto.webhookUrl);
    const events = dto.events?.length ? dto.events : providerEvents;
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.mapProviderError(() =>
      this.provider.configureWebhook(instanceToken, webhookUrl, events),
    );

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { webhookConfigured: true },
    });

    return this.presentConnection(updated);
  }

  async sendManualMessage(dto: SendWhatsAppMessageDto, actorUserId: string) {
    const connection = await this.requireConnection();

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp nao esta operacional.');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    if (!client.phoneNormalized) {
      throw new BadRequestException('Cliente nao possui telefone valido.');
    }

    const phone = normalizeBrazilPhone(client.phoneNormalized);
    const body = dto.body.trim();

    if (!body) {
      throw new BadRequestException('Mensagem obrigatoria.');
    }

    const requestId = dto.requestId?.trim() || randomUUID();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    const { dispatch, created } = await this.createPendingDispatch({
      clientId: client.id,
      connectionId: connection.id,
      phone,
      body,
      requestId,
    });

    if (!created || dispatch.status === 'SENT') {
      return this.presentDispatch(dispatch);
    }

    try {
      const result = await this.mapProviderError(() =>
        this.provider.sendText(instanceToken, { phone, body, requestId }),
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        const sent = await tx.messageDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            errorMessage: null,
          },
          include: { client: true, whatsAppConnection: true },
        });

        await tx.clientEvent.create({
          data: {
            clientId: client.id,
            type: 'WHATSAPP_MESSAGE_SENT',
            title: 'Mensagem manual enviada pelo WhatsApp.',
            description: this.messagePreview(body),
            metadata: {
              messageDispatchId: sent.id,
              requestId,
            },
            createdByUserId: actorUserId,
          },
        });

        return sent;
      });

      return this.presentDispatch(updated);
    } catch (error) {
      const updated = await this.prisma.messageDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'FAILED',
          errorMessage: this.sanitizeError(error),
        },
        include: { client: true, whatsAppConnection: true },
      });

      return this.presentDispatch(updated);
    }
  }

  async listMessages() {
    const messages = await this.prisma.messageDispatch.findMany({
      include: { client: true, whatsAppConnection: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return messages.map((message) => this.presentDispatch(message));
  }

  async providerHealth() {
    try {
      return await this.provider.health();
    } catch {
      return { online: false, version: null };
    }
  }

  async listPendingContacts(query: ListWhatsAppPendingContactsDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, pageSizeLimit);
    const where = this.buildPendingContactWhere(query);
    const orderBy = this.buildPendingContactOrderBy(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsAppPendingContact.findMany({
        where,
        include: { whatsAppConnection: true, client: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.whatsAppPendingContact.count({ where }),
    ]);

    return {
      items: items.map((contact) => this.presentPendingContact(contact)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async pendingContactsSummary() {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [pending, approvedToday, ignored] = await this.prisma.$transaction([
      this.prisma.whatsAppPendingContact.count({ where: { status: 'PENDENTE' } }),
      this.prisma.whatsAppPendingContact.count({
        where: { status: 'APROVADO', approvedAt: { gte: todayStart } },
      }),
      this.prisma.whatsAppPendingContact.count({ where: { status: 'IGNORADO' } }),
    ]);

    return { pending, approvedToday, ignored };
  }

  async getPendingContact(id: string) {
    const contact = await this.prisma.whatsAppPendingContact.findUnique({
      where: { id },
      include: {
        whatsAppConnection: true,
        client: true,
        inboundMessages: { orderBy: { receivedAt: 'desc' }, take: 20 },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contato da lista de espera nao encontrado.');
    }

    return this.presentPendingContactDetail(contact);
  }

  async ignorePendingContact(id: string, dto: IgnoreWhatsAppPendingContactDto) {
    const current = await this.prisma.whatsAppPendingContact.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Contato da lista de espera nao encontrado.');
    }

    if (current.status !== 'PENDENTE') {
      throw new BadRequestException('Somente contatos pendentes podem ser ignorados.');
    }

    const contact = await this.prisma.whatsAppPendingContact.update({
      where: { id },
      data: {
        status: 'IGNORADO',
        ignoredAt: new Date(),
        ignoreReason: this.optionalTrim(dto.reason),
      },
      include: { whatsAppConnection: true, client: true },
    });

    return this.presentPendingContact(contact);
  }

  async reopenPendingContact(id: string) {
    const current = await this.prisma.whatsAppPendingContact.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Contato da lista de espera nao encontrado.');
    }

    if (current.status !== 'IGNORADO') {
      throw new BadRequestException('Somente contatos ignorados podem ser reabertos.');
    }

    const contact = await this.prisma.whatsAppPendingContact.update({
      where: { id },
      data: { status: 'PENDENTE', ignoredAt: null, ignoreReason: null },
      include: { whatsAppConnection: true, client: true },
    });

    return this.presentPendingContact(contact);
  }

  async approvePendingContact(
    id: string,
    dto: ApproveWhatsAppPendingContactDto,
    actorUserId: string,
  ) {
    const pending = await this.prisma.whatsAppPendingContact.findUnique({ where: { id } });

    if (!pending) {
      throw new NotFoundException('Contato da lista de espera nao encontrado.');
    }

    if (pending.status === 'APROVADO') {
      if (!pending.clientId) {
        throw new ConflictException('Contato ja aprovado sem cliente vinculado.');
      }

      const approvedClient = await this.prisma.client.findUnique({
        where: { id: pending.clientId },
        include: { plan: true },
      });

      if (!approvedClient) {
        throw new ConflictException(
          'Contato ja aprovado, mas cliente vinculado nao foi encontrado.',
        );
      }

      return this.presentApprovedClient(approvedClient, {
        reusedApproval: true,
        message: 'Contato ja aprovado anteriormente.',
      });
    }

    const dueDate = parseBusinessDate(dto.dueDate);
    await this.plansService.ensureActivePlan(dto.planId);
    const generateInitialReceivable = dto.generateInitialReceivable ?? true;
    const sendPixWhatsAppNow = generateInitialReceivable && (dto.sendPixWhatsAppNow ?? true);

    const existingClient = await this.prisma.client.findUnique({
      where: { phoneNormalized: pending.phoneNormalized },
    });

    if (existingClient) {
      throw new ConflictException('Ja existe um cliente cadastrado com este telefone.');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.client.create({
          data: {
            name: dto.name.trim(),
            phone: pending.phone,
            phoneNormalized: pending.phoneNormalized,
            email: this.optionalTrim(dto.email),
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            notes: this.optionalTrim(dto.notes),
            status: 'PENDENTE_PAGAMENTO',
          },
          include: { plan: true },
        });

        const initialReceivable = generateInitialReceivable
          ? await tx.receivable.create({
              data: {
                clientId: created.id,
                purpose: 'INITIAL_ACTIVATION',
                description: `Cobranca inicial de ativacao - ${created.plan.name}`,
                amount: dto.recurringValue,
                dueDate,
                status: 'PENDENTE',
              },
            })
          : null;

        await tx.whatsAppPendingContact.update({
          where: { id },
          data: {
            status: 'APROVADO',
            clientId: created.id,
            approvedAt: new Date(),
            ignoredAt: null,
            ignoreReason: null,
          },
        });

        await tx.whatsAppInboundMessage.updateMany({
          where: { pendingContactId: id },
          data: { clientId: created.id },
        });

        await tx.clientEvent.create({
          data: {
            clientId: created.id,
            type: 'CLIENT_CREATED',
            title: 'Cliente criado aguardando primeiro pagamento.',
            description: generateInitialReceivable
              ? 'Cliente criado a partir da Lista de Espera com cobranca inicial de ativacao.'
              : 'Cliente criado a partir da Lista de Espera sem cobranca inicial.',
            metadata: {
              pendingContactId: id,
              initialReceivableId: initialReceivable?.id ?? null,
              status: 'PENDENTE_PAGAMENTO',
            },
            createdByUserId: actorUserId,
          },
        });

        return { client: created, initialReceivable };
      });

      const activation = await this.processInitialActivationAfterApproval({
        clientId: result.client.id,
        receivableId: result.initialReceivable?.id ?? null,
        sendPixWhatsAppNow,
        actorUserId,
      });

      return this.presentApprovedClient(result.client, activation);
    } catch (error) {
      this.handleClientCreationError(error);
    }
  }

  private async processInitialActivationAfterApproval(input: {
    clientId: string;
    receivableId: string | null;
    sendPixWhatsAppNow: boolean;
    actorUserId: string;
  }): Promise<InitialActivationResult> {
    if (!input.receivableId) {
      return { message: 'Cliente cadastrado aguardando primeiro pagamento.' };
    }

    const result: InitialActivationResult = {
      initialReceivableId: input.receivableId,
      message: 'Cliente cadastrado e cobranca inicial criada.',
    };

    if (!input.sendPixWhatsAppNow) {
      return result;
    }

    let intent: Awaited<ReturnType<FinanceService['createReceivablePix']>>;

    try {
      intent = await this.financeService.createReceivablePix(input.receivableId, input.actorUserId);
      result.paymentIntentId = intent.id;
    } catch (error) {
      return {
        ...result,
        warning: 'Cliente cadastrado e cobranca criada, mas nao foi possivel gerar/enviar o PIX.',
        message: this.sanitizeError(error),
      };
    }

    try {
      const dispatch = await this.sendInitialActivationPixMessage(
        input.clientId,
        input.receivableId,
        intent,
        input.actorUserId,
      );
      result.messageDispatchId = dispatch.id;
      if (dispatch.status !== 'SENT') {
        return {
          ...result,
          warning: 'Cliente cadastrado e cobranca criada, mas nao foi possivel gerar/enviar o PIX.',
          message: dispatch.errorMessage ?? 'Falha ao enviar PIX pelo WhatsApp.',
        };
      }

      result.message = 'Cliente cadastrado, cobranca criada e PIX enviado pelo WhatsApp.';
      return result;
    } catch (error) {
      return {
        ...result,
        warning: 'Cliente cadastrado e cobranca criada, mas nao foi possivel gerar/enviar o PIX.',
        message: this.sanitizeError(error),
      };
    }
  }

  private async sendInitialActivationPixMessage(
    clientId: string,
    receivableId: string,
    intent: Awaited<ReturnType<FinanceService['createReceivablePix']>>,
    actorUserId: string,
  ) {
    const [connection, receivable, template] = await Promise.all([
      this.requireConnection(),
      this.prisma.receivable.findUnique({
        where: { id: receivableId },
        include: { client: { include: { plan: true } } },
      }),
      this.prisma.messageTemplate.findFirst({
        where: { type: 'INITIAL_ACTIVATION', active: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!receivable || receivable.clientId !== clientId) {
      throw new NotFoundException('Cobranca inicial nao encontrada.');
    }

    if (!template) {
      throw new NotFoundException('Template de ativacao inicial nao configurado.');
    }

    if (!intent.pixCopyPaste) {
      throw new ConflictException('PIX sem copia e cola disponivel.');
    }

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp nao esta operacional.');
    }

    const phone = normalizeBrazilPhone(receivable.client.phoneNormalized);
    const body = this.renderInitialActivationTemplate(template.content, {
      nome: receivable.client.name,
      primeiroNome: this.firstName(receivable.client.name),
      valor: this.formatCurrency(receivable.amount),
      vencimento: this.formatDisplayDate(receivable.dueDate),
      plano: receivable.client.plan.name,
      referencia: receivable.client.reference,
      pix: intent.pixCopyPaste,
    });
    const requestId = `initial-activation:${clientId}:${receivableId}`;
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    const { dispatch, created } = await this.createPendingDispatch({
      clientId,
      connectionId: connection.id,
      receivableId,
      templateId: template.id,
      phone,
      body,
      requestId,
      origin: 'INITIAL_ACTIVATION',
      idempotencyKey: requestId,
    });

    if (!created || dispatch.status === 'SENT') {
      return this.presentDispatch(dispatch);
    }

    try {
      const sentResult = await this.mapProviderError(() =>
        this.provider.sendText(instanceToken, { phone, body, requestId }),
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        const sent = await tx.messageDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'SENT',
            providerMessageId: sentResult.providerMessageId,
            sentAt: new Date(),
            errorMessage: null,
          },
          include: { client: true, whatsAppConnection: true },
        });

        await tx.clientEvent.create({
          data: {
            clientId,
            type: 'WHATSAPP_MESSAGE_SENT',
            title: 'PIX inicial enviado pelo WhatsApp.',
            description: this.messagePreview(body),
            metadata: {
              messageDispatchId: sent.id,
              receivableId,
              paymentIntentId: intent.id,
              requestId,
            },
            createdByUserId: actorUserId,
          },
        });

        return sent;
      });

      return this.presentDispatch(updated);
    } catch (error) {
      const updated = await this.prisma.messageDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'FAILED',
          errorMessage: this.sanitizeError(error),
        },
        include: { client: true, whatsAppConnection: true },
      });

      return this.presentDispatch(updated);
    }
  }

  async receiveWebhook(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload invalido.');
    }

    const normalized = this.normalizer.normalize(payload);

    if (!normalized) {
      return { received: true, processed: false, reason: 'ignored_event' };
    }

    if (normalized.isGroup) {
      return { received: true, processed: false, reason: 'ignored_group' };
    }

    if (normalized.direction === 'OUTGOING') {
      return { received: true, processed: false, reason: 'ignored_outgoing' };
    }

    if (!normalized.phone) {
      return { received: true, processed: false, reason: 'missing_phone' };
    }

    const incoming = { ...normalized, phone: normalized.phone };
    const connection = await this.findConnectionForWebhook(normalized);

    if (!connection) {
      return { received: true, processed: false, reason: 'connection_not_found' };
    }

    const result = await this.processIncomingWebhook(connection.id, incoming);
    return { received: true, ...result };
  }

  private async processIncomingWebhook(
    connectionId: string,
    normalized: NormalizedWhatsAppMessage & { phone: string },
  ) {
    const client = await this.prisma.client.findUnique({
      where: { phoneNormalized: normalized.phone },
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const inbound = await tx.whatsAppInboundMessage.create({
          data: {
            whatsAppConnectionId: connectionId,
            clientId: client?.id ?? null,
            providerMessageId: normalized.messageId,
            phoneNormalized: normalized.phone,
            direction: normalized.direction,
            messageType: this.toPrismaMessageType(normalized.messageType),
            text: normalized.text,
            messageTimestamp: normalized.messageTimestamp,
            receivedAt: normalized.receivedAt,
            contactName: normalized.contactName,
            instanceName: normalized.instanceName,
            providerUserId: normalized.providerUserId,
            mediaMetadata: (normalized.mediaMetadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
        });

        if (client) {
          return { processed: true, action: 'client_exists', inboundMessageId: inbound.id };
        }

        const contact = await tx.whatsAppPendingContact.upsert({
          where: {
            whatsAppConnectionId_phoneNormalized: {
              whatsAppConnectionId: connectionId,
              phoneNormalized: normalized.phone,
            },
          },
          create: {
            whatsAppConnectionId: connectionId,
            phone: normalized.phone,
            phoneNormalized: normalized.phone,
            contactName: normalized.contactName,
            status: 'PENDENTE',
            firstMessageText: normalized.text,
            lastMessageText: normalized.text,
            firstMessageType: this.toPrismaMessageType(normalized.messageType),
            lastMessageType: this.toPrismaMessageType(normalized.messageType),
            firstMessageId: normalized.messageId,
            lastMessageId: normalized.messageId,
            firstContactAt: normalized.messageTimestamp ?? normalized.receivedAt,
            lastContactAt: normalized.messageTimestamp ?? normalized.receivedAt,
            messageCount: 1,
          },
          update: this.pendingContactWebhookUpdate(normalized),
        });

        await tx.whatsAppInboundMessage.update({
          where: { id: inbound.id },
          data: { pendingContactId: contact.id },
        });

        return {
          processed: true,
          action: 'pending_contact_upserted',
          pendingContactId: contact.id,
          inboundMessageId: inbound.id,
        };
      });

      return result;
    } catch (error) {
      if (this.isDuplicateInboundMessage(error)) {
        return { processed: true, action: 'duplicate_message' };
      }

      throw error;
    }
  }

  private findConnectionForWebhook(normalized: NormalizedWhatsAppMessage) {
    if (normalized.providerUserId) {
      return this.prisma.whatsAppConnection.findFirst({
        where: { provider: 'KIRAGO', providerUserId: normalized.providerUserId },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!normalized.instanceName) {
      return null;
    }

    const filters: Prisma.WhatsAppConnectionWhereInput[] = [
      { providerInstanceName: normalized.instanceName },
      { name: normalized.instanceName },
    ];

    return this.prisma.whatsAppConnection.findFirst({
      where: { provider: 'KIRAGO', OR: filters },
      orderBy: { createdAt: 'asc' },
    });
  }

  private buildPendingContactWhere(
    query: ListWhatsAppPendingContactsDto,
  ): Prisma.WhatsAppPendingContactWhereInput {
    const where: Prisma.WhatsAppPendingContactWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.connectionId) {
      where.whatsAppConnectionId = query.connectionId;
    }

    if (query.search) {
      const search = query.search.trim();
      const normalizedPhone = this.tryNormalizePhone(search);
      where.OR = [
        { contactName: { contains: search, mode: 'insensitive' } },
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
      ];
    }

    if (query.startDate || query.endDate) {
      where.lastContactAt = {
        ...(query.startDate ? { gte: parseBusinessDate(query.startDate) } : {}),
        ...(query.endDate ? { lte: parseBusinessDate(query.endDate) } : {}),
      };
    }

    return where;
  }

  private buildPendingContactOrderBy(query: ListWhatsAppPendingContactsDto) {
    const sortBy = query.sortBy ?? 'lastContactAt';
    const sortDirection = query.sortDirection ?? 'desc';

    return { [sortBy]: sortDirection };
  }

  private pendingContactWebhookUpdate(
    normalized: NormalizedWhatsAppMessage & { phone: string },
  ): Prisma.WhatsAppPendingContactUpdateInput {
    return {
      ...(normalized.contactName ? { contactName: normalized.contactName } : {}),
      lastMessageText: normalized.text,
      lastMessageType: this.toPrismaMessageType(normalized.messageType),
      lastMessageId: normalized.messageId,
      lastContactAt: normalized.messageTimestamp ?? normalized.receivedAt,
      messageCount: { increment: 1 },
    };
  }

  private async ensurePendingContactExists(id: string) {
    const exists = await this.prisma.whatsAppPendingContact.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Contato da lista de espera nao encontrado.');
    }
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

  private async createPendingDispatch(input: {
    clientId: string;
    connectionId: string;
    receivableId?: string;
    templateId?: string;
    phone: string;
    body: string;
    requestId: string;
    origin?: MessageDispatchOrigin;
    idempotencyKey?: string;
  }) {
    try {
      const dispatch = await this.prisma.messageDispatch.create({
        data: {
          clientId: input.clientId,
          whatsAppConnectionId: input.connectionId,
          phone: input.phone,
          body: input.body,
          requestId: input.requestId,
          origin: input.origin ?? 'MANUAL',
          status: 'PENDING',
          ...(input.receivableId ? { receivableId: input.receivableId } : {}),
          ...(input.templateId ? { templateId: input.templateId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        },
        include: { client: true, whatsAppConnection: true },
      });

      return { dispatch, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.messageDispatch.findUniqueOrThrow({
          where: { requestId: input.requestId },
          include: { client: true, whatsAppConnection: true },
        });
        return { dispatch: existing, created: false };
      }

      throw error;
    }
  }

  private async findPrimaryConnection() {
    const active = await this.prisma.whatsAppConnection.findFirst({
      where: { status: { not: 'ERROR' } },
      orderBy: { createdAt: 'desc' },
    });

    if (active) return active;

    return this.prisma.whatsAppConnection.findFirst({ orderBy: { createdAt: 'desc' } });
  }

  private async requireConnection() {
    const connection = await this.findPrimaryConnection();

    if (!connection) {
      throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }

    return connection;
  }

  private generateInstanceToken() {
    return randomBytes(32).toString('base64url');
  }

  private webhookUrl(customUrl?: string) {
    const configuredUrl =
      customUrl?.trim() || this.config.get<string>('CRM_API_PUBLIC_URL')?.trim();

    if (!configuredUrl) {
      throw new ServiceUnavailableException('CRM_API_PUBLIC_URL nao configurada.');
    }

    let url: URL;

    try {
      url = customUrl?.trim()
        ? new URL(configuredUrl)
        : new URL('/whatsapp/webhook/kirago', configuredUrl);
    } catch {
      throw new BadRequestException('URL publica do webhook WhatsApp invalida.');
    }

    this.ensurePublicHttpsWebhookUrl(url);
    return url.toString();
  }

  private ensurePublicHttpsWebhookUrl(url: URL) {
    if (url.protocol !== 'https:') {
      throw new BadRequestException('Webhook WhatsApp exige URL publica HTTPS.');
    }

    if (this.isLocalOrPrivateHost(url.hostname)) {
      throw new BadRequestException('Webhook WhatsApp nao pode usar localhost ou IP privado.');
    }
  }

  private isLocalOrPrivateHost(hostname: string) {
    const host = hostname.toLowerCase();

    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      return true;
    }

    if (host === '::1' || host === '[::1]' || host === '0.0.0.0') {
      return true;
    }

    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
      return true;
    }

    const match = host.match(/^172\.(\d{1,2})\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  }

  private providerConnectionName(name: string) {
    const slug = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `crm-novo-${slug || 'principal'}-${randomBytes(3).toString('hex')}`;
  }

  private mapStatus(connected: boolean, loggedIn: boolean): WhatsAppConnectionStatus {
    if (connected && loggedIn) return 'CONNECTED';
    if (connected && !loggedIn) return 'QR_REQUIRED';
    return 'DISCONNECTED';
  }

  private async mapProviderError<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof KiragoProviderError) {
        this.throwMappedProviderError(error);
      }

      throw error;
    }
  }

  private async mapConnectionProviderError<T>(
    connection: WhatsAppConnection,
    operation: () => Promise<T>,
  ) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof KiragoProviderError && error.code === 'KIRAGO_INSTANCE_AUTH_FAILED') {
        const remote = await this.mapProviderError(() =>
          this.provider.findRemoteConnection({
            providerUserId: connection.providerUserId,
            instanceName: connection.providerInstanceName ?? connection.name,
          }),
        );

        if (!remote.exists) {
          await this.markConnectionRemoteMissing(connection.id);
          throw new ConflictException(
            'A instancia Kirago desta conexao nao existe mais. Crie uma nova conexao para gerar um novo token sem apagar o historico.',
          );
        }
      }

      if (error instanceof KiragoProviderError) {
        this.throwMappedProviderError(error);
      }

      throw error;
    }
  }

  private throwMappedProviderError(error: KiragoProviderError): never {
    if (error.code === 'KIRAGO_TIMEOUT' || error.code === 'KIRAGO_UNAVAILABLE') {
      throw new ServiceUnavailableException(error.message);
    }

    if (error.code === 'KIRAGO_ADMIN_AUTH_FAILED' || error.code === 'KIRAGO_INSTANCE_AUTH_FAILED') {
      throw new ServiceUnavailableException('Falha de autenticacao com provider WhatsApp.');
    }

    throw new BadRequestException(error.message);
  }

  private async markConnectionRemoteMissing(connectionId: string) {
    await this.prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        status: 'ERROR',
        connected: false,
        loggedIn: false,
        connectedAt: null,
        lastStatusAt: new Date(),
      },
    });
  }

  private isRemoteInstanceMissingConflict(error: unknown) {
    return (
      error instanceof ConflictException &&
      error.message.includes('instancia Kirago desta conexao nao existe mais')
    );
  }

  private presentConnection(connection: WhatsAppConnection) {
    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      providerUserId: connection.providerUserId,
      phone: connection.phone,
      status: connection.status,
      connected: connection.connected,
      loggedIn: connection.loggedIn,
      webhookConfigured: connection.webhookConfigured,
      lastStatusAt: connection.lastStatusAt,
      connectedAt: connection.connectedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private presentDispatch(
    dispatch: MessageDispatch & {
      client?: { id: string; name: string; reference: string } | null;
      whatsAppConnection?: { id: string; name: string; provider: string } | null;
    },
  ) {
    return {
      id: dispatch.id,
      clientId: dispatch.clientId,
      whatsAppConnectionId: dispatch.whatsAppConnectionId,
      phone: dispatch.phone,
      body: dispatch.body,
      origin: dispatch.origin,
      status: dispatch.status,
      requestId: dispatch.requestId,
      providerMessageId: dispatch.providerMessageId,
      errorMessage: dispatch.errorMessage,
      sentAt: dispatch.sentAt,
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
      client: dispatch.client
        ? {
            id: dispatch.client.id,
            name: dispatch.client.name,
            reference: dispatch.client.reference,
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

  private presentPendingContact(
    contact: Prisma.WhatsAppPendingContactGetPayload<{
      include: { whatsAppConnection: true; client: true };
    }>,
  ) {
    return {
      id: contact.id,
      whatsAppConnectionId: contact.whatsAppConnectionId,
      phone: contact.phone,
      phoneNormalized: contact.phoneNormalized,
      contactName: contact.contactName,
      status: contact.status,
      firstMessageText: contact.firstMessageText,
      lastMessageText: contact.lastMessageText,
      firstMessageType: this.fromPrismaMessageType(contact.firstMessageType),
      lastMessageType: this.fromPrismaMessageType(contact.lastMessageType),
      firstMessageId: contact.firstMessageId,
      lastMessageId: contact.lastMessageId,
      firstContactAt: contact.firstContactAt,
      lastContactAt: contact.lastContactAt,
      messageCount: contact.messageCount,
      clientId: contact.clientId,
      approvedAt: contact.approvedAt,
      ignoredAt: contact.ignoredAt,
      ignoreReason: contact.ignoreReason,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
      connection: {
        id: contact.whatsAppConnection.id,
        name: contact.whatsAppConnection.name,
        provider: contact.whatsAppConnection.provider,
      },
      client: contact.client
        ? {
            id: contact.client.id,
            name: contact.client.name,
            reference: contact.client.reference,
          }
        : null,
    };
  }

  private presentPendingContactDetail(
    contact: Prisma.WhatsAppPendingContactGetPayload<{
      include: {
        whatsAppConnection: true;
        client: true;
        inboundMessages: { orderBy: { receivedAt: 'desc' }; take: 20 };
      };
    }>,
  ) {
    return {
      ...this.presentPendingContact(contact),
      inboundMessages: contact.inboundMessages.map((message) => ({
        id: message.id,
        providerMessageId: message.providerMessageId,
        phoneNormalized: message.phoneNormalized,
        direction: message.direction,
        messageType: this.fromPrismaMessageType(message.messageType),
        text: message.text,
        messageTimestamp: message.messageTimestamp,
        receivedAt: message.receivedAt,
        contactName: message.contactName,
        mediaMetadata: message.mediaMetadata,
      })),
    };
  }

  private presentApprovedClient(
    client: Prisma.ClientGetPayload<{ include: { plan: true } }>,
    activation?: InitialActivationResult,
  ) {
    return {
      ...client,
      recurringValue: client.recurringValue.toString(),
      dueDate: formatBusinessDate(client.dueDate),
      initialActivation: activation ?? null,
      plan: {
        ...client.plan,
        defaultValue: client.plan.defaultValue.toString(),
      },
    };
  }

  private messagePreview(body: string) {
    return body.length > messagePreviewLimit
      ? `${body.slice(0, messagePreviewLimit).trim()}...`
      : body;
  }

  private renderInitialActivationTemplate(
    content: string,
    context: Record<
      'nome' | 'primeiroNome' | 'valor' | 'vencimento' | 'plano' | 'referencia' | 'pix',
      string
    >,
  ) {
    return content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, variable: string) => {
      if (variable in context) {
        return context[variable as keyof typeof context];
      }

      return '';
    });
  }

  private firstName(name: string) {
    return name.trim().split(/\s+/)[0] || name.trim();
  }

  private formatDisplayDate(date: Date) {
    const parts = formatBusinessDate(date).split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  private formatCurrency(value: Prisma.Decimal | number | string) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
      Number(value),
    );
  }

  private sanitizeError(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 240);
    }

    return 'Falha ao enviar mensagem WhatsApp.';
  }

  private toPrismaMessageType(type: NormalizedMessageType): WhatsAppInboundMessageType {
    const map: Record<NormalizedMessageType, WhatsAppInboundMessageType> = {
      text: 'TEXT',
      image: 'IMAGE',
      video: 'VIDEO',
      audio: 'AUDIO',
      document: 'DOCUMENT',
      sticker: 'STICKER',
      location: 'LOCATION',
      live_location: 'LIVE_LOCATION',
      contact: 'CONTACT',
      contacts: 'CONTACTS',
      reaction: 'REACTION',
      button_response: 'BUTTON_RESPONSE',
      list_response: 'LIST_RESPONSE',
      interactive_response: 'INTERACTIVE_RESPONSE',
      unknown: 'UNKNOWN',
    };

    return map[type];
  }

  private fromPrismaMessageType(type: WhatsAppInboundMessageType): NormalizedMessageType {
    const map: Record<WhatsAppInboundMessageType, NormalizedMessageType> = {
      TEXT: 'text',
      IMAGE: 'image',
      VIDEO: 'video',
      AUDIO: 'audio',
      DOCUMENT: 'document',
      STICKER: 'sticker',
      LOCATION: 'location',
      LIVE_LOCATION: 'live_location',
      CONTACT: 'contact',
      CONTACTS: 'contacts',
      REACTION: 'reaction',
      BUTTON_RESPONSE: 'button_response',
      LIST_RESPONSE: 'list_response',
      INTERACTIVE_RESPONSE: 'interactive_response',
      UNKNOWN: 'unknown',
    };

    return map[type];
  }

  private isDuplicateInboundMessage(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
    return target.includes('providerMessageId');
  }

  private handleClientCreationError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';

      if (target.includes('reference')) {
        throw new ConflictException('Ja existe um cliente com esta referencia.');
      }

      if (target.includes('phoneNormalized')) {
        throw new ConflictException('Ja existe um cliente cadastrado com este telefone.');
      }
    }

    throw error;
  }
}
