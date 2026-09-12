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
      headers: { Authorization: 'admin-token' },
      body: { name: 'CRM', token: 'instance-token', events: 'Message' },
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
      headers: { Authorization: 'admin-token' },
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
});
