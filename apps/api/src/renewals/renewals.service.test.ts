import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { parseBusinessDate } from '../clients/utils/business-date';
import { RenewalsService } from './renewals.service';

const userId = '22222222-2222-4222-8222-222222222222';

function createFakePrisma() {
  const plan = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('150.00'),
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
    planId: plan.id,
    recurringValue: new Prisma.Decimal('150.00'),
    dueDate: parseBusinessDate('2026-01-31'),
    billingAnchorDay: 31,
    billingNoticeDays: 5,
    notes: null,
    status: 'CANCELADO' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    plan,
  };
  const renewals: Array<Record<string, unknown>> = [];
  const receivables: Array<Record<string, unknown>> = [];
  const statusHistory: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const tx = {
    client: {
      findUnique: () => Promise.resolve(client),
      update: ({ data }: { data: Partial<typeof client> }) => {
        Object.assign(client, data);
        return Promise.resolve(client);
      },
    },
    plan: {
      findFirst: () => Promise.resolve(plan),
    },
    renewal: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const renewal = {
          id: `renewal-${renewals.length + 1}`,
          createdAt: new Date(),
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
          receivable: receivables.find((item) => item.renewalId === where.id),
        });
      },
    },
    receivable: {
      create: ({ data }: { data: Record<string, unknown> }) => {
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
      create: ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(statusHistory.push(data)),
    },
    clientEvent: {
      create: ({ data }: { data: Record<string, unknown> }) => Promise.resolve(events.push(data)),
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
          where: { clientId_idempotencyKey: { idempotencyKey: string } };
        }) => {
          const renewal = renewals.find(
            (item) => item.idempotencyKey === where.clientId_idempotencyKey.idempotencyKey,
          );

          if (!renewal) {
            return Promise.resolve(null);
          }

          return Promise.resolve({
            ...renewal,
            client,
            receivable: receivables.find((item) => item.renewalId === renewal.id),
          });
        },
      },
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    },
    receivables,
    renewals,
    statusHistory,
  };
}

describe('RenewalsService', () => {
  it('reactivates a canceled client with explicit history and idempotent replay', async () => {
    const fake = createFakePrisma();
    const service = new RenewalsService(fake.prisma as never);

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
    expect(first.renewal.newDueDate).toBe('2026-02-28');
    expect(first.receivable.renewalId).toBe(first.renewal.id);
    expect(fake.renewals).toHaveLength(1);
    expect(fake.receivables).toHaveLength(1);
    expect(fake.statusHistory).toContainEqual(
      expect.objectContaining({
        previousStatus: 'CANCELADO',
        newStatus: 'ATIVO',
        reason: 'Cliente cancelado foi reativado através de renovação.',
      }),
    );
    const renewalEvent = fake.events.find((event) => event.type === 'CLIENT_RENEWED');

    expect(renewalEvent?.description).toEqual(
      expect.stringContaining('Cliente cancelado foi reativado através de renovação.'),
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
});
