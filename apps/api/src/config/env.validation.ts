import {
  assertProductionCorsOrigins,
  assertProductionSchedulerFlag,
  parseCorsOrigins,
} from './security';

type EnvConfig = Record<string, string | undefined>;

const weakSecretPatterns = [
  /^secret$/i,
  /^changeme$/i,
  /^change-me$/i,
  /^replace/i,
  /placeholder/i,
];

export function validateEnv(config: EnvConfig) {
  const nodeEnv = config.NODE_ENV ?? 'development';

  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_CLIENT_WRITE_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_MANUAL_SEND_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_MESSAGE_ACTIONS_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_MANUAL_MEDIA_ENABLED');
  validateOptionalCountryAllowlist(config, 'PHONE_INTERNATIONAL_MANUAL_MEDIA_COUNTRIES');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_MANUAL_VOICE_ENABLED');
  validateOptionalCountryAllowlist(config, 'PHONE_INTERNATIONAL_MANUAL_VOICE_COUNTRIES');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_MANUAL_PIX_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_MANUAL_TEXT_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_MESSAGE_ACTIONS_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_MANUAL_MEDIA_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_MANUAL_VOICE_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_PIX_BUTTONS_ENABLED');
  validateOptionalCountryAllowlist(config, 'PHONE_INTERNATIONAL_PIX_BUTTONS_COUNTRIES');
  validateOptionalBooleanFlag(config, 'PHONE_INTERNATIONAL_BILLING_ENABLED');
  validateOptionalBooleanFlag(config, 'MERCADO_PAGO_ENABLED');
  validateOptionalBooleanFlag(config, 'MERCADO_PAGO_SANDBOX_APRO_ENABLED');
  validateOptionalCountryAllowlist(config, 'PHONE_INTERNATIONAL_BILLING_COUNTRIES');
  validateOptionalEnum(config, 'MERCADO_PAGO_ENVIRONMENT', ['TEST', 'PRODUCTION']);
  validateOptionalPositiveInteger(config, 'MERCADO_PAGO_HTTP_TIMEOUT_MS');
  validateOptionalPositiveInteger(config, 'MERCADO_PAGO_ENVIRONMENT_PROOF_TTL_MINUTES');
  validateOptionalPositiveInteger(config, 'MERCADO_PAGO_WEBHOOK_MAX_AGE_MS');
  validateOptionalPositiveInteger(config, 'MERCADO_PAGO_WEBHOOK_FUTURE_TOLERANCE_MS');
  validateOptionalPositiveInteger(config, 'MERCADO_PAGO_WEBHOOK_LEASE_MS');

  if (config.MERCADO_PAGO_ENABLED === 'true') {
    requireValue(config, 'MERCADO_PAGO_ENVIRONMENT');
  }

  if (
    config.MERCADO_PAGO_SANDBOX_APRO_ENABLED === 'true' &&
    config.MERCADO_PAGO_ENVIRONMENT !== 'TEST'
  ) {
    throw new Error('MERCADO_PAGO_SANDBOX_APRO_ENABLED exige MERCADO_PAGO_ENVIRONMENT=TEST.');
  }

  if (nodeEnv === 'production') {
    requireValue(config, 'DATABASE_URL');
    requireValue(config, 'JWT_SECRET');
    requireStrongSecret(config.JWT_SECRET, 'JWT_SECRET');
    requireValue(config, 'CORS_ORIGIN');
    assertProductionCorsOrigins(parseCorsOrigins(config.CORS_ORIGIN!));
    requireTokenEncryptionKey(config);
    requireValue(config, 'KIRAGO_WEBHOOK_TOKEN');
    requireStrongSecret(config.KIRAGO_WEBHOOK_TOKEN, 'KIRAGO_WEBHOOK_TOKEN');
    assertProductionSchedulerFlag('BILLING_SCHEDULER_ENABLED', config.BILLING_SCHEDULER_ENABLED);
    assertProductionSchedulerFlag('RECOVERY_SCHEDULER_ENABLED', config.RECOVERY_SCHEDULER_ENABLED);
    validatePublicUrl(config.CRM_API_PUBLIC_URL, 'CRM_API_PUBLIC_URL');
    validateOptionalPublicUrl(config.CRM_PUBLIC_URL, 'CRM_PUBLIC_URL');
    validateOptionalPublicUrl(config.FASTDEPIX_NOTIFICATION_URL, 'FASTDEPIX_NOTIFICATION_URL');
    validateOptionalPublicUrl(config.MERCADO_PAGO_API_BASE_URL, 'MERCADO_PAGO_API_BASE_URL');
    validateOptionalPublicUrl(
      config.MERCADO_PAGO_IDENTITY_BASE_URL,
      'MERCADO_PAGO_IDENTITY_BASE_URL',
    );
  }

  return config;
}

function validateOptionalCountryAllowlist(config: EnvConfig, key: string) {
  const value = config[key];
  if (value === undefined || value === '') return;

  const countries = value.split(',').map((country) => country.trim());
  if (countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
    throw new Error(`${key} deve conter codigos ISO alpha-2 maiusculos separados por virgula.`);
  }
}

function validateOptionalBooleanFlag(config: EnvConfig, key: string) {
  const value = config[key];
  if (value !== undefined && value !== 'true' && value !== 'false') {
    throw new Error(`${key} deve ser true ou false.`);
  }
}

function validateOptionalEnum(config: EnvConfig, key: string, accepted: string[]) {
  const value = config[key];
  if (value !== undefined && !accepted.includes(value)) {
    throw new Error(`${key} deve ser um de: ${accepted.join(', ')}.`);
  }
}

function validateOptionalPositiveInteger(config: EnvConfig, key: string) {
  const value = config[key];
  if (value === undefined || value === '') return;
  if (!/^\d+$/.test(value) || Number(value) < 1_000) {
    throw new Error(`${key} deve ser inteiro maior ou igual a 1000.`);
  }
}

function requireValue(config: EnvConfig, key: string) {
  if (!config[key]?.trim()) {
    throw new Error(`${key} e obrigatorio em production.`);
  }
}

function requireStrongSecret(value: string | undefined, key: string) {
  const trimmed = value?.trim() ?? '';

  if (trimmed.length < 32 || weakSecretPatterns.some((pattern) => pattern.test(trimmed))) {
    throw new Error(`${key} deve ter ao menos 32 caracteres e nao pode ser placeholder.`);
  }
}

function requireTokenEncryptionKey(config: EnvConfig) {
  const key = config.PAYMENT_TOKEN_ENCRYPTION_KEY ?? config.WHATSAPP_TOKEN_ENCRYPTION_KEY;

  if (!key) {
    throw new Error('WHATSAPP_TOKEN_ENCRYPTION_KEY ou PAYMENT_TOKEN_ENCRYPTION_KEY e obrigatoria.');
  }

  if (Buffer.from(key, 'utf8').length !== 32) {
    throw new Error('Chave de criptografia de providers deve ter 32 bytes.');
  }
}

function validatePublicUrl(value: string | undefined, key: string) {
  requireValue({ [key]: value }, key);
  validateOptionalPublicUrl(value, key);
}

function validateOptionalPublicUrl(value: string | undefined, key: string) {
  const trimmed = value?.trim();
  if (!trimmed) return;

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${key} deve ser URL valida.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${key} deve usar HTTPS em production.`);
  }
}
