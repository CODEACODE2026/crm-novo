/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import { KiragoWebhookNormalizer } from './kirago/kirago-webhook-normalizer';
import { WhatsAppConversationAttendanceFilter } from './dto/list-whatsapp-conversations.dto';
import { WhatsAppService } from './whatsapp.service';

const now = new Date('2026-09-11T00:00:00.000Z');
const defaultKiragoReadReceiptPhone = '554499999999';
const whatsAppServiceSource = readFileSync(
  join(process.cwd(), 'src/whatsapp/whatsapp.service.ts'),
  'utf8',
);
const prismaSchemaSource = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const attendanceMigrationSource = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261016013000_add_whatsapp_attendances/migration.sql'),
  'utf8',
);

type MockWithCalls = { mock: { calls: unknown[][] } };

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'CRM Principal',
    provider: 'KIRAGO',
    providerUserId: 'kirago-user',
    providerInstanceName: 'CRM Principal',
    providerTokenEncrypted: 'encrypted-token',
    phone: null,
    status: 'DISCONNECTED',
    connected: false,
    loggedIn: false,
    webhookConfigured: true,
    lastStatusAt: null,
    connectedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Cliente Teste',
    reference: 'CLI-1',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
    status: 'ATIVO',
    ...overrides,
  };
}

function clientReference() {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    clientId: client().id,
    reference: 'CLI-1',
    planId: 'plan-id',
    recurringValue: 50,
    dueDate: now,
    billingAnchorDay: 11,
    billingNoticeDays: 5,
    status: 'PENDENTE_PAGAMENTO',
    notes: null,
    createdAt: now,
    updatedAt: now,
    plan: { id: 'plan-id', name: 'Mensal', durationMonths: 1, defaultValue: 50 },
  };
}

function dispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    clientId: client().id,
    whatsAppConnectionId: connection().id,
    phone: '5544999999999',
    body: 'Mensagem',
    origin: 'MANUAL',
    status: 'PENDING',
    requestId: 'request-id',
    providerMessageId: null,
    errorMessage: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    client: client(),
    whatsAppConnection: connection(),
    ...overrides,
  };
}

function normalizedInbound(text: string, overrides: Record<string, unknown> = {}) {
  return {
    kind: 'MESSAGE',
    provider: 'KIRAGO',
    instanceName: 'CRM Principal',
    providerUserId: 'kirago-user',
    phone: '5544999999999',
    contactName: 'Cliente Teste',
    messageId: `msg-${createHash('sha1').update(text).digest('hex').slice(0, 8)}`,
    direction: 'INCOMING',
    messageType: 'text',
    text,
    messageTimestamp: now,
    receivedAt: now,
    isGroup: false,
    mediaMetadata: null,
    mediaDownloadMetadata: null,
    replyContext: null,
    providerJids: null,
    ...overrides,
  };
}

function normalizedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'MESSAGE_RECEIPT',
    provider: 'KIRAGO',
    instanceName: 'CRM Principal',
    providerUserId: 'kirago-user',
    state: 'DELIVERED',
    rawState: 'Delivered',
    providerMessageIds: ['provider-message-id'],
    timestamp: new Date('2026-10-08T21:21:18.000Z'),
    receivedAt: now,
    ...overrides,
  };
}

function normalizedChatPresence(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'CHAT_PRESENCE',
    provider: 'KIRAGO',
    instanceName: 'CRM Principal',
    providerUserId: 'kirago-user',
    state: 'composing',
    media: 'audio',
    isFromMe: false,
    isGroup: false,
    chat: '123456789012345@lid',
    sender: '123456789012345@lid',
    senderAlt: '5544999999999@s.whatsapp.net',
    recipientAlt: '5544888888888@s.whatsapp.net',
    addressingMode: 'lid',
    receivedAt: now,
    ...overrides,
  };
}

function kiragoMediaPayload(mediaType: 'imageMessage' | 'documentMessage') {
  const media =
    mediaType === 'imageMessage'
      ? {
          URL: 'https://media.example.test/full/private/image?token=secret-token',
          DirectPath: '/v/t62.7118-24/private-direct-path',
          MediaKey: 'SECRET_MEDIA_KEY_FULL_VALUE',
          Mimetype: 'image/jpeg',
          FileEncSHA256: 'FULL_FILE_ENC_SHA256_SECRET_VALUE',
          FileSHA256: 'FULL_FILE_SHA256_SECRET_VALUE',
          FileLength: 12345,
          Caption: 'Legenda completa sensivel',
          Authorization: 'Bearer secret',
          accessToken: 'secret',
          cookies: 'session=secret',
          jpegThumbnail: 'data:image/jpeg;base64,VERY_SECRET_BASE64',
          contextInfo: {
            Authorization: 'Bearer nested-secret',
            cookies: 'nested-session=secret',
            stanzaId: 'nested-secret-id',
            token: 'nested-token',
            quotedMessage: { conversation: 'secret' },
          },
        }
      : {
          url: 'https://media.example.test/full/private/document?token=secret-token',
          directPath: '/v/t62.7119-24/private-direct-path',
          mediaKey: 'SECRET_DOCUMENT_MEDIA_KEY_FULL_VALUE',
          mimetype: 'application/pdf',
          fileEncSHA256: 'FULL_DOCUMENT_FILE_ENC_SHA256_SECRET_VALUE',
          fileSHA256: 'FULL_DOCUMENT_FILE_SHA256_SECRET_VALUE',
          fileLength: '54321',
          fileName: 'Contrato Super Secreto.pdf',
          caption: 'Texto completo do documento',
          token: 'document-token',
          Cookies: 'document-session=secret',
          pageCount: 2,
        };

  return {
    type: 'Message',
    instanceName: 'CRM Principal',
    event: {
      Info: {
        ID: 'provider-message-id',
        IsFromMe: false,
      },
      Message: { [mediaType]: media },
    },
  };
}

function pendingContact(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    whatsAppConnectionId: connection().id,
    phone: '5544999999999',
    phoneNormalized: '5544999999999',
    contactName: 'Lucas',
    status: 'PENDENTE',
    firstMessageText: 'Ola',
    lastMessageText: 'Ola',
    firstMessageType: 'TEXT',
    lastMessageType: 'TEXT',
    firstMessageId: 'msg-1',
    lastMessageId: 'msg-1',
    firstContactAt: now,
    lastContactAt: now,
    messageCount: 1,
    clientId: null,
    approvedAt: null,
    ignoredAt: null,
    ignoreReason: null,
    createdAt: now,
    updatedAt: now,
    whatsAppConnection: connection(),
    client: null,
    ...overrides,
  };
}

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: '66666666-6666-4666-8666-666666666666',
    whatsAppConnectionId: connection().id,
    instanceName: 'CRM Principal',
    provider: 'KIRAGO',
    externalInstanceId: 'kirago-user',
    clientId: null,
    contactName: 'Lucas',
    phone: '5544999999999',
    phoneNormalized: '5544999999999',
    status: 'OPEN',
    lastMessageAt: null,
    lastMessagePreview: null,
    unreadCount: 0,
    createdAt: now,
    updatedAt: now,
    whatsAppConnection: connection(),
    ...overrides,
  };
}

function conversationMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    conversationId: conversation().id,
    whatsAppConnectionId: connection().id,
    provider: 'KIRAGO',
    providerMessageId: 'msg-1',
    requestId: null,
    messageDispatchId: null,
    replyToMessageId: null,
    replyToProviderMessageId: null,
    quotedText: null,
    replyTo: null,
    direction: 'INBOUND',
    type: 'TEXT',
    text: 'Ola',
    mediaMimeType: null,
    mediaFileName: null,
    mediaSizeBytes: null,
    mediaDurationSeconds: null,
    status: 'SENT',
    sentAt: now,
    editedAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    deletedAt: null,
    deletedForEveryone: false,
    isFromMe: false,
    rawMetadata: null,
    createdAt: now,
    reactions: [],
    ...overrides,
  };
}

function manualChargeReceivable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'manual-receivable-id',
    clientId: client().id,
    clientReferenceId: null,
    purpose: 'MANUAL_CHARGE',
    renewalId: null,
    description: 'Manutencao do equipamento',
    amount: new Prisma.Decimal(80),
    dueDate: new Date('2026-10-10T00:00:00.000Z'),
    status: 'PENDENTE',
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    payerName: 'Pagador Snapshot',
    payerPhone: '(11) 98888-7777',
    payerPhoneNormalized: '5511988887777',
    financialCategoryId: 'category-id',
    manualChargeIdempotencyKey: 'manual-key',
    createdAt: now,
    updatedAt: now,
    client: client({
      name: 'Cliente Alterado Depois',
      phoneNormalized: '5544000000000',
    }),
    clientReference: null,
    ...overrides,
  };
}

function manualChargePaymentIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'manual-payment-intent-id',
    receivableId: 'manual-receivable-id',
    paymentGroupId: null,
    provider: 'FASTFLOW',
    providerTransactionId: 'manual-provider-transaction-id',
    externalStatus: 'WAITING_PAYMENT',
    externalDepixId: null,
    blockchainTxId: null,
    status: 'WAITING_PAYMENT',
    amount: new Prisma.Decimal(80),
    pixCopyPaste: 'MANUAL-PIX-COPY-PASTE-CURRENT',
    qrCodeData: 'data:image/png;base64,manual',
    expiresAt: new Date('2026-10-11T00:00:00.000Z'),
    paidAt: null,
    lastSyncAt: now,
    failureCode: null,
    failureMessage: null,
    createdAt: now,
    updatedAt: now,
    receivable: manualChargeReceivable(),
    paymentGroup: null,
    ...overrides,
  };
}

function serviceFactory({
  currentConnection = connection(),
  providerOverrides = {},
  encryptionOverrides = {},
  configOverrides = {},
  mediaStorageOverrides = {},
  voiceConversionOverrides = {},
  realtimeOverrides = {},
  autoReplyOverrides = {},
  prismaOverrides = {},
}: {
  currentConnection?: ReturnType<typeof connection> | null;
  providerOverrides?: Record<string, unknown>;
  encryptionOverrides?: Record<string, unknown>;
  configOverrides?: Record<string, string | undefined>;
  mediaStorageOverrides?: Record<string, unknown>;
  voiceConversionOverrides?: Record<string, unknown>;
  realtimeOverrides?: Record<string, unknown>;
  autoReplyOverrides?: Record<string, unknown>;
  prismaOverrides?: Record<string, unknown>;
} = {}) {
  const txClientReferenceUpdate = vi.fn();
  const txReceivableUpdate = vi.fn();
  const prisma = {
    whatsAppConnection: {
      findFirst: vi.fn().mockResolvedValue(currentConnection),
      create: vi.fn().mockResolvedValue(connection()),
      update: vi
        .fn()
        .mockResolvedValue(connection({ status: 'CONNECTED', connected: true, loggedIn: true })),
      findUnique: vi.fn().mockResolvedValue(currentConnection),
    },
    client: {
      findUnique: vi.fn().mockResolvedValue(client()),
      findMany: vi.fn().mockResolvedValue([client()]),
    },
    receivable: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'initial-receivable-id',
        clientId: client().id,
        clientReferenceId: clientReference().id,
        purpose: 'INITIAL_ACTIVATION',
        renewalId: null,
        description: 'Cobranca inicial de ativacao - Mensal',
        amount: 50,
        dueDate: now,
        status: 'PENDENTE',
        client: {
          ...client(),
          plan: { id: 'plan-id', name: 'Mensal', durationMonths: 1, defaultValue: 50 },
        },
        clientReference: clientReference(),
      }),
    },
    messageTemplate: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'template-id',
        type: 'INITIAL_ACTIVATION',
        name: 'Ativacao inicial',
        content: 'Oi {{primeiroNome}}, pague {{valor}} em {{vencimento}}. PIX: {{pix}}',
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    },
    messageDispatch: {
      create: vi.fn().mockResolvedValue(dispatch()),
      update: vi.fn(
        (args: {
          data?: {
            errorMessage?: string | null;
            providerMessageId?: string | null;
            sentAt?: Date | null;
            status?: string;
          };
        }) =>
          Promise.resolve(
            dispatch({
              status: args.data?.status ?? 'FAILED',
              errorMessage: args.data?.errorMessage ?? 'Falha segura',
              providerMessageId: args.data?.providerMessageId ?? null,
              sentAt: args.data?.sentAt ?? null,
            }),
          ),
      ),
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
    },
    paymentIntent: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'payment-intent-id',
        receivableId: 'receivable-id',
        paymentGroupId: null,
        provider: 'FASTFLOW',
        providerTransactionId: 'provider-transaction-id',
        externalStatus: 'WAITING_PAYMENT',
        externalDepixId: null,
        blockchainTxId: null,
        status: 'WAITING_PAYMENT',
        amount: new Prisma.Decimal(30),
        pixCopyPaste: 'PIX-COPY-PASTE-CURRENT',
        qrCodeData: 'data:image/png;base64,abc',
        expiresAt: new Date('2026-09-12T00:00:00.000Z'),
        paidAt: null,
        lastSyncAt: now,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        updatedAt: now,
        receivable: {
          id: 'receivable-id',
          clientId: client().id,
          clientReferenceId: clientReference().id,
          purpose: 'INITIAL_ACTIVATION',
          renewalId: null,
          description: 'Cobranca inicial de ativacao - Mensal',
          amount: new Prisma.Decimal(30),
          dueDate: now,
          status: 'PENDENTE',
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          client: client(),
          clientReference: clientReference(),
        },
      }),
      findFirst: vi.fn().mockResolvedValue({
        id: 'payment-intent-id',
        receivableId: 'receivable-id',
        paymentGroupId: null,
        provider: 'FASTFLOW',
        providerTransactionId: 'provider-transaction-id',
        status: 'WAITING_PAYMENT',
        createdAt: now,
      }),
    },
    billingResponse: {
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    financialTransaction: {
      create: vi.fn(),
    },
    receivableAuditEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'audit-event-id' }),
    },
    clientEvent: {
      create: vi.fn().mockResolvedValue({ id: 'client-event-id' }),
    },
    whatsAppInboundMessage: {
      create: vi.fn().mockResolvedValue({ id: 'inbound-id' }),
      update: vi.fn().mockResolvedValue({ id: 'inbound-id' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whatsAppPendingContact: {
      upsert: vi.fn().mockResolvedValue(pendingContact()),
      update: vi.fn().mockResolvedValue(pendingContact()),
      findUnique: vi.fn().mockResolvedValue(pendingContact()),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    whatsAppConversation: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
      create: vi.fn().mockResolvedValue(conversation()),
      update: vi.fn().mockResolvedValue(conversation()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(conversation({ labelAssignments: [] })),
    },
    whatsAppAttendance: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    whatsAppConversationLabel: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    whatsAppConversationLabelAssignment: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    whatsAppMessage: {
      findUnique: vi.fn().mockResolvedValue(conversationMessage()),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) =>
        Promise.resolve(conversationMessage(args.data ?? {})),
      ),
      update: vi.fn((args: { data?: Record<string, unknown> }) =>
        Promise.resolve(conversationMessage(args.data ?? {})),
      ),
      findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whatsAppSavedSticker: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn((args: { data?: Record<string, unknown> }) =>
        Promise.resolve({
          id: '77777777-7777-4777-8777-777777777777',
          mimeType: 'image/webp',
          storageKey:
            'saved-stickers/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
          sizeBytes: 16,
          sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          sourceMessageId: conversationMessage().id,
          createdAt: now,
          updatedAt: now,
          ...(args.data ?? {}),
        }),
      ),
      delete: vi.fn().mockResolvedValue({
        id: '77777777-7777-4777-8777-777777777777',
      }),
    },
    whatsAppMessageReaction: {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({
        id: 'reaction-id',
        messageId: conversationMessage().id,
        whatsAppConnectionId: connection().id,
        provider: 'KIRAGO',
        emoji: '❤️',
        reactorKey: 'crm:self',
        isFromMe: true,
        providerReactionId: null,
        participant: null,
        createdAt: now,
        updatedAt: now,
      }),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      const callback = input as (tx: unknown) => Promise<unknown>;
      return callback({
        client: {
          findUnique: prisma.client.findUnique,
          create: vi.fn().mockResolvedValue({
            ...client(),
            recurringValue: 50,
            dueDate: now,
            plan: { id: 'plan-id', name: 'Mensal', durationMonths: 1, defaultValue: 50 },
          }),
        },
        clientReference: {
          create: vi.fn().mockResolvedValue(clientReference()),
          update: txClientReferenceUpdate,
        },
        receivable: {
          create: vi.fn().mockResolvedValue({
            id: 'initial-receivable-id',
            clientId: client().id,
            purpose: 'INITIAL_ACTIVATION',
            renewalId: null,
            description: 'Cobranca inicial de ativacao - Mensal',
            amount: 50,
            dueDate: now,
            status: 'PENDENTE',
          }),
          update: txReceivableUpdate,
        },
        messageDispatch: {
          update: vi.fn((args: { data?: { providerMessageId?: string | null } }) =>
            Promise.resolve(
              dispatch({
                status: 'SENT',
                providerMessageId: args.data?.providerMessageId ?? 'provider-id',
                sentAt: now,
              }),
            ),
          ),
        },
        receivableAuditEvent: prisma.receivableAuditEvent,
        clientEvent: prisma.clientEvent,
        billingResponse: prisma.billingResponse,
        whatsAppInboundMessage: {
          create: prisma.whatsAppInboundMessage.create,
          update: prisma.whatsAppInboundMessage.update,
          updateMany: prisma.whatsAppInboundMessage.updateMany,
        },
        whatsAppPendingContact: {
          update: prisma.whatsAppPendingContact.update,
          upsert: prisma.whatsAppPendingContact.upsert,
        },
        whatsAppConversation: prisma.whatsAppConversation,
        whatsAppAttendance: prisma.whatsAppAttendance,
        whatsAppConversationLabel: prisma.whatsAppConversationLabel,
        whatsAppConversationLabelAssignment: prisma.whatsAppConversationLabelAssignment,
        whatsAppMessage: prisma.whatsAppMessage,
        whatsAppMessageReaction: prisma.whatsAppMessageReaction,
      });
    }),
    ...prismaOverrides,
  };
  const provider = {
    provisionConnection: vi
      .fn()
      .mockResolvedValue({ providerUserId: 'kirago-user', webhookConfigured: true }),
    findRemoteConnection: vi.fn().mockResolvedValue({ exists: true }),
    connect: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ connected: true, loggedIn: true, phone: null }),
    getQrCode: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
    getWebhook: vi.fn().mockResolvedValue({
      data: { WebhookURL: 'https://crm.example.com/whatsapp/webhook/kirago' },
    }),
    configureWebhook: vi.fn().mockResolvedValue(undefined),
    sendText: vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }),
    sendImage: vi.fn().mockResolvedValue({ providerMessageId: 'provider-image-id' }),
    sendDocument: vi.fn().mockResolvedValue({ providerMessageId: 'provider-document-id' }),
    sendAudio: vi.fn().mockResolvedValue({ providerMessageId: 'provider-audio-id' }),
    sendVideo: vi.fn().mockResolvedValue({ providerMessageId: 'provider-video-id' }),
    sendSticker: vi.fn().mockResolvedValue({ providerMessageId: 'provider-sticker-id' }),
    sendButtons: vi.fn().mockResolvedValue({ providerMessageId: 'provider-button-id' }),
    sendReaction: vi.fn().mockResolvedValue(undefined),
    editMessage: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    setChatPresence: vi.fn().mockResolvedValue(undefined),
    resolveUserLid: vi.fn().mockResolvedValue({}),
    getUserAvatar: vi.fn().mockResolvedValue({
      url: 'https://pps.whatsapp.net/avatar.jpg',
      id: 'avatar-id',
      type: 'preview',
    }),
    markMessagesAsRead: vi.fn().mockResolvedValue(undefined),
    downloadMedia: vi.fn().mockResolvedValue({
      dataUrl: `data:image/jpeg;base64,${Buffer.from('image-bytes').toString('base64')}`,
      mimetype: 'image/jpeg',
    }),
    health: vi.fn().mockResolvedValue({ online: true }),
    ...providerOverrides,
  };
  const encryption = {
    encrypt: vi.fn().mockReturnValue('encrypted-token'),
    decrypt: vi.fn().mockReturnValue('instance-token'),
    ...encryptionOverrides,
  };
  const plans = {
    ensureActivePlan: vi.fn().mockResolvedValue({ id: 'plan-id' }),
  };
  const finance = {
    createReceivablePix: vi.fn(),
  };
  const config = {
    get: (name: string) => {
      if (configOverrides && Object.prototype.hasOwnProperty.call(configOverrides, name)) {
        return configOverrides[name];
      }

      return name === 'CRM_API_PUBLIC_URL' ? 'https://crm.example.com' : undefined;
    },
  };
  const normalizer = { normalize: vi.fn() };
  const mediaStorage = {
    storeOutboundMedia: vi.fn().mockResolvedValue({
      storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
      mimeType: 'image/jpeg',
      sizeBytes: 10,
    }),
    storeSavedSticker: vi.fn().mockResolvedValue({
      storageKey:
        'saved-stickers/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
      mimeType: 'image/webp',
      sizeBytes: 16,
    }),
    read: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    isSafeStorageKey: vi.fn().mockReturnValue(true),
    ...mediaStorageOverrides,
  };
  const voiceConversion = {
    convertWebmToOgg: vi.fn().mockResolvedValue({
      buffer: Buffer.from('ogg-opus-bytes'),
      mimeType: 'audio/ogg; codecs=opus',
      sizeBytes: 14,
      durationSeconds: 2.2,
    }),
    ...voiceConversionOverrides,
  };
  const realtime = {
    emitConversationUpdated: vi.fn(),
    emitConversationPresence: vi.fn(),
    emitMessageCreated: vi.fn(),
    emitMessageUpdated: vi.fn(),
    ...realtimeOverrides,
  };
  const autoReply = {
    tryReplyToInbound: vi.fn().mockResolvedValue({ sent: false, reason: 'disabled' }),
    ...autoReplyOverrides,
  };

  return {
    service: new WhatsAppService(
      prisma as never,
      provider as never,
      plans as never,
      finance as never,
      encryption as never,
      config as never,
      normalizer as never,
      mediaStorage as never,
      voiceConversion as never,
      realtime as never,
      undefined,
      autoReply as never,
    ),
    prisma,
    provider,
    finance,
    encryption,
    normalizer,
    mediaStorage,
    voiceConversion,
    realtime,
    autoReply,
    txClientReferenceUpdate,
    txReceivableUpdate,
  };
}

describe('WhatsAppService', () => {
  const webpBytes = Buffer.from('RIFF0000WEBPvp8-data');

  it('returns a normalized conversation avatar using the conversation phone and instance token', async () => {
    const current = conversation();
    const { service, provider, encryption, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(current),
        },
      },
    });

    const result = await service.getConversationAvatar(current.id);

    expect(result).toEqual({
      available: true,
      url: 'https://pps.whatsapp.net/avatar.jpg',
    });
    expect(encryption.decrypt).toHaveBeenCalledWith('encrypted-token');
    expect(provider.getUserAvatar).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      preview: true,
    });
    expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({
      where: { id: current.id },
      include: { whatsAppConnection: true },
    });
  });

  it('saves only WEBP sticker messages using byte SHA-256 and persistent storage', async () => {
    const stickerMessage = conversationMessage({
      type: 'STICKER',
      mediaMimeType: 'image/webp',
      rawMetadata: {
        localMedia: {
          storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'image/webp',
          sizeBytes: webpBytes.length,
        },
      },
    });
    const sha256 = createHash('sha256').update(webpBytes).digest('hex');
    const { service, prisma, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(webpBytes),
        storeSavedSticker: vi.fn().mockResolvedValue({
          storageKey: `saved-stickers/${sha256.slice(0, 2)}/${sha256}.webp`,
          mimeType: 'image/webp',
          sizeBytes: webpBytes.length,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(stickerMessage),
        },
      },
    });

    const result = await service.saveConversationStickerMessage(stickerMessage.id);

    expect(result.alreadyExisted).toBe(false);
    expect(result.sticker).toMatchObject({
      id: '77777777-7777-4777-8777-777777777777',
      mimeType: 'image/webp',
      previewUrl: '/whatsapp/saved-stickers/77777777-7777-4777-8777-777777777777/media',
    });
    expect(mediaStorage.storeSavedSticker).toHaveBeenCalledWith({
      buffer: webpBytes,
      mimeType: 'image/webp',
      sha256,
    });
    expect(prisma.whatsAppSavedSticker.create).toHaveBeenCalledWith({
      data: {
        mimeType: 'image/webp',
        storageKey: `saved-stickers/${sha256.slice(0, 2)}/${sha256}.webp`,
        sizeBytes: webpBytes.length,
        sha256,
        sourceMessageId: stickerMessage.id,
      },
    });
  });

  it('returns existing saved sticker on concurrent unique races without deleting shared media', async () => {
    const stickerMessage = conversationMessage({
      type: 'STICKER',
      mediaMimeType: 'image/webp',
      rawMetadata: {
        localMedia: {
          storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'image/webp',
          sizeBytes: webpBytes.length,
        },
      },
    });
    const sha256 = createHash('sha256').update(webpBytes).digest('hex');
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['sha256'] },
    });
    const { service, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(webpBytes),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(stickerMessage),
        },
        whatsAppSavedSticker: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
              id: 'existing-sticker-id',
              mimeType: 'image/webp',
              storageKey: `saved-stickers/${sha256.slice(0, 2)}/${sha256}.webp`,
              sizeBytes: webpBytes.length,
              sha256,
              sourceMessageId: stickerMessage.id,
              createdAt: now,
              updatedAt: now,
            }),
          create: vi.fn().mockRejectedValue(duplicateError),
        },
      },
    });

    const result = await service.saveConversationStickerMessage(stickerMessage.id);

    expect(result).toMatchObject({
      alreadyExisted: true,
      sticker: { id: 'existing-sticker-id' },
    });
    expect(mediaStorage.delete).not.toHaveBeenCalled();
  });

  it('rejects non-sticker messages and spoofed WEBP content when saving stickers', async () => {
    const { service: imageService } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(conversationMessage({ type: 'IMAGE' })),
        },
      },
    });

    await expect(
      imageService.saveConversationStickerMessage(conversationMessage().id),
    ).rejects.toThrow('Somente mensagens de figurinha podem ser salvas.');

    const { service: spoofedService } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(Buffer.from('not-webp')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              type: 'STICKER',
              mediaMimeType: 'image/webp',
              rawMetadata: {
                localMedia: {
                  storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'image/webp',
                  sizeBytes: 8,
                },
              },
            }),
          ),
        },
      },
    });

    await expect(
      spoofedService.saveConversationStickerMessage(conversationMessage().id),
    ).rejects.toThrow('Figurinha WEBP invalida.');
  });

  it('returns controlled errors for saved sticker rows with missing or invalid files', async () => {
    const { service: missingFileService } = serviceFactory({
      prismaOverrides: {
        whatsAppSavedSticker: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'saved-sticker-id',
            mimeType: 'image/webp',
            storageKey:
              'saved-stickers/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
            sizeBytes: webpBytes.length,
            sha256: 'a'.repeat(64),
            sourceMessageId: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      },
    });

    await expect(missingFileService.downloadSavedStickerMedia('saved-sticker-id')).rejects.toThrow(
      'Arquivo da figurinha salva nao encontrado.',
    );

    const { service: invalidFileService } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(Buffer.from('not-webp')),
      },
      prismaOverrides: {
        whatsAppSavedSticker: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'saved-sticker-id',
            mimeType: 'image/webp',
            storageKey:
              'saved-stickers/aa/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp',
            sizeBytes: 8,
            sha256: 'a'.repeat(64),
            sourceMessageId: null,
            createdAt: now,
            updatedAt: now,
          }),
        },
      },
    });

    await expect(invalidFileService.downloadSavedStickerMedia('saved-sticker-id')).rejects.toThrow(
      'Arquivo da figurinha salva e invalido.',
    );
  });

  it('sends WEBP stickers through Kirago sticker endpoint and persists them as STICKER media', async () => {
    const providerSentAt = new Date('2026-10-14T00:31:00.000Z');
    const { service, prisma, provider } = serviceFactory({
      providerOverrides: {
        sendSticker: vi
          .fn()
          .mockResolvedValue({ providerMessageId: 'provider-sticker-id', sentAt: providerSentAt }),
      },
      prismaOverrides: {
        whatsAppConnection: {
          update: vi.fn().mockResolvedValue(connection()),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('webp-bytes'),
        mimetype: 'image/webp',
        originalname: 'figurinha.webp',
        size: 10,
      },
      requestId: 'sticker-request-id',
      mediaKind: 'STICKER',
    });

    expect(provider.sendSticker).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      sticker: `data:image/webp;base64,${Buffer.from('webp-bytes').toString('base64')}`,
      requestId: 'sticker-request-id',
    });
    expect(provider.sendSticker).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ reply: expect.anything() }),
    );
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'STICKER',
          text: null,
          mediaMimeType: 'image/webp',
          mediaFileName: 'figurinha.webp',
        }),
      }),
    );
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMessageId: 'provider-sticker-id',
          sentAt: providerSentAt,
          status: 'SENT',
        }),
      }),
    );
  });

  it('returns unavailable for missing conversations and missing avatar URLs without a fatal provider error', async () => {
    const missing = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });

    await expect(missing.service.getConversationAvatar(conversation().id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const withoutAvatar = serviceFactory({
      providerOverrides: { getUserAvatar: vi.fn().mockResolvedValue({ url: null }) },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    await expect(withoutAvatar.service.getConversationAvatar(conversation().id)).resolves.toEqual({
      available: false,
      url: null,
    });
  });

  it('negative-caches provider failures and dedupes concurrent avatar requests', async () => {
    const providerGetUserAvatar = vi.fn(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ url: 'https://pps.whatsapp.net/avatar.jpg' }), 1),
        ),
    );
    const { service, provider } = serviceFactory({
      providerOverrides: { getUserAvatar: providerGetUserAvatar },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const [first, second] = await Promise.all([
      service.getConversationAvatar(conversation().id),
      service.getConversationAvatar(conversation().id),
    ]);

    expect(first).toEqual(second);
    expect(provider.getUserAvatar).toHaveBeenCalledTimes(1);

    await service.getConversationAvatar(conversation().id);
    expect(provider.getUserAvatar).toHaveBeenCalledTimes(1);

    const failing = serviceFactory({
      providerOverrides: { getUserAvatar: vi.fn().mockRejectedValue(new Error('timeout')) },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ id: 'avatar-failure' })),
        },
      },
    });

    await expect(failing.service.getConversationAvatar('avatar-failure')).resolves.toEqual({
      available: false,
      url: null,
    });
    await failing.service.getConversationAvatar('avatar-failure');
    expect(failing.provider.getUserAvatar).toHaveBeenCalledTimes(1);
  });

  it('does not collide avatar cache entries for the same phone in different connections', async () => {
    const providerGetUserAvatar = vi
      .fn()
      .mockResolvedValueOnce({ url: 'https://pps.whatsapp.net/one.jpg' })
      .mockResolvedValueOnce({ url: 'https://pps.whatsapp.net/two.jpg' });
    const firstConnection = connection({ id: 'connection-one' });
    const secondConnection = connection({ id: 'connection-two' });
    const { service } = serviceFactory({
      providerOverrides: { getUserAvatar: providerGetUserAvatar },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(
              conversation({
                whatsAppConnectionId: firstConnection.id,
                whatsAppConnection: firstConnection,
              }),
            )
            .mockResolvedValueOnce(
              conversation({
                whatsAppConnectionId: secondConnection.id,
                whatsAppConnection: secondConnection,
              }),
            ),
        },
      },
    });

    await expect(service.getConversationAvatar('first')).resolves.toEqual({
      available: true,
      url: 'https://pps.whatsapp.net/one.jpg',
    });
    await expect(service.getConversationAvatar('second')).resolves.toEqual({
      available: true,
      url: 'https://pps.whatsapp.net/two.jpg',
    });
    expect(providerGetUserAvatar).toHaveBeenCalledTimes(2);
  });

  it('provisions a connection without exposing the generated token', async () => {
    const { service, provider, encryption, prisma } = serviceFactory({ currentConnection: null });

    const result = await service.provisionConnection({ name: 'CRM Principal' });
    const providerPayload = (provider.provisionConnection as MockWithCalls).mock.calls[0]?.[0] as {
      instanceToken?: string;
      name?: string;
    };
    const createPayload = (prisma.whatsAppConnection.create as MockWithCalls).mock.calls[0]?.[0] as
      | {
          data?: {
            name?: string;
            providerInstanceName?: string;
          };
        }
      | undefined;
    const encryptedToken = (encryption.encrypt as MockWithCalls).mock.calls[0]?.[0] as string;

    expect(provider.provisionConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: 'https://crm.example.com/whatsapp/webhook/kirago',
        events: ['Message', 'ReadReceipt', 'ChatPresence'],
      }),
    );
    expect(providerPayload.name).toMatch(/^crm-novo-crm-principal-[a-f0-9]{6}$/);
    expect(createPayload?.data?.name).toBe('CRM Principal');
    expect(createPayload?.data?.providerInstanceName).toMatch(
      /^crm-novo-crm-principal-[a-f0-9]{6}$/,
    );
    expect(encryption.encrypt).toHaveBeenCalled();
    expect(createHash('sha256').update(encryptedToken).digest('hex')).toBe(
      createHash('sha256')
        .update(providerPayload.instanceToken ?? '')
        .digest('hex'),
    );
    expect(JSON.stringify(result)).not.toContain('instance-token');
    expect(JSON.stringify(result)).not.toContain('encrypted-token');
  });

  it('configures the Kirago webhook with the public CRM endpoint', async () => {
    const { service, provider } = serviceFactory();

    await service.configureWebhook();

    expect(provider.configureWebhook).toHaveBeenCalledWith(
      'instance-token',
      'https://crm.example.com/whatsapp/webhook/kirago',
      ['Message', 'ReadReceipt', 'ChatPresence'],
    );
  });

  it('adds the Kirago webhook token to the configured public URL', async () => {
    const { service, provider } = serviceFactory({
      configOverrides: { KIRAGO_WEBHOOK_TOKEN: 'strong-webhook-token' },
    });

    await service.configureWebhook();

    expect(provider.configureWebhook).toHaveBeenCalledWith(
      'instance-token',
      'https://crm.example.com/whatsapp/webhook/kirago?kirago_webhook_token=strong-webhook-token',
      ['Message', 'ReadReceipt', 'ChatPresence'],
    );
  });

  it('redacts the Kirago webhook token before returning webhook status', async () => {
    const { service } = serviceFactory({
      providerOverrides: {
        getWebhook: vi.fn().mockResolvedValue({
          data: {
            WebhookURL:
              'https://crm.example.com/whatsapp/webhook/kirago?kirago_webhook_token=strong-webhook-token',
          },
        }),
      },
    });

    await expect(service.getWebhook()).resolves.toEqual({
      data: {
        WebhookURL:
          'https://crm.example.com/whatsapp/webhook/kirago?kirago_webhook_token=%5Bredacted%5D',
      },
    });
  });

  it.each(['http://crm.example.com', 'https://localhost:3001', 'https://192.168.0.10'])(
    'rejects non-public webhook URL %s',
    async (publicUrl) => {
      const decrypt = vi.fn().mockReturnValue('instance-token');
      const { service, provider } = serviceFactory({
        encryptionOverrides: { decrypt },
        prismaOverrides: {
          whatsAppConnection: {
            findFirst: vi.fn().mockResolvedValue(connection()),
          },
        },
      });

      await expect(service.configureWebhook({ webhookUrl: publicUrl })).rejects.toThrow(
        BadRequestException,
      );
      expect(provider.configureWebhook).not.toHaveBeenCalled();
      expect(decrypt).not.toHaveBeenCalled();
    },
  );

  it('connects using the decrypted instance token', async () => {
    const { service, provider, encryption } = serviceFactory();

    await service.connect();

    expect(encryption.decrypt).toHaveBeenCalledWith('encrypted-token');
    expect(provider.connect).toHaveBeenCalledWith('instance-token');
  });

  it('surfaces corrupted encrypted token without calling Kirago', async () => {
    const { service, provider, prisma } = serviceFactory({
      encryptionOverrides: {
        decrypt: vi.fn(() => {
          throw new BadRequestException('Token da conexao WhatsApp corrompido ou invalido.');
        }),
      },
      providerOverrides: { connect: vi.fn() },
    });

    await expect(service.connect()).rejects.toThrow(
      'Token da conexao WhatsApp corrompido ou invalido.',
    );

    expect(provider.connect).not.toHaveBeenCalled();
    expect(prisma.whatsAppConnection.update).not.toHaveBeenCalled();
  });

  it('does not leave connection stuck as CONNECTING after instance auth failure', async () => {
    const { service, provider, prisma } = serviceFactory({
      providerOverrides: {
        connect: vi
          .fn()
          .mockRejectedValue(
            new KiragoProviderError('KIRAGO_INSTANCE_AUTH_FAILED', 'Falha sanitizada.', 401),
          ),
      },
    });

    await expect(service.connect()).rejects.toThrow(ServiceUnavailableException);

    expect(provider.connect).toHaveBeenCalledWith('instance-token');
    expect(prisma.whatsAppConnection.update).toHaveBeenNthCalledWith(1, {
      where: { id: connection().id },
      data: { status: 'CONNECTING' },
    });
    const recoveryUpdate = (prisma.whatsAppConnection.update as MockWithCalls).mock
      .calls[1]?.[0] as { data?: Record<string, unknown>; where?: { id?: string } } | undefined;

    expect(recoveryUpdate?.where).toEqual({ id: connection().id });
    expect(recoveryUpdate?.data).toMatchObject({
      status: 'DISCONNECTED',
      connected: false,
      loggedIn: false,
    });
  });

  it('marks the local connection as ERROR when Kirago confirms the remote instance is missing', async () => {
    const { service, provider, prisma } = serviceFactory({
      providerOverrides: {
        connect: vi
          .fn()
          .mockRejectedValue(
            new KiragoProviderError('KIRAGO_INSTANCE_AUTH_FAILED', 'Falha sanitizada.', 401),
          ),
        findRemoteConnection: vi.fn().mockResolvedValue({ exists: false }),
      },
    });

    await expect(service.connect()).rejects.toThrow(ConflictException);

    expect(provider.findRemoteConnection).toHaveBeenCalledWith({
      providerUserId: 'kirago-user',
      instanceName: 'CRM Principal',
    });
    const remoteMissingUpdate = (prisma.whatsAppConnection.update as MockWithCalls).mock
      .calls[1]?.[0] as { data?: Record<string, unknown>; where?: { id?: string } } | undefined;

    expect(remoteMissingUpdate?.where).toEqual({ id: connection().id });
    expect(remoteMissingUpdate?.data).toMatchObject({
      status: 'ERROR',
      connected: false,
      loggedIn: false,
      connectedAt: null,
    });
  });

  it('allows provisioning a clean new connection after the previous remote instance was removed', async () => {
    const errorConnection = connection({ status: 'ERROR' });
    const { service, provider, prisma, encryption } = serviceFactory({
      currentConnection: errorConnection,
    });

    await service.provisionConnection({ name: 'CRM Principal' });

    expect(provider.provisionConnection).toHaveBeenCalled();
    expect(encryption.encrypt).toHaveBeenCalled();
    expect(prisma.whatsAppConnection.create).toHaveBeenCalled();
  });

  it('maps provider status to CONNECTED', async () => {
    const { service } = serviceFactory();

    const result = await service.refreshStatus();

    expect(result.status).toBe('CONNECTED');
    expect(result.connected).toBe(true);
    expect(result.loggedIn).toBe(true);
  });

  it('lists only usable WhatsApp connections for starting conversations', async () => {
    const usable = connection({ status: 'CONNECTED', connected: true, loggedIn: true });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConnection: {
          findFirst: vi.fn().mockResolvedValue(usable),
          findMany: vi.fn().mockResolvedValue([usable]),
          findUnique: vi.fn().mockResolvedValue(usable),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    await expect(service.listUsableConnections()).resolves.toEqual([
      expect.objectContaining({ id: usable.id, name: usable.name, status: 'CONNECTED' }),
    ]);
    expect(
      (prisma.whatsAppConnection as unknown as { findMany: unknown }).findMany,
    ).toHaveBeenCalledWith({
      where: { status: 'CONNECTED', connected: true, loggedIn: true },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
  });

  it('persists CONNECTED status and phone when refreshing a divergent local connection', async () => {
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'DISCONNECTED', connected: false, loggedIn: false }),
      providerOverrides: {
        getStatus: vi.fn().mockResolvedValue({
          connected: true,
          loggedIn: true,
          phone: '5544999999999',
        }),
      },
    });

    await service.refreshStatus();

    const updateCall = (prisma.whatsAppConnection.update as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
      where?: { id?: string };
    };

    expect(updateCall.where).toEqual({ id: connection().id });
    expect(updateCall.data).toMatchObject({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
      phone: '5544999999999',
    });
    expect(updateCall.data?.connectedAt).toBeInstanceOf(Date);
    expect(updateCall.data?.lastStatusAt).toBeInstanceOf(Date);
  });

  it('blocks manual send when the connection is disconnected', async () => {
    const { service } = serviceFactory({
      currentConnection: connection({ status: 'DISCONNECTED' }),
    });

    await expect(
      service.sendManualMessage(
        { clientId: client().id, body: 'Oi', requestId: 'request-id' },
        'user-id',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('records SENT dispatch and client timeline after manual send', async () => {
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });

    const result = await service.sendManualMessage(
      { clientId: client().id, body: 'Mensagem', requestId: 'request-id' },
      'user-id',
    );

    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      body: 'Mensagem',
      requestId: 'request-id',
    });
    expect(result.status).toBe('SENT');
    expect(result.providerMessageId).toBe('provider-id');
  });

  it('records FAILED dispatch with sanitized error after provider failure', async () => {
    const { service } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      providerOverrides: { sendText: vi.fn().mockRejectedValue(new Error('Falha segura')) },
    });

    const result = await service.sendManualMessage(
      { clientId: client().id, body: 'Mensagem', requestId: 'request-id' },
      'user-id',
    );

    expect(result.status).toBe('FAILED');
    expect(result.errorMessage).toBe('Falha segura');
  });

  it('does not send twice when requestId already exists', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        messageDispatch: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(dispatch({ status: 'PENDING' })),
        },
      },
    });

    const result = await service.sendManualMessage(
      { clientId: client().id, body: 'Mensagem', requestId: 'request-id' },
      'user-id',
    );

    expect(result.status).toBe('PENDING');
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('sends outbound JPEG conversation media as Kirago image with caption', async () => {
    const { service, provider, prisma, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 10,
      },
      caption: 'Legenda',
      requestId: 'media-request-id',
    });

    expect(provider.sendImage).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      imageDataUrl: `data:image/jpeg;base64,${Buffer.from('jpeg-bytes').toString('base64')}`,
      caption: 'Legenda',
      requestId: 'media-request-id',
    });
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'IMAGE',
      text: 'Legenda',
      status: 'PENDING',
      requestId: 'media-request-id',
      providerMessageId: null,
      rawMetadata: {
        source: 'manual_outbound_media_send',
        storage: 'transient_request_only',
        retryPolicy: 'select_file_again_after_reload',
      },
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'foto.jpg',
      mediaSizeBytes: 10,
    });
    expect(JSON.stringify(createCall.data?.rawMetadata)).not.toContain('mediaDownload');
    expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith({
      whatsAppConnectionId: connection().id,
      messageId: conversationMessage().id,
      buffer: Buffer.from('jpeg-bytes'),
      mimeType: 'image/jpeg',
      sizeBytes: 10,
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: expect.any(String) }),
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'provider-image-id',
          sentAt: expect.any(Date),
          failedAt: null,
          rawMetadata: expect.objectContaining({
            localMedia: {
              storageKey: `${connection().id}/${conversationMessage().id}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
              mimeType: 'image/jpeg',
              sizeBytes: 10,
            },
          }),
        }),
      }),
    );
    expect(
      JSON.stringify((prisma.whatsAppMessage.update as MockWithCalls).mock.calls[0]?.[0]),
    ).not.toContain(Buffer.from('jpeg-bytes').toString('base64'));
  });

  it('sends PNG conversation media as IMAGE without inventing media download metadata', async () => {
    const { service, provider, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('png-bytes'),
        mimetype: 'image/png',
        originalname: 'print.png',
        size: 9,
      },
      requestId: 'png-request-id',
    });

    expect(provider.sendImage).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      imageDataUrl: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`,
      caption: null,
      requestId: 'png-request-id',
    });
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'IMAGE',
      text: null,
      requestId: 'png-request-id',
      rawMetadata: {
        source: 'manual_outbound_media_send',
        storage: 'transient_request_only',
      },
      mediaMimeType: 'image/png',
      mediaFileName: 'print.png',
      mediaSizeBytes: 9,
    });
    expect(JSON.stringify(createCall.data?.rawMetadata)).not.toContain('mediaDownload');
  });

  it('sends PDF conversation media as Kirago document with sanitized file name', async () => {
    const { service, provider, prisma, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
          mimeType: 'application/pdf',
          sizeBytes: 9,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('pdf-bytes'),
        mimetype: 'application/pdf',
        originalname: '../contrato final.pdf',
        size: 9,
      },
      requestId: 'document-request-id',
    });

    expect(provider.sendDocument).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      documentDataUrl: `data:application/octet-stream;base64,${Buffer.from('pdf-bytes').toString(
        'base64',
      )}`,
      fileName: 'contrato final.pdf',
      requestId: 'document-request-id',
    });
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'DOCUMENT',
      text: null,
      requestId: 'document-request-id',
      providerMessageId: null,
      rawMetadata: {
        source: 'manual_outbound_media_send',
        storage: 'transient_request_only',
        retryPolicy: 'select_file_again_after_reload',
      },
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato final.pdf',
      mediaSizeBytes: 9,
    });
    expect(JSON.stringify(createCall.data?.rawMetadata)).not.toContain('mediaDownload');
    expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith({
      whatsAppConnectionId: connection().id,
      messageId: conversationMessage().id,
      buffer: Buffer.from('pdf-bytes'),
      mimeType: 'application/pdf',
      sizeBytes: 9,
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'provider-document-id',
          failedAt: null,
          rawMetadata: expect.objectContaining({
            localMedia: {
              storageKey: `${connection().id}/${conversationMessage().id}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
              mimeType: 'application/pdf',
              sizeBytes: 9,
            },
          }),
        }),
      }),
    );
  });

  it.each([
    ['ZIP application/zip', 'arquivos.zip', 'application/zip'],
    ['ZIP x-zip-compressed', 'arquivos.zip', 'application/x-zip-compressed'],
    ['ZIP octet-stream', 'arquivos.zip', 'application/octet-stream'],
    ['RAR application/vnd.rar', 'pacote.rar', 'application/vnd.rar'],
    ['RAR x-rar-compressed', 'pacote.rar', 'application/x-rar-compressed'],
    ['RAR octet-stream', 'pacote.rar', 'application/octet-stream'],
    ['PSD image/vnd.adobe.photoshop', 'layout.psd', 'image/vnd.adobe.photoshop'],
    ['PSD x-photoshop', 'layout.psd', 'application/x-photoshop'],
    ['PSD octet-stream', 'layout.psd', 'application/octet-stream'],
    ['APK android package', 'app.apk', 'application/vnd.android.package-archive'],
    ['APK octet-stream', 'app.apk', 'application/octet-stream'],
    ['uppercase ZIP extension', 'ARQUIVOS.ZIP', 'application/octet-stream'],
    ['mixed-case RAR extension', 'pacote.Rar', 'application/octet-stream'],
    ['uppercase PSD extension', 'LAYOUT.PSD', 'application/octet-stream'],
    ['uppercase APK extension', 'APP.APK', 'application/octet-stream'],
  ])('sends %s conversation media as DOCUMENT', async (_label, fileName, mimetype) => {
    const { service, provider, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    const requestId = `${fileName.replace(/[^a-z]/gi, '-')}-request-id`;

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('document-bytes'),
        mimetype,
        originalname: fileName,
        size: 14,
      },
      requestId,
    });

    expect(provider.sendDocument).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({
        documentDataUrl: expect.stringMatching(/^data:application\/octet-stream;base64,/),
        fileName,
        requestId,
      }),
    );
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'DOCUMENT',
      mediaFileName: fileName,
      mediaMimeType: mimetype,
      mediaSizeBytes: 14,
    });
  });

  it('sanitizes document file names without changing safe extensions silently', async () => {
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('zip'),
        mimetype: 'application/zip',
        originalname: '../../arquivo estranho @#.zip',
        size: 3,
      },
      requestId: 'traversal-document-request-id',
    });

    expect(provider.sendDocument).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({
        fileName: 'arquivo estranho __.zip',
      }),
    );
  });

  it.each([
    ['audio/ogg', 'audio.ogg'],
    ['audio/mpeg', 'audio.mp3'],
    ['audio/mp4', 'audio.m4a'],
  ] as const)(
    'sends %s conversation media as AUDIO with PTT disabled',
    async (mimetype, fileName) => {
      const { service, provider, prisma, mediaStorage } = serviceFactory({
        mediaStorageOverrides: {
          storeOutboundMedia: vi.fn().mockResolvedValue({
            storageKey: `${connection().id}/${conversationMessage().id}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
            mimeType: mimetype,
            sizeBytes: 12,
          }),
        },
        prismaOverrides: {
          whatsAppConversation: {
            findUnique: vi.fn().mockResolvedValue(
              conversation({
                whatsAppConnection: connection({
                  status: 'CONNECTED',
                  connected: true,
                  loggedIn: true,
                }),
              }),
            ),
            update: vi.fn().mockResolvedValue(conversation()),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
            create: vi.fn().mockResolvedValue(conversation()),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        },
      });
      const audioBuffer = Buffer.from(`${mimetype}-bytes`);

      await service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: audioBuffer,
          mimetype,
          originalname: fileName,
          size: 12,
        },
        requestId: `audio-${mimetype}-request-id`,
      });

      expect(provider.sendAudio).toHaveBeenCalledWith('instance-token', {
        phone: '5544999999999',
        audioDataUrl: `data:${mimetype};base64,${audioBuffer.toString('base64')}`,
        mimeType: mimetype,
        seconds: null,
        ptt: false,
        requestId: `audio-${mimetype}-request-id`,
      });
      const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
        data?: Record<string, unknown>;
      };
      expect(createCall.data).toMatchObject({
        type: 'AUDIO',
        text: null,
        requestId: `audio-${mimetype}-request-id`,
        rawMetadata: {
          source: 'manual_outbound_media_send',
          storage: 'transient_request_only',
          retryPolicy: 'select_file_again_after_reload',
        },
        mediaMimeType: mimetype,
        mediaFileName: fileName,
        mediaSizeBytes: 12,
        mediaDurationSeconds: null,
      });
      expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith({
        whatsAppConnectionId: connection().id,
        messageId: conversationMessage().id,
        buffer: audioBuffer,
        mimeType: mimetype,
        sizeBytes: 12,
      });
    },
  );

  it('sends MP4 conversation media as VIDEO with caption and provider id persistence', async () => {
    const { service, provider, prisma, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
          mimeType: 'video/mp4',
          sizeBytes: 13,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    const videoBuffer = Buffer.from('mp4-bytes');

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: videoBuffer,
        mimetype: 'video/mp4',
        originalname: 'VIDEO.MP4',
        size: 13,
      },
      caption: 'Veja isso',
      requestId: 'video-request-id',
    });

    expect(provider.sendVideo).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      videoDataUrl: `data:video/mp4;base64,${videoBuffer.toString('base64')}`,
      caption: 'Veja isso',
      mimeType: 'video/mp4',
      requestId: 'video-request-id',
    });
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'VIDEO',
      text: 'Veja isso',
      requestId: 'video-request-id',
      mediaMimeType: 'video/mp4',
      mediaFileName: 'VIDEO.MP4',
      mediaSizeBytes: 13,
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SENT',
          providerMessageId: 'provider-video-id',
          failedAt: null,
        }),
      }),
    );
    expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith({
      whatsAppConnectionId: connection().id,
      messageId: conversationMessage().id,
      buffer: videoBuffer,
      mimeType: 'video/mp4',
      sizeBytes: 13,
    });
  });

  it.each([
    ['25 MB', 25 * 1024 * 1024],
    ['30 MB', 30 * 1024 * 1024],
    ['40 MB', 40 * 1024 * 1024],
    ['49.9 MB', 49 * 1024 * 1024 + 900 * 1024],
    ['50 MB', 50 * 1024 * 1024],
  ] as const)(
    'accepts %s MP4 conversation media under the 50 MB video limit',
    async (_label, size) => {
      const { service, provider } = serviceFactory({
        mediaStorageOverrides: {
          storeOutboundMedia: vi.fn().mockResolvedValue({
            storageKey: `${connection().id}/${conversationMessage().id}/dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
            mimeType: 'video/mp4',
            sizeBytes: size,
          }),
        },
        prismaOverrides: {
          whatsAppConversation: {
            findUnique: vi.fn().mockResolvedValue(
              conversation({
                whatsAppConnection: connection({
                  status: 'CONNECTED',
                  connected: true,
                  loggedIn: true,
                }),
              }),
            ),
            update: vi.fn().mockResolvedValue(conversation()),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
            create: vi.fn().mockResolvedValue(conversation()),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        },
      });

      await service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('mp4-bytes'),
          mimetype: 'video/mp4',
          originalname: 'video.mp4',
          size,
        },
        requestId: `video-size-${size}`,
      });

      expect(provider.sendVideo).toHaveBeenCalledWith(
        'instance-token',
        expect.objectContaining({
          mimeType: 'video/mp4',
          videoDataUrl: expect.stringMatching(/^data:video\/mp4;base64,/),
        }),
      );
    },
  );

  it('accepts default conversation media at exactly the 10 MB limit', async () => {
    const { service, provider, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
          mimeType: 'application/pdf',
          sizeBytes: WhatsAppService.conversationMediaMaxBytes,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('pdf-bytes'),
        mimetype: 'application/pdf',
        originalname: 'limite.pdf',
        size: WhatsAppService.conversationMediaMaxBytes,
      },
      requestId: 'pdf-exact-limit-request-id',
    });

    expect(provider.sendDocument).toHaveBeenCalled();
    expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/pdf',
        sizeBytes: WhatsAppService.conversationMediaMaxBytes,
      }),
    );
  });

  it('converts browser WebM voice recording to OGG and sends it as PTT audio', async () => {
    const webmBuffer = Buffer.from('webm-opus-bytes');
    const oggBuffer = Buffer.from('ogg-opus-bytes');
    const { service, provider, prisma, mediaStorage, voiceConversion } = serviceFactory({
      voiceConversionOverrides: {
        convertWebmToOgg: vi.fn().mockResolvedValue({
          buffer: oggBuffer,
          mimeType: 'audio/ogg; codecs=opus',
          sizeBytes: oggBuffer.length,
          durationSeconds: 2.1,
        }),
      },
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
          mimeType: 'audio/ogg; codecs=opus',
          sizeBytes: oggBuffer.length,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationVoiceMessage(conversation().id, {
      file: {
        buffer: webmBuffer,
        mimetype: 'audio/webm; codecs=opus',
        originalname: 'gravacao.webm',
        size: webmBuffer.length,
      },
      requestId: 'voice-request-id',
      durationSeconds: '2.1',
    });

    expect(voiceConversion.convertWebmToOgg).toHaveBeenCalledWith({
      buffer: webmBuffer,
      mimeType: 'audio/webm; codecs=opus',
      durationSeconds: 2.1,
    });
    expect(provider.sendAudio).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      audioDataUrl: `data:audio/ogg;base64,${oggBuffer.toString('base64')}`,
      mimeType: 'audio/ogg; codecs=opus',
      seconds: 3,
      ptt: true,
      requestId: 'voice-request-id',
    });
    const audioPayload = (provider.sendAudio as MockWithCalls).mock.calls[0]?.[1] as {
      audioDataUrl: string;
      mimeType: string;
      ptt: boolean;
      seconds: number;
    };
    expect(audioPayload.audioDataUrl.startsWith('data:audio/ogg;base64,')).toBe(true);
    expect(audioPayload.audioDataUrl.startsWith('data:audio/ogg; codecs=opus;base64,')).toBe(false);
    expect(audioPayload.mimeType).toBe('audio/ogg; codecs=opus');
    expect(audioPayload.ptt).toBe(true);
    expect(audioPayload.seconds).toBeGreaterThanOrEqual(1);
    expect(audioPayload.seconds).toBeLessThanOrEqual(60);
    expect(mediaStorage.storeOutboundMedia).toHaveBeenCalledWith({
      whatsAppConnectionId: connection().id,
      messageId: conversationMessage().id,
      buffer: oggBuffer,
      mimeType: 'audio/ogg; codecs=opus',
      sizeBytes: oggBuffer.length,
    });
    const createCall = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    expect(createCall.data).toMatchObject({
      type: 'AUDIO',
      text: null,
      requestId: 'voice-request-id',
      rawMetadata: {
        source: 'manual_outbound_voice_send',
        storage: 'transient_request_only',
        retryPolicy: 'select_file_again_after_reload',
      },
      mediaMimeType: 'audio/ogg; codecs=opus',
      mediaFileName: 'voice-note.ogg',
      mediaSizeBytes: oggBuffer.length,
      mediaDurationSeconds: 3,
    });
    expect(
      JSON.stringify((prisma.whatsAppMessage.update as MockWithCalls).mock.calls),
    ).not.toContain(webmBuffer.toString('base64'));
  });

  it('keeps voice duration Seconds between one and sixty seconds', async () => {
    const { service, provider } = serviceFactory({
      voiceConversionOverrides: {
        convertWebmToOgg: vi
          .fn()
          .mockResolvedValueOnce({
            buffer: Buffer.from('short-ogg'),
            mimeType: 'audio/ogg; codecs=opus',
            sizeBytes: 9,
            durationSeconds: 0.2,
          })
          .mockResolvedValueOnce({
            buffer: Buffer.from('long-ogg'),
            mimeType: 'audio/ogg; codecs=opus',
            sizeBytes: 8,
            durationSeconds: 60,
          }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationVoiceMessage(conversation().id, {
      file: {
        buffer: Buffer.from('webm'),
        mimetype: 'audio/webm',
        originalname: 'curto.webm',
        size: 4,
      },
      requestId: 'voice-short-request-id',
    });
    await service.sendConversationVoiceMessage(conversation().id, {
      file: {
        buffer: Buffer.from('webm2'),
        mimetype: 'audio/webm',
        originalname: 'longo.webm',
        size: 5,
      },
      requestId: 'voice-long-request-id',
    });

    expect(provider.sendAudio).toHaveBeenNthCalledWith(
      1,
      'instance-token',
      expect.objectContaining({ seconds: 1, ptt: true }),
    );
    expect(provider.sendAudio).toHaveBeenNthCalledWith(
      2,
      'instance-token',
      expect.objectContaining({ seconds: 60, ptt: true }),
    );
  });

  it('rejects invalid voice upload input before calling conversion or provider', async () => {
    const { service, provider, voiceConversion } = serviceFactory();

    await expect(
      service.sendConversationVoiceMessage(conversation().id, {
        requestId: 'voice-missing-file-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationVoiceMessage(conversation().id, {
        file: {
          buffer: Buffer.from('ogg'),
          mimetype: 'audio/ogg',
          originalname: 'audio.ogg',
          size: 3,
        },
        requestId: 'voice-invalid-mime-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationVoiceMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'audio/webm',
          originalname: 'grande.webm',
          size: WhatsAppService.conversationVoiceMaxBytes + 1,
        },
        requestId: 'voice-large-request-id',
      }),
    ).rejects.toThrow('Arquivo excede o limite interno do CRM de 5 MB para gravacao de voz.');

    expect(voiceConversion.convertWebmToOgg).not.toHaveBeenCalled();
    expect(provider.sendAudio).not.toHaveBeenCalled();
  });

  it('does not persist WebM or send audio when voice conversion fails', async () => {
    const { service, provider, mediaStorage } = serviceFactory({
      voiceConversionOverrides: {
        convertWebmToOgg: vi.fn().mockRejectedValue(new BadRequestException('VOICE_INPUT_INVALID')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(
      service.sendConversationVoiceMessage(conversation().id, {
        file: {
          buffer: Buffer.from('webm'),
          mimetype: 'audio/webm',
          originalname: 'gravacao.webm',
          size: 4,
        },
        requestId: 'voice-conversion-failed-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(provider.sendAudio).not.toHaveBeenCalled();
    expect(mediaStorage.storeOutboundMedia).not.toHaveBeenCalled();
  });

  it('marks voice message as failed without local OGG storage when Kirago send fails', async () => {
    const { service, prisma, mediaStorage } = serviceFactory({
      providerOverrides: {
        sendAudio: vi.fn().mockRejectedValue(new Error('kirago offline token=secret')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationVoiceMessage(conversation().id, {
      file: {
        buffer: Buffer.from('webm'),
        mimetype: 'audio/webm',
        originalname: 'gravacao.webm',
        size: 4,
      },
      requestId: 'voice-kirago-failure-request-id',
    });

    expect(mediaStorage.storeOutboundMedia).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          rawMetadata: expect.objectContaining({
            source: 'manual_outbound_voice_send',
            errorMessage: expect.stringContaining('[redacted]'),
          }),
        }),
      }),
    );
  });

  it('keeps final persisted JPEG conversation media as IMAGE after provider and storage success', async () => {
    let storedMessage = conversationMessage();
    const whatsAppMessage = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage(args.data ?? {});
        return Promise.resolve(storedMessage);
      }),
      update: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage({ ...storedMessage, ...(args.data ?? {}) });
        return Promise.resolve(storedMessage);
      }),
    };
    const { service } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage,
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 10,
      },
      caption: 'Legenda',
      requestId: 'media-final-image-request-id',
    });

    expect(result).toMatchObject({
      type: 'IMAGE',
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'foto.jpg',
      mediaAvailable: true,
    });
    expect(whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'IMAGE' }),
      }),
    );
    expect(whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TEXT' }),
      }),
    );
  });

  it('keeps final persisted PDF conversation media as DOCUMENT after provider and storage success', async () => {
    let storedMessage = conversationMessage();
    const whatsAppMessage = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage(args.data ?? {});
        return Promise.resolve(storedMessage);
      }),
      update: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage({ ...storedMessage, ...(args.data ?? {}) });
        return Promise.resolve(storedMessage);
      }),
    };
    const { service } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
          mimeType: 'application/pdf',
          sizeBytes: 9,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage,
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('pdf-bytes'),
        mimetype: 'application/pdf',
        originalname: 'contrato.pdf',
        size: 9,
      },
      requestId: 'media-final-document-request-id',
    });

    expect(result).toMatchObject({
      type: 'DOCUMENT',
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato.pdf',
      mediaAvailable: true,
    });
    expect(whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DOCUMENT' }),
      }),
    );
    expect(whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TEXT' }),
      }),
    );
  });

  it('keeps final persisted OGG conversation media as AUDIO after provider and storage success', async () => {
    let storedMessage = conversationMessage();
    const whatsAppMessage = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage(args.data ?? {});
        return Promise.resolve(storedMessage);
      }),
      update: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage({ ...storedMessage, ...(args.data ?? {}) });
        return Promise.resolve(storedMessage);
      }),
    };
    const { service } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue({
          storageKey: `${connection().id}/${conversationMessage().id}/ffffffff-ffff-4fff-8fff-ffffffffffff`,
          mimeType: 'audio/ogg',
          sizeBytes: 11,
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage,
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('ogg-bytes'),
        mimetype: 'audio/ogg',
        originalname: 'recado.ogg',
        size: 11,
      },
      requestId: 'media-final-audio-request-id',
    });

    expect(result).toMatchObject({
      type: 'AUDIO',
      mediaMimeType: 'audio/ogg',
      mediaFileName: 'recado.ogg',
      mediaAvailable: true,
    });
    expect(whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'AUDIO' }),
      }),
    );
    expect(whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TEXT' }),
      }),
    );
  });

  it('does not keep outbound media locally when Kirago send fails', async () => {
    const { service, mediaStorage, prisma } = serviceFactory({
      providerOverrides: {
        sendImage: vi.fn().mockRejectedValue(new Error('kirago unavailable')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 10,
      },
      requestId: 'failed-media-request-id',
    });

    expect(result.status).toBe('FAILED');
    expect(mediaStorage.storeOutboundMedia).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          rawMetadata: expect.not.objectContaining({ localMedia: expect.anything() }),
        }),
      }),
    );
  });

  it('marks outbound VIDEO as FAILED when Kirago video send fails', async () => {
    let storedMessage = conversationMessage();
    const whatsAppMessage = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage(args.data ?? {});
        return Promise.resolve(storedMessage);
      }),
      update: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage({ ...storedMessage, ...(args.data ?? {}) });
        return Promise.resolve(storedMessage);
      }),
    };
    const { service, provider, prisma, mediaStorage } = serviceFactory({
      providerOverrides: {
        sendVideo: vi.fn().mockRejectedValue(new Error('kirago video unavailable')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage,
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('mp4-bytes'),
        mimetype: 'video/mp4',
        originalname: 'video.mp4',
        size: 9,
      },
      caption: 'Falhar video',
      requestId: 'failed-video-request-id',
    });

    expect(provider.sendVideo).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({
        videoDataUrl: expect.stringMatching(/^data:video\/mp4;base64,/),
        caption: 'Falhar video',
        mimeType: 'video/mp4',
        requestId: 'failed-video-request-id',
      }),
    );
    expect(result).toMatchObject({ type: 'VIDEO', status: 'FAILED' });
    expect(mediaStorage.storeOutboundMedia).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          rawMetadata: expect.not.objectContaining({ localMedia: expect.anything() }),
        }),
      }),
    );
  });

  it('keeps outbound media SENT when local storage fails after Kirago accepts the send', async () => {
    let storedMessage = conversationMessage();
    const whatsAppMessage = {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage(args.data ?? {});
        return Promise.resolve(storedMessage);
      }),
      update: vi.fn((args: { data?: Record<string, unknown> }) => {
        storedMessage = conversationMessage({ ...storedMessage, ...(args.data ?? {}) });
        return Promise.resolve(storedMessage);
      }),
    };
    const { service, prisma } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockRejectedValue(new Error('disk full with token=secret')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage,
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 10,
      },
      requestId: 'storage-failed-request-id',
    });
    const updateArgs = (prisma.whatsAppMessage.update as MockWithCalls).mock.calls.find(
      ([args]) => (args as { data?: { status?: string } }).data?.status === 'SENT',
    )?.[0] as { data?: { rawMetadata?: unknown } };

    expect(result.status).toBe('SENT');
    expect(result.type).toBe('IMAGE');
    expect(updateArgs.data?.rawMetadata).toMatchObject({
      localMediaError: {
        source: 'local_storage',
      },
    });
    expect(JSON.stringify(updateArgs.data?.rawMetadata)).toContain('token=[redacted]');
    expect(JSON.stringify(updateArgs.data?.rawMetadata)).not.toContain('secret');
    expect(whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TEXT' }),
      }),
    );
  });

  it('keeps outbound media PENDING when DB persistence fails after Kirago accepts the send', async () => {
    const localMedia = {
      storageKey: `${connection().id}/${conversationMessage().id}/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
      mimeType: 'image/jpeg',
      sizeBytes: 10,
    };
    const { service, prisma, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        storeOutboundMedia: vi.fn().mockResolvedValue(localMedia),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              status: 'PENDING',
              providerMessageId: 'provider-image-id',
            }),
          ),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage(args.data ?? {})),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        $transaction: vi.fn(async (input: unknown) => {
          if (Array.isArray(input)) {
            return Promise.all(input);
          }

          throw new Error('db unavailable after send');
        }),
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('jpeg-bytes'),
        mimetype: 'image/jpeg',
        originalname: 'foto.jpg',
        size: 10,
      },
      requestId: 'db-failed-request-id',
    });

    expect(result).toMatchObject({ status: 'PENDING', retryAction: null });
    expect(mediaStorage.delete).toHaveBeenCalledWith(localMedia.storageKey);
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversationMessage().id },
        data: expect.objectContaining({
          providerMessageId: 'provider-image-id',
        }),
      }),
    );
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
  });

  it('keeps retry PENDING and non-retryable when provider succeeds but final DB persistence fails', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      requestId: 'old-request-id',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Mensagem ambigua',
      status: 'FAILED',
      providerMessageId: null,
      rawMetadata: { source: 'manual_outbound_send' },
    });
    const pending = conversationMessage({
      ...failed,
      status: 'PENDING',
      providerMessageId: 'provider-id',
      failedAt: null,
    });
    const { service, prisma, provider, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(pending),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...pending, ...args.data })),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        $transaction: vi.fn(() => {
          throw new Error('db unavailable after provider success');
        }),
      },
    });

    const result = await service.retryConversationMessage(failed.id);
    const pendingUpdate = (prisma.whatsAppMessage.updateMany as MockWithCalls).mock
      .calls[0]?.[0] as {
      data?: { requestId?: string };
    };

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: conversation().phoneNormalized,
      body: 'Mensagem ambigua',
      requestId: pendingUpdate.data?.requestId,
    });
    expect(result).toMatchObject({
      id: failed.id,
      status: 'PENDING',
      providerMessageId: 'provider-id',
      retryAction: null,
    });
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(conversation().id, failed.id);
  });

  it('marks retry FAILED when provider rejects before confirming send', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Mensagem falhou',
      status: 'FAILED',
    });
    const { service, provider } = serviceFactory({
      providerOverrides: {
        sendText: vi.fn().mockRejectedValue(new Error('provider offline')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...failed, ...args.data })),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.retryConversationMessage(failed.id);

    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'FAILED', retryAction: 'RETRY' });
  });

  it('rejects retry before provider when localMedia MIME is invalid for the message type', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      direction: 'OUTBOUND',
      type: 'IMAGE',
      status: 'FAILED',
      mediaMimeType: 'image/jpeg',
      rawMetadata: {
        source: 'manual_outbound_media_send',
        localMedia: {
          storageKey: `${activeConnection.id}/99999999-9999-4999-8999-999999999999/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'application/pdf',
          sizeBytes: 10,
        },
      },
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    await expect(service.retryConversationMessage(failed.id)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(provider.sendImage).not.toHaveBeenCalled();
  });

  it('keeps echoed retry messages recoverable by the new requestId after provider confirmation', async () => {
    const retryRequestId = '2f419d6d-d81a-4ed8-9f38-c6ff02d37394';
    const existing = conversationMessage({
      requestId: retryRequestId,
      providerMessageId: null,
      direction: 'OUTBOUND',
      status: 'PENDING',
      sentAt: null,
      text: 'Retry echo',
      rawMetadata: { retry: { attemptId: retryRequestId, status: 'PROVIDER_CONFIRMED' } },
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...existing, ...args.data })),
          ),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Retry echo', {
        direction: 'OUTGOING',
        messageId: retryRequestId,
      }),
    );

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      action: 'outgoing_conversation_message_reconciled',
      conversation: { action: 'outgoing_conversation_message_reconciled' },
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({
          providerMessageId: retryRequestId,
          status: 'SENT',
        }),
      }),
    );
  });

  it('rejects unsupported media MIME, audio/webm and files above CRM internal size limit', async () => {
    const { service, provider } = serviceFactory();

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('gif'),
          mimetype: 'image/gif',
          originalname: 'animado.gif',
          size: 3,
        },
        requestId: 'gif-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('webm'),
          mimetype: 'audio/webm',
          originalname: 'gravacao.webm',
          size: 4,
        },
        requestId: 'webm-request-id',
      }),
    ).rejects.toThrow('Formato de audio nao suportado. Envie OGG, MP3 ou M4A.');

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/pdf',
          originalname: 'pdf-11mb.pdf',
          size: 11 * 1024 * 1024,
        },
        requestId: 'large-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/pdf',
          originalname: 'pdf-20mb.pdf',
          size: 20 * 1024 * 1024,
        },
        requestId: 'large-pdf-20mb-request-id',
      }),
    ).rejects.toThrow('Arquivo excede o limite de 10 MB permitido.');

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/zip',
          originalname: 'grande.zip',
          size: WhatsAppService.conversationMediaMaxBytes + 1,
        },
        requestId: 'large-zip-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/zip',
          originalname: 'zip-20mb.zip',
          size: 20 * 1024 * 1024,
        },
        requestId: 'large-zip-20mb-request-id',
      }),
    ).rejects.toThrow('Arquivo excede o limite de 10 MB permitido.');

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/vnd.rar',
          originalname: 'grande.rar',
          size: WhatsAppService.conversationMediaMaxBytes + 1,
        },
        requestId: 'large-rar-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'image/vnd.adobe.photoshop',
          originalname: 'grande.psd',
          size: WhatsAppService.conversationMediaMaxBytes + 1,
        },
        requestId: 'large-psd-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'application/vnd.android.package-archive',
          originalname: 'grande.apk',
          size: WhatsAppService.conversationMediaMaxBytes + 1,
        },
        requestId: 'large-apk-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'image/jpeg',
          originalname: 'image-11mb.jpg',
          size: 11 * 1024 * 1024,
        },
        requestId: 'large-image-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'audio/mpeg',
          originalname: 'audio-11mb.mp3',
          size: 11 * 1024 * 1024,
        },
        requestId: 'large-audio-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(1),
          mimetype: 'video/mp4',
          originalname: 'grande.mp4',
          size: WhatsAppService.conversationVideoMaxBytes + 1,
        },
        requestId: 'large-video-request-id',
      }),
    ).rejects.toThrow('Vídeo excede o limite de 50 MB permitido para envio por WhatsApp.');

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('exe'),
          mimetype: 'application/octet-stream',
          originalname: 'setup.exe',
          size: 3,
        },
        requestId: 'exe-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('bin'),
          mimetype: 'application/octet-stream',
          originalname: 'payload.bin',
          size: 3,
        },
        requestId: 'bin-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('unknown'),
          mimetype: 'application/octet-stream',
          originalname: 'arquivo.xyz',
          size: 7,
        },
        requestId: 'unknown-extension-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('exe'),
          mimetype: 'application/x-msdownload',
          originalname: 'arquivo.zip',
          size: 3,
        },
        requestId: 'zip-msdownload-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('jpeg'),
          mimetype: 'image/jpeg',
          originalname: 'arquivo.zip',
          size: 4,
        },
        requestId: 'zip-jpeg-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('exe'),
          mimetype: 'application/x-msdownload',
          originalname: 'arquivo.exe.zip',
          size: 3,
        },
        requestId: 'double-extension-msdownload-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('zip'),
          mimetype: 'application/octet-stream',
          originalname: 'arquivo.zip.exe',
          size: 3,
        },
        requestId: 'double-extension-exe-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.alloc(0),
          mimetype: 'application/zip',
          originalname: 'vazio.zip',
          size: 0,
        },
        requestId: 'empty-file-request-id',
      }),
    ).rejects.toThrow('Arquivo vazio.');

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('fake-video'),
          mimetype: 'image/jpeg',
          originalname: 'video.mp4',
          size: 10,
        },
        requestId: 'video-mismatch-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('fake-video'),
          mimetype: 'application/octet-stream',
          originalname: 'video.mp4',
          size: 10,
        },
        requestId: 'video-octet-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('empty-video'),
          mimetype: 'video/mp4',
          originalname: 'video.mov',
          size: 11,
        },
        requestId: 'video-extension-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.sendConversationMediaMessage(conversation().id, {
        file: {
          buffer: Buffer.from('fake-video'),
          mimetype: 'video/mp4',
          originalname: 'arquivo.jpg',
          size: 10,
        },
        requestId: 'video-jpg-request-id',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(provider.sendImage).not.toHaveBeenCalled();
    expect(provider.sendDocument).not.toHaveBeenCalled();
    expect(provider.sendAudio).not.toHaveBeenCalled();
    expect(provider.sendVideo).not.toHaveBeenCalled();
  });

  it('does not resend conversation media when requestId already exists', async () => {
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      requestId: 'existing-media-request',
      conversationId: conversation().id,
      whatsAppConnectionId: connection().id,
      type: 'IMAGE',
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
          update: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    const result = await service.sendConversationMediaMessage(conversation().id, {
      file: {
        buffer: Buffer.from('png-bytes'),
        mimetype: 'image/png',
        originalname: 'foto.png',
        size: 9,
      },
      requestId: 'existing-media-request',
    });

    expect(result.id).toBe(existing.id);
    expect(provider.sendImage).not.toHaveBeenCalled();
  });

  it('sends the current WAITING_PAYMENT PIX through Kirago buttons without changing finance state', async () => {
    const { service, provider, prisma, realtime } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });

    const result = await service.sendPixPaymentIntent('payment-intent-id', 'user-id');
    const sendButtonsPayload = (provider.sendButtons as MockWithCalls).mock.calls[0]?.[1] as {
      body: string;
    };

    expect(provider.sendButtons).toHaveBeenCalledWith('instance-token', {
      phone: '5544999999999',
      title: 'PIX',
      body: sendButtonsPayload.body,
      buttons: [
        {
          name: 'cta_copy',
          buttonParamsJson: {
            display_text: 'Copiar Chave PIX',
            copy_code: 'PIX-COPY-PASTE-CURRENT',
          },
        },
      ],
    });
    expect(sendButtonsPayload.body).toMatch(/Valor: R\$\s*30,00/);
    expect(sendButtonsPayload.body).toContain(
      'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
    );
    expect(sendButtonsPayload.body).toContain('Caso a chave esteja expirada, solicite uma nova.');
    expect(sendButtonsPayload.body).not.toContain('Cliente Teste');
    expect(sendButtonsPayload.body).not.toContain('Pagamento via PIX');
    expect(sendButtonsPayload.body).not.toContain('Gatebridge');
    expect(sendButtonsPayload.body).not.toContain('FastFlow');
    expect(sendButtonsPayload.body).not.toContain('FastPay');
    expect(sendButtonsPayload.body).not.toContain('24 horas');
    expect(sendButtonsPayload.body).not.toContain('2 horas');
    expect(sendButtonsPayload.body).not.toContain('parceiro responsavel');
    expect(sendButtonsPayload.body).not.toContain('nome do recebedor');
    expect(result).toMatchObject({
      success: true,
      messageDispatchId: dispatch().id,
      destinationMasked: '5544*****9999',
      providerMessageId: 'provider-button-id',
    });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: conversation().id,
          whatsAppConnectionId: connection().id,
          direction: 'OUTBOUND',
          isFromMe: true,
          messageDispatchId: dispatch().id,
          providerMessageId: 'provider-button-id',
          requestId: 'request-id',
          status: 'SENT',
          text: expect.stringContaining('PIX'),
          type: 'TEXT',
        }),
      }),
    );
    const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: { rawMetadata?: unknown; text?: string };
    };
    expect(JSON.stringify(messageCreate?.data?.rawMetadata)).not.toContain(
      'PIX-COPY-PASTE-CURRENT',
    );
    expect(messageCreate?.data?.text).not.toContain('PIX-COPY-PASTE-CURRENT');
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      conversation().id,
      conversationMessage().id,
      'OUTBOUND',
    );
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversation().id);
    expect(prisma.paymentIntent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'payment-intent-id' } }),
    );
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          receivableId: 'receivable-id',
          paymentGroupId: null,
          status: 'WAITING_PAYMENT',
        },
      }),
    );
    expect(JSON.stringify((prisma.$transaction as MockWithCalls).mock.calls)).not.toContain(
      'PIX-COPY-PASTE-CURRENT',
    );
  });

  it('reuses an existing PIX conversation when only the Brazil 9th digit variant differs', async () => {
    const legacyConversation = conversation({
      id: 'legacy-mobile-conversation-id',
      phone: '554499999999',
      phoneNormalized: '554499999999',
    });
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([legacyConversation]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({
      where: {
        whatsAppConnectionId_phoneNormalized: {
          whatsAppConnectionId: connection().id,
          phoneNormalized: '5544999999999',
        },
      },
    });
    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith({
      where: {
        whatsAppConnectionId: connection().id,
        phoneNormalized: { in: ['554499999999'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'legacy-mobile-conversation-id',
          whatsAppConnectionId: connection().id,
        }),
      }),
    );
  });

  it('normalizes a legacy PIX phone and prioritizes an exact canonical conversation', async () => {
    const canonicalConversation = conversation({
      id: 'canonical-pix-conversation-id',
      phone: '5544999999999',
      phoneNormalized: '5544999999999',
    });
    const findMany = vi.fn().mockResolvedValue([]);
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'payment-intent-id',
            receivableId: 'receivable-id',
            paymentGroupId: null,
            provider: 'FASTFLOW',
            providerTransactionId: 'provider-transaction-id',
            externalStatus: 'WAITING_PAYMENT',
            externalDepixId: null,
            blockchainTxId: null,
            status: 'WAITING_PAYMENT',
            amount: new Prisma.Decimal(30),
            pixCopyPaste: 'PIX-COPY-PASTE-CURRENT',
            qrCodeData: 'data:image/png;base64,abc',
            expiresAt: new Date('2026-09-12T00:00:00.000Z'),
            paidAt: null,
            lastSyncAt: now,
            failureCode: null,
            failureMessage: null,
            createdAt: now,
            updatedAt: now,
            receivable: {
              id: 'receivable-id',
              clientId: client().id,
              clientReferenceId: clientReference().id,
              purpose: 'INITIAL_ACTIVATION',
              renewalId: null,
              description: 'Cobranca inicial de ativacao - Mensal',
              amount: new Prisma.Decimal(30),
              dueDate: now,
              status: 'PENDENTE',
              paidAt: null,
              canceledAt: null,
              cancelReason: null,
              createdAt: now,
              updatedAt: now,
              client: client({ phoneNormalized: '554499999999' }),
              clientReference: clientReference(),
            },
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 'payment-intent-id',
            receivableId: 'receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(canonicalConversation),
          findFirst: vi.fn(),
          findMany,
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(canonicalConversation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({
      where: {
        whatsAppConnectionId_phoneNormalized: {
          whatsAppConnectionId: connection().id,
          phoneNormalized: '5544999999999',
        },
      },
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'canonical-pix-conversation-id',
        }),
      }),
    );
  });

  it('reuses an exact existing PIX conversation without checking aliases or creating another chat', async () => {
    const linkedConversation = conversation({
      id: 'exact-pix-conversation-id',
      clientId: client().id,
    });
    const findFirst = vi.fn();
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(linkedConversation),
          findFirst,
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(linkedConversation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(prisma.whatsAppConversation.findUnique).toHaveBeenCalledWith({
      where: {
        whatsAppConnectionId_phoneNormalized: {
          whatsAppConnectionId: connection().id,
          phoneNormalized: '5544999999999',
        },
      },
    });
    expect(findFirst).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'exact-pix-conversation-id',
        }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'exact-pix-conversation-id' },
      }),
    );
  });

  it('creates exactly one PIX conversation for a truly new contact on the active connection', async () => {
    const newConversation = conversation({
      id: 'new-pix-conversation-id',
      phone: '5544999999999',
      phoneNormalized: '5544999999999',
    });
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(newConversation),
          update: vi.fn().mockResolvedValue(newConversation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(prisma.whatsAppConversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.whatsAppConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whatsAppConnectionId: connection().id,
          phone: '5544999999999',
          phoneNormalized: '5544999999999',
          unreadCount: 0,
        }),
      }),
    );
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'new-pix-conversation-id',
          direction: 'OUTBOUND',
        }),
      }),
    );
  });

  it('keeps PIX conversation lookup isolated to the active WhatsApp connection', async () => {
    const activeConnection = connection({
      id: 'connection-a',
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const sameConnectionConversation = conversation({
      id: 'connection-a-conversation-id',
      whatsAppConnectionId: activeConnection.id,
      phone: '554499999999',
      phoneNormalized: '554499999999',
    });
    const findMany = vi.fn(
      (args: { where?: { whatsAppConnectionId?: string; phoneNormalized?: { in?: string[] } } }) =>
        Promise.resolve(
          args.where?.whatsAppConnectionId === activeConnection.id &&
            args.where.phoneNormalized?.in?.includes('554499999999')
            ? [sameConnectionConversation]
            : [],
        ),
    );
    const { service, prisma } = serviceFactory({
      currentConnection: activeConnection,
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn(),
          findMany,
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(sameConnectionConversation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        whatsAppConnectionId: activeConnection.id,
        phoneNormalized: { in: ['554499999999'] },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'connection-a-conversation-id',
          whatsAppConnectionId: activeConnection.id,
        }),
      }),
    );
    expect(
      JSON.stringify((prisma.whatsAppMessage.create as MockWithCalls).mock.calls),
    ).not.toContain('connection-b-conversation-id');
  });

  it('chooses a deterministic linked PIX alias when multiple equivalent conversations already exist', async () => {
    const unlinkedRecent = conversation({
      id: 'alias-unlinked-recent',
      phone: '554499999999',
      phoneNormalized: '554499999999',
      clientId: null,
      updatedAt: new Date('2026-10-13T12:00:00.000Z'),
    });
    const linkedOlder = conversation({
      id: 'alias-linked-older',
      phone: '554499999999',
      phoneNormalized: '554499999999',
      clientId: client().id,
      updatedAt: new Date('2026-10-12T12:00:00.000Z'),
    });
    const { service, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([unlinkedRecent, linkedOlder]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(linkedOlder),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'alias-linked-older',
        }),
      }),
    );
  });

  it('does not duplicate PIX dispatch, message or conversation on payment intent retry', async () => {
    const sentDispatch = dispatch({
      status: 'SENT',
      requestId: 'pix-whatsapp:payment-intent-id',
      idempotencyKey: 'pix-whatsapp:payment-intent-id',
      providerMessageId: 'provider-button-id',
      sentAt: now,
    });
    const existingMessage = conversationMessage({
      id: 'existing-pix-message-id',
      conversationId: conversation().id,
      whatsAppConnectionId: connection().id,
      direction: 'OUTBOUND',
      messageDispatchId: sentDispatch.id,
      providerMessageId: sentDispatch.providerMessageId,
      requestId: sentDispatch.requestId,
      rawMetadata: { source: 'pix_whatsapp_send', paymentIntentId: 'payment-intent-id' },
    });
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        messageDispatch: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(sentDispatch),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(existingMessage),
          findFirst: vi.fn().mockResolvedValue(existingMessage),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(existingMessage),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(result).toMatchObject({ status: 'SENT', reused: true, idempotent: true });
    expect(provider.sendButtons).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('sends MANUAL_CHARGE for a registered client using payer snapshots instead of edited client data', async () => {
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(manualChargePaymentIntent()),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');
    const sendButtonsPayload = (provider.sendButtons as MockWithCalls).mock.calls[0]?.[1] as {
      body: string;
      buttons: Array<{ buttonParamsJson: { copy_code: string; display_text: string } }>;
      phone: string;
    };
    const dispatchCreate = (prisma.messageDispatch.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: {
        clientId?: string | null;
        clientReferenceId?: string | null;
        idempotencyKey?: string;
        receivableId?: string;
        requestId?: string;
        phone?: string;
        items?: unknown;
      };
    };

    expect(sendButtonsPayload.phone).toBe('5511988887777');
    expect(sendButtonsPayload.body).not.toContain('Ola');
    expect(sendButtonsPayload.body).not.toContain('Pagador Snapshot');
    expect(sendButtonsPayload.body).not.toContain('Segue sua cobranca');
    expect(sendButtonsPayload.body).toContain('Manutencao do equipamento');
    expect(sendButtonsPayload.body).toContain('Valor: R$');
    expect(sendButtonsPayload.body).toContain('80,00');
    expect(sendButtonsPayload.body).not.toContain('Vencimento');
    expect(sendButtonsPayload.body).not.toContain('10/10/2026');
    expect(sendButtonsPayload.body).toContain(
      'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
    );
    expect(sendButtonsPayload.body).not.toContain('validade');
    expect(sendButtonsPayload.body).not.toContain('11/10/2026');
    expect(sendButtonsPayload.body).not.toContain('Cliente Alterado Depois');
    expect(sendButtonsPayload.body).not.toContain('MANUAL_CHARGE');
    expect(sendButtonsPayload.buttons[0]?.buttonParamsJson).toEqual({
      display_text: 'Copiar Chave PIX',
      copy_code: 'MANUAL-PIX-COPY-PASTE-CURRENT',
    });
    expect(dispatchCreate?.data).toMatchObject({
      clientId: client().id,
      receivableId: 'manual-receivable-id',
      phone: '5511988887777',
      requestId: 'pix-whatsapp:manual-payment-intent-id',
      idempotencyKey: 'pix-whatsapp:manual-payment-intent-id',
    });
    expect(dispatchCreate?.data?.clientReferenceId).toBeUndefined();
    expect(dispatchCreate?.data?.items).toBeUndefined();
    const auditCreate = (prisma.receivableAuditEvent.create as MockWithCalls).mock
      .calls[0]?.[0] as {
      data?: {
        actorUserId?: string;
        eventType?: string;
        messageDispatchId?: string;
        paymentIntentId?: string;
        provider?: string;
        providerTransactionId?: string;
        payerNameSnapshot?: string;
        receivableId?: string;
      };
    };
    expect(auditCreate?.data).toMatchObject({
      eventType: 'WHATSAPP_SENT',
      receivableId: 'manual-receivable-id',
      paymentIntentId: 'manual-payment-intent-id',
      messageDispatchId: dispatch().id,
      actorUserId: 'user-id',
      provider: 'FASTFLOW',
      providerTransactionId: 'manual-provider-transaction-id',
      payerNameSnapshot: 'Pagador Snapshot',
    });
    expect(result).toMatchObject({
      success: true,
      dispatchId: dispatch().id,
      status: 'SENT',
      reused: false,
    });
  });

  it('sends MANUAL_CHARGE to a guest without requiring Client or ClientEvent', async () => {
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(
            manualChargePaymentIntent({
              receivable: manualChargeReceivable({
                clientId: null,
                client: null,
                payerName: 'Visitante Avulso',
                payerPhoneNormalized: '5511977776666',
              }),
            }),
          ),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
      },
    });

    await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');
    const sendButtonsPayload = (provider.sendButtons as MockWithCalls).mock.calls[0]?.[1] as {
      body: string;
      phone: string;
    };
    const dispatchCreate = (prisma.messageDispatch.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: { clientId?: string | null; clientReferenceId?: string | null; receivableId?: string };
    };
    const transactionCallback = (prisma.$transaction as MockWithCalls).mock.calls[0]?.[0] as
      ((tx: unknown) => Promise<unknown>) | undefined;

    expect(sendButtonsPayload.phone).toBe('5511977776666');
    expect(sendButtonsPayload.body).not.toContain('Ola');
    expect(sendButtonsPayload.body).not.toContain('Visitante Avulso');
    expect(dispatchCreate?.data).toMatchObject({
      clientId: null,
      receivableId: 'manual-receivable-id',
    });
    expect(dispatchCreate?.data?.clientReferenceId).toBeUndefined();
    expect(JSON.stringify((provider.sendButtons as MockWithCalls).mock.calls)).not.toContain(
      'Cliente Teste',
    );
    expect(JSON.stringify((prisma.$transaction as MockWithCalls).mock.calls)).not.toContain(
      'CLIENT_CREATED',
    );
    expect(transactionCallback).toBeTypeOf('function');
  });

  it('sends grouped WAITING_PAYMENT PIX once and records grouped dispatch items', async () => {
    const groupedItems = [
      {
        id: 'group-item-1',
        paymentGroupId: 'payment-group-id',
        receivableId: 'receivable-a',
        amount: new Prisma.Decimal(25),
        createdAt: now,
        receivable: {
          id: 'receivable-a',
          clientId: client().id,
          clientReferenceId: 'reference-a',
          purpose: 'MONTHLY',
          renewalId: null,
          description: 'Mensalidade A',
          amount: new Prisma.Decimal(25),
          dueDate: now,
          status: 'PENDENTE',
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          clientReference: {
            ...clientReference(),
            id: 'reference-a',
            reference: 'robertoserour333',
          },
        },
      },
      {
        id: 'group-item-2',
        paymentGroupId: 'payment-group-id',
        receivableId: 'receivable-b',
        amount: new Prisma.Decimal(50),
        createdAt: now,
        receivable: {
          id: 'receivable-b',
          clientId: client().id,
          clientReferenceId: 'reference-b',
          purpose: 'MONTHLY',
          renewalId: null,
          description: 'Mensalidade B',
          amount: new Prisma.Decimal(50),
          dueDate: now,
          status: 'PENDENTE',
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: now,
          updatedAt: now,
          clientReference: { ...clientReference(), id: 'reference-b', reference: 'Zm4Bc1' },
        },
      },
    ];
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'grouped-payment-intent-id',
            receivableId: null,
            paymentGroupId: 'payment-group-id',
            provider: 'FASTFLOW',
            providerTransactionId: 'group-provider-transaction-id',
            externalStatus: 'WAITING_PAYMENT',
            externalDepixId: null,
            blockchainTxId: null,
            status: 'WAITING_PAYMENT',
            amount: new Prisma.Decimal(75),
            pixCopyPaste: 'GROUPED-PIX-COPY-PASTE',
            qrCodeData: 'data:image/png;base64,grouped',
            expiresAt: new Date('2026-09-12T00:00:00.000Z'),
            paidAt: null,
            lastSyncAt: now,
            failureCode: null,
            failureMessage: null,
            createdAt: now,
            updatedAt: now,
            receivable: null,
            paymentGroup: {
              id: 'payment-group-id',
              clientId: client().id,
              status: 'WAITING_PAYMENT',
              totalAmount: new Prisma.Decimal(75),
              paidAt: null,
              createdByUserId: 'user-id',
              createdAt: now,
              updatedAt: now,
              client: client(),
              items: groupedItems,
            },
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 'grouped-payment-intent-id',
            receivableId: null,
            paymentGroupId: 'payment-group-id',
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('grouped-payment-intent-id', 'user-id');
    const sendButtonsPayload = (provider.sendButtons as MockWithCalls).mock.calls[0]?.[1] as {
      body: string;
      buttons: Array<{ buttonParamsJson: { copy_code: string } }>;
    };
    const dispatchCreate = (prisma.messageDispatch.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: { receivableId?: string; items?: { create?: unknown[] } };
    };

    expect(provider.sendButtons).toHaveBeenCalledTimes(1);
    expect(sendButtonsPayload.body).toContain('Segue um único PIX referente às suas cobranças.');
    expect(sendButtonsPayload.body).toContain('2 contas');
    expect(sendButtonsPayload.body).toContain('Total: R$');
    expect(sendButtonsPayload.body).not.toContain('Referências:');
    expect(sendButtonsPayload.body).not.toContain('robertoserour333');
    expect(sendButtonsPayload.body).not.toContain('Zm4Bc1');
    expect(sendButtonsPayload.body).not.toContain('Mensalidade A');
    expect(sendButtonsPayload.body).not.toContain('Mensalidade B');
    expect(sendButtonsPayload.buttons[0]?.buttonParamsJson.copy_code).toBe(
      'GROUPED-PIX-COPY-PASTE',
    );
    expect(dispatchCreate?.data?.receivableId).toBeUndefined();
    expect(dispatchCreate?.data?.items?.create).toHaveLength(2);
    expect(result).toMatchObject({
      success: true,
      messageDispatchId: dispatch().id,
      destinationMasked: '5544*****9999',
      providerMessageId: 'provider-button-id',
    });
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          paymentGroupId: 'payment-group-id',
          receivableId: null,
          status: 'WAITING_PAYMENT',
        },
      }),
    );
  });

  it('records a controlled failed dispatch when Kirago rate-limits PIX send without changing finance state', async () => {
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      providerOverrides: {
        sendButtons: vi
          .fn()
          .mockRejectedValue(
            new KiragoProviderError('KIRAGO_RATE_LIMITED', 'Kirago HTTP 429', 429),
          ),
      },
    });

    const result = await service.sendPixPaymentIntent('payment-intent-id', 'user-id');

    expect(provider.sendButtons).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: false,
      messageDispatchId: dispatch().id,
      errorMessage:
        'Limite temporario de envios do WhatsApp atingido. Aguarde antes de tentar novamente.',
    });
    expect(prisma.paymentIntent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'payment-intent-id' } }),
    );
    expect(prisma.paymentIntent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          receivableId: 'receivable-id',
          paymentGroupId: null,
          status: 'WAITING_PAYMENT',
        },
      }),
    );
    const failedUpdate = (prisma.messageDispatch.update as MockWithCalls).mock.calls[0]?.[0] as
      { data?: { errorMessage?: string; status?: string } } | undefined;
    expect(failedUpdate?.data).toMatchObject({
      status: 'FAILED',
      errorMessage:
        'Limite temporario de envios do WhatsApp atingido. Aguarde antes de tentar novamente.',
    });
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();
    expect(JSON.stringify((prisma.$transaction as MockWithCalls).mock.calls)).not.toContain(
      'paymentIntent',
    );
  });

  it('blocks manual PIX WhatsApp send when the intent is not the current waiting PIX', async () => {
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'old-payment-intent-id',
            receivableId: 'receivable-id',
            paymentGroupId: null,
            provider: 'FASTFLOW',
            providerTransactionId: 'old-provider-transaction-id',
            externalStatus: 'WAITING_PAYMENT',
            externalDepixId: null,
            blockchainTxId: null,
            status: 'WAITING_PAYMENT',
            amount: new Prisma.Decimal(30),
            pixCopyPaste: 'OLD-PIX-CODE',
            qrCodeData: null,
            expiresAt: null,
            paidAt: null,
            lastSyncAt: now,
            failureCode: null,
            failureMessage: null,
            createdAt: now,
            updatedAt: now,
            receivable: {
              id: 'receivable-id',
              clientId: client().id,
              clientReferenceId: clientReference().id,
              purpose: 'INITIAL_ACTIVATION',
              renewalId: null,
              description: 'Cobranca inicial de ativacao - Mensal',
              amount: new Prisma.Decimal(30),
              dueDate: now,
              status: 'PENDENTE',
              paidAt: null,
              canceledAt: null,
              cancelReason: null,
              createdAt: now,
              updatedAt: now,
              client: client(),
              clientReference: clientReference(),
            },
          }),
          findFirst: vi.fn().mockResolvedValue({
            id: 'current-payment-intent-id',
            receivableId: 'receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
      },
    });

    await expect(service.sendPixPaymentIntent('old-payment-intent-id', 'user-id')).rejects.toThrow(
      ConflictException,
    );
    expect(provider.sendButtons).not.toHaveBeenCalled();
  });

  it('reuses an already SENT MANUAL_CHARGE dispatch without duplicate provider send or audit', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(manualChargePaymentIntent()),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
        messageDispatch: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(
            dispatch({
              status: 'SENT',
              requestId: 'manual-charge-pix:manual-payment-intent-id',
              idempotencyKey: 'manual-charge-pix:manual-payment-intent-id',
              sentAt: now,
            }),
          ),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');

    expect(result).toMatchObject({ status: 'SENT', reused: true, idempotent: true });
    expect(provider.sendButtons).not.toHaveBeenCalled();
    expect(prisma.receivableAuditEvent.create).not.toHaveBeenCalled();
  });

  it('reuses a pending MANUAL_CHARGE dispatch without creating a second send', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(manualChargePaymentIntent()),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
        messageDispatch: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(
            dispatch({
              status: 'PENDING',
              requestId: 'manual-charge-pix:manual-payment-intent-id',
              idempotencyKey: 'manual-charge-pix:manual-payment-intent-id',
            }),
          ),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');

    expect(result).toMatchObject({ status: 'PENDING', reused: true });
    expect(provider.sendButtons).not.toHaveBeenCalled();
  });

  it('retries a failed MANUAL_CHARGE dispatch without generating another PIX', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { service, provider, prisma, finance } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(manualChargePaymentIntent()),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
        messageDispatch: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          findMany: vi.fn(),
          findUniqueOrThrow: vi.fn().mockResolvedValue(
            dispatch({
              status: 'FAILED',
              requestId: 'manual-charge-pix:manual-payment-intent-id',
              idempotencyKey: 'manual-charge-pix:manual-payment-intent-id',
            }),
          ),
        },
      },
    });

    const result = await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');

    expect(result).toMatchObject({ success: true, reused: false });
    expect(provider.sendButtons).toHaveBeenCalledTimes(1);
    expect(finance.createReceivablePix).not.toHaveBeenCalled();
    expect(prisma.paymentIntent.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.receivableAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate WHATSAPP_SENT audit when retrying an already audited dispatch', async () => {
    const { service, provider, prisma } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(manualChargePaymentIntent()),
          findFirst: vi.fn().mockResolvedValue({
            id: 'manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
        receivableAuditEvent: {
          findFirst: vi.fn().mockResolvedValue({ id: 'audit-event-id' }),
          create: vi.fn(),
        },
      },
    });

    await service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id');

    expect(provider.sendButtons).toHaveBeenCalledTimes(1);
    const auditFind = (prisma.receivableAuditEvent.findFirst as MockWithCalls).mock
      .calls[0]?.[0] as {
      where?: { eventType?: string; paymentIntentId?: string };
    };
    expect(auditFind?.where).toMatchObject({
      eventType: 'WHATSAPP_SENT',
      paymentIntentId: 'manual-payment-intent-id',
    });
    expect(prisma.receivableAuditEvent.create).not.toHaveBeenCalled();
  });

  it.each([
    ['CANCELADO', 'charge cancelada'],
    ['PAGO', 'charge paga'],
  ])('blocks MANUAL_CHARGE WhatsApp send when receivable is %s', async (status) => {
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(
            manualChargePaymentIntent({
              receivable: manualChargeReceivable({ status }),
            }),
          ),
          findFirst: vi.fn(),
        },
      },
    });

    await expect(
      service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id'),
    ).rejects.toThrow(ConflictException);
    expect(provider.sendButtons).not.toHaveBeenCalled();
  });

  it('blocks MANUAL_CHARGE WhatsApp send for a superseded intent', async () => {
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(
            manualChargePaymentIntent({
              status: 'SUPERSEDED',
              pixCopyPaste: 'OLD-MANUAL-PIX-CODE',
            }),
          ),
          findFirst: vi.fn(),
        },
      },
    });

    await expect(
      service.sendPixPaymentIntent('manual-payment-intent-id', 'user-id'),
    ).rejects.toThrow(ConflictException);
    expect(provider.sendButtons).not.toHaveBeenCalled();
  });

  it('sends only the active replaced MANUAL_CHARGE PIX copy code', async () => {
    const { service, provider } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      prismaOverrides: {
        paymentIntent: {
          findUnique: vi.fn().mockResolvedValue(
            manualChargePaymentIntent({
              id: 'new-manual-payment-intent-id',
              pixCopyPaste: 'NEW-MANUAL-PIX-CODE',
            }),
          ),
          findFirst: vi.fn().mockResolvedValue({
            id: 'new-manual-payment-intent-id',
            receivableId: 'manual-receivable-id',
            paymentGroupId: null,
            status: 'WAITING_PAYMENT',
            createdAt: now,
          }),
        },
      },
    });

    await service.sendPixPaymentIntent('new-manual-payment-intent-id', 'user-id');
    const sendButtonsPayload = (provider.sendButtons as MockWithCalls).mock.calls[0]?.[1] as {
      buttons: Array<{ buttonParamsJson: { copy_code: string } }>;
    };

    expect(sendButtonsPayload.buttons[0]?.buttonParamsJson.copy_code).toBe('NEW-MANUAL-PIX-CODE');
    expect(JSON.stringify((provider.sendButtons as MockWithCalls).mock.calls)).not.toContain(
      'OLD-MANUAL-PIX-CODE',
    );
  });

  it('does not emit media debug logs when the flag is false', async () => {
    const { service, normalizer } = serviceFactory({
      configOverrides: { WHATSAPP_MEDIA_DEBUG: 'false' },
    });
    const log = vi.fn();
    (service as unknown as { logger: { log: typeof log } }).logger.log = log;
    normalizer.normalize.mockReturnValue(null);

    await service.receiveWebhook(kiragoMediaPayload('imageMessage'));

    expect(log).not.toHaveBeenCalled();
  });

  it('emits redacted IMAGE media debug structure when the flag is enabled', async () => {
    const { service, normalizer } = serviceFactory({
      configOverrides: { WHATSAPP_MEDIA_DEBUG: 'true' },
    });
    const log = vi.fn();
    (service as unknown as { logger: { log: typeof log } }).logger.log = log;
    normalizer.normalize.mockReturnValue(null);

    await service.receiveWebhook(kiragoMediaPayload('imageMessage'));

    const output =
      (log as MockWithCalls).mock.calls
        .map((call) => String(call[0]))
        .find((entry) => entry.includes('[WHATSAPP_MEDIA_DEBUG]')) ?? '';
    const parsed = JSON.parse(output.replace('[WHATSAPP_MEDIA_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(output).toContain('[WHATSAPP_MEDIA_DEBUG]');
    expect(parsed).toMatchObject({
      mediaType: 'IMAGE',
      isFromMe: false,
      providerMessageId: 'provider-message-id',
      instanceName: 'CRM Principal',
      url: { present: true, type: 'string', length: 64 },
      directPath: { present: true, type: 'string', length: 34 },
      mediaKey: { present: true, type: 'string', length: 27 },
      mimetype: { present: true, type: 'string', value: 'image/jpeg' },
      fileEncSHA256: { present: true, type: 'string', length: 33 },
      fileSHA256: { present: true, type: 'string', length: 29 },
      fileLength: { present: true, type: 'number', value: 12345 },
      caption: { present: true, length: 25 },
    });
    expect(parsed.messageKeys).toEqual(['imageMessage']);
    expect(parsed.mediaKeys).toEqual([
      'Caption',
      'DirectPath',
      'FileEncSHA256',
      'FileLength',
      'FileSHA256',
      'MediaKey',
      'Mimetype',
      'URL',
      '[redacted-key]',
      'contextInfo',
      'jpegThumbnail',
    ]);
    expect(output).not.toMatch(/authorization|cookies|accessToken|token/i);
    expect(output).not.toContain('SECRET_MEDIA_KEY_FULL_VALUE');
    expect(output).not.toContain(
      'https://media.example.test/full/private/image?token=secret-token',
    );
    expect(output).not.toContain('FULL_FILE_ENC_SHA256_SECRET_VALUE');
    expect(output).not.toContain('FULL_FILE_SHA256_SECRET_VALUE');
    expect(output).not.toContain('VERY_SECRET_BASE64');
    expect(output).not.toContain('Legenda completa sensivel');
    expect(output).not.toContain('nested-secret-id');
  });

  it('emits redacted DOCUMENT media debug structure when the flag is enabled', async () => {
    const { service, normalizer } = serviceFactory({
      configOverrides: { WHATSAPP_MEDIA_DEBUG: 'true' },
    });
    const log = vi.fn();
    (service as unknown as { logger: { log: typeof log } }).logger.log = log;
    normalizer.normalize.mockReturnValue(null);

    await service.receiveWebhook(kiragoMediaPayload('documentMessage'));

    const output =
      (log as MockWithCalls).mock.calls
        .map((call) => String(call[0]))
        .find((entry) => entry.includes('[WHATSAPP_MEDIA_DEBUG]')) ?? '';
    const parsed = JSON.parse(output.replace('[WHATSAPP_MEDIA_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(parsed).toMatchObject({
      mediaType: 'DOCUMENT',
      url: { present: true, type: 'string', length: 67 },
      directPath: { present: true, type: 'string', length: 34 },
      mediaKey: { present: true, type: 'string', length: 36 },
      mimetype: { present: true, type: 'string', value: 'application/pdf' },
      fileEncSHA256: { present: true, type: 'string', length: 42 },
      fileSHA256: { present: true, type: 'string', length: 38 },
      fileLength: { present: true, type: 'string', value: '54321' },
      fileName: { present: true, extension: 'pdf', length: 26 },
      caption: { present: true, length: 27 },
    });
    expect(parsed.messageKeys).toEqual(['documentMessage']);
    expect(output).not.toMatch(/authorization|cookies|token/i);
    expect(output).not.toContain('SECRET_DOCUMENT_MEDIA_KEY_FULL_VALUE');
    expect(output).not.toContain(
      'https://media.example.test/full/private/document?token=secret-token',
    );
    expect(output).not.toContain('FULL_DOCUMENT_FILE_ENC_SHA256_SECRET_VALUE');
    expect(output).not.toContain('FULL_DOCUMENT_FILE_SHA256_SECRET_VALUE');
    expect(output).not.toContain('Contrato Super Secreto.pdf');
    expect(output).not.toContain('Texto completo do documento');
  });

  it('does not emit media debug logs for text messages', async () => {
    const { service, normalizer } = serviceFactory({
      configOverrides: { WHATSAPP_MEDIA_DEBUG: 'true' },
    });
    const log = vi.fn();
    (service as unknown as { logger: { log: typeof log } }).logger.log = log;
    normalizer.normalize.mockReturnValue(null);

    await service.receiveWebhook({
      type: 'Message',
      event: { Info: { ID: 'text-id' }, Message: { conversation: 'Texto completo' } },
    });

    expect(log).not.toHaveBeenCalled();
  });

  it('creates a pending contact from an unknown incoming webhook', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    });
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Lucas',
      messageId: 'msg-1',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Ola',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ received: true, processed: true });
    expect(prisma.whatsAppPendingContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          whatsAppConnectionId_phoneNormalized: {
            whatsAppConnectionId: connection().id,
            phoneNormalized: '5544999999999',
          },
        },
      }),
    );
  });

  it('updates the same pending contact on a second unknown message', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    });
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Lucas',
      messageId: 'msg-2',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Segunda mensagem',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    await service.receiveWebhook({ type: 'Message' });

    const upsertArgs = (prisma.whatsAppPendingContact.upsert as MockWithCalls).mock
      .calls[0]?.[0] as { update: Record<string, unknown> } | undefined;

    expect(upsertArgs?.update).toMatchObject({
      contactName: 'Lucas',
      lastMessageText: 'Segunda mensagem',
      lastMessageId: 'msg-2',
      messageCount: { increment: 1 },
    });
  });

  it('preserves waitlist contactName when an inbound webhook has no PushName', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Sem nome', {
        contactName: null,
        messageId: 'waitlist-no-push-name',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    const upsertArgs = (prisma.whatsAppPendingContact.upsert as MockWithCalls).mock
      .calls[0]?.[0] as {
      create?: Record<string, unknown>;
      update?: Record<string, unknown>;
    };

    expect(upsertArgs.create).toMatchObject({ contactName: null });
    expect(upsertArgs.update).not.toHaveProperty('contactName');
  });

  it('does not create a pending contact for an existing client webhook', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(normalizedInbound('Oi', { messageId: 'msg-client' }));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('matches GERGLAUCIO by canonical phone from a masked Kirago inbound and skips waitlist', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const gerglaucio = client({
      id: '77777777-7777-4777-8777-777777777777',
      name: 'GERGLAUCIO',
      phone: '5585999294022',
      phoneNormalized: '5585999294022',
      reference: 'GERGLAUCIO',
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(gerglaucio),
          findMany: vi.fn().mockResolvedValue([gerglaucio]),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    const result = await service.receiveWebhook({
      type: 'Message',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      isGroup: false,
      jid: {
        contact: { pn: '+55 (85) 9929-4022' },
        chat: { pn: '+55 (85) 9929-4022', raw: '558599294022@s.whatsapp.net' },
        sender: { pn: '+55 (85) 9929-4022', raw: '558599294022@s.whatsapp.net' },
      },
      event: {
        Info: {
          ID: 'gerglaucio-msg-1',
          PushName: 'Glaucio',
          Timestamp: 1789088400,
          IsFromMe: false,
          IsGroup: false,
          SenderAlt: '+55 (85) 9929-4022',
          Chat: '558599294022@s.whatsapp.net',
          Sender: '558599294022@s.whatsapp.net',
          Type: 'text',
        },
        Message: { conversation: 'Está assim desde ontem.' },
      },
    });
    const inboundCreateArgs = (prisma.whatsAppInboundMessage.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: { clientId?: string | null; phoneNormalized?: string | null } };

    expect(result).toMatchObject({ action: 'client_exists', inboundMessageId: 'inbound-id' });
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: '5585999294022' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(inboundCreateArgs.data).toMatchObject({
      whatsAppConnectionId: connection().id,
      clientId: gerglaucio.id,
      providerMessageId: 'gerglaucio-msg-1',
      phoneNormalized: '5585999294022',
    });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('matches ROD by controlled legacy mobile variant and skips waitlist', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const rod = client({
      id: '88888888-8888-4888-8888-888888888888',
      name: 'ROD',
      phone: '5591984805831',
      phoneNormalized: '5591984805831',
      reference: 'ROD',
    });
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([rod]);
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(rod),
          findMany,
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    const result = await service.receiveWebhook({
      type: 'Message',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      isGroup: false,
      jid: {
        contact: { pn: '+55 (91) 8480-5831' },
        chat: { pn: '+55 (91) 8480-5831', raw: '559184805831@s.whatsapp.net' },
        sender: { pn: '+55 (91) 8480-5831', raw: '559184805831@s.whatsapp.net' },
      },
      event: {
        Info: {
          ID: 'rod-msg-1',
          PushName: 'Rod',
          Timestamp: 1789088400,
          IsFromMe: false,
          IsGroup: false,
          SenderAlt: '+55 (91) 8480-5831',
          Chat: '559184805831@s.whatsapp.net',
          Sender: '559184805831@s.whatsapp.net',
          Type: 'text',
        },
        Message: { conversation: 'Oi' },
      },
    });
    const inboundCreateArgs = (prisma.whatsAppInboundMessage.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: { clientId?: string | null; phoneNormalized?: string | null } };

    expect(result).toMatchObject({ action: 'client_exists', inboundMessageId: 'inbound-id' });
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { phoneNormalized: '559184805831' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { phoneNormalized: '5591984805831' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(inboundCreateArgs.data).toMatchObject({
      clientId: rod.id,
      phoneNormalized: '559184805831',
    });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('matches BG/Tati by phone variant even when names differ', async () => {
    const tati = client({
      id: '12121212-1212-4121-8121-121212121212',
      name: 'Tati',
      phoneNormalized: '5551984629666',
      reference: 'TATI',
    });
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([tati]);
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(tati),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '555184629666',
        contactName: 'BG',
        messageId: 'bg-msg-1',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { phoneNormalized: '5551984629666' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('keeps exact phone match priority over a possible legacy mobile variant', async () => {
    const exactClient = client({
      id: '13131313-1313-4131-8131-131313131313',
      phoneNormalized: '559184805831',
    });
    const findMany = vi.fn().mockResolvedValue([exactClient]);
    const { service, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(exactClient),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '559184805831',
        messageId: 'exact-priority-msg',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: '559184805831' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
  });

  it('does not generate a mobile variant for a Brazilian fixed line', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '558532324022',
        contactName: 'Empresa',
        messageId: 'fixed-line-msg',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'pending_contact_upserted' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: '558532324022' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(prisma.whatsAppPendingContact.upsert).toHaveBeenCalled();
  });

  it('does not generate another 9 for a modern mobile number', async () => {
    const modernClient = client({ phoneNormalized: '5591984805831' });
    const findMany = vi.fn().mockResolvedValue([modernClient]);
    const { service, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(modernClient),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '5591984805831',
        messageId: 'modern-mobile-msg',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps waitlist behavior when a legacy mobile variant has no client', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '559184805831',
        messageId: 'legacy-unknown-msg',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'pending_contact_upserted' });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { phoneNormalized: '5591984805831' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(prisma.whatsAppPendingContact.upsert).toHaveBeenCalled();
  });

  it('does not choose automatically when the legacy mobile variant is ambiguous', async () => {
    const firstClient = client({
      id: '14141414-1414-4141-8141-141414141414',
      phoneNormalized: '5591984805831',
    });
    const secondClient = client({
      id: '15151515-1515-4151-8151-151515151515',
      phoneNormalized: '5591984805831',
      reference: 'CLI-2',
    });
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([firstClient, secondClient]);
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(firstClient),
          findMany,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '559184805831',
        messageId: 'legacy-ambiguous-msg',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'ambiguous_client_phone', clientMatches: 2 });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('matches by exact phone even when the inbound name differs from the client name', async () => {
    const knownClient = client({ name: 'GERGLAUCIO', phoneNormalized: '5585999294022' });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(knownClient),
          findMany: vi.fn().mockResolvedValue([knownClient]),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '5585999294022',
        contactName: 'Glaucio',
        messageId: 'msg-name-diff-phone-match',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('does not match by similar name when the inbound phone belongs to nobody', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        phone: '5585888888888',
        contactName: 'GERGLAUCIO',
        messageId: 'msg-name-only',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'pending_contact_upserted' });
    expect(prisma.client.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: '5585888888888' },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    expect(prisma.whatsAppPendingContact.upsert).toHaveBeenCalled();
  });

  it.each(['sim', 'nao', 'quero saber o valor'])(
    'records known client inbound "%s" without billing decisions or financial effects',
    async (text) => {
      const { service, prisma, finance, normalizer, txClientReferenceUpdate, txReceivableUpdate } =
        serviceFactory();
      normalizer.normalize.mockReturnValue(normalizedInbound(text));

      const result = await service.receiveWebhook({ type: 'Message' });
      const inboundCreateArgs = (prisma.whatsAppInboundMessage.create as MockWithCalls).mock
        .calls[0]?.[0] as { data?: { clientId?: string | null; text?: string | null } };

      expect(result).toMatchObject({ action: 'client_exists', inboundMessageId: 'inbound-id' });
      expect(inboundCreateArgs.data).toMatchObject({ clientId: client().id, text });
      expect(prisma.billingResponse.create).not.toHaveBeenCalled();
      expect(prisma.billingResponse.update).not.toHaveBeenCalled();
      expect(prisma.billingResponse.upsert).not.toHaveBeenCalled();
      expect(txReceivableUpdate).not.toHaveBeenCalled();
      expect(txClientReferenceUpdate).not.toHaveBeenCalled();
      expect(finance.createReceivablePix).not.toHaveBeenCalled();
    },
  );

  it('does not choose a client automatically when an incoming phone is ambiguous', async () => {
    const otherClient = {
      ...client(),
      id: '99999999-9999-4999-8999-999999999999',
      name: 'Outro Cliente',
      reference: 'CLI-2',
    };
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(client()),
          findMany: vi.fn().mockResolvedValue([client(), otherClient]),
        },
      },
    });
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-ambiguous',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'ambiguous_client_phone', clientMatches: 2 });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('keeps current behavior and associates inbound when the only phone match is canceled', async () => {
    const canceledClient = client({ status: 'CANCELADO' });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(canceledClient),
          findMany: vi.fn().mockResolvedValue([canceledClient]),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', { messageId: 'msg-canceled-client' }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('accepts irrelevant events and messages without a valid phone without side effects', async () => {
    const ignoredEvent = serviceFactory();
    ignoredEvent.normalizer.normalize.mockReturnValue(null);

    await expect(ignoredEvent.service.receiveWebhook({ type: 'Status' })).resolves.toEqual({
      received: true,
      processed: false,
      reason: 'ignored_event',
    });
    expect(ignoredEvent.prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();

    const missingPhone = serviceFactory();
    missingPhone.normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: null,
      contactName: 'Lucas',
      messageId: 'msg-without-phone',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    await expect(missingPhone.service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'missing_phone',
    });
    expect(missingPhone.prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
  });

  it('emits inbound recording_audio presence for real private ChatPresence audio', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(conversation()),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedChatPresence());

    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_recording_audio',
    });

    expect(prisma.whatsAppConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          whatsAppConnectionId: connection().id,
          phoneNormalized: { in: expect.arrayContaining(['5544999999999']) },
        }),
      }),
    );
    expect(realtime.emitConversationPresence).toHaveBeenCalledWith(
      conversation().id,
      'recording_audio',
    );
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
  });

  it('emits inbound typing presence for real private ChatPresence text', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(conversation()),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedChatPresence({ media: null }));

    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_typing',
    });

    expect(realtime.emitConversationPresence).toHaveBeenCalledWith(conversation().id, 'typing');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  it('resolves LID-only text ChatPresence from a normal message seen in the same connection', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const { service, prisma, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await service.receiveWebhook({
      type: 'Message',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      isGroup: false,
      jid: {
        contact: { lid: '123456789012345@lid', pn: '+55 (44) 99999-9999' },
        chat: { lid: '123456789012345@lid', pn: '+55 (44) 99999-9999' },
        sender: { lid: '123456789012345@lid', pn: '+55 (44) 99999-9999' },
      },
      event: {
        Info: {
          ID: 'lid-normal-message-1',
          PushName: 'Cliente LID',
          Timestamp: 1789088400,
          IsFromMe: false,
          IsGroup: false,
          SenderAlt: '+55 (44) 99999-9999',
          Chat: '123456789012345@lid',
          Sender: '123456789012345@lid',
          Type: 'text',
        },
        Message: { conversation: 'Mensagem normal com LID' },
      },
    });
    const messageCreateArgs = (prisma.whatsAppMessage.create as MockWithCalls).mock
      .calls[0]?.[0] as {
      data?: { rawMetadata?: unknown };
    };

    expect(messageCreateArgs.data?.rawMetadata).toMatchObject({
      providerJids: { lids: ['123456789012345@lid'] },
    });

    await expect(
      service.receiveWebhook({
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          Chat: '123456789012345@lid',
          Sender: '123456789012345@lid',
          SenderAlt: '',
          RecipientAlt: '',
          IsFromMe: false,
          IsGroup: false,
          State: 'composing',
          Media: '',
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_typing',
    });

    expect(realtime.emitConversationPresence).toHaveBeenLastCalledWith(conversation().id, 'typing');
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
  });

  it('merges provider LIDs into existing rawMetadata without overwriting manual metadata', () => {
    const { service } = serviceFactory();
    const privateService = service as unknown as {
      reconciledRawMetadataUpdate: (
        current: Prisma.JsonValue | null,
        normalized: ReturnType<typeof normalizedInbound>,
      ) => { rawMetadata?: Record<string, unknown> };
    };

    const result = privateService.reconciledRawMetadataUpdate(
      {
        source: 'manual_outbound_media_send',
        localMedia: { storageKey: 'local-key', mimeType: 'image/jpeg' },
        replyContext: { providerMessageId: 'quoted-message-id', quotedText: 'texto citado' },
        mediaDownload: { provider: 'KIRAGO', status: 'ready' },
        providerJids: { lids: ['old-lid@lid'], source: 'previous' },
      },
      normalizedInbound('Mensagem reconciliada', {
        providerJids: { lids: ['NEW-LID@LID', 'old-lid@lid'] },
        mediaDownloadMetadata: { provider: 'KIRAGO', status: 'new-ignored' },
      }),
    );

    expect(result.rawMetadata).toMatchObject({
      source: 'manual_outbound_media_send',
      localMedia: { storageKey: 'local-key', mimeType: 'image/jpeg' },
      replyContext: { providerMessageId: 'quoted-message-id', quotedText: 'texto citado' },
      mediaDownload: { provider: 'KIRAGO', status: 'ready' },
      providerJids: {
        source: 'previous',
        lids: ['old-lid@lid', 'new-lid@lid'],
      },
    });
  });

  it('does not resolve LID presence across another WhatsApp connection', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const otherConnection = connection({
      id: '22222222-2222-4222-8222-222222222222',
      providerUserId: 'kirago-user-2',
    });
    const { service, prisma, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await service.receiveWebhook({
      type: 'Message',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      isGroup: false,
      jid: {
        contact: { lid: '987654321@lid', pn: '+55 (44) 99999-9999' },
        chat: { lid: '987654321@lid', pn: '+55 (44) 99999-9999' },
        sender: { lid: '987654321@lid', pn: '+55 (44) 99999-9999' },
      },
      event: {
        Info: {
          ID: 'lid-normal-message-2',
          PushName: 'Cliente LID',
          Timestamp: 1789088400,
          IsFromMe: false,
          IsGroup: false,
          SenderAlt: '+55 (44) 99999-9999',
          Chat: '987654321@lid',
          Sender: '987654321@lid',
          Type: 'text',
        },
        Message: { conversation: 'Mensagem normal com LID' },
      },
    });

    vi.mocked(prisma.whatsAppConnection.findFirst).mockResolvedValue(otherConnection);
    vi.mocked(realtime.emitConversationPresence).mockClear();

    await expect(
      service.receiveWebhook({
        type: 'ChatPresence',
        instanceName: 'CRM Outra',
        userID: 'kirago-user-2',
        event: {
          Chat: '987654321@lid',
          Sender: '987654321@lid',
          SenderAlt: '',
          RecipientAlt: '',
          IsFromMe: false,
          IsGroup: false,
          State: 'composing',
          Media: '',
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'presence_conversation_not_found',
    });

    expect(realtime.emitConversationPresence).not.toHaveBeenCalled();
  });

  it('safely ignores unknown LID-only ChatPresence without creating records', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const { service, prisma, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await expect(
      service.receiveWebhook({
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          Chat: 'unknown-lid@lid',
          Sender: 'unknown-lid@lid',
          SenderAlt: '',
          RecipientAlt: '',
          IsFromMe: false,
          IsGroup: false,
          State: 'composing',
          Media: '',
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'presence_conversation_not_found',
    });

    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'KIRAGO',
          whatsAppConnectionId: connection().id,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          conversationId: true,
          rawMetadata: true,
        },
      }),
    );
    expect(realtime.emitConversationPresence).not.toHaveBeenCalled();
  });

  it('resolves fallback LID only from complete private inbound metadata in the current connection', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const fallbackConversation = conversation({ id: 'fallback-conversation-id' });
    const { service, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([
            conversationMessage({
              conversationId: 'outbound-wrong-conversation-id',
              rawMetadata: {
                isFromMe: true,
                isGroup: false,
                providerJids: { lids: ['123456789012345@lid'] },
              },
            }),
            conversationMessage({
              conversationId: 'group-wrong-conversation-id',
              rawMetadata: {
                isFromMe: false,
                isGroup: true,
                providerJids: { lids: ['123456789012345@lid'] },
              },
            }),
            conversationMessage({
              conversationId: 'substring-wrong-conversation-id',
              rawMetadata: {
                isFromMe: false,
                isGroup: false,
                providerJids: { lids: ['x123456789012345@lid'] },
              },
            }),
            conversationMessage({
              conversationId: fallbackConversation.id,
              rawMetadata: {
                isFromMe: false,
                isGroup: false,
                providerJids: { lids: ['123456789012345@lid'] },
              },
            }),
          ]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await expect(
      service.receiveWebhook({
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          Chat: ' 123456789012345@LID ',
          Sender: ' 123456789012345@LID ',
          SenderAlt: '',
          RecipientAlt: '',
          IsFromMe: false,
          IsGroup: false,
          State: 'composing',
          Media: '',
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_typing',
    });

    expect(realtime.emitConversationPresence).toHaveBeenCalledWith(
      fallbackConversation.id,
      'typing',
    );
  });

  it('resolves LID-only ChatPresence through the provider user lid endpoint on cache miss', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const candidateConversation = conversation({ id: 'lid-endpoint-conversation-id' });
    const resolveUserLid = vi
      .fn()
      .mockResolvedValue({ jid: '5544999999999@s.whatsapp.net', lid: '123456789012345@lid' });
    const { service, prisma, provider, normalizer, realtime } = serviceFactory({
      providerOverrides: { resolveUserLid },
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([candidateConversation]),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await expect(
      service.receiveWebhook({
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          Chat: '123456789012345@lid',
          Sender: '123456789012345@lid',
          SenderAlt: '',
          RecipientAlt: '',
          IsFromMe: false,
          IsGroup: false,
          State: 'composing',
          Media: '',
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_typing',
    });

    expect(prisma.whatsAppConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'KIRAGO',
          whatsAppConnectionId: connection().id,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, phoneNormalized: true },
      }),
    );
    expect(provider.resolveUserLid).toHaveBeenCalledWith('instance-token', '5544999999999');
    expect(realtime.emitConversationPresence).toHaveBeenCalledWith(
      candidateConversation.id,
      'typing',
    );
  });

  it('requires exact LID match and stops provider lookup at the first matching candidate', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const firstCandidate = conversation({
      id: 'substring-candidate-id',
      phone: '5544111111111',
      phoneNormalized: '5544111111111',
    });
    const secondCandidate = conversation({
      id: 'exact-candidate-id',
      phone: '5544222222222',
      phoneNormalized: '5544222222222',
    });
    const resolveUserLid = vi
      .fn()
      .mockResolvedValueOnce({ lid: 'x123456789012345@lid' })
      .mockResolvedValueOnce({ lid: '123456789012345@lid' });
    const { service, provider, normalizer, realtime } = serviceFactory({
      providerOverrides: { resolveUserLid },
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([firstCandidate, secondCandidate]),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    await service.receiveWebhook({
      type: 'ChatPresence',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      event: {
        Chat: '123456789012345@lid',
        Sender: '123456789012345@lid',
        SenderAlt: '',
        RecipientAlt: '',
        IsFromMe: false,
        IsGroup: false,
        State: 'composing',
        Media: '',
      },
    });

    expect(provider.resolveUserLid).toHaveBeenCalledTimes(2);
    expect(realtime.emitConversationPresence).toHaveBeenCalledWith(secondCandidate.id, 'typing');
  });

  it('keeps LID provider lookup failures best effort without emitting presence', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();

    for (const error of [
      new KiragoProviderError(
        'KIRAGO_INSTANCE_AUTH_FAILED',
        'Falha de autenticacao da instancia Kirago.',
        401,
      ),
      new KiragoProviderError('KIRAGO_TIMEOUT', 'Tempo limite da Kirago excedido.'),
    ]) {
      const resolveUserLid = vi.fn().mockRejectedValue(error);
      const { service, normalizer, realtime } = serviceFactory({
        providerOverrides: { resolveUserLid },
        prismaOverrides: {
          whatsAppConversation: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([conversation()]),
            create: vi.fn(),
            update: vi.fn(),
          },
          whatsAppMessage: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn(),
            update: vi.fn().mockResolvedValue(conversationMessage()),
            findFirst: vi.fn().mockResolvedValue(null),
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(conversationMessage()),
            findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        },
      });
      normalizer.normalize.mockImplementation((payloadValue: unknown) =>
        realNormalizer.normalize(payloadValue, now),
      );

      await expect(
        service.receiveWebhook({
          type: 'ChatPresence',
          instanceName: 'CRM Principal',
          userID: 'kirago-user',
          event: {
            Chat: '123456789012345@lid',
            Sender: '123456789012345@lid',
            SenderAlt: '',
            RecipientAlt: '',
            IsFromMe: false,
            IsGroup: false,
            State: 'composing',
            Media: '',
          },
        }),
      ).resolves.toMatchObject({
        received: true,
        processed: false,
        reason: 'presence_conversation_not_found',
      });

      expect(realtime.emitConversationPresence).not.toHaveBeenCalled();
    }
  });

  it('treats not found LID lookup as safe ignore and caches successful lookup to avoid a second call', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const resolveUserLid = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ lid: '123456789012345@lid' });
    const { service, normalizer, realtime } = serviceFactory({
      providerOverrides: { resolveUserLid },
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              conversation({ id: 'not-found-conversation-id', phoneNormalized: '5544111111111' }),
              conversation({ id: 'cached-conversation-id', phoneNormalized: '5544222222222' }),
            ]),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );

    const payload = {
      type: 'ChatPresence',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      event: {
        Chat: '123456789012345@lid',
        Sender: '123456789012345@lid',
        SenderAlt: '',
        RecipientAlt: '',
        IsFromMe: false,
        IsGroup: false,
        State: 'composing',
        Media: '',
      },
    };

    await service.receiveWebhook(payload);
    await service.receiveWebhook(payload);

    expect(resolveUserLid).toHaveBeenCalledTimes(2);
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      1,
      'cached-conversation-id',
      'typing',
    );
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      2,
      'cached-conversation-id',
      'typing',
    );
  });

  it('dedupes concurrent LID-only ChatPresence provider lookups for the same connection and LID', async () => {
    const realNormalizer = new KiragoWebhookNormalizer();
    const candidateConversation = conversation({ id: 'deduped-conversation-id' });
    let resolveLookup:
      | ((value: { jid: string; lid: string } | PromiseLike<{ jid: string; lid: string }>) => void)
      | undefined;
    const lookupResult = new Promise<{ jid: string; lid: string }>((resolve) => {
      resolveLookup = resolve;
    });
    const resolveUserLid = vi.fn().mockReturnValue(lookupResult);
    const { service, provider, normalizer, realtime } = serviceFactory({
      providerOverrides: { resolveUserLid },
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([candidateConversation]),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValue(null),
          count: vi.fn().mockResolvedValue(0),
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findUniqueOrThrow: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockImplementation((payloadValue: unknown) =>
      realNormalizer.normalize(payloadValue, now),
    );
    const payload = {
      type: 'ChatPresence',
      instanceName: 'CRM Principal',
      userID: 'kirago-user',
      event: {
        Chat: '123456789012345@lid',
        Sender: '123456789012345@lid',
        SenderAlt: '',
        RecipientAlt: '',
        IsFromMe: false,
        IsGroup: false,
        State: 'composing',
        Media: '',
      },
    };

    const first = service.receiveWebhook(payload);
    const second = service.receiveWebhook(payload);

    await vi.waitFor(() => {
      expect(provider.resolveUserLid).toHaveBeenCalledTimes(1);
    });
    resolveLookup?.({
      jid: '5544999999999@s.whatsapp.net',
      lid: '123456789012345@lid',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ processed: true, action: 'presence_typing' }),
      expect.objectContaining({ processed: true, action: 'presence_typing' }),
    ]);
    expect(realtime.emitConversationPresence).toHaveBeenCalledTimes(2);
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      1,
      candidateConversation.id,
      'typing',
    );
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      2,
      candidateConversation.id,
      'typing',
    );
  });

  it('clears inbound ChatPresence on paused and keeps isolated paused idempotent', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(conversation()),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedChatPresence({
        state: 'paused',
        media: null,
      }),
    );

    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_cleared',
    });
    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'presence_cleared',
    });

    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(1, conversation().id, null);
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(2, conversation().id, null);
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
  });

  it('keeps duplicate composing presence idempotent without persistence side effects', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(conversation()),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedChatPresence());

    await service.receiveWebhook({ type: 'ChatPresence' });
    await service.receiveWebhook({ type: 'ChatPresence' });

    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      1,
      conversation().id,
      'recording_audio',
    );
    expect(realtime.emitConversationPresence).toHaveBeenNthCalledWith(
      2,
      conversation().id,
      'recording_audio',
    );
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
  });

  it('ignores self, group, unsupported media and unknown ChatPresence states safely', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory();
    normalizer.normalize
      .mockReturnValueOnce(normalizedChatPresence({ isFromMe: true }))
      .mockReturnValueOnce(normalizedChatPresence({ isGroup: true }))
      .mockReturnValueOnce(normalizedChatPresence({ media: 'video' }))
      .mockReturnValueOnce(normalizedChatPresence({ state: 'available', media: null }));

    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      processed: false,
      reason: 'ignored_self_presence',
    });
    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      processed: false,
      reason: 'ignored_group_presence',
    });
    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      processed: false,
      reason: 'unsupported_presence_media',
    });
    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      processed: false,
      reason: 'unsupported_presence_state',
    });

    expect(prisma.whatsAppConnection.findFirst).not.toHaveBeenCalled();
    expect(realtime.emitConversationPresence).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
  });

  it('does not create conversations or messages when ChatPresence conversation is not found', async () => {
    const { service, normalizer, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedChatPresence());

    await expect(service.receiveWebhook({ type: 'ChatPresence' })).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'presence_conversation_not_found',
    });

    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(realtime.emitConversationPresence).not.toHaveBeenCalled();
  });

  it('keeps ReadReceipt, reaction and normal text messages on their existing paths', async () => {
    const { service, normalizer } = serviceFactory();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    normalizer.normalize.mockReturnValueOnce(normalizedReceipt());
    await service.receiveWebhook({ type: 'ReadReceipt', state: 'Read' });

    normalizer.normalize.mockReturnValueOnce(
      normalizedInbound('', {
        messageId: 'reaction-event-id',
        messageType: 'reaction',
        text: null,
      }),
    );
    await service.receiveWebhook({
      type: 'Message',
      event: {
        Info: { ID: 'reaction-event-id', Type: 'reaction', IsFromMe: false },
        Message: {
          reactionMessage: {
            text: '❤️',
            key: { ID: 'missing-target-id', remoteJid: '5511999999999@s.whatsapp.net' },
          },
        },
      },
    });

    normalizer.normalize.mockReturnValueOnce(normalizedInbound('Ola'));
    await service.receiveWebhook({ type: 'Message' });

    normalizer.normalize.mockReturnValueOnce(null);
    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: { ID: 'raw-reaction-event-id', Type: 'reaction', IsFromMe: false },
          Message: {
            reactionMessage: {
              text: 'ok',
              key: { ID: 'target-id', remoteJid: '5511999999999@s.whatsapp.net' },
            },
          },
        },
      }),
    ).resolves.toEqual({
      received: true,
      processed: false,
      reason: 'ignored_event',
    });

    log.mockRestore();
  });

  it('persists contact inbound reaction from the confirmed Kirago reactionMessage shape', async () => {
    const target = conversationMessage({ providerMessageId: 'target-provider-message-id' });
    const updated = conversationMessage({
      ...target,
      reactions: [
        {
          id: 'reaction-id',
          messageId: target.id,
          whatsAppConnectionId: target.whatsAppConnectionId,
          provider: 'KIRAGO',
          emoji: '❤️',
          reactorKey: 'contact',
          isFromMe: false,
          providerReactionId: 'reaction-event-id',
          participant: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const { service, prisma, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
          findUnique: vi.fn().mockResolvedValue(updated),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(target),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        phone: null,
        messageId: 'reaction-event-id',
        messageType: 'reaction',
        text: null,
      }),
    );

    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: {
            ID: 'reaction-event-id',
            Type: 'reaction',
            IsFromMe: false,
            Chat: '999999999999999@lid',
            Sender: '888888888888888@lid',
          },
          Message: {
            reactionMessage: {
              key: {
                ID: 'target-provider-message-id',
                fromMe: false,
                remoteJID: '999999999999999@lid',
              },
              senderTimestampMS: '1760055000000',
              text: '❤️',
            },
          },
        },
      }),
    ).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'reaction_upserted',
      message: expect.objectContaining({
        reactions: [
          expect.objectContaining({ emoji: '❤️', reactorKey: 'contact', isFromMe: false }),
        ],
      }),
    });

    expect(prisma.whatsAppMessage.findFirst).toHaveBeenCalledWith({
      where: {
        provider: 'KIRAGO',
        whatsAppConnectionId: connection().id,
        providerMessageId: 'target-provider-message-id',
      },
      include: expect.any(Object),
    });
    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledWith({
      where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'contact' } },
      create: {
        messageId: target.id,
        whatsAppConnectionId: target.whatsAppConnectionId,
        provider: 'KIRAGO',
        emoji: '❤️',
        reactorKey: 'contact',
        isFromMe: false,
        providerReactionId: 'reaction-event-id',
        participant: null,
      },
      update: {
        emoji: '❤️',
        isFromMe: false,
        providerReactionId: 'reaction-event-id',
        participant: null,
      },
    });
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(target.conversationId, target.id);
  });

  it.each([
    ['IMAGE target', { type: 'IMAGE', text: null, mediaMimeType: 'image/jpeg' }],
    ['VIDEO target', { type: 'VIDEO', text: null, mediaMimeType: 'video/mp4' }],
    [
      'reply target',
      {
        type: 'TEXT',
        replyToMessageId: '77777777-7777-4777-8777-777777777777',
        replyToProviderMessageId: 'quoted-provider-id',
        quotedText: 'Mensagem citada',
      },
    ],
  ])(
    'persists contact reactions for %s without depending on message text',
    async (_name, targetData) => {
      const target = conversationMessage({
        ...targetData,
        providerMessageId: 'target-provider-message-id',
      });
      const { service, prisma, normalizer } = serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(target),
            findUniqueOrThrow: vi.fn().mockResolvedValue(
              conversationMessage({
                ...target,
                reactions: [
                  {
                    id: 'reaction-id',
                    messageId: target.id,
                    whatsAppConnectionId: target.whatsAppConnectionId,
                    provider: 'KIRAGO',
                    emoji: '❤️',
                    reactorKey: 'contact',
                    isFromMe: false,
                    providerReactionId: 'reaction-event-id',
                    participant: null,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
              }),
            ),
            findUnique: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
          },
        },
      });
      normalizer.normalize.mockReturnValue(
        normalizedInbound('', {
          messageId: 'reaction-event-id',
          messageType: 'reaction',
          text: null,
        }),
      );

      await expect(
        service.receiveWebhook({
          type: 'Message',
          event: {
            Info: { ID: 'reaction-event-id', Type: 'reaction', IsFromMe: false },
            Message: {
              reactionMessage: {
                key: {
                  ID: 'target-provider-message-id',
                  fromMe: false,
                  remoteJID: '999999999999999@lid',
                },
                senderTimestampMS: '1760055000000',
                text: '❤️',
              },
            },
          },
        }),
      ).resolves.toMatchObject({ processed: true, action: 'reaction_upserted' });

      expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'contact' } },
        }),
      );
    },
  );

  it('changes the same contact reaction when Kirago sends a new providerReactionId', async () => {
    const target = conversationMessage({ providerMessageId: 'target-provider-message-id' });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue(
            conversationMessage({
              ...target,
              reactions: [
                {
                  id: 'reaction-id',
                  messageId: target.id,
                  whatsAppConnectionId: target.whatsAppConnectionId,
                  provider: 'KIRAGO',
                  emoji: '😂',
                  reactorKey: 'contact',
                  isFromMe: false,
                  providerReactionId: 'reaction-event-b',
                  participant: null,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
            }),
          ),
          findUnique: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', { messageId: 'reaction-event-b', messageType: 'reaction', text: null }),
    );

    await service.receiveWebhook({
      type: 'Message',
      event: {
        Info: { ID: 'reaction-event-b', Type: 'reaction', IsFromMe: false },
        Message: {
          reactionMessage: {
            key: { ID: 'target-provider-message-id', fromMe: false, remoteJID: '999@lid' },
            senderTimestampMS: '1760055000001',
            text: '😂',
          },
        },
      },
    });

    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'contact' } },
        update: expect.objectContaining({
          emoji: '😂',
          providerReactionId: 'reaction-event-b',
        }),
      }),
    );
  });

  it('removes only the contact reaction by target message and reactor key', async () => {
    const target = conversationMessage({ providerMessageId: 'target-provider-message-id' });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue(conversationMessage({ ...target, reactions: [] })),
          findUnique: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', { messageId: 'remove-event-id', messageType: 'reaction', text: null }),
    );

    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: { ID: 'remove-event-id', Type: 'reaction', IsFromMe: false },
          Message: {
            reactionMessage: {
              key: { ID: 'target-provider-message-id', fromMe: false, remoteJID: '999@lid' },
              senderTimestampMS: '1760055000002',
              text: '',
              remove: true,
            },
          },
        },
      }),
    ).resolves.toMatchObject({ processed: true, action: 'reaction_removed' });

    expect(prisma.whatsAppMessageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: target.id, reactorKey: 'contact' },
    });
    expect(prisma.whatsAppMessageReaction.upsert).not.toHaveBeenCalled();
  });

  it('keeps duplicate add, change and remove deliveries idempotent', async () => {
    const target = conversationMessage({ providerMessageId: 'target-provider-message-id' });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue(target),
          findUnique: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: 'reaction-event-id',
        messageType: 'reaction',
        text: null,
      }),
    );
    const addPayload = {
      type: 'Message',
      event: {
        Info: { ID: 'reaction-event-id', Type: 'reaction', IsFromMe: false },
        Message: {
          reactionMessage: {
            key: { ID: 'target-provider-message-id', fromMe: false, remoteJID: '999@lid' },
            senderTimestampMS: '1760055000000',
            text: '❤️',
          },
        },
      },
    };

    await service.receiveWebhook(addPayload);
    await service.receiveWebhook(addPayload);

    normalizer.normalize.mockReturnValue(
      normalizedInbound('', { messageId: 'change-event-id', messageType: 'reaction', text: null }),
    );
    const changePayload = {
      type: 'Message',
      event: {
        Info: { ID: 'change-event-id', Type: 'reaction', IsFromMe: false },
        Message: {
          reactionMessage: {
            key: { ID: 'target-provider-message-id', fromMe: false, remoteJID: '999@lid' },
            senderTimestampMS: '1760055000001',
            text: '😂',
          },
        },
      },
    };

    await service.receiveWebhook(changePayload);
    await service.receiveWebhook(changePayload);

    normalizer.normalize.mockReturnValue(
      normalizedInbound('', { messageId: 'remove-event-id', messageType: 'reaction', text: null }),
    );
    const removePayload = {
      type: 'Message',
      event: {
        Info: { ID: 'remove-event-id', Type: 'reaction', IsFromMe: false },
        Message: {
          reactionMessage: {
            key: { ID: 'target-provider-message-id', fromMe: false, remoteJID: '999@lid' },
            senderTimestampMS: '1760055000002',
            text: '',
            remove: true,
          },
        },
      },
    };

    await service.receiveWebhook(removePayload);
    await service.receiveWebhook(removePayload);

    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledTimes(4);
    expect(prisma.whatsAppMessageReaction.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'contact' } },
        update: expect.objectContaining({
          emoji: '😂',
          providerReactionId: 'change-event-id',
        }),
      }),
    );
  });

  it('ignores unknown targets and self reaction echoes without creating messages or contact reactions', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: 'reaction-event-id',
        messageType: 'reaction',
        text: null,
      }),
    );

    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: { ID: 'reaction-event-id', Type: 'reaction', IsFromMe: false },
          Message: {
            reactionMessage: {
              key: { ID: 'missing-target-id', fromMe: false, remoteJID: '999@lid' },
              senderTimestampMS: '1760055000000',
              text: '❤️',
            },
          },
        },
      }),
    ).resolves.toMatchObject({ processed: false, reason: 'reaction_target_not_found' });

    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: 'self-reaction-event-id',
        messageType: 'reaction',
        text: null,
        direction: 'OUTGOING',
      }),
    );

    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: { ID: 'self-reaction-event-id', Type: 'reaction', IsFromMe: true },
          Message: {
            reactionMessage: {
              key: { ID: 'target-provider-message-id', fromMe: true, remoteJID: '999@lid' },
              senderTimestampMS: '1760055000000',
              text: '❤️',
            },
          },
        },
      }),
    ).resolves.toMatchObject({ processed: false, reason: 'reaction_ignored_self' });

    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessageReaction.upsert).not.toHaveBeenCalled();
  });

  it('keeps normal inbound Message webhooks on the existing persistence path', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    normalizer.normalize.mockReturnValue(normalizedInbound('Mensagem normal'));

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      action: 'client_exists',
      conversation: expect.objectContaining({ action: 'conversation_message_persisted' }),
    });

    expect(prisma.whatsAppInboundMessage.create).toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).toHaveBeenCalled();
    expect(log.mock.calls.some((call) => String(call[0]).includes('reaction_processed'))).toBe(
      false,
    );
    log.mockRestore();
  });

  it('keeps ReadReceipt webhooks out of the reaction parser', async () => {
    const { service, normalizer } = serviceFactory();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    normalizer.normalize.mockReturnValue(normalizedReceipt());

    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(log.mock.calls.some((call) => String(call[0]).includes('reaction_processed'))).toBe(
      false,
    );
    log.mockRestore();
  });

  it('does not throw or create messages when reaction target fields are absent', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        phone: null,
        messageId: null,
        messageType: 'reaction',
        text: null,
      }),
    );

    await expect(
      service.receiveWebhook({
        type: 'Message',
        event: {
          Info: { Type: 'reaction' },
          Message: { reactionMessage: {} },
        },
      }),
    ).resolves.toMatchObject({ processed: false, reason: 'reaction_target_not_found' });

    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('updates outbound messages to DELIVERED from Kirago ReadReceipt', async () => {
    const receiptAt = new Date('2026-10-08T21:21:18.000Z');
    const editedAt = new Date('2026-10-08T20:00:00.000Z');
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-message-id',
      status: 'SENT',
      editedAt,
    });
    const { service, normalizer, prisma, realtime } = serviceFactory();
    normalizer.normalize.mockReturnValue(normalizedReceipt({ timestamp: receiptAt }));
    prisma.whatsAppMessage.findMany.mockResolvedValue([existing]);

    await expect(service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: true,
      action: 'receipt_status_updated',
      updatedCount: 1,
    });

    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
      where: {
        provider: 'KIRAGO',
        whatsAppConnectionId: connection().id,
        providerMessageId: { in: ['provider-message-id'] },
        direction: 'OUTBOUND',
      },
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { status: 'DELIVERED', deliveredAt: receiptAt },
    });
    expect(existing.editedAt).toBe(editedAt);
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(existing.conversationId, existing.id);
  });

  it('updates outbound messages to READ without inventing deliveredAt', async () => {
    const readAt = new Date('2026-10-08T21:25:00.000Z');
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-message-id',
      status: 'SENT',
    });
    const { service, normalizer, prisma, realtime } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedReceipt({ state: 'READ', rawState: 'Read', timestamp: readAt }),
    );
    prisma.whatsAppMessage.findMany.mockResolvedValue([existing]);

    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { status: 'READ', readAt },
    });
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(existing.conversationId, existing.id);
  });

  it('processes and deduplicates receipt arrays with multiple provider ids', async () => {
    const receiptAt = new Date('2026-10-08T21:21:18.000Z');
    const first = conversationMessage({
      id: 'message-1',
      direction: 'OUTBOUND',
      providerMessageId: 'provider-1',
      status: 'SENT',
    });
    const second = conversationMessage({
      id: 'message-2',
      direction: 'OUTBOUND',
      providerMessageId: 'provider-2',
      status: 'SENT',
    });
    const { service, normalizer, prisma, realtime } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedReceipt({ providerMessageIds: ['provider-1', 'provider-2', 'provider-1'] }),
    );
    prisma.whatsAppMessage.findMany.mockResolvedValue([first, second]);

    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          providerMessageId: { in: ['provider-1', 'provider-2'] },
        }),
      }),
    );
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledTimes(2);
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(1, {
      where: { id: first.id },
      data: { status: 'DELIVERED', deliveredAt: receiptAt },
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(2, {
      where: { id: second.id },
      data: { status: 'DELIVERED', deliveredAt: receiptAt },
    });
    expect(realtime.emitMessageUpdated).toHaveBeenCalledTimes(2);
  });

  it('processes four receipt ids and emits events only for changed messages', async () => {
    const receiptAt = new Date('2026-10-08T21:21:18.000Z');
    const changed = [
      conversationMessage({
        id: 'message-1',
        direction: 'OUTBOUND',
        providerMessageId: 'provider-1',
        status: 'SENT',
      }),
      conversationMessage({
        id: 'message-2',
        direction: 'OUTBOUND',
        providerMessageId: 'provider-2',
        status: 'PENDING',
      }),
      conversationMessage({
        id: 'message-3',
        direction: 'OUTBOUND',
        providerMessageId: 'provider-3',
        status: 'FAILED',
      }),
    ];
    const unchanged = conversationMessage({
      id: 'message-4',
      direction: 'OUTBOUND',
      providerMessageId: 'provider-4',
      status: 'DELIVERED',
      deliveredAt: receiptAt,
    });
    const { service, normalizer, prisma, realtime } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedReceipt({
        providerMessageIds: ['provider-1', 'provider-2', 'provider-3', 'provider-4'],
        timestamp: receiptAt,
      }),
    );
    prisma.whatsAppMessage.findMany.mockResolvedValue([...changed, unchanged]);

    await expect(service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: true,
      updatedCount: 3,
    });

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledTimes(3);
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'message-1' } }),
    );
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: 'message-2' } }),
    );
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ where: { id: 'message-3' } }),
    );
    expect(realtime.emitMessageUpdated).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['PENDING', 'DELIVERED', { status: 'DELIVERED' }],
    ['SENT', 'DELIVERED', { status: 'DELIVERED' }],
    ['DELIVERED', 'DELIVERED', null],
    ['READ', 'DELIVERED', null],
    ['FAILED', 'DELIVERED', { status: 'DELIVERED' }],
    ['PENDING', 'READ', { status: 'READ' }],
    ['SENT', 'READ', { status: 'READ' }],
    ['DELIVERED', 'READ', { status: 'READ' }],
    ['READ', 'READ', null],
    ['FAILED', 'READ', { status: 'READ' }],
  ])(
    'keeps receipt status monotonic from %s with %s receipts',
    async (currentStatus, receiptState, expectedData) => {
      const receiptAt = new Date('2026-10-08T21:30:00.000Z');
      const existing = conversationMessage({
        direction: 'OUTBOUND',
        providerMessageId: 'provider-message-id',
        status: currentStatus,
        deliveredAt:
          currentStatus === 'DELIVERED' || currentStatus === 'READ'
            ? new Date('2026-10-08T21:00:00.000Z')
            : null,
        readAt: currentStatus === 'READ' ? new Date('2026-10-08T21:10:00.000Z') : null,
      });
      const { service, normalizer, prisma, realtime } = serviceFactory();
      normalizer.normalize.mockReturnValue(
        normalizedReceipt({
          state: receiptState,
          rawState: receiptState === 'READ' ? 'Read' : 'Delivered',
          timestamp: receiptAt,
        }),
      );
      prisma.whatsAppMessage.findMany.mockResolvedValue([existing]);

      await service.receiveWebhook({ type: 'ReadReceipt' });

      if (!expectedData) {
        expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
        expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
        return;
      }

      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
        where: { id: existing.id },
        data: expect.objectContaining(expectedData),
      });
      expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(
        existing.conversationId,
        existing.id,
      );
    },
  );

  it('uses the matched connection when provider message ids collide across connections', async () => {
    const targetConnection = connection({ id: '11111111-1111-4111-8111-111111111111' });
    const otherConnection = connection({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      providerUserId: 'other-kirago-user',
      providerInstanceName: 'Outra conexao',
    });
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'same-provider-id',
      whatsAppConnectionId: targetConnection.id,
    });
    const { service, normalizer, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConnection: {
          findFirst: vi
            .fn()
            .mockImplementation(({ where }: { where: { providerUserId?: string } }) =>
              Promise.resolve(
                where.providerUserId === 'kirago-user' ? targetConnection : otherConnection,
              ),
            ),
          findUnique: vi.fn().mockResolvedValue(targetConnection),
          create: vi.fn().mockResolvedValue(targetConnection),
          update: vi.fn().mockResolvedValue(targetConnection),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedReceipt({ providerMessageIds: ['same-provider-id'] }),
    );
    prisma.whatsAppMessage.findMany.mockResolvedValue([existing]);

    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith({
      where: {
        provider: 'KIRAGO',
        whatsAppConnectionId: targetConnection.id,
        providerMessageId: { in: ['same-provider-id'] },
        direction: 'OUTBOUND',
      },
    });
  });

  it('applies Delivered then Read to the same provider message id preserving both timestamps', async () => {
    const deliveredAt = new Date('2026-10-08T21:21:18.000Z');
    const readAt = new Date('2026-10-08T21:25:00.000Z');
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-message-id',
      status: 'SENT',
    });
    const { service, normalizer, prisma } = serviceFactory();
    normalizer.normalize
      .mockReturnValueOnce(normalizedReceipt({ timestamp: deliveredAt }))
      .mockReturnValueOnce(
        normalizedReceipt({ state: 'READ', rawState: 'Read', timestamp: readAt }),
      );
    prisma.whatsAppMessage.findMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([{ ...existing, status: 'DELIVERED', deliveredAt }]);

    await service.receiveWebhook({ type: 'ReadReceipt' });
    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(1, {
      where: { id: existing.id },
      data: { status: 'DELIVERED', deliveredAt },
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenNthCalledWith(2, {
      where: { id: existing.id },
      data: { status: 'READ', readAt },
    });
  });

  it('keeps duplicate delivered and read receipts idempotent', async () => {
    const existingDelivered = conversationMessage({
      direction: 'OUTBOUND',
      status: 'DELIVERED',
      deliveredAt: new Date('2026-10-08T21:00:00.000Z'),
    });
    const delivered = serviceFactory();
    delivered.normalizer.normalize.mockReturnValue(normalizedReceipt());
    delivered.prisma.whatsAppMessage.findMany.mockResolvedValue([existingDelivered]);

    await expect(delivered.service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: false,
      action: 'receipt_status_unchanged',
    });
    expect(delivered.prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(delivered.realtime.emitMessageUpdated).not.toHaveBeenCalled();

    const existingRead = conversationMessage({
      direction: 'OUTBOUND',
      status: 'READ',
      readAt: new Date('2026-10-08T21:10:00.000Z'),
    });
    const read = serviceFactory();
    read.normalizer.normalize.mockReturnValue(
      normalizedReceipt({ state: 'READ', rawState: 'Read' }),
    );
    read.prisma.whatsAppMessage.findMany.mockResolvedValue([existingRead]);

    await expect(read.service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: false,
      action: 'receipt_status_unchanged',
    });
    expect(read.prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(read.realtime.emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('does not regress READ when a delayed Delivered receipt arrives', async () => {
    const readAt = new Date('2026-10-08T21:25:00.000Z');
    const deliveredAt = new Date('2026-10-08T21:21:18.000Z');
    const existing = conversationMessage({
      direction: 'OUTBOUND',
      status: 'READ',
      deliveredAt: null,
      readAt,
    });
    const { service, normalizer, prisma } = serviceFactory();
    normalizer.normalize.mockReturnValue(normalizedReceipt({ timestamp: deliveredAt }));
    prisma.whatsAppMessage.findMany.mockResolvedValue([existing]);

    await service.receiveWebhook({ type: 'ReadReceipt' });

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: existing.id },
      data: { deliveredAt },
    });
  });

  it('ignores unknown receipt states and malformed receipt payloads', async () => {
    const unknown = serviceFactory();
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    unknown.normalizer.normalize.mockReturnValue(
      normalizedReceipt({ state: null, rawState: 'Viewed' }),
    );

    await expect(unknown.service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'unknown_receipt_state',
    });
    expect(unknown.prisma.whatsAppMessage.findMany).not.toHaveBeenCalled();
    expect(String(log.mock.calls.at(-1)?.[0] ?? '')).toContain(
      'Kirago read receipt ignored state=Viewed',
    );
    log.mockRestore();

    const malformed = serviceFactory();
    malformed.normalizer.normalize.mockReturnValue(normalizedReceipt({ providerMessageIds: [] }));

    await expect(malformed.service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      received: true,
      processed: false,
      reason: 'missing_message_ids',
    });
    expect(malformed.prisma.whatsAppMessage.findMany).not.toHaveBeenCalled();
  });

  it('identifies webhook connection by provider user id and falls back to instance name', async () => {
    const byProviderUserId = serviceFactory();
    byProviderUserId.normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-provider-user',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    await byProviderUserId.service.receiveWebhook({ type: 'Message' });

    expect(byProviderUserId.prisma.whatsAppConnection.findFirst).toHaveBeenCalledWith({
      where: { provider: 'KIRAGO', providerUserId: 'kirago-user' },
      orderBy: { createdAt: 'asc' },
    });

    const byInstanceName = serviceFactory();
    byInstanceName.normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: null,
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-instance-name',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    await byInstanceName.service.receiveWebhook({ type: 'Message' });

    expect(byInstanceName.prisma.whatsAppConnection.findFirst).toHaveBeenCalledWith({
      where: {
        provider: 'KIRAGO',
        OR: [{ providerInstanceName: 'CRM Principal' }, { name: 'CRM Principal' }],
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('ignores group webhooks and persists external outgoing without waitlist side effects', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValueOnce({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: null,
      contactName: null,
      messageId: 'group',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: true,
      mediaMetadata: null,
    });

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      reason: 'ignored_group',
    });

    normalizer.normalize.mockReturnValueOnce({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: null,
      messageId: 'outgoing',
      direction: 'OUTGOING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      action: 'external_outgoing_message_persisted',
      conversation: {
        action: 'external_outgoing_message_persisted',
      },
    });
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerMessageId: 'outgoing' }) }),
    );
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ firstMessageId: 'outgoing' }),
      }),
    );
  });

  it('creates a conversation and inbound message on the first eligible inbound webhook', async () => {
    const { service, prisma, normalizer, realtime, autoReply } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Ola conversa', { messageId: 'conversation-msg-1' }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };
    const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };
    const conversationUpdate = (prisma.whatsAppConversation.update as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(result).toMatchObject({
      conversation: { action: 'conversation_message_persisted' },
    });
    expect(conversationCreate.data).toMatchObject({
      whatsAppConnectionId: connection().id,
      instanceName: 'CRM Principal',
      provider: 'KIRAGO',
      externalInstanceId: 'kirago-user',
      clientId: client().id,
      contactName: 'Cliente Teste',
      phone: '5544999999999',
      phoneNormalized: '5544999999999',
      status: 'OPEN',
    });
    expect(messageCreate.data).toMatchObject({
      conversationId: conversation().id,
      whatsAppConnectionId: connection().id,
      provider: 'KIRAGO',
      providerMessageId: 'conversation-msg-1',
      direction: 'INBOUND',
      type: 'TEXT',
      text: 'Ola conversa',
      status: 'SENT',
      sentAt: now,
      isFromMe: false,
      messageDispatchId: null,
    });
    expect(conversationUpdate.data).toMatchObject({
      lastMessageAt: now,
      lastMessagePreview: 'Ola conversa',
      unreadCount: { increment: 1 },
    });
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      conversation().id,
      conversationMessage().id,
      'INBOUND',
    );
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversation().id);
    expect(autoReply.tryReplyToInbound).toHaveBeenCalledWith({
      whatsAppConnectionId: connection().id,
      conversationId: conversation().id,
      triggerMessageId: expect.any(String),
    });
  });

  it('correlates inbound replies by provider stanza id and preserves quoted snapshots', async () => {
    const original = conversationMessage({
      id: '88888888-8888-4888-8888-888888888888',
      conversationId: conversation().id,
      whatsAppConnectionId: connection().id,
      providerMessageId: 'original-provider-id',
      text: 'Texto original',
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(conversationMessage()),
          findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(original),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage(args.data)),
          ),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Resposta inbound', {
        messageId: 'reply-provider-id',
        replyContext: {
          providerMessageId: 'original-provider-id',
          participant: '5544999999999@s.whatsapp.net',
          quotedText: 'Texto original',
        },
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          replyToMessageId: original.id,
          replyToProviderMessageId: 'original-provider-id',
          quotedText: 'Texto original',
          rawMetadata: expect.objectContaining({
            replyContext: {
              providerMessageId: 'original-provider-id',
              participant: '5544999999999@s.whatsapp.net',
              quotedText: 'Texto original',
            },
          }),
        }),
      }),
    );
  });

  it('keeps inbound replies when the quoted original is not stored locally', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Resposta inbound', {
        messageId: 'reply-provider-id',
        replyContext: {
          providerMessageId: 'missing-provider-id',
          participant: '5544999999999@s.whatsapp.net',
          quotedText: 'Mensagem externa',
        },
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          replyToMessageId: null,
          replyToProviderMessageId: 'missing-provider-id',
          quotedText: 'Mensagem externa',
        }),
      }),
    );
  });

  it('ignores inbound Message webhooks without renderable content', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: 'empty-message',
        messageType: 'unknown',
        text: null,
        mediaMetadata: null,
        mediaDownloadMetadata: null,
      }),
    );

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      processed: false,
      reason: 'no_renderable_content',
    });
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
  });

  it.each([
    ['null text', null, null, null],
    ['empty text', '', null, null],
    ['blank text', '   ', null, null],
    ['empty media metadata', null, {}, null],
    ['empty media download metadata', null, null, {}],
    ['generic technical metadata', null, { originalType: 'text', provider: 'KIRAGO' }, null],
  ])(
    'ignores inbound TEXT webhooks with %s and no real text content',
    async (_label, text, mediaMetadata, mediaDownloadMetadata) => {
      const { service, prisma, normalizer, realtime } = serviceFactory();
      normalizer.normalize.mockReturnValue(
        normalizedInbound('', {
          messageId: 'empty-text-message',
          messageType: 'text',
          text,
          mediaMetadata,
          mediaDownloadMetadata,
        }),
      );

      await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
        processed: false,
        reason: 'no_renderable_content',
      });
      expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
      expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
      expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
    },
  );

  it('does not create a WhatsAppMessage for ReadReceipt webhooks', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(normalizedReceipt());

    await expect(service.receiveWebhook({ type: 'ReadReceipt' })).resolves.toMatchObject({
      processed: false,
      action: 'receipt_status_unchanged',
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it.each([
    ['image', 'IMAGE', { kind: 'image', mimetype: 'image/jpeg', size: 123 }],
    ['video', 'VIDEO', { kind: 'video', mimetype: 'video/mp4', seconds: 12 }],
    ['audio', 'AUDIO', { kind: 'audio', mimetype: 'audio/ogg', seconds: 8 }],
    ['sticker', 'STICKER', { kind: 'sticker', mimetype: 'image/webp', size: 456 }],
    [
      'document',
      'DOCUMENT',
      { kind: 'document', mimetype: 'application/pdf', fileName: 'doc.pdf' },
    ],
  ])(
    'persists inbound %s messages without text when media content is present',
    async (messageType, expectedType, mediaMetadata) => {
      const { service, prisma, normalizer } = serviceFactory();
      normalizer.normalize.mockReturnValue(
        normalizedInbound('', {
          messageId: `media-only-${messageType}`,
          messageType,
          text: null,
          mediaMetadata,
        }),
      );

      await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
        conversation: { action: 'conversation_message_persisted' },
      });

      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: expectedType,
            text: null,
          }),
        }),
      );
    },
  );

  it.each([
    ['location', 'LOCATION'],
    ['live_location', 'LOCATION'],
  ])('persists inbound %s messages without text as location content', async (messageType, type) => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: `location-${messageType}`,
        messageType,
        text: null,
        mediaMetadata: null,
      }),
    );

    await expect(service.receiveWebhook({ type: 'Message' })).resolves.toMatchObject({
      conversation: { action: 'conversation_message_persisted' },
    });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type,
          text: null,
        }),
      }),
    );
  });

  it('reuses an existing conversation for the same phone and connection', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ contactName: 'Lucas Antigo' })),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation({ contactName: 'Lucas Novo' })),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Segunda', { contactName: 'Lucas Novo', messageId: 'reuse-msg' }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversation().id },
        data: expect.objectContaining({ contactName: 'Lucas Novo' }),
      }),
    );
  });

  it('does not let outgoing webhooks replace the guest contactName with the account name', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ contactName: 'Lucas Antigo' })),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation({ contactName: 'Lucas Antigo' })),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Mensagem enviada', {
        contactName: 'Atualiza-Software',
        direction: 'OUTGOING',
        messageId: 'outgoing-account-name',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const conversationUpdate = (prisma.whatsAppConversation.update as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(conversationUpdate.data).not.toHaveProperty('contactName');
  });

  it('does not fill contactName when an outgoing webhook creates a conversation', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Mensagem enviada', {
        contactName: 'Atualiza-Software',
        direction: 'OUTGOING',
        messageId: 'outgoing-new-conversation',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(conversationCreate.data).toMatchObject({
      phoneNormalized: '5544999999999',
      contactName: null,
    });
  });

  it('does not persist instance names as guest conversation contactName', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi conversa', {
        contactName: 'CRM Principal',
        instanceName: 'CRM Principal',
        messageId: 'technical-contact-name',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(conversationCreate.data).toMatchObject({
      instanceName: 'CRM Principal',
      contactName: null,
    });
  });

  it('does not persist connection names as guest conversation contactName', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      currentConnection: connection({
        name: 'Conexao Comercial',
        providerInstanceName: 'instancia-provider',
      }),
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi conversa', {
        contactName: 'Conexao Comercial',
        instanceName: 'instancia-provider',
        messageId: 'connection-name-contact',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(conversationCreate.data).toMatchObject({
      instanceName: 'instancia-provider',
      contactName: null,
    });
  });

  it('preserves a manually linked client when a later webhook matches another phone client', async () => {
    const manualClient = client({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Cliente Manual',
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(client()),
          findMany: vi.fn().mockResolvedValue([client()]),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              clientId: manualClient.id,
              client: manualClient,
              contactName: 'Lucas Manual',
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation({ clientId: manualClient.id })),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Depois do vinculo manual', {
        contactName: 'Lucas Novo',
        messageId: 'manual-link-preserved',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const updateArgs = (prisma.whatsAppConversation.update as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };

    expect(updateArgs.data).toMatchObject({ contactName: 'Lucas Novo' });
    expect(updateArgs.data).not.toHaveProperty('client');
    expect(JSON.stringify(updateArgs.data)).not.toContain(client().id);
  });

  it('does not degrade existing conversation snapshots with empty webhook values', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              contactName: 'Lucas Existente',
              instanceName: 'CRM Principal',
              externalInstanceId: 'kirago-user',
            }),
          ),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', {
        contactName: null,
        instanceName: null,
        providerUserId: 'kirago-user',
        messageId: 'empty-snapshots',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.not.objectContaining({
          contactName: expect.anything(),
          instanceName: expect.anything(),
        }),
      }),
    );
  });

  it('creates a separate conversation for the same phone on another connection', async () => {
    const secondConnection = connection({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      providerUserId: 'kirago-user-2',
      providerInstanceName: 'CRM Secundario',
    });
    const { service, prisma, normalizer } = serviceFactory({ currentConnection: secondConnection });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi outra conexao', {
        providerUserId: 'kirago-user-2',
        instanceName: 'CRM Secundario',
        messageId: 'other-connection-msg',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          whatsAppConnectionId: secondConnection.id,
          phoneNormalized: '5544999999999',
        }),
      }),
    );
  });

  it.each([
    [[client()], client().id],
    [[], null],
    [[client(), client({ id: 'other-client-id', reference: 'CLI-2' })], null],
  ])('sets conversation clientId only for a unique client match %#', async (matches, clientId) => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(matches[0] ?? null),
          findMany: vi.fn().mockResolvedValue(matches),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', { messageId: `client-${clientId}` }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: { clientId?: string | null } };

    expect(conversationCreate.data?.clientId).toBe(clientId);
    expect('create' in prisma.client).toBe(false);
  });

  it('re-links a conversation with null clientId but does not replace an existing clientId', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ clientId: null }))
            .mockResolvedValueOnce(conversation({ clientId: 'already-linked-client' })),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });
    normalizer.normalize.mockReturnValueOnce(normalizedInbound('Oi', { messageId: 'relink-1' }));
    normalizer.normalize.mockReturnValueOnce(normalizedInbound('Oi', { messageId: 'relink-2' }));

    await service.receiveWebhook({ type: 'Message' });
    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ client: { connect: { id: client().id } } }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.not.objectContaining({ client: expect.anything() }),
      }),
    );
  });

  it.each([
    ['text', 'TEXT', 'Texto', {}, 'Texto'],
    ['image', 'IMAGE', 'Legenda imagem', { mimetype: 'image/jpeg', size: 123 }, 'Legenda imagem'],
    ['audio', 'AUDIO', null, { mimetype: 'audio/ogg', seconds: 8 }, '[Audio]'],
    ['button_response', 'BUTTON', 'Sim', {}, 'Sim'],
  ])(
    'persists conversational type %s as %s with sanitized metadata',
    async (messageType, expectedType, text, mediaMetadata, preview) => {
      const { service, prisma, normalizer } = serviceFactory();
      normalizer.normalize.mockReturnValue(
        normalizedInbound(text ?? '', {
          messageId: `type-${messageType}`,
          messageType,
          text,
          mediaMetadata: Object.keys(mediaMetadata).length
            ? { kind: messageType, ...mediaMetadata, caption: text }
            : null,
        }),
      );

      await service.receiveWebhook({ token: 'secret-token', type: 'Message' });
      const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
        data?: Record<string, unknown>;
      };
      const conversationUpdate = (prisma.whatsAppConversation.update as MockWithCalls).mock
        .calls[0]?.[0] as { data?: { lastMessagePreview?: string } };

      expect(messageCreate.data).toMatchObject({
        type: expectedType,
        text: expectedType === 'AUDIO' ? null : text,
      });
      expect(JSON.stringify(messageCreate.data?.rawMetadata)).not.toContain('secret-token');
      expect(JSON.stringify(messageCreate.data?.rawMetadata)).not.toContain('authorization');
      expect(conversationUpdate.data?.lastMessagePreview).toBe(preview);
    },
  );

  it('persists uppercase URL media download metadata canonically without public exposure', async () => {
    const mediaUrl = 'https://media.example.test/full/private/image?token=secret-token';
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Foto', {
        messageId: 'uppercase-url-image',
        messageType: 'image',
        mediaMetadata: {
          kind: 'image',
          mimetype: 'image/jpeg',
          size: 101637,
          caption: 'Foto',
          jpegThumbnail: 'data:image/jpeg;base64,SECRET',
        },
        mediaDownloadMetadata: {
          Url: mediaUrl,
          DirectPath: '/v/t62.7118-24/private-direct-path',
          MediaKey: 'real-image-media-key',
          Mimetype: 'image/jpeg',
          FileEncSHA256: 'real-image-file-enc',
          FileSHA256: 'real-image-file',
          FileLength: 101637,
        },
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: { rawMetadata?: { mediaDownload?: Record<string, unknown> } };
    };

    expect(messageCreate.data?.rawMetadata?.mediaDownload).toMatchObject({
      Url: mediaUrl,
      DirectPath: '/v/t62.7118-24/private-direct-path',
      MediaKey: 'real-image-media-key',
      Mimetype: 'image/jpeg',
      FileEncSHA256: 'real-image-file-enc',
      FileSHA256: 'real-image-file',
      FileLength: 101637,
    });
    expect(JSON.stringify(messageCreate.data?.rawMetadata)).not.toContain('base64');
  });

  it('persists captionless inbound IMAGE and emits realtime without requiring text', async () => {
    const { service, prisma, normalizer, realtime } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('', {
        messageId: 'captionless-image',
        messageType: 'image',
        text: null,
        mediaMetadata: {
          kind: 'image',
          mimetype: 'image/jpeg',
          size: 321,
        },
        mediaDownloadMetadata: {
          Url: 'https://mmg.whatsapp.net/captionless-image',
          MediaKey: 'captionless-image-media-key',
          Mimetype: 'image/jpeg',
          FileSHA256: 'captionless-image-file-sha',
          FileLength: 321,
        },
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      processed: true,
      conversation: { action: 'conversation_message_persisted', direction: 'INBOUND' },
    });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerMessageId: 'captionless-image',
          direction: 'INBOUND',
          type: 'IMAGE',
          text: null,
          mediaMimeType: 'image/jpeg',
          mediaSizeBytes: 321,
        }),
      }),
    );
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      conversation().id,
      expect.any(String),
      'INBOUND',
    );
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversation().id);
  });

  it('stores document and video media metadata without downloading media', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Contrato', {
        messageId: 'document-msg',
        messageType: 'document',
        mediaMetadata: {
          kind: 'document',
          mimetype: 'application/pdf',
          fileName: 'contrato.pdf',
          size: '2048',
          caption: 'Contrato',
          url: 'https://temporary.example/file',
          base64: 'AAA',
        },
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };

    expect(messageCreate.data).toMatchObject({
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato.pdf',
      mediaSizeBytes: 2048,
    });
    expect(JSON.stringify(messageCreate.data)).not.toContain('https://temporary.example/file');
    expect(JSON.stringify(messageCreate.data)).not.toContain('AAA');
  });

  it('does not duplicate conversation message or unread count on provider replay', async () => {
    const { service, prisma, normalizer, autoReply } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(conversationMessage({ id: 'existing-message' })),
          create: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedInbound('Replay', { messageId: 'replay-msg' }));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      conversation: { action: 'duplicate_conversation_message' },
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(autoReply.tryReplyToInbound).not.toHaveBeenCalled();
  });

  it('reconciles outgoing webhook echo with an existing CRM message by requestId without duplicating', async () => {
    const existing = conversationMessage({
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      providerMessageId: null,
      direction: 'OUTBOUND',
      status: 'PENDING',
      sentAt: null,
      text: 'Eco CRM',
      rawMetadata: null,
    });
    const { service, prisma, normalizer, realtime, autoReply } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...existing, ...args.data })),
          ),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Eco CRM', {
        direction: 'OUTGOING',
        messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'outgoing_conversation_message_reconciled',
      conversation: { action: 'outgoing_conversation_message_reconciled' },
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.objectContaining({
          providerMessageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
          status: 'SENT',
          failedAt: null,
        }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.conversationId },
        data: expect.not.objectContaining({ unreadCount: expect.anything(), status: 'OPEN' }),
      }),
    );
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(existing.conversationId, existing.id);
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(existing.conversationId);
    expect(autoReply.tryReplyToInbound).not.toHaveBeenCalled();
  });

  it('preserves auto_reply origin when the provider echo reconciles the outbound message', async () => {
    const existing = conversationMessage({
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
      providerMessageId: null,
      direction: 'OUTBOUND',
      status: 'PENDING',
      sentAt: null,
      text: 'Resposta automática',
      rawMetadata: {
        source: 'auto_reply',
        autoReplyConfigId: '33333333-3333-4333-8333-333333333333',
      },
    });
    const update = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(conversationMessage({ ...existing, ...args.data })),
    );
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update,
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Resposta automática', {
        direction: 'OUTGOING',
        messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    const updateData = update.mock.calls[0]?.[0].data;
    expect(updateData).not.toHaveProperty('rawMetadata');
    expect(existing.rawMetadata).toMatchObject({ source: 'auto_reply' });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('does not downgrade manual outbound IMAGE to TEXT when the outgoing webhook echo lacks media metadata', async () => {
    const existing = conversationMessage({
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
      providerMessageId: null,
      direction: 'OUTBOUND',
      type: 'IMAGE',
      status: 'SENT',
      sentAt: now,
      isFromMe: true,
      text: 'Legenda',
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'foto.jpg',
      mediaSizeBytes: 10,
      rawMetadata: {
        source: 'manual_outbound_media_send',
        storage: 'transient_request_only',
        retryPolicy: 'select_file_again_after_reload',
        localMedia: {
          storageKey: `${connection().id}/message-image/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        },
      },
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...existing, ...args.data })),
          ),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Mensagem sem metadata de midia', {
        direction: 'OUTGOING',
        messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
        messageType: 'text',
        mediaMetadata: null,
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'outgoing_conversation_message_reconciled',
      conversation: { action: 'outgoing_conversation_message_reconciled' },
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.not.objectContaining({ type: 'TEXT' }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.conversationId },
        data: expect.objectContaining({
          lastMessagePreview: 'Legenda',
        }),
      }),
    );
  });

  it.each([':sticker:', '[Figurinha]'])(
    'does not downgrade manual outbound STICKER when the outgoing echo contains %s',
    async (technicalText) => {
      const existing = conversationMessage({
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37395',
        providerMessageId: null,
        direction: 'OUTBOUND',
        type: 'STICKER',
        status: 'SENT',
        sentAt: now,
        isFromMe: true,
        text: null,
        mediaMimeType: 'image/webp',
        mediaFileName: 'figurinha.webp',
        mediaSizeBytes: 12,
        rawMetadata: {
          source: 'manual_outbound_media_send',
          storage: 'transient_request_only',
          retryPolicy: 'select_file_again_after_reload',
          localMedia: {
            storageKey: `${connection().id}/message-sticker/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee`,
            mimeType: 'image/webp',
            sizeBytes: 12,
          },
        },
      });
      const { service, prisma, normalizer, realtime } = serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(existing),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
            update: vi.fn((args: { data: Record<string, unknown> }) =>
              Promise.resolve(conversationMessage({ ...existing, ...args.data })),
            ),
          },
        },
      });
      normalizer.normalize.mockReturnValue(
        normalizedInbound(technicalText, {
          direction: 'OUTGOING',
          messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37395',
          messageType: 'text',
          mediaMetadata: null,
        }),
      );

      await service.receiveWebhook({ type: 'Message' });

      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.not.objectContaining({
            type: 'TEXT',
            text: technicalText,
            mediaMimeType: null,
            rawMetadata: expect.not.objectContaining({ localMedia: expect.anything() }),
          }),
        }),
      );
      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastMessagePreview: '[Figurinha]' }),
        }),
      );
      expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(
        existing.conversationId,
        existing.id,
      );
    },
  );

  it('does not downgrade manual outbound DOCUMENT to TEXT when the outgoing webhook echo lacks media metadata', async () => {
    const existing = conversationMessage({
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
      providerMessageId: null,
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      status: 'SENT',
      sentAt: now,
      isFromMe: true,
      text: null,
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato.pdf',
      mediaSizeBytes: 9,
      rawMetadata: {
        source: 'manual_outbound_media_send',
        storage: 'transient_request_only',
        retryPolicy: 'select_file_again_after_reload',
        localMedia: {
          storageKey: `${connection().id}/message-document/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`,
          mimeType: 'application/pdf',
          sizeBytes: 9,
        },
      },
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...existing, ...args.data })),
          ),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Mensagem sem metadata de documento', {
        direction: 'OUTGOING',
        messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
        messageType: 'text',
        mediaMetadata: null,
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.id },
        data: expect.not.objectContaining({ type: 'TEXT' }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existing.conversationId },
        data: expect.objectContaining({
          lastMessagePreview: 'contrato.pdf',
        }),
      }),
    );
  });

  it.each(['manual_outbound_media_send', 'manual_outbound_voice_send'] as const)(
    'does not downgrade %s AUDIO to TEXT when the outgoing webhook echo lacks media metadata',
    async (source) => {
      const existing = conversationMessage({
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37393',
        providerMessageId: null,
        direction: 'OUTBOUND',
        type: 'AUDIO',
        status: 'SENT',
        sentAt: now,
        isFromMe: true,
        text: null,
        mediaMimeType: 'audio/ogg',
        mediaFileName: 'recado.ogg',
        mediaSizeBytes: 11,
        rawMetadata: {
          source,
          storage: 'transient_request_only',
          retryPolicy: 'select_file_again_after_reload',
          localMedia: {
            storageKey: `${connection().id}/message-audio/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
            mimeType: 'audio/ogg',
            sizeBytes: 11,
          },
        },
      });
      const { service, prisma, normalizer } = serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(existing),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
            update: vi.fn((args: { data: Record<string, unknown> }) =>
              Promise.resolve(conversationMessage({ ...existing, ...args.data })),
            ),
          },
        },
      });
      normalizer.normalize.mockReturnValue(
        normalizedInbound('Mensagem sem metadata de audio', {
          direction: 'OUTGOING',
          messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37393',
          messageType: 'text',
          mediaMetadata: null,
        }),
      );

      await service.receiveWebhook({ type: 'Message' });

      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.not.objectContaining({ type: 'TEXT' }),
        }),
      );
      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.conversationId },
          data: expect.objectContaining({
            lastMessagePreview: '[Audio]',
          }),
        }),
      );
    },
  );

  it.each([
    ['without caption', null, '[Video]'],
    ['with caption', 'Meu vídeo', 'Meu vídeo'],
  ] as const)(
    'does not downgrade manual outbound VIDEO to TEXT when the outgoing webhook echo sends :video: %s',
    async (_label, existingText, expectedPreview) => {
      const existing = conversationMessage({
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37394',
        providerMessageId: null,
        direction: 'OUTBOUND',
        type: 'VIDEO',
        status: 'SENT',
        sentAt: now,
        isFromMe: true,
        text: existingText,
        mediaMimeType: 'video/mp4',
        mediaFileName: 'video.mp4',
        mediaSizeBytes: 43 * 1024 * 1024,
        mediaDurationSeconds: 12,
        rawMetadata: {
          source: 'manual_outbound_media_send',
          storage: 'transient_request_only',
          retryPolicy: 'select_file_again_after_reload',
          localMedia: {
            storageKey: `${connection().id}/message-video/dddddddd-dddd-4ddd-8ddd-dddddddddddd`,
            mimeType: 'video/mp4',
            sizeBytes: 43 * 1024 * 1024,
          },
        },
      });
      const { service, prisma, normalizer } = serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(existing),
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            create: vi.fn(),
            update: vi.fn((args: { data: Record<string, unknown> }) =>
              Promise.resolve(conversationMessage({ ...existing, ...args.data })),
            ),
          },
        },
      });
      normalizer.normalize.mockReturnValue(
        normalizedInbound(':video:', {
          direction: 'OUTGOING',
          messageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37394',
          messageType: 'text',
          mediaMetadata: null,
        }),
      );

      await service.receiveWebhook({ type: 'Message' });

      expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.objectContaining({
            providerMessageId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37394',
            status: 'SENT',
          }),
        }),
      );
      expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.id },
          data: expect.not.objectContaining({
            type: 'TEXT',
            text: ':video:',
            mediaMimeType: null,
            mediaFileName: null,
            mediaSizeBytes: null,
            mediaDurationSeconds: null,
            rawMetadata: expect.not.objectContaining({
              localMedia: expect.anything(),
            }),
          }),
        }),
      );
      expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: existing.conversationId },
          data: expect.objectContaining({
            lastMessagePreview: expectedPreview,
          }),
        }),
      );
    },
  );

  it('persists external outgoing webhook messages without waitlist side effects', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(client()),
          findMany: vi.fn().mockResolvedValue([client()]),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Enviado pelo celular', {
        direction: 'OUTGOING',
        messageId: 'external-outgoing-id',
      }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };
    const messageCreate = (prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };

    expect(result).toMatchObject({
      action: 'external_outgoing_message_persisted',
    });
    expect(conversationCreate.data).toMatchObject({
      clientId: client().id,
      phoneNormalized: '5544999999999',
    });
    expect(messageCreate.data).toMatchObject({
      direction: 'OUTBOUND',
      status: 'SENT',
      providerMessageId: 'external-outgoing-id',
      requestId: null,
      isFromMe: true,
      text: 'Enviado pelo celular',
    });
    expect(prisma.whatsAppInboundMessage.create).not.toHaveBeenCalled();
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('reopens resolved conversations only for new inbound messages', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ status: 'RESOLVED' }))
            .mockResolvedValueOnce(conversation({ status: 'RESOLVED' })),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation({ status: 'RESOLVED' })),
        },
      },
    });
    normalizer.normalize.mockReturnValueOnce(normalizedInbound('Inbound', { messageId: 'reopen' }));
    normalizer.normalize.mockReturnValueOnce(
      normalizedInbound('Outbound', {
        direction: 'OUTGOING',
        messageId: 'outbound-no-reopen',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN', unreadCount: { increment: 1 } }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        data: expect.not.objectContaining({ status: 'OPEN', unreadCount: expect.anything() }),
      }),
    );
  });

  it('uses provider timestamp and falls back to receivedAt for conversation sentAt', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    const receivedAt = new Date('2026-09-11T03:00:00.000Z');
    normalizer.normalize.mockReturnValueOnce(
      normalizedInbound('Com timestamp', {
        messageId: 'timestamp-provider',
        messageTimestamp: now,
        receivedAt,
      }),
    );
    normalizer.normalize.mockReturnValueOnce(
      normalizedInbound('Sem timestamp', {
        messageId: 'timestamp-fallback',
        messageTimestamp: null,
        receivedAt,
      }),
    );

    await service.receiveWebhook({ type: 'Message' });
    await service.receiveWebhook({ type: 'Message' });

    expect((prisma.whatsAppMessage.create as MockWithCalls).mock.calls[0]?.[0]).toMatchObject({
      data: expect.objectContaining({ sentAt: now }),
    });
    expect((prisma.whatsAppMessage.create as MockWithCalls).mock.calls[1]?.[0]).toMatchObject({
      data: expect.objectContaining({ sentAt: receivedAt }),
    });
  });

  it('preserves legacy waitlist behavior when conversational persistence fails', async () => {
    const { service, prisma, normalizer, realtime } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue(new Error('Falha conversacional sanitizada')),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedInbound('Oi', { messageId: 'failure-msg' }));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'pending_contact_upserted',
      conversation: {
        action: 'conversation_persistence_failed',
        processed: false,
        errorMessage: 'Falha conversacional sanitizada',
      },
    });
    expect(prisma.whatsAppInboundMessage.create).toHaveBeenCalled();
    expect(prisma.whatsAppPendingContact.upsert).toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
  });

  it('recovers expected WhatsAppMessage P2002 outside the aborted transaction', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['provider', 'whatsAppConnectionId', 'providerMessageId'] },
    });
    const existing = conversationMessage({
      id: 'existing-conversation-message-id',
      conversationId: conversation().id,
      providerMessageId: 'duplicate-msg',
    });
    const rootFindFirst = vi.fn().mockResolvedValue(existing);
    const txFindFirst = vi.fn().mockResolvedValue(null);
    const txMessageCreate = vi.fn().mockRejectedValue(duplicateError);
    const txConversationUpdate = vi.fn();
    let transactionCall = 0;
    const transaction = vi.fn(async (input: unknown) => {
      transactionCall += 1;
      const callback = input as (tx: unknown) => Promise<unknown>;

      if (transactionCall === 1) {
        return callback({
          whatsAppInboundMessage: {
            create: vi.fn().mockResolvedValue({ id: 'inbound-id' }),
          },
        });
      }

      return callback({
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(conversation()),
          update: txConversationUpdate,
        },
        whatsAppMessage: {
          findFirst: txFindFirst,
          create: txMessageCreate,
        },
      });
    });
    const { service, normalizer } = serviceFactory({
      prismaOverrides: {
        $transaction: transaction,
        whatsAppMessage: {
          findFirst: rootFindFirst,
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(normalizedInbound('Oi', { messageId: 'duplicate-msg' }));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      conversation: {
        processed: true,
        action: 'duplicate_conversation_message',
        conversationId: existing.conversationId,
        messageId: existing.id,
      },
    });
    expect(txFindFirst).toHaveBeenCalledTimes(1);
    expect(rootFindFirst).toHaveBeenCalledTimes(1);
    expect(txMessageCreate).toHaveBeenCalledTimes(1);
    expect(txConversationUpdate).not.toHaveBeenCalled();
  });

  it('does not recover unrelated P2002 as a WhatsApp duplicate', async () => {
    const unrelatedError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['unrelatedUniqueField'] },
    });
    const rootFindFirst = vi.fn();
    let transactionCall = 0;
    const transaction = vi.fn(async (input: unknown) => {
      transactionCall += 1;
      const callback = input as (tx: unknown) => Promise<unknown>;

      if (transactionCall === 1) {
        return callback({
          whatsAppInboundMessage: {
            create: vi.fn().mockResolvedValue({ id: 'inbound-id' }),
          },
        });
      }

      return callback({
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockRejectedValue(unrelatedError),
        },
      });
    });
    const { service, normalizer } = serviceFactory({
      prismaOverrides: {
        $transaction: transaction,
        whatsAppMessage: {
          findFirst: rootFindFirst,
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi', { messageId: 'unrelated-p2002-msg' }),
    );

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      conversation: {
        processed: false,
        action: 'conversation_persistence_failed',
        errorMessage: 'Unique violation',
      },
    });
    expect(rootFindFirst).not.toHaveBeenCalled();
  });

  it('does not increment count when provider message is replayed', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique violation', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['whatsAppConnectionId', 'providerMessageId'] },
    });
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        whatsAppInboundMessage: {
          create: vi.fn().mockRejectedValue(duplicateError),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Lucas',
      messageId: 'msg-1',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Ola',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'duplicate_message' });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('ignores and reopens a pending contact', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppPendingContact: {
          upsert: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(pendingContact({ status: 'PENDENTE' }))
            .mockResolvedValueOnce(pendingContact({ status: 'IGNORADO' })),
          update: vi
            .fn()
            .mockResolvedValueOnce(pendingContact({ status: 'IGNORADO', ignoreReason: 'Spam' }))
            .mockResolvedValueOnce(pendingContact({ status: 'PENDENTE' })),
        },
      },
    });

    const ignored = await service.ignorePendingContact(pendingContact().id, { reason: 'Spam' });
    const reopened = await service.reopenPendingContact(pendingContact().id);

    expect(ignored.status).toBe('IGNORADO');
    expect(reopened.status).toBe('PENDENTE');
    expect(prisma.whatsAppPendingContact.update).toHaveBeenCalledTimes(2);
  });

  it('protects approved contacts from ignore and reopen transitions', async () => {
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppPendingContact: {
          upsert: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi.fn().mockResolvedValue(pendingContact({ status: 'APROVADO' })),
          update: vi.fn(),
        },
      },
    });

    await expect(service.ignorePendingContact(pendingContact().id, {})).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.reopenPendingContact(pendingContact().id)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lists pending contacts with filters and pagination', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppPendingContact: {
          upsert: vi.fn(),
          update: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn().mockResolvedValue([pendingContact()]),
          count: vi.fn().mockResolvedValue(1),
        },
      },
    });

    const result = await service.listPendingContacts({
      status: 'PENDENTE',
      search: '(44) 99999-9999',
      page: 2,
      pageSize: 10,
      sortBy: 'messageCount',
      sortDirection: 'asc',
    });

    expect(result.pagination).toMatchObject({ page: 2, pageSize: 10, total: 1 });
    const findManyArgs = (prisma.whatsAppPendingContact.findMany as MockWithCalls).mock
      .calls[0]?.[0] as
      | {
          where: { status?: string; OR?: unknown[] };
          orderBy: Record<string, string>;
          skip: number;
          take: number;
        }
      | undefined;

    expect(findManyArgs).toMatchObject({
      where: { status: 'PENDENTE' },
      orderBy: { messageCount: 'asc' },
      skip: 10,
      take: 10,
    });
    expect(findManyArgs?.where.OR).toEqual(
      expect.arrayContaining([
        { contactName: { contains: '(44) 99999-9999', mode: 'insensitive' } },
        { phoneNormalized: { contains: '5544999999999' } },
      ]),
    );
  });

  it('lists conversations with search, filters, pagination, summary and display names', async () => {
    const linkedConversation = conversation({
      id: 'conversation-linked',
      clientId: client().id,
      contactName: 'Contato Antigo',
      lastMessageAt: new Date('2026-10-03T12:00:00.000Z'),
      lastMessagePreview: 'Preview',
      unreadCount: 3,
      client: client({ name: 'Cliente Preferido', phone: '(44) 90000-0001' }),
      attendances: [
        {
          id: 'attendance-active',
          status: 'PENDING',
          openedAt: new Date('2026-10-03T11:00:00.000Z'),
          firstAgentReplyAt: null,
          inboundMessagesCount: 1,
          outboundMessagesCount: 0,
        },
      ],
      autoReplyExecutions: [
        {
          id: 'auto-reply-execution',
          sentAt: new Date('2026-10-03T11:01:00.000Z'),
          config: { mode: 'AWAY' },
        },
      ],
    });
    const contactConversation = conversation({
      id: 'conversation-contact',
      client: null,
      contactName: 'Contato Direto',
      unreadCount: 1,
    });
    const phoneConversation = conversation({
      id: 'conversation-phone',
      client: null,
      contactName: null,
      unreadCount: 0,
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppAttendance: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { conversationId: linkedConversation.id },
              { conversationId: contactConversation.id },
              { conversationId: phoneConversation.id },
            ]),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([linkedConversation, contactConversation, phoneConversation]),
          count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(2),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 4 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const result = await service.listConversations({
      page: 2,
      limit: 10,
      search: '(44) 99999-9999',
      status: 'OPEN',
      whatsAppConnectionId: connection().id,
      clientId: client().id,
      unreadOnly: true,
    });
    const findManyArgs = (prisma.whatsAppConversation.findMany as MockWithCalls).mock
      .calls[0]?.[0] as {
      where?: Record<string, unknown>;
      include?: unknown;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    };
    const attendanceFindManyArgs = (prisma.whatsAppAttendance.findMany as MockWithCalls).mock
      .calls[0]?.[0] as {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    };

    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 3,
      totalPages: 1,
      hasMore: false,
      nextPage: null,
    });
    expect(result.summary).toEqual({ totalUnreadConversations: 2, totalUnreadMessages: 4 });
    expect(result.items.map((item: { displayName: string }) => item.displayName)).toEqual([
      'Cliente Preferido',
      '5544999999999',
      '5544999999999',
    ]);
    expect(result.items.at(0)?.activeAttendance).toMatchObject({
      status: 'PENDING',
      autoReply: {
        sent: true,
        lastSentAt: new Date('2026-10-03T11:01:00.000Z'),
        mode: 'AWAY',
        executionId: 'auto-reply-execution',
      },
    });
    expect(findManyArgs).toMatchObject({
      where: {
        id: {
          in: [linkedConversation.id, contactConversation.id, phoneConversation.id],
        },
      },
    });
    expect(attendanceFindManyArgs).toMatchObject({
      where: {
        conversation: {
          attendances: { some: { status: { in: ['PENDING', 'IN_PROGRESS'] } } },
          status: 'OPEN',
          whatsAppConnectionId: connection().id,
          clientId: client().id,
          unreadCount: { gt: 0 },
        },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'asc' }, { conversationId: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(findManyArgs.include).toEqual({
      client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
      whatsAppConnection: {
        select: { name: true, providerInstanceName: true, providerUserId: true },
      },
      labelAssignments: {
        select: { label: { select: { id: true, name: true, color: true } } },
        orderBy: { label: { name: 'asc' } },
      },
      attendances: {
        where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        select: {
          id: true,
          status: true,
          openedAt: true,
          firstAgentReplyAt: true,
          inboundMessagesCount: true,
          outboundMessagesCount: true,
        },
        orderBy: { openedAt: 'desc' },
        take: 1,
      },
      autoReplyExecutions: {
        where: { status: 'SENT', sentAt: { not: null } },
        select: { id: true, sentAt: true, config: { select: { mode: true } } },
        orderBy: { sentAt: 'desc' },
        take: 1,
      },
    });
    const attendanceConversationWhere = attendanceFindManyArgs.where?.conversation as
      Record<string, unknown> | undefined;
    expect(attendanceConversationWhere?.OR as unknown[] | undefined).toEqual(
      expect.arrayContaining([
        { contactName: { contains: '(44) 99999-9999', mode: 'insensitive' } },
        { phone: { contains: '(44) 99999-9999', mode: 'insensitive' } },
        { phoneNormalized: { contains: '5544999999999' } },
        { client: { name: { contains: '(44) 99999-9999', mode: 'insensitive' } } },
        { client: { phone: { contains: '(44) 99999-9999', mode: 'insensitive' } } },
        { client: { phoneNormalized: { contains: '5544999999999' } } },
      ]),
    );
    expect(attendanceConversationWhere?.OR as unknown[] | undefined).not.toEqual(
      expect.arrayContaining([
        { lastMessagePreview: { contains: '(44) 99999-9999', mode: 'insensitive' } },
      ]),
    );
  });

  it('filters resolved conversations independently from open conversations', async () => {
    const { service, prisma } = serviceFactory();

    await service.listConversations({ status: 'RESOLVED' });
    const findManyArgs = (prisma.whatsAppAttendance.findMany as MockWithCalls).mock
      .calls[0]?.[0] as { where?: Record<string, unknown> };

    expect(findManyArgs.where).toMatchObject({
      conversation: { status: 'RESOLVED' },
    });
  });

  it('filters attendance queues before pagination and keeps legacy conversations available in ALL', async () => {
    const { service, prisma } = serviceFactory();

    await service.listConversations({});
    await service.listConversations({
      attendanceStatus: WhatsAppConversationAttendanceFilter.ACTIVE,
    });
    await service.listConversations({
      attendanceStatus: WhatsAppConversationAttendanceFilter.PENDING,
    });
    await service.listConversations({
      attendanceStatus: WhatsAppConversationAttendanceFilter.IN_PROGRESS,
    });
    await service.listConversations({
      attendanceStatus: WhatsAppConversationAttendanceFilter.ALL,
    });

    const attendanceFindMany = prisma.whatsAppAttendance.findMany as MockWithCalls;
    const conversationFindMany = prisma.whatsAppConversation.findMany as MockWithCalls;
    const count = prisma.whatsAppConversation.count as MockWithCalls;
    expect(attendanceFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        conversation: {
          attendances: { some: { status: { in: ['PENDING', 'IN_PROGRESS'] } } },
        },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'asc' }, { conversationId: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(attendanceFindMany.mock.calls[1]?.[0]).toMatchObject({
      where: {
        conversation: {
          attendances: { some: { status: { in: ['PENDING', 'IN_PROGRESS'] } } },
        },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    expect(attendanceFindMany.mock.calls[2]?.[0]).toMatchObject({
      where: {
        conversation: { attendances: { some: { status: 'PENDING' } } },
        status: 'PENDING',
      },
      orderBy: [{ openedAt: 'asc' }, { conversationId: 'asc' }],
    });
    expect(attendanceFindMany.mock.calls[3]?.[0]).toMatchObject({
      where: {
        conversation: { attendances: { some: { status: 'IN_PROGRESS' } } },
        status: 'IN_PROGRESS',
      },
      orderBy: [{ openedAt: 'asc' }, { conversationId: 'asc' }],
    });
    expect(conversationFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: {},
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(count.mock.calls[0]?.[0]).toMatchObject({
      where: { attendances: { some: { status: { in: ['PENDING', 'IN_PROGRESS'] } } } },
    });
    expect(count.mock.calls[8]?.[0]).toMatchObject({ where: {} });
  });

  it('locks ACTIVE status ordering to the persisted PostgreSQL enum order', () => {
    const enumBlock = prismaSchemaSource.match(/enum WhatsAppAttendanceStatus \{[\s\S]*?\n\}/)?.[0];

    expect(enumBlock).toContain('PENDING\n  IN_PROGRESS\n  RESOLVED');
    expect(attendanceMigrationSource).toContain(
      "CREATE TYPE \"WhatsAppAttendanceStatus\" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED')",
    );
    expect(whatsAppServiceSource).toContain(
      "[{ status: 'asc' }, { openedAt: 'asc' }, { conversationId: 'asc' }]",
    );
  });

  it('defensively returns each conversation once when recomposing an attendance page', async () => {
    const item = conversation({ id: '11111111-cccc-4111-8111-111111111111' });
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppAttendance: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ conversationId: item.id }, { conversationId: item.id }]),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([item]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const result = await service.listConversations({});

    expect(result.items.map((conversationItem: { id: string }) => conversationItem.id)).toEqual([
      item.id,
    ]);
  });

  it('keeps the database attendance order through pagination without activity, auto-reply or unread priority', async () => {
    const pendingOld = conversation({
      id: '11111111-aaaa-4111-8111-111111111111',
      lastMessageAt: new Date('2026-10-16T12:30:00.000Z'),
      unreadCount: 0,
    });
    const pendingNew = conversation({
      id: '22222222-aaaa-4222-8222-222222222222',
      lastMessageAt: new Date('2026-10-16T13:30:00.000Z'),
      unreadCount: 40,
    });
    const inProgressOld = conversation({
      id: '33333333-aaaa-4333-8333-333333333333',
      lastMessageAt: new Date('2026-10-16T14:30:00.000Z'),
      unreadCount: 99,
    });
    const orderedIds = [pendingOld.id, pendingNew.id, inProgressOld.id];
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppAttendance: {
          findMany: vi
            .fn()
            .mockResolvedValue(orderedIds.map((conversationId) => ({ conversationId }))),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([inProgressOld, pendingNew, pendingOld]),
          count: vi.fn().mockResolvedValue(3),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 139 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const result = await service.listConversations({
      attendanceStatus: WhatsAppConversationAttendanceFilter.ACTIVE,
      page: 2,
      limit: 3,
      search: 'cliente',
      unreadOnly: true,
      hasClient: true,
    });

    expect(result.items.map((item: { id: string }) => item.id)).toEqual(orderedIds);
    expect(prisma.whatsAppAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversation: expect.objectContaining({
            OR: expect.any(Array),
            unreadCount: { gt: 0 },
            clientId: { not: null },
          }),
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        select: { conversationId: true },
        orderBy: [{ status: 'asc' }, { openedAt: 'asc' }, { conversationId: 'asc' }],
        skip: 3,
        take: 3,
      }),
    );
    const serializedOrder = JSON.stringify(
      (prisma.whatsAppAttendance.findMany as MockWithCalls).mock.calls[0]?.[0],
    );
    expect(serializedOrder).not.toContain('lastMessageAt');
    expect(serializedOrder).not.toContain('lastAutoReplyAt');
    expect(serializedOrder).not.toContain('unreadCount":"desc');
  });

  it('repositions manual replies, removes resolved attendances and inserts new pending work on refetch', async () => {
    const pending = conversation({ id: '11111111-bbbb-4111-8111-111111111111' });
    const inProgress = conversation({ id: '22222222-bbbb-4222-8222-222222222222' });
    const newlyPending = conversation({ id: '33333333-bbbb-4333-8333-333333333333' });
    const conversationsById = new Map(
      [pending, inProgress, newlyPending].map((item) => [item.id, item]),
    );
    const attendanceFindMany = vi
      .fn()
      .mockResolvedValueOnce([{ conversationId: pending.id }, { conversationId: inProgress.id }])
      .mockResolvedValueOnce([
        { conversationId: newlyPending.id },
        { conversationId: inProgress.id },
        { conversationId: pending.id },
      ])
      .mockResolvedValueOnce([{ conversationId: newlyPending.id }, { conversationId: pending.id }]);
    const conversationFindMany = vi.fn(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        [...where.id.in]
          .reverse()
          .map((id) => conversationsById.get(id))
          .filter(Boolean),
      ),
    );
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppAttendance: { findMany: attendanceFindMany },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: conversationFindMany,
          count: vi.fn().mockResolvedValue(3),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const first = await service.listConversations({});
    const afterManualReply = await service.listConversations({});
    const afterResolve = await service.listConversations({});

    expect(first.items.map((item: { id: string }) => item.id)).toEqual([pending.id, inProgress.id]);
    expect(afterManualReply.items.map((item: { id: string }) => item.id)).toEqual([
      newlyPending.id,
      inProgress.id,
      pending.id,
    ]);
    expect(afterResolve.items.map((item: { id: string }) => item.id)).toEqual([
      newlyPending.id,
      pending.id,
    ]);
  });

  it('filters client and guest conversations on the backend before pagination', async () => {
    const { service, prisma } = serviceFactory();

    await service.listConversations({ hasClient: true });
    await service.listConversations({ hasClient: false });
    const findMany = prisma.whatsAppAttendance.findMany as MockWithCalls;

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { conversation: { clientId: { not: null } } },
      skip: 0,
      take: 20,
    });
    expect(findMany.mock.calls[1]?.[0]).toMatchObject({
      where: { conversation: { clientId: null } },
      skip: 0,
      take: 20,
    });
  });

  it('returns conversation detail without loading full messages and handles not found', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ client: client() }))
            .mockResolvedValueOnce(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const detail = await service.getConversation(conversation().id);
    const findUniqueArgs = (prisma.whatsAppConversation.findUnique as MockWithCalls).mock
      .calls[0]?.[0] as { include?: Record<string, unknown> };

    expect(detail).toMatchObject({ id: conversation().id, displayName: 'Cliente Teste' });
    expect(detail).not.toHaveProperty('messages');
    expect(findUniqueArgs.include).not.toHaveProperty('messages');
    await expect(service.getConversation('missing-conversation')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('uses client name first and always falls back guest displayName to phone', async () => {
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(
              conversation({
                client: client({ name: 'Cliente Vinculado' }),
                clientId: client().id,
                contactName: 'CRM Principal',
                instanceName: 'CRM Principal',
              }),
            )
            .mockResolvedValueOnce(
              conversation({
                client: null,
                clientId: null,
                contactName: 'CRM Principal',
                instanceName: 'CRM Principal',
                phone: '5541998746949',
                phoneNormalized: '5541998746949',
              }),
            )
            .mockResolvedValueOnce(
              conversation({
                client: null,
                clientId: null,
                contactName: null,
                phone: '5555996483134',
                phoneNormalized: '5555996483134',
              }),
            ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(service.getConversation(conversation().id)).resolves.toMatchObject({
      displayName: 'Cliente Vinculado',
      contactName: null,
    });
    await expect(service.getConversation(conversation().id)).resolves.toMatchObject({
      displayName: '5541998746949',
      contactName: null,
    });
    await expect(service.getConversation(conversation().id)).resolves.toMatchObject({
      displayName: '5555996483134',
      contactName: null,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ['connection name', { contactName: '  crm   principal  ' }],
    ['instance name', { contactName: 'crm principal', instanceName: '  CRM   Principal  ' }],
    [
      'provider instance name',
      {
        contactName: 'instancia comercial',
        instanceName: 'CRM Principal',
        whatsAppConnection: connection({ providerInstanceName: 'Instancia   Comercial' }),
      },
    ],
    [
      'provider user id',
      {
        contactName: 'kirago-user',
        instanceName: 'CRM Principal',
        externalInstanceId: 'external-id',
      },
    ],
    ['external instance id', { contactName: 'external-id', externalInstanceId: 'External-ID' }],
  ])('falls back guest displayName to phone when contactName matches %s', async (_, overrides) => {
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              client: null,
              clientId: null,
              phone: '5555996483134',
              phoneNormalized: '5555996483134',
              ...overrides,
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(service.getConversation(conversation().id)).resolves.toMatchObject({
      displayName: '5555996483134',
      contactName: null,
    });
  });

  it('keeps legitimate guest contactName as metadata without using it for displayName', async () => {
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              client: null,
              clientId: null,
              contactName: 'Maria Silva',
              phone: '5555996483134',
              phoneNormalized: '5555996483134',
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(service.getConversation(conversation().id)).resolves.toMatchObject({
      displayName: '5555996483134',
      contactName: 'Maria Silva',
    });
  });

  it('allows a new real inbound PushName to replace an existing technical contactName', async () => {
    const { service, prisma, normalizer } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ contactName: 'CRM Principal' })),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation({ contactName: 'Maria' })),
        },
      },
    });
    normalizer.normalize.mockReturnValue(
      normalizedInbound('Oi, sou Maria', {
        contactName: 'Maria',
        messageId: 'real-inbound-name',
      }),
    );

    await service.receiveWebhook({ type: 'Message' });

    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactName: 'Maria' }),
      }),
    );
  });

  it('lists conversation messages by conversation with newest-page pagination and ASC presentation', async () => {
    const older = conversationMessage({
      id: 'message-older',
      direction: 'INBOUND',
      type: 'IMAGE',
      text: 'Legenda',
      mediaMimeType: 'image/jpeg',
      rawMetadata: {
        secret: 'hidden',
        mediaDownload: {
          Url: 'https://mmg.whatsapp.net/image',
          MediaKey: 'secret-media-key',
          Mimetype: 'image/jpeg',
          FileSHA256: 'secret-file-sha',
          FileLength: 123,
        },
      },
      createdAt: new Date('2026-10-03T10:00:00.000Z'),
      editedAt: new Date('2026-10-03T10:15:00.000Z'),
    });
    const newer = conversationMessage({
      id: 'message-newer',
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      text: 'Contrato',
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato.pdf',
      mediaSizeBytes: 2048,
      messageDispatchId: dispatch().id,
      createdAt: new Date('2026-10-03T10:05:00.000Z'),
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([newer, older]),
          count: vi.fn().mockResolvedValue(2),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const result = await service.listConversationMessages(conversation().id, { page: 1, limit: 2 });
    const findManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    };

    expect(findManyArgs).toMatchObject({
      where: { conversationId: conversation().id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 2,
    });
    expect(result.items.map((item: { id: string }) => item.id)).toEqual([
      'message-older',
      'message-newer',
    ]);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 2,
      total: 2,
      totalPages: 1,
      hasMore: false,
      nextPage: null,
      nextCursor: null,
    });
    expect(result.items[0]).toMatchObject({
      direction: 'INBOUND',
      type: 'IMAGE',
      text: 'Legenda',
      editedAt: new Date('2026-10-03T10:15:00.000Z'),
      mediaMimeType: 'image/jpeg',
      mediaAvailable: true,
    });
    expect(result.items[1]).toMatchObject({
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      editedAt: null,
      mediaFileName: 'contrato.pdf',
      mediaSizeBytes: 2048,
      messageDispatchId: dispatch().id,
    });
    expect(result.items[0]).not.toHaveProperty('rawMetadata');
    expect(JSON.stringify(result.items[0])).not.toContain('secret-media-key');
    expect(JSON.stringify(result.items[0])).not.toContain('https://mmg.whatsapp.net/image');
  });

  it('exposes only safe PIX context for CRM PIX conversation messages', async () => {
    const pixMessage = conversationMessage({
      id: 'message-pix',
      direction: 'OUTBOUND',
      isFromMe: true,
      type: 'TEXT',
      text: 'PIX\nValor: R$ 30,00',
      rawMetadata: {
        source: 'pix_whatsapp_send',
        paymentIntentId: 'payment-intent-id',
        messageDispatchId: dispatch().id,
        amount: '30.00',
        providerTransactionId: 'provider-transaction-secret',
        template: {
          button: {
            displayText: 'Copiar Chave PIX',
            copy_code: 'PIX-COPY-PASTE-CURRENT',
          },
        },
      },
    });
    const plainPixText = conversationMessage({
      id: 'message-plain',
      direction: 'OUTBOUND',
      isFromMe: true,
      type: 'TEXT',
      text: 'PIX aqui e texto normal',
      rawMetadata: null,
    });
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([plainPixText, pixMessage]),
          count: vi.fn().mockResolvedValue(2),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const result = await service.listConversationMessages(conversation().id, { page: 1, limit: 2 });

    expect(result.items[0]).toMatchObject({
      id: 'message-pix',
      pixContext: {
        paymentIntentId: 'payment-intent-id',
        amount: '30.00',
        buttonLabel: 'Copiar Chave PIX',
      },
    });
    expect(result.items[1]).toMatchObject({ id: 'message-plain', pixContext: null });
    expect(result.items[0]).not.toHaveProperty('rawMetadata');
    expect(JSON.stringify(result.items[0])).not.toContain('PIX-COPY-PASTE-CURRENT');
    expect(JSON.stringify(result.items[0])).not.toContain('provider-transaction-secret');
  });

  it('loads older conversation messages with a stable createdAt and id cursor after new realtime inserts', async () => {
    const message100 = conversationMessage({
      id: 'message-100',
      createdAt: new Date('2026-10-03T10:00:00.000Z'),
    });
    const message99 = conversationMessage({
      id: 'message-099',
      createdAt: new Date('2026-10-03T09:59:00.000Z'),
    });
    const message98 = conversationMessage({
      id: 'message-098',
      createdAt: new Date('2026-10-03T09:58:00.000Z'),
    });
    const message97 = conversationMessage({
      id: 'message-097',
      createdAt: new Date('2026-10-03T09:57:00.000Z'),
    });
    const message96 = conversationMessage({
      id: 'message-096',
      createdAt: new Date('2026-10-03T09:56:00.000Z'),
    });
    const newestRealtimeMessage = conversationMessage({
      id: 'message-101',
      createdAt: new Date('2026-10-03T10:01:00.000Z'),
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValueOnce(5),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValueOnce([message100, message99])
            .mockResolvedValueOnce([message98, message97, message96]),
          count: vi.fn().mockResolvedValue(5),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const firstPage = await service.listConversationMessages(conversation().id, {
      page: 1,
      limit: 2,
    });
    const cursor = firstPage.pagination.nextCursor;

    expect(cursor).toEqual({ createdAt: message99.createdAt, id: message99.id });
    if (!cursor) throw new Error('Expected a next cursor for older WhatsApp messages.');

    const olderPage = await service.listConversationMessages(conversation().id, {
      limit: 2,
      beforeCreatedAt: cursor.createdAt.toISOString(),
      beforeId: cursor.id,
    });
    const cursorFindManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock
      .calls[1]?.[0] as {
      where?: Record<string, unknown>;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    };

    expect(olderPage.items.map((item: { id: string }) => item.id)).toEqual([
      'message-097',
      'message-098',
    ]);
    expect(olderPage.items.map((item: { id: string }) => item.id)).not.toContain(
      newestRealtimeMessage.id,
    );
    expect(cursorFindManyArgs).toMatchObject({
      where: {
        conversationId: conversation().id,
        OR: [
          { createdAt: { lt: message99.createdAt } },
          { createdAt: message99.createdAt, id: { lt: message99.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(cursorFindManyArgs.skip).toBeUndefined();
    expect(olderPage.pagination).toEqual({
      page: 1,
      limit: 2,
      total: null,
      totalPages: null,
      hasMore: true,
      nextPage: null,
      nextCursor: { createdAt: message97.createdAt, id: message97.id },
    });
  });

  it('sets text conversation presence through the provider without persisting chat events', async () => {
    const targetConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, provider, prisma, realtime } = serviceFactory({
      currentConnection: targetConversation.whatsAppConnection,
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(targetConversation),
        },
      },
    });

    await expect(
      service.setConversationPresence(targetConversation.id, { state: 'composing' }),
    ).resolves.toEqual({ success: true });

    expect(provider.setChatPresence).toHaveBeenCalledWith('instance-token', {
      phone: targetConversation.phoneNormalized,
      state: 'composing',
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
  });

  it('sets paused conversation presence without media', async () => {
    const targetConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(targetConversation),
        },
      },
    });

    await expect(
      service.setConversationPresence(targetConversation.id, { state: 'paused' }),
    ).resolves.toEqual({ success: true });

    expect(provider.setChatPresence).toHaveBeenCalledWith('instance-token', {
      phone: targetConversation.phoneNormalized,
      state: 'paused',
    });
  });

  it('sets audio composing conversation presence', async () => {
    const targetConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(targetConversation),
        },
      },
    });

    await expect(
      service.setConversationPresence(targetConversation.id, {
        state: 'composing',
        media: 'audio',
      }),
    ).resolves.toEqual({ success: true });

    expect(provider.setChatPresence).toHaveBeenCalledWith('instance-token', {
      phone: targetConversation.phoneNormalized,
      state: 'composing',
      media: 'audio',
    });
  });

  it('rejects invalid conversation presence state and media before provider calls', async () => {
    const { service, provider } = serviceFactory();

    await expect(
      service.setConversationPresence(conversation().id, { state: 'typing' as never }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setConversationPresence(conversation().id, {
        state: 'composing',
        media: 'video' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setConversationPresence(conversation().id, { state: 'paused', media: 'audio' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.setChatPresence).not.toHaveBeenCalled();
  });

  it('rejects missing conversation, unusable connection, invalid provider and missing phone', async () => {
    const usableConnection = connection({ status: 'CONNECTED', connected: true, loggedIn: true });
    const { service: missingService } = serviceFactory({
      prismaOverrides: { whatsAppConversation: { findUnique: vi.fn().mockResolvedValue(null) } },
    });
    await expect(
      missingService.setConversationPresence(conversation().id, { state: 'composing' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { service: unusableService } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'DISCONNECTED',
                connected: false,
                loggedIn: false,
              }),
            }),
          ),
        },
      },
    });
    await expect(
      unusableService.setConversationPresence(conversation().id, { state: 'composing' }),
    ).rejects.toBeInstanceOf(ConflictException);

    const { service: invalidProviderService } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              provider: 'OTHER',
              whatsAppConnection: { ...usableConnection, provider: 'OTHER' },
            }),
          ),
        },
      },
    });
    await expect(
      invalidProviderService.setConversationPresence(conversation().id, { state: 'composing' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const { service: missingPhoneService } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              phoneNormalized: '',
              whatsAppConnection: usableConnection,
            }),
          ),
        },
      },
    });
    await expect(
      missingPhoneService.setConversationPresence(conversation().id, { state: 'composing' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('treats provider presence failure as best effort', async () => {
    const targetConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, provider, realtime } = serviceFactory({
      providerOverrides: { setChatPresence: vi.fn().mockRejectedValue(new Error('kirago down')) },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(targetConversation),
        },
      },
    });

    await expect(
      service.setConversationPresence(targetConversation.id, { state: 'composing' }),
    ).resolves.toEqual({ success: false });

    expect(provider.setChatPresence).toHaveBeenCalledTimes(1);
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
  });

  it('sends and persists an own reaction for inbound conversation messages', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const editedAt = new Date('2026-10-08T20:00:00.000Z');
    const target = conversationMessage({
      direction: 'INBOUND',
      providerMessageId: 'provider-inbound',
      conversation: connectedConversation,
      editedAt,
    });
    const updated = conversationMessage({
      ...target,
      reactions: [
        {
          id: 'reaction-id',
          messageId: target.id,
          whatsAppConnectionId: target.whatsAppConnectionId,
          provider: 'KIRAGO',
          emoji: '❤️',
          reactorKey: 'crm:self',
          isFromMe: true,
          providerReactionId: null,
          participant: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    const { service, provider, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
          findUnique: vi.fn().mockResolvedValue(updated),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.updateConversationMessageReaction(
      connectedConversation.id,
      target.id,
      { emoji: '❤️' },
    );

    expect(provider.sendReaction).toHaveBeenCalledWith('instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-inbound',
      isOwnMessage: false,
      emoji: '❤️',
    });
    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledWith({
      where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'crm:self' } },
      create: {
        messageId: target.id,
        whatsAppConnectionId: target.whatsAppConnectionId,
        provider: 'KIRAGO',
        emoji: '❤️',
        reactorKey: 'crm:self',
        isFromMe: true,
      },
      update: {
        emoji: '❤️',
        isFromMe: true,
        participant: null,
      },
    });
    expect(result.reactions).toEqual([
      expect.objectContaining({ emoji: '❤️', isFromMe: true, reactorKey: 'crm:self' }),
    ]);
    expect(result.editedAt).toBe(editedAt);
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(connectedConversation.id, target.id);
  });

  it('uses outbound direction for the provider own-message reaction id rule and removes own reaction', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    const { service, provider, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue({ ...target, reactions: [] }),
          findUnique: vi.fn().mockResolvedValue({ ...target, reactions: [] }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(target),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.updateConversationMessageReaction(
      connectedConversation.id,
      target.id,
      { emoji: null },
    );

    expect(provider.sendReaction).toHaveBeenCalledWith('instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-outbound',
      isOwnMessage: true,
      emoji: null,
    });
    expect(prisma.whatsAppMessageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: target.id, reactorKey: 'crm:self' },
    });
    expect(result.reactions).toEqual([]);
  });

  it('does not persist reaction changes when the provider rejects the request', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const target = conversationMessage({
      direction: 'INBOUND',
      providerMessageId: 'provider-inbound',
      conversation: connectedConversation,
    });
    const { service, prisma } = serviceFactory({
      providerOverrides: {
        sendReaction: vi.fn().mockRejectedValue(new Error('provider failed')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUnique: vi.fn().mockResolvedValue(target),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(target),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(
      service.updateConversationMessageReaction(connectedConversation.id, target.id, {
        emoji: null,
      }),
    ).rejects.toThrow();

    expect(prisma.whatsAppMessageReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessageReaction.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('changes only the crm self reaction and preserves other reactors', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const ownReaction = {
      id: 'reaction-own',
      messageId: 'message-id',
      whatsAppConnectionId: connection().id,
      provider: 'KIRAGO',
      emoji: '❤️',
      reactorKey: 'crm:self',
      isFromMe: true,
      providerReactionId: null,
      participant: null,
      createdAt: now,
      updatedAt: now,
    };
    const contactReaction = {
      id: 'reaction-contact',
      messageId: 'message-id',
      whatsAppConnectionId: connection().id,
      provider: 'KIRAGO',
      emoji: '🙏',
      reactorKey: 'contact:future',
      isFromMe: false,
      providerReactionId: null,
      participant: null,
      createdAt: now,
      updatedAt: now,
    };
    const target = conversationMessage({
      direction: 'INBOUND',
      providerMessageId: 'provider-inbound',
      conversation: connectedConversation,
      reactions: [ownReaction, contactReaction],
    });
    const updated = conversationMessage({
      ...target,
      reactions: [{ ...ownReaction, emoji: '😂' }, contactReaction],
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
          findUnique: vi.fn().mockResolvedValue(updated),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.updateConversationMessageReaction(
      connectedConversation.id,
      target.id,
      { emoji: '😂' },
    );

    expect(prisma.whatsAppMessageReaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId_reactorKey: { messageId: target.id, reactorKey: 'crm:self' } },
        update: expect.objectContaining({ emoji: '😂', isFromMe: true, participant: null }),
      }),
    );
    expect(result.reactions).toEqual([
      expect.objectContaining({ emoji: '😂', reactorKey: 'crm:self', isFromMe: true }),
      expect.objectContaining({ emoji: '🙏', reactorKey: 'contact:future', isFromMe: false }),
    ]);
  });

  it('rejects invalid reactions, missing provider ids and wrong conversation targets before provider call', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const { service: invalidService, provider: invalidProvider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(
            conversationMessage({
              conversation: connectedConversation,
            }),
          ),
        },
      },
    });

    await expect(
      invalidService.updateConversationMessageReaction(connectedConversation.id, 'message-id', {
        emoji: '🔥' as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(invalidProvider.sendReaction).not.toHaveBeenCalled();

    const { service: missingProviderIdService, provider: missingProviderIdProvider } =
      serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(
              conversationMessage({
                providerMessageId: null,
                conversation: connectedConversation,
              }),
            ),
          },
        },
      });

    await expect(
      missingProviderIdService.updateConversationMessageReaction(
        connectedConversation.id,
        'message-id',
        { emoji: '👍' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(missingProviderIdProvider.sendReaction).not.toHaveBeenCalled();

    const { service: missingTargetService, provider: missingTargetProvider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    await expect(
      missingTargetService.updateConversationMessageReaction('wrong-conversation', 'message-id', {
        emoji: '👍',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(missingTargetProvider.sendReaction).not.toHaveBeenCalled();
  });

  it('deletes outbound provider messages provider-first and emits only message.updated', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const editedAt = new Date('2026-10-08T20:00:00.000Z');
    const target = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
      text: 'Conteudo sensivel',
      editedAt,
      reactions: [{ id: 'reaction-id', emoji: '❤️', reactorKey: 'crm:self', isFromMe: true }],
    });
    const updated = conversationMessage({
      ...target,
      deletedAt: now,
      deletedForEveryone: true,
      reactions: target.reactions,
    });
    const { service, provider, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUnique: vi.fn().mockResolvedValue(updated),
          findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(updated),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.deleteConversationMessage(connectedConversation.id, target.id);

    expect(provider.deleteMessage).toHaveBeenCalledWith('instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-outbound',
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: {
        deletedAt: expect.any(Date),
        deletedForEveryone: true,
      },
      include: expect.any(Object),
    });
    expect(result).toMatchObject({
      id: target.id,
      deleted: true,
      text: null,
      mediaAvailable: false,
      retryAction: null,
      reactions: [],
      editedAt,
    });
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(connectedConversation.id, target.id);
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
  });

  it('edits eligible outbound text provider-first, persists the same message and emits update events', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Texto original',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
      reactions: [{ id: 'reaction-id', emoji: '❤️', reactorKey: 'crm:self', isFromMe: true }],
    });
    const persistedEditedAt = new Date('2026-10-15T00:22:00.000Z');
    const updated = conversationMessage({
      ...target,
      text: 'Texto atualizado',
      editedAt: persistedEditedAt,
    });
    const { service, provider, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(updated),
        },
      },
    });

    const result = await service.editConversationMessage(connectedConversation.id, target.id, {
      body: '  Texto atualizado  ',
    });

    expect(provider.editMessage).toHaveBeenCalledWith('instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-outbound',
      body: 'Texto atualizado',
    });
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { text: 'Texto atualizado', editedAt: expect.any(Date) },
      include: expect.any(Object),
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: target.id,
      text: 'Texto atualizado',
      editedAt: persistedEditedAt,
      providerMessageId: 'provider-outbound',
      reactions: expect.any(Array),
    });
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(connectedConversation.id, target.id);
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith({
      where: { id: connectedConversation.id },
      data: { lastMessagePreview: 'Texto atualizado' },
    });
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(connectedConversation.id);
  });

  it('does not change local text when the provider edit fails', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Texto original',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    const { service, prisma, realtime } = serviceFactory({
      providerOverrides: { editMessage: vi.fn().mockRejectedValue(new Error('provider failed')) },
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          update: vi.fn().mockResolvedValue(target),
        },
      },
    });

    await expect(
      service.editConversationMessage(connectedConversation.id, target.id, {
        body: 'Texto atualizado',
      }),
    ).rejects.toThrow();

    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('does not change local text when the provider edit times out', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Texto original',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    const { service, prisma, realtime } = serviceFactory({
      providerOverrides: {
        editMessage: vi
          .fn()
          .mockRejectedValue(new KiragoProviderError('KIRAGO_TIMEOUT', 'Kirago timeout.')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          update: vi.fn().mockResolvedValue(target),
        },
      },
    });

    await expect(
      service.editConversationMessage(connectedConversation.id, target.id, {
        body: 'Texto atualizado',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
  });

  it('does not update the conversation preview when editing an older message', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const target = conversationMessage({
      id: '88888888-8888-4888-8888-888888888888',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Texto antigo',
      providerMessageId: 'provider-old',
      conversation: connectedConversation,
    });
    const updated = conversationMessage({ ...target, text: 'Texto antigo editado' });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ id: '99999999-9999-4999-8999-999999999999' });
    const { service, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst,
          update: vi.fn().mockResolvedValue(updated),
        },
      },
    });

    await service.editConversationMessage(connectedConversation.id, target.id, {
      body: 'Texto antigo editado',
    });

    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(connectedConversation.id, target.id);
  });

  it('rejects message edits when the message is not in the requested conversation', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, provider, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
      },
    });

    await expect(
      service.editConversationMessage(connectedConversation.id, conversationMessage().id, {
        body: 'Texto atualizado',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(provider.editMessage).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
  });

  it('serializes consecutive edits of the same message and persists each provider-confirmed body', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Original',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    let confirmFirstEdit!: () => void;
    const firstProviderConfirmation = new Promise<void>((resolve) => {
      confirmFirstEdit = resolve;
    });
    const editMessage = vi
      .fn()
      .mockImplementationOnce(() => firstProviderConfirmation)
      .mockResolvedValueOnce(undefined);
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ id: target.id })
      .mockResolvedValueOnce({ ...target, text: 'Primeira edicao' })
      .mockResolvedValueOnce({ id: target.id });
    const update = vi.fn((args: { data: { text: string; editedAt: Date } }) =>
      Promise.resolve(
        conversationMessage({
          ...target,
          text: args.data.text,
          editedAt: args.data.editedAt,
        }),
      ),
    );
    const { service } = serviceFactory({
      providerOverrides: { editMessage },
      prismaOverrides: { whatsAppMessage: { findFirst, update } },
    });

    const first = service.editConversationMessage(connectedConversation.id, target.id, {
      body: 'Primeira edicao',
    });
    const second = service.editConversationMessage(connectedConversation.id, target.id, {
      body: 'Segunda edicao',
    });

    await vi.waitFor(() => expect(editMessage).toHaveBeenCalledTimes(1));
    expect(update).not.toHaveBeenCalled();
    confirmFirstEdit();
    await Promise.all([first, second]);

    expect(editMessage).toHaveBeenNthCalledWith(1, 'instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-outbound',
      body: 'Primeira edicao',
    });
    expect(editMessage).toHaveBeenNthCalledWith(2, 'instance-token', {
      phone: connectedConversation.phoneNormalized,
      providerMessageId: 'provider-outbound',
      body: 'Segunda edicao',
    });
    expect(update.mock.calls.map(([args]) => args.data.text)).toEqual([
      'Primeira edicao',
      'Segunda edicao',
    ]);
    const editTimestamps = update.mock.calls.map(([args]) => args.data.editedAt);
    expect(editTimestamps).toEqual([expect.any(Date), expect.any(Date)]);
    expect(editTimestamps[1]).not.toBe(editTimestamps[0]);
  });

  it('releases the same-message edit queue after a failure so the next edit can proceed', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Original',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    const editMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValueOnce(undefined);
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce({ id: target.id });
    const update = vi.fn((args: { data: { text: string } }) =>
      Promise.resolve(conversationMessage({ ...target, text: args.data.text })),
    );
    const { service } = serviceFactory({
      providerOverrides: { editMessage },
      prismaOverrides: { whatsAppMessage: { findFirst, update } },
    });

    const first = service.editConversationMessage(connectedConversation.id, target.id, {
      body: 'Primeira edicao',
    });
    const second = service.editConversationMessage(connectedConversation.id, target.id, {
      body: 'Segunda edicao',
    });

    const results = await Promise.allSettled([first, second]);

    expect(results.map(({ status }) => status)).toEqual(['rejected', 'fulfilled']);
    expect(editMessage).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: 'Segunda edicao', editedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not block edits of different messages behind each other', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const firstTarget = conversationMessage({
      id: '77777777-7777-4777-8777-777777777777',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Original A',
      providerMessageId: 'provider-a',
      conversation: connectedConversation,
    });
    const secondTarget = conversationMessage({
      id: '88888888-8888-4888-8888-888888888888',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Original B',
      providerMessageId: 'provider-b',
      conversation: connectedConversation,
    });
    let releaseFirst!: () => void;
    const firstProviderConfirmation = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const editMessage = vi.fn((_token: string, input: { providerMessageId: string }) =>
      input.providerMessageId === 'provider-a'
        ? firstProviderConfirmation
        : Promise.resolve(undefined),
    );
    const findFirst = vi.fn((args: { where: { id?: string } }) => {
      if (args.where.id === firstTarget.id) return Promise.resolve(firstTarget);
      if (args.where.id === secondTarget.id) return Promise.resolve(secondTarget);
      return Promise.resolve({ id: secondTarget.id });
    });
    const update = vi.fn((args: { where: { id: string }; data: { text: string } }) =>
      Promise.resolve(
        conversationMessage({
          ...(args.where.id === firstTarget.id ? firstTarget : secondTarget),
          text: args.data.text,
        }),
      ),
    );
    const { service } = serviceFactory({
      providerOverrides: { editMessage },
      prismaOverrides: { whatsAppMessage: { findFirst, update } },
    });

    const first = service.editConversationMessage(connectedConversation.id, firstTarget.id, {
      body: 'Editado A',
    });
    const second = service.editConversationMessage(connectedConversation.id, secondTarget.id, {
      body: 'Editado B',
    });

    await second;
    expect(editMessage).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: secondTarget.id },
        data: expect.objectContaining({ text: 'Editado B', editedAt: expect.any(Date) }),
      }),
    );

    releaseFirst();
    await first;
  });

  it('rejects ineligible message edits before calling the provider', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const candidates = [
      conversationMessage({ direction: 'INBOUND', text: 'Original' }),
      ...(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'] as const).map((type) =>
        conversationMessage({ direction: 'OUTBOUND', type, text: 'Original' }),
      ),
      conversationMessage({ direction: 'OUTBOUND', text: 'Original', deletedAt: now }),
      conversationMessage({ direction: 'OUTBOUND', text: 'Original', providerMessageId: null }),
      conversationMessage({ direction: 'OUTBOUND', text: 'Mesmo texto' }),
    ];

    for (const candidate of candidates) {
      const target = { ...candidate, conversation: connectedConversation };
      const { service, provider } = serviceFactory({
        prismaOverrides: { whatsAppMessage: { findFirst: vi.fn().mockResolvedValue(target) } },
      });

      await expect(
        service.editConversationMessage(connectedConversation.id, target.id, {
          body: candidate.text === 'Mesmo texto' ? 'Mesmo texto' : 'Novo texto',
        }),
      ).rejects.toThrow();
      expect(provider.editMessage).not.toHaveBeenCalled();
    }

    const { service: emptyService, provider: emptyProvider } = serviceFactory();
    await expect(
      emptyService.editConversationMessage(connectedConversation.id, 'message-id', { body: '  ' }),
    ).rejects.toThrow(BadRequestException);
    expect(emptyProvider.editMessage).not.toHaveBeenCalled();
  });

  it('keeps outbound messages intact when provider delete fails', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-outbound',
      conversation: connectedConversation,
    });
    const { service, prisma } = serviceFactory({
      providerOverrides: {
        deleteMessage: vi.fn().mockRejectedValue(new Error('provider failed')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findUnique: vi.fn().mockResolvedValue(target),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(target),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(
      service.deleteConversationMessage(connectedConversation.id, target.id),
    ).rejects.toThrow();

    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
  });

  it('rejects inbound and providerless delete candidates before provider call', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const { service: inboundService, provider: inboundProvider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(
            conversationMessage({
              direction: 'INBOUND',
              providerMessageId: 'provider-inbound',
              conversation: connectedConversation,
            }),
          ),
        },
      },
    });

    await expect(
      inboundService.deleteConversationMessage(connectedConversation.id, 'message-id'),
    ).rejects.toThrow(ConflictException);
    expect(inboundProvider.deleteMessage).not.toHaveBeenCalled();

    const { service: providerlessService, provider: providerlessProvider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(
            conversationMessage({
              direction: 'OUTBOUND',
              providerMessageId: null,
              conversation: connectedConversation,
            }),
          ),
        },
      },
    });

    await expect(
      providerlessService.deleteConversationMessage(connectedConversation.id, 'message-id'),
    ).rejects.toThrow(BadRequestException);
    expect(providerlessProvider.deleteMessage).not.toHaveBeenCalled();
  });

  it('returns already deleted messages idempotently without calling the provider', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const target = conversationMessage({
      direction: 'OUTBOUND',
      providerMessageId: 'provider-outbound',
      deletedAt: now,
      deletedForEveryone: true,
      conversation: connectedConversation,
    });
    const { service, provider, prisma, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          update: vi.fn().mockResolvedValue(target),
        },
      },
    });

    const result = await service.deleteConversationMessage(connectedConversation.id, target.id);

    expect(provider.deleteMessage).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: target.id, deleted: true, text: null });
  });

  it('does not allow reactions on deleted messages', async () => {
    const connectedConversation = conversation({
      whatsAppConnection: connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      }),
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(
            conversationMessage({
              deletedAt: now,
              deletedForEveryone: true,
              conversation: connectedConversation,
            }),
          ),
        },
      },
    });

    await expect(
      service.updateConversationMessageReaction(connectedConversation.id, 'message-id', {
        emoji: '👍',
      }),
    ).rejects.toThrow(ConflictException);
    expect(provider.sendReaction).not.toHaveBeenCalled();
  });

  it.each(['TEXT', 'IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO'] as const)(
    'returns a masked tombstone after deleting %s messages',
    async (type) => {
      const connectedConversation = conversation({
        whatsAppConnection: connection({
          status: 'CONNECTED',
          connected: true,
          loggedIn: true,
        }),
      });
      const target = conversationMessage({
        direction: 'OUTBOUND',
        providerMessageId: `provider-${type.toLowerCase()}`,
        conversation: connectedConversation,
        type,
        text: type === 'TEXT' ? 'palavra-unica-delete-final' : 'caption antiga',
        mediaMimeType: type === 'TEXT' ? null : 'application/octet-stream',
        mediaFileName: type === 'DOCUMENT' ? 'Contrato sigiloso.pdf' : null,
        mediaSizeBytes: type === 'TEXT' ? null : 123,
        mediaDurationSeconds: type === 'AUDIO' || type === 'VIDEO' ? 7 : null,
        rawMetadata:
          type === 'TEXT'
            ? null
            : {
                localMedia: {
                  storageKey: `${connection().id}/message-${type.toLowerCase()}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'application/octet-stream',
                  sizeBytes: 123,
                },
              },
        reactions: [
          {
            id: 'reaction-id',
            messageId: 'message-id',
            whatsAppConnectionId: connection().id,
            provider: 'KIRAGO',
            emoji: '❤️',
            reactorKey: 'crm:self',
            isFromMe: true,
            providerReactionId: null,
            participant: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });
      const updated = conversationMessage({
        ...target,
        deletedAt: now,
        deletedForEveryone: true,
      });
      const { service } = serviceFactory({
        prismaOverrides: {
          whatsAppMessage: {
            findFirst: vi.fn().mockResolvedValue(target),
            update: vi.fn().mockResolvedValue(updated),
          },
        },
      });

      const result = await service.deleteConversationMessage(connectedConversation.id, target.id);

      expect(result).toMatchObject({
        deleted: true,
        deletedAt: now,
        deletedForEveryone: true,
        text: null,
        mediaMimeType: null,
        mediaFileName: null,
        mediaSizeBytes: null,
        mediaDurationSeconds: null,
        mediaAvailable: false,
        reactions: [],
        retryAction: null,
      });
      expect(JSON.stringify(result)).not.toContain('palavra-unica-delete-final');
      expect(JSON.stringify(result)).not.toContain('caption antiga');
      expect(JSON.stringify(result)).not.toContain('Contrato sigiloso.pdf');
      expect(JSON.stringify(result)).not.toContain('storageKey');
    },
  );

  it('blocks private media download for deleted tombstones before storage or provider access', async () => {
    const { service, provider, mediaStorage } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              deletedAt: now,
              deletedForEveryone: true,
              rawMetadata: {
                localMedia: {
                  storageKey: `${connection().id}/message-image/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'image/jpeg',
                  sizeBytes: 10,
                },
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  MediaKey: 'secret-media-key',
                  Mimetype: 'image/jpeg',
                  FileSHA256: 'secret-file-sha',
                  FileLength: 10,
                },
              },
            }),
          ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia(conversation().id, 'message-image'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MESSAGE_DELETED' }),
    });
    expect(mediaStorage.read).not.toHaveBeenCalled();
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it('uses id as the tie-break for same-timestamp message cursors', async () => {
    const cursorCreatedAt = new Date('2026-10-03T10:00:00.000Z');
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await service.listConversationMessages(conversation().id, {
      beforeCreatedAt: cursorCreatedAt.toISOString(),
      beforeId: 'message-050',
      limit: 30,
    });
    const findManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };

    expect(findManyArgs.where).toMatchObject({
      OR: [
        { createdAt: { lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, id: { lt: 'message-050' } },
      ],
    });
  });

  it('rejects incomplete or invalid message cursors before querying messages', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(
      service.listConversationMessages(conversation().id, {
        beforeCreatedAt: '2026-10-03T10:00:00.000Z',
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.listConversationMessages(conversation().id, {
        beforeCreatedAt: 'not-a-date',
        beforeId: 'message-050',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.whatsAppMessage.findMany).not.toHaveBeenCalled();
  });

  it('searches text conversation messages with pagination and conversation metadata', async () => {
    const inbound = conversationMessage({
      id: 'message-inbound',
      direction: 'INBOUND',
      text: 'Ola Bruno, seguem detalhes do atendimento.',
      createdAt: new Date('2026-10-03T10:00:00.000Z'),
      conversation: conversation({ client: client({ name: 'Bruno Cliente' }) }),
    });
    const outbound = conversationMessage({
      id: 'message-outbound',
      direction: 'OUTBOUND',
      text: 'Bruno, combinado.',
      createdAt: new Date('2026-10-03T10:05:00.000Z'),
      conversation: conversation({ client: null, contactName: 'Bruno Avulso' }),
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([outbound, inbound]),
          count: vi.fn().mockResolvedValue(2),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const result = await service.searchConversationMessages({
      conversationId: conversation().id,
      q: 'bruno',
      page: 1,
      limit: 10,
    });
    const findManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      include?: unknown;
      orderBy?: unknown;
      skip?: number;
      take?: number;
    };

    expect(findManyArgs).toMatchObject({
      where: {
        conversationId: conversation().id,
        type: 'TEXT',
        deletedAt: null,
        deletedForEveryone: false,
        text: { not: null, contains: 'bruno', mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 10,
    });
    expect(result.items.map((item: { message: { id: string } }) => item.message.id)).toEqual([
      'message-outbound',
      'message-inbound',
    ]);
    expect(result.items[0]).toMatchObject({
      conversation: { id: conversation().id, displayName: '5544999999999' },
      snippet: 'Bruno, combinado.',
    });
    expect(JSON.stringify(result.items[0])).not.toContain('rawMetadata');
  });

  it('excludes deleted text messages from search by tombstone invariant', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      },
    });

    const result = await service.searchConversationMessages({
      conversationId: conversation().id,
      q: 'palavra-unica-delete-final',
      page: 1,
      limit: 10,
    });
    const findManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };

    expect(findManyArgs.where).toMatchObject({
      conversationId: conversation().id,
      type: 'TEXT',
      deletedAt: null,
      deletedForEveryone: false,
      text: {
        not: null,
        contains: 'palavra-unica-delete-final',
        mode: 'insensitive',
      },
    });
    expect(result.items).toEqual([]);
  });

  it('keeps global message search compatible when conversationId is omitted', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await service.searchConversationMessages({ q: 'bruno', page: 1, limit: 10 });
    const findManyArgs = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
    };

    expect(findManyArgs.where).not.toHaveProperty('conversationId');
  });

  it('rejects short message searches before querying messages', async () => {
    const { service, prisma } = serviceFactory();

    await expect(service.searchConversationMessages({ q: 'a' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.whatsAppMessage.findMany).not.toHaveBeenCalled();
  });

  it('loads context around a target message without sequential paging', async () => {
    const sameTimestamp = new Date('2026-10-03T10:00:00.000Z');
    const older = conversationMessage({
      id: 'message-a-older',
      createdAt: sameTimestamp,
    });
    const target = conversationMessage({
      id: 'message-b-target',
      createdAt: sameTimestamp,
    });
    const newer = conversationMessage({
      id: 'message-c-newer',
      createdAt: sameTimestamp,
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(target),
          findMany: vi.fn().mockResolvedValueOnce([older]).mockResolvedValueOnce([newer]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const result = await service.getConversationMessagesAround(conversation().id, target.id, {
      limit: 1,
    });

    expect(result.targetId).toBe(target.id);
    expect(result.items.map((item: { id: string }) => item.id)).toEqual([
      older.id,
      target.id,
      newer.id,
    ]);
    expect(result.pagination).toMatchObject({ hasOlder: false, hasNewer: false });
    expect(prisma.whatsAppMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: target.id, conversationId: conversation().id },
      }),
    );
    const olderQuery = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[0]?.[0] as {
      where?: Record<string, unknown>;
      orderBy?: unknown;
    };
    const newerQuery = (prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls[1]?.[0] as {
      where?: Record<string, unknown>;
      orderBy?: unknown;
    };
    expect(olderQuery).toMatchObject({
      where: {
        conversationId: conversation().id,
        OR: [
          { createdAt: { lt: sameTimestamp } },
          { createdAt: sameTimestamp, id: { lt: target.id } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(newerQuery).toMatchObject({
      where: {
        conversationId: conversation().id,
        OR: [
          { createdAt: { gt: sameTimestamp } },
          { createdAt: sameTimestamp, id: { gt: target.id } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect((prisma.whatsAppMessage.findMany as MockWithCalls).mock.calls).toHaveLength(2);
  });

  it('rejects around-message lookup when the target does not belong to the conversation', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(
      service.getConversationMessagesAround(
        conversation().id,
        'message-from-another-conversation',
        {
          limit: 10,
        },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.whatsAppMessage.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      'provider mediaDownload',
      {
        type: 'IMAGE',
        mediaMimeType: 'image/jpeg',
        rawMetadata: {
          mediaDownload: {
            Url: 'https://mmg.whatsapp.net/image',
            MediaKey: 'image-media-key',
            Mimetype: 'image/jpeg',
            FileSHA256: 'image-file-sha',
            FileLength: 123,
          },
        },
      },
      true,
    ],
    [
      'provider audio mediaDownload with codec MIME parameter',
      {
        type: 'AUDIO',
        mediaMimeType: 'audio/ogg; codecs=opus',
        rawMetadata: {
          mediaDownload: {
            Url: 'https://mmg.whatsapp.net/audio',
            MediaKey: 'audio-media-key',
            Mimetype: 'audio/ogg; codecs=opus',
            FileSHA256: 'audio-file-sha',
            FileLength: 123,
          },
        },
      },
      true,
    ],
    [
      'local storage metadata',
      {
        type: 'DOCUMENT',
        mediaMimeType: 'application/pdf',
        rawMetadata: {
          localMedia: {
            storageKey: `${connection().id}/message-id/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
            mimeType: 'application/pdf',
            sizeBytes: 123,
          },
        },
      },
      true,
    ],
    [
      'no usable metadata',
      { type: 'IMAGE', mediaMimeType: 'image/jpeg', rawMetadata: null },
      false,
    ],
  ] as const)('sets mediaAvailable from %s', async (_label, overrides, expected) => {
    const message = conversationMessage({
      id: 'message-id',
      ...overrides,
    });
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue({ id: conversation().id }),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([message]),
          count: vi.fn().mockResolvedValue(1),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const result = await service.listConversationMessages(conversation().id, { page: 1, limit: 1 });

    expect(result.items[0]).toMatchObject({ mediaAvailable: expected });
    expect(result.items[0]).not.toHaveProperty('rawMetadata');
    expect(JSON.stringify(result.items[0])).not.toContain('storageKey');
  });

  it('downloads available conversation media as binary without exposing provider metadata', async () => {
    const providerData = Buffer.from('image-bytes');
    const operationalConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const { service, provider } = serviceFactory({
      providerOverrides: {
        downloadMedia: vi.fn().mockResolvedValue({
          dataUrl: `data:image/jpeg;base64,${providerData.toString('base64')}`,
          mimetype: 'image/jpeg',
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValue(conversation({ whatsAppConnection: operationalConnection })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              mediaSizeBytes: providerData.length,
              rawMetadata: {
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  DirectPath: '/v/image',
                  MediaKey: 'secret-media-key',
                  Mimetype: 'image/jpeg',
                  FileEncSHA256: 'secret-file-enc',
                  FileSHA256: 'secret-file-sha',
                  FileLength: providerData.length,
                },
              },
            }),
          ),
        },
      },
    });

    const result = await service.downloadConversationMessageMedia(
      conversation().id,
      'message-image',
    );

    expect(provider.downloadMedia).toHaveBeenCalledWith('instance-token', {
      type: 'IMAGE',
      Url: 'https://mmg.whatsapp.net/image',
      DirectPath: '/v/image',
      MediaKey: 'secret-media-key',
      Mimetype: 'image/jpeg',
      FileEncSHA256: 'secret-file-enc',
      FileSHA256: 'secret-file-sha',
      FileLength: providerData.length,
    });
    expect(result).toMatchObject({
      contentLength: providerData.length,
      disposition: 'inline',
      mimetype: 'image/jpeg',
    });
    expect(result.buffer.equals(providerData)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret-media-key');
  });

  it('downloads local outbound conversation media before trying provider metadata', async () => {
    const localData = Buffer.from('local-image-bytes');
    const { service, provider, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(localData),
        isSafeStorageKey: vi.fn().mockReturnValue(true),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              mediaFileName: '../../foto final.jpg',
              mediaSizeBytes: localData.length,
              rawMetadata: {
                localMedia: {
                  storageKey: `${connection().id}/message-image/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'image/jpeg',
                  sizeBytes: localData.length,
                },
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  MediaKey: 'secret-media-key',
                  Mimetype: 'image/jpeg',
                  FileSHA256: 'secret-file-sha',
                  FileLength: localData.length,
                },
              },
            }),
          ),
        },
      },
    });

    const result = await service.downloadConversationMessageMedia(
      conversation().id,
      'message-image',
    );

    expect(mediaStorage.read).toHaveBeenCalledWith(
      `${connection().id}/message-image/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
    expect(provider.downloadMedia).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      contentLength: localData.length,
      disposition: 'inline',
      fileName: 'foto final.jpg',
      mimetype: 'image/jpeg',
    });
    expect(result.buffer.equals(localData)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('storageKey');
  });

  it('downloads local outbound VIDEO at the 50 MB media limit', async () => {
    const localData = Buffer.alloc(WhatsAppService.conversationVideoMaxBytes, 'v');
    const { service, provider, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(localData),
        isSafeStorageKey: vi.fn().mockReturnValue(true),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-video',
              type: 'VIDEO',
              mediaMimeType: 'video/mp4',
              mediaFileName: 'video.mp4',
              mediaSizeBytes: localData.length,
              rawMetadata: {
                localMedia: {
                  storageKey: `${connection().id}/message-video/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'video/mp4',
                  sizeBytes: localData.length,
                },
              },
            }),
          ),
        },
      },
    });

    const result = await service.downloadConversationMessageMedia(
      conversation().id,
      'message-video',
    );

    expect(mediaStorage.read).toHaveBeenCalledWith(
      `${connection().id}/message-video/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
    expect(provider.downloadMedia).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      contentLength: localData.length,
      disposition: 'inline',
      fileName: 'video.mp4',
      mimetype: 'video/mp4',
    });
  });

  it('falls back to provider download when local metadata exists but the local file is missing', async () => {
    const providerData = Buffer.from('provider-image-bytes');
    const { service, provider } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(null),
        isSafeStorageKey: vi.fn().mockReturnValue(true),
      },
      providerOverrides: {
        downloadMedia: vi.fn().mockResolvedValue({
          dataUrl: `data:image/jpeg;base64,${providerData.toString('base64')}`,
          mimetype: 'image/jpeg',
        }),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              mediaSizeBytes: providerData.length,
              rawMetadata: {
                localMedia: {
                  storageKey: `${connection().id}/message-image/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
                  mimeType: 'image/jpeg',
                  sizeBytes: providerData.length,
                },
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  MediaKey: 'image-media-key',
                  Mimetype: 'image/jpeg',
                  FileSHA256: 'image-file-sha',
                  FileLength: providerData.length,
                },
              },
            }),
          ),
        },
      },
    });

    const result = await service.downloadConversationMessageMedia(
      conversation().id,
      'message-image',
    );

    expect(provider.downloadMedia).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ type: 'IMAGE' }),
    );
    expect(result.buffer.equals(providerData)).toBe(true);
  });

  it('ignores unsafe local storage keys before attempting to read local media', async () => {
    const { service, mediaStorage, provider } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn(),
        isSafeStorageKey: vi.fn().mockReturnValue(false),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              rawMetadata: {
                localMedia: {
                  storageKey: '../outside',
                  mimeType: 'image/jpeg',
                  sizeBytes: 10,
                },
              },
            }),
          ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia(conversation().id, 'message-image'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDIA_NOT_AVAILABLE' }),
    });
    expect(mediaStorage.read).not.toHaveBeenCalled();
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it.each([
    ['DOCUMENT', 'application/pdf', 'contract.pdf', 'attachment'],
    ['AUDIO', 'audio/ogg', null, 'inline'],
    ['AUDIO', 'audio/ogg; codecs=opus', null, 'inline'],
    ['AUDIO', ' audio/ogg ; codecs=opus ', null, 'inline'],
    ['AUDIO', 'Audio/Ogg; codecs=opus', null, 'inline'],
    ['VIDEO', 'video/mp4', null, 'inline'],
  ] as const)(
    'downloads available %s conversation media through the provider',
    async (type, mimetype, fileName, disposition) => {
      const providerData = Buffer.from(`${type.toLowerCase()}-bytes`);
      const operationalConnection = connection({
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      });
      const { service, provider } = serviceFactory({
        providerOverrides: {
          downloadMedia: vi.fn().mockResolvedValue({
            dataUrl: `data:${mimetype};base64,${providerData.toString('base64')}`,
            mimetype,
          }),
        },
        prismaOverrides: {
          whatsAppConversation: {
            findUnique: vi
              .fn()
              .mockResolvedValue(conversation({ whatsAppConnection: operationalConnection })),
          },
          whatsAppMessage: {
            findUnique: vi.fn().mockResolvedValue(
              conversationMessage({
                id: `message-${type.toLowerCase()}`,
                type,
                mediaFileName: fileName,
                mediaMimeType: mimetype,
                mediaSizeBytes: providerData.length,
                rawMetadata: {
                  mediaDownload: {
                    Url: `https://mmg.whatsapp.net/${type.toLowerCase()}`,
                    MediaKey: `${type.toLowerCase()}-media-key`,
                    Mimetype: mimetype,
                    FileSHA256: `${type.toLowerCase()}-file-sha`,
                    FileLength: providerData.length,
                  },
                },
              }),
            ),
          },
        },
      });

      const result = await service.downloadConversationMessageMedia(
        conversation().id,
        `message-${type.toLowerCase()}`,
      );

      expect(provider.downloadMedia).toHaveBeenCalledWith(
        'instance-token',
        expect.objectContaining({ type, Mimetype: mimetype.trim() }),
      );
      expect(result).toMatchObject({
        contentLength: providerData.length,
        disposition,
        mimetype,
      });
      expect(result.buffer.equals(providerData)).toBe(true);
    },
  );

  it('returns a controlled error for legacy media without download metadata', async () => {
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'legacy-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              rawMetadata: { source: 'webhook' },
            }),
          ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia(conversation().id, 'legacy-image'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDIA_NOT_AVAILABLE' }),
    });
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it('rejects unsupported conversation media types before calling the provider', async () => {
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ whatsAppConnection: connection() })),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-text',
              type: 'TEXT',
              rawMetadata: {
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/text',
                  MediaKey: 'text-media-key',
                  Mimetype: 'text/plain',
                  FileSHA256: 'text-file-sha',
                  FileLength: 12,
                },
              },
            }),
          ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia(conversation().id, 'message-text'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDIA_NOT_AVAILABLE' }),
    });
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it('rejects message and conversation mismatches before calling the provider', async () => {
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ id: 'conversation-a' })),
        },
        whatsAppMessage: {
          findUnique: vi
            .fn()
            .mockResolvedValue(
              conversationMessage({ id: 'message-b', conversationId: 'conversation-b' }),
            ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia('conversation-a', 'message-b'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MESSAGE_CONVERSATION_MISMATCH' }),
    });
    expect(provider.downloadMedia).not.toHaveBeenCalled();
  });

  it.each([
    [
      'invalid Data URL',
      { dataUrl: 'not-a-data-url', mimetype: 'image/jpeg' },
      'BadRequestException',
    ],
    [
      'MIME mismatch',
      {
        dataUrl: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}`,
        mimetype: 'image/jpeg',
      },
      'BadRequestException',
    ],
    [
      'invalid MIME',
      {
        dataUrl: `data:text/html;base64,${Buffer.from('<script></script>').toString('base64')}`,
        mimetype: 'text/html',
      },
      'BadRequestException',
    ],
    [
      'invalid parameterized MIME',
      {
        dataUrl: `data:audio/webm; codecs=opus;base64,${Buffer.from('webm').toString('base64')}`,
        mimetype: 'audio/webm; codecs=opus',
      },
      'BadRequestException',
    ],
    [
      'oversized media',
      {
        dataUrl: `data:image/jpeg;base64,${Buffer.alloc(
          WhatsAppService.conversationMediaMaxBytes + 1,
        ).toString('base64')}`,
        mimetype: 'image/jpeg',
      },
      'PayloadTooLargeException',
    ],
  ] as const)('rejects provider media with %s', async (_label, providerResponse, exceptionName) => {
    const { service } = serviceFactory({
      providerOverrides: {
        downloadMedia: vi.fn().mockResolvedValue(providerResponse),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              mediaSizeBytes: null,
              rawMetadata: {
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  MediaKey: 'image-media-key',
                  Mimetype: 'image/jpeg',
                  FileSHA256: 'image-file-sha',
                  FileLength: 123,
                },
              },
            }),
          ),
        },
      },
    });

    await expect(
      service.downloadConversationMessageMedia(conversation().id, 'message-image'),
    ).rejects.toMatchObject({ name: exceptionName });
  });

  it('surfaces provider download failure without exposing metadata in the result', async () => {
    const { service } = serviceFactory({
      providerOverrides: {
        downloadMedia: vi.fn().mockRejectedValue(new Error('falha token=secret-value')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnection: connection({
                status: 'CONNECTED',
                connected: true,
                loggedIn: true,
              }),
            }),
          ),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              id: 'message-image',
              type: 'IMAGE',
              mediaMimeType: 'image/jpeg',
              rawMetadata: {
                mediaDownload: {
                  Url: 'https://mmg.whatsapp.net/image',
                  MediaKey: 'secret-media-key',
                  Mimetype: 'image/jpeg',
                  FileSHA256: 'secret-file-sha',
                  FileLength: 123,
                },
              },
            }),
          ),
        },
      },
    });

    const result = service.downloadConversationMessageMedia(conversation().id, 'message-image');

    await expect(result).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MEDIA_DOWNLOAD_FAILED' }),
    });
    await expect(result).rejects.not.toThrow('secret-value');
  });

  it('returns 404 when listing messages for a missing conversation', async () => {
    const { service } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    await expect(service.listConversationMessages('missing-conversation', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks inbound provider messages as read in KiraGo before decrementing local unread', async () => {
    const activeConversation = conversation({
      phone: '5546999814046',
      phoneNormalized: '5546999814046',
      unreadCount: 2,
      whatsAppConnection: connection({ phone: '5599999999999' }),
    });
    const { service, prisma, provider, encryption } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(activeConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation({ unreadCount: 0, status: 'OPEN' })),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { providerMessageId: 'provider-inbound-1' },
              { providerMessageId: 'provider-inbound-2' },
              { providerMessageId: 'provider-inbound-1' },
            ]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 0,
      status: 'OPEN',
    });
    expect(encryption.decrypt).toHaveBeenCalledWith('encrypted-token');
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-inbound-1', 'provider-inbound-2'],
      phone: '554699814046',
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ phone: activeConversation.whatsAppConnection.phone }),
    );
    expect(provider.markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ phone: activeConversation.phoneNormalized }),
    );
    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: conversation().id,
          direction: 'INBOUND',
        },
        take: 2,
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 2 } } }),
    );
  });

  it('stops at the first missing provider id in the unread inbound window', async () => {
    const { service, prisma, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 3 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation({ unreadCount: 2 })),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { providerMessageId: 'provider-newest' },
              { providerMessageId: null },
              { providerMessageId: 'provider-oldest' },
            ]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 2,
    });
    expect(prisma.whatsAppMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
        where: {
          conversationId: conversation().id,
          direction: 'INBOUND',
        },
      }),
    );
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-oldest'],
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ messageIds: expect.arrayContaining(['provider-newest']) }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 1 } } }),
    );
  });

  it('keeps the unread window aligned across consecutive opens when a provider id is missing in the middle', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(conversation({ unreadCount: 3 }))
      .mockResolvedValueOnce(conversation({ unreadCount: 2 }));
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 2 }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { providerMessageId: 'provider-c' },
        { providerMessageId: null },
        { providerMessageId: 'provider-a' },
      ])
      .mockResolvedValueOnce([{ providerMessageId: 'provider-c' }, { providerMessageId: null }]);
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique,
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany,
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 2,
    });
    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 2,
    });

    expect(provider.markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-a'],
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ messageIds: expect.arrayContaining(['provider-c']) }),
    );
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 1 } } }),
    );
  });

  it('never reaches false zero when the only remaining unread message has no provider id', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(conversation({ unreadCount: 3 }))
      .mockResolvedValueOnce(conversation({ unreadCount: 1 }));
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 1 }));
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { providerMessageId: null },
        { providerMessageId: 'provider-b' },
        { providerMessageId: 'provider-a' },
      ])
      .mockResolvedValueOnce([{ providerMessageId: null }]);
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique,
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany,
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 1,
    });
    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 1,
    });

    expect(provider.markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-a', 'provider-b'],
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 2 } } }),
    );
  });

  it('does not send newer ids when the oldest unread message is missing provider id', async () => {
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 3 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { providerMessageId: 'provider-c' },
              { providerMessageId: 'provider-b' },
              { providerMessageId: null },
            ]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 3,
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not reach older inbound messages outside the unread window', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { providerMessageId: 'provider-unread-newest' },
        { providerMessageId: 'provider-unread-middle' },
        { providerMessageId: 'provider-unread-oldest' },
      ]);
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 3 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany,
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await service.markConversationAsRead(conversation().id);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
        where: {
          conversationId: conversation().id,
          direction: 'INBOUND',
        },
      }),
    );
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-unread-oldest', 'provider-unread-middle', 'provider-unread-newest'],
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ messageIds: expect.arrayContaining(['provider-read-497']) }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 3 } } }),
    );
  });

  it('processes large unread windows in sequential batches without relying on a second open', async () => {
    const messages = Array.from({ length: 150 }, (_, index) => ({
      providerMessageId: `provider-${150 - index}`,
    }));
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 150 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(messages),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await service.markConversationAsRead(conversation().id);

    expect(provider.markMessagesAsRead).toHaveBeenCalledTimes(2);
    expect(provider.markMessagesAsRead).toHaveBeenNthCalledWith(1, 'instance-token', {
      messageIds: Array.from({ length: 100 }, (_, index) => `provider-${index + 1}`),
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(provider.markMessagesAsRead).toHaveBeenNthCalledWith(2, 'instance-token', {
      messageIds: Array.from({ length: 50 }, (_, index) => `provider-${index + 101}`),
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 150 } } }),
    );
  });

  it('stops sequential batches after a failure and decrements only confirmed prefix batches', async () => {
    const markMessagesAsRead = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('provider timeout'));
    const messages = Array.from({ length: 250 }, (_, index) => ({
      providerMessageId: `provider-${250 - index}`,
    }));
    const { service, prisma } = serviceFactory({
      providerOverrides: { markMessagesAsRead },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 250 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation({ unreadCount: 150 })),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(messages),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 150,
    });
    expect(markMessagesAsRead).toHaveBeenCalledTimes(2);
    expect(markMessagesAsRead).toHaveBeenNthCalledWith(1, 'instance-token', {
      messageIds: Array.from({ length: 100 }, (_, index) => `provider-${index + 1}`),
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(markMessagesAsRead).toHaveBeenNthCalledWith(2, 'instance-token', {
      messageIds: Array.from({ length: 100 }, (_, index) => `provider-${index + 101}`),
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(markMessagesAsRead).not.toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ messageIds: expect.arrayContaining(['provider-201']) }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 100 } } }),
    );
  });

  it('keeps failed batch and new inbound messages unread after a partial batch failure', async () => {
    const markMessagesAsRead = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('provider timeout'));
    const messages = Array.from({ length: 150 }, (_, index) => ({
      providerMessageId: `provider-${150 - index}`,
    }));
    const { service, prisma } = serviceFactory({
      providerOverrides: { markMessagesAsRead },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 150 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation({ unreadCount: 51 })),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue(messages),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 51,
    });
    expect(markMessagesAsRead).toHaveBeenCalledTimes(2);
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 100 } } }),
    );
  });

  it('keeps a new inbound message unread when it arrives during provider markread', async () => {
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 1 }));
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 3 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { providerMessageId: 'provider-c' },
              { providerMessageId: 'provider-b' },
              { providerMessageId: 'provider-a' },
            ]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 1,
    });
    expect(provider.markMessagesAsRead).toHaveBeenCalledWith('instance-token', {
      messageIds: ['provider-a', 'provider-b', 'provider-c'],
      phone: defaultKiragoReadReceiptPhone,
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: { decrement: 3 } } }),
    );
  });

  it('dedupes concurrent markread calls for the same conversation', async () => {
    const markMessagesAsRead = vi.fn().mockResolvedValue(undefined);
    const { service, provider } = serviceFactory({
      providerOverrides: { markMessagesAsRead },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ unreadCount: 1 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation({ unreadCount: 0 })),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ providerMessageId: 'provider-inbound-1' }]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    const first = service.markConversationAsRead(conversation().id);
    const second = service.markConversationAsRead(conversation().id);
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    expect(provider.markMessagesAsRead).toHaveBeenCalledTimes(1);
  });

  it('keeps unread count when markread provider fails or no provider ids exist', async () => {
    const unreadConversation = conversation({ unreadCount: 2 });
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const { service, provider } = serviceFactory({
      providerOverrides: {
        markMessagesAsRead: vi.fn().mockRejectedValue(new Error('provider unavailable')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(unreadConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([{ providerMessageId: 'provider-inbound-1' }]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 2,
    });
    expect(provider.markMessagesAsRead).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not call markread provider when unread is zero or provider ids are missing', async () => {
    const update = vi.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ unreadCount: 0 }))
            .mockResolvedValueOnce(conversation({ unreadCount: 2 })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update,
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 0,
    });
    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 2,
    });
    expect(provider.markMessagesAsRead).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resolves conversations idempotently without clearing unread count', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi
            .fn()
            .mockResolvedValueOnce(conversation({ status: 'RESOLVED', unreadCount: 2 }))
            .mockResolvedValueOnce(conversation({ status: 'RESOLVED', unreadCount: 2 })),
        },
      },
    });

    await expect(service.resolveConversation(conversation().id)).resolves.toMatchObject({
      status: 'RESOLVED',
      unreadCount: 2,
    });
    await expect(service.resolveConversation(conversation().id)).resolves.toMatchObject({
      status: 'RESOLVED',
      unreadCount: 2,
    });
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { status: 'RESOLVED' } }),
    );
  });

  it('links a guest conversation to an existing client without changing conversation history fields', async () => {
    const linkedConversation = conversation({
      clientId: client().id,
      client: client(),
      status: 'RESOLVED',
      unreadCount: 3,
      lastMessagePreview: 'Historico preservado',
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ clientId: null, client: null, unreadCount: 3 }))
            .mockResolvedValueOnce(conversation({ clientId: client().id, client: client() }))
            .mockResolvedValueOnce(linkedConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    const result = await service.linkConversationClient(
      conversation().id,
      { clientId: client().id },
      'actor-user-id',
    );
    const updateManyArgs = (prisma.whatsAppConversation.updateMany as MockWithCalls).mock
      .calls[0]?.[0] as { where?: Record<string, unknown>; data?: Record<string, unknown> };
    const eventArgs = (prisma.clientEvent.create as MockWithCalls).mock.calls[0]?.[0] as {
      data?: Record<string, unknown>;
    };

    expect(result).toMatchObject({
      client: { id: client().id, name: client().name },
      displayName: client().name,
      status: 'RESOLVED',
      unreadCount: 3,
      lastMessagePreview: 'Historico preservado',
    });
    expect(updateManyArgs).toEqual({
      where: { id: conversation().id, clientId: null },
      data: { clientId: client().id },
    });
    expect(JSON.stringify(updateManyArgs.data)).not.toContain('phone');
    expect(eventArgs.data).toMatchObject({
      clientId: client().id,
      type: 'CLIENT_UPDATED',
      title: 'Conversa WhatsApp vinculada manualmente.',
      createdByUserId: 'actor-user-id',
      metadata: expect.objectContaining({
        source: 'MANUAL_LINK',
        conversationId: conversation().id,
        clientId: client().id,
        phoneNormalized: conversation().phoneNormalized,
      }),
    });
  });

  it('returns 404 when manually linking a missing conversation or missing client', async () => {
    const missingConversation = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(
      missingConversation.service.linkConversationClient(
        conversation().id,
        { clientId: client().id },
        'actor-user-id',
      ),
    ).rejects.toThrow(NotFoundException);

    const missingClient = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation({ clientId: null, client: null })),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(
      missingClient.service.linkConversationClient(
        conversation().id,
        { clientId: client().id },
        'actor-user-id',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('treats linking to the same client as idempotent without duplicating audit events', async () => {
    const linkedConversation = conversation({ clientId: client().id, client: client() });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(linkedConversation)
            .mockResolvedValueOnce(linkedConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(
      service.linkConversationClient(conversation().id, { clientId: client().id }, 'actor-user-id'),
    ).resolves.toMatchObject({ client: { id: client().id } });
    expect(prisma.whatsAppConversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });

  it('rejects relinking to another client with CONVERSATION_ALREADY_LINKED details', async () => {
    const otherClient = client({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Cliente Atual',
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              clientId: otherClient.id,
              client: otherClient,
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(
      service.linkConversationClient(conversation().id, { clientId: client().id }, 'actor-user-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONVERSATION_ALREADY_LINKED',
        currentClientId: otherClient.id,
        currentClientName: otherClient.name,
      }),
    });
    expect(prisma.whatsAppConversation.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });

  it('handles concurrent manual links without last-write-wins', async () => {
    const winningClient = client({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Cliente Vencedor',
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(conversation({ clientId: null, client: null }))
            .mockResolvedValueOnce(
              conversation({
                clientId: winningClient.id,
                client: winningClient,
              }),
            ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(
      service.linkConversationClient(conversation().id, { clientId: client().id }, 'actor-user-id'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CONVERSATION_ALREADY_LINKED',
        currentClientId: winningClient.id,
        currentClientName: winningClient.name,
      }),
    });
    expect(prisma.whatsAppConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: conversation().id, clientId: null } }),
    );
    expect(prisma.clientEvent.create).not.toHaveBeenCalled();
  });

  it('clears auto-reply follow-up only in successful manual send paths', () => {
    const segment = (start: string, end: string) =>
      whatsAppServiceSource.slice(
        whatsAppServiceSource.indexOf(start),
        whatsAppServiceSource.indexOf(end),
      );

    expect(segment('async sendConversationTextMessage', 'async setConversationPresence')).toContain(
      'needsManualFollowUp: false',
    );
    expect(
      segment('async sendConversationMediaMessage', 'async sendConversationVoiceMessage'),
    ).toContain('needsManualFollowUp: false');
    expect(
      segment('async sendConversationVoiceMessage', 'async retryConversationMessage'),
    ).toContain('needsManualFollowUp: false');
    expect(segment('async retryConversationMessage', 'async linkConversationClient')).toContain(
      'needsManualFollowUp: false',
    );
    expect(
      segment('async editConversationMessage', 'private async withMessageEditLock'),
    ).not.toContain('needsManualFollowUp');
    expect(
      segment('private async processMessageReceiptWebhook', 'private buildReceiptStatusUpdate'),
    ).not.toContain('needsManualFollowUp');
  });

  it('sends a manual TEXT message through the conversation connection and persists SENT history', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const otherConnection = connection({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
      providerTokenEncrypted: 'wrong-token',
    });
    const conversationRecord = conversation({
      whatsAppConnectionId: activeConnection.id,
      status: 'RESOLVED',
      unreadCount: 4,
      whatsAppConnection: activeConnection,
    });
    const createMessage = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(conversationMessage(args.data)),
    );
    const updateMessage = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(
        conversationMessage({
          ...args.data,
          id: conversationMessage().id,
          conversationId: conversationRecord.id,
          whatsAppConnectionId: activeConnection.id,
          requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
          direction: 'OUTBOUND',
          type: 'TEXT',
          text: 'Ola pelo CRM',
        }),
      ),
    );
    const { service, prisma, provider, encryption, realtime } = serviceFactory({
      currentConnection: otherConnection,
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversationRecord),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversationRecord),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: createMessage,
          update: updateMessage,
        },
      },
    });

    const result = await service.sendConversationTextMessage(conversationRecord.id, {
      body: '  Ola pelo CRM  ',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });

    expect(encryption.decrypt).toHaveBeenCalledWith(activeConnection.providerTokenEncrypted);
    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: conversationRecord.phoneNormalized,
      body: 'Ola pelo CRM',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: conversationRecord.id,
          whatsAppConnectionId: activeConnection.id,
          direction: 'OUTBOUND',
          type: 'TEXT',
          status: 'PENDING',
          text: 'Ola pelo CRM',
          isFromMe: true,
          requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
        }),
      }),
    );
    expect(createMessage.mock.invocationCallOrder[0]).toBeLessThan(
      provider.sendText.mock.invocationCallOrder[0]!,
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: conversationRecord.id },
        data: expect.objectContaining({
          lastMessagePreview: 'Ola pelo CRM',
          needsManualFollowUp: false,
        }),
      }),
    );
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unreadCount: expect.anything(), status: 'OPEN' }),
      }),
    );
    expect(result).toMatchObject({
      direction: 'OUTBOUND',
      type: 'TEXT',
      status: 'SENT',
      text: 'Ola pelo CRM',
      providerMessageId: 'provider-id',
    });
    expect(result).not.toHaveProperty('rawMetadata');
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      conversationRecord.id,
      conversationMessage().id,
      'OUTBOUND',
    );
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversationRecord.id);
  });

  it('sends a manual TEXT reply using providerMessageId as StanzaId and persists quote fields', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const conversationRecord = conversation({
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
    });
    const original = conversationMessage({
      id: '88888888-8888-4888-8888-888888888888',
      conversationId: conversationRecord.id,
      whatsAppConnectionId: activeConnection.id,
      providerMessageId: 'original-provider-id',
      direction: 'INBOUND',
      text: 'Mensagem original',
    });
    const createMessage = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(conversationMessage(args.data)),
    );
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversationRecord),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversationRecord),
        },
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(original),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: createMessage,
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(
              conversationMessage({ ...args.data, ...createMessage.mock.calls[0]?.[0]?.data }),
            ),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await service.sendConversationTextMessage(conversationRecord.id, {
      body: 'Resposta',
      requestId: 'reply-request-id',
      replyToMessageId: original.id,
    });

    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: conversationRecord.phoneNormalized,
      body: 'Resposta',
      requestId: 'reply-request-id',
      reply: {
        stanzaId: 'original-provider-id',
        participant: '5544999999999@s.whatsapp.net',
        quotedText: 'Mensagem original',
      },
    });
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          replyToMessageId: original.id,
          replyToProviderMessageId: 'original-provider-id',
          quotedText: 'Mensagem original',
        }),
      }),
    );
  });

  it('rejects manual replies to another conversation or messages without providerMessageId', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const conversationRecord = conversation({
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
    });
    const { service, provider, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversationRecord),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversationRecord),
        },
        whatsAppMessage: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(
              conversationMessage({
                id: '88888888-8888-4888-8888-888888888888',
                conversationId: '77777777-7777-4777-8777-777777777777',
                whatsAppConnectionId: activeConnection.id,
              }),
            )
            .mockResolvedValueOnce(
              conversationMessage({
                id: '88888888-8888-4888-8888-888888888888',
                conversationId: conversationRecord.id,
                whatsAppConnectionId: activeConnection.id,
                providerMessageId: null,
              }),
            ),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(conversationMessage()),
          update: vi.fn().mockResolvedValue(conversationMessage()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      },
    });

    await expect(
      service.sendConversationTextMessage(conversationRecord.id, {
        body: 'Resposta',
        requestId: 'reply-request-id-1',
        replyToMessageId: '88888888-8888-4888-8888-888888888888',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.sendConversationTextMessage(conversationRecord.id, {
        body: 'Resposta',
        requestId: 'reply-request-id-2',
        replyToMessageId: '88888888-8888-4888-8888-888888888888',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider.sendText).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('returns an existing manual conversation message for repeated requestId without resending', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const existing = conversationMessage({
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      direction: 'OUTBOUND',
      status: 'SENT',
      text: 'Mensagem enviada',
    });
    const { service, prisma, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnectionId: activeConnection.id,
              whatsAppConnection: activeConnection,
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    await expect(
      service.sendConversationTextMessage(conversation().id, {
        body: 'Mensagem enviada',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      }),
    ).resolves.toMatchObject({ id: existing.id, status: 'SENT' });

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('keeps repeated FAILED requestId idempotent without automatic retry', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      direction: 'OUTBOUND',
      status: 'FAILED',
      text: 'Mensagem falhou',
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnectionId: activeConnection.id,
              whatsAppConnection: activeConnection,
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(failed),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
        },
      },
    });

    await expect(
      service.sendConversationTextMessage(conversation().id, {
        body: 'Mensagem falhou',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      }),
    ).resolves.toMatchObject({ id: failed.id, status: 'FAILED' });

    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('marks manual conversation message as FAILED with sanitized metadata when provider fails', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const updateMessage = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(
        conversationMessage({
          ...args.data,
          conversationId: conversation().id,
          whatsAppConnectionId: activeConnection.id,
          direction: 'OUTBOUND',
          text: 'Falhar',
        }),
      ),
    );
    const { service, prisma, realtime } = serviceFactory({
      providerOverrides: {
        sendText: vi.fn().mockRejectedValue(new Error('falha token=secret-value')),
      },
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnectionId: activeConnection.id,
              whatsAppConnection: activeConnection,
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn().mockResolvedValue(
            conversationMessage({
              conversationId: conversation().id,
              whatsAppConnectionId: activeConnection.id,
              direction: 'OUTBOUND',
              status: 'PENDING',
              text: 'Falhar',
            }),
          ),
          update: updateMessage,
        },
      },
    });

    const result = await service.sendConversationTextMessage(conversation().id, {
      body: 'Falhar',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    const updateArgs = (prisma.whatsAppMessage.update as MockWithCalls).mock.calls[0]?.[0] as {
      data?: { rawMetadata?: unknown };
    };

    expect(result).toMatchObject({ status: 'FAILED', failedAt: expect.any(Date) });
    expect(JSON.stringify(updateArgs.data?.rawMetadata)).toContain('token=[redacted]');
    expect(JSON.stringify(updateArgs.data?.rawMetadata)).not.toContain('secret-value');
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(conversation().id, result.id);
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
  });

  it('retries a FAILED outbound TEXT message on the same row with a new requestId', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      requestId: 'old-request-id',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Mensagem falhou',
      status: 'FAILED',
      providerMessageId: null,
      rawMetadata: { source: 'manual_outbound_send' },
    });
    const updateMessage = vi.fn((args: { data?: Record<string, unknown> }) =>
      Promise.resolve(conversationMessage({ ...failed, ...args.data })),
    );
    const { service, prisma, provider, realtime } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: updateMessage,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const result = await service.retryConversationMessage(failed.id);
    const pendingUpdate = (prisma.whatsAppMessage.updateMany as MockWithCalls).mock
      .calls[0]?.[0] as {
      data?: { requestId?: string };
    };

    expect(pendingUpdate.data?.requestId).toEqual(expect.any(String));
    expect(pendingUpdate.data?.requestId).not.toBe('old-request-id');
    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: conversation().phoneNormalized,
      body: 'Mensagem falhou',
      requestId: pendingUpdate.data?.requestId,
    });
    expect(result).toMatchObject({ id: failed.id, status: 'SENT', retryAction: null });
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(conversation().id, failed.id);
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversation().id);
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ needsManualFollowUp: false }),
      }),
    );
  });

  it('preserves reply context when retrying a FAILED outbound TEXT reply', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const conversationRecord = conversation();
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversationRecord.id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversationRecord,
      requestId: 'old-request-id',
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Mensagem reply falhou',
      status: 'FAILED',
      providerMessageId: null,
      replyToMessageId: '88888888-8888-4888-8888-888888888888',
      replyToProviderMessageId: 'original-provider-id',
      quotedText: 'Mensagem original',
      rawMetadata: { source: 'manual_outbound_send' },
    });
    const updateMessage = vi.fn((args: { data?: Record<string, unknown> }) =>
      Promise.resolve(conversationMessage({ ...failed, ...args.data })),
    );
    const { service, prisma, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: updateMessage,
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversationRecord),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversationRecord),
        },
      },
    });

    await service.retryConversationMessage(failed.id);
    const pendingUpdate = (prisma.whatsAppMessage.updateMany as MockWithCalls).mock
      .calls[0]?.[0] as {
      data?: { requestId?: string };
    };

    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: conversationRecord.phoneNormalized,
      body: 'Mensagem reply falhou',
      requestId: pendingUpdate.data?.requestId,
      reply: {
        stanzaId: 'original-provider-id',
        participant: '5544999999999@s.whatsapp.net',
        quotedText: 'Mensagem original',
      },
    });
  });

  it('retries FAILED outbound IMAGE from private local media without exposing storage key', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      requestId: 'old-request-id',
      direction: 'OUTBOUND',
      type: 'IMAGE',
      text: 'Legenda',
      status: 'FAILED',
      providerMessageId: null,
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'foto.jpg',
      rawMetadata: {
        source: 'manual_outbound_media_send',
        localMedia: {
          storageKey: `${activeConnection.id}/99999999-9999-4999-8999-999999999999/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        },
      },
    });
    const { service, prisma, provider, mediaStorage } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(Buffer.from('image-bytes')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...failed, ...args.data })),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    const result = await service.retryConversationMessage(failed.id);

    expect(mediaStorage.read).toHaveBeenCalledWith(
      `${activeConnection.id}/99999999-9999-4999-8999-999999999999/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    );
    expect(provider.sendImage).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({
        phone: conversation().phoneNormalized,
        imageDataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
        caption: 'Legenda',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('storageKey');
    expect(result).toMatchObject({ status: 'SENT' });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'DOCUMENT',
      type: 'DOCUMENT',
      mimeType: 'application/pdf',
      fileName: 'boleto.pdf',
      source: 'manual_outbound_media_send',
      providerMethod: 'sendDocument',
      expectedPayload: {
        documentDataUrl: expect.stringMatching(/^data:application\/octet-stream;base64,/),
        fileName: 'boleto.pdf',
      },
    },
    {
      label: 'ZIP DOCUMENT',
      type: 'DOCUMENT',
      mimeType: 'application/zip',
      fileName: 'arquivos.zip',
      source: 'manual_outbound_media_send',
      providerMethod: 'sendDocument',
      expectedPayload: {
        documentDataUrl: expect.stringMatching(/^data:application\/octet-stream;base64,/),
        fileName: 'arquivos.zip',
      },
    },
    {
      label: 'VIDEO FILE',
      type: 'VIDEO',
      mimeType: 'video/mp4',
      fileName: 'video.mp4',
      source: 'manual_outbound_media_send',
      providerMethod: 'sendVideo',
      expectedPayload: {
        videoDataUrl: expect.stringMatching(/^data:video\/mp4;base64,/),
        caption: null,
        mimeType: 'video/mp4',
      },
    },
    {
      label: 'AUDIO FILE',
      type: 'AUDIO',
      mimeType: 'audio/mpeg',
      fileName: 'audio.mp3',
      source: 'manual_outbound_media_send',
      providerMethod: 'sendAudio',
      expectedPayload: {
        audioDataUrl: expect.stringMatching(/^data:audio\/mpeg;base64,/),
        mimeType: 'audio/mpeg',
        ptt: false,
      },
    },
    {
      label: 'VOICE NOTE',
      type: 'AUDIO',
      mimeType: 'audio/ogg; codecs=opus',
      fileName: 'voice-note.ogg',
      source: 'manual_outbound_voice_send',
      providerMethod: 'sendAudio',
      expectedPayload: {
        audioDataUrl: expect.stringMatching(/^data:audio\/ogg; codecs=opus;base64,/),
        mimeType: 'audio/ogg; codecs=opus',
        ptt: true,
      },
    },
  ] as const)('retries FAILED outbound $label from stored local media', async (variant) => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      id: '99999999-9999-4999-8999-999999999999',
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      requestId: 'old-request-id',
      direction: 'OUTBOUND',
      type: variant.type,
      text: variant.type === 'DOCUMENT' ? 'Documento' : null,
      status: 'FAILED',
      providerMessageId: null,
      mediaMimeType: variant.mimeType,
      mediaFileName: variant.fileName,
      mediaDurationSeconds: variant.type === 'AUDIO' ? 3 : null,
      rawMetadata: {
        source: variant.source,
        localMedia: {
          storageKey: `${activeConnection.id}/99999999-9999-4999-8999-999999999999/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: variant.mimeType,
          sizeBytes: 10,
        },
      },
    });
    const { service, provider } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(Buffer.from('media-bytes')),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn((args: { data?: Record<string, unknown> }) =>
            Promise.resolve(conversationMessage({ ...failed, ...args.data })),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(conversation()),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    await expect(service.retryConversationMessage(failed.id)).resolves.toMatchObject({
      status: 'SENT',
    });

    expect(provider[variant.providerMethod]).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({
        phone: conversation().phoneNormalized,
        ...variant.expectedPayload,
      }),
    );
  });

  it('keeps FAILED status when retry media metadata exists but the private file is missing', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      status: 'FAILED',
      mediaMimeType: 'application/pdf',
      mediaFileName: 'boleto.pdf',
      rawMetadata: {
        source: 'manual_outbound_media_send',
        localMedia: {
          storageKey: `${activeConnection.id}/99999999-9999-4999-8999-999999999999/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
          mimeType: 'application/pdf',
          sizeBytes: 10,
        },
      },
    });
    const { service, provider } = serviceFactory({
      mediaStorageOverrides: {
        read: vi.fn().mockResolvedValue(null),
      },
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(failed),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    await expect(service.retryConversationMessage(failed.id)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(provider.sendDocument).not.toHaveBeenCalled();
  });

  it('does not double send when a concurrent retry already moved the message out of FAILED', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const failed = conversationMessage({
      conversationId: conversation().id,
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      conversation: conversation(),
      direction: 'OUTBOUND',
      type: 'TEXT',
      text: 'Mensagem falhou',
      status: 'FAILED',
    });
    const pending = conversationMessage({
      ...failed,
      status: 'PENDING',
      requestId: 'new-request-id',
    });
    const { service, provider } = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(pending),
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    });

    await expect(service.retryConversationMessage(failed.id)).resolves.toMatchObject({
      status: 'PENDING',
    });
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('blocks retry for inbound, SENT and non-operational connection messages', async () => {
    const inbound = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(conversationMessage({ direction: 'INBOUND' })),
        },
      },
    });
    const sent = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(conversationMessage({ direction: 'OUTBOUND' })),
        },
      },
    });
    const disconnected = serviceFactory({
      prismaOverrides: {
        whatsAppMessage: {
          findUnique: vi.fn().mockResolvedValue(
            conversationMessage({
              direction: 'OUTBOUND',
              status: 'FAILED',
              whatsAppConnection: connection({ status: 'DISCONNECTED' }),
              conversation: conversation(),
            }),
          ),
        },
      },
    });

    await expect(
      inbound.service.retryConversationMessage(conversationMessage().id),
    ).rejects.toThrow(ConflictException);
    await expect(sent.service.retryConversationMessage(conversationMessage().id)).rejects.toThrow(
      ConflictException,
    );
    await expect(
      disconnected.service.retryConversationMessage(conversationMessage().id),
    ).rejects.toThrow(ConflictException);
  });

  it('starts a new client conversation and sends the first outbound without unread increment', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const createdConversation = conversation({
      whatsAppConnectionId: activeConnection.id,
      whatsAppConnection: activeConnection,
      clientId: client().id,
      client: client(),
      contactName: null,
      status: 'OPEN',
    });
    const createMessage = vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve(
        conversationMessage({
          ...args.data,
          conversationId: createdConversation.id,
          whatsAppConnectionId: activeConnection.id,
          requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
          direction: 'OUTBOUND',
          status: 'PENDING',
          text: 'Primeira mensagem',
        }),
      ),
    );
    const { service, prisma, provider } = serviceFactory({
      currentConnection: activeConnection,
      prismaOverrides: {
        whatsAppConnection: {
          findFirst: vi.fn().mockResolvedValue(activeConnection),
          findUnique: vi.fn().mockResolvedValue(activeConnection),
          create: vi.fn(),
          update: vi.fn(),
        },
        whatsAppConversation: {
          findUnique: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(createdConversation)
            .mockResolvedValueOnce(createdConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(createdConversation),
          update: vi.fn().mockResolvedValue(createdConversation),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        whatsAppMessage: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          create: createMessage,
          update: vi.fn((args: { data: Record<string, unknown> }) =>
            Promise.resolve(
              conversationMessage({
                ...args.data,
                conversationId: createdConversation.id,
                whatsAppConnectionId: activeConnection.id,
                direction: 'OUTBOUND',
                text: 'Primeira mensagem',
              }),
            ),
          ),
        },
      },
    });

    const result = await service.startConversation(
      {
        whatsAppConnectionId: activeConnection.id,
        clientId: client().id,
        body: ' Primeira mensagem ',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      },
      'actor-user-id',
    );
    const conversationCreate = (prisma.whatsAppConversation.create as MockWithCalls).mock
      .calls[0]?.[0] as { data?: Record<string, unknown> };

    expect(conversationCreate.data).toMatchObject({
      whatsAppConnectionId: activeConnection.id,
      clientId: client().id,
      phone: client().phoneNormalized,
      phoneNormalized: client().phoneNormalized,
      status: 'OPEN',
      unreadCount: 0,
    });
    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: client().phoneNormalized,
      body: 'Primeira mensagem',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastMessagePreview: 'Primeira mensagem' }),
      }),
    );
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unreadCount: expect.anything() }),
      }),
    );
    expect(result).toMatchObject({
      reusedConversation: false,
      clientLinked: false,
      conversation: { id: createdConversation.id, displayName: client().name },
      message: { direction: 'OUTBOUND', text: 'Primeira mensagem' },
    });
  });

  it('rejects start when an existing phone conversation belongs to another client', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const existing = conversation({
      whatsAppConnectionId: activeConnection.id,
      clientId: 'different-client-id',
      client: client({ id: 'different-client-id', name: 'Outro Cliente' }),
      whatsAppConnection: activeConnection,
    });
    const { service, provider, prisma } = serviceFactory({
      currentConnection: activeConnection,
      prismaOverrides: {
        whatsAppConnection: {
          findFirst: vi.fn().mockResolvedValue(activeConnection),
          findUnique: vi.fn().mockResolvedValue(activeConnection),
        },
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(existing),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    });

    await expect(
      service.startConversation(
        {
          whatsAppConnectionId: activeConnection.id,
          clientId: client().id,
          body: 'Oi',
          requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
        },
        'actor-user-id',
      ),
    ).rejects.toThrow(ConflictException);

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(prisma.whatsAppConversation.create).not.toHaveBeenCalled();
  });

  it('rejects manual conversation sends for missing conversation, blank body and inactive connection', async () => {
    const activeConnection = connection({
      status: 'CONNECTED',
      connected: true,
      loggedIn: true,
    });
    const missing = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });
    const inactive = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(
            conversation({
              whatsAppConnectionId: activeConnection.id,
              whatsAppConnection: connection({
                ...activeConnection,
                status: 'DISCONNECTED',
                connected: false,
              }),
            }),
          ),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(conversation()),
          update: vi.fn().mockResolvedValue(conversation()),
        },
      },
    });

    await expect(
      missing.service.sendConversationTextMessage('missing-conversation', { body: 'Oi' }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      inactive.service.sendConversationTextMessage(conversation().id, { body: 'Oi' }),
    ).rejects.toThrow(ConflictException);
    await expect(
      inactive.service.sendConversationTextMessage(conversation().id, { body: '   ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('summarizes the waitlist badge from PENDENTE contacts only', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppPendingContact: {
          upsert: vi.fn(),
          update: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1).mockResolvedValueOnce(2),
        },
      },
    });

    const result = await service.pendingContactsSummary();

    expect(result).toEqual({ pending: 3, approvedToday: 1, ignored: 2 });
    expect(prisma.whatsAppPendingContact.count).toHaveBeenNthCalledWith(1, {
      where: { status: 'PENDENTE' },
    });
  });

  it('approves a pending contact transactionally', async () => {
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const result = await service.approvePendingContact(
      pendingContact().id,
      {
        name: 'Lucas',
        reference: 'lucas001',
        planId: '55555555-5555-4555-8555-555555555555',
        recurringValue: 50,
        dueDate: '2026-10-10',
        billingNoticeDays: 0,
        generateInitialReceivable: true,
        sendPixWhatsAppNow: false,
      },
      'user-id',
    );

    expect(result.reference).toBe('CLI-1');
    expect(result.initialActivation).toMatchObject({
      initialReceivableId: 'initial-receivable-id',
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('approves a pending contact without initial receivable when requested', async () => {
    const { service } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const result = await service.approvePendingContact(
      pendingContact().id,
      {
        name: 'Lucas',
        reference: 'lucas001',
        planId: '55555555-5555-4555-8555-555555555555',
        recurringValue: 50,
        dueDate: '2026-10-10',
        billingNoticeDays: 0,
        generateInitialReceivable: false,
        sendPixWhatsAppNow: false,
      },
      'user-id',
    );

    expect(result.initialActivation).toMatchObject({
      message: 'Cliente cadastrado aguardando primeiro pagamento.',
    });
  });

  it('allows approval when another client already uses the same phone', async () => {
    const { service } = serviceFactory();

    await expect(
      service.approvePendingContact(
        pendingContact().id,
        {
          name: 'Lucas',
          reference: 'lucas001',
          planId: '55555555-5555-4555-8555-555555555555',
          recurringValue: 50,
          dueDate: '2026-10-10',
          billingNoticeDays: 0,
          generateInitialReceivable: false,
        },
        'user-id',
      ),
    ).resolves.toMatchObject({ phoneNormalized: '5544999999999' });
  });

  it('preserves approved client and initial receivable when PIX generation fails', async () => {
    const { service, finance } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });
    finance.createReceivablePix.mockRejectedValue(new Error('provider offline'));

    const result = await service.approvePendingContact(
      pendingContact().id,
      {
        name: 'Lucas',
        reference: 'lucas001',
        planId: '55555555-5555-4555-8555-555555555555',
        recurringValue: 50,
        dueDate: '2026-10-10',
        billingNoticeDays: 0,
        generateInitialReceivable: true,
        sendPixWhatsAppNow: true,
      },
      'user-id',
    );

    expect(result.initialActivation).toMatchObject({
      initialReceivableId: 'initial-receivable-id',
      warning: 'Cliente cadastrado e cobranca criada, mas nao foi possivel gerar/enviar o PIX.',
    });
  });

  it('preserves approved client and initial receivable when WhatsApp send fails', async () => {
    const { service, finance } = serviceFactory({
      currentConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      providerOverrides: {
        sendText: vi.fn().mockRejectedValue(new Error('kirago offline')),
      },
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      },
    });
    finance.createReceivablePix.mockResolvedValue({
      id: 'intent-id',
      receivableId: 'initial-receivable-id',
      provider: 'MOCK',
      providerTransactionId: 'provider-id',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      amount: '50.00',
      pixCopyPaste: 'PIX-COPIA-E-COLA',
      qrCodeData: null,
      expiresAt: null,
      paidAt: null,
      lastSyncAt: null,
      failureCode: null,
      failureMessage: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const result = await service.approvePendingContact(
      pendingContact().id,
      {
        name: 'Lucas',
        reference: 'lucas001',
        planId: '55555555-5555-4555-8555-555555555555',
        recurringValue: 50,
        dueDate: '2026-10-10',
        billingNoticeDays: 0,
        generateInitialReceivable: true,
        sendPixWhatsAppNow: true,
      },
      'user-id',
    );

    expect(result.initialActivation).toMatchObject({
      initialReceivableId: 'initial-receivable-id',
      paymentIntentId: 'intent-id',
      warning: 'Cliente cadastrado e cobranca criada, mas nao foi possivel gerar/enviar o PIX.',
    });
  });

  it('does not approve a pending contact when client creation fails', async () => {
    const pendingUpdate = vi.fn();
    const { service } = serviceFactory({
      prismaOverrides: {
        client: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        $transaction: vi.fn(async (input: unknown) => {
          const callback = input as (tx: unknown) => Promise<unknown>;
          return callback({
            client: {
              create: vi.fn().mockRejectedValue(new Error('client create failed')),
            },
            whatsAppPendingContact: {
              update: pendingUpdate,
            },
            whatsAppInboundMessage: {
              updateMany: vi.fn(),
            },
            clientEvent: {
              create: vi.fn(),
            },
          });
        }),
      },
    });

    await expect(
      service.approvePendingContact(
        pendingContact().id,
        {
          name: 'Lucas',
          reference: 'lucas001',
          planId: '55555555-5555-4555-8555-555555555555',
          recurringValue: 50,
          dueDate: '2026-10-10',
          billingNoticeDays: 0,
          generateInitialReceivable: false,
        },
        'user-id',
      ),
    ).rejects.toThrow('client create failed');
    expect(pendingUpdate).not.toHaveBeenCalled();
  });

  it('forwards the current TEXT content to a same-connection target without mutating the source', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      phone: '5511999999999',
      phoneNormalized: '5511999999999',
      needsManualFollowUp: true,
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const original = conversationMessage({
      id: '12121212-1212-4121-8121-121212121212',
      text: 'Texto atual editado',
      editedAt: now,
    });
    const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { service, prisma, provider, realtime } = serviceFactory();

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    prisma.whatsAppMessage.update.mockImplementation((args: { data?: Record<string, unknown> }) =>
      Promise.resolve(
        conversationMessage({
          conversationId: target.id,
          direction: 'OUTBOUND',
          rawMetadata: {
            source: 'forward',
            forwardedFromConversationId: source.id,
            forwardedFromMessageId: original.id,
          },
          ...(args.data ?? {}),
        }),
      ),
    );

    const result = await service.forwardConversationMessage(source.id, original.id, {
      targetConversationId: target.id,
      requestId,
    });

    expect(provider.sendText).toHaveBeenCalledWith('instance-token', {
      phone: target.phoneNormalized,
      body: 'Texto atual editado',
      requestId,
    });
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: target.id,
          direction: 'OUTBOUND',
          type: 'TEXT',
          text: 'Texto atual editado',
          requestId,
          rawMetadata: {
            source: 'forward',
            forwardedFromConversationId: source.id,
            forwardedFromMessageId: original.id,
          },
        }),
      }),
    );
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: target.id },
        data: expect.objectContaining({ needsManualFollowUp: false }),
      }),
    );
    expect(realtime.emitMessageCreated).toHaveBeenCalledWith(
      target.id,
      expect.any(String),
      'OUTBOUND',
    );
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(target.id);
    expect(realtime.emitConversationUpdated).not.toHaveBeenCalledWith(source.id);
    expect(result).toMatchObject({ direction: 'OUTBOUND', isForwarded: true });
    expect(JSON.stringify(result)).not.toContain(source.id);
    expect(JSON.stringify(result)).not.toContain(original.id);
    expect(original).toMatchObject({ conversationId: source.id, text: 'Texto atual editado' });
  });

  it.each([
    ['IMAGE', 'image/jpeg', 'foto.jpg', 'sendImage'],
    ['VIDEO', 'video/mp4', 'video.mp4', 'sendVideo'],
    ['AUDIO', 'audio/ogg', 'audio.ogg', 'sendAudio'],
    ['DOCUMENT', 'application/pdf', 'contrato.pdf', 'sendDocument'],
    ['STICKER', 'image/webp', 'figurinha.webp', 'sendSticker'],
  ] as const)(
    'forwards %s bytes through the existing provider pipeline and preserves internal forward metadata',
    async (type, mimeType, fileName, providerMethod) => {
      const source = conversation();
      const target = conversation({
        id: '77777777-7777-4777-8777-777777777777',
        phoneNormalized: '5511999999999',
        whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
      });
      const bytes = type === 'STICKER' ? webpBytes : Buffer.from(`${type.toLowerCase()}-bytes`);
      const original = conversationMessage({
        type,
        text: type === 'STICKER' ? null : 'Legenda atual',
        mediaMimeType: mimeType,
        mediaFileName: fileName,
        mediaSizeBytes: bytes.length,
        rawMetadata: {
          localMedia: {
            storageKey: `${connection().id}/${conversationMessage().id}/media-source`,
            mimeType,
            sizeBytes: bytes.length,
          },
        },
      });
      const requestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
      const { service, prisma, provider, mediaStorage } = serviceFactory({
        mediaStorageOverrides: { read: vi.fn().mockResolvedValue(bytes) },
      });

      prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
        Promise.resolve(args.where.id === source.id ? source : target),
      );
      prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
      prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
      prisma.whatsAppMessage.update.mockImplementation((args: { data?: Record<string, unknown> }) =>
        Promise.resolve(
          conversationMessage({
            conversationId: target.id,
            direction: 'OUTBOUND',
            type,
            rawMetadata: {
              source: 'forward',
              forwardedFromConversationId: source.id,
              forwardedFromMessageId: original.id,
            },
            ...(args.data ?? {}),
          }),
        ),
      );

      const result = await service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId,
      });

      expect(mediaStorage.read).toHaveBeenCalledOnce();
      expect(provider[providerMethod]).toHaveBeenCalledOnce();
      if (type === 'IMAGE') {
        expect(provider.sendImage).toHaveBeenCalledWith(
          'instance-token',
          expect.objectContaining({
            caption: 'Legenda atual',
            imageDataUrl: expect.stringContaining('data:image/jpeg;base64,'),
            phone: target.phoneNormalized,
            requestId,
          }),
        );
      } else if (type === 'VIDEO') {
        expect(provider.sendVideo).toHaveBeenCalledWith(
          'instance-token',
          expect.objectContaining({ caption: 'Legenda atual', mimeType, requestId }),
        );
      } else if (type === 'AUDIO') {
        expect(provider.sendAudio).toHaveBeenCalledWith(
          'instance-token',
          expect.objectContaining({ mimeType, ptt: false, requestId }),
        );
      } else if (type === 'DOCUMENT') {
        expect(provider.sendDocument).toHaveBeenCalledWith(
          'instance-token',
          expect.objectContaining({ fileName, requestId }),
        );
      } else {
        expect(provider.sendSticker).toHaveBeenCalledWith(
          'instance-token',
          expect.objectContaining({
            requestId,
            sticker: expect.stringContaining('data:image/webp'),
          }),
        );
      }
      expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: target.id,
            type,
            text: type === 'IMAGE' || type === 'VIDEO' ? 'Legenda atual' : null,
            requestId,
            rawMetadata: expect.objectContaining({
              source: 'forward',
              forwardedFromConversationId: source.id,
              forwardedFromMessageId: original.id,
            }),
          }),
        }),
      );
      expect(result).toMatchObject({ direction: 'OUTBOUND', type, isForwarded: true });
    },
  );

  it('preserves PTT semantics when forwarding an existing manual voice note', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const bytes = Buffer.from('ogg-voice-bytes');
    const original = conversationMessage({
      direction: 'OUTBOUND',
      type: 'AUDIO',
      mediaMimeType: 'audio/ogg',
      mediaFileName: 'gravacao.ogg',
      mediaSizeBytes: bytes.length,
      mediaDurationSeconds: 4,
      rawMetadata: {
        source: 'manual_outbound_voice_send',
        localMedia: {
          storageKey: `${connection().id}/${conversationMessage().id}/voice-source`,
          mimeType: 'audio/ogg',
          sizeBytes: bytes.length,
        },
      },
    });
    const { service, prisma, provider } = serviceFactory({
      mediaStorageOverrides: { read: vi.fn().mockResolvedValue(bytes) },
    });

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    await service.forwardConversationMessage(source.id, original.id, {
      targetConversationId: target.id,
      requestId: 'abababab-abab-4aba-8aba-abababababab',
    });

    expect(provider.sendAudio).toHaveBeenCalledWith(
      'instance-token',
      expect.objectContaining({ ptt: true, seconds: 4 }),
    );
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mediaDurationSeconds: 4,
          rawMetadata: expect.objectContaining({ source: 'forward', forwardPtt: true }),
        }),
      }),
    );
  });

  it('returns an idempotent target message for a repeated forward requestId', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const original = conversationMessage();
    const existing = conversationMessage({
      id: '88888888-8888-4888-8888-888888888888',
      conversationId: target.id,
      direction: 'OUTBOUND',
      requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      rawMetadata: {
        source: 'forward',
        forwardedFromConversationId: source.id,
        forwardedFromMessageId: original.id,
      },
    });
    const { service, prisma, provider } = serviceFactory();

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    prisma.whatsAppMessage.findFirst.mockResolvedValue(existing);

    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ).resolves.toMatchObject({ id: existing.id, direction: 'OUTBOUND', isForwarded: true });

    expect(provider.sendText).not.toHaveBeenCalled();
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
  });

  it('rejects a repeated requestId that belongs to another forward or another target', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const original = conversationMessage();
    const existing = conversationMessage({
      conversationId: target.id,
      direction: 'OUTBOUND',
      requestId: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
      rawMetadata: {
        source: 'forward',
        forwardedFromConversationId: source.id,
        forwardedFromMessageId: '12121212-1212-4121-8121-121212121212',
      },
    });
    const { service, prisma, provider } = serviceFactory();

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    prisma.whatsAppMessage.findFirst.mockResolvedValue(existing);

    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: existing.requestId!,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    existing.conversationId = '88888888-8888-4888-8888-888888888888';
    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: existing.requestId!,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('rejects missing source, missing target and an offline destination without creating messages', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const original = conversationMessage();
    const { service, prisma, provider } = serviceFactory();

    prisma.whatsAppConversation.findUnique.mockResolvedValue(null);
    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: 'dededede-dede-4ede-8ede-dededededede',
      }),
    ).rejects.toThrow('Conversa WhatsApp de origem nao encontrada.');

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(null);
    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: 'dddddddd-eeee-4eee-8eee-eeeeeeeeeeee',
      }),
    ).rejects.toThrow('Mensagem WhatsApp nao encontrada.');

    prisma.whatsAppMessage.findUnique.mockResolvedValue(original);
    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : null),
    );
    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: 'dfdfdfdf-dfdf-4fdf-8fdf-dfdfdfdfdfdf',
      }),
    ).rejects.toThrow('Conversa WhatsApp de destino nao encontrada.');

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    target.whatsAppConnection = connection();
    await expect(
      service.forwardConversationMessage(source.id, original.id, {
        targetConversationId: target.id,
        requestId: 'efefefef-efef-4fef-8fef-efefefefefef',
      }),
    ).rejects.toThrow('Conexao WhatsApp da conversa de destino nao esta operacional.');
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('keeps forward metadata through provider echo reconciliation and refresh presentation', () => {
    const forwarded = conversationMessage({
      direction: 'OUTBOUND',
      type: 'IMAGE',
      mediaMimeType: 'image/jpeg',
      rawMetadata: {
        source: 'forward',
        forwardedFromConversationId: conversation().id,
        forwardedFromMessageId: '12121212-1212-4121-8121-121212121212',
        localMedia: {
          storageKey: `${connection().id}/forwarded/image.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: 10,
        },
      },
    });
    const { service } = serviceFactory();
    const privateService = service as unknown as {
      reconciledRawMetadataUpdate: (
        current: Prisma.JsonValue | null,
        normalized: ReturnType<typeof normalizedInbound>,
      ) => { rawMetadata?: Prisma.InputJsonValue };
      presentConversationMessage: (message: ReturnType<typeof conversationMessage>) => {
        isForwarded: boolean;
      };
    };
    const normalized = normalizedInbound('Eco encaminhado', {
      direction: 'OUTGOING',
      messageType: 'image',
      mediaDownloadMetadata: {
        Url: 'https://media.example.test/image',
        MediaKey: 'safe-key',
        Mimetype: 'image/jpeg',
        FileSHA256: 'safe-sha',
        FileLength: 10,
      },
    });

    const reconciliation = privateService.reconciledRawMetadataUpdate(
      forwarded.rawMetadata,
      normalized,
    );
    expect(reconciliation.rawMetadata).toMatchObject({
      source: 'forward',
      forwardedFromConversationId: conversation().id,
      forwardedFromMessageId: '12121212-1212-4121-8121-121212121212',
      mediaDownload: expect.objectContaining({ Mimetype: 'image/jpeg' }),
    });

    const refreshed = conversationMessage({
      ...forwarded,
      rawMetadata: reconciliation.rawMetadata ?? forwarded.rawMetadata,
    });
    expect(privateService.presentConversationMessage(refreshed).isForwarded).toBe(true);
  });

  it('rejects same-conversation, cross-connection, deleted and unsupported forwards server-side', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const { service, prisma, provider } = serviceFactory();

    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: source.id,
        requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_SAME_CONVERSATION' }),
    });

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(
        args.where.id === source.id
          ? source
          : { ...target, whatsAppConnectionId: 'other-connection-id' },
      ),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(conversationMessage());
    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: target.id,
        requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_CONNECTION_MISMATCH' }),
    });

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(
      conversationMessage({ conversationId: '88888888-8888-4888-8888-888888888888' }),
    );
    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: target.id,
        requestId: 'dcdcdcdc-dcdc-4dcd-8dcd-dcdcdcdcdcdc',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'MESSAGE_CONVERSATION_MISMATCH' }),
    });

    prisma.whatsAppMessage.findUnique.mockResolvedValue(
      conversationMessage({ deletedAt: now, deletedForEveryone: true }),
    );
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: target.id,
        requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_MESSAGE_DELETED' }),
    });

    prisma.whatsAppMessage.findUnique.mockResolvedValue(conversationMessage({ type: 'LOCATION' }));
    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: target.id,
        requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_TYPE_UNSUPPORTED' }),
    });

    prisma.whatsAppMessage.findUnique.mockResolvedValue(
      conversationMessage({ type: 'STICKER', mediaMimeType: 'video/mp4' }),
    );
    await expect(
      service.forwardConversationMessage(source.id, conversationMessage().id, {
        targetConversationId: target.id,
        requestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_STICKER_UNSUPPORTED' }),
    });
    expect(provider.sendText).not.toHaveBeenCalled();
  });

  it('fails safely when source media is unavailable or the provider rejects the forward', async () => {
    const source = conversation();
    const target = conversation({
      id: '77777777-7777-4777-8777-777777777777',
      whatsAppConnection: connection({ status: 'CONNECTED', connected: true, loggedIn: true }),
    });
    const unavailable = conversationMessage({ type: 'IMAGE', mediaMimeType: 'image/jpeg' });
    const { service, prisma, provider, realtime } = serviceFactory({
      providerOverrides: { sendText: vi.fn().mockRejectedValue(new Error('provider secret')) },
    });

    prisma.whatsAppConversation.findUnique.mockImplementation((args: { where: { id: string } }) =>
      Promise.resolve(args.where.id === source.id ? source : target),
    );
    prisma.whatsAppMessage.findUnique.mockResolvedValue(unavailable);
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    await expect(
      service.forwardConversationMessage(source.id, unavailable.id, {
        targetConversationId: target.id,
        requestId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_FORWARD_MEDIA_UNAVAILABLE' }),
    });
    expect(prisma.whatsAppMessage.create).not.toHaveBeenCalled();

    prisma.whatsAppMessage.findUnique.mockResolvedValue(
      conversationMessage({ text: 'Falha real' }),
    );
    const failed = await service.forwardConversationMessage(source.id, conversationMessage().id, {
      targetConversationId: target.id,
      requestId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });

    expect(failed).toMatchObject({ status: 'FAILED', isForwarded: true });
    expect(provider.sendText).toHaveBeenCalledOnce();
    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          rawMetadata: expect.objectContaining({ source: 'forward' }),
        }),
      }),
    );
    expect(prisma.whatsAppConversation.update).not.toHaveBeenCalled();
    expect(realtime.emitMessageCreated).not.toHaveBeenCalled();
    expect(realtime.emitMessageUpdated).toHaveBeenCalledWith(target.id, expect.any(String));
  });
});

describe('WhatsApp conversation labels', () => {
  const label = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    whatsAppConnectionId: connection().id,
    name: 'Urgente',
    normalizedName: 'urgente',
    color: 'RED',
    createdAt: now,
    updatedAt: now,
    _count: { assignments: 0 },
  };

  it('preserves labels in open, read and resolve conversation presenters', async () => {
    const labelAssignments = [{ label: { id: label.id, name: label.name, color: label.color } }];
    const labeledConversation = conversation({ unreadCount: 0, labelAssignments });
    const resolvedConversation = conversation({
      status: 'RESOLVED',
      unreadCount: 0,
      labelAssignments,
    });
    const { service, prisma } = serviceFactory({
      prismaOverrides: {
        whatsAppConversation: {
          findUnique: vi.fn().mockResolvedValue(labeledConversation),
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
          create: vi.fn().mockResolvedValue(labeledConversation),
          update: vi.fn().mockResolvedValue(resolvedConversation),
        },
      },
    });

    await expect(service.getConversation(labeledConversation.id)).resolves.toMatchObject({
      labels: [{ id: label.id, name: label.name, color: label.color }],
    });
    await expect(service.markConversationAsRead(labeledConversation.id)).resolves.toMatchObject({
      labels: [{ id: label.id, name: label.name, color: label.color }],
    });
    await expect(service.resolveConversation(labeledConversation.id)).resolves.toMatchObject({
      labels: [{ id: label.id, name: label.name, color: label.color }],
    });

    for (const [args] of (prisma.whatsAppConversation.findUnique as MockWithCalls).mock.calls) {
      expect(args).toEqual(
        expect.objectContaining({
          include: expect.objectContaining({ labelAssignments: expect.any(Object) }),
        }),
      );
    }
    expect(prisma.whatsAppConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ labelAssignments: expect.any(Object) }),
      }),
    );
  });

  it('creates trimmed labels with case-insensitive uniqueness data and lists by connection', async () => {
    const { service, prisma } = serviceFactory();
    prisma.whatsAppConversationLabel.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...label, ...data }),
    );
    prisma.whatsAppConversationLabel.findMany.mockResolvedValue([label]);

    await expect(
      service.createConversationLabel(connection().id, { name: '  Urgente  ', color: 'RED' }),
    ).resolves.toMatchObject({ name: 'Urgente', color: 'RED' });
    expect(prisma.whatsAppConversationLabel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Urgente', normalizedName: 'urgente' }),
      }),
    );
    await expect(service.listConversationLabels(connection().id)).resolves.toEqual([label]);
  });

  it('atomically replaces, deduplicates and emits assignments for the conversation connection', async () => {
    const assignedConversation = conversation({
      labelAssignments: [{ label: { id: label.id, name: label.name, color: label.color } }],
    });
    const { service, prisma, realtime } = serviceFactory();
    prisma.whatsAppConversation.findUnique.mockResolvedValue(conversation());
    prisma.whatsAppConversation.findUniqueOrThrow.mockResolvedValue(assignedConversation);
    prisma.whatsAppConversationLabel.findMany.mockResolvedValue([label]);

    await expect(
      service.setConversationLabels(conversation().id, { labelIds: [label.id, label.id] }),
    ).resolves.toMatchObject({ labels: [{ id: label.id, name: 'Urgente', color: 'RED' }] });
    expect(prisma.whatsAppConversationLabelAssignment.createMany).toHaveBeenCalledWith({
      data: [{ conversationId: conversation().id, labelId: label.id }],
      skipDuplicates: true,
    });
    expect(realtime.emitConversationUpdated).toHaveBeenCalledWith(conversation().id);
  });

  it('rejects cross-connection assignments and scopes label filters before pagination', async () => {
    const foreignLabel = { ...label, whatsAppConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
    const { service, prisma } = serviceFactory();
    prisma.whatsAppConversation.findUnique.mockResolvedValue(conversation());
    prisma.whatsAppConversationLabel.findMany.mockResolvedValue([foreignLabel]);

    await expect(
      service.setConversationLabels(conversation().id, { labelIds: [foreignLabel.id] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.whatsAppConversationLabel.findUnique.mockResolvedValue(label);
    await expect(
      service.listConversations({
        labelId: label.id,
        whatsAppConnectionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.listConversations({
      labelId: label.id,
      page: 2,
      limit: 20,
      unreadOnly: true,
      needsManualFollowUp: true,
      hasClient: false,
      status: 'OPEN',
      search: 'Ana',
    });
    expect(prisma.whatsAppAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversation: expect.objectContaining({
            whatsAppConnectionId: connection().id,
            labelAssignments: { some: { labelId: label.id } },
            unreadCount: { gt: 0 },
            needsManualFollowUp: true,
            clientId: null,
            status: 'OPEN',
            OR: expect.any(Array),
          }),
        }),
        orderBy: [{ status: 'asc' }, { openedAt: 'asc' }, { conversationId: 'asc' }],
        skip: 20,
        take: 20,
      }),
    );
  });
});
