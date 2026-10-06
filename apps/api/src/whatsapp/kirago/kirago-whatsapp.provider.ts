import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { KiragoAdminClient } from './kirago-admin.client';
import { KiragoInstanceClient } from './kirago-instance.client';
import { KiragoHttpClient } from './kirago-http.client';
import { KiragoProviderError } from './kirago-provider.error';
import type {
  DownloadMediaInput,
  ProvisionConnectionInput,
  RemoteConnectionLookupInput,
  SendButtonsInput,
  SendDocumentInput,
  SendImageInput,
  SendAudioInput,
  SendTextInput,
  WhatsAppProvider,
} from '../provider/whatsapp-provider';

const defaultEvents = ['Message'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class KiragoWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger(KiragoWhatsAppProvider.name);

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
      Id: this.kiragoMessageId(input.requestId),
    });

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  async sendImage(instanceToken: string, input: SendImageInput) {
    const caption = input.caption?.trim();
    const response = await this.instanceClient.sendImage(instanceToken, {
      Phone: input.phone,
      Image: input.imageDataUrl,
      ...(caption ? { Caption: caption } : {}),
      Id: this.kiragoMessageId(input.requestId),
    });

    this.logMediaSendDebug('IMAGE', response);

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  async sendDocument(instanceToken: string, input: SendDocumentInput) {
    const response = await this.instanceClient.sendDocument(instanceToken, {
      Phone: input.phone,
      Document: input.documentDataUrl,
      FileName: input.fileName,
      Id: this.kiragoMessageId(input.requestId),
    });

    this.logMediaSendDebug('DOCUMENT', response);

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  async sendAudio(instanceToken: string, input: SendAudioInput) {
    const response = await this.instanceClient.sendAudio(instanceToken, {
      Phone: input.phone,
      Audio: input.audioDataUrl,
      Id: this.kiragoMessageId(input.requestId),
      PTT: input.ptt,
      MimeType: input.mimeType,
      ...(typeof input.seconds === 'number' ? { Seconds: input.seconds } : {}),
    });

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  async sendButtons(instanceToken: string, input: SendButtonsInput) {
    const response = await this.instanceClient.sendButtons(instanceToken, {
      phone: input.phone,
      title: input.title,
      body: input.body,
      buttons: input.buttons,
    });

    return {
      providerMessageId: response.data?.Id ?? null,
    };
  }

  async downloadMedia(instanceToken: string, input: DownloadMediaInput) {
    const payload = {
      Url: input.Url,
      ...(input.DirectPath ? { DirectPath: input.DirectPath } : {}),
      MediaKey: input.MediaKey,
      Mimetype: input.Mimetype,
      ...(input.FileEncSHA256 ? { FileEncSHA256: input.FileEncSHA256 } : {}),
      FileSHA256: input.FileSHA256,
      FileLength: input.FileLength,
    };
    const response =
      input.type === 'IMAGE'
        ? await this.instanceClient.downloadImage(instanceToken, payload)
        : input.type === 'DOCUMENT'
          ? await this.instanceClient.downloadDocument(instanceToken, payload)
          : input.type === 'AUDIO'
            ? await this.instanceClient.downloadAudio(instanceToken, payload)
            : await this.instanceClient.downloadVideo(instanceToken, payload);

    return {
      dataUrl: response.data?.Data ?? '',
      mimetype: response.data?.Mimetype ?? input.Mimetype,
    };
  }

  private kiragoMessageId(requestId: string) {
    if (uuidPattern.test(requestId)) {
      return requestId;
    }

    const hash = createHash('sha256').update(requestId).digest('hex');
    const variant = ((Number.parseInt(hash[16] ?? '0', 16) & 0x3) | 0x8).toString(16);

    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      `4${hash.slice(13, 16)}`,
      `${variant}${hash.slice(17, 20)}`,
      hash.slice(20, 32),
    ].join('-');
  }

  private logMediaSendDebug(kind: 'IMAGE' | 'DOCUMENT', response: unknown) {
    if (this.config.get<string>('WHATSAPP_MEDIA_SEND_DEBUG') !== 'true') {
      return;
    }

    this.logger.log(
      `[WHATSAPP_MEDIA_SEND_DEBUG] ${JSON.stringify(this.buildMediaSendDebugPayload(kind, response))}`,
    );
  }

  private buildMediaSendDebugPayload(kind: 'IMAGE' | 'DOCUMENT', response: unknown) {
    const envelope = this.asRecord(response);
    const data = this.asRecord(envelope?.data);
    const details = data?.Details;
    const detailsRecord = this.asRecord(details);
    const parsedDetails = this.parseDetailsJson(details);
    const parsedDetailsRecord = this.asRecord(parsedDetails.value);
    const metadataSources = [
      parsedDetailsRecord,
      this.asRecord(parsedDetailsRecord?.data),
      this.asRecord(parsedDetailsRecord?.message),
      this.asRecord(parsedDetailsRecord?.media),
      detailsRecord,
      data,
    ];

    return {
      kind,
      envelopeKeys: this.safeObjectKeys(envelope),
      dataKeys: this.safeObjectKeys(data),
      detailsType: this.valueType(details),
      detailsKeys: this.safeObjectKeys(detailsRecord),
      ...(typeof details === 'string'
        ? {
            detailsLength: details.length,
            detailsJsonParsable: parsedDetails.parsable,
            parsedDetailsType: parsedDetails.parsable ? this.valueType(parsedDetails.value) : null,
            parsedDetailsKeys: this.safeObjectKeys(parsedDetailsRecord),
            parsedDetailsNestedKeys: this.knownNestedObjectKeys(parsedDetailsRecord),
          }
        : {}),
      hasUrl: this.hasAnyOwnValueIn(metadataSources, ['Url', 'URL', 'url']),
      hasDirectPath: this.hasAnyOwnValueIn(metadataSources, ['DirectPath', 'directPath']),
      hasMediaKey: this.hasAnyOwnValueIn(metadataSources, ['MediaKey', 'mediaKey']),
      hasMimetype: this.hasAnyOwnValueIn(metadataSources, ['Mimetype', 'mimetype']),
      hasFileSHA256: this.hasAnyOwnValueIn(metadataSources, ['FileSHA256', 'fileSHA256']),
      hasFileEncSHA256: this.hasAnyOwnValueIn(metadataSources, ['FileEncSHA256', 'fileEncSHA256']),
      hasFileLength: this.hasAnyOwnValueIn(metadataSources, ['FileLength', 'fileLength']),
      hasId: this.hasAnyOwnValueIn(metadataSources, ['Id', 'id']),
      hasTimestamp: this.hasAnyOwnValueIn(metadataSources, ['Timestamp', 'timestamp']),
    };
  }

  private parseDetailsJson(details: unknown): { parsable: boolean; value: unknown } {
    if (typeof details !== 'string') {
      return { parsable: false, value: null };
    }

    try {
      return { parsable: true, value: JSON.parse(details) as unknown };
    } catch {
      return { parsable: false, value: null };
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private safeObjectKeys(value: Record<string, unknown> | null) {
    if (!value) {
      return [];
    }

    return Object.keys(value)
      .map((key) => (/authorization|cookies?|token/i.test(key) ? '[redacted-key]' : key))
      .sort();
  }

  private valueType(value: unknown) {
    if (value === null) {
      return 'null';
    }

    if (Array.isArray(value)) {
      return 'array';
    }

    return typeof value;
  }

  private knownNestedObjectKeys(value: Record<string, unknown> | null) {
    const nested: Record<string, string[]> = {};

    for (const key of ['data', 'message', 'media'] as const) {
      const record = this.asRecord(value?.[key]);

      if (record) {
        nested[key] = this.safeObjectKeys(record);
      }
    }

    return nested;
  }

  private hasAnyOwnValueIn(
    sources: Array<Record<string, unknown> | null>,
    keys: readonly string[],
  ) {
    return sources.some((source) => this.hasAnyOwnValue(source, keys));
  }

  private hasAnyOwnValue(source: Record<string, unknown> | null, keys: readonly string[]) {
    if (!source) {
      return false;
    }

    return keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
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
