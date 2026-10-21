import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReceivableCycleService } from '../receivable-cycle/receivable-cycle.service';
import { ReferralReconciliationService } from './referral-reconciliation.service';
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
    const referredReference = await prisma.clientReference.update({
      where: { id: fixture.referredClientReferenceId },
      data: { status: 'PENDENTE_PAGAMENTO' },
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
        referredReference.id,
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
          referredClientReferenceId: referredReference.id,
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
      where: { referredClientReferenceId: referredReference.id },
      include: { history: true },
    });
    expect(createdReferral.history.map((entry) => entry.action)).toEqual(['CREATED', 'QUALIFIED']);
  });

  it('allows independent referrals for different references and rejects a duplicate target', async () => {
    const fixture = await createFixture();
    const secondReference = await createReferredReference(fixture, 'SECOND');

    await expect(
      prisma.referral.create({
        data: {
          referredClientId: fixture.referredClientId,
          referredClientReferenceId: secondReference.id,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'CREDIT',
          rewardValue: 10,
          createdByUserId: fixture.actorId,
        },
      }),
    ).resolves.toMatchObject({ referredClientReferenceId: secondReference.id });

    await expect(
      prisma.referral.create({
        data: {
          referredClientId: fixture.referredClientId,
          referredClientReferenceId: secondReference.id,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'CUSTOM',
          rewardDescription: 'Duplicada',
          createdByUserId: fixture.actorId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows only one winner when two manual creations target the same reference', async () => {
    const fixture = await createFixture();
    await prisma.referral.delete({ where: { id: fixture.referralId } });
    const service = createService();
    const payload = {
      referredClientId: fixture.referredClientId,
      referredClientReferenceId: fixture.referredClientReferenceId,
      referrerClientId: fixture.referrerClientId,
      rewardType: 'FREE_MONTH' as const,
    };

    const outcomes = await Promise.allSettled([
      service.createManual(payload, fixture.actorId),
      service.createManual(payload, fixture.actorId),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.referral.count({
        where: { referredClientReferenceId: fixture.referredClientReferenceId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.referralHistory.count({
        where: {
          referral: { referredClientReferenceId: fixture.referredClientReferenceId },
          action: 'CREATED',
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps a canceled referral occupying its exact reference', async () => {
    const fixture = await createFixture();
    const service = createService();

    await service.cancel(
      fixture.referralId,
      { reason: 'Cancelamento preserva a referencia.' },
      fixture.actorId,
    );

    await expect(
      service.createManual(
        {
          referredClientId: fixture.referredClientId,
          referredClientReferenceId: fixture.referredClientReferenceId,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'FREE_MONTH',
        },
        fixture.actorId,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('cancels only the referral attached to the requested reference', async () => {
    const fixture = await createFixture();
    await prisma.referral.update({
      where: { id: fixture.referralId },
      data: { status: 'PENDING', qualifiedAt: null },
    });
    const otherReference = await createReferredReference(fixture, 'ISOLATED-CANCEL');
    const otherReferral = await prisma.referral.create({
      data: {
        referredClientId: fixture.referredClientId,
        referredClientReferenceId: otherReference.id,
        referrerClientId: fixture.referrerClientId,
        status: 'PENDING',
        rewardType: 'FREE_MONTH',
        createdByUserId: fixture.actorId,
      },
    });

    await prisma.$transaction((tx) =>
      createService().cancelPendingForReferenceBeforePayment(
        tx,
        fixture.referredClientId,
        fixture.referredClientReferenceId,
        'Referencia cancelada.',
        fixture.actorId,
      ),
    );

    await expect(
      prisma.referral.findUniqueOrThrow({ where: { id: fixture.referralId } }),
    ).resolves.toMatchObject({ status: 'CANCELED' });
    await expect(
      prisma.referral.findUniqueOrThrow({ where: { id: otherReferral.id } }),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('enforces reference deletion protection at the database boundary', async () => {
    const fixture = await createFixture();

    await expect(
      prisma.clientReference.delete({ where: { id: fixture.referredClientReferenceId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a reference target that belongs to another client', async () => {
    const fixture = await createFixture();

    await expect(
      prisma.referral.create({
        data: {
          referredClientId: fixture.referredClientId,
          referredClientReferenceId: fixture.referrerReferenceId,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'FREE_MONTH',
          createdByUserId: fixture.actorId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('does not qualify a referral with payment from another reference of the same client', async () => {
    const fixture = await createFixture();
    await prisma.referral.update({
      where: { id: fixture.referralId },
      data: { status: 'PENDING', qualifiedAt: null },
    });
    const otherReference = await createReferredReference(fixture, 'OTHER');
    await prisma.receivable.create({
      data: {
        clientId: fixture.referredClientId,
        clientReferenceId: otherReference.id,
        purpose: 'INITIAL_ACTIVATION',
        description: 'Other reference activation',
        amount: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        status: 'PAGO',
        paidAt: parseBusinessDate('2026-01-31'),
      },
    });
    const referrals = createService();
    const reconciliation = new ReferralReconciliationService(prisma as never, referrals);

    await expect(reconciliation.apply(fixture.referralId, fixture.actorId)).resolves.toMatchObject({
      applied: false,
      candidate: { eligible: false, initialActivationReceivableId: null },
    });
    await expect(
      prisma.referral.findUniqueOrThrow({ where: { id: fixture.referralId } }),
    ).resolves.toMatchObject({ status: 'PENDING', qualificationReceivableId: null });
  });

  it('blocks a new targeted referral while an unresolved legacy referral is pending', async () => {
    const fixture = await createFixture();
    await prisma.referral.delete({ where: { id: fixture.referralId } });
    await prisma.referral.create({
      data: {
        referredClientId: fixture.referredClientId,
        referrerClientId: fixture.referrerClientId,
        status: 'PENDING',
        rewardType: 'FREE_MONTH',
        createdByUserId: fixture.actorId,
      },
    });

    await expect(
      createService().createManual(
        {
          referredClientId: fixture.referredClientId,
          referredClientReferenceId: fixture.referredClientReferenceId,
          referrerClientId: fixture.referrerClientId,
          rewardType: 'FREE_MONTH',
        },
        fixture.actorId,
      ),
    ).rejects.toThrow('Cliente possui indicacao legada pendente sem referencia definida.');
  });

  function createService() {
    return new ReferralsService(prisma as never, new ReceivableCycleService(prisma as never));
  }

  async function createReferredReference(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    label: string,
  ) {
    return prisma.clientReference.create({
      data: {
        clientId: fixture.referredClientId,
        reference: `${label}-${randomUUID()}`,
        planId: fixture.planId,
        recurringValue: 100,
        dueDate: parseBusinessDate('2026-01-31'),
        billingAnchorDay: 31,
        billingNoticeDays: 3,
        status: 'ATIVO',
      },
    });
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
    const referredReference = await prisma.clientReference.create({
      data: {
        clientId: referred.id,
        reference: referred.reference,
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
        referredClientReferenceId: referredReference.id,
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
      referredClientReferenceId: referredReference.id,
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
