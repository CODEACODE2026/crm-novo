import { describe, expect, it, vi } from 'vitest';
import { BillingActorAttestationService } from './billing-actor-attestation.service';
import { BillingPixOrphanWebhookCorrelationService } from './billing-pix-orphan-webhook-correlation.service';

const evidenceId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const dispatchId = '44444444-4444-4444-8444-444444444444';

function actors() {
  return new BillingActorAttestationService({
    get: (key: string) =>
      ({
        BILLING_ACTOR_SYSTEM_KEY_ID: 'system-test-v1',
        BILLING_ACTOR_SYSTEM_SIGNING_SECRET: 'system-test-signing-secret-000000000001',
      })[key],
  } as never);
}

function subject(rows: unknown[][]) {
  const query = vi.fn();
  for (const row of rows) query.mockResolvedValueOnce(row);
  const tx = { $queryRaw: query };
  const prisma = {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    service: new BillingPixOrphanWebhookCorrelationService(prisma as never, actors()),
    prisma,
    query,
  };
}

describe('BillingPixOrphanWebhookCorrelationService', () => {
  it('records an explicit review decision without lease when no durable attempt exists', async () => {
    const { service, query } = subject([
      [
        {
          evidenceId,
          provider: 'DEPIX',
          providerTransactionId: 'tx-unbound',
          rawBodyDigest: 'a'.repeat(64),
          attemptId: null,
          executionId: null,
          messageDispatchId: null,
          paymentIntentId: null,
          creationKey: null,
          financialSetDigest: null,
          expectedVersion: null,
        },
      ],
      [
        {
          decision: 'REVIEW_REQUIRED',
          decisionEventId: dispatchId,
          inserted: true,
        },
      ],
    ]);

    await expect(service.analyzeEvidence(evidenceId)).resolves.toEqual({
      decision: 'REVIEW_REQUIRED',
      decisionEventId: dispatchId,
      inserted: true,
      reconciliationEligible: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('acquires and releases a lease around a proven correlation', async () => {
    const { service, query } = subject([
      [
        {
          evidenceId,
          provider: 'DEPIX',
          providerTransactionId: 'tx-bound',
          rawBodyDigest: 'a'.repeat(64),
          attemptId,
          executionId,
          messageDispatchId: dispatchId,
          paymentIntentId: null,
          creationKey: 'bpx1:key',
          financialSetDigest: 'b'.repeat(64),
          expectedVersion: 7,
        },
      ],
      [{ acquired: true }],
      [
        {
          decision: 'CORRELATED',
          decisionEventId: evidenceId,
          inserted: true,
          reconciliationEligible: true,
        },
      ],
      [{ released: true }],
    ]);

    await expect(
      service.analyzeEvidence(evidenceId, { owner: 'worker', token: 'lease-token' }),
    ).resolves.toMatchObject({ decision: 'CORRELATED', reconciliationEligible: true });
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('returns RETRY_LATER without signing or correlation when lease is held', async () => {
    const { service, query } = subject([
      [
        {
          evidenceId,
          provider: 'DEPIX',
          providerTransactionId: 'tx-bound',
          rawBodyDigest: 'a'.repeat(64),
          attemptId,
          executionId,
          messageDispatchId: dispatchId,
          paymentIntentId: null,
          creationKey: 'bpx1:key',
          financialSetDigest: 'b'.repeat(64),
          expectedVersion: 7,
        },
      ],
      [{ acquired: false }],
    ]);

    await expect(service.analyzeEvidence(evidenceId)).resolves.toMatchObject({
      decision: 'RETRY_LATER',
      inserted: false,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects an out-of-contract lease TTL before any database access', async () => {
    const { service, prisma, query } = subject([]);
    await expect(service.analyzeEvidence(evidenceId, { ttlSeconds: 0 })).rejects.toThrow(/TTL/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
