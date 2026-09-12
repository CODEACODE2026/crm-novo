import { BadRequestException, InternalServerErrorException, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenEncryptionService } from './token-encryption.service';

function config(key: string | undefined) {
  return {
    get: (name: string) => (name === 'WHATSAPP_TOKEN_ENCRYPTION_KEY' ? key : undefined),
  };
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [TokenEncryptionService],
})
class TokenEncryptionTestModule {}

describe('TokenEncryptionService', () => {
  const previousEncryptionKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;

  afterEach(async () => {
    await app?.close();
    app = null;

    if (previousEncryptionKey === undefined) {
      delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
    }
  });

  it('resolves ConfigService through Nest DI and round-trips the token', async () => {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';
    app = await NestFactory.createApplicationContext(TokenEncryptionTestModule, {
      logger: false,
    });

    const configService = app.get(ConfigService);
    const service = app.get(TokenEncryptionService);
    const wiredService = service as unknown as { config?: ConfigService };

    expect(wiredService.config).toBe(configService);
    expect(configService.get<string>('WHATSAPP_TOKEN_ENCRYPTION_KEY')).toBeDefined();

    const encrypted = service.encrypt('instance-token');

    expect(encrypted).not.toContain('instance-token');
    expect(service.decrypt(encrypted)).toBe('instance-token');
  });

  it('encrypts and decrypts an instance token without exposing plaintext', () => {
    const service = new TokenEncryptionService(config('12345678901234567890123456789012') as never);

    const encrypted = service.encrypt('instance-token');

    expect(encrypted).not.toContain('instance-token');
    expect(service.decrypt(encrypted)).toBe('instance-token');
  });

  it('rejects corrupted ciphertext', () => {
    const service = new TokenEncryptionService(config('12345678901234567890123456789012') as never);
    const encrypted = service.encrypt('instance-token');

    expect(() => service.decrypt(`${encrypted.slice(0, -2)}xx`)).toThrow(BadRequestException);
  });

  it('requires a 32 byte encryption key', () => {
    const service = new TokenEncryptionService(config('short') as never);

    expect(() => service.encrypt('token')).toThrow(InternalServerErrorException);
  });
});
