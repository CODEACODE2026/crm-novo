import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReceivableCycleModule } from '../receivable-cycle/receivable-cycle.module';
import { ReferralReconciliationService } from './referral-reconciliation.service';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [AuthModule, ReceivableCycleModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, ReferralReconciliationService],
  exports: [ReferralsService, ReferralReconciliationService],
})
export class ReferralsModule {}
