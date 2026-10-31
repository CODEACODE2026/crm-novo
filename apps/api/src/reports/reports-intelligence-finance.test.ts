import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ReportsIntelligenceService } from './reports-intelligence.service';

describe('ReportsIntelligenceService Financeiro', () => {
  it('serializes decimals, preserves origins and handles zero comparison safely', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          receivedCurrent: new Prisma.Decimal('150.00'),
          receivedPrevious: new Prisma.Decimal(0),
          operationalCurrent: new Prisma.Decimal('100.00'),
          operationalPrevious: new Prisma.Decimal(0),
          legacyCurrent: new Prisma.Decimal('50.00'),
          legacyPrevious: new Prisma.Decimal(0),
          manualCurrent: new Prisma.Decimal('25.00'),
          manualPrevious: new Prisma.Decimal(0),
          paymentsCurrent: 2n,
          paymentsPrevious: 0n,
          operationalReceivablesCurrent: 1n,
          operationalReceivablesPrevious: 0n,
        },
      ])
      .mockResolvedValueOnce([
        {
          pendingCurrent: new Prisma.Decimal('80.00'),
          pendingPrevious: new Prisma.Decimal(0),
          overdueCurrent: new Prisma.Decimal('20.00'),
          overduePrevious: new Prisma.Decimal(0),
        },
      ])
      .mockResolvedValueOnce([
        {
          scope: 'current',
          businessDate: new Date('2026-10-01T00:00:00.000Z'),
          origin: 'RECEIVABLE_PAYMENT',
          amount: new Prisma.Decimal('100.00'),
          payments: 1n,
          operationalReceivables: 1n,
        },
        {
          scope: 'current',
          businessDate: new Date('2026-10-01T00:00:00.000Z'),
          origin: 'LEGACY_IMPORT',
          amount: new Prisma.Decimal('50.00'),
          payments: 1n,
          operationalReceivables: 0n,
        },
      ]);
    const prisma = {
      $transaction: vi.fn((callback: (tx: { $queryRaw: typeof queryRaw }) => unknown) =>
        callback({ $queryRaw: queryRaw }),
      ),
    };
    const service = new ReportsIntelligenceService(prisma as never);

    const result = await service.finance({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
    });

    expect(result.kpis.received).toEqual({
      value: '150.00',
      previousValue: '0.00',
      changePercent: null,
      comparison: 'new',
    });
    expect(result.kpis.averageTicket.value).toBe('100.00');
    expect(result.charts.evolution[0]).toMatchObject({
      received: '150.00',
      operational: '100.00',
      legacy: '50.00',
      manual: '0.00',
      averageTicket: '100.00',
    });
    expect(result.charts.evolution[1]).toMatchObject({ received: '0.00' });
    expect(result.charts.annualComparison).toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
});
