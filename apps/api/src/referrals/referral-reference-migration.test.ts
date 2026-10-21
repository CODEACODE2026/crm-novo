import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261021010500_add_referral_reference_target/migration.sql',
  ),
  'utf8',
);
const preflight = readFileSync(
  join(process.cwd(), 'prisma/preflight/referral-reference1.sql'),
  'utf8',
);

describe('referral reference target migration', () => {
  it('applies the backfill and constraint replacement atomically', () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration.indexOf('BEGIN;')).toBeLessThan(migration.indexOf('ALTER TABLE "referrals"'));
    expect(migration.lastIndexOf('COMMIT;')).toBeGreaterThan(
      migration.indexOf(
        'ADD CONSTRAINT "referrals_referredClientReferenceId_referredClientId_fkey"',
      ),
    );
  });

  it('keeps legacy targets nullable and backfills only from recorded activation evidence', () => {
    expect(schema).toContain('referredClientReferenceId String?');
    expect(migration).toContain('referral."qualificationReceivableId" = receivable."id"');
    expect(migration).toContain('receivable."purpose" = \'INITIAL_ACTIVATION\'');
    expect(migration).toContain('reference."clientId" = referral."referredClientId"');
    expect(migration).not.toMatch(/ORDER BY[\s\S]*UPDATE\s+"referrals"/i);
    expect(migration).not.toContain('LIMIT 1');
  });

  it('enforces exact-reference uniqueness, legacy uniqueness and client ownership', () => {
    expect(migration).toContain('"referrals_referredClientReferenceId_key"');
    expect(migration).toContain('"referrals_legacy_referredClientId_key"');
    expect(migration).toContain('WHERE "referredClientReferenceId" IS NULL');
    expect(migration).toContain('FOREIGN KEY ("referredClientReferenceId", "referredClientId")');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).toContain('"referrals_qualificationReceivableId_key"');
  });

  it('ships a production preflight made only of read-only queries', () => {
    expect(preflight).toContain('qualificationReceivableId');
    expect(preflight).toContain('clientReferenceId');
    expect(preflight).toContain('receivable.id IS NULL');
    expect(preflight).toContain('deterministicReferenceId');
    expect(preflight).toContain('ARRAY_AGG(referral.id ORDER BY referral.id)');
    expect(preflight).toContain('HAVING COUNT(*) > 1');
    expect(preflight).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
  });
});
