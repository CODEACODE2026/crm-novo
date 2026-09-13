import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { ClientReferenceRenewalsController, RenewalsController } from './renewals.controller';
import { RenewalsService } from './renewals.service';

@Module({
  imports: [AuthModule, RecoveryModule],
  controllers: [RenewalsController, ClientReferenceRenewalsController],
  providers: [RenewalsService],
})
export class RenewalsModule {}
