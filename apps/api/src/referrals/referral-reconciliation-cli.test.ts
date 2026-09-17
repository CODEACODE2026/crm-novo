import { describe, expect, it, vi } from 'vitest';
import {
  parseReferralReconciliationArgs,
  runReferralReconciliationCli,
} from './referral-reconciliation-cli';

describe('referral reconciliation CLI parser', () => {
  it('defaults to dry-run without arguments', () => {
    expect(parseReferralReconciliationArgs([])).toEqual({ apply: false, limit: 100 });
  });

  it('keeps referral-id dry-run read-only without apply', () => {
    expect(parseReferralReconciliationArgs(['--referral-id', 'referral-1'])).toEqual({
      apply: false,
      limit: 100,
      referralId: 'referral-1',
    });
  });

  it('keeps limit dry-run read-only without apply', () => {
    expect(parseReferralReconciliationArgs(['--limit', '100'])).toEqual({
      apply: false,
      limit: 100,
    });
  });

  it.each([
    [['--apply'], 'referral-id'],
    [['--apply', '--limit', '100', '--actor-user-id', 'admin-1'], 'referral-id'],
  ])('rejects apply without referral-id: %s', (argv, message) => {
    expect(() => parseReferralReconciliationArgs(argv)).toThrow(message);
  });

  it('rejects apply with referral-id but without actor-user-id', () => {
    expect(() =>
      parseReferralReconciliationArgs(['--apply', '--referral-id', 'referral-1']),
    ).toThrow('actor-user-id');
  });

  it('rejects apply with actor-user-id but without referral-id', () => {
    expect(() =>
      parseReferralReconciliationArgs(['--apply', '--actor-user-id', 'admin-1']),
    ).toThrow('referral-id');
  });

  it('accepts apply only with referral-id and actor-user-id', () => {
    expect(
      parseReferralReconciliationArgs([
        '--apply',
        '--referral-id',
        'referral-1',
        '--actor-user-id',
        'admin-1',
      ]),
    ).toEqual({
      actorUserId: 'admin-1',
      apply: true,
      limit: 100,
      referralId: 'referral-1',
    });
  });

  it.each([
    ['--limit', '0'],
    ['--limit', '-1'],
    ['--limit', 'abc'],
  ])('rejects invalid limit %s %s', (flag, value) => {
    expect(() => parseReferralReconciliationArgs([flag, value])).toThrow('inteiro positivo');
  });

  it.each([
    ['--referral-id'],
    ['--referral-id', '--apply'],
    ['--actor-user-id'],
    ['--actor-user-id', '--apply'],
  ])('rejects missing flag value: %s', (...argv) => {
    expect(() => parseReferralReconciliationArgs(argv)).toThrow('exige valor');
  });

  it('rejects unknown flags', () => {
    expect(() => parseReferralReconciliationArgs(['--unknown'])).toThrow('Argumento desconhecido');
  });
});

describe('referral reconciliation CLI runner', () => {
  it('runs dry-run without calling apply', async () => {
    const service = {
      apply: vi.fn(),
      dryRun: vi.fn().mockResolvedValue({ dryRun: true, items: [] }),
    };

    await runReferralReconciliationCli(service, { apply: false, limit: 25 });

    expect(service.dryRun).toHaveBeenCalledWith({ referralId: undefined, limit: 25 });
    expect(service.apply).not.toHaveBeenCalled();
  });

  it('passes referral-id and actor-user-id to apply', async () => {
    const service = {
      apply: vi.fn().mockResolvedValue({ dryRun: false, applied: true }),
      dryRun: vi.fn(),
    };

    await runReferralReconciliationCli(service, {
      actorUserId: 'admin-1',
      apply: true,
      limit: 100,
      referralId: 'referral-1',
    });

    expect(service.apply).toHaveBeenCalledWith('referral-1', 'admin-1');
    expect(service.dryRun).not.toHaveBeenCalled();
  });
});
