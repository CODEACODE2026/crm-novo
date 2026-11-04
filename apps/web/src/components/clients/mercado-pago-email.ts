const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeMercadoPagoPayerEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function isValidMercadoPagoPayerEmail(value: string | null | undefined) {
  const normalized = normalizeMercadoPagoPayerEmail(value);
  return normalized.length <= 254 && emailPattern.test(normalized);
}

export function mercadoPagoPayerEmailOrNull(value: string | null | undefined) {
  const normalized = normalizeMercadoPagoPayerEmail(value);
  return isValidMercadoPagoPayerEmail(normalized) ? normalized : null;
}
