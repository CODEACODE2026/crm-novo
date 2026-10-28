import { randomUUID } from 'node:crypto';

import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';
import { BillingTemplateRenderer } from './billing-template-renderer';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';
const reviewNow = new Date('2026-11-20T13:00:00.000Z');
const futureSchedule = '2026-11-21T12:00:00.000Z';

describe.skipIf(!runDatabaseTests)('global Billing review PostgreSQL concurrency', () => {
  const prisma = new PrismaClient();
  const peer = new PrismaClient();
  const clientIds = new Set<string>();
  const planIds = new Set<string>();
  const connectionIds = new Set<string>();

  beforeAll(async () => {
    await Promise.all([prisma.$connect(), peer.$connect()]);
    await prisma.messageTemplate.upsert({
      where: { type_name: { type: 'BILLING_DUE', name: 'Cobranca padrao' } },
      update: { active: true },
      create: {
        type: 'BILLING_DUE',
        name: 'Cobranca padrao',
        content:
          'Bom dia, *{{primeiroNome}}*! Seu serviço vence em {{vencimento}} no valor de {{valor}}.',
        active: true,
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS fix3_fail_global_review_event ON client_events',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fix3_fail_global_review_event()');
    const ids = [...clientIds];
    await prisma.clientEvent.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.messageDispatch.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.whatsAppConversation.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.paymentIntent.deleteMany({ where: { receivable: { clientId: { in: ids } } } });
    await prisma.receivable.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.clientReference.deleteMany({ where: { clientId: { in: ids } } });
    await prisma.client.deleteMany({ where: { id: { in: ids } } });
    await prisma.whatsAppConnection.deleteMany({ where: { id: { in: [...connectionIds] } } });
    await prisma.plan.deleteMany({ where: { id: { in: [...planIds] } } });
    clientIds.clear();
    planIds.clear();
    connectionIds.clear();
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), peer.$disconnect()]);
  });

  it('allows exactly one of two simultaneous reviews and preserves one audit event', async () => {
    const fixture = await createFixture();
    const attempts = await Promise.allSettled([
      serviceFor(prisma).reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Primeira revisão administrativa concorrente.'),
        randomUUID(),
        reviewNow,
      ),
      serviceFor(peer).reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Segunda revisão administrativa concorrente.'),
        randomUUID(),
        reviewNow,
      ),
    ]);

    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } }),
    ).resolves.toMatchObject({
      status: 'SCHEDULED',
      idempotencyKey: fixture.dispatch.idempotencyKey,
      scheduledFor: new Date(futureSchedule),
    });
    await expect(
      prisma.clientEvent.count({
        where: {
          clientId: fixture.client.id,
          metadata: { path: ['messageDispatchId'], equals: fixture.dispatch.id },
        },
      }),
    ).resolves.toBe(1);
  });

  it.each([
    ['manual payment', 'PAGO', { paidAt: new Date('2026-11-20T00:00:00.000Z') }],
    ['cancellation', 'CANCELADO', { canceledAt: new Date('2026-11-20T13:00:00.000Z') }],
  ] as const)(
    'rejects review concurrent with %s without changing the dispatch',
    async (_label, status, extra) => {
      const fixture = await createFixture();
      const held = holdMutation(async (tx) => {
        await tx.receivable.update({
          where: { id: fixture.receivable.id },
          data: { status, ...extra },
        });
      });
      await held.started;
      const review = serviceFor(prisma).reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Revisão concorrente com mutação financeira.'),
        randomUUID(),
        reviewNow,
      );
      held.release();
      await held.done;

      await expect(review).rejects.toThrow();
      await expectReviewUnchanged(fixture.dispatch.id, fixture.client.id);
    },
  );

  it('rejects review concurrent with opt-in revocation', async () => {
    const fixture = await createFixture();
    const held = holdMutation(async (tx) => {
      await tx.clientReference.update({
        where: { id: fixture.reference.id },
        data: { internationalBillingEnabled: false },
      });
    });
    await held.started;
    const review = serviceFor(prisma).reviewGlobalDispatch(
      fixture.dispatch.id,
      reviewDto('Revisão concorrente com revogação do opt-in.'),
      randomUUID(),
      reviewNow,
    );
    held.release();
    await held.done;

    await expect(review).rejects.toThrow();
    await expectReviewUnchanged(fixture.dispatch.id, fixture.client.id);
  });

  it('rejects review concurrent with client, conversation and connection invalidation', async () => {
    const fixture = await createFixture();
    const held = holdMutation(async (tx) => {
      await tx.client.update({
        where: { id: fixture.client.id },
        data: {
          phone: '+971 50 000 0000',
          phoneE164: '+971500000000',
          phoneNormalized: '971500000000',
        },
      });
      await tx.whatsAppConversation.update({
        where: { id: fixture.conversation.id },
        data: { phoneE164: '+971500000000', phoneNormalized: '971500000000' },
      });
      await tx.whatsAppConnection.update({
        where: { id: fixture.connection.id },
        data: { connected: false, loggedIn: false },
      });
    });
    await held.started;
    const review = serviceFor(prisma).reviewGlobalDispatch(
      fixture.dispatch.id,
      reviewDto('Revisão concorrente com mudança da conversa.'),
      randomUUID(),
      reviewNow,
    );
    held.release();
    await held.done;

    await expect(review).rejects.toThrow();
    await expectReviewUnchanged(fixture.dispatch.id, fixture.client.id);
  });

  it('does not let the scheduler send or acquire a dispatch during explicit review', async () => {
    const fixture = await createFixture();
    const providerSendText = vi.fn();
    const service = serviceFor(prisma, providerSendText);
    const [review, scheduler] = await Promise.all([
      service.reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Revisão administrativa paralela ao scheduler.'),
        randomUUID(),
        reviewNow,
      ),
      service.processDue(reviewNow, 20, { automatic: true }),
    ]);

    expect(review).toMatchObject({ status: 'SCHEDULED' });
    expect(scheduler).toMatchObject({ processed: 0 });
    expect(providerSendText).not.toHaveBeenCalled();
  });

  it('rolls back dispatch and audit event atomically when audit persistence fails', async () => {
    const fixture = await createFixture();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fix3_fail_global_review_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.title = 'Cobranca global retomada apos revisao administrativa.' THEN
          RAISE EXCEPTION 'forced review audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fix3_fail_global_review_event
      BEFORE INSERT ON client_events
      FOR EACH ROW EXECUTE FUNCTION fix3_fail_global_review_event()
    `);

    await expect(
      serviceFor(prisma).reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Revisão que deve sofrer rollback integral.'),
        randomUUID(),
        reviewNow,
      ),
    ).rejects.toThrow('forced review audit failure');
    await expectReviewUnchanged(fixture.dispatch.id, fixture.client.id);
  });

  it('rejects an invalid conversation without writing templates, dispatch or audit', async () => {
    const fixture = await createFixture();
    await prisma.whatsAppConnection.update({
      where: { id: fixture.connection.id },
      data: { connected: false, loggedIn: false },
    });
    const templateCount = await prisma.messageTemplate.count();
    const paymentIntentCount = await prisma.paymentIntent.count({
      where: { receivableId: fixture.receivable.id },
    });
    const receivableBefore = await prisma.receivable.findUniqueOrThrow({
      where: { id: fixture.receivable.id },
    });
    const original = await prisma.messageDispatch.findUniqueOrThrow({
      where: { id: fixture.dispatch.id },
    });

    await expect(
      serviceFor(prisma).reviewGlobalDispatch(
        fixture.dispatch.id,
        reviewDto('Revisão rejeitada sem qualquer escrita parcial.'),
        randomUUID(),
        reviewNow,
      ),
    ).rejects.toThrow();

    await expect(prisma.messageTemplate.count()).resolves.toBe(templateCount);
    await expect(
      prisma.paymentIntent.count({ where: { receivableId: fixture.receivable.id } }),
    ).resolves.toBe(paymentIntentCount);
    await expect(
      prisma.receivable.findUniqueOrThrow({ where: { id: fixture.receivable.id } }),
    ).resolves.toMatchObject({
      status: receivableBefore.status,
      amount: receivableBefore.amount,
      paidAt: receivableBefore.paidAt,
      canceledAt: receivableBefore.canceledAt,
    });
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } }),
    ).resolves.toMatchObject({
      status: original.status,
      errorCode: original.errorCode,
      scheduledFor: original.scheduledFor,
      updatedAt: original.updatedAt,
    });
    await expectReviewUnchanged(fixture.dispatch.id, fixture.client.id);
  });

  it('surfaces a real PostgreSQL serialization failure without partial writes', async () => {
    const fixture = await createFixture();
    let release!: () => void;
    let bothRead!: () => void;
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    let readers = 0;
    const readersPromise = new Promise<void>((resolve) => {
      bothRead = resolve;
    });
    const mutate = (db: PrismaClient, suffix: string) =>
      db.$transaction(
        async (tx) => {
          await tx.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } });
          readers += 1;
          if (readers === 2) bothRead();
          await releasePromise;
          return tx.messageDispatch.update({
            where: { id: fixture.dispatch.id },
            data: { errorMessage: `serialization-${suffix}` },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

    const attempts = [mutate(prisma, 'a'), mutate(peer, 'b')];
    await readersPromise;
    release();
    const settled = await Promise.allSettled(attempts);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    const rejectionReason: unknown = rejected?.status === 'rejected' ? rejected.reason : null;
    expect(rejectionReason).toMatchObject({ code: 'P2034' });
  });

  function serviceFor(db: PrismaClient, providerSendText = vi.fn()) {
    return new BillingService(
      db as never,
      { sendText: providerSendText } as never,
      { decrypt: vi.fn().mockReturnValue('not-used') } as never,
      {
        get: vi.fn((key: string) => {
          const config: Record<string, string> = {
            PHONE_GLOBAL_BILLING_ENABLED: 'true',
            PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
            PHONE_GLOBAL_BILLING_SEND_ENABLED: 'true',
            PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T00:00:00.000Z',
          };
          return config[key];
        }),
      } as never,
      new BillingTemplateRenderer(),
    );
  }

  function reviewDto(reason: string) {
    return { scheduledFor: futureSchedule, reason };
  }

  function holdMutation(mutate: (tx: Prisma.TransactionClient) => Promise<void>) {
    let signalStarted!: () => void;
    let signalRelease!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      signalRelease = resolve;
    });
    const done = peer.$transaction(async (tx) => {
      await mutate(tx);
      signalStarted();
      await released;
    });
    return { started, release: signalRelease, done };
  }

  async function expectReviewUnchanged(dispatchId: string, clientId: string) {
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: dispatchId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      errorCode: 'GLOBAL_BILLING_PIX_NOT_READY',
    });
    await expect(
      prisma.clientEvent.count({
        where: { clientId, metadata: { path: ['messageDispatchId'], equals: dispatchId } },
      }),
    ).resolves.toBe(0);
  }

  async function createFixture() {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `FIX3 plan ${suffix}`,
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(30),
      },
    });
    planIds.add(plan.id);
    const client = await prisma.client.create({
      data: {
        name: `FIX3 client ${suffix}`,
        phone: '+971 52 984 6014',
        phoneNormalized: '971529846014',
        phoneE164: '+971529846014',
        reference: `FIX3-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        billingAnchorDay: 23,
        billingNoticeDays: 3,
      },
    });
    clientIds.add(client.id);
    const reference = await prisma.clientReference.create({
      data: {
        clientId: client.id,
        reference: `FIX3-REF-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        billingAnchorDay: 23,
        billingNoticeDays: 3,
        internationalBillingEnabled: true,
      },
    });
    const receivable = await prisma.receivable.create({
      data: {
        clientId: client.id,
        clientReferenceId: reference.id,
        purpose: 'RENEWAL',
        description: 'FIX3 November renewal',
        amount: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        payerName: client.name,
        payerPhone: client.phone,
        payerPhoneNormalized: client.phoneNormalized,
      },
    });
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: `FIX3 connection ${suffix}`,
        providerTokenEncrypted: 'not-used',
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
      },
    });
    connectionIds.add(connection.id);
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connection.id,
        clientId: client.id,
        phone: client.phone,
        phoneNormalized: client.phoneNormalized,
        phoneE164: client.phoneE164,
      },
    });
    const dispatch = await prisma.messageDispatch.create({
      data: {
        clientId: client.id,
        clientReferenceId: reference.id,
        receivableId: receivable.id,
        whatsAppConnectionId: connection.id,
        phone: client.phoneNormalized,
        body: 'FIX3 blocked global billing',
        renderedContent: 'FIX3 blocked global billing',
        origin: 'BILLING',
        status: 'FAILED',
        requestId: `billing-group:${client.id}:2026-11-20`,
        idempotencyKey: `billing-group:${client.id}:2026-11-20`,
        scheduledFor: new Date('2026-11-20T12:00:00.000Z'),
        nextAttemptAt: null,
        errorCode: 'GLOBAL_BILLING_PIX_NOT_READY',
        errorMessage: 'PIX not ready',
        items: {
          create: {
            receivableId: receivable.id,
            clientReferenceId: reference.id,
            amount: receivable.amount,
            dueDate: receivable.dueDate,
            referenceSnapshot: reference.reference,
            statusSnapshot: receivable.status,
          },
        },
      },
    });
    return { plan, client, reference, receivable, connection, conversation, dispatch };
  }
});
