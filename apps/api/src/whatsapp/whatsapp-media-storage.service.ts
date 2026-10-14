import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { constants } from 'fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
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

export type StoreSavedWhatsAppStickerInput = {
  buffer: Buffer;
  mimeType: string;
  sha256: string;
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

  async storeSavedSticker(input: StoreSavedWhatsAppStickerInput): Promise<StoredWhatsAppMedia> {
    const storageKey = this.buildSavedStickerStorageKey(input.sha256, input.mimeType);
    const filePath = this.resolveStoragePath(storageKey);
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o750 });

    try {
      await writeFile(tempPath, input.buffer, { mode: 0o600 });
      await rename(tempPath, filePath);
    } catch (error) {
      await rm(tempPath, { force: true });
      throw error;
    }

    return {
      storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
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

  private buildSavedStickerStorageKey(sha256: string, mimeType: string) {
    const safeHash = sha256.trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(safeHash)) {
      throw new Error('Invalid WhatsApp saved sticker hash.');
    }

    const extension = mimeType.trim().toLowerCase() === 'image/webp' ? 'webp' : null;

    if (!extension) {
      throw new Error('Invalid WhatsApp saved sticker MIME.');
    }

    return ['saved-stickers', safeHash.slice(0, 2), `${safeHash}.${extension}`].join('/');
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
