import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const inboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);
const apiSource = readFileSync(join(currentDir, '../../lib/crm-api.ts'), 'utf8');
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');

describe('ATENDIMENTO1 Inbox UI contracts', () => {
  it('shows attendance status separately from conversation status', () => {
    expect(inboxSource).toContain('conversation.activeAttendance');
    expect(inboxSource).toContain('attendanceStatusLabel(conversation.activeAttendance.status)');
    expect(inboxSource).toContain('conversation-status-badge');
  });

  it('requires an active category and supports note, loading, error, Escape and portal', () => {
    expect(inboxSource).toContain('function ResolveAttendanceModal');
    expect(inboxSource).toContain('Resolver atendimento');
    expect(inboxSource).toContain('Categoria *');
    expect(inboxSource).toContain('maxLength={4000}');
    expect(inboxSource).toContain("event.key === 'Escape'");
    expect(inboxSource).toContain('createPortal(');
    expect(inboxSource).toContain('loading={loading}');
    expect(inboxSource).toContain('autoFocus');
    expect(inboxSource).toContain('className="modal-backdrop"');
    expect(inboxSource).toContain('Aberto há');
    expect(inboxSource).toContain('Primeira resposta');
  });

  it('keeps legacy conversations safe while active attendance uses the modal', () => {
    expect(inboxSource).toContain('if (!selectedConversation?.activeAttendance)');
    expect(inboxSource).toContain('await resolveSelectedConversation();');
    expect(inboxSource).toContain('setResolveAttendanceOpen(true);');
  });

  it('loads paginated conversation or client history without adding it to the conversation list', () => {
    expect(inboxSource).toContain('listWhatsAppClientAttendances');
    expect(inboxSource).toContain('listWhatsAppConversationAttendances');
    expect(inboxSource).toContain('ConversationAttendanceHistory');
    expect(inboxSource).toContain('Ver mais');
    expect(inboxSource).toContain("timeZone: 'America/Sao_Paulo'");
    expect(apiSource).toContain("/attendances${query ? `?${query}` : ''}");
  });

  it('provides category management in existing WhatsApp settings', () => {
    expect(dashboardSource).toContain('SettingsWhatsAppAttendanceCategoriesPanel');
    expect(dashboardSource).toContain('Categorias de resolução');
    expect(dashboardSource).toContain('isActive: !category.isActive');
    expect(dashboardSource).toContain('sortOrder');
  });
});
