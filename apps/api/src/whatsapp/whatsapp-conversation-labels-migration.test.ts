import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261015170000_add_whatsapp_conversation_labels/migration.sql',
  ),
  'utf8',
);

describe('WhatsApp conversation labels migration', () => {
  it('models connection-scoped labels and an explicit many-to-many assignment', () => {
    expect(schema).toContain('model WhatsAppConversationLabel {');
    expect(schema).toContain('@@unique([whatsAppConnectionId, normalizedName])');
    expect(schema).toContain('model WhatsAppConversationLabelAssignment {');
    expect(schema).toContain('@@id([conversationId, labelId])');
  });

  it('is additive and cascades only label assignments and owned labels', () => {
    expect(migration).toContain('CREATE TYPE "WhatsAppConversationLabelColor"');
    expect(migration).toContain('CREATE TABLE "whatsapp_conversation_labels"');
    expect(migration).toContain('CREATE TABLE "whatsapp_conversation_label_assignments"');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});
