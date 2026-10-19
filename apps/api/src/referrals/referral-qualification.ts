import { Prisma, type ReferralStatus } from '@prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';

type ReferralQualificationTx = Prisma.TransactionClient | PrismaService;

export async function lockReferralInitialActivationEvidence(
  tx: ReferralQualificationTx,
  referredClientId: string,
) {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "receivables"
    WHERE "clientId" = ${referredClientId}::uuid
      AND "purpose" = 'INITIAL_ACTIVATION'
    ORDER BY "createdAt" ASC
    FOR UPDATE
  `);
}

export async function inspectReferralQualificationEvidence(
  tx: ReferralQualificationTx,
  referralStatus: ReferralStatus,
  referredClientId: string,
) {
  const paidActiveReceivable = await tx.receivable.findFirst({
    where: {
      clientId: referredClientId,
      purpose: 'INITIAL_ACTIVATION',
      status: 'PAGO',
      clientReference: { status: 'ATIVO' },
    },
    include: { clientReference: true },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
  });

  const receivable =
    paidActiveReceivable ??
    (await tx.receivable.findFirst({
      where: {
        clientId: referredClientId,
        purpose: 'INITIAL_ACTIVATION',
      },
      include: { clientReference: true },
      orderBy: [{ createdAt: 'asc' }],
    }));

  if (referralStatus !== 'PENDING') {
    return {
      eligible: false,
      reason: `Referral ${referralStatus} nao e reconciliavel.`,
      receivable,
    };
  }

  if (!receivable) {
    return {
      eligible: false,
      reason: 'Nao ha INITIAL_ACTIVATION do cliente indicado vinculada a ClientReference.',
      receivable: null,
    };
  }

  if (receivable.status !== 'PAGO') {
    return {
      eligible: false,
      reason: `INITIAL_ACTIVATION ${receivable.status}; pagamento PAGO exigido.`,
      receivable,
    };
  }

  if (receivable.clientReference?.status !== 'ATIVO') {
    return {
      eligible: false,
      reason: `ClientReference ${receivable.clientReference?.status ?? 'AUSENTE'}; status ATIVO exigido.`,
      receivable,
    };
  }

  return {
    eligible: true,
    reason: 'Referral PENDING com INITIAL_ACTIVATION PAGO e ClientReference ATIVO.',
    receivable,
  };
}
