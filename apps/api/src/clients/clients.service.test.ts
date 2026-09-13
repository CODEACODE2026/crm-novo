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
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    clientEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
  };
  const recoveryService = {
    handleClientStatusChange: vi.fn(),
    handleClientReferenceStatusChange: vi.fn(),
  };
  const service = new ClientsService(
    prisma as never,
    { ensureActivePlan: vi.fn() } as never,
    recoveryService as never,
    { cancelPendingForClientBeforePayment: vi.fn() } as never,
  );

  return { service, prisma, client, references, recoveryService };
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
