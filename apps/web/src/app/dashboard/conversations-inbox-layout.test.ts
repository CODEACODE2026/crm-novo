import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const whatsappInboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const primitivesSource = readFileSync(
  join(currentDir, '../../components/ui/primitives.tsx'),
  'utf8',
);
const conversationsSource = whatsappInboxSource;
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
    expect(conversationsSource).toContain("id: 'all', label: 'Todas'");
    expect(conversationsSource).toContain("id: 'unread', label: 'Não lidas'");
    expect(conversationsSource).toContain("id: 'clients', label: 'Clientes'");
    expect(conversationsSource).toContain("id: 'guests', label: 'Avulsos'");
    expect(conversationsSource).toContain('totalUnreadConversations');
    expect(conversationsSource).toContain('onSummaryChange(payload.summary)');
    expect(conversationsSource).toContain('Nenhuma conversa encontrada.');
    expect(conversationsSource).toContain('Nenhuma conversa corresponde à busca.');
    expect(conversationsSource).toContain('Falha ao carregar conversas.');
    expect(conversationsSource).toContain('Carregar mais conversas');
    expect(conversationsSource).toContain('Fim da lista');
    expect(conversationsSource).toContain('hasClient = true');
    expect(conversationsSource).toContain('hasClient = false');
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
    expect(conversationsSource).toContain('function formatConversationSummary');
    expect(conversationsSource).toContain(
      "pluralizePt(summary.totalUnreadConversations, 'conversa não lida', 'conversas não lidas')",
    );
    expect(conversationsSource).toContain(
      "pluralizePt(summary.totalUnreadMessages, 'mensagem', 'mensagens')",
    );
    expect(conversationsSource).toContain(
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

  it('uses SSE for realtime updates while keeping slower polling fallback', () => {
    expect(conversationsSource).toContain('createWhatsAppRealtimeEventSource');
    expect(conversationsSource).toContain('function useWhatsAppRealtime');
    expect(conversationsSource).toContain('onConnectedChange: setRealtimeConnected');
    expect(conversationsSource).toContain("event.type === 'message.created'");
    expect(conversationsSource).toContain("event.type === 'message.updated'");
    expect(conversationsSource).toContain("event.type === 'conversation.updated'");
    expect(conversationsSource).toContain(
      'activeConversationIdRef.current === event.conversationId',
    );
    expect(conversationsSource).toContain('scheduleRealtimeListRefresh');
    expect(conversationsSource).toContain('realtimeListRefreshTimeoutRef');
    expect(conversationsSource).toContain(
      'window.clearTimeout(realtimeListRefreshTimeoutRef.current)',
    );
    expect(conversationsSource).toContain('conversationListRealtimeFallbackPollingMs');
    expect(conversationsSource).toContain('conversationMessagesRealtimeFallbackPollingMs');
    expect(conversationsSource).toContain('conversationListPollingMs');
    expect(conversationsSource).toContain('conversationMessagesPollingMs');
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
    expect(conversationsSource).toContain('Carregar mensagens anteriores');
    expect(conversationsSource).toContain(
      'previousScrollTop + (currentElement.scrollHeight - previousScrollHeight)',
    );
    expect(conversationsSource).toContain('Sem mensagens antigas');
  });

  it('renders WhatsApp-style date separators using Sao Paulo calendar days', () => {
    expect(conversationsSource).toContain('ConversationDateSeparator');
    expect(conversationsSource).toContain('conversationMessageDateKey(message)');
    expect(conversationsSource).toContain('conversationMessageDateKey(previousMessage)');
    expect(conversationsSource).toContain('currentDateKey !== previousDateKey');
    expect(conversationsSource).toContain('conversationMessageDateLabel(message)');
    expect(conversationsSource).toContain(
      "const conversationDateSeparatorTimeZone = 'America/Sao_Paulo'",
    );
    expect(conversationsSource).toContain("if (messageKey === todayKey) return 'Hoje';");
    expect(conversationsSource).toContain("if (messageKey === yesterdayKey) return 'Ontem';");
    expect(conversationsSource).toContain(
      'return `${messageParts.day}/${messageParts.month}/${messageParts.year}`;',
    );
    expect(conversationsSource).toContain('message.sentAt ?? message.createdAt');
    expect(conversationsSource).toContain("new Intl.DateTimeFormat('pt-BR', {");
    expect(conversationsSource).toContain('timeZone: conversationDateSeparatorTimeZone');
    expect(conversationsSource).toContain('.formatToParts(date)');
    expect(conversationsSource).toContain(
      'Date.UTC(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day) - 1, 12)',
    );
    expect(conversationsSource).toContain('role="separator"');
    expect(conversationsSource).toContain('aria-label={`Mensagens de ${label.toLowerCase()}`}');
    expect(stylesSource).toContain('.conversation-date-separator');
    expect(stylesSource).toContain('border-radius: 999px;');
    expect(stylesSource).toContain('align-self: center;');
  });

  it('keeps pagination safe with dedupe, race guards, realtime refresh and retry states', () => {
    expect(conversationsSource).toContain('conversationListQueryKeyRef');
    expect(conversationsSource).toContain('mergeConversationLists(current, payload.items)');
    expect(conversationsSource).toContain('append: true');
    expect(conversationsSource).toContain('preserveLoaded: true');
    expect(conversationsSource).toContain('setListLoadMoreError(message)');
    expect(conversationsSource).toContain('setListLoadMoreError');
    expect(conversationsSource).toContain('setConversations([])');
    expect(conversationsSource).toContain('setConversationPage(firstConversationPage)');
    expect(conversationsSource).toContain('setOlderMessagesError(');
    expect(conversationsSource).toContain('activeConversationIdRef.current !== conversationId');
    expect(conversationsSource).toContain('payload.pagination.hasMore');
    expect(conversationsSource).toContain('olderMessagesCursor');
    expect(conversationsSource).toContain('olderMessagesLoadingRef.current');
    expect(conversationsSource).toContain('beforeCreatedAt: olderMessagesCursor.createdAt');
    expect(conversationsSource).toContain('beforeId: olderMessagesCursor.id');
    expect(conversationsSource).toContain('payload.pagination.nextCursor');
    expect(conversationsSource).toContain(
      'if (activeConversationIdRef.current !== conversationId) return;',
    );
    expect(conversationsSource).not.toContain('const nextPage = messagePage + 1');
  });

  it('keeps conversation list merge ordering compatible with backend pagination', () => {
    expect(conversationsSource).toContain('function conversationListSortTime');
    expect(conversationsSource).toContain('conversation.lastMessageAt');
    expect(conversationsSource).toContain('new Date(right.createdAt).getTime()');
    expect(conversationsSource).not.toContain('lastMessageAt ?? right.updatedAt');
    expect(conversationsSource).not.toContain('lastMessageAt ?? left.updatedAt');
  });

  it('supports message bubbles, non-text placeholders, send, failure and retry with a fresh request id', () => {
    expect(conversationsSource).toContain('conversation-bubble-row ${outbound ?');
    expect(conversationsSource).toContain("'outbound' : 'inbound'");
    expect(conversationsSource).toContain("AUDIO: ''");
    expect(conversationsSource).toContain("DOCUMENT: ''");
    expect(conversationsSource).not.toContain('[Documento]');
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

  it('supports compact image, document and audio attachments in the conversation composer', () => {
    expect(conversationsSource).toContain('type ConversationComposerMedia');
    expect(conversationsSource).toContain('const conversationMediaMaxBytes = 10 * 1024 * 1024;');
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
    expect(conversationsSource).toContain('allowedConversationAudioMimeTypes');
    expect(conversationsSource).toContain('accept="audio/ogg,audio/mpeg,audio/mp4"');
    expect(conversationsSource).toContain('Formato de áudio não suportado. Envie OGG, MP3 ou M4A.');
    expect(conversationsSource).toContain('conversation-attachment-preview');
    expect(conversationsSource).toContain('conversation-attachment-audio-preview');
    expect(conversationsSource).toContain('conversation-attach-menu');
    expect(conversationsSource).toContain('Imagem');
    expect(conversationsSource).toContain('Documento');
    expect(conversationsSource).toContain('Áudio');
    expect(conversationsSource).toContain('onRemoveMedia={clearComposerMedia}');
    expect(conversationsSource).toContain('formatFileSize(selectedMedia.file.size)');
    expect(conversationsSource).toContain('function ConversationMediaContent');
    expect(conversationsSource).toContain('message.mediaAvailable');
    expect(conversationsSource).toContain(
      "const hasAvailableImage = message.type === 'IMAGE' && message.mediaAvailable;",
    );
    expect(conversationsSource).toContain(
      "const hasAvailableInlineMedia =\n    (message.type === 'IMAGE' || message.type === 'AUDIO') && message.mediaAvailable;",
    );
    expect(conversationsSource).toContain(
      "const text = hasAvailableInlineMedia ? '' : conversationMessageDisplayText(message);",
    );
    expect(conversationsSource).toContain('function useMediaVisibility(enabled: boolean)');
    expect(conversationsSource).toContain('new IntersectionObserver');
    expect(conversationsSource).toContain("rootMargin: '240px 0px'");
    expect(conversationsSource).toContain('observer.disconnect();');
    expect(conversationsSource).toContain(
      "const imageAutoVisible = message.type === 'IMAGE' && message.mediaAvailable && !mediaUrl;",
    );
    expect(conversationsSource).toContain("if (type === 'AUDIO') return 'Mídia indisponível';");
    expect(conversationsSource).toContain(
      'downloadWhatsAppConversationMedia(conversationId, message.id)',
    );
    expect(conversationsSource).toContain('loadingPromiseRef.current');
    expect(conversationsSource).toContain(
      'if (loadingPromiseRef.current) return loadingPromiseRef.current;',
    );
    expect(conversationsSource).toContain('requestGenerationRef.current += 1;');
    expect(conversationsSource).toContain(
      'if (!mountedRef.current || requestGeneration !== requestGenerationRef.current)',
    );
    expect(conversationsSource).not.toContain('const autoPreview =');
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
    expect(conversationsSource).toContain('URL.revokeObjectURL(mediaUrlRef.current)');
    expect(conversationsSource).toContain('mediaUrlRef.current = null;');
    expect(conversationsSource).toContain('conversation-document-action');
    expect(conversationsSource).toContain('conversation-document-preview');
    expect(conversationsSource).toContain('conversation-document-preview-frame');
    expect(conversationsSource).toContain(
      "message.mediaMimeType?.toLowerCase() === 'application/pdf'",
    );
    expect(conversationsSource).toContain(
      'const showPdfPreview = isPdfDocument && pdfPreviewRequested && !error;',
    );
    expect(conversationsSource).toContain("showPdfPreview ? 'has-pdf-preview' : ''");
    expect(conversationsSource).toContain(
      '`${mediaUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`',
    );
    expect(conversationsSource).toContain('const previewUrl =');
    expect(conversationsSource).toContain('<object');
    expect(conversationsSource).toContain('type="application/pdf"');
    expect(conversationsSource).toContain('Visualizar');
    expect(conversationsSource).toContain('setPdfPreviewRequested(true);');
    expect(conversationsSource).toContain('Carregar imagem');
    expect(conversationsSource).toContain('Carregar vídeo');
    expect(conversationsSource).toContain('aria-hidden="true"');
    expect(conversationsSource).toContain(
      'const documentType = conversationDocumentTypeLabel(fileName, message.mediaMimeType);',
    );
    expect(conversationsSource).toContain(
      "const documentMeta = [documentType, fileSize].filter(Boolean).join(' | ');",
    );
    expect(conversationsSource).toContain(
      'function conversationDocumentTypeLabel(fileName: string, mimeType: string | null)',
    );
    expect(conversationsSource).toContain(
      "if (normalizedMime === 'application/pdf') return 'PDF';",
    );
    expect(conversationsSource).toContain('fileName.match(/\\.([a-z0-9]{1,8})$/i)?.[1]');
    expect(conversationsSource).toContain("return 'Arquivo';");
    expect(conversationsSource).toContain('<Download size={15} aria-hidden="true" />');
    expect(conversationsSource).toContain("message.mediaFileName || 'Documento'");
    expect(conversationsSource).toContain("if (type === 'DOCUMENT') return 'Mídia indisponível';");
    expect(conversationsSource).toContain('formatFileSize(message.mediaSizeBytes)');
    expect(conversationsSource).toContain('Falha ao carregar');
    expect(conversationsSource).toContain('Tentar novamente');
    expect(conversationsSource).toContain('conversation-media-loading');
    expect(conversationsSource).toContain('conversation-audio-media');
    expect(conversationsSource).toContain('function ConversationAudioPlayer');
    expect(conversationsSource).toContain('onLoadSource: () => Promise<string | null>;');
    expect(conversationsSource).toContain('pendingPlaybackRef.current = true;');
    expect(conversationsSource).toContain('audio.play().catch(() =>');
    expect(conversationsSource).toMatch(
      /audio\.play\(\)\.catch\(\(\) => \{\s+setWaiting\(false\);\s+setPlaying\(false\);\s+\}\);/,
    );
    expect(conversationsSource).toContain('message.mediaDurationSeconds');
    expect(conversationsSource).toContain('formatConversationAudioTime');
    expect(conversationsSource).toContain('audio.play()');
    expect(conversationsSource).toContain('audio.pause()');
    expect(conversationsSource).toContain('const conversationAudioPlayEvent');
    expect(conversationsSource).toContain('window.addEventListener(conversationAudioPlayEvent');
    expect(conversationsSource).toContain('window.removeEventListener(conversationAudioPlayEvent');
    expect(conversationsSource).toContain(
      'window.dispatchEvent(new CustomEvent(conversationAudioPlayEvent',
    );
    expect(conversationsSource).toContain('audio.currentTime = safeTime;');
    expect(conversationsSource).toContain('if (audio) audio.currentTime = 0;');
    expect(conversationsSource).toContain('function seekWithKeyboard');
    expect(conversationsSource).toContain('role="slider"');
    expect(conversationsSource).toContain('aria-valuetext');
    expect(conversationsSource).toContain('onTimeUpdate={syncTime}');
    expect(conversationsSource).toContain('onLoadedMetadata={syncDuration}');
    expect(conversationsSource).toContain('conversation-video-media');
    expect(conversationsSource).toContain('conversation-media-meta');
    expect(conversationsSource).toContain("message.status === 'FAILED' && outbound");
    expect(conversationsSource).toContain("message.retryAction === 'RETRY'");
    expect(conversationsSource).toContain('Selecionar arquivo novamente');
    expect(conversationsSource).toContain('Gravar novamente');
    expect(stylesSource).toContain('grid-template-columns: auto minmax(0, 1fr) auto;');
    expect(stylesSource).toContain('.conversation-bubble.has-image-media');
    expect(stylesSource).toContain('.conversation-image-lightbox');
    expect(stylesSource).toContain('max-width: calc(100vw - 20px);');
    expect(stylesSource).toContain('touch-action: pinch-zoom;');
    expect(stylesSource).toContain('.conversation-media-loading::before');
    expect(stylesSource).toContain('.conversation-media-unavailable.image-placeholder');
    expect(stylesSource).toContain('.conversation-document-media.has-pdf-preview');
    expect(stylesSource).toContain('width: min(300px, 100%);');
    expect(stylesSource).toContain('height: clamp(140px, 32vw, 170px);');
    expect(stylesSource).toContain('width: calc(100% + 24px);');
    expect(stylesSource).toContain('height: calc(100% + 48px);');
    expect(stylesSource).toContain('height: clamp(140px, 38vw, 160px);');
    expect(stylesSource).toContain('pointer-events: none;');
    expect(stylesSource).toContain('.conversation-document-preview:focus-visible');
    expect(stylesSource).toContain('.conversation-audio-player');
    expect(stylesSource).toContain('.conversation-audio-toggle');
    expect(stylesSource).toContain('.conversation-audio-progress');
    expect(stylesSource).toContain('.conversation-audio-progress:focus-visible');
    expect(stylesSource).toContain('font-variant-numeric: tabular-nums;');
    expect(stylesSource).toContain('.conversation-document-copy strong');
    expect(stylesSource).toContain('.conversation-document-icon span');
    expect(stylesSource).toContain('.conversation-document-copy .conversation-document-error');
    expect(stylesSource).toContain('text-overflow: ellipsis;');
    expect(stylesSource).toContain('.conversation-attachment-preview');
    expect(stylesSource).toContain('.conversation-voice-preview');
    expect(stylesSource).toContain('.conversation-voice-recorder');
    expect(stylesSource).toContain('.conversation-attach-menu');
    expect(mobileConversationMediaSource).toContain(
      '.conversation-attachment-preview,\n  .conversation-voice-preview,\n  .conversation-voice-recorder',
    );
  });

  it('keeps conversation media downloads lazy and interaction-gated', () => {
    expect(conversationsSource).toContain('useMediaVisibility(imageAutoVisible)');
    expect(conversationsSource).toContain(
      "if (message.type !== 'IMAGE' || !mediaVisible || mediaUrl) return;",
    );
    expect(conversationsSource).toContain('void loadMedia();');
    expect(conversationsSource).toContain('async function openImageLightbox()');
    expect(conversationsSource).toContain('const objectUrl = mediaUrl ?? (await loadMedia());');
    expect(conversationsSource).toContain('async function requestPdfPreview()');
    expect(conversationsSource).toContain("if (message.type === 'AUDIO')");
    expect(conversationsSource).toContain('onLoadSource={loadMedia}');
    expect(conversationsSource).toContain("if (message.type === 'VIDEO' && !mediaUrl)");
    expect(conversationsSource).toContain('Abrir / Baixar');
    expect(conversationsSource).toContain('URL.revokeObjectURL(mediaUrlRef.current)');
    expect(conversationsSource).toContain('return null;');
  });

  it('supports WebM microphone voice notes as a separate PTT flow', () => {
    expect(conversationsSource).toContain('type ConversationVoiceDraft');
    expect(conversationsSource).toContain('const conversationVoiceMaxSeconds = 60;');
    expect(conversationsSource).toContain(
      "const preferredConversationVoiceMimeType = 'audio/webm;codecs=opus';",
    );
    expect(conversationsSource).toContain(
      "const fallbackConversationVoiceMimeType = 'audio/webm';",
    );
    expect(conversationsSource).toContain('sendWhatsAppConversationVoice(selectedConversation.id');
    expect(conversationsSource).toContain('durationSeconds: voice.durationSeconds');
    expect(conversationsSource).toContain('requestId: voice.requestId');
    expect(conversationsSource).toContain('voice.conversationId !== selectedConversation.id');
    expect(conversationsSource).toContain('navigator.mediaDevices.getUserMedia({ audio: true })');
    expect(conversationsSource).toContain('MediaRecorder.isTypeSupported');
    expect(conversationsSource).toContain('new MediaRecorder(stream, { mimeType })');
    expect(conversationsSource).toContain('chunksRef.current.push(event.data)');
    expect(conversationsSource).toContain('recorder.onstop = () =>');
    expect(conversationsSource).toContain('handleRecorderStop(recorder)');
    expect(conversationsSource).toContain('new Blob(chunksRef.current, { type: mimeType })');
    expect(conversationsSource).toContain('new File([blob], `voice-${Date.now()}.webm`');
    expect(conversationsSource).toContain('const stoppingVoiceRef = useRef(false);');
    expect(conversationsSource).toContain('const discardRecordingRef = useRef(false);');
    expect(conversationsSource).toContain('const voiceSendingRef = useRef(false);');
    expect(conversationsSource).toContain('if (stoppingVoiceRef.current)');
    expect(conversationsSource).toContain('discardRecordingRef.current = true');
    expect(conversationsSource).not.toContain("recorder.onstop(new Event('stop'))");
    expect(conversationsSource).toContain(
      'if (!voiceDraft || sending || voiceSendingRef.current) return;',
    );
    expect(conversationsSource).toContain('voiceSendingRef.current = true;');
    expect(conversationsSource).toContain('voiceSendingRef.current = false;');
    expect(conversationsSource).toContain('streamRef.current = stream;');
    expect(conversationsSource).toContain('URL.createObjectURL(blob)');
    expect(conversationsSource).toContain('URL.revokeObjectURL(current.previewUrl)');
    expect(conversationsSource).toContain('conversationVoiceMaxSeconds * 1000');
    expect(conversationsSource).toContain('setVoiceError(');
    expect(conversationsSource).toContain(
      'Não foi possível acessar o microfone. Verifique a permissão do navegador.',
    );
    expect(conversationsSource).toContain('Falha ao enviar gravação. Você pode tentar novamente.');
    expect(conversationsSource).toContain('cancelVoiceRecording()');
    expect(conversationsSource).toContain('track.stop()');
    expect(conversationsSource).toContain('clearVoiceTimers()');
    expect(conversationsSource).toContain(
      'onSendVoice={(voice) => sendCurrentVoiceMessage(voice)}',
    );
    expect(conversationsSource).toContain('label="Gravar áudio"');
    expect(conversationsSource).toContain('label="Parar gravação"');
    expect(conversationsSource).toContain('label="Cancelar gravação"');
    expect(conversationsSource).toContain('label="Enviar gravação"');
    expect(conversationsSource).toContain('conversation-recording-dot');
    expect(conversationsSource).toContain('conversation-voice-preview');
    expect(conversationsSource).toContain('accept="audio/ogg,audio/mpeg,audio/mp4"');
    expect(conversationsSource).toContain('sendWhatsAppConversationMedia(selectedConversation.id');
    expect(stylesSource).toContain('@keyframes conversation-recording-pulse');
    expect(stylesSource).toContain('.conversation-composer-tools');
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
    expect(conversationsSource).toContain('retryWhatsAppConversationMessage(message.id)');
    expect(conversationsSource).toContain(
      "await sendCurrentMessage(message.text ?? '', { focusComposer: false })",
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
    expect(conversationsSource).toContain('function conversationInstanceLabel');
    expect(conversationsSource).toContain('function isTechnicalInstanceName');
    expect(conversationsSource).toContain('function phoneDigitsCompatible');
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
