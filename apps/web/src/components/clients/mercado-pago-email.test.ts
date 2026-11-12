import { describe, expect, it } from 'vitest';
import {
  isValidMercadoPagoPayerEmail,
  mercadoPagoPayerEmailOrNull,
  normalizeMercadoPagoPayerEmail,
} from './mercado-pago-email';

describe('Mercado Pago payer email UI contract', () => {
  it('normalizes a registered client email', () => {
    expect(normalizeMercadoPagoPayerEmail('  Cliente@Example.COM ')).toBe('cliente@example.com');
  });

  it.each(['', 'sem-arroba', 'cliente@', '@example.com', 'cliente @example.com'])(
    'rejects invalid email %j',
    (email) => expect(isValidMercadoPagoPayerEmail(email)).toBe(false),
  );

  it('returns null for missing or invalid email and the normalized value when valid', () => {
    expect(mercadoPagoPayerEmailOrNull(null)).toBeNull();
    expect(mercadoPagoPayerEmailOrNull('invalido')).toBeNull();
    expect(mercadoPagoPayerEmailOrNull(' cliente@example.com ')).toBe('cliente@example.com');
  });
});
