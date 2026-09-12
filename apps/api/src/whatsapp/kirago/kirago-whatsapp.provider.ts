import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KiragoAdminClient } from './kirago-admin.client';
import { KiragoInstanceClient } from './kirago-instance.client';
import { KiragoHttpClient } from './kirago-http.client';
import { KiragoProviderError } from './kirago-provider.error';
import type {
  ProvisionConnectionInput,
  RemoteConnectionLookupInput,
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
      providerUserId: Array.isArray(response.data) ? null : (response.data?.id ?? null),
      webhookConfigured: Boolean(input.webhookUrl),
    };
  }

  async findRemoteConnection(input: RemoteConnectionLookupInput) {
    if (input.providerUserId) {
      try {
        const response = await this.adminClient.getUser(input.providerUserId);
        const user = Array.isArray(response.data) ? null : response.data;

        if (user?.id === input.providerUserId) {
          return { exists: true };
        }
      } catch (error) {
        if (!(error instanceof KiragoProviderError) || error.code !== 'KIRAGO_RESOURCE_NOT_FOUND') {
          throw error;
        }
      }
    }

    const response = await this.adminClient.listUsers();
    const users = Array.isArray(response.data)
      ? response.data
      : response.data
        ? [response.data]
        : [];
    const exists = users.some(
      (user) =>
        (input.providerUserId ? user.id === input.providerUserId : false) ||
        user.name === input.instanceName,
    );

    return { exists };
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
    const data = response.data;
    const statusValue = this.stringValue(
      data?.status ?? data?.Status ?? data?.state ?? data?.State,
    );
    const connected =
      this.booleanValue(data?.Connected) ??
      this.booleanValue(data?.connected) ??
      this.booleanValue(data?.online) ??
      this.booleanValue(data?.ready) ??
      this.connectedByStatus(statusValue);
    const loggedIn =
      this.booleanValue(data?.LoggedIn) ??
      this.booleanValue(data?.loggedIn) ??
      this.loggedInByStatus(statusValue) ??
      connected;

    return {
      connected,
      loggedIn,
      phone: this.phoneFromStatus(data),
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

  private booleanValue(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    if (
      ['true', '1', 'yes', 'online', 'ready', 'connected', 'loggedin', 'logged_in'].includes(
        normalized,
      )
    ) {
      return true;
    }
    if (['false', '0', 'no', 'offline', 'disconnected', 'qr', 'qr_required'].includes(normalized)) {
      return false;
    }

    return null;
  }

  private connectedByStatus(status: string | null) {
    if (!status) return false;
    return [
      'connected',
      'online',
      'ready',
      'open',
      'authenticated',
      'loggedin',
      'logged_in',
    ].includes(status);
  }

  private loggedInByStatus(status: string | null) {
    if (!status) return null;
    if (
      ['connected', 'online', 'ready', 'open', 'authenticated', 'loggedin', 'logged_in'].includes(
        status,
      )
    ) {
      return true;
    }
    if (['qr', 'qrcode', 'qr_required', 'connecting', 'disconnected', 'offline'].includes(status)) {
      return false;
    }
    return null;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : null;
  }

  private phoneFromStatus(
    data: { phone?: string; Phone?: string; jid?: string; JID?: string } | undefined,
  ) {
    const phone = data?.phone ?? data?.Phone;
    if (phone) return phone;

    const jid = data?.jid ?? data?.JID;
    return jid?.split('@')[0] || null;
  }
}
