export type ProviderStatus = {
  connected: boolean;
  loggedIn: boolean;
  phone?: string | null;
};

export type ProvisionConnectionInput = {
  name: string;
  instanceToken: string;
  webhookUrl: string;
  events: string[];
};

export type ProvisionConnectionResult = {
  providerUserId: string | null;
  webhookConfigured: boolean;
};

export type RemoteConnectionLookupInput = {
  providerUserId: string | null;
  instanceName: string;
};

export type RemoteConnectionLookupResult = {
  exists: boolean;
};

export type SendTextInput = {
  phone: string;
  body: string;
  requestId: string;
};

export type SendTextResult = {
  providerMessageId: string | null;
};

export interface WhatsAppProvider {
  provisionConnection(input: ProvisionConnectionInput): Promise<ProvisionConnectionResult>;
  findRemoteConnection(input: RemoteConnectionLookupInput): Promise<RemoteConnectionLookupResult>;
  connect(instanceToken: string): Promise<void>;
  disconnect(instanceToken: string): Promise<void>;
  logout(instanceToken: string): Promise<void>;
  getStatus(instanceToken: string): Promise<ProviderStatus>;
  getQrCode(instanceToken: string): Promise<string | null>;
  getWebhook(instanceToken: string): Promise<unknown>;
  configureWebhook(instanceToken: string, webhookUrl: string, events: string[]): Promise<void>;
  sendText(instanceToken: string, input: SendTextInput): Promise<SendTextResult>;
  checkPhone(instanceToken: string, phone: string): Promise<unknown>;
  health(): Promise<{ online: boolean; version?: string | null }>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
