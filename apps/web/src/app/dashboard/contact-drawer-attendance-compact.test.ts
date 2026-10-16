import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const inboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const historySource = inboxSource.slice(
  inboxSource.indexOf('function ConversationAttendanceHistory('),
  inboxSource.indexOf('function ConversationClientPanel('),
);
const panelSource = inboxSource.slice(
  inboxSource.indexOf('function ConversationClientPanel('),
  inboxSource.indexOf('function ConversationFinancialSummary('),
);
const compactToggleSource = historySource.slice(
  historySource.indexOf('<button'),
  historySource.indexOf('</button>') + '</button>'.length,
);

describe('CONTACT-DRAWER-ATTENDANCE-COMPACT1 contract', () => {
  it('starts every history item collapsed and keeps only one expanded id', () => {
    expect(historySource).toContain('useState<string | null>(null)');
    expect(historySource).toContain('const expanded = expandedAttendanceId === attendance.id');
    expect(historySource).toContain('current === attendance.id ? null : attendance.id');
    expect(historySource).toContain('attendances.some((attendance) => attendance.id === current)');
  });

  it('keeps category, status, compact date and metrics visible while collapsed', () => {
    expect(historySource).toContain('conversation-attendance-primary-row');
    expect(historySource).toContain('attendanceStatusLabel(attendance.status)');
    expect(historySource).toContain('formatAttendanceCompactDate(attendance.openedAt)');
    expect(historySource).toContain('Resp.');
    expect(historySource).toContain('· Total');
    expect(inboxSource).toContain("timeZone: 'America/Sao_Paulo'");
  });

  it('never presents a missing first reply or unresolved total as zero minutes', () => {
    expect(inboxSource).toContain("if (!end) return '-'");
    expect(historySource).toContain('attendance.firstAgentReplyAt');
    expect(historySource).toContain('attendance.resolvedAt');
    expect(historySource).not.toMatch(/Resp\.\s*0m/);
  });

  it('truncates long category and note only in the compact presentation', () => {
    expect(historySource).toContain('title={categoryName}');
    expect(historySource).toContain('conversation-attendance-note-preview');
    expect(historySource).toContain('conversation-attendance-full-category');
    expect(historySource).toContain('conversation-attendance-full-note');
    expect(stylesSource).toContain('text-overflow: ellipsis');
    expect(stylesSource).toContain('overflow-wrap: anywhere');
  });

  it('mounts complete details only for the expanded attendance', () => {
    expect(historySource).toContain('{expanded ? (');
    expect(historySource).toContain('conversation-attendance-details');
    expect(historySource).toContain('Primeira resposta');
    expect(historySource).toContain('Tempo total');
    expect(historySource).toContain('Recebidas');
    expect(historySource).toContain('Manuais');
    expect(historySource).toContain('Resolvido por');
  });

  it('preserves the complete automatic-reply context only in expanded details', () => {
    expect(historySource).toContain('conversation-attendance-auto-reply-indicator');
    expect(historySource).toContain('Resposta automática enviada');
    expect(historySource).toContain('Resposta automática: Sim');
    expect(historySource).toContain('autoReplyModeLabel(attendance.autoReply.mode)');
    expect(historySource).toContain('formatAutoReplyDateTime(attendance.autoReply.lastSentAt)');
    expect(historySource).toContain('attendance.autoReply.count');
  });

  it('uses a native keyboard target with expanded-state relationships and focus visibility', () => {
    expect(historySource).toContain('type="button"');
    expect(historySource).toContain('aria-expanded={expanded}');
    expect(historySource).toContain('aria-controls={detailsId}');
    expect(historySource).toContain('id={detailsId}');
    expect(stylesSource).toContain('.conversation-attendance-toggle:focus-visible');
    expect(compactToggleSource.match(/<button/g)).toHaveLength(1);
    expect(compactToggleSource).not.toContain('<Button');
    expect(compactToggleSource).not.toContain('<a ');
    expect(compactToggleSource).toContain('aria-hidden="true"');
  });

  it('keeps compact mobile and desktop sizing without changing drawer width', () => {
    expect(stylesSource).toContain('.conversation-attendance-toggle');
    expect(stylesSource).toContain('min-height: 72px');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('min-height: 68px');
    expect(stylesSource).toContain('width: min(100vw, 440px)');
    expect(stylesSource).toContain('width: min(430px, calc(100vw - 24px))');
  });

  it('preserves backend ordering, five-item pagination and the existing load-more action', () => {
    expect(inboxSource).toContain(
      'listWhatsAppClientAttendances(selectedConversation.client.id, { limit: 5 })',
    );
    expect(inboxSource).toContain(
      'listWhatsAppConversationAttendances(selectedConversation.id, { limit: 5 })',
    );
    expect(historySource).toContain('onClick={onLoadMore}');
    expect(historySource).toContain('Ver mais');
    expect(historySource).not.toMatch(/\.sort\s*\(/);
  });

  it('preserves a valid expanded id after pagination and resets it with drawer context', () => {
    expect(historySource).toContain(
      'current && attendances.some((attendance) => attendance.id === current) ? current : null',
    );
    expect(panelSource).toContain("setActiveTab('summary')");
    expect(panelSource).toContain('[conversation?.id, open]');
    expect(panelSource).toContain("if (activeTab === 'attendances')");
  });
});
