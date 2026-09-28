export const LEGACY_IMPORT_MAX_JSON_FILE_SIZE_BYTES = 1024 * 1024;
export const LEGACY_IMPORT_MAX_JSON_FILE_SIZE_LABEL = '1 MB';
export const LEGACY_FINANCIAL_IMPORT_MAX_JSON_FILE_SIZE_BYTES = 8 * 1024 * 1024;
export const LEGACY_FINANCIAL_IMPORT_MAX_JSON_FILE_SIZE_LABEL = '8 MB';

type LegacyImportFileLike = Pick<File, 'name' | 'size' | 'type' | 'text'>;

export type LegacyImportFileReadResult =
  | { ok: true; fileName: string; text: string }
  | { ok: false; error: string; fileName: string; text: '' };

export async function readLegacyImportJsonFile(
  file: LegacyImportFileLike,
  options: { maxSizeBytes?: number; maxSizeLabel?: string } = {},
): Promise<LegacyImportFileReadResult> {
  const fileName = file.name;
  const maxSizeBytes = options.maxSizeBytes ?? LEGACY_IMPORT_MAX_JSON_FILE_SIZE_BYTES;
  const maxSizeLabel = options.maxSizeLabel ?? LEGACY_IMPORT_MAX_JSON_FILE_SIZE_LABEL;
  const isJsonFile =
    fileName.toLowerCase().endsWith('.json') || file.type.toLowerCase() === 'application/json';

  if (!isJsonFile) {
    return { ok: false, error: 'Arquivo inválido.', fileName, text: '' };
  }

  if (file.size === 0) {
    return { ok: false, error: 'Arquivo JSON vazio.', fileName, text: '' };
  }

  if (file.size > maxSizeBytes) {
    return {
      ok: false,
      error: `Arquivo JSON excede o tamanho máximo permitido (${maxSizeLabel}).`,
      fileName,
      text: '',
    };
  }

  const text = await file.text();

  if (!text.trim()) {
    return { ok: false, error: 'Arquivo JSON vazio.', fileName, text: '' };
  }

  return { ok: true, fileName, text };
}
