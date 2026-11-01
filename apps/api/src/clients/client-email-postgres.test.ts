import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('client optional email on PostgreSQL', () => {
  const prisma = new PrismaClient();
  const clientIds = new Set<string>();
  const planIds = new Set<string>();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.client.deleteMany({ where: { id: { in: [...clientIds] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...planIds] } } });
    clientIds.clear();
    planIds.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('preserves legacy null emails and supports update followed by clearing', async () => {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `CLIENT-EMAIL1 ${suffix}`,
        durationMonths: 1,
        defaultValue: '30.00',
      },
    });
    planIds.add(plan.id);

    const client = await prisma.client.create({
      data: {
        name: 'Cliente sem e-mail',
        phone: `+55 11 9${suffix.replaceAll('-', '').slice(0, 8)}`,
        phoneNormalized: `55119${suffix.replaceAll('-', '').slice(0, 8)}`,
        email: null,
        reference: `EMAIL-${suffix}`,
        planId: plan.id,
        recurringValue: '30.00',
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
        billingAnchorDay: 10,
        billingNoticeDays: 3,
      },
    });
    clientIds.add(client.id);

    expect(client.email).toBeNull();

    await prisma.client.update({
      where: { id: client.id },
      data: { email: 'cliente@example.com' },
    });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ email: 'cliente@example.com' });

    await prisma.client.update({ where: { id: client.id }, data: { email: null } });
    await expect(
      prisma.client.findUniqueOrThrow({ where: { id: client.id } }),
    ).resolves.toMatchObject({ email: null });
  });
});
