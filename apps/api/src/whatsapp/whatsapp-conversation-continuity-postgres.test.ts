import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WhatsAppPreparedSuccessorGuardService } from './whatsapp-prepared-successor-guard.service';
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
    dispatches: new Set<string>(),
  };

  beforeAll(async () => prisma.$connect());

  afterEach(async () => {
    const conversationIds = [...created.conversations];
    await prisma.whatsAppConversationSuccessorPreparation.deleteMany({
      where: { predecessorConversationId: { in: conversationIds } },
    });
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
    await prisma.messageDispatch.deleteMany({ where: { id: { in: [...created.dispatches] } } });
    await prisma.whatsAppMessage.deleteMany({ where: { id: { in: [...created.messages] } } });
    await prisma.whatsAppConversation.deleteMany({ where: { id: { in: conversationIds } } });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: [...created.clients] } } });
    await prisma.client.deleteMany({ where: { id: { in: [...created.clients] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
    Object.values(created).forEach((ids) => ids.clear());
  });

  it('prepares an empty hidden successor idempotently and activates only after confirmed outbound', async () => {
    const actor = await createActor();
    const client = await createClient('554499992001');
    const predecessorConnection = await createConnection('HML prepare antiga');
    const successorConnection = await createConnection('HML prepare nova', true);
    const predecessor = await createConversation(
      predecessorConnection.id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-09T10:00:00.000Z'),
    );
    const historical = await createMessage(
      predecessor.id,
      predecessorConnection.id,
      'historico preservado prepare-only',
      new Date('2026-11-09T11:00:00.000Z'),
    );
    const { service, sendText } = serviceFactory();

    const dryRun = await service.prepareConversationSuccessors(
      {
        targetConnectionId: successorConnection.id,
        batchKey: 'continuity1-hml-pilot-5',
        predecessorConversationIds: [predecessor.id],
        apply: false,
      },
      actor.id,
    );
    expect(dryRun.summary).toMatchObject({ eligible: 1, prepared: 0 });
    expect(await prisma.whatsAppConversationSuccessorPreparation.count()).toBe(0);

    const applied = await service.prepareConversationSuccessors(
      {
        targetConnectionId: successorConnection.id,
        batchKey: 'continuity1-hml-pilot-5',
        predecessorConversationIds: [predecessor.id],
        apply: true,
      },
      actor.id,
    );
    expect(applied.summary).toMatchObject({ prepared: 1 });
    const preparation = await prisma.whatsAppConversationSuccessorPreparation.findUniqueOrThrow({
      where: { predecessorConversationId: predecessor.id },
    });
    if (!preparation.successorConversationId) throw new Error('Missing prepared successor.');
    created.conversations.add(preparation.successorConversationId);
    expect(preparation.status).toBe('PREPARED');
    expect(
      await prisma.whatsAppMessage.count({
        where: { conversationId: preparation.successorConversationId },
      }),
    ).toBe(0);
    expect(
      await prisma.whatsAppAttendance.count({
        where: { conversationId: preparation.successorConversationId },
      }),
    ).toBe(0);
    expect(
      await prisma.whatsAppConversationContinuity.count({
        where: { predecessorConversationId: predecessor.id },
      }),
    ).toBe(0);

    const repeated = await service.prepareConversationSuccessors(
      {
        targetConnectionId: successorConnection.id,
        batchKey: 'continuity1-hml-pilot-5',
        predecessorConversationIds: [predecessor.id],
        apply: true,
      },
      actor.id,
    );
    expect(repeated.summary).toMatchObject({ alreadyPrepared: 1, prepared: 0 });

    const listedBefore = await service.listConversations({
      attendanceStatus: 'ALL' as never,
    });
    expect(listedBefore.items.map((item) => item.id)).toContain(predecessor.id);
    expect(listedBefore.items.map((item) => item.id)).not.toContain(
      preparation.successorConversationId,
    );

    const automatedOutboundGuard = new WhatsAppPreparedSuccessorGuardService(prisma as never);
    const automatedOutboundError: unknown = await automatedOutboundGuard
      .assertAutomatedOutboundAllowed(successorConnection.id, client.phoneNormalized)
      .catch((caught: unknown) => caught);
    expect(automatedOutboundError).toBeInstanceOf(ConflictException);
    if (!(automatedOutboundError instanceof ConflictException)) throw automatedOutboundError;
    expect(automatedOutboundError.getResponse()).toMatchObject({
      code: 'WHATSAPP_PREPARED_SUCCESSOR_AUTOMATION_BLOCKED',
    });

    await expect(
      service.sendConversationTextMessage(preparation.successorConversationId, {
        body: 'sem confirmacao',
        requestId: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sendText).not.toHaveBeenCalled();

    const sent = await service.sendConversationTextMessage(predecessor.id, {
      body: 'continuar na conexao ativa',
      requestId: randomUUID(),
      continueOnPreparedSuccessor: true,
    });
    created.messages.add(sent.id);
    expect(sent).toMatchObject({
      conversationId: preparation.successorConversationId,
      status: 'SENT',
    });
    expect(sendText).toHaveBeenCalledOnce();

    await expect(
      prisma.whatsAppConversationSuccessorPreparation.findUniqueOrThrow({
        where: { id: preparation.id },
      }),
    ).resolves.toMatchObject({ status: 'ACTIVATED', activationTrigger: 'OUTBOUND_CONFIRMED' });
    await expect(
      prisma.whatsAppConversationContinuity.findUniqueOrThrow({
        where: { predecessorConversationId: predecessor.id },
      }),
    ).resolves.toMatchObject({ successorConversationId: preparation.successorConversationId });
    await expect(
      prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: historical.id } }),
    ).resolves.toMatchObject({ conversationId: predecessor.id });
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
        {
          get: (name: string) =>
            name === 'WHATSAPP_SUCCESSOR_PREPARATION_APPLY_ENABLED' ? 'true' : undefined,
        } as never,
        undefined as never,
        undefined as never,
        undefined as never,
        new WhatsAppPreparedSuccessorGuardService(prisma as never),
        undefined,
        undefined,
        undefined,
        undefined,
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

  async function createConnection(
    name: string,
    active = false,
    phone: string | null = '5544999990000',
  ) {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name,
        providerUserId: `hml-user-${randomUUID()}`,
        providerInstanceName: `hml-instance-${randomUUID()}`,
        providerTokenEncrypted: 'hml-encrypted-token',
        phone,
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
    clientId: string | null,
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

  it('cancels a prepared empty successor without violating the persisted state constraint', async () => {
    const actor = await createActor();
    const client = await createClient('554499992002');
    const predecessorConnection = await createConnection('HML cancel antiga');
    const successorConnection = await createConnection('HML cancel nova', true);
    const predecessor = await createConversation(
      predecessorConnection.id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-09T12:00:00.000Z'),
    );
    const { service } = serviceFactory();

    await service.prepareConversationSuccessors(
      {
        targetConnectionId: successorConnection.id,
        batchKey: 'continuity1-hml-cancel',
        predecessorConversationIds: [predecessor.id],
        apply: true,
      },
      actor.id,
    );
    const preparation = await prisma.whatsAppConversationSuccessorPreparation.findUniqueOrThrow({
      where: { predecessorConversationId: predecessor.id },
    });
    if (!preparation.successorConversationId) throw new Error('Missing prepared successor.');
    const successorId = preparation.successorConversationId;
    created.conversations.add(successorId);

    const cancelled = await service.cancelConversationSuccessorPreparation(
      preparation.id,
      'piloto cancelado antes da ativacao',
    );

    expect(cancelled).toMatchObject({
      id: preparation.id,
      status: 'CANCELLED',
      successorConversationId: null,
    });
    expect(await prisma.whatsAppConversation.findUnique({ where: { id: successorId } })).toBeNull();
    expect(
      await prisma.whatsAppConversationSuccessorPreparation.findUniqueOrThrow({
        where: { id: preparation.id },
      }),
    ).toMatchObject({ status: 'CANCELLED', successorConversationId: null });
  });

  it('blocks prepare-only while an outbound automation dispatch is active', async () => {
    const actor = await createActor();
    const client = await createClient('554499992003');
    const predecessorConnection = await createConnection('HML dispatch antiga');
    const successorConnection = await createConnection('HML dispatch nova', true);
    const predecessor = await createConversation(
      predecessorConnection.id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-09T13:00:00.000Z'),
    );
    const dispatch = await prisma.messageDispatch.create({
      data: {
        clientId: client.id,
        whatsAppConnectionId: successorConnection.id,
        phone: client.phoneNormalized,
        body: 'automacao em processamento',
        origin: 'BILLING',
        status: 'PROCESSING',
        requestId: `hml-dispatch-${randomUUID()}`,
      },
    });
    created.dispatches.add(dispatch.id);
    const { service, sendText } = serviceFactory();

    const dryRun = await service.prepareConversationSuccessors(
      {
        targetConnectionId: successorConnection.id,
        batchKey: 'continuity1-hml-active-dispatch',
        predecessorConversationIds: [predecessor.id],
        apply: false,
      },
      actor.id,
    );

    expect(dryRun.results).toEqual([
      expect.objectContaining({
        predecessorConversationId: predecessor.id,
        status: 'CONFLICT',
        reason: 'ACTIVE_OUTBOUND_DISPATCH',
      }),
    ]);
    expect(dryRun.summary).toMatchObject({ prepared: 0, conflicts: 1 });
    const applyError: unknown = await service
      .prepareConversationSuccessors(
        {
          targetConnectionId: successorConnection.id,
          batchKey: 'continuity1-hml-active-dispatch',
          predecessorConversationIds: [predecessor.id],
          apply: true,
        },
        actor.id,
      )
      .catch((caught: unknown) => caught);
    expect(applyError).toBeInstanceOf(ConflictException);
    if (!(applyError instanceof ConflictException)) throw applyError;
    expect(applyError.getResponse()).toMatchObject({ code: 'WHATSAPP_PREPARE_BATCH_BLOCKED' });
    expect(
      await prisma.whatsAppConversationSuccessorPreparation.count({
        where: { predecessorConversationId: predecessor.id },
      }),
    ).toBe(0);
    expect(sendText).not.toHaveBeenCalled();
  });

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

  it('requires the same valid normalized business identity and reports every blocked reason', async () => {
    const actor = await createActor();
    const { service } = serviceFactory();

    const sameClient = await createClient('554499991101');
    const sameOldConnection = await createConnection(
      'HML identidade formatada antiga',
      false,
      '+55 44 99999-0000',
    );
    const sameNewConnection = await createConnection(
      'HML identidade formatada nova',
      true,
      '5544999990000',
    );
    await createConversation(
      sameOldConnection.id,
      sameClient.id,
      sameClient.phoneNormalized,
      new Date('2026-11-09T10:00:00.000Z'),
    );
    const sameSuccessor = await createConversation(
      sameNewConnection.id,
      sameClient.id,
      sameClient.phoneNormalized,
      new Date('2026-11-10T10:00:00.000Z'),
    );
    const sameResult = await service.reconcileConversationContinuities(
      { successorConnectionId: sameNewConnection.id, apply: true },
      actor.id,
    );
    expect(sameResult.results).toEqual([
      expect.objectContaining({
        successorConversationId: sameSuccessor.id,
        status: 'LINKED',
        reason: 'LINKED',
      }),
    ]);

    const differentClient = await createClient('554499991102');
    const differentOldConnection = await createConnection(
      'HML identidade divergente antiga',
      false,
      '5544999990000',
    );
    const differentNewConnection = await createConnection(
      'HML identidade divergente nova',
      true,
      '5544888880000',
    );
    const differentPredecessor = await createConversation(
      differentOldConnection.id,
      differentClient.id,
      differentClient.phoneNormalized,
      new Date('2026-11-09T11:00:00.000Z'),
    );
    const differentSuccessor = await createConversation(
      differentNewConnection.id,
      differentClient.id,
      differentClient.phoneNormalized,
      new Date('2026-11-10T11:00:00.000Z'),
    );
    const differentResult = await service.reconcileConversationContinuities(
      { successorConnectionId: differentNewConnection.id, apply: true },
      actor.id,
    );
    expect(differentResult.results).toEqual([
      expect.objectContaining({
        successorConversationId: differentSuccessor.id,
        predecessorConversationId: differentPredecessor.id,
        status: 'NO_MATCH',
        reason: 'BUSINESS_IDENTITY_MISMATCH',
      }),
    ]);

    for (const [label, phone] of [
      ['ausente', null],
      ['invalida', 'not-a-phone'],
    ] as const) {
      const blockedClient = await createClient(
        label === 'ausente' ? '554499991103' : '554499991104',
      );
      const blockedOldConnection = await createConnection(
        `HML identidade ${label} antiga`,
        false,
        '5544999990000',
      );
      const blockedNewConnection = await createConnection(
        `HML identidade ${label} nova`,
        true,
        phone,
      );
      await createConversation(
        blockedOldConnection.id,
        blockedClient.id,
        blockedClient.phoneNormalized,
        new Date('2026-11-09T12:00:00.000Z'),
      );
      const blockedSuccessor = await createConversation(
        blockedNewConnection.id,
        blockedClient.id,
        blockedClient.phoneNormalized,
        new Date('2026-11-10T12:00:00.000Z'),
      );
      const blockedResult = await service.reconcileConversationContinuities(
        { successorConnectionId: blockedNewConnection.id, apply: true },
        actor.id,
      );
      expect(blockedResult.results).toEqual([
        expect.objectContaining({
          successorConversationId: blockedSuccessor.id,
          predecessorConversationId: null,
          status: 'NO_MATCH',
          reason: 'SUCCESSOR_BUSINESS_IDENTITY_MISSING_OR_INVALID',
        }),
      ]);
    }

    for (const [label, phone] of [
      ['ausente', null],
      ['invalida', 'not-a-phone'],
    ] as const) {
      const blockedClient = await createClient(
        label === 'ausente' ? '554499991105' : '554499991106',
      );
      const blockedOldConnection = await createConnection(
        `HML identidade predecessora ${label}`,
        false,
        phone,
      );
      const blockedNewConnection = await createConnection(
        `HML identidade sucessora valida ${label}`,
        true,
        '5544999990000',
      );
      const blockedPredecessor = await createConversation(
        blockedOldConnection.id,
        blockedClient.id,
        blockedClient.phoneNormalized,
        new Date('2026-11-09T13:00:00.000Z'),
      );
      const blockedSuccessor = await createConversation(
        blockedNewConnection.id,
        blockedClient.id,
        blockedClient.phoneNormalized,
        new Date('2026-11-10T13:00:00.000Z'),
      );
      const blockedResult = await service.reconcileConversationContinuities(
        { successorConnectionId: blockedNewConnection.id, apply: true },
        actor.id,
      );
      expect(blockedResult.results).toEqual([
        expect.objectContaining({
          successorConversationId: blockedSuccessor.id,
          predecessorConversationId: blockedPredecessor.id,
          status: 'NO_MATCH',
          reason: 'PREDECESSOR_BUSINESS_IDENTITY_MISSING_OR_INVALID',
        }),
      ]);
    }
  });

  it('reconciles a preexisting successor immediately after a safe client link', async () => {
    const actor = await createActor();
    const client = await createClient('554499991105');
    const predecessorConnection = await createConnection('HML link tardio antiga');
    const successorConnection = await createConnection('HML link tardio nova', true);
    const predecessor = await createConversation(
      predecessorConnection.id,
      client.id,
      client.phoneNormalized,
      new Date('2026-11-09T13:00:00.000Z'),
    );
    const successor = await createConversation(
      successorConnection.id,
      null,
      client.phoneNormalized,
      new Date('2026-11-10T13:00:00.000Z'),
    );
    const { service } = serviceFactory();

    await service.linkConversationClient(successor.id, { clientId: client.id }, actor.id);

    await expect(
      prisma.whatsAppConversationContinuity.findUnique({
        where: { successorConversationId: successor.id },
      }),
    ).resolves.toMatchObject({
      predecessorConversationId: predecessor.id,
      successorConversationId: successor.id,
      createdByUserId: actor.id,
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
