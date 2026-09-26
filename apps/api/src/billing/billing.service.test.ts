import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import { BillingTemplateRenderer } from './billing-template-renderer';

/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const now = new Date('2026-09-11T12:00:00.000Z');
const dueDate = new Date('2026-09-15T00:00:00.000Z');

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: 50,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function client(overrides: Record<string, unknown> = {}) {
  const basePlan = plan();
  const baseReceivables = (overrides.receivables as
    ReturnType<typeof receivable>[] | undefined) ?? [receivable()];
  const reference = clientReference({
    plan: basePlan,
    receivables: baseReceivables,
    status: overrides.status ?? 'ATIVO',
    dueDate: overrides.dueDate ?? dueDate,
    billingNoticeDays: overrides.billingNoticeDays ?? 0,
  });
  return {
    id: 'client-id',
    name: 'Bruno Teste',
    phone: '5544999999999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'bruno1499',
    planId: basePlan.id,
    recurringValue: 50,
    dueDate,
    billingAnchorDay: 15,
    billingNoticeDays: 0,
    notes: null,
    status: 'ATIVO',
    createdAt: now,
    updatedAt: now,
    plan: basePlan,
    receivables: baseReceivables,
    references: [reference],
    ...overrides,
  };
}

function clientReference(overrides: Record<string, unknown> = {}) {
  return {
    id: 'client-reference-id',
    clientId: 'client-id',
    reference: 'bruno1499',
    planId: plan().id,
    recurringValue: 50,
    dueDate,
    billingAnchorDay: 15,
    billingNoticeDays: 0,
    status: 'ATIVO',
    notes: null,
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
    clientReferenceId: 'client-reference-id',
    renewalId: 'renewal-id',
    purpose: 'RENEWAL',
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

type ReceivableWithReference = ReturnType<typeof receivable> & {
  clientReference?: ReturnType<typeof clientReference>;
};

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

function automationSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 'billing-settings-id',
    scope: 'global',
    enabled: true,
    sendTime: '09:00',
    sendIntervalSeconds: 8,
    timezone: 'America/Sao_Paulo',
    companyId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function dispatch(overrides: Record<string, unknown> = {}) {
  const dispatchClient = (overrides.client as ReturnType<typeof client> | undefined) ?? client();
  const dispatchReceivable =
    (overrides.receivable as ReturnType<typeof receivable> | undefined) ?? receivable();
  const dispatchReference =
    (overrides.clientReference as ReturnType<typeof clientReference> | undefined) ??
    clientReference({
      status: dispatchClient.status,
      dueDate: dispatchClient.dueDate,
      billingNoticeDays: dispatchClient.billingNoticeDays,
      receivables: [dispatchReceivable],
    });
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
    client: dispatchClient,
    clientReference: dispatchReference,
    receivable: dispatchReceivable,
    template: template(),
    whatsAppConnection: connection(),
    ...overrides,
  };
}

function billingClient(index: number, overrides: Record<string, unknown> = {}) {
  const clientId = `client-${String(index).padStart(2, '0')}`;
  const referenceId = `reference-${String(index).padStart(2, '0')}`;
  const receivableId = `receivable-${String(index).padStart(2, '0')}`;
  const referenceCreatedAt = new Date(now.getTime() + index * 1000);
  const nextReceivable = receivable({
    id: receivableId,
    clientId,
    clientReferenceId: referenceId,
    createdAt: referenceCreatedAt,
  });
  const reference = clientReference({
    id: referenceId,
    clientId,
    reference: `ref-${String(index).padStart(2, '0')}`,
    createdAt: referenceCreatedAt,
    receivables: [nextReceivable],
  });

  return client({
    id: clientId,
    name: `Cliente ${index}`,
    reference: `cliente-${index}`,
    receivables: [nextReceivable],
    references: [reference],
    ...overrides,
  });
}

function serviceFactory({
  clients = [client()],
  dispatchForProcessing = dispatch({ status: 'PROCESSING', attempts: 1 }),
  providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' }),
  acquireCount = 1,
  createDispatch = vi.fn().mockResolvedValue(dispatch()),
  templateRecord = template(),
  connectionRecord = connection(),
  settingsRecord = automationSettings(),
  existingClientEvent = null,
  currentReceivables,
  existingFutureDispatch = null,
}: {
  clients?: Array<ReturnType<typeof client>>;
  dispatchForProcessing?: ReturnType<typeof dispatch>;
  providerSendText?: ReturnType<typeof vi.fn>;
  acquireCount?: number;
  createDispatch?: ReturnType<typeof vi.fn>;
  templateRecord?: ReturnType<typeof template>;
  connectionRecord?: ReturnType<typeof connection> | null;
  settingsRecord?: ReturnType<typeof automationSettings>;
  existingClientEvent?: Record<string, unknown> | null;
  existingFutureDispatch?: ReturnType<typeof dispatch> | null;
  currentReceivables?: ReceivableWithReference[];
} = {}) {
  const clientEventCreate = vi.fn().mockResolvedValue({});
  const clientEventFindFirst = vi.fn().mockResolvedValue(existingClientEvent);
  const billingResponseCreate = vi.fn();
  const billingResponseUpsert = vi.fn();
  const updateDispatch = vi.fn().mockImplementation(({ data }) => {
    const updatedReceivable = currentReceivables?.find((item) => item.id === data.receivableId);
    const updatedReference = updatedReceivable?.clientReference;
    const dispatchWithOptionalItems = dispatchForProcessing as typeof dispatchForProcessing & {
      items?: unknown[];
    };
    const createdItems = data.items?.create ?? data.items;

    return Promise.resolve(
      dispatch({
        ...dispatchForProcessing,
        ...data,
        receivable: updatedReceivable ?? dispatchForProcessing.receivable,
        clientReference: updatedReference ?? dispatchForProcessing.clientReference,
        items: Array.isArray(createdItems)
          ? createdItems.map((item: Record<string, unknown>, index: number) => {
              const receivableRecord = (currentReceivables?.find(
                (current) => current.id === item.receivableId,
              ) ??
                updatedReceivable ??
                dispatchForProcessing.receivable) as ReceivableWithReference;
              const referenceRecord =
                receivableRecord.clientReference ??
                updatedReference ??
                dispatchForProcessing.clientReference;

              return {
                id: `updated-item-${index + 1}`,
                messageDispatchId: dispatchForProcessing.id,
                receivableId: receivableRecord.id,
                clientReferenceId: referenceRecord.id,
                amount: receivableRecord.amount,
                dueDate: receivableRecord.dueDate,
                referenceSnapshot: referenceRecord.reference,
                statusSnapshot: receivableRecord.status,
                createdAt: now,
                updatedAt: now,
                receivable: receivableRecord,
                clientReference: referenceRecord,
              };
            })
          : updatedReceivable
            ? [
                {
                  id: 'updated-item',
                  messageDispatchId: dispatchForProcessing.id,
                  receivableId: updatedReceivable.id,
                  clientReferenceId: updatedReceivable.clientReferenceId,
                  amount: updatedReceivable.amount,
                  dueDate: updatedReceivable.dueDate,
                  referenceSnapshot: updatedReference?.reference ?? '',
                  statusSnapshot: updatedReceivable.status,
                  createdAt: now,
                  updatedAt: now,
                  receivable: updatedReceivable,
                  clientReference: updatedReference,
                },
              ]
            : dispatchWithOptionalItems.items,
        status: data.status ?? dispatchForProcessing.status,
      }),
    );
  });
  const updateMany = vi.fn().mockImplementation(({ data }) => {
    if (data?.status === 'PROCESSING') {
      const count = acquireCount > 0 ? 1 : 0;
      acquireCount -= 1;
      return Promise.resolve({ count });
    }

    return Promise.resolve({ count: 0 });
  });
  const findExistingFutureDispatch = vi.fn().mockImplementation(
    ({
      where,
    }: {
      where?: {
        idempotencyKey?: string;
        status?: unknown;
        scheduledFor?: { gt?: Date };
        OR?: Array<{ status?: unknown; errorCode?: unknown; scheduledFor?: { gt?: Date } }>;
      };
    }) => {
      if (
        !existingFutureDispatch ||
        where?.idempotencyKey !== existingFutureDispatch.idempotencyKey
      ) {
        return Promise.resolve(null);
      }

      const matchesSimpleStatus =
        typeof where?.status === 'string' &&
        where.status === existingFutureDispatch.status &&
        (!where.scheduledFor?.gt || existingFutureDispatch.scheduledFor > where.scheduledFor.gt);
      const matchesOrStatus = Array.isArray(where?.OR)
        ? where.OR.some(
            (condition: Record<string, unknown>) =>
              condition.status === existingFutureDispatch.status &&
              (condition.errorCode === undefined ||
                condition.errorCode === existingFutureDispatch.errorCode) &&
              (!condition.scheduledFor ||
                existingFutureDispatch.scheduledFor > (condition.scheduledFor as { gt: Date }).gt),
          )
        : false;

      return Promise.resolve(
        matchesSimpleStatus || matchesOrStatus
          ? { id: existingFutureDispatch.id, status: existingFutureDispatch.status }
          : null,
      );
    },
  );
  const prisma = {
    messageTemplate: {
      upsert: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(
          where?.type_name?.type === 'BILLING_DUE_GROUPED'
            ? template({
                id: 'grouped-template-id',
                name: 'Cobranca agrupada',
                type: 'BILLING_DUE_GROUPED',
                content:
                  'Oi {{primeiroNome}}, {{quantidade}} cobranças:\n{{itens}}\nTotal: {{valorTotal}}.',
              })
            : templateRecord,
        ),
      ),
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
    billingAutomationSettings: {
      upsert: vi.fn().mockResolvedValue(settingsRecord),
      update: vi.fn().mockResolvedValue(settingsRecord),
    },
    messageDispatch: {
      create: createDispatch,
      updateMany,
      findMany: vi.fn().mockResolvedValue([dispatch()]),
      findFirst: findExistingFutureDispatch,
      findUnique: vi.fn().mockResolvedValue(dispatchForProcessing),
      update: updateDispatch,
      count: vi.fn().mockResolvedValue(0),
    },
    receivable: {
      findMany: vi.fn().mockResolvedValue(
        currentReceivables ?? [
          {
            ...dispatchForProcessing.receivable,
            clientReference:
              dispatchForProcessing.clientReference ??
              clientReference({ receivables: [dispatchForProcessing.receivable] }),
          },
        ],
      ),
    },
    $transaction: vi.fn(async (input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      const callback = input as (tx: unknown) => Promise<unknown>;
      return callback({
        messageDispatch: { update: updateDispatch },
        messageDispatchItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        clientEvent: { create: clientEventCreate, findFirst: clientEventFindFirst },
        billingResponse: { create: billingResponseCreate, upsert: billingResponseUpsert },
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
    billingResponseCreate,
    billingResponseUpsert,
  };
}

type DispatchCreateArgs = {
  data: {
    scheduledFor: Date;
    clientReferenceId?: string | null;
    receivableId?: string | null;
    idempotencyKey?: string;
    renderedContent?: string;
    items?: {
      create: Array<{
        receivableId: string;
        clientReferenceId: string;
      }>;
    };
  };
};

type UpdateManyArgs = {
  where?: {
    status?: unknown;
  };
};

function createdDispatchData(createDispatch: ReturnType<typeof vi.fn>) {
  return createDispatch.mock.calls.map((call) => (call[0] as DispatchCreateArgs).data);
}

function updateManyArgs(updateMany: ReturnType<typeof vi.fn>) {
  return updateMany.mock.calls.map((call) => call[0] as UpdateManyArgs);
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

  it('uses persisted send time instead of changing business time through env', () => {
    const { service } = serviceFactory();

    expect(
      service
        .calculateScheduledFor(new Date('2026-09-20T00:00:00.000Z'), 0, {
          sendTime: '10:30',
          timezone: 'America/Sao_Paulo',
        })
        .toISOString(),
    ).toBe('2026-09-20T13:30:00.000Z');
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
          idempotencyKey: 'billing-group:client-id:2026-09-15',
          scheduledFor: new Date('2026-09-15T12:00:00.000Z'),
          nextAttemptAt: new Date('2026-09-15T12:00:00.000Z'),
          renderedContent: expect.stringContaining('15/09/2026'),
          items: {
            create: [
              expect.objectContaining({
                receivableId: 'receivable-id',
                clientReferenceId: 'client-reference-id',
              }),
            ],
          },
        }),
      }),
    );
  });

  it('spreads three billing dispatches by the configured interval', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [billingClient(1), billingClient(2), billingClient(3)],
      createDispatch,
    });

    const result = await service.reconcile(now);

    expect(result.created).toBe(3);
    expect(
      createdDispatchData(createDispatch).map((data) => data.scheduledFor.toISOString()),
    ).toEqual(['2026-09-15T12:00:00.000Z', '2026-09-15T12:00:08.000Z', '2026-09-15T12:00:16.000Z']);
  });

  it('spreads twenty billing dispatches without changing client reference or receivable links', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const clients = Array.from({ length: 20 }, (_, index) => billingClient(index + 1));
    const { service } = serviceFactory({ clients, createDispatch });

    await service.reconcile(now);

    expect(createDispatch).toHaveBeenCalledTimes(20);
    const dispatches = createdDispatchData(createDispatch);
    expect(dispatches.map((data) => data.scheduledFor.toISOString())).toEqual(
      Array.from({ length: 20 }, (_, index) =>
        new Date(new Date('2026-09-15T12:00:00.000Z').getTime() + index * 8000).toISOString(),
      ),
    );
    expect(dispatches.at(0)).toMatchObject({
      clientReferenceId: 'reference-01',
      receivableId: 'receivable-01',
    });
    expect(dispatches.at(19)).toMatchObject({
      clientReferenceId: 'reference-20',
      receivableId: 'receivable-20',
    });
  });

  it('groups two references from the same client on the same send date', async () => {
    const firstReceivable = receivable({
      id: 'receivable-a',
      clientReferenceId: 'reference-a',
    });
    const secondReceivable = receivable({
      id: 'receivable-b',
      clientReferenceId: 'reference-b',
      createdAt: new Date(now.getTime() + 1000),
    });
    const firstReference = clientReference({
      id: 'reference-a',
      reference: 'A',
      receivables: [firstReceivable],
    });
    const secondReference = clientReference({
      id: 'reference-b',
      reference: 'B',
      createdAt: new Date(now.getTime() + 1000),
      receivables: [secondReceivable],
    });
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [
        client({
          receivables: [firstReceivable, secondReceivable],
          references: [secondReference, firstReference],
        }),
      ],
      createDispatch,
    });

    await service.reconcile(now);

    const dispatches = createdDispatchData(createDispatch);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!).toMatchObject({
      clientReferenceId: 'reference-a',
      receivableId: 'receivable-a',
      idempotencyKey: 'billing-group:client-id:2026-09-15',
    });
    expect(dispatches[0]!.items?.create).toEqual([
      expect.objectContaining({ clientReferenceId: 'reference-a', receivableId: 'receivable-a' }),
      expect.objectContaining({ clientReferenceId: 'reference-b', receivableId: 'receivable-b' }),
    ]);
    expect(dispatches.map((data) => data.scheduledFor.toISOString())).toEqual([
      '2026-09-15T12:00:00.000Z',
    ]);
  });

  it('consolidates three same-client receivables on the same send date with total and item links', async () => {
    const refs = [1, 2, 3].map((index) => {
      const referenceId = `reference-${index}`;
      const nextReceivable = receivable({
        id: `receivable-${index}`,
        clientReferenceId: referenceId,
        amount: 30,
      });

      return clientReference({
        id: referenceId,
        reference: `teste0${index}`,
        receivables: [nextReceivable],
      });
    });
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [
        client({
          name: 'Atualiza',
          receivables: refs.flatMap((reference) => reference.receivables),
          references: refs,
        }),
      ],
      createDispatch,
    });

    const result = await service.reconcile(now);
    const dispatches = createdDispatchData(createDispatch);

    expect(result.created).toBe(1);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.renderedContent).toContain('3 cobranças');
    expect(dispatches[0]!.renderedContent).toContain('Total: R$ 90,00');
    expect(dispatches[0]!.items?.create).toEqual([
      expect.objectContaining({ clientReferenceId: 'reference-1', receivableId: 'receivable-1' }),
      expect.objectContaining({ clientReferenceId: 'reference-2', receivableId: 'receivable-2' }),
      expect.objectContaining({ clientReferenceId: 'reference-3', receivableId: 'receivable-3' }),
    ]);
  });

  it('keeps same-client receivables separated when their effective send dates differ', async () => {
    const firstReceivable = receivable({
      id: 'receivable-a',
      clientReferenceId: 'reference-a',
      dueDate: new Date('2026-09-17T00:00:00.000Z'),
    });
    const secondReceivable = receivable({
      id: 'receivable-b',
      clientReferenceId: 'reference-b',
      dueDate: new Date('2026-09-18T00:00:00.000Z'),
    });
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [
        client({
          receivables: [firstReceivable, secondReceivable],
          references: [
            clientReference({
              id: 'reference-a',
              reference: 'A',
              dueDate: new Date('2026-09-17T00:00:00.000Z'),
              receivables: [firstReceivable],
            }),
            clientReference({
              id: 'reference-b',
              reference: 'B',
              dueDate: new Date('2026-09-18T00:00:00.000Z'),
              receivables: [secondReceivable],
            }),
          ],
        }),
      ],
      createDispatch,
    });

    await service.reconcile(now);

    expect(createdDispatchData(createDispatch).map((data) => data.idempotencyKey)).toEqual([
      'billing-group:client-id:2026-09-17',
      'billing-group:client-id:2026-09-18',
    ]);
  });

  it('consolidates different notice days that resolve to the same effective send date', async () => {
    const firstDueDate = new Date('2026-09-20T00:00:00.000Z');
    const secondDueDate = new Date('2026-09-17T00:00:00.000Z');
    const firstReceivable = receivable({
      id: 'receivable-a',
      clientReferenceId: 'reference-a',
      dueDate: firstDueDate,
    });
    const secondReceivable = receivable({
      id: 'receivable-b',
      clientReferenceId: 'reference-b',
      dueDate: secondDueDate,
    });
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [
        client({
          receivables: [firstReceivable, secondReceivable],
          references: [
            clientReference({
              id: 'reference-a',
              reference: 'A',
              dueDate: firstDueDate,
              billingNoticeDays: 3,
              receivables: [firstReceivable],
            }),
            clientReference({
              id: 'reference-b',
              reference: 'B',
              dueDate: secondDueDate,
              billingNoticeDays: 0,
              receivables: [secondReceivable],
            }),
          ],
        }),
      ],
      createDispatch,
    });

    await service.reconcile(now);

    const dispatches = createdDispatchData(createDispatch);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.idempotencyKey).toBe('billing-group:client-id:2026-09-17');
    expect(dispatches[0]!.items?.create).toHaveLength(2);
  });

  it('uses a changed send interval when reconciling future scheduled dispatches', async () => {
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service } = serviceFactory({
      clients: [billingClient(1), billingClient(2), billingClient(3)],
      createDispatch,
      settingsRecord: automationSettings({ sendIntervalSeconds: 15 }),
    });

    await service.reconcile(now);

    expect(
      createdDispatchData(createDispatch).map((data) => data.scheduledFor.toISOString()),
    ).toEqual(['2026-09-15T12:00:00.000Z', '2026-09-15T12:00:15.000Z', '2026-09-15T12:00:30.000Z']);
  });

  it('does not target sent or failed historical dispatches when reconciling schedule changes', async () => {
    const { service, updateMany } = serviceFactory({
      clients: [billingClient(1)],
      settingsRecord: automationSettings({ sendIntervalSeconds: 15 }),
    });

    await service.reconcile(now);

    const updateManyCalls = updateManyArgs(updateMany);
    expect(updateManyCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: expect.objectContaining({ status: 'SCHEDULED' }) }),
      ]),
    );
    expect(updateManyCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({ status: expect.arrayContaining(['SENT', 'FAILED']) }),
        }),
      ]),
    );
    expect(updateManyCalls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: expect.arrayContaining(['FAILED']) } }),
        }),
      ]),
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
    ['PENDENTE_PAGAMENTO', 'PENDENTE'],
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

  it('reactivates a cycle-changed canceled dispatch when recurring value changes but send date is unchanged', async () => {
    const nextDueDate = new Date('2026-10-25T00:00:00.000Z');
    const updatedReceivable = receivable({
      amount: 30,
      dueDate: nextDueDate,
    });
    const updatedReference = clientReference({
      recurringValue: 30,
      dueDate: nextDueDate,
      receivables: [updatedReceivable],
    });
    const canceledDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
      errorMessage: 'Cobranca futura cancelada porque o ciclo da referencia foi alterado.',
      idempotencyKey: 'billing-group:client-id:2026-10-25',
      requestId: 'billing-group:client-id:2026-10-25',
      scheduledFor: new Date('2026-10-25T12:00:00.000Z'),
      nextAttemptAt: null,
      receivable: { ...updatedReceivable, amount: 5 },
      clientReference: updatedReference,
      items: [
        {
          id: 'old-item',
          messageDispatchId: 'dispatch-id',
          receivableId: updatedReceivable.id,
          clientReferenceId: updatedReference.id,
          amount: 5,
          dueDate: nextDueDate,
          referenceSnapshot: updatedReference.reference,
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: { ...updatedReceivable, amount: 5 },
          clientReference: updatedReference,
        },
      ],
    });
    const createDispatch = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const { service, updateDispatch } = serviceFactory({
      clients: [
        client({
          dueDate: nextDueDate,
          recurringValue: 30,
          references: [updatedReference],
          receivables: [updatedReceivable],
        }),
      ],
      createDispatch,
      currentReceivables: [{ ...updatedReceivable, clientReference: updatedReference }],
      dispatchForProcessing: canceledDispatch,
      existingFutureDispatch: canceledDispatch,
    });

    const result = await service.reconcile(now);

    expect(result).toMatchObject({ created: 0, kept: 1 });
    expect(createDispatch).not.toHaveBeenCalled();
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispatch-id' },
        data: expect.objectContaining({
          status: 'SCHEDULED',
          attempts: 0,
          sentAt: null,
          errorCode: null,
          errorMessage: null,
          scheduledFor: new Date('2026-10-25T12:00:00.000Z'),
          nextAttemptAt: new Date('2026-10-25T12:00:00.000Z'),
          body: expect.stringContaining('R$'),
          renderedContent: expect.stringContaining('25/10/2026'),
          items: expect.objectContaining({
            deleteMany: {},
            create: [
              expect.objectContaining({
                receivableId: updatedReceivable.id,
                clientReferenceId: updatedReference.id,
                amount: 30,
                dueDate: nextDueDate,
              }),
            ],
          }),
        }),
      }),
    );
  });

  it('reactivates a cycle-changed canceled dispatch as due when scheduledFor already passed', async () => {
    const pastDueDate = new Date('2026-09-10T00:00:00.000Z');
    const pastScheduledFor = new Date('2026-09-10T12:00:00.000Z');
    const updatedReceivable = receivable({
      amount: 30,
      dueDate: pastDueDate,
    });
    const updatedReference = clientReference({
      recurringValue: 30,
      dueDate: pastDueDate,
      receivables: [updatedReceivable],
    });
    const canceledDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
      attempts: 2,
      idempotencyKey: 'billing-group:client-id:2026-09-10',
      requestId: 'billing-group:client-id:2026-09-10',
      scheduledFor: pastScheduledFor,
      nextAttemptAt: null,
      receivable: { ...updatedReceivable, amount: 5 },
      clientReference: updatedReference,
    });
    const createDispatch = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const { service, updateDispatch } = serviceFactory({
      clients: [
        client({
          dueDate: pastDueDate,
          recurringValue: 30,
          references: [updatedReference],
          receivables: [updatedReceivable],
        }),
      ],
      createDispatch,
      currentReceivables: [{ ...updatedReceivable, clientReference: updatedReference }],
      dispatchForProcessing: canceledDispatch,
      existingFutureDispatch: canceledDispatch,
    });

    const result = await service.reconcile(now);

    expect(result).toMatchObject({ created: 0, kept: 1 });
    expect(createDispatch).not.toHaveBeenCalled();
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispatch-id' },
        data: expect.objectContaining({
          status: 'SCHEDULED',
          attempts: 0,
          sentAt: null,
          providerMessageId: null,
          scheduledFor: pastScheduledFor,
          nextAttemptAt: pastScheduledFor,
          items: expect.objectContaining({
            deleteMany: {},
            create: [expect.objectContaining({ amount: 30, dueDate: pastDueDate })],
          }),
        }),
      }),
    );
  });

  it('keeps replay reconciliation to one active dispatch after reactivation', async () => {
    const scheduledDispatch = dispatch({
      status: 'SCHEDULED',
      attempts: 2,
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
    });
    const createDispatch = vi.fn();
    const { service, updateDispatch } = serviceFactory({
      createDispatch,
      existingFutureDispatch: scheduledDispatch,
      dispatchForProcessing: scheduledDispatch,
    });

    await service.reconcile(now);
    await service.reconcile(now);

    expect(createDispatch).not.toHaveBeenCalled();
    expect(updateDispatch).toHaveBeenCalledTimes(2);
    expect(
      updateDispatch.mock.calls.some((call) => {
        const data = (call[0] as { data: { attempts?: number } }).data;
        return data.attempts !== undefined;
      }),
    ).toBe(false);
  });

  it('reactivates a cycle-changed canceled dispatch after plan changes on the same send date', async () => {
    const premiumPlan = plan({ name: 'Premium' });
    const updatedReceivable = receivable({ amount: 150 });
    const updatedReference = clientReference({
      plan: premiumPlan,
      planId: premiumPlan.id,
      recurringValue: 150,
      receivables: [updatedReceivable],
    });
    const canceledDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
      clientReference: updatedReference,
      receivable: updatedReceivable,
    });
    const { service, updateDispatch } = serviceFactory({
      clients: [
        client({
          plan: premiumPlan,
          planId: premiumPlan.id,
          recurringValue: 150,
          references: [updatedReference],
          receivables: [updatedReceivable],
        }),
      ],
      currentReceivables: [{ ...updatedReceivable, clientReference: updatedReference }],
      existingFutureDispatch: canceledDispatch,
      dispatchForProcessing: canceledDispatch,
    });

    await service.reconcile(now);

    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SCHEDULED',
          items: expect.objectContaining({
            deleteMany: {},
            create: [expect.objectContaining({ amount: 150 })],
          }),
        }),
      }),
    );
  });

  it('does not reactivate an old canceled dispatch when due date changes to a new send date', async () => {
    const nextDueDate = new Date('2026-09-20T00:00:00.000Z');
    const nextReceivable = receivable({ dueDate: nextDueDate });
    const nextReference = clientReference({ dueDate: nextDueDate, receivables: [nextReceivable] });
    const canceledDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
    });
    const createDispatch = vi.fn().mockResolvedValue(dispatch());
    const { service, updateDispatch } = serviceFactory({
      clients: [
        client({
          dueDate: nextDueDate,
          references: [nextReference],
          receivables: [nextReceivable],
        }),
      ],
      createDispatch,
      existingFutureDispatch: canceledDispatch,
    });

    await service.reconcile(now);

    expect(updateDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispatch-id' },
        data: expect.objectContaining({ status: 'SCHEDULED' }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'billing-group:client-id:2026-09-20',
        }),
      }),
    );
  });

  it('does not reactivate canceled dispatches from other cancellation reasons', async () => {
    const canceledDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'OBSOLETE_BILLING_INTENT',
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
    });
    const createDispatch = vi.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );
    const { service, updateDispatch } = serviceFactory({
      createDispatch,
      existingFutureDispatch: canceledDispatch,
      dispatchForProcessing: canceledDispatch,
    });

    const result = await service.reconcile(now);

    expect(result.kept).toBe(1);
    expect(updateDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SCHEDULED' }),
      }),
    );
  });

  it.each([
    ['PAGO', 'ATIVO'],
    ['CANCELADO', 'ATIVO'],
    ['PENDENTE', 'INATIVO'],
  ])(
    'does not reactivate controlled canceled dispatch when receivable is %s and reference is %s',
    async (receivableStatus, referenceStatus) => {
      const nextReceivable = receivable({ status: receivableStatus });
      const nextReference = clientReference({
        status: referenceStatus,
        receivables: [nextReceivable],
      });
      const canceledDispatch = dispatch({
        status: 'CANCELED',
        errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
        idempotencyKey: 'billing-group:client-id:2026-09-15',
        requestId: 'billing-group:client-id:2026-09-15',
      });
      const createDispatch = vi.fn();
      const { service, updateDispatch } = serviceFactory({
        clients: [
          client({
            status: referenceStatus,
            references: [nextReference],
            receivables: [nextReceivable],
          }),
        ],
        createDispatch,
        existingFutureDispatch: canceledDispatch,
        dispatchForProcessing: canceledDispatch,
      });

      await service.reconcile(now);

      expect(createDispatch).not.toHaveBeenCalled();
      expect(updateDispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SCHEDULED' }),
        }),
      );
    },
  );

  it('reactivates a controlled canceled grouped dispatch with only current eligible items', async () => {
    const firstReceivable = receivable({
      id: 'receivable-a',
      clientReferenceId: 'reference-a',
      amount: 30,
    });
    const secondReceivable = receivable({
      id: 'receivable-b',
      clientReferenceId: 'reference-b',
      amount: 45,
    });
    const thirdReceivable = receivable({
      id: 'receivable-c',
      clientReferenceId: 'reference-c',
      amount: 60,
    });
    const obsoleteReceivable = receivable({
      id: 'receivable-obsolete',
      clientReferenceId: 'reference-obsolete',
      amount: 5,
    });
    const firstReference = clientReference({
      id: 'reference-a',
      reference: 'A',
      receivables: [firstReceivable],
    });
    const secondReference = clientReference({
      id: 'reference-b',
      reference: 'B',
      receivables: [secondReceivable],
    });
    const thirdReference = clientReference({
      id: 'reference-c',
      reference: 'C',
      receivables: [thirdReceivable],
    });
    const obsoleteReference = clientReference({
      id: 'reference-obsolete',
      reference: 'OLD',
      receivables: [obsoleteReceivable],
    });
    const groupedDispatch = dispatch({
      status: 'CANCELED',
      errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
      items: [
        {
          id: 'old-item-a',
          messageDispatchId: 'dispatch-id',
          receivableId: firstReceivable.id,
          clientReferenceId: firstReference.id,
          amount: 30,
          dueDate,
          referenceSnapshot: 'A',
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: firstReceivable,
          clientReference: firstReference,
        },
        {
          id: 'old-item-obsolete',
          messageDispatchId: 'dispatch-id',
          receivableId: obsoleteReceivable.id,
          clientReferenceId: obsoleteReference.id,
          amount: 5,
          dueDate,
          referenceSnapshot: 'OLD',
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: obsoleteReceivable,
          clientReference: obsoleteReference,
        },
      ],
    });
    const { service, updateDispatch } = serviceFactory({
      clients: [
        client({
          receivables: [firstReceivable, secondReceivable, thirdReceivable],
          references: [firstReference, secondReference, thirdReference],
        }),
      ],
      currentReceivables: [
        { ...firstReceivable, clientReference: firstReference },
        { ...secondReceivable, clientReference: secondReference },
        { ...thirdReceivable, clientReference: thirdReference },
      ],
      existingFutureDispatch: groupedDispatch,
      dispatchForProcessing: groupedDispatch,
    });

    await service.reconcile(now);

    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SCHEDULED',
          items: expect.objectContaining({
            deleteMany: {},
            create: [
              expect.objectContaining({ receivableId: 'receivable-a', amount: 30 }),
              expect.objectContaining({ receivableId: 'receivable-b', amount: 45 }),
              expect.objectContaining({ receivableId: 'receivable-c', amount: 60 }),
            ],
          }),
        }),
      }),
    );
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
            not: 'billing-group:client-id:2026-09-12',
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
            not: 'billing-group:client-id:2026-09-20',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'billing-group:client-id:2026-09-20',
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
            not: 'billing-group:client-id:2026-09-17',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'billing-group:client-id:2026-09-17',
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
            not: 'billing-group:client-id:2026-09-15',
          },
        }),
      }),
    );
    expect(createDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivableId: 'receivable-renewed-id',
          idempotencyKey: 'billing-group:client-id:2026-09-15',
        }),
      }),
    );
  });

  it('lists templates with effective runtime variables and preserves supported variables metadata', async () => {
    const { service, prisma } = serviceFactory();
    prisma.messageTemplate.findMany.mockResolvedValueOnce([
      template({ type: 'BILLING_DUE' }),
      template({ id: 'grouped-template-id', type: 'BILLING_DUE_GROUPED' }),
      template({ id: 'recovery-template-id', type: 'RECOVERY_DAY_7' }),
      template({ id: 'activation-template-id', type: 'INITIAL_ACTIVATION' }),
    ]);

    const result = await service.listTemplates();

    expect(result.map((item) => ({ type: item.type, variables: item.variables }))).toEqual([
      {
        type: 'BILLING_DUE',
        variables: ['nome', 'primeiroNome', 'valor', 'vencimento', 'plano', 'referencia'],
      },
      {
        type: 'BILLING_DUE_GROUPED',
        variables: ['nome', 'primeiroNome', 'quantidade', 'itens', 'valorTotal'],
      },
      {
        type: 'RECOVERY_DAY_7',
        variables: [
          'nome',
          'primeiroNome',
          'valor',
          'vencimento',
          'plano',
          'referencia',
          'diasAtraso',
        ],
      },
      {
        type: 'INITIAL_ACTIVATION',
        variables: ['nome', 'primeiroNome', 'valor', 'vencimento', 'plano', 'referencia', 'pix'],
      },
    ]);
    expect(result[0]!.supportedVariables).toEqual([
      'nome',
      'primeiroNome',
      'valor',
      'vencimento',
      'plano',
      'referencia',
      'diasAtraso',
      'pix',
      'quantidade',
      'itens',
      'valorTotal',
    ]);
  });

  it('previews draft template content with billing individual context without creating a dispatch', async () => {
    const createDispatch = vi.fn();
    const { service } = serviceFactory({ createDispatch });

    const result = await service.previewTemplate('template-id', {
      content:
        'Teste {{primeiroNome}} {{valor}} {{vencimento}} {{plano}} {{referencia}} {{diasAtraso}} {{pix}} {{quantidade}} {{itens}} {{valorTotal}}',
    });

    expect(result.renderedContent).toBe('Teste Bruno R$ 50,00 15/09/2026 Mensal bruno1499     ');
    expect(createDispatch).not.toHaveBeenCalled();
  });

  it('previews grouped, recovery, and activation templates with contextual sample data', async () => {
    const content =
      '{{primeiroNome}}|{{valor}}|{{vencimento}}|{{plano}}|{{referencia}}|{{diasAtraso}}|{{pix}}|{{quantidade}}|{{itens}}|{{valorTotal}}';

    await expect(
      serviceFactory({
        templateRecord: template({ type: 'BILLING_DUE_GROUPED', content }),
      }).service.previewTemplate('template-id', {}),
    ).resolves.toMatchObject({
      renderedContent:
        'Bruno|||||||3|• teste01 — R$ 30,00 — vence 15/09/2026\n• teste02 — R$ 30,00 — vence 15/09/2026\n• teste03 — R$ 30,00 — vence 15/09/2026|R$ 90,00',
    });
    await expect(
      serviceFactory({
        templateRecord: template({ type: 'RECOVERY_DAY_7', content }),
      }).service.previewTemplate('template-id', {}),
    ).resolves.toMatchObject({
      renderedContent: 'Bruno|R$ 50,00|15/09/2026|Mensal|bruno1499|7||||',
    });
    await expect(
      serviceFactory({
        templateRecord: template({ type: 'INITIAL_ACTIVATION', content }),
      }).service.previewTemplate('template-id', {}),
    ).resolves.toMatchObject({
      renderedContent: 'Bruno|R$ 50,00|15/09/2026|Mensal|bruno1499||000201...|||',
    });
  });

  it('rejects unsupported template variables with a friendly error', async () => {
    const { service } = serviceFactory();

    await expect(
      service.previewTemplate('template-id', {
        content: 'Teste {{cpfDoDinossauro}}',
      }),
    ).rejects.toMatchObject({
      message: 'Variaveis nao suportadas no template: {{cpfDoDinossauro}}.',
    });
  });

  it('does not persist unsupported template variables', async () => {
    const { service } = serviceFactory();

    await expect(
      service.updateTemplate('template-id', {
        content: 'Oi {{cpfDoDinossauro}}',
      }),
    ).rejects.toMatchObject({
      message: 'Variaveis nao suportadas no template: {{cpfDoDinossauro}}.',
    });
  });

  it('sends a due dispatch once and finishes without requiring a billing response', async () => {
    const {
      service,
      provider,
      clientEventCreate,
      updateDispatch,
      billingResponseCreate,
      billingResponseUpsert,
    } = serviceFactory();

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
    expect(billingResponseCreate).not.toHaveBeenCalled();
    expect(billingResponseUpsert).not.toHaveBeenCalled();
  });

  it('does not process automatic billing when automation is disabled', async () => {
    const providerSendText = vi.fn();
    const { service, prisma } = serviceFactory({
      settingsRecord: automationSettings({ enabled: false }),
      providerSendText,
    });

    const result = await service.processDue(new Date('2026-09-15T12:00:00.000Z'), 20, {
      automatic: true,
    });

    expect(result).toEqual({
      processed: 0,
      results: [],
      skipped: 'BILLING_AUTOMATION_DISABLED',
    });
    expect(prisma.messageDispatch.findMany).not.toHaveBeenCalled();
    expect(providerSendText).not.toHaveBeenCalled();
  });

  it('automatic processing only picks dispatches from the current Sao Paulo business day', async () => {
    const { service, prisma } = serviceFactory();

    await service.processDue(new Date('2026-09-15T12:10:00.000Z'), 20, {
      automatic: true,
    });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scheduledFor: expect.objectContaining({
            gte: new Date('2026-09-15T03:00:00.000Z'),
            lte: new Date('2026-09-15T12:10:00.000Z'),
          }),
        }),
      }),
    );
  });

  it('processes only one due automatic dispatch per tick after restart backlog', async () => {
    const providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
    const { service, prisma } = serviceFactory({ providerSendText });

    await service.processDue(new Date('2026-09-15T12:30:00.000Z'), 20, {
      automatic: true,
    });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
    expect(providerSendText).toHaveBeenCalledTimes(1);
  });

  it('processes only one failed retry per tick when retries become due together', async () => {
    const providerSendText = vi.fn().mockRejectedValue(new Error('temporary provider failure'));
    const { service, prisma } = serviceFactory({
      providerSendText,
      dispatchForProcessing: dispatch({ status: 'PROCESSING', attempts: 2 }),
    });

    await service.processDue(new Date('2026-09-15T12:15:00.000Z'), 20, {
      automatic: true,
    });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ['SCHEDULED', 'FAILED'] } }),
        take: 1,
      }),
    );
    expect(providerSendText).toHaveBeenCalledTimes(1);
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
    [client({ status: 'CANCELADO' }), 'CANCELED'],
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

  it('sendNow sends immediately without depending on the automatic queue throttle', async () => {
    const providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
    const { service, prisma, updateDispatch } = serviceFactory({
      providerSendText,
      dispatchForProcessing: dispatch({ status: 'PROCESSING', attempts: 1 }),
    });
    prisma.messageDispatch.findUnique
      .mockResolvedValueOnce(dispatch({ status: 'SCHEDULED', attempts: 0 }))
      .mockResolvedValue(dispatch({ status: 'PROCESSING', attempts: 1 }));

    const result = await service.sendNow('dispatch-id');

    expect(result.processed).toBe(1);
    expect(prisma.messageDispatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispatch-id' },
        data: expect.objectContaining({
          scheduledFor: expect.any(Date),
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }),
    );
    expect(providerSendText).toHaveBeenCalledTimes(1);
  });

  it('revalidates grouped dispatch items before sending and removes paid receivables', async () => {
    const providerSendText = vi.fn().mockResolvedValue({ providerMessageId: 'provider-id' });
    const refA = clientReference({ id: 'reference-a', reference: 'A' });
    const refB = clientReference({ id: 'reference-b', reference: 'B' });
    const receivableA = receivable({
      id: 'receivable-a',
      clientReferenceId: 'reference-a',
      status: 'PAGO',
    });
    const receivableB = receivable({ id: 'receivable-b', clientReferenceId: 'reference-b' });
    const groupedDispatch = dispatch({
      status: 'PROCESSING',
      attempts: 1,
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
      receivable: receivableA,
      clientReference: refA,
      items: [
        {
          id: 'item-a',
          messageDispatchId: 'dispatch-id',
          receivableId: 'receivable-a',
          clientReferenceId: 'reference-a',
          amount: 50,
          dueDate,
          referenceSnapshot: 'A',
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: receivableA,
          clientReference: refA,
        },
        {
          id: 'item-b',
          messageDispatchId: 'dispatch-id',
          receivableId: 'receivable-b',
          clientReferenceId: 'reference-b',
          amount: 50,
          dueDate,
          referenceSnapshot: 'B',
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: receivableB,
          clientReference: refB,
        },
      ],
    });
    const { service, updateDispatch } = serviceFactory({
      providerSendText,
      dispatchForProcessing: groupedDispatch,
      currentReceivables: [
        { ...receivableA, clientReference: refA },
        { ...receivableB, clientReference: refB },
      ],
    });

    await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(providerSendText).toHaveBeenCalledTimes(1);
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          receivableId: 'receivable-b',
          items: {
            create: [expect.objectContaining({ receivableId: 'receivable-b' })],
          },
        }),
      }),
    );
  });

  it('does not send a grouped dispatch when its scheduled cycle is obsolete', async () => {
    const providerSendText = vi.fn();
    const currentDueDate = new Date('2026-09-20T00:00:00.000Z');
    const currentReference = clientReference({
      dueDate: currentDueDate,
      billingNoticeDays: 0,
    });
    const currentReceivable = receivable({ dueDate: currentDueDate });
    const obsoleteDispatch = dispatch({
      status: 'PROCESSING',
      attempts: 1,
      idempotencyKey: 'billing-group:client-id:2026-09-15',
      requestId: 'billing-group:client-id:2026-09-15',
      receivable: currentReceivable,
      clientReference: currentReference,
      items: [
        {
          id: 'item-current',
          messageDispatchId: 'dispatch-id',
          receivableId: 'receivable-id',
          clientReferenceId: 'client-reference-id',
          amount: 50,
          dueDate: currentDueDate,
          referenceSnapshot: 'bruno1499',
          statusSnapshot: 'PENDENTE',
          createdAt: now,
          updatedAt: now,
          receivable: currentReceivable,
          clientReference: currentReference,
        },
      ],
    });
    const { service, updateDispatch } = serviceFactory({
      providerSendText,
      dispatchForProcessing: obsoleteDispatch,
      currentReceivables: [{ ...currentReceivable, clientReference: currentReference }],
    });

    await service.processDue(new Date('2026-09-15T12:00:00.000Z'));

    expect(providerSendText).not.toHaveBeenCalled();
    expect(updateDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'IGNORED',
          errorCode: 'BILLING_INTENT_MISMATCH',
        }),
      }),
    );
  });

  it('searches dispatches by ClientReference.reference without Client.reference fallback', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({ search: 'REF-001' });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { clientReference: { reference: { contains: 'REF-001', mode: 'insensitive' } } },
                {
                  receivable: {
                    clientReference: { reference: { contains: 'REF-001', mode: 'insensitive' } },
                  },
                },
              ]),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.messageDispatch.findMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { client: { reference: { contains: 'REF-001', mode: 'insensitive' } } },
          ]),
        }),
      }),
    );
  });

  it('filters billing dispatches by client across direct, receivable, reference and grouped items', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({ clientId: 'client-a', search: 'Maria' });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          AND: expect.arrayContaining([
            {
              OR: [
                { clientId: 'client-a' },
                { clientReference: { clientId: 'client-a' } },
                { receivable: { clientId: 'client-a' } },
                { items: { some: { clientReference: { clientId: 'client-a' } } } },
                { items: { some: { receivable: { clientId: 'client-a' } } } },
              ],
            },
            expect.objectContaining({
              OR: expect.arrayContaining([
                { client: { name: { contains: 'Maria', mode: 'insensitive' } } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('filters billing dispatches by client reference across direct, receivable and grouped items', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({ clientReferenceId: 'reference-a' });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          AND: expect.arrayContaining([
            {
              OR: [
                { clientReferenceId: 'reference-a' },
                { receivable: { clientReferenceId: 'reference-a' } },
                { items: { some: { clientReferenceId: 'reference-a' } } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('combines client and reference filters as independent constraints', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({
      clientId: 'client-a',
      clientReferenceId: 'reference-a',
      page: 3,
      pageSize: 10,
    });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ clientId: 'client-a' }]) }),
            expect.objectContaining({
              OR: expect.arrayContaining([{ clientReferenceId: 'reference-a' }]),
            }),
          ]),
        }),
        skip: 20,
        take: 10,
      }),
    );
  });

  it('preserves due date and scheduled date filters for billing dispatches', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({
      startDate: '2026-09-10',
      endDate: '2026-09-20',
      dueDate: '2026-09-15',
    });

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          scheduledFor: {
            gte: new Date('2026-09-10T00:00:00.000Z'),
            lte: new Date('2026-09-20T23:59:59.999Z'),
          },
          AND: expect.arrayContaining([
            {
              OR: [
                { receivable: { dueDate: new Date('2026-09-15T00:00:00.000Z') } },
                { items: { some: { dueDate: new Date('2026-09-15T00:00:00.000Z') } } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('keeps the global billing dispatch list behavior without client filters', async () => {
    const { service, prisma } = serviceFactory();

    await service.listDispatches({});

    expect(prisma.messageDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { origin: 'BILLING' },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
  });

  it('summarizes billing dispatches with filtered status classification independent from page', async () => {
    const { service, prisma } = serviceFactory();
    prisma.messageDispatch.count
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    await expect(
      service.dispatchesSummary({
        clientId: 'client-a',
        clientReferenceId: 'reference-a',
        status: 'FAILED',
        page: 3,
        pageSize: 10,
      }),
    ).resolves.toEqual({
      scheduled: 6,
      sent: 4,
      failed: 3,
      ignoredOrCanceled: 2,
    });

    expect(prisma.messageDispatch.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          status: { in: ['PENDING', 'SCHEDULED', 'PROCESSING'] },
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ clientId: 'client-a' }]) }),
            expect.objectContaining({
              OR: expect.arrayContaining([{ clientReferenceId: 'reference-a' }]),
            }),
          ]),
        }),
      }),
    );
    expect(prisma.messageDispatch.count).toHaveBeenCalledTimes(4);
  });

  it('excludes recovery dispatches from filtered billing summaries', async () => {
    const { service, prisma } = serviceFactory();

    await service.dispatchesSummary({ clientId: 'client-a' });

    expect(prisma.messageDispatch.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          origin: 'BILLING',
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ clientId: 'client-a' }]) }),
          ]),
        }),
      }),
    );
    expect(prisma.messageDispatch.count).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ origin: 'RECOVERY' }) }),
    );
  });
});
