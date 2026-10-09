import { Inject, Injectable } from '@nestjs/common';
import { KiragoHttpClient } from './kirago-http.client';

type KiragoEnvelope<T> = {
  code?: number;
  data?: T;
  success?: boolean;
};

export type KiragoStatusData = {
  Connected?: boolean;
  LoggedIn?: boolean;
  connected?: boolean | string | number;
  loggedIn?: boolean | string | number;
  online?: boolean | string | number;
  ready?: boolean | string | number;
  status?: string;
  state?: string;
  Status?: string;
  State?: string;
  jid?: string;
  JID?: string;
  phone?: string;
  Phone?: string;
};

export type KiragoQrData = {
  QRCode?: string;
};

export type KiragoWebhookData = {
  webhook?: string;
  webhookurl?: string;
  WebhookURL?: string;
  events?: string[];
  Events?: string[];
  active?: boolean;
};

export type KiragoSendTextData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoSendImageData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoSendDocumentData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoSendAudioData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoSendVideoData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoSendButtonsData = {
  Details?: unknown;
  Id?: string;
  Timestamp?: string;
};

export type KiragoDownloadMediaPayload = {
  Url: string;
  DirectPath?: string;
  MediaKey: string;
  Mimetype: string;
  FileEncSHA256?: string;
  FileSHA256: string;
  FileLength: number;
};

export type KiragoDownloadMediaData = {
  Data?: string;
  Mimetype?: string;
};

export type KiragoMarkReadData = {
  Details?: unknown;
};

@Injectable()
export class KiragoInstanceClient {
  constructor(@Inject(KiragoHttpClient) private readonly http: KiragoHttpClient) {}

  connect(instanceToken: string, events: string[]) {
    return this.http.request<KiragoEnvelope<unknown>>('/session/connect', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { Subscribe: events, Immediate: true },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  disconnect(instanceToken: string) {
    return this.http.request<KiragoEnvelope<unknown>>('/session/disconnect', {
      method: 'POST',
      headers: { token: instanceToken },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  logout(instanceToken: string) {
    return this.http.request<KiragoEnvelope<unknown>>('/session/logout', {
      method: 'POST',
      headers: { token: instanceToken },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  status(instanceToken: string) {
    return this.http.request<KiragoEnvelope<KiragoStatusData>>('/session/status', {
      headers: { token: instanceToken },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  qr(instanceToken: string) {
    return this.http.request<KiragoEnvelope<KiragoQrData>>('/session/qr', {
      headers: { token: instanceToken },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  getWebhook(instanceToken: string) {
    return this.http.request<KiragoEnvelope<KiragoWebhookData>>('/webhook', {
      headers: { token: instanceToken },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  configureWebhook(instanceToken: string, webhook: string, events: string[]) {
    return this.http.request<KiragoEnvelope<KiragoWebhookData>>('/webhook', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { webhook, events, active: true },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendText(
    instanceToken: string,
    payload: {
      Phone: string;
      Body: string;
      Id: string;
      ContextInfo?: { StanzaId: string; Participant: string };
      QuotedText?: string;
    },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendTextData>>('/chat/send/text', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { ...payload, LinkPreview: false },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendImage(
    instanceToken: string,
    payload: { Phone: string; Image: string; Caption?: string; Id: string },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendImageData>>('/chat/send/image', {
      method: 'POST',
      headers: { token: instanceToken },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendDocument(
    instanceToken: string,
    payload: { Phone: string; Document: string; FileName: string; Id: string },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendDocumentData>>('/chat/send/document', {
      method: 'POST',
      headers: { token: instanceToken },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendAudio(
    instanceToken: string,
    payload: {
      Phone: string;
      Audio: string;
      Id: string;
      PTT: boolean;
      MimeType: string;
      Seconds?: number;
    },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendAudioData>>('/chat/send/audio', {
      method: 'POST',
      headers: { token: instanceToken },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendVideo(
    instanceToken: string,
    payload: { Phone: string; Video: string; Caption?: string; MimeType: string; Id: string },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendVideoData>>('/chat/send/video', {
      method: 'POST',
      headers: { token: instanceToken },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  sendButtons(
    instanceToken: string,
    payload: {
      phone: string;
      title: string;
      body: string;
      buttons: Array<{
        name: string;
        buttonParamsJson: Record<string, unknown>;
      }>;
    },
  ) {
    return this.http.request<KiragoEnvelope<KiragoSendButtonsData>>('/chat/send/buttons', {
      method: 'POST',
      headers: {
        Authorization: this.instanceBearer(instanceToken),
      },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  downloadImage(instanceToken: string, payload: KiragoDownloadMediaPayload) {
    return this.downloadMedia(instanceToken, '/chat/downloadimage', payload);
  }

  downloadDocument(instanceToken: string, payload: KiragoDownloadMediaPayload) {
    return this.downloadMedia(instanceToken, '/chat/downloaddocument', payload);
  }

  downloadAudio(instanceToken: string, payload: KiragoDownloadMediaPayload) {
    return this.downloadMedia(instanceToken, '/chat/downloadaudio', payload);
  }

  downloadVideo(instanceToken: string, payload: KiragoDownloadMediaPayload) {
    return this.downloadMedia(instanceToken, '/chat/downloadvideo', payload);
  }

  checkPhone(instanceToken: string, phone: string) {
    return this.http.request<KiragoEnvelope<unknown>>('/user/check', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { Phone: phone },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  markRead(
    instanceToken: string,
    payload: { Id: string[]; ChatPhone: string; SenderPhone: string },
  ) {
    return this.http.request<KiragoEnvelope<KiragoMarkReadData>>('/chat/markread', {
      method: 'POST',
      headers: {
        Authorization: this.instanceBearer(instanceToken),
      },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  private instanceBearer(instanceToken: string) {
    return instanceToken.toLowerCase().startsWith('bearer ')
      ? instanceToken
      : `Bearer ${instanceToken}`;
  }

  private downloadMedia(instanceToken: string, path: string, payload: KiragoDownloadMediaPayload) {
    return this.http.request<KiragoEnvelope<KiragoDownloadMediaData>>(path, {
      method: 'POST',
      headers: { token: instanceToken },
      body: payload,
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }
}
