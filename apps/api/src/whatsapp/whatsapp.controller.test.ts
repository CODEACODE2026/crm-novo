import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WhatsAppController, WhatsAppWebhookController } from './whatsapp.controller';

function controller(expectedToken = 'webhook-secret') {
  const service = { receiveWebhook: vi.fn().mockResolvedValue({ processed: true }) };
  const config = { getOrThrow: vi.fn(() => expectedToken) };

  return {
    controller: new WhatsAppWebhookController(service as never, config as never),
    service,
  };
}

describe('WhatsAppWebhookController', () => {
  it('rejects Kirago webhook without a valid token', () => {
    const { controller: subject, service } = controller();

    expect(() => subject.receiveKiragoWebhook({ type: 'Message' }, undefined, undefined)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      subject.receiveKiragoWebhook({ type: 'Message' }, 'wrong-token', undefined),
    ).toThrow(ForbiddenException);
    expect(service.receiveWebhook).not.toHaveBeenCalled();
  });

  it('accepts Kirago webhook token from query string', async () => {
    const { controller: subject, service } = controller();

    await expect(
      subject.receiveKiragoWebhook({ type: 'Message' }, undefined, 'webhook-secret'),
    ).resolves.toEqual({ processed: true });

    expect(service.receiveWebhook).toHaveBeenCalledWith({ type: 'Message' });
  });

  it('accepts Kirago webhook token from header', async () => {
    const { controller: subject, service } = controller();

    await expect(
      subject.receiveKiragoWebhook({ type: 'Message' }, 'webhook-secret', undefined),
    ).resolves.toEqual({ processed: true });

    expect(service.receiveWebhook).toHaveBeenCalledWith({ type: 'Message' });
  });
});

describe('WhatsAppController conversation inbox endpoints', () => {
  it('keeps inbox endpoints behind the admin auth guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, WhatsAppController) as unknown;

    expect(guards).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('routes conversation inbox operations to the service', async () => {
    const service = {
      listConversations: vi.fn().mockResolvedValue({ items: [] }),
      listUsableConnections: vi.fn().mockResolvedValue([{ id: 'connection-id' }]),
      getConversation: vi.fn().mockResolvedValue({ id: 'conversation-id' }),
      listConversationMessages: vi.fn().mockResolvedValue({ items: [] }),
      startConversation: vi.fn().mockResolvedValue({ conversation: { id: 'conversation-id' } }),
      sendConversationTextMessage: vi.fn().mockResolvedValue({ id: 'message-id' }),
      sendConversationMediaMessage: vi.fn().mockResolvedValue({ id: 'media-message-id' }),
      sendConversationVoiceMessage: vi.fn().mockResolvedValue({ id: 'voice-message-id' }),
      downloadConversationMessageMedia: vi.fn().mockResolvedValue({
        buffer: Buffer.from('image'),
        contentLength: 5,
        disposition: 'inline',
        fileName: 'foto.jpg',
        mimetype: 'image/jpeg',
      }),
      markConversationAsRead: vi.fn().mockResolvedValue({ unreadCount: 0 }),
      resolveConversation: vi.fn().mockResolvedValue({ status: 'RESOLVED' }),
    };
    const subject = new WhatsAppController(service as never);
    const response = { setHeader: vi.fn() };

    await expect(subject.listConversations({ page: 1, limit: 20 })).resolves.toEqual({
      items: [],
    });
    await expect(subject.listConnections()).resolves.toEqual([{ id: 'connection-id' }]);
    await expect(subject.getConversation('conversation-id')).resolves.toEqual({
      id: 'conversation-id',
    });
    await expect(
      subject.listConversationMessages('conversation-id', { page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [] });
    await expect(
      subject.startConversation(
        {
          whatsAppConnectionId: '11111111-1111-4111-8111-111111111111',
          clientId: '22222222-2222-4222-8222-222222222222',
          body: 'Ola',
          requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
        },
        { user: { id: 'user-id' } } as never,
      ),
    ).resolves.toEqual({ conversation: { id: 'conversation-id' } });
    await expect(
      subject.sendConversationMessage('conversation-id', {
        body: 'Ola',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      }),
    ).resolves.toEqual({ id: 'message-id' });
    const file = {
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'foto.png',
      size: 5,
    };
    await expect(
      subject.sendConversationMedia(
        'conversation-id',
        file,
        'Legenda',
        '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
      ),
    ).resolves.toEqual({ id: 'media-message-id' });
    const voiceFile = {
      buffer: Buffer.from('webm'),
      mimetype: 'audio/webm; codecs=opus',
      originalname: 'gravacao.webm',
      size: 4,
    };
    await expect(
      subject.sendConversationVoice(
        'conversation-id',
        voiceFile,
        '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
        '2.5',
      ),
    ).resolves.toEqual({ id: 'voice-message-id' });
    await expect(
      subject.downloadConversationMessageMedia('conversation-id', 'message-id', response as never),
    ).resolves.toMatchObject({});
    await expect(subject.markConversationAsRead('conversation-id')).resolves.toEqual({
      unreadCount: 0,
    });
    await expect(subject.resolveConversation('conversation-id')).resolves.toEqual({
      status: 'RESOLVED',
    });

    expect(service.listConversations).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.listUsableConnections).toHaveBeenCalledWith();
    expect(service.getConversation).toHaveBeenCalledWith('conversation-id');
    expect(service.listConversationMessages).toHaveBeenCalledWith('conversation-id', {
      page: 1,
      limit: 20,
    });
    expect(service.startConversation).toHaveBeenCalledWith(
      {
        whatsAppConnectionId: '11111111-1111-4111-8111-111111111111',
        clientId: '22222222-2222-4222-8222-222222222222',
        body: 'Ola',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
      },
      'user-id',
    );
    expect(service.sendConversationTextMessage).toHaveBeenCalledWith('conversation-id', {
      body: 'Ola',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37390',
    });
    expect(service.sendConversationMediaMessage).toHaveBeenCalledWith('conversation-id', {
      file,
      caption: 'Legenda',
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37391',
    });
    expect(service.sendConversationVoiceMessage).toHaveBeenCalledWith('conversation-id', {
      file: voiceFile,
      requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37392',
      durationSeconds: '2.5',
    });
    expect(service.downloadConversationMessageMedia).toHaveBeenCalledWith(
      'conversation-id',
      'message-id',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '5');
    expect(service.markConversationAsRead).toHaveBeenCalledWith('conversation-id');
    expect(service.resolveConversation).toHaveBeenCalledWith('conversation-id');
  });
});
