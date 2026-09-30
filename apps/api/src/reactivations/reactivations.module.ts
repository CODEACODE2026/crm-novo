import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReactivationsController } from './reactivations.controller';
import { ReactivationsService } from './reactivations.service';

@Module({
  imports: [AuthModule],
  controllers: [ReactivationsController],
  providers: [ReactivationsService],
})
export class ReactivationsModule {}
