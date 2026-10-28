import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { BillingActorAttestationService } from '../billing/billing-actor-attestation.service';
import { ReceivableCycleService } from './receivable-cycle.service';

@Module({
  imports: [PrismaModule],
  providers: [ReceivableCycleService, BillingActorAttestationService],
  exports: [ReceivableCycleService],
})
export class ReceivableCycleModule {}
