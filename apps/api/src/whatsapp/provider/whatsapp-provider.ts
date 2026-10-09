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
  reply?: {
    stanzaId: string;
    participant: string;
    quotedText?: string | null;
  };
};

export type SendTextResult = {
  providerMessageId: string | null;
};

export type SendImageInput = {
  phone: string;
  imageDataUrl: string;
  caption?: string | null;
  requestId: string;
};

export type SendImageResult = {
  providerMessageId: string | null;
};

export type SendDocumentInput = {
  phone: string;
  documentDataUrl: string;
  fileName: string;
  requestId: string;
};

export type SendDocumentResult = {
  providerMessageId: string | null;
};

export type SendAudioInput = {
  phone: string;
  audioDataUrl: string;
  mimeType: string;
  seconds?: number | null;
  ptt: boolean;
  requestId: string;
};

export type SendAudioResult = {
  providerMessageId: string | null;
};

export type SendVideoInput = {
  phone: string;
  videoDataUrl: string;
  caption?: string | null;
  mimeType: string;
  requestId: string;
};

export type SendVideoResult = {
  providerMessageId: string | null;
};

export type SendButtonsInput = {
  phone: string;
  title: string;
  body: string;
  buttons: Array<{
    name: string;
    buttonParamsJson: Record<string, unknown>;
  }>;
};

export type SendButtonsResult = {
  providerMessageId: string | null;
};

export type DownloadMediaType = 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';

export type DownloadMediaInput = {
  type: DownloadMediaType;
  Url: string;
  DirectPath?: string;
  MediaKey: string;
  Mimetype: string;
  FileEncSHA256?: string;
  FileSHA256: string;
  FileLength: number;
};

export type DownloadMediaResult = {
  dataUrl: string;
  mimetype: string;
};

export type MarkMessagesAsReadInput = {
  messageIds: string[];
  phone: string;
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
  sendImage(instanceToken: string, input: SendImageInput): Promise<SendImageResult>;
  sendDocument(instanceToken: string, input: SendDocumentInput): Promise<SendDocumentResult>;
  sendAudio(instanceToken: string, input: SendAudioInput): Promise<SendAudioResult>;
  sendVideo(instanceToken: string, input: SendVideoInput): Promise<SendVideoResult>;
  sendButtons(instanceToken: string, input: SendButtonsInput): Promise<SendButtonsResult>;
  downloadMedia(instanceToken: string, input: DownloadMediaInput): Promise<DownloadMediaResult>;
  markMessagesAsRead(instanceToken: string, input: MarkMessagesAsReadInput): Promise<void>;
  checkPhone(instanceToken: string, phone: string): Promise<unknown>;
  health(): Promise<{ online: boolean; version?: string | null }>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
