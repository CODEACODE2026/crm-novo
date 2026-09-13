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
import { BillingService } from './billing.service';
import { ListBillingDispatchesDto } from './dto/list-billing-dispatches.dto';
import { PreviewMessageTemplateDto } from './dto/preview-message-template.dto';
import { UpdateBillingAutomationSettingsDto } from './dto/update-billing-automation-settings.dto';
import { UpdateMessageTemplateDto } from './dto/update-message-template.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(@Inject(BillingService) private readonly billingService: BillingService) {}

  @Get('summary')
  summary() {
    return this.billingService.summary();
  }

  @Get('automation-settings')
  getAutomationSettings() {
    return this.billingService.getSettings();
  }

  @Patch('automation-settings')
  updateAutomationSettings(@Body() dto: UpdateBillingAutomationSettingsDto) {
    return this.billingService.updateSettings(dto);
  }

  @Get('dispatches')
  listDispatches(@Query() query: ListBillingDispatchesDto) {
    return this.billingService.listDispatches(query);
  }

  @Get('dispatches/:id')
  getDispatch(@Param('id') id: string) {
    return this.billingService.getDispatch(id);
  }

  @Post('dispatches/:id/send-now')
  sendNow(@Param('id') id: string) {
    return this.billingService.sendNow(id);
  }

  @Post('reconcile')
  reconcile() {
    return this.billingService.reconcile();
  }

  @Post('reconcile-receivables')
  reconcileReceivables() {
    return this.billingService.reconcileReceivables();
  }

  @Get('client-references/:id/current-cycle-receivable/preview')
  previewCurrentCycleReceivable(@Param('id') id: string) {
    return this.billingService.previewCurrentCycleReceivable(id);
  }

  @Post('client-references/:id/current-cycle-receivable')
  generateCurrentCycleReceivable(@Param('id') id: string) {
    return this.billingService.generateCurrentCycleReceivable(id);
  }

  @Post('process-due')
  processDue() {
    return this.billingService.processDue();
  }

  @Get('templates')
  listTemplates() {
    return this.billingService.listTemplates();
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto) {
    return this.billingService.updateTemplate(id, dto);
  }

  @Post('templates/:id/preview')
  previewTemplate(@Param('id') id: string, @Body() dto: PreviewMessageTemplateDto) {
    return this.billingService.previewTemplate(id, dto);
  }
}
