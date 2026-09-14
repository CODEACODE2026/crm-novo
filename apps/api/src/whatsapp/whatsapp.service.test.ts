import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import { WhatsAppService } from './whatsapp.service';

const now = new Date('2026-09-11T00:00:00.000Z');

type MockWithCalls = { mock: { calls: unknown[][] } };
type TestDispatch = {
  id: string;
  clientId: string;
  whatsAppConnectionId: string;
  phone: string;
  body: string;
  origin: string;
  status: string;
  requestId: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  client: ReturnType<typeof client>;
  whatsAppConnection: ReturnType<typeof connection>;
  [key: string]: unknown;
};

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

function client() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Cliente Teste',
    reference: 'CLI-1',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
  };
}

function clientReference(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  };
}

function dispatch(overrides: Record<string, unknown> = {}): TestDispatch {
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

function billingDispatch(overrides: Record<string, unknown> = {}) {
  return dispatch({
    origin: 'BILLING',
    status: 'SENT',
    clientReferenceId: clientReference().id,
    receivableId: '66666666-6666-4666-8666-666666666666',
    providerMessageId: 'provider-billing-id',
    sentAt: now,
    billingResponse: {
      id: '77777777-7777-4777-8777-777777777777',
      messageDispatchId: dispatch().id,
      receivableId: '66666666-6666-4666-8666-666666666666',
      clientReferenceId: clientReference().id,
      clientId: client().id,
      inboundMessageId: null,
      decision: 'PENDING',
      respondedAt: null,
      providerMessageId: null,
      source: 'WHATSAPP',
      responseText: null,
      createdAt: now,
      updatedAt: now,
    },
    clientReference: clientReference({ status: 'ATIVO' }),
    receivable: {
      id: '66666666-6666-4666-8666-666666666666',
      clientId: client().id,
      clientReferenceId: clientReference().id,
      renewalId: null,
      purpose: 'RENEWAL',
      description: 'Renovacao Mensal',
      amount: 50,
      dueDate: now,
      status: 'PENDENTE',
      paidAt: null,
      canceledAt: null,
      cancelReason: null,
      createdAt: now,
      updatedAt: now,
      paymentIntents: [],
    },
    ...overrides,
  }) as TestDispatch & {
    billingResponse: Record<string, unknown>;
    receivable: Record<string, unknown>;
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
    quotedProviderMessageId: null,
    messageTimestamp: now,
    receivedAt: now,
    isGroup: false,
    mediaMetadata: null,
    ...overrides,
  };
}

function serviceFactory({
  currentConnection = connection(),
  providerOverrides = {},
  encryptionOverrides = {},
  prismaOverrides = {},
}: {
  currentConnection?: ReturnType<typeof connection> | null;
  providerOverrides?: Record<string, unknown>;
  encryptionOverrides?: Record<string, unknown>;
  prismaOverrides?: Record<string, unknown>;
} = {}) {
  const txReceivableUpdate = vi.fn().mockResolvedValue({});
  const txClientEventCreate = vi.fn().mockResolvedValue({});
  const txClientEventFindFirst = vi.fn().mockResolvedValue(null);
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
      update: vi
        .fn()
        .mockResolvedValue(dispatch({ status: 'FAILED', errorMessage: 'Falha segura' })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
    },
    billingResponse: {
      create: vi.fn().mockResolvedValue(billingDispatch().billingResponse),
      update: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...billingDispatch().billingResponse, ...data }),
        ),
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
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      const callback = input as (tx: unknown) => Promise<unknown>;
      return callback({
        client: {
          create: vi.fn().mockResolvedValue({
            ...client(),
            recurringValue: 50,
            dueDate: now,
            plan: { id: 'plan-id', name: 'Mensal', durationMonths: 1, defaultValue: 50 },
          }),
        },
        clientReference: {
          create: vi.fn().mockResolvedValue(clientReference()),
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
          findMany: prisma.messageDispatch.findMany,
          findFirst: prisma.messageDispatch.findFirst,
          update: vi.fn().mockResolvedValue(
            dispatch({
              status: 'SENT',
              providerMessageId: 'provider-id',
              sentAt: now,
            }),
          ),
        },
        clientEvent: {
          create: txClientEventCreate,
          findFirst: txClientEventFindFirst,
        },
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
    get: (name: string) => (name === 'CRM_API_PUBLIC_URL' ? 'https://crm.example.com' : undefined),
  };
  const normalizer = {
    normalize: vi.fn(),
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
    ),
    prisma,
    provider,
    finance,
    encryption,
    normalizer,
    txReceivableUpdate,
    txClientEventCreate,
    txClientEventFindFirst,
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
      lastMessageText: 'Segunda mensagem',
      lastMessageId: 'msg-2',
      messageCount: { increment: 1 },
    });
  });

  it('does not create a pending contact for an existing client webhook', async () => {
    const { service, prisma, normalizer } = serviceFactory();
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-client',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Oi',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'client_exists' });
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it('records controlled SIM as accepted for the matching sent billing dispatch', async () => {
    const { service, prisma, normalizer, txClientEventCreate } = serviceFactory();
    prisma.messageDispatch.findFirst.mockResolvedValue(billingDispatch());
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-sim',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'SIM',
      quotedProviderMessageId: 'provider-billing-id',
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'billing_renewal_accepted', decision: 'ACCEPTED' });
    const updateArgs = (prisma.billingResponse.update as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data).toMatchObject({
      decision: 'ACCEPTED',
      inboundMessageId: 'inbound-id',
      providerMessageId: 'msg-sim',
    });
    expect(eventArgs.data.type).toBe('BILLING_RENEWAL_ACCEPTED');
    expect(prisma.whatsAppPendingContact.upsert).not.toHaveBeenCalled();
  });

  it.each(['sim', 'quero renovar', 'manda o pix', 'pode renovar'])(
    'classifies "%s" as accepted without requiring a quote',
    async (text) => {
      const { service, prisma, normalizer, txReceivableUpdate } = serviceFactory();
      prisma.messageDispatch.findMany.mockResolvedValue([billingDispatch()]);
      normalizer.normalize.mockReturnValue(normalizedInbound(text));

      const result = await service.receiveWebhook({ type: 'Message' });

      expect(result).toMatchObject({ action: 'billing_renewal_accepted', decision: 'ACCEPTED' });
      const updateArgs = (prisma.billingResponse.update as MockWithCalls).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data).toMatchObject({ decision: 'ACCEPTED', responseText: text });
      expect(txReceivableUpdate).not.toHaveBeenCalled();
    },
  );

  it('records controlled NAO as declined and cancels a pending receivable only', async () => {
    const { service, prisma, normalizer, txReceivableUpdate, txClientEventCreate } =
      serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([billingDispatch()]);
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-nao',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'NÃO',
      quotedProviderMessageId: null,
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'billing_renewal_declined', decision: 'DECLINED' });
    const receivableUpdateArgs = (txReceivableUpdate as MockWithCalls).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(receivableUpdateArgs.where).toEqual({
      id: '66666666-6666-4666-8666-666666666666',
    });
    expect(receivableUpdateArgs.data).toMatchObject({
      status: 'CANCELADO',
      cancelReason: 'Cliente informou que nao deseja renovar.',
    });
    expect(eventArgs.data.type).toBe('BILLING_RENEWAL_DECLINED');
  });

  it.each(['não', 'nao quero', 'não vou renovar', 'pode cancelar'])(
    'classifies "%s" as declined',
    async (text) => {
      const { service, prisma, normalizer, txReceivableUpdate } = serviceFactory();
      prisma.messageDispatch.findMany.mockResolvedValue([billingDispatch()]);
      normalizer.normalize.mockReturnValue(normalizedInbound(text));

      const result = await service.receiveWebhook({ type: 'Message' });

      expect(result).toMatchObject({ action: 'billing_renewal_declined', decision: 'DECLINED' });
      const updateArgs = (prisma.billingResponse.update as MockWithCalls).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data).toMatchObject({ decision: 'DECLINED', responseText: text });
      expect(txReceivableUpdate).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['quanto fica?', 'vou ver', 'bom dia', 'ok', 'não sei se quero'])(
    'keeps "%s" unresolved without financial effects',
    async (text) => {
      const { service, prisma, normalizer, txReceivableUpdate, txClientEventCreate } =
        serviceFactory();
      prisma.messageDispatch.findMany.mockResolvedValue([billingDispatch()]);
      normalizer.normalize.mockReturnValue(normalizedInbound(text));

      const result = await service.receiveWebhook({ type: 'Message' });

      expect(result).toMatchObject({
        action: 'billing_response_unresolved',
        decision: 'UNRESOLVED',
      });
      const updateArgs = (prisma.billingResponse.update as MockWithCalls).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(updateArgs.data).toMatchObject({ decision: 'UNRESOLVED', responseText: text });
      expect(txReceivableUpdate).not.toHaveBeenCalled();
      const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(eventArgs.data.type).toBe('BILLING_RESPONSE_UNRESOLVED');
    },
  );

  it('treats a repeated controlled response as idempotent when already answered', async () => {
    const { service, prisma, normalizer, txReceivableUpdate, txClientEventCreate } =
      serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      billingDispatch({
        billingResponse: {
          ...billingDispatch().billingResponse,
          decision: 'ACCEPTED',
          respondedAt: now,
        },
      }),
    ]);
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-sim-repeat',
      direction: 'INCOMING',
      messageType: 'text',
      text: '1',
      quotedProviderMessageId: null,
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'billing_response_already_recorded',
      decision: 'ACCEPTED',
    });
    expect(prisma.billingResponse.update).not.toHaveBeenCalled();
    expect(txReceivableUpdate).not.toHaveBeenCalled();
    expect(txClientEventCreate).not.toHaveBeenCalled();
  });

  it('treats a duplicated webhook as idempotent before billing side effects', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['whatsAppConnectionId', 'providerMessageId'] },
    });
    const { service, prisma, normalizer } = serviceFactory();
    prisma.whatsAppInboundMessage.create.mockRejectedValue(duplicate);
    prisma.messageDispatch.findMany.mockResolvedValue([billingDispatch()]);
    normalizer.normalize.mockReturnValue(normalizedInbound('sim', { messageId: 'msg-duplicate' }));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ received: true, processed: true, action: 'duplicate_message' });
    expect(prisma.billingResponse.update).not.toHaveBeenCalled();
  });

  it('evolves an unresolved response to accepted while preserving previous context in timeline', async () => {
    const { service, prisma, normalizer, txClientEventCreate } = serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({
        billingResponse: {
          ...billingDispatch().billingResponse,
          decision: 'UNRESOLVED',
          inboundMessageId: 'old-inbound-id',
          providerMessageId: 'old-provider-id',
          responseText: 'quanto fica?',
          respondedAt: now,
        },
      }),
    ]);
    normalizer.normalize.mockReturnValue(normalizedInbound('quero renovar'));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'billing_renewal_accepted', decision: 'ACCEPTED' });
    const updateArgs = (prisma.billingResponse.update as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateArgs.data).toMatchObject({
      decision: 'ACCEPTED',
      responseText: 'quero renovar',
    });
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(eventArgs.data.metadata.previousUnresolved).toMatchObject({
      inboundMessageId: 'old-inbound-id',
      responseText: 'quanto fica?',
    });
  });

  it('keeps repeated unresolved responses visible without overwriting the first response', async () => {
    const { service, prisma, normalizer, txClientEventCreate, txReceivableUpdate } =
      serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({
        billingResponse: {
          ...billingDispatch().billingResponse,
          decision: 'UNRESOLVED',
          inboundMessageId: 'old-inbound-id',
          providerMessageId: 'old-provider-id',
          responseText: 'vou ver',
          respondedAt: now,
        },
      }),
    ]);
    normalizer.normalize.mockReturnValue(normalizedInbound('bom dia'));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'billing_response_unresolved',
      decision: 'UNRESOLVED',
    });
    expect(prisma.billingResponse.update).not.toHaveBeenCalled();
    expect(txReceivableUpdate).not.toHaveBeenCalled();
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(eventArgs.data.type).toBe('BILLING_RESPONSE_UNRESOLVED');
  });

  it('keeps paid receivable history when a declined response arrives', async () => {
    const { service, prisma, normalizer, txReceivableUpdate } = serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({
        receivable: {
          ...billingDispatch().receivable,
          status: 'PAGO',
          paidAt: now,
        },
      }),
    ]);
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-paid-no',
      direction: 'INCOMING',
      messageType: 'text',
      text: '2',
      quotedProviderMessageId: null,
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'billing_renewal_declined', decision: 'DECLINED' });
    expect(txReceivableUpdate).not.toHaveBeenCalled();
  });

  it('keeps canceled receivable history when a declined response arrives', async () => {
    const { service, prisma, normalizer, txReceivableUpdate } = serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({
        receivable: {
          ...billingDispatch().receivable,
          status: 'CANCELADO',
          canceledAt: now,
        },
      }),
    ]);
    normalizer.normalize.mockReturnValue(normalizedInbound('pode cancelar'));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({ action: 'billing_renewal_declined', decision: 'DECLINED' });
    expect(txReceivableUpdate).not.toHaveBeenCalled();
  });

  it('does not choose arbitrarily when two sent billings are open for the same phone', async () => {
    const { service, prisma, normalizer, txClientEventCreate } = serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({ id: 'billing-a' }),
      billingDispatch({ id: 'billing-b' }),
    ]);
    normalizer.normalize.mockReturnValue({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Cliente Teste',
      messageId: 'msg-ambiguous-billing',
      direction: 'INCOMING',
      messageType: 'text',
      text: '1',
      quotedProviderMessageId: null,
      messageTimestamp: now,
      receivedAt: now,
      isGroup: false,
      mediaMetadata: null,
    });

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'billing_response_ambiguous',
      ambiguousMatches: 2,
    });
    expect(prisma.billingResponse.update).not.toHaveBeenCalled();
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(eventArgs.data.type).toBe('BILLING_RESPONSE_AMBIGUOUS');
  });

  it('does not choose arbitrarily when two references have billings open for the same phone', async () => {
    const { service, prisma, normalizer, txClientEventCreate } = serviceFactory();
    prisma.messageDispatch.findMany.mockResolvedValue([
      billingDispatch({ id: 'billing-reference-a', clientReferenceId: 'reference-a' }),
      billingDispatch({ id: 'billing-reference-b', clientReferenceId: 'reference-b' }),
    ]);
    normalizer.normalize.mockReturnValue(normalizedInbound('quero renovar'));

    const result = await service.receiveWebhook({ type: 'Message' });

    expect(result).toMatchObject({
      action: 'billing_response_ambiguous',
      ambiguousMatches: 2,
    });
    expect(prisma.billingResponse.update).not.toHaveBeenCalled();
    const eventArgs = (txClientEventCreate as MockWithCalls).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(eventArgs.data.type).toBe('BILLING_RESPONSE_AMBIGUOUS');
  });

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

  it('ignores group and outgoing webhooks', async () => {
    const { service, normalizer } = serviceFactory();
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
      reason: 'ignored_outgoing',
    });
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
