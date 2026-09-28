import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LegacyImportService } from './legacy-import.service';

@UseGuards(JwtAuthGuard)
@Controller('legacy-import')
export class LegacyImportController {
  constructor(
    @Inject(LegacyImportService) private readonly legacyImportService: LegacyImportService,
  ) {}

  @Post('clients/preview')
  previewClients(@Body() payload: unknown) {
    return this.legacyImportService.previewClients(payload);
  }

  @Post('clients/import')
  importClients(@Body() payload: unknown) {
    return this.legacyImportService.importClients(payload);
  }

  @Post('payments/preview')
  previewPayments(@Body() payload: unknown) {
    return this.legacyImportService.previewPayments(payload);
  }

  @Post('payments/import')
  importPayments(@Body() payload: unknown) {
    return this.legacyImportService.importPayments(payload);
  }

  @Post('cutover/preview')
  previewCutover() {
    return this.legacyImportService.previewCutover();
  }

  @Post('cutover/activate')
  activateCutover(@Body() payload: unknown) {
    return this.legacyImportService.activateCutover(payload);
  }
}
