import { BadRequestException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppAttendanceAnalyticsDto } from './dto/whatsapp-attendance-analytics.dto';
import { WhatsAppAttendanceAnalyticsService } from './whatsapp-attendance-analytics.service';

const connectionId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

function setup(rawResults: unknown[][] = []) {
  const results = [...rawResults];
  const tx = {
    $queryRaw: vi.fn(() => Promise.resolve(results.shift() ?? [])),
  };
  const prisma = {
    whatsAppConnection: { findUnique: vi.fn().mockResolvedValue({ id: connectionId }) },
    whatsAppAttendanceCategory: { findFirst: vi.fn().mockResolvedValue({ id: categoryId }) },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    prisma,
    subject: new WhatsAppAttendanceAnalyticsService(prisma as never),
    tx,
  };
}

function completeResults() {
  return [
    [
      {
        total: 10,
        pending: 2,
        inProgress: 3,
        resolved: 5,
        firstResponseAvgSeconds: 74.4,
        resolutionAvgSeconds: 3720.6,
        receivedMessages: 28,
        sentManualMessages: 14,
        pendingWithAutoReply: 1,
        attendancesWithAutoReply: 4,
        autoRepliesSentInPeriod: 6,
      },
    ],
    [{ count: 2 }],
    [{ categoryId, name: 'Suporte', color: 'BLUE', count: 4 }],
    [
      {
        clientId: '33333333-3333-4333-8333-333333333333',
        clientName: 'Cliente A',
        phone: '5511999999999',
        attendancesCount: 4,
        resolvedCount: 3,
        avgResolutionSeconds: 3600.4,
      },
    ],
    [{ period: '2026-10-16', opened: 3, resolved: 2 }],
    [{ bucket: 9, count: 3 }],
    [{ bucket: 5, count: 3 }],
    [
      {
        attendanceId: '44444444-4444-4444-8444-444444444444',
        conversationId: '55555555-5555-4555-8555-555555555555',
        clientId: null,
        clientName: 'Avulso',
        phone: '5511888888888',
        status: 'PENDING',
        openedAt: new Date('2026-10-16T12:00:00.000Z'),
        ageSeconds: 125.8,
        inboundMessagesCount: 2,
        outboundMessagesCount: 0,
        hasAutoReply: true,
        lastAutoReplyAt: new Date('2026-10-16T12:01:00.000Z'),
        autoReplyMode: 'SERVICE_UNAVAILABLE',
      },
    ],
    [],
  ];
}

describe('WhatsAppAttendanceAnalyticsService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the current Sao Paulo month by default and returns every KPI and distribution', async () => {
    const { subject, tx } = setup(completeResults());
    const result = await subject.analytics({});

    expect(result.period).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      timezone: 'America/Sao_Paulo',
      granularity: 'day',
    });
    expect(result.summary).toEqual({
      totalAttendances: 10,
      pending: 2,
      inProgress: 3,
      resolved: 5,
      resolvedToday: 2,
      resolutionRate: 50,
      firstResponseAvgSeconds: 74,
      resolutionAvgSeconds: 3721,
      receivedMessages: 28,
      sentManualMessages: 14,
      pendingWithAutoReply: 1,
      attendancesWithAutoReply: 4,
      autoRepliesSentInPeriod: 6,
      autoReplyCoverageRate: 40,
    });
    expect(result.statusDistribution).toEqual([
      { status: 'PENDING', count: 2, percentage: 20 },
      { status: 'IN_PROGRESS', count: 3, percentage: 30 },
      { status: 'RESOLVED', count: 5, percentage: 50 },
    ]);
    expect(result.topCategories[0]).toMatchObject({ count: 4, percentage: 80 });
    expect(result.topClients[0]).toMatchObject({ avgResolutionSeconds: 3600 });
    expect(result.dailyVolume).toEqual([{ period: '2026-10-16', opened: 3, resolved: 2 }]);
    expect(result.hourlyDistribution).toHaveLength(24);
    expect(result.hourlyDistribution[9]).toEqual({ hour: 9, count: 3 });
    expect(result.weekdayDistribution).toHaveLength(7);
    expect(result.weekdayDistribution[5]).toEqual({ weekday: 5, count: 3 });
    expect(result.waitingFirstResponse[0]).toMatchObject({
      ageSeconds: 126,
      hasAutoReply: true,
      autoReplyMode: 'SERVICE_UNAVAILABLE',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(9);
  });

  it('accepts custom dates and switches periods above 31 days to monthly volume', async () => {
    const { subject } = setup(completeResults());
    const result = await subject.analytics({ dateFrom: '2026-01-01', dateTo: '2026-03-31' });
    expect(result.period).toMatchObject({
      from: '2026-01-01',
      to: '2026-03-31',
      granularity: 'month',
    });
  });

  it('converts Sao Paulo date boundaries to UTC before querying', async () => {
    const { subject, tx } = setup(completeResults());
    await subject.analytics({ dateFrom: '2026-10-01', dateTo: '2026-10-16' });
    const queryParts = tx.$queryRaw.mock.calls[0] as unknown[];
    const dates = queryParts
      .flatMap((part) => {
        if (!part || Array.isArray(part) || typeof part !== 'object') return [];
        const values = (part as { values?: unknown[] }).values;
        return Array.isArray(values) ? values : [];
      })
      .filter((value): value is Date => value instanceof Date);
    expect(dates.map((date) => date.toISOString())).toEqual([
      '2026-10-01T03:00:00.000Z',
      '2026-10-17T02:59:59.999Z',
    ]);
  });

  it('rejects malformed dates, identifiers and statuses at the DTO boundary', async () => {
    const dto = Object.assign(new WhatsAppAttendanceAnalyticsDto(), {
      connectionId: 'not-a-uuid',
      dateFrom: '16/10/2026',
      dateTo: '2026-13-40',
      categoryId: 'not-a-uuid',
      status: 'OPEN',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property).sort()).toEqual([
      'categoryId',
      'connectionId',
      'dateFrom',
      'dateTo',
      'status',
    ]);
  });

  it('rejects incomplete, inverted and excessive ranges before querying analytics', async () => {
    const { prisma, subject } = setup();
    await expect(subject.analytics({ dateFrom: '2026-10-01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      subject.analytics({ dateFrom: '2026-10-20', dateTo: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      subject.analytics({ dateFrom: '2025-01-01', dateTo: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('validates connection and category isolation before running parametrized filters', async () => {
    const { prisma, subject } = setup(completeResults());
    await subject.analytics({
      connectionId,
      categoryId,
      status: 'RESOLVED',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-16',
    });
    expect(prisma.whatsAppConnection.findUnique).toHaveBeenCalledWith({
      where: { id: connectionId },
      select: { id: true },
    });
    expect(prisma.whatsAppAttendanceCategory.findFirst).toHaveBeenCalledWith({
      where: { id: categoryId, whatsAppConnectionId: connectionId },
      select: { id: true },
    });
  });

  it('rejects unknown connections and cross-connection categories', async () => {
    const unknownConnection = setup();
    unknownConnection.prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
    await expect(unknownConnection.subject.analytics({ connectionId })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const invalidCategory = setup();
    invalidCategory.prisma.whatsAppAttendanceCategory.findFirst.mockResolvedValue(null);
    await expect(
      invalidCategory.subject.analytics({ connectionId, categoryId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns zero-safe analytics and complete empty hourly/weekday buckets', async () => {
    const { subject } = setup([[], [], [], [], [], [], [], [], []]);
    const result = await subject.analytics({});
    expect(result.summary).toMatchObject({
      totalAttendances: 0,
      resolutionRate: 0,
      firstResponseAvgSeconds: 0,
      resolutionAvgSeconds: 0,
      receivedMessages: 0,
      sentManualMessages: 0,
      pendingWithAutoReply: 0,
      attendancesWithAutoReply: 0,
      autoRepliesSentInPeriod: 0,
      autoReplyCoverageRate: 0,
    });
    expect(result.statusDistribution.every((item) => item.percentage === 0)).toBe(true);
    expect(result.hourlyDistribution).toHaveLength(24);
    expect(result.weekdayDistribution).toHaveLength(7);
    expect(result.waitingFirstResponse).toEqual([]);
    expect(result.oldestOpenAttendances).toEqual([]);
  });

  it('keeps operational queues compatible with status filters', async () => {
    const pending = setup(completeResults());
    const pendingResult = await pending.subject.analytics({ status: 'PENDING' });
    expect(pendingResult.waitingFirstResponse).toHaveLength(1);

    const resolved = setup(completeResults());
    const resolvedResult = await resolved.subject.analytics({ status: 'RESOLVED' });
    expect(resolvedResult.waitingFirstResponse).toEqual([]);
    expect(resolvedResult.oldestOpenAttendances).toEqual([]);
    expect(resolved.tx.$queryRaw).toHaveBeenCalledTimes(7);
  });
});
