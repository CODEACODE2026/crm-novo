import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApproveWhatsAppPendingContactDto } from './dto/approve-whatsapp-pending-contact.dto';
import { ConfigureWhatsAppWebhookDto } from './dto/configure-whatsapp-webhook.dto';
import { CreateWhatsAppConnectionDto } from './dto/create-whatsapp-connection.dto';
import { IgnoreWhatsAppPendingContactDto } from './dto/ignore-whatsapp-pending-contact.dto';
import { ListWhatsAppPendingContactsDto } from './dto/list-whatsapp-pending-contacts.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { WhatsAppService } from './whatsapp.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(@Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService) {}

  @Get('connection')
  getConnection() {
    return this.whatsAppService.getConnection();
  }

  @Post('connection')
  createConnection(@Body() dto: CreateWhatsAppConnectionDto) {
    return this.whatsAppService.provisionConnection(dto);
  }

  @Post('connection/connect')
  connect() {
    return this.whatsAppService.connect();
  }

  @Get('connection/status')
  status() {
    return this.whatsAppService.refreshStatus();
  }

  @Get('connection/qr')
  qr() {
    return this.whatsAppService.getQrCode();
  }

  @Post('connection/disconnect')
  disconnect() {
    return this.whatsAppService.disconnect();
  }

  @Post('connection/logout')
  logout() {
    return this.whatsAppService.logout();
  }

  @Get('connection/webhook')
  getWebhook() {
    return this.whatsAppService.getWebhook();
  }

  @Post('connection/webhook')
  configureWebhook(@Body() dto: ConfigureWhatsAppWebhookDto) {
    return this.whatsAppService.configureWebhook(dto);
  }

  @Post('messages')
  sendMessage(@Body() dto: SendWhatsAppMessageDto, @Req() request: AuthenticatedRequest) {
    return this.whatsAppService.sendManualMessage(dto, request.user.id);
  }

  @Get('messages')
  listMessages() {
    return this.whatsAppService.listMessages();
  }

  @Get('pending-contacts')
  listPendingContacts(@Query() query: ListWhatsAppPendingContactsDto) {
    return this.whatsAppService.listPendingContacts(query);
  }

  @Get('pending-contacts/summary')
  pendingContactsSummary() {
    return this.whatsAppService.pendingContactsSummary();
  }

  @Get('pending-contacts/:id')
  getPendingContact(@Param('id') id: string) {
    return this.whatsAppService.getPendingContact(id);
  }

  @Post('pending-contacts/:id/approve')
  approvePendingContact(
    @Param('id') id: string,
    @Body() dto: ApproveWhatsAppPendingContactDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsAppService.approvePendingContact(id, dto, request.user.id);
  }

  @Post('pending-contacts/:id/ignore')
  ignorePendingContact(@Param('id') id: string, @Body() dto: IgnoreWhatsAppPendingContactDto) {
    return this.whatsAppService.ignorePendingContact(id, dto);
  }

  @Post('pending-contacts/:id/reopen')
  reopenPendingContact(@Param('id') id: string) {
    return this.whatsAppService.reopenPendingContact(id);
  }

  @Get('provider/health')
  providerHealth() {
    return this.whatsAppService.providerHealth();
  }
}

@UseGuards(JwtAuthGuard)
@Controller('payment-intents')
export class PaymentIntentWhatsAppController {
  constructor(@Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService) {}

  @Post(':id/send-whatsapp')
  sendPixWhatsApp(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.whatsAppService.sendPixPaymentIntent(id, request.user.id);
  }
}

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(@Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService) {}

  @Post('kirago')
  receiveKiragoWebhook(@Body() payload: unknown) {
    return this.whatsAppService.receiveWebhook(payload);
  }
}
