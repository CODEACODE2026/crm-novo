import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppWebhookController } from './whatsapp.controller';

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
