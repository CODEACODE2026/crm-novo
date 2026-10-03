import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('WhatsApp conversation schema invariants', () => {
  const prisma = new PrismaClient();
  const created = {
    plans: new Set<string>(),
    clients: new Set<string>(),
    connections: new Set<string>(),
    conversations: new Set<string>(),
    messages: new Set<string>(),
    dispatches: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { id: { in: [...created.messages] } } });
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: [...created.conversations] } },
    });
    await prisma.messageDispatch.deleteMany({ where: { id: { in: [...created.dispatches] } } });
    await prisma.client.deleteMany({ where: { id: { in: [...created.clients] } } });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });

    created.plans.clear();
    created.clients.clear();
    created.connections.clear();
    created.conversations.clear();
    created.messages.clear();
    created.dispatches.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects duplicate conversations for the same connection and phone', async () => {
    const connection = await createConnection();
    await createConversation(connection.id, '5544999990001');

    await expect(createConversation(connection.id, '5544999990001')).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows the same phone in different connections', async () => {
    const firstConnection = await createConnection('Instancia A');
    const secondConnection = await createConnection('Instancia B');

    await expect(createConversation(firstConnection.id, '5544999990002')).resolves.toBeDefined();
    await expect(createConversation(secondConnection.id, '5544999990002')).resolves.toBeDefined();
  });

  it('rejects duplicate provider message ids for the same provider and connection', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990003');
    await createMessage(conversation.id, connection.id, { providerMessageId: 'provider-msg-1' });

    await expect(
      createMessage(conversation.id, connection.id, { providerMessageId: 'provider-msg-1' }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows multiple null provider message ids', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990004');

    await expect(createMessage(conversation.id, connection.id)).resolves.toBeDefined();
    await expect(createMessage(conversation.id, connection.id)).resolves.toBeDefined();
  });

  it('rejects duplicate request ids for the same connection', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990005');
    await createMessage(conversation.id, connection.id, { requestId: 'request-1' });

    await expect(
      createMessage(conversation.id, connection.id, { requestId: 'request-1' }),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('allows multiple null request ids', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990006');

    await expect(createMessage(conversation.id, connection.id)).resolves.toBeDefined();
    await expect(createMessage(conversation.id, connection.id)).resolves.toBeDefined();
  });

  it('sets conversation clientId to null when the client is deleted', async () => {
    const plan = await createPlan();
    const client = await createClient(plan.id);
    const connection = await createConnection();
    const conversation = await createConversation(connection.id, '5544999990007', {
      clientId: client.id,
    });

    await prisma.client.delete({ where: { id: client.id } });
    created.clients.delete(client.id);

    await expect(
      prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    ).resolves.toMatchObject({ clientId: null });
  });

  it('blocks deleting a WhatsApp connection with conversation history', async () => {
    const { connection } = await createConversationFixture('5544999990008');

    await expect(
      prisma.whatsAppConnection.delete({ where: { id: connection.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('blocks deleting a WhatsApp connection with conversation messages', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990012');
    await createMessage(conversation.id, connection.id);

    await expect(
      prisma.whatsAppConnection.delete({ where: { id: connection.id } }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('cascades messages when deleting a conversation', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990009');
    const message = await createMessage(conversation.id, connection.id);

    await prisma.whatsAppConversation.delete({ where: { id: conversation.id } });
    created.conversations.delete(conversation.id);

    await expect(
      prisma.whatsAppMessage.findUnique({ where: { id: message.id } }),
    ).resolves.toBeNull();
  });

  it('sets messageDispatchId to null when the dispatch is deleted', async () => {
    const { conversation, connection } = await createConversationFixture('5544999990010');
    const dispatch = await prisma.messageDispatch.create({
      data: {
        whatsAppConnectionId: connection.id,
        phone: '5544999990010',
        body: 'Mensagem operacional',
        requestId: unique('dispatch-request'),
      },
    });
    created.dispatches.add(dispatch.id);
    const message = await createMessage(conversation.id, connection.id, {
      messageDispatchId: dispatch.id,
    });

    await prisma.messageDispatch.delete({ where: { id: dispatch.id } });
    created.dispatches.delete(dispatch.id);

    await expect(
      prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: message.id } }),
    ).resolves.toMatchObject({
      messageDispatchId: null,
    });
  });

  it('compiles Prisma relation reads for conversations, messages, and dispatches', async () => {
    const plan = await createPlan();
    const client = await createClient(plan.id);
    const connection = await createConnection();
    const conversation = await createConversation(connection.id, '5544999990013', {
      clientId: client.id,
    });
    const dispatch = await prisma.messageDispatch.create({
      data: {
        whatsAppConnectionId: connection.id,
        phone: '5544999990013',
        body: 'Mensagem operacional',
        requestId: unique('dispatch-request'),
      },
    });
    created.dispatches.add(dispatch.id);
    await createMessage(conversation.id, connection.id, {
      messageDispatchId: dispatch.id,
      requestId: unique('message-request'),
    });

    await expect(
      prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: {
          client: { select: { id: true } },
          messages: { include: { messageDispatch: true, whatsAppConnection: true } },
          whatsAppConnection: { select: { id: true } },
        },
      }),
    ).resolves.toMatchObject({
      client: { id: client.id },
      messages: [
        {
          messageDispatchId: dispatch.id,
          whatsAppConnectionId: connection.id,
        },
      ],
      whatsAppConnection: { id: connection.id },
    });
  });

  async function createConversationFixture(phoneNormalized: string) {
    const connection = await createConnection();
    const conversation = await createConversation(connection.id, phoneNormalized);
    return { connection, conversation };
  }

  async function createPlan() {
    const plan = await prisma.plan.create({
      data: {
        name: unique('Plano CHAT1'),
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(50),
      },
    });
    created.plans.add(plan.id);
    return plan;
  }

  async function createClient(planId: string) {
    const client = await prisma.client.create({
      data: {
        name: unique('Cliente CHAT1'),
        phone: '(44) 99999-0011',
        phoneNormalized: uniquePhone(),
        reference: unique('CHAT1-CLIENT'),
        planId,
        recurringValue: new Prisma.Decimal(50),
        dueDate: new Date('2026-10-20T00:00:00.000Z'),
        billingAnchorDay: 20,
        billingNoticeDays: 5,
      },
    });
    created.clients.add(client.id);
    return client;
  }

  async function createConnection(name = 'CRM CHAT1') {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: unique(name),
        providerTokenEncrypted: unique('encrypted-token'),
      },
    });
    created.connections.add(connection.id);
    return connection;
  }

  async function createConversation(
    whatsAppConnectionId: string,
    phoneNormalized: string,
    overrides: Partial<Prisma.WhatsAppConversationUncheckedCreateInput> = {},
  ) {
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId,
        phone: phoneNormalized,
        phoneNormalized,
        ...overrides,
      },
    });
    created.conversations.add(conversation.id);
    return conversation;
  }

  async function createMessage(
    conversationId: string,
    whatsAppConnectionId: string,
    overrides: Partial<Prisma.WhatsAppMessageUncheckedCreateInput> = {},
  ) {
    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId,
        whatsAppConnectionId,
        direction: 'INBOUND',
        status: 'SENT',
        type: 'TEXT',
        text: 'Oi',
        ...overrides,
      },
    });
    created.messages.add(message.id);
    return message;
  }
});

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function uniquePhone() {
  return `55449${Math.floor(10000000 + Math.random() * 89999999)}`;
}
