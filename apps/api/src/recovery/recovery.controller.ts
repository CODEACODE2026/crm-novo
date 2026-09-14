import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListRecoveryCampaignsDto } from './dto/list-recovery-campaigns.dto';
import { RecoveryService } from './recovery.service';
import { UpdateRecoveryAutomationSettingsDto } from './dto/update-recovery-automation-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('recovery')
export class RecoveryController {
  constructor(@Inject(RecoveryService) private readonly recoveryService: RecoveryService) {}

  @Get('summary')
  summary() {
    return this.recoveryService.summary();
  }

  @Get('automation-settings')
  getAutomationSettings() {
    return this.recoveryService.getSettings();
  }

  @Patch('automation-settings')
  updateAutomationSettings(@Body() dto: UpdateRecoveryAutomationSettingsDto) {
    return this.recoveryService.updateSettings(dto);
  }

  @Get('campaigns')
  listCampaigns(@Query() query: ListRecoveryCampaignsDto) {
    return this.recoveryService.listCampaigns(query);
  }

  @Get('campaigns/:id')
  getCampaign(@Param('id') id: string) {
    return this.recoveryService.getCampaign(id);
  }

  @Post('campaigns/:id/cancel')
  cancelCampaign(@Param('id') id: string) {
    return this.recoveryService.cancelCampaign(id, 'Cancelamento manual da campanha.');
  }

  @Post('reconcile')
  reconcile() {
    return this.recoveryService.reconcile();
  }

  @Post('process-due')
  processDue() {
    return this.recoveryService.processDue();
  }
}
