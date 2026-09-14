import { normalizeBrazilPhone } from '../../clients/utils/phone-normalizer';

export type NormalizedMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'live_location'
  | 'contact'
  | 'contacts'
  | 'reaction'
  | 'button_response'
  | 'list_response'
  | 'interactive_response'
  | 'unknown';

export type NormalizedWhatsAppMessage = {
  provider: 'KIRAGO';
  instanceName: string | null;
  providerUserId: string | null;
  phone: string | null;
  contactName: string | null;
  messageId: string | null;
  direction: 'INCOMING' | 'OUTGOING';
  messageType: NormalizedMessageType;
  text: string | null;
  messageTimestamp: Date | null;
  receivedAt: Date;
  isGroup: boolean;
  mediaMetadata: Record<string, unknown> | null;
};

type RecordValue = Record<string, unknown>;

const messageTypeMap: Record<string, NormalizedMessageType> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  liveLocationMessage: 'live_location',
  contactMessage: 'contact',
  contactsArrayMessage: 'contacts',
  reactionMessage: 'reaction',
  buttonsResponseMessage: 'button_response',
  templateButtonReplyMessage: 'button_response',
  listResponseMessage: 'list_response',
  interactiveResponseMessage: 'interactive_response',
};

export class KiragoWebhookNormalizer {
  normalize(payload: unknown, receivedAt = new Date()): NormalizedWhatsAppMessage | null {
    const body = asRecord(payload);

    if (!body || body.type !== 'Message') {
      return null;
    }

    const event = asRecord(body.event);
    const info = asRecord(event?.Info);
    const message = asRecord(event?.Message);
    const isGroup = this.isGroup(body, info);
    const direction = info?.IsFromMe === true ? 'OUTGOING' : 'INCOMING';
    const phone = isGroup ? null : this.extractPhone(body, info);
    const messageType = this.extractMessageType(message, info);

    return {
      provider: 'KIRAGO',
      instanceName: stringOrNull(body.instanceName),
      providerUserId: stringOrNull(body.userID),
      phone,
      contactName: stringOrNull(info?.PushName),
      messageId: stringOrNull(info?.ID),
      direction,
      messageType,
      text: this.extractText(message),
      messageTimestamp: this.parseTimestamp(info?.Timestamp),
      receivedAt,
      isGroup,
      mediaMetadata: this.extractMediaMetadata(message, messageType),
    };
  }

  private extractPhone(body: RecordValue, info: RecordValue | null) {
    const jid = asRecord(body.jid);
    const candidates = [
      asRecord(jid?.contact)?.pn,
      asRecord(jid?.chat)?.pn,
      asRecord(jid?.sender)?.pn,
      info?.SenderAlt,
    ];

    for (const candidate of candidates) {
      const normalized = this.tryNormalizeProviderPhone(candidate);

      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private tryNormalizeProviderPhone(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      return null;
    }

    const raw = value.trim();

    if (/@lid$/i.test(raw)) {
      return null;
    }

    const cleaned =
      raw
        .replace(/^mailto:/i, '')
        .replace(/@s\.whatsapp\.net$/i, '')
        .split(':')[0] ?? '';

    if (!/\d/.test(cleaned) || /@g\.us/i.test(cleaned)) {
      return null;
    }

    try {
      return normalizeBrazilPhone(cleaned);
    } catch {
      return null;
    }
  }

  private isGroup(body: RecordValue, info: RecordValue | null) {
    if (body.isGroup === true || info?.IsGroup === true) {
      return true;
    }

    const jid = asRecord(body.jid);
    const candidates = [
      asRecord(jid?.chat)?.raw,
      asRecord(jid?.chat)?.pn,
      asRecord(jid?.contact)?.jid,
      asRecord(jid?.sender)?.raw,
      info?.Chat,
      info?.Sender,
    ];

    return candidates.some(
      (candidate) => typeof candidate === 'string' && /@g\.us/i.test(candidate),
    );
  }

  private extractText(message: RecordValue | null) {
    const candidates = [
      message?.conversation,
      asRecord(message?.extendedTextMessage)?.text,
      asRecord(message?.imageMessage)?.caption,
      asRecord(message?.videoMessage)?.caption,
      asRecord(message?.documentMessage)?.caption,
      asRecord(message?.buttonsResponseMessage)?.selectedDisplayText,
      asRecord(message?.buttonsResponseMessage)?.selectedButtonId,
      asRecord(message?.templateButtonReplyMessage)?.selectedDisplayText,
      asRecord(message?.templateButtonReplyMessage)?.selectedId,
      asRecord(message?.listResponseMessage)?.title,
      asRecord(message?.listResponseMessage)?.description,
      asRecord(asRecord(message?.listResponseMessage)?.singleSelectReply)?.selectedRowId,
      asRecord(asRecord(message?.interactiveResponseMessage)?.body)?.text,
    ];

    for (const candidate of candidates) {
      const text = stringOrNull(candidate);

      if (text) {
        return text;
      }
    }

    return null;
  }

  private extractMessageType(
    message: RecordValue | null,
    info: RecordValue | null,
  ): NormalizedMessageType {
    if (message) {
      for (const [key, type] of Object.entries(messageTypeMap)) {
        if (message[key] !== undefined) {
          return type;
        }
      }
    }

    const infoType = stringOrNull(info?.Type)?.toLowerCase();

    if (!infoType) {
      return 'unknown';
    }

    if (infoType.includes('image')) return 'image';
    if (infoType.includes('video')) return 'video';
    if (infoType.includes('audio')) return 'audio';
    if (infoType.includes('document')) return 'document';
    if (infoType.includes('sticker')) return 'sticker';
    if (infoType.includes('location')) return 'location';
    if (infoType.includes('contact')) return 'contact';
    if (infoType.includes('reaction')) return 'reaction';
    if (infoType.includes('button')) return 'button_response';
    if (infoType.includes('list')) return 'list_response';
    if (infoType.includes('interactive')) return 'interactive_response';
    if (infoType.includes('text') || infoType.includes('conversation')) return 'text';

    return 'unknown';
  }

  private parseTimestamp(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value < 10_000_000_000 ? value * 1000 : value);
    }

    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      const date = Number.isFinite(numeric)
        ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
        : new Date(value);

      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private extractMediaMetadata(message: RecordValue | null, messageType: NormalizedMessageType) {
    const key = this.mediaKey(messageType);
    const source = key ? asRecord(message?.[key]) : null;

    if (!source) {
      return null;
    }

    const metadata: Record<string, unknown> = { kind: messageType };

    for (const [from, to] of [
      ['mimetype', 'mimetype'],
      ['fileLength', 'size'],
      ['seconds', 'seconds'],
      ['fileName', 'fileName'],
      ['caption', 'caption'],
    ] as const) {
      const value = source[from];

      if (typeof value === 'string' || typeof value === 'number') {
        metadata[to] = value;
      }
    }

    return Object.keys(metadata).length > 1 ? metadata : null;
  }

  private mediaKey(messageType: NormalizedMessageType) {
    if (messageType === 'image') return 'imageMessage';
    if (messageType === 'video') return 'videoMessage';
    if (messageType === 'audio') return 'audioMessage';
    if (messageType === 'document') return 'documentMessage';
    return null;
  }
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
