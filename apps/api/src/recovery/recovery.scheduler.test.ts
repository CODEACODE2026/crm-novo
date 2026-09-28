import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryScheduler } from './recovery.scheduler';

function scheduler(flag: string | undefined) {
  const recoveryService = {
    reconcile: vi.fn().mockResolvedValue(undefined),
    processDue: vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'RECOVERY_SCHEDULER_ENABLED') return flag;
      if (key === 'RECOVERY_SCHEDULER_INTERVAL_MS') return '30000';
      return undefined;
    }),
  };

  return {
    recoveryService,
    scheduler: new RecoveryScheduler(recoveryService as never, config as never),
  };
}

describe('RecoveryScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, '', 'false', 'FALSE', '0', 'enabled'])(
    'stays disabled when flag is %s',
    async (flag) => {
      vi.useFakeTimers();
      const { recoveryService, scheduler: subject } = scheduler(flag);

      subject.onModuleInit();
      await vi.advanceTimersByTimeAsync(30_000);

      expect(recoveryService.reconcile).not.toHaveBeenCalled();
      subject.onModuleDestroy();
    },
  );

  it('runs only when explicitly enabled', async () => {
    vi.useFakeTimers();
    const { recoveryService, scheduler: subject } = scheduler('true');

    subject.onModuleInit();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(recoveryService.reconcile).toHaveBeenCalled();
    expect(recoveryService.processDue).toHaveBeenCalled();
    subject.onModuleDestroy();
  });
});
