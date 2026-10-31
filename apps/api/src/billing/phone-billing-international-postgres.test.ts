import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resolveBrazilianOperationalPhone } from '../common/phone/brazilian-operational-phone';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('international billing persistence safety', () => {
  const prisma = new PrismaClient();
  const created = {
    plans: new Set<string>(),
    clients: new Set<string>(),
    references: new Set<string>(),
    receivables: new Set<string>(),
    dispatches: new Set<string>(),
    conversations: new Set<string>(),
    connections: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.messageDispatch.deleteMany({ where: { id: { in: [...created.dispatches] } } });
    await prisma.whatsAppConversation.deleteMany({
      where: { id: { in: [...created.conversations] } },
    });
    await prisma.whatsAppConnection.deleteMany({
      where: { id: { in: [...created.connections] } },
    });
    await prisma.receivable.deleteMany({ where: { id: { in: [...created.receivables] } } });
    await prisma.clientReference.deleteMany({ where: { id: { in: [...created.references] } } });
    await prisma.client.deleteMany({ where: { id: { in: [...created.clients] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    for (const ids of Object.values(created)) ids.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    [
      'canonical international identity',
      { phone: '+1 (407) 639-0665', phoneNormalized: '14076390665', phoneE164: '+14076390665' },
    ],
    [
      'legacy-corrupted international identity',
      { phone: '+1 (407) 639-0665', phoneNormalized: '5514076390665', phoneE164: null },
    ],
  ])('does not persist a dispatch for a %s', async (_label, phone) => {
    const fixture = await createFixture(phone);
    const identity = resolveBrazilianOperationalPhone(fixture.client);

    await prisma.$transaction(async (tx) => {
      if (identity.status === 'valid') {
        const dispatch = await tx.messageDispatch.create({
          data: {
            clientId: fixture.client.id,
            clientReferenceId: fixture.reference.id,
            receivableId: fixture.receivable.id,
            phone: identity.digits,
            body: 'Nao deve persistir',
            origin: 'BILLING',
            status: 'SCHEDULED',
            requestId: unique('PHONE-BILLING1-DISPATCH'),
          },
        });
        created.dispatches.add(dispatch.id);
      }
    });

    expect(identity).toMatchObject({ status: 'blocked', reason: 'INTERNATIONAL_PHONE' });
    await expect(
      prisma.messageDispatch.count({ where: { clientId: fixture.client.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: fixture.receivable.id } }),
    ).resolves.toMatchObject({ status: 'PENDENTE', payerPhone: phone.phone });
  });

  it('rolls back a Brazilian dispatch without changing financial snapshots', async () => {
    const fixture = await createFixture({
      phone: '+55 (11) 99999-1234',
      phoneNormalized: '5511999991234',
      phoneE164: '+5511999991234',
    });
    const identity = resolveBrazilianOperationalPhone(fixture.client);
    expect(identity).toMatchObject({ status: 'valid', digits: '5511999991234' });

    await expect(
      prisma.$transaction(async (tx) => {
        if (identity.status !== 'valid') throw new Error('unexpected blocked identity');
        await tx.messageDispatch.create({
          data: {
            clientId: fixture.client.id,
            clientReferenceId: fixture.reference.id,
            receivableId: fixture.receivable.id,
            phone: identity.digits,
            body: 'Rollback controlado',
            origin: 'BILLING',
            status: 'SCHEDULED',
            requestId: unique('PHONE-BILLING1-ROLLBACK'),
          },
        });
        throw new Error('forced billing rollback');
      }),
    ).rejects.toThrow('forced billing rollback');

    await expect(
      prisma.messageDispatch.count({ where: { clientId: fixture.client.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: fixture.receivable.id } }),
    ).resolves.toMatchObject({
      status: 'PENDENTE',
      payerPhone: '+55 (11) 99999-1234',
      payerPhoneNormalized: '5511999991234',
    });
  });

  it('holds the client phone identity stable while a PIX transaction owns the receivable lock', async () => {
    const fixture = await createFixture({
      phone: '+55 (11) 99999-1234',
      phoneNormalized: '5511999991234',
      phoneE164: '+5511999991234',
    });
    let releaseLock!: () => void;
    let reportLocked!: () => void;
    const locked = new Promise<void>((resolve) => {
      reportLocked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const lockOwner = prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT c.id FROM clients c JOIN receivables r ON r."clientId" = c.id WHERE r.id = $1::uuid FOR UPDATE OF c',
        fixture.receivable.id,
      );
      reportLocked();
      await release;
    });
    await locked;

    let updateFinished = false;
    const concurrentUpdate = prisma.client
      .update({
        where: { id: fixture.client.id },
        data: { phone: '+55 (11) 98888-4321' },
      })
      .then(() => {
        updateFinished = true;
      });

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(updateFinished).toBe(false);

    releaseLock();
    await Promise.all([lockOwner, concurrentUpdate]);
    expect(updateFinished).toBe(true);
  });

  it('persists international Billing opt-in fail-closed without creating dispatch or Recovery', async () => {
    const fixture = await createFixture({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });

    expect(fixture.reference.internationalBillingEnabled).toBe(false);
    await expect(
      prisma.clientReference.count({
        where: {
          id: fixture.reference.id,
          internationalBillingEnabled: true,
        },
      }),
    ).resolves.toBe(0);

    const optedIn = await prisma.clientReference.update({
      where: { id: fixture.reference.id },
      data: { internationalBillingEnabled: true },
    });

    expect(optedIn.internationalBillingEnabled).toBe(true);
    await expect(
      prisma.clientReference.count({
        where: {
          id: fixture.reference.id,
          internationalBillingEnabled: true,
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.messageDispatch.count({ where: { clientReferenceId: fixture.reference.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.recoveryCampaign.count({ where: { clientReferenceId: fixture.reference.id } }),
    ).resolves.toBe(0);
  });

  it('persists one idempotent grouped US dispatch and safely rebuilds only eligible items', async () => {
    const fixture = await createFixture({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    const dueDate = new Date('2026-11-22T00:00:00.000Z');
    await prisma.client.update({
      where: { id: fixture.client.id },
      data: { dueDate, recurringValue: new Prisma.Decimal(25), billingAnchorDay: 22 },
    });
    await prisma.clientReference.update({
      where: { id: fixture.reference.id },
      data: {
        dueDate,
        recurringValue: new Prisma.Decimal(25),
        billingAnchorDay: 22,
        internationalBillingEnabled: true,
      },
    });
    await prisma.receivable.update({
      where: { id: fixture.receivable.id },
      data: { dueDate, amount: new Prisma.Decimal(25) },
    });

    const additionalReferences = await Promise.all(
      [2, 3].map(async (index) => {
        const reference = await prisma.clientReference.create({
          data: {
            clientId: fixture.client.id,
            reference: unique(`PHONE-BILLING1-REF-${index}`),
            planId: fixture.plan.id,
            recurringValue: new Prisma.Decimal(25),
            dueDate,
            billingAnchorDay: 22,
            billingNoticeDays: 3,
            internationalBillingEnabled: true,
          },
        });
        created.references.add(reference.id);
        const receivable = await prisma.receivable.create({
          data: {
            clientId: fixture.client.id,
            clientReferenceId: reference.id,
            purpose: 'RENEWAL',
            description: `PHONE BILLING1 receivable ${index}`,
            amount: new Prisma.Decimal(25),
            dueDate,
            payerName: fixture.client.name,
            payerPhone: fixture.client.phone,
            payerPhoneNormalized: fixture.client.phoneNormalized,
          },
        });
        created.receivables.add(receivable.id);
        return { reference, receivable };
      }),
    );
    const items = [
      { reference: fixture.reference, receivable: fixture.receivable },
      ...additionalReferences,
    ];
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: unique('PHONE BILLING1 connection'),
        providerTokenEncrypted: 'PHONE-BILLING1-LOCAL-TOKEN',
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      },
    });
    created.connections.add(connection.id);
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connection.id,
        clientId: fixture.client.id,
        phone: fixture.client.phone,
        phoneNormalized: fixture.client.phoneNormalized,
        phoneE164: fixture.client.phoneE164,
      },
    });
    created.conversations.add(conversation.id);
    const idempotencyKey = unique('PHONE-BILLING1-GROUP');
    const dispatchData = {
      clientId: fixture.client.id,
      clientReferenceId: items[0]!.reference.id,
      receivableId: items[0]!.receivable.id,
      whatsAppConnectionId: connection.id,
      phone: fixture.client.phoneNormalized,
      body: 'PHONE BILLING1 grouped local proof',
      renderedContent: 'PHONE BILLING1 grouped local proof',
      origin: 'BILLING' as const,
      status: 'SCHEDULED' as const,
      requestId: idempotencyKey,
      idempotencyKey,
      scheduledFor: new Date('2026-11-19T12:00:00.000Z'),
      nextAttemptAt: new Date('2026-11-19T12:00:00.000Z'),
      items: {
        create: items.map(({ reference, receivable }) => ({
          receivableId: receivable.id,
          clientReferenceId: reference.id,
          amount: new Prisma.Decimal(25),
          dueDate,
          referenceSnapshot: reference.reference,
          statusSnapshot: 'PENDENTE' as const,
        })),
      },
    };

    const concurrentCreates = await Promise.allSettled([
      prisma.messageDispatch.create({ data: dispatchData }),
      prisma.messageDispatch.create({ data: dispatchData }),
    ]);
    expect(concurrentCreates.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const createdDispatch = concurrentCreates.find((result) => result.status === 'fulfilled');
    if (!createdDispatch || createdDispatch.status !== 'fulfilled') {
      throw new Error('Grouped dispatch was not created.');
    }
    created.dispatches.add(createdDispatch.value.id);

    const grouped = await prisma.messageDispatch.findUniqueOrThrow({
      where: { idempotencyKey },
      include: { items: true },
    });
    expect(grouped.whatsAppConnectionId).toBe(connection.id);
    expect(grouped.items).toHaveLength(3);
    expect(grouped.items.reduce((total, item) => total + Number(item.amount), 0)).toBe(75);

    const revoked = additionalReferences[0]!;
    await prisma.$transaction([
      prisma.clientReference.update({
        where: { id: revoked.reference.id },
        data: { internationalBillingEnabled: false },
      }),
      prisma.messageDispatch.update({
        where: { id: grouped.id },
        data: {
          status: 'CANCELED',
          errorCode: 'INTERNATIONAL_BILLING_OPT_IN_REVOKED',
          nextAttemptAt: null,
        },
      }),
    ]);
    await prisma.clientReference.update({
      where: { id: revoked.reference.id },
      data: { internationalBillingEnabled: true },
    });
    const rebuilt = await prisma.messageDispatch.update({
      where: { id: grouped.id },
      data: {
        status: 'SCHEDULED',
        errorCode: null,
        nextAttemptAt: grouped.scheduledFor,
        items: {
          deleteMany: {},
          create: items.map(({ reference, receivable }) => ({
            receivableId: receivable.id,
            clientReferenceId: reference.id,
            amount: new Prisma.Decimal(25),
            dueDate,
            referenceSnapshot: reference.reference,
            statusSnapshot: 'PENDENTE',
          })),
        },
      },
      include: { items: true },
    });
    expect(rebuilt.id).toBe(grouped.id);
    await expect(prisma.messageDispatch.count({ where: { idempotencyKey } })).resolves.toBe(1);

    await prisma.receivable.update({
      where: { id: additionalReferences[1]!.receivable.id },
      data: { status: 'PAGO', paidAt: new Date('2026-11-18T00:00:00.000Z') },
    });
    const stillEligible = await prisma.receivable.findMany({
      where: {
        id: { in: items.map((item) => item.receivable.id) },
        status: 'PENDENTE',
        clientReference: { internationalBillingEnabled: true, status: 'ATIVO' },
      },
    });
    expect(stillEligible).toHaveLength(2);
    expect(stillEligible.reduce((total, item) => total + Number(item.amount), 0)).toBe(50);
    await expect(
      prisma.recoveryCampaign.count({ where: { clientId: fixture.client.id } }),
    ).resolves.toBe(0);
  });

  async function createFixture(phone: {
    phone: string;
    phoneNormalized: string;
    phoneE164: string | null;
  }) {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `PHONE BILLING1 ${suffix}`,
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(50),
      },
    });
    created.plans.add(plan.id);
    const client = await prisma.client.create({
      data: {
        name: 'PHONE BILLING1 client',
        ...phone,
        reference: `PHONE-BILLING1-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(50),
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
      },
    });
    created.clients.add(client.id);
    const reference = await prisma.clientReference.create({
      data: {
        clientId: client.id,
        reference: `PHONE-BILLING1-REF-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(50),
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
      },
    });
    created.references.add(reference.id);
    const receivable = await prisma.receivable.create({
      data: {
        clientId: client.id,
        clientReferenceId: reference.id,
        purpose: 'RENEWAL',
        description: 'PHONE BILLING1 receivable',
        amount: new Prisma.Decimal(50),
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
        payerName: client.name,
        payerPhone: phone.phone,
        payerPhoneNormalized: phone.phoneNormalized,
      },
    });
    created.receivables.add(receivable.id);
    return { plan, client, reference, receivable };
  }
});

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
