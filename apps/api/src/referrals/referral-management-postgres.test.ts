import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { ReferralsService } from './referrals.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';

describe.skipIf(!runDatabaseTests)('Referral management PostgreSQL concurrency', () => {
  const prisma = new PrismaClient();
  const created = {
    clients: new Set<string>(),
    plans: new Set<string>(),
    users: new Set<string>(),
  };

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    const clientIds = [...created.clients];
    await prisma.referral.deleteMany({
      where: {
        OR: [{ referredClientId: { in: clientIds } }, { referrerClientId: { in: clientIds } }],
      },
    });
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.receivable.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: clientIds } } });
    await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...created.users] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...created.plans] } } });
    created.clients.clear();
    created.plans.clear();
    created.users.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    ['apply-first', true],
    ['cancel-first', false],
  ] as const)('keeps apply and cancel mutually exclusive (%s)', async (_label, applyFirst) => {
    const fixture = await createFixture();
    const service = createService();
    const apply = () => service.applyReward(fixture.referralId, {}, fixture.actorId);
    const cancel = () =>
      service.cancel(fixture.referralId, { reason: 'Cancelamento concorrente.' }, fixture.actorId);

    const outcomes = applyFirst
      ? await Promise.allSettled([apply(), cancel()])
      : await Promise.allSettled([cancel(), apply()]);
    const referral = await prisma.referral.findUniqueOrThrow({
      where: { id: fixture.referralId },
      include: { history: true },
    });

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status !== 'rejected') throw new Error('Expected one rejected transition.');
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(['REWARDED', 'CANCELED']).toContain(referral.status);
    expect(referral.history.filter((entry) => entry.action === 'REWARD_APPLIED')).toHaveLength(
      referral.status === 'REWARDED' ? 1 : 0,
    );
    expect(referral.history.filter((entry) => entry.action === 'CANCELED')).toHaveLength(
      referral.status === 'CANCELED' ? 1 : 0,
    );
  });

  it('applies FREE_MONTH atomically and preserves a January 31 billing anchor', async () => {
    const fixture = await createFixture({ rewardType: 'FREE_MONTH' });
    const service = createService();

    await service.applyReward(
      fixture.referralId,
      { clientReferenceId: fixture.referrerReferenceId },
      fixture.actorId,
    );

    const [referral, reference, nextReceivables] = await Promise.all([
      prisma.referral.findUniqueOrThrow({ where: { id: fixture.referralId } }),
      prisma.clientReference.findUniqueOrThrow({ where: { id: fixture.referrerReferenceId } }),
      prisma.receivable.findMany({
        where: { clientReferenceId: fixture.referrerReferenceId, purpose: 'RENEWAL' },
      }),
    ]);

    expect(referral).toMatchObject({
      status: 'REWARDED',
      appliedPreviousDueDate: parseBusinessDate('2026-01-31'),
      appliedNewDueDate: parseBusinessDate('2026-02-28'),
    });
    expect(reference.dueDate).toEqual(parseBusinessDate('2026-02-28'));
    expect(nextReceivables).toHaveLength(1);
    expect(nextReceivables[0]).toMatchObject({
      dueDate: parseBusinessDate('2026-02-28'),
      status: 'PENDENTE',
    });
  });

  it('rolls back the FREE_MONTH claim and due-date change when cycle generation fails', async () => {
    const fixture = await createFixture({ rewardType: 'FREE_MONTH' });
    const failingCycle = {
      cancelPendingCurrentCycleReceivable: () => Promise.resolve(null),
      ensureCurrentCycleReceivable: () => Promise.reject(new Error('forced cycle failure')),
    };
    const service = new ReferralsService(prisma as never, failingCycle as never);

    await expect(
      service.applyReward(
        fixture.referralId,
        { clientReferenceId: fixture.referrerReferenceId },
        fixture.actorId,
      ),
    ).rejects.toThrow('forced cycle failure');

    await expect(
      prisma.referral.findUniqueOrThrow({ where: { id: fixture.referralId } }),
    ).resolves.toMatchObject({ status: 'QUALIFIED', appliedAt: null });
    await expect(
      prisma.clientReference.findUniqueOrThrow({ where: { id: fixture.referrerReferenceId } }),
    ).resolves.toMatchObject({ dueDate: parseBusinessDate('2026-01-31') });
    await expect(
      prisma.referralHistory.count({
        where: { referralId: fixture.referralId, action: 'REWARD_APPLIED' },
      }),
    ).resolves.toBe(0);
  });

  it('serializes manual creation behind an in-flight initial payment and still qualifies once', async () => {
    const fixture = await createFixture();
    await prisma.referral.delete({ where: { id: fixture.referralId } });
    const referredReference = await prisma.clientReference.create({
      data: {
        clientId: fixture.referredClientId,
        reference: `PAY-${randomUUID()}`,
        planId: fixture.planId,
        recurringValue: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        billingAnchorDay: 31,
        billingNoticeDays: 3,
        status: 'PENDENTE_PAGAMENTO',
      },
    });
    const receivable = await prisma.receivable.create({
      data: {
        clientId: fixture.referredClientId,
        clientReferenceId: referredReference.id,
        purpose: 'INITIAL_ACTIVATION',
        description: 'Referral concurrency audit',
        amount: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        status: 'PENDENTE',
      },
    });
    const service = createService();
    let releasePayment!: () => void;
    const paymentMayCommit = new Promise<void>((resolve) => {
      releasePayment = resolve;
    });
    let paymentLocked!: () => void;
    const paymentHasLock = new Promise<void>((resolve) => {
      paymentLocked = resolve;
    });

    const payment = prisma.$transaction(async (tx) => {
      await tx.receivable.update({
        where: { id: receivable.id },
        data: { status: 'PAGO', paidAt: parseBusinessDate('2026-01-31') },
      });
      await tx.clientReference.update({
        where: { id: referredReference.id },
        data: { status: 'ATIVO' },
      });
      await service.qualifyAfterInitialActivation(
        tx,
        fixture.referredClientId,
        receivable.id,
        fixture.actorId,
      );
      paymentLocked();
      await paymentMayCommit;
    });
    await paymentHasLock;

    let creationSettled = false;
    const creation = service
      .createManual(
        {
          referredClientId: fixture.referredClientId,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'FREE_MONTH',
        },
        fixture.actorId,
      )
      .finally(() => {
        creationSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(creationSettled).toBe(false);

    releasePayment();
    await payment;
    await expect(creation).resolves.toMatchObject({
      status: 'QUALIFIED',
      qualificationReceivableId: receivable.id,
    });
    await expect(
      prisma.referralHistory.count({
        where: { referralId: fixture.referralId, action: 'QUALIFIED' },
      }),
    ).resolves.toBe(0);
    const createdReferral = await prisma.referral.findUniqueOrThrow({
      where: { referredClientId: fixture.referredClientId },
      include: { history: true },
    });
    expect(createdReferral.history.map((entry) => entry.action)).toEqual(['CREATED', 'QUALIFIED']);
  });

  function createService() {
    return new ReferralsService(prisma as never, new ReceivableCycleService(prisma as never));
  }

  async function createFixture(options: { rewardType?: 'CREDIT' | 'FREE_MONTH' } = {}) {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `Referral audit ${suffix}`,
        durationMonths: 1,
        defaultValue: 100,
      },
    });
    created.plans.add(plan.id);
    const actor = await prisma.user.create({
      data: {
        name: 'Referral audit actor',
        email: `referral-audit-${suffix}@example.invalid`,
        passwordHash: 'not-used',
      },
    });
    created.users.add(actor.id);
    const referrer = await createClient(plan.id, `REF-${suffix}`, '5511999990001', 'ATIVO');
    const referred = await createClient(plan.id, `IND-${suffix}`, '5511999990002', 'ATIVO');
    const referrerReference = await prisma.clientReference.create({
      data: {
        clientId: referrer.id,
        reference: referrer.reference,
        planId: plan.id,
        recurringValue: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        billingAnchorDay: 31,
        billingNoticeDays: 3,
        status: 'ATIVO',
      },
    });
    const referral = await prisma.referral.create({
      data: {
        referredClientId: referred.id,
        referrerClientId: referrer.id,
        status: 'QUALIFIED',
        rewardType: options.rewardType ?? 'CREDIT',
        rewardValue: options.rewardType === 'FREE_MONTH' ? null : 25,
        qualifiedAt: new Date(),
        createdByUserId: actor.id,
      },
    });

    return {
      actorId: actor.id,
      planId: plan.id,
      referralId: referral.id,
      referredClientId: referred.id,
      referrerClientId: referrer.id,
      referrerReferenceId: referrerReference.id,
    };
  }

  async function createClient(
    planId: string,
    reference: string,
    phone: string,
    status: 'ATIVO' | 'PENDENTE_PAGAMENTO',
  ) {
    const client = await prisma.client.create({
      data: {
        name: `Referral audit ${reference}`,
        phone,
        phoneNormalized: phone,
        reference,
        planId,
        recurringValue: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        billingAnchorDay: 31,
        billingNoticeDays: 3,
        status,
      },
    });
    created.clients.add(client.id);
    return client;
  }
});
