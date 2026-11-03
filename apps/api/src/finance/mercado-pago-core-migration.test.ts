import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261101211000_add_mercado_pago_payment_provider/migration.sql',
);

describe('Mercado Pago CORE1 migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds the provider and credential environment without destructive statements', () => {
    expect(sql).toContain(`ALTER TYPE "PaymentProviderCode" ADD VALUE 'MERCADO_PAGO'`);
    expect(sql).toContain(
      `CREATE TYPE "PaymentProviderEnvironment" AS ENUM ('TEST', 'PRODUCTION')`,
    );
    expect(sql).toContain(
      `ADD COLUMN "environment" "PaymentProviderEnvironment" NOT NULL DEFAULT 'PRODUCTION'`,
    );
    expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });
});
