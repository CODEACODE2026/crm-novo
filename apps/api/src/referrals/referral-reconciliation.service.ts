import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatBusinessDate } from '../clients/utils/business-date';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReferralsService } from './referrals.service';

type ReconciliationTx = Prisma.TransactionClient | PrismaService;

type ReferralForReconciliation = Prisma.ReferralGetPayload<{
  include: {
    referredClient: { include: { references: true } };
    referrerClient: { include: { references: true } };
    rewardClientReference: true;
  };
}>;

type InitialActivationReceivable = Prisma.ReceivableGetPayload<{
  include: { clientReference: true };
}>;

export type ReferralReconciliationRow = {
  referralId: string;
  referrer: { id: string; name: string; reference: string };
  referred: { id: string; name: string; reference: string };
  referralStatus: string;
  rewardType: string;
  clientReference: { id: string; reference: string } | null;
  referenceStatus: string | null;
  initialActivationReceivableId: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  eligible: boolean;
  reason: string;
};

export type ReferralReconciliationApplyResult = {
  dryRun: false;
  candidate: ReferralReconciliationRow;
  applied: boolean;
  before: { status: string; qualifiedAt: string | null };
  after: { status: string; qualifiedAt: string | null };
};

@Injectable()
export class ReferralReconciliationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReferralsService) private readonly referralsService: ReferralsService,
  ) {}

  async dryRun(options: { referralId?: string | undefined; limit?: number | undefined } = {}) {
    const limit = options.limit ?? 100;
    const referrals = await this.findReferralsForDryRun(this.prisma, options.referralId, limit);

    return {
      dryRun: true,
      items: await Promise.all(
        referrals.map((referral) => this.inspectReferral(this.prisma, referral)),
      ),
    };
  }

  async apply(referralId: string, actorUserId: string | null = null) {
    if (!referralId.trim()) {
      throw new BadRequestException('Informe uma Referral especifica para aplicar reconciliacao.');
    }

    return this.prisma.$transaction(async (tx) => {
      const referral = await this.findReferral(tx, referralId);
      const candidate = await this.inspectReferral(tx, referral);

      if (!candidate.eligible || !candidate.initialActivationReceivableId) {
        return {
          dryRun: false,
          candidate,
          applied: false,
          before: this.referralState(referral),
          after: this.referralState(referral),
        } satisfies ReferralReconciliationApplyResult;
      }

      const before = this.referralState(referral);

      await this.referralsService.qualifyAfterInitialActivation(
        tx,
        referral.referredClientId,
        candidate.initialActivationReceivableId,
        actorUserId,
      );

      const updated = await this.findReferral(tx, referralId);

      return {
        dryRun: false,
        candidate,
        applied:
          before.status !== updated.status ||
          before.qualifiedAt !== this.formatDate(updated.qualifiedAt),
        before,
        after: this.referralState(updated),
      } satisfies ReferralReconciliationApplyResult;
    });
  }

  private async findReferralsForDryRun(
    tx: ReconciliationTx,
    referralId: string | undefined,
    limit: number,
  ) {
    if (referralId) {
      return [await this.findReferral(tx, referralId)];
    }

    return tx.referral.findMany({
      where: { status: 'PENDING' },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
      },
      orderBy: [{ createdAt: 'asc' }],
      take: Math.max(1, Math.min(limit, 500)),
    });
  }

  private async findReferral(tx: ReconciliationTx, referralId: string) {
    const referral = await tx.referral.findUnique({
      where: { id: referralId },
      include: {
        referredClient: { include: { references: true } },
        referrerClient: { include: { references: true } },
        rewardClientReference: true,
      },
    });

    if (!referral) {
      throw new NotFoundException('Indicacao nao encontrada.');
    }

    return referral;
  }

  private async inspectReferral(tx: ReconciliationTx, referral: ReferralForReconciliation) {
    const receivable = await this.findInitialActivationEvidence(tx, referral.referredClientId);
    const reference =
      receivable?.clientReference ??
      referral.referredClient.references.find((item) => item.status === 'ATIVO') ??
      null;
    const eligibility = this.evaluateEligibility(referral, receivable);

    return {
      referralId: referral.id,
      referrer: {
        id: referral.referrerClient.id,
        name: referral.referrerClient.name,
        reference: referral.referrerClient.reference,
      },
      referred: {
        id: referral.referredClient.id,
        name: referral.referredClient.name,
        reference: referral.referredClient.reference,
      },
      referralStatus: referral.status,
      rewardType: referral.rewardType,
      clientReference: reference ? { id: reference.id, reference: reference.reference } : null,
      referenceStatus: reference?.status ?? null,
      initialActivationReceivableId: receivable?.id ?? null,
      paymentStatus: receivable?.status ?? null,
      paidAt: receivable?.paidAt ? formatBusinessDate(receivable.paidAt) : null,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
    } satisfies ReferralReconciliationRow;
  }

  private async findInitialActivationEvidence(tx: ReconciliationTx, referredClientId: string) {
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

    if (paidActiveReceivable) {
      return paidActiveReceivable;
    }

    return tx.receivable.findFirst({
      where: {
        clientId: referredClientId,
        purpose: 'INITIAL_ACTIVATION',
      },
      include: { clientReference: true },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private evaluateEligibility(
    referral: ReferralForReconciliation,
    receivable: InitialActivationReceivable | null,
  ) {
    if (referral.status !== 'PENDING') {
      return { eligible: false, reason: `Referral ${referral.status} nao e reconciliavel.` };
    }

    if (!receivable) {
      return {
        eligible: false,
        reason: 'Nao ha INITIAL_ACTIVATION do cliente indicado vinculada a ClientReference.',
      };
    }

    if (receivable.status !== 'PAGO') {
      return {
        eligible: false,
        reason: `INITIAL_ACTIVATION ${receivable.status}; pagamento PAGO exigido.`,
      };
    }

    if (receivable.clientReference.status !== 'ATIVO') {
      return {
        eligible: false,
        reason: `ClientReference ${receivable.clientReference.status}; status ATIVO exigido.`,
      };
    }

    return {
      eligible: true,
      reason: 'Referral PENDING com INITIAL_ACTIVATION PAGO e ClientReference ATIVO.',
    };
  }

  private referralState(referral: ReferralForReconciliation) {
    return {
      status: referral.status,
      qualifiedAt: this.formatDate(referral.qualifiedAt),
    };
  }

  private formatDate(value: Date | null) {
    return value ? value.toISOString() : null;
  }
}
