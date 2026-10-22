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
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.messageDispatch.deleteMany({ where: { id: { in: [...created.dispatches] } } });
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
    return { client, reference, receivable };
  }
});

function unique(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}
