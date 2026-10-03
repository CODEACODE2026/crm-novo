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
      getConversation: vi.fn().mockResolvedValue({ id: 'conversation-id' }),
      listConversationMessages: vi.fn().mockResolvedValue({ items: [] }),
      markConversationAsRead: vi.fn().mockResolvedValue({ unreadCount: 0 }),
      resolveConversation: vi.fn().mockResolvedValue({ status: 'RESOLVED' }),
    };
    const subject = new WhatsAppController(service as never);

    await expect(subject.listConversations({ page: 1, limit: 20 })).resolves.toEqual({
      items: [],
    });
    await expect(subject.getConversation('conversation-id')).resolves.toEqual({
      id: 'conversation-id',
    });
    await expect(
      subject.listConversationMessages('conversation-id', { page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [] });
    await expect(subject.markConversationAsRead('conversation-id')).resolves.toEqual({
      unreadCount: 0,
    });
    await expect(subject.resolveConversation('conversation-id')).resolves.toEqual({
      status: 'RESOLVED',
    });

    expect(service.listConversations).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.getConversation).toHaveBeenCalledWith('conversation-id');
    expect(service.listConversationMessages).toHaveBeenCalledWith('conversation-id', {
      page: 1,
      limit: 20,
    });
    expect(service.markConversationAsRead).toHaveBeenCalledWith('conversation-id');
    expect(service.resolveConversation).toHaveBeenCalledWith('conversation-id');
  });
});
