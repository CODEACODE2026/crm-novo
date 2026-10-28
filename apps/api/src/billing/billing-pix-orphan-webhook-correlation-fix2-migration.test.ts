import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const migration = read(
  'prisma',
  'migrations',
  '20261027203500_allow_correlated_pix_intent_enrichment',
  'migration.sql',
);
const rollback = read(
  'prisma',
  'migrations',
  '20261027203500_allow_correlated_pix_intent_enrichment',
  'rollback.sql',
);

describe('Billing PIX orphan correlation FIX2 migration contract', () => {
  it('preserves DATA1, 7A, 7C and FIX1 byte-for-byte', () => {
    const expected = [
      [
        '20261024160000_add_billing_execution_data_foundation',
        '1ac07f4ecdebf8bb744cbddfab54f344fd16d4465b3c3d4e77b41f84e88b0df6',
      ],
      [
        '20261027141000_add_billing_pix_orphan_webhook_quarantine',
        '96d1c5bc4063a9cc6dbcab08ba572ed0e398b02de4aff327447096433c89b491',
      ],
      [
        '20261027190000_add_billing_pix_orphan_webhook_correlation',
        'd23098e25d63c87a1f0655c4e3d7f37abdeb5e318a8f2cc041b24337ce61e390',
      ],
      [
        '20261027195500_enforce_billing_pix_orphan_claim_integrity',
        '589b8cfffcd7716e46159dbecf22ffeb62e897ddeebbedcd3531204e3c55318b',
      ],
    ] as const;
    for (const [directory, digest] of expected) {
      expect(
        createHash('sha256')
          .update(read('prisma', 'migrations', directory, 'migration.sql'))
          .digest('hex'),
      ).toBe(digest);
    }
  });

  it('keeps four identity fields sealed and permits only first intent enrichment', () => {
    for (const field of [
      'billingExecutionId',
      'provider',
      'providerTransactionId',
      'creationKey',
    ]) {
      expect(migration).toContain(`NEW."${field}" IS DISTINCT FROM OLD."${field}"`);
    }
    expect(migration).toContain(
      'OLD."paymentIntentId" IS NOT NULL OR NEW."paymentIntentId" IS NULL',
    );
    expect(migration).toContain('intent_record."id" IS NULL');
    expect(migration).toContain('intent_record."origin" IS DISTINCT FROM \'BILLING\'');
    expect(migration).toContain('intent_record."provider" IS DISTINCT FROM OLD."provider"');
    expect(migration).toContain(
      'intent_record."providerTransactionId" IS DISTINCT FROM OLD."providerTransactionId"',
    );
    expect(migration).toContain('intent_record."creationKey" IS DISTINCT FROM OLD."creationKey"');
  });

  it('proves amount, individual/grouped set and overlap in PostgreSQL', () => {
    expect(migration).toContain('intent_record."amount" IS DISTINCT FROM snapshot_amount');
    expect(migration).toContain('Billing PIX individual intent does not match');
    expect(migration).toContain('Billing PIX payment group does not match the exact');
    expect(migration).toContain('EXCEPT');
    expect(migration).toContain('overlaps another active financial intent');
    expect(migration).toContain('pg_catalog.pg_try_advisory_xact_lock');
    expect(migration).toContain("USING ERRCODE = '40001'");
  });

  it('retains fixed-path SECURITY DEFINER and restores FIX1 on rollback', () => {
    expect(migration).toContain(
      '$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_preserve_attempt_identity() FROM PUBLIC',
    );
    expect(migration).not.toMatch(/EXECUTE\s+[^;]*\$\$/u);
    expect(rollback).toContain('NEW."paymentIntentId" IS DISTINCT FROM OLD."paymentIntentId"');
    expect(rollback).not.toContain('DROP TABLE');
    expect(rollback).not.toContain('DROP TRIGGER');
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/u);
  });
});
