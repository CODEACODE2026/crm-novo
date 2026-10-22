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
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    const clientIds = [...created.clients];
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
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

  it('blocks a validated foreign phone without persisting any client', async () => {
    const fixture = await createFixture();
    const service = createService();

    await expect(
      service.create(
        createDto(fixture.planId, { phone: '+1 (407) 639-0665', phoneCountry: 'US' }),
        fixture.userId,
      ),
    ).rejects.toThrow('aguarda a integracao segura com WhatsApp e Billing');

    await expect(
      prisma.client.count({ where: { reference: { startsWith: 'PHONE-CLIENTS1-' } } }),
    ).resolves.toBe(0);
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

  function createService({ failReferral = false } = {}) {
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
      { get: vi.fn(() => 'true') } as never,
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
