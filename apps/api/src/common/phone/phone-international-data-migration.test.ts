import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20261021231500_add_phone_e164_identity/migration.sql'),
  'utf8',
);
const preflight = readFileSync(
  join(process.cwd(), 'prisma/preflight/phone-international1-data.sql'),
  'utf8',
);

describe('international phone identity migration', () => {
  it('adds nullable E.164 identities without changing legacy phone fields', () => {
    expect(schema.match(/phoneE164\s+String\?/g)).toHaveLength(3);
    expect(schema).toContain('phoneE164               String?');
    expect(migration).toContain('ADD COLUMN "phoneE164" VARCHAR(16);');
    expect(migration).not.toMatch(/"phoneE164"\s+VARCHAR\(16\)\s+NOT NULL/i);
    expect(migration).not.toMatch(/ALTER COLUMN "phone(Normalized)?"/i);
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|MERGE)\b/i);
  });

  it('enforces format and connection-scoped partial uniqueness transactionally', () => {
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("'^\\+[1-9][0-9]{1,14}$'");
    expect(migration).toContain('"whatsapp_conversations"("whatsAppConnectionId", "phoneE164")');
    expect(migration).toContain('"whatsapp_pending_contacts"("whatsAppConnectionId", "phoneE164")');
    expect(migration.match(/WHERE "phoneE164" IS NOT NULL;/g)).toHaveLength(2);
  });

  it('does not add canonical identity to historical snapshot models', () => {
    const snapshotTables = ['whatsapp_inbound_messages', 'message_dispatches', 'receivables'];
    for (const table of snapshotTables) {
      expect(migration).not.toMatch(new RegExp(`ALTER TABLE "${table}"`));
    }
  });

  it('keeps the production preflight strictly read-only and privacy-aware', () => {
    const executable = preflight
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE|CALL|DO)\b/i,
    );
    expect(executable).not.toContain('SELECT *');
    expect(preflight).toContain('maskedOriginalDigits');
    expect(preflight).toContain('EXPLICIT_BRAZIL_REQUIRES_LIBRARY_VALIDATION');
    expect(preflight).toContain('LEGACY_BRAZIL_SHAPE_AMBIGUOUS_COUNTRY');
    expect(preflight).toContain('POTENTIAL_LEGACY_COUNTRY_CORRUPTION_REVIEW_REQUIRED');
    expect(preflight).toContain('CANONICAL_CLIENT_DUPLICATE_REVIEW_REQUIRED');
    expect(preflight).toContain('CANONICAL_COLLISION_BLOCKS_AUTOMATIC_BACKFILL');
    expect(preflight).toContain('AMBIGUOUS_COUNTRY_REVIEW_REQUIRED');
  });
});
