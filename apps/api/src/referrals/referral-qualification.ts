import { Prisma, type ReferralStatus } from '@prisma/client';
import type { PrismaService } from '../common/prisma/prisma.service';

type ReferralQualificationTx = Prisma.TransactionClient | PrismaService;

export async function lockReferralInitialActivationEvidence(
  tx: ReferralQualificationTx,
  referredClientId: string,
  referredClientReferenceId: string,
) {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "receivables"
    WHERE "clientId" = ${referredClientId}::uuid
      AND "clientReferenceId" = ${referredClientReferenceId}::uuid
      AND "purpose" = 'INITIAL_ACTIVATION'
    ORDER BY "createdAt" ASC
    FOR UPDATE
  `);
}

export async function inspectReferralQualificationEvidence(
  tx: ReferralQualificationTx,
  referralStatus: ReferralStatus,
  referredClientId: string,
  referredClientReferenceId: string,
) {
  const receivables = await tx.receivable.findMany({
    where: {
      clientId: referredClientId,
      clientReferenceId: referredClientReferenceId,
      purpose: 'INITIAL_ACTIVATION',
    },
    include: { clientReference: true },
    orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
  });
  const eligibleReceivables = receivables.filter(
    (receivable) => receivable.status === 'PAGO' && receivable.clientReference?.status === 'ATIVO',
  );
  const receivable = eligibleReceivables[0] ?? receivables[0] ?? null;

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
      reason: 'Nao ha INITIAL_ACTIVATION vinculada a referencia indicada.',
      receivable: null,
    };
  }

  if (eligibleReceivables.length > 1) {
    return {
      eligible: false,
      reason: 'Ha mais de uma INITIAL_ACTIVATION paga para a referencia indicada.',
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
    reason:
      'Referral PENDING com INITIAL_ACTIVATION PAGO da referencia indicada e ClientReference ATIVO.',
    receivable,
  };
}
