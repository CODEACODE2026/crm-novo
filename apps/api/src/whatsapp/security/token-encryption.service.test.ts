import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { TokenEncryptionService } from './token-encryption.service';

function config(key: string | undefined) {
  return {
    get: (name: string) => (name === 'WHATSAPP_TOKEN_ENCRYPTION_KEY' ? key : undefined),
  };
}

describe('TokenEncryptionService', () => {
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
