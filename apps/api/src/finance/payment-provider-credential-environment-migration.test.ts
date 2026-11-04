import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261102230000_scope_active_payment_credentials_by_environment/migration.sql',
  ),
  'utf8',
);

describe('payment provider credential environment migration', () => {
  it('replaces the provider-only partial unique index without mutating credential rows', () => {
    expect(migration).toContain(
      'DROP INDEX IF EXISTS "payment_provider_credentials_one_active_provider_v1_idx"',
    );
    expect(migration).toContain('payment_provider_credentials_one_active_non_mp_provider_v2_idx');
    expect(migration).toContain('payment_provider_credentials_one_active_mp_environment_v1_idx');
    expect(migration).toContain('("provider", "environment")');
    expect(migration).toContain('"provider" = \'MERCADO_PAGO\'');
    expect(migration).toContain('"provider" <> \'MERCADO_PAGO\'');
    expect(migration).not.toMatch(/\b(?:DELETE|UPDATE|INSERT)\b/i);
  });
});
