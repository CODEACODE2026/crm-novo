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
const mobileConversationComposerBlock =
  stylesSource.match(/\.conversation-composer \{[\s\S]*?padding: 10px;\n[ ]{2}\}/)?.[0] ?? '';

describe('CHAT1 Phase 5 conversations inbox', () => {
  it('adds Conversas as a separate navigation module without replacing WhatsApp configuration', () => {
    expect(dashboardSource).toContain("{ id: 'conversations', label: 'Conversas'");
    expect(dashboardSource).toContain("{ id: 'whatsapp', label: 'WhatsApp'");
    expect(dashboardSource).toContain("{view === 'conversations' ? (");
    expect(dashboardSource).toContain("{view === 'whatsapp' ? <WhatsAppView /> : null}");
    expect(dashboardSource).toContain("conversations: 'Inbox WhatsApp'");
    expect(dashboardSource).toContain("conversations: 'Inbox de atendimento WhatsApp'");
    expect(dashboardSource).toContain('badge: conversationSummary?.totalUnreadConversations');
    expect(stylesSource).toContain('.nav-item-badge');
  });

  it('keeps the desktop inbox as list, chat and client context columns', () => {
    expect(conversationsSource).toContain('className="conversations-shell"');
    expect(conversationsSource).toContain('ConversationList');
    expect(conversationsSource).toContain('ConversationMessages');
    expect(conversationsSource).toContain('ConversationClientPanel');
    expect(stylesSource).toContain(".app-shell[data-active-view='conversations'] {");
    expect(stylesSource).toContain('height: 100dvh;');
    expect(stylesSource).toContain(".app-shell[data-active-view='conversations'] .main-area");
    expect(stylesSource).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(stylesSource).toContain(".app-shell[data-active-view='conversations'] .content");
    expect(stylesSource).toContain('height: 100%;');
    expect(stylesSource).not.toContain('height: calc(100dvh - 62px);');
    expect(stylesSource).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(stylesSource).toContain('height: 100%;');
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(320px, 0.92fr) minmax(0, 1.46fr) minmax(250px, 0.66fr);',
    );
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(292px, 0.94fr) minmax(0, 1.16fr);',
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

  it('polishes unread summary copy and hides zero-zero noise', () => {
    expect(conversationsSource).toContain('hasUnreadConversationSummary(summary)');
    expect(dashboardSource).toContain('function formatConversationSummary');
    expect(dashboardSource).toContain(
      "pluralizePt(summary.totalUnreadConversations, 'conversa não lida', 'conversas não lidas')",
    );
    expect(dashboardSource).toContain(
      "pluralizePt(summary.totalUnreadMessages, 'mensagem', 'mensagens')",
    );
    expect(dashboardSource).toContain(
      'summary.totalUnreadConversations > 0 || summary.totalUnreadMessages > 0',
    );
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
    expect(conversationsSource).toContain("event.key === 'Enter' && !event.shiftKey");
    expect(conversationsSource).toContain('disabled={sending}');
    expect(stylesSource).toContain('max-width: min(76%, 680px);');
    expect(stylesSource).toContain('overflow-wrap: anywhere;');
  });

  it('keeps client and guest panels read-only for Phase 5', () => {
    expect(conversationsSource).toContain('Dados do cliente');
    expect(conversationsSource).toContain('Abrir cliente');
    expect(conversationsSource).toContain('Contato avulso');
    expect(conversationsSource).toContain('const pendingAmount = (client.receivables ?? [])');
    expect(conversationsSource).toContain('<dd>{formatCurrency(pendingAmount)}</dd>');
    expect(conversationsSource).toContain('const instanceLabel = conversationInstanceLabel');
    expect(dashboardSource).toContain('function conversationInstanceLabel');
    expect(dashboardSource).toContain('function isTechnicalInstanceName');
    expect(conversationsSource).not.toContain("{conversation.instanceName ?? '-'}");
    expect(conversationsSource).not.toContain(
      "{conversation.instanceName ?? 'Instância WhatsApp'}",
    );
    expect(conversationsSource).not.toContain('Cadastrar cliente');
    expect(conversationsSource).not.toContain('Vincular cliente');
    expect(conversationsSource).not.toContain('Gerar PIX');
  });

  it('keeps the conversation header and list hierarchy visually prepared for polish', () => {
    expect(stylesSource).toContain(
      ".app-shell[data-active-view='conversations'] .topbar-context h1",
    );
    expect(stylesSource).toContain(
      ".app-shell[data-active-view='conversations'] .topbar-context p",
    );
    expect(conversationsSource).toContain('conversation-header-actions');
    expect(stylesSource).toContain('min-width: 112px;');
    expect(conversationsSource).toMatch(
      /conversation-list-title-row[\s\S]*conversation-preview-row[\s\S]*conversation-list-meta-row/,
    );
    expect(conversationsSource).toContain('conversation.unreadCount > 0');
    expect(stylesSource).toContain('flex: 0 0 auto;');
    expect(stylesSource).toContain('min-width: 20px;');
  });

  it('keeps chat, list, and context scrolling inside the inbox shell', () => {
    expect(stylesSource).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto;');
    expect(stylesSource).toContain('.conversation-error-slot:empty');
    expect(stylesSource).toContain('.conversation-list-panel');
    expect(stylesSource).toContain('grid-template-rows: auto auto auto auto minmax(0, 1fr);');
    expect(stylesSource).toContain('.conversation-list-items');
    expect(stylesSource).toContain('.conversation-messages-wrap');
    expect(stylesSource).toContain('.conversation-messages');
    expect(stylesSource).toContain('flex: 1 1 auto;');
    expect(stylesSource).toContain('overflow-y: auto;');
    expect(stylesSource).toContain('.conversation-composer');
    expect(stylesSource).toContain('flex: 0 0 auto;');
    expect(stylesSource).toContain('min-height: 82px;');
    expect(mobileConversationComposerBlock).not.toContain('position: sticky;');
    expect(stylesSource).toContain('.conversation-client-panel');
    expect(stylesSource).toContain('box-sizing: border-box;');
  });

  it('uses mobile list/chat modes and a drawer instead of squeezing three columns', () => {
    expect(conversationsSource).toContain("mobileMode, setMobileMode] = useState<'list' | 'chat'>");
    expect(conversationsSource).toContain("setMobileMode('chat')");
    expect(conversationsSource).toContain("setMobileMode('list')");
    expect(conversationsSource).toContain('conversation-client-drawer');
    expect(stylesSource).toContain('.conversations-view.mobile-mode-list .conversation-chat-panel');
    expect(stylesSource).toContain('.conversations-view.mobile-mode-chat .conversation-list-panel');
    expect(stylesSource).toContain('height: 100dvh;');
    expect(stylesSource).toContain('min-height: 0;');
    expect(stylesSource).toContain('max-width: 88%;');
  });
});
