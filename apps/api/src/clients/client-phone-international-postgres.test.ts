import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClientsService } from './clients.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('client international phone writes', () => {
  const prisma = new PrismaClient();
  const created = {
    users: new Set<string>(),
    plans: new Set<string>(),
    clients: new Set<string>(),
    connections: new Set<string>(),
    conversations: new Set<string>(),
    pendingContacts: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    const clientIds = [...created.clients];
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: [...created.conversations] } },
    });
    await prisma.whatsAppPendingContact.deleteMany({
      where: { id: { in: [...created.pendingContacts] } },
    });
    await prisma.messageDispatch.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.paymentIntent.deleteMany({
      where: { receivable: { clientId: { in: clientIds } } },
    });
    await prisma.receivable.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    for (const ids of Object.values(created)) ids.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('atomically persists the Brazilian legacy and E.164 identities', async () => {
    const fixture = await createFixture();
    const service = createService();

    const result = await service.create(
      createDto(fixture.planId, { phone: '(11) 99999-1234', phoneCountry: 'BR' }),
      fixture.userId,
    );
    created.clients.add(result.id);

    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: result.id } }),
    ).resolves.toMatchObject({
      phone: '(11) 99999-1234',
      phoneNormalized: '5511999991234',
      phoneE164: '+5511999991234',
    });
  });

  it('keeps canonical international client writes independent from the legacy flag', async () => {
    const fixture = await createFixture();
    const service = createService({ clientWriteEnabled: false });

    const result = await service.create(
      createDto(fixture.planId, { phone: '+1 (407) 639-0665', phoneCountry: 'US' }),
      fixture.userId,
    );
    created.clients.add(result.id);

    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: result.id } }),
    ).resolves.toMatchObject({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
  });

  it('atomically creates an international client and receivable without PIX or dispatch', async () => {
    const fixture = await createFixture();
    const service = createService();
    const dto = createDto(fixture.planId, {
      phone: '+1 (407) 639-0665',
      phoneCountry: 'US',
      generateInitialReceivable: true,
    });

    const result = await service.create(dto, fixture.userId);
    created.clients.add(result.id);

    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: result.id } }),
    ).resolves.toMatchObject({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    await expect(prisma.receivable.count({ where: { clientId: result.id } })).resolves.toBe(1);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: result.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: result.id } })).resolves.toBe(0);
  });

  it('rolls back both phone identities when a later create step fails', async () => {
    const fixture = await createFixture();
    const service = createService({ failReferral: true });
    const dto = createDto(fixture.planId, {
      phone: '(11) 99999-4321',
      phoneCountry: 'BR',
      referrerClientId: randomUUID(),
    });

    await expect(service.create(dto, fixture.userId)).rejects.toThrow('forced referral failure');
    await expect(prisma.client.count({ where: { reference: dto.reference } })).resolves.toBe(0);
    await expect(
      prisma.clientReference.count({ where: { reference: dto.reference } }),
    ).resolves.toBe(0);
  });

  it('keeps legacy and canonical identities paired across concurrent edits', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(createDto(fixture.planId), fixture.userId);
    created.clients.add(client.id);

    await Promise.all([
      service.update(client.id, { phone: '(11) 98888-1111', phoneCountry: 'BR' }, fixture.userId),
      service.update(client.id, { phone: '(21) 97777-2222', phoneCountry: 'BR' }, fixture.userId),
    ]);

    const persisted = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect([
      ['(11) 98888-1111', '5511988881111', '+5511988881111'],
      ['(21) 97777-2222', '5521977772222', '+5521977772222'],
    ]).toContainEqual([persisted.phone, persisted.phoneNormalized, persisted.phoneE164]);
  });

  it('allows only one concurrent approval to create a client for the same pending contact', async () => {
    const fixture = await createFixture();
    const connection = await createConnection();
    const pending = await prisma.whatsAppPendingContact.create({
      data: {
        whatsAppConnectionId: connection.id,
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
        firstMessageType: 'TEXT',
        lastMessageType: 'TEXT',
        firstContactAt: new Date(),
        lastContactAt: new Date(),
      },
    });
    created.pendingContacts.add(pending.id);

    const approve = (label: string) =>
      prisma.$transaction(async (tx) => {
        const claimed = await tx.whatsAppPendingContact.updateMany({
          where: { id: pending.id, status: 'PENDENTE' },
          data: { ignoreReason: null },
        });
        if (claimed.count !== 1) throw new Error('pending contact already claimed');

        const approvedClient = await tx.client.create({
          data: {
            name: `PHONE CLIENTS2 ${label}`,
            phone: '+14076390665',
            phoneNormalized: '14076390665',
            phoneE164: '+14076390665',
            reference: `PHONE-CLIENTS2-${label}-${randomUUID()}`,
            planId: fixture.planId,
            recurringValue: new Prisma.Decimal(50),
            dueDate: new Date('2026-10-22T00:00:00.000Z'),
            billingAnchorDay: 22,
            billingNoticeDays: 3,
          },
        });
        await tx.whatsAppPendingContact.update({
          where: { id: pending.id },
          data: { status: 'APROVADO', clientId: approvedClient.id, approvedAt: new Date() },
        });
        return approvedClient.id;
      });

    const attempts = await Promise.allSettled([approve('A'), approve('B')]);
    const winners = attempts.filter(
      (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
    );
    expect(winners).toHaveLength(1);
    created.clients.add(winners[0]!.value);
    await expect(
      prisma.client.count({ where: { id: { in: winners.map((result) => result.value) } } }),
    ).resolves.toBe(1);
    await expect(
      prisma.whatsAppPendingContact.findUniqueOrThrow({ where: { id: pending.id } }),
    ).resolves.toMatchObject({ status: 'APROVADO', clientId: winners[0]!.value });
  });

  it('allows only one concurrent client association to win for an international conversation', async () => {
    const fixture = await createFixture();
    const connection = await createConnection();
    const clients = await Promise.all(
      ['A', 'B'].map((label) =>
        prisma.client.create({
          data: {
            name: `PHONE CLIENTS2 link ${label}`,
            phone: '+14076390665',
            phoneNormalized: '14076390665',
            phoneE164: '+14076390665',
            reference: `PHONE-CLIENTS2-LINK-${label}-${randomUUID()}`,
            planId: fixture.planId,
            recurringValue: new Prisma.Decimal(50),
            dueDate: new Date('2026-10-22T00:00:00.000Z'),
            billingAnchorDay: 22,
            billingNoticeDays: 3,
          },
        }),
      ),
    );
    clients.forEach((client) => created.clients.add(client.id));
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connection.id,
        phone: '+14076390665',
        phoneNormalized: '14076390665',
        phoneE164: '+14076390665',
      },
    });
    created.conversations.add(conversation.id);

    const link = (clientId: string) =>
      prisma.$transaction(async (tx) => {
        const updated = await tx.whatsAppConversation.updateMany({
          where: { id: conversation.id, clientId: null },
          data: { clientId },
        });
        if (updated.count !== 1) throw new Error('conversation already linked');
        return clientId;
      });

    const attempts = await Promise.allSettled(clients.map((client) => link(client.id)));
    const winners = attempts.filter(
      (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
    );
    expect(winners).toHaveLength(1);
    await expect(
      prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    ).resolves.toMatchObject({ clientId: winners[0]!.value, phoneE164: '+14076390665' });
  });

  function createService({ failReferral = false, clientWriteEnabled = true } = {}) {
    return new ClientsService(
      prisma as never,
      { ensureActivePlan: vi.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {
        createPending: failReferral
          ? vi.fn().mockRejectedValue(new Error('forced referral failure'))
          : vi.fn().mockResolvedValue(null),
      } as never,
      { ensureCurrentCycleReceivable: vi.fn().mockResolvedValue({ action: 'created' }) } as never,
      {
        get: vi.fn((key: string) => {
          if (key === 'PHONE_INTERNATIONAL_ENABLED') return 'true';
          if (key === 'PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED') {
            return clientWriteEnabled ? 'true' : 'false';
          }
          return undefined;
        }),
      } as never,
    );
  }

  async function createFixture() {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        name: 'PHONE CLIENTS1 actor',
        email: `phone-clients1-${suffix}@example.test`,
        passwordHash: 'not-used-by-test',
      },
    });
    created.users.add(user.id);
    const plan = await prisma.plan.create({
      data: {
        name: `PHONE CLIENTS1 ${suffix}`,
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(50),
      },
    });
    created.plans.add(plan.id);
    return { userId: user.id, planId: plan.id };
  }

  async function createConnection() {
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: `PHONE CLIENTS2 ${randomUUID()}`,
        providerTokenEncrypted: `not-used-${randomUUID()}`,
      },
    });
    created.connections.add(connection.id);
    return connection;
  }

  function createDto(
    planId: string,
    overrides: Partial<Parameters<ClientsService['create']>[0]> = {},
  ) {
    const suffix = randomUUID();
    return {
      name: 'Cliente PHONE CLIENTS1',
      phone: '(11) 99999-1234',
      phoneCountry: 'BR',
      reference: `PHONE-CLIENTS1-${suffix}`,
      planId,
      recurringValue: 50,
      dueDate: '2026-10-22',
      billingNoticeDays: 3,
      ...overrides,
    };
  }
});
