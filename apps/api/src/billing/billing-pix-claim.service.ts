import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProviderCode, Prisma, type PaymentIntentStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { acquireFinancialSetLocks } from '../finance/financial-set-lock';
import { comparePhoneIdentities, normalizePhone } from '../common/phone/phone-normalizer';
import { buildBillingExecutionIdentity } from './billing-execution-identity';
import {
  BillingActorAttestationService,
  billingPixPrepareCreateAttestationContext,
  billingPixReconcileCreateResultAttestationContext,
  billingPixRecordCreateResultAttestationContext,
  billingPixReserveAttestationContext,
} from './billing-actor-attestation.service';
import { buildBillingPixCreationKey } from './billing-pix-creation-key';
import {
  normalizeFastDepixProviderTransactionId,
  type FastDepixCreateOutcome,
  type FastDepixCreateRequest,
  type FastDepixTransactionLookupOutcome,
} from '../finance/payments/fastdepix-create-contract';

const selectionLimitDefault = 20;
const selectionLimitMaximum = 100;
const selectionCursorVersion = 1;
const selectionCursorScope = 'billing-pix-claim:isCurrent=true';
const selectionCursorOrder = 'nextAttemptAt:asc,createdAt:asc,id:asc';
const selectableExecutionStatuses = ['SCHEDULED', 'PROCESSING', 'WAITING_PIX'] as const;
const activeIntentStatuses: PaymentIntentStatus[] = ['CREATED', 'WAITING_PAYMENT'];

const claimInclude = {
  client: true,
  messageDispatch: {
    include: {
      whatsAppConnection: true,
      items: true,
    },
  },
  paymentIntent: true,
  pixAttempts: { where: { isCurrent: true }, orderBy: { createdAt: 'desc' as const } },
  receivables: {
    include: {
      clientReference: true,
      receivable: {
        include: {
          paymentIntents: true,
          paymentGroupItems: {
            include: { paymentGroup: { include: { paymentIntents: true, items: true } } },
          },
        },
      },
    },
    orderBy: { receivableId: 'asc' as const },
  },
} satisfies Prisma.BillingExecutionInclude;

type ClaimExecution = Prisma.BillingExecutionGetPayload<{ include: typeof claimInclude }>;
type ClaimDecision = 'ELIGIBLE' | 'BLOCKED' | 'REVIEW_REQUIRED' | 'RETRY_LATER';
type ClaimReason = { code: string; message: string };

type SelectionCursor = {
  version: typeof selectionCursorVersion;
  scope: typeof selectionCursorScope;
  order: typeof selectionCursorOrder;
  nextAttemptAt: string;
  createdAt: string;
  id: string;
};

export type BillingPixClaimCandidate = {
  executionId: string;
  expectedVersion: number;
  nextAttemptAt: string;
  scheduledFor: string;
};

export type BillingPixClaimInput = {
  executionId: string;
  expectedVersion: number;
  owner: string;
  token?: string;
  ttlSeconds?: number;
  now?: Date;
};

export type BillingPixClaimResult = {
  decision: ClaimDecision;
  executionId: string;
  version: number | null;
  lease: {
    acquired: boolean;
    retained: boolean;
    owner: string;
    token: string | null;
    expiresAt: string | null;
  };
  reasons: ClaimReason[];
  financialSet: null | {
    hash: string;
    total: string;
    receivableIds: string[];
  };
  revalidationRequiredBeforeExternalCall: true;
};

export type BillingPixReservationInput = {
  executionId: string;
  expectedVersion: number;
  owner: string;
  token: string;
  provider: PaymentProviderCode;
  now?: Date;
};

export type BillingPixReservationResult = {
  decision: 'RESERVED' | 'REUSED_RESERVATION' | 'REUSE_PAYMENT_INTENT' | ClaimDecision;
  executionId: string;
  version: number | null;
  creationKey: string | null;
  attemptId: string | null;
  paymentIntentId: string | null;
  leaseRetained: boolean;
  reasons: ClaimReason[];
  externalCallStarted: false;
  revalidationRequiredBeforeExternalCall: true;
};

export type BillingPixCreateAdapter = {
  create(payload: FastDepixCreateRequest): Promise<FastDepixCreateOutcome>;
};

export type BillingPixCreateInput = {
  executionId: string;
  expectedVersion: number;
  owner: string;
  token: string;
  attemptId: string;
  creationKey: string;
  provider: PaymentProviderCode;
  now?: Date;
};

export type BillingPixCreateResult = {
  decision: 'CONFIRMED' | 'BLOCKED' | 'REVIEW_REQUIRED' | 'PRE_CALL_FAILED' | 'RETRY_LATER';
  executionId: string;
  version: number | null;
  attemptId: string;
  paymentIntentId: string | null;
  providerTransactionId: string | null;
  remoteResult: FastDepixCreateOutcome['kind'] | null;
  adapterCalls: 0 | 1;
  externalCallMayHaveStarted: boolean;
  automaticRetryEligible: false;
  reasons: ClaimReason[];
};

export type BillingPixReconciliationAdapter = {
  lookup(providerTransactionId: string): Promise<FastDepixTransactionLookupOutcome>;
};

export type BillingPixReconciliationInput = {
  executionId: string;
  expectedVersion: number;
  owner: string;
  token: string;
  attemptId: string;
  creationKey: string;
  provider: PaymentProviderCode;
  providerTransactionId?: string | null;
  ttlSeconds?: number;
};

export type BillingPixReconciliationResult = {
  decision: 'CONFIRMED' | 'REUSED_PAYMENT_INTENT' | 'REVIEW_REQUIRED' | 'RETRY_LATER';
  executionId: string;
  version: number | null;
  attemptId: string;
  paymentIntentId: string | null;
  providerTransactionId: string | null;
  remoteResult: FastDepixTransactionLookupOutcome['kind'] | null;
  getCalls: 0 | 1;
  creationPostCalls: 0;
  automaticCreationRetryEligible: false;
  reasons: ClaimReason[];
};

const reservationReason = 'Automatic Billing PIX reservation persisted before external call.';
const preparationReason =
  'Automatic Billing PIX creation fence persisted before simulated provider invocation.';
const reconciliationReason =
  'Automatic Billing PIX reconciliation persisted from an identified simulated provider lookup.';

@Injectable()
export class BillingPixClaimService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(BillingActorAttestationService)
    private readonly billingActors?: BillingActorAttestationService,
  ) {}

  async select(input: { cursor?: string; limit?: number | string; now?: Date } = {}) {
    const now = input.now ?? new Date();
    const limit = this.pageLimit(input.limit);
    const gates = this.gates();
    if (!gates.billingEnabled || !gates.pixEnabled || !gates.effectiveFrom) {
      return this.selectionResult([], limit, false, null, 'FLAGS_OR_CUTOFF_DISABLED');
    }
    const cursor = input.cursor === undefined ? null : this.decodeCursor(input.cursor);
    const rows = await this.prisma.billingExecution.findMany({
      where: {
        isCurrent: true,
        reviewRequired: false,
        status: { in: [...selectableExecutionStatuses] },
        pixStatus: { in: ['NOT_STARTED', 'FAILED', 'EXPIRED'] },
        deliveryStatus: { in: ['NOT_READY', 'FAILED'] },
        nextAttemptAt: { lte: now },
        messageDispatch: {
          is: {
            origin: 'BILLING',
            status: { in: ['SCHEDULED', 'FAILED'] },
            scheduledFor: { gte: gates.effectiveFrom, lte: now },
          },
        },
        ...(cursor ? this.afterCursor(cursor) : {}),
      },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        version: true,
        nextAttemptAt: true,
        createdAt: true,
        messageDispatch: { select: { scheduledFor: true } },
      },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page.at(-1) ?? null;
    const candidates: BillingPixClaimCandidate[] = page.flatMap((row) =>
      row.nextAttemptAt && row.messageDispatch.scheduledFor
        ? [
            {
              executionId: row.id,
              expectedVersion: row.version,
              nextAttemptAt: row.nextAttemptAt.toISOString(),
              scheduledFor: row.messageDispatch.scheduledFor.toISOString(),
            },
          ]
        : [],
    );
    return this.selectionResult(
      candidates,
      limit,
      hasMore,
      hasMore && last ? this.encodeCursor(last) : null,
      null,
    );
  }

  async claimAndRevalidate(input: BillingPixClaimInput): Promise<BillingPixClaimResult> {
    this.assertClaimInput(input);
    const token = input.token ?? randomUUID();
    const ttlSeconds = input.ttlSeconds ?? 60;
    const now = input.now ?? new Date();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await this.readExecutionVersion(tx, input.executionId);
          if (!locked || locked.version !== input.expectedVersion) {
            return this.result('RETRY_LATER', input, token, locked?.version ?? null, false, false, [
              {
                code: locked ? 'EXPECTED_VERSION_STALE' : 'EXECUTION_NOT_FOUND',
                message: 'Execucao mudou antes do claim.',
              },
            ]);
          }

          const acquired = await this.acquireLease(
            tx,
            input.executionId,
            input.owner,
            token,
            ttlSeconds,
          );
          if (!acquired) {
            return this.result('RETRY_LATER', input, token, locked.version, false, false, [
              { code: 'LEASE_NOT_ACQUIRED', message: 'Outra instancia detem o lease.' },
            ]);
          }

          const financialSetRows = await tx.billingExecutionReceivable.findMany({
            where: { billingExecutionId: input.executionId },
            select: { receivableId: true },
            orderBy: { receivableId: 'asc' },
          });
          await acquireFinancialSetLocks(
            tx,
            financialSetRows.map((row) => row.receivableId),
          );

          const execution = await tx.billingExecution.findUnique({
            where: { id: input.executionId },
            include: claimInclude,
          });
          if (!execution) {
            return this.result('RETRY_LATER', input, token, null, true, false, [
              { code: 'EXECUTION_DISAPPEARED', message: 'Execucao indisponivel apos o claim.' },
            ]);
          }
          if (execution.version !== input.expectedVersion + 1) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, token);
            return this.result('RETRY_LATER', input, token, execution.version + 1, true, false, [
              {
                code: 'EXPECTED_VERSION_CHANGED_DURING_CLAIM',
                message: 'Execucao mudou durante o claim.',
              },
            ]);
          }

          const validation = await this.validate(tx, execution, now, input.owner, token);
          if (validation.decision !== 'ELIGIBLE') {
            const released = await this.releaseLeaseSql(tx, execution.id, input.owner, token);
            const current = await tx.billingExecution.findUnique({
              where: { id: execution.id },
              select: { version: true },
            });
            return this.result(
              validation.decision,
              input,
              token,
              current?.version ?? execution.version,
              true,
              !released,
              validation.reasons,
              validation.financialSet,
            );
          }

          return {
            decision: 'ELIGIBLE',
            executionId: execution.id,
            version: execution.version,
            lease: {
              acquired: true,
              retained: true,
              owner: input.owner,
              token,
              expiresAt: execution.leaseExpiresAt?.toISOString() ?? null,
            },
            reasons: [],
            financialSet: validation.financialSet,
            revalidationRequiredBeforeExternalCall: true,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (['P2034', '40001'].includes(this.prismaCode(error) ?? '')) {
        return this.result('RETRY_LATER', input, token, null, false, false, [
          { code: 'SERIALIZATION_RETRY', message: 'Conflito concorrente; tente novamente.' },
        ]);
      }
      throw error;
    }
  }

  async reservePix(input: BillingPixReservationInput): Promise<BillingPixReservationResult> {
    this.assertReservationInput(input);
    const now = input.now ?? new Date();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const financialSetRows = await tx.billingExecutionReceivable.findMany({
            where: { billingExecutionId: input.executionId },
            select: { receivableId: true },
            orderBy: { receivableId: 'asc' },
          });
          await acquireFinancialSetLocks(
            tx,
            financialSetRows.map((row) => row.receivableId),
          );

          const execution = await tx.billingExecution.findUnique({
            where: { id: input.executionId },
            include: claimInclude,
          });
          if (!execution) return this.reservationResult('RETRY_LATER', input, null, null, null, []);

          const total = execution.receivables.reduce(
            (sum, item) => sum.add(item.receivable.amount),
            new Prisma.Decimal(0),
          );
          const creationKey = buildBillingPixCreationKey({
            executionId: execution.id,
            provider: input.provider,
            cycleKey: execution.cycleKey,
            receivableSetHash: execution.receivableSetHash,
            totalAmount: total,
          });
          const leaseValid =
            execution.leaseOwner === input.owner &&
            execution.leaseToken === input.token &&
            Boolean(execution.leaseExpiresAt && execution.leaseExpiresAt > new Date());
          if (!leaseValid) {
            return this.reservationResult(
              'RETRY_LATER',
              input,
              execution.version,
              creationKey,
              null,
              [{ code: 'LEASE_LOST', message: 'Lease invalido ou expirado antes da reserva.' }],
            );
          }

          const validation = await this.validate(tx, execution, now, input.owner, input.token);
          if (validation.decision !== 'ELIGIBLE') {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              validation.decision,
              input,
              execution.version + 1,
              creationKey,
              null,
              validation.reasons,
            );
          }

          if (
            execution.client.preferredPixProvider &&
            execution.client.preferredPixProvider !== input.provider
          ) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              'REVIEW_REQUIRED',
              input,
              execution.version + 1,
              creationKey,
              null,
              [
                {
                  code: 'PIX_PROVIDER_MISMATCH',
                  message: 'Provider reservado diverge da preferencia financeira do cliente.',
                },
              ],
            );
          }

          const activeIntents = this.paymentIntents(execution).filter((intent) =>
            activeIntentStatuses.includes(intent.status),
          );
          if (
            activeIntents.length === 1 &&
            this.intentMatches(activeIntents[0]!, execution, total, now)
          ) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              'REUSE_PAYMENT_INTENT',
              input,
              execution.version + 1,
              creationKey,
              null,
              [],
              activeIntents[0]!.id,
            );
          }

          const exactAttempt = execution.pixAttempts.find(
            (attempt) => attempt.creationKey === creationKey && attempt.status === 'RESERVED',
          );
          if (exactAttempt) {
            return this.reservationResult(
              'REUSED_RESERVATION',
              input,
              execution.version,
              creationKey,
              exactAttempt.id,
              [],
              null,
              true,
            );
          }
          const historicalAttempt = await tx.billingPixAttempt.findUnique({
            where: { creationKey },
            select: { id: true, billingExecutionId: true, status: true },
          });
          if (historicalAttempt) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              'REVIEW_REQUIRED',
              input,
              execution.version + 1,
              creationKey,
              historicalAttempt.id,
              [
                {
                  code: 'PIX_RESERVATION_ALREADY_EXISTS',
                  message: 'A identidade PIX ja possui tentativa persistida e nao sera recriada.',
                },
              ],
            );
          }
          if (execution.pixAttempts.length > 0 || execution.pixStatus !== 'NOT_STARTED') {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              'REVIEW_REQUIRED',
              input,
              execution.version + 1,
              creationKey,
              null,
              [
                {
                  code: 'PIX_RESERVATION_INCOMPATIBLE',
                  message: 'Existe tentativa PIX anterior que impede nova reserva automatica.',
                },
              ],
            );
          }
          if (execution.version !== input.expectedVersion) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reservationResult(
              'RETRY_LATER',
              input,
              execution.version + 1,
              creationKey,
              null,
              [{ code: 'EXPECTED_VERSION_STALE', message: 'Versao mudou antes da reserva.' }],
            );
          }
          if (!this.billingActors) throw new Error('Billing actor signer is unavailable.');
          const actor = this.billingActors.forSystem(
            'billing-pix-reservation',
            billingPixReserveAttestationContext({
              billingExecutionId: execution.id,
              messageDispatchId: execution.messageDispatchId,
              financialSetDigest: execution.receivableSetHash,
              expectedVersion: input.expectedVersion,
              owner: input.owner,
              token: input.token,
              creationKey,
              reason: reservationReason,
            }),
          );
          const [reserved] = await tx.$queryRaw<Array<{ attemptId: string }>>(Prisma.sql`
            SELECT public.billing_pix_reserve(
              ${execution.id}::uuid,
              ${input.expectedVersion}::integer,
              ${input.owner},
              ${input.token},
              ${creationKey},
              ${actor.actorType}::public."BillingActorType",
              ${actor.actorUserId}::uuid,
              ${actor.actorPrincipal},
              ${actor.actorIssuedAt}::bigint,
              ${actor.actorNonce}::uuid,
              ${actor.actorKeyId},
              ${actor.actorSignature},
              ${reservationReason}
            ) AS "attemptId"
          `);
          if (!reserved) throw new Error('Billing PIX reservation returned no attempt.');
          return this.reservationResult(
            'RESERVED',
            input,
            input.expectedVersion + 1,
            creationKey,
            reserved.attemptId,
            [],
            null,
            true,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (['P2002', 'P2034', '23505', '40001'].includes(this.prismaCode(error) ?? '')) {
        return this.reservationResult('RETRY_LATER', input, null, null, null, [
          { code: 'SERIALIZATION_RETRY', message: 'Conflito concorrente durante a reserva.' },
        ]);
      }
      throw error;
    }
  }

  /**
   * Controlled Task-5 boundary. The caller must inject an adapter explicitly; this service is
   * not registered in a scheduler/controller and never resolves the production FastDepix client.
   */
  async createReservedPix(
    input: BillingPixCreateInput,
    adapter: BillingPixCreateAdapter,
  ): Promise<BillingPixCreateResult> {
    this.assertCreateInput(input);
    const prepared = await this.prepareCreate(input);
    if (!prepared.prepared) return prepared.result;

    let outcome: FastDepixCreateOutcome;
    try {
      outcome = await adapter.create(prepared.payload);
    } catch {
      outcome = {
        kind: 'REMOTE_RESULT_UNCERTAIN',
        requestDispatched: true,
        remoteEffect: 'UNKNOWN',
        automaticRetryEligible: false,
        providerTransactionId: null,
        code: 'FASTDEPIX_ADAPTER_THROW_AFTER_PREPARATION',
        message: 'Adaptador falhou apos a preparacao duravel; retry automatico bloqueado.',
        httpStatus: null,
      };
    }
    const normalized = this.normalizeCreateOutcome(outcome, prepared.total);
    return this.persistCreateResult(input, prepared.version, normalized);
  }

  /**
   * Controlled Task-6 boundary. Reconciliation can only query an explicitly identified
   * provider transaction through an injected adapter. It has no creation method and is not
   * registered in a controller, scheduler or worker.
   */
  async reconcilePix(
    input: BillingPixReconciliationInput,
    adapter: BillingPixReconciliationAdapter,
  ): Promise<BillingPixReconciliationResult> {
    this.assertReconciliationInput(input);
    const preflight = await this.prisma.billingExecution.findUnique({
      where: { id: input.executionId },
      include: claimInclude,
    });
    if (!preflight)
      return this.reconciliationResult('RETRY_LATER', input, null, null, null, 0, [
        { code: 'EXECUTION_NOT_FOUND', message: 'Execucao nao encontrada.' },
      ]);
    const attempt = preflight.pixAttempts.find((item) => item.id === input.attemptId);
    if (
      !attempt ||
      attempt.creationKey !== input.creationKey ||
      attempt.provider !== input.provider ||
      !attempt.isCurrent
    )
      return this.reconciliationResult('REVIEW_REQUIRED', input, preflight.version, null, null, 0, [
        { code: 'RECONCILIATION_IDENTITY_MISMATCH', message: 'Tentativa nao corresponde.' },
      ]);
    if (preflight.version !== input.expectedVersion)
      return this.reconciliationResult(
        'RETRY_LATER',
        input,
        preflight.version,
        null,
        attempt.providerTransactionId,
        0,
        [{ code: 'EXPECTED_VERSION_STALE', message: 'Execucao mudou antes da consulta.' }],
      );

    const requestedId = input.providerTransactionId
      ? normalizeFastDepixProviderTransactionId(input.providerTransactionId)
      : null;
    const persistedId = normalizeFastDepixProviderTransactionId(attempt.providerTransactionId);
    if (requestedId && persistedId && requestedId !== persistedId)
      return this.reconciliationResult(
        'REVIEW_REQUIRED',
        input,
        preflight.version,
        null,
        persistedId,
        0,
        [
          {
            code: 'PROVIDER_TRANSACTION_ID_MISMATCH',
            message: 'Identificador remoto diverge da evidencia persistida.',
          },
        ],
      );
    if (!persistedId)
      return this.reconciliationResult('REVIEW_REQUIRED', input, preflight.version, null, null, 0, [
        {
          code: 'REMOTE_TRANSACTION_UNBOUND',
          message:
            'A tentativa nao possui identificador remoto vinculado de forma duravel; revisao manual obrigatoria.',
        },
      ]);
    const providerTransactionId = persistedId;

    if (
      attempt.status === 'CONFIRMED' &&
      attempt.paymentIntentId &&
      preflight.paymentIntentId === attempt.paymentIntentId
    )
      return this.reconciliationResult(
        'REUSED_PAYMENT_INTENT',
        input,
        preflight.version,
        attempt.paymentIntentId,
        providerTransactionId,
        0,
        [],
        'FOUND',
      );

    let outcome: FastDepixTransactionLookupOutcome;
    try {
      outcome = await adapter.lookup(providerTransactionId);
    } catch {
      outcome = {
        kind: 'REMOTE_RESULT_UNCERTAIN',
        providerTransactionId,
        code: 'FASTDEPIX_RECONCILIATION_LOOKUP_FAILED',
        message: 'Consulta simulada falhou; criacao permanece bloqueada.',
      };
    }
    return this.persistReconciliationResult(input, providerTransactionId, outcome);
  }

  private async persistReconciliationResult(
    input: BillingPixReconciliationInput,
    providerTransactionId: string,
    outcome: FastDepixTransactionLookupOutcome,
  ): Promise<BillingPixReconciliationResult> {
    const normalized = this.normalizeReconciliationOutcome(providerTransactionId, outcome);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const locked = await this.readExecutionVersion(tx, input.executionId);
          if (!locked || locked.version !== input.expectedVersion)
            return this.reconciliationResult(
              'RETRY_LATER',
              input,
              locked?.version ?? null,
              null,
              providerTransactionId,
              1,
              [{ code: 'EXPECTED_VERSION_STALE', message: 'Execucao mudou durante o GET.' }],
              outcome.kind,
            );
          const acquired = await this.acquireLease(
            tx,
            input.executionId,
            input.owner,
            input.token,
            input.ttlSeconds ?? 60,
          );
          if (!acquired)
            return this.reconciliationResult(
              'RETRY_LATER',
              input,
              locked.version,
              null,
              providerTransactionId,
              1,
              [{ code: 'LEASE_NOT_ACQUIRED', message: 'Outra instancia detem o lease.' }],
              outcome.kind,
            );

          const rows = await tx.billingExecutionReceivable.findMany({
            where: { billingExecutionId: input.executionId },
            select: { receivableId: true },
            orderBy: { receivableId: 'asc' },
          });
          await acquireFinancialSetLocks(
            tx,
            rows.map((row) => row.receivableId),
          );
          const execution = await tx.billingExecution.findUniqueOrThrow({
            where: { id: input.executionId },
            include: claimInclude,
          });
          const expectedVersion = input.expectedVersion + 1;
          if (execution.version !== expectedVersion)
            throw Object.assign(new Error('Billing reconciliation version changed.'), {
              code: '40001',
            });
          const attempt = execution.pixAttempts.find((item) => item.id === input.attemptId);
          const total = execution.receivables.reduce(
            (sum, item) => sum.add(item.receivable.amount),
            new Prisma.Decimal(0),
          );
          const creationKey = buildBillingPixCreationKey({
            executionId: execution.id,
            provider: input.provider,
            cycleKey: execution.cycleKey,
            receivableSetHash: execution.receivableSetHash,
            totalAmount: total,
          });
          if (
            !attempt ||
            !attempt.isCurrent ||
            attempt.creationKey !== input.creationKey ||
            attempt.provider !== input.provider ||
            creationKey !== input.creationKey ||
            (attempt.providerTransactionId &&
              attempt.providerTransactionId !== providerTransactionId)
          ) {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return this.reconciliationResult(
              'REVIEW_REQUIRED',
              input,
              execution.version + 1,
              null,
              providerTransactionId,
              1,
              [
                {
                  code: 'RECONCILIATION_IDENTITY_MISMATCH',
                  message: 'Identidade financeira mudou depois da consulta.',
                },
              ],
              outcome.kind,
            );
          }

          const financialReasons = this.reconciliationFinancialReasons(execution, total);
          if (
            normalized.kind === 'CONFIRMED' &&
            !new Prisma.Decimal(normalized.amount).equals(total)
          )
            financialReasons.push({
              code: 'RECONCILIATION_AMOUNT_MISMATCH',
              message: 'Valor remoto diverge do conjunto financeiro.',
            });
          const persistKind =
            normalized.kind === 'CONFIRMED' && financialReasons.length === 0
              ? 'CONFIRMED'
              : 'REVIEW_REQUIRED';
          const failureCode =
            financialReasons[0]?.code ??
            (normalized.kind === 'REVIEW_REQUIRED' ? normalized.failureCode : null);
          const evidence =
            normalized.kind === 'CONFIRMED'
              ? `FastDepix GET identified ${providerTransactionId} as WAITING_PAYMENT.`
              : normalized.evidence;
          if (!this.billingActors) throw new Error('Billing actor signer is unavailable.');
          const actor = this.billingActors.forSystem(
            'billing-pix-reconciliation',
            billingPixReconcileCreateResultAttestationContext({
              billingExecutionId: execution.id,
              messageDispatchId: execution.messageDispatchId,
              financialSetDigest: execution.receivableSetHash,
              expectedVersion,
              owner: input.owner,
              token: input.token,
              attemptId: input.attemptId,
              creationKey: input.creationKey,
              provider: input.provider,
              resultKind: persistKind,
              providerTransactionId,
              amount: normalized.kind === 'CONFIRMED' ? normalized.amount : null,
              externalStatus: normalized.kind === 'CONFIRMED' ? normalized.externalStatus : null,
              externalDepixId: normalized.kind === 'CONFIRMED' ? normalized.externalDepixId : null,
              blockchainTxId: normalized.kind === 'CONFIRMED' ? normalized.blockchainTxId : null,
              pixCopyPaste: normalized.kind === 'CONFIRMED' ? normalized.pixCopyPaste : null,
              qrCodeData: normalized.kind === 'CONFIRMED' ? normalized.qrCodeData : null,
              expiresAt: normalized.kind === 'CONFIRMED' ? normalized.expiresAt : null,
              failureCode,
              reconciliationEvidence: evidence,
              reason: reconciliationReason,
            }),
          );
          const [persisted] = await tx.$queryRaw<Array<{ paymentIntentId: string | null }>>(
            Prisma.sql`
              SELECT public.billing_pix_reconcile_create_result(
                ${execution.id}::uuid, ${expectedVersion}::integer,
                ${input.owner}, ${input.token}, ${input.attemptId}::uuid,
                ${input.creationKey}, ${input.provider}::public."PaymentProviderCode",
                ${persistKind}, ${providerTransactionId},
                ${normalized.kind === 'CONFIRMED' ? normalized.amount : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.externalStatus : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.externalDepixId : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.blockchainTxId : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.pixCopyPaste : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.qrCodeData : null},
                ${normalized.kind === 'CONFIRMED' ? normalized.expiresAt : null},
                ${failureCode}, ${evidence},
                ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
                ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
                ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
                ${reconciliationReason}
              ) AS "paymentIntentId"
            `,
          );
          await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
          const current = await tx.billingExecution.findUnique({
            where: { id: execution.id },
            select: { version: true },
          });
          const confirmed = persistKind === 'CONFIRMED' && Boolean(persisted?.paymentIntentId);
          return this.reconciliationResult(
            confirmed ? 'CONFIRMED' : 'REVIEW_REQUIRED',
            input,
            current?.version ?? expectedVersion + 1,
            persisted?.paymentIntentId ?? null,
            providerTransactionId,
            1,
            confirmed ? [] : financialReasons.length ? financialReasons : normalized.reasons,
            outcome.kind,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (['P2002', 'P2034', '23505', '40001'].includes(this.prismaCode(error) ?? ''))
        return this.reconciliationResult(
          'RETRY_LATER',
          input,
          null,
          null,
          providerTransactionId,
          1,
          [{ code: 'SERIALIZATION_RETRY', message: 'Conflito durante a reconciliacao.' }],
          outcome.kind,
        );
      throw error;
    }
  }

  private async prepareCreate(input: BillingPixCreateInput): Promise<
    | {
        prepared: true;
        version: number;
        total: Prisma.Decimal;
        payload: FastDepixCreateRequest;
      }
    | { prepared: false; result: BillingPixCreateResult }
  > {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.billingExecutionReceivable.findMany({
            where: { billingExecutionId: input.executionId },
            select: { receivableId: true },
            orderBy: { receivableId: 'asc' },
          });
          await acquireFinancialSetLocks(
            tx,
            rows.map((row) => row.receivableId),
          );
          const execution = await tx.billingExecution.findUnique({
            where: { id: input.executionId },
            include: claimInclude,
          });
          if (!execution) {
            return {
              prepared: false as const,
              result: this.createResult('RETRY_LATER', input, null, null, null, 0, false, [
                { code: 'EXECUTION_NOT_FOUND', message: 'Execucao nao encontrada.' },
              ]),
            };
          }
          if (execution.pixStatus === 'CREATING') {
            return {
              prepared: false as const,
              result: this.createResult(
                'REVIEW_REQUIRED',
                input,
                execution.version,
                null,
                null,
                0,
                true,
                [
                  {
                    code: 'CREATE_ALREADY_PREPARED',
                    message:
                      'Preparacao duravel ja existe; nao e possivel provar que a chamada nao ocorreu.',
                  },
                ],
              ),
            };
          }
          const attempt = execution.pixAttempts.find((item) => item.id === input.attemptId);
          if (
            !attempt ||
            attempt.status !== 'RESERVED' ||
            attempt.creationKey !== input.creationKey ||
            execution.pixStatus !== 'RESERVED'
          ) {
            return {
              prepared: false as const,
              result: this.createResult(
                'REVIEW_REQUIRED',
                input,
                execution.version,
                null,
                null,
                0,
                false,
                [
                  {
                    code: 'RESERVATION_IDENTITY_MISMATCH',
                    message: 'Reserva nao corresponde a execucao financeira atual.',
                  },
                ],
              ),
            };
          }
          if (
            execution.version !== input.expectedVersion ||
            execution.leaseOwner !== input.owner ||
            execution.leaseToken !== input.token ||
            !execution.leaseExpiresAt ||
            execution.leaseExpiresAt <= new Date()
          ) {
            return {
              prepared: false as const,
              result: this.createResult(
                'RETRY_LATER',
                input,
                execution.version,
                null,
                null,
                0,
                false,
                [{ code: 'LEASE_LOST', message: 'Lease ou expectedVersion invalido.' }],
              ),
            };
          }
          const total = execution.receivables.reduce(
            (sum, item) => sum.add(item.receivable.amount),
            new Prisma.Decimal(0),
          );
          const expectedCreationKey = buildBillingPixCreationKey({
            executionId: execution.id,
            provider: input.provider,
            cycleKey: execution.cycleKey,
            receivableSetHash: execution.receivableSetHash,
            totalAmount: total,
          });
          if (expectedCreationKey !== input.creationKey || input.provider !== 'DEPIX') {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return {
              prepared: false as const,
              result: this.createResult(
                'REVIEW_REQUIRED',
                input,
                execution.version,
                null,
                null,
                0,
                false,
                [
                  {
                    code: 'CREATE_IDENTITY_MISMATCH',
                    message: 'Provider ou creationKey diverge da reserva aprovada.',
                  },
                ],
              ),
            };
          }
          const validation = await this.validate(
            tx,
            execution,
            input.now ?? new Date(),
            input.owner,
            input.token,
          );
          if (validation.decision !== 'ELIGIBLE') {
            await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
            return {
              prepared: false as const,
              result: this.createResult(
                validation.decision,
                input,
                execution.version,
                null,
                null,
                0,
                false,
                validation.reasons,
              ),
            };
          }
          const phone = this.canonicalPhone(execution);
          if (!phone) throw new Error('Canonical phone disappeared after Billing validation.');
          if (!this.billingActors) throw new Error('Billing actor signer is unavailable.');
          const actor = this.billingActors.forSystem(
            'billing-pix-create',
            billingPixPrepareCreateAttestationContext({
              billingExecutionId: execution.id,
              messageDispatchId: execution.messageDispatchId,
              financialSetDigest: execution.receivableSetHash,
              expectedVersion: input.expectedVersion,
              owner: input.owner,
              token: input.token,
              attemptId: input.attemptId,
              creationKey: input.creationKey,
              provider: input.provider,
              reason: preparationReason,
            }),
          );
          const [row] = await tx.$queryRaw<Array<{ version: number }>>(Prisma.sql`
            SELECT public.billing_pix_prepare_create(
              ${execution.id}::uuid, ${input.expectedVersion}::integer,
              ${input.owner}, ${input.token}, ${input.attemptId}::uuid,
              ${input.creationKey}, ${input.provider}::public."PaymentProviderCode",
              ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
              ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
              ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
              ${preparationReason}
            ) AS version
          `);
          if (!row) throw new Error('Billing PIX preparation returned no version.');
          return {
            prepared: true as const,
            version: row.version,
            total,
            payload: {
              amount: Number(total.toFixed(2)),
              user: { name: execution.client.name },
              payer_phone: phone.e164,
            },
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (['P2034', '40001'].includes(this.prismaCode(error) ?? '')) {
        return {
          prepared: false as const,
          result: this.createResult('RETRY_LATER', input, null, null, null, 0, false, [
            { code: 'SERIALIZATION_RETRY', message: 'Conflito antes da preparacao duravel.' },
          ]),
        };
      }
      throw error;
    }
  }

  private async persistCreateResult(
    input: BillingPixCreateInput,
    expectedVersion: number,
    outcome: FastDepixCreateOutcome,
  ): Promise<BillingPixCreateResult> {
    const evidence = this.createOutcomeEvidence(outcome);
    const reason =
      outcome.kind === 'CONFIRMED'
        ? 'FastDepix simulated creation confirmed and persisted.'
        : outcome.kind === 'PRE_CALL_FAILURE'
          ? 'FastDepix simulated pre-call failure persisted for explicit review.'
          : 'FastDepix simulated remote result is uncertain; automatic retry blocked.';
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.billingExecutionReceivable.findMany({
            where: { billingExecutionId: input.executionId },
            select: { receivableId: true },
            orderBy: { receivableId: 'asc' },
          });
          await acquireFinancialSetLocks(
            tx,
            rows.map((row) => row.receivableId),
          );
          const execution = await tx.billingExecution.findUniqueOrThrow({
            where: { id: input.executionId },
            include: claimInclude,
          });
          if (!this.billingActors) throw new Error('Billing actor signer is unavailable.');
          const actor = this.billingActors.forSystem(
            'billing-pix-create',
            billingPixRecordCreateResultAttestationContext({
              billingExecutionId: execution.id,
              messageDispatchId: execution.messageDispatchId,
              financialSetDigest: execution.receivableSetHash,
              expectedVersion,
              owner: input.owner,
              token: input.token,
              attemptId: input.attemptId,
              creationKey: input.creationKey,
              provider: input.provider,
              resultKind: outcome.kind,
              providerTransactionId: evidence.providerTransactionId,
              amount: evidence.amount,
              externalStatus: evidence.externalStatus,
              externalDepixId: evidence.externalDepixId,
              blockchainTxId: evidence.blockchainTxId,
              pixCopyPaste: evidence.pixCopyPaste,
              qrCodeData: evidence.qrCodeData,
              expiresAt: evidence.expiresAt,
              failureCode: evidence.failureCode,
              failureMessage: evidence.failureMessage,
              reason,
            }),
          );
          const [persisted] = await tx.$queryRaw<Array<{ paymentIntentId: string | null }>>(
            Prisma.sql`
              SELECT public.billing_pix_record_create_result(
                ${execution.id}::uuid, ${expectedVersion}::integer,
                ${input.owner}, ${input.token}, ${input.attemptId}::uuid,
                ${input.creationKey}, ${input.provider}::public."PaymentProviderCode",
                ${outcome.kind}, ${evidence.providerTransactionId}, ${evidence.amount},
                ${evidence.externalStatus}, ${evidence.externalDepixId},
                ${evidence.blockchainTxId}, ${evidence.pixCopyPaste}, ${evidence.qrCodeData},
                ${evidence.expiresAt}, ${evidence.failureCode}, ${evidence.failureMessage},
                ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
                ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
                ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
                ${reason}
              ) AS "paymentIntentId"
            `,
          );
          await this.releaseLeaseSql(tx, execution.id, input.owner, input.token);
          const confirmedPersisted =
            outcome.kind === 'CONFIRMED' && Boolean(persisted?.paymentIntentId);
          const decision = confirmedPersisted
            ? 'CONFIRMED'
            : outcome.kind === 'PRE_CALL_FAILURE'
              ? 'PRE_CALL_FAILED'
              : 'REVIEW_REQUIRED';
          return this.createResult(
            decision,
            input,
            expectedVersion + 1,
            persisted?.paymentIntentId ?? null,
            evidence.providerTransactionId,
            1,
            outcome.requestDispatched,
            outcome.kind === 'CONFIRMED' && !confirmedPersisted
              ? [
                  {
                    code: 'CONFIRMED_RESULT_REQUIRES_RECONCILIATION',
                    message:
                      'Resultado remoto confirmado conflitou com evidencia financeira concorrente.',
                  },
                ]
              : [],
            outcome.kind,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch {
      return this.createResult(
        'REVIEW_REQUIRED',
        input,
        expectedVersion,
        null,
        evidence.providerTransactionId,
        1,
        true,
        [
          {
            code: 'RESULT_PERSISTENCE_UNCERTAIN',
            message: 'Resultado nao foi persistido; chamada nao pode ser repetida automaticamente.',
          },
        ],
        outcome.kind,
      );
    }
  }

  renewLease(
    input: Required<
      Pick<BillingPixClaimInput, 'executionId' | 'expectedVersion' | 'owner' | 'token'>
    > & { ttlSeconds?: number },
  ) {
    return this.leaseMutation('renew', input);
  }

  releaseLease(
    input: Required<
      Pick<BillingPixClaimInput, 'executionId' | 'expectedVersion' | 'owner' | 'token'>
    >,
  ) {
    return this.leaseMutation('release', input);
  }

  private async leaseMutation(
    operation: 'renew' | 'release',
    input: Required<
      Pick<BillingPixClaimInput, 'executionId' | 'expectedVersion' | 'owner' | 'token'>
    > & { ttlSeconds?: number },
  ) {
    this.assertClaimInput({
      ...input,
      ...(operation === 'renew' ? { ttlSeconds: input.ttlSeconds } : {}),
    });
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await this.readExecutionVersion(tx, input.executionId);
        if (!locked || locked.version !== input.expectedVersion) return false;
        return operation === 'renew'
          ? this.renewLeaseSql(
              tx,
              input.executionId,
              input.owner,
              input.token,
              input.ttlSeconds ?? 60,
            )
          : this.releaseLeaseSql(tx, input.executionId, input.owner, input.token);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async validate(
    tx: Prisma.TransactionClient,
    execution: ClaimExecution,
    now: Date,
    owner: string,
    token: string,
  ) {
    const blocked: ClaimReason[] = [];
    const review: ClaimReason[] = [];
    const retry: ClaimReason[] = [];
    const gates = this.gates();
    const dispatch = execution.messageDispatch;
    const items = execution.receivables;
    const total = items.reduce(
      (sum, item) => sum.add(item.receivable.amount),
      new Prisma.Decimal(0),
    );
    const financialSet = {
      hash: execution.receivableSetHash,
      total: total.toFixed(2),
      receivableIds: items.map((item) => item.receivableId),
    };

    if (
      execution.leaseOwner !== owner ||
      execution.leaseToken !== token ||
      !execution.leaseExpiresAt
    ) {
      retry.push({ code: 'LEASE_LOST', message: 'Lease nao pertence mais ao worker.' });
    }
    if (!execution.isCurrent || execution.supersededAt)
      blocked.push({ code: 'EXECUTION_NOT_CURRENT', message: 'Execucao substituida.' });
    if (
      !selectableExecutionStatuses.includes(
        execution.status as (typeof selectableExecutionStatuses)[number],
      )
    )
      blocked.push({
        code: 'EXECUTION_STATUS_INELIGIBLE',
        message: `Estado ${execution.status} nao elegivel.`,
      });
    if (
      execution.reviewRequired ||
      execution.status === 'REVIEW_REQUIRED' ||
      execution.pixStatus === 'AMBIGUOUS' ||
      execution.deliveryStatus === 'AMBIGUOUS'
    )
      review.push({ code: 'REVIEW_REQUIRED', message: 'Execucao requer revisao humana.' });
    if (['PAID', 'CANCELED', 'SUPERSEDED'].includes(execution.pixStatus))
      blocked.push({ code: 'PIX_TERMINAL', message: `PIX em estado ${execution.pixStatus}.` });
    if (!gates.billingEnabled || !gates.pixEnabled || !gates.effectiveFrom)
      retry.push({
        code: 'FLAGS_OR_CUTOFF_DISABLED',
        message: 'Gates de geracao PIX indisponiveis.',
      });
    if (!execution.nextAttemptAt || execution.nextAttemptAt > now)
      retry.push({ code: 'NEXT_ATTEMPT_NOT_DUE', message: 'Proxima tentativa ainda nao venceu.' });
    if (!dispatch.scheduledFor || dispatch.scheduledFor > now)
      retry.push({
        code: 'GENERATION_WINDOW_NOT_OPEN',
        message: 'Horario de geracao ainda nao foi atingido.',
      });
    if (
      gates.effectiveFrom &&
      (!dispatch.scheduledFor || dispatch.scheduledFor < gates.effectiveFrom)
    )
      blocked.push({
        code: 'BEFORE_GLOBAL_CUTOFF',
        message: 'Agendamento anterior ao cutoff global.',
      });
    if (dispatch.origin !== 'BILLING' || !['SCHEDULED', 'FAILED'].includes(dispatch.status))
      blocked.push({ code: 'DISPATCH_INELIGIBLE', message: 'Dispatch nao esta elegivel.' });
    if (execution.client.status !== 'ATIVO')
      blocked.push({ code: 'CLIENT_INACTIVE', message: 'Cliente nao esta ativo.' });
    if (items.length === 0)
      blocked.push({ code: 'EMPTY_FINANCIAL_SET', message: 'Conjunto financeiro vazio.' });

    const identity = buildBillingExecutionIdentity({
      clientId: execution.clientId,
      cycleKey: execution.cycleKey,
      receivables: items.map((item) => ({
        id: item.receivableId,
        amount: item.receivable.amount.toString(),
        dueDate: item.receivable.dueDate,
      })),
    });
    if (
      identity.receivableSetHash !== execution.receivableSetHash ||
      identity.executionKey !== execution.executionKey
    )
      review.push({
        code: 'FINANCIAL_IDENTITY_MISMATCH',
        message: 'Identidade financeira divergiu.',
      });

    const dispatchSet = new Set(dispatch.items.map((item) => item.receivableId));
    if (
      dispatchSet.size !== items.length ||
      items.some((item) => !dispatchSet.has(item.receivableId))
    )
      review.push({ code: 'DISPATCH_SET_MISMATCH', message: 'Conjunto do dispatch divergiu.' });
    for (const item of items) {
      if (item.receivable.status !== 'PENDENTE')
        blocked.push({
          code: 'RECEIVABLE_NOT_PENDING',
          message: `Recebivel ${item.receivableId} nao esta pendente.`,
        });
      if (item.clientReference.status !== 'ATIVO')
        blocked.push({
          code: 'REFERENCE_INACTIVE',
          message: `Referencia ${item.clientReferenceId} nao esta ativa.`,
        });
      if (
        execution.authorizationMode !== 'LEGACY_BRAZIL' &&
        !item.clientReference.internationalBillingEnabled
      )
        blocked.push({
          code: 'REFERENCE_OPT_IN_REQUIRED',
          message: `Opt-in ausente em ${item.clientReferenceId}.`,
        });
      if (
        !item.receivable.amount.equals(item.amountSnapshot) ||
        this.dateKey(item.receivable.dueDate) !== this.dateKey(item.dueDateSnapshot) ||
        item.clientReference.reference !== item.referenceSnapshot
      )
        review.push({
          code: 'FINANCIAL_SNAPSHOT_MISMATCH',
          message: `Snapshot divergiu em ${item.receivableId}.`,
        });
    }

    const attempts = execution.pixAttempts;
    if (attempts.some((attempt) => attempt.status === 'AMBIGUOUS' || attempt.reviewRequired))
      review.push({
        code: 'PIX_ATTEMPT_REVIEW_REQUIRED',
        message: 'Tentativa PIX exige reconciliacao.',
      });
    const intents = this.paymentIntents(execution);
    if (intents.some((intent) => this.intentHasPaidEvidence(intent)))
      blocked.push({ code: 'PAYMENT_ALREADY_PAID', message: 'Pagamento ja confirmado.' });
    if (intents.some((intent) => this.intentHasRefundEvidence(intent)))
      review.push({
        code: 'ACTIVE_PIX_INCOMPATIBLE',
        message: 'Existe PIX reembolsado que exige revisao financeira.',
      });
    const active = intents.filter((intent) => activeIntentStatuses.includes(intent.status));
    if (active.length > 1)
      review.push({
        code: 'ACTIVE_PIX_INCOMPATIBLE',
        message: 'Existem PIX ativos duplicados ou sobrepostos.',
      });
    else if (active.length === 1 && !this.intentMatches(active[0]!, execution, total, now))
      review.push({ code: 'ACTIVE_PIX_INCOMPATIBLE', message: 'Existe PIX ativo incompatível.' });

    const phone = this.canonicalPhone(execution);
    if (!phone)
      review.push({ code: 'PHONE_IDENTITY_MISMATCH', message: 'Identidade E.164 divergiu.' });
    const connection = dispatch.whatsAppConnection;
    if (
      !connection ||
      connection.status !== 'CONNECTED' ||
      !connection.connected ||
      !connection.loggedIn
    )
      retry.push({
        code: 'WHATSAPP_CONNECTION_NOT_OPERATIONAL',
        message: 'Conexao KiraGo indisponivel.',
      });
    if (phone && connection) {
      const conversation = await tx.whatsAppConversation.findFirst({
        where: {
          clientId: execution.clientId,
          whatsAppConnectionId: connection.id,
          phoneNormalized: phone.digits,
          phoneE164: phone.e164,
        },
        select: { id: true },
      });
      if (!conversation)
        retry.push({
          code: 'CONVERSATION_NOT_LINKED',
          message: 'Conversa canonica nao vinculada.',
        });
    }

    const reasons = this.unique(review.length ? review : blocked.length ? blocked : retry);
    const decision: ClaimDecision = review.length
      ? 'REVIEW_REQUIRED'
      : blocked.length
        ? 'BLOCKED'
        : retry.length
          ? 'RETRY_LATER'
          : 'ELIGIBLE';
    return { decision, reasons, financialSet };
  }

  private async readExecutionVersion(tx: Prisma.TransactionClient, id: string) {
    const [row] = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`
      SELECT id, version FROM public.billing_executions WHERE id = ${id}::uuid
    `);
    return row ?? null;
  }

  private async acquireLease(
    tx: Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
    ttl: number,
  ) {
    const [row] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
      SELECT public.billing_execution_acquire_lease(${id}::uuid, ${owner}, ${token}, ${ttl}::integer) AS acquired
    `);
    return row?.acquired === true;
  }

  private async renewLeaseSql(
    tx: Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
    ttl: number,
  ) {
    const [row] = await tx.$queryRaw<Array<{ renewed: boolean }>>(Prisma.sql`
      SELECT public.billing_execution_renew_lease(${id}::uuid, ${owner}, ${token}, ${ttl}::integer) AS renewed
    `);
    return row?.renewed === true;
  }

  private async releaseLeaseSql(
    tx: Prisma.TransactionClient,
    id: string,
    owner: string,
    token: string,
  ) {
    const [row] = await tx.$queryRaw<Array<{ released: boolean }>>(Prisma.sql`
      SELECT public.billing_execution_release_lease(${id}::uuid, ${owner}, ${token}) AS released
    `);
    return row?.released === true;
  }

  private result(
    decision: ClaimDecision,
    input: BillingPixClaimInput,
    token: string,
    version: number | null,
    acquired: boolean,
    retained: boolean,
    reasons: ClaimReason[],
    financialSet: BillingPixClaimResult['financialSet'] = null,
  ): BillingPixClaimResult {
    return {
      decision,
      executionId: input.executionId,
      version,
      lease: {
        acquired,
        retained,
        owner: input.owner,
        token: retained ? token : null,
        expiresAt: null,
      },
      reasons,
      financialSet,
      revalidationRequiredBeforeExternalCall: true,
    };
  }

  private reservationResult(
    decision: BillingPixReservationResult['decision'],
    input: BillingPixReservationInput,
    version: number | null,
    creationKey: string | null,
    attemptId: string | null,
    reasons: ClaimReason[],
    paymentIntentId: string | null = null,
    leaseRetained = false,
  ): BillingPixReservationResult {
    return {
      decision,
      executionId: input.executionId,
      version,
      creationKey,
      attemptId,
      paymentIntentId,
      leaseRetained,
      reasons,
      externalCallStarted: false,
      revalidationRequiredBeforeExternalCall: true,
    };
  }

  private normalizeCreateOutcome(
    outcome: FastDepixCreateOutcome,
    expectedAmount: Prisma.Decimal,
  ): FastDepixCreateOutcome {
    if (outcome.kind !== 'CONFIRMED') return outcome;
    const response = outcome.response;
    try {
      const amount = new Prisma.Decimal(String(response.amount ?? ''));
      const providerTransactionId = outcome.providerTransactionId.trim();
      const responseTransactionId = normalizeFastDepixProviderTransactionId(response.id);
      const hasPixPayload =
        this.optionalProviderText(response.qr_code_text, 10000) !== null ||
        this.optionalProviderText(response.qr_code, 10000) !== null;
      const externalStatus = this.optionalProviderText(response.status, 100);
      if (
        !providerTransactionId ||
        responseTransactionId !== providerTransactionId ||
        providerTransactionId.length > 255 ||
        !amount.equals(expectedAmount) ||
        !hasPixPayload ||
        !externalStatus
      ) {
        throw new Error('incompatible');
      }
      if (response.qr_code_expires_at !== undefined) {
        const expiresAt = new Date(response.qr_code_expires_at);
        if (
          Number.isNaN(expiresAt.getTime()) ||
          expiresAt.toISOString() !== response.qr_code_expires_at
        )
          throw new Error('expires');
      }
      return outcome;
    } catch {
      return {
        kind: 'REMOTE_RESULT_UNCERTAIN',
        requestDispatched: true,
        remoteEffect: 'UNKNOWN',
        automaticRetryEligible: false,
        providerTransactionId: outcome.providerTransactionId || null,
        code: 'FASTDEPIX_CONFIRMED_RESPONSE_INCOMPATIBLE',
        message: 'Resposta positiva incompativel; reconciliacao obrigatoria.',
        httpStatus: 200,
      };
    }
  }

  private normalizeReconciliationOutcome(
    expectedProviderTransactionId: string,
    outcome: FastDepixTransactionLookupOutcome,
  ):
    | {
        kind: 'CONFIRMED';
        amount: string;
        externalStatus: 'WAITING_PAYMENT';
        externalDepixId: string | null;
        blockchainTxId: string | null;
        pixCopyPaste: string | null;
        qrCodeData: string | null;
        expiresAt: string | null;
        reasons: ClaimReason[];
      }
    | {
        kind: 'REVIEW_REQUIRED';
        failureCode: string;
        evidence: string;
        reasons: ClaimReason[];
      } {
    if (outcome.kind !== 'FOUND') {
      const mismatch = outcome.providerTransactionId !== expectedProviderTransactionId;
      const failureCode = mismatch
        ? 'RECONCILIATION_TRANSACTION_ID_MISMATCH'
        : outcome.kind === 'NOT_FOUND'
          ? 'FASTDEPIX_RECONCILIATION_NOT_FOUND'
          : this.requiredProviderText(outcome.code, 255);
      return {
        kind: 'REVIEW_REQUIRED',
        failureCode,
        evidence: mismatch
          ? 'FastDepix GET returned evidence for another transaction id.'
          : outcome.kind === 'NOT_FOUND'
            ? `FastDepix GET did not find identified transaction ${expectedProviderTransactionId}; absence is not proven.`
            : this.requiredProviderText(outcome.message, 1000),
        reasons: [
          {
            code: failureCode,
            message: 'Consulta remota nao confirmou uma identidade financeira reutilizavel.',
          },
        ],
      };
    }
    const transaction = outcome.transaction;
    const providerTransactionId = normalizeFastDepixProviderTransactionId(
      transaction.providerTransactionId,
    );
    const amountText = transaction.amount.trim();
    const pixCopyPaste = this.optionalProviderText(transaction.pixCopyPaste, 10000);
    const qrCodeData = this.optionalProviderText(transaction.qrCodeData, 10000);
    const validExpiration =
      !transaction.expiresAt || !Number.isNaN(transaction.expiresAt.getTime());
    const expiresAt =
      transaction.expiresAt && validExpiration ? transaction.expiresAt.toISOString() : null;
    const compatible =
      providerTransactionId === expectedProviderTransactionId &&
      transaction.state === 'WAITING_PAYMENT' &&
      /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(amountText) &&
      new Prisma.Decimal(amountText).gt(0) &&
      (pixCopyPaste !== null || qrCodeData !== null) &&
      validExpiration;
    if (!compatible) {
      const failureCode =
        providerTransactionId !== expectedProviderTransactionId
          ? 'RECONCILIATION_TRANSACTION_ID_MISMATCH'
          : transaction.state === 'PAID'
            ? 'RECONCILIATION_REMOTE_PAYMENT_EVIDENCE'
            : `RECONCILIATION_REMOTE_${transaction.state}`;
      return {
        kind: 'REVIEW_REQUIRED',
        failureCode,
        evidence: `FastDepix GET returned ${transaction.state} for ${expectedProviderTransactionId}; manual review required.`,
        reasons: [
          {
            code: failureCode,
            message: 'Resultado remoto nao autoriza confirmacao automatica da criacao.',
          },
        ],
      };
    }
    return {
      kind: 'CONFIRMED',
      amount: new Prisma.Decimal(amountText).toFixed(2),
      externalStatus: 'WAITING_PAYMENT',
      externalDepixId: this.optionalProviderText(transaction.externalDepixId, 255),
      blockchainTxId: this.optionalProviderText(transaction.blockchainTxId, 255),
      pixCopyPaste,
      qrCodeData,
      expiresAt,
      reasons: [],
    };
  }

  private reconciliationFinancialReasons(execution: ClaimExecution, total: Prisma.Decimal) {
    const reasons: ClaimReason[] = [];
    if (!execution.isCurrent || execution.supersededAt)
      reasons.push({ code: 'EXECUTION_NOT_CURRENT', message: 'Execucao foi substituida.' });
    const identity = buildBillingExecutionIdentity({
      clientId: execution.clientId,
      cycleKey: execution.cycleKey,
      receivables: execution.receivables.map((item) => ({
        id: item.receivableId,
        amount: item.receivable.amount.toString(),
        dueDate: item.receivable.dueDate,
      })),
    });
    if (
      identity.receivableSetHash !== execution.receivableSetHash ||
      identity.executionKey !== execution.executionKey
    )
      reasons.push({
        code: 'FINANCIAL_IDENTITY_MISMATCH',
        message: 'Identidade financeira mudou antes da persistencia.',
      });
    if (total.lte(0))
      reasons.push({ code: 'INVALID_FINANCIAL_TOTAL', message: 'Valor financeiro invalido.' });
    for (const item of execution.receivables) {
      if (item.receivable.status !== 'PENDENTE')
        reasons.push({
          code: 'RECEIVABLE_NOT_PENDING',
          message: `Recebivel ${item.receivableId} nao esta pendente.`,
        });
      if (item.clientReference.status !== 'ATIVO')
        reasons.push({ code: 'REFERENCE_INACTIVE', message: 'Referencia nao esta ativa.' });
      if (
        execution.authorizationMode !== 'LEGACY_BRAZIL' &&
        !item.clientReference.internationalBillingEnabled
      )
        reasons.push({ code: 'REFERENCE_OPT_IN_REQUIRED', message: 'Opt-in foi revogado.' });
      if (
        !item.receivable.amount.equals(item.amountSnapshot) ||
        this.dateKey(item.receivable.dueDate) !== this.dateKey(item.dueDateSnapshot) ||
        item.clientReference.reference !== item.referenceSnapshot
      )
        reasons.push({ code: 'FINANCIAL_SNAPSHOT_MISMATCH', message: 'Snapshot divergiu.' });
    }
    return this.unique(reasons);
  }

  private createOutcomeEvidence(outcome: FastDepixCreateOutcome) {
    if (outcome.kind === 'CONFIRMED') {
      const response = outcome.response;
      return {
        providerTransactionId: outcome.providerTransactionId,
        amount: new Prisma.Decimal(String(response.amount)).toFixed(2),
        externalStatus: this.optionalProviderText(response.status, 100),
        externalDepixId: this.optionalProviderText(response.depix_transaction_id, 255),
        blockchainTxId: this.optionalProviderText(response.blockchain_tx_id, 255),
        pixCopyPaste: this.optionalProviderText(response.qr_code_text, 10000),
        qrCodeData: this.optionalProviderText(response.qr_code, 10000),
        expiresAt: response.qr_code_expires_at === undefined ? null : response.qr_code_expires_at,
        failureCode: null,
        failureMessage: null,
      };
    }
    return {
      providerTransactionId:
        outcome.kind === 'REMOTE_RESULT_UNCERTAIN' ? outcome.providerTransactionId : null,
      amount: null,
      externalStatus: null,
      externalDepixId: null,
      blockchainTxId: null,
      pixCopyPaste: null,
      qrCodeData: null,
      expiresAt: null,
      failureCode: this.requiredProviderText(outcome.code, 255),
      failureMessage: this.requiredProviderText(outcome.message, 1000),
    };
  }

  private optionalProviderText(value: unknown, maximum: number) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) return null;
    return normalized;
  }

  private requiredProviderText(value: string, maximum: number) {
    const normalized = value.trim();
    return normalized.slice(0, maximum) || 'FASTDEPIX_UNSPECIFIED';
  }

  private createResult(
    decision: BillingPixCreateResult['decision'],
    input: BillingPixCreateInput,
    version: number | null,
    paymentIntentId: string | null,
    providerTransactionId: string | null,
    adapterCalls: 0 | 1,
    externalCallMayHaveStarted: boolean,
    reasons: ClaimReason[],
    remoteResult: FastDepixCreateOutcome['kind'] | null = null,
  ): BillingPixCreateResult {
    return {
      decision,
      executionId: input.executionId,
      version,
      attemptId: input.attemptId,
      paymentIntentId,
      providerTransactionId,
      remoteResult,
      adapterCalls,
      externalCallMayHaveStarted,
      automaticRetryEligible: false,
      reasons,
    };
  }

  private reconciliationResult(
    decision: BillingPixReconciliationResult['decision'],
    input: BillingPixReconciliationInput,
    version: number | null,
    paymentIntentId: string | null,
    providerTransactionId: string | null,
    getCalls: 0 | 1,
    reasons: ClaimReason[],
    remoteResult: FastDepixTransactionLookupOutcome['kind'] | null = null,
  ): BillingPixReconciliationResult {
    return {
      decision,
      executionId: input.executionId,
      version,
      attemptId: input.attemptId,
      paymentIntentId,
      providerTransactionId,
      remoteResult,
      getCalls,
      creationPostCalls: 0,
      automaticCreationRetryEligible: false,
      reasons,
    };
  }

  private paymentIntents(execution: ClaimExecution) {
    const intents = [
      ...(execution.paymentIntent ? [execution.paymentIntent] : []),
      ...execution.receivables.flatMap((item) => [
        ...item.receivable.paymentIntents,
        ...item.receivable.paymentGroupItems.flatMap(
          (groupItem) => groupItem.paymentGroup.paymentIntents,
        ),
      ]),
    ];
    return [...new Map(intents.map((intent) => [intent.id, intent])).values()];
  }

  private intentMatches(
    intent: ReturnType<BillingPixClaimService['paymentIntents']>[number],
    execution: ClaimExecution,
    total: Prisma.Decimal,
    now: Date,
  ) {
    if (!intent.providerTransactionId || !intent.pixCopyPaste || !intent.amount.equals(total))
      return false;
    if (
      execution.client.preferredPixProvider &&
      intent.provider !== execution.client.preferredPixProvider
    )
      return false;
    if (intent.expiresAt && intent.expiresAt <= now) return false;
    const expected = new Set(execution.receivables.map((item) => item.receivableId));
    if (intent.receivableId) return expected.size === 1 && expected.has(intent.receivableId);
    const group = execution.receivables
      .flatMap((item) => item.receivable.paymentGroupItems)
      .find((item) => item.paymentGroupId === intent.paymentGroupId)?.paymentGroup;
    if (!group || group.clientId !== execution.clientId) return false;
    const actual = new Set(group.items.map((item) => item.receivableId));
    return actual.size === expected.size && [...expected].every((id) => actual.has(id));
  }

  private intentHasPaidEvidence(
    intent: ReturnType<BillingPixClaimService['paymentIntents']>[number],
  ) {
    return (
      intent.status === 'PAID' ||
      intent.paidAt !== null ||
      this.intentExternalState(intent) === 'paid'
    );
  }

  private intentHasRefundEvidence(
    intent: ReturnType<BillingPixClaimService['paymentIntents']>[number],
  ) {
    return intent.status === 'REFUNDED' || this.intentExternalState(intent) === 'refunded';
  }

  private intentExternalState(
    intent: ReturnType<BillingPixClaimService['paymentIntents']>[number],
  ) {
    return intent.externalStatus?.trim().toLowerCase() ?? null;
  }

  private canonicalPhone(execution: ClaimExecution) {
    const client = execution.client.phoneE164
      ? normalizePhone(execution.client.phoneE164)
      : normalizePhone(execution.client.phone, { defaultCountry: 'BR' });
    if (client.status !== 'valid' || client.digits !== execution.client.phoneNormalized)
      return null;
    const dispatchRaw = execution.messageDispatch.phone.trim();
    if (/^[0-9]+$/.test(dispatchRaw)) {
      if (dispatchRaw !== client.digits) return null;
    } else {
      const dispatch = normalizePhone(
        dispatchRaw,
        execution.authorizationMode === 'LEGACY_BRAZIL' ? { defaultCountry: 'BR' } : {},
      );
      if (
        dispatch.status !== 'valid' ||
        comparePhoneIdentities(client.e164, dispatch.e164).status !== 'match'
      )
        return null;
    }
    return client;
  }

  private gates() {
    const raw = this.config.get<string>('PHONE_GLOBAL_BILLING_EFFECTIVE_FROM');
    const parsed = raw ? new Date(raw) : null;
    return {
      billingEnabled: this.config.get<string>('PHONE_GLOBAL_BILLING_ENABLED') === 'true',
      pixEnabled: this.config.get<string>('PHONE_GLOBAL_BILLING_PIX_ENABLED') === 'true',
      effectiveFrom: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    };
  }

  private selectionResult(
    candidates: BillingPixClaimCandidate[],
    limit: number,
    hasMore: boolean,
    nextCursor: string | null,
    disabledReason: string | null,
  ) {
    return {
      candidates,
      disabledReason,
      pagination: {
        limit,
        pageCount: candidates.length,
        hasMore,
        nextCursor,
        coverage: hasMore ? ('PARTIAL' as const) : ('COMPLETE' as const),
        order: selectionCursorOrder,
        consistency: 'BEST_EFFORT_NON_SNAPSHOT' as const,
      },
    };
  }

  private pageLimit(value: number | string | undefined) {
    if (value === undefined) return selectionLimitDefault;
    const lexical = String(value);
    if (!/^[1-9][0-9]*$/.test(lexical)) throw new BadRequestException('Limite de claim invalido.');
    const parsed = Number(lexical);
    if (!Number.isSafeInteger(parsed) || parsed > selectionLimitMaximum)
      throw new BadRequestException('Limite de claim deve estar entre 1 e 100.');
    return parsed;
  }

  private encodeCursor(row: { id: string; nextAttemptAt: Date | null; createdAt: Date }) {
    if (!row.nextAttemptAt) throw new Error('Selected BillingExecution must have nextAttemptAt.');
    const cursor: SelectionCursor = {
      version: selectionCursorVersion,
      scope: selectionCursorScope,
      order: selectionCursorOrder,
      nextAttemptAt: row.nextAttemptAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      id: row.id,
    };
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(value: string): SelectionCursor {
    try {
      if (
        !value ||
        value.length > 2048 ||
        !/^[A-Za-z0-9_-]+$/.test(value) ||
        Buffer.from(value, 'base64url').toString('base64url') !== value
      )
        throw new Error('lexical');
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      if (
        Object.keys(parsed).sort().join(',') !== 'createdAt,id,nextAttemptAt,order,scope,version' ||
        parsed.version !== selectionCursorVersion ||
        parsed.scope !== selectionCursorScope ||
        parsed.order !== selectionCursorOrder ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          parsed.id,
        ) ||
        typeof parsed.nextAttemptAt !== 'string' ||
        typeof parsed.createdAt !== 'string' ||
        !this.canonicalInstant(parsed.nextAttemptAt) ||
        !this.canonicalInstant(parsed.createdAt)
      )
        throw new Error('contract');
      return parsed as SelectionCursor;
    } catch {
      throw new BadRequestException('Cursor de claim invalido.');
    }
  }

  private afterCursor(cursor: SelectionCursor): Prisma.BillingExecutionWhereInput {
    const nextAttemptAt = new Date(cursor.nextAttemptAt);
    const createdAt = new Date(cursor.createdAt);
    return {
      OR: [
        { nextAttemptAt: { gt: nextAttemptAt } },
        { nextAttemptAt, createdAt: { gt: createdAt } },
        { nextAttemptAt, createdAt, id: { gt: cursor.id } },
      ],
    };
  }

  private canonicalInstant(value: string) {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }

  private assertClaimInput(
    input: Pick<
      BillingPixClaimInput,
      'executionId' | 'expectedVersion' | 'owner' | 'token' | 'ttlSeconds'
    >,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        input.executionId,
      ) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 0 ||
      !input.owner.trim() ||
      (input.token !== undefined && !input.token.trim()) ||
      (input.ttlSeconds !== undefined &&
        (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 900))
    )
      throw new BadRequestException('Claim PIX invalido.');
  }

  private assertCreateInput(input: BillingPixCreateInput) {
    this.assertClaimInput(input);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        input.attemptId,
      ) ||
      !/^bpx1:[0-9a-f]{64}$/.test(input.creationKey) ||
      input.provider !== 'DEPIX'
    ) {
      throw new BadRequestException('Identidade de criacao PIX invalida.');
    }
  }

  private assertReconciliationInput(input: BillingPixReconciliationInput) {
    this.assertClaimInput(input);
    if (
      !input.token.trim() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        input.attemptId,
      ) ||
      !/^bpx1:[0-9a-f]{64}$/.test(input.creationKey) ||
      input.provider !== 'DEPIX' ||
      (input.providerTransactionId !== undefined &&
        input.providerTransactionId !== null &&
        (!input.providerTransactionId.trim() || input.providerTransactionId.length > 255))
    )
      throw new BadRequestException('Identidade de reconciliacao PIX invalida.');
  }

  private assertReservationInput(input: BillingPixReservationInput) {
    this.assertClaimInput(input);
    if (!input.token.trim() || !Object.values(PaymentProviderCode).includes(input.provider)) {
      throw new BadRequestException('Reserva PIX invalida.');
    }
  }

  private unique(reasons: ClaimReason[]) {
    return [...new Map(reasons.map((reason) => [reason.code, reason])).values()];
  }

  private prismaCode(error: unknown) {
    if (!error || typeof error !== 'object') return null;
    if ('meta' in error && error.meta && typeof error.meta === 'object' && 'code' in error.meta) {
      const nested = error.meta.code;
      if (typeof nested === 'string') return nested;
    }
    return 'code' in error && typeof error.code === 'string' ? error.code : null;
  }

  private dateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
