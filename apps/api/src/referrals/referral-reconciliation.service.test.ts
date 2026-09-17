import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { parseBusinessDate } from '../clients/utils/business-date';
import { ReferralReconciliationService } from './referral-reconciliation.service';

type TestReferral = {
  id: string;
  referredClientId: string;
  referrerClientId: string;
  status: 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'CANCELED';
  rewardType: 'FREE_MONTH';
  rewardValue: Prisma.Decimal | null;
  rewardDescription: string | null;
  qualifiedAt: Date | null;
  appliedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  appliedPreviousDueDate: Date | null;
  appliedNewDueDate: Date | null;
  rewardClientReferenceId: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TestReceivable = {
  id: string;
  clientId: string;
  clientReferenceId: string;
  purpose: 'INITIAL_ACTIVATION' | 'RENEWAL';
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
  paidAt: Date | null;
  dueDate: Date;
};

type ReconciliationTestTx = {
  referral: {
    findMany: (args: { where: { status?: string } }) => Promise<unknown[]>;
    findUnique: (args: { where: { id?: string; referredClientId?: string } }) => Promise<unknown>;
    updateMany: (args: {
      where: { id: string; status?: string };
      data: object;
    }) => Promise<{ count: number }>;
  };
  receivable: {
    findFirst: (args: {
      where: {
        clientId: string;
        purpose: string;
        status?: string;
        clientReference?: { status: string };
      };
    }) => Promise<unknown>;
  };
  clientEvent: {
    createMany: (args: { data: Array<Record<string, unknown>> }) => Promise<{ count: number }>;
  };
  $transaction: <T>(callback: (transaction: ReconciliationTestTx) => Promise<T>) => Promise<T>;
};

function createReconciliationFixture() {
  const clients = [
    { id: 'referrer-id', name: 'Bruno', reference: 'BRU-001' },
    { id: 'referred-id', name: 'Soraia QA', reference: 'SOR-001' },
    { id: 'other-client-id', name: 'Outro', reference: 'OUT-001' },
  ];
  const references = [
    {
      id: 'reference-id',
      clientId: 'referred-id',
      reference: 'SOR-REF',
      status: 'ATIVO',
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
    },
    {
      id: 'other-reference-id',
      clientId: 'other-client-id',
      reference: 'OUT-REF',
      status: 'ATIVO',
      dueDate: parseBusinessDate('2026-10-10'),
      billingAnchorDay: 10,
    },
  ];
  const referrals: TestReferral[] = [
    {
      id: 'referral-id',
      referredClientId: 'referred-id',
      referrerClientId: 'referrer-id',
      status: 'PENDING',
      rewardType: 'FREE_MONTH',
      rewardValue: null,
      rewardDescription: null,
      qualifiedAt: null,
      appliedAt: null,
      canceledAt: null,
      cancellationReason: null,
      appliedPreviousDueDate: null,
      appliedNewDueDate: null,
      rewardClientReferenceId: null,
      createdByUserId: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ];
  const receivables: TestReceivable[] = [
    {
      id: 'initial-paid-id',
      clientId: 'referred-id',
      clientReferenceId: 'reference-id',
      purpose: 'INITIAL_ACTIVATION',
      status: 'PAGO',
      paidAt: parseBusinessDate('2026-09-15'),
      dueDate: parseBusinessDate('2026-09-10'),
    },
  ];
  const financialTransactions: Array<Record<string, unknown>> = [];
  const renewals: Array<Record<string, unknown>> = [];
  const messageDispatches: Array<Record<string, unknown>> = [];
  const recoveryCampaigns: Array<Record<string, unknown>> = [];
  const paymentGroups: Array<Record<string, unknown>> = [];
  const paymentIntents: Array<Record<string, unknown>> = [];
  const whatsappMessages: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const decorateReferral = (referral: TestReferral) => ({
    ...referral,
    referredClient: {
      ...clients.find((client) => client.id === referral.referredClientId)!,
      references: references.filter(
        (reference) => reference.clientId === referral.referredClientId,
      ),
    },
    referrerClient: {
      ...clients.find((client) => client.id === referral.referrerClientId)!,
      references: references.filter(
        (reference) => reference.clientId === referral.referrerClientId,
      ),
    },
    rewardClientReference: null,
  });

  const tx: ReconciliationTestTx = {
    referral: {
      findMany: ({ where }: { where: { status?: string } }) =>
        Promise.resolve(
          referrals
            .filter((referral) => !where.status || referral.status === where.status)
            .map(decorateReferral),
        ),
      findUnique: ({ where }: { where: { id?: string; referredClientId?: string } }) =>
        Promise.resolve(
          referrals.find(
            (referral) =>
              (!where.id || referral.id === where.id) &&
              (!where.referredClientId || referral.referredClientId === where.referredClientId),
          )
            ? decorateReferral(
                referrals.find(
                  (referral) =>
                    (!where.id || referral.id === where.id) &&
                    (!where.referredClientId ||
                      referral.referredClientId === where.referredClientId),
                )!,
              )
            : null,
        ),
      updateMany: ({ where, data }: { where: { id: string; status?: string }; data: object }) => {
        const referral = referrals.find(
          (item) => item.id === where.id && (!where.status || item.status === where.status),
        );
        if (!referral) return Promise.resolve({ count: 0 });
        Object.assign(referral, data);
        return Promise.resolve({ count: 1 });
      },
    },
    receivable: {
      findFirst: ({
        where,
      }: {
        where: {
          clientId: string;
          purpose: string;
          status?: string;
          clientReference?: { status: string };
        };
      }) => {
        const receivable =
          receivables.find((item) => {
            const reference = references.find(
              (candidate) => candidate.id === item.clientReferenceId,
            );
            return (
              item.clientId === where.clientId &&
              item.purpose === where.purpose &&
              (!where.status || item.status === where.status) &&
              (!where.clientReference || reference?.status === where.clientReference.status)
            );
          }) ?? null;

        return Promise.resolve(
          receivable
            ? {
                ...receivable,
                clientReference: references.find(
                  (item) => item.id === receivable.clientReferenceId,
                )!,
              }
            : null,
        );
      },
    },
    clientEvent: {
      createMany: ({ data }: { data: Array<Record<string, unknown>> }) => {
        events.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => callback(tx),
  };

  const referralsService = {
    qualifyAfterInitialActivation: vi.fn(
      async (
        transaction: typeof tx,
        referredClientId: string,
        receivableId: string,
        actorUserId: string | null,
      ) => {
        const referral = referrals.find((item) => item.referredClientId === referredClientId);
        if (!referral || referral.status !== 'PENDING') return null;
        referral.status = 'QUALIFIED';
        referral.qualifiedAt = new Date('2026-09-17T00:00:00.000Z');
        await transaction.clientEvent.createMany({
          data: [
            {
              clientId: referral.referredClientId,
              type: 'REFERRAL_QUALIFIED',
              metadata: { referralId: referral.id, receivableId },
              createdByUserId: actorUserId,
            },
            {
              clientId: referral.referrerClientId,
              type: 'REFERRAL_QUALIFIED',
              metadata: { referralId: referral.id, referredClientId, receivableId },
              createdByUserId: actorUserId,
            },
          ],
        });
        return decorateReferral(referral);
      },
    ),
  };

  return {
    clients,
    events,
    financialTransactions,
    messageDispatches,
    paymentGroups,
    paymentIntents,
    prisma: tx,
    receivables,
    recoveryCampaigns,
    references,
    referrals,
    referralsService,
    renewals,
    service: new ReferralReconciliationService(tx as never, referralsService as never),
    whatsappMessages,
  };
}

describe('ReferralReconciliationService', () => {
  it('marks PENDING + INITIAL_ACTIVATION paid + active reference as candidate', async () => {
    const fake = createReconciliationFixture();

    const result = await fake.service.dryRun({ referralId: 'referral-id' });

    expect(result.items[0]).toMatchObject({
      referralId: 'referral-id',
      referralStatus: 'PENDING',
      initialActivationReceivableId: 'initial-paid-id',
      paymentStatus: 'PAGO',
      referenceStatus: 'ATIVO',
      eligible: true,
    });
  });

  it('does not use a paid renewal as evidence', async () => {
    const fake = createReconciliationFixture();
    fake.receivables[0]!.purpose = 'RENEWAL';

    const result = await fake.service.dryRun({ referralId: 'referral-id' });

    expect(result.items[0]).toMatchObject({ eligible: false });
    expect(result.items[0]!.reason).toContain('Nao ha INITIAL_ACTIVATION');
  });

  it('does not use a pending initial activation as evidence', async () => {
    const fake = createReconciliationFixture();
    fake.receivables[0]!.status = 'PENDENTE';
    fake.receivables[0]!.paidAt = null;

    const result = await fake.service.dryRun({ referralId: 'referral-id' });

    expect(result.items[0]).toMatchObject({
      eligible: false,
      initialActivationReceivableId: 'initial-paid-id',
      paymentStatus: 'PENDENTE',
    });
    expect(result.items[0]!.reason).toContain('pagamento PAGO');
  });

  it.each(['QUALIFIED' as const, 'REWARDED' as const, 'CANCELED' as const])(
    'does not mark %s referral as candidate',
    async (status) => {
      const fake = createReconciliationFixture();
      fake.referrals[0]!.status = status;

      const result = await fake.service.dryRun({ referralId: 'referral-id' });

      expect(result.items[0]).toMatchObject({ eligible: false, referralStatus: status });
    },
  );

  it('does not use another client payment as evidence', async () => {
    const fake = createReconciliationFixture();
    fake.receivables[0]!.clientId = 'other-client-id';
    fake.receivables[0]!.clientReferenceId = 'other-reference-id';

    const result = await fake.service.dryRun({ referralId: 'referral-id' });

    expect(result.items[0]).toMatchObject({ eligible: false });
  });

  it('reconciles a valid referral using the referral domain rule', async () => {
    const fake = createReconciliationFixture();

    const result = await fake.service.apply('referral-id', 'actor-id');

    expect(result).toMatchObject({
      applied: true,
      before: { status: 'PENDING', qualifiedAt: null },
      after: { status: 'QUALIFIED' },
    });
    expect(fake.referralsService.qualifyAfterInitialActivation).toHaveBeenCalledWith(
      fake.prisma,
      'referred-id',
      'initial-paid-id',
      'actor-id',
    );
    expect(fake.referrals[0]).toMatchObject({ status: 'QUALIFIED' });
    expect(fake.referrals[0]!.qualifiedAt).toBeInstanceOf(Date);
    expect(fake.events.filter((event) => event.type === 'REFERRAL_QUALIFIED')).toHaveLength(2);
  });

  it('keeps missing referral apply safe without mutations', async () => {
    const fake = createReconciliationFixture();

    await expect(fake.service.apply('missing-referral-id', 'actor-id')).rejects.toThrow(
      'Indicacao nao encontrada.',
    );

    expect(fake.referrals[0]).toMatchObject({ status: 'PENDING', qualifiedAt: null });
    expect(fake.events).toHaveLength(0);
    expect(fake.referralsService.qualifyAfterInitialActivation).not.toHaveBeenCalled();
  });

  it('keeps non-eligible referral apply as no-op with a clear reason', async () => {
    const fake = createReconciliationFixture();
    fake.receivables[0]!.status = 'PENDENTE';
    fake.receivables[0]!.paidAt = null;

    const result = await fake.service.apply('referral-id', 'actor-id');

    expect(result).toMatchObject({
      applied: false,
      before: { status: 'PENDING', qualifiedAt: null },
      after: { status: 'PENDING', qualifiedAt: null },
      candidate: { eligible: false, paymentStatus: 'PENDENTE' },
    });
    expect(result.candidate.reason).toContain('pagamento PAGO');
    expect(fake.referrals[0]).toMatchObject({ status: 'PENDING', qualifiedAt: null });
    expect(fake.events).toHaveLength(0);
    expect(fake.referralsService.qualifyAfterInitialActivation).not.toHaveBeenCalled();
  });

  it('keeps second reconciliation idempotent without duplicate event or qualifiedAt overwrite', async () => {
    const fake = createReconciliationFixture();

    await fake.service.apply('referral-id', 'actor-id');
    const firstQualifiedAt = fake.referrals[0]!.qualifiedAt;
    const result = await fake.service.apply('referral-id', 'actor-id');

    expect(result).toMatchObject({ applied: false });
    expect(fake.referrals[0]).toMatchObject({ status: 'QUALIFIED' });
    expect(fake.referrals[0]!.qualifiedAt).toBe(firstQualifiedAt);
    expect(fake.events.filter((event) => event.type === 'REFERRAL_QUALIFIED')).toHaveLength(2);
  });

  it('does not change financial, due date, cycle, dispatch, recovery, pix, payment group or whatsapp data', async () => {
    const fake = createReconciliationFixture();
    const receivableBefore = { ...fake.receivables[0]! };
    const referenceBefore = { ...fake.references[0]! };

    await fake.service.apply('referral-id', 'actor-id');

    expect(fake.receivables[0]).toEqual(receivableBefore);
    expect(fake.references[0]).toEqual(referenceBefore);
    expect(fake.financialTransactions).toHaveLength(0);
    expect(fake.renewals).toHaveLength(0);
    expect(fake.messageDispatches).toHaveLength(0);
    expect(fake.recoveryCampaigns).toHaveLength(0);
    expect(fake.paymentGroups).toHaveLength(0);
    expect(fake.paymentIntents).toHaveLength(0);
    expect(fake.whatsappMessages).toHaveLength(0);
  });
});
