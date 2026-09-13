import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { ReceivableCycleService } from './receivable-cycle.service';

@Module({
  imports: [PrismaModule],
  providers: [ReceivableCycleService],
  exports: [ReceivableCycleService],
})
export class ReceivableCycleModule {}
