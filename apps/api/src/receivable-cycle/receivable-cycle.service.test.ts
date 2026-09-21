import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReceivableCycleService } from './receivable-cycle.service';

function reference(overrides: Record<string, unknown> = {}) {
  const plan = {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('50.00'),
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    id: 'reference-id',
    clientId: 'client-id',
    reference: 'REF-001',
    planId: plan.id,
    recurringValue: new Prisma.Decimal('50.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 3,
    status: 'ATIVO' as const,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: {
      id: 'client-id',
      name: 'Cliente Ciclo',
      phone: '(44) 99999-9999',
      phoneNormalized: '5544999999999',
      email: null,
      reference: 'REF-001',
      planId: plan.id,
      recurringValue: new Prisma.Decimal('50.00'),
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
      billingNoticeDays: 3,
      status: 'ATIVO' as const,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    plan,
    receivables: [],
    ...overrides,
  };
}

function receivable(overrides: Record<string, unknown> = {}) {
  return {
    id: `receivable-${Math.random().toString(16).slice(2)}`,
    clientId: 'client-id',
    clientReferenceId: 'reference-id',
    renewalId: null,
    purpose: 'RENEWAL' as const,
    description: 'Renovacao - Plano Mensal',
    amount: new Prisma.Decimal('50.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    status: 'PENDENTE' as const,
    paidAt: null,
    canceledAt: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

type TestReceivable = ReturnType<typeof receivable>;
type TestReference = Omit<ReturnType<typeof reference>, 'receivables'> & {
  receivables: TestReceivable[];
};

function fakeService(initialReference = reference()) {
  const state: { reference: TestReference } = { reference: initialReference };
  const created: TestReceivable[] = [];
  const prisma = {
    clientReference: {
      findUnique: vi.fn(() => Promise.resolve(state.reference)),
      findMany: vi.fn(() => Promise.resolve([state.reference])),
    },
    receivable: {
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const item = receivable({ id: `receivable-${created.length + 1}`, ...data });
        created.push(item);
        state.reference.receivables.unshift(item);
        return Promise.resolve(item);
      }),
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          state.reference.receivables.filter(
            (item: TestReceivable) =>
              item.clientReferenceId === where.clientReferenceId &&
              item.purpose === where.purpose &&
              item.dueDate.getTime() === (where.dueDate as Date).getTime(),
          ),
        ),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = state.reference.receivables.find(
          (candidate: TestReceivable) => candidate.id === where.id,
        );

        if (!item) throw new Error('not found');

        Object.assign(item, data);
        return Promise.resolve(item);
      }),
    },
  };

  return { service: new ReceivableCycleService(prisma as never), prisma, state, created };
}

describe('ReceivableCycleService', () => {
  it('creates one renewal receivable for an active billable reference', async () => {
    const fake = fakeService();

    const result = await fake.service.ensureCurrentCycleReceivable('reference-id');

    expect(result.action).toBe('created');
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]).toMatchObject({
      clientReferenceId: 'reference-id',
      purpose: 'RENEWAL',
      status: 'PENDENTE',
      dueDate: parseBusinessDate('2026-10-10'),
    });
  });

  it('is idempotent when the current cycle already has a pending receivable', async () => {
    const existing = receivable();
    const fake = fakeService(reference({ receivables: [existing] }));

    const result = await fake.service.ensureCurrentCycleReceivable('reference-id');

    expect(result.action).toBe('kept');
    expect(result.receivable.id).toBe(existing.id);
    expect(fake.prisma.receivable.create).not.toHaveBeenCalled();
  });

  it('does not recreate paid or canceled cycle debt', async () => {
    await expect(
      fakeService(
        reference({ receivables: [receivable({ status: 'PAGO' })] }),
      ).service.ensureCurrentCycleReceivable('reference-id'),
    ).rejects.toThrow(ConflictException);

    await expect(
      fakeService(
        reference({ receivables: [receivable({ status: 'CANCELADO' })] }),
      ).service.ensureCurrentCycleReceivable('reference-id'),
    ).rejects.toThrow(ConflictException);
  });

  it('reports missing and divergent cycle states', async () => {
    const fake = fakeService(
      reference({
        receivables: [receivable({ dueDate: parseBusinessDate('2026-09-10') })],
      }),
    );

    const report = await fake.service.reconcileCurrentCycles();

    expect(report.counts.RECEIVABLE_DIVERGENT).toBe(1);
    expect(report.items[0]).toMatchObject({
      code: 'RECEIVABLE_DIVERGENT',
      reason: 'Conta a receber pendente existe, mas com vencimento divergente.',
    });
  });

  it('blocks direct current-cycle generation when a pending receivable is divergent', async () => {
    const divergent = receivable({ dueDate: parseBusinessDate('2026-09-10') });
    const fake = fakeService(reference({ receivables: [divergent] }));

    const preview = await fake.service.previewCurrentCycleReceivable('reference-id');

    expect(preview.allowed).toBe(false);
    expect(preview.status.code).toBe('RECEIVABLE_DIVERGENT');

    await expect(fake.service.ensureCurrentCycleReceivable('reference-id')).rejects.toThrow(
      'Ja existe uma conta a receber pendente com vencimento divergente para esta referencia. Resolva a divergencia antes de gerar uma nova conta.',
    );

    expect(fake.created).toHaveLength(0);
    expect(fake.state.reference.receivables).toHaveLength(1);
    expect(fake.state.reference.receivables[0]).toMatchObject({
      id: divergent.id,
      status: 'PENDENTE',
      dueDate: parseBusinessDate('2026-09-10'),
    });
    expect(fake.prisma.receivable.create).not.toHaveBeenCalled();
  });

  it('updates a pending same-cycle receivable when due date changes explicitly', async () => {
    const existing = receivable();
    const fake = fakeService(reference({ receivables: [existing] }));

    await fake.service.updatePendingCurrentCycleReceivable(
      'reference-id',
      parseBusinessDate('2026-10-10'),
      {
        dueDate: parseBusinessDate('2026-11-10'),
        amount: new Prisma.Decimal('75.00'),
        planName: 'Premium',
      },
    );

    expect(existing.dueDate).toEqual(parseBusinessDate('2026-11-10'));
    expect(existing.amount).toEqual(new Prisma.Decimal('75.00'));
    expect(existing.description).toBe('Renovacao - Plano Premium');
  });

  it('blocks paid receivables when trying to rewrite the current cycle', async () => {
    const existing = receivable({ status: 'PAGO' });
    const fake = fakeService(reference({ receivables: [existing] }));

    await expect(
      fake.service.updatePendingCurrentCycleReceivable(
        'reference-id',
        parseBusinessDate('2026-10-10'),
        {
          dueDate: parseBusinessDate('2026-11-10'),
          amount: new Prisma.Decimal('75.00'),
          planName: 'Premium',
        },
      ),
    ).rejects.toThrow('Conta a receber paga nao pode ter vencimento reescrito.');

    expect(fake.prisma.receivable.update).not.toHaveBeenCalled();
    expect(existing.dueDate).toEqual(parseBusinessDate('2026-10-10'));
  });

  it('blocks canceled historical receivables when trying to rewrite the current cycle', async () => {
    const existing = receivable({ status: 'CANCELADO' });
    const fake = fakeService(reference({ receivables: [existing] }));

    await expect(
      fake.service.updatePendingCurrentCycleReceivable(
        'reference-id',
        parseBusinessDate('2026-10-10'),
        {
          dueDate: parseBusinessDate('2026-11-10'),
          amount: new Prisma.Decimal('75.00'),
          planName: 'Premium',
        },
      ),
    ).rejects.toThrow(
      'Conta a receber cancelada ou historica impede ajuste automatico deste ciclo.',
    );

    expect(fake.prisma.receivable.update).not.toHaveBeenCalled();
    expect(existing.dueDate).toEqual(parseBusinessDate('2026-10-10'));
  });
});
