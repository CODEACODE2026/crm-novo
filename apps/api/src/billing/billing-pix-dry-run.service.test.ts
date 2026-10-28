import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BillingPixDryRunService } from './billing-pix-dry-run.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

const now = new Date('2026-10-24T12:00:00.000Z');

type ExecutionOverrides = {
  id?: string;
  receivableId?: string;
  dueDate?: Date;
  receivableStatus?: string;
  reference?: string;
  amount?: string;
  amountSnapshot?: string;
  paymentIntents?: unknown[];
  optIn?: boolean;
  referenceStatus?: string;
  dispatchStatus?: string;
  scheduledFor?: Date;
  connectionStatus?: string;
  authorizationMode?: string;
  executionStatus?: string;
  pixStatus?: string;
  deliveryStatus?: string;
  reviewRequired?: boolean;
  phone?: string;
  phoneNormalized?: string;
  phoneE164?: string;
};

function execution(overrides: ExecutionOverrides = {}) {
  const id = overrides.id ?? 'execution-november';
  const receivableId = overrides.receivableId ?? 'receivable-november';
  const dueDate = overrides.dueDate ?? new Date('2026-11-23T00:00:00.000Z');
  const status = overrides.receivableStatus ?? 'PENDENTE';
  const reference = overrides.reference ?? 'luiz6706';
  const amount = new Prisma.Decimal(overrides.amount ?? '30.00');
  const paymentIntents = overrides.paymentIntents ?? [];
  const clientReference = {
    id: `reference-${reference}`,
    clientId: `client-${reference}`,
    reference,
    planId: 'plan-id',
    recurringValue: amount,
    dueDate,
    billingAnchorDay: 23,
    billingNoticeDays: 3,
    internationalBillingEnabled: overrides.optIn !== false,
    status: overrides.referenceStatus ?? 'ATIVO',
    notes: null,
    inactivatedAt: null,
    inactivationReason: null,
    inactivatedByUserId: null,
    canceledAt: null,
    cancellationReason: null,
    canceledByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  const receivable = {
    id: receivableId,
    clientId: `client-${reference}`,
    clientReferenceId: clientReference.id,
    renewalId: null,
    purpose: 'RENEWAL',
    description: `Renovacao ${reference}`,
    amount,
    dueDate,
    status,
    paidAt: status === 'PAGO' ? now : null,
    canceledAt: null,
    cancelReason: null,
    payerName: null,
    payerPhone: null,
    payerPhoneNormalized: null,
    financialCategoryId: null,
    manualChargeIdempotencyKey: null,
    createdAt: now,
    updatedAt: now,
    paymentIntents,
    paymentGroupItems: [],
  };
  const dispatch = {
    id: `dispatch-${id}`,
    clientId: `client-${reference}`,
    clientReferenceId: clientReference.id,
    receivableId,
    templateId: 'template-id',
    whatsAppConnectionId: 'connection-id',
    recoveryCampaignId: null,
    paymentIntentId: null,
    phone: '971529846014',
    body: 'billing preview',
    renderedContent: 'billing preview',
    origin: 'BILLING',
    status: overrides.dispatchStatus ?? 'SCHEDULED',
    requestId: `request-${id}`,
    idempotencyKey: `billing:${id}`,
    scheduledFor: overrides.scheduledFor ?? new Date('2026-11-20T12:00:00.000Z'),
    nextAttemptAt: null,
    attempts: 0,
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
    whatsAppConnection: {
      id: 'connection-id',
      name: 'KiraGo',
      provider: 'KIRAGO',
      providerUserId: null,
      providerInstanceName: 'instance',
      providerTokenEncrypted: 'not-used-by-dry-run',
      phone: null,
      status: overrides.connectionStatus ?? 'CONNECTED',
      connected: overrides.connectionStatus !== 'DISCONNECTED',
      loggedIn: overrides.connectionStatus !== 'DISCONNECTED',
      webhookConfigured: true,
      lastStatusAt: now,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    items: [
      {
        id: `dispatch-item-${id}`,
        messageDispatchId: `dispatch-${id}`,
        receivableId,
        clientReferenceId: clientReference.id,
        amount,
        dueDate,
        referenceSnapshot: reference,
        statusSnapshot: 'PENDENTE',
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  return {
    id,
    messageDispatchId: dispatch.id,
    clientId: `client-${reference}`,
    paymentIntentId: null,
    executionKey: `billing-execution:v2:${id}`,
    cycleKey: dueDate.toISOString().slice(0, 7),
    receivableSetHash: 'a'.repeat(64),
    authorizationMode: overrides.authorizationMode ?? 'GLOBAL_INTERNATIONAL',
    status: overrides.executionStatus ?? 'SCHEDULED',
    pixStatus: overrides.pixStatus ?? 'NOT_STARTED',
    deliveryStatus: overrides.deliveryStatus ?? 'NOT_READY',
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    blockedCode: null,
    blockedReason: null,
    reviewRequired: overrides.reviewRequired ?? false,
    isCurrent: true,
    supersededAt: null,
    supersedesExecutionId: null,
    lastActorType: 'SYSTEM',
    lastActorUserId: null,
    lastMutationReason: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
    client: {
      id: `client-${reference}`,
      name: 'Luiz Fixture',
      phone: overrides.phone ?? '+971 52 984 6014',
      phoneNormalized: overrides.phoneNormalized ?? '971529846014',
      phoneE164: overrides.phoneE164 ?? '+971529846014',
      email: null,
      reference,
      planId: 'plan-id',
      recurringValue: amount,
      dueDate,
      billingAnchorDay: 23,
      billingNoticeDays: 3,
      preferredPixProvider: null,
      notes: null,
      status: 'ATIVO',
      createdAt: now,
      updatedAt: now,
    },
    messageDispatch: dispatch,
    paymentIntent: null,
    pixAttempts:
      overrides.pixStatus === 'AMBIGUOUS'
        ? [
            {
              id: `attempt-${id}`,
              billingExecutionId: id,
              paymentIntentId: null,
              creationKey: `creation-${id}`,
              isCurrent: true,
              status: 'AMBIGUOUS',
              provider: 'FASTFLOW',
              providerCorrelationId: null,
              providerTransactionId: null,
              failureCode: 'REMOTE_RESULT_UNCERTAIN',
              failureMessage: null,
              reviewRequired: true,
              reconciledAt: null,
              reconciliationEvidence: null,
              startedAt: now,
              confirmedAt: null,
              finishedAt: null,
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [],
    receivables: [
      {
        id: `execution-item-${id}`,
        billingExecutionId: id,
        receivableId,
        clientReferenceId: clientReference.id,
        amountSnapshot: new Prisma.Decimal(overrides.amountSnapshot ?? amount),
        dueDateSnapshot: dueDate,
        statusSnapshot: 'PENDENTE',
        referenceSnapshot: reference,
        createdAt: now,
        clientReference,
        receivable,
      },
    ],
  };
}

function service(executions: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(executions);
  const prisma = { billingExecution: { findMany } };
  const config = {
    get: (key: string) =>
      ({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00.000Z',
      })[key],
  };
  return {
    subject: new BillingPixDryRunService(prisma as never, config as never),
    findMany,
    prisma,
  };
}

describe('BillingPixDryRunService', () => {
  it('keeps paid October excluded and identifies only pending November as a future candidate', async () => {
    const october = execution({
      id: 'execution-october',
      receivableId: 'receivable-october',
      dueDate: new Date('2026-10-23T00:00:00.000Z'),
      scheduledFor: new Date('2026-10-20T12:00:00.000Z'),
      receivableStatus: 'PAGO',
    });
    const november = execution({});
    const rafael = execution({
      id: 'execution-rafael',
      reference: 'rafael',
      authorizationMode: 'LEGACY_BRAZIL',
      phone: '(44) 99999-9999',
      phoneNormalized: '5544999999999',
      phoneE164: '+5544999999999',
    });
    const rafaelStatusBefore = rafael.receivables[0]!.receivable.status;
    const { subject, findMany, prisma } = service([october, november, rafael]);

    const result = await subject.preview({ now });

    expect(result.effects).toEqual({
      databaseWrites: 0,
      externalCalls: 0,
      leasesAcquired: 0,
      pixReservations: 0,
    });
    expect(
      result.candidates.find((item) => item.executionId === 'execution-october'),
    ).toMatchObject({
      eligible: false,
      decision: 'BLOCKED',
      exclusions: expect.arrayContaining([
        expect.objectContaining({ code: 'RECEIVABLE_NOT_PENDING' }),
      ]),
    });
    expect(
      result.candidates.find((item) => item.executionId === 'execution-november'),
    ).toMatchObject({
      eligible: true,
      decision: 'CREATE_PIX_CANDIDATE',
      timing: 'FUTURE',
      financialSet: {
        total: '30.00',
        receivables: [expect.objectContaining({ reference: 'luiz6706' })],
      },
    });
    expect(rafael.receivables[0]!.receivable.status).toBe(rafaelStatusBefore);
    expect(result.candidates.find((item) => item.executionId === 'execution-rafael')).toMatchObject(
      { eligible: true, client: { e164: '+5544999999999' } },
    );
    expect(findMany).toHaveBeenCalledOnce();
    expect(Object.keys(prisma)).toEqual(['billingExecution']);
  });

  it.each([
    ['opt-in revoked', { optIn: false }, 'REFERENCE_OPT_IN_REQUIRED'],
    ['canceled receivable', { receivableStatus: 'CANCELADO' }, 'RECEIVABLE_NOT_PENDING'],
    [
      'disconnected KiraGo',
      { connectionStatus: 'DISCONNECTED' },
      'WHATSAPP_CONNECTION_NOT_OPERATIONAL',
    ],
    ['divergent client phone', { phoneNormalized: '971529846015' }, 'PHONE_IDENTITY_MISMATCH'],
    [
      'financial snapshot mismatch',
      { amount: '31.00', amountSnapshot: '30.00' },
      'FINANCIAL_SNAPSHOT_MISMATCH',
    ],
    ['ambiguous PIX', { pixStatus: 'AMBIGUOUS' }, 'REVIEW_REQUIRED'],
  ])('reports %s without side effects', async (_label, overrides, expectedCode) => {
    const { subject } = service([execution(overrides)]);
    const result = await subject.preview({ now });

    expect(result.candidates[0]).toMatchObject({
      eligible: false,
      exclusions: expect.arrayContaining([expect.objectContaining({ code: expectedCode })]),
    });
  });

  it('reuses only a valid PIX for the exact receivable and amount', async () => {
    const intent = {
      id: 'intent-id',
      receivableId: 'receivable-november',
      paymentGroupId: null,
      provider: 'FASTFLOW',
      providerTransactionId: 'provider-id',
      externalStatus: 'pending',
      externalDepixId: null,
      blockchainTxId: null,
      status: 'WAITING_PAYMENT',
      origin: 'BILLING',
      creationKey: 'creation-key',
      amount: new Prisma.Decimal('30.00'),
      pixCopyPaste: 'pix-copy-paste',
      qrCodeData: null,
      expiresAt: new Date('2026-11-23T23:59:00.000Z'),
      paidAt: null,
      lastSyncAt: now,
      failureCode: null,
      failureMessage: null,
      createdAt: now,
      updatedAt: now,
    };
    const { subject } = service([execution({ paymentIntents: [intent] })]);

    const result = await subject.preview({ now });
    expect(result.candidates[0]).toMatchObject({
      eligible: true,
      decision: 'REUSE_PIX',
      paymentIntent: { id: 'intent-id', reusable: true },
    });
  });

  it.each([
    ['zero records', 0],
    ['one record', 1],
    ['exactly one full page', 100],
  ])('reports complete coverage for %s', async (_label, count) => {
    const rows = Array.from({ length: count }, (_, index) =>
      execution({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    );
    const { subject, findMany } = service(rows);

    const result = await subject.preview({ now });

    expect(result.pagination).toMatchObject({
      limit: 100,
      pageCount: count,
      hasMore: false,
      nextCursor: null,
      coverage: 'COMPLETE',
      consistency: 'BEST_EFFORT_NON_SNAPSHOT',
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 101,
        orderBy: [
          { nextAttemptAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      }),
    );
  });

  it('pages through the 101st record without duplicates and marks partial coverage', async () => {
    const rows = Array.from({ length: 101 }, (_, index) =>
      execution({ id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}` }),
    );
    const { subject, findMany } = service([]);
    findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([rows[100]]);

    const first = await subject.preview({ now });
    const second = await subject.preview({ now, cursor: first.pagination.nextCursor! });

    expect(first.pagination).toMatchObject({
      pageCount: 100,
      hasMore: true,
      coverage: 'PARTIAL',
    });
    expect(second.pagination).toMatchObject({
      pageCount: 1,
      hasMore: false,
      coverage: 'COMPLETE',
    });
    expect(
      new Set([...first.candidates, ...second.candidates].map((item) => item.executionId)),
    ).toHaveLength(101);
  });

  it('crosses three pages for 201 records and reaches an eligible final candidate', async () => {
    const rows = Array.from({ length: 201 }, (_, index) =>
      execution({
        id: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        executionStatus: index < 200 ? 'BLOCKED' : 'SCHEDULED',
      }),
    );
    const { subject, findMany } = service([]);
    findMany
      .mockResolvedValueOnce(rows.slice(0, 101))
      .mockResolvedValueOnce(rows.slice(100, 201))
      .mockResolvedValueOnce(rows.slice(200));

    const first = await subject.preview({ now });
    const second = await subject.preview({ now, cursor: first.pagination.nextCursor! });
    const third = await subject.preview({ now, cursor: second.pagination.nextCursor! });
    const combined = [...first.candidates, ...second.candidates, ...third.candidates];

    expect([
      first.pagination.pageCount,
      second.pagination.pageCount,
      third.pagination.pageCount,
    ]).toEqual([100, 100, 1]);
    expect(new Set(combined.map((item) => item.executionId))).toHaveLength(201);
    expect(third.candidates[0]).toMatchObject({
      eligible: true,
      decision: 'CREATE_PIX_CANDIDATE',
    });
  });

  it('rejects malformed, foreign-scope and incompatible-order cursors', async () => {
    const { subject } = service([]);
    const cursor = (scope: string, order: string) =>
      Buffer.from(
        JSON.stringify({
          version: 1,
          scope,
          order,
          nextAttemptAt: null,
          createdAt: now.toISOString(),
          id: '30000000-0000-4000-8000-000000000001',
        }),
        'utf8',
      ).toString('base64url');

    await expect(subject.preview({ cursor: '***', now })).rejects.toThrow(
      'Cursor do dry-run invalido.',
    );
    await expect(subject.preview({ cursor: '', now })).rejects.toThrow(
      'Cursor do dry-run invalido.',
    );
    await expect(
      subject.preview({
        cursor: cursor('another-query', 'nextAttemptAt:asc:nullsLast,createdAt:asc,id:asc'),
        now,
      }),
    ).rejects.toThrow('Cursor do dry-run invalido.');
    await expect(
      subject.preview({
        cursor: cursor('billing-pix-dry-run:isCurrent=true', 'createdAt:desc,id:desc'),
        now,
      }),
    ).rejects.toThrow('Cursor do dry-run invalido.');
  });

  it('rejects invalid limits and returns a stable result for repeated reads', async () => {
    const rows = [execution({ id: '40000000-0000-4000-8000-000000000001' })];
    const { subject } = service(rows);

    await expect(subject.preview({ limit: '0', now })).rejects.toThrow(
      'Limite do dry-run invalido.',
    );
    await expect(subject.preview({ limit: '101', now })).rejects.toThrow(
      'Limite do dry-run deve estar entre 1 e 100.',
    );
    const first = await subject.preview({ limit: 50, now });
    const repeated = await subject.preview({ limit: 50, now });
    expect(repeated).toEqual(first);
  });

  it('uses a coherent null cursor and documents concurrent changes as non-snapshot', async () => {
    const firstRow = execution({ id: '50000000-0000-4000-8000-000000000001' });
    const secondRow = execution({ id: '50000000-0000-4000-8000-000000000002' });
    const { subject, findMany } = service([]);
    findMany.mockResolvedValueOnce([firstRow, secondRow]).mockResolvedValueOnce([secondRow]);

    const first = await subject.preview({ limit: 1, now });
    const second = await subject.preview({
      limit: 1,
      now,
      cursor: first.pagination.nextCursor!,
    });

    expect(first.pagination).toMatchObject({
      consistency: 'BEST_EFFORT_NON_SNAPSHOT',
      coverage: 'PARTIAL',
    });
    expect(first.pagination.concurrencyNotice).toContain('reinicie da primeira pagina');
    expect(second.candidates.map((item) => item.executionId)).toEqual([secondRow.id]);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          nextAttemptAt: null,
          OR: [{ createdAt: { gt: now } }, { createdAt: now, id: { gt: firstRow.id } }],
        }),
      }),
    );
  });
});
