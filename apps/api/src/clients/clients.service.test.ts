import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
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
