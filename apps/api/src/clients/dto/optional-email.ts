import { Transform } from 'class-transformer';

export function NormalizeOptionalEmail() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;

    const trimmed = value.trim();
    return trimmed || null;
  });
}
