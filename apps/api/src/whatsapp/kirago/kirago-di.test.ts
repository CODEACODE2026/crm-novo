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
});
