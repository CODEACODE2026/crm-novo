import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8');
const migration = read(
  'prisma',
  'migrations',
  '20261027190000_add_billing_pix_orphan_webhook_correlation',
  'migration.sql',
);
const rollback = read(
  'prisma',
  'migrations',
  '20261027190000_add_billing_pix_orphan_webhook_correlation',
  'rollback.sql',
);
const data1 = read(
  'prisma',
  'migrations',
  '20261024160000_add_billing_execution_data_foundation',
  'migration.sql',
);
const quarantine = read(
  'prisma',
  'migrations',
  '20261027141000_add_billing_pix_orphan_webhook_quarantine',
  'migration.sql',
);

describe('Billing PIX orphan webhook correlation migration contract', () => {
  it('preserves DATA1 and 7A byte-for-byte', () => {
    expect(createHash('sha256').update(data1).digest('hex')).toBe(
      '1ac07f4ecdebf8bb744cbddfab54f344fd16d4465b3c3d4e77b41f84e88b0df6',
    );
    expect(createHash('sha256').update(quarantine).digest('hex')).toBe(
      '96d1c5bc4063a9cc6dbcab08ba572ed0e398b02de4aff327447096433c89b491',
    );
  });

  it('adds an immutable decision ledger and one immutable claim per evidence', () => {
    expect(migration).toContain('billing_pix_orphan_webhook_correlation_events');
    expect(migration).toContain('billing_pix_orphan_webhook_correlation_claims');
    expect(migration).toContain('Billing orphan webhook correlation records are immutable');
    expect(migration).toContain('PRIMARY KEY ("orphanWebhookEventId")');
    expect(migration).toContain('UNIQUE ("decisionDigest")');
    expect(migration).toContain("'REVIEW_REQUIRED', 'CORRELATED', 'CONFLICT_DETECTED'");
    expect(migration).not.toMatch(
      /(?:UPDATE|DELETE\s+FROM)\s+public\."billing_pix_orphan_webhook_events"/u,
    );
  });

  it('requires SERIALIZABLE HMAC-bound privileged operations and minimum ACLs', () => {
    expect(migration).toContain('billing.pix.analyze-orphan-webhook');
    expect(migration).toContain('billing.pix.correlate-orphan-webhook');
    expect(migration).toContain("current_setting('transaction_isolation') <> 'serializable'");
    expect(migration).toContain('billing-operation-args:v1');
    expect(migration).toContain('billing-actor:v2');
    expect(migration).toContain('SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp');
    expect(migration).toContain('Billing actor assertion was already consumed');
    expect(migration).toContain(
      'REVOKE ALL ON public."billing_pix_orphan_webhook_correlation_events" FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.billing_pix_correlate_orphan_webhook',
    );
  });

  it('revalidates durable identity without settling or creating finance records', () => {
    expect(migration).toContain(
      'a."providerTransactionId" = evidence_record."providerTransactionId"',
    );
    expect(migration).toContain("'billing-pix-creation:v1'");
    expect(migration).toContain("'billing-execution:v2:'");
    expect(migration).toContain('FINANCIAL_SNAPSHOT_MISMATCH');
    expect(migration).toContain('PAYMENT_INTENT_SET_MISMATCH');
    expect(migration).not.toMatch(/INSERT INTO public\."payment_intents"/u);
    expect(migration).not.toMatch(
      /UPDATE public\."(?:receivables|payment_intents|billing_pix_attempts)"/u,
    );
  });

  it('ships an explicit pre-activation rollback that leaves DATA1 and 7A intact', () => {
    expect(rollback).toContain('Manual rollback for an unactivated Task 7C deployment only');
    expect(rollback).toContain(
      'DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_correlation_claims"',
    );
    expect(rollback).not.toContain(
      'DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_events"',
    );
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public."billing_executions"');
  });
});
