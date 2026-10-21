import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261021150000_add_whatsapp_category_system_key/migration.sql',
  ),
  'utf8',
);
const preflight = readFileSync(
  join(process.cwd(), 'prisma/preflight/whatsapp-category-systemkey1.sql'),
  'utf8',
);
const service = readFileSync(
  join(process.cwd(), 'src/whatsapp/whatsapp-attendance.service.ts'),
  'utf8',
);

const systemKeys = [
  'technical_support',
  'guidance',
  'new_product_service',
  'finance_billing',
  'renewal',
  'registration_change',
  'outage_issue',
  'configuration',
  'cancellation',
  'commercial',
  'other',
];

describe('WhatsApp category systemKey migration', () => {
  it('adds a nullable identity and connection-scoped uniqueness transactionally', () => {
    expect(schema).toContain('systemKey            String?');
    expect(schema).toContain('@@unique([whatsAppConnectionId, systemKey]');
    expect(migration.trimStart()).toMatch(/^BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('ADD COLUMN "systemKey" TEXT;');
    expect(migration).not.toContain('"systemKey" TEXT NOT NULL');
    expect(migration).toContain(
      'ON "whatsapp_attendance_categories"("whatsAppConnectionId", "systemKey")',
    );
    expect(migration).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('keeps the runtime and migration catalogs aligned on all stable keys', () => {
    for (const systemKey of systemKeys) {
      expect(service).toContain(`systemKey: '${systemKey}'`);
      expect(migration).toContain(`('${systemKey}',`);
      expect(preflight).toContain(`('${systemKey}',`);
    }
    expect(new Set(systemKeys).size).toBe(11);
  });

  it('backfills only exact legacy normalized names and preserves all other category fields', () => {
    expect(migration).toContain('WHERE category."normalizedName" = catalog."normalizedName";');
    expect(migration).not.toMatch(/"name"\s*=|"color"\s*=|"sortOrder"\s*=|"isActive"\s*=/);
    expect(migration).not.toMatch(/ORDER BY|LIMIT 1|MIN\(|MAX\(/i);
  });

  it('keeps the production preflight strictly read-only', () => {
    const executable = preflight
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE|CALL|DO)\b/i,
    );
    expect(executable).toContain('DETERMINISTIC_EXACT_LEGACY_IDENTITY');
    expect(executable).toContain('NO_EXACT_MATCH_REVIEW_REQUIRED');
    expect(executable).toContain('CUSTOM_OR_RENAMED_REVIEW_IF_A_DEFAULT_SLOT_IS_MISSING');
  });
});
