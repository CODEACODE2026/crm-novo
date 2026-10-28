import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = process.cwd();
const schema = readFileSync(join(apiRoot, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    apiRoot,
    'prisma',
    'migrations',
    '20261024160000_add_billing_execution_data_foundation',
    'migration.sql',
  ),
  'utf8',
);
const rollback = readFileSync(
  join(
    apiRoot,
    'prisma',
    'migrations',
    '20261024160000_add_billing_execution_data_foundation',
    'rollback.sql',
  ),
  'utf8',
);

describe('Billing PIX DATA1 migration contract', () => {
  it('adds only nullable or defaulted fields to existing tables', () => {
    expect(schema).toContain('origin                PaymentIntentOrigin    @default(MANUAL)');
    expect(schema).toContain('creationKey           String?                @unique');
    expect(schema).toContain('paymentIntentId       String?');
    expect(migration).toContain(
      'ADD COLUMN "origin" public."PaymentIntentOrigin" NOT NULL DEFAULT \'MANUAL\'',
    );
    expect(migration).toContain('ADD COLUMN "creationKey" TEXT');
    expect(migration).toContain('ADD COLUMN "paymentIntentId" UUID');
    const schemaDdl = migration.split('CREATE FUNCTION')[0];
    expect(schemaDdl).not.toMatch(/^\s*(?:UPDATE|DELETE\s+FROM|TRUNCATE)\b/im);
  });

  it('persists execution, exact receivable set, PIX attempt and typed audit entities', () => {
    for (const table of [
      'billing_executions',
      'billing_execution_receivables',
      'billing_pix_attempts',
      'billing_execution_events',
    ]) {
      expect(migration).toContain(`CREATE TABLE public."${table}"`);
    }
    expect(migration).toContain('billing_execution_validate_receivable_identity');
    expect(migration).toContain('billing_execution_validate_payment_intent_links');
    expect(migration).toContain('Billing execution and dispatch PaymentIntent mismatch');
    expect(migration).toContain('Billing execution requires at least one receivable');
    expect(migration).toContain('billing_execution_events_actor_check');
  });

  it('enforces financial and worker idempotency at the database layer', () => {
    expect(migration).toContain('billing_executions_current_client_cycle_key');
    expect(migration).toContain('billing_executions_executionKey_key');
    expect(migration).toContain('payment_intents_creationKey_key');
    expect(migration).toContain('billing_pix_attempts_creationKey_key');
    expect(migration).toContain('billing_pix_attempts_one_active_per_execution_idx');
    expect(migration).toContain('billing_pix_attempts_one_current_per_execution_idx');
    expect(migration).toContain('billing_pix_attempts_provider_transaction_key');
    expect(migration).toContain(
      "WHERE \"status\" IN ('RESERVED', 'CREATING', 'CONFIRMED', 'AMBIGUOUS')",
    );
  });

  it('enforces the three state machines and ships an explicit manual rollback', () => {
    expect(migration).toContain('billing_execution_validate_transitions');
    expect(migration).toContain('billing_pix_attempt_validate_transition');
    expect(migration).toContain('OLD."deliveryStatus" = \'SENDING\'');
    expect(rollback).toContain('Manual rollback for an unactivated DATA1 deployment only.');
    expect(rollback).toContain('DROP TABLE IF EXISTS public."billing_executions"');
    expect(rollback).toContain('DROP TYPE IF EXISTS public."PaymentIntentOrigin"');
  });

  it('seals financial identity, cross-state consistency, audit and atomic leases', () => {
    expect(migration).toContain('billing_execution_validate_exact_set');
    expect(migration).toContain('Billing execution receivable snapshots are immutable');
    expect(migration).toContain('billing_execution_validate_financial_links');
    expect(migration).toContain('Billing PaymentIntent receivable does not match execution set');
    expect(migration).toContain('Billing execution PIX status must match its current attempt');
    expect(migration).toContain('billing_execution_event_guard');
    expect(migration).toContain('billing_execution_acquire_lease');
    expect(migration).toContain('billing_execution_renew_lease');
    expect(migration).toContain('billing_execution_release_lease');
    expect(migration).toContain('billing_execution_amend_pending_receivable');
    expect(migration).toContain('billing_pix_reserve');
    expect(migration).toContain('billing_pix_prepare_create');
    expect(migration).toContain('billing_pix_record_create_result');
    expect(migration).toContain('billing_pix_reconcile_create_result');
    expect(migration).toContain('OR attempt_record."providerTransactionId" IS NULL');
    expect(migration).toContain('billing_execution_transition');
    expect(migration).toContain('SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp');
    expect(migration).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public."billing_executions" FROM PUBLIC',
    );
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.billing_execution_transition');
    expect(migration).toContain('public.billing_execution_verify_actor');
    expect(migration).toContain('public."billing_actor_keys"');
    expect(migration).toContain('public."billing_actor_assertions"');
    expect(migration).toContain('public.hmac(');
    expect(migration).toContain("public.billing_actor_canonical_value('V', 'billing-actor:v2')");
    expect(migration).toContain(
      "public.billing_actor_canonical_value('V', 'billing-operation-args:v1')",
    );
    expect(migration).toContain("'billing.pix.reserve'");
    expect(migration).toContain("'billing.pix.prepare-create'");
    expect(migration).toContain("'billing.pix.record-create-result'");
    expect(migration).toContain("'billing.pix.reconcile-create-result'");
    expect(migration).toContain("'billing.execution.transition'");
    expect(migration).toContain("'billing.receivable.amend'");
    expect(migration).toContain('p_financial_set_digest');
    expect(migration).toContain('p_expected_version');
    expect(migration).toContain('p_arguments_digest');
    expect(migration).toContain('Billing canonical value must be control-free NFC text');
    expect(migration).toContain("p_amount_text !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,2})?$'");
    expect(migration).toContain("p_due_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'");
    expect(migration).toContain('pg_catalog.scale(canonical_amount) > 2');
    expect(migration).toContain('pg_catalog.abs(canonical_amount) > 9999999999.99');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.billing_actor_canonical_value(TEXT, TEXT) FROM PUBLIC',
    );
    expect(rollback).toContain(
      'DROP FUNCTION IF EXISTS public.billing_actor_canonical_value(TEXT, TEXT)',
    );
    expect(migration).not.toMatch(
      /SECURITY DEFINER SET search_path = (?!pg_catalog, public, pg_temp)/,
    );
    expect(migration).not.toMatch(
      /(?:FROM|JOIN|UPDATE|INTO)\s+"(?:billing_|payment_|message_|receivables|users|clients)/,
    );
    expect(migration).toContain('Billing financial records are immutable and cannot be deleted');
    expect(migration).toContain('Billing execution events are immutable and trigger-generated');
  });

  it('installs atomically with bounded locks and an explicit recovery rollback', () => {
    expect(migration.trimStart()).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s'");
    expect(migration).toContain('LOCK TABLE public."payment_intents", public."message_dispatches"');
    expect(rollback).toContain('BEGIN;');
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/);
  });
});
