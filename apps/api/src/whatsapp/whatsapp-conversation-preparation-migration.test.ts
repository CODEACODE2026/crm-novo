import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261113190000_add_whatsapp_successor_preparations/migration.sql',
  ),
  'utf8',
);

describe('WhatsApp conversation successor preparation migration', () => {
  it('is additive and never rewrites conversations, messages or attendances', () => {
    expect(migration).toContain('CREATE TABLE "whatsapp_conversation_successor_preparations"');
    expect(migration).not.toMatch(/^\s*UPDATE\b/im);
    expect(migration).not.toMatch(/^\s*DELETE\b/im);
    expect(migration).not.toMatch(/^\s*DROP\b/im);
  });

  it('enforces idempotency and auditable lifecycle states', () => {
    expect(migration).toContain('predecessorConversationId_key');
    expect(migration).toContain('successorConversationId_key');
    expect(migration).toContain('idempotencyKey_key');
    expect(migration).toContain("'PREPARED', 'ACTIVATED', 'CANCELLED', 'FAILED'");
    expect(migration).toContain('whatsapp_conversation_successor_preparations_state_check');
  });

  it('allows successor cleanup without deleting the audit record', () => {
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migration).toContain('"successorConversationSnapshotId" UUID NOT NULL');
  });
});
