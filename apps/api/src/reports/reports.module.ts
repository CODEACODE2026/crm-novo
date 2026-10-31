import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { ReportsIntelligenceService } from './reports-intelligence.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsIntelligenceService],
})
export class ReportsModule {}
