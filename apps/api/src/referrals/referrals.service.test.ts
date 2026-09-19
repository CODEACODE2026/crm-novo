import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type ReferralStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReferralsService } from './referrals.service';

const actorUserId = '22222222-2222-4222-8222-222222222222';

type TestClient = {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  reference: string;
  planId: string;
  recurringValue: Prisma.Decimal;
  dueDate: Date;
  billingAnchorDay: number;
  billingNoticeDays: number;
  notes: string | null;
  status: 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO';
  createdAt: Date;
  updatedAt: Date;
};

type TestReferral = Record<string, unknown>;
type MockTx = Record<string, unknown> & {
  $transaction: <T>(input: Promise<T>[] | ((client: MockTx) => Promise<T>)) => Promise<T | T[]>;
};

function createReferralPrisma() {
  const clients: TestClient[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Bruno',
      phone: '(11) 99999-9999',
      phoneNormalized: '5511999999999',
      email: null,
      reference: 'BRU-001',
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recurringValue: new Prisma.Decimal('100.00'),
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
      billingNoticeDays: 3,
      notes: null,
      status: 'ATIVO',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Joao',
      phone: '(11) 98888-8888',
      phoneNormalized: '5511988888888',
      email: null,
      reference: 'JOA-001',
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recurringValue: new Prisma.Decimal('100.00'),
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
      billingNoticeDays: 3,
      notes: null,
      status: 'PENDENTE_PAGAMENTO',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Ana',
      phone: '(11) 97777-7777',
      phoneNormalized: '5511977777777',
      email: null,
      reference: 'ANA-001',
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      recurringValue: new Prisma.Decimal('100.00'),
      dueDate: parseBusinessDate('2026-01-31'),
      billingAnchorDay: 31,
      billingNoticeDays: 3,
      notes: null,
      status: 'ATIVO',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
  const referrals: TestReferral[] = [];
  const clientReferences = clients.map((client) => ({
    id: `ref-${client.id}`,
    clientId: client.id,
    reference: client.reference,
    planId: client.planId,
    recurringValue: client.recurringValue,
    dueDate: client.dueDate,
    billingAnchorDay: client.billingAnchorDay,
    billingNoticeDays: client.billingNoticeDays,
    notes: client.notes,
    status: client.status,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  }));
  const events: Array<Record<string, unknown>> = [];
  const renewals: Array<Record<string, unknown>> = [];
  const receivables: Array<Record<string, unknown>> = [];
  const transactions: Array<Record<string, unknown>> = [];
  const messageDispatchUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

  const withReferences = (client: TestClient | undefined) =>
    client
      ? {
          ...client,
          references: clientReferences.filter((reference) => reference.clientId === client.id),
        }
      : null;

  const includeClients = (referral: Record<string, unknown>) => ({
    ...referral,
    referredClient: withReferences(
      clients.find((client) => client.id === referral.referredClientId),
    ),
    referrerClient: withReferences(
      clients.find((client) => client.id === referral.referrerClientId),
    ),
    rewardClientReference:
      clientReferences.find((reference) => reference.id === referral.rewardClientReferenceId) ??
      null,
  });

  const tx: MockTx = {
    client: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(clients.find((client) => client.id === where.id) ?? null),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const client = clients.find((item) => item.id === where.id);
        if (!client) throw new Error('missing client');
        Object.assign(client, data);
        return Promise.resolve(client);
      },
    },
    clientReference: {
      findFirst: ({
        where,
      }: {
        where: { id?: string; clientId?: string; status?: { in: string[] } };
      }) =>
        Promise.resolve(
          clientReferences.find(
            (reference) =>
              (where.id === undefined || reference.id === where.id) &&
              (where.clientId === undefined || reference.clientId === where.clientId) &&
              (where.status?.in === undefined || where.status.in.includes(reference.status)),
          ) ?? null,
        ),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const reference = clientReferences.find((item) => item.id === where.id);
        if (!reference) throw new Error('missing reference');
        Object.assign(reference, data);
        return Promise.resolve(reference);
      },
    },
    referral: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        if (referrals.some((referral) => referral.referredClientId === data.referredClientId)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['referredClientId'] },
          });
        }

        const referral = {
          id: `ref-${referrals.length + 1}`,
          status: 'PENDING',
          rewardType: 'FREE_MONTH',
          rewardValue: null,
          rewardDescription: null,
          qualifiedAt: null,
          appliedAt: null,
          canceledAt: null,
          cancellationReason: null,
          appliedPreviousDueDate: null,
          appliedNewDueDate: null,
          createdAt: new Date('2026-09-12T00:00:00.000Z'),
          updatedAt: new Date('2026-09-12T00:00:00.000Z'),
          ...data,
        };
        referrals.push(referral);
        return Promise.resolve(referral);
      },
      findUnique: ({
        where,
        include,
      }: {
        where: { id?: string; referredClientId?: string };
        include?: unknown;
      }) => {
        const referral =
          referrals.find(
            (item) =>
              (where.id === undefined || item.id === where.id) &&
              (where.referredClientId === undefined ||
                item.referredClientId === where.referredClientId),
          ) ?? null;
        return Promise.resolve(referral && include ? includeClients(referral) : referral);
      },
      updateMany: ({ where, data }: { where: { id: string; status?: string }; data: object }) => {
        const referral = referrals.find(
          (item) =>
            item.id === where.id && (where.status === undefined || item.status === where.status),
        );
        if (!referral) return Promise.resolve({ count: 0 });
        Object.assign(referral, data);
        return Promise.resolve({ count: 1 });
      },
      update: ({
        where,
        data,
        include,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        include?: unknown;
      }) => {
        const referral = referrals.find((item) => item.id === where.id);
        if (!referral) throw new Error('missing referral');
        const rewardClientReference = data.rewardClientReference as
          { connect?: { id: string } } | undefined;
        Object.assign(referral, data, {
          ...(rewardClientReference?.connect
            ? { rewardClientReferenceId: rewardClientReference.connect.id }
            : {}),
        });
        return Promise.resolve(include ? includeClients(referral) : referral);
      },
      count: ({ where }: { where?: { status?: string; appliedAt?: null } } = {}) =>
        Promise.resolve(
          referrals.filter(
            (referral) =>
              (!where?.status || referral.status === where.status) &&
              (where?.appliedAt !== null || referral.appliedAt === null),
          ).length,
        ),
      findMany: () => Promise.resolve(referrals.map(includeClients)),
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return Promise.resolve(data);
      },
      createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
        events.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
    messageDispatch: {
      updateMany: messageDispatchUpdateMany,
    },
    $transaction: async <T>(input: Promise<T>[] | ((client: MockTx) => Promise<T>)) =>
      Array.isArray(input) ? Promise.all(input) : input(tx),
  };

  const prisma = tx as unknown;

  return {
    clientReferences,
    clients,
    events,
    prisma,
    receivables,
    referrals,
    renewals,
    messageDispatchUpdateMany,
    transactions,
  };
}

function createReferralListPrisma(statuses: ReferralStatus[]) {
  const referrerBruno = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Bruno',
    phone: '(11) 99999-9999',
    phoneNormalized: '5511999999999',
    reference: 'BRU-001',
    status: 'ATIVO',
    references: [
      {
        id: 'ref-bruno',
        reference: 'BRU-001',
        dueDate: parseBusinessDate('2026-10-10'),
        billingAnchorDay: 10,
        status: 'ATIVO',
      },
    ],
  };
  const referrerSoraia = {
    ...referrerBruno,
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Soraia',
    phoneNormalized: '5511988888888',
    reference: 'SOR-001',
    references: [
      {
        id: 'ref-soraia',
        reference: 'SOR-001',
        dueDate: parseBusinessDate('2026-10-15'),
        billingAnchorDay: 15,
        status: 'ATIVO',
      },
    ],
  };
  const referrals = statuses.map((status, index) => {
    const referredClient = {
      ...referrerBruno,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
      name: index % 2 === 0 ? `Cliente Bruno ${index + 1}` : `Cliente Soraia ${index + 1}`,
      phoneNormalized: `5511977${String(index + 1).padStart(7, '0')}`,
      reference: index % 2 === 0 ? `CBR-${index + 1}` : `SOR-${index + 1}`,
      references: [
        {
          id: `ref-referred-${index + 1}`,
          reference: index % 2 === 0 ? `CBR-${index + 1}` : `SOR-${index + 1}`,
          dueDate: parseBusinessDate('2026-11-10'),
          billingAnchorDay: 10,
          status: 'ATIVO',
        },
      ],
    };
    const referrerClient = index < 18 ? referrerBruno : referrerSoraia;

    return {
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`,
      referredClientId: referredClient.id,
      referrerClientId: referrerClient.id,
      status,
      rewardType: 'FREE_MONTH',
      rewardValue: null,
      rewardDescription: null,
      qualifiedAt: status === 'PENDING' ? null : new Date('2026-09-12T00:00:00.000Z'),
      appliedAt: status === 'REWARDED' ? new Date('2026-09-13T00:00:00.000Z') : null,
      canceledAt: status === 'CANCELED' ? new Date('2026-09-14T00:00:00.000Z') : null,
      cancellationReason: status === 'CANCELED' ? 'Cancelada em teste.' : null,
      appliedPreviousDueDate: null,
      appliedNewDueDate: null,
      rewardClientReferenceId: null,
      rewardClientReference: null,
      referredClient,
      referrerClient,
      createdAt: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
      updatedAt: new Date(`2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
    };
  });

  const matchesText = (value: string, filter: { contains: string }) =>
    value.toLocaleLowerCase().includes(filter.contains.toLocaleLowerCase());
  const matchesReference = (
    references: Array<{ reference: string }>,
    filter: { some: { reference: { contains: string } } },
  ) => references.some((reference) => matchesText(reference.reference, filter.some.reference));
  const matchesWhere = (
    referral: (typeof referrals)[number],
    where: Record<string, unknown>,
  ): boolean => {
    if (Array.isArray(where.AND)) {
      return where.AND.every((item): boolean =>
        matchesWhere(referral, item as Record<string, unknown>),
      );
    }

    if (Array.isArray(where.OR)) {
      return where.OR.some((item): boolean =>
        matchesWhere(referral, item as Record<string, unknown>),
      );
    }

    if (where.status && referral.status !== where.status) return false;
    if (where.referrerClientId && referral.referrerClientId !== where.referrerClientId) {
      return false;
    }
    if (where.referredClient) {
      const clientWhere = where.referredClient as {
        name?: { contains: string };
        phoneNormalized?: { contains: string };
        references?: { some: { reference: { contains: string } } };
      };

      if (clientWhere.name && !matchesText(referral.referredClient.name, clientWhere.name)) {
        return false;
      }
      if (
        clientWhere.phoneNormalized &&
        !referral.referredClient.phoneNormalized.includes(clientWhere.phoneNormalized.contains)
      ) {
        return false;
      }
      if (
        clientWhere.references &&
        !matchesReference(referral.referredClient.references, clientWhere.references)
      ) {
        return false;
      }
    }
    if (where.referrerClient) {
      const clientWhere = where.referrerClient as {
        name?: { contains: string };
        phoneNormalized?: { contains: string };
        references?: { some: { reference: { contains: string } } };
      };

      if (clientWhere.name && !matchesText(referral.referrerClient.name, clientWhere.name)) {
        return false;
      }
      if (
        clientWhere.phoneNormalized &&
        !referral.referrerClient.phoneNormalized.includes(clientWhere.phoneNormalized.contains)
      ) {
        return false;
      }
      if (
        clientWhere.references &&
        !matchesReference(referral.referrerClient.references, clientWhere.references)
      ) {
        return false;
      }
    }

    return true;
  };
  const filtered = (where: Record<string, unknown> = {}) =>
    referrals.filter((referral) => matchesWhere(referral, where));
  const referral = {
    count: vi.fn(({ where }: { where?: Record<string, unknown> } = {}) =>
      Promise.resolve(filtered(where).length),
    ),
    findMany: vi.fn(
      ({
        skip = 0,
        take = 100,
        where,
      }: {
        skip?: number;
        take?: number;
        where?: Record<string, unknown>;
      }) =>
        Promise.resolve(
          [...filtered(where)]
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id),
            )
            .slice(skip, skip + take),
        ),
    ),
  };

  return {
    referrerBruno,
    referrals,
    prisma: {
      referral,
      $transaction: <T>(items: Array<Promise<T>>) => Promise.all(items),
    },
  };
}

describe('ReferralsService', () => {
  it('paginates referrals with a real total and stable page windows', async () => {
    const fake = createReferralListPrisma(Array.from({ length: 27 }, () => 'PENDING'));
    const service = new ReferralsService(fake.prisma as never);

    const pageOne = await service.list({ page: 1, pageSize: 10 });
    const pageTwo = await service.list({ page: 2, pageSize: 10 });
    const pageThree = await service.list({ page: 3, pageSize: 10 });

    expect(pageOne.items).toHaveLength(10);
    expect(pageTwo.items).toHaveLength(10);
    expect(pageThree.items).toHaveLength(7);
    expect(pageOne.pagination).toEqual({ page: 1, pageSize: 10, total: 27, totalPages: 3 });
    expect(pageTwo.pagination).toEqual({ page: 2, pageSize: 10, total: 27, totalPages: 3 });
    expect(pageThree.pagination).toEqual({ page: 3, pageSize: 10, total: 27, totalPages: 3 });
    expect(fake.prisma.referral.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(fake.prisma.referral.count).toHaveBeenCalledWith({ where: {} });
  });

  it('applies search, referrer and status filters to findMany and count', async () => {
    const fake = createReferralListPrisma([
      'PENDING',
      'QUALIFIED',
      'REWARDED',
      'CANCELED',
      'QUALIFIED',
      'PENDING',
    ]);
    const service = new ReferralsService(fake.prisma as never);

    const result = await service.list({
      page: 1,
      pageSize: 10,
      referrerClientId: fake.referrerBruno.id,
      search: 'CBR-5',
      status: 'QUALIFIED',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ status: 'QUALIFIED' });
    const findManyCall = fake.prisma.referral.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    const countCall = fake.prisma.referral.count.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };

    expect(findManyCall.where).toMatchObject({
      referrerClientId: fake.referrerBruno.id,
      status: 'QUALIFIED',
    });
    expect(countCall.where).toMatchObject({
      referrerClientId: fake.referrerBruno.id,
      status: 'QUALIFIED',
    });
    expect(Array.isArray(findManyCall.where.OR)).toBe(true);
    expect(Array.isArray(countCall.where.OR)).toBe(true);
    expect(result.pagination).toMatchObject({ total: 1, totalPages: 1 });
  });

  it('summarizes filtered referrals independently from page and status filters', async () => {
    const fake = createReferralListPrisma([
      ...Array.from({ length: 10 }, () => 'PENDING' as const),
      ...Array.from({ length: 6 }, () => 'QUALIFIED' as const),
      ...Array.from({ length: 5 }, () => 'REWARDED' as const),
      ...Array.from({ length: 4 }, () => 'CANCELED' as const),
    ]);
    const service = new ReferralsService(fake.prisma as never);

    const all = await service.summary({ page: 1, pageSize: 10 });
    const pageThreeQualified = await service.summary({
      page: 3,
      pageSize: 10,
      status: 'QUALIFIED',
    });
    const bruno = await service.summary({ referrerClientId: fake.referrerBruno.id });

    expect(all).toEqual({
      awaitingReward: 6,
      canceled: 4,
      pending: 10,
      qualified: 6,
      rewarded: 5,
      total: 25,
    });
    expect(pageThreeQualified).toEqual(all);
    expect(bruno).toEqual({
      awaitingReward: 6,
      canceled: 0,
      pending: 10,
      qualified: 6,
      rewarded: 2,
      total: 18,
    });
  });

  it('keeps clients without referral unchanged', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    await expect(
      service.createPending(fake.prisma as never, {
        referredClientId: fake.clients[1]!.id,
        actorUserId,
      }),
    ).resolves.toBeNull();
    expect(fake.referrals).toHaveLength(0);
  });

  it('creates one pending referral for manual or waitlist client creation', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    const referral = await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
      actorUserId,
    });

    expect(referral).toMatchObject({
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
      status: 'PENDING',
      rewardType: 'FREE_MONTH',
    });
    expect(fake.events.map((event) => event.type)).toEqual([
      'REFERRAL_CREATED',
      'REFERRAL_CREATED',
    ]);
  });

  it('rejects self referral and duplicate referred client', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    await expect(
      service.createPending(fake.prisma as never, {
        referredClientId: fake.clients[0]!.id,
        referrerClientId: fake.clients[0]!.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
    });
    await expect(
      service.createPending(fake.prisma as never, {
        referredClientId: fake.clients[1]!.id,
        referrerClientId: fake.clients[2]!.id,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('qualifies once after initial activation payment replay', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
    });
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );

    expect(fake.referrals[0]).toMatchObject({ status: 'QUALIFIED' });
    expect(fake.events.filter((event) => event.type === 'REFERRAL_QUALIFIED')).toHaveLength(2);
  });

  it('applies FREE_MONTH once without creating financial side effects', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    const created = await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
    });
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );

    const applied = await service.applyReward(
      created!.id,
      { clientReferenceId: fake.clientReferences[0]!.id },
      actorUserId,
    );

    expect(applied).toMatchObject({
      status: 'REWARDED',
      appliedPreviousDueDate: '2026-10-10',
      appliedNewDueDate: '2026-11-10',
    });
    expect(fake.clientReferences[0]!.dueDate).toEqual(parseBusinessDate('2026-11-10'));
    expect(fake.clients[0]!.dueDate).toEqual(parseBusinessDate('2026-10-10'));
    expect(fake.renewals).toHaveLength(0);
    expect(fake.receivables).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
    await expect(
      service.applyReward(
        created!.id,
        { clientReferenceId: fake.clientReferences[0]!.id },
        actorUserId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels the bonified pending cycle and ensures the next payable cycle on FREE_MONTH', async () => {
    const fake = createReferralPrisma();
    const cycle = {
      cancelPendingCurrentCycleReceivable: vi.fn().mockResolvedValue({ id: 'old-receivable' }),
      ensureCurrentCycleReceivable: vi.fn().mockResolvedValue({ action: 'created' }),
    };
    const service = new ReferralsService(fake.prisma as never, cycle as never);

    const created = await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
    });
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );

    await service.applyReward(
      created!.id,
      { clientReferenceId: fake.clientReferences[0]!.id },
      actorUserId,
    );

    expect(cycle.cancelPendingCurrentCycleReceivable).toHaveBeenCalledWith(
      fake.clientReferences[0]!.id,
      parseBusinessDate('2026-10-10'),
      'Ciclo bonificado por indicacao FREE_MONTH.',
      expect.any(Object),
    );
    expect(cycle.ensureCurrentCycleReceivable).toHaveBeenCalledWith(
      fake.clientReferences[0]!.id,
      expect.any(Object),
    );
    expect(fake.messageDispatchUpdateMany).toHaveBeenCalledWith({
      where: {
        origin: 'BILLING',
        status: { in: ['SCHEDULED', 'FAILED'] },
        OR: [
          { receivableId: 'old-receivable' },
          { items: { some: { receivableId: 'old-receivable' } } },
        ],
      },
      data: {
        status: 'CANCELED',
        errorCode: 'FREE_MONTH_RECEIVABLE_CANCELED',
        errorMessage:
          'Cobranca futura cancelada porque o ciclo foi bonificado por indicacao FREE_MONTH.',
        nextAttemptAt: null,
      },
    });
    expect(fake.renewals).toHaveLength(0);
    expect(fake.transactions).toHaveLength(0);
  });

  it('preserves billing anchor on day 31 and does not reactivate inactive referrer', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);
    fake.clients[2]!.status = 'CANCELADO';

    const created = await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[2]!.id,
    });
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );

    const applied = await service.applyReward(
      created!.id,
      { clientReferenceId: fake.clientReferences[2]!.id },
      actorUserId,
    );

    expect(applied.appliedPreviousDueDate).toBe('2026-01-31');
    expect(applied.appliedNewDueDate).toBe('2026-02-28');
    expect(fake.clients[2]!.status).toBe('CANCELADO');
  });

  it('cancels pending referral when referred client cancels before payment', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
    });
    await service.cancelPendingForClientBeforePayment(
      fake.prisma as never,
      fake.clients[1]!.id,
      'Desistiu antes de pagar.',
      actorUserId,
    );

    expect(fake.referrals[0]).toMatchObject({
      status: 'CANCELED',
      cancellationReason: 'Desistiu antes de pagar.',
    });
    expect(fake.events.some((event) => event.type === 'REFERRAL_CANCELED')).toBe(true);
  });

  it('models CREDIT and CUSTOM without automatic financial movement', async () => {
    const fake = createReferralPrisma();
    const service = new ReferralsService(fake.prisma as never);

    const credit = await service.createPending(fake.prisma as never, {
      referredClientId: fake.clients[1]!.id,
      referrerClientId: fake.clients[0]!.id,
      rewardType: 'CREDIT',
      rewardValue: 25,
    });
    await service.qualifyAfterInitialActivation(
      fake.prisma as never,
      fake.clients[1]!.id,
      'receivable-1',
      actorUserId,
    );
    await service.applyReward(credit!.id, {}, actorUserId);

    expect(fake.transactions).toHaveLength(0);
    await expect(
      service.createPending(fake.prisma as never, {
        referredClientId: fake.clients[2]!.id,
        referrerClientId: fake.clients[0]!.id,
        rewardType: 'CUSTOM',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
