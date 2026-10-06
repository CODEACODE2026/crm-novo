import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { WhatsAppMediaStorageService } from './whatsapp-media-storage.service';

function storage(root: string) {
  return new WhatsAppMediaStorageService({
    get: (name: string) => (name === 'WHATSAPP_MEDIA_STORAGE_DIR' ? root : undefined),
  } as never);
}

describe('WhatsAppMediaStorageService', () => {
  it('stores, reads and deletes private outbound media under the configured root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'crm-novo-whatsapp-media-'));
    const subject = storage(root);

    try {
      const result = await subject.storeOutboundMedia({
        whatsAppConnectionId: '11111111-1111-4111-8111-111111111111',
        messageId: '99999999-9999-4999-8999-999999999999',
        buffer: Buffer.from('private-media'),
        mimeType: 'image/jpeg',
        sizeBytes: 13,
      });

      expect(result).toMatchObject({
        mimeType: 'image/jpeg',
        sizeBytes: 13,
      });
      expect(result.storageKey).toMatch(
        /^11111111-1111-4111-8111-111111111111\/99999999-9999-4999-8999-999999999999\/[0-9a-f-]{36}$/,
      );
      expect(result.storageKey).not.toContain('private-media');
      expect(subject.isSafeStorageKey(result.storageKey)).toBe(true);
      await expect(subject.read(result.storageKey)).resolves.toEqual(Buffer.from('private-media'));

      const storedPath = path.join(root, ...result.storageKey.split('/'));
      await expect(readFile(storedPath)).resolves.toEqual(Buffer.from('private-media'));

      await subject.delete(result.storageKey);
      await expect(subject.read(result.storageKey)).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('blocks traversal and malformed storage keys', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'crm-novo-whatsapp-media-'));
    const subject = storage(root);

    try {
      expect(subject.isSafeStorageKey('../outside/file')).toBe(false);
      expect(subject.isSafeStorageKey('connection/../../outside')).toBe(false);
      expect(subject.isSafeStorageKey('connection/../outside')).toBe(false);
      expect(subject.isSafeStorageKey('connection/./outside')).toBe(false);
      expect(subject.isSafeStorageKey('connection/message')).toBe(false);
      await expect(subject.read('../outside/file')).rejects.toThrow(
        /Invalid WhatsApp media storage/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects relative storage roots to avoid writing under the process cwd', async () => {
    const subject = storage('relative-whatsapp-media');

    await expect(
      subject.storeOutboundMedia({
        whatsAppConnectionId: '11111111-1111-4111-8111-111111111111',
        messageId: '99999999-9999-4999-8999-999999999999',
        buffer: Buffer.from('private-media'),
        mimeType: 'image/jpeg',
        sizeBytes: 13,
      }),
    ).rejects.toThrow('WhatsApp media storage root must be absolute.');
  });
});
