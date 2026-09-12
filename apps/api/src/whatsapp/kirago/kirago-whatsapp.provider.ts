import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KiragoAdminClient } from './kirago-admin.client';
import { KiragoInstanceClient } from './kirago-instance.client';
import { KiragoHttpClient } from './kirago-http.client';
import type {
  ProvisionConnectionInput,
  SendTextInput,
  WhatsAppProvider,
} from '../provider/whatsapp-provider';

const defaultEvents = ['Message'];

@Injectable()
export class KiragoWhatsAppProvider implements WhatsAppProvider {
  constructor(
    @Inject(KiragoAdminClient)
    private readonly adminClient: KiragoAdminClient,
    @Inject(KiragoInstanceClient)
    private readonly instanceClient: KiragoInstanceClient,
    @Inject(KiragoHttpClient)
    private readonly http: KiragoHttpClient,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async provisionConnection(input: ProvisionConnectionInput) {
    const response = await this.adminClient.createUser({
      name: input.name,
      token: input.instanceToken,
      webhook: input.webhookUrl,
      events: input.events[0] ?? 'Message',
    });

    return {
      providerUserId: response.data?.id ?? null,
      webhookConfigured: Boolean(input.webhookUrl),
    };
  }

  async connect(instanceToken: string) {
    await this.instanceClient.connect(instanceToken, defaultEvents);
  }

  async disconnect(instanceToken: string) {
    await this.instanceClient.disconnect(instanceToken);
  }

  async logout(instanceToken: string) {
    await this.instanceClient.logout(instanceToken);
  }

  async getStatus(instanceToken: string) {
    const response = await this.instanceClient.status(instanceToken);
    return {
      connected: Boolean(response.data?.Connected),
      loggedIn: Boolean(response.data?.LoggedIn),
      phone: null,
    };
  }

  async getQrCode(instanceToken: string) {
    const response = await this.instanceClient.qr(instanceToken);
    return response.data?.QRCode || null;
  }

  getWebhook(instanceToken: string) {
    return this.instanceClient.getWebhook(instanceToken);
  }

  async configureWebhook(instanceToken: string, webhookUrl: string, events: string[]) {
    await this.instanceClient.configureWebhook(instanceToken, webhookUrl, events);
  }

  async sendText(instanceToken: string, input: SendTextInput) {
    const response = await this.instanceClient.sendText(instanceToken, {
      Phone: input.phone,
      Body: input.body,
      Id: input.requestId,
    });

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  checkPhone(instanceToken: string, phone: string) {
    return this.instanceClient.checkPhone(instanceToken, phone);
  }

  async health() {
    const baseUrl = this.config.get<string>('KIRAGO_BASE_URL');

    if (!baseUrl) {
      return { online: false };
    }

    const response = await this.http.request<{ status?: string; version?: string }>('/health', {
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });

    return {
      online: response.status === 'ok',
      version: response.version ?? null,
    };
  }
}
