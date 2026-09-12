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
  Details?: string;
  Id?: string;
  Timestamp?: string;
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

  sendText(instanceToken: string, payload: { Phone: string; Body: string; Id: string }) {
    return this.http.request<KiragoEnvelope<KiragoSendTextData>>('/chat/send/text', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { ...payload, LinkPreview: false },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }

  checkPhone(instanceToken: string, phone: string) {
    return this.http.request<KiragoEnvelope<unknown>>('/user/check', {
      method: 'POST',
      headers: { token: instanceToken },
      body: { Phone: phone },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  }
}
