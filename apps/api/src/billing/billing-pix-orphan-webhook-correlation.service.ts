import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  BillingActorAttestationService,
  billingPixAnalyzeOrphanWebhookAttestationContext,
  billingPixCorrelateOrphanWebhookAttestationContext,
} from './billing-actor-attestation.service';

type CorrelationContext = {
  evidenceId: string;
  provider: 'DEPIX' | 'FASTPAY';
  providerTransactionId: string;
  rawBodyDigest: string;
  attemptId: string | null;
  executionId: string | null;
  messageDispatchId: string | null;
  paymentIntentId: string | null;
  creationKey: string | null;
  financialSetDigest: string | null;
  expectedVersion: number | null;
  attemptStatus: string | null;
  executionStatus: string | null;
  leaseExpiresAt: Date | null;
};

export type BillingPixOrphanCorrelationResult = {
  decision:
    'REVIEW_REQUIRED' | 'CORRELATED' | 'CONFLICT_DETECTED' | 'ALREADY_CORRELATED' | 'RETRY_LATER';
  decisionEventId: string | null;
  inserted: boolean;
  reconciliationEligible: boolean;
};

@Injectable()
export class BillingPixOrphanWebhookCorrelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingActors: BillingActorAttestationService,
  ) {}

  async analyzeEvidence(
    evidenceId: string,
    options: { owner?: string; token?: string; ttlSeconds?: number } = {},
  ): Promise<BillingPixOrphanCorrelationResult> {
    const owner = options.owner?.trim() || 'billing-orphan-correlation';
    const token = options.token?.trim() || randomUUID();
    const ttlSeconds = options.ttlSeconds ?? 60;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
      throw new Error('Billing orphan correlation lease TTL must be between 1 and 300 seconds.');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const context = await this.readContext(tx, evidenceId);
          if (!context.attemptId) return this.recordUnboundReview(tx, context);
          if (
            !context.executionId ||
            !context.messageDispatchId ||
            !context.creationKey ||
            !context.financialSetDigest ||
            context.expectedVersion === null
          ) {
            throw Object.assign(
              new Error('Durable Billing PIX correlation context is incomplete.'),
              {
                code: '40001',
              },
            );
          }

          const acquired = await this.acquireLease(
            tx,
            context.executionId,
            owner,
            token,
            ttlSeconds,
          );
          if (!acquired) return this.retryLater();
          const expectedVersion = context.expectedVersion + 1;
          const actor = this.billingActors.forSystem(
            'billing-orphan-correlation',
            billingPixCorrelateOrphanWebhookAttestationContext({
              billingExecutionId: context.executionId,
              messageDispatchId: context.messageDispatchId,
              financialSetDigest: context.financialSetDigest,
              expectedVersion,
              owner,
              token,
              eventId: context.evidenceId,
              attemptId: context.attemptId,
              creationKey: context.creationKey,
              provider: context.provider,
              providerTransactionId: context.providerTransactionId,
              paymentIntentId: context.paymentIntentId,
            }),
          );
          const [result] = await tx.$queryRaw<Array<BillingPixOrphanCorrelationResult>>(Prisma.sql`
            SELECT decision, "decisionEventId", inserted, "reconciliationEligible"
            FROM public.billing_pix_correlate_orphan_webhook(
              ${context.evidenceId}::uuid, ${context.attemptId}::uuid,
              ${context.executionId}::uuid, ${context.paymentIntentId}::uuid,
              ${expectedVersion}::integer, ${owner}, ${token}, ${context.creationKey},
              ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
              ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
              ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
              ${actor.argumentsDigest}
            )
          `);
          if (!result) throw new Error('Billing orphan correlation returned no result.');
          const released = await this.releaseLease(tx, context.executionId, owner, token);
          if (!released) {
            throw Object.assign(new Error('Billing orphan correlation lease release failed.'), {
              code: '40001',
            });
          }
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (['P2034', '23505', '40001'].includes(this.prismaCode(error) ?? '')) {
        return this.retryLater();
      }
      throw error;
    }
  }

  private async recordUnboundReview(
    tx: Prisma.TransactionClient,
    context: CorrelationContext,
  ): Promise<BillingPixOrphanCorrelationResult> {
    const reasonCode = 'NO_DURABLE_ATTEMPT';
    const actor = this.billingActors.forSystem(
      'billing-orphan-correlation',
      billingPixAnalyzeOrphanWebhookAttestationContext({
        eventId: context.evidenceId,
        rawBodyDigest: context.rawBodyDigest,
        reasonCode,
      }),
    );
    const [result] = await tx.$queryRaw<
      Array<Omit<BillingPixOrphanCorrelationResult, 'reconciliationEligible'>>
    >(Prisma.sql`
      SELECT decision, "decisionEventId", inserted
      FROM public.billing_pix_analyze_orphan_webhook(
        ${context.evidenceId}::uuid, ${reasonCode},
        ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
        ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint,
        ${actor.actorNonce}::uuid, ${actor.actorKeyId}, ${actor.actorSignature},
        ${actor.argumentsDigest}
      )
    `);
    if (!result) throw new Error('Billing orphan correlation analysis returned no result.');
    return { ...result, reconciliationEligible: false };
  }

  private async readContext(tx: Prisma.TransactionClient, evidenceId: string) {
    const [context] = await tx.$queryRaw<Array<CorrelationContext>>(Prisma.sql`
      SELECT * FROM public.billing_pix_orphan_webhook_correlation_context(${evidenceId}::uuid)
    `);
    if (!context) throw new Error('Authenticated orphan webhook evidence was not found.');
    return context;
  }

  private async acquireLease(
    tx: Prisma.TransactionClient,
    executionId: string,
    owner: string,
    token: string,
    ttlSeconds: number,
  ) {
    const [row] = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
      SELECT public.billing_execution_acquire_lease(
        ${executionId}::uuid, ${owner}, ${token}, ${ttlSeconds}::integer
      ) AS acquired
    `);
    return row?.acquired === true;
  }

  private async releaseLease(
    tx: Prisma.TransactionClient,
    executionId: string,
    owner: string,
    token: string,
  ) {
    const [row] = await tx.$queryRaw<Array<{ released: boolean }>>(Prisma.sql`
      SELECT public.billing_execution_release_lease(
        ${executionId}::uuid, ${owner}, ${token}
      ) AS released
    `);
    return row?.released === true;
  }

  private retryLater(): BillingPixOrphanCorrelationResult {
    return {
      decision: 'RETRY_LATER',
      decisionEventId: null,
      inserted: false,
      reconciliationEligible: false,
    };
  }

  private prismaCode(error: unknown) {
    if (!error || typeof error !== 'object') return null;
    if ('meta' in error && error.meta && typeof error.meta === 'object' && 'code' in error.meta) {
      const nested = error.meta.code;
      if (typeof nested === 'string') return nested;
    }
    if ('code' in error) {
      const code = (error as { code?: unknown }).code;
      return typeof code === 'string' ? code : null;
    }
    const cause = 'cause' in error ? (error as { cause?: unknown }).cause : null;
    if (cause && typeof cause === 'object' && 'code' in cause) {
      const code = (cause as { code?: unknown }).code;
      return typeof code === 'string' ? code : null;
    }
    return null;
  }
}
