import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageDispatch,
  MessageDispatchOrigin,
  Prisma,
  ReceivableStatus,
  WhatsAppConversation,
  WhatsAppConversationMessageType,
  WhatsAppInboundMessageType,
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppMessage,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import { PlansService } from '../plans/plans.service';
import { ReferralsService } from '../referrals/referrals.service';
import {
  formatBusinessDate,
  getBusinessDateDay,
  parseBusinessDate,
} from '../clients/utils/business-date';
import {
  brazilCanonicalMobileToLegacyVariant,
  brazilLegacyMobileVariant,
  normalizeBrazilPhone,
} from '../clients/utils/phone-normalizer';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import {
  KiragoWebhookNormalizer,
  type NormalizedKiragoWebhook,
  type NormalizedMessageType,
  type NormalizedWhatsAppReceipt,
  type NormalizedWhatsAppMessage,
} from './kirago/kirago-webhook-normalizer';
import {
  WHATSAPP_PROVIDER,
  type DownloadMediaType,
  type DownloadMediaInput,
  type SendTextInput,
  type WhatsAppProvider,
} from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import {
  type StoredWhatsAppMedia,
  WhatsAppMediaStorageService,
} from './whatsapp-media-storage.service';
import { WhatsAppVoiceConversionService } from './whatsapp-voice-conversion.service';
import { ApproveWhatsAppPendingContactDto } from './dto/approve-whatsapp-pending-contact.dto';
import { CreateWhatsAppConnectionDto } from './dto/create-whatsapp-connection.dto';
import { ConfigureWhatsAppWebhookDto } from './dto/configure-whatsapp-webhook.dto';
import { IgnoreWhatsAppPendingContactDto } from './dto/ignore-whatsapp-pending-contact.dto';
import { LinkWhatsAppConversationClientDto } from './dto/link-whatsapp-conversation-client.dto';
import { ListWhatsAppConversationMessagesDto } from './dto/list-whatsapp-conversation-messages.dto';
import { ListWhatsAppConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { ListWhatsAppPendingContactsDto } from './dto/list-whatsapp-pending-contacts.dto';
import { SearchWhatsAppMessagesDto } from './dto/search-whatsapp-messages.dto';
import { SendWhatsAppConversationMessageDto } from './dto/send-whatsapp-conversation-message.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { StartWhatsAppConversationDto } from './dto/start-whatsapp-conversation.dto';
import { WhatsAppMessageContextDto } from './dto/whatsapp-message-context.dto';
import { buildPixWhatsAppTemplate } from './pix-whatsapp-template';
import { buildWhatsAppMessageCreateDataForConversation } from './whatsapp-conversation-domain';
import { WhatsAppRealtimeService } from './whatsapp-realtime.service';

const providerEvents = ['Message', 'ReadReceipt'];
const messagePreviewLimit = 80;
const quotedTextLimit = 240;
const pageSizeLimit = 100;
const messageSearchMinLength = 2;
const messageSearchSnippetRadius = 56;
const allowedImageMimeTypes = new Set(['image/jpeg', 'image/png']);
const allowedDocumentMimeTypes = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
  'application/vnd.android.package-archive',
]);
const allowedDocumentExtensions = new Set([
  'pdf',
  'txt',
  'doc',
  'docx',
  'zip',
  'rar',
  'psd',
  'apk',
]);
const documentMimeTypesByExtension: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf']),
  txt: new Set(['text/plain']),
  doc: new Set(['application/msword']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  zip: new Set(['application/zip', 'application/x-zip-compressed']),
  rar: new Set(['application/vnd.rar', 'application/x-rar-compressed']),
  psd: new Set(['image/vnd.adobe.photoshop', 'application/x-photoshop']),
  apk: new Set(['application/vnd.android.package-archive']),
};
const genericDocumentMimeTypes = new Set(['application/octet-stream']);
const allowedAudioMimeTypes = new Set(['audio/ogg', 'audio/mpeg', 'audio/mp4']);
const allowedVoiceInputMimeTypes = new Set(['audio/webm', 'audio/webm;codecs=opus']);
const whatsappMessageQuoteSelect = {
  id: true,
  direction: true,
  type: true,
  text: true,
  mediaFileName: true,
} satisfies Prisma.WhatsAppMessageSelect;
const whatsappMessageReplyInclude = {
  replyTo: { select: whatsappMessageQuoteSelect },
} satisfies Prisma.WhatsAppMessageInclude;

type ConversationMediaUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type PreparedConversationMedia = {
  kind: 'IMAGE' | 'DOCUMENT' | 'AUDIO';
  dataUrl: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  durationSeconds: number | null;
};

type ConversationMediaDownload = Omit<DownloadMediaInput, 'type'>;

type ConversationLocalMedia = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

type DownloadedConversationMedia = {
  buffer: Buffer;
  contentLength: number;
  disposition: 'inline' | 'attachment';
  fileName: string;
  mimetype: string;
};

type MediaDebugFieldSummary = {
  present: boolean;
  type: string | null;
  length: number | null;
};

type WhatsAppMessageLookupClient = Pick<Prisma.TransactionClient, 'whatsAppMessage'>;

type MediaDebugValueSummary = MediaDebugFieldSummary & {
  value?: string | number | boolean | null;
};

type MediaDebugPayload = {
  mediaType: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
  isFromMe: boolean;
  providerMessageId: string | null;
  instanceName: string | null;
  messageKeys: string[];
  mediaKeys: string[];
  nestedObjectKeys: Record<string, string[]>;
  url: MediaDebugFieldSummary;
  directPath: MediaDebugFieldSummary;
  mediaKey: MediaDebugFieldSummary;
  mimetype: MediaDebugValueSummary;
  fileEncSHA256: MediaDebugFieldSummary;
  fileSHA256: MediaDebugFieldSummary;
  fileLength: MediaDebugValueSummary;
  fileName?: {
    present: boolean;
    extension: string | null;
    length: number | null;
  };
  caption: {
    present: boolean;
    length: number | null;
  };
};

type InitialActivationResult = {
  initialReceivableId?: string | null;
  paymentIntentId?: string | null;
  messageDispatchId?: string | null;
  warning?: string | null;
  message?: string | null;
  reusedApproval?: boolean;
};

type PixPaymentIntentForWhatsApp = Prisma.PaymentIntentGetPayload<{
  include: {
    receivable: {
      include: {
        client: true;
        clientReference: true;
      };
    };
    paymentGroup: {
      include: {
        client: true;
        items: {
          include: {
            receivable: {
              include: {
                clientReference: true;
              };
            };
          };
          orderBy: { createdAt: 'asc' };
        };
      };
    };
  };
}>;

type PixWhatsAppDispatchItem = {
  receivableId: string;
  clientReferenceId: string;
  amount: Prisma.Decimal;
  dueDate: Date;
  referenceSnapshot: string;
  statusSnapshot: ReceivableStatus;
};

type PixWhatsAppContext =
  | {
      kind: 'INDIVIDUAL';
      client: NonNullable<NonNullable<PixPaymentIntentForWhatsApp['receivable']>['client']>;
      clientEventClientId: string;
      receivable: NonNullable<PixPaymentIntentForWhatsApp['receivable']>;
      phone: string;
      dispatchItems: [];
      description: string;
      metadata: Record<string, unknown>;
      templateItems?: never;
    }
  | {
      kind: 'MANUAL_CHARGE';
      client: NonNullable<NonNullable<PixPaymentIntentForWhatsApp['receivable']>['client']> | null;
      clientEventClientId: string | null;
      receivable: NonNullable<PixPaymentIntentForWhatsApp['receivable']>;
      phone: string;
      dispatchItems: [];
      description: string;
      metadata: Record<string, unknown>;
      templateItems?: never;
    }
  | {
      kind: 'GROUPED';
      client: NonNullable<PixPaymentIntentForWhatsApp['paymentGroup']>['client'];
      clientEventClientId: string;
      paymentGroup: NonNullable<PixPaymentIntentForWhatsApp['paymentGroup']>;
      phone: string;
      dispatchItems: PixWhatsAppDispatchItem[];
      description: string;
      metadata: Record<string, unknown>;
      templateItems: Array<{ reference: string; amount: Prisma.Decimal }>;
    };

type WhatsAppConversationForPresenter = Prisma.WhatsAppConversationGetPayload<{
  include: {
    client: {
      select: {
        id: true;
        name: true;
        phone: true;
        phoneNormalized: true;
      };
    };
    whatsAppConnection: {
      select: {
        name: true;
        providerInstanceName: true;
        providerUserId: true;
      };
    };
  };
}>;

type WhatsAppConversationMessageQuote = Pick<
  WhatsAppMessage,
  'id' | 'direction' | 'type' | 'text' | 'mediaFileName'
>;

type WhatsAppConversationMessageForPresenter = WhatsAppMessage & {
  replyTo?: WhatsAppConversationMessageQuote | null;
};

type WhatsAppReplyTargetMessage = Pick<
  WhatsAppMessage,
  | 'id'
  | 'conversationId'
  | 'whatsAppConnectionId'
  | 'provider'
  | 'providerMessageId'
  | 'type'
  | 'text'
  | 'mediaFileName'
>;

type ResolvedWhatsAppReplyTarget = {
  message: WhatsAppReplyTargetMessage;
  providerReply: NonNullable<SendTextInput['reply']>;
  quotedText: string;
};

@Injectable()
export class WhatsAppService {
  static readonly conversationMediaMaxBytes = 10 * 1024 * 1024;
  static readonly conversationVoiceMaxBytes = 5 * 1024 * 1024;

  private readonly logger = new Logger(WhatsAppService.name);
  private readonly markReadInFlight = new Map<
    string,
    Promise<ReturnType<WhatsAppService['presentConversation']>>
  >();

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
    @Inject(WhatsAppMediaStorageService)
    private readonly mediaStorage: WhatsAppMediaStorageService,
    @Inject(WhatsAppVoiceConversionService)
    private readonly voiceConversion: WhatsAppVoiceConversionService,
    @Optional()
    @Inject(WhatsAppRealtimeService)
    private readonly realtime?: WhatsAppRealtimeService,
    @Optional()
    @Inject(ReferralsService)
    private readonly referralsService?: ReferralsService,
  ) {}

  private emitConversationUpdated(conversationId: string) {
    try {
      this.realtime?.emitConversationUpdated(conversationId);
    } catch (error) {
      this.logger.warn(
        `Falha ao emitir evento WhatsApp conversation.updated conversation=${conversationId} message=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private emitMessageCreated(
    conversationId: string,
    messageId: string,
    direction: 'INBOUND' | 'OUTBOUND',
  ) {
    try {
      this.realtime?.emitMessageCreated(conversationId, messageId, direction);
    } catch (error) {
      this.logger.warn(
        `Falha ao emitir evento WhatsApp message.created conversation=${conversationId} message=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private emitMessageUpdated(conversationId: string, messageId: string) {
    try {
      this.realtime?.emitMessageUpdated(conversationId, messageId);
    } catch (error) {
      this.logger.warn(
        `Falha ao emitir evento WhatsApp message.updated conversation=${conversationId} message=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  async getConnection() {
    const connection = await this.findPrimaryConnection();
    return connection ? this.presentConnection(connection) : null;
  }

  async listUsableConnections() {
    const connections = await this.prisma.whatsAppConnection.findMany({
      where: {
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });

    return connections.map((connection) => this.presentConnection(connection));
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
    const webhook = await this.mapProviderError(() => this.provider.getWebhook(instanceToken));
    return this.redactWebhookToken(webhook);
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

  async sendPixPaymentIntent(paymentIntentId: string, actorUserId: string) {
    const connection = await this.requireConnection();

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp nao esta operacional.');
    }

    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
      include: {
        receivable: {
          include: {
            client: true,
            clientReference: true,
          },
        },
        paymentGroup: {
          include: {
            client: true,
            items: {
              include: {
                receivable: {
                  include: {
                    clientReference: true,
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    this.validatePixIntentForWhatsApp(intent);
    const context = await this.buildPixWhatsAppContext(intent);
    const template = buildPixWhatsAppTemplate({
      amount: intent.amount,
      pixCopyPaste: intent.pixCopyPaste ?? '',
      context: context.kind,
      ...(context.kind === 'MANUAL_CHARGE'
        ? {
            payerName: context.receivable.payerName ?? undefined,
            description: context.receivable.description,
            dueDate: this.formatDisplayDate(context.receivable.dueDate),
            expiresAt: intent.expiresAt ? this.formatDisplayDate(intent.expiresAt) : null,
          }
        : {}),
      ...(context.kind === 'GROUPED'
        ? { itemCount: context.dispatchItems.length, items: context.templateItems }
        : {}),
    });
    const requestId =
      context.kind === 'MANUAL_CHARGE' ? `manual-charge-pix:${intent.id}` : randomUUID();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const { dispatch, created } = await this.createPendingDispatch({
      clientId: context.client?.id ?? null,
      connectionId: connection.id,
      phone: context.phone,
      body: template.body,
      requestId,
      origin: 'MANUAL',
      ...(context.kind === 'MANUAL_CHARGE' ? { idempotencyKey: requestId } : {}),
      dispatchItems: context.dispatchItems,
      ...(context.kind === 'INDIVIDUAL'
        ? {
            receivableId: context.receivable.id,
            ...(context.receivable.clientReferenceId
              ? { clientReferenceId: context.receivable.clientReferenceId }
              : {}),
          }
        : {}),
      ...(context.kind === 'MANUAL_CHARGE'
        ? {
            receivableId: context.receivable.id,
          }
        : {}),
    });

    if ((!created && dispatch.status !== 'FAILED') || dispatch.status === 'SENT') {
      return this.presentPixSendResult(dispatch, true, true);
    }

    try {
      const result = await this.mapProviderError(() =>
        this.provider.sendButtons(instanceToken, {
          phone: context.phone,
          title: template.title,
          body: template.body,
          buttons: [template.button],
        }),
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        const sent = await tx.messageDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
          include: { client: true, whatsAppConnection: true },
        });

        if (context.clientEventClientId) {
          await tx.clientEvent.create({
            data: {
              clientId: context.clientEventClientId,
              type: 'WHATSAPP_MESSAGE_SENT',
              title:
                context.kind === 'GROUPED'
                  ? 'PIX agrupado enviado pelo WhatsApp.'
                  : context.kind === 'MANUAL_CHARGE'
                    ? 'PIX de cobranca avulsa enviado pelo WhatsApp.'
                    : 'PIX enviado pelo WhatsApp.',
              description: context.description,
              metadata: {
                messageDispatchId: sent.id,
                paymentIntentId: intent.id,
                provider: intent.provider,
                providerTransactionId: intent.providerTransactionId,
                phoneMasked: this.maskPhone(context.phone),
                amount: intent.amount.toString(),
                channel: 'WHATSAPP',
                ...context.metadata,
              },
              createdByUserId: actorUserId,
            },
          });
        }

        if (context.kind === 'MANUAL_CHARGE') {
          await this.createManualChargeWhatsAppAuditEvent(tx, {
            actorUserId,
            dispatchId: sent.id,
            intent,
            phone: context.phone,
            receivable: context.receivable,
          });
        }

        return sent;
      });

      return this.presentPixSendResult(updated, true, false);
    } catch (error) {
      const updated = await this.prisma.messageDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'FAILED',
          errorMessage: this.sanitizePixSendError(error),
        },
        include: { client: true, whatsAppConnection: true },
      });

      return this.presentPixSendResult(updated, false);
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

  async listConversations(query: ListWhatsAppConversationsDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, pageSizeLimit);
    const where = this.buildConversationWhere(query);

    const [items, total, totalUnreadConversations, unreadMessages] = await this.prisma.$transaction(
      [
        this.prisma.whatsAppConversation.findMany({
          where,
          include: {
            client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
            whatsAppConnection: {
              select: { name: true, providerInstanceName: true, providerUserId: true },
            },
          },
          orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.whatsAppConversation.count({ where }),
        this.prisma.whatsAppConversation.count({
          where: { ...where, unreadCount: { gt: 0 } },
        }),
        this.prisma.whatsAppConversation.aggregate({
          where,
          _sum: { unreadCount: true },
        }),
      ],
    );

    return {
      items: items.map((conversation) => this.presentConversation(conversation)),
      pagination: this.presentLimitPagination(page, limit, total),
      summary: {
        totalUnreadConversations,
        totalUnreadMessages: unreadMessages._sum.unreadCount ?? 0,
      },
    };
  }

  async getConversation(id: string) {
    const conversation = await this.findConversationForRead(id);

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    return this.presentConversation(conversation);
  }

  async listConversationMessages(id: string, query: ListWhatsAppConversationMessagesDto) {
    const exists = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, pageSizeLimit);
    const where: Prisma.WhatsAppMessageWhereInput = { conversationId: id };
    const hasCursorInput = Boolean(query.beforeCreatedAt || query.beforeId);

    if (hasCursorInput) {
      if (!query.beforeCreatedAt || !query.beforeId) {
        throw new BadRequestException('Cursor de mensagens WhatsApp incompleto.');
      }
      const cursorCreatedAt = new Date(query.beforeCreatedAt);
      if (Number.isNaN(cursorCreatedAt.getTime())) {
        throw new BadRequestException('Cursor de mensagens WhatsApp invalido.');
      }
      const items = await this.prisma.whatsAppMessage.findMany({
        where: {
          ...where,
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            { createdAt: cursorCreatedAt, id: { lt: query.beforeId } },
          ],
        },
        include: whatsappMessageReplyInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const pageItems = items.slice(0, limit);
      const hasMore = items.length > limit;

      return {
        items: [...pageItems].reverse().map((message) => this.presentConversationMessage(message)),
        pagination: {
          page,
          limit,
          total: null,
          totalPages: null,
          hasMore,
          nextPage: null,
          nextCursor: this.presentMessageCursor(pageItems, hasMore),
        },
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.findMany({
        where,
        include: whatsappMessageReplyInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    return {
      items: [...items].reverse().map((message) => this.presentConversationMessage(message)),
      pagination: {
        ...this.presentLimitPagination(page, limit, total),
        nextCursor: this.presentMessageCursor(items, page * limit < total),
      },
    };
  }

  async searchConversationMessages(query: SearchWhatsAppMessagesDto) {
    const q = query.q.trim();

    if (q.length < messageSearchMinLength) {
      throw new BadRequestException('Informe ao menos 2 caracteres para buscar mensagens.');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, pageSizeLimit);
    const where: Prisma.WhatsAppMessageWhereInput = {
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      type: 'TEXT',
      text: { not: null, contains: q, mode: 'insensitive' },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.findMany({
        where,
        include: {
          ...whatsappMessageReplyInclude,
          conversation: {
            include: {
              client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
              whatsAppConnection: {
                select: { name: true, providerInstanceName: true, providerUserId: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    return {
      items: items.map((message) => this.presentConversationMessageSearchResult(message, q)),
      pagination: this.presentLimitPagination(page, limit, total),
    };
  }

  async getConversationMessagesAround(
    conversationId: string,
    messageId: string,
    query: WhatsAppMessageContextDto,
  ) {
    const limit = Math.min(query.limit ?? 15, pageSizeLimit);
    const target = await this.prisma.whatsAppMessage.findFirst({
      where: { id: messageId, conversationId },
      include: whatsappMessageReplyInclude,
    });

    if (!target) {
      throw new NotFoundException('Mensagem WhatsApp nao encontrada nesta conversa.');
    }

    const [olderWithExtra, newerWithExtra] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.findMany({
        where: {
          conversationId,
          OR: [
            { createdAt: { lt: target.createdAt } },
            { createdAt: target.createdAt, id: { lt: target.id } },
          ],
        },
        include: whatsappMessageReplyInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.whatsAppMessage.findMany({
        where: {
          conversationId,
          OR: [
            { createdAt: { gt: target.createdAt } },
            { createdAt: target.createdAt, id: { gt: target.id } },
          ],
        },
        include: whatsappMessageReplyInclude,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      }),
    ]);

    const older = olderWithExtra.slice(0, limit);
    const newer = newerWithExtra.slice(0, limit);
    const items = [...older].reverse().concat(target, newer);

    return {
      targetId: target.id,
      items: items.map((message) => this.presentConversationMessage(message)),
      pagination: {
        page: 1,
        limit,
        total: null,
        totalPages: null,
        hasMore: olderWithExtra.length > limit,
        hasOlder: olderWithExtra.length > limit,
        hasNewer: newerWithExtra.length > limit,
        nextPage: null,
        nextCursor: this.presentMessageCursor(older, olderWithExtra.length > limit),
      },
    };
  }

  async downloadConversationMessageMedia(
    conversationId: string,
    messageId: string,
  ): Promise<DownloadedConversationMedia> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      include: { whatsAppConnection: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const message = await this.prisma.whatsAppMessage.findUnique({ where: { id: messageId } });

    if (!message) {
      throw new NotFoundException('Mensagem WhatsApp nao encontrada.');
    }

    if (message.conversationId !== conversation.id) {
      throw new BadRequestException({
        code: 'MESSAGE_CONVERSATION_MISMATCH',
        message: 'Mensagem nao pertence a conversa informada.',
      });
    }

    const type = this.supportedDownloadMediaType(message.type);

    if (!type) {
      throw new BadRequestException({
        code: 'MEDIA_NOT_AVAILABLE',
        message: 'Mensagem nao possui midia suportada para download.',
      });
    }

    const localMedia = this.localMediaFromRawMetadata(message.rawMetadata, type);

    if (localMedia) {
      const buffer = await this.mediaStorage.read(localMedia.storageKey);

      if (buffer) {
        if (buffer.length > WhatsAppService.conversationMediaMaxBytes) {
          throw new PayloadTooLargeException({
            code: 'MEDIA_TOO_LARGE',
            message: 'Midia excede o limite interno do CRM.',
          });
        }

        return {
          buffer,
          contentLength: buffer.length,
          disposition: type === 'DOCUMENT' ? 'attachment' : 'inline',
          fileName: this.downloadFileName(message, localMedia.mimeType),
          mimetype: localMedia.mimeType,
        };
      }
    }

    const mediaDownload = this.mediaDownloadFromRawMetadata(message.rawMetadata, type);

    if (mediaDownload) {
      return this.downloadConversationMessageProviderMedia(
        conversation,
        message,
        type,
        mediaDownload,
      );
    }

    throw new BadRequestException({
      code: 'MEDIA_NOT_AVAILABLE',
      message: 'Midia indisponivel para mensagens antigas ou sem metadados completos.',
    });
  }

  private async downloadConversationMessageProviderMedia(
    conversation: WhatsAppConversation & { whatsAppConnection: WhatsAppConnection },
    message: WhatsAppMessage,
    type: DownloadMediaType,
    mediaDownload: ConversationMediaDownload,
  ): Promise<DownloadedConversationMedia> {
    const expectedSize = message.mediaSizeBytes ?? mediaDownload.FileLength;

    if (expectedSize > WhatsAppService.conversationMediaMaxBytes) {
      throw new PayloadTooLargeException({
        code: 'MEDIA_TOO_LARGE',
        message: 'Midia excede o limite interno do CRM.',
      });
    }

    const connection = conversation.whatsAppConnection;

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp da conversa nao esta operacional.');
    }

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const response = await this.downloadConversationMediaFromProvider(connection, instanceToken, {
      type,
      ...mediaDownload,
    });
    const parsed = this.parseProviderMediaDataUrl(response.dataUrl);
    const mimetype = response.mimetype || parsed.mimetype;

    if (mimetype !== parsed.mimetype) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_RESPONSE',
        message: 'Provider retornou midia com MIME inconsistente.',
      });
    }

    this.assertSafeConversationMediaMime(type, mimetype);

    if (parsed.buffer.length > WhatsAppService.conversationMediaMaxBytes) {
      throw new PayloadTooLargeException({
        code: 'MEDIA_TOO_LARGE',
        message: 'Midia excede o limite interno do CRM.',
      });
    }

    return {
      buffer: parsed.buffer,
      contentLength: parsed.buffer.length,
      disposition: type === 'DOCUMENT' ? 'attachment' : 'inline',
      fileName: this.downloadFileName(message, mimetype),
      mimetype,
    };
  }

  async startConversation(dto: StartWhatsAppConversationDto, actorUserId: string) {
    const body = dto.body.trim();

    if (!body) {
      throw new BadRequestException('Mensagem obrigatoria.');
    }

    const connection = await this.requireUsableConnectionById(dto.whatsAppConnectionId);
    const client = dto.clientId
      ? await this.prisma.client.findUnique({
          where: { id: dto.clientId },
          select: { id: true, name: true, phone: true, phoneNormalized: true },
        })
      : null;

    if (dto.clientId && !client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    if (client && !client.phoneNormalized) {
      throw new BadRequestException('Cliente nao possui telefone valido para WhatsApp.');
    }

    const phone = normalizeBrazilPhone(client?.phoneNormalized ?? dto.phone ?? '');
    const requestId = dto.requestId.trim();
    const existingMessage = await this.findConversationMessageByRequestId(connection.id, requestId);

    if (existingMessage) {
      const existingConversation = await this.findConversationForRead(
        existingMessage.conversationId,
      );

      if (!existingConversation) {
        throw new ConflictException('requestId ja existe, mas a conversa nao foi encontrada.');
      }

      if (
        existingConversation.whatsAppConnectionId !== connection.id ||
        existingConversation.phoneNormalized !== phone
      ) {
        throw new ConflictException('requestId ja foi usado em outro destino desta conexao.');
      }

      return {
        conversation: this.presentConversation(existingConversation),
        message: this.presentConversationMessage(existingMessage),
        reusedConversation: true,
        clientLinked: false,
      };
    }

    const prepared = await this.findOrCreateConversationForStart({
      connection,
      client,
      phone,
      actorUserId,
    });
    const message = await this.sendConversationTextMessage(prepared.conversation.id, {
      body,
      requestId,
    });
    const conversation =
      (await this.findConversationForRead(prepared.conversation.id)) ?? prepared.conversation;

    return {
      conversation: this.presentConversation(conversation),
      message,
      reusedConversation: prepared.reusedConversation,
      clientLinked: prepared.clientLinked,
    };
  }

  async sendConversationTextMessage(id: string, dto: SendWhatsAppConversationMessageDto) {
    const body = dto.body.trim();

    if (!body) {
      throw new BadRequestException('Mensagem obrigatoria.');
    }

    const requestId = dto.requestId?.trim() || randomUUID();
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: { whatsAppConnection: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const connection = conversation.whatsAppConnection;

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp da conversa nao esta operacional.');
    }

    const existing = await this.findConversationMessageByRequestId(connection.id, requestId);

    if (existing) {
      this.assertMessageBelongsToConversation(existing, conversation.id);
      return this.presentConversationMessage(existing);
    }

    const replyTarget = await this.resolveConversationReplyTarget(
      conversation,
      dto.replyToMessageId,
    );
    const pending = await this.createPendingConversationTextMessage(conversation, {
      body,
      requestId,
      replyTarget,
    });

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    let result: { providerMessageId: string | null };

    try {
      result = await this.mapConnectionProviderError(connection, () =>
        this.provider.sendText(instanceToken, {
          phone: conversation.phoneNormalized,
          body,
          requestId,
          ...(replyTarget ? { reply: replyTarget.providerReply } : {}),
        }),
      );
    } catch (error) {
      const failed = await this.prisma.whatsAppMessage.update({
        where: { id: pending.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          rawMetadata: {
            source: 'manual_outbound_send',
            errorMessage: this.sanitizeError(error),
          },
        },
      });

      this.emitMessageUpdated(conversation.id, failed.id);
      return this.presentConversationMessage(failed);
    }

    await this.rememberConversationProviderConfirmation({
      messageId: pending.id,
      providerMessageId: result.providerMessageId,
      rawMetadata: pending.rawMetadata,
    });

    const sentAt = new Date();

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const message = await tx.whatsAppMessage.update({
          where: { id: pending.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt,
            failedAt: null,
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastMessagePreview: this.conversationLastMessagePreview('TEXT', { text: body }),
          },
        });

        return message;
      });

      this.emitMessageCreated(conversation.id, updated.id, updated.direction);
      this.emitConversationUpdated(conversation.id);
      return this.presentConversationMessage(updated);
    } catch (error) {
      return this.keepConversationMessagePendingAfterProviderSuccess({
        conversationId: conversation.id,
        error,
        messageId: pending.id,
      });
    }
  }

  async sendConversationMediaMessage(
    id: string,
    input: {
      file?: ConversationMediaUploadFile;
      caption?: string;
      requestId?: string;
    },
  ) {
    const requestId = input.requestId?.trim();

    if (!requestId) {
      throw new BadRequestException('requestId obrigatorio.');
    }

    const media = this.prepareConversationMedia(input.file);
    const mediaType = media.kind;
    const caption = input.caption?.trim() || null;
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: { whatsAppConnection: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const connection = conversation.whatsAppConnection;

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp da conversa nao esta operacional.');
    }

    const existing = await this.findConversationMessageByRequestId(connection.id, requestId);

    if (existing) {
      this.assertMessageBelongsToConversation(existing, conversation.id);
      return this.presentConversationMessage(existing);
    }

    const pending = await this.createPendingConversationMediaMessage(conversation, {
      media,
      caption,
      requestId,
    });

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    let result: { providerMessageId: string | null };

    try {
      if (mediaType === 'IMAGE') {
        result = await this.mapConnectionProviderError(connection, () =>
          this.provider.sendImage(instanceToken, {
            phone: conversation.phoneNormalized,
            imageDataUrl: media.dataUrl,
            caption,
            requestId,
          }),
        );
      } else if (mediaType === 'AUDIO') {
        result = await this.mapConnectionProviderError(connection, () =>
          this.provider.sendAudio(instanceToken, {
            phone: conversation.phoneNormalized,
            audioDataUrl: media.dataUrl,
            mimeType: media.mimeType,
            seconds: media.durationSeconds,
            ptt: false,
            requestId,
          }),
        );
      } else {
        result = await this.mapConnectionProviderError(connection, () =>
          this.provider.sendDocument(instanceToken, {
            phone: conversation.phoneNormalized,
            documentDataUrl: media.dataUrl,
            fileName: media.fileName,
            requestId,
          }),
        );
      }
    } catch (error) {
      const failed = await this.prisma.whatsAppMessage.update({
        where: { id: pending.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          rawMetadata: {
            source: 'manual_outbound_media_send',
            errorMessage: this.sanitizeError(error),
            mimeType: media.mimeType,
            fileName: media.fileName,
            sizeBytes: media.sizeBytes,
          },
        },
      });

      this.emitMessageUpdated(conversation.id, failed.id);
      return this.presentConversationMessage(failed);
    }

    const localMediaResult = await this.storeOutboundLocalMediaSafely(
      connection.id,
      pending.id,
      media,
    );

    await this.rememberConversationProviderConfirmation({
      messageId: pending.id,
      providerMessageId: result.providerMessageId,
      rawMetadata: this.rawMetadataWithLocalMedia(
        pending.rawMetadata,
        localMediaResult.localMedia,
        localMediaResult.errorMessage,
      ),
    });

    const sentAt = new Date();

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const message = await tx.whatsAppMessage.update({
          where: { id: pending.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt,
            failedAt: null,
            rawMetadata: this.rawMetadataWithLocalMedia(
              pending.rawMetadata,
              localMediaResult.localMedia,
              localMediaResult.errorMessage,
            ),
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastMessagePreview: this.conversationLastMessagePreview(mediaType, {
              text: caption,
              mediaFileName: media.fileName,
            }),
          },
        });

        return message;
      });

      this.emitMessageCreated(conversation.id, updated.id, updated.direction);
      this.emitConversationUpdated(conversation.id);
      return this.presentConversationMessage(updated);
    } catch (error) {
      if (localMediaResult.localMedia) {
        await this.deleteLocalMediaQuietly(localMediaResult.localMedia.storageKey);
      }

      return this.keepConversationMessagePendingAfterProviderSuccess({
        conversationId: conversation.id,
        error,
        messageId: pending.id,
      });
    }
  }

  async sendConversationVoiceMessage(
    id: string,
    input: {
      file?: ConversationMediaUploadFile;
      requestId?: string;
      durationSeconds?: string | number;
    },
  ) {
    const requestId = input.requestId?.trim();

    if (!requestId) {
      throw new BadRequestException('requestId obrigatorio.');
    }

    this.validateConversationVoiceUpload(input.file);

    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: { whatsAppConnection: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const connection = conversation.whatsAppConnection;

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp da conversa nao esta operacional.');
    }

    const existing = await this.findConversationMessageByRequestId(connection.id, requestId);

    if (existing) {
      this.assertMessageBelongsToConversation(existing, conversation.id);
      return this.presentConversationMessage(existing);
    }

    const media = await this.prepareConversationVoiceMedia(input.file, input.durationSeconds);
    const pending = await this.createPendingConversationMediaMessage(conversation, {
      media,
      caption: null,
      requestId,
      source: 'manual_outbound_voice_send',
    });

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    let result: { providerMessageId: string | null };

    try {
      result = await this.mapConnectionProviderError(connection, () =>
        this.provider.sendAudio(instanceToken, {
          phone: conversation.phoneNormalized,
          audioDataUrl: media.dataUrl,
          mimeType: media.mimeType,
          seconds: media.durationSeconds,
          ptt: true,
          requestId,
        }),
      );
    } catch (error) {
      const failed = await this.prisma.whatsAppMessage.update({
        where: { id: pending.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          rawMetadata: {
            source: 'manual_outbound_voice_send',
            errorMessage: this.sanitizeError(error),
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
            durationSeconds: media.durationSeconds,
          },
        },
      });

      this.emitMessageUpdated(conversation.id, failed.id);
      return this.presentConversationMessage(failed);
    }

    const localMediaResult = await this.storeOutboundLocalMediaSafely(
      connection.id,
      pending.id,
      media,
    );

    await this.rememberConversationProviderConfirmation({
      messageId: pending.id,
      providerMessageId: result.providerMessageId,
      rawMetadata: this.rawMetadataWithLocalMedia(
        pending.rawMetadata,
        localMediaResult.localMedia,
        localMediaResult.errorMessage,
      ),
    });

    const sentAt = new Date();

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const message = await tx.whatsAppMessage.update({
          where: { id: pending.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt,
            failedAt: null,
            rawMetadata: this.rawMetadataWithLocalMedia(
              pending.rawMetadata,
              localMediaResult.localMedia,
              localMediaResult.errorMessage,
            ),
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastMessagePreview: this.conversationLastMessagePreview('AUDIO', {
              text: null,
              mediaFileName: media.fileName,
            }),
          },
        });

        return message;
      });

      this.emitMessageCreated(conversation.id, updated.id, updated.direction);
      this.emitConversationUpdated(conversation.id);
      return this.presentConversationMessage(updated);
    } catch (error) {
      if (localMediaResult.localMedia) {
        await this.deleteLocalMediaQuietly(localMediaResult.localMedia.storageKey);
      }

      return this.keepConversationMessagePendingAfterProviderSuccess({
        conversationId: conversation.id,
        error,
        messageId: pending.id,
      });
    }
  }

  async retryConversationMessage(id: string) {
    const message = await this.prisma.whatsAppMessage.findUnique({
      where: { id },
      include: {
        conversation: true,
        whatsAppConnection: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Mensagem WhatsApp nao encontrada.');
    }

    if (message.direction !== 'OUTBOUND') {
      throw new ConflictException('Somente mensagens outbound podem ser reenviadas.');
    }

    if (message.status !== 'FAILED') {
      throw new ConflictException('Somente mensagens com falha podem ser reenviadas.');
    }

    const connection = message.whatsAppConnection;

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp da conversa nao esta operacional.');
    }

    const retryAttemptId = randomUUID();
    const prepared = await this.prepareRetryConversationMessage(message);
    const claimed = await this.prisma.whatsAppMessage.updateMany({
      where: { id: message.id, direction: 'OUTBOUND', status: 'FAILED' },
      data: {
        status: 'PENDING',
        requestId: retryAttemptId,
        providerMessageId: null,
        failedAt: null,
        rawMetadata: this.retryRawMetadata(message.rawMetadata, {
          retryAttemptId,
          retryStatus: 'PENDING',
        }),
      },
    });

    if (claimed.count !== 1) {
      const current = await this.prisma.whatsAppMessage.findUnique({ where: { id: message.id } });

      if (!current) {
        throw new NotFoundException('Mensagem WhatsApp nao encontrada.');
      }

      return this.presentConversationMessage(current);
    }

    this.emitMessageUpdated(message.conversationId, message.id);

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    let result: { providerMessageId: string | null };

    try {
      result = await this.mapConnectionProviderError(connection, () =>
        prepared.send(instanceToken, retryAttemptId),
      );
    } catch (error) {
      const errorMessage = this.sanitizeError(error);
      const failed = await this.prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          rawMetadata: this.retryRawMetadata(message.rawMetadata, {
            retryAttemptId,
            retryStatus: 'FAILED',
            errorMessage,
          }),
        },
      });

      this.logger.warn(
        `WhatsApp message retry failed message=${message.id} type=${message.type} error=${errorMessage}`,
      );
      this.emitMessageUpdated(message.conversationId, failed.id);
      return this.presentConversationMessage(failed);
    }

    await this.rememberConversationProviderConfirmation({
      messageId: message.id,
      providerMessageId: result.providerMessageId,
      rawMetadata: this.retryRawMetadata(message.rawMetadata, {
        retryAttemptId,
        retryStatus: 'PROVIDER_CONFIRMED',
      }),
    });

    const sentAt = new Date();

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const updatedMessage = await tx.whatsAppMessage.update({
          where: { id: message.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt,
            failedAt: null,
            rawMetadata: this.retryRawMetadata(message.rawMetadata, {
              retryAttemptId,
              retryStatus: 'SENT',
            }),
          },
        });

        await tx.whatsAppConversation.update({
          where: { id: message.conversationId },
          data: {
            lastMessageAt: sentAt,
            lastMessagePreview: this.conversationLastMessagePreview(message.type, {
              text: message.text,
              mediaFileName: message.mediaFileName,
            }),
          },
        });

        return updatedMessage;
      });

      this.logger.log(
        `WhatsApp message retry succeeded message=${message.id} type=${message.type}`,
      );
      this.emitMessageUpdated(message.conversationId, updated.id);
      this.emitConversationUpdated(message.conversationId);
      return this.presentConversationMessage(updated);
    } catch (error) {
      return this.keepConversationMessagePendingAfterProviderSuccess({
        conversationId: message.conversationId,
        error,
        messageId: message.id,
      });
    }
  }

  async linkConversationClient(
    id: string,
    dto: LinkWhatsAppConversationClientDto,
    actorUserId: string,
  ) {
    const linked = await this.prisma.$transaction(async (tx) => {
      const [conversation, client] = await Promise.all([
        tx.whatsAppConversation.findUnique({
          where: { id },
          include: { client: { select: { id: true, name: true } } },
        }),
        tx.client.findUnique({
          where: { id: dto.clientId },
          select: { id: true, name: true },
        }),
      ]);

      if (!conversation) {
        throw new NotFoundException('Conversa WhatsApp nao encontrada.');
      }

      if (!client) {
        throw new NotFoundException('Cliente nao encontrado.');
      }

      if (conversation.clientId === client.id) {
        const current = await tx.whatsAppConversation.findUnique({
          where: { id },
          include: {
            client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
            whatsAppConnection: {
              select: { name: true, providerInstanceName: true, providerUserId: true },
            },
          },
        });
        return this.presentConversation(current!);
      }

      if (conversation.clientId) {
        throw new ConflictException({
          code: 'CONVERSATION_ALREADY_LINKED',
          message: 'Esta conversa ja esta vinculada a outro cliente.',
          currentClientId: conversation.clientId,
          currentClientName: conversation.client?.name ?? null,
        });
      }

      await this.linkConversationClientInTransaction(tx, {
        conversationId: conversation.id,
        client,
        actorUserId,
        source: 'MANUAL_LINK',
      });

      const linked = await tx.whatsAppConversation.findUnique({
        where: { id },
        include: {
          client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
          whatsAppConnection: {
            select: { name: true, providerInstanceName: true, providerUserId: true },
          },
        },
      });

      return this.presentConversation(linked!);
    });

    this.emitConversationUpdated(id);
    return linked;
  }

  async markConversationAsRead(id: string) {
    const current = this.markReadInFlight.get(id);
    if (current) return current;

    const promise = this.markConversationAsReadOnce(id).finally(() => {
      this.markReadInFlight.delete(id);
    });
    this.markReadInFlight.set(id, promise);
    return promise;
  }

  private async markConversationAsReadOnce(id: string) {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: true,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }

    const unreadSnapshot = conversation.unreadCount;
    if (unreadSnapshot <= 0) {
      return this.presentConversation(conversation);
    }

    const phone = conversation.phoneNormalized;
    if (!phone) {
      this.logger.warn(`WhatsApp markread skipped conversation=${id} reason=missing_phone`);
      return this.presentConversation(conversation);
    }
    const providerPhone = this.resolveKiragoMarkReadPhone(id, phone);

    const messages = await this.prisma.whatsAppMessage.findMany({
      where: {
        conversationId: id,
        direction: 'INBOUND',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { providerMessageId: true },
      take: unreadSnapshot,
    });
    const providerMessageIds: string[] = [];
    const seenProviderMessageIds = new Set<string>();
    for (const message of [...messages].reverse()) {
      if (!message.providerMessageId) {
        this.logger.warn(
          `WhatsApp markread stopped conversation=${id} missingProviderMessageId=true`,
        );
        break;
      }
      if (!seenProviderMessageIds.has(message.providerMessageId)) {
        providerMessageIds.push(message.providerMessageId);
        seenProviderMessageIds.add(message.providerMessageId);
      }
    }

    if (!providerMessageIds.length) {
      this.logger.warn(`WhatsApp markread skipped conversation=${id} reason=no_provider_ids`);
      return this.presentConversation(conversation);
    }

    let confirmedReadCount = 0;
    try {
      const instanceToken = this.encryption.decrypt(
        conversation.whatsAppConnection.providerTokenEncrypted,
      );
      for (const batch of chunks(providerMessageIds, 100)) {
        await this.provider.markMessagesAsRead(instanceToken, {
          messageIds: batch,
          phone: providerPhone,
        });
        confirmedReadCount += batch.length;
      }
    } catch (error) {
      this.logger.warn(
        `WhatsApp markread provider failed conversation=${id} connection=${conversation.whatsAppConnectionId} confirmed=${confirmedReadCount} pending=${providerMessageIds.length - confirmedReadCount} message=${this.sanitizeError(error)}`,
      );
      if (confirmedReadCount === 0) {
        return this.presentConversation(conversation);
      }
    }

    const updated = await this.prisma.whatsAppConversation.update({
      where: { id },
      data: { unreadCount: { decrement: confirmedReadCount } },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: {
          select: { name: true, providerInstanceName: true, providerUserId: true },
        },
      },
    });

    this.emitConversationUpdated(id);
    return this.presentConversation(updated);
  }

  async resolveConversation(id: string) {
    await this.ensureConversationExists(id);
    const conversation = await this.prisma.whatsAppConversation.update({
      where: { id },
      data: { status: 'RESOLVED' },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: {
          select: { name: true, providerInstanceName: true, providerUserId: true },
        },
      },
    });

    this.emitConversationUpdated(id);
    return this.presentConversation(conversation);
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

        const clientReference = await tx.clientReference.create({
          data: {
            clientId: created.id,
            reference: dto.reference.trim(),
            planId: dto.planId,
            recurringValue: dto.recurringValue,
            dueDate,
            billingAnchorDay: getBusinessDateDay(dueDate),
            billingNoticeDays: dto.billingNoticeDays,
            notes: this.optionalTrim(dto.notes),
            status: 'PENDENTE_PAGAMENTO',
          },
        });

        const initialReceivable = generateInitialReceivable
          ? await tx.receivable.create({
              data: {
                clientId: created.id,
                clientReferenceId: clientReference.id,
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
              clientReferenceId: clientReference.id,
              status: 'PENDENTE_PAGAMENTO',
            },
            createdByUserId: actorUserId,
          },
        });

        await this.referralsService?.createPending(tx, {
          referredClientId: created.id,
          referrerClientId: dto.referrerClientId,
          rewardType: dto.referralRewardType,
          rewardValue: dto.referralRewardValue,
          rewardDescription: dto.referralRewardDescription,
          actorUserId,
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
        include: { client: true, clientReference: { include: { plan: true } } },
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

    const phone = normalizeBrazilPhone(receivable.client!.phoneNormalized);
    const body = this.renderInitialActivationTemplate(template.content, {
      nome: receivable.client!.name,
      primeiroNome: this.firstName(receivable.client!.name),
      valor: this.formatCurrency(receivable.amount),
      vencimento: this.formatDisplayDate(receivable.dueDate),
      plano: receivable.clientReference!.plan.name,
      referencia: receivable.clientReference!.reference,
      pix: intent.pixCopyPaste,
    });
    const requestId = `initial-activation:${clientId}:${receivableId}`;
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    const { dispatch, created } = await this.createPendingDispatch({
      clientId,
      clientReferenceId: receivable.clientReferenceId!,
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

    this.logKiragoWebhookProbe(payload);
    this.logMediaDebugPayload(payload);

    const normalized = this.normalizer.normalize(payload);

    if (!normalized) {
      return { received: true, processed: false, reason: 'ignored_event' };
    }

    if (normalized.kind === 'MESSAGE_RECEIPT') {
      return { received: true, ...(await this.processMessageReceiptWebhook(normalized)) };
    }

    if (normalized.isGroup) {
      return { received: true, processed: false, reason: 'ignored_group' };
    }

    if (!normalized.phone) {
      return { received: true, processed: false, reason: 'missing_phone' };
    }

    if (!this.hasRenderableWebhookMessageContent(normalized)) {
      return { received: true, processed: false, reason: 'no_renderable_content' };
    }

    const incoming = { ...normalized, phone: normalized.phone };
    const connection = await this.findConnectionForWebhook(normalized);

    if (!connection) {
      return { received: true, processed: false, reason: 'connection_not_found' };
    }

    const clients = await this.findClientsForIncomingPhone(incoming.phone);

    if (normalized.direction === 'OUTGOING') {
      const conversationResult = await this.processConversationWebhookSafely(
        connection,
        incoming,
        clients,
      );
      return {
        received: true,
        processed: conversationResult.processed,
        action: conversationResult.action,
        conversation: conversationResult,
      };
    }

    const legacyResult = await this.processIncomingWebhook(connection.id, incoming, clients);

    if (legacyResult.action === 'duplicate_message') {
      return { received: true, ...legacyResult };
    }

    const conversationResult = await this.processConversationWebhookSafely(
      connection,
      incoming,
      clients,
    );
    return { received: true, ...legacyResult, conversation: conversationResult };
  }

  private logMediaDebugPayload(payload: unknown) {
    if (this.config.get<string>('WHATSAPP_MEDIA_DEBUG') !== 'true') {
      return;
    }

    const debugPayload = this.buildMediaDebugPayload(payload);

    if (!debugPayload) {
      return;
    }

    this.logger.log(`[WHATSAPP_MEDIA_DEBUG] ${JSON.stringify(debugPayload)}`);
  }

  private buildMediaDebugPayload(payload: unknown): MediaDebugPayload | null {
    const body = this.asRecord(payload);

    if (!body || body.type !== 'Message') {
      return null;
    }

    const event = this.asRecord(body.event);
    const info = this.asRecord(event?.Info);
    const message = this.asRecord(event?.Message);

    if (!message) {
      return null;
    }

    const imageMessage = this.asRecord(message.imageMessage);
    const documentMessage = this.asRecord(message.documentMessage);
    const audioMessage = this.asRecord(message.audioMessage);
    const videoMessage = this.asRecord(message.videoMessage);
    const mediaType = imageMessage
      ? 'IMAGE'
      : documentMessage
        ? 'DOCUMENT'
        : audioMessage
          ? 'AUDIO'
          : videoMessage
            ? 'VIDEO'
            : null;
    const media = imageMessage ?? documentMessage ?? audioMessage ?? videoMessage;

    if (!mediaType || !media) {
      return null;
    }

    const debugPayload: MediaDebugPayload = {
      mediaType,
      isFromMe: info?.IsFromMe === true,
      providerMessageId: this.debugStringOrNull(info?.ID),
      instanceName: this.debugStringOrNull(body.instanceName),
      messageKeys: this.safeObjectKeys(message),
      mediaKeys: this.safeObjectKeys(media),
      nestedObjectKeys: this.safeNestedObjectKeys(media),
      url: this.summarizeMediaField(media, ['url', 'Url', 'URL']),
      directPath: this.summarizeMediaField(media, ['directPath', 'DirectPath']),
      mediaKey: this.summarizeMediaField(media, ['mediaKey', 'MediaKey']),
      mimetype: this.summarizeMediaValue(media, ['mimetype', 'Mimetype']),
      fileEncSHA256: this.summarizeMediaField(media, ['fileEncSHA256', 'FileEncSHA256']),
      fileSHA256: this.summarizeMediaField(media, ['fileSHA256', 'FileSHA256']),
      fileLength: this.summarizeMediaValue(media, ['fileLength', 'FileLength']),
      caption: this.summarizeCaption(media),
    };

    if (mediaType === 'DOCUMENT') {
      debugPayload.fileName = this.summarizeDocumentFileName(media);
    }

    return debugPayload;
  }

  private summarizeMediaField(
    media: Record<string, unknown>,
    keys: readonly string[],
  ): MediaDebugFieldSummary {
    const value = this.mediaFieldValue(media, keys);

    return {
      present: value.present,
      type: value.present ? this.debugType(value.value) : null,
      length: value.present ? this.debugLength(value.value) : null,
    };
  }

  private summarizeMediaValue(
    media: Record<string, unknown>,
    keys: readonly string[],
  ): MediaDebugValueSummary {
    const value = this.mediaFieldValue(media, keys);
    const summary: MediaDebugValueSummary = {
      present: value.present,
      type: value.present ? this.debugType(value.value) : null,
      length: value.present ? this.debugLength(value.value) : null,
    };

    if (
      value.present &&
      (typeof value.value === 'string' ||
        typeof value.value === 'number' ||
        typeof value.value === 'boolean' ||
        value.value === null)
    ) {
      summary.value = value.value;
    }

    return summary;
  }

  private summarizeDocumentFileName(media: Record<string, unknown>) {
    const value = this.mediaFieldValue(media, ['fileName', 'FileName']);
    const fileName = typeof value.value === 'string' ? value.value : null;
    const extensionMatch = fileName?.match(/\.([a-z0-9]{1,16})$/i);

    return {
      present: value.present,
      extension: extensionMatch ? (extensionMatch[1]?.toLowerCase() ?? null) : null,
      length: value.present ? this.debugLength(value.value) : null,
    };
  }

  private summarizeCaption(media: Record<string, unknown>) {
    const value = this.mediaFieldValue(media, ['caption', 'Caption']);

    return {
      present: value.present,
      length: value.present ? this.debugLength(value.value) : null,
    };
  }

  private mediaFieldValue(media: Record<string, unknown>, keys: readonly string[]) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(media, key)) {
        return { present: true, value: media[key] };
      }
    }

    return { present: false, value: undefined };
  }

  private debugStringOrNull(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private logKiragoWebhookProbe(payload: unknown) {
    try {
      const body = this.asRecord(payload);

      if (!body || !this.shouldLogKiragoWebhookProbe(body)) {
        return;
      }

      const event = this.asRecord(body.event);
      const info = this.asRecord(body.Info) ?? this.asRecord(event?.Info);
      const message = this.asRecord(body.Message) ?? this.asRecord(event?.Message);
      const data = this.asRecord(body.data);

      this.logger.log(
        [
          'Kirago webhook probe',
          `type=${this.safeProbeValue(body.type) ?? 'unknown'}`,
          `event=${this.safeProbeValue(body.event) ?? this.safeProbeValue(event?.type) ?? 'unknown'}`,
          `status=${
            this.safeProbeValue(body.status) ??
            this.safeProbeValue(body.Status) ??
            this.safeProbeValue(info?.Status) ??
            this.safeProbeValue(info?.status) ??
            this.safeProbeValue(data?.status) ??
            'unknown'
          }`,
          `ack=${
            this.safeProbeValue(body.ack) ??
            this.safeProbeValue(body.Ack) ??
            this.safeProbeValue(info?.Ack) ??
            this.safeProbeValue(info?.ack) ??
            this.safeProbeValue(data?.ack) ??
            'unknown'
          }`,
          `receipt=${
            this.safeProbeNonSensitiveValue(body.receipt) ??
            this.safeProbeNonSensitiveValue(body.Receipt) ??
            this.safeProbeNonSensitiveValue(info?.Receipt) ??
            this.safeProbeNonSensitiveValue(info?.receipt) ??
            this.safeProbeNonSensitiveValue(data?.receipt) ??
            'unknown'
          }`,
          `messageId=${this.maskProbeId(
            info?.ID ??
              info?.id ??
              message?.ID ??
              message?.id ??
              data?.ID ??
              data?.id ??
              body.ID ??
              body.id,
          )}`,
          `instance=${this.safeProbeValue(body.instanceName) ?? 'unknown'}`,
          `providerUserId=${this.maskProbeId(body.userID ?? body.providerUserId)}`,
          `timestamp=${
            this.safeProbeValue(body.timestamp) ??
            this.safeProbeValue(body.Timestamp) ??
            this.safeProbeValue(info?.Timestamp) ??
            this.safeProbeValue(data?.timestamp) ??
            'unknown'
          }`,
        ].join(' '),
      );
    } catch {
      return;
    }
  }

  private shouldLogKiragoWebhookProbe(body: Record<string, unknown>) {
    const type = this.safeProbeValue(body.type);

    if (type === 'ReadReceipt') {
      return false;
    }

    if (type !== 'Message') {
      return true;
    }

    const event = this.asRecord(body.event);
    const info = this.asRecord(body.Info) ?? this.asRecord(event?.Info);
    const data = this.asRecord(body.data);

    return [body, info, data].some((record) =>
      this.hasAnyOwnValue(record, [
        'status',
        'Status',
        'ack',
        'Ack',
        'receipt',
        'Receipt',
        'message_status',
        'MessageStatus',
        'played',
        'Played',
      ]),
    );
  }

  private safeProbeValue(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return null;
    }

    const normalized = String(value).trim().replace(/\s+/g, '_');
    return normalized ? normalized.slice(0, 80) : null;
  }

  private maskProbeId(value: unknown) {
    const normalized = this.safeProbeValue(value);

    if (!normalized || this.looksSensitiveProbeValue(normalized)) {
      return 'unknown';
    }

    if (normalized.length <= 10) {
      return `${normalized.slice(0, 3)}...${normalized.slice(-2)}`;
    }

    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  }

  private safeProbeNonSensitiveValue(value: unknown) {
    const normalized = this.safeProbeValue(value);

    if (!normalized || this.looksSensitiveProbeValue(normalized)) {
      return null;
    }

    return normalized;
  }

  private looksSensitiveProbeValue(value: string) {
    return (
      /^\+?\d{10,15}$/.test(value) ||
      /^https?:\/\//i.test(value) ||
      /base64/i.test(value) ||
      /token/i.test(value) ||
      value.length > 200
    );
  }

  private hasAnyOwnValue(source: Record<string, unknown> | null, keys: readonly string[]) {
    if (!source) {
      return false;
    }

    return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
  }

  private debugType(value: unknown) {
    if (Array.isArray(value)) {
      return 'array';
    }

    if (Buffer.isBuffer(value)) {
      return 'buffer';
    }

    return value === null ? 'null' : typeof value;
  }

  private debugLength(value: unknown) {
    if (typeof value === 'string' || Array.isArray(value) || Buffer.isBuffer(value)) {
      return value.length;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return null;
    }

    if (value && typeof value === 'object' && 'length' in value) {
      const length = (value as { length?: unknown }).length;
      return typeof length === 'number' && Number.isFinite(length) ? length : null;
    }

    return null;
  }

  private safeObjectKeys(value: unknown) {
    const record = this.asRecord(value);

    if (!record) {
      return [];
    }

    return [...new Set(Object.keys(record).map((key) => this.safeDebugKey(key)))].sort();
  }

  private safeNestedObjectKeys(media: Record<string, unknown>) {
    const entries: Record<string, string[]> = {};

    for (const [key, value] of Object.entries(media)) {
      if (this.asRecord(value)) {
        entries[key] = this.safeObjectKeys(value);
      }
    }

    return entries;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Buffer.isBuffer(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private safeDebugKey(key: string) {
    return /(authorization|cookies?|token)/i.test(key) ? '[redacted-key]' : key;
  }

  private async processIncomingWebhook(
    connectionId: string,
    normalized: NormalizedWhatsAppMessage & { phone: string },
    clients: Array<{ id: string }>,
  ) {
    const client = clients.length === 1 ? clients[0] : null;

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

        if (clients.length > 1) {
          return {
            processed: true,
            action: 'ambiguous_client_phone',
            inboundMessageId: inbound.id,
            clientMatches: clients.length,
          };
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

  private async processConversationWebhookSafely(
    connection: WhatsAppConnection,
    normalized: NormalizedWhatsAppMessage & { phone: string },
    clients: Array<{ id: string }>,
  ) {
    try {
      return await this.processConversationWebhook(connection, normalized, clients);
    } catch (error) {
      const message = this.sanitizeError(error);
      this.logger.warn(
        `Falha ao persistir historico conversacional WhatsApp: operation=processConversationWebhook ${this.prismaErrorLogDetails(
          error,
        )} message=${message}`,
      );
      return {
        processed: false,
        action: 'conversation_persistence_failed',
        errorMessage: message,
      };
    }
  }

  private async processMessageReceiptWebhook(normalized: NormalizedWhatsAppReceipt) {
    if (!normalized.state) {
      this.logger.log(
        `Kirago read receipt ignored state=${this.safeProbeNonSensitiveValue(normalized.rawState) ?? 'unknown'}`,
      );
      return { processed: false, reason: 'unknown_receipt_state' };
    }

    const receiptState = normalized.state;
    const providerMessageIds = [...new Set(normalized.providerMessageIds.filter(Boolean))];

    if (!providerMessageIds.length) {
      return { processed: false, reason: 'missing_message_ids' };
    }

    const connection = await this.findConnectionForWebhook(normalized);

    if (!connection) {
      return { processed: false, reason: 'connection_not_found' };
    }

    const receiptTimestamp = normalized.timestamp ?? normalized.receivedAt;
    const updated = await this.prisma.$transaction(async (tx) => {
      const messages = await tx.whatsAppMessage.findMany({
        where: {
          provider: 'KIRAGO',
          whatsAppConnectionId: connection.id,
          providerMessageId: { in: providerMessageIds },
          direction: 'OUTBOUND',
        },
      });
      const changed: Array<{ id: string; conversationId: string }> = [];

      for (const message of messages) {
        const data = this.buildReceiptStatusUpdate(message, receiptState, receiptTimestamp);

        if (!data) {
          continue;
        }

        const updatedMessage = await tx.whatsAppMessage.update({
          where: { id: message.id },
          data,
        });
        changed.push({ id: updatedMessage.id, conversationId: updatedMessage.conversationId });
      }

      return changed;
    });

    for (const message of updated) {
      this.emitMessageUpdated(message.conversationId, message.id);
    }

    this.logger.log(
      `Kirago receipt state=${receiptState} ids=${providerMessageIds.length} updated=${updated.length}`,
    );

    return {
      processed: updated.length > 0,
      action: updated.length > 0 ? 'receipt_status_updated' : 'receipt_status_unchanged',
      updatedCount: updated.length,
    };
  }

  private buildReceiptStatusUpdate(
    message: WhatsAppMessage,
    state: NonNullable<NormalizedWhatsAppReceipt['state']>,
    timestamp: Date,
  ): Prisma.WhatsAppMessageUpdateInput | null {
    const data: Prisma.WhatsAppMessageUpdateInput = {};

    if (state === 'READ') {
      if (message.status !== 'READ') {
        data.status = 'READ';
      }

      if (!message.readAt) {
        data.readAt = timestamp;
      }

      return Object.keys(data).length ? data : null;
    }

    if (message.status !== 'READ' && this.receiptStatusRank(message.status) < 2) {
      data.status = 'DELIVERED';
    }

    if (
      !message.deliveredAt &&
      (!message.readAt || timestamp.getTime() <= message.readAt.getTime())
    ) {
      data.deliveredAt = timestamp;
    }

    return Object.keys(data).length ? data : null;
  }

  private receiptStatusRank(status: WhatsAppMessage['status']) {
    if (status === 'READ') return 3;
    if (status === 'DELIVERED') return 2;
    if (status === 'SENT') return 1;
    if (status === 'PENDING') return 0;
    return -1;
  }

  private async processConversationWebhook(
    connection: WhatsAppConnection,
    normalized: NormalizedWhatsAppMessage & { phone: string },
    clients: Array<{ id: string }>,
  ) {
    const matchedClientId = clients.length === 1 && clients[0] ? clients[0].id : null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existingMessage = await this.findExistingConversationMessage(tx, connection.id, {
          providerMessageId: normalized.messageId,
          requestId: this.webhookRequestIdCandidate(normalized),
        });

        if (existingMessage) {
          if (normalized.direction === 'OUTGOING') {
            const reconciled = await this.reconcileOutgoingConversationMessage(
              tx,
              existingMessage,
              normalized,
            );

            return {
              processed: true,
              action: 'outgoing_conversation_message_reconciled',
              conversationId: reconciled.conversationId,
              messageId: reconciled.id,
            };
          }

          return {
            processed: true,
            action: 'duplicate_conversation_message',
            conversationId: existingMessage.conversationId,
            messageId: existingMessage.id,
          };
        }

        const conversation = await this.upsertWebhookConversation(tx, {
          connection,
          normalized,
          matchedClientId,
        });
        const sentAt = normalized.messageTimestamp ?? normalized.receivedAt ?? new Date();
        const direction = normalized.direction === 'OUTGOING' ? 'OUTBOUND' : 'INBOUND';
        const messageType = this.toConversationMessageType(normalized.messageType);
        const metadata = this.buildConversationRawMetadata(normalized);
        const media = this.conversationMediaFields(normalized.mediaMetadata);
        const reply = await this.resolveInboundReplyReference(tx, conversation, normalized);
        const message = await this.createConversationMessage(tx, {
          conversation,
          normalized,
          direction,
          messageType,
          sentAt,
          media,
          metadata,
          reply,
        });

        if (message.duplicate) {
          return {
            processed: true,
            action: 'duplicate_conversation_message',
            conversationId: message.conversationId,
            messageId: message.id,
          };
        }

        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: sentAt,
            lastMessagePreview: this.conversationLastMessagePreview(messageType, {
              text: normalized.text,
              mediaFileName: media.mediaFileName,
            }),
            ...(direction === 'INBOUND'
              ? {
                  unreadCount: { increment: 1 },
                  ...(conversation.status === 'RESOLVED' ? { status: 'OPEN' as const } : {}),
                }
              : {}),
          },
        });

        return {
          processed: true,
          action:
            direction === 'OUTBOUND'
              ? 'external_outgoing_message_persisted'
              : 'conversation_message_persisted',
          conversationId: conversation.id,
          direction,
          messageId: message.id,
        };
      });

      if (result.processed && result.conversationId) {
        if (
          result.action === 'conversation_message_persisted' ||
          result.action === 'external_outgoing_message_persisted'
        ) {
          if (result.direction !== 'INBOUND' && result.direction !== 'OUTBOUND') {
            throw new Error('Direction missing for WhatsApp message.created realtime event.');
          }
          this.emitMessageCreated(result.conversationId, result.messageId, result.direction);
          this.emitConversationUpdated(result.conversationId);
        } else if (result.action === 'outgoing_conversation_message_reconciled') {
          this.emitMessageUpdated(result.conversationId, result.messageId);
          this.emitConversationUpdated(result.conversationId);
        }
      }

      return result;
    } catch (error) {
      if (!this.isDuplicateConversationMessage(error)) {
        throw error;
      }

      const existingMessage = await this.findExistingConversationMessage(
        this.prisma,
        connection.id,
        {
          providerMessageId: normalized.messageId,
          requestId: this.webhookRequestIdCandidate(normalized),
        },
      );

      if (existingMessage) {
        return {
          processed: true,
          action: 'duplicate_conversation_message',
          conversationId: existingMessage.conversationId,
          messageId: existingMessage.id,
        };
      }

      throw error;
    }
  }

  private async createConversationMessage(
    tx: Prisma.TransactionClient,
    input: {
      conversation: WhatsAppConversation;
      normalized: NormalizedWhatsAppMessage & { phone: string };
      direction: 'INBOUND' | 'OUTBOUND';
      messageType: WhatsAppConversationMessageType;
      sentAt: Date;
      media: ReturnType<WhatsAppService['conversationMediaFields']>;
      metadata: Record<string, Prisma.InputJsonValue>;
      reply: {
        replyToMessageId: string | null;
        replyToProviderMessageId: string | null;
        quotedText: string | null;
      };
    },
  ) {
    const message = await tx.whatsAppMessage.create({
      data: buildWhatsAppMessageCreateDataForConversation(input.conversation, {
        provider: 'KIRAGO',
        providerMessageId: input.normalized.messageId,
        requestId: null,
        messageDispatchId: null,
        replyToMessageId: input.reply.replyToMessageId,
        replyToProviderMessageId: input.reply.replyToProviderMessageId,
        quotedText: input.reply.quotedText,
        direction: input.direction,
        type: input.messageType,
        text: this.conversationMessageText(input.messageType, input.normalized.text),
        status: 'SENT',
        sentAt: input.sentAt,
        failedAt: null,
        isFromMe: input.normalized.direction === 'OUTGOING',
        rawMetadata: input.metadata,
        ...input.media,
      }),
      select: { id: true, conversationId: true },
    });

    return { ...message, duplicate: false as const };
  }

  private async resolveInboundReplyReference(
    tx: Prisma.TransactionClient,
    conversation: WhatsAppConversation,
    normalized: NormalizedWhatsAppMessage,
  ) {
    const providerMessageId = normalized.replyContext?.providerMessageId ?? null;

    if (!providerMessageId) {
      return {
        replyToMessageId: null,
        replyToProviderMessageId: null,
        quotedText: null,
      };
    }

    const original = await tx.whatsAppMessage.findFirst({
      where: {
        provider: normalized.provider,
        whatsAppConnectionId: conversation.whatsAppConnectionId,
        conversationId: conversation.id,
        providerMessageId,
      },
      select: {
        id: true,
        type: true,
        text: true,
        mediaFileName: true,
      },
    });

    return {
      replyToMessageId: original?.id ?? null,
      replyToProviderMessageId: providerMessageId,
      quotedText:
        this.quotedTextSnapshot(normalized.replyContext?.quotedText) ??
        (original ? this.whatsAppQuotePreview(original) : null),
    };
  }

  private async findExistingConversationMessage(
    tx: WhatsAppMessageLookupClient,
    whatsAppConnectionId: string,
    input: { providerMessageId: string | null; requestId: string | null },
  ) {
    if (input.providerMessageId) {
      const byProviderMessageId = await tx.whatsAppMessage.findFirst({
        where: {
          provider: 'KIRAGO',
          whatsAppConnectionId,
          providerMessageId: input.providerMessageId,
        },
      });

      if (byProviderMessageId) {
        return byProviderMessageId;
      }
    }

    if (!input.requestId) {
      return null;
    }

    return tx.whatsAppMessage.findFirst({
      where: { whatsAppConnectionId, requestId: input.requestId },
    });
  }

  private webhookRequestIdCandidate(normalized: NormalizedWhatsAppMessage) {
    return normalized.direction === 'OUTGOING' ? normalized.messageId : null;
  }

  private async reconcileOutgoingConversationMessage(
    tx: Prisma.TransactionClient,
    existing: WhatsAppMessage,
    normalized: NormalizedWhatsAppMessage & { phone: string },
  ) {
    const normalizedMessageType = this.toConversationMessageType(normalized.messageType);
    const preservesManualMediaType = this.shouldPreserveManualOutboundMediaType(
      existing,
      normalizedMessageType,
    );
    const messageType = preservesManualMediaType ? existing.type : normalizedMessageType;
    const media = this.conversationMediaFields(normalized.mediaMetadata);
    const sentAt = normalized.messageTimestamp ?? normalized.receivedAt ?? new Date();
    const updated = await tx.whatsAppMessage.update({
      where: { id: existing.id },
      data: {
        providerMessageId: existing.providerMessageId ?? normalized.messageId,
        status: 'SENT',
        sentAt: existing.sentAt ?? sentAt,
        failedAt: null,
        ...(messageType === existing.type ? {} : { type: messageType }),
        ...(existing.text === null && !preservesManualMediaType
          ? { text: this.conversationMessageText(messageType, normalized.text) }
          : {}),
        ...(existing.mediaMimeType === null ? { mediaMimeType: media.mediaMimeType } : {}),
        ...(existing.mediaFileName === null ? { mediaFileName: media.mediaFileName } : {}),
        ...(existing.mediaSizeBytes === null ? { mediaSizeBytes: media.mediaSizeBytes } : {}),
        ...(existing.mediaDurationSeconds === null
          ? { mediaDurationSeconds: media.mediaDurationSeconds }
          : {}),
        ...this.reconciledRawMetadataUpdate(existing.rawMetadata, normalized),
      },
    });

    await tx.whatsAppConversation.update({
      where: { id: existing.conversationId },
      data: {
        lastMessageAt: updated.sentAt ?? sentAt,
        lastMessagePreview: this.conversationLastMessagePreview(messageType, {
          text: updated.text,
          mediaFileName: updated.mediaFileName,
        }),
      },
    });

    return updated;
  }

  private shouldPreserveManualOutboundMediaType(
    existing: WhatsAppMessage,
    normalizedMessageType: WhatsAppConversationMessageType,
  ) {
    return (
      normalizedMessageType === 'TEXT' &&
      (existing.type === 'IMAGE' || existing.type === 'DOCUMENT' || existing.type === 'AUDIO') &&
      this.isManualOutboundMediaMessage(existing)
    );
  }

  private isManualOutboundMediaMessage(message: WhatsAppMessage) {
    const metadata = this.rawMetadataObject(message.rawMetadata);

    return (
      message.direction === 'OUTBOUND' &&
      (metadata.source === 'manual_outbound_media_send' ||
        metadata.source === 'manual_outbound_voice_send') &&
      Boolean(message.mediaMimeType || this.asRecord(metadata.localMedia))
    );
  }

  private isManualOutboundVoiceMessage(
    message: Pick<WhatsAppMessage, 'direction' | 'rawMetadata'>,
  ) {
    const metadata = this.rawMetadataObject(message.rawMetadata);

    return message.direction === 'OUTBOUND' && metadata.source === 'manual_outbound_voice_send';
  }

  private async upsertWebhookConversation(
    tx: Prisma.TransactionClient,
    input: {
      connection: WhatsAppConnection;
      normalized: NormalizedWhatsAppMessage & { phone: string };
      matchedClientId: string | null;
    },
  ): Promise<WhatsAppConversation> {
    const { connection, normalized, matchedClientId } = input;
    const existing = await tx.whatsAppConversation.findUnique({
      where: {
        whatsAppConnectionId_phoneNormalized: {
          whatsAppConnectionId: connection.id,
          phoneNormalized: normalized.phone,
        },
      },
    });

    if (!existing) {
      const contactName = this.trustedWebhookContactName(normalized, connection);

      return tx.whatsAppConversation.create({
        data: {
          whatsAppConnectionId: connection.id,
          instanceName: normalized.instanceName,
          provider: 'KIRAGO',
          externalInstanceId: normalized.providerUserId,
          clientId: matchedClientId,
          contactName,
          phone: normalized.phone,
          phoneNormalized: normalized.phone,
          status: 'OPEN',
        },
      });
    }

    const contactName = this.trustedWebhookContactName(normalized, connection);
    const data: Prisma.WhatsAppConversationUpdateInput = {
      ...(contactName ? { contactName } : {}),
      ...(normalized.instanceName ? { instanceName: normalized.instanceName } : {}),
      ...(normalized.providerUserId ? { externalInstanceId: normalized.providerUserId } : {}),
      ...(existing.clientId === null && matchedClientId
        ? { client: { connect: { id: matchedClientId } } }
        : {}),
    };

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return tx.whatsAppConversation.update({
      where: { id: existing.id },
      data,
    });
  }

  private trustedWebhookContactName(
    normalized: NormalizedWhatsAppMessage,
    connection: Pick<WhatsAppConnection, 'name' | 'providerInstanceName' | 'providerUserId'>,
  ) {
    if (normalized.direction !== 'INCOMING') {
      return null;
    }

    return this.validConversationContactName({
      contactName: normalized.contactName,
      instanceName: normalized.instanceName,
      externalInstanceId: normalized.providerUserId,
      connectionName: connection.name,
      providerInstanceName: connection.providerInstanceName,
      providerUserId: connection.providerUserId,
    });
  }

  private findConnectionForWebhook(
    normalized: Pick<NormalizedKiragoWebhook, 'providerUserId' | 'instanceName'>,
  ) {
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

  private buildConversationWhere(
    query: ListWhatsAppConversationsDto,
  ): Prisma.WhatsAppConversationWhereInput {
    const where: Prisma.WhatsAppConversationWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.whatsAppConnectionId) {
      where.whatsAppConnectionId = query.whatsAppConnectionId;
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    } else if (query.hasClient === true) {
      where.clientId = { not: null };
    } else if (query.hasClient === false) {
      where.clientId = null;
    }

    if (query.unreadOnly) {
      where.unreadCount = { gt: 0 };
    }

    if (query.search) {
      const search = query.search.trim();
      if (!search) {
        return where;
      }

      const normalizedPhone = this.tryNormalizePhone(search);
      where.OR = [
        { contactName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { client: { phone: { contains: search, mode: 'insensitive' } } },
        ...(normalizedPhone ? [{ phoneNormalized: { contains: normalizedPhone } }] : []),
        ...(normalizedPhone
          ? [{ client: { phoneNormalized: { contains: normalizedPhone } } }]
          : []),
      ];
    }

    return where;
  }

  private async findConversationForRead(id: string) {
    return this.prisma.whatsAppConversation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: {
          select: { name: true, providerInstanceName: true, providerUserId: true },
        },
      },
    });
  }

  private async findConversationForReadInTransaction(tx: Prisma.TransactionClient, id: string) {
    return tx.whatsAppConversation.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: {
          select: { name: true, providerInstanceName: true, providerUserId: true },
        },
      },
    });
  }

  private async findOrCreateConversationForStart(input: {
    connection: WhatsAppConnection;
    client: { id: string; name: string; phone: string; phoneNormalized: string } | null;
    phone: string;
    actorUserId: string;
  }): Promise<{
    conversation: WhatsAppConversationForPresenter;
    reusedConversation: boolean;
    clientLinked: boolean;
  }> {
    const { connection, client, phone } = input;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.whatsAppConversation.findUnique({
        where: {
          whatsAppConnectionId_phoneNormalized: {
            whatsAppConnectionId: connection.id,
            phoneNormalized: phone,
          },
        },
        include: {
          client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
          whatsAppConnection: {
            select: { name: true, providerInstanceName: true, providerUserId: true },
          },
        },
      });

      if (existing) {
        let clientLinked = false;

        if (client && existing.clientId && existing.clientId !== client.id) {
          throw new ConflictException({
            code: 'CONVERSATION_ALREADY_LINKED',
            message: 'Ja existe uma conversa para este telefone vinculada a outro cliente.',
            currentClientId: existing.clientId,
            currentClientName: existing.client?.name ?? null,
          });
        }

        if (client && existing.clientId === null) {
          await this.linkConversationClientInTransaction(tx, {
            conversationId: existing.id,
            client,
            actorUserId: input.actorUserId,
            source: 'START_CONVERSATION',
          });
          clientLinked = true;
        }

        if (existing.status === 'RESOLVED') {
          await tx.whatsAppConversation.update({
            where: { id: existing.id },
            data: { status: 'OPEN' },
          });
        }

        const conversation = await this.findConversationForReadInTransaction(tx, existing.id);

        if (!conversation) {
          throw new NotFoundException('Conversa WhatsApp nao encontrada.');
        }

        return { conversation, reusedConversation: true, clientLinked };
      }

      try {
        const created = await tx.whatsAppConversation.create({
          data: {
            whatsAppConnectionId: connection.id,
            instanceName: connection.name,
            provider: connection.provider,
            externalInstanceId: connection.providerUserId,
            clientId: client?.id ?? null,
            contactName: null,
            phone,
            phoneNormalized: phone,
            status: 'OPEN',
            unreadCount: 0,
          },
          include: {
            client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
            whatsAppConnection: {
              select: { name: true, providerInstanceName: true, providerUserId: true },
            },
          },
        });

        return { conversation: created, reusedConversation: false, clientLinked: false };
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
          throw error;
        }

        const raced = await this.findConversationForReadByConnectionAndPhone(tx, {
          connectionId: connection.id,
          phone,
        });

        if (!raced) {
          throw error;
        }

        if (client && raced.clientId && raced.clientId !== client.id) {
          throw new ConflictException({
            code: 'CONVERSATION_ALREADY_LINKED',
            message: 'Ja existe uma conversa para este telefone vinculada a outro cliente.',
            currentClientId: raced.clientId,
            currentClientName: raced.client?.name ?? null,
          });
        }

        return { conversation: raced, reusedConversation: true, clientLinked: false };
      }
    });
  }

  private async findConversationForReadByConnectionAndPhone(
    tx: Prisma.TransactionClient,
    input: { connectionId: string; phone: string },
  ) {
    return tx.whatsAppConversation.findUnique({
      where: {
        whatsAppConnectionId_phoneNormalized: {
          whatsAppConnectionId: input.connectionId,
          phoneNormalized: input.phone,
        },
      },
      include: {
        client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
        whatsAppConnection: {
          select: { name: true, providerInstanceName: true, providerUserId: true },
        },
      },
    });
  }

  private async linkConversationClientInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      conversationId: string;
      client: { id: string; name: string };
      actorUserId: string;
      source: 'MANUAL_LINK' | 'START_CONVERSATION';
    },
  ) {
    const updated = await tx.whatsAppConversation.updateMany({
      where: { id: input.conversationId, clientId: null },
      data: { clientId: input.client.id },
    });

    if (updated.count !== 1) {
      const current = await tx.whatsAppConversation.findUnique({
        where: { id: input.conversationId },
        include: { client: { select: { id: true, name: true } } },
      });

      if (!current) {
        throw new NotFoundException('Conversa WhatsApp nao encontrada.');
      }

      if (current.clientId === input.client.id) {
        return;
      }

      throw new ConflictException({
        code: 'CONVERSATION_ALREADY_LINKED',
        message: 'Esta conversa ja esta vinculada a outro cliente.',
        currentClientId: current.clientId,
        currentClientName: current.client?.name ?? null,
      });
    }

    const conversation = await tx.whatsAppConversation.findUnique({
      where: { id: input.conversationId },
      select: {
        id: true,
        phone: true,
        phoneNormalized: true,
        whatsAppConnectionId: true,
      },
    });

    await tx.clientEvent.create({
      data: {
        clientId: input.client.id,
        type: 'CLIENT_UPDATED',
        title:
          input.source === 'START_CONVERSATION'
            ? 'Conversa WhatsApp vinculada ao iniciar atendimento.'
            : 'Conversa WhatsApp vinculada manualmente.',
        description: `Conversa WhatsApp ${conversation?.phoneNormalized ?? input.conversationId} vinculada ao cliente.`,
        metadata: {
          source: input.source,
          conversationId: input.conversationId,
          clientId: input.client.id,
          whatsAppConnectionId: conversation?.whatsAppConnectionId ?? null,
          phone: conversation?.phone ?? null,
          phoneNormalized: conversation?.phoneNormalized ?? null,
        },
        createdByUserId: input.actorUserId,
      },
    });
  }

  private async ensureConversationExists(id: string) {
    const exists = await this.prisma.whatsAppConversation.count({ where: { id } });

    if (!exists) {
      throw new NotFoundException('Conversa WhatsApp nao encontrada.');
    }
  }

  private async findConversationMessageByRequestId(
    whatsAppConnectionId: string,
    requestId: string,
  ) {
    return this.prisma.whatsAppMessage.findFirst({
      where: { whatsAppConnectionId, requestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private assertMessageBelongsToConversation(
    message: Pick<WhatsAppMessage, 'conversationId'>,
    conversationId: string,
  ) {
    if (message.conversationId !== conversationId) {
      throw new ConflictException('requestId ja foi usado em outra conversa desta conexao.');
    }
  }

  private async resolveConversationReplyTarget(
    conversation: WhatsAppConversation,
    replyToMessageId: string | undefined,
  ): Promise<ResolvedWhatsAppReplyTarget | null> {
    if (!replyToMessageId) {
      return null;
    }

    const message = await this.prisma.whatsAppMessage.findUnique({
      where: { id: replyToMessageId },
      select: {
        id: true,
        conversationId: true,
        whatsAppConnectionId: true,
        provider: true,
        providerMessageId: true,
        type: true,
        text: true,
        mediaFileName: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Mensagem citada nao encontrada.');
    }

    if (
      message.conversationId !== conversation.id ||
      message.whatsAppConnectionId !== conversation.whatsAppConnectionId ||
      message.provider !== conversation.provider
    ) {
      throw new BadRequestException('Mensagem citada nao pertence a esta conversa.');
    }

    if (!message.providerMessageId) {
      throw new BadRequestException('Mensagem citada ainda nao possui id do WhatsApp.');
    }

    const quotedText = this.whatsAppQuotePreview(message);

    return {
      message,
      providerReply: {
        stanzaId: message.providerMessageId,
        participant: this.privateConversationParticipantJid(conversation),
        quotedText,
      },
      quotedText,
    };
  }

  private async createPendingConversationTextMessage(
    conversation: WhatsAppConversation,
    input: {
      body: string;
      requestId: string;
      replyTarget?: ResolvedWhatsAppReplyTarget | null;
    },
  ) {
    try {
      return await this.prisma.whatsAppMessage.create({
        data: buildWhatsAppMessageCreateDataForConversation(conversation, {
          provider: 'KIRAGO',
          providerMessageId: null,
          requestId: input.requestId,
          messageDispatchId: null,
          replyToMessageId: input.replyTarget?.message.id ?? null,
          replyToProviderMessageId: input.replyTarget?.message.providerMessageId ?? null,
          quotedText: input.replyTarget?.quotedText ?? null,
          direction: 'OUTBOUND',
          type: 'TEXT',
          text: input.body,
          status: 'PENDING',
          sentAt: null,
          failedAt: null,
          isFromMe: true,
          rawMetadata: Prisma.JsonNull,
          mediaMimeType: null,
          mediaFileName: null,
          mediaSizeBytes: null,
          mediaDurationSeconds: null,
        }),
      });
    } catch (error) {
      if (!this.isDuplicateConversationMessage(error)) {
        throw error;
      }

      const existing = await this.findConversationMessageByRequestId(
        conversation.whatsAppConnectionId,
        input.requestId,
      );

      if (existing) {
        this.assertMessageBelongsToConversation(existing, conversation.id);
        return existing;
      }

      throw error;
    }
  }

  private async createPendingConversationMediaMessage(
    conversation: WhatsAppConversation,
    input: {
      media: PreparedConversationMedia;
      caption: string | null;
      requestId: string;
      source?: 'manual_outbound_media_send' | 'manual_outbound_voice_send';
    },
  ) {
    const mediaType = input.media.kind;
    const source = input.source ?? 'manual_outbound_media_send';

    try {
      return await this.prisma.whatsAppMessage.create({
        data: buildWhatsAppMessageCreateDataForConversation(conversation, {
          provider: 'KIRAGO',
          providerMessageId: null,
          requestId: input.requestId,
          messageDispatchId: null,
          direction: 'OUTBOUND',
          type: mediaType,
          text: input.caption,
          status: 'PENDING',
          sentAt: null,
          failedAt: null,
          isFromMe: true,
          rawMetadata: {
            source,
            storage: 'transient_request_only',
            retryPolicy: 'select_file_again_after_reload',
          },
          mediaMimeType: input.media.mimeType,
          mediaFileName: input.media.fileName,
          mediaSizeBytes: input.media.sizeBytes,
          mediaDurationSeconds: input.media.durationSeconds,
        }),
      });
    } catch (error) {
      if (!this.isDuplicateConversationMessage(error)) {
        throw error;
      }

      const existing = await this.findConversationMessageByRequestId(
        conversation.whatsAppConnectionId,
        input.requestId,
      );

      if (existing) {
        this.assertMessageBelongsToConversation(existing, conversation.id);
        return existing;
      }

      throw error;
    }
  }

  private async storeOutboundLocalMediaSafely(
    whatsAppConnectionId: string,
    messageId: string,
    media: PreparedConversationMedia,
  ): Promise<{ localMedia: StoredWhatsAppMedia | null; errorMessage: string | null }> {
    try {
      const localMedia = await this.mediaStorage.storeOutboundMedia({
        whatsAppConnectionId,
        messageId,
        buffer: media.buffer,
        mimeType: media.mimeType,
        sizeBytes: media.sizeBytes,
      });

      return { localMedia, errorMessage: null };
    } catch (error) {
      const errorMessage = this.sanitizeError(error);
      this.logger.warn(`Falha ao armazenar midia outbound WhatsApp localmente: ${errorMessage}`);
      return { localMedia: null, errorMessage };
    }
  }

  private async rememberConversationProviderConfirmation(input: {
    messageId: string;
    providerMessageId: string | null;
    rawMetadata: Prisma.InputJsonValue | Prisma.JsonValue | null;
  }) {
    try {
      await this.prisma.whatsAppMessage.update({
        where: { id: input.messageId },
        data: {
          providerMessageId: input.providerMessageId,
          rawMetadata: input.rawMetadata === null ? Prisma.JsonNull : input.rawMetadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao preservar confirmacao provider WhatsApp message=${input.messageId} ${this.prismaErrorLogDetails(
          error,
        )} message=${this.sanitizeError(error)}`,
      );
    }
  }

  private async keepConversationMessagePendingAfterProviderSuccess(input: {
    conversationId: string;
    error: unknown;
    messageId: string;
  }) {
    this.logger.warn(
      `WhatsApp provider confirmou envio, mas persistencia final falhou; mantendo mensagem PENDING para reconciliacao message=${
        input.messageId
      } ${this.prismaErrorLogDetails(input.error)} message=${this.sanitizeError(input.error)}`,
    );

    const current = await this.prisma.whatsAppMessage.findUnique({
      where: { id: input.messageId },
    });

    if (!current) {
      throw input.error;
    }

    this.emitMessageUpdated(input.conversationId, input.messageId);
    return this.presentConversationMessage(current);
  }

  private async deleteLocalMediaQuietly(storageKey: string) {
    try {
      await this.mediaStorage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Falha ao remover midia outbound WhatsApp local apos erro transacional: ${this.sanitizeError(
          error,
        )}`,
      );
    }
  }

  private rawMetadataWithLocalMedia(
    current: Prisma.JsonValue | null,
    localMedia: StoredWhatsAppMedia | null,
    errorMessage: string | null,
  ) {
    const metadata = this.rawMetadataObject(current);

    if (localMedia) {
      return {
        ...metadata,
        localMedia: {
          storageKey: localMedia.storageKey,
          mimeType: localMedia.mimeType,
          sizeBytes: localMedia.sizeBytes,
        },
      } as Prisma.InputJsonValue;
    }

    if (errorMessage) {
      return {
        ...metadata,
        localMediaError: {
          source: 'local_storage',
          message: errorMessage,
        },
      } as Prisma.InputJsonValue;
    }

    return metadata as Prisma.InputJsonValue;
  }

  private retryRawMetadata(
    current: Prisma.JsonValue | null,
    input: {
      retryAttemptId: string;
      retryStatus: 'PENDING' | 'PROVIDER_CONFIRMED' | 'SENT' | 'FAILED';
      errorMessage?: string;
    },
  ) {
    const metadata = this.rawMetadataObject(current);

    return {
      ...metadata,
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      retry: {
        attemptId: input.retryAttemptId,
        status: input.retryStatus,
        at: new Date().toISOString(),
      },
    } as Prisma.InputJsonValue;
  }

  private async prepareRetryConversationMessage(
    message: WhatsAppMessage & { conversation: WhatsAppConversation },
  ): Promise<{
    send: (
      instanceToken: string,
      requestId: string,
    ) => Promise<{ providerMessageId: string | null }>;
  }> {
    if (message.type === 'TEXT') {
      const body = message.text?.trim();

      if (!body) {
        throw new UnprocessableEntityException({
          code: 'WHATSAPP_RETRY_CONTENT_UNAVAILABLE',
          message: 'Conteudo original indisponivel para reenviar.',
        });
      }

      const reply = message.replyToProviderMessageId
        ? {
            stanzaId: message.replyToProviderMessageId,
            participant: this.privateConversationParticipantJid(message.conversation),
            quotedText: message.quotedText,
          }
        : undefined;

      return {
        send: (instanceToken, requestId) =>
          this.provider.sendText(instanceToken, {
            phone: message.conversation.phoneNormalized,
            body,
            requestId,
            ...(reply ? { reply } : {}),
          }),
      };
    }

    const downloadType = this.supportedDownloadMediaType(message.type);
    const localMedia = downloadType
      ? this.localMediaFromRawMetadata(message.rawMetadata, downloadType)
      : null;

    if (!downloadType || !localMedia) {
      throw new UnprocessableEntityException({
        code: this.isManualOutboundVoiceMessage(message)
          ? 'WHATSAPP_RETRY_VOICE_RE_RECORD_REQUIRED'
          : 'WHATSAPP_RETRY_MEDIA_UNAVAILABLE',
        message: this.isManualOutboundVoiceMessage(message)
          ? 'Gravacao original indisponivel para reenviar.'
          : 'Arquivo original indisponivel para reenviar.',
      });
    }

    const buffer = await this.mediaStorage.read(localMedia.storageKey);

    if (!buffer) {
      throw new UnprocessableEntityException({
        code: 'WHATSAPP_RETRY_MEDIA_FILE_MISSING',
        message: 'Arquivo nao disponivel para reenviar.',
      });
    }

    const dataUrl = this.localMediaDataUrl(downloadType, localMedia.mimeType, buffer);

    if (downloadType === 'IMAGE') {
      return {
        send: (instanceToken, requestId) =>
          this.provider.sendImage(instanceToken, {
            phone: message.conversation.phoneNormalized,
            imageDataUrl: dataUrl,
            caption: message.text,
            requestId,
          }),
      };
    }

    if (downloadType === 'AUDIO') {
      return {
        send: (instanceToken, requestId) =>
          this.provider.sendAudio(instanceToken, {
            phone: message.conversation.phoneNormalized,
            audioDataUrl: dataUrl,
            mimeType: localMedia.mimeType,
            seconds: message.mediaDurationSeconds,
            ptt: this.isManualOutboundVoiceMessage(message),
            requestId,
          }),
      };
    }

    if (downloadType === 'DOCUMENT') {
      return {
        send: (instanceToken, requestId) =>
          this.provider.sendDocument(instanceToken, {
            phone: message.conversation.phoneNormalized,
            documentDataUrl: dataUrl,
            fileName: message.mediaFileName || 'arquivo',
            requestId,
          }),
      };
    }

    throw new UnprocessableEntityException({
      code: 'WHATSAPP_RETRY_TYPE_UNSUPPORTED',
      message: 'Tipo de mensagem nao suportado para reenvio.',
    });
  }

  private localMediaDataUrl(type: DownloadMediaType, mimeType: string, buffer: Buffer) {
    const dataMimeType = type === 'DOCUMENT' ? 'application/octet-stream' : mimeType;

    return `data:${dataMimeType};base64,${buffer.toString('base64')}`;
  }

  private prepareConversationMedia(file: ConversationMediaUploadFile | undefined) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio.');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('Arquivo vazio.');
    }

    const sizeBytes = file.size || file.buffer.length;

    if (sizeBytes > WhatsAppService.conversationMediaMaxBytes) {
      throw new BadRequestException(
        'Arquivo excede o limite interno do CRM de 10 MB para envio por WhatsApp.',
      );
    }

    const mimeType = file.mimetype;
    const safeMimeType = this.normalizeMediaMimeType(mimeType);
    const safeFileName = this.sanitizeMediaFileName(file.originalname);
    const fileExtension = this.mediaFileExtension(safeFileName);

    if (
      allowedDocumentExtensions.has(fileExtension) &&
      !this.isAllowedOutboundDocument(safeMimeType, fileExtension)
    ) {
      throw new BadRequestException('MIME nao permitido para envio de midia WhatsApp.');
    }

    if (safeMimeType && allowedImageMimeTypes.has(safeMimeType)) {
      return {
        kind: 'IMAGE' as const,
        dataUrl: `data:${mimeType};base64,${file.buffer.toString('base64')}`,
        buffer: file.buffer,
        mimeType,
        fileName: safeFileName,
        sizeBytes,
        durationSeconds: null,
      };
    }

    if (this.isAllowedOutboundDocument(safeMimeType, fileExtension)) {
      return {
        kind: 'DOCUMENT' as const,
        dataUrl: `data:application/octet-stream;base64,${file.buffer.toString('base64')}`,
        buffer: file.buffer,
        mimeType: safeMimeType || 'application/octet-stream',
        fileName: safeFileName,
        sizeBytes,
        durationSeconds: null,
      };
    }

    if (safeMimeType && allowedAudioMimeTypes.has(safeMimeType)) {
      return {
        kind: 'AUDIO' as const,
        dataUrl: `data:${mimeType};base64,${file.buffer.toString('base64')}`,
        buffer: file.buffer,
        mimeType,
        fileName: safeFileName,
        sizeBytes,
        durationSeconds: null,
      };
    }

    if (safeMimeType === 'audio/webm') {
      throw new BadRequestException('Formato de audio nao suportado. Envie OGG, MP3 ou M4A.');
    }

    throw new BadRequestException('MIME nao permitido para envio de midia WhatsApp.');
  }

  private async prepareConversationVoiceMedia(
    file: ConversationMediaUploadFile | undefined,
    durationSeconds: string | number | undefined,
  ): Promise<PreparedConversationMedia> {
    this.validateConversationVoiceUpload(file);
    const safeFile = file as ConversationMediaUploadFile;

    try {
      const converted = await this.voiceConversion.convertWebmToOgg({
        buffer: safeFile.buffer,
        mimeType: safeFile.mimetype,
        durationSeconds: this.parseVoiceDurationHint(durationSeconds),
      });
      const duration = this.whatsAppVoiceDurationSeconds(converted.durationSeconds);

      return {
        kind: 'AUDIO',
        dataUrl: `data:audio/ogg;base64,${converted.buffer.toString('base64')}`,
        buffer: converted.buffer,
        mimeType: converted.mimeType,
        fileName: 'voice-note.ogg',
        sizeBytes: converted.sizeBytes,
        durationSeconds: duration,
      };
    } catch (error) {
      throw this.mapVoiceConversionError(error);
    }
  }

  private validateConversationVoiceUpload(file: ConversationMediaUploadFile | undefined) {
    if (!file) {
      throw new BadRequestException('Arquivo obrigatorio.');
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('Arquivo vazio.');
    }

    const sizeBytes = file.size || file.buffer.length;

    if (sizeBytes > WhatsAppService.conversationVoiceMaxBytes) {
      throw new PayloadTooLargeException(
        'Arquivo excede o limite interno do CRM de 5 MB para gravacao de voz.',
      );
    }

    if (!allowedVoiceInputMimeTypes.has(this.normalizeVoiceInputMimeType(file.mimetype))) {
      throw new BadRequestException('MIME nao permitido para gravacao de voz WhatsApp.');
    }
  }

  private parseVoiceDurationHint(value: string | number | undefined) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private whatsAppVoiceDurationSeconds(durationSeconds: number) {
    return Math.min(60, Math.max(1, Math.ceil(durationSeconds)));
  }

  private normalizeVoiceInputMimeType(mimeType: string) {
    return mimeType
      .split(';')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
      .join(';');
  }

  private mapVoiceConversionError(error: unknown) {
    if (!(error instanceof HttpException)) {
      return error;
    }

    const response = error.getResponse();
    const code =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'message' in response
          ? String((response as { message?: unknown }).message)
          : '';

    if (code === 'VOICE_CONVERSION_TIMEOUT') {
      return new ServiceUnavailableException(code);
    }

    if (code === 'VOICE_CONVERSION_FAILED') {
      return new UnprocessableEntityException(code);
    }

    return error;
  }

  private sanitizeMediaFileName(originalName: string) {
    const rawName = originalName.split(/[\\/]/).pop()?.trim() || 'arquivo';
    const normalized = rawName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\.+/, '')
      .slice(0, 120);

    return normalized || 'arquivo';
  }

  private mediaFileExtension(fileName: string) {
    const lastDot = fileName.lastIndexOf('.');

    return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
  }

  private isAllowedOutboundDocument(mimeType: string | null, extension: string) {
    if (!allowedDocumentExtensions.has(extension)) {
      return false;
    }

    if (!mimeType || genericDocumentMimeTypes.has(mimeType)) {
      return true;
    }

    return documentMimeTypesByExtension[extension]?.has(mimeType) ?? false;
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

  private resolveKiragoMarkReadPhone(conversationId: string, phoneNormalized: string) {
    const legacyVariant = brazilCanonicalMobileToLegacyVariant(phoneNormalized);

    if (legacyVariant) {
      this.logger.log(`WhatsApp markread conversation=${conversationId} phoneVariant=legacy`);
      return legacyVariant;
    }

    this.logger.log(`WhatsApp markread conversation=${conversationId} phoneVariant=canonical`);
    return phoneNormalized;
  }

  private async findClientsByPhone(phoneNormalized: string) {
    return this.prisma.client.findMany({
      where: { phoneNormalized },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
  }

  private async findClientsForIncomingPhone(phoneNormalized: string) {
    const exactMatches = await this.findClientsByPhone(phoneNormalized);

    if (exactMatches.length > 0) {
      return exactMatches;
    }

    const legacyVariant = brazilLegacyMobileVariant(phoneNormalized);

    if (!legacyVariant) {
      return exactMatches;
    }

    return this.findClientsByPhone(legacyVariant);
  }

  private async createPendingDispatch(input: {
    clientId: string | null;
    clientReferenceId?: string;
    connectionId: string;
    receivableId?: string;
    templateId?: string;
    phone: string;
    body: string;
    requestId: string;
    origin?: MessageDispatchOrigin;
    idempotencyKey?: string;
    dispatchItems?: PixWhatsAppDispatchItem[];
  }) {
    try {
      const dispatch = await this.prisma.messageDispatch.create({
        data: {
          clientId: input.clientId,
          ...(input.clientReferenceId ? { clientReferenceId: input.clientReferenceId } : {}),
          whatsAppConnectionId: input.connectionId,
          phone: input.phone,
          body: input.body,
          requestId: input.requestId,
          origin: input.origin ?? 'MANUAL',
          status: 'PENDING',
          ...(input.receivableId ? { receivableId: input.receivableId } : {}),
          ...(input.templateId ? { templateId: input.templateId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.dispatchItems?.length
            ? {
                items: {
                  create: input.dispatchItems,
                },
              }
            : {}),
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

  private async buildPixWhatsAppContext(
    intent: PixPaymentIntentForWhatsApp,
  ): Promise<PixWhatsAppContext> {
    if (intent.receivable) {
      const receivable = intent.receivable;
      const currentIntent = await this.prisma.paymentIntent.findFirst({
        where: {
          receivableId: receivable.id,
          paymentGroupId: null,
          status: 'WAITING_PAYMENT',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      if (currentIntent?.id !== intent.id) {
        throw new ConflictException('Somente o PIX atual aguardando pagamento pode ser enviado.');
      }

      if (receivable.purpose === 'MANUAL_CHARGE') {
        if (!receivable.payerName || !receivable.payerPhoneNormalized) {
          throw new BadRequestException('Cobranca avulsa sem pagador valido para WhatsApp.');
        }

        const phone = normalizeBrazilPhone(receivable.payerPhoneNormalized);

        return {
          kind: 'MANUAL_CHARGE',
          client: receivable.client,
          clientEventClientId: receivable.clientId ?? null,
          receivable,
          phone,
          dispatchItems: [],
          description: `${this.formatCurrency(intent.amount)} referente a ${receivable.description}.`,
          metadata: {
            receivableId: receivable.id,
            origin: 'MANUAL_CHARGE_PIX',
          },
        };
      }

      const client = receivable.client!;
      const phone = normalizeBrazilPhone(client.phoneNormalized);

      return {
        kind: 'INDIVIDUAL',
        client,
        clientEventClientId: client.id,
        receivable,
        phone,
        dispatchItems: [],
        description: `${this.formatCurrency(intent.amount)} referente a ${receivable.description}.`,
        metadata: {
          receivableId: receivable.id,
          origin: 'MANUAL_PIX',
        },
      };
    }

    const paymentGroup = intent.paymentGroup;
    if (!paymentGroup) {
      throw new ConflictException('PIX sem contexto de cobranca valido.');
    }
    const currentIntent = await this.prisma.paymentIntent.findFirst({
      where: {
        paymentGroupId: paymentGroup.id,
        receivableId: null,
        status: 'WAITING_PAYMENT',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    if (currentIntent?.id !== intent.id) {
      throw new ConflictException(
        'Somente o PIX agrupado atual aguardando pagamento pode ser enviado.',
      );
    }

    const phone = normalizeBrazilPhone(paymentGroup.client.phoneNormalized);
    const dispatchItems = paymentGroup.items.map((item) => ({
      receivableId: item.receivableId,
      clientReferenceId: item.receivable.clientReferenceId!,
      amount: item.amount,
      dueDate: item.receivable.dueDate,
      referenceSnapshot: item.receivable.clientReference!.reference,
      statusSnapshot: item.receivable.status,
    }));

    return {
      kind: 'GROUPED',
      client: paymentGroup.client,
      clientEventClientId: paymentGroup.client.id,
      paymentGroup,
      phone,
      dispatchItems,
      description: `${paymentGroup.items.length} contas. Total: ${this.formatCurrency(intent.amount)}.`,
      metadata: {
        paymentGroupId: paymentGroup.id,
        receivableIds: paymentGroup.items.map((item) => item.receivableId),
        itemCount: paymentGroup.items.length,
        origin: 'GROUPED_PIX',
      },
      templateItems: paymentGroup.items.map((item) => ({
        reference: item.receivable.clientReference!.reference,
        amount: item.amount,
      })),
    };
  }

  private validatePixIntentForWhatsApp(
    intent: PixPaymentIntentForWhatsApp | null,
  ): asserts intent is PixPaymentIntentForWhatsApp {
    if (!intent) {
      throw new NotFoundException('Intencao de pagamento nao encontrada.');
    }

    if (Boolean(intent.receivable) === Boolean(intent.paymentGroup)) {
      throw new ConflictException('PIX sem contexto de cobranca valido.');
    }

    if (intent.status !== 'WAITING_PAYMENT') {
      throw new ConflictException('Somente PIX aguardando pagamento pode ser enviado.');
    }

    if (!intent.pixCopyPaste) {
      throw new ConflictException('PIX sem copia e cola disponivel.');
    }

    if (intent.receivable) {
      if (intent.receivable.status !== 'PENDENTE') {
        throw new ConflictException('Somente contas pendentes podem receber envio de PIX.');
      }

      if (intent.receivable.purpose === 'MANUAL_CHARGE') {
        if (!intent.receivable.payerPhoneNormalized) {
          throw new BadRequestException('Cobranca avulsa sem telefone valido para WhatsApp.');
        }

        normalizeBrazilPhone(intent.receivable.payerPhoneNormalized);

        if (!intent.receivable.payerName) {
          throw new BadRequestException('Cobranca avulsa sem pagador valido para WhatsApp.');
        }

        return;
      }

      if (!intent.receivable.client?.phoneNormalized) {
        throw new BadRequestException('Cliente sem WhatsApp cadastrado.');
      }

      return;
    }

    const paymentGroup = intent.paymentGroup;
    if (!paymentGroup) {
      throw new ConflictException('PIX sem contexto de cobranca valido.');
    }

    if (paymentGroup.status !== 'WAITING_PAYMENT') {
      throw new ConflictException('Somente agrupamentos aguardando pagamento podem receber PIX.');
    }

    if (!paymentGroup.client?.phoneNormalized) {
      throw new BadRequestException('Cliente sem WhatsApp cadastrado.');
    }

    if (paymentGroup.items.length === 0) {
      throw new ConflictException('PIX agrupado sem contas vinculadas.');
    }

    if (paymentGroup.items.some((item) => item.receivable.status !== 'PENDENTE')) {
      throw new ConflictException('Somente contas pendentes podem receber envio de PIX.');
    }
  }

  private async createManualChargeWhatsAppAuditEvent(
    tx: Prisma.TransactionClient,
    input: {
      actorUserId: string;
      dispatchId: string;
      intent: PixPaymentIntentForWhatsApp;
      phone: string;
      receivable: NonNullable<PixPaymentIntentForWhatsApp['receivable']>;
    },
  ) {
    const existing = await tx.receivableAuditEvent.findFirst({
      where: {
        receivableId: input.receivable.id,
        paymentIntentId: input.intent.id,
        messageDispatchId: input.dispatchId,
        eventType: 'WHATSAPP_SENT',
      },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return tx.receivableAuditEvent.create({
      data: {
        receivableId: input.receivable.id,
        paymentIntentId: input.intent.id,
        messageDispatchId: input.dispatchId,
        eventType: 'WHATSAPP_SENT',
        actorUserId: input.actorUserId,
        provider: input.intent.provider,
        providerTransactionId: input.intent.providerTransactionId,
        payerNameSnapshot: input.receivable.payerName,
        payerPhoneMasked: this.maskPhone(input.phone),
        metadata: {
          channel: 'WHATSAPP',
          amount: input.intent.amount.toString(),
          dueDate: formatBusinessDate(input.receivable.dueDate),
          origin: 'MANUAL_CHARGE_PIX',
        },
      },
    });
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

  private async requireUsableConnectionById(id: string) {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp selecionada nao esta operacional.');
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
    this.appendWebhookToken(url);
    return url.toString();
  }

  private appendWebhookToken(url: URL) {
    const token = this.config.get<string>('KIRAGO_WEBHOOK_TOKEN')?.trim();

    if (token && !url.searchParams.has('kirago_webhook_token')) {
      url.searchParams.set('kirago_webhook_token', token);
    }
  }

  private redactWebhookToken(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactWebhookToken(item));
    }

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          typeof item === 'string' ? this.redactWebhookUrl(item) : this.redactWebhookToken(item),
        ]),
      );
    }

    return typeof value === 'string' ? this.redactWebhookUrl(value) : value;
  }

  private redactWebhookUrl(value: string) {
    try {
      const url = new URL(value);
      if (url.searchParams.has('kirago_webhook_token')) {
        url.searchParams.set('kirago_webhook_token', '[redacted]');
      }
      return url.toString();
    } catch {
      return value.replace(/(kirago_webhook_token=)[^&\s]+/gi, '$1[redacted]');
    }
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

    if (error.code === 'KIRAGO_RATE_LIMITED') {
      throw new ServiceUnavailableException(
        'Limite temporario de envios do WhatsApp atingido. Aguarde antes de tentar novamente.',
      );
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

  private presentPixSendResult(
    dispatch: MessageDispatch & {
      client?: { id: string; name: string; reference: string } | null;
      whatsAppConnection?: { id: string; name: string; provider: string } | null;
    },
    success: boolean,
    reused = false,
  ) {
    return {
      success,
      dispatchId: dispatch.id,
      messageDispatchId: dispatch.id,
      status: dispatch.status,
      phoneMasked: this.maskPhone(dispatch.phone),
      sentAt: dispatch.sentAt?.toISOString() ?? null,
      createdAt: dispatch.createdAt.toISOString(),
      reused,
      idempotent: reused,
      destinationMasked: this.maskPhone(dispatch.phone),
      providerMessageId: dispatch.providerMessageId,
      errorMessage: dispatch.errorMessage,
    };
  }

  private presentConversation(conversation: WhatsAppConversationForPresenter) {
    const contactName = this.validConversationContactName({
      contactName: conversation.contactName,
      instanceName: conversation.instanceName,
      externalInstanceId: conversation.externalInstanceId,
      connectionName: conversation.whatsAppConnection.name,
      providerInstanceName: conversation.whatsAppConnection.providerInstanceName,
      providerUserId: conversation.whatsAppConnection.providerUserId,
    });
    const client = conversation.client
      ? {
          id: conversation.client.id,
          name: conversation.client.name,
          phone: conversation.client.phone,
          phoneNormalized: conversation.client.phoneNormalized,
        }
      : null;

    return {
      id: conversation.id,
      whatsAppConnectionId: conversation.whatsAppConnectionId,
      instanceName: conversation.instanceName,
      provider: conversation.provider,
      externalInstanceId: conversation.externalInstanceId,
      client,
      displayName: client?.name ?? conversation.phone,
      contactName,
      phone: conversation.phone,
      phoneNormalized: conversation.phoneNormalized,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      unreadCount: conversation.unreadCount,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private validConversationContactName(input: {
    contactName: string | null;
    instanceName: string | null;
    externalInstanceId: string | null;
    connectionName: string | null;
    providerInstanceName: string | null;
    providerUserId: string | null;
  }) {
    const contactName = input.contactName?.trim();

    if (!contactName) {
      return null;
    }

    const normalizedContactName = this.normalizeContactNameComparison(contactName);
    const technicalNames = [
      input.instanceName,
      input.externalInstanceId,
      input.connectionName,
      input.providerInstanceName,
      input.providerUserId,
    ]
      .map((value) => this.normalizeContactNameComparison(value))
      .filter((value): value is string => Boolean(value));

    return normalizedContactName && technicalNames.includes(normalizedContactName)
      ? null
      : contactName;
  }

  private normalizeContactNameComparison(value: string | null | undefined) {
    const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalized || null;
  }

  private presentConversationMessage(message: WhatsAppConversationMessageForPresenter) {
    return {
      id: message.id,
      direction: message.direction,
      type: message.type,
      text: message.text,
      status: message.status,
      sentAt: message.sentAt,
      deliveredAt: message.deliveredAt,
      readAt: message.readAt,
      failedAt: message.failedAt,
      isFromMe: message.isFromMe,
      providerMessageId: message.providerMessageId,
      replyToMessageId: message.replyToMessageId,
      replyToProviderMessageId: message.replyToProviderMessageId,
      quotedText: message.quotedText,
      replyTo: message.replyTo
        ? {
            id: message.replyTo.id,
            direction: message.replyTo.direction,
            type: message.replyTo.type,
            text: message.replyTo.text,
            mediaFileName: message.replyTo.mediaFileName,
          }
        : null,
      mediaMimeType: message.mediaMimeType,
      mediaFileName: message.mediaFileName,
      mediaSizeBytes: message.mediaSizeBytes,
      mediaDurationSeconds: message.mediaDurationSeconds,
      mediaAvailable: this.hasAvailableMedia(message),
      retryAction: this.conversationMessageRetryAction(message),
      messageDispatchId: message.messageDispatchId,
      createdAt: message.createdAt,
    };
  }

  private presentConversationMessageSearchResult(
    message: WhatsAppMessage & { conversation: WhatsAppConversationForPresenter },
    term: string,
  ) {
    const text = message.text ?? '';

    return {
      message: this.presentConversationMessage(message),
      conversation: {
        id: message.conversation.id,
        displayName: this.presentConversation(message.conversation).displayName,
        phone: message.conversation.phone,
        phoneNormalized: message.conversation.phoneNormalized,
        client: message.conversation.client
          ? {
              id: message.conversation.client.id,
              name: message.conversation.client.name,
            }
          : null,
      },
      snippet: this.buildMessageSearchSnippet(text, term),
    };
  }

  private buildMessageSearchSnippet(text: string, term: string) {
    const normalizedText = text.toLocaleLowerCase('pt-BR');
    const normalizedTerm = term.toLocaleLowerCase('pt-BR');
    const index = normalizedText.indexOf(normalizedTerm);

    if (index === -1) {
      return text.length > messageSearchSnippetRadius * 2
        ? `${text.slice(0, messageSearchSnippetRadius * 2).trim()}...`
        : text;
    }

    const start = Math.max(0, index - messageSearchSnippetRadius);
    const end = Math.min(text.length, index + term.length + messageSearchSnippetRadius);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';

    return `${prefix}${text.slice(start, end).trim()}${suffix}`;
  }

  private conversationMessageRetryAction(message: WhatsAppConversationMessageForPresenter) {
    if (message.direction !== 'OUTBOUND' || message.status !== 'FAILED') {
      return null;
    }

    if (message.type === 'TEXT') {
      return message.text?.trim() ? 'RETRY' : null;
    }

    const type = this.supportedDownloadMediaType(message.type);

    if (type && this.localMediaFromRawMetadata(message.rawMetadata, type)) {
      return 'RETRY';
    }

    if (this.isManualOutboundVoiceMessage(message)) {
      return 'RECORD_AGAIN';
    }

    if (message.type === 'IMAGE' || message.type === 'DOCUMENT' || message.type === 'AUDIO') {
      return 'SELECT_FILE_AGAIN';
    }

    return null;
  }

  private presentLimitPagination(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    const hasMore = page < totalPages;

    return {
      page,
      limit,
      total,
      totalPages,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  }

  private presentMessageCursor(items: WhatsAppConversationMessageForPresenter[], hasMore: boolean) {
    if (!hasMore || !items.length) return null;
    const oldest = items[items.length - 1];
    if (!oldest) return null;
    return {
      createdAt: oldest.createdAt,
      id: oldest.id,
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
      return error.message
        .replace(/authorization\s*[:=]\s*bearer\s+[^\s"',;}]+/gi, 'Authorization: [redacted]')
        .replace(/(token|secret|api[_-]?key)\s*[:=]\s*["']?[^"',;}\s]+/gi, '$1=[redacted]')
        .replace(/([?&](?:token|secret|api[_-]?key)=)[^&\s"']+/gi, '$1[redacted]')
        .slice(0, 240);
    }

    return 'Falha ao enviar mensagem WhatsApp.';
  }

  private prismaErrorLogDetails(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return 'prismaCode=unknown';
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.filter((field): field is string => typeof field === 'string').join(',')
      : null;

    return `prismaCode=${error.code}${target ? ` target=${target}` : ''}`;
  }

  private sanitizePixSendError(error: unknown) {
    if (error instanceof ServiceUnavailableException) {
      const message = error.message;
      if (message.toLowerCase().includes('tempo limite')) {
        return 'Nao foi possivel confirmar o envio. Verifique antes de tentar novamente.';
      }
      return message.slice(0, 240);
    }

    return this.sanitizeError(error);
  }

  private maskPhone(phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) return '****';
    return `${digits.slice(0, 4)}*****${digits.slice(-4)}`;
  }

  private toConversationMessageType(type: NormalizedMessageType): WhatsAppConversationMessageType {
    const map: Record<NormalizedMessageType, WhatsAppConversationMessageType> = {
      text: 'TEXT',
      image: 'IMAGE',
      video: 'VIDEO',
      audio: 'AUDIO',
      document: 'DOCUMENT',
      sticker: 'UNKNOWN',
      location: 'LOCATION',
      live_location: 'LOCATION',
      contact: 'UNKNOWN',
      contacts: 'UNKNOWN',
      reaction: 'UNKNOWN',
      button_response: 'BUTTON',
      list_response: 'BUTTON',
      interactive_response: 'BUTTON',
      unknown: 'UNKNOWN',
    };

    return map[type];
  }

  private hasRenderableWebhookMessageContent(normalized: NormalizedWhatsAppMessage) {
    if (normalized.text?.trim()) {
      return true;
    }

    if (normalized.messageType === 'text') {
      return false;
    }

    return ['image', 'video', 'audio', 'document', 'location', 'live_location'].includes(
      normalized.messageType,
    );
  }

  private conversationMessageText(type: WhatsAppConversationMessageType, text: string | null) {
    if (type === 'AUDIO') {
      return null;
    }

    return text;
  }

  private conversationLastMessagePreview(
    type: WhatsAppConversationMessageType,
    input: { text: string | null; mediaFileName?: string | null },
  ) {
    const text = input.text?.trim();

    if (text) {
      return text.slice(0, messagePreviewLimit);
    }

    if (type === 'IMAGE') return '[Imagem]';
    if (type === 'AUDIO') return '[Audio]';
    if (type === 'DOCUMENT') return input.mediaFileName || '[Documento]';
    if (type === 'VIDEO') return '[Video]';
    if (type === 'LOCATION') return '[Localizacao]';
    if (type === 'BUTTON') return '[Resposta interativa]';
    return '[Mensagem]';
  }

  private whatsAppQuotePreview(message: Pick<WhatsAppMessage, 'type' | 'text' | 'mediaFileName'>) {
    const text = message.text?.trim();

    if (text) {
      return text.slice(0, quotedTextLimit);
    }

    if (message.type === 'IMAGE') return 'Imagem';
    if (message.type === 'AUDIO') return 'Áudio';
    if (message.type === 'DOCUMENT') return message.mediaFileName?.trim() || 'Documento';
    if (message.type === 'VIDEO') return 'Vídeo';
    if (message.type === 'LOCATION') return 'Localização';

    return 'Mensagem';
  }

  private quotedTextSnapshot(value: string | null | undefined) {
    const text = value?.trim();

    return text ? text.slice(0, quotedTextLimit) : null;
  }

  private privateConversationParticipantJid(
    conversation: Pick<WhatsAppConversation, 'phoneNormalized'>,
  ) {
    return `${conversation.phoneNormalized}@s.whatsapp.net`;
  }

  private conversationMediaFields(mediaMetadata: Record<string, unknown> | null) {
    return {
      mediaMimeType: this.optionalMetadataString(mediaMetadata, 'mimetype'),
      mediaFileName: this.optionalMetadataString(mediaMetadata, 'fileName'),
      mediaSizeBytes: this.optionalMetadataInt(mediaMetadata, 'size'),
      mediaDurationSeconds: this.optionalMetadataInt(mediaMetadata, 'seconds'),
    };
  }

  private buildConversationRawMetadata(normalized: NormalizedWhatsAppMessage) {
    const media = normalized.mediaMetadata;
    const metadata: Record<string, Prisma.InputJsonValue> = {
      originalType: normalized.messageType,
      isFromMe: normalized.direction === 'OUTGOING',
      isGroup: normalized.isGroup,
      source: normalized.direction === 'OUTGOING' ? 'external_outgoing' : 'webhook',
    };

    for (const [key, value] of [
      ['providerMessageId', normalized.messageId],
      ['providerUserId', normalized.providerUserId],
      ['instanceName', normalized.instanceName],
    ] as const) {
      if (value) {
        metadata[key] = value;
      }
    }

    for (const key of ['mimetype', 'size', 'seconds', 'fileName', 'caption'] as const) {
      const value = media?.[key];

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        metadata[key] = value;
      }
    }

    if (normalized.mediaDownloadMetadata) {
      metadata.mediaDownload = normalized.mediaDownloadMetadata;
    }

    if (normalized.replyContext) {
      metadata.replyContext = {
        providerMessageId: normalized.replyContext.providerMessageId,
        ...(normalized.replyContext.participant
          ? { participant: normalized.replyContext.participant }
          : {}),
        ...(normalized.replyContext.quotedText
          ? { quotedText: this.quotedTextSnapshot(normalized.replyContext.quotedText) }
          : {}),
      };
    }

    return metadata;
  }

  private optionalMetadataString(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private optionalMetadataInt(metadata: Record<string, unknown> | null, key: string) {
    const value = metadata?.[key];

    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    return null;
  }

  private reconciledRawMetadataUpdate(
    current: Prisma.JsonValue | null,
    normalized: NormalizedWhatsAppMessage,
  ) {
    const next = this.buildConversationRawMetadata(normalized);

    if (current === null) {
      return { rawMetadata: next };
    }

    if (!normalized.mediaDownloadMetadata || this.mediaDownloadFromRawMetadata(current)) {
      return {};
    }

    return {
      rawMetadata: {
        ...this.rawMetadataObject(current),
        mediaDownload: normalized.mediaDownloadMetadata,
      } as Prisma.InputJsonValue,
    };
  }

  private mediaDownloadFromRawMetadata(
    rawMetadata: Prisma.JsonValue | null,
    type?: DownloadMediaType,
  ) {
    const metadata = this.rawMetadataObject(rawMetadata);
    const mediaDownload = this.asRecord(metadata.mediaDownload);

    if (!mediaDownload) {
      return null;
    }

    const Url = this.optionalMetadataString(mediaDownload, 'Url');
    const MediaKey = this.optionalMetadataString(mediaDownload, 'MediaKey');
    const Mimetype = this.optionalMetadataString(mediaDownload, 'Mimetype');
    const FileSHA256 = this.optionalMetadataString(mediaDownload, 'FileSHA256');
    const FileLength = this.optionalMetadataInt(mediaDownload, 'FileLength');

    if (!Url || !MediaKey || !Mimetype || !FileSHA256 || FileLength === null) {
      return null;
    }

    if (type && !this.isSafeConversationMediaMime(type, Mimetype)) {
      return null;
    }

    const DirectPath = this.optionalMetadataString(mediaDownload, 'DirectPath');
    const FileEncSHA256 = this.optionalMetadataString(mediaDownload, 'FileEncSHA256');

    return {
      Url,
      ...(DirectPath ? { DirectPath } : {}),
      MediaKey,
      Mimetype,
      ...(FileEncSHA256 ? { FileEncSHA256 } : {}),
      FileSHA256,
      FileLength,
    } satisfies ConversationMediaDownload;
  }

  private localMediaFromRawMetadata(
    rawMetadata: Prisma.JsonValue | null,
    type?: DownloadMediaType,
  ): ConversationLocalMedia | null {
    const metadata = this.rawMetadataObject(rawMetadata);
    const localMedia = this.asRecord(metadata.localMedia);

    if (!localMedia) {
      return null;
    }

    const storageKey = this.optionalMetadataString(localMedia, 'storageKey');
    const mimeType = this.optionalMetadataString(localMedia, 'mimeType');
    const sizeBytes = this.optionalMetadataInt(localMedia, 'sizeBytes');

    if (!storageKey || !mimeType || sizeBytes === null) {
      return null;
    }

    if (!this.mediaStorage.isSafeStorageKey(storageKey)) {
      return null;
    }

    if (type && !this.isSafeConversationMediaMime(type, mimeType)) {
      return null;
    }

    return { storageKey, mimeType, sizeBytes };
  }

  private rawMetadataObject(
    rawMetadata: Prisma.JsonValue | null,
  ): Record<string, Prisma.JsonValue> {
    return rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? (rawMetadata as Record<string, Prisma.JsonValue>)
      : {};
  }

  private supportedDownloadMediaType(type: WhatsAppConversationMessageType) {
    if (type === 'IMAGE' || type === 'DOCUMENT' || type === 'AUDIO' || type === 'VIDEO') {
      return type;
    }

    return null;
  }

  private async downloadConversationMediaFromProvider(
    connection: WhatsAppConnection,
    instanceToken: string,
    input: DownloadMediaInput,
  ) {
    try {
      return await this.mapConnectionProviderError(connection, () =>
        this.provider.downloadMedia(instanceToken, input),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException({
        code: 'MEDIA_DOWNLOAD_FAILED',
        message: 'Nao foi possivel baixar a midia do WhatsApp.',
      });
    }
  }

  private hasAvailableMedia(message: WhatsAppConversationMessageForPresenter) {
    const type = this.supportedDownloadMediaType(message.type);

    return Boolean(
      type &&
      (this.mediaDownloadFromRawMetadata(message.rawMetadata, type) ||
        this.localMediaFromRawMetadata(message.rawMetadata, type)),
    );
  }

  private parseProviderMediaDataUrl(dataUrl: string) {
    const match = dataUrl.match(/^data:([^,]+);base64,([a-z0-9+/=\r\n]+)$/i);

    if (!match || !match[1] || !match[2]) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_RESPONSE',
        message: 'Provider retornou midia invalida.',
      });
    }

    const compactBase64 = match[2].replace(/\s+/g, '');
    const estimatedBytes = Math.floor((compactBase64.length * 3) / 4);

    if (estimatedBytes > WhatsAppService.conversationMediaMaxBytes + 2) {
      throw new PayloadTooLargeException({
        code: 'MEDIA_TOO_LARGE',
        message: 'Midia excede o limite interno do CRM.',
      });
    }

    const buffer = Buffer.from(compactBase64, 'base64');
    const normalizedInput = compactBase64.replace(/=+$/, '');
    const normalizedOutput = buffer.toString('base64').replace(/=+$/, '');

    if (!buffer.length || normalizedInput !== normalizedOutput) {
      throw new BadRequestException({
        code: 'INVALID_MEDIA_RESPONSE',
        message: 'Provider retornou Base64 invalido.',
      });
    }

    return { buffer, mimetype: match[1] };
  }

  private downloadFileName(message: WhatsAppMessage, mimetype: string) {
    const existing = message.mediaFileName?.trim();

    if (existing) {
      return this.sanitizeMediaFileName(existing);
    }

    return this.sanitizeMediaFileName(
      `whatsapp-media-${message.id}.${this.fileExtension(mimetype)}`,
    );
  }

  private fileExtension(mimetype: string) {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/zip': 'zip',
      'application/x-zip-compressed': 'zip',
      'application/vnd.rar': 'rar',
      'application/x-rar-compressed': 'rar',
      'image/vnd.adobe.photoshop': 'psd',
      'application/x-photoshop': 'psd',
      'application/vnd.android.package-archive': 'apk',
      'audio/ogg': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'video/mp4': 'mp4',
    };

    const safeMimeType = this.normalizeMediaMimeType(mimetype);

    return safeMimeType ? (map[safeMimeType] ?? 'bin') : 'bin';
  }

  private assertSafeConversationMediaMime(type: DownloadMediaType, mimetype: string) {
    if (this.isSafeConversationMediaMime(type, mimetype)) {
      return;
    }

    throw new BadRequestException({
      code: 'INVALID_MEDIA_RESPONSE',
      message: 'Provider retornou midia com MIME nao permitido.',
    });
  }

  private isSafeConversationMediaMime(type: DownloadMediaType, mimetype: string) {
    const normalized = this.normalizeMediaMimeType(mimetype);

    if (type === 'IMAGE') return normalized === 'image/jpeg' || normalized === 'image/png';
    if (type === 'DOCUMENT') return Boolean(normalized && allowedDocumentMimeTypes.has(normalized));
    if (type === 'AUDIO') {
      return (
        normalized === 'audio/ogg' || normalized === 'audio/mpeg' || normalized === 'audio/mp4'
      );
    }
    return normalized === 'video/mp4';
  }

  private normalizeMediaMimeType(mimetype: string) {
    const [base] = mimetype.split(';', 1);
    const normalized = base?.trim().toLowerCase() ?? '';

    return normalized || null;
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

  private isDuplicateConversationMessage(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
    return target.includes('providerMessageId') || target.includes('requestId');
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

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
