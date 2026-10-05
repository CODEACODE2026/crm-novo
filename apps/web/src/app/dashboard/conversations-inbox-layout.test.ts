import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const primitivesSource = readFileSync(
  join(currentDir, '../../components/ui/primitives.tsx'),
  'utf8',
);
const conversationsSource = dashboardSource.slice(
  dashboardSource.indexOf('function ConversationsView'),
  dashboardSource.indexOf('function WhatsAppView'),
);
const mobileConversationMediaStart = stylesSource.indexOf(
  "@media (max-width: 620px) {\n  .app-shell[data-active-view='conversations']",
);
const mobileConversationMediaSource =
  mobileConversationMediaStart >= 0
    ? stylesSource.slice(
        mobileConversationMediaStart,
        stylesSource.indexOf('.conversation-client-drawer', mobileConversationMediaStart),
      )
    : '';
const mobileConversationComposerBlock =
  mobileConversationMediaSource.match(/\.conversation-composer \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
const mobileConversationChatPanelBlock =
  mobileConversationMediaSource.match(/\.conversation-chat-panel \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
const mobileConversationsShellBlock =
  mobileConversationMediaSource.match(/\.conversations-shell \{[\s\S]*?\n {2}\}/)?.[0] ?? '';

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

  it('keeps a single start conversation action outside the internal list header', () => {
    expect(conversationsSource).toContain('conversation-page-actions');
    expect(conversationsSource).toContain('Iniciar conversa');
    expect(conversationsSource).not.toContain('Nova conversa');
    expect(conversationsSource).not.toContain('onNewConversation');
    expect(conversationsSource).toMatch(
      /conversation-page-actions[\s\S]*<Button[\s\S]*icon=\{Plus\}[\s\S]*>\s*Iniciar conversa\s*<\/Button>/,
    );
    expect(conversationsSource).toMatch(
      /<div className="conversation-panel-header">[\s\S]*<h3>Conversas<\/h3>[\s\S]*`\$\{conversations\.length\} visíveis`[\s\S]*<\/div>\s*<\/div>/,
    );
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

  it('opens selected conversations at the bottom only after the initial messages render', () => {
    expect(conversationsSource).toContain('pendingInitialScrollConversationRef');
    expect(conversationsSource).toContain(
      'pendingInitialScrollConversationRef.current = conversation.id',
    );
    expect(conversationsSource).toContain(
      'if (pendingInitialScrollConversationRef.current !== selectedConversation.id) return;',
    );
    expect(conversationsSource).toContain('pendingInitialScrollConversationRef.current = null');
    expect(conversationsSource).toContain(
      'scrollConversationContainerToBottom(messagesScrollRef.current)',
    );
    expect(conversationsSource).toContain('element.scrollTop = element.scrollHeight');
    expect(conversationsSource).toContain('if (!replace) {');
    expect(conversationsSource).toContain('if (shouldStick) {');
    expect(conversationsSource).toContain('} else if (silent) {');
    expect(conversationsSource).toContain('setNewMessageNotice(true)');
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
    expect(conversationsSource).not.toContain('disabled={sending}');
    expect(conversationsSource).toContain('aria-busy={sending}');
    expect(conversationsSource).toContain('loading={sending}');
    expect(conversationsSource).toContain('const canSend = Boolean(draft.trim() || selectedMedia)');
    expect(conversationsSource).toContain('disabled={!canSend}');
    expect(primitivesSource).toContain('disabled={disabled || loading}');
    expect(stylesSource).toContain('max-width: min(76%, 680px);');
    expect(stylesSource).toContain('overflow-wrap: anywhere;');
  });

  it('supports compact image and document attachments in the conversation composer', () => {
    expect(dashboardSource).toContain('type ConversationComposerMedia');
    expect(dashboardSource).toContain('const conversationMediaMaxBytes = 10 * 1024 * 1024;');
    expect(conversationsSource).toContain('file.size > conversationMediaMaxBytes');
    expect(conversationsSource).toContain(
      'Arquivo excede o limite interno do CRM de 10 MB para envio por WhatsApp.',
    );
    expect(conversationsSource).toContain('sendWhatsAppConversationMedia(selectedConversation.id');
    expect(conversationsSource).toContain('file: mediaToSend.file');
    expect(conversationsSource).toContain('caption: body');
    expect(conversationsSource).toContain('accept="image/jpeg,image/png"');
    expect(conversationsSource).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(conversationsSource).toContain('conversation-attachment-preview');
    expect(conversationsSource).toContain('conversation-attach-menu');
    expect(conversationsSource).toContain('Imagem');
    expect(conversationsSource).toContain('Documento');
    expect(conversationsSource).toContain('onRemoveMedia={clearComposerMedia}');
    expect(conversationsSource).toContain('formatFileSize(selectedMedia.file.size)');
    expect(conversationsSource).toContain('function ConversationMediaContent');
    expect(conversationsSource).toContain('message.mediaAvailable');
    expect(conversationsSource).toContain(
      "const hasAvailableImage = message.type === 'IMAGE' && message.mediaAvailable;",
    );
    expect(conversationsSource).toContain(
      "const text = hasAvailableImage ? '' : conversationMessageDisplayText(message);",
    );
    expect(conversationsSource).toContain(
      'downloadWhatsAppConversationMedia(conversationId, message.id)',
    );
    expect(conversationsSource).toContain('conversation-image-media');
    expect(conversationsSource).toContain('conversation-image-lightbox');
    expect(conversationsSource).toContain('aria-modal="true"');
    expect(conversationsSource).toContain('setImageLightboxOpen(true)');
    expect(conversationsSource).toContain("event.key === 'Escape'");
    expect(conversationsSource).toContain('onClick={closeImageLightbox}');
    expect(conversationsSource).toContain('event.stopPropagation();');
    expect(conversationsSource).toContain('imageButtonRef.current?.focus()');
    expect(conversationsSource).toContain("document.body.style.overflow = 'hidden'");
    expect(conversationsSource).toContain('document.body.style.overflow = previousOverflow');
    expect(conversationsSource).toContain('aria-label="Fechar imagem"');
    expect(conversationsSource).toContain('URL.createObjectURL(blob)');
    expect(conversationsSource).toContain('URL.revokeObjectURL(current)');
    expect(conversationsSource).toContain('if (mediaUrl) URL.revokeObjectURL(mediaUrl);');
    expect(conversationsSource).toContain('conversation-document-action');
    expect(conversationsSource).toContain('<Download size={15} aria-hidden="true" />');
    expect(conversationsSource).toContain("message.mediaFileName || 'Documento'");
    expect(conversationsSource).toContain('formatFileSize(message.mediaSizeBytes)');
    expect(conversationsSource).toContain('Tentar novamente');
    expect(conversationsSource).toContain('conversation-media-loading');
    expect(conversationsSource).toContain('conversation-audio-media');
    expect(conversationsSource).toContain('conversation-video-media');
    expect(conversationsSource).toContain('conversation-media-meta');
    expect(conversationsSource).toContain(
      "message.status === 'FAILED' && outbound && message.type === 'TEXT'",
    );
    expect(stylesSource).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
    expect(stylesSource).toContain('.conversation-bubble.has-image-media');
    expect(stylesSource).toContain('.conversation-image-lightbox');
    expect(stylesSource).toContain('max-width: calc(100vw - 20px);');
    expect(stylesSource).toContain('touch-action: pinch-zoom;');
    expect(stylesSource).toContain('.conversation-media-loading::before');
    expect(stylesSource).toContain('.conversation-document-copy strong');
    expect(stylesSource).toContain('text-overflow: ellipsis;');
    expect(stylesSource).toContain('.conversation-attachment-preview');
    expect(stylesSource).toContain('.conversation-attach-menu');
    expect(mobileConversationMediaSource).toContain(
      '.conversation-attachment-preview {\n    grid-template-columns: 34px minmax(0, 1fr) 34px;',
    );
  });

  it('keeps composer focus after manual send without stealing focus on retry', () => {
    expect(conversationsSource).toContain(
      'const composerRef = useRef<HTMLTextAreaElement | null>(null)',
    );
    expect(conversationsSource).toContain('composerFocusRequest, setComposerFocusRequest');
    expect(conversationsSource).toContain('pendingSendScrollConversationRef');
    expect(conversationsSource).toContain('pendingComposerFocusRef');
    expect(conversationsSource).toContain('const sendingRef = useRef(false);');
    expect(conversationsSource).toContain(
      'if (!selectedConversation || sending || sendingRef.current) return;',
    );
    expect(conversationsSource).toContain('sendingRef.current = true;');
    expect(conversationsSource).toContain('sendingRef.current = false;');
    expect(conversationsSource).toContain('scheduleComposerFocus');
    expect(conversationsSource).toContain('composerRef={composerRef}');
    expect(conversationsSource).toContain('ref={composerRef}');
    expect(conversationsSource).not.toContain('key={sending}');
    expect(conversationsSource).not.toContain('key={selectedDraft}');
    expect(conversationsSource).toContain(
      'pendingSendScrollConversationRef.current = selectedConversation.id',
    );
    expect(conversationsSource).toContain('pendingComposerFocusRef.current = focusComposer');
    expect(conversationsSource).toContain('setComposerFocusRequest((current) => current + 1)');
    expect(conversationsSource).toContain(
      'composerRef.current?.focus();\n      });\n    }\n\n    try {',
    );
    expect(conversationsSource).toContain(
      "(current[selectedConversation.id] ?? '').trim() === body",
    );
    expect(conversationsSource).toContain("? { ...current, [selectedConversation.id]: '' }");
    expect(conversationsSource).toContain(': current,');
    expect(conversationsSource).toContain(
      "void sendCurrentMessage(message.text ?? '', { focusComposer: false })",
    );
    expect(conversationsSource).toContain(
      'scrollConversationContainerToBottom(messagesScrollRef.current)',
    );
    expect(conversationsSource).toContain("event.key === 'Enter' && !event.shiftKey");
    expect(conversationsSource).toContain('event.preventDefault();');
    expect(conversationsSource).toContain('onMouseDown={(event) => {');
    expect(conversationsSource).toContain('onPointerDown={(event) => {');
    expect(conversationsSource).toContain('onPointerUp={(event) => {');
    expect(conversationsSource).toContain("event.pointerType !== 'mouse'");
    expect(conversationsSource).toContain('document.activeElement === composerRef.current');
  });

  it('keeps short conversations from receiving aggressive scroll and treats them as already at bottom', () => {
    expect(conversationsSource).toContain('function isConversationScrollable');
    expect(conversationsSource).toContain(
      'return element.scrollHeight > element.clientHeight + 2;',
    );
    expect(conversationsSource).toContain('if (!isConversationScrollable(element)) return true;');
    expect(conversationsSource).toContain('if (!isConversationScrollable(element)) return;');
    expect(stylesSource).toContain(
      '.conversation-message-stack {\n  box-sizing: border-box;\n  display: flex;\n  min-height: 100%;\n  flex-direction: column;\n  justify-content: flex-end;',
    );
    expect(stylesSource).toContain(
      '.conversation-message-end {\n  flex: 0 0 0;\n  height: 0;\n  min-height: 0;\n  margin: 0;\n  overflow: hidden;\n  padding: 0;',
    );
  });

  it('bottom-aligns only the padded message stack while preserving the empty chat state', () => {
    expect(conversationsSource).toContain('className="conversation-message-stack"');
    expect(conversationsSource).toContain('messages.length ? (');
    expect(conversationsSource).toMatch(
      /<div className="conversation-message-stack">[\s\S]*messages\.map/,
    );
    expect(conversationsSource).toContain(
      '<div className="conversation-empty-chat compact">Nenhuma mensagem nesta conversa.</div>',
    );
    expect(conversationsSource).toContain('className="conversation-message-end"');
    expect(stylesSource).toContain('justify-content: flex-end;');
    expect(stylesSource).toContain('padding: 0;\n  scroll-padding-bottom: 14px;');
    expect(stylesSource).toContain('padding: 14px 16px;');
    expect(mobileConversationMediaSource).toContain(
      '.conversation-messages {\n    padding: 0;\n    scroll-padding-bottom: 12px;',
    );
    expect(mobileConversationMediaSource).toContain(
      '.conversation-message-stack {\n    padding: 12px;',
    );
    expect(stylesSource).not.toContain(
      '.conversation-messages {\n  box-sizing: border-box;\n  display: flex;\n  flex: 1 1 auto;',
    );
  });

  it('lets guest conversations create a client or link to an existing client', () => {
    expect(conversationsSource).toContain('Dados do cliente');
    expect(conversationsSource).toContain('Abrir cliente');
    expect(conversationsSource).toContain('Contato avulso');
    expect(conversationsSource).toContain('<dd>{conversation.displayName}</dd>');
    expect(conversationsSource).not.toContain(
      '<dd>{conversation.contactName ?? conversation.displayName}</dd>',
    );
    expect(conversationsSource).toContain('const pendingAmount = (client.receivables ?? [])');
    expect(conversationsSource).toContain('<dd>{formatCurrency(pendingAmount)}</dd>');
    expect(conversationsSource).toContain('const instanceLabel = conversationInstanceLabel');
    expect(conversationsSource).toContain('linkWhatsAppConversationClient(selectedConversation.id');
    expect(conversationsSource).toContain('Vincular a cliente');
    expect(conversationsSource).toContain('Buscar por nome, telefone ou e-mail...');
    expect(conversationsSource).toContain('O telefone desta conversa é diferente');
    expect(conversationsSource).toContain('Esta conversa já está vinculada a outro cliente.');
    expect(conversationsSource).toContain('setConversations((current) =>');
    expect(conversationsSource).toContain('setClientDetail(await getClient(linked.client.id))');
    expect(conversationsSource).toContain('Cadastrar cliente');
    expect(conversationsSource).toContain('GuestConversationClientModal');
    expect(conversationsSource).toContain('initialValues={{ phone: conversationPhone }}');
    expect(conversationsSource).toContain('createClient(payload)');
    expect(conversationsSource).toContain(
      'linkConversationToClient(guestClientCreateConversation.id',
    );
    expect(conversationsSource).toContain('Já existe um cliente com este telefone.');
    expect(conversationsSource).toContain('Vincular ao cliente existente');
    expect(conversationsSource).toContain(
      'Cliente criado, mas a conversa ainda não foi vinculada.',
    );
    expect(conversationsSource).toContain('Tentar vincular novamente');
    expect(dashboardSource).toContain('function conversationInstanceLabel');
    expect(dashboardSource).toContain('function isTechnicalInstanceName');
    expect(dashboardSource).toContain('function phoneDigitsCompatible');
    expect(conversationsSource).not.toContain("{conversation.instanceName ?? '-'}");
    expect(conversationsSource).not.toContain(
      "{conversation.instanceName ?? 'Instância WhatsApp'}",
    );
    expect(conversationsSource).not.toContain('conversation.contactName');
    expect(conversationsSource).not.toContain('Gerar PIX');
    expect(stylesSource).toContain('.conversation-link-client');
    expect(stylesSource).toContain('.conversation-link-actions');
    expect(stylesSource).toContain(
      '.conversation-client-create-modal .conversation-client-create-body',
    );
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

  it('keeps the mobile conversation header compact without affecting desktop header rules', () => {
    expect(mobileConversationMediaSource).toContain('grid-template-columns: minmax(0, 1fr) 34px;');
    expect(mobileConversationMediaSource).toContain('gap: 2px 8px;');
    expect(mobileConversationMediaSource).toContain('padding: 5px 8px 6px;');
    expect(mobileConversationMediaSource).toContain('min-height: 24px;');
    expect(mobileConversationMediaSource).toContain('font-size: 11px;');
    expect(mobileConversationMediaSource).toContain('grid-template-columns: 30px minmax(0, 1fr);');
    expect(mobileConversationMediaSource).toContain('width: 30px;');
    expect(mobileConversationMediaSource).toContain('height: 30px;');
    expect(mobileConversationMediaSource).toContain('font-size: 14px;');
    expect(mobileConversationMediaSource).toContain('font-size: 10.5px;');
    expect(mobileConversationMediaSource).toContain('flex-wrap: nowrap;');
    expect(mobileConversationMediaSource).toContain('min-height: 16px;');
    expect(mobileConversationMediaSource).toContain('font-size: 9px;');
    expect(mobileConversationMediaSource).toContain(
      '.conversation-header-actions .conversation-resolved-label',
    );
    expect(mobileConversationMediaSource).toContain('width: 34px;');
    expect(mobileConversationMediaSource).toContain('height: 34px;');
    expect(mobileConversationMediaSource).toContain('min-height: 34px;');
    expect(stylesSource).toContain('min-width: 112px;');
    expect(stylesSource).toContain('width: 44px;');
    expect(stylesSource).toContain('height: 44px;');
  });

  it('keeps chat, list, and context scrolling inside the inbox shell', () => {
    expect(stylesSource).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto;');
    expect(stylesSource).toContain('.conversation-error-slot:empty');
    expect(stylesSource).toContain('.conversation-list-panel');
    expect(stylesSource).toContain('grid-template-rows: auto auto auto auto minmax(0, 1fr);');
    expect(stylesSource).toContain('.conversation-list-items');
    expect(stylesSource).toContain('.conversation-messages-wrap');
    expect(stylesSource).toContain('.conversation-messages');
    expect(stylesSource).toContain('.conversation-message-stack');
    expect(stylesSource).toContain('flex: 1 1 auto;');
    expect(stylesSource).toContain('overflow-y: auto;');
    expect(stylesSource).toContain('.conversation-composer');
    expect(stylesSource).toContain('flex: 0 0 auto;');
    expect(stylesSource).toContain('min-height: 82px;');
    expect(mobileConversationComposerBlock).not.toContain('position: sticky;');
    expect(stylesSource).toContain('.conversation-client-panel');
    expect(stylesSource).toContain('box-sizing: border-box;');
  });

  it('stabilizes the mobile chat composer against visual viewport changes', () => {
    expect(conversationsSource).toContain('const visualViewport = window.visualViewport');
    expect(conversationsSource).toContain('--chat-viewport-height');
    expect(conversationsSource).toContain(
      'const shouldKeepBottom = isConversationScrollNearBottom(messagesScrollRef.current)',
    );
    expect(conversationsSource).toContain('if (shouldKeepBottom) {');
    expect(conversationsSource).toContain(
      'scrollConversationContainerToBottom(messagesScrollRef.current)',
    );
    expect(conversationsSource).toContain("visualViewport?.addEventListener('resize'");
    expect(conversationsSource).toContain("visualViewport?.removeEventListener('resize'");
    expect(conversationsSource).toContain("root.style.removeProperty('--chat-viewport-height')");
    expect(stylesSource).toContain(
      ".app-shell[data-active-view='conversations'] {\n    height: var(--chat-viewport-height, 100svh);",
    );
    expect(stylesSource).toContain('@supports not (height: 100svh)');
    expect(stylesSource).toContain('padding: 10px 10px max(10px, env(safe-area-inset-bottom));');
    expect(mobileConversationComposerBlock).not.toContain('position: fixed;');
    expect(mobileConversationComposerBlock).not.toContain('position: sticky;');
  });

  it('keeps keyboard viewport resize pinned only when the operator was near bottom', () => {
    expect(conversationsSource).toContain(
      'const shouldKeepBottom = isConversationScrollNearBottom(messagesScrollRef.current)',
    );
    expect(conversationsSource).toMatch(
      /const shouldKeepBottom = isConversationScrollNearBottom\(messagesScrollRef\.current\);[\s\S]*root\.style\.setProperty\('--chat-viewport-height'[\s\S]*if \(shouldKeepBottom\) \{[\s\S]*scheduleConversationScroll/,
    );
    expect(conversationsSource).not.toContain('setNewMessageNotice(true);\n      } else {');
    expect(stylesSource).toContain('scroll-padding-bottom: 14px;');
    expect(mobileConversationMediaSource).toContain('scroll-padding-bottom: 12px;');
  });

  it('keeps the mobile chat height chain owned by the grid instead of page scroll', () => {
    expect(stylesSource).toContain(
      ".app-shell[data-active-view='conversations'] .main-area {\n  display: grid;\n  height: 100%;\n  min-height: 0;\n  grid-template-rows: auto minmax(0, 1fr);\n  overflow: hidden;",
    );
    expect(mobileConversationMediaSource).toContain(
      ".app-shell[data-active-view='conversations'] .content {\n    height: 100%;\n    max-height: 100%;",
    );
    expect(mobileConversationMediaSource).toContain(
      '.conversations-view {\n    height: 100%;\n    max-height: 100%;\n    min-height: 0;',
    );
    expect(mobileConversationsShellBlock).toContain('height: 100%;');
    expect(mobileConversationsShellBlock).toContain('max-height: 100%;');
    expect(mobileConversationsShellBlock).toContain('min-height: 0;');
    expect(mobileConversationChatPanelBlock).toContain('height: 100%;');
    expect(mobileConversationChatPanelBlock).toContain('max-height: 100%;');
    expect(mobileConversationChatPanelBlock).toContain('min-height: 0;');
  });

  it('keeps messages as the shrinking mobile row and composer as the final row', () => {
    expect(stylesSource).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto;');
    expect(stylesSource).toContain(
      '.conversation-messages-wrap {\n  position: relative;\n  min-height: 0;\n  overflow: hidden;',
    );
    expect(stylesSource).toContain(
      '.conversation-messages {\n  box-sizing: border-box;\n  flex: 1 1 auto;\n  height: 100%;\n  min-height: 0;',
    );
    expect(stylesSource).toContain(
      '.conversation-message-stack {\n  box-sizing: border-box;\n  display: flex;\n  min-height: 100%;\n  flex-direction: column;\n  justify-content: flex-end;\n  gap: 7px;',
    );
    expect(stylesSource).toContain('overflow-y: auto;');
    expect(stylesSource).toContain(
      '.conversation-composer {\n  display: grid;\n  box-sizing: border-box;\n  flex: 0 0 auto;',
    );
    expect(mobileConversationComposerBlock).toContain(
      'grid-template-columns: auto minmax(0, 1fr) auto;',
    );
  });

  it('keeps the visual viewport override scoped to mobile conversations so desktop remains unchanged', () => {
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(mobileConversationMediaSource).toContain(
      ".app-shell[data-active-view='conversations'] {",
    );
    expect(mobileConversationMediaSource).toContain('height: var(--chat-viewport-height, 100svh);');
    expect(stylesSource).toContain(
      ".app-shell[data-active-view='conversations'] {\n  height: 100dvh;\n  min-height: 0;\n  overflow: hidden;\n}",
    );
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
