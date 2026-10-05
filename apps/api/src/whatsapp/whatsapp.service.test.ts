/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import { KiragoWebhookNormalizer } from './kirago/kirago-webhook-normalizer';
import { WhatsAppService } from './whatsapp.service';

const now = new Date('2026-09-11T00:00:00.000Z');

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
    direction: 'INBOUND',
    type: 'TEXT',
    text: 'Ola',
    mediaMimeType: null,
    mediaFileName: null,
    mediaSizeBytes: null,
    mediaDurationSeconds: null,
    status: 'SENT',
    sentAt: now,
    failedAt: null,
    isFromMe: false,
    rawMetadata: null,
    createdAt: now,
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
  prismaOverrides = {},
}: {
  currentConnection?: ReturnType<typeof connection> | null;
  providerOverrides?: Record<string, unknown>;
  encryptionOverrides?: Record<string, unknown>;
  configOverrides?: Record<string, string | undefined>;
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
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
      create: vi.fn().mockResolvedValue(conversation()),
      update: vi.fn().mockResolvedValue(conversation()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    whatsAppMessage: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(conversationMessage()),
      update: vi.fn((args: { data?: Record<string, unknown> }) =>
        Promise.resolve(conversationMessage(args.data ?? {})),
      ),
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
        whatsAppMessage: prisma.whatsAppMessage,
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
    sendButtons: vi.fn().mockResolvedValue({ providerMessageId: 'provider-button-id' }),
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

  return {
    service: new WhatsAppService(
      prisma as never,
      provider as never,
      plans as never,
      finance as never,
      encryption as never,
      config as never,
      normalizer as never,
    ),
    prisma,
    provider,
    finance,
    encryption,
    normalizer,
    txClientReferenceUpdate,
    txReceivableUpdate,
  };
}

describe('WhatsAppService', () => {
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
        events: ['Message'],
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
      ['Message'],
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
      ['Message'],
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
      mediaMimeType: 'image/jpeg',
      mediaFileName: 'foto.jpg',
      mediaSizeBytes: 10,
    });
  });

  it('sends PDF conversation media as Kirago document with sanitized file name', async () => {
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
      mediaMimeType: 'application/pdf',
      mediaFileName: 'contrato final.pdf',
      mediaSizeBytes: 9,
    });
  });

  it('rejects unsupported media MIME and files above CRM internal size limit', async () => {
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
          buffer: Buffer.alloc(1),
          mimetype: 'application/pdf',
          originalname: 'grande.pdf',
          size: WhatsAppService.conversationMediaMaxBytes + 1,
        },
        requestId: 'large-request-id',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(provider.sendImage).not.toHaveBeenCalled();
    expect(provider.sendDocument).not.toHaveBeenCalled();
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
    const { service, provider, prisma } = serviceFactory({
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
      requestId: 'manual-charge-pix:manual-payment-intent-id',
      idempotencyKey: 'manual-charge-pix:manual-payment-intent-id',
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

    expect(log).toHaveBeenCalledTimes(1);
    const output = String((log as MockWithCalls).mock.calls[0]?.[0]);
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

    expect(log).toHaveBeenCalledTimes(1);
    const output = String((log as MockWithCalls).mock.calls[0]?.[0]);
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
    const { service, prisma, normalizer } = serviceFactory();
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
    ['unknown', 'UNKNOWN', null, {}, '[Mensagem]'],
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
    const { service, prisma, normalizer } = serviceFactory({
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
  });

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
    const { service, prisma, normalizer } = serviceFactory({
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

    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 3, totalPages: 1 });
    expect(result.summary).toEqual({ totalUnreadConversations: 2, totalUnreadMessages: 4 });
    expect(result.items.map((item: { displayName: string }) => item.displayName)).toEqual([
      'Cliente Preferido',
      '5544999999999',
      '5544999999999',
    ]);
    expect(findManyArgs).toMatchObject({
      where: {
        status: 'OPEN',
        whatsAppConnectionId: connection().id,
        clientId: client().id,
        unreadCount: { gt: 0 },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: 10,
      take: 10,
    });
    expect(findManyArgs.include).toEqual({
      client: { select: { id: true, name: true, phone: true, phoneNormalized: true } },
      whatsAppConnection: {
        select: { name: true, providerInstanceName: true, providerUserId: true },
      },
    });
    expect(findManyArgs.where?.OR as unknown[] | undefined).toEqual(
      expect.arrayContaining([
        { contactName: { contains: '(44) 99999-9999', mode: 'insensitive' } },
        { phone: { contains: '(44) 99999-9999', mode: 'insensitive' } },
        { phoneNormalized: { contains: '5544999999999' } },
        { client: { name: { contains: '(44) 99999-9999', mode: 'insensitive' } } },
      ]),
    );
  });

  it('filters resolved conversations independently from open conversations', async () => {
    const { service, prisma } = serviceFactory();

    await service.listConversations({ status: 'RESOLVED' });
    const findManyArgs = (prisma.whatsAppConversation.findMany as MockWithCalls).mock
      .calls[0]?.[0] as { where?: Record<string, unknown> };

    expect(findManyArgs.where).toMatchObject({ status: 'RESOLVED' });
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
    expect(result.items[0]).toMatchObject({
      direction: 'INBOUND',
      type: 'IMAGE',
      text: 'Legenda',
      mediaMimeType: 'image/jpeg',
      mediaAvailable: true,
    });
    expect(result.items[1]).toMatchObject({
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      mediaFileName: 'contrato.pdf',
      mediaSizeBytes: 2048,
      messageDispatchId: dispatch().id,
    });
    expect(result.items[0]).not.toHaveProperty('rawMetadata');
    expect(JSON.stringify(result.items[0])).not.toContain('secret-media-key');
    expect(JSON.stringify(result.items[0])).not.toContain('https://mmg.whatsapp.net/image');
    expect(result.pagination).toEqual({ page: 1, limit: 2, total: 2, totalPages: 1 });
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

  it.each([
    ['DOCUMENT', 'application/pdf', 'contract.pdf', 'attachment'],
    ['AUDIO', 'audio/ogg', null, 'inline'],
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
        expect.objectContaining({ type, Mimetype: mimetype }),
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

  it('marks conversations as read idempotently without changing status', async () => {
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
            .mockResolvedValueOnce(conversation({ unreadCount: 0, status: 'OPEN' }))
            .mockResolvedValueOnce(conversation({ unreadCount: 0, status: 'RESOLVED' })),
        },
      },
    });

    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 0,
      status: 'OPEN',
    });
    await expect(service.markConversationAsRead(conversation().id)).resolves.toMatchObject({
      unreadCount: 0,
      status: 'RESOLVED',
    });
    expect(prisma.whatsAppConversation.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: { unreadCount: 0 } }),
    );
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
    const { service, prisma, provider, encryption } = serviceFactory({
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
    const { service, prisma } = serviceFactory({
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
});
