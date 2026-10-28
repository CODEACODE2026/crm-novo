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
  validateOptionalCountryAllowlist(config, 'PHONE_INTERNATIONAL_BILLING_COUNTRIES');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_BILLING_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_BILLING_PIX_ENABLED');
  validateOptionalBooleanFlag(config, 'PHONE_GLOBAL_BILLING_SEND_ENABLED');
  validateOptionalIsoInstant(config, 'PHONE_GLOBAL_BILLING_EFFECTIVE_FROM');
  validateGlobalBillingRollout(config);

  if (nodeEnv === 'production') {
    requireValue(config, 'DATABASE_URL');
    requireValue(config, 'JWT_SECRET');
    requireStrongSecret(config.JWT_SECRET, 'JWT_SECRET');
    requireValue(config, 'CORS_ORIGIN');
    assertProductionCorsOrigins(parseCorsOrigins(config.CORS_ORIGIN!));
    requireTokenEncryptionKey(config);
    requireValue(config, 'KIRAGO_WEBHOOK_TOKEN');
    requireStrongSecret(config.KIRAGO_WEBHOOK_TOKEN, 'KIRAGO_WEBHOOK_TOKEN');
    validateBillingActorAttestationSecrets(config);
    assertProductionSchedulerFlag('BILLING_SCHEDULER_ENABLED', config.BILLING_SCHEDULER_ENABLED);
    assertProductionSchedulerFlag('RECOVERY_SCHEDULER_ENABLED', config.RECOVERY_SCHEDULER_ENABLED);
    validatePublicUrl(config.CRM_API_PUBLIC_URL, 'CRM_API_PUBLIC_URL');
    validateOptionalPublicUrl(config.CRM_PUBLIC_URL, 'CRM_PUBLIC_URL');
    validateOptionalPublicUrl(config.FASTDEPIX_NOTIFICATION_URL, 'FASTDEPIX_NOTIFICATION_URL');
  }

  return config;
}

function validateBillingActorAttestationSecrets(config: EnvConfig) {
  const secrets = ['USER', 'SYSTEM', 'WEBHOOK'] as const;
  for (const actorType of secrets) {
    const keyId = `BILLING_ACTOR_${actorType}_KEY_ID`;
    const secret = `BILLING_ACTOR_${actorType}_SIGNING_SECRET`;
    requireValue(config, keyId);
    requireStrongSecret(config[secret], secret);
  }
  const values = secrets.map((actorType) => config[`BILLING_ACTOR_${actorType}_SIGNING_SECRET`]);
  if (new Set(values).size !== values.length) {
    throw new Error('Billing actor signing secrets must be distinct per trusted principal.');
  }
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

function validateOptionalIsoInstant(config: EnvConfig, key: string) {
  const value = config[key]?.trim();
  if (!value) return;

  const hasExplicitTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(value);
  if (!hasExplicitTimezone || Number.isNaN(Date.parse(value))) {
    throw new Error(`${key} deve ser um instante ISO-8601 com timezone explicito.`);
  }
}

function validateGlobalBillingRollout(config: EnvConfig) {
  const eligibilityEnabled = config.PHONE_GLOBAL_BILLING_ENABLED === 'true';
  const pixEnabled = config.PHONE_GLOBAL_BILLING_PIX_ENABLED === 'true';
  const sendEnabled = config.PHONE_GLOBAL_BILLING_SEND_ENABLED === 'true';

  if (eligibilityEnabled && !config.PHONE_GLOBAL_BILLING_EFFECTIVE_FROM?.trim()) {
    throw new Error(
      'PHONE_GLOBAL_BILLING_EFFECTIVE_FROM e obrigatoria quando PHONE_GLOBAL_BILLING_ENABLED=true.',
    );
  }

  if (pixEnabled && !eligibilityEnabled) {
    throw new Error('PHONE_GLOBAL_BILLING_PIX_ENABLED exige PHONE_GLOBAL_BILLING_ENABLED=true.');
  }

  if (sendEnabled && !pixEnabled) {
    throw new Error(
      'PHONE_GLOBAL_BILLING_SEND_ENABLED exige PHONE_GLOBAL_BILLING_PIX_ENABLED=true.',
    );
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
