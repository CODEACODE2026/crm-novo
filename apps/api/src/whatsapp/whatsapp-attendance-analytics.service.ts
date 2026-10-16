import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type WhatsAppAttendanceStatus } from '@prisma/client';
import { formatBusinessDate, parseBusinessDate } from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { WhatsAppAttendanceAnalyticsDto } from './dto/whatsapp-attendance-analytics.dto';

const analyticsTimeZone = 'America/Sao_Paulo';
const analyticsMaxDays = 366;
const rankingLimit = 10;

type AnalyticsSummaryRow = {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  firstResponseAvgSeconds: number;
  resolutionAvgSeconds: number;
  receivedMessages: number;
  sentManualMessages: number;
};

type ResolvedTodayRow = { count: number };
type CategoryRow = {
  categoryId: string;
  name: string;
  color: string;
  count: number;
};
type ClientRow = {
  clientId: string;
  clientName: string;
  phone: string;
  attendancesCount: number;
  resolvedCount: number;
  avgResolutionSeconds: number;
};
type VolumeRow = { period: string; opened: number; resolved: number };
type DistributionRow = { bucket: number; count: number };
type OpenAttendanceRow = {
  attendanceId: string;
  conversationId: string;
  clientId: string | null;
  clientName: string;
  phone: string;
  status: WhatsAppAttendanceStatus;
  openedAt: Date;
  ageSeconds: number;
  inboundMessagesCount: number;
  outboundMessagesCount: number;
};

@Injectable()
export class WhatsAppAttendanceAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async analytics(query: WhatsAppAttendanceAnalyticsDto) {
    const period = this.getPeriod(query);
    await this.validateDimensions(query);
    const openedWhere = this.where(query, {
      field: Prisma.sql`a."openedAt"`,
      from: period.fromDateTime,
      to: period.toDateTime,
    });
    const resolvedWhere = this.where(query, {
      field: Prisma.sql`a."resolvedAt"`,
      from: period.fromDateTime,
      to: period.toDateTime,
    });
    const today = this.today();
    const todayStart = this.startOfSaoPauloBusinessDate(today);
    const todayEnd = new Date(
      this.startOfSaoPauloBusinessDate(this.addDays(today, 1)).getTime() - 1,
    );
    const resolvedTodayWhere = this.where(query, {
      field: Prisma.sql`a."resolvedAt"`,
      from: todayStart,
      to: todayEnd,
    });
    const operationalWhere = this.where(query);
    const volumeGranularity = period.days <= 31 ? 'day' : 'month';
    const volumeFormat = volumeGranularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';

    const [
      summaryRows,
      resolvedTodayRows,
      categoryRows,
      clientRows,
      volumeRows,
      hourlyRows,
      weekdayRows,
      waitingRows,
      oldestRows,
    ] = await this.prisma.$transaction(async (tx) =>
      Promise.all([
        tx.$queryRaw<AnalyticsSummaryRow[]>`
          SELECT
            COUNT(*)::int AS "total",
            COUNT(*) FILTER (WHERE a."status" = 'PENDING')::int AS "pending",
            COUNT(*) FILTER (WHERE a."status" = 'IN_PROGRESS')::int AS "inProgress",
            COUNT(*) FILTER (WHERE a."status" = 'RESOLVED')::int AS "resolved",
            COALESCE(AVG(EXTRACT(EPOCH FROM (a."firstAgentReplyAt" - a."openedAt")))
              FILTER (WHERE a."firstAgentReplyAt" IS NOT NULL), 0)::double precision
              AS "firstResponseAvgSeconds",
            COALESCE(AVG(EXTRACT(EPOCH FROM (a."resolvedAt" - a."openedAt")))
              FILTER (WHERE a."status" = 'RESOLVED' AND a."resolvedAt" IS NOT NULL), 0)::double precision
              AS "resolutionAvgSeconds",
            COALESCE(SUM(a."inboundMessagesCount"), 0)::int AS "receivedMessages",
            COALESCE(SUM(a."outboundMessagesCount"), 0)::int AS "sentManualMessages"
          FROM "whatsapp_attendances" a
          ${openedWhere}
        `,
        tx.$queryRaw<ResolvedTodayRow[]>`
          SELECT COUNT(*)::int AS "count"
          FROM "whatsapp_attendances" a
          ${resolvedTodayWhere}
        `,
        tx.$queryRaw<CategoryRow[]>`
          SELECT
            c."id" AS "categoryId",
            c."name",
            c."color"::text AS "color",
            COUNT(*)::int AS "count"
          FROM "whatsapp_attendances" a
          INNER JOIN "whatsapp_attendance_categories" c ON c."id" = a."categoryId"
          ${openedWhere}
            AND a."status" = 'RESOLVED'
          GROUP BY c."id", c."name", c."color"
          ORDER BY "count" DESC, c."name" ASC
          LIMIT ${rankingLimit}
        `,
        tx.$queryRaw<ClientRow[]>`
          SELECT
            c."id" AS "clientId",
            c."name" AS "clientName",
            c."phone",
            COUNT(*)::int AS "attendancesCount",
            COUNT(*) FILTER (WHERE a."status" = 'RESOLVED')::int AS "resolvedCount",
            COALESCE(AVG(EXTRACT(EPOCH FROM (a."resolvedAt" - a."openedAt")))
              FILTER (WHERE a."status" = 'RESOLVED' AND a."resolvedAt" IS NOT NULL), 0)::double precision
              AS "avgResolutionSeconds"
          FROM "whatsapp_attendances" a
          INNER JOIN "clients" c ON c."id" = a."clientId"
          ${openedWhere}
          GROUP BY c."id", c."name", c."phone"
          ORDER BY "attendancesCount" DESC, c."name" ASC
          LIMIT ${rankingLimit}
        `,
        tx.$queryRaw<VolumeRow[]>`
          WITH events AS (
            SELECT
              to_char(date_trunc(${volumeGranularity}, (a."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${analyticsTimeZone}), ${volumeFormat}) AS "period",
              1 AS "opened",
              0 AS "resolved"
            FROM "whatsapp_attendances" a
            ${openedWhere}
            UNION ALL
            SELECT
              to_char(date_trunc(${volumeGranularity}, (a."resolvedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${analyticsTimeZone}), ${volumeFormat}) AS "period",
              0 AS "opened",
              1 AS "resolved"
            FROM "whatsapp_attendances" a
            ${resolvedWhere}
          )
          SELECT "period", SUM("opened")::int AS "opened", SUM("resolved")::int AS "resolved"
          FROM events
          GROUP BY "period"
          ORDER BY "period" ASC
        `,
        tx.$queryRaw<DistributionRow[]>`
          SELECT
            EXTRACT(HOUR FROM ((a."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${analyticsTimeZone}))::int AS "bucket",
            COUNT(*)::int AS "count"
          FROM "whatsapp_attendances" a
          ${openedWhere}
          GROUP BY "bucket"
          ORDER BY "bucket" ASC
        `,
        tx.$queryRaw<DistributionRow[]>`
          SELECT
            EXTRACT(DOW FROM ((a."openedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${analyticsTimeZone}))::int AS "bucket",
            COUNT(*)::int AS "count"
          FROM "whatsapp_attendances" a
          ${openedWhere}
          GROUP BY "bucket"
          ORDER BY "bucket" ASC
        `,
        query.status && query.status !== 'PENDING'
          ? Promise.resolve([] as OpenAttendanceRow[])
          : tx.$queryRaw<OpenAttendanceRow[]>`
              SELECT
                a."id" AS "attendanceId",
                a."conversationId",
                a."clientId",
                COALESCE(c."name", conv."contactName", conv."phone") AS "clientName",
                COALESCE(c."phone", conv."phone") AS "phone",
                a."status"::text AS "status",
                a."openedAt",
                GREATEST(EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - a."openedAt")), 0)::double precision AS "ageSeconds",
                a."inboundMessagesCount",
                a."outboundMessagesCount"
              FROM "whatsapp_attendances" a
              INNER JOIN "whatsapp_conversations" conv ON conv."id" = a."conversationId"
              LEFT JOIN "clients" c ON c."id" = a."clientId"
              ${operationalWhere}
                AND a."status" = 'PENDING'
              ORDER BY a."openedAt" ASC
              LIMIT ${rankingLimit}
            `,
        query.status === 'RESOLVED'
          ? Promise.resolve([] as OpenAttendanceRow[])
          : tx.$queryRaw<OpenAttendanceRow[]>`
              SELECT
                a."id" AS "attendanceId",
                a."conversationId",
                a."clientId",
                COALESCE(c."name", conv."contactName", conv."phone") AS "clientName",
                COALESCE(c."phone", conv."phone") AS "phone",
                a."status"::text AS "status",
                a."openedAt",
                GREATEST(EXTRACT(EPOCH FROM ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - a."openedAt")), 0)::double precision AS "ageSeconds",
                a."inboundMessagesCount",
                a."outboundMessagesCount"
              FROM "whatsapp_attendances" a
              INNER JOIN "whatsapp_conversations" conv ON conv."id" = a."conversationId"
              LEFT JOIN "clients" c ON c."id" = a."clientId"
              ${operationalWhere}
                AND a."status" IN ('PENDING', 'IN_PROGRESS')
                ${query.status ? Prisma.sql`AND a."status" = ${query.status}::"WhatsAppAttendanceStatus"` : Prisma.empty}
              ORDER BY a."openedAt" ASC
              LIMIT ${rankingLimit}
            `,
      ]),
    );

    const summary = summaryRows[0] ?? this.emptySummary();
    const total = summary.total;
    const percentage = (count: number) =>
      total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

    return {
      period: {
        from: period.from,
        to: period.to,
        timezone: analyticsTimeZone,
        granularity: volumeGranularity,
      },
      summary: {
        totalAttendances: total,
        pending: summary.pending,
        inProgress: summary.inProgress,
        resolved: summary.resolved,
        resolvedToday: resolvedTodayRows[0]?.count ?? 0,
        resolutionRate: percentage(summary.resolved),
        firstResponseAvgSeconds: this.roundSeconds(summary.firstResponseAvgSeconds),
        resolutionAvgSeconds: this.roundSeconds(summary.resolutionAvgSeconds),
        receivedMessages: summary.receivedMessages,
        sentManualMessages: summary.sentManualMessages,
      },
      statusDistribution: [
        { status: 'PENDING', count: summary.pending, percentage: percentage(summary.pending) },
        {
          status: 'IN_PROGRESS',
          count: summary.inProgress,
          percentage: percentage(summary.inProgress),
        },
        { status: 'RESOLVED', count: summary.resolved, percentage: percentage(summary.resolved) },
      ],
      topCategories: categoryRows.map((row) => ({
        ...row,
        percentage:
          summary.resolved > 0 ? Number(((row.count / summary.resolved) * 100).toFixed(1)) : 0,
      })),
      topClients: clientRows.map((row) => ({
        ...row,
        avgResolutionSeconds: this.roundSeconds(row.avgResolutionSeconds),
      })),
      dailyVolume: volumeRows,
      hourlyDistribution: this.completeDistribution(hourlyRows, 24, 'hour'),
      weekdayDistribution: this.completeDistribution(weekdayRows, 7, 'weekday'),
      waitingFirstResponse: waitingRows.map((row) => this.presentOpen(row)),
      oldestOpenAttendances: oldestRows.map((row) => this.presentOpen(row)),
    };
  }

  private async validateDimensions(query: WhatsAppAttendanceAnalyticsDto) {
    if (query.connectionId) {
      const connection = await this.prisma.whatsAppConnection.findUnique({
        where: { id: query.connectionId },
        select: { id: true },
      });
      if (!connection) throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }
    if (query.categoryId) {
      const category = await this.prisma.whatsAppAttendanceCategory.findFirst({
        where: {
          id: query.categoryId,
          ...(query.connectionId ? { whatsAppConnectionId: query.connectionId } : {}),
        },
        select: { id: true },
      });
      if (!category) throw new BadRequestException('Categoria invalida para a conexao informada.');
    }
  }

  private where(
    query: WhatsAppAttendanceAnalyticsDto,
    range?: { field: Prisma.Sql; from: Date; to: Date },
  ) {
    const conditions: Prisma.Sql[] = [];
    if (range)
      conditions.push(
        Prisma.sql`${range.field} >= ${range.from} AND ${range.field} <= ${range.to}`,
      );
    if (query.connectionId)
      conditions.push(Prisma.sql`a."whatsAppConnectionId" = ${query.connectionId}::uuid`);
    if (query.categoryId) conditions.push(Prisma.sql`a."categoryId" = ${query.categoryId}::uuid`);
    if (query.status)
      conditions.push(Prisma.sql`a."status" = ${query.status}::"WhatsAppAttendanceStatus"`);
    return Prisma.sql`WHERE ${
      conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`
    }`;
  }

  private getPeriod(query: WhatsAppAttendanceAnalyticsDto) {
    if ((query.dateFrom && !query.dateTo) || (!query.dateFrom && query.dateTo)) {
      throw new BadRequestException('Informe dateFrom e dateTo juntos.');
    }
    const today = this.today();
    const fromDate = query.dateFrom ? parseBusinessDate(query.dateFrom) : this.monthStart(today);
    const toDate = query.dateTo ? parseBusinessDate(query.dateTo) : this.monthEnd(today);
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException('dateFrom deve ser menor ou igual a dateTo.');
    }
    const days = this.daysBetween(fromDate, toDate) + 1;
    if (days > analyticsMaxDays) {
      throw new BadRequestException(`O periodo deve ter no maximo ${analyticsMaxDays} dias.`);
    }
    return {
      from: formatBusinessDate(fromDate),
      to: formatBusinessDate(toDate),
      fromDateTime: this.startOfSaoPauloBusinessDate(fromDate),
      toDateTime: new Date(this.startOfSaoPauloBusinessDate(this.addDays(toDate, 1)).getTime() - 1),
      days,
    };
  }

  private today() {
    return parseBusinessDate(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: analyticsTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    );
  }

  private startOfSaoPauloBusinessDate(date: Date) {
    return this.saoPauloDateTimeToUtc(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  private saoPauloDateTimeToUtc(year: number, month: number, day: number) {
    const utcGuess = new Date(Date.UTC(year, month - 1, day));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: analyticsTimeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(utcGuess);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    const zonedUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second'),
    );
    return new Date(utcGuess.getTime() - (zonedUtc - utcGuess.getTime()));
  }

  private monthStart(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  private monthEnd(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  }

  private addDays(date: Date, days: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
  }

  private daysBetween(from: Date, to: Date) {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
  }

  private completeDistribution(rows: DistributionRow[], length: number, key: 'hour' | 'weekday') {
    const values = new Map(rows.map((row) => [row.bucket, row.count]));
    return Array.from({ length }, (_, bucket) => ({
      [key]: bucket,
      count: values.get(bucket) ?? 0,
    }));
  }

  private presentOpen(row: OpenAttendanceRow) {
    return {
      ...row,
      ageSeconds: this.roundSeconds(row.ageSeconds),
    };
  }

  private roundSeconds(value: number) {
    return Math.max(0, Math.round(Number(value) || 0));
  }

  private emptySummary(): AnalyticsSummaryRow {
    return {
      total: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      firstResponseAvgSeconds: 0,
      resolutionAvgSeconds: 0,
      receivedMessages: 0,
      sentManualMessages: 0,
    };
  }
}
