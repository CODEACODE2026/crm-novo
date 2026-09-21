import { describe, expect, it, vi } from 'vitest';
import { ClientEventType, Prisma } from '@prisma/client';
import { parseBusinessDate } from '../clients/utils/business-date';
import { RenewalsService } from './renewals.service';

const userId = '22222222-2222-4222-8222-222222222222';

type FakePrismaOptions = {
  failReceivableCreate?: boolean;
  selectedPlan?: {
    id: string;
    name: string;
    durationMonths: number;
    defaultValue: Prisma.Decimal;
  };
};

type FakeBillingDispatch = {
  id: string;
  origin: string;
  status: string;
  [key: string]: unknown;
};

function createFakePrisma(options: FakePrismaOptions = {}) {
  const currentPlan = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('150.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const selectedPlan = {
    ...currentPlan,
    ...(options.selectedPlan ?? {}),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const client = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Cliente Cancelado',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'CANCELADO-RENOVACAO',
    planId: currentPlan.id,
    recurringValue: new Prisma.Decimal('150.00'),
    dueDate: parseBusinessDate('2026-01-31'),
    billingAnchorDay: 31,
    billingNoticeDays: 5,
    notes: null,
    status: 'CANCELADO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan: currentPlan,
  };
  const clientReference = {
    id: '44444444-4444-4444-8444-444444444444',
    clientId: client.id,
    reference: client.reference,
    planId: currentPlan.id,
    recurringValue: client.recurringValue,
    dueDate: client.dueDate,
    billingAnchorDay: client.billingAnchorDay,
    billingNoticeDays: client.billingNoticeDays,
    notes: client.notes,
    status: client.status,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    client,
    plan: currentPlan,
  };
  const renewals: Array<Record<string, unknown>> = [];
  const receivables: Array<Record<string, unknown>> = [];
  const statusHistory: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const operations: string[] = [];

  const tx = {
    client: {
      findUnique: () => Promise.resolve(client),
      update: ({ data }: { data: Partial<typeof client> }) => {
        Object.assign(client, data);
        return Promise.resolve(client);
      },
    },
    clientReference: {
      findUnique: () => Promise.resolve(clientReference),
      findFirst: () => Promise.resolve(clientReference),
      update: ({ data }: { data: Partial<typeof clientReference> }) => {
        operations.push('clientReference.update');
        Object.assign(clientReference, data);
        Object.assign(client, data);
        if (data.planId === selectedPlan.id) {
          Object.assign(clientReference, { plan: selectedPlan });
          Object.assign(client, { plan: selectedPlan });
        }
        return Promise.resolve(clientReference);
      },
    },
    plan: {
      findFirst: ({ where }: { where: { id: string; active: boolean } }) =>
        Promise.resolve(where.id === selectedPlan.id && where.active ? selectedPlan : null),
    },
    renewal: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        operations.push('renewal.create');
        const renewal = {
          id: `renewal-${renewals.length + 1}`,
          createdAt: new Date(),
          status: 'ACTIVE',
          ...data,
        };
        renewals.push(renewal);
        return Promise.resolve(renewal);
      },
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const renewal = renewals.find((item) => item.id === where.id);

        if (!renewal) {
          throw new Error('Renewal not found');
        }

        return Promise.resolve({
          ...renewal,
          client,
          clientReference: { ...clientReference, client, plan: selectedPlan },
          receivable: receivables.find((item) => item.renewalId === where.id),
        });
      },
    },
    receivable: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        operations.push('receivable.create');
        if (options.failReceivableCreate) {
          throw new Error('Receivable create failed');
        }
        const receivable = {
          id: `receivable-${receivables.length + 1}`,
          paidAt: null,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        receivables.push(receivable);
        return Promise.resolve(receivable);
      },
    },
    clientStatusHistory: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        operations.push('clientStatusHistory.create');
        return Promise.resolve(statusHistory.push(data));
      },
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        operations.push('clientEvent.create');
        return Promise.resolve(events.push(data));
      },
    },
  };

  return {
    client,
    events,
    prisma: {
      renewal: {
        findUnique: ({
          where,
        }: {
          where: {
            clientId_idempotencyKey?: { idempotencyKey: string };
            clientReferenceId_idempotencyKey?: { idempotencyKey: string };
          };
        }) => {
          const idempotencyKey =
            where.clientReferenceId_idempotencyKey?.idempotencyKey ??
            where.clientId_idempotencyKey?.idempotencyKey;
          const renewal = renewals.find((item) => item.idempotencyKey === idempotencyKey);

          if (!renewal) {
            return Promise.resolve(null);
          }

          return Promise.resolve({
            ...renewal,
            client,
            clientReference: { ...clientReference, client, plan: selectedPlan },
            receivable: receivables.find((item) => item.renewalId === renewal.id),
          });
        },
      },
      clientReference: {
        findFirst: () => Promise.resolve(clientReference),
      },
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        const clientSnapshot = { ...client };
        const referenceSnapshot = { ...clientReference };
        const renewalCount = renewals.length;
        const receivableCount = receivables.length;
        const statusHistoryCount = statusHistory.length;
        const eventCount = events.length;
        const operationCount = operations.length;

        try {
          return await callback(tx);
        } catch (error) {
          Object.assign(client, clientSnapshot);
          Object.assign(clientReference, referenceSnapshot);
          renewals.length = renewalCount;
          receivables.length = receivableCount;
          statusHistory.length = statusHistoryCount;
          events.length = eventCount;
          operations.length = operationCount;
          throw error;
        }
      },
    },
    clientReference,
    receivables,
    renewals,
    operations,
    plan: currentPlan,
    selectedPlan,
    statusHistory,
  };
}

function createPreviewFake(overrides: Record<string, unknown> = {}) {
  const previousPlan = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('30.00'),
  };
  const reference = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    reference: 'pedro1020',
    planId: previousPlan.id,
    recurringValue: new Prisma.Decimal('30.00'),
    dueDate: parseBusinessDate('2026-11-17'),
    billingAnchorDay: 17,
    billingNoticeDays: 5,
    notes: null,
    status: 'ATIVO',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-21T00:00:00.000Z'),
    plan: previousPlan,
  };
  const receivable = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    clientId: reference.clientId,
    clientReferenceId: reference.id,
    renewalId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    purpose: 'RENEWAL',
    description: 'Renovacao - Plano Mensal',
    amount: new Prisma.Decimal('30.00'),
    dueDate: parseBusinessDate('2026-11-17'),
    status: 'PENDENTE',
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-09-21T01:00:00.000Z'),
    updatedAt: new Date('2026-09-21T01:00:00.000Z'),
    paymentTransaction: null,
    paymentIntents: [] as Array<Record<string, unknown>>,
    paymentGroupItems: [] as Array<Record<string, unknown>>,
    messageDispatches: [] as Array<Record<string, unknown>>,
    messageDispatchItems: [] as Array<Record<string, unknown>>,
    recoveryCampaigns: [] as Array<Record<string, unknown>>,
  };
  const renewal = {
    id: receivable.renewalId,
    clientId: reference.clientId,
    clientReferenceId: reference.id,
    planId: previousPlan.id,
    previousPlanId: previousPlan.id,
    previousPlanName: 'Mensal',
    previousAmount: new Prisma.Decimal('30.00'),
    previousDueDate: parseBusinessDate('2026-10-17'),
    previousBillingAnchorDay: 17,
    previousStatus: 'ATIVO',
    newDueDate: parseBusinessDate('2026-11-17'),
    newBillingAnchorDay: 17,
    newStatus: 'ATIVO',
    amount: new Prisma.Decimal('30.00'),
    planName: 'Mensal',
    durationMonths: 1,
    status: 'ACTIVE',
    idempotencyKey: 'preview-revert-1',
    createdByUserId: userId,
    createdAt: new Date('2026-09-21T01:00:00.000Z'),
    clientReference: reference,
    receivable,
  };
  const latestRenewal = { id: renewal.id, createdAt: renewal.createdAt };
  const previousCycleReceivable = null as {
    id: string;
    status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
    dueDate: Date;
  } | null;
  const state = {
    reference,
    renewal,
    latestRenewal,
    previousCycleReceivable,
    mutations: [] as string[],
    reversals: [] as Array<Record<string, unknown>>,
    events: [] as Array<Record<string, unknown>>,
    failOnRenewalUpdate: false,
    ...overrides,
  };
  const recordMutation = (name: string) => {
    state.mutations.push(name);
  };
  const collectBillingDispatches = (): FakeBillingDispatch[] =>
    [
      ...state.renewal.receivable.messageDispatches,
      ...state.renewal.receivable.messageDispatchItems.map((item) => item.messageDispatch),
    ] as FakeBillingDispatch[];
  const snapshot = () => ({
    reference: { ...state.reference },
    renewal: { ...state.renewal },
    receivable: { ...state.renewal.receivable },
    dispatches: collectBillingDispatches().map((dispatch) => ({
      dispatch,
      snapshot: { ...dispatch },
    })),
    reversalsLength: state.reversals.length,
    eventsLength: state.events.length,
    mutationsLength: state.mutations.length,
  });
  const restore = (saved: ReturnType<typeof snapshot>) => {
    Object.assign(state.reference, saved.reference);
    Object.assign(state.renewal, saved.renewal);
    Object.assign(state.renewal.receivable, saved.receivable);
    for (const item of saved.dispatches) {
      Object.assign(item.dispatch, item.snapshot);
    }
    state.reversals.length = saved.reversalsLength;
    state.events.length = saved.eventsLength;
    state.mutations.length = saved.mutationsLength;
  };
  const tx = {
    renewal: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === state.renewal.id ? state.renewal : null),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        if (where.id !== state.renewal.id) {
          throw new Error('Renewal not found');
        }
        return Promise.resolve(state.renewal);
      },
      findFirst: () => Promise.resolve(state.latestRenewal),
      update: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('renewal.update');
        if (state.failOnRenewalUpdate) {
          throw new Error('Forced renewal update failure');
        }
        Object.assign(state.renewal, data);
        return Promise.resolve(state.renewal);
      },
    },
    receivable: {
      findUnique: () => Promise.resolve(state.previousCycleReceivable),
      update: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('receivable.update');
        Object.assign(state.renewal.receivable, data);
        return Promise.resolve(state.renewal.receivable);
      },
    },
    clientReference: {
      update: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('clientReference.update');
        Object.assign(state.reference, data);
        return Promise.resolve(state.reference);
      },
    },
    messageDispatch: {
      updateMany: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('messageDispatch.updateMany');
        let count = 0;
        for (const dispatch of collectBillingDispatches()) {
          if (
            dispatch.origin === 'BILLING' &&
            ['PENDING', 'SCHEDULED', 'PROCESSING'].includes(dispatch.status)
          ) {
            Object.assign(dispatch, data);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('clientEvent.create');
        state.events.push(data);
        return Promise.resolve(data);
      },
    },
    renewalReversal: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        recordMutation('renewalReversal.create');
        if (
          state.reversals.some(
            (reversal) =>
              reversal.renewalId === data.renewalId ||
              (reversal.clientReferenceId === data.clientReferenceId &&
                reversal.idempotencyKey === data.idempotencyKey),
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'fake',
          });
        }
        const reversal = {
          id: `reversal-${state.reversals.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        state.reversals.push(reversal);
        return Promise.resolve(reversal);
      },
      findFirst: ({
        where,
      }: {
        where: {
          OR: Array<{ renewalId?: string; clientReferenceId?: string; idempotencyKey?: string }>;
        };
      }) =>
        Promise.resolve(
          (() => {
            const reversal = state.reversals.find((item) =>
              where.OR.some(
                (condition) =>
                  (condition.renewalId && item.renewalId === condition.renewalId) ||
                  (condition.clientReferenceId &&
                    item.clientReferenceId === condition.clientReferenceId &&
                    item.idempotencyKey === condition.idempotencyKey),
              ),
            );

            return reversal
              ? {
                  ...reversal,
                  renewal: state.renewal,
                  clientReference: state.reference,
                }
              : null;
          })(),
        ),
      findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
        const reversal = state.reversals.find((item) => item.id === where.id);
        if (!reversal) {
          throw new Error('Reversal not found');
        }
        return Promise.resolve({
          ...reversal,
          renewal: state.renewal,
          clientReference: state.reference,
        });
      },
    },
  };

  return {
    ...state,
    prisma: {
      renewal: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === state.renewal.id ? state.renewal : null),
        findFirst: () => Promise.resolve(state.latestRenewal),
        create: () => {
          recordMutation('renewal.create');
          throw new Error('Unexpected renewal.create');
        },
        update: tx.renewal.update,
      },
      receivable: {
        findUnique: () => Promise.resolve(state.previousCycleReceivable),
        create: () => {
          recordMutation('receivable.create');
          throw new Error('Unexpected receivable.create');
        },
        update: tx.receivable.update,
      },
      clientReference: {
        update: tx.clientReference.update,
      },
      messageDispatch: {
        updateMany: tx.messageDispatch.updateMany,
      },
      clientEvent: {
        create: tx.clientEvent.create,
      },
      renewalReversal: {
        create: tx.renewalReversal.create,
        findFirst: tx.renewalReversal.findFirst,
        findUniqueOrThrow: tx.renewalReversal.findUniqueOrThrow,
      },
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
        const saved = snapshot();
        try {
          return await callback(tx);
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            restore(saved);
          }
          throw error;
        }
      },
    },
  };
}

function previewService(fake: ReturnType<typeof createPreviewFake>) {
  return new RenewalsService(
    fake.prisma as never,
    {
      handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined),
      handleClientStatusChange: vi.fn().mockResolvedValue(undefined),
    } as never,
  );
}

function paymentIntent(status: string, provider = 'MOCK') {
  return {
    id: `intent-${status}-${provider}`,
    status,
    provider,
    providerTransactionId: `tx-${status}-${provider}`,
    amount: new Prisma.Decimal('30.00'),
  };
}

function billingDispatch(id: string, status: string) {
  return {
    id,
    origin: 'BILLING',
    status,
  };
}

describe('RenewalsService', () => {
  it('exposes the structural fields required for renewal reversal execution', () => {
    const renewalReversalModel = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'RenewalReversal',
    );
    const renewalIdField = renewalReversalModel?.fields.find((field) => field.name === 'renewalId');
    const idempotencyKeyField = renewalReversalModel?.fields.find(
      (field) => field.name === 'idempotencyKey',
    );

    expect(ClientEventType.RENEWAL_REVERTED).toBe('RENEWAL_REVERTED');
    expect(renewalIdField).toMatchObject({ isRequired: true, isUnique: true });
    expect(idempotencyKeyField).toMatchObject({ isRequired: true, isUnique: false });
    expect(renewalReversalModel?.uniqueFields).toContainEqual([
      'clientReferenceId',
      'idempotencyKey',
    ]);
  });

  it('reactivates a canceled client with explicit history and idempotent replay', async () => {
    const fake = createFakePrisma();
    const recoveryService = {
      handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined),
      handleClientStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    const service = new RenewalsService(fake.prisma as never, recoveryService as never);

    const first = await service.create(
      fake.client.id,
      {
        planId: fake.client.planId,
        amount: 150,
        idempotencyKey: 'cancelado-renovacao-123',
      },
      userId,
    );

    expect(first.idempotentReplay).toBe(false);
    expect(first.client.status).toBe('ATIVO');
    expect(recoveryService.handleClientReferenceStatusChange).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clientId: fake.client.id }),
      'ATIVO',
      expect.objectContaining({ actorUserId: userId }),
    );
    expect(first.renewal.newDueDate).toBe('2026-02-28');
    expect(first.renewal.previousPlanId).toBe(fake.plan.id);
    expect(first.renewal.previousPlanName).toBe('Mensal');
    expect(first.renewal.previousAmount).toBe('150');
    expect(first.renewal.previousDueDate).toBe('2026-01-31');
    expect(first.renewal.previousBillingAnchorDay).toBe(31);
    expect(first.renewal.previousStatus).toBe('CANCELADO');
    expect(first.renewal.newBillingAnchorDay).toBe(31);
    expect(first.renewal.newStatus).toBe('ATIVO');
    expect(first.renewal.status).toBe('ACTIVE');
    expect(first.receivable.renewalId).toBe(first.renewal.id);
    expect(fake.renewals).toHaveLength(1);
    expect(fake.receivables).toHaveLength(1);
    expect(fake.statusHistory).toContainEqual(
      expect.objectContaining({
        clientReferenceId: '44444444-4444-4444-8444-444444444444',
        previousStatus: 'CANCELADO',
        newStatus: 'ATIVO',
        reason: 'Referencia cancelada foi reativada atraves de renovacao.',
      }),
    );
    const renewalEvent = fake.events.find((event) => event.type === 'CLIENT_RENEWED');

    expect(renewalEvent?.description).toEqual(
      expect.stringContaining('Referencia cancelada foi reativada atraves de renovacao.'),
    );

    const replay = await service.create(
      fake.client.id,
      {
        planId: fake.client.planId,
        amount: 150,
        idempotencyKey: 'cancelado-renovacao-123',
      },
      userId,
    );

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.renewal.id).toBe(first.renewal.id);
    expect(replay.receivable.id).toBe(first.receivable.id);
    expect(fake.renewals).toHaveLength(1);
    expect(fake.receivables).toHaveLength(1);
  });

  it('captures the previous reference state before updating it and keeps normal renewal side effects', async () => {
    const fake = createFakePrisma({
      selectedPlan: {
        id: '55555555-5555-4555-8555-555555555555',
        name: 'Trimestral',
        durationMonths: 3,
        defaultValue: new Prisma.Decimal('90.00'),
      },
    });
    const recoveryService = {
      handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined),
      handleClientStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    const service = new RenewalsService(fake.prisma as never, recoveryService as never);

    const result = await service.createForReference(
      fake.clientReference.id,
      {
        planId: fake.selectedPlan.id,
        amount: 90,
        idempotencyKey: 'snapshot-renovacao-123',
      },
      userId,
    );

    expect(fake.operations).toEqual([
      'renewal.create',
      'receivable.create',
      'clientReference.update',
      'clientStatusHistory.create',
      'clientEvent.create',
    ]);
    expect(fake.renewals[0]).toMatchObject({
      previousPlanId: fake.plan.id,
      previousPlanName: 'Mensal',
      previousAmount: fake.plan.defaultValue,
      previousDueDate: parseBusinessDate('2026-01-31'),
      previousBillingAnchorDay: 31,
      previousStatus: 'CANCELADO',
      planId: fake.selectedPlan.id,
      planName: 'Trimestral',
      amount: 90,
      newDueDate: parseBusinessDate('2026-04-30'),
      newBillingAnchorDay: 31,
      newStatus: 'ATIVO',
      status: 'ACTIVE',
    });
    expect(result.renewal).toMatchObject({
      previousPlanId: fake.plan.id,
      previousPlanName: 'Mensal',
      previousAmount: '150',
      previousDueDate: '2026-01-31',
      previousBillingAnchorDay: 31,
      previousStatus: 'CANCELADO',
      planId: fake.selectedPlan.id,
      planName: 'Trimestral',
      amount: '90',
      newDueDate: '2026-04-30',
      newBillingAnchorDay: 31,
      newStatus: 'ATIVO',
      status: 'ACTIVE',
    });
    expect(result.receivable).toMatchObject({
      renewalId: result.renewal.id,
      amount: '90',
      dueDate: '2026-04-30',
      status: 'PENDENTE',
    });
    expect(fake.clientReference).toMatchObject({
      planId: fake.selectedPlan.id,
      recurringValue: 90,
      dueDate: parseBusinessDate('2026-04-30'),
      billingAnchorDay: 31,
      status: 'ATIVO',
    });
  });

  it('rolls back the renewal snapshot when receivable creation fails inside the transaction', async () => {
    const fake = createFakePrisma({ failReceivableCreate: true });
    const recoveryService = {
      handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined),
      handleClientStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    const service = new RenewalsService(fake.prisma as never, recoveryService as never);

    await expect(
      service.createForReference(
        fake.clientReference.id,
        {
          planId: fake.plan.id,
          amount: 150,
          idempotencyKey: 'rollback-renovacao-123',
        },
        userId,
      ),
    ).rejects.toThrow('Receivable create failed');

    expect(fake.renewals).toHaveLength(0);
    expect(fake.receivables).toHaveLength(0);
    expect(fake.statusHistory).toHaveLength(0);
    expect(fake.clientReference).toMatchObject({
      planId: fake.plan.id,
      recurringValue: new Prisma.Decimal('150.00'),
      dueDate: parseBusinessDate('2026-01-31'),
      billingAnchorDay: 31,
      status: 'CANCELADO',
    });
  });

  it('keeps legacy renewals with null snapshots readable without inventing previous values', async () => {
    const fake = createFakePrisma();
    const recoveryService = {
      handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined),
      handleClientStatusChange: vi.fn().mockResolvedValue(undefined),
    };
    fake.renewals.push({
      id: 'renewal-legacy-1',
      clientId: fake.client.id,
      clientReferenceId: fake.clientReference.id,
      planId: fake.plan.id,
      previousPlanId: null,
      previousPlanName: null,
      previousAmount: null,
      previousDueDate: parseBusinessDate('2026-01-31'),
      previousBillingAnchorDay: null,
      previousStatus: null,
      newDueDate: parseBusinessDate('2026-02-28'),
      newBillingAnchorDay: null,
      newStatus: null,
      amount: new Prisma.Decimal('150.00'),
      planName: 'Mensal',
      durationMonths: 1,
      status: 'ACTIVE',
      idempotencyKey: 'legacy-renovacao-123',
      createdByUserId: userId,
      createdAt: new Date(),
    });
    fake.receivables.push({
      id: 'receivable-legacy-1',
      clientId: fake.client.id,
      clientReferenceId: fake.clientReference.id,
      renewalId: 'renewal-legacy-1',
      description: 'Renovacao - Plano Mensal',
      amount: new Prisma.Decimal('150.00'),
      dueDate: parseBusinessDate('2026-02-28'),
      status: 'PENDENTE',
      paidAt: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const service = new RenewalsService(fake.prisma as never, recoveryService as never);

    const replay = await service.createForReference(
      fake.clientReference.id,
      {
        planId: fake.plan.id,
        amount: 150,
        idempotencyKey: 'legacy-renovacao-123',
      },
      userId,
    );

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.renewal).toMatchObject({
      id: 'renewal-legacy-1',
      previousPlanId: null,
      previousPlanName: null,
      previousAmount: null,
      previousBillingAnchorDay: null,
      previousStatus: null,
      newBillingAnchorDay: null,
      newStatus: null,
      status: 'ACTIVE',
    });
    expect(fake.renewals).toHaveLength(1);
    expect(fake.receivables).toHaveLength(1);
  });

  it('previews an eligible renewal reversal without mutating state', async () => {
    const fake = createPreviewFake();
    const service = previewService(fake);

    const result = await service.previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.reversible).toBe(true);
    expect(result.restore).toMatchObject({
      planName: 'Mensal',
      amount: '30',
      dueDate: '2026-10-17',
      billingAnchorDay: 17,
      status: 'ATIVO',
    });
    expect(result.receivable).toMatchObject({
      id: fake.renewal.receivable.id,
      status: 'PENDENTE',
      amount: '30',
      dueDate: '2026-11-17',
      action: 'CANCEL',
    });
    expect(result.pix).toMatchObject({ total: 0, active: 0, paid: 0, action: 'NONE' });
    expect(result.billing).toEqual({ futureToCancel: 0, sentToPreserve: 0 });
    expect(result.recovery).toEqual({ active: false, action: 'NONE' });
    expect(result.blockers).toEqual([]);
    expect(fake.mutations).toEqual([]);
  });

  it('blocks legacy renewals without complete snapshots', async () => {
    const fake = createPreviewFake();
    Object.assign(fake.renewal, {
      previousPlanId: null,
      previousPlanName: null,
      previousAmount: null,
      previousBillingAnchorDay: null,
      previousStatus: null,
    });
    const service = previewService(fake);

    const result = await service.previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.reversible).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'LEGACY_RENEWAL' }));
    expect(fake.mutations).toEqual([]);
  });

  it('blocks paid receivables and financial transactions even when status is inconsistent', async () => {
    const paid = createPreviewFake();
    paid.renewal.receivable.status = 'PAGO';

    const paidResult = await previewService(paid).previewRevert(paid.reference.id, paid.renewal.id);

    expect(paidResult.reversible).toBe(false);
    expect(paidResult.receivable.action).toBe('BLOCK_PAID');
    expect(paidResult.blockers).toContainEqual(
      expect.objectContaining({ code: 'RECEIVABLE_PAID' }),
    );

    const withTransaction = createPreviewFake();
    Object.assign(withTransaction.renewal.receivable, {
      paymentTransaction: { id: 'transaction-1' },
    });

    const result = await previewService(withTransaction).previewRevert(
      withTransaction.reference.id,
      withTransaction.renewal.id,
    );

    expect(result.reversible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'FINANCIAL_TRANSACTION_EXISTS' }),
    );
    expect(withTransaction.mutations).toEqual([]);
  });

  it('classifies paid and active PIX without canceling anything', async () => {
    const paid = createPreviewFake();
    paid.renewal.receivable.paymentIntents.push(paymentIntent('PAID'));

    const paidResult = await previewService(paid).previewRevert(paid.reference.id, paid.renewal.id);

    expect(paidResult.reversible).toBe(false);
    expect(paidResult.pix).toMatchObject({ total: 1, active: 0, paid: 1, action: 'BLOCK_PAID' });
    expect(paidResult.blockers).toContainEqual(expect.objectContaining({ code: 'PIX_PAID' }));

    const active = createPreviewFake();
    active.renewal.receivable.paymentIntents.push(paymentIntent('WAITING_PAYMENT', 'FASTFLOW'));

    const activeResult = await previewService(active).previewRevert(
      active.reference.id,
      active.renewal.id,
    );

    expect(activeResult.reversible).toBe(false);
    expect(activeResult.pix).toMatchObject({
      total: 1,
      active: 1,
      paid: 0,
      action: 'CANCEL_REQUIRED',
    });
    expect(activeResult.blockers).toContainEqual(expect.objectContaining({ code: 'PIX_ACTIVE' }));
    expect(active.mutations).toEqual([]);
  });

  it('blocks active PIX regardless of provider in R3 v1', async () => {
    const fake = createPreviewFake();
    fake.renewal.receivable.paymentIntents.push(paymentIntent('CREATED', 'UNSUPPORTED'));
    const result = await previewService(fake).previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.reversible).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: 'PIX_ACTIVE' }));
    expect(fake.mutations).toEqual([]);
  });

  it('blocks reversal when renewal is not latest, reference state changed, or already reverted', async () => {
    const old = createPreviewFake({ latestRenewal: { id: 'newer-renewal' } });
    const oldResult = await previewService(old).previewRevert(old.reference.id, old.renewal.id);

    expect(oldResult.reversible).toBe(false);
    expect(oldResult.blockers).toContainEqual(
      expect.objectContaining({ code: 'NOT_LATEST_RENEWAL' }),
    );

    const changed = createPreviewFake();
    changed.reference.dueDate = parseBusinessDate('2026-12-17');
    const changedResult = await previewService(changed).previewRevert(
      changed.reference.id,
      changed.renewal.id,
    );

    expect(changedResult.reversible).toBe(false);
    expect(changedResult.blockers).toContainEqual(
      expect.objectContaining({ code: 'REFERENCE_STATE_CHANGED' }),
    );

    const reverted = createPreviewFake();
    reverted.renewal.status = 'REVERTED';
    const revertedResult = await previewService(reverted).previewRevert(
      reverted.reference.id,
      reverted.renewal.id,
    );

    expect(revertedResult.reversible).toBe(false);
    expect(revertedResult.blockers).toContainEqual(
      expect.objectContaining({ code: 'ALREADY_REVERTED' }),
    );
  });

  it('counts future and sent billing dispatches without changing them', async () => {
    const fake = createPreviewFake();
    fake.renewal.receivable.messageDispatches.push(
      billingDispatch('future-1', 'PENDING'),
      billingDispatch('future-2', 'SCHEDULED'),
      billingDispatch('future-3', 'PROCESSING'),
      billingDispatch('sent-1', 'SENT'),
    );
    fake.renewal.receivable.messageDispatchItems.push({
      id: 'item-1',
      messageDispatch: billingDispatch('sent-2', 'SENT'),
    });

    const result = await previewService(fake).previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.billing).toEqual({ futureToCancel: 3, sentToPreserve: 2 });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'SENT_BILLING_WILL_BE_PRESERVED' }),
    );
    expect(fake.mutations).toEqual([]);
  });

  it('reports active recovery campaign cancellation as a preview action only', async () => {
    const fake = createPreviewFake();
    fake.renewal.receivable.recoveryCampaigns.push({ id: 'recovery-1', status: 'ATIVA' });

    const result = await previewService(fake).previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.recovery).toEqual({ active: true, action: 'CANCEL' });
    expect(result.reversible).toBe(true);
    expect(fake.mutations).toEqual([]);
  });

  it.each([
    ['sem Receivable', null, 'INEXISTENTE', 'NONE', true],
    [
      'com PENDENTE',
      {
        id: 'previous-pending',
        status: 'PENDENTE' as const,
        dueDate: parseBusinessDate('2026-10-17'),
      },
      'PENDENTE',
      'PRESERVE',
      true,
    ],
    [
      'com PAGO',
      { id: 'previous-paid', status: 'PAGO' as const, dueDate: parseBusinessDate('2026-10-17') },
      'PAGO',
      'BLOCK_PRESERVE_PAID',
      false,
    ],
    [
      'com CANCELADO',
      {
        id: 'previous-canceled',
        status: 'CANCELADO' as const,
        dueDate: parseBusinessDate('2026-10-17'),
      },
      'CANCELADO',
      'BLOCK_PRESERVE_CANCELED',
      false,
    ],
  ])(
    'classifies previous cycle %s',
    async (_, previousCycleReceivable, status, action, reversible) => {
      const fake = createPreviewFake({ previousCycleReceivable });

      const result = await previewService(fake).previewRevert(fake.reference.id, fake.renewal.id);

      expect(result.reversible).toBe(reversible);
      expect(result.previousCycle).toMatchObject({ status, action });
      expect(fake.mutations).toEqual([]);
    },
  );

  it('blocks missing overdue previous cycle receivable in the first preview version', async () => {
    const fake = createPreviewFake();
    fake.renewal.previousDueDate = parseBusinessDate('2026-08-17');

    const result = await previewService(fake).previewRevert(fake.reference.id, fake.renewal.id);

    expect(result.reversible).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({ code: 'PREVIOUS_CYCLE_OVERDUE_RECEIVABLE_MISSING' }),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PREVIOUS_CYCLE_RECEIVABLE_MISSING' }),
        expect.objectContaining({ code: 'PREVIOUS_DUE_DATE_PAST' }),
      ]),
    );
    expect(fake.mutations).toEqual([]);
  });

  it('reverts the Pedro-equivalent renewal transactionally without deleting history', async () => {
    const fake = createPreviewFake({
      previousCycleReceivable: {
        id: 'previous-pending',
        status: 'PENDENTE',
        dueDate: parseBusinessDate('2026-10-17'),
      },
    });
    fake.renewal.receivable.messageDispatches.push(billingDispatch('future-1', 'SCHEDULED'));
    const recoveryService = { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) };
    const service = new RenewalsService(fake.prisma as never, recoveryService as never);

    const result = await service.revert(
      fake.reference.id,
      fake.renewal.id,
      { reason: 'Homologacao da reversao R3', idempotencyKey: 'revert-pedro-equivalent-1' },
      userId,
    );

    expect(result.idempotentReplay).toBe(false);
    expect(result.reference).toMatchObject({
      dueDate: '2026-10-17',
      planName: 'Mensal',
      recurringValue: '30',
      billingAnchorDay: 17,
      status: 'ATIVO',
    });
    expect(fake.renewal.receivable).toMatchObject({
      status: 'CANCELADO',
      renewalId: fake.renewal.id,
    });
    expect(fake.previousCycleReceivable).toMatchObject({ status: 'PENDENTE' });
    expect(fake.renewal.receivable.messageDispatches[0]).toMatchObject({ status: 'CANCELED' });
    expect(fake.renewal).toMatchObject({ status: 'REVERTED' });
    expect(fake.reversals).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'RENEWAL_REVERTED')).toHaveLength(1);
    expect(result.impacts).toMatchObject({
      receivable: { canceled: true, status: 'CANCELADO' },
      billing: { futureCanceled: 1 },
      recovery: { action: 'NONE' },
    });
  });

  it('rolls back all reversal effects when a later mutation fails', async () => {
    const fake = createPreviewFake({
      previousCycleReceivable: {
        id: 'previous-pending',
        status: 'PENDENTE',
        dueDate: parseBusinessDate('2026-10-17'),
      },
      failOnRenewalUpdate: true,
    });
    fake.renewal.receivable.messageDispatches.push(billingDispatch('future-1', 'SCHEDULED'));
    const service = new RenewalsService(
      fake.prisma as never,
      { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(
      service.revert(
        fake.reference.id,
        fake.renewal.id,
        { reason: 'Forcar rollback', idempotencyKey: 'revert-rollback-1' },
        userId,
      ),
    ).rejects.toThrow('Forced renewal update failure');

    expect(fake.reversals).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
    expect(fake.renewal.status).toBe('ACTIVE');
    expect(fake.renewal.receivable.status).toBe('PENDENTE');
    expect(fake.renewal.receivable.messageDispatches[0]!.status).toBe('SCHEDULED');
    expect(fake.reference).toMatchObject({
      dueDate: parseBusinessDate('2026-11-17'),
      status: 'ATIVO',
    });
  });

  it('returns an idempotent reversal response for repeated keys without repeated effects', async () => {
    const fake = createPreviewFake({
      previousCycleReceivable: {
        id: 'previous-pending',
        status: 'PENDENTE',
        dueDate: parseBusinessDate('2026-10-17'),
      },
    });
    const service = new RenewalsService(
      fake.prisma as never,
      { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const dto = { reason: 'Repetir com mesma chave', idempotencyKey: 'revert-idempotent-1' };

    const first = await service.revert(fake.reference.id, fake.renewal.id, dto, userId);
    const replay = await service.revert(fake.reference.id, fake.renewal.id, dto, userId);

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(fake.reversals).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'RENEWAL_REVERTED')).toHaveLength(1);
  });

  it('keeps only one set of effects for double simultaneous reversal requests', async () => {
    const fake = createPreviewFake({
      previousCycleReceivable: {
        id: 'previous-pending',
        status: 'PENDENTE',
        dueDate: parseBusinessDate('2026-10-17'),
      },
    });
    const service = new RenewalsService(
      fake.prisma as never,
      { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    const results = await Promise.allSettled([
      service.revert(
        fake.reference.id,
        fake.renewal.id,
        { reason: 'Chamada dupla A', idempotencyKey: 'revert-double-a' },
        userId,
      ),
      service.revert(
        fake.reference.id,
        fake.renewal.id,
        { reason: 'Chamada dupla B', idempotencyKey: 'revert-double-b' },
        userId,
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(fake.reversals).toHaveLength(1);
    expect(fake.events.filter((event) => event.type === 'RENEWAL_REVERTED')).toHaveLength(1);
    expect(fake.renewal.receivable.status).toBe('CANCELADO');
  });

  it('blocks execution when a previously valid preview became stale', async () => {
    const fake = createPreviewFake({
      previousCycleReceivable: {
        id: 'previous-pending',
        status: 'PENDENTE',
        dueDate: parseBusinessDate('2026-10-17'),
      },
    });
    const service = new RenewalsService(
      fake.prisma as never,
      { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await expect(service.previewRevert(fake.reference.id, fake.renewal.id)).resolves.toMatchObject({
      reversible: true,
    });

    fake.reference.dueDate = parseBusinessDate('2026-12-17');

    await expect(
      service.revert(
        fake.reference.id,
        fake.renewal.id,
        { reason: 'Preview ficou stale', idempotencyKey: 'revert-stale-1' },
        userId,
      ),
    ).rejects.toThrow('Renovacao nao elegivel para reversao.');
    expect(fake.mutations).toEqual([]);
  });

  it('blocks reversal execution for active PIX, paid PIX, financial transaction and paid receivable', async () => {
    const cases = [
      [
        'active PIX',
        (fake: ReturnType<typeof createPreviewFake>) =>
          fake.renewal.receivable.paymentIntents.push(paymentIntent('CREATED')),
        'PIX_ACTIVE',
      ],
      [
        'paid PIX',
        (fake: ReturnType<typeof createPreviewFake>) =>
          fake.renewal.receivable.paymentIntents.push(paymentIntent('PAID')),
        'PIX_PAID',
      ],
      [
        'financial transaction',
        (fake: ReturnType<typeof createPreviewFake>) =>
          Object.assign(fake.renewal.receivable, { paymentTransaction: { id: 'transaction-1' } }),
        'FINANCIAL_TRANSACTION_EXISTS',
      ],
      [
        'paid receivable',
        (fake: ReturnType<typeof createPreviewFake>) => (fake.renewal.receivable.status = 'PAGO'),
        'RECEIVABLE_PAID',
      ],
    ] as const;

    for (const [, mutate, code] of cases) {
      const fake = createPreviewFake({
        previousCycleReceivable: {
          id: 'previous-pending',
          status: 'PENDENTE',
          dueDate: parseBusinessDate('2026-10-17'),
        },
      });
      mutate(fake);
      const service = new RenewalsService(
        fake.prisma as never,
        { cancelActiveForReceivable: vi.fn().mockResolvedValue(undefined) } as never,
      );

      await expect(
        service.revert(
          fake.reference.id,
          fake.renewal.id,
          { reason: 'Bloqueio esperado', idempotencyKey: `revert-block-${code}` },
          userId,
        ),
      ).rejects.toThrow('Renovacao nao elegivel para reversao.');
      expect(fake.reversals).toHaveLength(0);
      expect(fake.events).toHaveLength(0);
    }
  });
});
