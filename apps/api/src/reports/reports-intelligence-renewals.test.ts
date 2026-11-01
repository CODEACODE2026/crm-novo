import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReportsIntelligenceService } from './reports-intelligence.service';

describe('ReportsIntelligenceService Renovações', () => {
  it('separates paid-cycle counts, ledger revenue, comparison and reversals', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          renewalsCurrent: 1n,
          renewalsPrevious: 1n,
          renewalRevenueCurrent: new Prisma.Decimal('200.00'),
          renewalRevenuePrevious: new Prisma.Decimal('100.00'),
          renewalRevenueReceivablesCurrent: 1n,
          renewalRevenueReceivablesPrevious: 1n,
          activationsCurrent: 1n,
          activationsPrevious: 0n,
          activationRevenueCurrent: new Prisma.Decimal('100.00'),
          activationRevenuePrevious: new Prisma.Decimal(0),
          reactivationsCurrent: 1n,
          reactivationsPrevious: 0n,
          reactivationRevenueCurrent: new Prisma.Decimal('300.00'),
          reactivationRevenuePrevious: new Prisma.Decimal(0),
          reversalsCurrent: 1n,
          reversalsPrevious: 0n,
        },
      ])
      .mockResolvedValueOnce([
        {
          businessDate: new Date('2026-10-02T00:00:00.000Z'),
          purpose: 'INITIAL_ACTIVATION',
          total: 1n,
          amount: new Prisma.Decimal('100.00'),
        },
        {
          businessDate: new Date('2026-10-03T00:00:00.000Z'),
          purpose: 'RENEWAL',
          total: 1n,
          amount: new Prisma.Decimal('200.00'),
        },
        {
          businessDate: new Date('2026-10-04T00:00:00.000Z'),
          purpose: 'REACTIVATION',
          total: 1n,
          amount: new Prisma.Decimal('300.00'),
        },
      ])
      .mockResolvedValueOnce([
        {
          businessDate: new Date('2026-09-25T00:00:00.000Z'),
          purpose: 'RENEWAL',
          total: 1n,
          amount: new Prisma.Decimal('100.00'),
        },
      ])
      .mockResolvedValueOnce([
        {
          businessDate: new Date('2026-10-02T00:00:00.000Z'),
          purpose: 'INITIAL_ACTIVATION',
          amount: new Prisma.Decimal('100.00'),
          receivables: 1n,
        },
        {
          businessDate: new Date('2026-10-03T00:00:00.000Z'),
          purpose: 'RENEWAL',
          amount: new Prisma.Decimal('200.00'),
          receivables: 1n,
        },
        {
          businessDate: new Date('2026-10-04T00:00:00.000Z'),
          purpose: 'REACTIVATION',
          amount: new Prisma.Decimal('300.00'),
          receivables: 1n,
        },
      ])
      .mockResolvedValueOnce([{ businessDate: new Date('2026-10-08T00:00:00.000Z'), total: 1n }]);
    const prisma = {
      $transaction: vi.fn((callback: (tx: { $queryRaw: typeof queryRaw }) => unknown) =>
        callback({ $queryRaw: queryRaw }),
      ),
    };
    const service = new ReportsIntelligenceService(prisma as never);

    const result = await service.renewals({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });

    expect(result.kpis.paidRenewals).toMatchObject({
      value: 1,
      previousValue: 1,
      changePercent: '0.00',
    });
    expect(result.kpis.renewalRevenue.value).toBe('200.00');
    expect(result.kpis.renewalAverageTicket.value).toBe('200.00');
    expect(result.charts.renewalComparison).toHaveLength(10);
    expect(result.charts.renewalComparison.reduce((sum, point) => sum + point.current, 0)).toBe(1);
    expect(result.charts.renewalComparison.reduce((sum, point) => sum + point.previous, 0)).toBe(1);
    expect(result.charts.revenueComposition).toEqual([
      {
        purpose: 'INITIAL_ACTIVATION',
        label: 'Ativações',
        value: '100.00',
        sharePercent: '16.67',
      },
      {
        purpose: 'RENEWAL',
        label: 'Renovações',
        value: '200.00',
        sharePercent: '33.33',
      },
      {
        purpose: 'REACTIVATION',
        label: 'Reativações',
        value: '300.00',
        sharePercent: '50.00',
      },
    ]);
    expect(result.charts.reversals.reduce((sum, point) => sum + point.total, 0)).toBe(1);
    expect(result.meta.dataQuality.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        'LEDGER_REVENUE_ONLY',
        'REACTIVATION_REQUIRES_PAID_RELATION',
        'REVERSALS_SEPARATE',
      ]),
    );
    expect(queryRaw).toHaveBeenCalledTimes(5);
  });
});
