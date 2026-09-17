import { ReferralReconciliationService } from './referral-reconciliation.service';

export type ReferralReconciliationCliOptions = {
  apply: boolean;
  actorUserId?: string | undefined;
  limit: number;
  referralId?: string | undefined;
};

type ReconciliationCliService = Pick<ReferralReconciliationService, 'apply' | 'dryRun'>;

export function parseReferralReconciliationArgs(argv: string[]): ReferralReconciliationCliOptions {
  const options: ReferralReconciliationCliOptions = { apply: false, limit: 100 };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--referral-id') {
      const { value, nextIndex } = readFlagValue(argv, index, '--referral-id');
      options.referralId = value;
      index = nextIndex;
      continue;
    }

    if (arg === '--actor-user-id') {
      const { value, nextIndex } = readFlagValue(argv, index, '--actor-user-id');
      options.actorUserId = value;
      index = nextIndex;
      continue;
    }

    if (arg === '--limit') {
      const { value, nextIndex } = readFlagValue(argv, index, '--limit');
      options.limit = Number(value);
      index = nextIndex;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}`);
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('--limit deve ser um inteiro positivo.');
  }

  if (options.apply && !options.referralId) {
    throw new Error('Aplicacao exige --referral-id explicito.');
  }

  if (options.apply && !options.actorUserId) {
    throw new Error('Aplicacao exige --actor-user-id explicito.');
  }

  return options;
}

export async function runReferralReconciliationCli(
  service: ReconciliationCliService,
  options: ReferralReconciliationCliOptions,
) {
  if (options.apply) {
    if (!options.referralId || !options.actorUserId) {
      throw new Error('Aplicacao exige --referral-id e --actor-user-id explicitos.');
    }

    return service.apply(options.referralId, options.actorUserId);
  }

  return service.dryRun({
    referralId: options.referralId,
    limit: options.limit,
  });
}

function readFlagValue(argv: string[], index: number, flag: string) {
  const value = argv[index + 1];

  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} exige valor.`);
  }

  return { value, nextIndex: index + 1 };
}
