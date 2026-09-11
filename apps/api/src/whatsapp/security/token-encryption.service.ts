import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const algorithm = 'aes-256-gcm';
const version = 'v1';

@Injectable()
export class TokenEncryptionService {
  constructor(private readonly config: ConfigService) {}

  encrypt(plainText: string) {
    const key = this.getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      version,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string) {
    const key = this.getKey();
    const [payloadVersion, ivValue, authTagValue, encryptedValue] = payload.split('.');

    if (payloadVersion !== version || !ivValue || !authTagValue || !encryptedValue) {
      throw new BadRequestException('Token da conexao WhatsApp invalido.');
    }

    try {
      const decipher = createDecipheriv(algorithm, key, Buffer.from(ivValue, 'base64url'));
      decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException('Token da conexao WhatsApp corrompido ou invalido.');
    }
  }

  private getKey() {
    const rawKey = this.config.get<string>('WHATSAPP_TOKEN_ENCRYPTION_KEY');

    if (!rawKey) {
      throw new InternalServerErrorException('Chave de criptografia WhatsApp nao configurada.');
    }

    const key = Buffer.from(rawKey, 'utf8');

    if (key.length !== 32) {
      throw new InternalServerErrorException('Chave de criptografia WhatsApp deve ter 32 bytes.');
    }

    return key;
  }
}
