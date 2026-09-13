import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service';
import { parseBusinessDate } from '../clients/utils/business-date';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

describe('ReportsService references report', () => {
  it('keeps one operational row per client reference in JSON and CSV', async () => {
    const fake = createReportsPrisma();
    const service = new ReportsService(fake.prisma as never);

    const report = await service.list('references', {});
    const csv = await service.csv('references', {});

    expect(report.rows).toEqual([
      expect.objectContaining({ Cliente: 'Bruno', Referencia: 'REF-001', Status: 'ATIVO' }),
      expect.objectContaining({ Cliente: 'Bruno', Referencia: 'REF-002', Status: 'INATIVO' }),
    ]);
    expect(csv.content).toContain('REF-001');
    expect(csv.content).toContain('REF-002');
  });

  it('searches referrals report by ClientReference.reference instead of Client.reference', async () => {
    const fake = createReportsPrisma();
    const service = new ReportsService(fake.prisma as never);

    await service.list('referrals', { search: 'REF-002' });

    expect(fake.prisma.referral.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              referrerClient: {
                references: { some: { reference: { contains: 'REF-002', mode: 'insensitive' } } },
              },
            },
          ]),
        }),
      }),
    );
  });
});

function createReportsPrisma() {
  const createdAt = new Date('2026-09-01T00:00:00.000Z');
  const plan = {
    id: 'plan-id',
    name: 'Mensal',
    durationMonths: 1,
    defaultValue: new Prisma.Decimal('100.00'),
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
  const client = {
    id: 'client-id',
    name: 'Bruno',
    phone: '(44) 99821-2815',
    phoneNormalized: '5544998212815',
    email: null,
    reference: 'LEGACY-001',
    planId: plan.id,
    recurringValue: new Prisma.Decimal('100.00'),
    dueDate: parseBusinessDate('2026-10-10'),
    billingAnchorDay: 10,
    billingNoticeDays: 3,
    notes: null,
    status: 'CANCELADO',
    createdAt,
    updatedAt: createdAt,
  };
  const references = [
    {
      id: 'ref-1',
      clientId: client.id,
      reference: 'REF-001',
      planId: plan.id,
      recurringValue: new Prisma.Decimal('100.00'),
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
      billingNoticeDays: 3,
      status: 'ATIVO',
      notes: null,
      createdAt,
      updatedAt: createdAt,
      client,
      plan,
    },
    {
      id: 'ref-2',
      clientId: client.id,
      reference: 'REF-002',
      planId: plan.id,
      recurringValue: new Prisma.Decimal('120.00'),
      dueDate: parseBusinessDate('2026-11-10'),
      billingAnchorDay: 10,
      billingNoticeDays: 5,
      status: 'INATIVO',
      notes: null,
      createdAt,
      updatedAt: createdAt,
      client,
      plan,
    },
  ];
  const referral = {
    id: 'referral-id',
    referredClientId: client.id,
    referrerClientId: client.id,
    rewardClientReferenceId: 'ref-1',
    status: 'QUALIFIED',
    rewardType: 'FREE_MONTH',
    rewardValue: null,
    rewardDescription: null,
    qualifiedAt: createdAt,
    appliedAt: null,
    canceledAt: null,
    cancellationReason: null,
    appliedPreviousDueDate: null,
    appliedNewDueDate: null,
    createdAt,
    updatedAt: createdAt,
    referrerClient: { ...client, references },
    referredClient: { ...client, references },
    rewardClientReference: references[0],
  };
  const prisma = {
    clientReference: {
      findMany: vi.fn().mockResolvedValue(references),
      count: vi.fn().mockResolvedValue(references.length),
      groupBy: vi.fn().mockResolvedValue([
        { status: 'ATIVO', _count: { status: 1 } },
        { status: 'INATIVO', _count: { status: 1 } },
      ]),
    },
    referral: {
      findMany: vi.fn().mockResolvedValue([referral]),
      count: vi.fn().mockResolvedValue(1),
      groupBy: vi.fn().mockResolvedValue([{ status: 'QUALIFIED', _count: { status: 1 } }]),
    },
    $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
  };

  return { prisma };
}
