import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261102134500_add_payment_intent_provider_external_reference/migration.sql',
);

describe('Mercado Pago WEBHOOK1 migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds only nullable provider environment and external reference columns', () => {
    expect(sql).toContain(`ADD COLUMN "providerEnvironment" "PaymentProviderEnvironment"`);
    expect(sql).toContain(`ADD COLUMN "providerExternalReference" TEXT`);
    expect(sql).toContain(`"payment_intents_mercado_pago_payment_id_key"`);
    expect(sql).toContain(`"payment_intents_mercado_pago_external_reference_key"`);
    expect(sql.match(/WHERE "provider" = 'MERCADO_PAGO'/g)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  });
});
