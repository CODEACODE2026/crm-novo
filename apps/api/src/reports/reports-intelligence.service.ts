import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReportsOverviewDto } from './dto/reports-overview.dto';
import {
  reportingBucketKey,
  reportingBucketKeys,
  resolveReportingPeriod,
  type ReportingDateRange,
  type ReportingGranularity,
} from './reporting-period';

type FinanceTotalsRow = {
  receivedCurrent: Prisma.Decimal;
  receivedPrevious: Prisma.Decimal;
  operationalCurrent: Prisma.Decimal;
  operationalPrevious: Prisma.Decimal;
  legacyCurrent: Prisma.Decimal;
  legacyPrevious: Prisma.Decimal;
  manualCurrent: Prisma.Decimal;
  manualPrevious: Prisma.Decimal;
  paymentsCurrent: bigint;
  paymentsPrevious: bigint;
  operationalReceivablesCurrent: bigint;
  operationalReceivablesPrevious: bigint;
};

type OperationalTotalsRow = {
  newClientsCurrent: bigint;
  newClientsPrevious: bigint;
  activeClientsCurrent: bigint;
  activeClientsPrevious: bigint;
  activationsCurrent: bigint;
  activationsPrevious: bigint;
  renewalsCurrent: bigint;
  renewalsPrevious: bigint;
  reactivationsCurrent: bigint;
  reactivationsPrevious: bigint;
  cancellationsCurrent: bigint;
  cancellationsPrevious: bigint;
  pendingCurrent: Prisma.Decimal;
  pendingPrevious: Prisma.Decimal;
  overdueCurrent: Prisma.Decimal;
  overduePrevious: Prisma.Decimal;
};

type FinancialSeriesRow = {
  businessDate: Date;
  origin: 'RECEIVABLE_PAYMENT' | 'LEGACY_IMPORT';
  amount: Prisma.Decimal;
  payments: bigint;
};

type ClientSeriesRow = { businessDate: Date; total: bigint };
type LifecycleSeriesRow = {
  businessDate: Date;
  purpose: 'INITIAL_ACTIVATION' | 'RENEWAL' | 'REACTIVATION';
  total: bigint;
  amount: Prisma.Decimal;
};

@Injectable()
export class ReportsIntelligenceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview(query: ReportsOverviewDto) {
    const resolved = resolveReportingPeriod(query);
    const { period, comparisonPeriod, granularity } = resolved;

    const [financeRows, operationalRows, financialSeries, clientSeries, lifecycleSeries] =
      await this.prisma.$transaction(async (tx) =>
        Promise.all([
          this.financeTotals(tx, period, comparisonPeriod),
          this.operationalTotals(tx, period, comparisonPeriod),
          this.financialSeries(tx, period),
          this.clientSeries(tx, period),
          this.lifecycleSeries(tx, period),
        ]),
      );

    const finance = financeRows[0] ?? this.emptyFinanceTotals();
    const operational = operationalRows[0] ?? this.emptyOperationalTotals();
    const operationalTicketCurrent = this.divideMoney(
      finance.operationalCurrent,
      finance.operationalReceivablesCurrent,
    );
    const operationalTicketPrevious = this.divideMoney(
      finance.operationalPrevious,
      finance.operationalReceivablesPrevious,
    );

    return {
      meta: {
        preset: resolved.preset,
        timezone: resolved.timezone,
        period: this.presentRange(period),
        comparisonPeriod: this.presentRange(comparisonPeriod),
        granularity,
        generatedAt: new Date().toISOString(),
        dataQuality: [
          {
            code: 'MANUAL_ENTRIES_SEPARATE',
            message: 'Entradas manuais são exibidas separadamente e não compõem receita recebida.',
          },
          {
            code: 'LEGACY_EXCLUDED_FROM_TICKET',
            message:
              'Recebimentos legados compõem o total histórico, mas não o ticket operacional.',
          },
          {
            code: 'ACTIVE_BASE_HARD_DELETE_LIMIT',
            message:
              'A comparação histórica da base ativa considera referências preservadas; exclusões físicas não podem ser reconstruídas.',
          },
          {
            code: 'NET_BALANCE_UNAVAILABLE',
            message:
              'Saldo líquido não é calculado porque estornos não possuem contrapartida contábil completa.',
          },
        ],
      },
      kpis: {
        received: this.moneyMetric(finance.receivedCurrent, finance.receivedPrevious),
        receivedOperational: this.moneyMetric(
          finance.operationalCurrent,
          finance.operationalPrevious,
        ),
        receivedLegacy: this.moneyMetric(finance.legacyCurrent, finance.legacyPrevious),
        manualEntries: this.moneyMetric(finance.manualCurrent, finance.manualPrevious),
        payments: this.countMetric(finance.paymentsCurrent, finance.paymentsPrevious),
        averageTicket: this.moneyMetric(operationalTicketCurrent, operationalTicketPrevious),
        newClients: this.countMetric(operational.newClientsCurrent, operational.newClientsPrevious),
        activeClients: this.countMetric(
          operational.activeClientsCurrent,
          operational.activeClientsPrevious,
        ),
        paidActivations: this.countMetric(
          operational.activationsCurrent,
          operational.activationsPrevious,
        ),
        paidRenewals: this.countMetric(operational.renewalsCurrent, operational.renewalsPrevious),
        paidReactivations: this.countMetric(
          operational.reactivationsCurrent,
          operational.reactivationsPrevious,
        ),
        canceledReferences: this.countMetric(
          operational.cancellationsCurrent,
          operational.cancellationsPrevious,
        ),
        pendingReceivables: this.moneyMetric(
          operational.pendingCurrent,
          operational.pendingPrevious,
        ),
        overdueReceivables: this.moneyMetric(
          operational.overdueCurrent,
          operational.overduePrevious,
        ),
      },
      charts: {
        financialEvolution: this.buildFinancialSeries(period, granularity, financialSeries),
        newClients: this.buildClientSeries(period, granularity, clientSeries),
        paidLifecycle: this.buildLifecycleSeries(period, granularity, lifecycleSeries),
      },
    };
  }

  private financeTotals(
    tx: Prisma.TransactionClient,
    current: ReportingDateRange,
    previous: ReportingDateRange,
  ) {
    return tx.$queryRaw<FinanceTotalsRow[]>(Prisma.sql`
      SELECT
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA'
            AND "origin" IN ('RECEIVABLE_PAYMENT', 'LEGACY_IMPORT')
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ), 0) AS "receivedCurrent",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA'
            AND "origin" IN ('RECEIVABLE_PAYMENT', 'LEGACY_IMPORT')
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ), 0) AS "receivedPrevious",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'RECEIVABLE_PAYMENT'
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ), 0) AS "operationalCurrent",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'RECEIVABLE_PAYMENT'
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ), 0) AS "operationalPrevious",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'LEGACY_IMPORT'
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ), 0) AS "legacyCurrent",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'LEGACY_IMPORT'
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ), 0) AS "legacyPrevious",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'MANUAL'
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ), 0) AS "manualCurrent",
        COALESCE(SUM("amount") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'MANUAL'
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ), 0) AS "manualPrevious",
        COUNT(*) FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" IN ('RECEIVABLE_PAYMENT', 'LEGACY_IMPORT')
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ) AS "paymentsCurrent",
        COUNT(*) FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" IN ('RECEIVABLE_PAYMENT', 'LEGACY_IMPORT')
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ) AS "paymentsPrevious",
        COUNT(DISTINCT "receivableId") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'RECEIVABLE_PAYMENT' AND "receivableId" IS NOT NULL
            AND "transactionDate" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)
        ) AS "operationalReceivablesCurrent",
        COUNT(DISTINCT "receivableId") FILTER (
          WHERE "type" = 'ENTRADA' AND "origin" = 'RECEIVABLE_PAYMENT' AND "receivableId" IS NOT NULL
            AND "transactionDate" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)
        ) AS "operationalReceivablesPrevious"
      FROM "financial_transactions"
    `);
  }

  private operationalTotals(
    tx: Prisma.TransactionClient,
    current: ReportingDateRange,
    previous: ReportingDateRange,
  ) {
    return tx.$queryRaw<OperationalTotalsRow[]>(Prisma.sql`
      WITH current_reference_states AS (
        SELECT reference."clientId",
          COALESCE(next_change."previousStatus", reference."status")::text AS status_at_cutoff
        FROM "client_references" reference
        LEFT JOIN LATERAL (
          SELECT history."previousStatus"
          FROM "client_status_history" history
          WHERE history."clientReferenceId" = reference."id"
            AND history."createdAt" >= ${current.endExclusiveTimestamp}
          ORDER BY history."createdAt" ASC, history."id" ASC
          LIMIT 1
        ) next_change ON true
        WHERE reference."createdAt" < ${current.endExclusiveTimestamp}
      ),
      previous_reference_states AS (
        SELECT reference."clientId",
          COALESCE(next_change."previousStatus", reference."status")::text AS status_at_cutoff
        FROM "client_references" reference
        LEFT JOIN LATERAL (
          SELECT history."previousStatus"
          FROM "client_status_history" history
          WHERE history."clientReferenceId" = reference."id"
            AND history."createdAt" >= ${previous.endExclusiveTimestamp}
          ORDER BY history."createdAt" ASC, history."id" ASC
          LIMIT 1
        ) next_change ON true
        WHERE reference."createdAt" < ${previous.endExclusiveTimestamp}
      )
      SELECT
        (SELECT COUNT(*) FROM "clients" WHERE "createdAt" >= ${current.startTimestamp} AND "createdAt" < ${current.endExclusiveTimestamp}) AS "newClientsCurrent",
        (SELECT COUNT(*) FROM "clients" WHERE "createdAt" >= ${previous.startTimestamp} AND "createdAt" < ${previous.endExclusiveTimestamp}) AS "newClientsPrevious",
        (SELECT COUNT(DISTINCT "clientId") FROM current_reference_states WHERE status_at_cutoff = 'ATIVO') AS "activeClientsCurrent",
        (SELECT COUNT(DISTINCT "clientId") FROM previous_reference_states WHERE status_at_cutoff = 'ATIVO') AS "activeClientsPrevious",
        (SELECT COUNT(*) FROM "receivables"
          WHERE "purpose" = 'INITIAL_ACTIVATION' AND "status" = 'PAGO'
            AND "paidAt" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)) AS "activationsCurrent",
        (SELECT COUNT(*) FROM "receivables"
          WHERE "purpose" = 'INITIAL_ACTIVATION' AND "status" = 'PAGO'
            AND "paidAt" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)) AS "activationsPrevious",
        (SELECT COUNT(*) FROM "receivables"
          WHERE "purpose" = 'RENEWAL' AND "status" = 'PAGO'
            AND "paidAt" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)) AS "renewalsCurrent",
        (SELECT COUNT(*) FROM "receivables"
          WHERE "purpose" = 'RENEWAL' AND "status" = 'PAGO'
            AND "paidAt" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)) AS "renewalsPrevious",
        (SELECT COUNT(*) FROM "client_reference_reactivations" reactivation
          JOIN "receivables" receivable ON receivable."id" = reactivation."receivableId"
          WHERE reactivation."status" = 'PAID' AND receivable."status" = 'PAGO' AND receivable."purpose" = 'REACTIVATION'
            AND receivable."paidAt" BETWEEN CAST(${current.startDate} AS date) AND CAST(${current.endDate} AS date)) AS "reactivationsCurrent",
        (SELECT COUNT(*) FROM "client_reference_reactivations" reactivation
          JOIN "receivables" receivable ON receivable."id" = reactivation."receivableId"
          WHERE reactivation."status" = 'PAID' AND receivable."status" = 'PAGO' AND receivable."purpose" = 'REACTIVATION'
            AND receivable."paidAt" BETWEEN CAST(${previous.startDate} AS date) AND CAST(${previous.endDate} AS date)) AS "reactivationsPrevious",
        (SELECT COUNT(*) FROM "client_references"
          WHERE "canceledAt" >= ${current.startTimestamp} AND "canceledAt" < ${current.endExclusiveTimestamp}) AS "cancellationsCurrent",
        (SELECT COUNT(*) FROM "client_references"
          WHERE "canceledAt" >= ${previous.startTimestamp} AND "canceledAt" < ${previous.endExclusiveTimestamp}) AS "cancellationsPrevious",
        COALESCE((SELECT SUM("amount") FROM "receivables"
          WHERE "createdAt" < ${current.endExclusiveTimestamp}
            AND ("paidAt" IS NULL OR "paidAt" > CAST(${current.endDate} AS date))
            AND ("canceledAt" IS NULL OR "canceledAt" >= ${current.endExclusiveTimestamp})
            AND NOT ("status" = 'PAGO' AND "paidAt" IS NULL)
            AND NOT ("status" = 'CANCELADO' AND "canceledAt" IS NULL)
            AND "dueDate" >= CAST(${current.endDate} AS date)), 0) AS "pendingCurrent",
        COALESCE((SELECT SUM("amount") FROM "receivables"
          WHERE "createdAt" < ${previous.endExclusiveTimestamp}
            AND ("paidAt" IS NULL OR "paidAt" > CAST(${previous.endDate} AS date))
            AND ("canceledAt" IS NULL OR "canceledAt" >= ${previous.endExclusiveTimestamp})
            AND NOT ("status" = 'PAGO' AND "paidAt" IS NULL)
            AND NOT ("status" = 'CANCELADO' AND "canceledAt" IS NULL)
            AND "dueDate" >= CAST(${previous.endDate} AS date)), 0) AS "pendingPrevious",
        COALESCE((SELECT SUM("amount") FROM "receivables"
          WHERE "createdAt" < ${current.endExclusiveTimestamp}
            AND ("paidAt" IS NULL OR "paidAt" > CAST(${current.endDate} AS date))
            AND ("canceledAt" IS NULL OR "canceledAt" >= ${current.endExclusiveTimestamp})
            AND NOT ("status" = 'PAGO' AND "paidAt" IS NULL)
            AND NOT ("status" = 'CANCELADO' AND "canceledAt" IS NULL)
            AND "dueDate" < CAST(${current.endDate} AS date)), 0) AS "overdueCurrent",
        COALESCE((SELECT SUM("amount") FROM "receivables"
          WHERE "createdAt" < ${previous.endExclusiveTimestamp}
            AND ("paidAt" IS NULL OR "paidAt" > CAST(${previous.endDate} AS date))
            AND ("canceledAt" IS NULL OR "canceledAt" >= ${previous.endExclusiveTimestamp})
            AND NOT ("status" = 'PAGO' AND "paidAt" IS NULL)
            AND NOT ("status" = 'CANCELADO' AND "canceledAt" IS NULL)
            AND "dueDate" < CAST(${previous.endDate} AS date)), 0) AS "overduePrevious"
    `);
  }

  private financialSeries(tx: Prisma.TransactionClient, period: ReportingDateRange) {
    return tx.$queryRaw<FinancialSeriesRow[]>(Prisma.sql`
      SELECT "transactionDate" AS "businessDate", "origin",
        SUM("amount") AS "amount", COUNT(*) AS "payments"
      FROM "financial_transactions"
      WHERE "type" = 'ENTRADA' AND "origin" IN ('RECEIVABLE_PAYMENT', 'LEGACY_IMPORT')
        AND "transactionDate" BETWEEN CAST(${period.startDate} AS date) AND CAST(${period.endDate} AS date)
      GROUP BY "transactionDate", "origin"
      ORDER BY "transactionDate", "origin"
    `);
  }

  private clientSeries(tx: Prisma.TransactionClient, period: ReportingDateRange) {
    return tx.$queryRaw<ClientSeriesRow[]>(Prisma.sql`
      SELECT ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS "businessDate",
        COUNT(*) AS "total"
      FROM "clients"
      WHERE "createdAt" >= ${period.startTimestamp} AND "createdAt" < ${period.endExclusiveTimestamp}
      GROUP BY ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
      ORDER BY ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
    `);
  }

  private lifecycleSeries(tx: Prisma.TransactionClient, period: ReportingDateRange) {
    return tx.$queryRaw<LifecycleSeriesRow[]>(Prisma.sql`
      SELECT receivable."paidAt" AS "businessDate", receivable."purpose",
        COUNT(*) AS "total", SUM(receivable."amount") AS "amount"
      FROM "receivables" receivable
      LEFT JOIN "client_reference_reactivations" reactivation
        ON reactivation."receivableId" = receivable."id"
      WHERE receivable."status" = 'PAGO'
        AND receivable."purpose" IN ('INITIAL_ACTIVATION', 'RENEWAL', 'REACTIVATION')
        AND receivable."paidAt" BETWEEN CAST(${period.startDate} AS date) AND CAST(${period.endDate} AS date)
        AND (receivable."purpose" <> 'REACTIVATION' OR reactivation."status" = 'PAID')
      GROUP BY receivable."paidAt", receivable."purpose"
      ORDER BY receivable."paidAt", receivable."purpose"
    `);
  }

  private buildFinancialSeries(
    period: ReportingDateRange,
    granularity: ReportingGranularity,
    rows: FinancialSeriesRow[],
  ) {
    const points = new Map(
      reportingBucketKeys(period, granularity).map((bucket) => [
        bucket,
        { bucket, operational: new Prisma.Decimal(0), legacy: new Prisma.Decimal(0), payments: 0 },
      ]),
    );
    for (const row of rows) {
      const point = points.get(reportingBucketKey(row.businessDate, granularity));
      if (!point) continue;
      if (row.origin === 'RECEIVABLE_PAYMENT')
        point.operational = point.operational.plus(row.amount);
      else point.legacy = point.legacy.plus(row.amount);
      point.payments += Number(row.payments);
    }
    return [...points.values()].map((point) => ({
      bucket: point.bucket,
      received: point.operational.plus(point.legacy).toFixed(2),
      operational: point.operational.toFixed(2),
      legacy: point.legacy.toFixed(2),
      payments: point.payments,
    }));
  }

  private buildClientSeries(
    period: ReportingDateRange,
    granularity: ReportingGranularity,
    rows: ClientSeriesRow[],
  ) {
    const points = new Map(
      reportingBucketKeys(period, granularity).map((bucket) => [bucket, { bucket, total: 0 }]),
    );
    for (const row of rows) {
      const point = points.get(reportingBucketKey(row.businessDate, granularity));
      if (point) point.total += Number(row.total);
    }
    return [...points.values()];
  }

  private buildLifecycleSeries(
    period: ReportingDateRange,
    granularity: ReportingGranularity,
    rows: LifecycleSeriesRow[],
  ) {
    const points = new Map(
      reportingBucketKeys(period, granularity).map((bucket) => [
        bucket,
        { bucket, activations: 0, renewals: 0, reactivations: 0 },
      ]),
    );
    for (const row of rows) {
      const point = points.get(reportingBucketKey(row.businessDate, granularity));
      if (!point) continue;
      if (row.purpose === 'INITIAL_ACTIVATION') point.activations += Number(row.total);
      if (row.purpose === 'RENEWAL') point.renewals += Number(row.total);
      if (row.purpose === 'REACTIVATION') point.reactivations += Number(row.total);
    }
    return [...points.values()];
  }

  private moneyMetric(current: Prisma.Decimal, previous: Prisma.Decimal) {
    return {
      value: current.toFixed(2),
      previousValue: previous.toFixed(2),
      ...this.change(current, previous),
    };
  }

  private countMetric(current: bigint, previous: bigint) {
    return {
      value: Number(current),
      previousValue: Number(previous),
      ...this.change(
        new Prisma.Decimal(current.toString()),
        new Prisma.Decimal(previous.toString()),
      ),
    };
  }

  private change(current: Prisma.Decimal, previous: Prisma.Decimal) {
    if (previous.isZero()) {
      return current.isZero()
        ? { changePercent: '0.00', comparison: 'percentage' as const }
        : { changePercent: null, comparison: 'new' as const };
    }
    return {
      changePercent: current.minus(previous).dividedBy(previous.abs()).times(100).toFixed(2),
      comparison: 'percentage' as const,
    };
  }

  private divideMoney(amount: Prisma.Decimal, count: bigint) {
    return count === 0n ? new Prisma.Decimal(0) : amount.dividedBy(count.toString());
  }

  private presentRange(range: ReportingDateRange) {
    return { startDate: range.startDate, endDate: range.endDate };
  }

  private emptyFinanceTotals(): FinanceTotalsRow {
    return {
      receivedCurrent: new Prisma.Decimal(0),
      receivedPrevious: new Prisma.Decimal(0),
      operationalCurrent: new Prisma.Decimal(0),
      operationalPrevious: new Prisma.Decimal(0),
      legacyCurrent: new Prisma.Decimal(0),
      legacyPrevious: new Prisma.Decimal(0),
      manualCurrent: new Prisma.Decimal(0),
      manualPrevious: new Prisma.Decimal(0),
      paymentsCurrent: 0n,
      paymentsPrevious: 0n,
      operationalReceivablesCurrent: 0n,
      operationalReceivablesPrevious: 0n,
    };
  }

  private emptyOperationalTotals(): OperationalTotalsRow {
    return {
      newClientsCurrent: 0n,
      newClientsPrevious: 0n,
      activeClientsCurrent: 0n,
      activeClientsPrevious: 0n,
      activationsCurrent: 0n,
      activationsPrevious: 0n,
      renewalsCurrent: 0n,
      renewalsPrevious: 0n,
      reactivationsCurrent: 0n,
      reactivationsPrevious: 0n,
      cancellationsCurrent: 0n,
      cancellationsPrevious: 0n,
      pendingCurrent: new Prisma.Decimal(0),
      pendingPrevious: new Prisma.Decimal(0),
      overdueCurrent: new Prisma.Decimal(0),
      overduePrevious: new Prisma.Decimal(0),
    };
  }
}
