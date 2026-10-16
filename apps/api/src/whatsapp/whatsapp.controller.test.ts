import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  WhatsAppController,
  WhatsAppMulterExceptionFilter,
  WhatsAppWebhookController,
} from './whatsapp.controller';

const controllerSource = readFileSync(
  join(process.cwd(), 'src/whatsapp/whatsapp.controller.ts'),
  'utf8',
);

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

  it('keeps static and specific search routes before broader conversation routes', () => {
    expect(controllerSource.indexOf("@Get('messages/search')")).toBeGreaterThanOrEqual(0);
    expect(controllerSource.indexOf("@Post('messages/:id/retry')")).toBeGreaterThanOrEqual(0);
    expect(controllerSource.indexOf("@Get('messages/search')")).toBeLessThan(
      controllerSource.indexOf("@Post('messages/:id/retry')"),
    );
    expect(
      controllerSource.indexOf("@Get('conversations/:conversationId/messages/around/:messageId')"),
    ).toBeLessThan(controllerSource.indexOf("@Get('conversations/:id')"));
  });

  it('keeps media upload multipart size aligned to the video ceiling', () => {
    expect(controllerSource).toContain('@UseFilters(WhatsAppMulterExceptionFilter)');
    expect(controllerSource).toContain(
      'limits: { fileSize: WhatsAppService.conversationUploadMaxBytes }',
    );
    expect(controllerSource).toContain(
      'Arquivo excede o limite maximo de 50 MB permitido para upload.',
    );
    expect(controllerSource).toContain(
      'limits: { fileSize: WhatsAppService.conversationVoiceMaxBytes }',
    );
  });

  it('maps Multer file size failures to a friendly 413 response', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
      }),
    };

    new WhatsAppMulterExceptionFilter().catch({ code: 'LIMIT_FILE_SIZE' }, host as never);

    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      statusCode: 413,
      message: 'Arquivo excede o limite maximo de 50 MB permitido para upload.',
      error: 'Payload Too Large',
    });
  });

  it('routes conversation inbox operations to the service', async () => {
    const service = {
      listConversations: vi.fn().mockResolvedValue({ items: [] }),
      listConversationLabels: vi.fn().mockResolvedValue([]),
      createConversationLabel: vi.fn().mockResolvedValue({ id: 'label-id' }),
      updateConversationLabel: vi.fn().mockResolvedValue({ id: 'label-id', name: 'VIP' }),
      deleteConversationLabel: vi.fn().mockResolvedValue({ deleted: true, id: 'label-id' }),
      setConversationLabels: vi.fn().mockResolvedValue({ id: 'conversation-id', labels: [] }),
      listUsableConnections: vi.fn().mockResolvedValue([{ id: 'connection-id' }]),
      getConversation: vi.fn().mockResolvedValue({ id: 'conversation-id' }),
      listConversationMessages: vi.fn().mockResolvedValue({ items: [] }),
      searchConversationMessages: vi.fn().mockResolvedValue({ items: [] }),
      getConversationMessagesAround: vi.fn().mockResolvedValue({ items: [] }),
      startConversation: vi.fn().mockResolvedValue({ conversation: { id: 'conversation-id' } }),
      sendConversationTextMessage: vi.fn().mockResolvedValue({ id: 'message-id' }),
      forwardConversationMessage: vi.fn().mockResolvedValue({ id: 'forwarded-message-id' }),
      setConversationPresence: vi.fn().mockResolvedValue({ success: true }),
      updateConversationMessageReaction: vi.fn().mockResolvedValue({ id: 'message-id' }),
      deleteConversationMessage: vi.fn().mockResolvedValue({ id: 'deleted-message-id' }),
      retryConversationMessage: vi.fn().mockResolvedValue({ id: 'retry-message-id' }),
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
    const quickReplies = {
      listActiveForInbox: vi
        .fn()
        .mockResolvedValue([{ id: 'reply-id', label: 'PIX', text: 'Pix' }]),
      listAdmin: vi.fn().mockResolvedValue([{ id: 'reply-id', label: 'PIX', text: 'Pix' }]),
      create: vi.fn().mockResolvedValue({ id: 'reply-id', label: 'Novo', text: 'Texto' }),
      update: vi.fn().mockResolvedValue({ id: 'reply-id', label: 'Editado', text: 'Texto' }),
      remove: vi.fn().mockResolvedValue({ success: true }),
    };
    const realtime = { subscribe: vi.fn() };
    const autoReply = {
      listConfigs: vi.fn().mockResolvedValue([]),
      getConfig: vi.fn().mockResolvedValue({ enabled: false }),
      updateConfig: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const attendance = {
      listCategories: vi.fn().mockResolvedValue([]),
      createCategory: vi.fn().mockResolvedValue({ id: 'attendance-category-id' }),
      updateCategory: vi.fn().mockResolvedValue({ id: 'attendance-category-id' }),
      removeCategory: vi.fn().mockResolvedValue({ deactivated: true }),
      getActiveAttendance: vi.fn().mockResolvedValue(null),
      listConversationAttendances: vi.fn().mockResolvedValue({ items: [] }),
      getAttendance: vi.fn().mockResolvedValue({ id: 'attendance-id' }),
      listClientAttendances: vi.fn().mockResolvedValue({ items: [] }),
    };
    const subject = new WhatsAppController(
      service as never,
      quickReplies as never,
      realtime as never,
      autoReply as never,
      attendance as never,
    );
    const response = { setHeader: vi.fn() };
    const request = { on: vi.fn() };

    await expect(subject.listConversations({ page: 1, limit: 20 })).resolves.toEqual({
      items: [],
    });
    await expect(subject.listConnections()).resolves.toEqual([{ id: 'connection-id' }]);
    await expect(subject.listConversationLabels('connection-id')).resolves.toEqual([]);
    await expect(
      subject.createConversationLabel('connection-id', { name: 'VIP', color: 'BLUE' }),
    ).resolves.toEqual({ id: 'label-id' });
    await expect(
      subject.updateConversationLabel('connection-id', 'label-id', { color: 'RED' }),
    ).resolves.toEqual({ id: 'label-id', name: 'VIP' });
    await expect(subject.deleteConversationLabel('connection-id', 'label-id')).resolves.toEqual({
      deleted: true,
      id: 'label-id',
    });
    await expect(
      subject.setConversationLabels('conversation-id', { labelIds: [] }),
    ).resolves.toEqual({
      id: 'conversation-id',
      labels: [],
    });
    await expect(subject.listAutoReplies()).resolves.toEqual([]);
    await expect(subject.getAutoReply('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      enabled: false,
    });
    await expect(
      subject.updateAutoReply('11111111-1111-4111-8111-111111111111', {
        enabled: true,
        mode: 'AWAY',
        message: 'Ausente',
        cooldownMinutes: 60,
        audience: 'ALL',
      }),
    ).resolves.toEqual({ enabled: true });
    await expect(subject.listQuickReplies()).resolves.toEqual([
      { id: 'reply-id', label: 'PIX', text: 'Pix' },
    ]);
    await expect(subject.listQuickRepliesAdmin()).resolves.toEqual([
      { id: 'reply-id', label: 'PIX', text: 'Pix' },
    ]);
    await expect(
      subject.createQuickReply({ label: 'Novo', text: 'Texto', isActive: true, sortOrder: 10 }),
    ).resolves.toEqual({ id: 'reply-id', label: 'Novo', text: 'Texto' });
    await expect(
      subject.updateQuickReply('99999999-9999-4999-8999-999999999999', { isActive: false }),
    ).resolves.toEqual({ id: 'reply-id', label: 'Editado', text: 'Texto' });
    await expect(subject.deleteQuickReply('99999999-9999-4999-8999-999999999999')).resolves.toEqual(
      { success: true },
    );
    await expect(subject.getConversation('conversation-id')).resolves.toEqual({
      id: 'conversation-id',
    });
    await expect(
      subject.listConversationMessages('conversation-id', { page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [] });
    await expect(
      subject.searchConversationMessages({ q: 'ola', page: 1, limit: 20 }),
    ).resolves.toEqual({
      items: [],
    });
    await expect(
      subject.getConversationMessagesAround('conversation-id', 'message-id', { limit: 15 }),
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
    await expect(
      subject.forwardConversationMessage('conversation-id', 'message-id', {
        targetConversationId: '77777777-7777-4777-8777-777777777777',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37395',
      }),
    ).resolves.toEqual({ id: 'forwarded-message-id' });
    await expect(
      subject.setConversationPresence('conversation-id', { state: 'composing', media: 'audio' }),
    ).resolves.toEqual({ success: true });
    await expect(
      subject.updateConversationMessageReaction('conversation-id', 'message-id', { emoji: '❤️' }),
    ).resolves.toEqual({ id: 'message-id' });
    await expect(
      subject.deleteConversationMessage('conversation-id', 'message-id'),
    ).resolves.toEqual({ id: 'deleted-message-id' });
    await expect(
      subject.retryConversationMessage('99999999-9999-4999-8999-999999999999'),
    ).resolves.toEqual({ id: 'retry-message-id' });
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
        undefined,
        undefined,
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
    await expect(
      subject.resolveConversation('conversation-id', {}, { user: { id: 'user-id' } } as never),
    ).resolves.toEqual({ status: 'RESOLVED' });
    await expect(subject.listAttendanceCategories('connection-id', 'true')).resolves.toEqual([]);
    await expect(
      subject.createAttendanceCategory('connection-id', { name: 'Suporte', color: 'BLUE' }),
    ).resolves.toEqual({ id: 'attendance-category-id' });
    await expect(subject.getActiveAttendance('conversation-id')).resolves.toBeNull();
    await expect(
      subject.listConversationAttendances('conversation-id', { page: 1, limit: 5 }),
    ).resolves.toEqual({ items: [] });
    await expect(subject.getAttendance('attendance-id')).resolves.toEqual({
      id: 'attendance-id',
    });
    await expect(
      subject.listClientAttendances('client-id', { page: 1, limit: 5 }),
    ).resolves.toEqual({ items: [] });
    subject.events(request as never, response as never);

    expect(service.listConversations).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.listUsableConnections).toHaveBeenCalledWith();
    expect(service.createConversationLabel).toHaveBeenCalledWith('connection-id', {
      name: 'VIP',
      color: 'BLUE',
    });
    expect(quickReplies.listActiveForInbox).toHaveBeenCalledWith();
    expect(quickReplies.listAdmin).toHaveBeenCalledWith();
    expect(quickReplies.create).toHaveBeenCalledWith({
      label: 'Novo',
      text: 'Texto',
      isActive: true,
      sortOrder: 10,
    });
    expect(quickReplies.update).toHaveBeenCalledWith('99999999-9999-4999-8999-999999999999', {
      isActive: false,
    });
    expect(service.getConversation).toHaveBeenCalledWith('conversation-id');
    expect(service.listConversationMessages).toHaveBeenCalledWith('conversation-id', {
      page: 1,
      limit: 20,
    });
    expect(service.searchConversationMessages).toHaveBeenCalledWith({
      q: 'ola',
      page: 1,
      limit: 20,
    });
    expect(service.getConversationMessagesAround).toHaveBeenCalledWith(
      'conversation-id',
      'message-id',
      { limit: 15 },
    );
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
    expect(service.forwardConversationMessage).toHaveBeenCalledWith(
      'conversation-id',
      'message-id',
      {
        targetConversationId: '77777777-7777-4777-8777-777777777777',
        requestId: '2f419d6d-d81a-4ed8-9f38-c6ff02d37395',
      },
    );
    expect(service.updateConversationMessageReaction).toHaveBeenCalledWith(
      'conversation-id',
      'message-id',
      { emoji: '❤️' },
    );
    expect(service.deleteConversationMessage).toHaveBeenCalledWith('conversation-id', 'message-id');
    expect(service.retryConversationMessage).toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
    );
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
    expect(service.resolveConversation).toHaveBeenCalledWith('conversation-id', {}, 'user-id');
    expect(attendance.listCategories).toHaveBeenCalledWith('connection-id', false);
    expect(attendance.createCategory).toHaveBeenCalledWith('connection-id', {
      name: 'Suporte',
      color: 'BLUE',
    });
    expect(attendance.listConversationAttendances).toHaveBeenCalledWith('conversation-id', {
      page: 1,
      limit: 5,
    });
    expect(attendance.listClientAttendances).toHaveBeenCalledWith('client-id', {
      page: 1,
      limit: 5,
    });
    expect(realtime.subscribe).toHaveBeenCalledWith(request, response);
  });
});
