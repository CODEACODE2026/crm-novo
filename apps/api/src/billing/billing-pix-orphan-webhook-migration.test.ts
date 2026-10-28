import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDirectory = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20261027141000_add_billing_pix_orphan_webhook_quarantine',
);
const migration = readFileSync(join(migrationDirectory, 'migration.sql'), 'utf8');
const rollback = readFileSync(join(migrationDirectory, 'rollback.sql'), 'utf8');
const data1 = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20261024160000_add_billing_execution_data_foundation',
    'migration.sql',
  ),
  'utf8',
);

describe('Billing PIX orphan webhook quarantine migration contract', () => {
  it('is additive, digest-only and leaves DATA1 as the previous migration', () => {
    expect(migration).toContain('billing_pix_orphan_webhook_events');
    expect(migration).toContain('billing-pix-orphan-webhook:v1');
    expect(migration).toContain('billing-pix-orphan-webhook-id:v1');
    expect(migration).toContain('rawBodyDigest');
    expect(migration).not.toMatch(/"rawBody"\s+(?:TEXT|BYTEA|JSONB)/u);
    expect(data1).not.toContain('billing.pix.quarantine-orphan-webhook');
  });

  it('installs one HMAC-bound privileged operation with immutable evidence and a rollback', () => {
    expect(migration).toContain('billing.pix.quarantine-orphan-webhook');
    expect(migration).toContain('billing-actor:v2');
    expect(migration).toContain('billing-operation-args:v1');
    expect(migration).toContain('SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp');
    expect(migration).toContain('Billing orphan webhook evidence is immutable');
    expect(migration).toContain(
      'REVOKE ALL ON public."billing_pix_orphan_webhook_events" FROM PUBLIC',
    );
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.billing_pix_quarantine_orphan_webhook',
    );
    expect(rollback).toContain(
      'DROP FUNCTION IF EXISTS public.billing_pix_quarantine_orphan_webhook',
    );
    expect(rollback).toContain('DROP TABLE IF EXISTS public."billing_pix_orphan_webhook_events"');
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public."billing_executions"');
  });
});
