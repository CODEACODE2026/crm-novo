import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { ListClientEventsDto } from './dto/list-client-events.dto';
import { ClientsService } from './clients.service';
import { parseBusinessDate } from './utils/business-date';

const clients = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Bruno Silva',
    references: [{ reference: 'bruno1499' }],
    phone: '(44) 99821-2815',
    phoneNormalized: '5544998212815',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Joao Souza',
    references: [{ reference: 'joao2044' }],
    phone: '(44) 99999-1111',
    phoneNormalized: '5544999991111',
  },
];

function optionAt(index: number) {
  const client = clients[index]!;

  return {
    id: client.id,
    name: client.name,
    reference: client.references.map((reference) => reference.reference).join(', '),
    phoneNormalized: client.phoneNormalized,
  };
}

function createService() {
  const prisma = {
    client: {
      findMany: ({ where, take }: Prisma.ClientFindManyArgs) => {
        const terms = (where?.OR ?? [])
          .flatMap((condition) => [
            getContains(condition.name),
            getReferenceContains(condition),
            getContains(condition.phone),
            getContains(condition.phoneNormalized),
          ])
          .filter((term): term is string => Boolean(term));

        return Promise.resolve(
          clients
            .filter((client) =>
              terms.some((term) => {
                const normalizedTerm = term.toLowerCase();

                return (
                  client.name.toLowerCase().includes(normalizedTerm) ||
                  client.references.some((reference) =>
                    reference.reference.toLowerCase().includes(normalizedTerm),
                  ) ||
                  client.phone.toLowerCase().includes(normalizedTerm) ||
                  client.phoneNormalized.includes(term)
                );
              }),
            )
            .slice(0, take)
            .map(({ id, name, references, phoneNormalized }) => ({
              id,
              name,
              references,
              phoneNormalized,
            })),
        );
      },
    },
  };

  return new ClientsService(prisma as never, {} as never, {} as never, {} as never);
}

function getContains(filter: { contains?: unknown } | string | undefined) {
  if (typeof filter === 'object' && 'contains' in filter && typeof filter.contains === 'string') {
    return filter.contains;
  }

  return typeof filter === 'string' ? filter : undefined;
}

function getReferenceContains(condition: Prisma.ClientWhereInput) {
  const referenceFilter = condition.references?.some;

  if (
    typeof referenceFilter === 'object' &&
    referenceFilter !== null &&
    'reference' in referenceFilter
  ) {
    return getContains(referenceFilter.reference);
  }

  return undefined;
}

function manualClientDto(overrides: Partial<Parameters<ClientsService['create']>[0]> = {}) {
  return {
    name: 'Maria Inicial',
    phone: '(44) 99999-3030',
    reference: 'MARIA-001',
    planId: 'plan-id',
    recurringValue: 30,
    dueDate: '2026-10-20',
    billingNoticeDays: 0,
    ...overrides,
  };
}

function createClientEventsService() {
  const clientAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const clientBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const sharedCreatedAt = new Date('2026-09-19T12:00:00.000Z');
  const olderBase = new Date('2026-09-18T12:00:00.000Z').getTime();
  const clientAEvents = [
    eventRecord({
      clientId: clientAId,
      createdAt: sharedCreatedAt,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: 'Evento empatado menor',
    }),
    eventRecord({
      clientId: clientAId,
      createdAt: sharedCreatedAt,
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      title: 'Evento empatado maior',
    }),
    ...Array.from({ length: 25 }, (_, index) =>
      eventRecord({
        clientId: clientAId,
        createdAt: new Date(olderBase - index * 24 * 60 * 60 * 1000),
        id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
        title: `Evento ${index + 1}`,
      }),
    ),
  ];
  const events = [
    ...clientAEvents,
    eventRecord({
      clientId: clientBId,
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Evento de outro cliente',
    }),
  ];

  const prisma = {
    client: {
      count: vi.fn(({ where }: Prisma.ClientCountArgs) =>
        Promise.resolve(where?.id === clientAId || where?.id === clientBId ? 1 : 0),
      ),
    },
    clientEvent: {
      findMany: vi.fn(({ where, orderBy, skip, take }: Prisma.ClientEventFindManyArgs) => {
        expect(orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);

        return Promise.resolve(
          events
            .filter((event) => event.clientId === clientEventWhereClientId(where))
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id),
            )
            .slice(skip, Number(skip) + Number(take)),
        );
      }),
      count: vi.fn(({ where }: Prisma.ClientEventCountArgs) =>
        Promise.resolve(
          events.filter((event) => event.clientId === clientEventWhereClientId(where)).length,
        ),
      ),
    },
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };

  return {
    clientAId,
    clientBId,
    service: new ClientsService(prisma as never, {} as never, {} as never, {} as never),
  };
}

function clientEventWhereClientId(where: Prisma.ClientEventWhereInput | undefined) {
  return typeof where?.clientId === 'string' ? where.clientId : undefined;
}

function eventRecord({
  clientId,
  createdAt,
  id,
  title,
}: {
  clientId: string;
  createdAt: Date;
  id: string;
  title: string;
}) {
  return {
    clientId,
    createdAt,
    createdByUserId: null,
    description: null,
    id,
    metadata: null,
    title,
    type: 'CLIENT_UPDATED' as const,
  };
}

function validateClientEventsQuery(payload: Record<string, unknown>) {
  return validate(plainToInstance(ListClientEventsDto, payload));
}

describe('ClientsService options', () => {
  it('searches lightweight client options by name', async () => {
    const service = createService();

    await expect(service.options({ search: 'bruno' })).resolves.toEqual([optionAt(0)]);
  });

  it('searches lightweight client options by reference', async () => {
    const service = createService();

    await expect(service.options({ search: 'joao2044' })).resolves.toEqual([optionAt(1)]);
  });

  it('searches lightweight client options by formatted phone', async () => {
    const service = createService();

    await expect(service.options({ search: '(44) 99821-2815' })).resolves.toEqual([optionAt(0)]);
  });

  it('searches lightweight client options by normalized phone', async () => {
    const service = createService();

    await expect(service.options({ search: '5544999991111' })).resolves.toEqual([optionAt(1)]);
  });

  it('returns no options without results or search text', async () => {
    const service = createService();

    await expect(service.options({ search: 'inexistente' })).resolves.toEqual([]);
    await expect(service.options({ search: '' })).resolves.toEqual([]);
  });
});

describe('ClientsService client events pagination', () => {
  it('paginates client events with total and deterministic id tie-breaker', async () => {
    const fake = createClientEventsService();
    const page1 = await fake.service.listEvents(fake.clientAId, { page: 1, pageSize: 10 });
    const page2 = await fake.service.listEvents(fake.clientAId, { page: 2, pageSize: 10 });
    const page3 = await fake.service.listEvents(fake.clientAId, { page: 3, pageSize: 10 });

    expect(page1.items).toHaveLength(10);
    expect(page2.items).toHaveLength(10);
    expect(page3.items).toHaveLength(7);
    expect(page1.pagination).toEqual({ page: 1, pageSize: 10, total: 27, totalPages: 3 });
    expect(page2.pagination).toEqual({ page: 2, pageSize: 10, total: 27, totalPages: 3 });
    expect(page3.pagination).toEqual({ page: 3, pageSize: 10, total: 27, totalPages: 3 });
    expect(page1.items.map((event) => event.id).slice(0, 2)).toEqual([
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ]);
  });

  it('keeps events isolated by client id', async () => {
    const fake = createClientEventsService();

    const result = await fake.service.listEvents(fake.clientAId, { page: 1, pageSize: 50 });

    expect(result.items).toHaveLength(27);
    expect(result.items.every((event) => event.clientId === fake.clientAId)).toBe(true);
    expect(result.items.some((event) => event.clientId === fake.clientBId)).toBe(false);
  });

  it('validates invalid pagination query values', async () => {
    await expect(validateClientEventsQuery({ page: 0 })).resolves.not.toHaveLength(0);
    await expect(validateClientEventsQuery({ pageSize: 0 })).resolves.not.toHaveLength(0);
    await expect(validateClientEventsQuery({ pageSize: 101 })).resolves.not.toHaveLength(0);
  });
});

describe('ClientsService manual client creation', () => {
  it('keeps immediate activation as the default manual creation behavior', async () => {
    const fake = createClientCreationService();

    await fake.service.create(manualClientDto(), 'user-id');

    expect(fake.clients[0]).toMatchObject({ status: 'ATIVO' });
    expect(fake.references[0]).toMatchObject({ status: 'ATIVO' });
    expect(fake.receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      fake.references[0]!.id,
      fake.prisma,
    );
    expect(fake.receivables).toHaveLength(0);
  });

  it('creates an initial activation receivable when manual creation waits for payment', async () => {
    const fake = createClientCreationService();

    await fake.service.create(manualClientDto({ generateInitialReceivable: true }), 'user-id');

    expect(fake.clients[0]).toMatchObject({ status: 'ATIVO' });
    expect(fake.references[0]).toMatchObject({ status: 'PENDENTE_PAGAMENTO' });
    expect(fake.receivableCycleService.ensureCurrentCycleReceivable).not.toHaveBeenCalled();
    expect(fake.receivables).toHaveLength(1);
    expect(fake.receivables[0]).toMatchObject({
      clientId: fake.clients[0]!.id,
      clientReferenceId: fake.references[0]!.id,
      purpose: 'INITIAL_ACTIVATION',
      description: 'Cobranca inicial de ativacao - Mensal',
      status: 'PENDENTE',
    });
    expect(fake.receivables[0]!.amount.toString()).toBe('30');
    expect(fake.receivables[0]!.dueDate).toEqual(parseBusinessDate('2026-10-20'));
  });

  it('keeps referral pending when manual creation waits for initial payment', async () => {
    const fake = createClientCreationService();

    await fake.service.create(
      manualClientDto({
        generateInitialReceivable: true,
        referrerClientId: 'referrer-id',
        referralRewardType: 'FREE_MONTH',
      }),
      'user-id',
    );

    expect(fake.referralsService.createPending).toHaveBeenCalledWith(fake.prisma, {
      referredClientId: fake.clients[0]!.id,
      referrerClientId: 'referrer-id',
      rewardType: 'FREE_MONTH',
      rewardValue: undefined,
      rewardDescription: undefined,
      actorUserId: 'user-id',
    });
    expect(fake.references[0]).toMatchObject({ status: 'PENDENTE_PAGAMENTO' });
    expect(fake.receivables[0]).toMatchObject({
      purpose: 'INITIAL_ACTIVATION',
      status: 'PENDENTE',
    });
  });

  it('preserves current pending referral behavior without initial activation', async () => {
    const fake = createClientCreationService();

    await fake.service.create(
      manualClientDto({
        referrerClientId: 'referrer-id',
        referralRewardType: 'FREE_MONTH',
      }),
      'user-id',
    );

    expect(fake.references[0]).toMatchObject({ status: 'ATIVO' });
    expect(fake.receivableCycleService.ensureCurrentCycleReceivable).toHaveBeenCalledTimes(1);
    expect(fake.receivables).toHaveLength(0);
    expect(fake.referralsService.createPending).toHaveBeenCalledWith(fake.prisma, {
      referredClientId: fake.clients[0]!.id,
      referrerClientId: 'referrer-id',
      rewardType: 'FREE_MONTH',
      rewardValue: undefined,
      rewardDescription: undefined,
      actorUserId: 'user-id',
    });
  });
});

describe('ClientsService legacy client updates', () => {
  it('updates personal fields for a client with one reference without changing the reference', async () => {
    const fake = createClientUpdateService({ references: [clientReference()] });

    await fake.service.update(
      fake.client.id,
      { name: 'Bruno Atualizado', email: 'bruno@example.com' },
      'user-id',
    );

    expect(fake.client).toMatchObject({
      name: 'Bruno Atualizado',
      email: 'bruno@example.com',
      reference: 'LEGACY-001',
      planId: 'plan-id',
    });
    expect(fake.references[0]).toMatchObject({
      reference: 'REF-001',
      planId: 'plan-id',
      dueDate: parseBusinessDate('2026-10-10'),
    });
    expect(fake.prisma.clientReference.update).not.toHaveBeenCalled();
    expect(fake.prisma.clientReference.findFirst).not.toHaveBeenCalled();
  });

  it('updates personal fields for a client with two references without changing any reference', async () => {
    const fake = createClientUpdateService({
      references: [
        clientReference({ id: 'ref-1', reference: 'REF-001' }),
        clientReference({ id: 'ref-2', reference: 'REF-002' }),
      ],
    });

    await fake.service.update(fake.client.id, { name: 'Bruno Dois' }, 'user-id');

    expect(fake.client.name).toBe('Bruno Dois');
    expect(fake.references.map((reference) => reference.reference)).toEqual(['REF-001', 'REF-002']);
    expect(fake.prisma.clientReference.update).not.toHaveBeenCalled();
    expect(fake.prisma.clientReference.findFirst).not.toHaveBeenCalled();
  });

  it('rejects operational fields on PATCH /clients/:id without touching references', async () => {
    const fake = createClientUpdateService({ references: [clientReference()] });

    await expect(
      fake.service.update(
        fake.client.id,
        { name: 'Bruno', reference: 'REF-999', planId: 'other-plan' } as never,
        'user-id',
      ),
    ).rejects.toThrow('Atualize campos operacionais pela referencia do cliente');

    expect(fake.prisma.client.update).not.toHaveBeenCalled();
    expect(fake.prisma.clientReference.findFirst).not.toHaveBeenCalled();
    expect(fake.prisma.clientReference.update).not.toHaveBeenCalled();
  });

  it('blocks global status changes when the client has multiple references', async () => {
    const fake = createClientUpdateService({
      references: [
        clientReference({ id: 'ref-1', reference: 'REF-001' }),
        clientReference({ id: 'ref-2', reference: 'REF-002' }),
      ],
    });

    await expect(
      fake.service.updateStatus(fake.client.id, { status: 'INATIVO' }, 'user-id'),
    ).rejects.toThrow('Cliente possui multiplas referencias');

    expect(fake.prisma.client.update).not.toHaveBeenCalled();
    expect(fake.prisma.clientReference.update).not.toHaveBeenCalled();
    expect(fake.recoveryService.handleClientStatusChange).not.toHaveBeenCalled();
    expect(fake.recoveryService.handleClientReferenceStatusChange).not.toHaveBeenCalled();
  });

  it('cancels future billing dispatches when a reference cycle changes', async () => {
    const fake = createClientUpdateService({ references: [clientReference()] });

    await fake.service.updateReference('ref-1', { dueDate: '2026-10-20' }, 'user-id');

    expect(fake.receivableCycleService.updatePendingCurrentCycleReceivable).toHaveBeenCalledWith(
      'ref-1',
      parseBusinessDate('2026-10-10'),
      expect.objectContaining({
        dueDate: parseBusinessDate('2026-10-20'),
        amount: new Prisma.Decimal('100.00'),
        planName: 'Mensal',
      }),
      fake.prisma,
    );
    expect(fake.prisma.messageDispatch.updateMany).toHaveBeenCalledWith({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [{ clientReferenceId: 'ref-1' }, { items: { some: { clientReferenceId: 'ref-1' } } }],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'CLIENT_REFERENCE_CYCLE_CHANGED',
        errorMessage: 'Cobranca futura cancelada porque o ciclo da referencia foi alterado.',
        nextAttemptAt: null,
      },
    });
  });
});

function createClientCreationService() {
  const plan = {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('30.00'),
    active: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const clientsCreated: Array<Record<string, unknown> & { id: string; status: string }> = [];
  const references: Array<Record<string, unknown> & { id: string; status: string }> = [];
  const receivables: Array<
    Record<string, unknown> & {
      id: string;
      amount: Prisma.Decimal;
      dueDate: Date;
      purpose: string;
      status: string;
    }
  > = [];
  const events: Array<Record<string, unknown> & { id: string }> = [];
  const prisma = {
    client: {
      create: vi.fn(
        ({ data, include }: { data: Record<string, unknown>; include?: { plan?: boolean } }) => {
          const client = {
            id: 'created-client-id',
            ...data,
            status: typeof data.status === 'string' ? data.status : 'ATIVO',
            createdAt: new Date('2026-09-17T00:00:00.000Z'),
            updatedAt: new Date('2026-09-17T00:00:00.000Z'),
          };
          clientsCreated.push(client);

          return Promise.resolve(include?.plan ? { ...client, plan } : client);
        },
      ),
      findUnique: vi.fn(() => {
        const client = clientsCreated[0];

        if (!client) return Promise.resolve(null);

        return Promise.resolve({
          ...client,
          plan,
          references: references.map((reference) => ({ ...reference, plan })),
          renewals: [],
          receivables: receivables.map((receivable) => ({
            ...receivable,
            paymentIntents: [],
          })),
          messageDispatches: [],
          statusHistory: [],
          events,
          recoveryCampaigns: [],
          referralReceived: null,
          referralsMade: [],
        });
      }),
    },
    clientReference: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const reference = {
          id: 'created-reference-id',
          ...data,
          status: typeof data.status === 'string' ? data.status : 'ATIVO',
          notes: data.notes ?? null,
          createdAt: new Date('2026-09-17T00:00:00.000Z'),
          updatedAt: new Date('2026-09-17T00:00:00.000Z'),
        };
        references.push(reference);

        return Promise.resolve(reference);
      }),
    },
    receivable: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const receivable = {
          id: 'initial-receivable-id',
          ...data,
          amount: new Prisma.Decimal(String(data.amount)),
          dueDate: data.dueDate instanceof Date ? data.dueDate : parseBusinessDate('2026-10-20'),
          purpose: typeof data.purpose === 'string' ? data.purpose : 'RENEWAL',
          status: typeof data.status === 'string' ? data.status : 'PENDENTE',
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: new Date('2026-09-17T00:00:00.000Z'),
          updatedAt: new Date('2026-09-17T00:00:00.000Z'),
        };
        receivables.push(receivable);

        return Promise.resolve(receivable);
      }),
    },
    clientEvent: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        events.push({
          id: `event-${events.length + 1}`,
          description: null,
          createdAt: new Date('2026-09-17T00:00:00.000Z'),
          ...data,
        });

        return Promise.resolve(events.at(-1));
      }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const referralsService = {
    createPending: vi.fn().mockResolvedValue({
      id: 'referral-id',
      status: 'PENDING',
      rewardType: 'FREE_MONTH',
    }),
  };
  const receivableCycleService = {
    ensureCurrentCycleReceivable: vi.fn().mockResolvedValue({ action: 'created' }),
  };
  const service = new ClientsService(
    prisma as never,
    { ensureActivePlan: vi.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    referralsService as never,
    receivableCycleService as never,
  );

  return {
    service,
    prisma,
    clients: clientsCreated,
    references,
    receivables,
    events,
    referralsService,
    receivableCycleService,
  };
}

function createClientUpdateService({
  references,
}: {
  references: Array<ReturnType<typeof clientReference>>;
}) {
  const plan = {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('100.00'),
    active: true,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
  const client = {
    id: 'client-id',
    name: 'Bruno',
    phone: '(44) 99821-2815',
    phoneNormalized: '5544998212815',
    email: null as string | null,
    reference: 'LEGACY-001',
    planId: plan.id,
    recurringValue: new Prisma.Decimal('100.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 3,
    notes: null as string | null,
    status: 'ATIVO' as const,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    plan,
  };
  const clientWithRelations = () => ({
    ...client,
    references: references.map((reference) => ({ ...reference, plan })),
    renewals: [],
    receivables: [],
    messageDispatches: [],
    statusHistory: [],
    events: [],
    recoveryCampaigns: [],
    referralReceived: null,
    referralsMade: [],
  });
  const clientUpdate = vi.fn(({ data }) => {
    Object.assign(client, data);
    return Promise.resolve(client);
  });
  const prisma = {
    client: {
      count: vi.fn().mockResolvedValue(1),
      update: clientUpdate,
      findUnique: vi.fn().mockImplementation(() => Promise.resolve(clientWithRelations())),
    },
    clientReference: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        const reference = references.find((item) => item.id === where.id);
        return Promise.resolve(reference ? { ...reference, plan } : null);
      }),
      findFirst: vi.fn(),
      update: vi.fn(
        ({
          where,
          data,
          include,
        }: {
          where: { id: string };
          data: Partial<ReturnType<typeof clientReference>>;
          include?: { plan?: boolean };
        }) => {
          const reference = references.find((item) => item.id === where.id);
          if (!reference) throw new Error('Reference not found');
          Object.assign(reference, data);
          return Promise.resolve(include?.plan ? { ...reference, plan } : reference);
        },
      ),
      findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => {
        const reference = references.find((item) => item.id === where.id);
        if (!reference) throw new Error('Reference not found');
        return Promise.resolve({ ...reference, plan });
      }),
    },
    clientEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    messageDispatch: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const recoveryService = {
    handleClientStatusChange: vi.fn(),
    handleClientReferenceStatusChange: vi.fn(),
  };
  const receivableCycleService = {
    updatePendingCurrentCycleReceivable: vi.fn().mockResolvedValue({ id: 'receivable-id' }),
    ensureCurrentCycleReceivable: vi.fn().mockResolvedValue({ action: 'kept' }),
  };
  const service = new ClientsService(
    prisma as never,
    { ensureActivePlan: vi.fn().mockResolvedValue(undefined) } as never,
    recoveryService as never,
    { cancelPendingForClientBeforePayment: vi.fn() } as never,
    receivableCycleService as never,
  );

  return { service, prisma, client, references, recoveryService, receivableCycleService };
}

function clientReference(overrides: Partial<ReturnType<typeof baseClientReference>> = {}) {
  return { ...baseClientReference(), ...overrides };
}

function baseClientReference() {
  return {
    id: 'ref-1',
    clientId: 'client-id',
    reference: 'REF-001',
    planId: 'plan-id',
    recurringValue: new Prisma.Decimal('100.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 3,
    status: 'ATIVO' as const,
    notes: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}
