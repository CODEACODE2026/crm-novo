import { describe, expect, it } from 'vitest';
import {
  KiragoWebhookNormalizer,
  type NormalizedWhatsAppReceipt,
} from './kirago-webhook-normalizer';

const receivedAt = new Date('2026-09-11T02:00:00.000Z');

function expectReceipt(result: ReturnType<KiragoWebhookNormalizer['normalize']>) {
  expect(result).toMatchObject({ kind: 'MESSAGE_RECEIPT' });
  return result as NormalizedWhatsAppReceipt;
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'Message',
    instanceName: 'CRM Principal',
    userID: 'kirago-user',
    isGroup: false,
    jid: {
      contact: { pn: '5544999999999' },
      chat: { pn: '5544999999999', raw: '5544999999999@s.whatsapp.net' },
      sender: { pn: '5544999999999', raw: '5544999999999@s.whatsapp.net' },
    },
    event: {
      Info: {
        ID: 'msg-1',
        PushName: 'Lucas',
        Timestamp: 1789088400,
        IsFromMe: false,
        IsGroup: false,
        SenderAlt: '5544999999999@s.whatsapp.net',
        Chat: '5544999999999@s.whatsapp.net',
        Sender: '5544999999999@s.whatsapp.net',
        Type: 'text',
      },
      Message: { conversation: 'Ola, gostaria de saber como funciona' },
    },
    ...overrides,
  };
}

describe('KiragoWebhookNormalizer', () => {
  const normalizer = new KiragoWebhookNormalizer();

  it('normalizes the confirmed ChatPresence audio composing payload', () => {
    const result = normalizer.normalize(
      {
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          AddressingMode: 'lid',
          BroadcastListOwner: '',
          BroadcastRecipients: [],
          Chat: '123456789012345@lid',
          IsFromMe: false,
          IsGroup: false,
          Media: 'audio',
          RecipientAlt: '5544888888888@s.whatsapp.net',
          Sender: '123456789012345@lid',
          SenderAlt: '5544999999999@s.whatsapp.net',
          State: 'composing',
        },
      },
      receivedAt,
    );

    expect(result).toEqual({
      kind: 'CHAT_PRESENCE',
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      state: 'composing',
      media: 'audio',
      isFromMe: false,
      isGroup: false,
      chat: '123456789012345@lid',
      sender: '123456789012345@lid',
      senderAlt: '5544999999999@s.whatsapp.net',
      recipientAlt: '5544888888888@s.whatsapp.net',
      addressingMode: 'lid',
      receivedAt,
    });
  });

  it('normalizes the confirmed ChatPresence paused payload', () => {
    const result = normalizer.normalize(
      {
        type: 'ChatPresence',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        event: {
          AddressingMode: 'lid',
          BroadcastListOwner: '',
          BroadcastRecipients: [],
          Chat: '123456789012345@lid',
          IsFromMe: false,
          IsGroup: false,
          Media: null,
          RecipientAlt: '5544888888888@s.whatsapp.net',
          Sender: '123456789012345@lid',
          SenderAlt: '5544999999999@s.whatsapp.net',
          State: 'paused',
        },
      },
      receivedAt,
    );

    expect(result).toMatchObject({
      kind: 'CHAT_PRESENCE',
      state: 'paused',
      media: null,
      isFromMe: false,
      isGroup: false,
      chat: '123456789012345@lid',
      senderAlt: '5544999999999@s.whatsapp.net',
    });
  });

  it('normalizes an incoming text Message payload', () => {
    const result = normalizer.normalize(payload(), receivedAt);

    expect(result).toMatchObject({
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      phone: '5544999999999',
      contactName: 'Lucas',
      messageId: 'msg-1',
      direction: 'INCOMING',
      messageType: 'text',
      text: 'Ola, gostaria de saber como funciona',
      isGroup: false,
    });
    expect(result?.messageTimestamp?.toISOString()).toBe('2026-09-11T01:00:00.000Z');
  });

  it('normalizes text Message payloads without body as empty text without media metadata', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'empty-text-provider-id', Type: 'text' },
          Message: {},
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      messageId: 'empty-text-provider-id',
      direction: 'INCOMING',
      messageType: 'text',
      text: null,
      mediaMetadata: null,
      mediaDownloadMetadata: null,
    });
  });

  it('normalizes a shared contact without confusing it with the sender name', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'contact-provider-id', Type: 'contactMessage' },
          Message: {
            contactMessage: {
              displayName: 'João da Silva',
              vcard:
                'BEGIN:VCARD\nVERSION:3.0\nFN:João da Silva\nTEL;TYPE=CELL:+55 44 99999-9999\nEND:VCARD',
            },
          },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      contactName: 'Lucas',
      messageType: 'contact',
      text: null,
      contacts: [
        {
          displayName: 'João da Silva',
          phones: ['+55 44 99999-9999'],
        },
      ],
    });
  });

  it('normalizes multiple contacts, folded vCard lines and international phones', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: {
            ...payload().event.Info,
            ID: 'contacts-provider-id',
            Type: 'contactsArrayMessage',
          },
          Message: {
            contactsArrayMessage: {
              contacts: [
                {
                  vcard:
                    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Doe;Jane;Ann;Dr.;Jr.\r\nTEL;TYPE=CELL:+1 202 555 0100\r\nEND:VCARD',
                },
                {
                  vcard:
                    'BEGIN:VCARD\nVERSION:3.0\nFN;ENCODING=QUOTED-PRINTABLE:Mar=C3=ADa =\nGarc=C3=ADa\nTEL;TYPE=CELL:tel:+34 612 34 56 78\nTEL;TYPE=WORK:+34 910 00 00 00\nEND:VCARD',
                },
              ],
            },
          },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      messageType: 'contacts',
      contacts: [
        { displayName: 'Dr. Jane Ann Doe Jr.', phones: ['+1 202 555 0100'] },
        {
          displayName: 'María García',
          phones: ['+34 612 34 56 78', '+34 910 00 00 00'],
        },
      ],
    });
  });

  it('keeps the plural type when only Info.Type identifies a contacts array', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: {
            ...payload().event.Info,
            ID: 'contacts-type-only',
            Type: 'contactsArrayMessage',
          },
          Message: {},
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      messageType: 'contacts',
      contacts: [],
    });
  });

  it('keeps recognized malformed or missing contact payloads renderable with safe placeholders', () => {
    const malformed = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'malformed-contact', Type: 'contactMessage' },
          Message: { contactMessage: { vcard: 'not-a-vcard' } },
        },
      }),
      receivedAt,
    );
    const missing = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'missing-contact', Type: 'contactMessage' },
          Message: { contactMessage: {} },
        },
      }),
      receivedAt,
    );

    expect(malformed).toMatchObject({
      messageType: 'contact',
      contacts: [{ displayName: null, phones: [], vcard: 'not-a-vcard' }],
    });
    expect(missing).toMatchObject({
      messageType: 'contact',
      contacts: [{ displayName: null, phones: [], vcard: null }],
    });
  });

  it('limits contact count, phone count and retained vCard size', () => {
    const phones = Array.from({ length: 12 }, (_, index) => `TEL:+1 202 555 ${index}`);
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'limited-contacts', Type: 'contactsArrayMessage' },
          Message: {
            contactsArrayMessage: {
              contacts: Array.from({ length: 55 }, (_, index) => ({
                displayName: `Contact ${index}`,
                vcard: `BEGIN:VCARD\nFN:Contact ${index}\n${phones.join('\n')}\nNOTE:${'x'.repeat(70_000)}\nEND:VCARD`,
              })),
            },
          },
        },
      }),
      receivedAt,
    );

    expect(result?.kind).toBe('MESSAGE');
    if (result?.kind !== 'MESSAGE') throw new Error('Expected message');
    expect(result.contacts).toHaveLength(50);
    expect(result.contacts?.[0]?.phones).toHaveLength(10);
    expect(result.contacts?.[0]?.vcard).toHaveLength(64 * 1024);
  });

  it('normalizes inbound reply context from extended text contextInfo', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, ID: 'reply-provider-id', Type: 'text' },
          Message: {
            extendedTextMessage: {
              text: 'Resposta ao orçamento',
              contextInfo: {
                stanzaId: 'original-provider-id',
                participant: '5544999999999@s.whatsapp.net',
                quotedMessage: { conversation: 'Mensagem original' },
              },
            },
          },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      messageId: 'reply-provider-id',
      text: 'Resposta ao orçamento',
      replyContext: {
        providerMessageId: 'original-provider-id',
        participant: '5544999999999@s.whatsapp.net',
        quotedText: 'Mensagem original',
      },
    });
  });

  it.each([
    [{ extendedTextMessage: { text: 'Texto estendido' } }, 'text', 'Texto estendido'],
    [
      { imageMessage: { caption: 'Legenda imagem', mimetype: 'image/jpeg', fileLength: 100 } },
      'image',
      'Legenda imagem',
    ],
    [
      { videoMessage: { caption: 'Legenda video', mimetype: 'video/mp4', seconds: 12 } },
      'video',
      'Legenda video',
    ],
    [
      { documentMessage: { caption: 'Documento', fileName: 'contrato.pdf' } },
      'document',
      'Documento',
    ],
    [{ audioMessage: { mimetype: 'audio/ogg', seconds: 8 } }, 'audio', null],
    [
      { buttonsResponseMessage: { selectedDisplayText: 'Quero saber', selectedButtonId: 'info' } },
      'button_response',
      'Quero saber',
    ],
    [
      {
        listResponseMessage: {
          title: 'Plano mensal',
          singleSelectReply: { selectedRowId: 'mensal' },
        },
      },
      'list_response',
      'Plano mensal',
    ],
    [
      { interactiveResponseMessage: { body: { text: 'Resposta interativa' } } },
      'interactive_response',
      'Resposta interativa',
    ],
  ])('normalizes message text/type variants', (message, messageType, text) => {
    const result = normalizer.normalize(
      payload({ event: { Info: payload().event.Info, Message: message } }),
      receivedAt,
    );

    expect(result?.messageType).toBe(messageType);
    expect(result?.text).toBe(text);
  });

  it.each([
    [
      'image',
      '[Imagem]',
      {
        imageMessage: {
          URL: 'https://mmg.whatsapp.net/image-without-caption',
          mediaKey: 'image-media-key',
          mimetype: 'image/jpeg',
          fileSHA256: 'image-file-sha',
          fileLength: 321,
        },
      },
      'image/jpeg',
    ],
    [
      'sticker',
      ':sticker:',
      {
        stickerMessage: {
          URL: 'https://mmg.whatsapp.net/sticker',
          mediaKey: 'sticker-media-key',
          mimetype: 'image/webp',
          fileSHA256: 'sticker-file-sha',
          fileLength: 123,
        },
      },
      'image/webp',
    ],
    [
      'video',
      ':video:',
      {
        videoMessage: {
          URL: 'https://mmg.whatsapp.net/video',
          mediaKey: 'video-media-key',
          mimetype: 'video/mp4',
          fileSHA256: 'video-file-sha',
          fileLength: 654,
        },
      },
      'video/mp4',
    ],
    [
      'audio',
      ':audio:',
      {
        audioMessage: {
          URL: 'https://mmg.whatsapp.net/audio',
          mediaKey: 'audio-media-key',
          mimetype: 'audio/ogg',
          fileSHA256: 'audio-file-sha',
          fileLength: 456,
        },
      },
      'audio/ogg',
    ],
    [
      'document',
      '[Documento]',
      {
        documentMessage: {
          URL: 'https://mmg.whatsapp.net/document',
          mediaKey: 'document-media-key',
          mimetype: 'application/pdf',
          fileSHA256: 'document-file-sha',
          fileLength: 789,
        },
      },
      'application/pdf',
    ],
  ])(
    'prioritizes %s media over provider auxiliary text',
    (messageType, auxiliaryText, mediaMessage, mimetype) => {
      const result = normalizer.normalize(
        payload({
          event: {
            Info: { ...payload().event.Info, Type: messageType },
            Message: { conversation: auxiliaryText, ...mediaMessage },
          },
        }),
        receivedAt,
      );

      expect(result).toMatchObject({
        messageType,
        text: null,
        mediaMetadata: { kind: messageType, mimetype },
        mediaDownloadMetadata: { Mimetype: mimetype },
      });
    },
  );

  it('prioritizes captionless IMAGE over extended text and conversation auxiliaries', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, Type: 'image' },
          Message: {
            conversation: '[Imagem]',
            extendedTextMessage: { text: 'image' },
            imageMessage: {
              URL: 'https://mmg.whatsapp.net/captionless-image',
              mediaKey: 'captionless-image-media-key',
              mimetype: 'image/jpeg',
              fileSHA256: 'captionless-image-file-sha',
              fileLength: 321,
            },
          },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      messageType: 'image',
      text: null,
      mediaMetadata: { kind: 'image', mimetype: 'image/jpeg' },
      mediaDownloadMetadata: { Mimetype: 'image/jpeg', FileLength: 321 },
    });
  });

  it.each([
    [
      'image lowercase',
      {
        imageMessage: {
          url: 'https://mmg.whatsapp.net/image',
          directPath: '/v/image',
          mediaKey: 'image-media-key',
          mimetype: 'image/jpeg',
          fileEncSHA256: 'image-file-enc',
          fileSHA256: 'image-file',
          fileLength: 123,
          caption: 'Foto',
          jpegThumbnail: 'data:image/jpeg;base64,SECRET',
        },
      },
      'image',
    ],
    [
      'image uppercase URL',
      {
        imageMessage: {
          URL: 'https://mmg.whatsapp.net/real-image',
          directPath: '/v/t62.7118-24/private-direct-path',
          mediaKey: 'real-image-media-key',
          mimetype: 'image/jpeg',
          fileEncSHA256: 'real-image-file-enc',
          fileSHA256: 'real-image-file',
          fileLength: 101637,
          jpegThumbnail: 'data:image/jpeg;base64,SECRET',
        },
      },
      'image',
    ],
    [
      'document capitalized',
      {
        documentMessage: {
          Url: 'https://mmg.whatsapp.net/document',
          DirectPath: '/v/document',
          MediaKey: 'document-media-key',
          Mimetype: 'application/pdf',
          FileEncSHA256: 'document-file-enc',
          FileSHA256: 'document-file',
          FileLength: '456',
          FileName: 'contrato.pdf',
          Caption: 'Contrato',
          Document: 'data:application/pdf;base64,SECRET',
        },
      },
      'document',
    ],
    [
      'audio',
      {
        audioMessage: {
          Url: 'https://mmg.whatsapp.net/audio',
          MediaKey: 'audio-media-key',
          Mimetype: 'audio/ogg',
          FileSHA256: 'audio-file',
          FileLength: 789,
          Seconds: 8,
        },
      },
      'audio',
    ],
    [
      'video',
      {
        videoMessage: {
          Url: 'https://mmg.whatsapp.net/video',
          MediaKey: 'video-media-key',
          Mimetype: 'video/mp4',
          FileSHA256: 'video-file',
          FileLength: 1024,
          Seconds: 12,
        },
      },
      'video',
    ],
    [
      'sticker',
      {
        stickerMessage: {
          Url: 'https://mmg.whatsapp.net/sticker',
          MediaKey: 'sticker-media-key',
          Mimetype: 'image/webp',
          FileSHA256: 'sticker-file',
          FileLength: 512,
        },
      },
      'sticker',
    ],
  ])(
    'preserves download metadata for %s without storing base64 bodies',
    (_label, message, type) => {
      const result = normalizer.normalize(
        payload({ event: { Info: payload().event.Info, Message: message } }),
        receivedAt,
      );

      expect(result?.messageType).toBe(type);
      expect(result?.mediaDownloadMetadata?.Url).toContain('https://mmg.whatsapp.net/');
      expect(result?.mediaDownloadMetadata?.MediaKey).toContain('media-key');
      expect(typeof result?.mediaDownloadMetadata?.Mimetype).toBe('string');
      expect(typeof result?.mediaDownloadMetadata?.FileSHA256).toBe('string');
      expect(typeof result?.mediaDownloadMetadata?.FileLength).toBe('number');
      expect(JSON.stringify(result?.mediaDownloadMetadata)).not.toContain('base64');
      expect(JSON.stringify(result?.mediaMetadata)).not.toContain('base64');
    },
  );

  it('ignores non Message events', () => {
    expect(normalizer.normalize(payload({ type: 'Status' }), receivedAt)).toBeNull();
  });

  it('normalizes delivered ReadReceipt payloads with MessageIDs and timestamp', () => {
    const result = normalizer.normalize(
      {
        type: 'ReadReceipt',
        instanceName: 'CRM Principal',
        userID: 'kirago-user',
        state: 'Delivered',
        event: {
          MessageIDs: ['provider-id-1', 'provider-id-2', 'provider-id-1'],
          Timestamp: '2026-10-08T18:43:05-03:00',
          Type: 'delivery',
        },
      },
      receivedAt,
    );

    expect(result).toMatchObject({
      kind: 'MESSAGE_RECEIPT',
      provider: 'KIRAGO',
      instanceName: 'CRM Principal',
      providerUserId: 'kirago-user',
      state: 'DELIVERED',
      rawState: 'Delivered',
      providerMessageIds: ['provider-id-1', 'provider-id-2'],
    });
    expect(expectReceipt(result).timestamp?.toISOString()).toBe('2026-10-08T21:43:05.000Z');
  });

  it('normalizes read ReadReceipt payloads with scalar and object MessageIDs', () => {
    const scalar = normalizer.normalize(
      {
        type: 'ReadReceipt',
        state: 'Read',
        event: { MessageIDs: 'provider-id-scalar', Timestamp: 1789088400 },
      },
      receivedAt,
    );

    expect(scalar).toMatchObject({
      kind: 'MESSAGE_RECEIPT',
      state: 'READ',
      providerMessageIds: ['provider-id-scalar'],
    });

    const objectArray = normalizer.normalize(
      {
        type: 'ReadReceipt',
        state: 'read',
        event: {
          MessageIDs: [{ ID: 'provider-id-object-1' }, { messageId: 'provider-id-object-2' }],
        },
      },
      receivedAt,
    );

    expect(objectArray).toMatchObject({
      kind: 'MESSAGE_RECEIPT',
      state: 'READ',
      providerMessageIds: ['provider-id-object-1', 'provider-id-object-2'],
    });
  });

  it('keeps unknown ReadReceipt states visible without mapping them', () => {
    const result = normalizer.normalize(
      {
        type: 'ReadReceipt',
        state: 'Viewed',
        event: { MessageIDs: ['provider-id'] },
      },
      receivedAt,
    );

    expect(result).toMatchObject({
      kind: 'MESSAGE_RECEIPT',
      state: null,
      rawState: 'Viewed',
      providerMessageIds: ['provider-id'],
    });
  });

  it('falls back to unknown when message shape and Info.Type are not recognized', () => {
    const result = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, Type: 'future-shape' },
          Message: { unsupportedMessage: { value: true } },
        },
      }),
      receivedAt,
    );

    expect(result?.messageType).toBe('unknown');
    expect(result?.text).toBeNull();
  });

  it('detects outgoing and group messages', () => {
    const outgoing = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, IsFromMe: true },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );
    const group = normalizer.normalize(
      payload({
        jid: { chat: { raw: '123@g.us' } },
        event: {
          Info: { ...payload().event.Info, IsGroup: true },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );

    expect(outgoing?.direction).toBe('OUTGOING');
    expect(outgoing?.contactName).toBeNull();
    expect(group?.isGroup).toBe(true);
    expect(group?.phone).toBeNull();
  });

  it('only trusts inbound sender names and ignores technical instance names', () => {
    const senderNameFallback = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, PushName: '', senderName: 'Nome do contato' },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );
    const technicalName = normalizer.normalize(
      payload({
        event: {
          Info: { ...payload().event.Info, PushName: 'CRM Principal' },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );

    expect(senderNameFallback?.contactName).toBe('Nome do contato');
    expect(technicalName?.contactName).toBeNull();
  });

  it('uses the remote Chat phone for outgoing messages when SenderAlt is the instance phone', () => {
    const result = normalizer.normalize(
      payload({
        jid: { contact: {}, chat: {}, sender: { pn: '5544000000000' } },
        event: {
          Info: {
            ...payload().event.Info,
            IsFromMe: true,
            SenderAlt: '5544000000000@s.whatsapp.net',
            Sender: '5544000000000@s.whatsapp.net',
            Chat: '5544888888888@s.whatsapp.net',
          },
          Message: { conversation: 'Mensagem enviada fora do CRM' },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      direction: 'OUTGOING',
      phone: '5544888888888',
      text: 'Mensagem enviada fora do CRM',
    });
  });

  it('uses SenderAlt as phone fallback and refuses pure LID', () => {
    const fromSenderAlt = normalizer.normalize(
      payload({
        jid: { contact: {}, chat: {}, sender: {} },
        event: {
          Info: {
            ...payload().event.Info,
            Chat: undefined,
            Sender: undefined,
            SenderAlt: '5544888888888@s.whatsapp.net',
          },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );
    const lidOnly = normalizer.normalize(
      payload({
        jid: { contact: { pn: '12345@lid' }, chat: {}, sender: {} },
        event: {
          Info: {
            ...payload().event.Info,
            Chat: undefined,
            Sender: undefined,
            SenderAlt: undefined,
          },
          Message: { conversation: 'Oi' },
        },
      }),
      receivedAt,
    );

    expect(fromSenderAlt?.phone).toBe('5544888888888');
    expect(lidOnly?.phone).toBeNull();
  });

  it('normalizes observed masked Ceará mobile inbound phone to the client canonical value', () => {
    const result = normalizer.normalize(
      payload({
        jid: {
          contact: { pn: '+55 (85) 9929-4022' },
          chat: { pn: '+55 (85) 9929-4022', raw: '558599294022@s.whatsapp.net' },
          sender: { pn: '+55 (85) 9929-4022', raw: '558599294022@s.whatsapp.net' },
        },
        event: {
          Info: {
            ...payload().event.Info,
            PushName: 'Glaucio',
            SenderAlt: '+55 (85) 9929-4022',
            Chat: '558599294022@s.whatsapp.net',
            Sender: '558599294022@s.whatsapp.net',
          },
          Message: { conversation: 'Está assim desde ontem.' },
        },
      }),
      receivedAt,
    );

    expect(result).toMatchObject({
      phone: '5585999294022',
      contactName: 'Glaucio',
      text: 'Está assim desde ontem.',
    });
  });

  it('normalizes Kirago device-suffixed WhatsApp phone values from observed payloads', () => {
    const result = normalizer.normalize(
      payload({
        jid: {
          contact: { pn: '554498212815:67' },
          chat: { pn: '554498212815:67', raw: '554498212815:67@s.whatsapp.net' },
          sender: { pn: '554498212815:67', raw: '554498212815:67@s.whatsapp.net' },
        },
        event: {
          Info: {
            ...payload().event.Info,
            SenderAlt: '554498212815:67@s.whatsapp.net',
            Chat: '554498212815:67@s.whatsapp.net',
            Sender: '554498212815:67@s.whatsapp.net',
          },
          Message: { conversation: 'Ola' },
        },
      }),
      receivedAt,
    );

    expect(result?.phone).toBe('5544998212815');
  });
});
