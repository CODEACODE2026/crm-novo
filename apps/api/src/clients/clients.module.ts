import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlansModule } from '../plans/plans.module';
import { RecoveryModule } from '../recovery/recovery.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [AuthModule, PlansModule, RecoveryModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
