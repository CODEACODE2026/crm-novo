import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BillingService } from '../billing/billing.service';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
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
    const fixtureClients = await prisma.client.findMany({
      where: {
        OR: [{ id: { in: [...created.clients] } }, { planId: { in: [...created.plans] } }],
      },
      select: { id: true },
    });
    const clientIds = [...new Set([...created.clients, ...fixtureClients.map(({ id }) => id)])];
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
    await prisma.clientStatusHistory.deleteMany({ where: { clientId: { in: clientIds } } });
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

  it.each([
    ['BR', '+55 11 99999-1234', '+5511999991234', 1],
    ['US', '+1 (407) 639-0665', '+14076390665', 0],
    ['PT', '+351 912 345 678', '+351912345678', 0],
    ['AE', '+971 50 123 4567', '+971501234567', 0],
  ] as const)(
    'keeps valid %s E.164 client writes country-neutral without crossing the financial boundary',
    async (phoneCountry, phone, phoneE164, expectedReceivables) => {
      const fixture = await createFixture();
      const service = createService({ clientWriteEnabled: false });

      const result = await service.create(
        createDto(fixture.planId, { phone, phoneCountry }),
        fixture.userId,
      );
      created.clients.add(result.id);

      await expect(
        prisma.client.findUniqueOrThrow({ where: { id: result.id } }),
      ).resolves.toMatchObject({ phone, phoneE164 });
      await expect(
        prisma.clientReference.findMany({ where: { clientId: result.id } }),
      ).resolves.toEqual([
        expect.objectContaining({ internationalBillingEnabled: false, status: 'ATIVO' }),
      ]);
      await expect(prisma.receivable.count({ where: { clientId: result.id } })).resolves.toBe(
        expectedReceivables,
      );
      await expect(
        prisma.paymentIntent.count({ where: { receivable: { clientId: result.id } } }),
      ).resolves.toBe(0);
      await expect(prisma.messageDispatch.count({ where: { clientId: result.id } })).resolves.toBe(
        0,
      );
    },
  );

  it('does not create an international receivable without opt-in even when requested', async () => {
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
      prisma.clientReference.findMany({ where: { clientId: result.id } }),
    ).resolves.toEqual([
      expect.objectContaining({ internationalBillingEnabled: false, status: 'ATIVO' }),
    ]);
    await expect(prisma.receivable.count({ where: { clientId: result.id } })).resolves.toBe(0);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: result.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: result.id } })).resolves.toBe(0);
  });

  it('honors explicit international billing opt-in without creating PIX or dispatch', async () => {
    const fixture = await createFixture();
    const service = createService();
    const dto = createDto(fixture.planId, {
      phone: '+1 (407) 639-0665',
      phoneCountry: 'US',
      generateInitialReceivable: true,
      internationalBillingEnabled: true,
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
    await expect(
      prisma.clientReference.findMany({ where: { clientId: result.id } }),
    ).resolves.toEqual([
      expect.objectContaining({
        internationalBillingEnabled: true,
        status: 'PENDENTE_PAGAMENTO',
      }),
    ]);
    await expect(prisma.receivable.count({ where: { clientId: result.id } })).resolves.toBe(1);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: result.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: result.id } })).resolves.toBe(0);
  });

  it.each([
    ['US', '+1 (407) 639-0665'],
    ['PT', '+351 912 345 678'],
    ['AE', '+971 50 123 4567'],
  ] as const)(
    'keeps %s cycle edits, reactivation and direct generation free of financial effects without opt-in',
    async (phoneCountry, phone) => {
      const fixture = await createFixture();
      const service = createService();
      const client = await service.create(
        createDto(fixture.planId, { phoneCountry, phone }),
        fixture.userId,
      );
      created.clients.add(client.id);
      const reference = await prisma.clientReference.findFirstOrThrow({
        where: { clientId: client.id },
      });

      await service.updateReference(reference.id, { dueDate: '2026-11-23' }, fixture.userId);
      await expectNoFinancialEffects(client.id);

      await service.updateReferenceStatus(
        reference.id,
        { status: 'INATIVO', reason: 'FIX4 test' },
        fixture.userId,
      );
      await service.updateReferenceStatus(reference.id, { status: 'ATIVO' }, fixture.userId);
      await expectNoFinancialEffects(client.id);

      const cycle = new ReceivableCycleService(prisma as never);
      await expect(cycle.ensureCurrentCycleReceivable(reference.id)).rejects.toThrow(
        'A referencia nao autorizou materializacao financeira internacional.',
      );
      await expectNoFinancialEffects(client.id);
    },
  );

  it('creates an international operational reference without materializing finance when opt-in is false', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, { phone: '+971 50 123 4567', phoneCountry: 'AE' }),
      fixture.userId,
    );
    created.clients.add(client.id);

    const reference = await service.createReference(
      client.id,
      {
        reference: `PHONE-FIX4-${randomUUID()}`,
        planId: fixture.planId,
        recurringValue: 30,
        dueDate: '2026-11-25',
        billingNoticeDays: 3,
        internationalBillingEnabled: false,
      },
      fixture.userId,
    );

    expect(reference).toMatchObject({ status: 'ATIVO', internationalBillingEnabled: false });
    await expectNoFinancialEffects(client.id);
  });

  it('blocks the administrative Billing generation path without international opt-in', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, { phone: '+971 50 123 4567', phoneCountry: 'AE' }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });
    const billing = new BillingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ReceivableCycleService(prisma as never),
    );

    await expect(billing.generateCurrentCycleReceivable(reference.id)).rejects.toThrow(
      'A referencia nao autorizou materializacao financeira internacional.',
    );
    await expectNoFinancialEffects(client.id);
  });

  it('preserves Brazilian creation, cycle edits, reactivation and manual generation', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(createDto(fixture.planId), fixture.userId);
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });

    await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(1);
    await service.updateReference(reference.id, { dueDate: '2026-11-23' }, fixture.userId);
    await service.updateReferenceStatus(
      reference.id,
      { status: 'INATIVO', reason: 'FIX4 test' },
      fixture.userId,
    );
    await service.updateReferenceStatus(reference.id, { status: 'ATIVO' }, fixture.userId);
    await new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(reference.id);
    await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(1);

    await service.createReference(
      client.id,
      {
        reference: `PHONE-FIX4-BR-${randomUUID()}`,
        planId: fixture.planId,
        recurringValue: 30,
        dueDate: '2026-11-25',
        billingNoticeDays: 3,
      },
      fixture.userId,
    );
    await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(2);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: client.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: client.id } })).resolves.toBe(0);
  });

  it('allows one authorized international cycle under concurrent generators', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, { phone: '+1 (407) 639-0665', phoneCountry: 'US' }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });
    await service.updateReference(
      reference.id,
      { internationalBillingEnabled: true },
      fixture.userId,
    );
    const cycle = new ReceivableCycleService(prisma as never);

    const results = await Promise.all([
      cycle.ensureCurrentCycleReceivable(reference.id),
      cycle.ensureCurrentCycleReceivable(reference.id),
    ]);

    expect(results.map(({ action }) => action).sort()).toEqual(['created', 'kept']);
    await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(1);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: client.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: client.id } })).resolves.toBe(0);
  });

  it('revalidates opt-out under lock when it races with cycle generation', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, {
        phone: '+351 912 345 678',
        phoneCountry: 'PT',
        internationalBillingEnabled: true,
      }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });
    await prisma.receivable.deleteMany({ where: { clientId: client.id } });

    let releaseOptOut!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseOptOut = resolve;
    });
    const optOut = prisma.$transaction(async (tx) => {
      await tx.clientReference.update({
        where: { id: reference.id },
        data: { internationalBillingEnabled: false },
      });
      reportLocked();
      await release;
    });
    await locked;
    const generation = new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(
      reference.id,
    );
    releaseOptOut();
    await optOut;

    await expect(generation).rejects.toThrow(
      'A referencia nao autorizou materializacao financeira internacional.',
    );
    await expectNoFinancialEffects(client.id);
  });

  it('revalidates opt-in under lock when it races with cycle generation', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, {
        phone: '+971 50 123 4567',
        phoneCountry: 'AE',
        internationalBillingEnabled: false,
      }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });

    let releaseOptIn!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseOptIn = resolve;
    });
    const optIn = prisma.$transaction(async (tx) => {
      await tx.clientReference.update({
        where: { id: reference.id },
        data: { internationalBillingEnabled: true },
      });
      reportLocked();
      await release;
    });
    await locked;
    const generation = new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(
      reference.id,
    );
    releaseOptIn();
    await optIn;

    await expect(generation).resolves.toMatchObject({ action: 'created' });
    await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(1);
    await expect(
      prisma.paymentIntent.count({ where: { receivable: { clientId: client.id } } }),
    ).resolves.toBe(0);
    await expect(prisma.messageDispatch.count({ where: { clientId: client.id } })).resolves.toBe(0);
  });

  it.each(['PAGO', 'CANCELADO'] as const)(
    'does not recreate an authorized international cycle after status %s',
    async (status) => {
      const fixture = await createFixture();
      const service = createService();
      const client = await service.create(
        createDto(fixture.planId, {
          phone: '+1 (407) 639-0665',
          phoneCountry: 'US',
          internationalBillingEnabled: true,
        }),
        fixture.userId,
      );
      created.clients.add(client.id);
      const reference = await prisma.clientReference.findFirstOrThrow({
        where: { clientId: client.id },
      });
      const receivable = await prisma.receivable.findFirstOrThrow({
        where: { clientId: client.id },
      });
      await prisma.receivable.update({
        where: { id: receivable.id },
        data: status === 'PAGO' ? { status, paidAt: new Date() } : { status },
      });

      await expect(
        new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(reference.id),
      ).rejects.toThrow(ConflictException);
      await expect(prisma.receivable.count({ where: { clientId: client.id } })).resolves.toBe(1);
    },
  );

  it.each([
    ['BR', '(11) 99999-1234', false],
    ['US', '+1 (407) 639-0665', true],
    ['AE', '+971 50 123 4567', false],
  ] as const)(
    'blocks a new %s cycle when the plan is inactive regardless of international opt-in',
    async (phoneCountry, phone, internationalBillingEnabled) => {
      const fixture = await createFixture();
      const service = createService();
      const client = await service.create(
        createDto(fixture.planId, {
          phoneCountry,
          phone,
          internationalBillingEnabled,
        }),
        fixture.userId,
      );
      created.clients.add(client.id);
      const reference = await prisma.clientReference.findFirstOrThrow({
        where: { clientId: client.id },
      });
      await prisma.receivable.deleteMany({ where: { clientId: client.id } });
      await prisma.plan.update({ where: { id: fixture.planId }, data: { active: false } });

      await expectConflictCode(
        new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(reference.id),
        'PLAN_INACTIVE',
      );
      await expectNoFinancialEffects(client.id);
    },
  );

  it('blocks the administrative generation route when the plan is inactive', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, {
        phone: '+351 912 345 678',
        phoneCountry: 'PT',
        internationalBillingEnabled: true,
      }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });
    await prisma.receivable.deleteMany({ where: { clientId: client.id } });
    await prisma.plan.update({ where: { id: fixture.planId }, data: { active: false } });
    const billing = new BillingService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new ReceivableCycleService(prisma as never),
    );

    await expectConflictCode(billing.generateCurrentCycleReceivable(reference.id), 'PLAN_INACTIVE');
    await expectNoFinancialEffects(client.id);
  });

  it('revalidates an active-to-inactive plan change under lock before generation', async () => {
    const fixture = await createFixture();
    const service = createService();
    const client = await service.create(
      createDto(fixture.planId, {
        phone: '+1 (407) 639-0665',
        phoneCountry: 'US',
        internationalBillingEnabled: true,
      }),
      fixture.userId,
    );
    created.clients.add(client.id);
    const reference = await prisma.clientReference.findFirstOrThrow({
      where: { clientId: client.id },
    });
    await prisma.receivable.deleteMany({ where: { clientId: client.id } });

    let releasePlanChange!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releasePlanChange = resolve;
    });
    const deactivate = prisma.$transaction(async (tx) => {
      await tx.plan.update({ where: { id: fixture.planId }, data: { active: false } });
      reportLocked();
      await release;
    });
    await locked;
    const generation = new ReceivableCycleService(prisma as never).ensureCurrentCycleReceivable(
      reference.id,
    );
    releasePlanChange();
    await deactivate;

    await expectConflictCode(generation, 'PLAN_INACTIVE');
    await expectNoFinancialEffects(client.id);
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
    const receivableCycleService = new ReceivableCycleService(prisma as never);

    return new ClientsService(
      prisma as never,
      { ensureActivePlan: vi.fn().mockResolvedValue(undefined) } as never,
      { handleClientReferenceStatusChange: vi.fn().mockResolvedValue(undefined) } as never,
      {
        createPending: failReferral
          ? vi.fn().mockRejectedValue(new Error('forced referral failure'))
          : vi.fn().mockResolvedValue(null),
        cancelPendingForReferenceBeforePayment: vi.fn().mockResolvedValue(null),
      } as never,
      receivableCycleService,
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

  async function expectNoFinancialEffects(clientId: string) {
    await expect(prisma.receivable.count({ where: { clientId } })).resolves.toBe(0);
    await expect(prisma.paymentIntent.count({ where: { receivable: { clientId } } })).resolves.toBe(
      0,
    );
    await expect(prisma.messageDispatch.count({ where: { clientId } })).resolves.toBe(0);
  }

  async function expectConflictCode(promise: Promise<unknown>, code: string) {
    try {
      await promise;
      throw new Error('Expected conflict.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse();
      expect(response).toMatchObject({ code });
    }
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
