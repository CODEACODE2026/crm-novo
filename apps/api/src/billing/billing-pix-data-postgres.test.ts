import { createHash, createHmac, randomUUID } from 'node:crypto';

import {
  Prisma,
  PrismaClient,
  type PaymentIntentStatus,
  type PaymentProviderCode,
} from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BillingActorAttestationService,
  type BillingActorAttestationContext,
  billingActorAttestationPayload,
  billingExecutionTransitionAttestationContext,
  billingPixOrphanWebhookEventId,
  billingPixQuarantineOrphanWebhookAttestationContext,
  billingPixReserveAttestationContext,
  billingReceivableAmendAttestationContext,
  canonicalBillingActorValue,
} from './billing-actor-attestation.service';
import { buildBillingExecutionIdentity } from './billing-execution-identity';
import { buildBillingPixCreationKey } from './billing-pix-creation-key';
import { BillingPixClaimService } from './billing-pix-claim.service';
import { BillingPixDryRunService } from './billing-pix-dry-run.service';
import { BillingPixWebhookQuarantineService } from './billing-pix-webhook-quarantine.service';
import { acquireFinancialSetLocks } from '../finance/financial-set-lock';
import { FinanceService } from '../finance/finance.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';
const runtimeRole = process.env.DATABASE_RUNTIME_TEST_ROLE?.trim();
const prefix = 'DATA1-TEST-';
const actorSecrets = {
  USER: 'data1-user-attestation-secret-0000000000000001',
  SYSTEM: 'data1-system-attestation-secret-0000000000001',
  WEBHOOK: 'data1-webhook-attestation-secret-000000000001',
} as const;
const orphanUnicodeWhiteSpaceCharacters = [
  '\u0020',
  '\u0009',
  '\u000a',
  '\u000b',
  '\u000c',
  '\u000d',
  '\u0085',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2001',
  '\u2002',
  '\u2003',
  '\u2004',
  '\u2005',
  '\u2006',
  '\u2007',
  '\u2008',
  '\u2009',
  '\u200a',
  '\u2028',
  '\u2029',
  '\u202f',
  '\u205f',
  '\u3000',
] as const;
const orphanMalformedUtf16TransactionIds = [
  '\ud800',
  '\udc00',
  '\udbff',
  '\udfff',
  '\ud800A',
  'A\udc00',
  '\udc00\ud800',
  '\ud800\udbff',
  '\udc00\udfff',
  '\ud800transaction-id',
  'transaction-id\udc00',
  'trans\ud800action-id',
  '\u00a0\ud800transaction-id',
] as const;

describe.skipIf(!runDatabaseTests)('Billing PIX DATA1 PostgreSQL invariants', () => {
  const prisma = new PrismaClient();
  const peer = new PrismaClient();

  beforeAll(async () => {
    await Promise.all([prisma.$connect(), peer.$connect()]);
    for (const actorType of ['USER', 'SYSTEM', 'WEBHOOK'] as const) {
      await prisma.$executeRaw`
        INSERT INTO public.billing_actor_keys ("actorType", "keyId", "secret")
        VALUES (
          ${actorType}::public."BillingActorType",
          ${`${actorType.toLowerCase()}-test-v1`},
          ${Buffer.from(actorSecrets[actorType], 'utf8')}
        )
        ON CONFLICT ("actorType", "keyId") DO UPDATE
        SET "secret" = EXCLUDED."secret", "enabled" = true
      `;
    }
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE public.billing_pix_orphan_webhook_events, public.billing_actor_assertions, public.billing_execution_events, public.billing_pix_attempts, public.billing_execution_receivables, public.billing_executions',
    );
    await prisma.messageDispatch.deleteMany({ where: { requestId: { startsWith: prefix } } });
    await prisma.whatsAppConversation.deleteMany({
      where: { client: { reference: { startsWith: prefix } } },
    });
    await prisma.paymentIntent.deleteMany({
      where: {
        OR: [
          { creationKey: { startsWith: prefix } },
          { providerTransactionId: { startsWith: prefix } },
        ],
      },
    });
    await prisma.paymentGroup.deleteMany({
      where: { client: { reference: { startsWith: prefix } } },
    });
    await prisma.receivable.deleteMany({ where: { description: { startsWith: prefix } } });
    await prisma.clientReference.deleteMany({ where: { reference: { startsWith: prefix } } });
    await prisma.client.deleteMany({ where: { reference: { startsWith: prefix } } });
    await prisma.whatsAppConnection.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.plan.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'data1-test-' } } });
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), peer.$disconnect()]);
  });

  it('creates only one execution for a dispatch, client cycle and exact receivable set', async () => {
    const fixture = await createFixture();
    const settled = await Promise.allSettled([
      createExecution(prisma, fixture),
      createExecution(peer, fixture),
    ]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.billingExecution.count({ where: { clientId: fixture.client.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.billingExecutionReceivable.findFirstOrThrow({
        where: { receivableId: fixture.receivable.id },
      }),
    ).resolves.toMatchObject({
      clientReferenceId: fixture.reference.id,
      referenceSnapshot: fixture.reference.reference,
      statusSnapshot: 'PENDENTE',
    });
  });

  it('runs the PIX preview against PostgreSQL without writes, leases or reservations', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const before = await Promise.all([
      prisma.billingExecution.count(),
      prisma.billingPixAttempt.count(),
      prisma.paymentIntent.count(),
      prisma.billingExecutionEvent.count(),
    ]);
    const preview = new BillingPixDryRunService(
      prisma as never,
      {
        get: (key: string) =>
          ({
            PHONE_GLOBAL_BILLING_ENABLED: 'true',
            PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
            PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
            PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
          })[key],
      } as never,
    );

    const result = await preview.preview({ now: new Date('2026-10-24T12:00:00.000Z') });
    const after = await Promise.all([
      prisma.billingExecution.count(),
      prisma.billingPixAttempt.count(),
      prisma.paymentIntent.count(),
      prisma.billingExecutionEvent.count(),
    ]);

    expect(result.effects).toEqual({
      databaseWrites: 0,
      externalCalls: 0,
      leasesAcquired: 0,
      pixReservations: 0,
    });
    expect(result.candidates).toContainEqual(
      expect.objectContaining({ executionId: execution.id, eligible: false }),
    );
    expect(after).toEqual(before);
  });

  it('paginates 201 executions without hiding an eligible candidate behind blocked rows', async () => {
    const blockedFixtures: Awaited<ReturnType<typeof createFixture>>[] = [];
    for (let offset = 0; offset < 200; offset += 20) {
      blockedFixtures.push(
        ...(await Promise.all(Array.from({ length: 20 }, () => createFixture()))),
      );
    }
    const blockedExecutions = await Promise.all(
      blockedFixtures.map((fixture, index) =>
        createExecution(prisma, fixture, {
          status: 'BLOCKED',
          ...(index === 0 ? { nextAttemptAt: null } : {}),
        }),
      ),
    );
    const nullScheduledExecution = blockedExecutions[0]!;

    const targetFixture = await createFixture();
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: `${prefix}DRY-RUN-PAGINATION-${targetFixture.suffix}`,
        providerTokenEncrypted: 'not-used-by-dry-run',
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
        webhookConfigured: true,
      },
    });
    try {
      await prisma.messageDispatch.update({
        where: { id: targetFixture.dispatch.id },
        data: { whatsAppConnectionId: connection.id },
      });
      await prisma.messageDispatchItem.create({
        data: {
          messageDispatchId: targetFixture.dispatch.id,
          receivableId: targetFixture.receivable.id,
          clientReferenceId: targetFixture.reference.id,
          amount: targetFixture.receivable.amount,
          dueDate: targetFixture.receivable.dueDate,
          referenceSnapshot: targetFixture.reference.reference,
          statusSnapshot: targetFixture.receivable.status,
        },
      });
      const target = await createExecution(prisma, targetFixture);
      const preview = new BillingPixDryRunService(
        prisma as never,
        {
          get: (key: string) =>
            ({
              PHONE_GLOBAL_BILLING_ENABLED: 'true',
              PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
              PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
              PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
            })[key],
        } as never,
      );
      const before = await Promise.all([
        prisma.billingExecution.count(),
        prisma.billingPixAttempt.count(),
        prisma.paymentIntent.count(),
        prisma.billingExecutionEvent.count(),
        prisma.messageDispatch.count(),
      ]);
      const pages: Array<Awaited<ReturnType<typeof preview.preview>>> = [];
      let cursor: string | undefined;
      do {
        const page = await preview.preview({
          ...(cursor === undefined ? {} : { cursor }),
          limit: 100,
          now: new Date('2026-10-24T12:00:00.000Z'),
        });
        pages.push(page);
        cursor = page.pagination.nextCursor ?? undefined;
      } while (pages.at(-1)?.pagination.hasMore);
      const after = await Promise.all([
        prisma.billingExecution.count(),
        prisma.billingPixAttempt.count(),
        prisma.paymentIntent.count(),
        prisma.billingExecutionEvent.count(),
        prisma.messageDispatch.count(),
      ]);
      const candidates = pages.flatMap((page) => page.candidates);

      expect(pages.map((page) => page.pagination.pageCount)).toEqual([100, 100, 1]);
      expect(pages.map((page) => page.pagination.coverage)).toEqual([
        'PARTIAL',
        'PARTIAL',
        'COMPLETE',
      ]);
      expect(new Set(candidates.map((candidate) => candidate.executionId)).size).toBe(201);
      expect(candidates.find((candidate) => candidate.executionId === target.id)).toMatchObject({
        decision: 'CREATE_PIX_CANDIDATE',
        eligible: true,
      });
      expect(
        candidates.findIndex((candidate) => candidate.executionId === target.id),
      ).toBeGreaterThan(99);
      expect(candidates.at(-1)?.executionId).toBe(nullScheduledExecution.id);
      expect(after).toEqual(before);
    } finally {
      await prisma.whatsAppConnection.delete({ where: { id: connection.id } });
    }
  });

  it.runIf(Boolean(runtimeRole))(
    'selects, claims, renews and releases an eligible execution through DATA1 lease functions only',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const selected = await service.select({ now });
      const candidate = selected.candidates.find(
        (item) => item.executionId === prepared.execution.id,
      );
      expect(candidate).toBeDefined();
      const before = await financialEffectCounts();

      const claimed = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl2-worker-a',
        token: `${prefix}CLAIM-TOKEN-${prepared.fixture.suffix}`,
        ttlSeconds: 60,
        now,
      });
      expect(claimed).toMatchObject({
        decision: 'ELIGIBLE',
        version: prepared.execution.version + 1,
        lease: { acquired: true, retained: true, owner: 'impl2-worker-a' },
        revalidationRequiredBeforeExternalCall: true,
      });
      expect(claimed.financialSet).toMatchObject({ total: '30.00' });
      expect(await financialEffectCounts()).toEqual(before);

      await expect(
        service.renewLease({
          executionId: prepared.execution.id,
          expectedVersion: claimed.version!,
          owner: claimed.lease.owner,
          token: claimed.lease.token!,
          ttlSeconds: 90,
        }),
      ).resolves.toBe(true);
      const renewed = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      await expect(
        service.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: renewed.version,
          owner: 'wrong-owner',
          token: claimed.lease.token!,
        }),
      ).resolves.toBe(false);
      await expect(
        service.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: renewed.version,
          owner: claimed.lease.owner,
          token: claimed.lease.token!,
        }),
      ).resolves.toBe(true);
      await expect(
        service.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: renewed.version,
          owner: claimed.lease.owner,
          token: claimed.lease.token!,
        }),
      ).resolves.toBe(false);
      const final = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      expect(final).toMatchObject({
        status: 'SCHEDULED',
        pixStatus: 'NOT_STARTED',
        deliveryStatus: 'NOT_READY',
        paymentIntentId: null,
        leaseOwner: null,
        leaseToken: null,
      });
      expect(await financialEffectCounts()).toEqual(before);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'persists one deterministic RESERVED attempt with SYSTEM audit and no external-start evidence',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const token = `${prefix}IMPL3-TOKEN-${prepared.fixture.suffix}`;
      const claimed = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl3-worker',
        token,
        now,
      });
      expect(claimed).toMatchObject({ decision: 'ELIGIBLE', lease: { retained: true } });
      const input = {
        executionId: prepared.execution.id,
        expectedVersion: claimed.version!,
        owner: 'impl3-worker',
        token,
        provider: 'DEPIX' as const,
        now,
      };

      const reserved = await service.reservePix(input);
      expect(reserved).toMatchObject({
        decision: 'RESERVED',
        version: claimed.version! + 1,
        leaseRetained: true,
        externalCallStarted: false,
        revalidationRequiredBeforeExternalCall: true,
      });
      expect(reserved.creationKey).toMatch(/^bpx1:[0-9a-f]{64}$/u);
      const [attempt, execution, events] = await Promise.all([
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: reserved.attemptId! } }),
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
        prisma.billingExecutionEvent.findMany({
          where: { billingExecutionId: prepared.execution.id },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      expect(attempt).toMatchObject({
        creationKey: reserved.creationKey,
        status: 'RESERVED',
        provider: null,
        providerTransactionId: null,
        startedAt: null,
        confirmedAt: null,
        finishedAt: null,
      });
      expect(execution).toMatchObject({
        status: 'SCHEDULED',
        pixStatus: 'RESERVED',
        deliveryStatus: 'NOT_READY',
        paymentIntentId: null,
        lastActorType: 'SYSTEM',
      });
      expect(events.some((event) => event.eventType === 'PIX_ATTEMPT_RESERVED')).toBe(true);
      expect(await prisma.paymentIntent.count()).toBe(0);

      await expect(service.reservePix(input)).resolves.toMatchObject({
        decision: 'REUSED_RESERVATION',
        attemptId: reserved.attemptId,
        creationKey: reserved.creationKey,
        leaseRetained: true,
        externalCallStarted: false,
      });
      expect(
        await prisma.billingPixAttempt.count({
          where: { billingExecutionId: prepared.execution.id },
        }),
      ).toBe(1);
    },
  );

  it('rejects a non-cent monetary identity before any lease or reservation is acquired', async () => {
    const prepared = await createClaimFixture();

    expect(() =>
      buildBillingPixCreationKey({
        executionId: prepared.execution.id,
        provider: 'DEPIX',
        cycleKey: prepared.execution.cycleKey,
        receivableSetHash: prepared.execution.receivableSetHash,
        totalAmount: '30.001',
      }),
    ).toThrow(/exactly representable in cents/u);

    await expect(
      prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
    ).resolves.toMatchObject({
      leaseOwner: null,
      leaseToken: null,
      pixStatus: 'NOT_STARTED',
    });
    await expect(
      prisma.billingPixAttempt.count({ where: { billingExecutionId: prepared.execution.id } }),
    ).resolves.toBe(0);
  });

  it.runIf(Boolean(runtimeRole))(
    'serializes repeated reservation requests and creates only one attempt',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const serviceA = claimService(prisma, runtimeRole);
      const serviceB = claimService(peer, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const token = `${prefix}IMPL3-CONCURRENT-${prepared.fixture.suffix}`;
      const claimed = await serviceA.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl3-concurrent-worker',
        token,
        now,
      });
      const request = {
        executionId: prepared.execution.id,
        expectedVersion: claimed.version!,
        owner: 'impl3-concurrent-worker',
        token,
        provider: 'DEPIX' as const,
        now,
      };
      const results = await Promise.all([
        serviceA.reservePix(request),
        serviceB.reservePix(request),
      ]);
      expect(results.filter((result) => result.decision === 'RESERVED')).toHaveLength(1);
      expect(
        results.filter((result) => ['REUSED_RESERVATION', 'RETRY_LATER'].includes(result.decision)),
      ).toHaveLength(1);
      expect(new Set(results.map((result) => result.creationKey).filter(Boolean)).size).toBe(1);
      expect(
        await prisma.billingPixAttempt.count({
          where: { billingExecutionId: prepared.execution.id },
        }),
      ).toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'commits CREATING before one simulated POST and persists one confirmed PaymentIntent',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-confirmed';
      const token = `${prefix}IMPL4-CONFIRMED-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const adapter = {
        create: async () => {
          await Promise.resolve();
          calls += 1;
          const duringCall = await prisma.billingExecution.findUniqueOrThrow({
            where: { id: prepared.execution.id },
            include: { pixAttempts: { where: { isCurrent: true } } },
          });
          expect(duringCall).toMatchObject({ status: 'PROCESSING', pixStatus: 'CREATING' });
          expect(duringCall.pixAttempts).toEqual([
            expect.objectContaining({
              id: reservation.attemptId,
              status: 'CREATING',
              provider: 'DEPIX',
              startedAt: null,
              providerTransactionId: null,
            }),
          ]);
          return {
            kind: 'CONFIRMED' as const,
            requestDispatched: true as const,
            remoteEffect: 'CONFIRMED' as const,
            automaticRetryEligible: false as const,
            providerTransactionId: `${prefix}IMPL4-TX-${prepared.fixture.suffix}`,
            response: {
              id: `${prefix}IMPL4-TX-${prepared.fixture.suffix}`,
              amount: '30.00',
              status: 'WAITING_PAYMENT',
              qr_code_text: `${prefix}IMPL4-PIX-${prepared.fixture.suffix}`,
              qr_code_expires_at: '2026-11-23T23:59:59.000Z',
            },
          };
        },
      };
      const result = await service.createReservedPix(
        {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX',
          now,
        },
        adapter,
      );
      expect(result).toMatchObject({
        decision: 'CONFIRMED',
        adapterCalls: 1,
        remoteResult: 'CONFIRMED',
        automaticRetryEligible: false,
      });
      expect(calls).toBe(1);
      const [execution, attempt, intent, assertions] = await Promise.all([
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: reservation.attemptId! } }),
        prisma.paymentIntent.findUniqueOrThrow({ where: { id: result.paymentIntentId! } }),
        prisma.$queryRaw<Array<{ operation: string }>>`
          SELECT "operation" FROM public.billing_actor_assertions
          WHERE "billingExecutionId" = ${prepared.execution.id}::uuid
          ORDER BY "issuedAtEpoch" ASC
        `,
      ]);
      expect(execution).toMatchObject({
        status: 'WAITING_PIX',
        pixStatus: 'CONFIRMED',
        paymentIntentId: intent.id,
        leaseOwner: null,
        leaseToken: null,
      });
      expect(attempt).toMatchObject({
        status: 'CONFIRMED',
        paymentIntentId: intent.id,
        provider: 'DEPIX',
        providerTransactionId: `${prefix}IMPL4-TX-${prepared.fixture.suffix}`,
        reviewRequired: false,
      });
      expect(attempt.startedAt).not.toBeNull();
      expect(attempt.confirmedAt).not.toBeNull();
      expect(intent).toMatchObject({
        receivableId: prepared.fixture.receivable.id,
        paymentGroupId: null,
        provider: 'DEPIX',
        status: 'WAITING_PAYMENT',
        origin: 'BILLING',
        creationKey: reservation.creationKey,
        amount: new Prisma.Decimal('30.00'),
      });
      expect(assertions.map((item: { operation: string }) => item.operation)).toEqual([
        'billing.pix.reserve',
        'billing.pix.prepare-create',
        'billing.pix.record-create-result',
      ]);

      const restarted = await service.createReservedPix(
        {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX',
          now,
        },
        adapter,
      );
      expect(restarted).toMatchObject({ decision: 'REVIEW_REQUIRED', adapterCalls: 0 });
      expect(calls).toBe(1);
      await expect(
        prisma.billingPixAttempt.count({ where: { billingExecutionId: prepared.execution.id } }),
      ).resolves.toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes two workers at the preparation fence and increments the simulated POST once',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const serviceA = claimService(prisma, runtimeRole);
      const serviceB = claimService(peer, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-concurrent';
      const token = `${prefix}IMPL4-CONCURRENT-${prepared.fixture.suffix}`;
      const claim = await serviceA.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await serviceA.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const adapter = {
        create: async () => {
          await Promise.resolve();
          calls += 1;
          return {
            kind: 'REMOTE_RESULT_UNCERTAIN' as const,
            requestDispatched: true as const,
            remoteEffect: 'UNKNOWN' as const,
            automaticRetryEligible: false as const,
            providerTransactionId: null,
            code: 'FASTDEPIX_TIMEOUT',
            message: 'timeout after dispatch',
            httpStatus: null,
          };
        },
      };
      const input = {
        executionId: prepared.execution.id,
        expectedVersion: reservation.version!,
        owner,
        token,
        attemptId: reservation.attemptId!,
        creationKey: reservation.creationKey!,
        provider: 'DEPIX' as const,
        now,
      };
      const settled = await Promise.allSettled([
        serviceA.createReservedPix(input, adapter),
        serviceB.createReservedPix(input, adapter),
      ]);
      const rejected = settled.filter((item) => item.status === 'rejected');
      if (rejected.length > 0) throw rejected[0]!.reason;
      const results = settled
        .map((item) => (item.status === 'fulfilled' ? item.value : undefined))
        .filter((item) => item !== undefined);
      expect(calls).toBe(1);
      expect(results.filter((item) => item.adapterCalls === 1)).toHaveLength(1);
      expect(results.filter((item) => item.adapterCalls === 0)).toHaveLength(1);
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
      ).resolves.toMatchObject({
        status: 'REVIEW_REQUIRED',
        pixStatus: 'AMBIGUOUS',
        reviewRequired: true,
        leaseOwner: null,
      });
      await expect(
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: reservation.attemptId! } }),
      ).resolves.toMatchObject({
        status: 'AMBIGUOUS',
        reviewRequired: true,
        failureCode: 'FASTDEPIX_TIMEOUT',
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'persists every uncertain provider class conservatively and never retries after restart',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const outcomes = [
        {
          kind: 'HTTP_REJECTION_OBSERVED' as const,
          requestDispatched: true as const,
          remoteEffect: 'UNKNOWN' as const,
          automaticRetryEligible: false as const,
          httpStatus: 400,
          code: 'FASTDEPIX_REJECTED_400',
          message: 'observed 400',
        },
        {
          kind: 'REMOTE_RESULT_UNCERTAIN' as const,
          requestDispatched: true as const,
          remoteEffect: 'UNKNOWN' as const,
          automaticRetryEligible: false as const,
          providerTransactionId: null,
          httpStatus: 409,
          code: 'FASTDEPIX_HTTP_409_UNCERTAIN',
          message: 'observed 409',
        },
        {
          kind: 'REMOTE_RESULT_UNCERTAIN' as const,
          requestDispatched: true as const,
          remoteEffect: 'UNKNOWN' as const,
          automaticRetryEligible: false as const,
          providerTransactionId: null,
          httpStatus: 429,
          code: 'FASTDEPIX_HTTP_429_UNCERTAIN',
          message: 'observed 429',
        },
        {
          kind: 'REMOTE_RESULT_UNCERTAIN' as const,
          requestDispatched: true as const,
          remoteEffect: 'UNKNOWN' as const,
          automaticRetryEligible: false as const,
          providerTransactionId: null,
          httpStatus: 500,
          code: 'FASTDEPIX_HTTP_500_UNCERTAIN',
          message: 'observed 500',
        },
        {
          kind: 'REMOTE_RESULT_UNCERTAIN' as const,
          requestDispatched: true as const,
          remoteEffect: 'UNKNOWN' as const,
          automaticRetryEligible: false as const,
          providerTransactionId: null,
          httpStatus: 200,
          code: 'FASTDEPIX_SUCCESS_WITHOUT_TRANSACTION_ID',
          message: '2xx without provider transaction id',
        },
      ];
      for (const [index, outcome] of outcomes.entries()) {
        const prepared = await createClaimFixture();
        const service = claimService(prisma, runtimeRole);
        const now = new Date('2026-11-20T13:01:00.000Z');
        const owner = `impl4-uncertain-${index}`;
        const token = `${prefix}IMPL4-UNCERTAIN-${index}-${prepared.fixture.suffix}`;
        const claim = await service.claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: prepared.execution.version,
          owner,
          token,
          now,
        });
        const reservation = await service.reservePix({
          executionId: prepared.execution.id,
          expectedVersion: claim.version!,
          owner,
          token,
          provider: 'DEPIX',
          now,
        });
        let calls = 0;
        const adapter = {
          create: async () => {
            await Promise.resolve();
            calls += 1;
            return outcome;
          },
        };
        const input = {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX' as const,
          now,
        };
        await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
          decision: 'REVIEW_REQUIRED',
          adapterCalls: 1,
          remoteResult: outcome.kind,
          automaticRetryEligible: false,
        });
        await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
          decision: 'REVIEW_REQUIRED',
          adapterCalls: 0,
        });
        expect(calls).toBe(1);
      }
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps CREATING after result-persistence failure and blocks a second simulated POST',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-persistence-failure';
      const token = `${prefix}IMPL4-PERSISTENCE-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        ttlSeconds: 1,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const adapter = {
        create: async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 1100));
          return {
            kind: 'CONFIRMED' as const,
            requestDispatched: true as const,
            remoteEffect: 'CONFIRMED' as const,
            automaticRetryEligible: false as const,
            providerTransactionId: `${prefix}IMPL4-LOST-RESULT-${prepared.fixture.suffix}`,
            response: {
              id: `${prefix}IMPL4-LOST-RESULT-${prepared.fixture.suffix}`,
              amount: '30.00',
              status: 'WAITING_PAYMENT',
              qr_code_text: `${prefix}IMPL4-LOST-PIX-${prepared.fixture.suffix}`,
            },
          };
        },
      };
      const input = {
        executionId: prepared.execution.id,
        expectedVersion: reservation.version!,
        owner,
        token,
        attemptId: reservation.attemptId!,
        creationKey: reservation.creationKey!,
        provider: 'DEPIX' as const,
        now,
      };
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        adapterCalls: 1,
        reasons: [{ code: 'RESULT_PERSISTENCE_UNCERTAIN' }],
      });
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        adapterCalls: 0,
        reasons: [{ code: 'CREATE_ALREADY_PREPARED' }],
      });
      expect(calls).toBe(1);
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
      ).resolves.toMatchObject({ status: 'PROCESSING', pixStatus: 'CREATING' });
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: reservation.creationKey! } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'treats an adapter throw after preparation as ambiguous and does not retry it',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-adapter-throw';
      const token = `${prefix}IMPL4-THROW-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const input = {
        executionId: prepared.execution.id,
        expectedVersion: reservation.version!,
        owner,
        token,
        attemptId: reservation.attemptId!,
        creationKey: reservation.creationKey!,
        provider: 'DEPIX' as const,
        now,
      };
      const adapter = {
        create: async (): Promise<never> => {
          await Promise.resolve();
          calls += 1;
          throw new Error('simulated transport crash');
        },
      };
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        adapterCalls: 1,
        remoteResult: 'REMOTE_RESULT_UNCERTAIN',
      });
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        adapterCalls: 0,
      });
      expect(calls).toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'reviews a confirmed remote result when an overlapping intent appears during the mock call',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-intent-race';
      const token = `${prefix}IMPL4-INTENT-RACE-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const result = await service.createReservedPix(
        {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX',
          now,
        },
        {
          create: async () => {
            calls += 1;
            await createDirectClaimIntent(prepared, { amount: '31.00' });
            return {
              kind: 'CONFIRMED' as const,
              requestDispatched: true as const,
              remoteEffect: 'CONFIRMED' as const,
              automaticRetryEligible: false as const,
              providerTransactionId: `${prefix}IMPL4-RACE-TX-${prepared.fixture.suffix}`,
              response: {
                id: `${prefix}IMPL4-RACE-TX-${prepared.fixture.suffix}`,
                amount: '30.00',
                status: 'WAITING_PAYMENT',
                qr_code_text: `${prefix}IMPL4-RACE-PIX-${prepared.fixture.suffix}`,
              },
            };
          },
        },
      );
      expect(result).toMatchObject({
        decision: 'REVIEW_REQUIRED',
        adapterCalls: 1,
        remoteResult: 'CONFIRMED',
        reasons: [{ code: 'CONFIRMED_RESULT_REQUIRES_RECONCILIATION' }],
      });
      expect(calls).toBe(1);
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
      ).resolves.toMatchObject({
        status: 'REVIEW_REQUIRED',
        pixStatus: 'AMBIGUOUS',
        reviewRequired: true,
      });
      await expect(
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: reservation.attemptId! } }),
      ).resolves.toMatchObject({
        status: 'AMBIGUOUS',
        providerTransactionId: `${prefix}IMPL4-RACE-TX-${prepared.fixture.suffix}`,
        failureCode: 'CONCURRENT_PAYMENT_INTENT_CONFLICT',
      });
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: reservation.creationKey! } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps PRE_CALL_FAILURE distinct but requires review and never retries automatically',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl4-pre-call';
      const token = `${prefix}IMPL4-PRE-CALL-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      let calls = 0;
      const input = {
        executionId: prepared.execution.id,
        expectedVersion: reservation.version!,
        owner,
        token,
        attemptId: reservation.attemptId!,
        creationKey: reservation.creationKey!,
        provider: 'DEPIX' as const,
        now,
      };
      const adapter = {
        create: async () => {
          await Promise.resolve();
          calls += 1;
          return {
            kind: 'PRE_CALL_FAILURE' as const,
            requestDispatched: false as const,
            remoteEffect: 'ABSENT_PROVEN' as const,
            automaticRetryEligible: true as const,
            code: 'FASTDEPIX_PRE_CALL_VALIDATION_FAILED',
            message: 'request rejected before fetch',
          };
        },
      };
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        decision: 'PRE_CALL_FAILED',
        adapterCalls: 1,
        externalCallMayHaveStarted: false,
        automaticRetryEligible: false,
      });
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
      ).resolves.toMatchObject({
        status: 'REVIEW_REQUIRED',
        pixStatus: 'FAILED',
        reviewRequired: true,
      });
      await expect(service.createReservedPix(input, adapter)).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        adapterCalls: 0,
      });
      expect(calls).toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'reconciles an identified AMBIGUOUS attempt by GET only and reuses the persisted intent',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const setup = await ambiguousReconciliationFixture('impl5-ambiguous');
      let getCalls = 0;
      const adapter = {
        lookup: async (providerTransactionId: string) => {
          await Promise.resolve();
          getCalls += 1;
          return {
            kind: 'FOUND' as const,
            transaction: {
              providerTransactionId,
              state: 'WAITING_PAYMENT' as const,
              externalStatus: 'WAITING_PAYMENT',
              amount: '30.00',
              pixCopyPaste: `${prefix}IMPL5-PIX-${setup.prepared.fixture.suffix}`,
              qrCodeData: null,
              expiresAt: new Date('2026-11-23T23:59:59.000Z'),
              paidAt: null,
            },
          };
        },
      };
      const input = {
        executionId: setup.prepared.execution.id,
        expectedVersion: setup.execution.version,
        owner: 'impl5-reconciler',
        token: `${prefix}IMPL5-RECONCILE-${setup.prepared.fixture.suffix}`,
        attemptId: setup.reservation.attemptId!,
        creationKey: setup.reservation.creationKey!,
        provider: 'DEPIX' as const,
        providerTransactionId: setup.providerTransactionId,
      };
      const result = await setup.service.reconcilePix(input, adapter);
      expect(result).toMatchObject({
        decision: 'CONFIRMED',
        getCalls: 1,
        creationPostCalls: 0,
        providerTransactionId: setup.providerTransactionId,
      });
      expect(getCalls).toBe(1);
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: setup.reservation.creationKey! } }),
      ).resolves.toBe(1);
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: setup.prepared.execution.id } }),
      ).resolves.toMatchObject({ status: 'WAITING_PIX', pixStatus: 'CONFIRMED' });
      await expect(
        prisma.$queryRaw<Array<{ operation: string }>>`
          SELECT "operation" FROM public.billing_actor_assertions
          WHERE "billingExecutionId" = ${setup.prepared.execution.id}::uuid
          ORDER BY "consumedAt" ASC
        `,
      ).resolves.toContainEqual({ operation: 'billing.pix.reconcile-create-result' });

      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: setup.prepared.execution.id },
      });
      await expect(
        setup.service.reconcilePix({ ...input, expectedVersion: current.version }, adapter),
      ).resolves.toMatchObject({
        decision: 'REUSED_PAYMENT_INTENT',
        getCalls: 0,
        creationPostCalls: 0,
        paymentIntentId: result.paymentIntentId,
      });
      expect(getCalls).toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects a caller-supplied transaction id when the ambiguous attempt has no durable binding',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl5-no-id';
      const token = `${prefix}IMPL5-NO-ID-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      await service.createReservedPix(
        {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX',
          now,
        },
        {
          create: async () => {
            await Promise.resolve();
            return {
              kind: 'REMOTE_RESULT_UNCERTAIN' as const,
              requestDispatched: true as const,
              remoteEffect: 'UNKNOWN' as const,
              automaticRetryEligible: false as const,
              providerTransactionId: null,
              code: 'FASTDEPIX_TIMEOUT',
              message: 'timeout without id',
              httpStatus: null,
            };
          },
        },
      );
      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      let getCalls = 0;
      await expect(
        service.reconcilePix(
          {
            executionId: prepared.execution.id,
            expectedVersion: current.version,
            owner: 'impl5-no-id-reconciler',
            token: `${prefix}IMPL5-NO-ID-RECONCILE-${prepared.fixture.suffix}`,
            attemptId: reservation.attemptId!,
            creationKey: reservation.creationKey!,
            provider: 'DEPIX',
            providerTransactionId: `${prefix}IMPL5-OTHER-EXECUTION-${prepared.fixture.suffix}`,
          },
          {
            lookup: async () => {
              await Promise.resolve();
              getCalls += 1;
              throw new Error('must not query');
            },
          },
        ),
      ).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        getCalls: 0,
        creationPostCalls: 0,
        reasons: [{ code: 'REMOTE_TRANSACTION_UNBOUND' }],
      });
      expect(getCalls).toBe(0);
      await expect(
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: reservation.attemptId! } }),
      ).resolves.toMatchObject({ providerTransactionId: null, status: 'AMBIGUOUS' });
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: reservation.creationKey! } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps not-found, lookup failure, incompatible value and remote payment under review',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const cases = [
        {
          name: 'not-found',
          outcome: (id: string) => ({ kind: 'NOT_FOUND' as const, providerTransactionId: id }),
        },
        {
          name: 'lookup-error',
          outcome: (id: string) => ({
            kind: 'REMOTE_RESULT_UNCERTAIN' as const,
            providerTransactionId: id,
            code: 'FASTDEPIX_GET_500',
            message: 'simulated GET failed',
          }),
        },
        {
          name: 'wrong-amount',
          outcome: (id: string) => ({
            kind: 'FOUND' as const,
            transaction: {
              providerTransactionId: id,
              state: 'WAITING_PAYMENT' as const,
              externalStatus: 'WAITING_PAYMENT',
              amount: '31.00',
              pixCopyPaste: `${prefix}IMPL5-WRONG-AMOUNT`,
              expiresAt: new Date('2026-11-23T23:59:59.000Z'),
              paidAt: null,
            },
          }),
        },
        {
          name: 'paid',
          outcome: (id: string) => ({
            kind: 'FOUND' as const,
            transaction: {
              providerTransactionId: id,
              state: 'PAID' as const,
              externalStatus: 'PAID',
              amount: '30.00',
              pixCopyPaste: `${prefix}IMPL5-PAID`,
              expiresAt: null,
              paidAt: new Date('2026-11-20T13:01:30.000Z'),
            },
          }),
        },
      ];
      for (const item of cases) {
        const setup = await ambiguousReconciliationFixture(`impl5-${item.name}`);
        const result = await setup.service.reconcilePix(
          {
            executionId: setup.prepared.execution.id,
            expectedVersion: setup.execution.version,
            owner: `impl5-${item.name}-reconciler`,
            token: `${prefix}IMPL5-${item.name}-${setup.prepared.fixture.suffix}`,
            attemptId: setup.reservation.attemptId!,
            creationKey: setup.reservation.creationKey!,
            provider: 'DEPIX',
            providerTransactionId: setup.providerTransactionId,
          },
          {
            lookup: async (id) => {
              await Promise.resolve();
              return item.outcome(id);
            },
          },
        );
        expect(result).toMatchObject({
          decision: 'REVIEW_REQUIRED',
          getCalls: 1,
          creationPostCalls: 0,
        });
        await expect(
          prisma.paymentIntent.count({ where: { creationKey: setup.reservation.creationKey! } }),
        ).resolves.toBe(0);
      }
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'reuses one exact pre-existing Billing intent during identified reconciliation',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const setup = await ambiguousReconciliationFixture('impl5-existing-intent');
      const intent = await prisma.paymentIntent.create({
        data: {
          receivableId: setup.prepared.fixture.receivable.id,
          provider: 'DEPIX',
          providerTransactionId: setup.providerTransactionId,
          externalStatus: 'WAITING_PAYMENT',
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey: setup.reservation.creationKey!,
          amount: new Prisma.Decimal('30.00'),
          pixCopyPaste: `${prefix}IMPL5-EXISTING-PIX-${setup.prepared.fixture.suffix}`,
          expiresAt: new Date('2026-11-23T23:59:59.000Z'),
        },
      });
      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: setup.prepared.execution.id },
      });
      const result = await setup.service.reconcilePix(
        {
          executionId: setup.prepared.execution.id,
          expectedVersion: current.version,
          owner: 'impl5-existing-intent-reconciler',
          token: `${prefix}IMPL5-EXISTING-RECON-${setup.prepared.fixture.suffix}`,
          attemptId: setup.reservation.attemptId!,
          creationKey: setup.reservation.creationKey!,
          provider: 'DEPIX',
          providerTransactionId: setup.providerTransactionId,
        },
        {
          lookup: async (providerTransactionId) => {
            await Promise.resolve();
            return {
              kind: 'FOUND' as const,
              transaction: {
                providerTransactionId,
                state: 'WAITING_PAYMENT' as const,
                externalStatus: 'WAITING_PAYMENT',
                amount: '30.00',
                pixCopyPaste: intent.pixCopyPaste,
                expiresAt: intent.expiresAt,
                paidAt: null,
              },
            };
          },
        },
      );
      expect(result).toMatchObject({
        decision: 'CONFIRMED',
        paymentIntentId: intent.id,
        getCalls: 1,
        creationPostCalls: 0,
      });
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: setup.reservation.creationKey! } }),
      ).resolves.toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes two reconciliators without duplicating a PaymentIntent or any creation POST',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const setup = await ambiguousReconciliationFixture('impl5-concurrent');
      const serviceA = claimService(prisma, runtimeRole);
      const serviceB = claimService(peer, runtimeRole);
      let getCalls = 0;
      let releaseLookups: (() => void) | null = null;
      const bothLookups = new Promise<void>((resolve) => {
        releaseLookups = resolve;
      });
      const adapter = {
        lookup: async (providerTransactionId: string) => {
          getCalls += 1;
          if (getCalls === 2) releaseLookups?.();
          await bothLookups;
          return {
            kind: 'FOUND' as const,
            transaction: {
              providerTransactionId,
              state: 'WAITING_PAYMENT' as const,
              externalStatus: 'WAITING_PAYMENT',
              amount: '30.00',
              pixCopyPaste: `${prefix}IMPL5-CONCURRENT-PIX-${setup.prepared.fixture.suffix}`,
              expiresAt: new Date('2026-11-23T23:59:59.000Z'),
              paidAt: null,
            },
          };
        },
      };
      const common = {
        executionId: setup.prepared.execution.id,
        expectedVersion: setup.execution.version,
        attemptId: setup.reservation.attemptId!,
        creationKey: setup.reservation.creationKey!,
        provider: 'DEPIX' as const,
        providerTransactionId: setup.providerTransactionId,
      };
      const settled = await Promise.all([
        serviceA.reconcilePix(
          {
            ...common,
            owner: 'impl5-reconciler-a',
            token: `${prefix}IMPL5-RECON-A-${setup.prepared.fixture.suffix}`,
          },
          adapter,
        ),
        serviceB.reconcilePix(
          {
            ...common,
            owner: 'impl5-reconciler-b',
            token: `${prefix}IMPL5-RECON-B-${setup.prepared.fixture.suffix}`,
          },
          adapter,
        ),
      ]);
      expect(settled.filter((item) => item.decision === 'CONFIRMED')).toHaveLength(1);
      expect(settled.every((item) => item.creationPostCalls === 0)).toBe(true);
      expect(getCalls).toBe(2);
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: setup.reservation.creationKey! } }),
      ).resolves.toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps GET outside locks and blocks a late result after concurrent manual payment',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const setup = await ambiguousReconciliationFixture('impl5-payment-race');
      let getCalls = 0;
      const result = await setup.service.reconcilePix(
        {
          executionId: setup.prepared.execution.id,
          expectedVersion: setup.execution.version,
          owner: 'impl5-payment-reconciler',
          token: `${prefix}IMPL5-PAYMENT-RECON-${setup.prepared.fixture.suffix}`,
          attemptId: setup.reservation.attemptId!,
          creationKey: setup.reservation.creationKey!,
          provider: 'DEPIX',
          providerTransactionId: setup.providerTransactionId,
        },
        {
          lookup: async (providerTransactionId) => {
            getCalls += 1;
            await prisma.receivable.update({
              where: { id: setup.prepared.fixture.receivable.id },
              data: { status: 'PAGO', paidAt: new Date('2026-11-20T13:02:00.000Z') },
            });
            return {
              kind: 'FOUND' as const,
              transaction: {
                providerTransactionId,
                state: 'WAITING_PAYMENT' as const,
                externalStatus: 'WAITING_PAYMENT',
                amount: '30.00',
                pixCopyPaste: `${prefix}IMPL5-LATE-PIX-${setup.prepared.fixture.suffix}`,
                expiresAt: new Date('2026-11-23T23:59:59.000Z'),
                paidAt: null,
              },
            };
          },
        },
      );
      expect(result).toMatchObject({ getCalls: 1, creationPostCalls: 0 });
      expect(['RETRY_LATER', 'REVIEW_REQUIRED']).toContain(result.decision);
      expect(getCalls).toBe(1);
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: setup.reservation.creationKey! } }),
      ).resolves.toBe(0);
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: setup.prepared.execution.id } }),
      ).resolves.toMatchObject({
        status: 'REVIEW_REQUIRED',
        pixStatus: 'AMBIGUOUS',
        reviewRequired: true,
      });
      await expect(
        prisma.receivable.findUniqueOrThrow({
          where: { id: setup.prepared.fixture.receivable.id },
        }),
      ).resolves.toMatchObject({ status: 'PAGO' });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps an in-memory late transaction id unbound after persistence failure and lease expiry',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const owner = 'impl5-late-result';
      const token = `${prefix}IMPL5-LATE-${prepared.fixture.suffix}`;
      const providerTransactionId = `${prefix}IMPL5-LATE-TX-${prepared.fixture.suffix}`;
      const claim = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner,
        token,
        ttlSeconds: 1,
        now,
      });
      const reservation = await service.reservePix({
        executionId: prepared.execution.id,
        expectedVersion: claim.version!,
        owner,
        token,
        provider: 'DEPIX',
        now,
      });
      await service.createReservedPix(
        {
          executionId: prepared.execution.id,
          expectedVersion: reservation.version!,
          owner,
          token,
          attemptId: reservation.attemptId!,
          creationKey: reservation.creationKey!,
          provider: 'DEPIX',
          now,
        },
        {
          create: async () => {
            await new Promise((resolve) => setTimeout(resolve, 1100));
            return {
              kind: 'CONFIRMED' as const,
              requestDispatched: true as const,
              remoteEffect: 'CONFIRMED' as const,
              automaticRetryEligible: false as const,
              providerTransactionId,
              response: {
                id: providerTransactionId,
                amount: '30.00',
                status: 'WAITING_PAYMENT',
                qr_code_text: `${prefix}IMPL5-LATE-PIX-${prepared.fixture.suffix}`,
              },
            };
          },
        },
      );
      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      expect(current).toMatchObject({ status: 'PROCESSING', pixStatus: 'CREATING' });
      let getCalls = 0;
      await expect(
        service.reconcilePix(
          {
            executionId: prepared.execution.id,
            expectedVersion: current.version,
            owner: 'impl5-late-reconciler',
            token: `${prefix}IMPL5-LATE-RECON-${prepared.fixture.suffix}`,
            attemptId: reservation.attemptId!,
            creationKey: reservation.creationKey!,
            provider: 'DEPIX',
            providerTransactionId,
          },
          {
            lookup: async () => {
              await Promise.resolve();
              getCalls += 1;
              return {
                kind: 'FOUND' as const,
                transaction: {
                  providerTransactionId,
                  state: 'WAITING_PAYMENT' as const,
                  externalStatus: 'WAITING_PAYMENT',
                  amount: '30.00',
                  pixCopyPaste: `${prefix}IMPL5-LATE-PIX-${prepared.fixture.suffix}`,
                  expiresAt: new Date('2026-11-23T23:59:59.000Z'),
                  paidAt: null,
                },
              };
            },
          },
        ),
      ).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        getCalls: 0,
        creationPostCalls: 0,
        reasons: [{ code: 'REMOTE_TRANSACTION_UNBOUND' }],
      });
      expect(getCalls).toBe(0);
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: reservation.creationKey! } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'expires the prior ELIGIBLE decision and blocks concurrent financial changes before reserve',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const cases = [
        {
          name: 'intent',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) => {
            await createDirectClaimIntent(prepared, { amount: '31.00' });
          },
          decision: 'REVIEW_REQUIRED',
          code: 'ACTIVE_PIX_INCOMPATIBLE',
        },
        {
          name: 'manual-payment',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) => {
            await prisma.receivable.update({
              where: { id: prepared.fixture.receivable.id },
              data: { status: 'PAGO', paidAt: new Date('2026-11-20T00:00:00.000Z') },
            });
          },
          decision: 'BLOCKED',
          code: 'RECEIVABLE_NOT_PENDING',
        },
        {
          name: 'opt-in',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) => {
            await prisma.clientReference.update({
              where: { id: prepared.fixture.reference.id },
              data: { internationalBillingEnabled: false },
            });
          },
          decision: 'BLOCKED',
          code: 'REFERENCE_OPT_IN_REQUIRED',
        },
      ] as const;

      for (const scenario of cases) {
        const prepared = await createClaimFixture();
        const service = claimService(prisma, runtimeRole);
        const now = new Date('2026-11-20T13:01:00.000Z');
        const token = `${prefix}IMPL3-${scenario.name}-${prepared.fixture.suffix}`;
        const claimed = await service.claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: prepared.execution.version,
          owner: `impl3-${scenario.name}`,
          token,
          now,
        });
        expect(claimed.decision).toBe('ELIGIBLE');
        await scenario.mutate(prepared);
        const result = await service.reservePix({
          executionId: prepared.execution.id,
          expectedVersion: claimed.version!,
          owner: `impl3-${scenario.name}`,
          token,
          provider: 'DEPIX',
          now,
        });
        expect(result).toMatchObject({
          decision: scenario.decision,
          leaseRetained: false,
          externalCallStarted: false,
        });
        expect(result.reasons.some((reason) => reason.code === scenario.code)).toBe(true);
        expect(
          await prisma.billingPixAttempt.count({
            where: { billingExecutionId: prepared.execution.id },
          }),
        ).toBe(0);
      }
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'reuses one exact PaymentIntent and rejects wrong lease credentials without reservation',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const intent = await createDirectClaimIntent(prepared);
      const service = claimService(prisma, runtimeRole);
      const now = new Date('2026-11-20T13:01:00.000Z');
      const token = `${prefix}IMPL3-REUSE-${prepared.fixture.suffix}`;
      const claimed = await service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl3-reuse-worker',
        token,
        now,
      });
      await expect(
        service.reservePix({
          executionId: prepared.execution.id,
          expectedVersion: claimed.version!,
          owner: 'impl3-reuse-worker',
          token,
          provider: 'DEPIX',
          now,
        }),
      ).resolves.toMatchObject({
        decision: 'REUSE_PAYMENT_INTENT',
        paymentIntentId: intent.id,
        attemptId: null,
        leaseRetained: false,
      });

      const invalid = await createClaimFixture();
      const invalidClaim = await service.claimAndRevalidate({
        executionId: invalid.execution.id,
        expectedVersion: invalid.execution.version,
        owner: 'impl3-valid-owner',
        token: `${prefix}IMPL3-VALID-${invalid.fixture.suffix}`,
        now,
      });
      await expect(
        service.reservePix({
          executionId: invalid.execution.id,
          expectedVersion: invalidClaim.version!,
          owner: 'impl3-valid-owner',
          token: `${prefix}IMPL3-WRONG-${invalid.fixture.suffix}`,
          provider: 'DEPIX',
          now,
        }),
      ).resolves.toMatchObject({
        decision: 'RETRY_LATER',
        reasons: [{ code: 'LEASE_LOST' }],
        attemptId: null,
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects a compatible individual intent hidden beside an incompatible overlapping group intent',
    async () => {
      const prepared = await createClaimFixture();
      await createDirectClaimIntent(prepared);
      await createGroupedClaimIntent(prepared, { amount: '31.00' });

      const result = await claimPrepared(prepared, 'impl2-fix1-mixed');

      expect(result).toMatchObject({
        decision: 'REVIEW_REQUIRED',
        lease: { acquired: true, retained: false },
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });
      await expect(
        prisma.billingExecution.findUniqueOrThrow({ where: { id: prepared.execution.id } }),
      ).resolves.toMatchObject({
        leaseOwner: null,
        leaseToken: null,
        paymentIntentId: null,
        pixStatus: 'NOT_STARTED',
      });
      await expect(
        prisma.billingPixAttempt.count({ where: { billingExecutionId: prepared.execution.id } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'requires review for two overlapping active intents even when both look compatible',
    async () => {
      const prepared = await createClaimFixture();
      await createDirectClaimIntent(prepared);
      await createGroupedClaimIntent(prepared);

      await expect(claimPrepared(prepared, 'impl2-fix1-duplicate')).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        lease: { retained: false },
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'reuses only one exact active intent and rejects amount, provider and partial-set mismatches',
    async () => {
      const exact = await createClaimFixture();
      await createDirectClaimIntent(exact);
      const exactResult = await claimPrepared(exact, 'impl2-fix1-exact');
      expect(exactResult).toMatchObject({ decision: 'ELIGIBLE', lease: { retained: true } });
      await expect(
        claimService(prisma, runtimeRole!).releaseLease({
          executionId: exact.execution.id,
          expectedVersion: exactResult.version!,
          owner: exactResult.lease.owner,
          token: exactResult.lease.token!,
        }),
      ).resolves.toBe(true);

      const wrongAmount = await createClaimFixture();
      await createDirectClaimIntent(wrongAmount, { amount: '31.00' });
      await expect(claimPrepared(wrongAmount, 'impl2-fix1-amount')).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });

      const wrongProvider = await createClaimFixture();
      await prisma.client.update({
        where: { id: wrongProvider.fixture.client.id },
        data: { preferredPixProvider: 'FASTPIX' },
      });
      await createDirectClaimIntent(wrongProvider, { provider: 'FASTPAY' });
      await expect(claimPrepared(wrongProvider, 'impl2-fix1-provider')).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });

      const partial = await createClaimFixture();
      const extra = await prisma.receivable.create({
        data: {
          clientId: partial.fixture.client.id,
          clientReferenceId: partial.fixture.reference.id,
          description: `${prefix}EXTRA-RECEIVABLE-${partial.fixture.suffix}`,
          amount: new Prisma.Decimal('1.00'),
          dueDate: new Date('2026-12-23T00:00:00.000Z'),
          payerName: partial.fixture.client.name,
          payerPhone: partial.fixture.client.phone,
          payerPhoneNormalized: partial.fixture.client.phoneNormalized,
        },
      });
      await createGroupedClaimIntent(partial, {
        amount: '31.00',
        extraReceivableIds: [extra.id],
      });
      await expect(claimPrepared(partial, 'impl2-fix1-partial')).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'blocks paid evidence, reviews refunds and leaves expired or canceled intents inactive',
    async () => {
      const paid = await createClaimFixture();
      await createDirectClaimIntent(paid, { status: 'PAID', paidAt: new Date() });
      await expect(claimPrepared(paid, 'impl2-fix1-paid')).resolves.toMatchObject({
        decision: 'BLOCKED',
        reasons: [{ code: 'PAYMENT_ALREADY_PAID' }],
        lease: { retained: false },
      });

      const stalePaid = await createClaimFixture();
      await createDirectClaimIntent(stalePaid, {
        status: 'WAITING_PAYMENT',
        externalStatus: 'paid',
      });
      await expect(claimPrepared(stalePaid, 'impl2-fix1-stale-paid')).resolves.toMatchObject({
        decision: 'BLOCKED',
        reasons: [{ code: 'PAYMENT_ALREADY_PAID' }],
      });

      const refunded = await createClaimFixture();
      await createDirectClaimIntent(refunded, { status: 'REFUNDED' });
      await expect(claimPrepared(refunded, 'impl2-fix1-refunded')).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });

      for (const status of ['EXPIRED', 'CANCELED'] as const) {
        const terminal = await createClaimFixture();
        await createDirectClaimIntent(terminal, { status });
        const result = await claimPrepared(terminal, `impl2-fix1-${status.toLowerCase()}`);
        expect(result).toMatchObject({ decision: 'ELIGIBLE', lease: { retained: true } });
        await expect(
          claimService(prisma, runtimeRole!).releaseLease({
            executionId: terminal.execution.id,
            expectedVersion: result.version!,
            owner: result.lease.owner,
            token: result.lease.token!,
          }),
        ).resolves.toBe(true);
      }
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'revalidates intents created after selection and rejects a grouped intent owned by another client',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const selectedThenChanged = await createClaimFixture();
      const selection = await claimService(prisma, runtimeRole).select({
        now: new Date('2026-11-20T13:01:00.000Z'),
      });
      const candidate = selection.candidates.find(
        (item) => item.executionId === selectedThenChanged.execution.id,
      );
      expect(candidate).toBeDefined();
      await createDirectClaimIntent(selectedThenChanged, { amount: '31.00' });
      await expect(
        claimService(prisma, runtimeRole).claimAndRevalidate({
          executionId: candidate!.executionId,
          expectedVersion: candidate!.expectedVersion,
          owner: 'impl2-fix1-after-selection',
          token: `${prefix}AFTER-SELECTION-${selectedThenChanged.fixture.suffix}`,
          now: new Date('2026-11-20T13:01:00.000Z'),
        }),
      ).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
        lease: { retained: false },
      });

      const foreignGroup = await createClaimFixture();
      const otherClient = await createFixture();
      await createGroupedClaimIntent(foreignGroup, { clientId: otherClient.client.id });
      await expect(claimPrepared(foreignGroup, 'impl2-fix1-foreign-client')).resolves.toMatchObject(
        {
          decision: 'REVIEW_REQUIRED',
          reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
          lease: { retained: false },
        },
      );
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes a grouped intent inserted after the protected intent read',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      await createDirectClaimIntent(prepared);
      const service = claimService(prisma, runtimeRole);
      let releaseConversationBarrier!: () => void;
      const conversationBarrier = new Promise<void>((resolve) => {
        releaseConversationBarrier = resolve;
      });
      let conversationLocked!: () => void;
      const conversationLockReady = new Promise<void>((resolve) => {
        conversationLocked = resolve;
      });
      const blocker = peer.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE public.whatsapp_conversations IN ACCESS EXCLUSIVE MODE',
        );
        conversationLocked();
        await conversationBarrier;
      });
      await conversationLockReady;

      const claim = service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl2-fix2-claim',
        token: `${prefix}FIX2-CLAIM-${prepared.fixture.suffix}`,
        now: new Date('2026-11-20T13:01:00.000Z'),
      });

      let claimOwnsFinancialLock = false;
      for (let attempt = 0; attempt < 100 && !claimOwnsFinancialLock; attempt += 1) {
        const [probe] = await prisma.$queryRaw<Array<{ held: boolean }>>(Prisma.sql`
          SELECT NOT pg_try_advisory_xact_lock(
            hashtextextended(${`pix:receivable:${prepared.fixture.receivable.id}`}, 0)
          ) AS held
        `);
        claimOwnsFinancialLock = probe?.held === true;
        if (!claimOwnsFinancialLock) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!claimOwnsFinancialLock) {
        releaseConversationBarrier();
        await blocker;
        await claim;
      }
      expect(claimOwnsFinancialLock).toBe(true);

      let writerAcquiredFinancialLock = false;
      const writer = prisma.$transaction(async (tx) => {
        await acquireFinancialSetLocks(tx, [prepared.fixture.receivable.id]);
        writerAcquiredFinancialLock = true;
        const group = await tx.paymentGroup.create({
          data: {
            clientId: prepared.fixture.client.id,
            totalAmount: new Prisma.Decimal('31.00'),
            items: {
              create: {
                receivableId: prepared.fixture.receivable.id,
                amount: prepared.fixture.receivable.amount,
              },
            },
          },
        });
        return tx.paymentIntent.create({
          data: {
            paymentGroupId: group.id,
            provider: 'DEPIX',
            providerTransactionId: `${prefix}FIX2-RACE-${prepared.fixture.suffix}`,
            status: 'WAITING_PAYMENT',
            origin: 'BILLING',
            creationKey: `${prefix}FIX2-RACE-KEY-${prepared.fixture.suffix}`,
            amount: new Prisma.Decimal('31.00'),
            pixCopyPaste: `${prefix}FIX2-RACE-PIX-${prepared.fixture.suffix}`,
            expiresAt: new Date('2026-11-23T23:59:59.000Z'),
          },
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      const writerWasBlocked = !writerAcquiredFinancialLock;
      releaseConversationBarrier();
      await blocker;
      expect(writerWasBlocked).toBe(true);

      const first = await claim;
      expect(first).toMatchObject({ decision: 'ELIGIBLE', lease: { retained: true } });
      await writer;
      expect(writerAcquiredFinancialLock).toBe(true);
      expect(await prisma.paymentIntent.count()).toBe(2);
      await expect(
        service.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: first.version!,
          owner: first.lease.owner,
          token: first.lease.token!,
        }),
      ).resolves.toBe(true);

      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      await expect(
        service.claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: current.version,
          owner: 'impl2-fix2-revalidate',
          token: `${prefix}FIX2-REVALIDATE-${prepared.fixture.suffix}`,
          now: new Date('2026-11-20T13:01:00.000Z'),
        }),
      ).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        lease: { retained: false },
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });
      await expect(
        prisma.billingPixAttempt.count({ where: { billingExecutionId: prepared.execution.id } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes an individual intent inserted after the protected intent read',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const service = claimService(prisma, runtimeRole);
      let releaseConversationBarrier!: () => void;
      const conversationBarrier = new Promise<void>((resolve) => {
        releaseConversationBarrier = resolve;
      });
      let conversationLocked!: () => void;
      const conversationLockReady = new Promise<void>((resolve) => {
        conversationLocked = resolve;
      });
      const blocker = peer.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE public.whatsapp_conversations IN ACCESS EXCLUSIVE MODE',
        );
        conversationLocked();
        await conversationBarrier;
      });
      await conversationLockReady;

      const claim = service.claimAndRevalidate({
        executionId: prepared.execution.id,
        expectedVersion: prepared.execution.version,
        owner: 'impl2-fix2-direct-claim',
        token: `${prefix}FIX2-DIRECT-CLAIM-${prepared.fixture.suffix}`,
        now: new Date('2026-11-20T13:01:00.000Z'),
      });

      let claimOwnsFinancialLock = false;
      for (let attempt = 0; attempt < 100 && !claimOwnsFinancialLock; attempt += 1) {
        const [probe] = await prisma.$queryRaw<Array<{ held: boolean }>>(Prisma.sql`
          SELECT NOT pg_try_advisory_xact_lock(
            hashtextextended(${`pix:receivable:${prepared.fixture.receivable.id}`}, 0)
          ) AS held
        `);
        claimOwnsFinancialLock = probe?.held === true;
        if (!claimOwnsFinancialLock) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (!claimOwnsFinancialLock) {
        releaseConversationBarrier();
        await blocker;
        await claim;
      }
      expect(claimOwnsFinancialLock).toBe(true);

      let writerAcquiredFinancialLock = false;
      const writer = prisma.$transaction(async (tx) => {
        await acquireFinancialSetLocks(tx, [prepared.fixture.receivable.id]);
        writerAcquiredFinancialLock = true;
        return tx.paymentIntent.create({
          data: {
            receivableId: prepared.fixture.receivable.id,
            provider: 'DEPIX',
            providerTransactionId: `${prefix}FIX2-DIRECT-RACE-${prepared.fixture.suffix}`,
            status: 'WAITING_PAYMENT',
            origin: 'BILLING',
            creationKey: `${prefix}FIX2-DIRECT-RACE-KEY-${prepared.fixture.suffix}`,
            amount: new Prisma.Decimal('31.00'),
            pixCopyPaste: `${prefix}FIX2-DIRECT-RACE-PIX-${prepared.fixture.suffix}`,
            expiresAt: new Date('2026-11-23T23:59:59.000Z'),
          },
        });
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      const writerWasBlocked = !writerAcquiredFinancialLock;
      releaseConversationBarrier();
      await blocker;
      expect(writerWasBlocked).toBe(true);

      const first = await claim;
      expect(first).toMatchObject({ decision: 'ELIGIBLE', lease: { retained: true } });
      await writer;
      await expect(
        service.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: first.version!,
          owner: first.lease.owner,
          token: first.lease.token!,
        }),
      ).resolves.toBe(true);
      const current = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      await expect(
        service.claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: current.version,
          owner: 'impl2-fix2-direct-revalidate',
          token: `${prefix}FIX2-DIRECT-REVALIDATE-${prepared.fixture.suffix}`,
          now: new Date('2026-11-20T13:01:00.000Z'),
        }),
      ).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
        lease: { retained: false },
        reasons: [{ code: 'ACTIVE_PIX_INCOMPATIBLE' }],
      });
    },
  );

  it('orders overlapping financial sets without blocking an unrelated receivable', async () => {
    const [first, second] = await Promise.all([createFixture(), createFixture()]);
    let releaseFirst!: () => void;
    const firstBarrier = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstLocked!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      firstLocked = resolve;
    });
    const holder = prisma.$transaction(async (tx) => {
      await acquireFinancialSetLocks(tx, [first.receivable.id]);
      firstLocked();
      await firstBarrier;
    });
    await firstReady;

    let overlapAcquired = false;
    const overlap = peer.$transaction(async (tx) => {
      await acquireFinancialSetLocks(tx, [first.receivable.id]);
      overlapAcquired = true;
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await acquireFinancialSetLocks(tx, [second.receivable.id]);
        return true;
      }),
    ).resolves.toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const overlapWasBlocked = !overlapAcquired;
    releaseFirst();
    await Promise.all([holder, overlap]);
    expect(overlapWasBlocked).toBe(true);
    expect(overlapAcquired).toBe(true);
  });

  it.runIf(Boolean(runtimeRole))(
    'allows exactly one of two workers to retain the lease and rejects stale expectedVersion',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const services = [claimService(prisma, runtimeRole), claimService(peer, runtimeRole)];
      const now = new Date('2026-11-20T13:01:00.000Z');
      const results = await Promise.all(
        services.map((service, index) =>
          service.claimAndRevalidate({
            executionId: prepared.execution.id,
            expectedVersion: prepared.execution.version,
            owner: `impl2-worker-${index}`,
            token: `${prefix}CONCURRENT-${index}-${prepared.fixture.suffix}`,
            now,
          }),
        ),
      );
      expect(results.filter((result) => result.decision === 'ELIGIBLE')).toHaveLength(1);
      expect(results.filter((result) => result.decision === 'RETRY_LATER')).toHaveLength(1);
      const winner = results.find((result) => result.decision === 'ELIGIBLE')!;
      const persisted = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      expect(persisted.leaseOwner).toBe(winner.lease.owner);
      expect(persisted.version).toBe(prepared.execution.version + 1);
      await expect(
        services[0]!.claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: prepared.execution.version,
          owner: 'stale-worker',
          token: `${prefix}STALE-${prepared.fixture.suffix}`,
          now,
        }),
      ).resolves.toMatchObject({
        decision: 'RETRY_LATER',
        lease: { acquired: false },
        reasons: [{ code: 'EXPECTED_VERSION_STALE' }],
      });
      await expect(
        services[0]!.releaseLease({
          executionId: prepared.execution.id,
          expectedVersion: persisted.version,
          owner: winner.lease.owner,
          token: winner.lease.token!,
        }),
      ).resolves.toBe(true);
      expect(await financialEffectCounts()).toEqual([0, 0]);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'claims two independent executions concurrently and excludes future, cutoff and review rows',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const now = new Date('2026-11-20T13:01:00.000Z');
      const [first, second] = await Promise.all([createClaimFixture(), createClaimFixture()]);
      const future = await createClaimFixture({
        scheduledFor: new Date('2026-11-20T14:00:00.000Z'),
      });
      const beforeCutoff = await createClaimFixture({
        scheduledFor: new Date('2026-10-31T12:00:00.000Z'),
      });
      const review = await createClaimFixture({ reviewRequired: true });
      const selected = await claimService(prisma, runtimeRole).select({ now, limit: 100 });
      const ids = new Set(selected.candidates.map((candidate) => candidate.executionId));
      expect(ids.has(first.execution.id)).toBe(true);
      expect(ids.has(second.execution.id)).toBe(true);
      expect(ids.has(future.execution.id)).toBe(false);
      expect(ids.has(beforeCutoff.execution.id)).toBe(false);
      expect(ids.has(review.execution.id)).toBe(false);

      const initialResults = await Promise.all(
        [first, second].map((prepared, index) =>
          claimService(index === 0 ? prisma : peer, runtimeRole).claimAndRevalidate({
            executionId: prepared.execution.id,
            expectedVersion: prepared.execution.version,
            owner: `impl2-independent-${index}`,
            token: `${prefix}INDEPENDENT-${index}-${prepared.fixture.suffix}`,
            now,
          }),
        ),
      );
      const results = await Promise.all(
        initialResults.map(async (result, index) => {
          if (result.decision === 'ELIGIBLE') return result;
          expect(result).toMatchObject({
            decision: 'RETRY_LATER',
            reasons: [{ code: 'SERIALIZATION_RETRY' }],
          });
          const prepared = [first, second][index]!;
          const current = await prisma.billingExecution.findUniqueOrThrow({
            where: { id: prepared.execution.id },
          });
          return claimService(index === 0 ? prisma : peer, runtimeRole).claimAndRevalidate({
            executionId: prepared.execution.id,
            expectedVersion: current.version,
            owner: `impl2-independent-${index}-retry`,
            token: `${prefix}INDEPENDENT-RETRY-${index}-${prepared.fixture.suffix}`,
            now,
          });
        }),
      );
      expect(results.map((result) => result.decision)).toEqual(['ELIGIBLE', 'ELIGIBLE']);
      for (const result of results) {
        await expect(
          claimService(prisma, runtimeRole).releaseLease({
            executionId: result.executionId,
            expectedVersion: result.version!,
            owner: result.lease.owner,
            token: result.lease.token!,
          }),
        ).resolves.toBe(true);
      }
      expect(await financialEffectCounts()).toEqual([0, 0]);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'revalidates opt-in, payment, conversation, connection, phone, cutoff and review gates after lease',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const now = new Date('2026-11-20T13:01:00.000Z');
      const cases = [
        {
          expected: 'BLOCKED',
          code: 'REFERENCE_OPT_IN_REQUIRED',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) =>
            prisma.clientReference.update({
              where: { id: prepared.fixture.reference.id },
              data: { internationalBillingEnabled: false },
            }),
        },
        {
          expected: 'RETRY_LATER',
          code: 'LEASE_NOT_ACQUIRED',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) =>
            prisma.receivable.update({
              where: { id: prepared.fixture.receivable.id },
              data: { status: 'PAGO', paidAt: now },
            }),
        },
        {
          expected: 'RETRY_LATER',
          code: 'CONVERSATION_NOT_LINKED',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) =>
            prisma.whatsAppConversation.delete({ where: { id: prepared.conversation.id } }),
        },
        {
          expected: 'RETRY_LATER',
          code: 'WHATSAPP_CONNECTION_NOT_OPERATIONAL',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) =>
            prisma.whatsAppConnection.update({
              where: { id: prepared.connection.id },
              data: { status: 'DISCONNECTED', connected: false, loggedIn: false },
            }),
        },
        {
          expected: 'REVIEW_REQUIRED',
          code: 'PHONE_IDENTITY_MISMATCH',
          mutate: async (prepared: Awaited<ReturnType<typeof createClaimFixture>>) =>
            prisma.messageDispatch.update({
              where: { id: prepared.fixture.dispatch.id },
              data: { phone: '12025550123' },
            }),
        },
      ] as const;

      for (const [index, testCase] of cases.entries()) {
        const prepared = await createClaimFixture();
        await testCase.mutate(prepared);
        const result = await claimService(prisma, runtimeRole).claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: (
            await prisma.billingExecution.findUniqueOrThrow({
              where: { id: prepared.execution.id },
            })
          ).version,
          owner: `impl2-gate-${index}`,
          token: `${prefix}GATE-${index}-${prepared.fixture.suffix}`,
          now,
        });
        expect(result.decision).toBe(testCase.expected);
        expect(result.reasons.map((reason) => reason.code)).toContain(testCase.code);
        const persisted = await prisma.billingExecution.findUniqueOrThrow({
          where: { id: prepared.execution.id },
        });
        expect(persisted).toMatchObject({
          leaseOwner: null,
          leaseToken: null,
          paymentIntentId: null,
        });
      }

      const review = await createClaimFixture({ reviewRequired: true });
      await expect(
        claimService(prisma, runtimeRole).claimAndRevalidate({
          executionId: review.execution.id,
          expectedVersion: review.execution.version,
          owner: 'impl2-review',
          token: `${prefix}REVIEW-${review.fixture.suffix}`,
          now,
        }),
      ).resolves.toMatchObject({ decision: 'REVIEW_REQUIRED', lease: { retained: false } });

      const old = await createClaimFixture({ scheduledFor: new Date('2026-10-31T12:00:00.000Z') });
      const blocked = await claimService(prisma, runtimeRole).claimAndRevalidate({
        executionId: old.execution.id,
        expectedVersion: old.execution.version,
        owner: 'impl2-old',
        token: `${prefix}OLD-${old.fixture.suffix}`,
        now,
      });
      expect(blocked.decision).toBe('BLOCKED');
      expect(blocked.reasons.some((reason) => reason.code === 'BEFORE_GLOBAL_CUTOFF')).toBe(true);
      expect(await financialEffectCounts()).toEqual([0, 0]);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes a concurrent manual or webhook payment without creating PIX effects',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const prepared = await createClaimFixture();
      const now = new Date('2026-11-20T13:01:00.000Z');
      const [claim, payment] = await Promise.allSettled([
        claimService(prisma, runtimeRole).claimAndRevalidate({
          executionId: prepared.execution.id,
          expectedVersion: prepared.execution.version,
          owner: 'impl2-race',
          token: `${prefix}RACE-${prepared.fixture.suffix}`,
          now,
        }),
        peer.receivable.update({
          where: { id: prepared.fixture.receivable.id },
          data: { status: 'PAGO', paidAt: now },
        }),
      ]);
      expect(payment.status).toBe('fulfilled');
      if (claim.status === 'fulfilled') {
        expect(['ELIGIBLE', 'BLOCKED', 'RETRY_LATER']).toContain(claim.value.decision);
      } else {
        expect(String(claim.reason)).toMatch(/P2034|serialization|write conflict/i);
      }
      const final = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: prepared.execution.id },
      });
      expect(final.paymentIntentId).toBeNull();
      expect(await financialEffectCounts()).toEqual([0, 0]);
      await expect(
        claimService(prisma, runtimeRole).claimAndRevalidate({
          executionId: final.id,
          expectedVersion: final.version,
          owner: 'impl2-after-payment',
          token: `${prefix}AFTER-PAY-${prepared.fixture.suffix}`,
          now,
        }),
      ).resolves.toMatchObject({ decision: 'RETRY_LATER' });
    },
  );

  it('allows only one active PIX reservation under real concurrent inserts', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const settled = await Promise.allSettled([
      reserveAttempt(prisma, execution.id, `${prefix}ATTEMPT-A-${fixture.suffix}`),
      reserveAttempt(peer, execution.id, `${prefix}ATTEMPT-B-${fixture.suffix}`),
    ]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
    await expect(
      prisma.billingPixAttempt.count({
        where: { billingExecutionId: execution.id, status: 'RESERVED' },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back execution, exact set and audit event atomically', async () => {
    const fixture = await createFixture();

    await expect(
      prisma.$transaction(async (tx) => {
        await createExecution(tx, fixture);
        throw new Error('forced DATA1 rollback');
      }),
    ).rejects.toThrow('forced DATA1 rollback');

    await expect(
      prisma.billingExecution.count({ where: { clientId: fixture.client.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.billingExecutionReceivable.count({
        where: { receivableId: fixture.receivable.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.billingExecutionEvent.count({
        where: { billingExecution: { clientId: fixture.client.id } },
      }),
    ).resolves.toBe(0);
  });

  it('keeps PaymentIntent and MessageDispatch legacy rows compatible', async () => {
    const fixture = await createFixture();
    const legacyIntent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'FASTPIX',
        providerTransactionId: `${prefix}LEGACY-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });

    expect(legacyIntent).toMatchObject({ origin: 'MANUAL', creationKey: null });
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } }),
    ).resolves.toMatchObject({ paymentIntentId: null });
    await expect(
      prisma.billingExecution.count({ where: { messageDispatchId: fixture.dispatch.id } }),
    ).resolves.toBe(0);
  });

  it('links one confirmed Billing PaymentIntent to its execution, attempt and dispatch', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const creationKey = `${prefix}PI-${fixture.suffix}`;
    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'FASTPIX',
        status: 'CREATED',
        origin: 'BILLING',
        creationKey,
        amount: new Prisma.Decimal(30),
      },
    });
    await prisma.$transaction([
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { paymentIntentId: intent.id, pixStatus: 'RESERVED', version: { increment: 1 } },
      }),
      prisma.billingPixAttempt.create({
        data: {
          billingExecutionId: execution.id,
          paymentIntentId: intent.id,
          creationKey: `${prefix}ATTEMPT-${fixture.suffix}`,
          status: 'RESERVED',
        },
      }),
      prisma.messageDispatch.update({
        where: { id: fixture.dispatch.id },
        data: { paymentIntentId: intent.id },
      }),
    ]);

    await expect(
      prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
        include: { billingExecution: true, billingPixAttempt: true, messageDispatch: true },
      }),
    ).resolves.toMatchObject({
      origin: 'BILLING',
      creationKey,
      billingExecution: { id: execution.id },
      billingPixAttempt: { billingExecutionId: execution.id },
      messageDispatch: { id: fixture.dispatch.id },
    });
  });

  it('rejects mismatched PaymentIntent links atomically', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const [expectedIntent, mismatchedIntent] = await Promise.all([
      prisma.paymentIntent.create({
        data: {
          receivableId: fixture.receivable.id,
          provider: 'FASTPIX',
          origin: 'BILLING',
          creationKey: `${prefix}PI-EXPECTED-${fixture.suffix}`,
          amount: new Prisma.Decimal(30),
        },
      }),
      prisma.paymentIntent.create({
        data: {
          provider: 'FASTPIX',
          origin: 'BILLING',
          creationKey: `${prefix}PI-MISMATCH-${fixture.suffix}`,
          amount: new Prisma.Decimal(30),
        },
      }),
    ]);

    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: {
            paymentIntentId: expectedIntent.id,
            pixStatus: 'RESERVED',
            version: { increment: 1 },
          },
        }),
        prisma.billingPixAttempt.create({
          data: {
            billingExecutionId: execution.id,
            paymentIntentId: expectedIntent.id,
            creationKey: `${prefix}ATTEMPT-MISMATCH-${fixture.suffix}`,
            status: 'RESERVED',
          },
        }),
        prisma.messageDispatch.update({
          where: { id: fixture.dispatch.id },
          data: { paymentIntentId: mismatchedIntent.id },
        }),
      ]),
    ).rejects.toThrow(/Billing PaymentIntent links must identify one intent/);

    await expect(
      prisma.billingExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ paymentIntentId: null, pixStatus: 'NOT_STARTED' });
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } }),
    ).resolves.toMatchObject({ paymentIntentId: null });
  });

  it('enforces creationKey uniqueness and rejects invalid state transitions in PostgreSQL', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const creationKey = `${prefix}PI-UNIQUE-${fixture.suffix}`;
    await expect(
      prisma.paymentIntent.create({
        data: {
          receivableId: fixture.receivable.id,
          provider: 'DEPIX',
          origin: 'BILLING',
          amount: new Prisma.Decimal(30),
        },
      }),
    ).rejects.toThrow();
    await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'FASTPIX',
        origin: 'BILLING',
        creationKey,
        amount: new Prisma.Decimal(30),
      },
    });

    await expect(
      prisma.paymentIntent.create({
        data: {
          receivableId: fixture.receivable.id,
          provider: 'FASTPIX',
          origin: 'BILLING',
          creationKey,
          amount: new Prisma.Decimal(30),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', version: { increment: 1 } },
      }),
    ).rejects.toThrow(/Invalid BillingExecution status transition/);
  });

  it('persists valid state, lease and next-attempt data across a simulated worker restart', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    await prisma.billingExecution.update({
      where: { id: execution.id },
      data: {
        status: 'PROCESSING',
        nextAttemptAt: new Date('2026-11-20T13:10:00.000Z'),
        version: { increment: 1 },
      },
    });
    const leaseToken = `${prefix}LEASE-${fixture.suffix}`;
    const acquired = await prisma.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT public.billing_execution_acquire_lease(
        ${execution.id}::uuid,
        ${'worker-data1'},
        ${leaseToken},
        ${60}::integer
      ) AS acquired
    `;
    expect(acquired).toEqual([{ acquired: true }]);

    const persisted = await peer.billingExecution.findUniqueOrThrow({
      where: { id: execution.id },
    });
    expect(persisted).toMatchObject({
      status: 'PROCESSING',
      pixStatus: 'NOT_STARTED',
      deliveryStatus: 'NOT_READY',
      leaseOwner: 'worker-data1',
      leaseToken,
      version: 2,
    });
    expect(persisted.leaseExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('enforces typed audit actors and creates no external financial or delivery effect', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    await expect(
      prisma.billingExecutionEvent.count({ where: { billingExecutionId: execution.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.billingExecutionEvent.create({
        data: {
          billingExecutionId: execution.id,
          eventType: 'RECONCILED',
          actorType: 'USER',
          actorUserId: null,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.paymentIntent.count({ where: { receivableId: fixture.receivable.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.messageDispatch.findUniqueOrThrow({ where: { id: fixture.dispatch.id } }),
    ).resolves.toMatchObject({ status: 'SCHEDULED', providerMessageId: null, sentAt: null });
  });

  it('seals the exact receivable set, snapshots and reverse financial identity', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const secondReceivable = await prisma.receivable.create({
      data: {
        clientId: fixture.client.id,
        clientReferenceId: fixture.reference.id,
        description: `${prefix}RECEIVABLE-SECOND-${fixture.suffix}`,
        amount: new Prisma.Decimal(10),
        dueDate: new Date('2026-12-23T00:00:00.000Z'),
      },
    });

    await expect(
      prisma.billingExecutionReceivable.update({
        where: {
          billingExecutionId_receivableId: {
            billingExecutionId: execution.id,
            receivableId: fixture.receivable.id,
          },
        },
        data: { amountSnapshot: new Prisma.Decimal(31) },
      }),
    ).rejects.toThrow(/snapshots are immutable/);
    await expect(
      prisma.billingExecutionReceivable.create({
        data: {
          billingExecutionId: execution.id,
          receivableId: secondReceivable.id,
          clientReferenceId: fixture.reference.id,
          amountSnapshot: secondReceivable.amount,
          dueDateSnapshot: secondReceivable.dueDate,
          statusSnapshot: secondReceivable.status,
          referenceSnapshot: fixture.reference.reference,
        },
      }),
    ).rejects.toThrow(/exact receivable set identity mismatch/);
    await expect(
      prisma.receivable.update({
        where: { id: fixture.receivable.id },
        data: { amount: new Prisma.Decimal(31) },
      }),
    ).rejects.toThrow(/sealed by BillingExecution/);
    await expect(
      prisma.clientReference.update({
        where: { id: fixture.reference.id },
        data: { reference: `${prefix}CHANGED-${fixture.suffix}` },
      }),
    ).rejects.toThrow(/sealed by BillingExecution/);
  });

  it('rejects a Billing PaymentIntent for the wrong receivable or amount', async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const wrongIntent = await prisma.paymentIntent.create({
      data: {
        receivableId: other.receivable.id,
        provider: 'FASTPIX',
        origin: 'BILLING',
        creationKey: `${prefix}PI-WRONG-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });

    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: {
            paymentIntentId: wrongIntent.id,
            pixStatus: 'RESERVED',
            version: { increment: 1 },
          },
        }),
        prisma.billingPixAttempt.create({
          data: {
            billingExecutionId: execution.id,
            paymentIntentId: wrongIntent.id,
            creationKey: `${prefix}ATTEMPT-WRONG-${fixture.suffix}`,
          },
        }),
        prisma.messageDispatch.update({
          where: { id: fixture.dispatch.id },
          data: { paymentIntentId: wrongIntent.id },
        }),
      ]),
    ).rejects.toThrow(/receivable does not match execution set/);

    const wrongAmountIntent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'DEPIX',
        origin: 'BILLING',
        creationKey: `${prefix}PI-WRONG-AMOUNT-${fixture.suffix}`,
        amount: new Prisma.Decimal(29),
      },
    });
    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: {
            paymentIntentId: wrongAmountIntent.id,
            pixStatus: 'RESERVED',
            version: { increment: 1 },
          },
        }),
        prisma.billingPixAttempt.create({
          data: {
            billingExecutionId: execution.id,
            paymentIntentId: wrongAmountIntent.id,
            creationKey: `${prefix}ATTEMPT-WRONG-AMOUNT-${fixture.suffix}`,
          },
        }),
        prisma.messageDispatch.update({
          where: { id: fixture.dispatch.id },
          data: { paymentIntentId: wrongAmountIntent.id },
        }),
      ]),
    ).rejects.toThrow(/amount does not match execution snapshots/);
  });

  it('enforces cross-machine state consistency and immutable atomic audit', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);

    await expect(
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: {
          status: 'PROCESSING',
          deliveryStatus: 'READY',
          version: { increment: 1 },
        },
      }),
    ).rejects.toThrow(/delivery requires a confirmed PIX/);
    await prisma.billingExecution.update({
      where: { id: execution.id },
      data: { status: 'PROCESSING', version: { increment: 1 } },
    });
    const events = await prisma.billingExecutionEvent.findMany({
      where: { billingExecutionId: execution.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((event) => event.eventType)).toEqual([
      'EXECUTION_CREATED',
      'EXECUTION_STATUS_CHANGED',
    ]);
    await expect(
      prisma.billingExecutionEvent.update({
        where: { id: events[0]!.id },
        data: { reason: 'fabricated change' },
      }),
    ).rejects.toThrow(/events are immutable/);

    const attempt = await prisma.$transaction(async (tx) => {
      await tx.billingExecution.update({
        where: { id: execution.id },
        data: { pixStatus: 'RESERVED', version: { increment: 1 } },
      });
      return tx.billingPixAttempt.create({
        data: {
          billingExecutionId: execution.id,
          creationKey: `${prefix}ATTEMPT-CROSS-${fixture.suffix}`,
        },
      });
    });
    await prisma.$transaction([
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { pixStatus: 'CREATING', version: { increment: 1 } },
      }),
      prisma.billingPixAttempt.update({ where: { id: attempt.id }, data: { status: 'CREATING' } }),
    ]);
    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: { pixStatus: 'CONFIRMED', version: { increment: 1 } },
        }),
        prisma.billingPixAttempt.update({
          where: { id: attempt.id },
          data: { status: 'CONFIRMED' },
        }),
      ]),
    ).rejects.toThrow(/requires a PaymentIntent/);

    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'DEPIX',
        origin: 'BILLING',
        creationKey: `${prefix}PI-CROSS-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'WAITING_PAYMENT' },
    });
    await prisma.$transaction([
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: {
          status: 'WAITING_PIX',
          pixStatus: 'CONFIRMED',
          paymentIntentId: intent.id,
          version: { increment: 1 },
        },
      }),
      prisma.billingPixAttempt.update({
        where: { id: attempt.id },
        data: { status: 'CONFIRMED', paymentIntentId: intent.id },
      }),
      prisma.messageDispatch.update({
        where: { id: fixture.dispatch.id },
        data: { paymentIntentId: intent.id },
      }),
    ]);
    await prisma.billingExecution.update({
      where: { id: execution.id },
      data: {
        status: 'READY_TO_SEND',
        deliveryStatus: 'READY',
        version: { increment: 1 },
      },
    });
    await expect(
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { status: 'COMPLETED', version: { increment: 1 } },
      }),
    ).rejects.toThrow(/requires SENT delivery/);
  });

  it('prevents a new PIX reservation after a paid attempt', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'FASTPIX',
        origin: 'BILLING',
        creationKey: `${prefix}PI-PAID-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });
    const attempt = await prisma.$transaction(async (tx) => {
      await tx.billingExecution.update({
        where: { id: execution.id },
        data: { paymentIntentId: intent.id, pixStatus: 'RESERVED', version: { increment: 1 } },
      });
      await tx.messageDispatch.update({
        where: { id: fixture.dispatch.id },
        data: { paymentIntentId: intent.id },
      });
      return tx.billingPixAttempt.create({
        data: {
          billingExecutionId: execution.id,
          paymentIntentId: intent.id,
          creationKey: `${prefix}ATTEMPT-PAID-${fixture.suffix}`,
        },
      });
    });
    await prisma.paymentIntent.update({
      where: { id: intent.id },
      data: { status: 'WAITING_PAYMENT' },
    });
    for (const status of ['CREATING', 'CONFIRMED'] as const) {
      await prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: { pixStatus: status, version: { increment: 1 } },
        }),
        prisma.billingPixAttempt.update({ where: { id: attempt.id }, data: { status } }),
      ]);
    }
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { status: 'PAID' } });
    await expect(
      prisma.billingExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ pixStatus: 'PAID' });
    await expect(
      prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: attempt.id } }),
    ).resolves.toMatchObject({ status: 'PAID' });

    await expect(
      prisma.$transaction([
        prisma.billingPixAttempt.update({
          where: { id: attempt.id },
          data: { isCurrent: false },
        }),
        prisma.billingPixAttempt.create({
          data: {
            billingExecutionId: execution.id,
            creationKey: `${prefix}ATTEMPT-AFTER-PAID-${fixture.suffix}`,
          },
        }),
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: { pixStatus: 'RESERVED', version: { increment: 1 } },
        }),
      ]),
    ).rejects.toThrow(/PAID -> RESERVED|paid Billing PIX cannot be replaced/);
  });

  it('enforces provider transaction uniqueness across PIX attempts', async () => {
    const first = await createFixture();
    const second = await createFixture();
    const firstExecution = await createExecution(prisma, first);
    const secondExecution = await createExecution(prisma, second);
    const providerTransactionId = `${prefix}PROVIDER-TX-${first.suffix}`;
    await prisma.$transaction([
      prisma.billingExecution.update({
        where: { id: firstExecution.id },
        data: { pixStatus: 'RESERVED', version: { increment: 1 } },
      }),
      prisma.billingPixAttempt.create({
        data: {
          billingExecutionId: firstExecution.id,
          creationKey: `${prefix}ATTEMPT-TX-A-${first.suffix}`,
          provider: 'DEPIX',
          providerTransactionId,
        },
      }),
    ]);
    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: secondExecution.id },
          data: { pixStatus: 'RESERVED', version: { increment: 1 } },
        }),
        prisma.billingPixAttempt.create({
          data: {
            billingExecutionId: secondExecution.id,
            creationKey: `${prefix}ATTEMPT-TX-B-${second.suffix}`,
            provider: 'DEPIX',
            providerTransactionId,
          },
        }),
      ]),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('acquires, renews, releases and takes over leases atomically', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const [first, second] = await Promise.all([
      acquireLease(prisma, execution.id, 'worker-a', `${prefix}LEASE-A-${fixture.suffix}`, 60),
      acquireLease(peer, execution.id, 'worker-b', `${prefix}LEASE-B-${fixture.suffix}`, 60),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const winnerOwner = first ? 'worker-a' : 'worker-b';
    const winnerToken = first
      ? `${prefix}LEASE-A-${fixture.suffix}`
      : `${prefix}LEASE-B-${fixture.suffix}`;
    await expect(renewLease(prisma, execution.id, 'wrong-worker', winnerToken, 60)).resolves.toBe(
      false,
    );
    await expect(renewLease(prisma, execution.id, winnerOwner, winnerToken, 60)).resolves.toBe(
      true,
    );
    await expect(
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { leaseToken: `${prefix}BYPASS-${fixture.suffix}` },
      }),
    ).rejects.toThrow(/atomic lease functions/);
    await expect(releaseLease(prisma, execution.id, winnerOwner, winnerToken)).resolves.toBe(true);
    await expect(
      acquireLease(
        prisma,
        execution.id,
        'worker-expiring',
        `${prefix}LEASE-C-${fixture.suffix}`,
        1,
      ),
    ).resolves.toBe(true);
    await prisma.$queryRaw`SELECT 1::integer AS value FROM pg_sleep(1.1)`;
    await expect(
      acquireLease(peer, execution.id, 'worker-takeover', `${prefix}LEASE-D-${fixture.suffix}`, 60),
    ).resolves.toBe(true);
  });

  it('preserves append-only history and supersedes a pending financial identity exactly once', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const item = await prisma.billingExecutionReceivable.findFirstOrThrow({
      where: { billingExecutionId: execution.id },
    });
    const event = await prisma.billingExecutionEvent.findFirstOrThrow({
      where: { billingExecutionId: execution.id },
    });

    await expect(prisma.billingExecution.delete({ where: { id: execution.id } })).rejects.toThrow(
      /financial records are immutable/,
    );
    await expect(
      prisma.billingExecutionReceivable.delete({ where: { id: item.id } }),
    ).rejects.toThrow(/financial records are immutable/);
    await expect(
      prisma.billingExecutionEvent.update({ where: { id: event.id }, data: { reason: 'tamper' } }),
    ).rejects.toThrow(/immutable and trigger-generated/);
    await expect(prisma.billingExecutionEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /immutable and trigger-generated/,
    );

    const calls = [
      amendReceivable(prisma, fixture.receivable.id, execution.id, 0, 45, '2026-11-24'),
      amendReceivable(peer, fixture.receivable.id, execution.id, 0, 46, '2026-11-25'),
    ];
    const settled = await Promise.allSettled(calls);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const executions = await prisma.billingExecution.findMany({
      where: { clientId: fixture.client.id },
      orderBy: { createdAt: 'asc' },
      include: { receivables: true },
    });
    expect(executions).toHaveLength(2);
    expect(executions[0]).toMatchObject({
      id: execution.id,
      isCurrent: false,
      status: 'CANCELED',
      pixStatus: 'CANCELED',
    });
    expect(executions[0]!.receivables[0]!.amountSnapshot.toString()).toBe('30');
    expect(executions[1]).toMatchObject({
      isCurrent: true,
      status: 'REVIEW_REQUIRED',
      pixStatus: 'NOT_STARTED',
      supersedesExecutionId: execution.id,
      lastActorType: 'SYSTEM',
    });
    expect(['45', '46']).toContain(executions[1]!.receivables[0]!.amountSnapshot.toString());
    expect(executions[1]!.executionKey).not.toBe(execution.executionKey);
    await expect(
      prisma.billingExecutionEvent.count({ where: { billingExecutionId: execution.id } }),
    ).resolves.toBeGreaterThan(1);
  });

  it('rejects a foreign dispatch, provider mismatch and CONFIRMED intent still in CREATED', async () => {
    const fixture = await createFixture();
    const other = await createFixture();
    const execution = await createExecution(prisma, fixture);

    await expect(
      prisma.messageDispatch.update({
        where: { id: fixture.dispatch.id },
        data: { clientId: other.client.id },
      }),
    ).rejects.toThrow(/dispatch identity mismatch/);

    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'DEPIX',
        providerTransactionId: `${prefix}PI-TX-${fixture.suffix}`,
        origin: 'BILLING',
        creationKey: `${prefix}PI-CHAIN-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });
    const attempt = await reserveAttempt(
      prisma,
      execution.id,
      `${prefix}ATTEMPT-CHAIN-${fixture.suffix}`,
    );
    await prisma.$transaction([
      prisma.billingExecution.update({
        where: { id: execution.id },
        data: { pixStatus: 'CREATING', version: { increment: 1 } },
      }),
      prisma.billingPixAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'CREATING',
          provider: 'DEPIX',
          providerTransactionId: `${prefix}ATTEMPT-TX-${fixture.suffix}`,
        },
      }),
    ]);
    await expect(
      prisma.$transaction([
        prisma.billingExecution.update({
          where: { id: execution.id },
          data: { paymentIntentId: intent.id, pixStatus: 'CONFIRMED', version: { increment: 1 } },
        }),
        prisma.billingPixAttempt.update({
          where: { id: attempt.id },
          data: { paymentIntentId: intent.id, status: 'CONFIRMED' },
        }),
        prisma.messageDispatch.update({
          where: { id: fixture.dispatch.id },
          data: { paymentIntentId: intent.id },
        }),
      ]),
    ).rejects.toThrow(
      /provider transaction (?:mismatch|does not match PaymentIntent)|requires a confirmed PaymentIntent/,
    );
  });

  it('requires explicit AMBIGUOUS reconciliation evidence and records the declared actor', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const user = await prisma.user.create({
      data: {
        name: `${prefix}USER-${fixture.suffix}`,
        email: `data1-test-${fixture.suffix}@example.invalid`,
        passwordHash: 'not-used-by-data1-test',
      },
    });
    const owner = 'worker-ambiguous';
    const token = `${prefix}LEASE-AMB-${fixture.suffix}`;
    await expect(acquireLease(prisma, execution.id, owner, token, 60)).resolves.toBe(true);
    const attemptId = await reserveWithLease(
      prisma,
      execution.id,
      1,
      owner,
      token,
      `${prefix}RESERVE-AMB-${fixture.suffix}`,
      'USER',
      user.id,
    );
    await transitionWithLease(
      prisma,
      execution.id,
      2,
      owner,
      token,
      'PROCESSING',
      'CREATING',
      'NOT_READY',
      null,
      'SYSTEM',
      null,
      null,
    );
    await transitionWithLease(
      prisma,
      execution.id,
      3,
      owner,
      token,
      'WAITING_PIX',
      'AMBIGUOUS',
      'NOT_READY',
      null,
      'SYSTEM',
      null,
      null,
    );
    await expect(
      transitionWithLease(
        prisma,
        execution.id,
        4,
        owner,
        token,
        'WAITING_PIX',
        'FAILED',
        'NOT_READY',
        null,
        'WEBHOOK',
        null,
        null,
      ),
    ).rejects.toThrow(/reconciliation evidence/);
    await transitionWithLease(
      prisma,
      execution.id,
      4,
      owner,
      token,
      'WAITING_PIX',
      'FAILED',
      'NOT_READY',
      null,
      'WEBHOOK',
      null,
      'Provider confirmou ausencia da transacao.',
    );
    await expect(
      prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      reconciliationEvidence: 'Provider confirmou ausencia da transacao.',
    });
    const actors = await prisma.billingExecutionEvent.findMany({
      where: { billingExecutionId: execution.id },
      select: { actorType: true, actorUserId: true },
    });
    expect(actors).toEqual(
      expect.arrayContaining([
        { actorType: 'USER', actorUserId: user.id },
        { actorType: 'SYSTEM', actorUserId: null },
        { actorType: 'WEBHOOK', actorUserId: null },
      ]),
    );
  });

  it('supports the complete confirmed PIX delivery path and requires persisted send evidence', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const owner = 'worker-complete';
    const token = `${prefix}LEASE-COMPLETE-${fixture.suffix}`;
    const providerTransactionId = `${prefix}PROVIDER-COMPLETE-${fixture.suffix}`;
    await expect(acquireLease(prisma, execution.id, owner, token, 60)).resolves.toBe(true);
    const attemptId = await reserveWithLease(
      prisma,
      execution.id,
      1,
      owner,
      token,
      `${prefix}RESERVE-COMPLETE-${fixture.suffix}`,
      'SYSTEM',
      null,
    );
    await prisma.billingPixAttempt.update({
      where: { id: attemptId },
      data: { provider: 'DEPIX', providerTransactionId },
    });
    await transitionWithLease(
      prisma,
      execution.id,
      2,
      owner,
      token,
      'PROCESSING',
      'CREATING',
      'NOT_READY',
      null,
      'SYSTEM',
      null,
      null,
    );
    const intent = await prisma.paymentIntent.create({
      data: {
        receivableId: fixture.receivable.id,
        provider: 'DEPIX',
        providerTransactionId,
        status: 'WAITING_PAYMENT',
        origin: 'BILLING',
        creationKey: `${prefix}PI-COMPLETE-${fixture.suffix}`,
        amount: new Prisma.Decimal(30),
      },
    });
    await transitionWithLease(
      prisma,
      execution.id,
      3,
      owner,
      token,
      'WAITING_PIX',
      'CONFIRMED',
      'NOT_READY',
      intent.id,
      'WEBHOOK',
      null,
      null,
    );
    await transitionWithLease(
      prisma,
      execution.id,
      4,
      owner,
      token,
      'READY_TO_SEND',
      'CONFIRMED',
      'READY',
      intent.id,
      'SYSTEM',
      null,
      null,
    );
    await transitionWithLease(
      prisma,
      execution.id,
      5,
      owner,
      token,
      'PROCESSING',
      'CONFIRMED',
      'SENDING',
      intent.id,
      'SYSTEM',
      null,
      null,
    );
    await expect(
      transitionWithLease(
        prisma,
        execution.id,
        6,
        owner,
        token,
        'COMPLETED',
        'CONFIRMED',
        'SENT',
        intent.id,
        'SYSTEM',
        null,
        null,
      ),
    ).rejects.toThrow(/persisted provider send evidence/);

    await prisma.$transaction(async (tx) => {
      await tx.messageDispatch.update({
        where: { id: fixture.dispatch.id },
        data: {
          status: 'SENT',
          providerMessageId: `${prefix}MESSAGE-${fixture.suffix}`,
          sentAt: new Date('2026-11-20T13:05:00.000Z'),
        },
      });
      await transitionWithLease(
        tx,
        execution.id,
        6,
        owner,
        token,
        'COMPLETED',
        'CONFIRMED',
        'SENT',
        intent.id,
        'SYSTEM',
        null,
        null,
      );
    });
    await expect(
      prisma.billingExecution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ status: 'COMPLETED', deliveryStatus: 'SENT' });
  });

  it('blocks reservation after terminal evidence and serializes a concurrent manual payment', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const owner = 'worker-payment';
    const token = `${prefix}LEASE-PAYMENT-${fixture.suffix}`;
    await expect(acquireLease(prisma, execution.id, owner, token, 60)).resolves.toBe(true);

    const settled = await Promise.allSettled([
      reserveWithLease(
        prisma,
        execution.id,
        1,
        owner,
        token,
        `${prefix}RESERVE-PAYMENT-${fixture.suffix}`,
        'SYSTEM',
        null,
      ),
      peer.receivable.update({
        where: { id: fixture.receivable.id },
        data: { status: 'PAGO', paidAt: new Date('2026-11-23T12:00:00.000Z') },
      }),
    ]);
    expect(settled.some((result) => result.status === 'fulfilled')).toBe(true);
    const current = await prisma.billingExecution.findUniqueOrThrow({
      where: { id: execution.id },
    });
    expect(['CANCELED', 'REVIEW_REQUIRED']).toContain(current.status);
    await expect(
      prisma.billingPixAttempt.count({
        where: { billingExecutionId: execution.id, status: { in: ['RESERVED', 'CREATING'] } },
      }),
    ).resolves.toBe(0);
    await expect(
      reserveWithLease(
        prisma,
        execution.id,
        current.version,
        owner,
        token,
        `${prefix}RESERVE-AFTER-PAID-${fixture.suffix}`,
        'SYSTEM',
        null,
      ),
    ).rejects.toThrow(/not eligible|terminal financial evidence/);
  });

  it('shares the exact typed UTF-8 canonical encoding with PostgreSQL', async () => {
    const [vector] = await prisma.$queryRaw<
      Array<{ nullValue: string; emptyValue: string; utf8Value: string; spacingValue: string }>
    >`
      SELECT public.billing_actor_canonical_value('S', ${null}::text) AS "nullValue",
        public.billing_actor_canonical_value('S', ${''}) AS "emptyValue",
        public.billing_actor_canonical_value('S', ${'cobrança'}) AS "utf8Value",
        public.billing_actor_canonical_value('S', ${'\u00a0worker\u00a0'}) AS "spacingValue"
    `;
    expect(vector).toEqual({
      nullValue: canonicalBillingActorValue('S', null),
      emptyValue: canonicalBillingActorValue('S', ''),
      utf8Value: canonicalBillingActorValue('S', 'cobrança'),
      spacingValue: canonicalBillingActorValue('S', '\u00a0worker\u00a0'),
    });
    await expect(
      prisma.$queryRaw`SELECT public.billing_actor_canonical_value('S', ${'line\nbreak'})`,
    ).rejects.toThrow(/control-free NFC text/);
    await expect(
      prisma.$queryRaw`SELECT public.billing_actor_canonical_value('S', ${'cobranc\u0327a'})`,
    ).rejects.toThrow(/control-free NFC text/);

    const context = billingReceivableAmendAttestationContext({
      billingExecutionId: '11111111-1111-4111-8111-111111111111',
      messageDispatchId: '22222222-2222-4222-8222-222222222222',
      receivableId: '33333333-3333-4333-8333-333333333333',
      financialSetDigest: 'a'.repeat(64),
      expectedVersion: 7,
      amount: '50.00',
      dueDate: '2026-11-23',
      description: 'Renovação — Plano Pró',
      reason: 'Ajuste administrativo autorizado.',
    });
    const unsigned = {
      ...context,
      actorType: 'SYSTEM' as const,
      actorUserId: null,
      actorPrincipal: 'receivable-cycle',
      actorIssuedAt: 1_798_761_600,
      actorNonce: '44444444-4444-4444-8444-444444444444',
      actorKeyId: 'system-test-v1',
    };
    const typescriptPayload = billingActorAttestationPayload(unsigned);
    const [crossVector] = await prisma.$queryRaw<
      Array<{ payload: string; signature: string; argumentsDigest: string }>
    >`
      WITH values AS (
        SELECT
          public.billing_actor_canonical_value('V', 'billing-actor:v2')
          || public.billing_actor_canonical_value('E', ${context.operation})
          || public.billing_actor_canonical_value('U', ${context.billingExecutionId}::uuid::text)
          || public.billing_actor_canonical_value('U', ${context.messageDispatchId}::uuid::text)
          || public.billing_actor_canonical_value('U', ${context.receivableId}::uuid::text)
          || public.billing_actor_canonical_value('H', ${context.financialSetDigest})
          || public.billing_actor_canonical_value('I', ${context.expectedVersion}::integer::text)
          || public.billing_actor_canonical_value('H', ${context.argumentsDigest})
          || public.billing_actor_canonical_value('E', ${unsigned.actorType})
          || public.billing_actor_canonical_value('U', ${null}::uuid::text)
          || public.billing_actor_canonical_value('S', ${unsigned.actorPrincipal})
          || public.billing_actor_canonical_value('I', ${unsigned.actorIssuedAt}::bigint::text)
          || public.billing_actor_canonical_value('U', ${unsigned.actorNonce}::uuid::text)
          || public.billing_actor_canonical_value('S', ${unsigned.actorKeyId}) AS payload,
          public.billing_actor_canonical_value('V', 'billing-operation-args:v1')
          || public.billing_actor_canonical_value('M', ${'50.00'}::numeric(12,2)::text)
          || public.billing_actor_canonical_value('D', ${'2026-11-23'}::date::text)
          || public.billing_actor_canonical_value('S', ${'Renovação — Plano Pró'})
          || public.billing_actor_canonical_value('S', btrim(${'Ajuste administrativo autorizado.'}))
            AS arguments_payload
      )
      SELECT payload,
        encode(public.hmac(convert_to(payload, 'UTF8'), convert_to(${actorSecrets.SYSTEM}, 'UTF8'), 'sha256'), 'hex') AS signature,
        encode(public.digest(convert_to(arguments_payload, 'UTF8'), 'sha256'), 'hex') AS "argumentsDigest"
      FROM values
    `;
    expect(crossVector).toEqual({
      payload: typescriptPayload,
      signature: createHmac('sha256', actorSecrets.SYSTEM).update(typescriptPayload).digest('hex'),
      argumentsDigest: context.argumentsDigest,
    });
  });

  it('rejects the same malformed UUID, date and monetary vectors in TypeScript and PostgreSQL', async () => {
    const common = {
      billingExecutionId: '11111111-1111-4111-8111-111111111111',
      messageDispatchId: '22222222-2222-4222-8222-222222222222',
      receivableId: '33333333-3333-4333-8333-333333333333',
      financialSetDigest: 'a'.repeat(64),
      expectedVersion: 7,
      amount: '50.00',
      dueDate: '2026-11-23',
      description: 'DATA1-TEST-CROSS-VECTOR',
      reason: 'Ajuste administrativo autorizado em teste DATA1.',
    };
    const nbspUuid = `\u00a0${common.billingExecutionId}\u00a0`;
    expect(() =>
      billingReceivableAmendAttestationContext({ ...common, billingExecutionId: nbspUuid }),
    ).toThrow(/UUID/);
    await expect(prisma.$queryRaw`SELECT ${nbspUuid}::uuid`).rejects.toThrow(/uuid/);

    for (const dueDate of ['2026-1-1', '2026-02-31']) {
      expect(() => billingReceivableAmendAttestationContext({ ...common, dueDate })).toThrow(
        /date/,
      );
      await expect(
        prisma.$queryRaw`SELECT public.billing_execution_amend_pending_receivable(
          ${common.receivableId}::uuid, ${common.billingExecutionId}::uuid, ${7}::integer,
          ${common.amount}, ${dueDate}, ${common.description},
          ${'SYSTEM'}::public."BillingActorType", ${null}::uuid, ${'cross-vector'},
          ${Math.floor(Date.now() / 1000)}::bigint, ${randomUUID()}::uuid,
          ${'system-test-v1'}, ${'0'.repeat(64)}, ${common.reason}
        )`,
      ).rejects.toThrow(/Invalid Billing receivable amendment/);
    }

    for (const amount of ['1e3', '01.00', '0.001', '10000000000.00', '999999999999999999999.99']) {
      expect(() => billingReceivableAmendAttestationContext({ ...common, amount })).toThrow();
      await expect(
        prisma.$queryRaw`SELECT public.billing_execution_amend_pending_receivable(
          ${common.receivableId}::uuid, ${common.billingExecutionId}::uuid, ${7}::integer,
          ${amount}, ${common.dueDate}, ${common.description},
          ${'SYSTEM'}::public."BillingActorType", ${null}::uuid, ${'cross-vector'},
          ${Math.floor(Date.now() / 1000)}::bigint, ${randomUUID()}::uuid,
          ${'system-test-v1'}, ${'0'.repeat(64)}, ${common.reason}
        )`,
      ).rejects.toThrow(/Invalid Billing receivable amendment/);
    }

    const nilUuid = '00000000-0000-0000-0000-000000000000';
    expect(() =>
      billingReceivableAmendAttestationContext({ ...common, billingExecutionId: nilUuid }),
    ).toThrow(/UUID/);
    await expect(
      prisma.$queryRaw`SELECT public.billing_execution_amend_pending_receivable(
        ${common.receivableId}::uuid, ${nilUuid}::uuid, ${7}::integer,
        ${common.amount}, ${common.dueDate}, ${common.description},
        ${'SYSTEM'}::public."BillingActorType", ${null}::uuid, ${'cross-vector'},
        ${Math.floor(Date.now() / 1000)}::bigint, ${randomUUID()}::uuid,
        ${'system-test-v1'}, ${'0'.repeat(64)}, ${common.reason}
      )`,
    ).rejects.toThrow(/Invalid Billing receivable amendment/);

    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const amendedExecutionId = await amendReceivable(
      prisma,
      fixture.receivable.id,
      execution.id,
      0,
      '9999999999.99',
      '2026-11-24',
    );
    await expect(
      prisma.billingExecutionReceivable.findFirstOrThrow({
        where: { billingExecutionId: amendedExecutionId, receivableId: fixture.receivable.id },
      }),
    ).resolves.toMatchObject({ amountSnapshot: new Prisma.Decimal('9999999999.99') });
  });

  it('rolls nonce consumption back atomically and rejects concurrent replay', async () => {
    const fixture = await createFixture();
    const execution = await createExecution(prisma, fixture);
    const context = billingPixReserveAttestationContext({
      billingExecutionId: execution.id,
      messageDispatchId: execution.messageDispatchId,
      financialSetDigest: execution.receivableSetHash,
      expectedVersion: execution.version,
      owner: 'nonce-worker',
      token: `${prefix}NONCE-${fixture.suffix}`,
      creationKey: `${prefix}NONCE-KEY-${fixture.suffix}`,
      reason: 'Reserva PIX autorizada em teste DATA1.',
    });
    const rollbackProof = actorProof('SYSTEM', null, context);

    await expect(
      prisma.$transaction(async (tx) => {
        await verifyActorAssertion(tx, rollbackProof);
        throw new Error('forced assertion rollback');
      }),
    ).rejects.toThrow('forced assertion rollback');
    await expect(
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::integer AS count FROM public.billing_actor_assertions
        WHERE "nonce" = ${rollbackProof.nonce}::uuid
      `,
    ).resolves.toEqual([{ count: 0 }]);
    await expect(verifyActorAssertion(prisma, rollbackProof)).resolves.toBeDefined();
    await expect(verifyActorAssertion(prisma, rollbackProof)).rejects.toThrow(/already consumed/);

    const concurrentProof = actorProof('SYSTEM', null, context);
    const settled = await Promise.allSettled([
      verifyActorAssertion(prisma, concurrentProof),
      verifyActorAssertion(peer, concurrentProof),
    ]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it.runIf(Boolean(runtimeRole))(
    'binds signatures to operation, execution, dispatch, financial set, version and arguments',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const [fixtureA, fixtureB] = await Promise.all([createFixture(), createFixture()]);
      const [executionA, executionB] = await Promise.all([
        createExecution(prisma, fixtureA),
        createExecution(peer, fixtureB),
      ]);
      const owner = 'binding-worker';
      const tokenA = `${prefix}BIND-A-${fixtureA.suffix}`;
      const tokenB = `${prefix}BIND-B-${fixtureB.suffix}`;
      const keyA = `${prefix}BIND-KEY-A-${fixtureA.suffix}`;
      const keyB = `${prefix}BIND-KEY-B-${fixtureB.suffix}`;
      await Promise.all([
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          acquireLease(tx, executionA.id, owner, tokenA, 60),
        ),
        asRuntimeRole(peer, runtimeRole, (tx) =>
          acquireLease(tx, executionB.id, owner, tokenB, 60),
        ),
      ]);

      const reserveA = await reserveActorProof(
        prisma,
        executionA.id,
        1,
        owner,
        tokenA,
        keyA,
        'SYSTEM',
        null,
        'cobrança-worker',
      );
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          transitionWithLease(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            'PROCESSING',
            'NOT_STARTED',
            'NOT_READY',
            null,
            'SYSTEM',
            null,
            null,
            reserveA,
          ),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);
      await expect(
        asRuntimeRole(peer, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionB.id,
            1,
            owner,
            tokenB,
            keyB,
            'SYSTEM',
            null,
            reserveA,
          ),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            `${keyA}-changed`,
            'SYSTEM',
            null,
            reserveA,
          ),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);

      const wrongVersion = actorProof('SYSTEM', null, {
        ...reserveA.context,
        expectedVersion: 2,
      });
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            keyA,
            'SYSTEM',
            null,
            wrongVersion,
          ),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          amendReceivable(tx, fixtureA.receivable.id, executionA.id, 1, 45, '2026-11-24', reserveA),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);

      const executionContextA = await executionSigningContext(prisma, executionA.id);
      const amendA = actorProof(
        'SYSTEM',
        null,
        billingReceivableAmendAttestationContext({
          billingExecutionId: executionA.id,
          messageDispatchId: executionContextA.messageDispatchId,
          receivableId: fixtureA.receivable.id,
          financialSetDigest: executionContextA.receivableSetHash,
          expectedVersion: 1,
          amount: 45,
          dueDate: '2026-11-24',
          description: `${prefix}AMENDED`,
          reason: 'Ajuste administrativo autorizado em teste DATA1.',
        }),
      );
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(tx, executionA.id, 1, owner, tokenA, keyA, 'SYSTEM', null, amendA),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);

      const expired = actorProof('SYSTEM', null, reserveA.context, 'cobrança-worker', {
        issuedAt: Math.floor(Date.now() / 1000) - 301,
      });
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(tx, executionA.id, 1, owner, tokenA, keyA, 'SYSTEM', null, expired),
        ),
      ).rejects.toThrow(/Invalid or expired Billing actor assertion/);
      const wrongKey = actorProof('SYSTEM', null, reserveA.context, 'cobrança-worker', {
        keyId: 'unknown-test-v1',
      });
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            keyA,
            'SYSTEM',
            null,
            wrongKey,
          ),
        ),
      ).rejects.toThrow(/Unknown Billing actor signing key/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            keyA,
            'WEBHOOK',
            null,
            reserveA,
          ),
        ),
      ).rejects.toThrow(/Unknown Billing actor signing key|Invalid Billing actor signature/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(tx, executionA.id, 1, owner, tokenA, keyA, 'SYSTEM', null, {
            ...reserveA,
            principal: 'cobrança\nworker',
          }),
        ),
      ).rejects.toThrow(/Invalid or expired Billing actor assertion/);

      await expect(
        prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::integer AS count FROM public.billing_actor_assertions
          WHERE "nonce" IN (${reserveA.nonce}::uuid, ${amendA.nonce}::uuid)
        `,
      ).resolves.toEqual([{ count: 0 }]);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            executionA.id,
            1,
            owner,
            tokenA,
            keyA,
            'SYSTEM',
            null,
            reserveA,
          ),
        ),
      ).resolves.toBeTypeOf('string');
      await expect(
        prisma.$queryRaw<
          Array<{
            operation: string;
            billingExecutionId: string;
            messageDispatchId: string;
            financialSetDigest: string;
            expectedVersion: number;
          }>
        >`
          SELECT "operation", "billingExecutionId", "messageDispatchId",
            "financialSetDigest", "expectedVersion"
          FROM public.billing_actor_assertions WHERE "nonce" = ${reserveA.nonce}::uuid
        `,
      ).resolves.toEqual([
        {
          operation: 'billing.pix.reserve',
          billingExecutionId: executionA.id,
          messageDispatchId: executionA.messageDispatchId,
          financialSetDigest: executionA.receivableSetHash,
          expectedVersion: 1,
        },
      ]);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'ingests an authenticated orphan through the existing webhook flow without financial effects',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const providerSecret = 'provider-webhook-secret-for-7b';
      const rawPayload = JSON.stringify({
        event: 'transaction.approved',
        transaction_id: `${prefix}7B-ORPHAN`,
        status: 'approved',
        payment_provider: 'fastflow',
      });
      const rawBody = Buffer.from(rawPayload, 'utf8');
      const signature = `sha256=${createHmac('sha256', providerSecret).update(rawBody).digest('hex')}`;
      const configValues = {
        PHONE_GLOBAL_BILLING_ORPHAN_WEBHOOK_ENABLED: 'true',
        BILLING_ACTOR_WEBHOOK_KEY_ID: 'webhook-test-v1',
        BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: actorSecrets.WEBHOOK,
      };
      const execute = (client: PrismaClient) =>
        asRuntimeRole(client, runtimeRole, async (tx) => {
          const config = { get: (key: keyof typeof configValues) => configValues[key] };
          const quarantine = new BillingPixWebhookQuarantineService(
            tx as never,
            new BillingActorAttestationService(config as never),
          );
          const finance = new FinanceService(
            tx as never,
            {} as never,
            { getWebhookSecret: () => Promise.resolve(providerSecret) } as never,
            config as never,
            undefined,
            undefined,
            undefined,
            quarantine,
          );
          return finance.processPaymentWebhook(
            'FASTFLOW',
            signature,
            rawBody,
            JSON.parse(rawPayload),
          );
        });

      const results = (await Promise.all([execute(prisma), execute(peer)])) as Array<{
        quarantined: true;
        duplicate: boolean;
        processed: false;
      }>;
      expect(results.map((result) => result.duplicate).sort()).toEqual([false, true]);
      expect(results.every((result) => result.quarantined && !result.processed)).toBe(true);
      await expect(
        prisma.billingPixOrphanWebhookEvent.findMany({
          where: { providerTransactionId: `${prefix}7B-ORPHAN` },
        }),
      ).resolves.toHaveLength(1);
      await expect(
        Promise.all([
          prisma.paymentIntent.count(),
          prisma.billingPixAttempt.count(),
          prisma.billingExecution.count(),
          prisma.receivable.count({ where: { description: { startsWith: prefix } } }),
        ]),
      ).resolves.toEqual([0, 0, 0, 0]);

      await expect(
        asRuntimeRole(prisma, runtimeRole, async (tx) => {
          const config = { get: (key: keyof typeof configValues) => configValues[key] };
          const quarantine = new BillingPixWebhookQuarantineService(
            tx as never,
            new BillingActorAttestationService(config as never),
          );
          const finance = new FinanceService(
            tx as never,
            {} as never,
            { getWebhookSecret: () => Promise.resolve(providerSecret) } as never,
            config as never,
            undefined,
            undefined,
            undefined,
            quarantine,
          );
          return finance.processPaymentWebhook(
            'FASTFLOW',
            'sha256=invalid',
            rawBody,
            JSON.parse(rawPayload),
          );
        }),
      ).rejects.toThrow(/Assinatura do webhook de pagamento invalida/);
      await expect(
        prisma.billingPixOrphanWebhookEvent.count({
          where: { providerTransactionId: `${prefix}7B-ORPHAN` },
        }),
      ).resolves.toBe(1);

      const evidenceCountBeforeInvalid = await prisma.billingPixOrphanWebhookEvent.count();
      const invalidWhitespaceTransactionIds = orphanUnicodeWhiteSpaceCharacters.flatMap(
        (whitespace) => [
          `${whitespace}${prefix}7B-WHITESPACE`,
          `${prefix}7B-WHITESPACE${whitespace}`,
          whitespace.repeat(2),
        ],
      );

      for (const invalidPayload of [
        {
          transaction_id: `${prefix}7B-FUTURE-STATUS`,
          status: 'provider_future_status',
        },
        { transaction_id: 'x'.repeat(256), status: 'paid' },
        ...orphanMalformedUtf16TransactionIds.map((transactionId) => ({
          transaction_id: transactionId,
          status: 'paid',
        })),
        ...invalidWhitespaceTransactionIds.map((transactionId) => ({
          transaction_id: transactionId,
          status: 'paid',
        })),
        { transaction_id: '\u00a0\u2009\u3000', status: 'paid' },
        { transaction_id: `\u0020\u00a0${prefix}7B-MIXED`, status: 'paid' },
        { transaction_id: `${prefix}7B-MIXED\u202f\u205f\u3000`, status: 'paid' },
      ]) {
        const invalidRawBody = Buffer.from(JSON.stringify(invalidPayload), 'utf8');
        const invalidSignature = `sha256=${createHmac('sha256', providerSecret)
          .update(invalidRawBody)
          .digest('hex')}`;
        await expect(
          asRuntimeRole(prisma, runtimeRole, async (tx) => {
            const config = { get: (key: keyof typeof configValues) => configValues[key] };
            const quarantine = new BillingPixWebhookQuarantineService(
              tx as never,
              new BillingActorAttestationService(config as never),
            );
            const finance = new FinanceService(
              tx as never,
              {} as never,
              { getWebhookSecret: () => Promise.resolve(providerSecret) } as never,
              config as never,
              undefined,
              undefined,
              undefined,
              quarantine,
            );
            return finance.processPaymentWebhook(
              'FASTFLOW',
              invalidSignature,
              invalidRawBody,
              invalidPayload,
            );
          }),
        ).rejects.toMatchObject({ status: 400 });
      }
      await expect(prisma.billingPixOrphanWebhookEvent.count()).resolves.toBe(
        evidenceCountBeforeInvalid,
      );

      const astralPayload = {
        transaction_id: `${prefix}7B-ASTRAL-\ud83d\ude80`,
        status: 'paid',
      };
      const astralRawBody = Buffer.from(JSON.stringify(astralPayload), 'utf8');
      const astralSignature = `sha256=${createHmac('sha256', providerSecret)
        .update(astralRawBody)
        .digest('hex')}`;
      await expect(
        asRuntimeRole(prisma, runtimeRole, async (tx) => {
          const config = { get: (key: keyof typeof configValues) => configValues[key] };
          const quarantine = new BillingPixWebhookQuarantineService(
            tx as never,
            new BillingActorAttestationService(config as never),
          );
          const finance = new FinanceService(
            tx as never,
            {} as never,
            { getWebhookSecret: () => Promise.resolve(providerSecret) } as never,
            config as never,
            undefined,
            undefined,
            undefined,
            quarantine,
          );
          return finance.processPaymentWebhook(
            'FASTFLOW',
            astralSignature,
            astralRawBody,
            astralPayload,
          );
        }),
      ).resolves.toMatchObject({ quarantined: true, duplicate: false, processed: false });
      await expect(
        prisma.billingPixOrphanWebhookEvent.count({
          where: { providerTransactionId: astralPayload.transaction_id },
        }),
      ).resolves.toBe(1);
      await expect(
        Promise.all([
          prisma.paymentIntent.count(),
          prisma.billingPixAttempt.count(),
          prisma.billingExecution.count(),
          prisma.receivable.count({ where: { description: { startsWith: prefix } } }),
        ]),
      ).resolves.toEqual([0, 0, 0, 0]);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'persists authenticated orphan webhook evidence idempotently without raw payload or runtime DML',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const rawBody = Buffer.from('{"event":"waiting","value":"30.00"}', 'utf8');
      const rawBodyDigest = createHash('sha256').update(rawBody).digest('hex');
      const input = {
        eventId: billingPixOrphanWebhookEventId({
          provider: 'DEPIX',
          providerTransactionId: `${prefix}ORPHAN-TX`,
          eventKey: `${prefix}ORPHAN-EVENT`,
          rawBodyDigest,
        }),
        provider: 'DEPIX' as const,
        providerTransactionId: `${prefix}ORPHAN-TX`,
        eventKey: `${prefix}ORPHAN-EVENT`,
        externalStatus: 'WAITING_PAYMENT',
        rawBodyDigest,
        rawBodyBytes: rawBody.byteLength,
        receivedAt: '2026-10-27T14:10:00.123Z',
      };
      const config = {
        get: (key: string) =>
          ({
            BILLING_ACTOR_WEBHOOK_KEY_ID: 'webhook-test-v1',
            BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: actorSecrets.WEBHOOK,
          })[key],
      };
      const signer = new BillingActorAttestationService(config as never);
      const sign = () =>
        signer.forWebhook(
          input.provider,
          input.eventKey,
          billingPixQuarantineOrphanWebhookAttestationContext(input),
        );

      const firstActor = sign();
      const concurrent = await Promise.all([
        asRuntimeRole(prisma, runtimeRole, (tx) => quarantineOrphanWebhook(tx, input, firstActor)),
        asRuntimeRole(peer, runtimeRole, (tx) => quarantineOrphanWebhook(tx, input, sign())),
      ]);
      expect(
        concurrent
          .flat()
          .map((result) => result.inserted)
          .sort(),
      ).toEqual([false, true]);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) => quarantineOrphanWebhook(tx, input, firstActor)),
      ).rejects.toThrow(/already consumed/);
      const laterDelivery = { ...input, receivedAt: '2026-10-27T14:11:00.123Z' };
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          quarantineOrphanWebhook(
            tx,
            laterDelivery,
            signer.forWebhook(
              laterDelivery.provider,
              laterDelivery.eventKey,
              billingPixQuarantineOrphanWebhookAttestationContext(laterDelivery),
            ),
          ),
        ),
      ).resolves.toEqual([{ eventId: input.eventId, inserted: false }]);

      const [stored] = await prisma.$queryRaw<
        Array<{
          count: number;
          rawBodyDigest: string;
          columns: string[];
        }>
      >`
        SELECT count(*)::integer AS count, min("rawBodyDigest") AS "rawBodyDigest",
          ARRAY(
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'billing_pix_orphan_webhook_events'
            ORDER BY ordinal_position
          )::text[] AS columns
        FROM public.billing_pix_orphan_webhook_events
      `;
      expect(stored).toMatchObject({ count: 1, rawBodyDigest });
      expect(stored?.columns).not.toContain('rawBody');

      await expect(
        asRuntimeRole(
          prisma,
          runtimeRole,
          (tx) =>
            tx.$executeRaw`INSERT INTO public.billing_pix_orphan_webhook_events (
            "id", "evidenceVersion", "provider", "providerTransactionId", "eventKey",
            "externalStatus", "rawBodyDigest", "rawBodyBytes", "receivedAt",
            "actorPrincipal", "actorKeyId", "actorNonce"
          ) VALUES (
            ${randomUUID()}::uuid, 'billing-pix-orphan-webhook:v1', 'DEPIX', 'forged',
            'forged', 'WAITING_PAYMENT', ${'a'.repeat(64)}, 1, CURRENT_TIMESTAMP,
            'DEPIX:forged', 'webhook-test-v1', ${randomUUID()}::uuid
          )`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        prisma.billingPixOrphanWebhookEvent.update({
          where: { id: input.eventId },
          data: { externalStatus: 'PAID' },
        }),
      ).rejects.toThrow(/immutable/);

      const substituted = { ...input, externalStatus: 'PAID' };
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          quarantineOrphanWebhook(tx, substituted, sign()),
        ),
      ).rejects.toThrow(/arguments digest mismatch|Invalid Billing actor signature/);

      const identityConflict = { ...input, externalStatus: 'PAID' };
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          quarantineOrphanWebhook(
            tx,
            identityConflict,
            signer.forWebhook(
              identityConflict.provider,
              identityConflict.eventKey,
              billingPixQuarantineOrphanWebhookAttestationContext(identityConflict),
            ),
          ),
        ),
      ).rejects.toMatchObject({
        code: 'P2010',
        meta: { code: '23505' },
      });
      await expect(
        prisma.billingPixOrphanWebhookEvent.count({ where: { id: input.eventId } }),
      ).resolves.toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps SECURITY DEFINER ownership, search paths and grants least-privileged',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const functions = await prisma.$queryRaw<
        Array<{
          name: string;
          searchPath: string[];
          publicExecute: boolean;
          runtimeExecute: boolean;
        }>
      >`
        SELECT p.proname AS name, p.proconfig AS "searchPath",
          COALESCE((
            SELECT bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE')
            FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
          ), false) AS "publicExecute",
          has_function_privilege(${runtimeRole}, p.oid, 'EXECUTE') AS "runtimeExecute"
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef
        ORDER BY p.proname
      `;
      expect(functions).toHaveLength(11);
      expect(functions.every((item) => item.publicExecute === false)).toBe(true);
      expect(
        functions.every((item) =>
          item.searchPath.includes('search_path=pg_catalog, public, pg_temp'),
        ),
      ).toBe(true);
      expect(
        functions.find((item) => item.name === 'billing_execution_verify_actor'),
      ).toMatchObject({ runtimeExecute: false });
      expect(
        functions
          .filter((item) => item.name !== 'billing_execution_verify_actor')
          .every((item) => item.runtimeExecute),
      ).toBe(true);

      const [role] = await prisma.$queryRaw<
        Array<{
          superuser: boolean;
          createRole: boolean;
          createDb: boolean;
          createPublic: boolean;
          hasTemp: boolean;
          canAssumeOwner: boolean;
          readsKeys: boolean;
        }>
      >`
        SELECT r.rolsuper AS superuser, r.rolcreaterole AS "createRole",
          r.rolcreatedb AS "createDb",
          has_schema_privilege(${runtimeRole}, 'public', 'CREATE') AS "createPublic",
          has_database_privilege(${runtimeRole}, current_database(), 'TEMP') AS "hasTemp",
          pg_has_role(${runtimeRole}, current_user, 'MEMBER') AS "canAssumeOwner",
          has_table_privilege(${runtimeRole}, 'public.billing_actor_keys', 'SELECT') AS "readsKeys"
        FROM pg_roles r WHERE r.rolname = ${runtimeRole}
      `;
      expect(role).toEqual({
        superuser: false,
        createRole: false,
        createDb: false,
        createPublic: false,
        hasTemp: true,
        canAssumeOwner: false,
        readsKeys: false,
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'resists pg_temp table, trigger, helper-function and key shadowing in every privileged path',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const fixture = await createFixture();
      const execution = await createExecution(prisma, fixture);
      const owner = 'runtime-shadow-worker';
      const token = `${prefix}SHADOW-${fixture.suffix}`;

      await asRuntimeRole(prisma, runtimeRole, async (tx) => {
        await tx.$executeRawUnsafe(
          'CREATE TEMP TABLE billing_executions (id uuid PRIMARY KEY, touched boolean DEFAULT false) ON COMMIT DROP',
        );
        await tx.$executeRawUnsafe(`CREATE FUNCTION pg_temp.billing_shadow_trigger() RETURNS trigger AS $$
          BEGIN RAISE EXCEPTION 'pg_temp trigger executed with %', current_user; END
          $$ LANGUAGE plpgsql`);
        await tx.$executeRawUnsafe(`CREATE TRIGGER billing_shadow BEFORE UPDATE ON billing_executions
          FOR EACH ROW EXECUTE FUNCTION pg_temp.billing_shadow_trigger()`);
        await tx.$executeRawUnsafe(
          `INSERT INTO billing_executions (id) VALUES ('${execution.id}')`,
        );
        await tx.$executeRawUnsafe(`CREATE TEMP TABLE billing_actor_keys (
          "actorType" text, "keyId" text, secret bytea, enabled boolean
        ) ON COMMIT DROP`);
        await tx.$executeRawUnsafe(`CREATE FUNCTION pg_temp.billing_execution_verify_actor(
            text, uuid, uuid, uuid, text, integer, text,
            public."BillingActorType", uuid, text, bigint, uuid, text, text
          ) RETURNS void AS $$ BEGIN RETURN; END $$ LANGUAGE plpgsql`);
        await tx.$executeRawUnsafe(`CREATE FUNCTION pg_temp.billing_actor_canonical_value(
            text, text
          ) RETURNS text AS $$ BEGIN RETURN 'shadowed'; END $$ LANGUAGE plpgsql`);
        await expect(acquireLease(tx, execution.id, owner, token, 60)).resolves.toBe(true);
        await expect(renewLease(tx, execution.id, owner, token, 60)).resolves.toBe(true);
        await expect(releaseLease(tx, execution.id, owner, token)).resolves.toBe(true);
        const tempRows = await tx.$queryRaw<Array<{ touched: boolean }>>`
          SELECT touched FROM pg_temp.billing_executions
        `;
        expect(tempRows).toEqual([{ touched: false }]);
      });
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects forged USER, SYSTEM and WEBHOOK authors while accepting signed pooled principals',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const [user, otherUser] = await Promise.all([
        prisma.user.create({
          data: {
            name: 'DATA1 actor one',
            email: `data1-test-${randomUUID()}@example.com`,
            passwordHash: 'not-used',
          },
        }),
        prisma.user.create({
          data: {
            name: 'DATA1 actor two',
            email: `data1-test-${randomUUID()}@example.com`,
            passwordHash: 'not-used',
          },
        }),
      ]);
      const fixture = await createFixture();
      const execution = await createExecution(prisma, fixture);
      const owner = 'runtime-auth-worker';
      const token = `${prefix}AUTH-${fixture.suffix}`;
      await asRuntimeRole(prisma, runtimeRole, (tx) =>
        acquireLease(tx, execution.id, owner, token, 60),
      );

      const forgedSystemKey = `${prefix}FORGED-SYSTEM-${fixture.suffix}`;
      const forgedSystem = await reserveActorProof(
        prisma,
        execution.id,
        1,
        owner,
        token,
        forgedSystemKey,
        'SYSTEM',
        null,
      );
      forgedSystem.signature = '0'.repeat(64);
      await expect(
        asRuntimeRole(prisma, runtimeRole, async (tx) => {
          await tx.$executeRaw`SELECT set_config('crm.billing_actor_type', 'SYSTEM', true)`;
          return reserveWithActorProof(
            tx,
            execution.id,
            1,
            owner,
            token,
            forgedSystemKey,
            'SYSTEM',
            null,
            forgedSystem,
          );
        }),
      ).rejects.toThrow(/Invalid Billing actor signature/);

      const forgedUserKey = `${prefix}FORGED-USER-${fixture.suffix}`;
      const otherUserProof = await reserveActorProof(
        prisma,
        execution.id,
        1,
        owner,
        token,
        forgedUserKey,
        'USER',
        user.id,
      );
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            execution.id,
            1,
            owner,
            token,
            forgedUserKey,
            'USER',
            otherUser.id,
            otherUserProof,
          ),
        ),
      ).rejects.toThrow(/requires an existing user|Invalid Billing actor signature/);

      const forgedWebhookKey = `${prefix}FORGED-WEBHOOK-${fixture.suffix}`;
      const forgedWebhook = await reserveActorProof(
        prisma,
        execution.id,
        1,
        owner,
        token,
        forgedWebhookKey,
        'WEBHOOK',
        null,
      );
      forgedWebhook.signature = 'f'.repeat(64);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            execution.id,
            1,
            owner,
            token,
            forgedWebhookKey,
            'WEBHOOK',
            null,
            forgedWebhook,
          ),
        ),
      ).rejects.toThrow(/Invalid Billing actor signature/);

      const validUserKey = `${prefix}VALID-USER-${fixture.suffix}`;
      const validUser = await reserveActorProof(
        prisma,
        execution.id,
        1,
        owner,
        token,
        validUserKey,
        'USER',
        user.id,
      );
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            execution.id,
            1,
            owner,
            token,
            validUserKey,
            'USER',
            user.id,
            validUser,
          ),
        ),
      ).resolves.toBeTypeOf('string');
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithActorProof(
            tx,
            execution.id,
            2,
            owner,
            token,
            validUserKey,
            'USER',
            user.id,
            validUser,
          ),
        ),
      ).rejects.toThrow(
        /already consumed|expectedVersion is stale|Invalid Billing actor signature/,
      );
      await expect(
        asRuntimeRole(
          prisma,
          runtimeRole,
          (tx) => tx.$queryRaw`SELECT * FROM public.billing_actor_keys`,
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRuntimeRole(
          prisma,
          runtimeRole,
          (tx) =>
            tx.$queryRaw`SELECT public.billing_execution_verify_actor(
            ${'billing.pix.reserve'}, ${execution.id}::uuid, ${fixture.dispatch.id}::uuid,
            ${null}::uuid, ${execution.receivableSetHash}, ${1}::integer, ${'0'.repeat(64)},
            ${'SYSTEM'}::public."BillingActorType", ${null}::uuid, ${'billing-scheduler'},
            ${1}::bigint, ${randomUUID()}::uuid, ${'system-test-v1'}, ${'0'.repeat(64)}
          )`,
        ),
      ).rejects.toThrow(/permission denied/);

      const [systemFixture, webhookFixture] = await Promise.all([createFixture(), createFixture()]);
      const [systemExecution, webhookExecution] = await Promise.all([
        createExecution(prisma, systemFixture),
        createExecution(peer, webhookFixture),
      ]);
      await Promise.all([
        asRuntimeRole(prisma, runtimeRole, async (tx) => {
          await acquireLease(tx, systemExecution.id, 'system-worker', randomUUID(), 60);
          const current = await tx.billingExecution.findUniqueOrThrow({
            where: { id: systemExecution.id },
          });
          return reserveWithLease(
            tx,
            systemExecution.id,
            current.version,
            'system-worker',
            current.leaseToken!,
            `${prefix}VALID-SYSTEM-${systemFixture.suffix}`,
            'SYSTEM',
            null,
          );
        }),
        asRuntimeRole(peer, runtimeRole, async (tx) => {
          await acquireLease(tx, webhookExecution.id, 'webhook-worker', randomUUID(), 60);
          const current = await tx.billingExecution.findUniqueOrThrow({
            where: { id: webhookExecution.id },
          });
          return reserveWithLease(
            tx,
            webhookExecution.id,
            current.version,
            'webhook-worker',
            current.leaseToken!,
            `${prefix}VALID-WEBHOOK-${webhookFixture.suffix}`,
            'WEBHOOK',
            null,
          );
        }),
      ]);
      const principals = await prisma.$queryRaw<Array<{ actorType: string; principal: string }>>`
        SELECT "actorType"::text AS "actorType", "principal"
        FROM public.billing_actor_assertions
        WHERE ("actorType" = 'SYSTEM' AND "principal" = 'billing-scheduler')
           OR ("actorType" = 'WEBHOOK' AND "principal" = 'DEPIX:event-test')
      `;
      expect(principals).toEqual(
        expect.arrayContaining([
          { actorType: 'SYSTEM', principal: 'billing-scheduler' },
          { actorType: 'WEBHOOK', principal: 'DEPIX:event-test' },
        ]),
      );
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'enforces lease, CAS and protected workflow mutations under the runtime role',
    async () => {
      if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/i.test(runtimeRole)) {
        throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple PostgreSQL identifier.');
      }
      const fixture = await createFixture();
      const execution = await createExecution(prisma, fixture);
      const owner = 'runtime-worker';
      const token = `${prefix}RUNTIME-LEASE-${fixture.suffix}`;

      await expect(
        asRuntimeRole(prisma, runtimeRole, async (tx) => {
          await tx.$executeRaw`SELECT set_config('crm.billing_lease_mutation', 'allowed', true)`;
          return tx.billingExecution.update({
            where: { id: execution.id },
            data: { leaseToken: `${prefix}RUNTIME-BYPASS-${fixture.suffix}` },
          });
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          tx.billingExecution.update({
            where: { id: execution.id },
            data: { status: 'PROCESSING', version: { increment: 1 } },
          }),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          acquireLease(tx, execution.id, owner, token, 60),
        ),
      ).resolves.toBe(true);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithLease(
            tx,
            execution.id,
            0,
            owner,
            token,
            `${prefix}RUNTIME-STALE-${fixture.suffix}`,
            'SYSTEM',
            null,
          ),
        ),
      ).rejects.toThrow(/expectedVersion is stale/);
      await expect(
        asRuntimeRole(prisma, runtimeRole, (tx) =>
          reserveWithLease(
            tx,
            execution.id,
            1,
            owner,
            token,
            `${prefix}RUNTIME-VALID-${fixture.suffix}`,
            'SYSTEM',
            null,
          ),
        ),
      ).resolves.toBeTypeOf('string');
    },
  );

  async function createFixture() {
    const suffix = randomUUID();
    const plan = await prisma.plan.create({
      data: {
        name: `${prefix}PLAN-${suffix}`,
        durationMonths: 1,
        defaultValue: new Prisma.Decimal(30),
      },
    });
    const client = await prisma.client.create({
      data: {
        name: `${prefix}CLIENT-${suffix}`,
        phone: '+971 52 984 6014',
        phoneNormalized: '971529846014',
        phoneE164: '+971529846014',
        reference: `${prefix}CLIENT-${suffix}`,
        planId: plan.id,
        recurringValue: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        billingAnchorDay: 23,
        billingNoticeDays: 3,
      },
    });
    const reference = await prisma.clientReference.create({
      data: {
        clientId: client.id,
        reference: `${prefix}REFERENCE-${suffix}`,
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
        description: `${prefix}RECEIVABLE-${suffix}`,
        amount: new Prisma.Decimal(30),
        dueDate: new Date('2026-11-23T00:00:00.000Z'),
        payerName: client.name,
        payerPhone: client.phone,
        payerPhoneNormalized: client.phoneNormalized,
      },
    });
    const dispatch = await prisma.messageDispatch.create({
      data: {
        clientId: client.id,
        clientReferenceId: reference.id,
        receivableId: receivable.id,
        phone: client.phoneNormalized,
        body: 'DATA1 future billing placeholder without external execution',
        origin: 'BILLING',
        status: 'SCHEDULED',
        requestId: `${prefix}DISPATCH-${suffix}`,
        idempotencyKey: `${prefix}DISPATCH-${suffix}`,
        scheduledFor: new Date('2026-11-20T13:00:00.000Z'),
      },
    });
    return { suffix, plan, client, reference, receivable, dispatch };
  }

  function createExecution(
    db: PrismaClient | Prisma.TransactionClient,
    fixture: Awaited<ReturnType<typeof createFixture>>,
    options: {
      status?: 'SCHEDULED' | 'BLOCKED';
      nextAttemptAt?: Date | null;
      pixStatus?: 'NOT_STARTED' | 'AMBIGUOUS';
      reviewRequired?: boolean;
    } = {},
  ) {
    const identity = buildBillingExecutionIdentity({
      clientId: fixture.client.id,
      cycleKey: '2026-11',
      receivables: [
        {
          id: fixture.receivable.id,
          amount: fixture.receivable.amount.toString(),
          dueDate: fixture.receivable.dueDate,
        },
      ],
    });
    return db.billingExecution.create({
      data: {
        messageDispatchId: fixture.dispatch.id,
        clientId: fixture.client.id,
        executionKey: identity.executionKey,
        cycleKey: '2026-11',
        receivableSetHash: identity.receivableSetHash,
        authorizationMode: 'GLOBAL_INTERNATIONAL',
        status: options.status ?? 'SCHEDULED',
        pixStatus: options.pixStatus ?? 'NOT_STARTED',
        reviewRequired: options.reviewRequired ?? false,
        ...(options.reviewRequired
          ? {
              blockedCode: `${prefix}FIXTURE-REVIEW`,
              blockedReason: 'Fixture requires review before any financial effect.',
            }
          : {}),
        nextAttemptAt:
          options.nextAttemptAt === undefined
            ? fixture.dispatch.scheduledFor
            : options.nextAttemptAt,
        receivables: {
          create: {
            receivableId: fixture.receivable.id,
            clientReferenceId: fixture.reference.id,
            amountSnapshot: fixture.receivable.amount,
            dueDateSnapshot: fixture.receivable.dueDate,
            statusSnapshot: fixture.receivable.status,
            referenceSnapshot: fixture.reference.reference,
          },
        },
      },
    });
  }

  async function createClaimFixture(
    options: {
      reviewRequired?: boolean;
      pixStatus?: 'NOT_STARTED' | 'AMBIGUOUS';
      scheduledFor?: Date;
    } = {},
  ) {
    const fixture = await createFixture();
    const scheduledFor = options.scheduledFor ?? new Date('2026-11-20T13:00:00.000Z');
    const connection = await prisma.whatsAppConnection.create({
      data: {
        name: `${prefix}CLAIM-CONNECTION-${fixture.suffix}`,
        providerTokenEncrypted: 'not-used-by-claim-tests',
        status: 'CONNECTED',
        connected: true,
        loggedIn: true,
        webhookConfigured: true,
      },
    });
    await prisma.messageDispatch.update({
      where: { id: fixture.dispatch.id },
      data: { whatsAppConnectionId: connection.id, scheduledFor },
    });
    await prisma.messageDispatchItem.create({
      data: {
        messageDispatchId: fixture.dispatch.id,
        receivableId: fixture.receivable.id,
        clientReferenceId: fixture.reference.id,
        amount: fixture.receivable.amount,
        dueDate: fixture.receivable.dueDate,
        referenceSnapshot: fixture.reference.reference,
        statusSnapshot: fixture.receivable.status,
      },
    });
    const conversation = await prisma.whatsAppConversation.create({
      data: {
        whatsAppConnectionId: connection.id,
        clientId: fixture.client.id,
        contactName: fixture.client.name,
        phone: fixture.client.phone,
        phoneNormalized: fixture.client.phoneNormalized,
        phoneE164: fixture.client.phoneE164,
      },
    });
    const execution = await createExecution(prisma, fixture, {
      nextAttemptAt: scheduledFor,
      ...(options.pixStatus === undefined ? {} : { pixStatus: options.pixStatus }),
      ...(options.reviewRequired === undefined ? {} : { reviewRequired: options.reviewRequired }),
    });
    return { fixture, connection, conversation, execution };
  }

  function claimService(db: PrismaClient, role: string) {
    const config = {
      get: (key: string) =>
        ({
          PHONE_GLOBAL_BILLING_ENABLED: 'true',
          PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
          PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
          PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
          BILLING_ACTOR_SYSTEM_KEY_ID: 'system-test-v1',
          BILLING_ACTOR_SYSTEM_SIGNING_SECRET: actorSecrets.SYSTEM,
        })[key],
    };
    const runtimePrisma = {
      billingExecution: db.billingExecution,
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ) =>
        db.$transaction(async (tx) => {
          if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error('Invalid runtime role.');
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          return callback(tx);
        }, options),
    };
    return new BillingPixClaimService(
      runtimePrisma as never,
      config as never,
      new BillingActorAttestationService(config as never),
    );
  }

  function createDirectClaimIntent(
    prepared: Awaited<ReturnType<typeof createClaimFixture>>,
    options: {
      amount?: string;
      externalStatus?: string | null;
      expiresAt?: Date | null;
      paidAt?: Date | null;
      provider?: PaymentProviderCode;
      status?: PaymentIntentStatus;
    } = {},
  ) {
    return prisma.paymentIntent.create({
      data: {
        receivableId: prepared.fixture.receivable.id,
        provider: options.provider ?? 'DEPIX',
        providerTransactionId: `${prefix}DIRECT-TX-${prepared.fixture.suffix}`,
        externalStatus: options.externalStatus ?? null,
        status: options.status ?? 'WAITING_PAYMENT',
        origin: 'BILLING',
        creationKey: `${prefix}DIRECT-KEY-${prepared.fixture.suffix}`,
        amount: new Prisma.Decimal(options.amount ?? '30.00'),
        pixCopyPaste: `${prefix}DIRECT-PIX-${prepared.fixture.suffix}`,
        expiresAt: options.expiresAt ?? new Date('2026-11-23T23:59:59.000Z'),
        paidAt: options.paidAt ?? null,
      },
    });
  }

  async function createGroupedClaimIntent(
    prepared: Awaited<ReturnType<typeof createClaimFixture>>,
    options: {
      amount?: string;
      clientId?: string;
      extraReceivableIds?: string[];
      provider?: PaymentProviderCode;
      status?: PaymentIntentStatus;
    } = {},
  ) {
    const receivableIds = [prepared.fixture.receivable.id, ...(options.extraReceivableIds ?? [])];
    const group = await prisma.paymentGroup.create({
      data: {
        clientId: options.clientId ?? prepared.fixture.client.id,
        totalAmount: new Prisma.Decimal(options.amount ?? '30.00'),
        items: {
          create: receivableIds.map((receivableId) => ({
            receivableId,
            amount:
              receivableId === prepared.fixture.receivable.id
                ? prepared.fixture.receivable.amount
                : new Prisma.Decimal('1.00'),
          })),
        },
      },
    });
    const intent = await prisma.paymentIntent.create({
      data: {
        paymentGroupId: group.id,
        provider: options.provider ?? 'DEPIX',
        providerTransactionId: `${prefix}GROUP-TX-${randomUUID()}`,
        status: options.status ?? 'WAITING_PAYMENT',
        origin: 'BILLING',
        creationKey: `${prefix}GROUP-KEY-${randomUUID()}`,
        amount: new Prisma.Decimal(options.amount ?? '30.00'),
        pixCopyPaste: `${prefix}GROUP-PIX-${randomUUID()}`,
        expiresAt: new Date('2026-11-23T23:59:59.000Z'),
      },
    });
    return { group, intent };
  }

  async function claimPrepared(
    prepared: Awaited<ReturnType<typeof createClaimFixture>>,
    owner: string,
  ) {
    if (!runtimeRole) throw new Error('Runtime role required.');
    return claimService(prisma, runtimeRole).claimAndRevalidate({
      executionId: prepared.execution.id,
      expectedVersion: (
        await prisma.billingExecution.findUniqueOrThrow({
          where: { id: prepared.execution.id },
        })
      ).version,
      owner,
      token: `${prefix}${owner}-${prepared.fixture.suffix}`,
      now: new Date('2026-11-20T13:01:00.000Z'),
    });
  }

  async function ambiguousReconciliationFixture(owner: string) {
    if (!runtimeRole) throw new Error('Runtime role required.');
    const prepared = await createClaimFixture();
    const service = claimService(prisma, runtimeRole);
    const now = new Date('2026-11-20T13:01:00.000Z');
    const token = `${prefix}${owner}-${prepared.fixture.suffix}`;
    const providerTransactionId = `${prefix}IMPL5-TX-${prepared.fixture.suffix}`;
    const claim = await service.claimAndRevalidate({
      executionId: prepared.execution.id,
      expectedVersion: prepared.execution.version,
      owner,
      token,
      now,
    });
    const reservation = await service.reservePix({
      executionId: prepared.execution.id,
      expectedVersion: claim.version!,
      owner,
      token,
      provider: 'DEPIX',
      now,
    });
    await service.createReservedPix(
      {
        executionId: prepared.execution.id,
        expectedVersion: reservation.version!,
        owner,
        token,
        attemptId: reservation.attemptId!,
        creationKey: reservation.creationKey!,
        provider: 'DEPIX',
        now,
      },
      {
        create: async () => {
          await Promise.resolve();
          return {
            kind: 'REMOTE_RESULT_UNCERTAIN' as const,
            requestDispatched: true as const,
            remoteEffect: 'UNKNOWN' as const,
            automaticRetryEligible: false as const,
            providerTransactionId,
            code: 'FASTDEPIX_TIMEOUT_WITH_ID',
            message: 'timeout after identified request',
            httpStatus: null,
          };
        },
      },
    );
    const execution = await prisma.billingExecution.findUniqueOrThrow({
      where: { id: prepared.execution.id },
    });
    return { prepared, service, reservation, execution, providerTransactionId };
  }

  function financialEffectCounts() {
    return Promise.all([prisma.billingPixAttempt.count(), prisma.paymentIntent.count()]);
  }

  function reserveAttempt(db: PrismaClient, billingExecutionId: string, creationKey: string) {
    return db.$transaction(async (tx) => {
      await tx.billingExecution.update({
        where: { id: billingExecutionId },
        data: { pixStatus: 'RESERVED', version: { increment: 1 } },
      });
      return tx.billingPixAttempt.create({
        data: { billingExecutionId, creationKey, status: 'RESERVED' },
      });
    });
  }

  async function acquireLease(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
    ttl: number,
  ) {
    const rows = await db.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT public.billing_execution_acquire_lease(${id}::uuid, ${owner}, ${token}, ${ttl}::integer) AS acquired
    `;
    const [row] = rows;
    if (!row) throw new Error('Lease acquisition returned no result.');
    return row.acquired;
  }

  async function renewLease(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
    ttl: number,
  ) {
    const rows = await db.$queryRaw<Array<{ renewed: boolean }>>`
      SELECT public.billing_execution_renew_lease(${id}::uuid, ${owner}, ${token}, ${ttl}::integer) AS renewed
    `;
    const [row] = rows;
    if (!row) throw new Error('Lease renewal returned no result.');
    return row.renewed;
  }

  async function releaseLease(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
  ) {
    const rows = await db.$queryRaw<Array<{ released: boolean }>>`
      SELECT public.billing_execution_release_lease(${id}::uuid, ${owner}, ${token}) AS released
    `;
    const [row] = rows;
    if (!row) throw new Error('Lease release returned no result.');
    return row.released;
  }

  async function reserveWithLease(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    owner: string,
    token: string,
    creationKey: string,
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK',
    actorUserId: string | null,
  ) {
    const actor = await reserveActorProof(
      db,
      id,
      expectedVersion,
      owner,
      token,
      creationKey,
      actorType,
      actorUserId,
    );
    return reserveWithActorProof(
      db,
      id,
      expectedVersion,
      owner,
      token,
      creationKey,
      actorType,
      actorUserId,
      actor,
    );
  }

  async function reserveWithActorProof(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    owner: string,
    token: string,
    creationKey: string,
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK',
    actorUserId: string | null,
    actor: ReturnType<typeof actorProof>,
  ) {
    const rows = await db.$queryRaw<Array<{ attempt_id: string }>>`
      SELECT public.billing_pix_reserve(
        ${id}::uuid,
        ${expectedVersion}::integer,
        ${owner},
        ${token},
        ${creationKey},
        ${actorType}::public."BillingActorType",
        ${actorUserId}::uuid,
        ${actor.principal},
        ${actor.issuedAt}::bigint,
        ${actor.nonce}::uuid,
        ${actor.keyId},
        ${actor.signature},
        ${'Reserva PIX autorizada em teste DATA1.'}
      ) AS attempt_id
    `;
    const [row] = rows;
    if (!row) throw new Error('PIX reservation returned no result.');
    return row.attempt_id;
  }

  async function transitionWithLease(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    owner: string,
    token: string,
    status:
      | 'SCHEDULED'
      | 'PROCESSING'
      | 'WAITING_PIX'
      | 'READY_TO_SEND'
      | 'COMPLETED'
      | 'BLOCKED'
      | 'REVIEW_REQUIRED'
      | 'CANCELED',
    pixStatus:
      | 'NOT_STARTED'
      | 'RESERVED'
      | 'CREATING'
      | 'CONFIRMED'
      | 'AMBIGUOUS'
      | 'FAILED'
      | 'EXPIRED'
      | 'PAID'
      | 'CANCELED'
      | 'SUPERSEDED',
    deliveryStatus:
      'NOT_READY' | 'READY' | 'SENDING' | 'SENT' | 'AMBIGUOUS' | 'FAILED' | 'CANCELED',
    paymentIntentId: string | null,
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK',
    actorUserId: string | null,
    reconciliationEvidence: string | null,
    actorOverride?: ReturnType<typeof actorProof>,
  ) {
    const reason = 'Transicao operacional em teste DATA1.';
    const execution = await executionSigningContext(db, id);
    const actor =
      actorOverride ??
      actorProof(
        actorType,
        actorUserId,
        billingExecutionTransitionAttestationContext({
          billingExecutionId: id,
          messageDispatchId: execution.messageDispatchId,
          financialSetDigest: execution.receivableSetHash,
          expectedVersion,
          owner,
          token,
          status,
          pixStatus,
          deliveryStatus,
          paymentIntentId,
          reason,
          reconciliationEvidence,
        }),
      );
    const rows = await db.$queryRaw<Array<{ next_version: number }>>`
      SELECT public.billing_execution_transition(
        ${id}::uuid,
        ${expectedVersion}::integer,
        ${owner},
        ${token},
        ${status}::public."BillingExecutionStatus",
        ${pixStatus}::public."BillingPixStatus",
        ${deliveryStatus}::public."BillingDeliveryStatus",
        ${paymentIntentId}::uuid,
        ${actorType}::public."BillingActorType",
        ${actorUserId}::uuid,
        ${actor.principal},
        ${actor.issuedAt}::bigint,
        ${actor.nonce}::uuid,
        ${actor.keyId},
        ${actor.signature},
        ${reason},
        ${reconciliationEvidence}
      ) AS next_version
    `;
    const [row] = rows;
    if (!row) throw new Error('Billing transition returned no result.');
    return row.next_version;
  }

  async function amendReceivable(
    db: PrismaClient | Prisma.TransactionClient,
    receivableId: string,
    executionId: string,
    expectedVersion: number,
    amount: Prisma.Decimal.Value,
    dueDate: string,
    actorOverride?: ReturnType<typeof actorProof>,
  ) {
    const description = `${prefix}AMENDED`;
    const reason = 'Ajuste administrativo autorizado em teste DATA1.';
    const execution = await executionSigningContext(db, executionId);
    const actor =
      actorOverride ??
      actorProof(
        'SYSTEM',
        null,
        billingReceivableAmendAttestationContext({
          billingExecutionId: executionId,
          messageDispatchId: execution.messageDispatchId,
          receivableId,
          financialSetDigest: execution.receivableSetHash,
          expectedVersion,
          amount,
          dueDate,
          description,
          reason,
        }),
      );
    const rows = await db.$queryRaw<Array<{ execution_id: string }>>`
      SELECT public.billing_execution_amend_pending_receivable(
        ${receivableId}::uuid,
        ${executionId}::uuid,
        ${expectedVersion}::integer,
        ${Prisma.Decimal.isDecimal(amount) ? amount.toFixed() : String(amount)},
        ${dueDate},
        ${description},
        ${'SYSTEM'}::public."BillingActorType",
        ${null}::uuid,
        ${actor.principal},
        ${actor.issuedAt}::bigint,
        ${actor.nonce}::uuid,
        ${actor.keyId},
        ${actor.signature},
        ${reason}
      ) AS execution_id
    `;
    const [row] = rows;
    if (!row) throw new Error('Billing amendment returned no result.');
    return row.execution_id;
  }

  function asRuntimeRole<T>(
    db: PrismaClient,
    role: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
      return callback(tx);
    });
  }

  function actorProof(
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK',
    actorUserId: string | null,
    context: BillingActorAttestationContext,
    principal = actorType === 'USER'
      ? (actorUserId ?? '')
      : actorType === 'SYSTEM'
        ? 'billing-scheduler'
        : 'DEPIX:event-test',
    overrides: { issuedAt?: number; nonce?: string; keyId?: string } = {},
  ) {
    const issuedAt = overrides.issuedAt ?? Math.floor(Date.now() / 1000);
    const nonce = overrides.nonce ?? randomUUID();
    const keyId = overrides.keyId ?? `${actorType.toLowerCase()}-test-v1`;
    const unsigned = {
      ...context,
      actorType,
      actorUserId,
      actorPrincipal: principal,
      actorIssuedAt: issuedAt,
      actorNonce: nonce,
      actorKeyId: keyId,
    };
    return {
      actorType,
      actorUserId,
      principal,
      issuedAt,
      nonce,
      keyId,
      signature: createHmac('sha256', actorSecrets[actorType])
        .update(billingActorAttestationPayload(unsigned))
        .digest('hex'),
      context,
    };
  }

  async function reserveActorProof(
    db: PrismaClient | Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    owner: string,
    token: string,
    creationKey: string,
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK',
    actorUserId: string | null,
    principal?: string,
  ) {
    const reason = 'Reserva PIX autorizada em teste DATA1.';
    const execution = await executionSigningContext(db, id);
    return actorProof(
      actorType,
      actorUserId,
      billingPixReserveAttestationContext({
        billingExecutionId: id,
        messageDispatchId: execution.messageDispatchId,
        financialSetDigest: execution.receivableSetHash,
        expectedVersion,
        owner,
        token,
        creationKey,
        reason,
      }),
      principal,
    );
  }

  function executionSigningContext(db: PrismaClient | Prisma.TransactionClient, id: string) {
    return db.billingExecution.findUniqueOrThrow({
      where: { id },
      select: { messageDispatchId: true, receivableSetHash: true },
    });
  }

  function verifyActorAssertion(
    db: PrismaClient | Prisma.TransactionClient,
    actor: ReturnType<typeof actorProof>,
  ) {
    return db.$queryRaw`SELECT public.billing_execution_verify_actor(
      ${actor.context.operation},
      ${actor.context.billingExecutionId}::uuid,
      ${actor.context.messageDispatchId}::uuid,
      ${actor.context.receivableId}::uuid,
      ${actor.context.financialSetDigest},
      ${actor.context.expectedVersion}::integer,
      ${actor.context.argumentsDigest},
      ${actor.actorType}::public."BillingActorType",
      ${actor.actorUserId}::uuid,
      ${actor.principal},
      ${actor.issuedAt}::bigint,
      ${actor.nonce}::uuid,
      ${actor.keyId},
      ${actor.signature}
    )::text AS result`;
  }

  function quarantineOrphanWebhook(
    db: PrismaClient | Prisma.TransactionClient,
    input: {
      eventId: string;
      provider: PaymentProviderCode;
      providerTransactionId: string;
      eventKey: string;
      externalStatus: string;
      rawBodyDigest: string;
      rawBodyBytes: number;
      receivedAt: string;
    },
    actor: ReturnType<BillingActorAttestationService['forWebhook']>,
  ) {
    return db.$queryRaw<Array<{ eventId: string; inserted: boolean }>>(Prisma.sql`
      SELECT "eventId", inserted
      FROM public.billing_pix_quarantine_orphan_webhook(
        ${input.eventId}::uuid, ${input.provider}::public."PaymentProviderCode",
        ${input.providerTransactionId}, ${input.eventKey}, ${input.externalStatus},
        ${input.rawBodyDigest}, ${input.rawBodyBytes}::integer, ${input.receivedAt}::timestamptz,
        ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
        ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint, ${actor.actorNonce}::uuid,
        ${actor.actorKeyId}, ${actor.actorSignature}, ${actor.argumentsDigest}
      )
    `);
  }
});
