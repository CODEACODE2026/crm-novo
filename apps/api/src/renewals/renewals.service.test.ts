import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
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

describe('RenewalsService', () => {
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
});
