import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261111190000_add_whatsapp_conversation_continuity/migration.sql',
  ),
  'utf8',
);

describe('WhatsApp conversation continuity migration', () => {
  it('is additive and never rewrites historical conversations or messages', () => {
    expect(migration).toContain('CREATE TABLE "whatsapp_conversation_continuities"');
    expect(migration).not.toMatch(/^\s*UPDATE\b/im);
    expect(migration).not.toMatch(/^\s*DELETE\b/im);
    expect(migration).not.toMatch(/^\s*DROP\b/im);
  });

  it('enforces one-to-one acyclic edges and preserves both conversation rows', () => {
    expect(migration).toContain('CHECK ("predecessorConversationId" <> "successorConversationId")');
    expect(migration).toContain(
      '"whatsapp_conversation_continuities_predecessorConversationId_key"',
    );
    expect(migration).toContain('"whatsapp_conversation_continuities_successorConversationId_key"');
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(2);
  });

  it('keeps an auditable actor reference without preventing user deactivation/removal', () => {
    expect(migration).toContain('"whatsapp_conversation_continuities_createdByUserId_fkey"');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
  });
});
