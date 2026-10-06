import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KiragoAdminClient } from './kirago-admin.client';
import { KiragoHttpClient } from './kirago-http.client';
import { KiragoInstanceClient } from './kirago-instance.client';
import { KiragoWhatsAppProvider } from './kirago-whatsapp.provider';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [KiragoAdminClient, KiragoHttpClient, KiragoInstanceClient, KiragoWhatsAppProvider],
})
class KiragoTestModule {}

describe('Kirago dependency injection', () => {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;
    delete process.env.WHATSAPP_MEDIA_SEND_DEBUG;
    vi.restoreAllMocks();
  });

  it('resolves provider dependencies and provisions through the admin client', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const adminClient = app.get(KiragoAdminClient);
    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const wiredProvider = provider as unknown as {
      adminClient?: KiragoAdminClient;
      instanceClient?: KiragoInstanceClient;
    };
    const createUser = vi
      .spyOn(adminClient, 'createUser')
      .mockResolvedValue({ success: true, data: { id: 'kirago-user-id' } });

    expect(adminClient).toBeInstanceOf(KiragoAdminClient);
    expect(instanceClient).toBeInstanceOf(KiragoInstanceClient);
    expect(wiredProvider.adminClient).toBe(adminClient);
    expect(wiredProvider.instanceClient).toBe(instanceClient);

    const result = await provider.provisionConnection({
      name: 'CRM Novo',
      instanceToken: 'instance-token',
      webhookUrl: 'https://crm.test/webhook',
      events: ['Message'],
    });

    expect(createUser).toHaveBeenCalledWith({
      name: 'CRM Novo',
      token: 'instance-token',
      webhook: 'https://crm.test/webhook',
      events: 'Message',
    });
    expect(result).toEqual({ providerUserId: 'kirago-user-id', webhookConfigured: true });
  });

  it('confirms whether a remote Kirago user still exists before local reprovisioning', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const adminClient = app.get(KiragoAdminClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const getUser = vi
      .spyOn(adminClient, 'getUser')
      .mockResolvedValue({ success: true, data: { id: 'kirago-user-id' } });

    const result = await provider.findRemoteConnection({
      providerUserId: 'kirago-user-id',
      instanceName: 'CRM Principal',
    });

    expect(getUser).toHaveBeenCalledWith('kirago-user-id');
    expect(result).toEqual({ exists: true });
  });

  it('normalizes lowercase Kirago v1.11 status payloads', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    vi.spyOn(instanceClient, 'status').mockResolvedValue({
      success: true,
      data: { connected: true, loggedIn: true, phone: '5544999999999' },
    });

    await expect(provider.getStatus('instance-token')).resolves.toEqual({
      connected: true,
      loggedIn: true,
      phone: '5544999999999',
    });
  });

  it('normalizes textual Kirago status values and extracts phone from JID', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    vi.spyOn(instanceClient, 'status').mockResolvedValue({
      success: true,
      data: { status: 'CONNECTED', jid: '5544888888888@s.whatsapp.net' },
    });

    await expect(provider.getStatus('instance-token')).resolves.toEqual({
      connected: true,
      loggedIn: true,
      phone: '5544888888888',
    });
  });

  it('keeps UUID message ids unchanged for Kirago sends', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const sendText = vi.spyOn(instanceClient, 'sendText').mockResolvedValue({
      success: true,
      data: { Id: 'provider-id' },
    });

    await provider.sendText('instance-token', {
      phone: '5544999999999',
      body: 'Teste',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });

    expect(sendText).toHaveBeenCalledWith('instance-token', {
      Phone: '5544999999999',
      Body: 'Teste',
      Id: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
  });

  it('maps image, document and audio sends to official Kirago payloads', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const sendImage = vi.spyOn(instanceClient, 'sendImage').mockResolvedValue({
      success: true,
      data: { Id: 'image-provider-id' },
    });
    const sendDocument = vi.spyOn(instanceClient, 'sendDocument').mockResolvedValue({
      success: true,
      data: { Id: 'document-provider-id' },
    });
    const sendAudio = vi.spyOn(instanceClient, 'sendAudio').mockResolvedValue({
      success: true,
      data: { Id: 'audio-provider-id' },
    });

    await provider.sendImage('instance-token', {
      phone: '5544999999999',
      imageDataUrl: 'data:image/png;base64,abc',
      caption: 'Imagem',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    await provider.sendDocument('instance-token', {
      phone: '5544999999999',
      documentDataUrl: 'data:application/octet-stream;base64,abc',
      fileName: 'file.txt',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
    });
    await provider.sendAudio('instance-token', {
      phone: '5544999999999',
      audioDataUrl: 'data:audio/ogg;base64,abc',
      mimeType: 'audio/ogg',
      seconds: null,
      ptt: false,
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
    });

    expect(sendImage).toHaveBeenCalledWith('instance-token', {
      Phone: '5544999999999',
      Image: 'data:image/png;base64,abc',
      Caption: 'Imagem',
      Id: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    expect(sendDocument).toHaveBeenCalledWith('instance-token', {
      Phone: '5544999999999',
      Document: 'data:application/octet-stream;base64,abc',
      FileName: 'file.txt',
      Id: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
    });
    expect(sendAudio).toHaveBeenCalledWith('instance-token', {
      Phone: '5544999999999',
      Audio: 'data:audio/ogg;base64,abc',
      Id: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
      PTT: false,
      MimeType: 'audio/ogg',
    });
  });

  it('logs only safe Kirago media send response shape when debug is enabled', async () => {
    process.env.WHATSAPP_MEDIA_SEND_DEBUG = 'true';
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(instanceClient, 'sendImage').mockResolvedValue({
      success: true,
      data: {
        Id: 'image-provider-id',
        Timestamp: '2026-10-05T20:00:00.000Z',
        Details: {
          Url: 'https://media.example.test/private?token=secret',
          DirectPath: '/v/private',
          MediaKey: 'secret-media-key',
          Mimetype: 'image/jpeg',
          FileSHA256: 'secret-file-sha',
          FileEncSHA256: 'secret-file-enc-sha',
          FileLength: 123,
          Image: 'data:image/jpeg;base64,SECRET',
        },
      },
    });

    await provider.sendImage('instance-token', {
      phone: '5544999999999',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });

    const output = String(log.mock.calls[0]?.[0] ?? '');
    const payload = JSON.parse(output.replace('[WHATSAPP_MEDIA_SEND_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      kind: 'IMAGE',
      envelopeKeys: ['data', 'success'],
      dataKeys: ['Details', 'Id', 'Timestamp'],
      detailsType: 'object',
      hasUrl: true,
      hasDirectPath: true,
      hasMediaKey: true,
      hasMimetype: true,
      hasFileSHA256: true,
      hasFileEncSHA256: true,
      hasFileLength: true,
      hasId: true,
      hasTimestamp: true,
    });
    expect(output).not.toContain('secret');
    expect(output).not.toContain('https://media.example.test');
    expect(output).not.toContain('data:image');
  });

  it('reports plain text Details as non-JSON without exposing content', async () => {
    process.env.WHATSAPP_MEDIA_SEND_DEBUG = 'true';
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(instanceClient, 'sendDocument').mockResolvedValue({
      success: true,
      data: {
        Id: 'document-provider-id',
        Timestamp: '2026-10-05T20:00:00.000Z',
        Details: 'sent document to https://media.example.test/private?token=secret-token',
      },
    });

    await provider.sendDocument('instance-token', {
      phone: '5544999999999',
      documentDataUrl: 'data:application/octet-stream;base64,abc',
      fileName: 'file.txt',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
    });

    const output = String(log.mock.calls[0]?.[0] ?? '');
    const payload = JSON.parse(output.replace('[WHATSAPP_MEDIA_SEND_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      kind: 'DOCUMENT',
      detailsType: 'string',
      detailsJsonParsable: false,
      parsedDetailsType: null,
      parsedDetailsKeys: [],
      hasUrl: false,
      hasMediaKey: false,
      hasFileSHA256: false,
      hasId: true,
      hasTimestamp: true,
    });
    expect(typeof payload.detailsLength).toBe('number');
    expect(output).not.toContain('sent document');
    expect(output).not.toContain('https://media.example.test');
    expect(output).not.toContain('secret-token');
  });

  it('reports JSON string Details structure without media fields', async () => {
    process.env.WHATSAPP_MEDIA_SEND_DEBUG = 'true';
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(instanceClient, 'sendImage').mockResolvedValue({
      success: true,
      data: {
        Id: 'image-provider-id',
        Timestamp: '2026-10-05T20:00:00.000Z',
        Details: JSON.stringify({
          status: 'queued',
          message: { delivered: true },
          token: 'secret-token',
        }),
      },
    });

    await provider.sendImage('instance-token', {
      phone: '5544999999999',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });

    const output = String(log.mock.calls[0]?.[0] ?? '');
    const payload = JSON.parse(output.replace('[WHATSAPP_MEDIA_SEND_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      detailsType: 'string',
      detailsJsonParsable: true,
      parsedDetailsType: 'object',
      parsedDetailsKeys: ['[redacted-key]', 'message', 'status'],
      parsedDetailsNestedKeys: { message: ['delivered'] },
      hasUrl: false,
      hasMediaKey: false,
      hasFileSHA256: false,
      hasFileLength: false,
    });
    expect(output).not.toContain('queued');
    expect(output).not.toContain('secret-token');
  });

  it('detects media field presence inside parsed JSON Details without leaking values', async () => {
    process.env.WHATSAPP_MEDIA_SEND_DEBUG = 'true';
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(instanceClient, 'sendImage').mockResolvedValue({
      success: true,
      data: {
        Id: 'image-provider-id',
        Timestamp: '2026-10-05T20:00:00.000Z',
        Details: JSON.stringify({
          media: {
            Url: 'https://media.example.test/private?token=secret-token',
            DirectPath: '/v/private',
            MediaKey: 'secret-media-key',
            Mimetype: 'image/jpeg',
            FileSHA256: 'secret-file-sha',
            FileEncSHA256: 'secret-file-enc-sha',
            FileLength: 123,
            Data: 'data:image/jpeg;base64,SECRET',
          },
        }),
      },
    });

    await provider.sendImage('instance-token', {
      phone: '5544999999999',
      imageDataUrl: 'data:image/jpeg;base64,abc',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });

    const output = String(log.mock.calls[0]?.[0] ?? '');
    const payload = JSON.parse(output.replace('[WHATSAPP_MEDIA_SEND_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      detailsJsonParsable: true,
      parsedDetailsKeys: ['media'],
      parsedDetailsNestedKeys: {
        media: [
          'Data',
          'DirectPath',
          'FileEncSHA256',
          'FileLength',
          'FileSHA256',
          'MediaKey',
          'Mimetype',
          'Url',
        ],
      },
      hasUrl: true,
      hasDirectPath: true,
      hasMediaKey: true,
      hasMimetype: true,
      hasFileSHA256: true,
      hasFileEncSHA256: true,
      hasFileLength: true,
      hasId: true,
      hasTimestamp: true,
    });
    expect(output).not.toContain('https://media.example.test');
    expect(output).not.toContain('secret-media-key');
    expect(output).not.toContain('secret-file-sha');
    expect(output).not.toContain('data:image');
    expect(output).not.toContain('secret-token');
  });

  it('does not fail sends when Details contains malformed JSON', async () => {
    process.env.WHATSAPP_MEDIA_SEND_DEBUG = 'true';
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(instanceClient, 'sendImage').mockResolvedValue({
      success: true,
      data: {
        Id: 'image-provider-id',
        Timestamp: '2026-10-05T20:00:00.000Z',
        Details: '{"Url":"https://media.example.test/private?token=secret-token"',
      },
    });

    await expect(
      provider.sendImage('instance-token', {
        phone: '5544999999999',
        imageDataUrl: 'data:image/jpeg;base64,abc',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      }),
    ).resolves.toEqual({ providerMessageId: 'image-provider-id' });

    const output = String(log.mock.calls[0]?.[0] ?? '');
    const payload = JSON.parse(output.replace('[WHATSAPP_MEDIA_SEND_DEBUG] ', '')) as Record<
      string,
      unknown
    >;

    expect(payload).toMatchObject({
      detailsType: 'string',
      detailsJsonParsable: false,
      parsedDetailsType: null,
      parsedDetailsKeys: [],
    });
    expect(output).not.toContain('https://media.example.test');
    expect(output).not.toContain('secret-token');
  });

  it('maps CRM billing request ids to stable UUID message ids for Kirago sends', async () => {
    app = await NestFactory.createApplicationContext(KiragoTestModule, { logger: false });

    const instanceClient = app.get(KiragoInstanceClient);
    const provider = app.get(KiragoWhatsAppProvider);
    const sendText = vi.spyOn(instanceClient, 'sendText').mockResolvedValue({
      success: true,
      data: { Id: 'provider-id' },
    });
    const requestId =
      'billing:client-id:receivable-id:2026-09-13:0:7cea2ca9-3866-4f85-bb44-3bd4318a9595';

    await provider.sendText('instance-token', {
      phone: '5544999999999',
      body: 'Teste de cobranca',
      requestId,
    });
    await provider.sendText('instance-token', {
      phone: '5544999999999',
      body: 'Teste de cobranca',
      requestId,
    });

    const firstId = sendText.mock.calls[0]?.[1].Id;
    const secondId = sendText.mock.calls[1]?.[1].Id;
    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(firstId).toBe(secondId);
    expect(firstId).not.toContain(':');
    expect(sendText).toHaveBeenCalledWith('instance-token', {
      Phone: '5544999999999',
      Body: 'Teste de cobranca',
      Id: firstId,
    });
  });
});
