import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'prisma/migrations/20261102162500_add_mercado_pago_environment_proof/migration.sql',
);

describe('Mercado Pago ENV-PROOF-FIX1 migration', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('adds only nullable proof and immutable intent-binding columns', () => {
    expect(sql).toContain('ADD COLUMN "environmentProofStatus" TEXT');
    expect(sql).toContain('ADD COLUMN "environmentProofEnvironment" "PaymentProviderEnvironment"');
    expect(sql).toContain('ADD COLUMN "environmentProofCredentialFingerprint" TEXT');
    expect(sql).toContain('ADD COLUMN "providerCredentialId" UUID');
    expect(sql).toContain('ADD COLUMN "providerApplicationId" TEXT');
    expect(sql).toContain('"payment_intents_providerCredentialId_fkey"');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE|UPDATE)\s/im);
  });
});
