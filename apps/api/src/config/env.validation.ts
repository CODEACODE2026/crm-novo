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
  }

  return config;
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
