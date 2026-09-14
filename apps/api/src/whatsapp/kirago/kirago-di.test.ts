import { Module } from '@nestjs/common';
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
