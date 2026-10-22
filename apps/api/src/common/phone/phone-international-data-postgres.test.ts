import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('international phone identity persistence', () => {
  const prisma = new PrismaClient();
  const created = {
    plans: new Set<string>(),
    clients: new Set<string>(),
    clientReferences: new Set<string>(),
    connections: new Set<string>(),
    conversations: new Set<string>(),
    pendingContacts: new Set<string>(),
    dispatches: new Set<string>(),
    receivables: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.whatsAppPendingContact.deleteMany({
      where: { id: { in: [...created.pendingContacts] } },
    });
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: [...created.conversations] } },
    });
    await prisma.messageDispatch.deleteMany({
      where: { id: { in: [...created.dispatches] } },
    });
    await prisma.receivable.deleteMany({ where: { id: { in: [...created.receivables] } } });
    await prisma.clientReference.deleteMany({
      where: { id: { in: [...created.clientReferences] } },
    });
    await prisma.client.deleteMany({ where: { id: { in: [...created.clients] } } });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });

    for (const ids of Object.values(created)) ids.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('preserves legacy client fields and permits a nullable canonical identity', async () => {
    const plan = await createPlan();
    const phone = '(44) 99999-1010';
    const phoneNormalized = '5544999991010';
    const client = await createClient(plan.id, { phone, phoneNormalized });

    expect(client).toMatchObject({ phone, phoneNormalized, phoneE164: null });

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { phoneE164: '+14076390665' },
    });

    expect(updated).toMatchObject({
      phone,
      phoneNormalized,
      phoneE164: '+14076390665',
    });

    await expect(
      prisma.client.update({
        where: { id: client.id },
        data: { phoneE164: '+5511999991234' },
      }),
    ).resolves.toMatchObject({ phoneE164: '+5511999991234' });
  });

  it('rejects malformed canonical identities at the database boundary', async () => {
    const plan = await createPlan();

    await expect(createClient(plan.id, { phoneE164: '5511999999999' })).rejects.toBeDefined();
    await expect(createClient(plan.id, { phoneE164: '+0123' })).rejects.toBeDefined();
    await expect(createClient(plan.id, { phoneE164: '+1234567890123456' })).rejects.toBeDefined();
  });

  it('enforces conversation canonical uniqueness per connection while allowing legacy nulls', async () => {
    const firstConnection = await createConnection();
    const secondConnection = await createConnection();
    const canonical = '+351912345678';

    await createConversation(firstConnection.id, { phoneE164: canonical });
    await expect(
      createConversation(firstConnection.id, { phoneE164: canonical }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      createConversation(secondConnection.id, { phoneE164: canonical }),
    ).resolves.toBeDefined();
    await expect(createConversation(firstConnection.id)).resolves.toBeDefined();
    await expect(createConversation(firstConnection.id)).resolves.toBeDefined();
  });

  it('enforces pending-contact canonical uniqueness per connection', async () => {
    const firstConnection = await createConnection();
    const secondConnection = await createConnection();
    const canonical = '+447911123456';

    await createPendingContact(firstConnection.id, { phoneE164: canonical });
    await expect(
      createPendingContact(firstConnection.id, { phoneE164: canonical }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      createPendingContact(secondConnection.id, { phoneE164: canonical }),
    ).resolves.toBeDefined();
    await expect(createPendingContact(firstConnection.id)).resolves.toBeDefined();
    await expect(createPendingContact(firstConnection.id)).resolves.toBeDefined();
  });

  it('does not merge clients that share a canonical phone', async () => {
    const plan = await createPlan();
    const canonical = '+14076390665';
    const first = await createClient(plan.id, { phoneE164: canonical });
    const second = await createClient(plan.id, { phoneE164: canonical });

    expect(first.id).not.toBe(second.id);
    await expect(
      prisma.client.count({ where: { id: { in: [first.id, second.id] }, phoneE164: canonical } }),
    ).resolves.toBe(2);
  });

  it('keeps financial and dispatch snapshots unchanged when canonical identity changes', async () => {
    const plan = await createPlan();
    const client = await createClient(plan.id);
    const clientReference = await prisma.clientReference.create({
      data: {
        clientId: client.id,
        reference: unique('PHONE-DATA1-CLIENT-REF'),
        planId: plan.id,
        recurringValue: new Prisma.Decimal(50),
        dueDate: new Date('2026-10-21T00:00:00.000Z'),
        billingAnchorDay: 21,
        billingNoticeDays: 5,
      },
    });
    created.clientReferences.add(clientReference.id);
    const dispatchPhone = '5544999992020';
    const payerPhone = '(44) 99999-2020';
    const payerPhoneNormalized = '5544999992020';
    const dispatch = await prisma.messageDispatch.create({
      data: {
        clientId: client.id,
        clientReferenceId: clientReference.id,
        phone: dispatchPhone,
        body: 'Snapshot de teste DATA1',
        requestId: unique('phone-data-dispatch'),
      },
    });
    created.dispatches.add(dispatch.id);
    const receivable = await prisma.receivable.create({
      data: {
        clientId: client.id,
        clientReferenceId: clientReference.id,
        description: 'Snapshot de teste DATA1',
        amount: new Prisma.Decimal(25),
        dueDate: new Date('2026-10-21T00:00:00.000Z'),
        payerPhone,
        payerPhoneNormalized,
      },
    });
    created.receivables.add(receivable.id);

    await prisma.client.update({
      where: { id: client.id },
      data: { phoneE164: '+14076390665' },
    });

    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: dispatch.id } }),
    ).resolves.toMatchObject({ phone: dispatchPhone });
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } }),
    ).resolves.toMatchObject({ payerPhone, payerPhoneNormalized });
  });

  it('rolls back canonical writes without changing legacy identity', async () => {
    const plan = await createPlan();
    const client = await createClient(plan.id);

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.client.update({
          where: { id: client.id },
          data: { phoneE164: '+14076390665' },
        });
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({
      phone: client.phone,
      phoneNormalized: client.phoneNormalized,
      phoneE164: null,
    });
  });

  it('rolls back additive phone identity DDL when a transaction fails', async () => {
    const schemaName = `phone_data1_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);

    try {
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`
            CREATE TABLE "${schemaName}"."identity_fixture" (
              "id" uuid PRIMARY KEY,
              "connectionId" uuid NOT NULL
            )
          `);
          await tx.$executeRawUnsafe(`
            ALTER TABLE "${schemaName}"."identity_fixture"
            ADD COLUMN "phoneE164" varchar(16),
            ADD CONSTRAINT "phone_e164_format_check"
              CHECK ("phoneE164" IS NULL OR "phoneE164" ~ '^\\+[1-9][0-9]{1,14}$')
          `);
          await tx.$executeRawUnsafe(`
            CREATE UNIQUE INDEX "identity_connection_phone_e164_unique"
            ON "${schemaName}"."identity_fixture"("connectionId", "phoneE164")
            WHERE "phoneE164" IS NOT NULL
          `);
          throw new Error('forced DDL rollback');
        }),
      ).rejects.toThrow('forced DDL rollback');

      const [result] = await prisma.$queryRawUnsafe<Array<{ relation: string | null }>>(
        `SELECT to_regclass('${schemaName}.identity_fixture')::text AS relation`,
      );
      expect(result?.relation).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP SCHEMA "${schemaName}"`);
    }
  });

  async function createPlan() {
    const plan = await prisma.plan.create({
      data: {
        name: unique('PHONE-DATA1-PLAN'),
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(50),
      },
    });
    created.plans.add(plan.id);
    return plan;
  }

  async function createClient(
    planId: string,
    overrides: Partial<Prisma.ClientUncheckedCreateInput> = {},
  ) {
    const client = await prisma.client.create({
      data: {
        name: unique('PHONE-DATA1-CLIENT'),
        phone: uniquePhone(),
        phoneNormalized: uniquePhone(),
        reference: unique('PHONE-DATA1-REF'),
        planId,
        recurringValue: new Prisma.Decimal(50),
        dueDate: new Date('2026-10-21T00:00:00.000Z'),
        billingAnchorDay: 21,
        billingNoticeDays: 5,
        ...overrides,
      },
    });
    created.clients.add(client.id);
    return client;
  }

  async function createConnection() {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: unique('PHONE-DATA1-CONNECTION'),
        providerTokenEncrypted: unique('encrypted-token'),
      },
    });
    created.connections.add(connection.id);
    return connection;
  }

  async function createConversation(
    whatsAppConnectionId: string,
    overrides: Partial<Prisma.WhatsAppConversationUncheckedCreateInput> = {},
  ) {
    const phone = uniquePhone();
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId,
        phone,
        phoneNormalized: phone,
        ...overrides,
      },
    });
    created.conversations.add(conversation.id);
    return conversation;
  }

  async function createPendingContact(
    whatsAppConnectionId: string,
    overrides: Partial<Prisma.WhatsAppPendingContactUncheckedCreateInput> = {},
  ) {
    const phone = uniquePhone();
    const now = new Date();
    const pendingContact = await prisma.whatsAppPendingContact.create({
      data: {
        whatsAppConnectionId,
        phone,
        phoneNormalized: phone,
        firstMessageType: 'TEXT',
        lastMessageType: 'TEXT',
        firstContactAt: now,
        lastContactAt: now,
        ...overrides,
      },
    });
    created.pendingContacts.add(pendingContact.id);
    return pendingContact;
  }
});

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function uniquePhone() {
  return `55449${Math.floor(10000000 + Math.random() * 89999999)}`;
}
