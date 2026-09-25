import { describe, expect, it, vi } from 'vitest';
import { KiragoAdminClient } from './kirago-admin.client';
import { KiragoInstanceClient } from './kirago-instance.client';

describe('Kirago clients', () => {
  it('uses Authorization only for admin requests', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { id: 'kirago-user' } });
    const client = new KiragoAdminClient(
      { get: () => 'admin-token' } as never,
      { request } as never,
    );

    await client.createUser({ name: 'CRM', token: 'instance-token', events: 'Message' });

    expect(request).toHaveBeenCalledWith('/admin/users', {
      method: 'POST',
      headers: { Authorization: 'Bearer admin-token' },
      body: { name: 'CRM', token: 'instance-token', events: 'Message' },
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  });

  it('keeps an already prefixed admin bearer token', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { id: 'kirago-user' } });
    const client = new KiragoAdminClient(
      { get: () => 'Bearer admin-token' } as never,
      { request } as never,
    );

    await client.listUsers();

    expect(request).toHaveBeenCalledWith('/admin/users', {
      headers: { Authorization: 'Bearer admin-token' },
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  });

  it('uses Authorization when looking up an admin user by provider id', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { id: 'kirago-user' } });
    const client = new KiragoAdminClient(
      { get: () => 'admin-token' } as never,
      { request } as never,
    );

    await client.getUser('kirago-user');

    expect(request).toHaveBeenCalledWith('/admin/users/kirago-user', {
      headers: { Authorization: 'Bearer admin-token' },
      authFailureCode: 'KIRAGO_ADMIN_AUTH_FAILED',
    });
  });

  it('uses token only for instance requests', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { Connected: true } });
    const client = new KiragoInstanceClient({ request } as never);

    await client.connect('instance-token', ['Message']);
    await client.sendText('instance-token', {
      Phone: '5544999999999',
      Body: 'Oi',
      Id: 'request-id',
    });

    expect(request).toHaveBeenNthCalledWith(1, '/session/connect', {
      method: 'POST',
      headers: { token: 'instance-token' },
      body: { Subscribe: ['Message'], Immediate: true },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
    expect(request).toHaveBeenNthCalledWith(2, '/chat/send/text', {
      method: 'POST',
      headers: { token: 'instance-token' },
      body: {
        Phone: '5544999999999',
        Body: 'Oi',
        Id: 'request-id',
        LinkPreview: false,
      },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  });

  it('sends PIX buttons with the instance bearer token, not the admin token', async () => {
    const request = vi.fn().mockResolvedValue({ success: true, data: { Id: 'message-id' } });
    const client = new KiragoInstanceClient({ request } as never);

    await client.sendButtons('instance-token', {
      phone: '5544999999999',
      title: 'PIX',
      body: 'Mensagem',
      buttons: [
        {
          name: 'cta_copy',
          buttonParamsJson: {
            display_text: 'Copiar Chave PIX',
            copy_code: 'PIX-CODE',
          },
        },
      ],
    });

    expect(request).toHaveBeenCalledWith('/chat/send/buttons', {
      method: 'POST',
      headers: { Authorization: 'Bearer instance-token' },
      body: {
        phone: '5544999999999',
        title: 'PIX',
        body: 'Mensagem',
        buttons: [
          {
            name: 'cta_copy',
            buttonParamsJson: {
              display_text: 'Copiar Chave PIX',
              copy_code: 'PIX-CODE',
            },
          },
        ],
      },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  });

  it('checks instance status through Kirago session status endpoint', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      data: { connected: true, loggedIn: true },
    });
    const client = new KiragoInstanceClient({ request } as never);

    await client.status('instance-token');

    expect(request).toHaveBeenCalledWith('/session/status', {
      headers: { token: 'instance-token' },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  });

  it('configures the instance webhook through the Kirago webhook endpoint', async () => {
    const request = vi.fn().mockResolvedValue({
      success: true,
      data: { WebhookURL: 'https://crm.example.com/whatsapp/webhook/kirago' },
    });
    const client = new KiragoInstanceClient({ request } as never);

    await client.configureWebhook(
      'instance-token',
      'https://crm.example.com/whatsapp/webhook/kirago',
      ['Message'],
    );

    expect(request).toHaveBeenCalledWith('/webhook', {
      method: 'POST',
      headers: { token: 'instance-token' },
      body: {
        webhook: 'https://crm.example.com/whatsapp/webhook/kirago',
        events: ['Message'],
        active: true,
      },
      authFailureCode: 'KIRAGO_INSTANCE_AUTH_FAILED',
    });
  });
});
