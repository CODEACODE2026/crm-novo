import { randomUUID } from 'node:crypto';

import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FinanceService } from './finance.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('global manual PIX parity', () => {
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
    await prisma.receivableAuditEvent.deleteMany({
      where: { receivable: { clientId: { in: clientIds } } },
    });
    await prisma.paymentIntent.deleteMany({
      where: {
        OR: [
          { receivable: { clientId: { in: clientIds } } },
          { paymentGroup: { clientId: { in: clientIds } } },
        ],
      },
    });
    await prisma.paymentGroupItem.deleteMany({
      where: { paymentGroup: { clientId: { in: clientIds } } },
    });
    await prisma.paymentGroup.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.receivable.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    for (const ids of Object.values(created)) ids.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    ['BR', '+55 11 99999-1234', '5511999991234', '+5511999991234'],
    ['US', '+1 (407) 639-0665', '14076390665', '+14076390665'],
    ['PT', '+351 912 345 678', '351912345678', '+351912345678'],
    ['AE', '+971 50 123 4567', '971501234567', '+971501234567'],
  ] as const)(
    'creates and reuses one authenticated %s PIX with the canonical payer phone',
    async (_country, phone, phoneNormalized, phoneE164) => {
      const fixture = await createFixture({ phone, phoneNormalized, phoneE164 });
      const provider = createProvider();
      const service = createService(provider);

      const first = await service.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      );
      const second = await service.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      );

      expect(second.id).toBe(first.id);
      expect(provider.createPix).toHaveBeenCalledTimes(1);
      expect(provider.createPix).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: new Prisma.Decimal('30.00'),
          payerPhone: phoneNormalized,
          provider: 'FASTFLOW',
        }),
      );
      await expect(
        prisma.paymentIntent.count({ where: { receivableId: fixture.firstReceivableId } }),
      ).resolves.toBe(1);
    },
  );

  it('keeps international PIX blocked when the authenticated manual boundary is absent', async () => {
    const fixture = await createFixture({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    const provider = createProvider();
    const service = createService(provider);

    await expect(
      service.createReceivablePix(fixture.firstReceivableId, fixture.userId),
    ).rejects.toThrow('internacional');
    expect(provider.createPix).not.toHaveBeenCalled();
    await expect(
      prisma.paymentIntent.count({ where: { receivableId: fixture.firstReceivableId } }),
    ).resolves.toBe(0);
  });

  it('creates one grouped international PIX without duplicating receivables or intents', async () => {
    const fixture = await createFixture(
      {
        phone: '+351 912 345 678',
        phoneNormalized: '351912345678',
        phoneE164: '+351912345678',
      },
      2,
    );
    const provider = createProvider();
    const service = createService(provider);

    const intent = await service.createReceivablesPix(
      { receivableIds: fixture.receivableIds, provider: 'FASTFLOW' },
      fixture.userId,
      { allowInternationalManual: true },
    );

    expect(intent).toMatchObject({ amount: '60.00', provider: 'FASTFLOW' });
    expect(provider.createPix).toHaveBeenCalledWith(
      expect.objectContaining({ amount: new Prisma.Decimal('60.00'), payerPhone: '351912345678' }),
    );
    await expect(
      prisma.paymentGroupItem.count({
        where: { paymentGroup: { clientId: fixture.clientId } },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.paymentIntent.count({ where: { paymentGroup: { clientId: fixture.clientId } } }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent international PIX creation to one provider call and one intent', async () => {
    const fixture = await createFixture({
      phone: '+971 50 123 4567',
      phoneNormalized: '971501234567',
      phoneE164: '+971501234567',
    });
    const provider = createProvider();
    const service = createService(provider);

    const [first, second] = await Promise.all([
      service.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      ),
      service.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      ),
    ]);

    expect(second.id).toBe(first.id);
    expect(provider.createPix).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentIntent.count({ where: { receivableId: fixture.firstReceivableId } }),
    ).resolves.toBe(1);
  });

  it('persists an unknown reservation and blocks a second POST after FastDepix times out', async () => {
    const fixture = await createFixture({
      phone: '+1 (407) 639-0665',
      phoneNormalized: '14076390665',
      phoneE164: '+14076390665',
    });
    const provider = createProvider();
    provider.createPix.mockRejectedValueOnce(
      new ServiceUnavailableException('Tempo limite da API de pagamentos excedido.'),
    );
    const service = createService(provider);

    await expect(
      service.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      ),
    ).rejects.toThrow('Tempo limite');

    const restartedService = createService(provider);
    await expect(
      restartedService.createReceivablePix(
        fixture.firstReceivableId,
        fixture.userId,
        { provider: 'FASTFLOW' },
        { allowInternationalManual: true },
      ),
    ).rejects.toThrow('resultado remoto desconhecido');

    expect(provider.createPix).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentIntent.findFirstOrThrow({
        where: { receivableId: fixture.firstReceivableId },
      }),
    ).resolves.toMatchObject({
      status: 'CREATED',
      providerTransactionId: null,
      pixCopyPaste: null,
    });
    await expect(
      prisma.financialTransaction.count({ where: { clientId: fixture.clientId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: fixture.firstReceivableId } }),
    ).resolves.toMatchObject({ status: 'PENDENTE' });
  });

  it('persists an unknown grouped reservation and blocks a second grouped POST', async () => {
    const fixture = await createFixture(
      {
        phone: '+351 912 345 678',
        phoneNormalized: '351912345678',
        phoneE164: '+351912345678',
      },
      2,
    );
    const provider = createProvider();
    provider.createPix.mockRejectedValueOnce(
      new ServiceUnavailableException('Tempo limite da API de pagamentos excedido.'),
    );
    const service = createService(provider);
    const input = { receivableIds: fixture.receivableIds, provider: 'FASTFLOW' as const };
    const authorization = { allowInternationalManual: true };

    await expect(
      service.createReceivablesPix(input, fixture.userId, authorization),
    ).rejects.toThrow('Tempo limite');
    await expect(
      createService(provider).createReceivablesPix(input, fixture.userId, authorization),
    ).rejects.toThrow('PIX ativo');

    expect(provider.createPix).toHaveBeenCalledTimes(1);
    await expect(
      prisma.paymentIntent.findFirstOrThrow({
        where: { paymentGroup: { clientId: fixture.clientId } },
      }),
    ).resolves.toMatchObject({
      status: 'CREATED',
      providerTransactionId: null,
      pixCopyPaste: null,
    });
    await expect(
      prisma.paymentGroup.findFirstOrThrow({ where: { clientId: fixture.clientId } }),
    ).resolves.toMatchObject({ status: 'CREATED' });
  });

  function createProvider() {
    return {
      createPix: vi.fn((input: { amount: Prisma.Decimal; expiresAt: Date }) =>
        Promise.resolve({
          provider: 'FASTFLOW' as const,
          providerTransactionId: randomUUID(),
          externalStatus: 'pending',
          externalDepixId: null,
          blockchainTxId: null,
          status: 'WAITING_PAYMENT' as const,
          amount: input.amount,
          pixCopyPaste: `PIX-${randomUUID()}`,
          qrCodeData: null,
          expiresAt: input.expiresAt,
        }),
      ),
      getPixStatus: vi.fn(),
    };
  }

  function createService(provider: ReturnType<typeof createProvider>) {
    return new FinanceService(
      prisma as never,
      provider,
      { ensureEligiblePixCreationProvider: vi.fn().mockResolvedValue(undefined) } as never,
      { get: vi.fn().mockReturnValue(undefined) } as never,
    );
  }

  async function createFixture(
    phone: { phone: string; phoneNormalized: string; phoneE164: string },
    receivableCount = 1,
  ) {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        name: 'PHONE GLOBAL FINANCE actor',
        email: `phone-global-finance-${suffix}@example.test`,
        passwordHash: 'not-used-by-test',
      },
    });
    created.users.add(user.id);
    const plan = await prisma.plan.create({
      data: {
        name: `PHONE GLOBAL FINANCE ${suffix}`,
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(30),
      },
    });
    created.plans.add(plan.id);
    const client = await prisma.client.create({
      data: {
        name: 'Cliente PHONE GLOBAL FINANCE',
        ...phone,
        reference: `PHONE-GLOBAL-FINANCE-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        billingAnchorDay: 23,
        billingNoticeDays: 3,
      },
    });
    created.clients.add(client.id);

    const receivableIds: string[] = [];
    for (let index = 0; index < receivableCount; index += 1) {
      const reference = await prisma.clientReference.create({
        data: {
          clientId: client.id,
          reference: `PHONE-GLOBAL-FINANCE-${suffix}-${index}`,
          planId: plan.id,
          recurringValue: new Prisma.Decimal(30),
          dueDate: new Date(Date.UTC(2026, 10, 23 + index)),
          billingAnchorDay: 23 + index,
          billingNoticeDays: 3,
        },
      });
      const receivable = await prisma.receivable.create({
        data: {
          clientId: client.id,
          clientReferenceId: reference.id,
          purpose: 'RENEWAL',
          description: `Renovacao ${index + 1}`,
          amount: new Prisma.Decimal(30),
          dueDate: reference.dueDate,
          status: 'PENDENTE',
        },
      });
      receivableIds.push(receivable.id);
    }

    const firstReceivableId = receivableIds[0];
    if (!firstReceivableId) {
      throw new Error('The finance fixture must create at least one receivable.');
    }

    return { userId: user.id, clientId: client.id, receivableIds, firstReceivableId };
  }
});
