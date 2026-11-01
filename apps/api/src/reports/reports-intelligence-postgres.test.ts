import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReportsIntelligenceService } from './reports-intelligence.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('Reports intelligence overview on PostgreSQL 12.22', () => {
  const prisma = new PrismaClient();
  const ids = {
    categories: [] as string[],
    clients: [] as string[],
    plans: [] as string[],
    receivables: [] as string[],
  };

  beforeAll(async () => {
    await prisma.$connect();
    const version = await prisma.$queryRaw<Array<{ version: number }>>`
      SELECT current_setting('server_version_num')::integer AS version
    `;
    const migrations = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
    `;
    expect(version[0]?.version).toBe(120022);
    expect(Number(migrations[0]?.total)).toBe(56);
    await createFixture();
  });

  afterAll(async () => {
    const clientIds = ids.clients;
    const receivableIds = ids.receivables;
    await prisma.paymentIntent.deleteMany({
      where: {
        OR: [
          { receivableId: { in: receivableIds } },
          { paymentGroup: { clientId: { in: clientIds } } },
        ],
      },
    });
    await prisma.financialTransaction.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReferenceReactivation.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.renewalReversal.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.paymentGroupItem.deleteMany({ where: { receivableId: { in: receivableIds } } });
    await prisma.paymentGroup.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.receivable.deleteMany({ where: { id: { in: receivableIds } } });
    await prisma.renewal.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientStatusHistory.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.financialCategory.deleteMany({ where: { id: { in: ids.categories } } });
    await prisma.plan.deleteMany({ where: { id: { in: ids.plans } } });
    await prisma.$disconnect();
  });

  it('deduplicates financial truth and serializes overview decimals with empty buckets', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const startedAt = performance.now();
    const result = await service.overview({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.meta).toMatchObject({
      timezone: 'America/Sao_Paulo',
      period: { startDate: '2026-10-01', endDate: '2026-10-10' },
      comparisonPeriod: { startDate: '2026-09-21', endDate: '2026-09-30' },
      granularity: 'day',
    });
    expect(result.kpis.received).toMatchObject({ value: '750.00', previousValue: '20.00' });
    expect(result.kpis.receivedOperational.value).toBe('700.00');
    expect(result.kpis.receivedLegacy.value).toBe('50.00');
    expect(result.kpis.manualEntries.value).toBe('25.00');
    expect(result.kpis.payments.value).toBe(6);
    expect(result.kpis.averageTicket).toMatchObject({ value: '140.00', comparison: 'new' });
    expect(result.kpis.newClients.value).toBe(1);
    expect(result.kpis.activeClients).toMatchObject({ value: 1, previousValue: 0 });
    expect(result.kpis.paidActivations.value).toBe(1);
    expect(result.kpis.paidRenewals.value).toBe(1);
    expect(result.kpis.paidReactivations.value).toBe(1);
    expect(result.kpis.canceledReferences.value).toBe(1);
    expect(result.kpis.pendingReceivables.value).toBe('1529.00');
    expect(result.kpis.overdueReceivables.value).toBe('70.00');
    expect(result.charts.financialEvolution).toHaveLength(10);
    expect(result.charts.newClients).toHaveLength(10);
    expect(result.charts.paidLifecycle).toHaveLength(10);
    expect(
      result.charts.financialEvolution.reduce((total, point) => total + Number(point.received), 0),
    ).toBe(750);
    expect(result.charts.financialEvolution.some((point) => point.received === '0.00')).toBe(true);
    expect(elapsedMs).toBeLessThan(3_000);
    console.info(`reports-intelligence-overview-pg12-ms=${elapsedMs.toFixed(2)}`);
  });

  it('returns stable zero comparisons instead of dividing by zero', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const result = await service.overview({
      preset: 'custom',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
    });
    expect(result.kpis.received).toMatchObject({
      value: '0.00',
      previousValue: '0.00',
      changePercent: '0.00',
      comparison: 'percentage',
    });
  });

  it('builds Financeiro from ledger truth without duplicating groups or payment intents', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const startedAt = performance.now();
    const result = await service.finance({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.meta).toMatchObject({
      timezone: 'America/Sao_Paulo',
      period: { startDate: '2026-10-01', endDate: '2026-10-10' },
      comparisonPeriod: { startDate: '2026-09-21', endDate: '2026-09-30' },
    });
    expect(result.kpis.received).toMatchObject({ value: '750.00', previousValue: '20.00' });
    expect(result.kpis.operational.value).toBe('700.00');
    expect(result.kpis.legacy.value).toBe('50.00');
    expect(result.kpis.manual.value).toBe('25.00');
    expect(result.kpis.payments.value).toBe(6);
    expect(result.kpis.averageTicket.value).toBe('140.00');
    expect(result.kpis.pending.value).toBe('1529.00');
    expect(result.kpis.overdue.value).toBe('70.00');
    expect(result.charts.evolution).toHaveLength(10);
    expect(result.charts.periodComparison).toHaveLength(10);
    expect(result.charts.averageTicket).toHaveLength(10);
    expect(result.charts.byOrigin).toEqual([
      { origin: 'RECEIVABLE_PAYMENT', label: 'Receita operacional', value: '700.00' },
      { origin: 'LEGACY_IMPORT', label: 'Histórico importado', value: '50.00' },
      { origin: 'MANUAL', label: 'Entradas manuais', value: '25.00' },
    ]);
    expect(result.charts.flowAndStock).toEqual([
      { key: 'received', label: 'Recebido no período', semantics: 'flow', value: '750.00' },
      { key: 'pending', label: 'Pendente no fechamento', semantics: 'stock', value: '1529.00' },
      { key: 'overdue', label: 'Vencido no fechamento', semantics: 'stock', value: '70.00' },
    ]);
    expect(result.charts.annualComparison).toBeNull();
    expect(
      result.charts.evolution.reduce((total, point) => total + Number(point.received), 0),
    ).toBe(750);
    expect(result.charts.evolution.some((point) => point.received === '0.00')).toBe(true);
    expect(elapsedMs).toBeLessThan(3_000);
    console.info(`reports-intelligence-finance-pg12-ms=${elapsedMs.toFixed(2)}`);
  });

  it('returns aligned monthly annual comparison when the selected preset supports it', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const result = await service.finance({ preset: 'this_year' });
    expect(result.meta.granularity).toBe('month');
    expect(result.charts.annualComparison).not.toBeNull();
    expect(result.charts.annualComparison?.every((point) => point.comparisonBucket)).toBe(true);
  });

  it('separates clients from references and reconstructs the preserved active portfolio', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const startedAt = performance.now();
    const result = await service.clients({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.kpis.newClients.value).toBe(1);
    expect(result.kpis.activeClients.value).toBe(1);
    expect(result.kpis.clientsWithoutActiveReference.value).toBe(1);
    expect(result.kpis.activeReferences.value).toBe(2);
    expect(result.kpis.newReferences.value).toBe(3);
    expect(result.kpis.canceledReferences.value).toBe(1);
    expect(result.kpis.clientsAffectedByCancellation.value).toBe(1);
    expect(result.kpis.monthlyAverageNewClients).toMatchObject({ applicable: false, value: null });
    expect(result.charts.newClients).toHaveLength(10);
    expect(result.charts.referenceMovement).toHaveLength(10);
    expect(result.charts.statusDistribution).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'ATIVO', total: 2 }),
        expect.objectContaining({ status: 'CANCELADO', total: 1 }),
      ]),
    );
    expect(result.charts.planDistribution[0]).toMatchObject({ total: 2 });
    expect(result.charts.activePortfolio).toHaveLength(10);
    expect(result.charts.activePortfolio.at(-1)).toMatchObject({
      activeClients: 1,
      activeReferences: 2,
      historicalLimitation: true,
    });
    expect(result.charts.monthlyAcquisition).toBeNull();
    expect(elapsedMs).toBeLessThan(3_000);
    console.info(`reports-intelligence-clients-pg12-ms=${elapsedMs.toFixed(2)}`);
  });

  it('keeps client growth stable when the previous base is zero', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const result = await service.clients({
      preset: 'custom',
      startDate: '2024-01-01',
      endDate: '2024-01-02',
    });
    expect(result.kpis.newClients).toMatchObject({
      value: 0,
      previousValue: 0,
      changePercent: '0.00',
      comparison: 'percentage',
    });
  });

  it('reports only paid cycles and ledger-backed revenue without PIX or group duplication', async () => {
    const service = new ReportsIntelligenceService(prisma as never);
    const startedAt = performance.now();
    const result = await service.renewals({
      preset: 'custom',
      startDate: '2026-10-01',
      endDate: '2026-10-10',
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.kpis.paidRenewals.value).toBe(1);
    expect(result.kpis.renewalRevenue.value).toBe('200.00');
    expect(result.kpis.renewalAverageTicket.value).toBe('200.00');
    expect(result.kpis.paidActivations.value).toBe(1);
    expect(result.kpis.activationRevenue.value).toBe('100.00');
    expect(result.kpis.paidReactivations.value).toBe(1);
    expect(result.kpis.reactivationRevenue.value).toBe('300.00');
    expect(result.kpis.renewalReversals).toMatchObject({ value: 1, previousValue: 1 });
    expect(result.charts.paidRenewals).toHaveLength(10);
    expect(result.charts.renewalRevenue).toHaveLength(10);
    expect(result.charts.paidLifecycle).toHaveLength(10);
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
    expect(result.charts.renewalComparison).toHaveLength(10);
    expect(result.charts.renewalComparison.reduce((total, point) => total + point.current, 0)).toBe(
      1,
    );
    expect(result.charts.reversals.reduce((total, point) => total + point.total, 0)).toBe(1);
    expect(result.charts.renewalRevenue.some((point) => point.value === '0.00')).toBe(true);
    expect(elapsedMs).toBeLessThan(3_000);
    console.info(`reports-intelligence-renewals-pg12-ms=${elapsedMs.toFixed(2)}`);
  });

  async function createFixture() {
    const plan = await prisma.plan.create({
      data: {
        id: randomUUID(),
        name: `Reports CORE1 ${randomUUID()}`,
        durationMonths: 1,
        defaultValue: 100,
        active: true,
      },
    });
    ids.plans.push(plan.id);
    const category = await prisma.financialCategory.create({
      data: {
        id: randomUUID(),
        name: `Reports CORE1 ${randomUUID()}`,
        type: 'ENTRADA',
        active: true,
      },
    });
    ids.categories.push(category.id);
    const client = await prisma.client.create({
      data: {
        id: randomUUID(),
        name: 'Reports Intelligence Client',
        phone: '+55 44 99999-0000',
        phoneNormalized: '5544999990000',
        phoneE164: '+5544999990000',
        reference: `CORE1-${randomUUID()}`,
        planId: plan.id,
        recurringValue: 100,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
        status: 'ATIVO',
        createdAt: new Date('2026-10-05T15:00:00.000Z'),
      },
    });
    ids.clients.push(client.id);
    const utcBoundaryClient = await prisma.client.create({
      data: {
        id: randomUUID(),
        name: 'Reports Intelligence UTC Boundary Client',
        phone: '+55 44 99999-0001',
        phoneNormalized: '5544999990001',
        phoneE164: '+5544999990001',
        reference: `CORE1-BOUNDARY-${randomUUID()}`,
        planId: plan.id,
        recurringValue: 100,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
        status: 'ATIVO',
        createdAt: new Date('2026-10-01T02:30:00.000Z'),
      },
    });
    ids.clients.push(utcBoundaryClient.id);
    const activeReference = await prisma.clientReference.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        reference: `CORE1-A-${randomUUID()}`,
        planId: plan.id,
        recurringValue: 100,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
        status: 'ATIVO',
        createdAt: new Date('2026-10-05T15:00:00.000Z'),
      },
    });
    const reversedRenewal = await prisma.renewal.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        clientReferenceId: activeReference.id,
        planId: plan.id,
        previousDueDate: new Date('2026-09-10T00:00:00.000Z'),
        newDueDate: new Date('2026-10-10T00:00:00.000Z'),
        amount: 100,
        planName: plan.name,
        durationMonths: 1,
        status: 'REVERTED',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2026-10-02T12:00:00.000Z'),
      },
    });
    await prisma.renewalReversal.create({
      data: {
        id: randomUUID(),
        renewalId: reversedRenewal.id,
        clientId: client.id,
        clientReferenceId: activeReference.id,
        reason: 'RENEWALS1 test',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2026-10-08T15:00:00.000Z'),
      },
    });
    const boundaryRenewal = await prisma.renewal.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        clientReferenceId: activeReference.id,
        planId: plan.id,
        previousDueDate: new Date('2026-08-10T00:00:00.000Z'),
        newDueDate: new Date('2026-09-10T00:00:00.000Z'),
        amount: 100,
        planName: plan.name,
        durationMonths: 1,
        status: 'REVERTED',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2026-09-30T12:00:00.000Z'),
      },
    });
    await prisma.renewalReversal.create({
      data: {
        id: randomUUID(),
        renewalId: boundaryRenewal.id,
        clientId: client.id,
        clientReferenceId: activeReference.id,
        reason: 'RENEWALS1 timezone boundary test',
        idempotencyKey: randomUUID(),
        createdAt: new Date('2026-10-01T02:30:00.000Z'),
      },
    });
    await prisma.clientReference.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        reference: `CORE1-B-${randomUUID()}`,
        planId: plan.id,
        recurringValue: 100,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
        status: 'ATIVO',
        createdAt: new Date('2026-10-05T15:00:00.000Z'),
      },
    });
    await prisma.clientReference.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        reference: `CORE1-C-${randomUUID()}`,
        planId: plan.id,
        recurringValue: 100,
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
        status: 'CANCELADO',
        canceledAt: new Date('2026-10-06T15:00:00.000Z'),
        cancellationReason: 'CORE1 test',
        createdAt: new Date('2026-10-05T15:00:00.000Z'),
      },
    });

    const initial = await createReceivable('INITIAL_ACTIVATION', '100.00', '2026-10-02', 'PAGO');
    const renewal = await createReceivable('RENEWAL', '200.00', '2026-10-03', 'PAGO');
    const reactivation = await createReceivable('REACTIVATION', '300.00', '2026-10-04', 'PAGO');
    const groupedA = await createReceivable('MANUAL_CHARGE', '40.00', '2026-10-05', 'PAGO');
    const groupedB = await createReceivable('MANUAL_CHARGE', '60.00', '2026-10-05', 'PAGO');
    const pendingReactivation = await createReceivable('REACTIVATION', '450.00', null, 'PENDENTE');
    await createReceivable('RENEWAL', '999.00', null, 'PENDENTE');
    await createReceivable('RENEWAL', '80.00', null, 'PENDENTE', '2026-10-15');
    await createReceivable('RENEWAL', '70.00', null, 'PENDENTE', '2026-10-01');

    await prisma.clientReferenceReactivation.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        clientReferenceId: activeReference.id,
        receivableId: reactivation.id,
        planId: plan.id,
        activationDate: new Date('2026-10-04T00:00:00.000Z'),
        billingAnchorDay: 4,
        recurringValue: 300,
        status: 'PAID',
        idempotencyKey: randomUUID(),
        paidAt: new Date('2026-10-04T00:00:00.000Z'),
      },
    });
    await prisma.clientReferenceReactivation.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        clientReferenceId: activeReference.id,
        receivableId: pendingReactivation.id,
        planId: plan.id,
        activationDate: new Date('2026-10-09T00:00:00.000Z'),
        billingAnchorDay: 9,
        recurringValue: 450,
        status: 'PENDING',
        idempotencyKey: randomUUID(),
      },
    });

    const paymentGroup = await prisma.paymentGroup.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        status: 'PAID',
        totalAmount: 240,
        paidAt: new Date('2026-10-05T00:00:00.000Z'),
        items: {
          create: [
            { receivableId: renewal.id, amount: 200 },
            { receivableId: groupedA.id, amount: 40 },
          ],
        },
      },
    });
    await prisma.paymentIntent.createMany({
      data: [
        {
          id: randomUUID(),
          receivableId: initial.id,
          provider: 'MOCK',
          status: 'PAID',
          amount: 100,
          paidAt: new Date('2026-10-02T15:00:00.000Z'),
        },
        {
          id: randomUUID(),
          receivableId: initial.id,
          provider: 'MOCK',
          status: 'FAILED',
          amount: 100,
        },
        {
          id: randomUUID(),
          paymentGroupId: paymentGroup.id,
          provider: 'MOCK',
          status: 'PAID',
          amount: 240,
          paidAt: new Date('2026-10-05T15:00:00.000Z'),
        },
        {
          id: randomUUID(),
          receivableId: renewal.id,
          provider: 'MOCK',
          status: 'FAILED',
          amount: 200,
        },
        {
          id: randomUUID(),
          receivableId: renewal.id,
          provider: 'MOCK',
          status: 'PAID',
          amount: 200,
          paidAt: new Date('2026-10-03T15:00:00.000Z'),
        },
      ],
    });

    for (const receivable of [initial, renewal, reactivation, groupedA, groupedB]) {
      await prisma.financialTransaction.create({
        data: {
          id: randomUUID(),
          type: 'ENTRADA',
          origin: 'RECEIVABLE_PAYMENT',
          categoryId: category.id,
          clientId: client.id,
          clientReferenceId: activeReference.id,
          receivableId: receivable.id,
          paymentGroupId: [renewal.id, groupedA.id].includes(receivable.id)
            ? paymentGroup.id
            : null,
          description: 'CORE1 operational payment',
          amount: receivable.amount,
          transactionDate: receivable.paidAt!,
        },
      });
    }
    await prisma.financialTransaction.createMany({
      data: [
        {
          id: randomUUID(),
          type: 'ENTRADA',
          origin: 'LEGACY_IMPORT',
          categoryId: category.id,
          clientId: client.id,
          description: 'CORE1 legacy current',
          amount: 50,
          transactionDate: new Date('2026-10-06T00:00:00.000Z'),
        },
        {
          id: randomUUID(),
          type: 'ENTRADA',
          origin: 'LEGACY_IMPORT',
          categoryId: category.id,
          clientId: client.id,
          description: 'CORE1 legacy previous',
          amount: 20,
          transactionDate: new Date('2026-09-25T00:00:00.000Z'),
        },
        {
          id: randomUUID(),
          type: 'ENTRADA',
          origin: 'MANUAL',
          categoryId: category.id,
          clientId: client.id,
          description: 'CORE1 manual separate',
          amount: 25,
          transactionDate: new Date('2026-10-07T00:00:00.000Z'),
        },
      ],
    });

    async function createReceivable(
      purpose: 'INITIAL_ACTIVATION' | 'RENEWAL' | 'REACTIVATION' | 'MANUAL_CHARGE',
      amount: string,
      paidAt: string | null,
      status: 'PAGO' | 'PENDENTE',
      dueDate = paidAt ?? '2026-10-20',
    ) {
      const receivable = await prisma.receivable.create({
        data: {
          id: randomUUID(),
          clientId: client.id,
          clientReferenceId: purpose === 'MANUAL_CHARGE' ? null : activeReference.id,
          financialCategoryId: purpose === 'MANUAL_CHARGE' ? category.id : null,
          payerName: purpose === 'MANUAL_CHARGE' ? 'CORE1 payer' : null,
          payerPhoneNormalized: purpose === 'MANUAL_CHARGE' ? '5511999999999' : null,
          purpose,
          description: `CORE1 ${purpose}`,
          amount,
          dueDate: new Date(`${dueDate}T00:00:00.000Z`),
          status,
          paidAt: paidAt ? new Date(`${paidAt}T00:00:00.000Z`) : null,
          createdAt: new Date('2026-10-01T12:00:00.000Z'),
        },
      });
      ids.receivables.push(receivable.id);
      return receivable;
    }
  }
});
