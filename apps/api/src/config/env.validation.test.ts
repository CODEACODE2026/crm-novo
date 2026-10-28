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
    BILLING_ACTOR_USER_KEY_ID: 'user-v1',
    BILLING_ACTOR_USER_SIGNING_SECRET: `${strongSecret}-user`,
    BILLING_ACTOR_SYSTEM_KEY_ID: 'system-v1',
    BILLING_ACTOR_SYSTEM_SIGNING_SECRET: `${strongSecret}-system`,
    BILLING_ACTOR_WEBHOOK_KEY_ID: 'webhook-v1',
    BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: `${strongSecret}-billing-webhook`,
    BILLING_SCHEDULER_ENABLED: 'false',
    RECOVERY_SCHEDULER_ENABLED: 'false',
    CRM_API_PUBLIC_URL: 'https://api.example.com',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('defaults the international phone feature to disabled when absent', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).PHONE_INTERNATIONAL_ENABLED).toBeUndefined();
  });

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_ENABLED: value,
    });
  });

  it.each(['TRUE', '1', 'yes', ''])('rejects invalid PHONE_INTERNATIONAL_ENABLED=%j', (value) => {
    expect(() => validateEnv({ PHONE_INTERNATIONAL_ENABLED: value })).toThrow(
      'PHONE_INTERNATIONAL_ENABLED deve ser true ou false.',
    );
  });

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED: value,
    });
  });

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED: value,
    });
  });

  it.each(['TEXT', 'MEDIA', 'VOICE'] as const)(
    'keeps global manual %s disabled when absent and validates its kill switch',
    (operation) => {
      const key = `PHONE_GLOBAL_MANUAL_${operation}_ENABLED`;
      expect(validateEnv({ NODE_ENV: 'test' })[key]).toBeUndefined();
      expect(validateEnv({ [key]: 'true' })).toMatchObject({ [key]: 'true' });
      expect(() => validateEnv({ [key]: 'yes' })).toThrow(`${key} deve ser true ou false.`);
    },
  );

  it('keeps global message actions disabled when absent and validates its kill switch', () => {
    const key = 'PHONE_GLOBAL_MESSAGE_ACTIONS_ENABLED';
    expect(validateEnv({ NODE_ENV: 'test' })[key]).toBeUndefined();
    expect(validateEnv({ [key]: 'false' })).toMatchObject({ [key]: 'false' });
    expect(() => validateEnv({ [key]: '1' })).toThrow(`${key} deve ser true ou false.`);
  });

  it.each(['MEDIA', 'VOICE'] as const)(
    'defaults international manual %s and its country allowlist to disabled',
    (operation) => {
      const env = validateEnv({ NODE_ENV: 'test' });
      expect(env[`PHONE_INTERNATIONAL_MANUAL_${operation}_ENABLED`]).toBeUndefined();
      expect(env[`PHONE_INTERNATIONAL_MANUAL_${operation}_COUNTRIES`]).toBeUndefined();
    },
  );

  it.each(['MEDIA', 'VOICE'] as const)(
    'accepts the controlled international manual %s configuration',
    (operation) => {
      expect(
        validateEnv({
          [`PHONE_INTERNATIONAL_MANUAL_${operation}_ENABLED`]: 'true',
          [`PHONE_INTERNATIONAL_MANUAL_${operation}_COUNTRIES`]: ' US,US, PT ',
        }),
      ).toMatchObject({
        [`PHONE_INTERNATIONAL_MANUAL_${operation}_ENABLED`]: 'true',
        [`PHONE_INTERNATIONAL_MANUAL_${operation}_COUNTRIES`]: ' US,US, PT ',
      });
    },
  );

  it.each(['MEDIA', 'VOICE'] as const)(
    'rejects invalid international manual %s configuration',
    (operation) => {
      expect(() =>
        validateEnv({ [`PHONE_INTERNATIONAL_MANUAL_${operation}_ENABLED`]: 'yes' }),
      ).toThrow(`PHONE_INTERNATIONAL_MANUAL_${operation}_ENABLED deve ser true ou false.`);
      expect(() =>
        validateEnv({ [`PHONE_INTERNATIONAL_MANUAL_${operation}_COUNTRIES`]: 'US, pt' }),
      ).toThrow(
        `PHONE_INTERNATIONAL_MANUAL_${operation}_COUNTRIES deve conter codigos ISO alpha-2 maiusculos separados por virgula.`,
      );
    },
  );

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED: value,
    });
  });

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED: value,
    });
  });

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED: value,
    });
  });

  it('defaults international PIX buttons and their country allowlist to disabled', () => {
    const env = validateEnv({ NODE_ENV: 'test' });
    expect(env.PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED).toBeUndefined();
    expect(env.PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES).toBeUndefined();
  });

  it('accepts a controlled international PIX buttons country allowlist', () => {
    expect(validateEnv({ PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES: ' US,US, PT ' })).toMatchObject(
      {
        PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES: ' US,US, PT ',
      },
    );
  });

  it.each(['us', 'USA', 'US, pt', 'US,,PT'])(
    'rejects invalid international PIX buttons country allowlist %j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES: value })).toThrow(
        'PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES deve conter codigos ISO alpha-2 maiusculos separados por virgula.',
      );
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED deve ser true ou false.',
      );
    },
  );

  it.each(['true', 'false'])('accepts PHONE_INTERNATIONAL_BILLING_ENABLED=%s', (value) => {
    expect(validateEnv({ PHONE_INTERNATIONAL_BILLING_ENABLED: value })).toMatchObject({
      PHONE_INTERNATIONAL_BILLING_ENABLED: value,
    });
  });

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_BILLING_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_BILLING_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_BILLING_ENABLED deve ser true ou false.',
      );
    },
  );

  it('keeps global Billing disabled when absent and validates its independent kill switch', () => {
    expect(validateEnv({ NODE_ENV: 'test' }).PHONE_GLOBAL_BILLING_ENABLED).toBeUndefined();
    expect(
      validateEnv({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T00:00:00-03:00',
      }),
    ).toMatchObject({
      PHONE_GLOBAL_BILLING_ENABLED: 'true',
      PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T00:00:00-03:00',
    });
    expect(validateEnv({ PHONE_GLOBAL_BILLING_ENABLED: 'false' })).toMatchObject({
      PHONE_GLOBAL_BILLING_ENABLED: 'false',
    });
    expect(() => validateEnv({ PHONE_GLOBAL_BILLING_ENABLED: 'yes' })).toThrow(
      'PHONE_GLOBAL_BILLING_ENABLED deve ser true ou false.',
    );
  });

  it('requires an explicit temporal cutoff before enabling global Billing', () => {
    expect(() => validateEnv({ PHONE_GLOBAL_BILLING_ENABLED: 'true' })).toThrow(
      'PHONE_GLOBAL_BILLING_EFFECTIVE_FROM e obrigatoria',
    );
    expect(() =>
      validateEnv({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01',
      }),
    ).toThrow('PHONE_GLOBAL_BILLING_EFFECTIVE_FROM deve ser um instante ISO-8601');
  });

  it('keeps global PIX and send controls independent and fail-closed', () => {
    const defaults = validateEnv({ NODE_ENV: 'test' });
    expect(defaults.PHONE_GLOBAL_BILLING_PIX_ENABLED).toBeUndefined();
    expect(defaults.PHONE_GLOBAL_BILLING_SEND_ENABLED).toBeUndefined();
    expect(() => validateEnv({ PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true' })).toThrow(
      'PHONE_GLOBAL_BILLING_PIX_ENABLED exige PHONE_GLOBAL_BILLING_ENABLED=true.',
    );
    expect(() =>
      validateEnv({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00Z',
        PHONE_GLOBAL_BILLING_SEND_ENABLED: 'true',
      }),
    ).toThrow('PHONE_GLOBAL_BILLING_SEND_ENABLED exige PHONE_GLOBAL_BILLING_PIX_ENABLED=true.');
    expect(
      validateEnv({
        PHONE_GLOBAL_BILLING_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_EFFECTIVE_FROM: '2026-11-01T03:00:00Z',
        PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
        PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
      }),
    ).toMatchObject({
      PHONE_GLOBAL_BILLING_PIX_ENABLED: 'true',
      PHONE_GLOBAL_BILLING_SEND_ENABLED: 'false',
    });
  });

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid global Billing operation flags %j',
    (value) => {
      expect(() => validateEnv({ PHONE_GLOBAL_BILLING_PIX_ENABLED: value })).toThrow(
        'PHONE_GLOBAL_BILLING_PIX_ENABLED deve ser true ou false.',
      );
      expect(() => validateEnv({ PHONE_GLOBAL_BILLING_SEND_ENABLED: value })).toThrow(
        'PHONE_GLOBAL_BILLING_SEND_ENABLED deve ser true ou false.',
      );
    },
  );

  it('accepts a controlled international Billing country allowlist', () => {
    expect(validateEnv({ PHONE_INTERNATIONAL_BILLING_COUNTRIES: 'US,PT' })).toMatchObject({
      PHONE_INTERNATIONAL_BILLING_COUNTRIES: 'US,PT',
    });
  });

  it('accepts spaces and duplicate valid countries without broadening the allowlist', () => {
    expect(validateEnv({ PHONE_INTERNATIONAL_BILLING_COUNTRIES: ' US,US, PT ' })).toMatchObject({
      PHONE_INTERNATIONAL_BILLING_COUNTRIES: ' US,US, PT ',
    });
  });

  it.each(['us', 'USA', 'US, pt', 'US,,PT'])(
    'rejects invalid international Billing country allowlist %j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_BILLING_COUNTRIES: value })).toThrow(
        'PHONE_INTERNATIONAL_BILLING_COUNTRIES deve conter codigos ISO alpha-2 maiusculos separados por virgula.',
      );
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED deve ser true ou false.',
      );
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED deve ser true ou false.',
      );
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED deve ser true ou false.',
      );
    },
  );

  it.each(['TRUE', '1', 'yes', ''])(
    'rejects invalid PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED=%j',
    (value) => {
      expect(() => validateEnv({ PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED: value })).toThrow(
        'PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED deve ser true ou false.',
      );
    },
  );
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
    ['missing Billing USER key id', { BILLING_ACTOR_USER_KEY_ID: undefined }],
    ['weak Billing SYSTEM secret', { BILLING_ACTOR_SYSTEM_SIGNING_SECRET: 'weak' }],
    [
      'reused Billing signing secret',
      { BILLING_ACTOR_WEBHOOK_SIGNING_SECRET: `${strongSecret}-system` },
    ],
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
