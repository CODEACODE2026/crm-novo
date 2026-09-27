import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_IMPORT_MAX_JSON_FILE_SIZE_BYTES,
  readLegacyImportJsonFile,
} from './legacy-import-file';

function fileStub(input: { name?: string; size?: number; text?: string; type?: string }) {
  return {
    name: input.name ?? 'clientes.json',
    size: input.size ?? input.text?.length ?? 2,
    text: vi.fn(() => Promise.resolve(input.text ?? '{}')),
    type: input.type ?? 'application/json',
  };
}

describe('legacy import file reader', () => {
  it('rejects an empty JSON file before reading it', async () => {
    const file = fileStub({ size: 0, text: '' });

    await expect(readLegacyImportJsonFile(file as never)).resolves.toMatchObject({
      ok: false,
      error: 'Arquivo JSON vazio.',
      text: '',
    });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('rejects oversized files before reading them', async () => {
    const file = fileStub({ size: LEGACY_IMPORT_MAX_JSON_FILE_SIZE_BYTES + 1 });

    await expect(readLegacyImportJsonFile(file as never)).resolves.toMatchObject({
      ok: false,
      error: 'Arquivo JSON excede o tamanho máximo permitido (1 MB).',
      text: '',
    });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('accepts a valid JSON file below the frontend limit', async () => {
    const file = fileStub({
      size: LEGACY_IMPORT_MAX_JSON_FILE_SIZE_BYTES,
      text: '{"schemaVersion":1,"source":"legacy","clients":[]}',
    });

    await expect(readLegacyImportJsonFile(file as never)).resolves.toMatchObject({
      ok: true,
      text: '{"schemaVersion":1,"source":"legacy","clients":[]}',
    });
    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it('accepts empty MIME type when the filename is .json', async () => {
    const file = fileStub({ name: 'clientes.json', text: '{}', type: '' });

    await expect(readLegacyImportJsonFile(file as never)).resolves.toMatchObject({
      ok: true,
      text: '{}',
    });
  });

  it('rejects clearly incompatible file types', async () => {
    const file = fileStub({ name: 'clientes.txt', text: '{}', type: 'text/plain' });

    await expect(readLegacyImportJsonFile(file as never)).resolves.toMatchObject({
      ok: false,
      error: 'Arquivo inválido.',
      text: '',
    });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('allows selecting another JSON after a file error', async () => {
    const invalid = fileStub({ name: 'clientes.txt', text: '{}', type: 'text/plain' });
    const valid = fileStub({ name: 'clientes.json', text: '{"clients":[]}', type: '' });

    await expect(readLegacyImportJsonFile(invalid as never)).resolves.toMatchObject({
      ok: false,
    });
    await expect(readLegacyImportJsonFile(valid as never)).resolves.toMatchObject({
      ok: true,
      text: '{"clients":[]}',
    });
  });
});
