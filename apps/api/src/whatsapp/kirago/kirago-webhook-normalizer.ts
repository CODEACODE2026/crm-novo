import { normalizePhone } from '../../common/phone/phone-normalizer';
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

export type NormalizedMediaDownloadMetadata = {
  Url: string;
  DirectPath?: string;
  MediaKey: string;
  Mimetype: string;
  FileEncSHA256?: string;
  FileSHA256: string;
  FileLength: number;
};

export type NormalizedReplyContext = {
  providerMessageId: string;
  participant: string | null;
  quotedText: string | null;
};

export type NormalizedProviderJids = {
  lids: string[];
};

export type NormalizedWhatsAppContact = {
  displayName: string | null;
  phones: string[];
  vcard: string | null;
};

export type NormalizedWhatsAppMessage = {
  kind: 'MESSAGE';
  provider: 'KIRAGO';
  instanceName: string | null;
  providerUserId: string | null;
  phone: string | null;
  phoneE164?: string | null;
  phoneCountry?: string | null;
  contactName: string | null;
  messageId: string | null;
  direction: 'INCOMING' | 'OUTGOING';
  messageType: NormalizedMessageType;
  text: string | null;
  messageTimestamp: Date | null;
  receivedAt: Date;
  isGroup: boolean;
  mediaMetadata: Record<string, unknown> | null;
  mediaDownloadMetadata: NormalizedMediaDownloadMetadata | null;
  replyContext: NormalizedReplyContext | null;
  providerJids: NormalizedProviderJids | null;
  contacts?: NormalizedWhatsAppContact[] | null;
};

export type NormalizedWhatsAppReceipt = {
  kind: 'MESSAGE_RECEIPT';
  provider: 'KIRAGO';
  instanceName: string | null;
  providerUserId: string | null;
  state: 'DELIVERED' | 'READ' | null;
  rawState: string | null;
  providerMessageIds: string[];
  timestamp: Date | null;
  receivedAt: Date;
};

export type NormalizedWhatsAppChatPresence = {
  kind: 'CHAT_PRESENCE';
  provider: 'KIRAGO';
  instanceName: string | null;
  providerUserId: string | null;
  state: string | null;
  media: string | null;
  isFromMe: boolean;
  isGroup: boolean;
  chat: string | null;
  sender: string | null;
  senderAlt: string | null;
  recipientAlt: string | null;
  addressingMode: string | null;
  receivedAt: Date;
};

export type NormalizedKiragoWebhook =
  | NormalizedWhatsAppMessage
  | (NormalizedWhatsAppReceipt & Partial<Omit<NormalizedWhatsAppMessage, 'kind'>>)
  | (NormalizedWhatsAppChatPresence & Partial<Omit<NormalizedWhatsAppMessage, 'kind'>>);

type RecordValue = Record<string, unknown>;

const messageTypeMap: Record<string, NormalizedMessageType> = {
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
  extendedTextMessage: 'text',
  conversation: 'text',
};

const structuredMessageKeys = Object.keys(messageTypeMap).filter(
  (key) => key !== 'extendedTextMessage' && key !== 'conversation',
);

const maxContactCount = 50;
const maxContactPhones = 10;
const maxContactNameLength = 200;
const maxContactPhoneLength = 80;
const maxVcardLength = 64 * 1024;

export class KiragoWebhookNormalizer {
  normalize(payload: unknown, receivedAt = new Date()): NormalizedKiragoWebhook | null {
    const body = asRecord(payload);

    if (!body) {
      return null;
    }

    if (body.type === 'ReadReceipt') {
      return this.normalizeReceipt(body, receivedAt);
    }

    if (body.type === 'ChatPresence') {
      return this.normalizeChatPresence(body, receivedAt);
    }

    if (body.type !== 'Message') {
      return null;
    }

    const event = asRecord(body.event);
    const info = asRecord(event?.Info);
    const message = this.unwrapMessageContent(asRecord(event?.Message));
    const isGroup = this.isGroup(body, info);
    const direction = info?.IsFromMe === true ? 'OUTGOING' : 'INCOMING';
    const phoneIdentity = isGroup ? null : this.extractPhoneIdentity(body, info);
    const messageType = this.extractMessageType(message, info);
    const contacts = this.extractContacts(message, messageType);

    return {
      kind: 'MESSAGE',
      provider: 'KIRAGO',
      instanceName: stringOrNull(body.instanceName),
      providerUserId: stringOrNull(body.userID),
      phone: phoneIdentity?.phone ?? null,
      phoneE164: phoneIdentity?.phoneE164 ?? null,
      phoneCountry: phoneIdentity?.country ?? null,
      contactName: this.extractTrustedContactName(body, info, direction),
      messageId: stringOrNull(info?.ID),
      direction,
      messageType,
      text: this.extractText(message, messageType),
      messageTimestamp: this.parseTimestamp(info?.Timestamp),
      receivedAt,
      isGroup,
      mediaMetadata:
        contacts === null
          ? this.extractMediaMetadata(message, messageType)
          : { kind: messageType, contacts },
      mediaDownloadMetadata: this.extractMediaDownloadMetadata(message, messageType),
      replyContext: this.extractReplyContext(message, messageType),
      providerJids: this.extractProviderJids(body, info),
      contacts,
    };
  }

  private extractContacts(
    message: RecordValue | null,
    messageType: NormalizedMessageType,
  ): NormalizedWhatsAppContact[] | null {
    if (messageType !== 'contact' && messageType !== 'contacts') {
      return null;
    }

    const source =
      messageType === 'contact'
        ? asRecord(message?.contactMessage)
        : asRecord(message?.contactsArrayMessage);
    if (!source) {
      return [];
    }

    const entries =
      messageType === 'contacts'
        ? arrayOrEmpty(firstOwnValue(source, ['contacts', 'Contacts'])).slice(0, maxContactCount)
        : [source];

    return entries.map((entry) => this.normalizeContact(asRecord(entry) ?? {}));
  }

  private unwrapMessageContent(message: RecordValue | null) {
    let current = message;
    const wrappers = [
      'documentWithCaptionMessage',
      'ephemeralMessage',
      'viewOnceMessage',
      'viewOnceMessageV2',
      'viewOnceMessageV2Extension',
    ] as const;

    for (let depth = 0; current && depth < wrappers.length; depth += 1) {
      if (structuredMessageKeys.some((key) => current?.[key] !== undefined)) {
        return current;
      }

      let nested: RecordValue | null = null;

      for (const wrapper of wrappers) {
        const wrapperValue = asRecord(current[wrapper]);
        const candidate = asRecord(wrapperValue?.message) ?? asRecord(wrapperValue?.Message);

        if (candidate) {
          nested = candidate;
          break;
        }
      }

      if (!nested) {
        return current;
      }

      current = nested;
    }

    return current;
  }

  private normalizeContact(source: RecordValue): NormalizedWhatsAppContact {
    const vcard = limitedString(firstOwnValue(source, ['vcard', 'Vcard', 'VCard']), maxVcardLength);
    const parsed = this.parseVcard(vcard);
    const explicitName = limitedString(
      firstOwnValue(source, ['displayName', 'DisplayName', 'name', 'Name']),
      maxContactNameLength,
    );

    return {
      displayName: explicitName ?? parsed.displayName,
      phones: parsed.phones,
      vcard,
    };
  }

  private parseVcard(
    vcard: string | null,
  ): Pick<NormalizedWhatsAppContact, 'displayName' | 'phones'> {
    if (!vcard) {
      return { displayName: null, phones: [] };
    }

    const unfolded = vcard.replace(/=\r?\n/g, '').replace(/\r?\n[ \t]/g, '');
    const lines = unfolded.split(/\r?\n/);
    let formattedName: string | null = null;
    let structuredName: string | null = null;
    const phones: string[] = [];

    for (const line of lines) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const header = line.slice(0, separator);
      const propertyWithGroup = header.split(';', 1)[0]?.trim();
      const property = propertyWithGroup?.replace(/^[a-z0-9-]+\./i, '').toUpperCase();
      const value = decodeVcardText(
        line.slice(separator + 1),
        /(?:^|;)ENCODING=QUOTED-PRINTABLE(?:;|$)/i.test(header),
      );

      if (property === 'FN' && !formattedName) {
        formattedName = limitedString(value, maxContactNameLength);
      } else if (property === 'N' && !structuredName) {
        const [family, given, additional, prefix, suffix] = value
          .split(';', 5)
          .map((part) => part.trim());
        structuredName = limitedString(
          [prefix, given, additional, family, suffix].filter(Boolean).join(' '),
          maxContactNameLength,
        );
      } else if (property === 'TEL' && phones.length < maxContactPhones) {
        const phone = limitedString(value.replace(/^tel:/i, ''), maxContactPhoneLength);
        if (phone && !phones.includes(phone)) phones.push(phone);
      }
    }

    return { displayName: formattedName ?? structuredName, phones };
  }

  private normalizeReceipt(body: RecordValue, receivedAt: Date): NormalizedWhatsAppReceipt {
    const event = asRecord(body.event);
    const rawState = stringOrNull(body.state);

    return {
      kind: 'MESSAGE_RECEIPT',
      provider: 'KIRAGO',
      instanceName: stringOrNull(body.instanceName),
      providerUserId: stringOrNull(body.userID),
      state: this.mapReceiptState(rawState),
      rawState,
      providerMessageIds: this.extractReceiptMessageIds(event?.MessageIDs),
      timestamp: this.parseTimestamp(event?.Timestamp),
      receivedAt,
    };
  }

  private mapReceiptState(state: string | null): NormalizedWhatsAppReceipt['state'] {
    const normalized = state?.trim().toLowerCase();

    if (normalized === 'delivered') {
      return 'DELIVERED';
    }

    if (normalized === 'read') {
      return 'READ';
    }

    return null;
  }

  private normalizeChatPresence(
    body: RecordValue,
    receivedAt: Date,
  ): NormalizedWhatsAppChatPresence {
    const event = asRecord(body.event);

    return {
      kind: 'CHAT_PRESENCE',
      provider: 'KIRAGO',
      instanceName: stringOrNull(body.instanceName),
      providerUserId: stringOrNull(body.userID),
      state: normalizeLowerString(event?.State),
      media: normalizeLowerString(event?.Media),
      isFromMe: event?.IsFromMe === true,
      isGroup: event?.IsGroup === true,
      chat: stringOrNull(event?.Chat),
      sender: stringOrNull(event?.Sender),
      senderAlt: stringOrNull(event?.SenderAlt),
      recipientAlt: stringOrNull(event?.RecipientAlt),
      addressingMode: stringOrNull(event?.AddressingMode),
      receivedAt,
    };
  }

  private extractReceiptMessageIds(value: unknown) {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    const ids = values.flatMap((item) => this.extractReceiptMessageIdCandidates(item));

    return [...new Set(ids)];
  }

  private extractReceiptMessageIdCandidates(value: unknown): string[] {
    const scalar = stringOrNull(value);

    if (scalar) {
      return [scalar];
    }

    const record = asRecord(value);

    if (!record) {
      return [];
    }

    return ['id', 'Id', 'ID', 'messageId', 'MessageId', 'messageID', 'key', 'Key']
      .map((key) => stringOrNull(record[key]))
      .filter((item): item is string => Boolean(item));
  }

  private extractTrustedContactName(
    body: RecordValue,
    info: RecordValue | null,
    direction: NormalizedWhatsAppMessage['direction'],
  ) {
    if (direction !== 'INCOMING') {
      return null;
    }

    const technicalNames = new Set(
      [body.instanceName, body.userID]
        .map((value) => stringOrNull(value))
        .filter((value): value is string => Boolean(value)),
    );
    const candidates = [
      info?.PushName,
      info?.pushName,
      info?.NotifyName,
      info?.notifyName,
      info?.SenderName,
      info?.senderName,
      info?.Name,
      info?.name,
    ];

    for (const candidate of candidates) {
      const name = stringOrNull(candidate);

      if (name && !technicalNames.has(name)) {
        return name;
      }
    }

    return null;
  }

  private extractPhoneIdentity(body: RecordValue, info: RecordValue | null) {
    const jid = asRecord(body.jid);
    const candidates = [
      asRecord(jid?.contact)?.pn,
      asRecord(jid?.chat)?.pn,
      info?.Chat,
      info?.SenderAlt,
      asRecord(jid?.sender)?.pn,
      info?.Sender,
    ];

    for (const candidate of candidates) {
      const normalized = this.tryNormalizeProviderPhone(candidate);

      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private extractProviderJids(
    body: RecordValue,
    info: RecordValue | null,
  ): NormalizedProviderJids | null {
    const jid = asRecord(body.jid);
    const lids = this.uniqueJids([
      asRecord(jid?.chat)?.lid,
      asRecord(jid?.contact)?.lid,
      asRecord(jid?.sender)?.lid,
      asRecord(jid?.chat)?.raw,
      asRecord(jid?.contact)?.jid,
      asRecord(jid?.sender)?.raw,
      info?.Chat,
      info?.Sender,
    ]);

    return lids.length ? { lids } : null;
  }

  private uniqueJids(values: unknown[]) {
    const seen = new Set<string>();

    for (const value of values) {
      const jid = this.normalizeLidJid(value);
      if (jid) {
        seen.add(jid);
      }
    }

    return [...seen];
  }

  private normalizeLidJid(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const raw = value.trim().toLowerCase();
    return raw && /@lid$/i.test(raw) ? raw : null;
  }

  private tryNormalizeProviderPhone(value: unknown): {
    phone: string;
    phoneE164: string | null;
    country: string | null;
  } | null {
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

    const digits = cleaned.replace(/\D/g, '');
    const explicit = normalizePhone(cleaned.startsWith('+') ? cleaned : `+${digits}`);

    if (explicit.status === 'valid') {
      return {
        phone: explicit.digits,
        phoneE164: explicit.e164,
        country: explicit.country,
      };
    }

    // KiraGo still emits the historical Brazilian eight/nine-digit variants.
    // Keep that compatibility only when the provider identity explicitly carries DDI 55.
    if (!digits.startsWith('55')) {
      return null;
    }

    try {
      const phone = normalizeBrazilPhone(digits);
      return { phone, phoneE164: `+${phone}`, country: 'BR' };
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

  private extractText(message: RecordValue | null, messageType: NormalizedMessageType) {
    const candidates =
      messageType === 'image'
        ? [firstOwnValue(asRecord(message?.imageMessage) ?? {}, ['caption', 'Caption'])]
        : messageType === 'video'
          ? [firstOwnValue(asRecord(message?.videoMessage) ?? {}, ['caption', 'Caption'])]
          : messageType === 'document'
            ? [firstOwnValue(asRecord(message?.documentMessage) ?? {}, ['caption', 'Caption'])]
            : messageType === 'audio' || messageType === 'sticker'
              ? []
              : [
                  message?.conversation,
                  asRecord(message?.extendedTextMessage)?.text,
                  asRecord(message?.buttonsResponseMessage)?.selectedDisplayText,
                  asRecord(message?.buttonsResponseMessage)?.selectedButtonId,
                  asRecord(message?.templateButtonReplyMessage)?.selectedDisplayText,
                  asRecord(message?.templateButtonReplyMessage)?.selectedId,
                  asRecord(message?.listResponseMessage)?.title,
                  asRecord(message?.listResponseMessage)?.description,
                  asRecord(asRecord(message?.listResponseMessage)?.singleSelectReply)
                    ?.selectedRowId,
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
    if (infoType.includes('contactsarray') || infoType.includes('contacts_array'))
      return 'contacts';
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

    for (const [keys, to] of [
      [['mimetype', 'Mimetype'], 'mimetype'],
      [['fileLength', 'FileLength'], 'size'],
      [['seconds', 'Seconds'], 'seconds'],
      [['fileName', 'FileName'], 'fileName'],
      [['caption', 'Caption'], 'caption'],
    ] as const) {
      const value = firstOwnValue(source, keys);

      if (typeof value === 'string' || typeof value === 'number') {
        metadata[to] = value;
      }
    }

    return Object.keys(metadata).length > 1 ? metadata : null;
  }

  private extractMediaDownloadMetadata(
    message: RecordValue | null,
    messageType: NormalizedMessageType,
  ): NormalizedMediaDownloadMetadata | null {
    const key = this.mediaKey(messageType);
    const source = key ? asRecord(message?.[key]) : null;

    if (!source) {
      return null;
    }

    const Url = stringOrNull(firstOwnValue(source, ['url', 'Url', 'URL']));
    const MediaKey = stringOrNull(firstOwnValue(source, ['mediaKey', 'MediaKey']));
    const Mimetype = stringOrNull(firstOwnValue(source, ['mimetype', 'Mimetype']));
    const FileSHA256 = stringOrNull(firstOwnValue(source, ['fileSHA256', 'FileSHA256']));
    const FileLength = numberOrNull(firstOwnValue(source, ['fileLength', 'FileLength']));

    if (!Url || !MediaKey || !Mimetype || !FileSHA256 || FileLength === null) {
      return null;
    }

    const DirectPath = stringOrNull(firstOwnValue(source, ['directPath', 'DirectPath']));
    const FileEncSHA256 = stringOrNull(firstOwnValue(source, ['fileEncSHA256', 'FileEncSHA256']));

    return {
      Url,
      ...(DirectPath ? { DirectPath } : {}),
      MediaKey,
      Mimetype,
      ...(FileEncSHA256 ? { FileEncSHA256 } : {}),
      FileSHA256,
      FileLength,
    };
  }

  private extractReplyContext(
    message: RecordValue | null,
    messageType: NormalizedMessageType,
  ): NormalizedReplyContext | null {
    const context = this.extractContextInfo(message, messageType);

    if (!context) {
      return null;
    }

    const providerMessageId = stringOrNull(
      firstOwnValue(context, ['stanzaId', 'StanzaId', 'stanzaID', 'StanzaID']),
    );

    if (!providerMessageId) {
      return null;
    }

    return {
      providerMessageId,
      participant: stringOrNull(firstOwnValue(context, ['participant', 'Participant'])),
      quotedText:
        stringOrNull(firstOwnValue(context, ['quotedText', 'QuotedText'])) ??
        this.extractQuotedText(
          asRecord(firstOwnValue(context, ['quotedMessage', 'QuotedMessage'])),
        ),
    };
  }

  private extractContextInfo(
    message: RecordValue | null,
    messageType: NormalizedMessageType,
  ): RecordValue | null {
    const records: Array<RecordValue | null> = [message];
    const key = this.mediaKey(messageType);

    if (messageType === 'text') {
      records.push(asRecord(message?.extendedTextMessage));
    }

    if (messageType === 'contact') {
      records.push(asRecord(message?.contactMessage));
    } else if (messageType === 'contacts') {
      records.push(asRecord(message?.contactsArrayMessage));
    }

    if (key) {
      records.push(asRecord(message?.[key]));
    }

    for (const record of records) {
      const context = asRecord(record?.contextInfo) ?? asRecord(record?.ContextInfo);

      if (context) {
        return context;
      }
    }

    return null;
  }

  private extractQuotedText(quotedMessage: RecordValue | null) {
    if (!quotedMessage) {
      return null;
    }

    const candidates = [
      quotedMessage.conversation,
      asRecord(quotedMessage.extendedTextMessage)?.text,
      asRecord(quotedMessage.imageMessage)?.caption,
      asRecord(quotedMessage.videoMessage)?.caption,
      asRecord(quotedMessage.documentMessage)?.caption,
      asRecord(quotedMessage.documentMessage)?.fileName,
    ];

    for (const candidate of candidates) {
      const text = stringOrNull(candidate);

      if (text) {
        return text;
      }
    }

    if (quotedMessage.imageMessage) return 'Imagem';
    if (quotedMessage.audioMessage) return 'Áudio';
    if (quotedMessage.videoMessage) return 'Vídeo';
    if (quotedMessage.stickerMessage) return 'Figurinha';
    if (quotedMessage.documentMessage) return 'Documento';
    if (quotedMessage.locationMessage || quotedMessage.liveLocationMessage) return 'Localização';
    if (quotedMessage.contactMessage) return 'Contato compartilhado';
    if (quotedMessage.contactsArrayMessage) return 'Contatos compartilhados';

    return null;
  }

  private mediaKey(messageType: NormalizedMessageType) {
    if (messageType === 'image') return 'imageMessage';
    if (messageType === 'video') return 'videoMessage';
    if (messageType === 'audio') return 'audioMessage';
    if (messageType === 'document') return 'documentMessage';
    if (messageType === 'sticker') return 'stickerMessage';
    return null;
  }
}

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function limitedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const text = value.slice(0, maxLength).trim();
  return text || null;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function decodeVcardText(value: string, quotedPrintable = false) {
  const decoded = quotedPrintable
    ? value.replace(/(?:=[a-f0-9]{2})+/gi, (sequence) => {
        const bytes = sequence
          .slice(1)
          .split('=')
          .map((hex) => Number.parseInt(hex, 16));
        return Buffer.from(bytes).toString('utf8');
      })
    : value;

  return decoded
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function normalizeLowerString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstOwnValue(source: RecordValue, keys: readonly string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }

  return undefined;
}
