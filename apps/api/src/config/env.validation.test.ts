import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation';

const strongSecret = '12345678901234567890123456789012';

function productionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://crm:secret@db.internal:5432/crm?schema=public',
    JWT_SECRET: strongSecret,
    CORS_ORIGIN: 'https://crm.example.com',
    WHATSAPP_TOKEN_ENCRYPTION_KEY: strongSecret,
    KIRAGO_WEBHOOK_TOKEN: `${strongSecret}-webhook`,
    BILLING_SCHEDULER_ENABLED: 'false',
    RECOVERY_SCHEDULER_ENABLED: 'false',
    CRM_API_PUBLIC_URL: 'https://api.example.com',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('accepts a complete production env', () => {
    const env = productionEnv();

    expect(validateEnv(env)).toBe(env);
  });

  it.each([
    [
      'billing true / recovery false',
      { BILLING_SCHEDULER_ENABLED: 'true', RECOVERY_SCHEDULER_ENABLED: 'false' },
    ],
    [
      'billing false / recovery true',
      { BILLING_SCHEDULER_ENABLED: 'false', RECOVERY_SCHEDULER_ENABLED: 'true' },
    ],
    [
      'billing false / recovery false',
      { BILLING_SCHEDULER_ENABLED: 'false', RECOVERY_SCHEDULER_ENABLED: 'false' },
    ],
    [
      'billing true / recovery true',
      { BILLING_SCHEDULER_ENABLED: 'true', RECOVERY_SCHEDULER_ENABLED: 'true' },
    ],
  ])('accepts explicit production scheduler flags: %s', (_label, overrides) => {
    const env = productionEnv(overrides);

    expect(validateEnv(env)).toBe(env);
  });

  it.each([
    ['weak JWT secret', { JWT_SECRET: 'secret' }],
    ['wildcard CORS', { CORS_ORIGIN: '*' }],
    ['HTTP production CORS', { CORS_ORIGIN: 'http://crm.example.com' }],
    ['missing billing scheduler flag', { BILLING_SCHEDULER_ENABLED: undefined }],
    ['missing recovery scheduler flag', { RECOVERY_SCHEDULER_ENABLED: undefined }],
    ['empty billing scheduler flag', { BILLING_SCHEDULER_ENABLED: '' }],
    ['empty recovery scheduler flag', { RECOVERY_SCHEDULER_ENABLED: '' }],
    ['uppercase billing scheduler true', { BILLING_SCHEDULER_ENABLED: 'TRUE' }],
    ['uppercase recovery scheduler true', { RECOVERY_SCHEDULER_ENABLED: 'TRUE' }],
    ['uppercase billing scheduler false', { BILLING_SCHEDULER_ENABLED: 'FALSE' }],
    ['uppercase recovery scheduler false', { RECOVERY_SCHEDULER_ENABLED: 'FALSE' }],
    ['zero billing scheduler flag', { BILLING_SCHEDULER_ENABLED: '0' }],
    ['zero recovery scheduler flag', { RECOVERY_SCHEDULER_ENABLED: '0' }],
    ['invalid billing scheduler flag', { BILLING_SCHEDULER_ENABLED: 'yes' }],
    ['invalid recovery scheduler flag', { RECOVERY_SCHEDULER_ENABLED: 'enabled' }],
    ['missing Kirago webhook token', { KIRAGO_WEBHOOK_TOKEN: undefined }],
    ['invalid provider encryption key', { WHATSAPP_TOKEN_ENCRYPTION_KEY: 'short' }],
  ])('rejects production env with %s', (_label, overrides) => {
    expect(() => validateEnv(productionEnv(overrides))).toThrow();
  });

  it.each([
    [
      'billing true / recovery missing',
      { BILLING_SCHEDULER_ENABLED: 'true', RECOVERY_SCHEDULER_ENABLED: undefined },
    ],
    [
      'billing missing / recovery false',
      { BILLING_SCHEDULER_ENABLED: undefined, RECOVERY_SCHEDULER_ENABLED: 'false' },
    ],
  ])('rejects production env with one scheduler flag missing: %s', (_label, overrides) => {
    expect(() => validateEnv(productionEnv(overrides))).toThrow();
  });
});
