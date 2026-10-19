import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    process.cwd(),
    'prisma/migrations/20261019021500_add_whatsapp_contact_message_types/migration.sql',
  ),
  'utf8',
);

describe('WhatsApp contact message migration', () => {
  it('adds explicit single and multiple contact conversation types', () => {
    const conversationType = schema.match(/enum WhatsAppConversationMessageType \{[\s\S]*?\}/)?.[0];
    expect(conversationType).toContain('CONTACT');
    expect(conversationType).toContain('CONTACTS');
  });

  it('is additive, idempotent and does not change message columns', () => {
    expect(migration).toContain(
      `ALTER TYPE "WhatsAppConversationMessageType" ADD VALUE IF NOT EXISTS 'CONTACT'`,
    );
    expect(migration).toContain(
      `ALTER TYPE "WhatsAppConversationMessageType" ADD VALUE IF NOT EXISTS 'CONTACTS'`,
    );
    expect(migration).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE|UPDATE)\b/i);
  });
});
