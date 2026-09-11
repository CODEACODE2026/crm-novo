import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppService } from './whatsapp.service';

const now = new Date('2026-09-11T00:00:00.000Z');

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
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
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
      }),
    ),
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
  const config = {
    get: (name: string) => (name === 'CRM_API_PUBLIC_URL' ? 'https://crm.example.com' : undefined),
  };

  return {
    service: new WhatsAppService(
      prisma as never,
      provider as never,
      encryption as never,
      config as never,
    ),
    prisma,
    provider,
    encryption,
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
});
