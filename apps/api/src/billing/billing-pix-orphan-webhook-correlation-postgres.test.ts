import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  BillingActorAttestationService,
  billingPixAnalyzeOrphanWebhookAttestationContext,
} from './billing-actor-attestation.service';
import { buildBillingExecutionIdentity } from './billing-execution-identity';
import { BillingPixClaimService } from './billing-pix-claim.service';
import { buildBillingPixCreationKey } from './billing-pix-creation-key';
import { BillingPixOrphanWebhookCorrelationService } from './billing-pix-orphan-webhook-correlation.service';
import { BillingPixWebhookQuarantineService } from './billing-pix-webhook-quarantine.service';

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === '1';
const runtimeRole = process.env.DATABASE_RUNTIME_TEST_ROLE?.trim();
const prefix = '7C-TEST-';
const systemSecret = '7c-system-attestation-secret-0000000000000001';
const webhookSecret = '7c-webhook-attestation-secret-000000000000001';

describe.skipIf(!runDatabaseTests)('Billing PIX orphan correlation PostgreSQL invariants', () => {
  const prisma = new PrismaClient();
  const peer = new PrismaClient();
  const actorConfig = {
    get: (key: string) =>
      ({
        BILLING_ACTOR_SYSTEM_KEY_ID: 'system-7c-test-v1',
        BILLING_ACTOR_SYSTEM_SIGNING_SECRET: systemSecret,
        BILLING_ACTOR_WEBHOOK_KEY_ID: 'webhook-7c-test-v1',
        BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: webhookSecret,
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
      })[key],
  };
  const actors = new BillingActorAttestationService(actorConfig as never);

  beforeAll(async () => {
    await Promise.all([prisma.$connect(), peer.$connect()]);
    for (const [actorType, secret] of [
      ['SYSTEM', systemSecret],
      ['WEBHOOK', webhookSecret],
    ] as const) {
      await prisma.$executeRaw`
        INSERT INTO public.billing_actor_keys ("actorType", "keyId", "secret")
        VALUES (
          ${actorType}::public."BillingActorType", ${`${actorType.toLowerCase()}-7c-test-v1`},
          ${Buffer.from(secret, 'utf8')}
        ) ON CONFLICT ("actorType", "keyId") DO UPDATE
        SET "secret" = EXCLUDED."secret", "enabled" = true
      `;
    }
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims, public.billing_pix_orphan_webhook_correlation_events, public.billing_pix_orphan_webhook_events, public.billing_actor_assertions, public.billing_execution_events, public.billing_pix_attempts, public.billing_execution_receivables, public.billing_executions',
    );
    await prisma.messageDispatch.deleteMany({ where: { requestId: { startsWith: prefix } } });
    await prisma.paymentIntent.deleteMany({
      where: { providerTransactionId: { startsWith: prefix } },
    });
    await prisma.paymentGroup.deleteMany({
      where: { client: { reference: { startsWith: prefix } } },
    });
    await prisma.receivable.deleteMany({ where: { description: { startsWith: prefix } } });
    await prisma.clientReference.deleteMany({ where: { reference: { startsWith: prefix } } });
    await prisma.client.deleteMany({ where: { reference: { startsWith: prefix } } });
    await prisma.plan.deleteMany({ where: { name: { startsWith: prefix } } });
  });

  afterAll(async () => {
    await Promise.all([prisma.$disconnect(), peer.$disconnect()]);
  });

  it.runIf(Boolean(runtimeRole))(
    'records an idempotent REVIEW_REQUIRED decision without a financial claim',
    async () => {
      const evidence = await createEvidence(`${prefix}UNBOUND-${randomUUID()}`);
      const before = await financialCounts();
      const service = correlationService(prisma);
      const first = await service.analyzeEvidence(evidence.eventId);
      const second = await service.analyzeEvidence(evidence.eventId);

      expect(first).toMatchObject({ decision: 'REVIEW_REQUIRED', inserted: true });
      expect(second).toMatchObject({ decision: 'REVIEW_REQUIRED', inserted: false });
      await expect(
        prisma.billingPixOrphanWebhookCorrelationEvent.count({
          where: { orphanWebhookEventId: evidence.eventId },
        }),
      ).resolves.toBe(1);
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.count({
          where: { orphanWebhookEventId: evidence.eventId },
        }),
      ).resolves.toBe(0);
      expect(await financialCounts()).toEqual(before);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'correlates only a durable exact attempt and keeps all financial content unchanged',
    async () => {
      const fixture = await createBoundFixture();
      const before = await financialSnapshot(fixture.executionId, fixture.attemptId);
      const result = await correlationService(prisma).analyzeEvidence(fixture.eventId, {
        owner: '7c-correlation-a',
        token: `${prefix}LEASE-A-${fixture.suffix}`,
      });

      expect(result).toMatchObject({
        decision: 'CORRELATED',
        inserted: true,
        reconciliationEligible: true,
      });
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
      ).resolves.toMatchObject({
        billingPixAttemptId: fixture.attemptId,
        billingExecutionId: fixture.executionId,
        providerTransactionId: fixture.transactionId,
      });
      const after = await financialSnapshot(fixture.executionId, fixture.attemptId);
      expect({ ...after.execution, version: before.execution.version }).toEqual(before.execution);
      expect(after.attempt).toEqual(before.attempt);
      expect(after.receivable).toEqual(before.receivable);
      expect(after.paymentIntentCount).toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole)).each([
    { kind: 'individual', grouped: false },
    { kind: 'grouped', grouped: true },
  ])(
    'reconciles a claimed AMBIGUOUS attempt into one exact $kind intent by GET only',
    async ({ grouped }) => {
      const fixture = await createBoundFixture({ grouped });
      const correlated = await correlationService(prisma).analyzeEvidence(fixture.eventId, {
        owner: `7c-impl5-${grouped ? 'grouped' : 'individual'}`,
        token: `${prefix}7C-IMPL5-${fixture.suffix}`,
      });
      expect(correlated).toMatchObject({
        decision: 'CORRELATED',
        reconciliationEligible: true,
      });
      const historicalClaim =
        await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
          where: { orphanWebhookEventId: fixture.eventId },
        });
      expect(historicalClaim.paymentIntentId).toBeNull();
      const receivablesBefore = await prisma.receivable.findMany({
        where: {
          billingExecutionReceivables: { some: { billingExecutionId: fixture.executionId } },
        },
        orderBy: { id: 'asc' },
      });
      const execution = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: fixture.executionId },
      });
      let getCalls = 0;
      const service = claimService(prisma);
      const input = {
        executionId: fixture.executionId,
        expectedVersion: execution.version,
        owner: `7c-impl5-reconciler-${grouped ? 'grouped' : 'individual'}`,
        token: `${prefix}7C-IMPL5-RECONCILE-${fixture.suffix}`,
        attemptId: fixture.attemptId,
        creationKey: fixture.creationKey,
        provider: 'DEPIX' as const,
        providerTransactionId: fixture.transactionId,
      };
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
              amount: fixture.totalAmount,
              pixCopyPaste: `${prefix}7C-IMPL5-PIX-${fixture.suffix}`,
              qrCodeData: null,
              expiresAt: new Date('2026-11-23T23:59:59.000Z'),
              paidAt: null,
            },
          };
        },
      };
      const result = await service.reconcilePix(input, adapter);
      expect(result).toMatchObject({ decision: 'CONFIRMED', getCalls: 1, creationPostCalls: 0 });
      expect(getCalls).toBe(1);
      const [attempt, currentExecution, claim, intents, receivablesAfter] = await Promise.all([
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
        prisma.billingExecution.findUniqueOrThrow({ where: { id: fixture.executionId } }),
        prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
        prisma.paymentIntent.findMany({ where: { creationKey: fixture.creationKey } }),
        prisma.receivable.findMany({
          where: {
            billingExecutionReceivables: { some: { billingExecutionId: fixture.executionId } },
          },
          orderBy: { id: 'asc' },
        }),
      ]);
      expect(intents).toHaveLength(1);
      expect(attempt.paymentIntentId).toBe(intents[0]!.id);
      expect(currentExecution.paymentIntentId).toBe(intents[0]!.id);
      expect(claim).toEqual(historicalClaim);
      expect(receivablesAfter).toEqual(receivablesBefore);
      expect(await prisma.financialTransaction.count()).toBe(0);
      const repeated = await service.reconcilePix(
        { ...input, expectedVersion: currentExecution.version },
        adapter,
      );
      expect(repeated).toMatchObject({
        decision: 'REUSED_PAYMENT_INTENT',
        paymentIntentId: intents[0]!.id,
        getCalls: 0,
        creationPostCalls: 0,
      });
      expect(getCalls).toBe(1);
      await expect(
        prisma.paymentIntent.count({ where: { creationKey: fixture.creationKey } }),
      ).resolves.toBe(1);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects forged or incomplete post-claim intent enrichment in PostgreSQL',
    async () => {
      const fixture = await createBoundFixture();
      await correlationService(prisma).analyzeEvidence(fixture.eventId);
      const wrongSet = await createBoundFixture();
      const cases = [
        { origin: 'MANUAL' as const },
        { provider: 'MOCK' as const },
        { providerTransactionId: `${prefix}WRONG-TX-${randomUUID()}` },
        { creationKey: `${prefix}WRONG-KEY-${randomUUID()}` },
        { amount: new Prisma.Decimal('31.00') },
        { receivableId: wrongSet.receivableId },
      ];
      for (const invalid of cases) {
        const intent = await prisma.paymentIntent.create({
          data: {
            receivableId: invalid.receivableId ?? fixture.receivableId,
            provider: invalid.provider ?? 'DEPIX',
            providerTransactionId: invalid.providerTransactionId ?? fixture.transactionId,
            status: 'WAITING_PAYMENT',
            origin: invalid.origin ?? 'BILLING',
            creationKey: invalid.creationKey ?? fixture.creationKey,
            amount: invalid.amount ?? new Prisma.Decimal(fixture.totalAmount),
          },
        });
        await expect(
          prisma.billingPixAttempt.update({
            where: { id: fixture.attemptId },
            data: { paymentIntentId: intent.id },
          }),
        ).rejects.toThrow(/intent enrichment|financial identity|receivable/u);
        await prisma.paymentIntent.delete({ where: { id: intent.id } });
      }

      const exactIntent = await prisma.paymentIntent.create({
        data: {
          receivableId: fixture.receivableId,
          provider: 'DEPIX',
          providerTransactionId: fixture.transactionId,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey: fixture.creationKey,
          amount: new Prisma.Decimal(fixture.totalAmount),
        },
      });
      await expect(
        prisma.billingPixAttempt.update({
          where: { id: fixture.attemptId },
          data: { paymentIntentId: exactIntent.id },
        }),
      ).rejects.toThrow(/link is incomplete|must identify one intent/u);
      await expect(
        prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: fixture.attemptId } }),
      ).resolves.toMatchObject({ paymentIntentId: null });
      await prisma.paymentIntent.delete({ where: { id: exactIntent.id } });

      const sealed = await createBoundFixture({ intent: 'individual' });
      await correlationService(prisma).analyzeEvidence(sealed.eventId);
      await expect(
        prisma.billingPixAttempt.update({
          where: { id: sealed.attemptId },
          data: { paymentIntentId: null },
        }),
      ).rejects.toThrow(/identity is immutable|enrichment is immutable/u);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects a partial grouped intent and an overlapping active intent after claim',
    async () => {
      const grouped = await createBoundFixture({ grouped: true });
      await correlationService(prisma).analyzeEvidence(grouped.eventId);
      const group = await prisma.paymentGroup.create({
        data: {
          clientId: (
            await prisma.billingExecution.findUniqueOrThrow({ where: { id: grouped.executionId } })
          ).clientId,
          status: 'WAITING_PAYMENT',
          totalAmount: new Prisma.Decimal(grouped.totalAmount),
          items: {
            create: { receivableId: grouped.receivableId, amount: new Prisma.Decimal('30.00') },
          },
        },
      });
      const partial = await prisma.paymentIntent.create({
        data: {
          paymentGroupId: group.id,
          provider: 'DEPIX',
          providerTransactionId: grouped.transactionId,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey: grouped.creationKey,
          amount: new Prisma.Decimal(grouped.totalAmount),
        },
      });
      await expect(
        prisma.billingPixAttempt.update({
          where: { id: grouped.attemptId },
          data: { paymentIntentId: partial.id },
        }),
      ).rejects.toThrow(/exact claimed receivable set/u);

      const individual = await createBoundFixture();
      await correlationService(prisma).analyzeEvidence(individual.eventId);
      const overlapExecution = await prisma.billingExecution.findUniqueOrThrow({
        where: { id: individual.executionId },
      });
      const overlapGroup = await prisma.paymentGroup.create({
        data: {
          clientId: overlapExecution.clientId,
          status: 'WAITING_PAYMENT',
          totalAmount: new Prisma.Decimal(individual.totalAmount),
          items: {
            create: {
              receivableId: individual.receivableId,
              amount: new Prisma.Decimal(individual.totalAmount),
            },
          },
        },
      });
      const overlapping = await prisma.paymentIntent.create({
        data: {
          paymentGroupId: overlapGroup.id,
          provider: 'DEPIX',
          providerTransactionId: `${prefix}OVERLAP-${randomUUID()}`,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey: `${prefix}OVERLAP-${randomUUID()}`,
          amount: new Prisma.Decimal(individual.totalAmount),
        },
      });
      const candidate = await prisma.paymentIntent.create({
        data: {
          receivableId: individual.receivableId,
          provider: 'DEPIX',
          providerTransactionId: individual.transactionId,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey: individual.creationKey,
          amount: new Prisma.Decimal(individual.totalAmount),
        },
      });
      await expect(
        prisma.billingPixAttempt.update({
          where: { id: individual.attemptId },
          data: { paymentIntentId: candidate.id },
        }),
      ).rejects.toThrow(/overlaps another active financial intent/u);
      expect(overlapping.id).not.toBe(candidate.id);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'serializes two correlators and returns an idempotent claim after retry',
    async () => {
      const fixture = await createBoundFixture();
      const [left, right] = await Promise.all([
        correlationService(prisma).analyzeEvidence(fixture.eventId, {
          owner: '7c-concurrent-a',
          token: `${prefix}CONCURRENT-A-${fixture.suffix}`,
        }),
        correlationService(peer).analyzeEvidence(fixture.eventId, {
          owner: '7c-concurrent-b',
          token: `${prefix}CONCURRENT-B-${fixture.suffix}`,
        }),
      ]);
      expect([left.decision, right.decision]).toContain('CORRELATED');
      expect(['ALREADY_CORRELATED', 'RETRY_LATER']).toContain(
        left.decision === 'CORRELATED' ? right.decision : left.decision,
      );
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.count({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
      ).resolves.toBe(1);
      const retried = await correlationService(prisma).analyzeEvidence(fixture.eventId, {
        owner: '7c-concurrent-retry',
        token: `${prefix}CONCURRENT-RETRY-${fixture.suffix}`,
      });
      expect(retried.decision).toBe('ALREADY_CORRELATED');
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'keeps incompatible paid evidence in review without claim or settlement',
    async () => {
      const fixture = await createBoundFixture();
      await prisma.receivable.update({
        where: { id: fixture.receivableId },
        data: { status: 'PAGO', paidAt: new Date('2026-11-23T00:00:00.000Z') },
      });
      const result = await correlationService(prisma).analyzeEvidence(fixture.eventId, {
        owner: '7c-paid-review',
        token: `${prefix}PAID-${fixture.suffix}`,
      });
      expect(result.decision).toBe('REVIEW_REQUIRED');
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.count({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
      ).resolves.toBe(0);
      await expect(
        prisma.financialTransaction.count({ where: { receivableId: fixture.receivableId } }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'denies runtime direct access and enforces append-only guards',
    async () => {
      if (!runtimeRole) throw new Error('Runtime role required.');
      const evidence = await createEvidence(`${prefix}ACL-${randomUUID()}`);
      await correlationService(prisma).analyzeEvidence(evidence.eventId);
      await expect(
        asRuntime(
          prisma,
          (tx) => tx.$queryRaw`SELECT * FROM public.billing_pix_orphan_webhook_correlation_events`,
        ),
      ).rejects.toThrow(/permission denied/);
      const event = await prisma.billingPixOrphanWebhookCorrelationEvent.findFirstOrThrow({
        where: { orphanWebhookEventId: evidence.eventId },
      });
      await expect(
        prisma.$executeRaw`UPDATE public.billing_pix_orphan_webhook_correlation_events
          SET "reasonCode" = 'FORGED' WHERE "id" = ${event.id}::uuid`,
      ).rejects.toThrow(/immutable/);
      await expect(
        prisma.$executeRaw`DELETE FROM public.billing_pix_orphan_webhook_correlation_events
          WHERE "id" = ${event.id}::uuid`,
      ).rejects.toThrow(/immutable/);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'accepts an exactly linked individual PaymentIntent without changing it',
    async () => {
      const fixture = await createBoundFixture({ intent: 'individual' });
      const before = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: fixture.paymentIntentId! },
      });
      const result = await correlationService(prisma).analyzeEvidence(fixture.eventId);
      expect(result.decision).toBe('CORRELATED');
      await expect(
        prisma.paymentIntent.findUniqueOrThrow({ where: { id: fixture.paymentIntentId! } }),
      ).resolves.toEqual(before);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'accepts an exact grouped PaymentIntent without changing group or receivables',
    async () => {
      const fixture = await createBoundFixture({ intent: 'grouped' });
      const before = await Promise.all([
        prisma.paymentIntent.findUniqueOrThrow({ where: { id: fixture.paymentIntentId! } }),
        prisma.paymentGroup.findUniqueOrThrow({ where: { id: fixture.paymentGroupId! } }),
        prisma.paymentGroupItem.findMany({
          where: { paymentGroupId: fixture.paymentGroupId! },
          orderBy: { receivableId: 'asc' },
        }),
      ]);
      const result = await correlationService(prisma).analyzeEvidence(fixture.eventId);
      expect(result.decision).toBe('CORRELATED');
      expect(
        await Promise.all([
          prisma.paymentIntent.findUniqueOrThrow({ where: { id: fixture.paymentIntentId! } }),
          prisma.paymentGroup.findUniqueOrThrow({ where: { id: fixture.paymentGroupId! } }),
          prisma.paymentGroupItem.findMany({
            where: { paymentGroupId: fixture.paymentGroupId! },
            orderBy: { receivableId: 'asc' },
          }),
        ]),
      ).toEqual(before);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects an overlapping active PaymentIntent without creating a claim',
    async () => {
      const fixture = await createBoundFixture();
      await prisma.paymentIntent.create({
        data: {
          receivableId: fixture.receivableId,
          provider: 'DEPIX',
          providerTransactionId: `${prefix}OVERLAP-${fixture.suffix}`,
          status: 'WAITING_PAYMENT',
          amount: new Prisma.Decimal('30.00'),
        },
      });
      const result = await correlationService(prisma).analyzeEvidence(fixture.eventId);
      expect(result.decision).toBe('REVIEW_REQUIRED');
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.count({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects an invalid HMAC and protects a consumed nonce from replay',
    async () => {
      const evidence = await createEvidence(`${prefix}HMAC-${randomUUID()}`);
      const row = await prisma.billingPixOrphanWebhookEvent.findUniqueOrThrow({
        where: { id: evidence.eventId },
      });
      const context = billingPixAnalyzeOrphanWebhookAttestationContext({
        eventId: row.id,
        rawBodyDigest: row.rawBodyDigest,
        reasonCode: 'NO_DURABLE_ATTEMPT',
      });
      const actor = actors.forSystem('billing-orphan-correlation', context);
      await expect(
        directAnalyze(prisma, row.id, { ...actor, actorSignature: '0'.repeat(64) }),
      ).rejects.toThrow(/signature/);
      await expect(directAnalyze(prisma, row.id, actor)).resolves.toMatchObject({
        decision: 'REVIEW_REQUIRED',
      });
      await expect(directAnalyze(prisma, row.id, actor)).rejects.toThrow(/already consumed/);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rolls back the decision and nonce together on transaction failure',
    async () => {
      const evidence = await createEvidence(`${prefix}ROLLBACK-${randomUUID()}`);
      const row = await prisma.billingPixOrphanWebhookEvent.findUniqueOrThrow({
        where: { id: evidence.eventId },
      });
      const actor = actors.forSystem(
        'billing-orphan-correlation',
        billingPixAnalyzeOrphanWebhookAttestationContext({
          eventId: row.id,
          rawBodyDigest: row.rawBodyDigest,
          reasonCode: 'NO_DURABLE_ATTEMPT',
        }),
      );
      await expect(
        prisma.$transaction(
          async (tx) => {
            if (!runtimeRole) throw new Error('Runtime role required.');
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${runtimeRole}`);
            await analyzeSql(tx, row.id, actor);
            throw new Error('forced 7C rollback');
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      ).rejects.toThrow('forced 7C rollback');
      await expect(
        prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::integer AS count FROM public.billing_actor_assertions
          WHERE "nonce" = ${actor.actorNonce}::uuid
        `,
      ).resolves.toEqual([{ count: 0 }]);
      await expect(
        prisma.billingPixOrphanWebhookCorrelationEvent.count({
          where: { orphanWebhookEventId: row.id },
        }),
      ).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'rejects the original owner-direct attack using REVIEW_REQUIRED or CONFLICT_DETECTED events',
    async () => {
      const bound = await createBoundFixture();
      await correlationService(prisma).analyzeEvidence(bound.eventId);
      const legitimate = await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
        where: { orphanWebhookEventId: bound.eventId },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
      );

      const unbound = await createEvidence(`${prefix}FIX1-REVIEW-${randomUUID()}`);
      await correlationService(prisma).analyzeEvidence(unbound.eventId);
      const review = await prisma.billingPixOrphanWebhookCorrelationEvent.findFirstOrThrow({
        where: { orphanWebhookEventId: unbound.eventId, decision: 'REVIEW_REQUIRED' },
      });
      await expect(
        insertClaim(prisma, {
          ...legitimate,
          orphanWebhookEventId: unbound.eventId,
          decisionEventId: review.id,
        }),
      ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });

      const conflictId = randomUUID();
      const conflictNonce = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO public.billing_actor_assertions (
          "nonce", "actorType", "actorUserId", "principal", "keyId", "operation",
          "billingExecutionId", "messageDispatchId", "receivableId", "financialSetDigest",
          "expectedVersion", "argumentsDigest", "issuedAtEpoch"
        )
        SELECT ${conflictNonce}::uuid, "actorType", "actorUserId", "principal", "keyId",
          "operation", "billingExecutionId", "messageDispatchId", "receivableId",
          "financialSetDigest", "expectedVersion", "argumentsDigest", "issuedAtEpoch"
        FROM public.billing_actor_assertions WHERE "nonce" = ${review.actorNonce}::uuid
      `;
      await prisma.$executeRaw`
        INSERT INTO public.billing_pix_orphan_webhook_correlation_events (
          "id", "correlationVersion", "orphanWebhookEventId", "decision", "reasonCode",
          "decisionDigest", "provider", "providerTransactionId", "billingPixAttemptId",
          "billingExecutionId", "paymentIntentId", "creationKey", "financialSetDigest",
          "expectedVersion", "actorType", "actorPrincipal", "actorKeyId", "actorNonce",
          "argumentsDigest"
        ) VALUES (
          ${conflictId}::uuid, ${review.correlationVersion}, ${bound.eventId}::uuid,
          'CONFLICT_DETECTED'::public."BillingPixOrphanCorrelationDecision", 'IDENTITY_CONFLICT',
          ${randomUUID().replaceAll('-', '').padEnd(64, '0')},
          ${legitimate.provider}::public."PaymentProviderCode", ${legitimate.providerTransactionId},
          ${legitimate.billingPixAttemptId}::uuid, ${legitimate.billingExecutionId}::uuid,
          ${legitimate.paymentIntentId}::uuid, ${legitimate.creationKey},
          ${legitimate.financialSetDigest}, 0, 'SYSTEM'::public."BillingActorType",
          ${review.actorPrincipal}, ${review.actorKeyId}, ${conflictNonce}::uuid,
          ${'1'.repeat(64)}
        )
      `;
      await expect(
        insertClaim(prisma, { ...legitimate, decisionEventId: conflictId }),
      ).rejects.toMatchObject({ code: 'P2010', meta: { code: '23514' } });
      await expect(prisma.billingPixOrphanWebhookCorrelationClaim.count()).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'accepts only exact null-safe event, evidence, attempt and execution identities',
    async () => {
      const fixture = await createBoundFixture({ intent: 'individual' });
      await correlationService(prisma).analyzeEvidence(fixture.eventId);
      const claim = await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
        where: { orphanWebhookEventId: fixture.eventId },
      });
      const other = await createBoundFixture();
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
      );
      await expect(insertClaim(prisma, claim)).resolves.toBe(1);
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
      );

      const invalidClaims = [
        { ...claim, orphanWebhookEventId: other.eventId },
        { ...claim, billingPixAttemptId: other.attemptId },
        { ...claim, billingExecutionId: other.executionId },
        { ...claim, paymentIntentId: null },
        { ...claim, provider: 'MOCK' as const },
        { ...claim, providerTransactionId: `${claim.providerTransactionId}-forged` },
        { ...claim, creationKey: `${claim.creationKey}-forged` },
        { ...claim, financialSetDigest: 'f'.repeat(64) },
      ];
      for (const invalid of invalidClaims) {
        await expect(insertClaim(prisma, invalid)).rejects.toThrow(/does not match/u);
      }
      await expect(prisma.billingPixOrphanWebhookCorrelationClaim.count()).resolves.toBe(0);
    },
  );

  it.runIf(Boolean(runtimeRole))(
    'denies runtime direct INSERT and seals attempt identity after a valid claim',
    async () => {
      const fixture = await createBoundFixture();
      await correlationService(prisma).analyzeEvidence(fixture.eventId);
      const claim = await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
        where: { orphanWebhookEventId: fixture.eventId },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
      );
      await expect(asRuntime(prisma, (tx) => insertClaim(tx, claim))).rejects.toThrow(
        /permission denied/u,
      );
      await insertClaim(prisma, claim);
      await expect(
        prisma.billingPixAttempt.update({
          where: { id: fixture.attemptId },
          data: { providerTransactionId: `${fixture.transactionId}-rewritten` },
        }),
      ).rejects.toThrow(/identity (?:is sealed|is immutable)/u);
    },
  );

  it.runIf(Boolean(runtimeRole))('rolls back a valid direct claim atomically', async () => {
    const fixture = await createBoundFixture();
    await correlationService(prisma).analyzeEvidence(fixture.eventId);
    const claim = await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
      where: { orphanWebhookEventId: fixture.eventId },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
    );
    await expect(
      prisma.$transaction(async (tx) => {
        await insertClaim(tx, claim);
        throw new Error('forced FIX1 rollback');
      }),
    ).rejects.toThrow('forced FIX1 rollback');
    await expect(prisma.billingPixOrphanWebhookCorrelationClaim.count()).resolves.toBe(0);
  });

  it.runIf(Boolean(runtimeRole))(
    'holds attempt and execution row locks until a direct claim commits',
    async () => {
      const fixture = await createBoundFixture();
      await correlationService(prisma).analyzeEvidence(fixture.eventId);
      const claim = await prisma.billingPixOrphanWebhookCorrelationClaim.findUniqueOrThrow({
        where: { orphanWebhookEventId: fixture.eventId },
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE public.billing_pix_orphan_webhook_correlation_claims',
      );

      let markInserted!: () => void;
      let releaseClaim!: () => void;
      const inserted = new Promise<void>((resolve) => (markInserted = resolve));
      const release = new Promise<void>((resolve) => (releaseClaim = resolve));
      const claimTransaction = prisma.$transaction(async (tx) => {
        await insertClaim(tx, claim);
        markInserted();
        await release;
      });
      await inserted;

      await expect(
        peer.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '100ms'");
          await tx.$executeRaw`
            UPDATE public.billing_pix_attempts SET "updatedAt" = "updatedAt"
            WHERE "id" = ${fixture.attemptId}::uuid
          `;
        }),
      ).rejects.toThrow(/lock timeout/u);
      releaseClaim();
      await claimTransaction;
      await expect(
        prisma.billingPixOrphanWebhookCorrelationClaim.count({
          where: { orphanWebhookEventId: fixture.eventId },
        }),
      ).resolves.toBe(1);
    },
  );

  async function createEvidence(transactionId: string) {
    const rawBody = Buffer.from(
      JSON.stringify({ transaction_id: transactionId, status: 'paid' }),
      'utf8',
    );
    return new BillingPixWebhookQuarantineService(
      prisma as never,
      actors,
    ).persistAuthenticatedOrphan({
      provider: 'DEPIX',
      providerTransactionId: transactionId,
      eventKey: 'transaction.paid',
      externalStatus: 'paid',
      rawBody,
      receivedAt: new Date('2026-10-27T19:00:00.000Z'),
    });
  }

  async function createBoundFixture(
    options: { intent?: 'individual' | 'grouped'; grouped?: boolean } = {},
  ) {
    const suffix = randomUUID();
    const transactionId = `${prefix}BOUND-${suffix}`;
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
        reference: `${prefix}CLIENT-${suffix}`,
        phone: '+971 52 984 6014',
        phoneNormalized: '971529846014',
        phoneE164: '+971529846014',
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
      },
    });
    const secondReceivable =
      options.intent === 'grouped' || options.grouped
        ? await prisma.receivable.create({
            data: {
              clientId: client.id,
              clientReferenceId: reference.id,
              description: `${prefix}RECEIVABLE-SECOND-${suffix}`,
              amount: new Prisma.Decimal(20),
              dueDate: new Date('2026-11-24T00:00:00.000Z'),
            },
          })
        : null;
    const dispatch = await prisma.messageDispatch.create({
      data: {
        clientId: client.id,
        clientReferenceId: reference.id,
        receivableId: secondReceivable ? null : receivable.id,
        phone: client.phoneNormalized,
        body: '7C isolated test dispatch',
        origin: 'BILLING',
        status: 'PROCESSING',
        requestId: `${prefix}DISPATCH-${suffix}`,
        idempotencyKey: `${prefix}DISPATCH-${suffix}`,
        scheduledFor: new Date('2026-11-20T13:00:00.000Z'),
        ...(secondReceivable
          ? {
              items: {
                create: [
                  {
                    receivableId: receivable.id,
                    clientReferenceId: reference.id,
                    amount: receivable.amount,
                    dueDate: receivable.dueDate,
                    referenceSnapshot: reference.reference,
                    statusSnapshot: receivable.status,
                  },
                  {
                    receivableId: secondReceivable.id,
                    clientReferenceId: reference.id,
                    amount: secondReceivable.amount,
                    dueDate: secondReceivable.dueDate,
                    referenceSnapshot: reference.reference,
                    statusSnapshot: secondReceivable.status,
                  },
                ],
              },
            }
          : {}),
      },
    });
    const executionId = randomUUID();
    const identityReceivables = [
      { id: receivable.id, amount: '30.00', dueDate: receivable.dueDate },
      ...(secondReceivable
        ? [{ id: secondReceivable.id, amount: '20.00', dueDate: secondReceivable.dueDate }]
        : []),
    ];
    const totalAmount = secondReceivable ? '50.00' : '30.00';
    const identity = buildBillingExecutionIdentity({
      clientId: client.id,
      cycleKey: '2026-11',
      receivables: identityReceivables,
    });
    const creationKey = buildBillingPixCreationKey({
      executionId,
      provider: 'DEPIX',
      cycleKey: '2026-11',
      receivableSetHash: identity.receivableSetHash,
      totalAmount,
    });
    const attemptId = randomUUID();
    let paymentIntentId: string | null = null;
    let paymentGroupId: string | null = null;
    if (options.intent === 'individual') {
      const intent = await prisma.paymentIntent.create({
        data: {
          receivableId: receivable.id,
          provider: 'DEPIX',
          providerTransactionId: transactionId,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey,
          amount: new Prisma.Decimal(totalAmount),
        },
      });
      paymentIntentId = intent.id;
    } else if (options.intent === 'grouped' && secondReceivable) {
      const group = await prisma.paymentGroup.create({
        data: {
          clientId: client.id,
          status: 'WAITING_PAYMENT',
          totalAmount: new Prisma.Decimal(totalAmount),
          items: {
            create: [
              { receivableId: receivable.id, amount: receivable.amount },
              { receivableId: secondReceivable.id, amount: secondReceivable.amount },
            ],
          },
        },
      });
      paymentGroupId = group.id;
      const intent = await prisma.paymentIntent.create({
        data: {
          paymentGroupId: group.id,
          provider: 'DEPIX',
          providerTransactionId: transactionId,
          status: 'WAITING_PAYMENT',
          origin: 'BILLING',
          creationKey,
          amount: new Prisma.Decimal(totalAmount),
        },
      });
      paymentIntentId = intent.id;
    }
    if (paymentIntentId) {
      await prisma.messageDispatch.update({
        where: { id: dispatch.id },
        data: { paymentIntentId },
      });
    }
    await prisma.billingExecution.create({
      data: {
        id: executionId,
        messageDispatchId: dispatch.id,
        clientId: client.id,
        executionKey: identity.executionKey,
        cycleKey: '2026-11',
        receivableSetHash: identity.receivableSetHash,
        authorizationMode: 'GLOBAL_INTERNATIONAL',
        status: 'PROCESSING',
        pixStatus: 'AMBIGUOUS',
        reviewRequired: true,
        paymentIntentId,
        blockedCode: 'PIX_REMOTE_RESULT_UNCERTAIN',
        blockedReason: 'Provider result requires safe correlation.',
        receivables: {
          create: [
            {
              receivableId: receivable.id,
              clientReferenceId: reference.id,
              amountSnapshot: receivable.amount,
              dueDateSnapshot: receivable.dueDate,
              statusSnapshot: receivable.status,
              referenceSnapshot: reference.reference,
            },
            ...(secondReceivable
              ? [
                  {
                    receivableId: secondReceivable.id,
                    clientReferenceId: reference.id,
                    amountSnapshot: secondReceivable.amount,
                    dueDateSnapshot: secondReceivable.dueDate,
                    statusSnapshot: secondReceivable.status,
                    referenceSnapshot: reference.reference,
                  },
                ]
              : []),
          ],
        },
        pixAttempts: {
          create: {
            id: attemptId,
            creationKey,
            status: 'AMBIGUOUS',
            provider: 'DEPIX',
            providerTransactionId: transactionId,
            paymentIntentId,
            reviewRequired: true,
            failureCode: 'FASTDEPIX_TIMEOUT_WITH_ID',
            failureMessage: 'Provider result uncertain in isolated test.',
            reconciliationEvidence: 'Durable identified request requires reconciliation.',
            startedAt: new Date('2026-11-20T13:00:00.000Z'),
          },
        },
      },
    });
    const evidence = await createEvidence(transactionId);
    return {
      suffix,
      eventId: evidence.eventId,
      transactionId,
      executionId,
      attemptId,
      receivableId: receivable.id,
      paymentIntentId,
      paymentGroupId,
      creationKey,
      totalAmount,
    };
  }

  function correlationService(db: PrismaClient) {
    if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/iu.test(runtimeRole)) {
      throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple identifier.');
    }
    const runtimePrisma = {
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ) =>
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${runtimeRole}`);
          return callback(tx);
        }, options),
    };
    return new BillingPixOrphanWebhookCorrelationService(runtimePrisma as never, actors);
  }

  function claimService(db: PrismaClient) {
    if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/iu.test(runtimeRole)) {
      throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple identifier.');
    }
    const runtimePrisma = {
      billingExecution: db.billingExecution,
      $transaction: <T>(
        callback: (tx: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
      ) =>
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${runtimeRole}`);
          return callback(tx);
        }, options),
    };
    return new BillingPixClaimService(runtimePrisma as never, actorConfig as never, actors);
  }

  function asRuntime<T>(db: PrismaClient, callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    if (!runtimeRole || !/^[a-z_][a-z0-9_]*$/iu.test(runtimeRole)) {
      throw new Error('DATABASE_RUNTIME_TEST_ROLE must be a simple identifier.');
    }
    return db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${runtimeRole}`);
        return callback(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  function directAnalyze(
    db: PrismaClient,
    eventId: string,
    actor: ReturnType<BillingActorAttestationService['forSystem']>,
  ) {
    return asRuntime(db, (tx) => analyzeSql(tx, eventId, actor));
  }

  function insertClaim(
    db: PrismaClient | Prisma.TransactionClient,
    claim: {
      orphanWebhookEventId: string;
      decisionEventId: string;
      billingPixAttemptId: string;
      billingExecutionId: string;
      paymentIntentId: string | null;
      provider: string;
      providerTransactionId: string;
      creationKey: string;
      financialSetDigest: string;
    },
  ) {
    return db.$executeRaw`
      INSERT INTO public.billing_pix_orphan_webhook_correlation_claims (
        "orphanWebhookEventId", "decisionEventId", "billingPixAttemptId",
        "billingExecutionId", "paymentIntentId", "provider", "providerTransactionId",
        "creationKey", "financialSetDigest"
      ) VALUES (
        ${claim.orphanWebhookEventId}::uuid, ${claim.decisionEventId}::uuid,
        ${claim.billingPixAttemptId}::uuid, ${claim.billingExecutionId}::uuid,
        ${claim.paymentIntentId}::uuid, ${claim.provider}::public."PaymentProviderCode",
        ${claim.providerTransactionId}, ${claim.creationKey}, ${claim.financialSetDigest}
      )
    `;
  }

  function analyzeSql(
    tx: Prisma.TransactionClient,
    eventId: string,
    actor: ReturnType<BillingActorAttestationService['forSystem']>,
  ) {
    return tx
      .$queryRaw<Array<{ decision: string; decisionEventId: string | null; inserted: boolean }>>(
        Prisma.sql`
      SELECT decision, "decisionEventId", inserted
      FROM public.billing_pix_analyze_orphan_webhook(
        ${eventId}::uuid, ${'NO_DURABLE_ATTEMPT'},
        ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
        ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
        ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
        ${actor.argumentsDigest}
      )
    `,
      )
      .then((rows) => rows[0]);
  }

  function financialCounts() {
    return Promise.all([
      prisma.billingExecution.count(),
      prisma.billingPixAttempt.count(),
      prisma.paymentIntent.count(),
      prisma.paymentGroup.count(),
      prisma.financialTransaction.count(),
    ]);
  }

  async function financialSnapshot(executionId: string, attemptId: string) {
    const execution = await prisma.billingExecution.findUniqueOrThrow({
      where: { id: executionId },
    });
    const attempt = await prisma.billingPixAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const receivableLink = await prisma.billingExecutionReceivable.findFirstOrThrow({
      where: { billingExecutionId: executionId },
    });
    const receivable = await prisma.receivable.findUniqueOrThrow({
      where: { id: receivableLink.receivableId },
      select: { status: true, paidAt: true, amount: true, dueDate: true },
    });
    return {
      execution: {
        status: execution.status,
        pixStatus: execution.pixStatus,
        deliveryStatus: execution.deliveryStatus,
        reviewRequired: execution.reviewRequired,
        paymentIntentId: execution.paymentIntentId,
        version: execution.version,
      },
      attempt: {
        status: attempt.status,
        provider: attempt.provider,
        providerTransactionId: attempt.providerTransactionId,
        paymentIntentId: attempt.paymentIntentId,
        reviewRequired: attempt.reviewRequired,
        failureCode: attempt.failureCode,
      },
      receivable,
      paymentIntentCount: await prisma.paymentIntent.count(),
    };
  }
});
