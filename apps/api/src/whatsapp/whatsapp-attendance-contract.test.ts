import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = process.cwd();
const serviceSource = readFileSync(join(apiRoot, 'src/whatsapp/whatsapp.service.ts'), 'utf8');
const attendanceSource = readFileSync(
  join(apiRoot, 'src/whatsapp/whatsapp-attendance.service.ts'),
  'utf8',
);
const migrationSource = readFileSync(
  join(apiRoot, 'prisma/migrations/20261016013000_add_whatsapp_attendances/migration.sql'),
  'utf8',
);

describe('ATENDIMENTO1 integration contracts', () => {
  it('opens attendances only from newly persisted inbound conversation messages', () => {
    const webhook = serviceSource.slice(
      serviceSource.indexOf('private async processConversationWebhook('),
      serviceSource.indexOf('private webhookRequestIdCandidate('),
    );
    expect(webhook).toContain("if (direction === 'INBOUND')");
    expect(webhook).toContain('recordInboundMessage(tx, {');
    expect(webhook.indexOf('if (message.duplicate)')).toBeLessThan(
      webhook.indexOf('recordInboundMessage(tx, {'),
    );
    expect(
      serviceSource.slice(0, serviceSource.indexOf('private async processConversationWebhook(')),
    ).not.toContain('recordInboundMessage(tx, {');
    const inboundGate = webhook.slice(
      webhook.indexOf('const messageType = this.toConversationMessageType'),
      webhook.indexOf('recordInboundMessage(tx, {'),
    );
    expect(inboundGate).not.toMatch(/messageType\s*===|switch\s*\(messageType\)/);
  });

  it('records first human reply only in provider-confirmed manual text, media and voice transactions', () => {
    expect(serviceSource.match(/recordManualOutboundMessage\(tx, \{/g)).toHaveLength(4);
    expect(serviceSource).toContain('isManualAttendanceOutbound(reconciled.rawMetadata)');
    expect(serviceSource.indexOf('recordManualOutboundMessage(tx, {')).toBeGreaterThan(
      serviceSource.indexOf('rememberConversationProviderConfirmation({'),
    );
    const retrySource = serviceSource.slice(
      serviceSource.indexOf('async retryConversationMessage('),
      serviceSource.indexOf('async saveConversationStickerMessage('),
    );
    expect(retrySource).not.toContain('recordManualOutboundMessage');
    const presenceSource = serviceSource.slice(
      serviceSource.indexOf('async setConversationPresence('),
      serviceSource.indexOf('async updateConversationMessageReaction('),
    );
    expect(presenceSource).not.toContain('recordManualOutboundMessage');
    expect(attendanceSource).toContain('openedAt: { lte: message.createdAt }');
  });

  it('keeps financial PIX and automatic metadata outside the human-reply classifier', () => {
    const classifier = serviceSource.slice(
      serviceSource.indexOf('private isManualAttendanceOutbound('),
      serviceSource.indexOf('private supportedDownloadMediaType('),
    );
    expect(classifier).toContain("source === 'manual_outbound_send'");
    expect(classifier).toContain("source === 'forward'");
    expect(classifier).not.toMatch(/pix_whatsapp_send|auto_reply|billing|recovery|scheduler|retry/);
    expect(serviceSource).toContain("source: 'pix_whatsapp_send'");
  });

  it('serializes inbound updates and has database-level active/idempotency protection', () => {
    expect(attendanceSource).toContain('pg_advisory_xact_lock');
    expect(migrationSource).toContain('whatsapp_attendances_one_active_per_conversation_key');
    expect(migrationSource).toContain("WHERE \"status\" IN ('PENDING', 'IN_PROGRESS')");
    expect(migrationSource).toContain('whatsapp_attendances_openedByMessageId_key');
    expect(migrationSource).toContain('whatsapp_messages_attendanceId_createdAt_idx');
  });

  it('enforces resolved category consistency without destructive historical changes', () => {
    expect(migrationSource).toContain('whatsapp_attendances_resolved_category_check');
    expect(migrationSource).toContain(
      'ALTER TABLE "whatsapp_messages" ADD COLUMN "attendanceId" UUID',
    );
    expect(migrationSource).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  });

  it('reuses conversation.updated for inbound, manual reply and resolution changes', () => {
    const webhook = serviceSource.slice(
      serviceSource.indexOf('private async processConversationWebhook('),
      serviceSource.indexOf('private webhookRequestIdCandidate('),
    );
    expect(webhook).toContain('this.emitConversationUpdated(result.conversationId)');
    expect(serviceSource).toContain('this.emitConversationUpdated(conversation.id)');
    expect(attendanceSource).toContain('this.realtime?.emitConversationUpdated(conversationId)');
    expect(attendanceSource).not.toMatch(/["']attendance\.(created|updated|resolved)/);
  });
});
