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
    '20261022210000_add_international_billing_opt_in',
    'migration.sql',
  ),
  'utf8',
);

describe('international Billing opt-in persistence', () => {
  it('is fail-closed on every client reference', () => {
    expect(schema).toContain('internationalBillingEnabled Boolean');
    expect(schema).toContain('@default(false)');
    expect(migration).toContain('"internationalBillingEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(migration).not.toContain('CREATE INDEX');
  });
});
