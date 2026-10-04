import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const conversationsSource = dashboardSource.slice(
  dashboardSource.indexOf('function ConversationsView'),
  dashboardSource.indexOf('function WhatsAppView'),
);

describe('CHAT1 Phase 5 conversations inbox', () => {
  it('adds Conversas as a separate navigation module without replacing WhatsApp configuration', () => {
    expect(dashboardSource).toContain("{ id: 'conversations', label: 'Conversas'");
    expect(dashboardSource).toContain("{ id: 'whatsapp', label: 'WhatsApp'");
    expect(dashboardSource).toContain("{view === 'conversations' ? (");
    expect(dashboardSource).toContain("{view === 'whatsapp' ? <WhatsAppView /> : null}");
    expect(dashboardSource).toContain("conversations: 'Inbox de atendimento WhatsApp'");
    expect(dashboardSource).toContain('badge: conversationSummary?.totalUnreadConversations');
    expect(stylesSource).toContain('.nav-item-badge');
  });

  it('keeps the desktop inbox as list, chat and client context columns', () => {
    expect(conversationsSource).toContain('className="conversations-shell"');
    expect(conversationsSource).toContain('ConversationList');
    expect(conversationsSource).toContain('ConversationMessages');
    expect(conversationsSource).toContain('ConversationClientPanel');
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(280px, 0.78fr) minmax(0, 1.45fr) minmax(260px, 0.72fr);',
    );
    expect(stylesSource).toContain('.conversation-client-panel');
  });

  it('renders search, initial filters, unread summary, and empty/error states', () => {
    expect(conversationsSource).toContain('Buscar por nome ou telefone...');
    expect(dashboardSource).toContain("id: 'all', label: 'Todas'");
    expect(dashboardSource).toContain("id: 'unread', label: 'Não lidas'");
    expect(dashboardSource).toContain("id: 'clients', label: 'Clientes'");
    expect(dashboardSource).toContain("id: 'guests', label: 'Avulsos'");
    expect(conversationsSource).toContain('totalUnreadConversations');
    expect(conversationsSource).toContain('onSummaryChange(payload.summary)');
    expect(conversationsSource).toContain('Nenhuma conversa encontrada.');
    expect(conversationsSource).toContain('Nenhuma conversa corresponde à busca.');
    expect(conversationsSource).toContain('Falha ao carregar conversas.');
  });

  it('loads selection, messages, read state, resolve state, and preserves polling safety', () => {
    expect(conversationsSource).toContain('getWhatsAppConversation(conversation.id)');
    expect(conversationsSource).toContain('listWhatsAppConversationMessages(conversationId');
    expect(conversationsSource).toContain('markWhatsAppConversationRead(detail.id)');
    expect(conversationsSource).toContain('totalUnreadMessages: Math.max');
    expect(conversationsSource).toContain('resolveWhatsAppConversation(selectedConversation.id)');
    expect(conversationsSource).toContain('document.hidden');
    expect(conversationsSource).toContain('mergeConversationMessages');
    expect(conversationsSource).toContain('activeConversationIdRef.current !== conversationId');
    expect(conversationsSource).toContain('isConversationScrollNearBottom');
    expect(conversationsSource).toContain('setDrafts((current) => ({');
  });

  it('supports message bubbles, non-text placeholders, send, failure and retry with a fresh request id', () => {
    expect(conversationsSource).toContain('conversation-bubble-row ${outbound ?');
    expect(conversationsSource).toContain("'outbound' : 'inbound'");
    expect(conversationsSource).toContain("AUDIO: '[Áudio]'");
    expect(conversationsSource).toContain("DOCUMENT: '[Documento]'");
    expect(conversationsSource).toContain("IMAGE: '[Imagem]'");
    expect(conversationsSource).toContain("VIDEO: '[Vídeo]'");
    expect(conversationsSource).toContain("LOCATION: '[Localização]'");
    expect(conversationsSource).toContain("BUTTON: '[Mensagem interativa]'");
    expect(conversationsSource).toContain("UNKNOWN: '[Mensagem interativa]'");
    expect(conversationsSource).toContain(
      'sendWhatsAppConversationMessage(selectedConversation.id',
    );
    expect(conversationsSource).toContain('const requestId = createConversationRequestId();');
    expect(conversationsSource).toContain('Tentar novamente');
    expect(conversationsSource).toContain("status: 'FAILED'");
  });

  it('keeps client and guest panels read-only for Phase 5', () => {
    expect(conversationsSource).toContain('Dados do cliente');
    expect(conversationsSource).toContain('Abrir cliente');
    expect(conversationsSource).toContain('Contato avulso');
    expect(conversationsSource).not.toContain('Cadastrar cliente');
    expect(conversationsSource).not.toContain('Vincular cliente');
    expect(conversationsSource).not.toContain('Gerar PIX');
  });

  it('uses mobile list/chat modes and a drawer instead of squeezing three columns', () => {
    expect(conversationsSource).toContain("mobileMode, setMobileMode] = useState<'list' | 'chat'>");
    expect(conversationsSource).toContain("setMobileMode('chat')");
    expect(conversationsSource).toContain("setMobileMode('list')");
    expect(conversationsSource).toContain('conversation-client-drawer');
    expect(stylesSource).toContain('.conversations-view.mobile-mode-list .conversation-chat-panel');
    expect(stylesSource).toContain('.conversations-view.mobile-mode-chat .conversation-list-panel');
    expect(stylesSource).toContain('min-height: 100dvh;');
    expect(stylesSource).toContain('position: sticky;');
  });
});
