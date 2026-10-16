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
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const resolveModalSource = inboxSource.slice(
  inboxSource.indexOf('function ResolveAttendanceModal('),
  inboxSource.indexOf('function ForwardConversationMessageModal('),
);

describe('ATENDIMENTO1 Inbox UI contracts', () => {
  it('shows attendance status separately from conversation status', () => {
    expect(inboxSource).toContain('conversation.activeAttendance');
    expect(inboxSource).toContain('attendanceStatusLabel(conversation.activeAttendance.status)');
    expect(inboxSource).toContain('conversation-status-badge');
  });

  it('keeps composer typing, focus, presence and attachment selection outside attendance state', () => {
    const composerSource = inboxSource.slice(
      inboxSource.indexOf('function ConversationComposer('),
      inboxSource.indexOf('function attendanceDurationLabel('),
    );
    expect(composerSource).toContain('onChange(event.target.value)');
    expect(composerSource).toContain('onVoiceRecordingChangeRef.current(true)');
    expect(composerSource).toContain("selectFile('IMAGE'");
    expect(composerSource).not.toMatch(/activeAttendance|firstAgentReplyAt|IN_PROGRESS/);
  });

  it('renders the resolver through document.body with complete category states and controls', () => {
    expect(resolveModalSource).toContain('Resolver atendimento');
    expect(resolveModalSource).toContain('Categoria *');
    expect(resolveModalSource).toContain('maxLength={4000}');
    expect(resolveModalSource).toContain("event.key === 'Escape'");
    expect(resolveModalSource).toContain('createPortal(');
    expect(resolveModalSource).toContain('document.body');
    expect(resolveModalSource).toContain('className="resolve-attendance-backdrop"');
    expect(resolveModalSource).toContain("document.body.style.overflow = 'hidden'");
    expect(resolveModalSource).toContain('previouslyFocused?.focus()');
    expect(resolveModalSource).toContain('Carregando categorias...');
    expect(resolveModalSource).toContain('Nenhuma categoria ativa.');
    expect(resolveModalSource).toContain('categoriesError');
    expect(resolveModalSource).toContain('resolveError');
    expect(resolveModalSource).toContain('!categoryId || submitting || categoriesLoading');
    expect(resolveModalSource).toContain('Aberto há');
    expect(resolveModalSource).toContain('Primeira resposta');
  });

  it('gives the resolver an opaque centered desktop card and safe mobile viewport', () => {
    const backdropStyles = stylesSource.slice(
      stylesSource.indexOf('.resolve-attendance-backdrop'),
      stylesSource.indexOf('.conversation-attendance-list'),
    );
    expect(backdropStyles).toContain('position: fixed');
    expect(backdropStyles).toContain('inset: 0');
    expect(backdropStyles).toContain('z-index: 1900');
    expect(backdropStyles).toContain('place-items: center');
    expect(backdropStyles).toContain('background: rgb(3 8 15 / 82%)');
    expect(backdropStyles).toContain('width: min(520px, calc(100vw - 2rem))');
    expect(backdropStyles).toContain('max-height: min(760px, calc(100dvh - 32px))');
    expect(backdropStyles).toContain('background: var(--surface)');
    expect(backdropStyles).toContain('box-shadow: 0 28px 90px');
    expect(stylesSource).toContain('@media (max-width: 720px)');
    expect(stylesSource).toContain('env(safe-area-inset-bottom)');
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
