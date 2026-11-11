import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WhatsAppService } from './whatsapp.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('WhatsApp conversation continuity on PostgreSQL 12.22', () => {
  const prisma = new PrismaClient();
  const created = {
    users: new Set<string>(),
    plans: new Set<string>(),
    clients: new Set<string>(),
    connections: new Set<string>(),
    conversations: new Set<string>(),
    messages: new Set<string>(),
  };

  beforeAll(async () => prisma.$connect());

  afterEach(async () => {
    const conversationIds = [...created.conversations];
    await prisma.whatsAppConversationContinuity.deleteMany({
      where: {
        OR: [
          { predecessorConversationId: { in: conversationIds } },
          { successorConversationId: { in: conversationIds } },
        ],
      },
    });
    await prisma.whatsAppAttendance.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await prisma.whatsAppMessage.deleteMany({ where: { id: { in: [...created.messages] } } });
    await prisma.whatsAppConversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.client.deleteMany({ where: { id: { in: [...created.clients] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
    Object.values(created).forEach((ids) => ids.clear());
  });

  afterAll(async () => prisma.$disconnect());

  function serviceFactory() {
    const sendText = vi.fn().mockResolvedValue({
      providerMessageId: `hml-provider-${randomUUID()}`,
      sentAt: new Date('2026-11-11T19:00:00.000Z'),
    });
    return {
      sendText,
      service: new WhatsAppService(
        prisma as never,
        { sendText } as never,
        undefined as never,
        undefined as never,
        { decrypt: () => 'homologation-token' } as never,
        { get: () => undefined } as never,
        undefined as never,
        undefined as never,
        undefined as never,
      ),
    };
  }

  async function createActor() {
    const user = await prisma.user.create({
      data: {
        name: 'HML Continuity Actor',
        email: `hml-continuity-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-password-hash',
      },
    });
    created.users.add(user.id);
    return user;
  }

  async function createClient(phone: string) {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `HML CONTINUITY ${suffix}`,
        durationMonths: 1,
        defaultValue: '30.00',
      },
    });
    created.plans.add(plan.id);
    const client = await prisma.client.create({
      data: {
        name: `Cliente HML ${suffix.slice(0, 8)}`,
        phone,
        phoneNormalized: phone,
        phoneE164: `+${phone}`,
        reference: `HML-CONT-${suffix}`,
        planId: plan.id,
        recurringValue: '30.00',
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
        billingAnchorDay: 20,
        billingNoticeDays: 3,
      },
    });
    created.clients.add(client.id);
    return client;
  }

  async function createConnection(name: string, active = false) {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name,
        providerUserId: `hml-user-${randomUUID()}`,
        providerInstanceName: `hml-instance-${randomUUID()}`,
        providerTokenEncrypted: 'hml-encrypted-token',
        status: active ? 'CONNECTED' : 'ERROR',
        connected: active,
        loggedIn: active,
        webhookConfigured: active,
      },
    });
    created.connections.add(connection.id);
    return connection;
  }

  async function createConversation(
    connectionId: string,
    clientId: string,
    phone: string,
    createdAt: Date,
  ) {
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connectionId,
        clientId,
        phone,
        phoneNormalized: phone,
        phoneE164: `+${phone}`,
        contactName: 'Contato HML',
        createdAt,
      },
    });
    created.conversations.add(conversation.id);
    return conversation;
  }

  async function createMessage(
    conversationId: string,
    connectionId: string,
    text: string,
    createdAt: Date,
  ) {
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId,
        whatsAppConnectionId: connectionId,
        providerMessageId: `hml-message-${randomUUID()}`,
        direction: 'INBOUND',
        type: 'TEXT',
        text,
        status: 'DELIVERED',
        createdAt,
      },
    });
    created.messages.add(message.id);
    return message;
  }

  it('reconciles the three sanitized pairs, stays idempotent and uses only the successor for new sends', async () => {
    const actor = await createActor();
    const predecessorConnection = await createConnection('HML antiga');
    const successorConnection = await createConnection('HML nova', true);
    const pairs = [];

    for (let index = 0; index < 3; index += 1) {
      const phone = `55449999000${index}`;
      const client = await createClient(phone);
      const predecessor = await createConversation(
        predecessorConnection.id,
        client.id,
        phone,
        new Date(`2026-11-0${index + 1}T10:00:00.000Z`),
      );
      const successor = await createConversation(
        successorConnection.id,
        client.id,
        phone,
        new Date(`2026-11-1${index + 1}T10:00:00.000Z`),
      );
      const historical = await createMessage(
        predecessor.id,
        predecessorConnection.id,
        `historico sanitizado ${index}`,
        new Date(`2026-11-0${index + 1}T11:00:00.000Z`),
      );
      const current = await createMessage(
        successor.id,
        successorConnection.id,
        `mensagem atual ${index}`,
        new Date(`2026-11-1${index + 1}T11:00:00.000Z`),
      );
      pairs.push({ client, predecessor, successor, historical, current });
    }

    const { service, sendText } = serviceFactory();
    const dryRun = await service.reconcileConversationContinuities(
      { successorConnectionId: successorConnection.id, apply: false },
      actor.id,
    );
    expect(dryRun.summary).toMatchObject({ scanned: 3, eligible: 3, linked: 0 });
    expect(await prisma.whatsAppConversationContinuity.count()).toBe(0);

    const applied = await service.reconcileConversationContinuities(
      { successorConnectionId: successorConnection.id, apply: true },
      actor.id,
    );
    expect(applied.summary).toMatchObject({ scanned: 3, eligible: 0, linked: 3 });

    const repeated = await service.reconcileConversationContinuities(
      { successorConnectionId: successorConnection.id, apply: true },
      actor.id,
    );
    expect(repeated.summary).toMatchObject({ scanned: 3, linked: 0, alreadyLinked: 3 });
    expect(await prisma.whatsAppConversationContinuity.count()).toBe(3);

    const firstPair = pairs[0];
    if (!firstPair) throw new Error('Missing sanitized pair fixture.');
    const timeline = await service.listConversationMessages(firstPair.successor.id, {
      page: 1,
      limit: 20,
    });
    expect(timeline.items.map((item) => [item.id, item.isHistorical])).toEqual([
      [firstPair.historical.id, true],
      [firstPair.current.id, false],
    ]);

    const search = await service.searchConversationMessages({
      q: 'historico sanitizado',
      conversationId: firstPair.successor.id,
      page: 1,
      limit: 20,
    });
    expect(search.items[0]).toMatchObject({
      message: { id: firstPair.historical.id, isHistorical: true },
      conversation: { id: firstPair.successor.id },
    });

    const sent = await service.sendConversationTextMessage(firstPair.successor.id, {
      body: 'nova mensagem pela sucessora',
      requestId: randomUUID(),
    });
    expect(sent).toMatchObject({ conversationId: firstPair.successor.id, status: 'SENT' });
    expect(sendText).toHaveBeenCalledWith(
      'homologation-token',
      expect.objectContaining({ body: 'nova mensagem pela sucessora' }),
    );
    const stored = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: sent.id } });
    created.messages.add(stored.id);
    expect(stored).toMatchObject({
      conversationId: firstPair.successor.id,
      whatsAppConnectionId: successorConnection.id,
    });
  });

  it('blocks ambiguity, divergent clients and predecessors with active attendance', async () => {
    const actor = await createActor();
    const successorConnection = await createConnection('HML bloqueios nova', true);
    const oldA = await createConnection('HML bloqueios antiga A');
    const oldB = await createConnection('HML bloqueios antiga B');

    const ambiguousClient = await createClient('554499991001');
    const ambiguousSuccessor = await createConversation(
      successorConnection.id,
      ambiguousClient.id,
      ambiguousClient.phoneNormalized,
      new Date('2026-11-11T10:00:00.000Z'),
    );
    await createConversation(
      oldA.id,
      ambiguousClient.id,
      ambiguousClient.phoneNormalized,
      new Date('2026-11-09T10:00:00.000Z'),
    );
    await createConversation(
      oldB.id,
      ambiguousClient.id,
      ambiguousClient.phoneNormalized,
      new Date('2026-11-10T10:00:00.000Z'),
    );

    const successorClient = await createClient('554499991002');
    const differentClient = await createClient('554499991002');
    const divergentSuccessor = await createConversation(
      successorConnection.id,
      successorClient.id,
      successorClient.phoneNormalized,
      new Date('2026-11-11T11:00:00.000Z'),
    );
    await createConversation(
      oldA.id,
      differentClient.id,
      successorClient.phoneNormalized,
      new Date('2026-11-10T11:00:00.000Z'),
    );

    const attendanceClient = await createClient('554499991003');
    const attendanceSuccessor = await createConversation(
      successorConnection.id,
      attendanceClient.id,
      attendanceClient.phoneNormalized,
      new Date('2026-11-11T12:00:00.000Z'),
    );
    const attendancePredecessor = await createConversation(
      oldA.id,
      attendanceClient.id,
      attendanceClient.phoneNormalized,
      new Date('2026-11-10T12:00:00.000Z'),
    );
    const openingMessage = await createMessage(
      attendancePredecessor.id,
      oldA.id,
      'abre atendimento',
      new Date('2026-11-10T12:01:00.000Z'),
    );
    await prisma.whatsAppAttendance.create({
      data: {
        conversationId: attendancePredecessor.id,
        whatsAppConnectionId: oldA.id,
        clientId: attendanceClient.id,
        status: 'IN_PROGRESS',
        openedAt: new Date('2026-11-10T12:01:00.000Z'),
        openedByMessageId: openingMessage.id,
      },
    });

    const { service } = serviceFactory();
    const result = await service.reconcileConversationContinuities(
      { successorConnectionId: successorConnection.id, apply: true },
      actor.id,
    );
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          successorConversationId: ambiguousSuccessor.id,
          status: 'AMBIGUOUS',
        }),
        expect.objectContaining({
          successorConversationId: divergentSuccessor.id,
          status: 'NO_MATCH',
        }),
        expect.objectContaining({
          successorConversationId: attendanceSuccessor.id,
          status: 'NO_MATCH',
        }),
      ]),
    );
    expect(await prisma.whatsAppConversationContinuity.count()).toBe(0);
  });

  it('detects cycles and allows exactly 32 predecessor links before blocking the 33rd', async () => {
    const client = await createClient('554499991004');
    const { service } = serviceFactory();

    const cycleConnections = await Promise.all([
      createConnection('HML ciclo A'),
      createConnection('HML ciclo B'),
    ]);
    const cycleA = await createConversation(
      cycleConnections[0].id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-10T10:00:00.000Z'),
    );
    const cycleB = await createConversation(
      cycleConnections[1].id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-11T10:00:00.000Z'),
    );
    await prisma.whatsAppConversationContinuity.createMany({
      data: [
        { predecessorConversationId: cycleA.id, successorConversationId: cycleB.id },
        { predecessorConversationId: cycleB.id, successorConversationId: cycleA.id },
      ],
    });
    await expect(service.listConversationMessages(cycleA.id, {})).rejects.toThrow(
      'Ciclo detectado',
    );
    await prisma.whatsAppConversationContinuity.deleteMany({
      where: {
        OR: [{ predecessorConversationId: cycleA.id }, { predecessorConversationId: cycleB.id }],
      },
    });

    const chainConnections = [];
    const chainConversations = [];
    for (let index = 0; index < 34; index += 1) {
      const connection = await createConnection(`HML cadeia ${index}`);
      chainConnections.push(connection);
      chainConversations.push(
        await createConversation(
          connection.id,
          client.id,
          client.phoneNormalized,
          new Date(Date.UTC(2026, 9, index + 1)),
        ),
      );
    }
    for (let index = 1; index <= 32; index += 1) {
      await prisma.whatsAppConversationContinuity.create({
        data: {
          predecessorConversationId: chainConversations[index - 1]!.id,
          successorConversationId: chainConversations[index]!.id,
        },
      });
    }
    await expect(
      service.listConversationMessages(chainConversations[32]!.id, { page: 1, limit: 20 }),
    ).resolves.toMatchObject({ items: [] });

    await prisma.whatsAppConversationContinuity.create({
      data: {
        predecessorConversationId: chainConversations[32]!.id,
        successorConversationId: chainConversations[33]!.id,
      },
    });
    await expect(service.listConversationMessages(chainConversations[33]!.id, {})).rejects.toThrow(
      ConflictException,
    );
  });
});
