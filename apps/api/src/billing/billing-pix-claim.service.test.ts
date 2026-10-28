import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BillingPixClaimService } from './billing-pix-claim.service';

const now = new Date('2026-11-20T13:00:00.000Z');

function service(rows: Array<Record<string, unknown>>, flags: Record<string, string> = {}) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = { billingExecution: { findMany } };
  const config = {
    get: (key: string) =>
      ({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
        ...flags,
      })[key],
  };
  return { subject: new BillingPixClaimService(prisma as never, config as never), findMany };
}

function row(index: number) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    version: index,
    nextAttemptAt: new Date(now.getTime() + index),
    createdAt: new Date(now.getTime() + index),
    messageDispatch: { scheduledFor: new Date(now.getTime() + index) },
  };
}

describe('BillingPixClaimService selection boundary', () => {
  it('selects only through the conservative persisted gates and take plus one', async () => {
    const { subject, findMany } = service([row(0)]);

    await expect(subject.select({ now, limit: 25 })).resolves.toMatchObject({
      candidates: [{ executionId: row(0).id, expectedVersion: 0 }],
      disabledReason: null,
      pagination: { limit: 25, pageCount: 1, hasMore: false, coverage: 'COMPLETE' },
    });
    const query = findMany.mock.calls[0]?.[0] as {
      take: number;
      orderBy: Array<Record<string, string>>;
      where: {
        isCurrent: boolean;
        reviewRequired: boolean;
        nextAttemptAt: { lte: Date };
        pixStatus: { in: string[] };
        messageDispatch: { is: { scheduledFor: { gte: Date; lte: Date } } };
      };
    };
    expect(query.take).toBe(26);
    expect(query.orderBy).toEqual([{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
    expect(query.where).toMatchObject({
      isCurrent: true,
      reviewRequired: false,
      nextAttemptAt: { lte: now },
      pixStatus: { in: ['NOT_STARTED', 'FAILED', 'EXPIRED'] },
      messageDispatch: {
        is: {
          scheduledFor: {
            gte: new Date('2026-11-01T03:00:00.000Z'),
            lte: now,
          },
        },
      },
    });
  });

  it('uses a stable scoped cursor without duplicates across 201 static rows', async () => {
    const all = Array.from({ length: 201 }, (_, index) => row(index));
    const { subject, findMany } = service([]);
    findMany
      .mockResolvedValueOnce(all.slice(0, 101))
      .mockResolvedValueOnce(all.slice(100, 201))
      .mockResolvedValueOnce(all.slice(200));

    const first = await subject.select({ now: new Date(now.getTime() + 1000), limit: 100 });
    const second = await subject.select({
      now: new Date(now.getTime() + 1000),
      limit: 100,
      cursor: first.pagination.nextCursor!,
    });
    const third = await subject.select({
      now: new Date(now.getTime() + 1000),
      limit: 100,
      cursor: second.pagination.nextCursor!,
    });
    const ids = [...first.candidates, ...second.candidates, ...third.candidates].map(
      (candidate) => candidate.executionId,
    );

    expect([
      first.pagination.pageCount,
      second.pagination.pageCount,
      third.pagination.pageCount,
    ]).toEqual([100, 100, 1]);
    expect(new Set(ids)).toHaveLength(201);
    expect(third.pagination).toMatchObject({ hasMore: false, coverage: 'COMPLETE' });
  });

  it('rejects malformed limits and foreign cursor contracts', async () => {
    const { subject } = service([]);
    await expect(subject.select({ limit: 0 })).rejects.toThrow('Limite de claim invalido.');
    await expect(subject.select({ limit: 101 })).rejects.toThrow(
      'Limite de claim deve estar entre 1 e 100.',
    );
    await expect(subject.select({ cursor: '***' })).rejects.toThrow('Cursor de claim invalido.');
    const foreign = Buffer.from(
      JSON.stringify({
        version: 1,
        scope: 'foreign',
        order: 'nextAttemptAt:asc,createdAt:asc,id:asc',
        nextAttemptAt: now.toISOString(),
        createdAt: now.toISOString(),
        id: randomUUID(),
      }),
    ).toString('base64url');
    await expect(subject.select({ cursor: foreign })).rejects.toThrow('Cursor de claim invalido.');
  });

  it('returns no candidates without querying when Billing or PIX is disabled', async () => {
    const { subject, findMany } = service([], { PHONE_GLOBAL_BILLING_PIX_ENABLED: 'false' });
    await expect(subject.select({ now })).resolves.toMatchObject({
      candidates: [],
      disabledReason: 'FLAGS_OR_CUTOFF_DISABLED',
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
