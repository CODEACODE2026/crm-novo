import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const inboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);
const analyticsSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppAttendanceAnalytics.tsx'),
  'utf8',
);
const helperSource = readFileSync(join(currentDir, '../../lib/attendance-waiting.ts'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

describe('INBOX-ATTENDANCE-PRIORITY1 visual contract', () => {
  it('derives human waiting only from the pending attendance openedAt', () => {
    expect(inboxSource).toContain("conversation.activeAttendance?.status === 'PENDING'");
    expect(inboxSource).toContain('getHumanWaitingSeconds(pendingAttendance.openedAt');
    expect(inboxSource).not.toMatch(/getHumanWaitingSeconds\([^)]*lastAutoReplyAt/);
    expect(inboxSource).not.toMatch(/getHumanWaitingSeconds\([^)]*lastMessageAt/);
  });

  it('shows an accessible compact priority signal in the list and detailed header context', () => {
    expect(inboxSource).toContain('attendance-waiting-badge');
    expect(inboxSource).toContain('aria-label={`${waitingPriorityLabels[waitingPriority]}');
    expect(inboxSource).toContain('Aguardando resposta humana há');
    expect(inboxSource).toContain('attendance-waiting-level');
    expect(inboxSource).toContain('Resposta automática enviada');
    expect(stylesSource).toContain('.conversation-list-item.waiting-high');
    expect(stylesSource).toContain('.conversation-list-item.waiting-critical');
  });

  it('removes first-response priority outside pending and leaves legacy without a fake clock', () => {
    expect(inboxSource).toContain(
      "conversation.activeAttendance?.status === 'PENDING' ? conversation.activeAttendance : null",
    );
    expect(inboxSource).toContain("conversation.activeAttendance?.status === 'PENDING' ? (");
    expect(inboxSource).not.toContain(
      "activeAttendance?.status === 'IN_PROGRESS' ? getWaitingPriority",
    );
  });

  it('uses one shared minute clock per mounted Inbox and analytics screen', () => {
    expect(inboxSource.match(/useWaitingClock\(\)/g)).toHaveLength(1);
    expect(analyticsSource.match(/useWaitingClock\(\)/g)).toHaveLength(1);
    expect(helperSource).toContain('globalThis.setInterval');
    expect(helperSource).toContain('globalThis.clearInterval');
    expect(helperSource).toContain('WAITING_CLOCK_INTERVAL_MS = 60_000');
  });

  it('reuses the same priority helper in the first-response analytics queue', () => {
    expect(analyticsSource).toContain('showWaitingPriority');
    expect(analyticsSource).toContain('getHumanWaitingSeconds(item.openedAt');
    expect(analyticsSource).toContain('waitingPriorityLabels[waitingPriority]');
    expect(stylesSource).toContain('.attendance-waiting-metric');
    expect(analyticsSource).toContain("showWaitingPriority && item.status === 'PENDING'");
    expect(analyticsSource).toContain("waitingPriorityLabels[waitingPriority] : 'em aberto'");
  });

  it('keeps the compact mobile list contract without horizontal metadata overflow', () => {
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('.conversation-list-meta-row .attendance-waiting-level');
    expect(stylesSource).toContain('display: none;');
    expect(stylesSource).toContain('.conversation-list-meta-row {');
    expect(stylesSource).toContain('overflow: hidden;');
    expect(stylesSource).toContain('white-space: nowrap;');
  });

  it('does not add client-side sorting after pagination', () => {
    expect(inboxSource).not.toMatch(/conversations\.sort\(/);
    expect(inboxSource).not.toContain('Maior espera');
  });
});
