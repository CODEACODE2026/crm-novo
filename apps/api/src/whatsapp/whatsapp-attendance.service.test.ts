import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  ATTENDANCE_RESOLUTION_GRACE_MINUTES,
  WhatsAppAttendanceService,
} from './whatsapp-attendance.service';

const conversationId = '11111111-1111-4111-8111-111111111111';
const connectionId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333';
const attendanceId = '44444444-4444-4444-8444-444444444444';
const categoryId = '55555555-5555-4555-8555-555555555555';

function transaction(overrides: Record<string, unknown> = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    whatsAppMessage: {
      findUnique: vi.fn().mockResolvedValue({
        attendanceId: null,
        createdAt: new Date('2026-10-16T10:05:00.000Z'),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    whatsAppAttendance: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: attendanceId }),
      update: vi.fn().mockResolvedValue({ id: attendanceId }),
    },
    whatsAppConversation: {
      findUnique: vi.fn().mockResolvedValue({
        id: conversationId,
        status: 'OPEN',
        whatsAppConnectionId: connectionId,
      }),
      update: vi.fn().mockResolvedValue({ id: conversationId, status: 'RESOLVED' }),
    },
    whatsAppAttendanceCategory: {
      findFirst: vi.fn().mockResolvedValue({ id: categoryId, isActive: true }),
    },
    ...overrides,
  };
  return tx;
}

function service(tx = transaction()) {
  const prisma = {
    $transaction: vi.fn(
      (action: ((transactionClient: unknown) => unknown) | Array<Promise<unknown>>) =>
        Array.isArray(action) ? Promise.all(action) : Promise.resolve(action(tx)),
    ),
    whatsAppConnection: { findUnique: vi.fn().mockResolvedValue({ id: connectionId }) },
    whatsAppConversation: { findUnique: vi.fn().mockResolvedValue({ id: conversationId }) },
    whatsAppAttendance: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    whatsAppAutoReplyExecution: { findMany: vi.fn().mockResolvedValue([]) },
    client: { findUnique: vi.fn().mockResolvedValue({ id: 'client-id' }) },
    whatsAppAttendanceCategory: {
      createMany: vi.fn().mockResolvedValue({ count: 11 }),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: categoryId }),
      update: vi.fn().mockResolvedValue({ id: categoryId }),
      delete: vi.fn().mockResolvedValue({ id: categoryId }),
      findFirst: vi.fn().mockResolvedValue({ id: categoryId }),
    },
  };
  const realtime = { emitConversationUpdated: vi.fn() };
  return {
    prisma,
    realtime,
    subject: new WhatsAppAttendanceService(prisma as never, realtime as never),
    tx,
  };
}

describe('WhatsAppAttendanceService', () => {
  it('opens one pending attendance from a new inbound and links its opening message', async () => {
    const context = service();
    const occurredAt = new Date('2026-10-16T10:00:00.000Z');

    await expect(
      context.subject.recordInboundMessage(context.tx as never, {
        conversationId,
        connectionId,
        clientId: null,
        messageId,
        occurredAt,
      }),
    ).resolves.toEqual({ attendanceId, created: true });
    const [createInput] = context.tx.whatsAppAttendance.create.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(createInput.data).toMatchObject({
      conversationId,
      whatsAppConnectionId: connectionId,
      clientId: null,
      openedAt: occurredAt,
      openedByMessageId: messageId,
    });
    expect(context.tx.whatsAppMessage.update).toHaveBeenCalledWith({
      where: { id: messageId },
      data: { attendanceId },
    });
  });

  it('does not increment twice when the inbound message is already linked', async () => {
    const tx = transaction();
    tx.whatsAppMessage.findUnique.mockResolvedValue({ attendanceId });
    const context = service(tx);

    await expect(
      context.subject.recordInboundMessage(tx as never, {
        conversationId,
        connectionId,
        clientId: null,
        messageId,
        occurredAt: new Date(),
      }),
    ).resolves.toEqual({ attendanceId, created: false });
    expect(tx.whatsAppAttendance.update).not.toHaveBeenCalled();
    expect(tx.whatsAppAttendance.create).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'IN_PROGRESS'] as const)(
    'attaches inbound to the existing %s attendance without opening another',
    async (status) => {
      const tx = transaction();
      tx.whatsAppAttendance.findFirst.mockResolvedValueOnce({ id: attendanceId, status });
      const context = service(tx);
      await context.subject.recordInboundMessage(tx as never, {
        conversationId,
        connectionId,
        clientId: null,
        messageId,
        occurredAt: new Date(),
      });
      expect(tx.whatsAppAttendance.update).toHaveBeenCalledWith({
        where: { id: attendanceId },
        data: { inboundMessagesCount: { increment: 1 } },
      });
      expect(tx.whatsAppAttendance.create).not.toHaveBeenCalled();
    },
  );

  it.each([5, 14 + 59 / 60])(
    'keeps a courtesy inbound at %s minutes in the resolved attendance',
    async (minutes) => {
      const occurredAt = new Date('2026-10-16T10:15:00.000Z');
      const tx = transaction();
      tx.whatsAppAttendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: attendanceId,
        status: 'RESOLVED',
        resolvedAt: new Date(occurredAt.getTime() - minutes * 60_000),
      });
      const context = service(tx);
      await expect(
        context.subject.recordInboundMessage(tx as never, {
          conversationId,
          connectionId,
          clientId: null,
          messageId,
          occurredAt,
        }),
      ).resolves.toEqual({ attendanceId, created: false, grace: true });
      expect(tx.whatsAppAttendance.create).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1])(
    'opens a new pending attendance at 15 minutes plus %s ms',
    async (extraMilliseconds) => {
      const occurredAt = new Date('2026-10-16T10:15:00.001Z');
      const tx = transaction();
      tx.whatsAppAttendance.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'old-attendance',
        status: 'RESOLVED',
        resolvedAt: new Date(
          occurredAt.getTime() - ATTENDANCE_RESOLUTION_GRACE_MINUTES * 60_000 - extraMilliseconds,
        ),
      });
      const context = service(tx);
      await context.subject.recordInboundMessage(tx as never, {
        conversationId,
        connectionId,
        clientId: null,
        messageId,
        occurredAt,
      });
      expect(tx.whatsAppAttendance.create).toHaveBeenCalledOnce();
    },
  );

  it('marks the first provider-confirmed manual reply and never opens an attendance', async () => {
    const occurredAt = new Date('2026-10-16T10:05:00.000Z');
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({
      id: attendanceId,
      status: 'PENDING',
      firstAgentReplyAt: null,
    });
    const context = service(tx);
    await context.subject.recordManualOutboundMessage(tx as never, {
      conversationId,
      messageId,
      occurredAt,
    });
    expect(tx.whatsAppAttendance.update).toHaveBeenCalledWith({
      where: { id: attendanceId },
      data: {
        outboundMessagesCount: { increment: 1 },
        status: 'IN_PROGRESS',
        firstAgentReplyAt: occurredAt,
      },
    });
    expect(tx.whatsAppAttendance.create).not.toHaveBeenCalled();
  });

  it('keeps firstAgentReplyAt immutable on later manual replies', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({
      id: attendanceId,
      status: 'IN_PROGRESS',
      firstAgentReplyAt: new Date('2026-10-16T10:05:00.000Z'),
    });
    const context = service(tx);
    await context.subject.recordManualOutboundMessage(tx as never, {
      conversationId,
      messageId,
      occurredAt: new Date('2026-10-16T10:06:00.000Z'),
    });
    expect(tx.whatsAppAttendance.update).toHaveBeenCalledWith({
      where: { id: attendanceId },
      data: { outboundMessagesCount: { increment: 1 } },
    });
  });

  it('never associates an outbound message created before the attendance opened', async () => {
    const tx = transaction();
    const messageCreatedAt = new Date('2026-10-16T09:06:00.000Z');
    tx.whatsAppMessage.findUnique.mockResolvedValue({
      attendanceId: null,
      createdAt: messageCreatedAt,
    });
    tx.whatsAppAttendance.findFirst.mockResolvedValue(null);
    const context = service(tx);

    await expect(
      context.subject.recordManualOutboundMessage(tx as never, {
        conversationId,
        messageId,
        occurredAt: new Date('2026-10-16T09:08:00.000Z'),
      }),
    ).resolves.toBeNull();

    expect(tx.whatsAppAttendance.findFirst).toHaveBeenCalledWith({
      where: {
        conversationId,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        openedAt: { lte: messageCreatedAt },
      },
      orderBy: { openedAt: 'desc' },
    });
    expect(tx.whatsAppAttendance.update).not.toHaveBeenCalled();
    expect(tx.whatsAppMessage.update).not.toHaveBeenCalled();
  });

  it.each(['AWAY', 'SERVICE_UNAVAILABLE', 'CUSTOM'] as const)(
    'derives a provider-confirmed %s auto-reply inside the attendance window without changing human metrics',
    async (mode) => {
      const openedAt = new Date('2026-10-16T10:00:00.000Z');
      const sentAt = new Date('2026-10-16T10:01:00.000Z');
      const context = service();
      context.prisma.whatsAppAttendance.findUnique.mockResolvedValue({
        id: attendanceId,
        conversationId,
        whatsAppConnectionId: connectionId,
        clientId: null,
        status: 'PENDING',
        openedAt,
        firstAgentReplyAt: null,
        resolvedAt: null,
        category: null,
        resolutionNote: null,
        resolvedBy: null,
        inboundMessagesCount: 1,
        outboundMessagesCount: 0,
        createdAt: openedAt,
        updatedAt: openedAt,
      });
      context.prisma.whatsAppAutoReplyExecution.findMany.mockResolvedValue([
        {
          id: 'execution-id',
          conversationId,
          whatsAppConnectionId: connectionId,
          sentAt,
          config: { mode },
        },
        {
          id: 'older-execution',
          conversationId,
          whatsAppConnectionId: connectionId,
          sentAt: new Date('2026-10-16T09:59:00.000Z'),
          config: { mode: 'CUSTOM' },
        },
      ]);

      const result = await context.subject.getAttendance(attendanceId);

      expect(result).toMatchObject({
        status: 'PENDING',
        firstAgentReplyAt: null,
        outboundMessagesCount: 0,
        autoReply: {
          sent: true,
          count: 1,
          lastSentAt: sentAt,
          mode,
          executionId: 'execution-id',
        },
      });
      const [findExecutionsInput] = context.prisma.whatsAppAutoReplyExecution.findMany.mock
        .calls[0] as unknown as [{ where: { status: string; sentAt: { not: null; gte: Date } } }];
      expect(findExecutionsInput.where).toMatchObject({
        status: 'SENT',
        sentAt: { not: null, gte: openedAt },
      });
    },
  );

  it('does not associate auto-replies sent after the attendance was resolved', async () => {
    const openedAt = new Date('2026-10-16T10:00:00.000Z');
    const resolvedAt = new Date('2026-10-16T10:10:00.000Z');
    const context = service();
    context.prisma.whatsAppAttendance.findUnique.mockResolvedValue({
      id: attendanceId,
      conversationId,
      whatsAppConnectionId: connectionId,
      clientId: null,
      status: 'RESOLVED',
      openedAt,
      firstAgentReplyAt: null,
      resolvedAt,
      category: null,
      resolutionNote: null,
      resolvedBy: null,
      inboundMessagesCount: 1,
      outboundMessagesCount: 0,
      createdAt: openedAt,
      updatedAt: resolvedAt,
    });
    context.prisma.whatsAppAutoReplyExecution.findMany.mockResolvedValue([
      {
        id: 'late-execution',
        conversationId,
        whatsAppConnectionId: connectionId,
        sentAt: new Date('2026-10-16T10:11:00.000Z'),
        config: { mode: 'AWAY' },
      },
    ]);

    await expect(context.subject.getAttendance(attendanceId)).resolves.toMatchObject({
      autoReply: { sent: false, count: 0, lastSentAt: null, mode: null },
    });
  });

  it('requires an active same-connection category to resolve an attendance', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({ id: attendanceId, status: 'PENDING' });
    const context = service(tx);
    await expect(
      context.subject.resolveActiveAttendance(conversationId, 'user-id', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsAppAttendance.update).not.toHaveBeenCalled();
  });

  it('resolves attendance and conversation atomically with the authenticated actor', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({ id: attendanceId, status: 'IN_PROGRESS' });
    const context = service(tx);
    await context.subject.resolveActiveAttendance(conversationId, 'user-id', {
      categoryId,
      resolutionNote: 'Resolvido com orientação.',
    });
    const [updateInput] = tx.whatsAppAttendance.update.mock.calls[0] as unknown as [
      { where: { id: string }; data: Record<string, unknown> },
    ];
    expect(updateInput).toMatchObject({
      where: { id: attendanceId },
      data: {
        status: 'RESOLVED',
        categoryId,
        resolutionNote: 'Resolvido com orientação.',
        resolvedByUserId: 'user-id',
      },
    });
    expect(tx.whatsAppConversation.update).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: { status: 'RESOLVED' },
    });
    expect(context.realtime.emitConversationUpdated).toHaveBeenCalledWith(conversationId);
  });

  it('keeps legacy conversations compatible without inventing historical attendance', async () => {
    const context = service();
    await expect(
      context.subject.resolveActiveAttendance(conversationId, 'user-id', {}),
    ).resolves.toMatchObject({ attendance: null });
    expect(context.tx.whatsAppAttendance.create).not.toHaveBeenCalled();
    expect(context.tx.whatsAppConversation.update).toHaveBeenCalled();
  });

  it('creates default categories idempotently with normalized pt-BR names', async () => {
    const context = service();
    context.prisma.whatsAppAttendanceCategory.createMany
      .mockResolvedValueOnce({ count: 11 })
      .mockResolvedValueOnce({ count: 0 });
    await context.subject.ensureDefaultCategories(connectionId);
    await context.subject.ensureDefaultCategories(connectionId);
    expect(context.prisma.whatsAppAttendanceCategory.createMany).toHaveBeenCalledTimes(2);
    expect(context.prisma.whatsAppAttendanceCategory.createMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const [createManyInput] = context.prisma.whatsAppAttendanceCategory.createMany.mock
      .calls[0] as unknown as [{ data: Array<Record<string, unknown>> }];
    const { data } = createManyInput;
    expect(data).toHaveLength(11);
    expect(data[0]).toMatchObject({ name: 'Suporte técnico', normalizedName: 'suporte técnico' });
  });

  it('maps a case-insensitive duplicate category constraint to conflict', async () => {
    const context = service();
    context.prisma.whatsAppAttendanceCategory.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['whatsAppConnectionId', 'normalizedName'] },
      }),
    );
    await expect(
      context.subject.createCategory(connectionId, { name: 'SUPORTE TÉCNICO', color: 'BLUE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects inactive or cross-connection categories', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({ id: attendanceId, status: 'PENDING' });
    tx.whatsAppAttendanceCategory.findFirst.mockResolvedValue(null);
    const context = service(tx);
    await expect(
      context.subject.resolveActiveAttendance(conversationId, 'user-id', { categoryId }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsAppAttendance.update).not.toHaveBeenCalled();
  });

  it('normalizes category names and keeps connection isolation on create', async () => {
    const context = service();
    await context.subject.createCategory(connectionId, {
      name: '  SUPORTE\u00a0TÉCNICO  ',
      color: 'BLUE',
      sortOrder: 3,
    });
    expect(context.prisma.whatsAppAttendanceCategory.create).toHaveBeenCalledWith({
      data: {
        whatsAppConnectionId: connectionId,
        name: 'SUPORTE TÉCNICO',
        normalizedName: 'suporte técnico',
        color: 'BLUE',
        sortOrder: 3,
      },
    });
  });

  it('filters active categories and preserves configured ordering', async () => {
    const context = service();
    await context.subject.listCategories(connectionId, false);
    expect(context.prisma.whatsAppAttendanceCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whatsAppConnectionId: connectionId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { normalizedName: 'asc' }],
      }),
    );
  });

  it('updates category fields only after validating the connection-scoped category', async () => {
    const context = service();
    await context.subject.updateCategory(connectionId, categoryId, {
      name: '  Dúvida / Orientação ',
      color: 'TEAL',
      isActive: false,
      sortOrder: 4,
    });
    expect(context.prisma.whatsAppAttendanceCategory.findFirst).toHaveBeenCalledWith({
      where: { id: categoryId, whatsAppConnectionId: connectionId },
    });
    expect(context.prisma.whatsAppAttendanceCategory.update).toHaveBeenCalledWith({
      where: { id: categoryId },
      data: {
        name: 'Dúvida / Orientação',
        normalizedName: 'dúvida / orientação',
        color: 'TEAL',
        isActive: false,
        sortOrder: 4,
      },
    });
  });

  it('rejects an empty category patch', async () => {
    const context = service();
    await expect(
      context.subject.updateCategory(connectionId, categoryId, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(context.prisma.whatsAppAttendanceCategory.update).not.toHaveBeenCalled();
  });

  it('deactivates a category already used by attendance history', async () => {
    const context = service();
    context.prisma.whatsAppAttendance.count.mockResolvedValue(1);
    await expect(context.subject.removeCategory(connectionId, categoryId)).resolves.toMatchObject({
      deleted: false,
      deactivated: true,
    });
    expect(context.prisma.whatsAppAttendanceCategory.update).toHaveBeenCalledWith({
      where: { id: categoryId },
      data: { isActive: false },
    });
    expect(context.prisma.whatsAppAttendanceCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes only an unused category after validating its connection', async () => {
    const context = service();
    await expect(context.subject.removeCategory(connectionId, categoryId)).resolves.toEqual({
      deleted: true,
      deactivated: false,
      id: categoryId,
    });
    expect(context.prisma.whatsAppAttendanceCategory.delete).toHaveBeenCalledWith({
      where: { id: categoryId },
    });
  });

  it('paginates attendance history and derives hasMore without loading it in conversation lists', async () => {
    const context = service();
    context.prisma.whatsAppAttendance.count.mockResolvedValue(12);
    await expect(
      context.subject.listConversationAttendances(conversationId, { page: 2, limit: 5 }),
    ).resolves.toMatchObject({
      items: [],
      pagination: { page: 2, limit: 5, total: 12, totalPages: 3, hasMore: true, nextPage: 3 },
    });
    expect(context.prisma.whatsAppAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId },
        skip: 5,
        take: 5,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('treats repeated resolution of a legacy or already resolved conversation as idempotent', async () => {
    const tx = transaction();
    tx.whatsAppConversation.findUnique.mockResolvedValue({
      id: conversationId,
      status: 'RESOLVED',
      whatsAppConnectionId: connectionId,
    });
    const context = service(tx);
    await expect(
      context.subject.resolveActiveAttendance(conversationId, 'user-id', {}),
    ).resolves.toMatchObject({ attendance: null, repeated: true });
    expect(tx.whatsAppAttendance.create).not.toHaveBeenCalled();
  });

  it('accepts an omitted resolution note and persists null', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({ id: attendanceId, status: 'PENDING' });
    const context = service(tx);
    await context.subject.resolveActiveAttendance(conversationId, 'user-id', { categoryId });
    const [updateInput] = tx.whatsAppAttendance.update.mock.calls[0] as unknown as [
      { data: Record<string, unknown> },
    ];
    expect(updateInput.data).toMatchObject({ resolutionNote: null, resolvedByUserId: 'user-id' });
  });

  it('rejects a resolution note longer than 4000 characters', async () => {
    const tx = transaction();
    tx.whatsAppAttendance.findFirst.mockResolvedValue({ id: attendanceId, status: 'PENDING' });
    const context = service(tx);
    await expect(
      context.subject.resolveActiveAttendance(conversationId, 'user-id', {
        categoryId,
        resolutionNote: 'x'.repeat(4001),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.whatsAppAttendance.update).not.toHaveBeenCalled();
  });

  it('locks the conversation before reading attendance state for each inbound', async () => {
    const context = service();
    await context.subject.recordInboundMessage(context.tx as never, {
      conversationId,
      connectionId,
      clientId: null,
      messageId,
      occurredAt: new Date(),
    });
    expect(context.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      context.tx.whatsAppMessage.findUnique.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
