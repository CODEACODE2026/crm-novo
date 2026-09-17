import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  parseReferralReconciliationArgs,
  runReferralReconciliationCli,
} from '../src/referrals/referral-reconciliation-cli';
import { ReferralReconciliationService } from '../src/referrals/referral-reconciliation.service';
import { ReferralsService } from '../src/referrals/referrals.service';

function printDryRun(result: Awaited<ReturnType<ReferralReconciliationService['dryRun']>>) {
  console.info('DRY-RUN: nenhuma alteracao foi aplicada.');

  if (result.items.length === 0) {
    console.info('Nenhuma Referral encontrada para avaliar.');
    return;
  }

  for (const item of result.items) {
    console.info(
      [
        `Referral ID: ${item.referralId}`,
        `Indicador: ${item.referrer.name} (${item.referrer.reference})`,
        `Indicado: ${item.referred.name} (${item.referred.reference})`,
        `Referral status: ${item.referralStatus}`,
        `Reward type: ${item.rewardType}`,
        `ClientReference: ${item.clientReference?.reference ?? '-'}`,
        `Reference status: ${item.referenceStatus ?? '-'}`,
        `INITIAL_ACTIVATION receivable ID: ${item.initialActivationReceivableId ?? '-'}`,
        `Payment status: ${item.paymentStatus ?? '-'}`,
        `paidAt: ${item.paidAt ?? '-'}`,
        `Elegivel: ${item.eligible ? 'SIM' : 'NAO'}`,
        `Motivo: ${item.reason}`,
      ].join('\n'),
    );
    console.info('---');
  }
}

async function main() {
  const options = parseReferralReconciliationArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const referralsService = new ReferralsService(prisma as never);
  const reconciliationService = new ReferralReconciliationService(
    prisma as never,
    referralsService,
  );

  try {
    if (options.apply) {
      const result = await runReferralReconciliationCli(reconciliationService, options);
      console.info(JSON.stringify(result, null, 2));
      return;
    }

    const result = await reconciliationService.dryRun({
      referralId: options.referralId,
      limit: options.limit,
    });
    printDryRun(result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
