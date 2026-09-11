import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecoveryService } from './recovery.service';

@Injectable()
export class RecoveryScheduler implements OnModuleInit, OnModuleDestroy {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(RecoveryService) private readonly recoveryService: RecoveryService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('RECOVERY_SCHEDULER_ENABLED') === 'false') {
      return;
    }

    const intervalMs = Number(this.config.get<string>('RECOVERY_SCHEDULER_INTERVAL_MS') ?? '60000');
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
      await this.recoveryService.reconcile();
      await this.recoveryService.processDue();
    } finally {
      this.running = false;
    }
  }
}
