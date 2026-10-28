import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const migration = read(
  'prisma',
  'migrations',
  '20261027195500_enforce_billing_pix_orphan_claim_integrity',
  'migration.sql',
);
const rollback = read(
  'prisma',
  'migrations',
  '20261027195500_enforce_billing_pix_orphan_claim_integrity',
  'rollback.sql',
);

describe('Billing PIX orphan correlation FIX1 migration contract', () => {
  it('preserves DATA1, 7A and the original 7C migration byte-for-byte', () => {
    expect(
      createHash('sha256')
        .update(
          read(
            'prisma',
            'migrations',
            '20261024160000_add_billing_execution_data_foundation',
            'migration.sql',
          ),
        )
        .digest('hex'),
    ).toBe('1ac07f4ecdebf8bb744cbddfab54f344fd16d4465b3c3d4e77b41f84e88b0df6');
    expect(
      createHash('sha256')
        .update(
          read(
            'prisma',
            'migrations',
            '20261027141000_add_billing_pix_orphan_webhook_quarantine',
            'migration.sql',
          ),
        )
        .digest('hex'),
    ).toBe('96d1c5bc4063a9cc6dbcab08ba572ed0e398b02de4aff327447096433c89b491');
    expect(
      createHash('sha256')
        .update(
          read(
            'prisma',
            'migrations',
            '20261027190000_add_billing_pix_orphan_webhook_correlation',
            'migration.sql',
          ),
        )
        .digest('hex'),
    ).toBe('d23098e25d63c87a1f0655c4e3d7f37abdeb5e318a8f2cc041b24337ce61e390');
  });

  it('validates the complete event, evidence, attempt and execution identity on INSERT', () => {
    expect(migration).toContain(
      'BEFORE INSERT ON public."billing_pix_orphan_webhook_correlation_claims"',
    );
    expect(migration).toContain('decision_record."decision" IS DISTINCT FROM \'CORRELATED\'');
    for (const field of [
      'orphanWebhookEventId',
      'billingPixAttemptId',
      'billingExecutionId',
      'paymentIntentId',
      'provider',
      'providerTransactionId',
      'creationKey',
      'financialSetDigest',
    ]) {
      expect(migration).toContain(`decision_record."${field}" IS DISTINCT FROM NEW."${field}"`);
    }
    expect(migration).toContain(
      'attempt_record."billingExecutionId" IS DISTINCT FROM NEW."billingExecutionId"',
    );
    expect(migration).toContain(
      'execution_record."receivableSetHash"::text IS DISTINCT FROM NEW."financialSetDigest"',
    );
    expect(migration).toContain("USING ERRCODE = '23514'");
  });

  it('uses fixed-path privileged guards and seals a claimed attempt identity', () => {
    expect(migration).toContain(
      '$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp',
    );
    expect(migration).toContain('FOR KEY SHARE');
    expect(migration.match(/FOR UPDATE;/gu)).toHaveLength(2);
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain('billing_pix_orphan_claim_preserve_attempt_identity_trigger');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.billing_pix_orphan_claim_validate_insert() FROM PUBLIC',
    );
    expect(migration).not.toMatch(/EXECUTE\s+[^;]*\$\$/u);
  });

  it('rolls back only FIX1 guards and preserves every 7C table and function', () => {
    expect(rollback).toContain(
      'DROP TRIGGER IF EXISTS billing_pix_orphan_claim_validate_insert_trigger',
    );
    expect(rollback).toContain(
      'DROP FUNCTION IF EXISTS public.billing_pix_orphan_claim_validate_insert()',
    );
    expect(rollback).not.toContain('DROP TABLE');
    expect(rollback).not.toContain('billing_pix_correlate_orphan_webhook');
    expect(rollback.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/u);
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/u);
  });
});
