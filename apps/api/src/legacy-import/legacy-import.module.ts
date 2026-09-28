import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReceivableCycleModule } from '../receivable-cycle/receivable-cycle.module';
import { LegacyImportController } from './legacy-import.controller';
import { LegacyImportService } from './legacy-import.service';

@Module({
  imports: [AuthModule, ReceivableCycleModule],
  controllers: [LegacyImportController],
  providers: [LegacyImportService],
})
export class LegacyImportModule {}
