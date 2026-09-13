import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReceivableCycleModule } from '../receivable-cycle/receivable-cycle.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [AuthModule, ReceivableCycleModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
