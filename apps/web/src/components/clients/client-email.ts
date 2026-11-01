export function normalizeOptionalEmailInput(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

export function resolveClientEmailUpdate(
  initialValue: string | null | undefined,
  currentValue: string,
) {
  const initial = normalizeOptionalEmailInput(initialValue ?? '');
  const current = normalizeOptionalEmailInput(currentValue);

  return initial === current ? undefined : current;
}
