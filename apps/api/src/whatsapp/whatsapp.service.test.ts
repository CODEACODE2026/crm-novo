import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppService } from './whatsapp.service';

const now = new Date('2026-09-11T00:00:00.000Z');

type MockWithCalls = { mock: { calls: unknown[][] } };

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'CRM Principal',
    provider: 'KIRAGO',
    providerUserId: 'kirago-user',
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

function serviceFactory({
  currentConnection = connection(),
  providerOverrides = {},
  prismaOverrides = {},
}: {
  currentConnection?: ReturnType<typeof connection> | null;
  providerOverrides?: Record<string, unknown>;
  prismaOverrides?: Record<string, unknown>;
} = {}) {
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
    },
    messageDispatch: {
      create: vi.fn().mockResolvedValue(dispatch()),
      update: vi
        .fn()
        .mockResolvedValue(dispatch({ status: 'FAILED', errorMessage: 'Falha segura' })),
      findMany: vi.fn().mockResolvedValue([]),
      findUniqueOrThrow: vi.fn(),
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
        messageDispatch: {
          update: vi.fn().mockResolvedValue(
            dispatch({
              status: 'SENT',
              providerMessageId: 'provider-id',
              sentAt: now,
            }),
          ),
        },
        clientEvent: {
          create: vi.fn().mockResolvedValue({}),
        },
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
    connect: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue({ connected: true, loggedIn: true, phone: null }),
    getQrCode: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
    sendText: vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }),
    health: vi.fn().mockResolvedValue({ online: true }),
    ...providerOverrides,
  };
  const encryption = {
    encrypt: vi.fn().mockReturnValue('encrypted-token'),
    decrypt: vi.fn().mockReturnValue('instance-token'),
  };
  const plans = {
    ensureActivePlan: vi.fn().mockResolvedValue({ id: 'plan-id' }),
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
      encryption as never,
      config as never,
      normalizer as never,
    ),
    prisma,
    provider,
    encryption,
    normalizer,
  };
}

describe('WhatsAppService', () => {
  it('provisions a connection without exposing the generated token', async () => {
    const { service, provider, encryption } = serviceFactory({ currentConnection: null });

    const result = await service.provisionConnection({ name: 'CRM Principal' });

    expect(provider.provisionConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        webhookUrl: 'https://crm.example.com/whatsapp/webhook/kirago',
        events: ['Message'],
      }),
    );
    expect(encryption.encrypt).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('instance-token');
    expect(JSON.stringify(result)).not.toContain('encrypted-token');
  });

  it('maps provider status to CONNECTED', async () => {
    const { service } = serviceFactory();

    const result = await service.refreshStatus();

    expect(result.status).toBe('CONNECTED');
    expect(result.connected).toBe(true);
    expect(result.loggedIn).toBe(true);
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
      where: {
        provider: 'KIRAGO',
        OR: [{ providerUserId: 'kirago-user' }, { name: 'CRM Principal' }],
      },
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
      where: { provider: 'KIRAGO', OR: [{ name: 'CRM Principal' }] },
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
      },
      'user-id',
    );

    expect(result.reference).toBe('CLI-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('blocks approval when a client with the phone already exists', async () => {
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
        },
        'user-id',
      ),
    ).rejects.toThrow(ConflictException);
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
        },
        'user-id',
      ),
    ).rejects.toThrow('client create failed');
    expect(pendingUpdate).not.toHaveBeenCalled();
  });
});
