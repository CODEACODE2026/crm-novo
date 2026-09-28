import { describe, expect, it, vi, afterEach } from 'vitest';
import { BillingScheduler } from './billing.scheduler';

function scheduler(flag: string | undefined) {
  const billingService = {
    reconcile: vi.fn().mockResolvedValue(undefined),
    processDue: vi.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'BILLING_SCHEDULER_ENABLED') return flag;
      if (key === 'BILLING_SCHEDULER_INTERVAL_MS') return '30000';
      return undefined;
    }),
  };

  return {
    billingService,
    scheduler: new BillingScheduler(billingService as never, config as never),
  };
}

describe('BillingScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, '', 'false', 'FALSE', '0', 'enabled'])(
    'stays disabled when flag is %s',
    async (flag) => {
      vi.useFakeTimers();
      const { billingService, scheduler: subject } = scheduler(flag);

      subject.onModuleInit();
      await Promise.resolve();

      expect(billingService.reconcile).not.toHaveBeenCalled();
      subject.onModuleDestroy();
    },
  );

  it('runs only when explicitly enabled', async () => {
    vi.useFakeTimers();
    const { billingService, scheduler: subject } = scheduler('true');

    subject.onModuleInit();
    await Promise.resolve();

    expect(billingService.reconcile).toHaveBeenCalled();
    expect(billingService.processDue).toHaveBeenCalled();
    subject.onModuleDestroy();
  });
});
