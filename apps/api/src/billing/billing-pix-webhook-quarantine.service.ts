import { Injectable } from '@nestjs/common';
import { PaymentProviderCode, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  BillingActorAttestationService,
  billingPixOrphanWebhookEventId,
  billingPixQuarantineOrphanWebhookAttestationContext,
  validateBillingPixOrphanWebhookMetadata,
} from './billing-actor-attestation.service';

export type QuarantineOrphanWebhookInput = {
  provider: PaymentProviderCode;
  providerTransactionId: string;
  eventKey: string;
  externalStatus: string;
  rawBody: Buffer;
  receivedAt: Date;
};

export type QuarantineOrphanWebhookResult = {
  eventId: string;
  inserted: boolean;
  rawBodyDigest: string;
};

/**
 * DATA contract only. Task 7B must call this service exclusively after the
 * provider raw-body signature has been authenticated. This service is not
 * registered in a controller, scheduler or module during 7A.
 */
@Injectable()
export class BillingPixWebhookQuarantineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingActors: BillingActorAttestationService,
  ) {}

  async persistAuthenticatedOrphan(
    input: QuarantineOrphanWebhookInput,
  ): Promise<QuarantineOrphanWebhookResult> {
    if (!Buffer.isBuffer(input.rawBody) || input.rawBody.byteLength < 1) {
      throw new Error('Authenticated webhook raw body is required.');
    }
    if (input.rawBody.byteLength > 1_048_576) {
      throw new Error('Authenticated webhook raw body exceeds 1048576 bytes.');
    }
    const metadata = validateBillingPixOrphanWebhookMetadata(input);
    const receivedAt = input.receivedAt.toISOString();
    const rawBodyDigest = createHash('sha256').update(input.rawBody).digest('hex');
    const eventId = billingPixOrphanWebhookEventId({
      provider: metadata.provider,
      providerTransactionId: metadata.providerTransactionId,
      eventKey: metadata.eventKey,
      rawBodyDigest,
    });
    const actor = this.billingActors.forWebhook(
      metadata.provider,
      metadata.eventKey,
      billingPixQuarantineOrphanWebhookAttestationContext({
        eventId,
        provider: metadata.provider,
        providerTransactionId: metadata.providerTransactionId,
        eventKey: metadata.eventKey,
        externalStatus: metadata.externalStatus,
        rawBodyDigest,
        rawBodyBytes: input.rawBody.byteLength,
        receivedAt,
      }),
    );
    const [row] = await this.prisma.$queryRaw<Array<{ eventId: string; inserted: boolean }>>(
      Prisma.sql`
        SELECT "eventId", inserted
        FROM public.billing_pix_quarantine_orphan_webhook(
          ${eventId}::uuid, ${metadata.provider}::public."PaymentProviderCode",
          ${metadata.providerTransactionId}, ${metadata.eventKey}, ${metadata.externalStatus},
          ${rawBodyDigest}, ${input.rawBody.byteLength}::integer, ${receivedAt}::timestamptz,
          ${actor.actorType}::public."BillingActorType", ${actor.actorUserId}::uuid,
          ${actor.actorPrincipal}, ${actor.actorIssuedAt}::bigint, ${actor.actorNonce}::uuid,
          ${actor.actorKeyId}, ${actor.actorSignature}, ${actor.argumentsDigest}
        )
      `,
    );
    if (!row) throw new Error('Orphan webhook evidence was not persisted.');
    return { eventId: row.eventId, inserted: row.inserted, rawBodyDigest };
  }
}
