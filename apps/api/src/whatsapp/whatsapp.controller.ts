import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { validateKiragoWebhookToken } from '../config/security';
import { ApproveWhatsAppPendingContactDto } from './dto/approve-whatsapp-pending-contact.dto';
import { ConfigureWhatsAppWebhookDto } from './dto/configure-whatsapp-webhook.dto';
import { CreateWhatsAppConnectionDto } from './dto/create-whatsapp-connection.dto';
import { IgnoreWhatsAppPendingContactDto } from './dto/ignore-whatsapp-pending-contact.dto';
import { LinkWhatsAppConversationClientDto } from './dto/link-whatsapp-conversation-client.dto';
import { ListWhatsAppConversationMessagesDto } from './dto/list-whatsapp-conversation-messages.dto';
import { ListWhatsAppConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { ListWhatsAppPendingContactsDto } from './dto/list-whatsapp-pending-contacts.dto';
import { SendWhatsAppConversationMessageDto } from './dto/send-whatsapp-conversation-message.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';
import { StartWhatsAppConversationDto } from './dto/start-whatsapp-conversation.dto';
import { WhatsAppService } from './whatsapp.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('whatsapp')
export class WhatsAppController {
  constructor(@Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService) {}

  @Get('connection')
  getConnection() {
    return this.whatsAppService.getConnection();
  }

  @Get('connections')
  listConnections() {
    return this.whatsAppService.listUsableConnections();
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

  @Get('conversations')
  listConversations(@Query() query: ListWhatsAppConversationsDto) {
    return this.whatsAppService.listConversations(query);
  }

  @Post('conversations/start')
  startConversation(
    @Body() dto: StartWhatsAppConversationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsAppService.startConversation(dto, request.user.id);
  }

  @Get('conversations/:id/messages')
  listConversationMessages(
    @Param('id') id: string,
    @Query() query: ListWhatsAppConversationMessagesDto,
  ) {
    return this.whatsAppService.listConversationMessages(id, query);
  }

  @Post('conversations/:id/messages')
  sendConversationMessage(
    @Param('id') id: string,
    @Body() dto: SendWhatsAppConversationMessageDto,
  ) {
    return this.whatsAppService.sendConversationTextMessage(id, dto);
  }

  @Post('conversations/:id/media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: WhatsAppService.conversationMediaMaxBytes },
    }),
  )
  sendConversationMedia(
    @Param('id') id: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
    @Body('caption') caption: string | undefined,
    @Body('requestId') requestId: string | undefined,
  ) {
    return this.whatsAppService.sendConversationMediaMessage(id, {
      ...(file ? { file } : {}),
      ...(caption !== undefined ? { caption } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
    });
  }

  @Post('conversations/:id/voice')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: WhatsAppService.conversationVoiceMaxBytes },
    }),
  )
  sendConversationVoice(
    @Param('id') id: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
    @Body('requestId') requestId: string | undefined,
    @Body('durationSeconds') durationSeconds: string | undefined,
  ) {
    return this.whatsAppService.sendConversationVoiceMessage(id, {
      ...(file ? { file } : {}),
      ...(requestId !== undefined ? { requestId } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    });
  }

  @Get('conversations/:conversationId/messages/:messageId/media')
  async downloadConversationMessageMedia(
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.whatsAppService.downloadConversationMessageMedia(
      conversationId,
      messageId,
    );
    response.setHeader('Content-Type', media.mimetype);
    response.setHeader('Content-Length', String(media.contentLength));
    response.setHeader(
      'Content-Disposition',
      `${media.disposition}; filename="${media.fileName.replace(/["\\]/g, '_')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');

    return new StreamableFile(media.buffer);
  }

  @Post('conversations/:id/link-client')
  linkConversationClient(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkWhatsAppConversationClientDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.whatsAppService.linkConversationClient(id, dto, request.user.id);
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string) {
    return this.whatsAppService.getConversation(id);
  }

  @Post('conversations/:id/read')
  markConversationAsRead(@Param('id') id: string) {
    return this.whatsAppService.markConversationAsRead(id);
  }

  @Post('conversations/:id/resolve')
  resolveConversation(@Param('id') id: string) {
    return this.whatsAppService.resolveConversation(id);
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

@UseGuards(JwtAuthGuard, AdminGuard)
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
  constructor(
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post('kirago')
  receiveKiragoWebhook(
    @Body() payload: unknown,
    @Headers('x-kirago-webhook-token') headerToken: string | undefined,
    @Query('kirago_webhook_token') queryToken: string | undefined,
  ) {
    validateKiragoWebhookToken(
      headerToken ?? queryToken,
      this.config.getOrThrow<string>('KIRAGO_WEBHOOK_TOKEN'),
    );
    return this.whatsAppService.receiveWebhook(payload);
  }
}
