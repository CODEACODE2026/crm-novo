import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { BillingTemplateRenderer } from './billing-template-renderer';

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const now = new Date('2026-09-11T12:00:00.000Z');
const dueDate = new Date('2026-09-15T00:00:00.000Z');

function plan() {
  return {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: 50,
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-id',
    name: 'Bruno Teste',
    phone: '5544999999999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'bruno1499',
    planId: plan().id,
    recurringValue: 50,
    dueDate,
    billingAnchorDay: 15,
    billingNoticeDays: 0,
    notes: null,
    status: 'ATIVO',
    createdAt: now,
    updatedAt: now,
    plan: plan(),
    receivables: [receivable()],
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: 'receivable-id',
    clientId: 'client-id',
    renewalId: 'renewal-id',
    description: 'Renovacao Mensal',
    amount: 50,
    dueDate,
    status: 'PENDENTE',
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-id',
    name: 'Cobranca padrao',
    type: 'BILLING_DUE',
    content: 'Oi {{primeiroNome}}, vence em {{vencimento}}: {{valor}}.',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-id',
    name: 'WhatsApp',
    provider: 'KIRAGO',
    providerUserId: 'kirago-user',
    providerTokenEncrypted: 'encrypted-token',
    phone: null,
    status: 'CONNECTED',
    connected: true,
    loggedIn: true,
    webhookConfigured: true,
    lastStatusAt: null,
    connectedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function dispatch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dispatch-id',
    clientId: client().id,
    receivableId: receivable().id,
    templateId: template().id,
    whatsAppConnectionId: connection().id,
    phone: '5544999999999',
    body: 'Oi Bruno',
    renderedContent: 'Oi Bruno',
    origin: 'BILLING',
    status: 'SCHEDULED',
    requestId: 'billing:client-id:receivable-id:2026-09-15:0:template-id',
    idempotencyKey: 'billing:client-id:receivable-id:2026-09-15:0:template-id',
    scheduledFor: new Date('2026-09-15T12:00:00.000Z'),
    nextAttemptAt: new Date('2026-09-15T12:00:00.000Z'),
    attempts: 0,
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    client: client(),
    receivable: receivable(),
    template: template(),
    whatsAppConnection: connection(),
    ...overrides,
  };
}

function serviceFactory({
  clients = [client()],
  dispatchForProcessing = dispatch({ status: 'PROCESSING', attempts: 1 }),
  providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }),
  acquireCount = 1,
  createDispatch = vi.fn().mockResolvedValue(dispatch()),
  templateRecord = template(),
  connectionRecord = connection(),
  existingClientEvent = null,
}: {
  clients?: Array<ReturnType<typeof client>>;
  dispatchForProcessing?: ReturnType<typeof dispatch>;
  providerSendText?: ReturnType<typeof vi.fn>;
  acquireCount?: number;
  createDispatch?: ReturnType<typeof vi.fn>;
  templateRecord?: ReturnType<typeof template>;
  connectionRecord?: ReturnType<typeof connection> | null;
  existingClientEvent?: Record<string, unknown> | null;
} = {}) {
  const clientEventCreate = vi.fn().mockResolvedValue({});
  const clientEventFindFirst = vi.fn().mockResolvedValue(existingClientEvent);
  const updateDispatch = vi.fn().mockImplementation(({ data }) =>
    Promise.resolve(
      dispatch({
        ...dispatchForProcessing,
        ...data,
        status: data.status,
      }),
    ),
  );
  const updateMany = vi.fn().mockImplementation(({ data }) => {
    if (data?.status === 'PROCESSING') {
      const count = acquireCount > 0 ? 1 : 0;
      acquireCount -= 1;
      return Promise.resolve({ count });
    }

    return Promise.resolve({ count: 0 });
  });
  const prisma = {
    messageTemplate: {
      upsert: vi.fn().mockResolvedValue(templateRecord),
      findMany: vi.fn().mockResolvedValue([templateRecord]),
      findUnique: vi.fn().mockResolvedValue(templateRecord),
      update: vi.fn().mockResolvedValue(templateRecord),
    },
    client: {
      findMany: vi.fn().mockResolvedValue(clients),
    },
    whatsAppConnection: {
      findFirst: vi.fn().mockResolvedValue(connectionRecord),
    },
    messageDispatch: {
      create: createDispatch,
      updateMany,
      findMany: vi.fn().mockResolvedValue([dispatch()]),
      findUnique: vi.fn().mockResolvedValue(dispatchForProcessing),
      update: updateDispatch,
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      const callback = input as (tx: unknown) => Promise<unknown>;
      return callback({
        messageDispatch: { update: updateDispatch },
        clientEvent: { create: clientEventCreate, findFirst: clientEventFindFirst },
      });
    }),
  };
  const provider = { sendText: providerSendText };
  const encryption = { decrypt: vi.fn().mockReturnValue('instance-token') };
  const config = {
    get: vi.fn((key: string) => (key === 'BILLING_SEND_HOUR' ? '9' : undefined)),
  };
  const service = new BillingService(
    prisma as never,
    provider as never,
    encryption as never,
    config as never,
    new BillingTemplateRenderer(),
  );

  return {
    service,
    prisma,
    provider,
    encryption,
    clientEventCreate,
    clientEventFindFirst,
    updateDispatch,
    updateMany,
  };
}

describe('BillingService', () => {
  it.each([
    [0, '2026-09-15T12:00:00.000Z'],
    [1, '2026-09-14T12:00:00.000Z'],
    [2, '2026-09-13T12:00:00.000Z'],
    [10, '2026-09-05T12:00:00.000Z'],
  ])('calculates scheduledFor for billingNoticeDays %s in America/Sao_Paulo', (days, expected) => {
    const { service } = serviceFactory();

    expect(service.calculateScheduledFor(dueDate, days).toISOString()).toBe(expected);
  });

  it('calculates scheduledFor without UTC drift for 2026-09-20 minus 3 days at 09:00 Sao Paulo', () => {
    const { service } = serviceFactory();

    expect(
      service.calculateScheduledFor(new Date('2026-09-20T00:00:00.000Z'), 3).toISOString(),
    ).toBe('2026-09-17T12:00:00.000Z');
  });

  it('creates one billing dispatch for an active client with a pending receivable', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({ createDispatch });

    const result = await service.reconcile(now);

    expect(result.created).toBe(1);
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'BILLING',
          status: 'SCHEDULED',
          idempotencyKey: 'billing:client-id:receivable-id:2026-09-15:0:template-id',
          renderedContent: expect.stringContaining('15/09/2026'),
        }),
      }),
    );
  });

  it('does not create dispatch when the template is inactive or WhatsApp is not usable', async () => {
    const createDispatch = vi.fn();
    const inactiveTemplate = serviceFactory({
      createDispatch,
      templateRecord: template({ active: false }),
    });

    expect(await inactiveTemplate.service.reconcile(now)).toEqual({
      created: 0,
      kept: 0,
      canceled: 0,
      skipped: 1,
    });

    const disconnected = serviceFactory({ createDispatch, connectionRecord: null });

    expect(await disconnected.service.reconcile(now)).toEqual({
      created: 0,
      kept: 0,
      canceled: 0,
      skipped: 1,
    });
    expect(createDispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['INATIVO', 'PENDENTE'],
    ['CANCELADO', 'PENDENTE'],
    ['ATIVO', 'PAGO'],
    ['ATIVO', 'CANCELADO'],
  ])(
    'does not create dispatch for client %s with receivable %s',
    async (clientStatus, receivableStatus) => {
      const createDispatch = vi.fn();
      const { service } = serviceFactory({
        clients: [
          client({
            status: clientStatus,
            receivables: [receivable({ status: receivableStatus })],
          }),
        ],
        createDispatch,
      });

      const result = await service.reconcile(now);

      expect(result.created).toBe(0);
      expect(createDispatch).not.toHaveBeenCalled();
    },
  );

  it('keeps reconciliation idempotent when the unique key already exists', async () => {
    const createDispatch = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const { service } = serviceFactory({ createDispatch });

    const result = await service.reconcile(now);

    expect(result.kept).toBe(1);
  });

  it('cancels obsolete future dispatches when due date, notice days, or renewal intent changes', async () => {
    const { service, updateMany } = serviceFactory({
      clients: [client({ billingNoticeDays: 3 })],
    });

    await service.reconcile(now);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-id',
          origin: 'BILLING',
          idempotencyKey: {
            not: 'billing:client-id:receivable-id:2026-09-15:3:template-id',
          },
        }),
        data: expect.objectContaining({ status: 'CANCELED' }),
      }),
    );
  });

  it('creates a new intent and cancels the old future dispatch when due date changes', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const nextDueDate = new Date('2026-09-20T00:00:00.000Z');
    const { service, updateMany } = serviceFactory({
      clients: [
        client({
          dueDate: nextDueDate,
          receivables: [receivable({ dueDate: nextDueDate })],
        }),
      ],
      createDispatch,
    });

    await service.reconcile(now);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idempotencyKey: {
            not: 'billing:client-id:receivable-id:2026-09-20:0:template-id',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'billing:client-id:receivable-id:2026-09-20:0:template-id',
          scheduledFor: new Date('2026-09-20T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('recalculates notice day changes and does not keep both billing dates active', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const nextDueDate = new Date('2026-09-20T00:00:00.000Z');
    const { service, updateMany } = serviceFactory({
      clients: [
        client({
          dueDate: nextDueDate,
          billingNoticeDays: 3,
          receivables: [receivable({ dueDate: nextDueDate })],
        }),
      ],
      createDispatch,
    });

    await service.reconcile(now);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idempotencyKey: {
            not: 'billing:client-id:receivable-id:2026-09-20:3:template-id',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'billing:client-id:receivable-id:2026-09-20:3:template-id',
          scheduledFor: new Date('2026-09-17T12:00:00.000Z'),
        }),
      }),
    );
  });

  it('creates a new intent for renewal receivable and cancels the previous period intent', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const renewedReceivable = receivable({ id: 'receivable-renewed-id' });
    const { service, updateMany } = serviceFactory({
      clients: [client({ receivables: [renewedReceivable] })],
      createDispatch,
    });

    await service.reconcile(now);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idempotencyKey: {
            not: 'billing:client-id:receivable-renewed-id:2026-09-15:0:template-id',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivableId: 'receivable-renewed-id',
          idempotencyKey: 'billing:client-id:receivable-renewed-id:2026-09-15:0:template-id',
        }),
      }),
    );
  });

  it('previews draft template content without creating a dispatch', async () => {
    const createDispatch = vi.fn();
    const { service } = serviceFactory({ createDispatch });

    const result = await service.previewTemplate('template-id', {
      content: 'Teste {{primeiroNome}} {{valor}} {{desconhecida}}',
    });

    expect(result.renderedContent).toContain('Teste Bruno');
    expect(result.renderedContent).toContain('R$');
    expect(result.renderedContent).not.toContain('desconhecida');
    expect(createDispatch).not.toHaveBeenCalled();
  });

  it('sends a due dispatch once and writes timeline only after provider success', async () => {
    const { service, provider, clientEventCreate, updateDispatch } = serviceFactory();

    const result = await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(result.processed).toBe(1);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(clientEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Cobranca automatica enviada pelo WhatsApp.' }),
      }),
    );
  });

  it('does not duplicate the timeline event on replay after a sent state is recovered', async () => {
    const { service, clientEventCreate, clientEventFindFirst } = serviceFactory({
      existingClientEvent: { id: 'event-id' },
    });

    await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(clientEventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-id',
          type: 'WHATSAPP_MESSAGE_SENT',
          metadata: { path: ['messageDispatchId'], equals: 'dispatch-id' },
        }),
      }),
    );
    expect(clientEventCreate).not.toHaveBeenCalled();
  });

  it.each([
    [client({ status: 'INATIVO' }), 'IGNORED'],
    [client({ status: 'CANCELADO' }), 'IGNORED'],
    [client(), 'IGNORED', receivable({ status: 'PAGO' })],
    [client(), 'CANCELED', receivable({ status: 'CANCELADO' })],
    [client({ dueDate: new Date('2026-09-16T00:00:00.000Z') }), 'IGNORED'],
    [client({ billingNoticeDays: 2 }), 'IGNORED'],
    [client(), 'IGNORED', receivable(), template({ active: false })],
  ])(
    'does not send ineligible dispatches',
    async (
      nextClient,
      expectedStatus,
      nextReceivable = receivable(),
      nextTemplate = template(),
    ) => {
      const providerSendText = vi.fn();
      const { service, updateDispatch } = serviceFactory({
        dispatchForProcessing: dispatch({
          status: 'PROCESSING',
          attempts: 1,
          client: nextClient,
          receivable: nextReceivable,
          template: nextTemplate,
        }),
        providerSendText,
      });

      await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

      expect(providerSendText).not.toHaveBeenCalled();
      expect(updateDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: expectedStatus }) }),
      );
    },
  );

  it('keeps retry on the same dispatch with sanitized error and a future nextAttemptAt', async () => {
    const providerSendText = vi
      .fn()
      .mockRejectedValue(new Error('token=abc123 secret stack detail that must not go forever'));
    const { service, updateDispatch } = serviceFactory({
      providerSendText,
      dispatchForProcessing: dispatch({ status: 'PROCESSING', attempts: 1 }),
    });

    await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispatch-id' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'PROVIDER_ERROR',
          errorMessage: expect.stringContaining('token=[redacted]'),
          nextAttemptAt: new Date('2026-09-15T12:15:00.000Z'),
        }),
      }),
    );
    expect(updateDispatch.mock.calls.at(-1)?.[0].data.errorMessage).not.toContain('abc123');
    expect(providerSendText).toHaveBeenCalledTimes(1);
  });

  it('records provider failure with sanitized retry state and stops at max attempts', async () => {
    const providerSendText = vi.fn().mockRejectedValue(new Error('temporary provider failure'));
    const { service, updateDispatch } = serviceFactory({
      providerSendText,
      dispatchForProcessing: dispatch({ status: 'PROCESSING', attempts: 3 }),
    });

    await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'PROVIDER_ERROR',
          errorMessage: 'temporary provider failure',
          nextAttemptAt: null,
        }),
      }),
    );
  });

  it('uses conditional acquisition so concurrent workers do not duplicate sends', async () => {
    const providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
    const { service } = serviceFactory({ providerSendText, acquireCount: 1 });

    await Promise.all([
      service.processDue(new Date('2026-09-15T12:00:00.000Z')),
      service.processDue(new Date('2026-09-15T12:00:00.000Z')),
    ]);

    expect(providerSendText).toHaveBeenCalledTimes(1);
  });
});
