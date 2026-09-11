import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessageDispatch,
  Prisma,
  WhatsAppConnection,
  WhatsAppConnectionStatus,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeBrazilPhone } from '../clients/utils/phone-normalizer';
import { KiragoProviderError } from './kirago/kirago-provider.error';
import { WHATSAPP_PROVIDER, type WhatsAppProvider } from './provider/whatsapp-provider';
import { TokenEncryptionService } from './security/token-encryption.service';
import { CreateWhatsAppConnectionDto } from './dto/create-whatsapp-connection.dto';
import { ConfigureWhatsAppWebhookDto } from './dto/configure-whatsapp-webhook.dto';
import { SendWhatsAppMessageDto } from './dto/send-whatsapp-message.dto';

const providerEvents = ['Message'];
const messagePreviewLimit = 80;

@Injectable()
export class WhatsAppService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
  ) {}

  async getConnection() {
    const connection = await this.findPrimaryConnection();
    return connection ? this.presentConnection(connection) : null;
  }

  async provisionConnection(dto: CreateWhatsAppConnectionDto) {
    const existing = await this.findPrimaryConnection();

    if (existing) {
      throw new ConflictException('Ja existe uma conexao WhatsApp configurada.');
    }

    const instanceToken = this.generateInstanceToken();
    const webhookUrl = this.webhookUrl();
    const providerName = this.providerConnectionName(dto.name);
    const provisioned = await this.mapProviderError(() =>
      this.provider.provisionConnection({
        name: providerName,
        instanceToken,
        webhookUrl,
        events: providerEvents,
      }),
    );

    const connection = await this.prisma.whatsAppConnection.create({
      data: {
        name: dto.name.trim(),
        provider: 'KIRAGO',
        providerUserId: provisioned.providerUserId,
        providerTokenEncrypted: this.encryption.encrypt(instanceToken),
        status: 'DISCONNECTED',
        webhookConfigured: provisioned.webhookConfigured,
      },
    });

    return this.presentConnection(connection);
  }

  async connect() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTING' },
    });

    await this.mapProviderError(() => this.provider.connect(instanceToken));
    return this.refreshStatus(connection.id);
  }

  async refreshStatus(connectionId?: string) {
    const connection = connectionId
      ? await this.prisma.whatsAppConnection.findUnique({ where: { id: connectionId } })
      : await this.requireConnection();

    if (!connection) {
      throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }

    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const providerStatus = await this.mapProviderError(() =>
      this.provider.getStatus(instanceToken),
    );
    const status = this.mapStatus(providerStatus.connected, providerStatus.loggedIn);
    const connectedAt =
      status === 'CONNECTED' && !connection.connectedAt ? new Date() : connection.connectedAt;

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status,
        connected: providerStatus.connected,
        loggedIn: providerStatus.loggedIn,
        phone: providerStatus.phone ?? connection.phone,
        lastStatusAt: new Date(),
        connectedAt,
      },
    });

    return this.presentConnection(updated);
  }

  async getQrCode() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const qrCode = await this.mapProviderError(() => this.provider.getQrCode(instanceToken));

    if (!qrCode) {
      throw new BadRequestException('QR Code nao disponivel para esta conexao.');
    }

    return { qrCode };
  }

  async disconnect() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.mapProviderError(() => this.provider.disconnect(instanceToken));

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        connected: false,
        loggedIn: false,
        lastStatusAt: new Date(),
      },
    });

    return this.presentConnection(updated);
  }

  async logout() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    await this.mapProviderError(() => this.provider.logout(instanceToken));

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: 'DISCONNECTED',
        connected: false,
        loggedIn: false,
        connectedAt: null,
        lastStatusAt: new Date(),
      },
    });

    return this.presentConnection(updated);
  }

  async getWebhook() {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    return this.mapProviderError(() => this.provider.getWebhook(instanceToken));
  }

  async configureWebhook(dto: ConfigureWhatsAppWebhookDto = {}) {
    const connection = await this.requireConnection();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);
    const webhookUrl = dto.webhookUrl?.trim() || this.webhookUrl();
    const events = dto.events?.length ? dto.events : providerEvents;

    await this.mapProviderError(() =>
      this.provider.configureWebhook(instanceToken, webhookUrl, events),
    );

    const updated = await this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: { webhookConfigured: true },
    });

    return this.presentConnection(updated);
  }

  async sendManualMessage(dto: SendWhatsAppMessageDto, actorUserId: string) {
    const connection = await this.requireConnection();

    if (connection.status !== 'CONNECTED' || !connection.connected || !connection.loggedIn) {
      throw new ConflictException('Conexao WhatsApp nao esta operacional.');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });

    if (!client) {
      throw new NotFoundException('Cliente nao encontrado.');
    }

    if (!client.phoneNormalized) {
      throw new BadRequestException('Cliente nao possui telefone valido.');
    }

    const phone = normalizeBrazilPhone(client.phoneNormalized);
    const body = dto.body.trim();

    if (!body) {
      throw new BadRequestException('Mensagem obrigatoria.');
    }

    const requestId = dto.requestId?.trim() || randomUUID();
    const instanceToken = this.encryption.decrypt(connection.providerTokenEncrypted);

    const { dispatch, created } = await this.createPendingDispatch({
      clientId: client.id,
      connectionId: connection.id,
      phone,
      body,
      requestId,
    });

    if (!created || dispatch.status === 'SENT') {
      return this.presentDispatch(dispatch);
    }

    try {
      const result = await this.mapProviderError(() =>
        this.provider.sendText(instanceToken, { phone, body, requestId }),
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        const sent = await tx.messageDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: 'SENT',
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            errorMessage: null,
          },
          include: { client: true, whatsAppConnection: true },
        });

        await tx.clientEvent.create({
          data: {
            clientId: client.id,
            type: 'WHATSAPP_MESSAGE_SENT',
            title: 'Mensagem manual enviada pelo WhatsApp.',
            description: this.messagePreview(body),
            metadata: {
              messageDispatchId: sent.id,
              requestId,
            },
            createdByUserId: actorUserId,
          },
        });

        return sent;
      });

      return this.presentDispatch(updated);
    } catch (error) {
      const updated = await this.prisma.messageDispatch.update({
        where: { id: dispatch.id },
        data: {
          status: 'FAILED',
          errorMessage: this.sanitizeError(error),
        },
        include: { client: true, whatsAppConnection: true },
      });

      return this.presentDispatch(updated);
    }
  }

  async listMessages() {
    const messages = await this.prisma.messageDispatch.findMany({
      include: { client: true, whatsAppConnection: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return messages.map((message) => this.presentDispatch(message));
  }

  async providerHealth() {
    try {
      return await this.provider.health();
    } catch {
      return { online: false, version: null };
    }
  }

  receiveWebhook(payload: unknown) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload invalido.');
    }

    const event = this.extractWebhookEvent(payload as Record<string, unknown>);
    return {
      received: true,
      event,
    };
  }

  private async createPendingDispatch(input: {
    clientId: string;
    connectionId: string;
    phone: string;
    body: string;
    requestId: string;
  }) {
    try {
      const dispatch = await this.prisma.messageDispatch.create({
        data: {
          clientId: input.clientId,
          whatsAppConnectionId: input.connectionId,
          phone: input.phone,
          body: input.body,
          requestId: input.requestId,
          origin: 'MANUAL',
          status: 'PENDING',
        },
        include: { client: true, whatsAppConnection: true },
      });

      return { dispatch, created: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.messageDispatch.findUniqueOrThrow({
          where: { requestId: input.requestId },
          include: { client: true, whatsAppConnection: true },
        });
        return { dispatch: existing, created: false };
      }

      throw error;
    }
  }

  private findPrimaryConnection() {
    return this.prisma.whatsAppConnection.findFirst({ orderBy: { createdAt: 'asc' } });
  }

  private async requireConnection() {
    const connection = await this.findPrimaryConnection();

    if (!connection) {
      throw new NotFoundException('Conexao WhatsApp nao encontrada.');
    }

    return connection;
  }

  private generateInstanceToken() {
    return randomBytes(32).toString('base64url');
  }

  private webhookUrl() {
    const publicUrl = this.config.get<string>('CRM_API_PUBLIC_URL');

    if (!publicUrl) {
      throw new ServiceUnavailableException('CRM_API_PUBLIC_URL nao configurada.');
    }

    return new URL('/whatsapp/webhook/kirago', publicUrl).toString();
  }

  private providerConnectionName(name: string) {
    const slug = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `crm-novo-${slug || 'principal'}-${randomBytes(3).toString('hex')}`;
  }

  private mapStatus(connected: boolean, loggedIn: boolean): WhatsAppConnectionStatus {
    if (connected && loggedIn) return 'CONNECTED';
    if (connected && !loggedIn) return 'QR_REQUIRED';
    return 'DISCONNECTED';
  }

  private async mapProviderError<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof KiragoProviderError) {
        if (error.code === 'KIRAGO_TIMEOUT' || error.code === 'KIRAGO_UNAVAILABLE') {
          throw new ServiceUnavailableException(error.message);
        }

        if (
          error.code === 'KIRAGO_ADMIN_AUTH_FAILED' ||
          error.code === 'KIRAGO_INSTANCE_AUTH_FAILED'
        ) {
          throw new ServiceUnavailableException('Falha de autenticacao com provider WhatsApp.');
        }

        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  private presentConnection(connection: WhatsAppConnection) {
    return {
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      providerUserId: connection.providerUserId,
      phone: connection.phone,
      status: connection.status,
      connected: connection.connected,
      loggedIn: connection.loggedIn,
      webhookConfigured: connection.webhookConfigured,
      lastStatusAt: connection.lastStatusAt,
      connectedAt: connection.connectedAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private presentDispatch(
    dispatch: MessageDispatch & {
      client?: { id: string; name: string; reference: string } | null;
      whatsAppConnection?: { id: string; name: string; provider: string } | null;
    },
  ) {
    return {
      id: dispatch.id,
      clientId: dispatch.clientId,
      whatsAppConnectionId: dispatch.whatsAppConnectionId,
      phone: dispatch.phone,
      body: dispatch.body,
      origin: dispatch.origin,
      status: dispatch.status,
      requestId: dispatch.requestId,
      providerMessageId: dispatch.providerMessageId,
      errorMessage: dispatch.errorMessage,
      sentAt: dispatch.sentAt,
      createdAt: dispatch.createdAt,
      updatedAt: dispatch.updatedAt,
      client: dispatch.client
        ? {
            id: dispatch.client.id,
            name: dispatch.client.name,
            reference: dispatch.client.reference,
          }
        : null,
      connection: dispatch.whatsAppConnection
        ? {
            id: dispatch.whatsAppConnection.id,
            name: dispatch.whatsAppConnection.name,
            provider: dispatch.whatsAppConnection.provider,
          }
        : null,
    };
  }

  private messagePreview(body: string) {
    return body.length > messagePreviewLimit
      ? `${body.slice(0, messagePreviewLimit).trim()}...`
      : body;
  }

  private sanitizeError(error: unknown) {
    if (error instanceof Error) {
      return error.message.slice(0, 240);
    }

    return 'Falha ao enviar mensagem WhatsApp.';
  }

  private extractWebhookEvent(payload: Record<string, unknown>) {
    const event = payload.event ?? payload.Event ?? payload.type ?? payload.Type;
    return typeof event === 'string' ? event : 'unknown';
  }
}
