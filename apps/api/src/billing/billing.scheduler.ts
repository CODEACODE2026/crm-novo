import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from './billing.service';

@Injectable()
export class BillingScheduler implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(BillingService) private readonly billingService: BillingService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('BILLING_SCHEDULER_ENABLED') === 'false') {
      return;
    }

    const intervalMs = Number(this.config.get<string>('BILLING_SCHEDULER_INTERVAL_MS') ?? '60000');
    void this.tick();
    this.interval = setInterval(() => void this.tick(), Math.max(intervalMs, 30_000));
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async tick() {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.billingService.reconcile();
      await this.billingService.processDue(new Date(), 20, { automatic: true });
    } finally {
      this.running = false;
    }
  }
}
