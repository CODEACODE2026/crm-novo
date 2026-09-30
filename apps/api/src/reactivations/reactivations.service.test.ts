import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReactivationsService } from './reactivations.service';

const actorUserId = '22222222-2222-4222-8222-222222222222';

function createFakePrisma(referenceStatus: 'ATIVO' | 'CANCELADO' = 'CANCELADO') {
  const annualPlan = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Anual',
    durationMonths: 12,
    defaultValue: new Prisma.Decimal('0.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const monthlyPlan = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('30.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const client = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Valeria',
    phone: '(44) 99999-9999',
    phoneNormalized: '5544999999999',
    email: null,
    reference: 'valeria6523',
    planId: annualPlan.id,
    recurringValue: new Prisma.Decimal('0.00'),
    dueDate: parseBusinessDate('2027-09-28'),
    billingAnchorDay: 28,
    billingNoticeDays: 3,
    notes: null,
    status: referenceStatus,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const clientReference = {
    id: '44444444-4444-4444-8444-444444444444',
    clientId: client.id,
    reference: 'valeria6523',
    planId: annualPlan.id,
    recurringValue: new Prisma.Decimal('0.00'),
    dueDate: parseBusinessDate('2027-09-28'),
    billingAnchorDay: 28,
    billingNoticeDays: 3,
    status: referenceStatus,
    notes: null,
    inactivatedAt: null,
    inactivationReason: null,
    inactivatedByUserId: null,
    canceledAt: new Date(),
    cancellationReason: 'Importado historico cancelado',
    canceledByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client,
    plan: annualPlan,
  };
  const receivables: Array<Record<string, unknown>> = [];
  const reactivations: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const includeReactivation = (reactivation: Record<string, unknown>) => ({
    ...reactivation,
    client,
    clientReference,
    plan: monthlyPlan,
    receivable: {
      ...receivables.find((item) => item.id === reactivation.receivableId),
      paymentIntents: [],
    },
  });

  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    clientReference: {
      findUnique: vi.fn(() => Promise.resolve(clientReference)),
    },
    plan: {
      findFirst: vi.fn(({ where }: { where: { id: string; active: boolean } }) =>
        Promise.resolve(where.id === monthlyPlan.id && where.active ? monthlyPlan : null),
      ),
    },
    clientReferenceReactivation: {
      findFirst: vi.fn(({ where }: { where: { status?: string } }) =>
        Promise.resolve(
          reactivations.find((item) => !where.status || item.status === where.status)
            ? includeReactivation(
                reactivations.find((item) => !where.status || item.status === where.status)!,
              )
            : null,
        ),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const reactivation = {
          id: `reactivation-${reactivations.length + 1}`,
          status: 'PENDING',
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        reactivations.push(reactivation);
        return Promise.resolve(reactivation);
      }),
      findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(includeReactivation(reactivations.find((item) => item.id === where.id)!)),
      ),
    },
    receivable: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const receivable = {
          id: `receivable-${receivables.length + 1}`,
          paidAt: null,
          canceledAt: null,
          cancelReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        receivables.push(receivable);
        return Promise.resolve(receivable);
      }),
    },
    clientEvent: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return Promise.resolve(data);
      }),
    },
  };

  return {
    client,
    clientReference,
    monthlyPlan,
    receivables,
    reactivations,
    events,
    prisma: {
      clientReferenceReactivation: {
        findUnique: vi.fn(
          ({
            where,
          }: {
            where: { clientReferenceId_idempotencyKey: { idempotencyKey: string } };
          }) => {
            const found = reactivations.find(
              (item) =>
                item.idempotencyKey === where.clientReferenceId_idempotencyKey.idempotencyKey,
            );
            return Promise.resolve(found ? includeReactivation(found) : null);
          },
        ),
        findFirst: tx.clientReferenceReactivation.findFirst,
      },
      $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
    },
    tx,
  };
}

describe('ReactivationsService', () => {
  it('creates a pending reactivation receivable without activating Valeria reference', async () => {
    const fake = createFakePrisma();
    const service = new ReactivationsService(fake.prisma as never);

    const result = await service.createForReference(
      fake.clientReference.id,
      {
        planId: fake.monthlyPlan.id,
        amount: 30,
        activationDate: '2026-09-30',
        idempotencyKey: 'reactivation-key-1',
      },
      actorUserId,
    );

    expect(result.status).toBe('PENDING');
    expect(result.activationDate).toBe('2026-09-30');
    expect(result.billingAnchorDay).toBe(30);
    expect(result.receivable).toMatchObject({
      purpose: 'REACTIVATION',
      amount: '30',
      dueDate: '2026-09-30',
      status: 'PENDENTE',
    });
    expect(fake.client.status).toBe('CANCELADO');
    expect(fake.clientReference.status).toBe('CANCELADO');
    expect(fake.clientReference.planId).toBe('11111111-1111-4111-8111-111111111111');
    expect(fake.clientReference.recurringValue).toEqual(new Prisma.Decimal('0.00'));
    expect(fake.events).toHaveLength(1);
    expect(fake.events[0]).toMatchObject({
      type: 'CLIENT_REFERENCE_REACTIVATION_REQUESTED',
    });
  });

  it('rejects active references in the backend', async () => {
    const fake = createFakePrisma('ATIVO');
    const service = new ReactivationsService(fake.prisma as never);

    await expect(
      service.createForReference(
        fake.clientReference.id,
        {
          planId: fake.monthlyPlan.id,
          amount: 30,
          activationDate: '2026-09-30',
          idempotencyKey: 'reactivation-key-1',
        },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('does not create a second pending reactivation for the same reference', async () => {
    const fake = createFakePrisma();
    const service = new ReactivationsService(fake.prisma as never);

    await service.createForReference(
      fake.clientReference.id,
      {
        planId: fake.monthlyPlan.id,
        amount: 30,
        activationDate: '2026-09-30',
        idempotencyKey: 'reactivation-key-1',
      },
      actorUserId,
    );

    await expect(
      service.createForReference(
        fake.clientReference.id,
        {
          planId: fake.monthlyPlan.id,
          amount: 30,
          activationDate: '2026-09-30',
          idempotencyKey: 'reactivation-key-2',
        },
        actorUserId,
      ),
    ).rejects.toThrow(ConflictException);
    expect(fake.receivables).toHaveLength(1);
    expect(fake.reactivations).toHaveLength(1);
  });
});
