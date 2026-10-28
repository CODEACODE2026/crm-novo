import { Prisma } from '@prisma/client';

const financialSetLockNamespace = 'pix:receivable:';

type FinancialLockTransaction = {
  $executeRawUnsafe?: Prisma.TransactionClient['$executeRawUnsafe'];
};

export async function acquireFinancialSetLocks(
  tx: FinancialLockTransaction,
  receivableIds: readonly string[],
) {
  if (!tx.$executeRawUnsafe) return;

  for (const receivableId of [...new Set(receivableIds)].sort()) {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      `${financialSetLockNamespace}${receivableId}`,
    );
  }
}
