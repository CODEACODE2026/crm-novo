import { describe, expect, it } from 'vitest';
import { KiragoWebhookNormalizer } from './kirago-webhook-normalizer';

const receivedAt = new Date('2026-09-11T02:00:00.000Z');

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

  it('ignores non Message events', () => {
    expect(normalizer.normalize(payload({ type: 'Status' }), receivedAt)).toBeNull();
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
