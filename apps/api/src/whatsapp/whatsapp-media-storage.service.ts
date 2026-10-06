import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { constants } from 'fs';
import { access, mkdir, readFile, rm, writeFile } from 'fs/promises';
import path from 'path';

export type StoredWhatsAppMedia = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type StoreWhatsAppMediaInput = {
  whatsAppConnectionId: string;
  messageId: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
};

const defaultStorageRoot = '/var/lib/crm-novo/whatsapp-media';
const safeStorageSegmentPattern = /^[a-zA-Z0-9._-]+$/;

@Injectable()
export class WhatsAppMediaStorageService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async storeOutboundMedia(input: StoreWhatsAppMediaInput): Promise<StoredWhatsAppMedia> {
    const storageKey = this.buildStorageKey(input.whatsAppConnectionId, input.messageId);
    const filePath = this.resolveStoragePath(storageKey);

    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });
    await writeFile(filePath, input.buffer, { mode: 0o600 });

    return {
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    };
  }

  async read(storageKey: string) {
    const filePath = this.resolveStoragePath(storageKey);

    try {
      await access(filePath, constants.R_OK);
    } catch {
      return null;
    }

    return readFile(filePath);
  }

  async delete(storageKey: string) {
    const filePath = this.resolveStoragePath(storageKey);
    await rm(filePath, { force: true });
  }

  isSafeStorageKey(storageKey: string) {
    try {
      this.resolveStoragePath(storageKey);
      return true;
    } catch {
      return false;
    }
  }

  private buildStorageKey(whatsAppConnectionId: string, messageId: string) {
    return [whatsAppConnectionId, messageId, randomUUID()].join('/');
  }

  private resolveStoragePath(storageKey: string) {
    const segments = storageKey.split('/');

    if (
      segments.length !== 3 ||
      segments.some(
        (segment) =>
          !segment ||
          segment === '.' ||
          segment === '..' ||
          !safeStorageSegmentPattern.test(segment),
      )
    ) {
      throw new Error('Invalid WhatsApp media storage key.');
    }

    const root = this.storageRoot();
    const resolved = path.resolve(root, ...segments);
    const relative = path.relative(root, resolved);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Invalid WhatsApp media storage path.');
    }

    return resolved;
  }

  private storageRoot() {
    const configured = this.config.get<string>('WHATSAPP_MEDIA_STORAGE_DIR')?.trim();

    if (configured && !path.isAbsolute(configured)) {
      throw new Error('WhatsApp media storage root must be absolute.');
    }

    return path.resolve(configured || defaultStorageRoot);
  }
}
