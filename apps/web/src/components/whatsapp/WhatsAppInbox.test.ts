import { describe, expect, it, vi } from 'vitest';
import {
  advanceConversationListGeneration,
  allowedWhatsAppReactionEmojis,
  classifyConversationIncomingFile,
  conversationComposerActionMode,
  conversationVideoAccept,
  createConversationComposerMedia,
  disposeConversationComposerMedia,
  conversationMessageCaption,
  isAvailableInlineConversationMedia,
  isRenderableConversationMessage,
  isTechnicalVideoPlaceholder,
  mergeConversationById,
  mergeConversationLists,
  mergeConversationMessages,
  nextOwnReactionEmoji,
  nextConversationListRequestGeneration,
  resolveRealtimeCreatedMessage,
  shouldAutoReadRealtimeMessage,
  shouldApplyConversationListResponse,
  shouldReadVisibleConversationOnReturn,
  shouldRetryActiveConversationRead,
  summarizeConversationReactions,
  updateConversationSummaryAfterRead,
} from './WhatsAppInbox';
import type { WhatsAppConversation, WhatsAppConversationMessage } from '../../lib/crm-api';

function conversation(
  id: string,
  overrides: Partial<WhatsAppConversation> = {},
): WhatsAppConversation {
  return {
    id,
    whatsAppConnectionId: 'connection-1',
    instanceName: null,
    provider: 'KIRAGO',
    externalInstanceId: null,
    client: null,
    displayName: `Contato ${id}`,
    contactName: null,
    phone: '5544999999999',
    phoneNormalized: '5544999999999',
    status: 'OPEN',
    lastMessageAt: '2026-10-08T12:00:00.000Z',
    lastMessagePreview: 'Mensagem',
    unreadCount: 0,
    createdAt: '2026-10-08T11:00:00.000Z',
    updatedAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

function message(
  overrides: Partial<WhatsAppConversationMessage> = {},
): WhatsAppConversationMessage {
  return {
    id: 'message-1',
    direction: 'INBOUND',
    type: 'TEXT',
    text: 'Ola',
    status: 'SENT',
    sentAt: '2026-10-08T12:00:00.000Z',
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    isFromMe: false,
    providerMessageId: 'provider-message-1',
    replyTo: null,
    replyToMessageId: null,
    replyToProviderMessageId: null,
    quotedText: null,
    mediaMimeType: null,
    mediaFileName: null,
    mediaSizeBytes: null,
    mediaDurationSeconds: null,
    reactions: [],
    mediaAvailable: false,
    retryAction: null,
    messageDispatchId: null,
    createdAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

function reaction(
  overrides: Partial<WhatsAppConversationMessage['reactions'][number]> = {},
): WhatsAppConversationMessage['reactions'][number] {
  return {
    id: 'reaction-1',
    emoji: '❤️',
    reactorKey: 'crm:self',
    isFromMe: true,
    createdAt: '2026-10-08T12:01:00.000Z',
    updatedAt: '2026-10-08T12:01:00.000Z',
    ...overrides,
  };
}

describe('WhatsAppInbox unread reconciliation helpers', () => {
  it('classifies incoming composer files with the same media rules used by upload', () => {
    expect(
      classifyConversationIncomingFile(new File(['image'], 'print.png', { type: 'image/png' })),
    ).toEqual({ ok: true, kind: 'IMAGE' });
    expect(
      classifyConversationIncomingFile(
        new File(['document'], 'contrato.pdf', { type: 'application/pdf' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(new File(['audio'], 'audio.ogg', { type: 'audio/ogg' })),
    ).toEqual({ ok: true, kind: 'AUDIO' });
    expect(
      classifyConversationIncomingFile(new File(['video'], 'video.mp4', { type: 'video/mp4' })),
    ).toEqual({ ok: true, kind: 'VIDEO' });
    expect(
      classifyConversationIncomingFile(new File(['video'], 'VIDEO.MP4', { type: 'video/mp4' })),
    ).toEqual({ ok: true, kind: 'VIDEO' });
    expect(conversationVideoAccept).toContain('video/mp4');

    expect(
      classifyConversationIncomingFile(
        new File(['zip'], 'arquivos.zip', { type: 'application/zip' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['zip'], 'arquivos.zip', { type: 'application/x-zip-compressed' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['zip'], 'arquivos.zip', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['rar'], 'pacote.rar', { type: 'application/vnd.rar' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['rar'], 'pacote.rar', { type: 'application/x-rar-compressed' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['psd'], 'layout.psd', { type: 'image/vnd.adobe.photoshop' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['psd'], 'layout.psd', { type: 'application/x-photoshop' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['psd'], 'layout.psd', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['apk'], 'app.apk', { type: 'application/vnd.android.package-archive' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['apk'], 'app.apk', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(new File(['zip'], 'ARQUIVOS.ZIP', { type: '' })),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
    expect(
      classifyConversationIncomingFile(
        new File(['rar'], 'pacote.Rar', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: true, kind: 'DOCUMENT' });
  });

  it('rejects unsupported, mismatched and oversized composer files before upload', () => {
    expect(
      classifyConversationIncomingFile(new File(['audio'], 'audio.wav', { type: 'audio/wav' })),
    ).toEqual({ ok: false, error: 'Formato de áudio não suportado. Envie OGG, MP3 ou M4A.' });

    expect(
      classifyConversationIncomingFile(new File(['video'], 'video.webm', { type: 'video/webm' })),
    ).toEqual({ ok: false, error: 'Formato de vídeo não suportado. Envie MP4.' });

    expect(
      classifyConversationIncomingFile(new File(['fake'], 'video.mp4', { type: 'image/jpeg' })),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['fake'], 'video.mp4', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(new File(['fake'], 'arquivo.mov', { type: 'video/mp4' })),
    ).toEqual({ ok: false, error: 'Formato de vídeo não suportado. Envie MP4.' });

    expect(
      classifyConversationIncomingFile(new File(['fake'], 'arquivo.jpg', { type: 'video/mp4' })),
    ).toEqual({ ok: false, error: 'Formato de vídeo não suportado. Envie MP4.' });

    expect(
      classifyConversationIncomingFile(
        new File(['exe'], 'setup.exe', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['bin'], 'payload.bin', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['unknown'], 'arquivo.xyz', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['exe'], 'arquivo.zip', { type: 'application/x-msdownload' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(new File(['jpeg'], 'arquivo.zip', { type: 'image/jpeg' })),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['zip'], 'arquivo.exe.zip', { type: 'application/x-msdownload' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    expect(
      classifyConversationIncomingFile(
        new File(['exe'], 'arquivo.zip.exe', { type: 'application/octet-stream' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });

    const oneMb = 1024 * 1024;

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(25 * oneMb)], 'video-25mb.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({ ok: true, kind: 'VIDEO' });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(30 * oneMb)], 'video-30mb.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({ ok: true, kind: 'VIDEO' });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(40 * oneMb)], 'video-40mb.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({ ok: true, kind: 'VIDEO' });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(49 * oneMb + 900 * 1024)], 'video-49-9mb.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({ ok: true, kind: 'VIDEO' });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(50 * oneMb)], 'video-50mb.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({ ok: true, kind: 'VIDEO' });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(50 * oneMb + 1)], 'grande.mp4', {
          type: 'video/mp4',
        }),
      ),
    ).toEqual({
      ok: false,
      error: 'Vídeo excede o limite de 50 MB permitido para envio por WhatsApp.',
    });

    expect(
      classifyConversationIncomingFile(
        new File([new Uint8Array(10 * oneMb)], 'limite.jpg', { type: 'image/jpeg' }),
      ),
    ).toEqual({ ok: true, kind: 'IMAGE' });

    for (const file of [
      new File([new Uint8Array(11 * oneMb)], 'grande.pdf', { type: 'application/pdf' }),
      new File([new Uint8Array(20 * oneMb)], 'grande.zip', { type: 'application/zip' }),
      new File([new Uint8Array(10 * oneMb + 1)], 'grande.rar', { type: 'application/vnd.rar' }),
      new File([new Uint8Array(10 * oneMb + 1)], 'grande.psd', {
        type: 'image/vnd.adobe.photoshop',
      }),
      new File([new Uint8Array(10 * oneMb + 1)], 'grande.apk', {
        type: 'application/vnd.android.package-archive',
      }),
      new File([new Uint8Array(11 * oneMb)], 'grande.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(11 * oneMb)], 'grande.mp3', { type: 'audio/mpeg' }),
    ]) {
      expect(classifyConversationIncomingFile(file)).toEqual({
        ok: false,
        error: 'Arquivo excede o limite de 10 MB permitido.',
      });
    }
  });

  it('uses central classifier and composer helpers for drag/drop and paste video files', () => {
    const droppedVideo = new File(['video'], 'drop.mp4', { type: 'video/mp4' });
    const pastedVideo = new File(['video'], 'paste.mp4', { type: 'video/mp4' });

    expect(classifyConversationIncomingFile(droppedVideo)).toEqual({ ok: true, kind: 'VIDEO' });
    expect(classifyConversationIncomingFile(pastedVideo)).toEqual({ ok: true, kind: 'VIDEO' });
  });

  it('creates video previews, keeps send action while attached and cleans object URLs', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video-preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const video = new File(['video'], 'preview.mp4', { type: 'video/mp4' });

    const media = createConversationComposerMedia(video, 'VIDEO');

    expect(media).toMatchObject({ file: video, kind: 'VIDEO', previewUrl: 'blob:video-preview' });
    expect(createObjectURL).toHaveBeenCalledWith(video);
    expect(conversationComposerActionMode('', media, false)).toBe('SEND');

    disposeConversationComposerMedia(media);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:video-preview');

    expect(conversationComposerActionMode('', null, false)).toBe('VOICE');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('removes the sidebar unread badge immediately when read returns zero', () => {
    const current = [conversation('a', { unreadCount: 1 })];
    const read = conversation('a', { unreadCount: 0, updatedAt: '2026-10-08T12:01:00.000Z' });

    expect(mergeConversationById(current, read)).toEqual([read]);
    expect(
      updateConversationSummaryAfterRead(
        { totalUnreadConversations: 1, totalUnreadMessages: 1 },
        1,
        read.unreadCount,
      ),
    ).toEqual({ totalUnreadConversations: 0, totalUnreadMessages: 0 });
  });

  it('keeps the backend unread count when read is partially successful', () => {
    const current = [conversation('a', { unreadCount: 3 })];
    const read = conversation('a', { unreadCount: 1 });

    expect(mergeConversationById(current, read)[0]?.unreadCount).toBe(1);
    expect(
      updateConversationSummaryAfterRead(
        { totalUnreadConversations: 1, totalUnreadMessages: 3 },
        3,
        read.unreadCount,
      ),
    ).toEqual({ totalUnreadConversations: 1, totalUnreadMessages: 1 });
  });

  it('keeps badges unchanged when read fails or backend reports no progress', () => {
    const summary = { totalUnreadConversations: 1, totalUnreadMessages: 1 };

    expect(updateConversationSummaryAfterRead(summary, 1, 1)).toBe(summary);
  });

  it('updates only the matching sidebar item without duplicating after SSE reconciliation', () => {
    const current = [conversation('a', { unreadCount: 1 }), conversation('b', { unreadCount: 0 })];
    const read = conversation('a', {
      unreadCount: 0,
      lastMessageAt: '2026-10-08T12:05:00.000Z',
    });

    const once = mergeConversationById(current, read);
    const twice = mergeConversationById(once, read);

    expect(twice).toHaveLength(2);
    expect(twice.map((item) => item.id)).toEqual(['a', 'b']);
    expect(twice[0]).toMatchObject({ id: 'a', unreadCount: 0 });
    expect(twice[1]).toMatchObject({ id: 'b', unreadCount: 0 });
  });

  it('keeps mobile list data correct when returning from an opened conversation', () => {
    const mobileListState = [conversation('mobile-a', { unreadCount: 1 })];
    const read = conversation('mobile-a', { unreadCount: 0 });

    expect(mergeConversationById(mobileListState, read)[0]?.unreadCount).toBe(0);
  });

  it('keeps read zero when an older realtime list refresh returns stale unread later', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    let currentGeneration = 0;
    const staleRefreshGeneration = nextConversationListRequestGeneration(currentGeneration, false);
    currentGeneration = staleRefreshGeneration;

    let listState = [conversation('a', { unreadCount: 4 })];
    const selected = conversation('a', { unreadCount: 4 });
    const readConversation = conversation('a', {
      unreadCount: 0,
      updatedAt: '2026-10-08T12:01:00.000Z',
    });

    currentGeneration = advanceConversationListGeneration(currentGeneration);
    listState = mergeConversationById(listState, readConversation);
    const selectedAfterRead = mergeConversationById([selected], readConversation)[0];

    expect(
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: staleRefreshGeneration,
        requestQueryKey: queryKey,
      }),
    ).toBe(false);
    expect(listState[0]?.unreadCount).toBe(0);
    expect(selectedAfterRead?.unreadCount).toBe(0);
  });

  it('lets a newer list refresh with unread zero beat an older unread refresh', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    let currentGeneration = 0;
    const oldRefreshGeneration = nextConversationListRequestGeneration(currentGeneration, false);
    currentGeneration = oldRefreshGeneration;
    const newRefreshGeneration = nextConversationListRequestGeneration(currentGeneration, false);
    currentGeneration = newRefreshGeneration;

    let listState = [conversation('a', { unreadCount: 4 })];
    const newPayload = [conversation('a', { unreadCount: 0 })];
    const oldPayload = [conversation('a', { unreadCount: 4 })];

    if (
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: newRefreshGeneration,
        requestQueryKey: queryKey,
      })
    ) {
      listState = mergeConversationLists(listState, newPayload);
    }
    if (
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: oldRefreshGeneration,
        requestQueryKey: queryKey,
      })
    ) {
      listState = mergeConversationLists(listState, oldPayload);
    }

    expect(listState[0]?.unreadCount).toBe(0);
  });

  it('allows unread to increase again when a newer refresh observes a new inbound after read', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    let currentGeneration = 1;
    let listState = [conversation('a', { unreadCount: 0 })];

    currentGeneration = advanceConversationListGeneration(currentGeneration);
    const inboundRefreshGeneration = nextConversationListRequestGeneration(
      currentGeneration,
      false,
    );
    currentGeneration = inboundRefreshGeneration;

    if (
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: inboundRefreshGeneration,
        requestQueryKey: queryKey,
      })
    ) {
      listState = mergeConversationLists(listState, [conversation('a', { unreadCount: 1 })]);
    }

    expect(listState[0]?.unreadCount).toBe(1);
  });

  it('keeps other conversations and load-more pagination updates valid for current generations', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    const currentGeneration = 3;
    let listState = [conversation('a', { unreadCount: 0 }), conversation('b', { unreadCount: 0 })];

    if (
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: currentGeneration,
        requestQueryKey: queryKey,
      })
    ) {
      listState = mergeConversationLists(listState, [
        conversation('b', { unreadCount: 2, updatedAt: '2026-10-08T12:02:00.000Z' }),
        conversation('c', { unreadCount: 0 }),
      ]);
    }

    expect(listState.find((item) => item.id === 'a')?.unreadCount).toBe(0);
    expect(listState.find((item) => item.id === 'b')?.unreadCount).toBe(2);
    expect(listState.find((item) => item.id === 'c')).toBeTruthy();
    expect(nextConversationListRequestGeneration(currentGeneration, true)).toBe(currentGeneration);
  });

  it('discards stale SSE and polling list responses after read invalidates their generation', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    const sources = ['message.created', 'conversation.updated', 'polling'];

    for (const source of sources) {
      let currentGeneration = 5;
      const staleRefreshGeneration = nextConversationListRequestGeneration(
        currentGeneration,
        false,
      );
      currentGeneration = staleRefreshGeneration;
      currentGeneration = advanceConversationListGeneration(currentGeneration);

      expect(
        shouldApplyConversationListResponse({
          currentGeneration,
          currentQueryKey: queryKey,
          requestGeneration: staleRefreshGeneration,
          requestQueryKey: queryKey,
        }),
      ).toBe(false);
      expect(source).toBeTruthy();
    }
  });

  it('discards old query responses even when their generation number matches', () => {
    expect(
      shouldApplyConversationListResponse({
        currentGeneration: 7,
        currentQueryKey: JSON.stringify({ filter: 'unread', search: 'ana', statusFilter: '' }),
        requestGeneration: 7,
        requestQueryKey: JSON.stringify({ filter: 'all', search: '', statusFilter: '' }),
      }),
    ).toBe(false);
  });

  it('keeps summary reduced when a stale refresh summary arrives after read', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    let currentGeneration = 0;
    const staleRefreshGeneration = nextConversationListRequestGeneration(currentGeneration, false);
    currentGeneration = staleRefreshGeneration;

    let summary = { totalUnreadConversations: 1, totalUnreadMessages: 4 };
    currentGeneration = advanceConversationListGeneration(currentGeneration);
    summary = updateConversationSummaryAfterRead(summary, 4, 0) ?? summary;

    if (
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: staleRefreshGeneration,
        requestQueryKey: queryKey,
      })
    ) {
      summary = { totalUnreadConversations: 1, totalUnreadMessages: 4 };
    }

    expect(summary).toEqual({ totalUnreadConversations: 0, totalUnreadMessages: 0 });
  });

  it('discards load-more responses after a newer refresh changes generation', () => {
    const queryKey = JSON.stringify({ filter: 'all', search: '', statusFilter: '' });
    let currentGeneration = 3;
    const loadMoreGeneration = nextConversationListRequestGeneration(currentGeneration, true);
    currentGeneration = nextConversationListRequestGeneration(currentGeneration, false);

    expect(loadMoreGeneration).toBe(3);
    expect(currentGeneration).toBe(4);
    expect(
      shouldApplyConversationListResponse({
        currentGeneration,
        currentQueryKey: queryKey,
        requestGeneration: loadMoreGeneration,
        requestQueryKey: queryKey,
      }),
    ).toBe(false);
  });

  it('does not render empty text or unknown messages as chat bubbles', () => {
    expect(isRenderableConversationMessage(message({ text: null }))).toBe(false);
    expect(isRenderableConversationMessage(message({ text: '   ' }))).toBe(false);
    expect(isRenderableConversationMessage(message({ type: 'UNKNOWN', text: null }))).toBe(false);
  });

  it('keeps legitimate text and media-only messages renderable', () => {
    expect(isRenderableConversationMessage(message({ text: 'Oi' }))).toBe(true);
    expect(isRenderableConversationMessage(message({ type: 'UNKNOWN', text: 'payload' }))).toBe(
      true,
    );
    expect(
      isRenderableConversationMessage(
        message({ type: 'IMAGE', text: null, mediaAvailable: false }),
      ),
    ).toBe(true);
    expect(
      isRenderableConversationMessage(
        message({ type: 'AUDIO', text: null, mediaAvailable: true, mediaMimeType: 'audio/ogg' }),
      ),
    ).toBe(true);
    expect(
      isRenderableConversationMessage(
        message({ type: 'DOCUMENT', text: null, mediaAvailable: false, mediaFileName: null }),
      ),
    ).toBe(true);
    expect(isRenderableConversationMessage(message({ type: 'VIDEO', text: null }))).toBe(true);
    expect(isRenderableConversationMessage(message({ type: 'LOCATION', text: null }))).toBe(true);
  });

  it('treats available VIDEO as inline media and hides technical video placeholders', () => {
    expect(
      isAvailableInlineConversationMedia(
        message({ type: 'VIDEO', mediaAvailable: true, mediaMimeType: 'video/mp4' }),
      ),
    ).toBe(true);
    expect(isTechnicalVideoPlaceholder(':video:')).toBe(true);
    expect(isTechnicalVideoPlaceholder(' :VIDEO: ')).toBe(true);
    expect(conversationMessageCaption(message({ type: 'VIDEO', text: ':video:' }))).toBe('');
    expect(
      conversationMessageCaption(
        message({ type: 'VIDEO', text: 'Meu vídeo', mediaAvailable: true }),
      ),
    ).toBe('Meu vídeo');
  });

  it('auto-read only accepts active visible focused inbound message.created events', () => {
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'a',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: true,
        focused: true,
      }),
    ).toBe(true);

    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'a',
        eventType: 'message.created',
        messageDirection: 'OUTBOUND',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'b',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'a',
        eventType: 'message.updated',
        messageDirection: 'INBOUND',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'a',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: false,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'a',
        conversationId: 'a',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: true,
        focused: false,
      }),
    ).toBe(false);
  });

  it('resolves the real SSE message.created payload to the loaded inbound message', () => {
    const loadedMessages = [
      message({ id: 'MSG1', direction: 'OUTBOUND' }),
      message({ id: 'MSG2', direction: 'INBOUND', providerMessageId: 'A5FCB3' }),
    ];

    const createdMessage = resolveRealtimeCreatedMessage(
      { type: 'message.created', messageId: 'MSG2' },
      loadedMessages,
      [loadedMessages[0]!],
    );

    expect(createdMessage).toMatchObject({ id: 'MSG2', direction: 'INBOUND' });
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'A',
        conversationId: 'A',
        eventType: 'message.created',
        messageDirection: createdMessage?.direction ?? null,
        visible: true,
        focused: true,
      }),
    ).toBe(true);
  });

  it('resolves realtime message.created by provider id when the SSE id shape differs', () => {
    const loadedMessages = [
      message({ id: 'internal-1', direction: 'INBOUND', providerMessageId: 'A55F14' }),
    ];

    expect(
      resolveRealtimeCreatedMessage(
        { type: 'message.created', messageId: 'A55F14' },
        loadedMessages,
        [],
      ),
    ).toMatchObject({ id: 'internal-1', direction: 'INBOUND' });
  });

  it('uses newly loaded messages instead of stale previous state for realtime read decisions', () => {
    const previousMessages = [message({ id: 'MSG1', direction: 'OUTBOUND' })];
    const loadedMessages = [
      ...previousMessages,
      message({ id: 'MSG2', direction: 'INBOUND', providerMessageId: 'A5FCB3' }),
    ];

    const createdMessage = resolveRealtimeCreatedMessage(
      { type: 'message.created', messageId: 'unknown-sse-id' },
      loadedMessages,
      previousMessages,
    );

    expect(createdMessage).toMatchObject({ id: 'MSG2', direction: 'INBOUND' });
  });

  it('fails closed when multiple messages are newly loaded without an id match', () => {
    const previousMessages = [message({ id: 'MSG1', direction: 'INBOUND' })];
    const loadedMessages = [
      ...previousMessages,
      message({ id: 'MSG2', direction: 'OUTBOUND', providerMessageId: 'OUT2' }),
      message({ id: 'MSG3', direction: 'INBOUND', providerMessageId: 'IN3' }),
    ];

    expect(
      resolveRealtimeCreatedMessage(
        { type: 'message.created', messageId: 'unknown-sse-id' },
        loadedMessages,
        previousMessages,
      ),
    ).toBeNull();
  });

  it('keeps outbound, other conversation, and hidden realtime events from scheduling reads', () => {
    const outbound = resolveRealtimeCreatedMessage(
      { type: 'message.created', messageId: 'OUT1' },
      [message({ id: 'OUT1', direction: 'OUTBOUND' })],
      [],
    );

    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'A',
        conversationId: 'A',
        eventType: 'message.created',
        messageDirection: outbound?.direction ?? null,
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'A',
        conversationId: 'B',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoReadRealtimeMessage({
        activeConversationId: 'A',
        conversationId: 'A',
        eventType: 'message.created',
        messageDirection: 'INBOUND',
        visible: false,
        focused: true,
      }),
    ).toBe(false);
  });

  it('marks visible active conversations on return only when unread remains', () => {
    expect(
      shouldReadVisibleConversationOnReturn({
        activeConversation: conversation('a', { unreadCount: 2 }),
        activeConversationId: 'a',
        visible: true,
        focused: true,
      }),
    ).toBe(true);
    expect(
      shouldReadVisibleConversationOnReturn({
        activeConversation: conversation('a', { unreadCount: 0 }),
        activeConversationId: 'a',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldReadVisibleConversationOnReturn({
        activeConversation: conversation('a', { unreadCount: 2 }),
        activeConversationId: 'a',
        visible: false,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldReadVisibleConversationOnReturn({
        activeConversation: conversation('a', { unreadCount: 2 }),
        activeConversationId: 'b',
        visible: true,
        focused: true,
      }),
    ).toBe(false);
  });

  it('retries active reads only when a retry is requested and unread remains visible', () => {
    expect(
      shouldRetryActiveConversationRead({
        activeConversation: conversation('a', { unreadCount: 1 }),
        activeConversationId: 'a',
        conversationId: 'a',
        retryRequested: true,
        visible: true,
        focused: true,
      }),
    ).toBe(true);
    expect(
      shouldRetryActiveConversationRead({
        activeConversation: conversation('a', { unreadCount: 0 }),
        activeConversationId: 'a',
        conversationId: 'a',
        retryRequested: true,
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldRetryActiveConversationRead({
        activeConversation: conversation('a', { unreadCount: 1 }),
        activeConversationId: 'b',
        conversationId: 'a',
        retryRequested: true,
        visible: true,
        focused: true,
      }),
    ).toBe(false);
    expect(
      shouldRetryActiveConversationRead({
        activeConversation: conversation('a', { unreadCount: 1 }),
        activeConversationId: 'a',
        conversationId: 'a',
        retryRequested: true,
        visible: true,
        focused: false,
      }),
    ).toBe(false);
    expect(
      shouldRetryActiveConversationRead({
        activeConversation: conversation('a', { unreadCount: 1 }),
        activeConversationId: 'a',
        conversationId: 'a',
        retryRequested: false,
        visible: true,
        focused: true,
      }),
    ).toBe(false);
  });

  it('keeps reaction UI constrained to the MVP emoji allowlist', () => {
    expect([...allowedWhatsAppReactionEmojis]).toEqual(['👍', '❤️', '😂', '😮', '😢', '🙏']);
  });

  it('maps own reaction clicks to change or remove semantics without touching contact reactions', () => {
    const withOwnHeart = message({
      reactions: [
        reaction({ emoji: '❤️', isFromMe: true, reactorKey: 'crm:self' }),
        reaction({ id: 'reaction-contact', emoji: '😂', isFromMe: false, reactorKey: 'contact' }),
      ],
    });

    expect(nextOwnReactionEmoji(withOwnHeart, '❤️')).toBeNull();
    expect(nextOwnReactionEmoji(withOwnHeart, '😂')).toBe('😂');
    expect(
      nextOwnReactionEmoji(
        message({
          reactions: [reaction({ emoji: '🙏', isFromMe: false, reactorKey: 'contact' })],
        }),
        '👍',
      ),
    ).toBe('👍');
  });

  it('summarizes reactions for compact bubble rendering and replaces stale realtime state', () => {
    const stale = message({
      id: 'message-reaction',
      reactions: [reaction({ emoji: '❤️', isFromMe: true })],
    });
    const updated = message({
      id: 'message-reaction',
      reactions: [reaction({ id: 'reaction-updated', emoji: '😂', isFromMe: true })],
    });
    const merged = mergeConversationMessages([stale], [updated]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.reactions).toEqual([
      expect.objectContaining({ emoji: '😂', isFromMe: true }),
    ]);
    expect(JSON.stringify(merged)).not.toContain('❤️');
    expect(
      summarizeConversationReactions([
        reaction({ emoji: '❤️' }),
        reaction({ id: 'reaction-2', emoji: '❤️', reactorKey: 'contact', isFromMe: false }),
        reaction({ id: 'reaction-3', emoji: '😂', reactorKey: 'other', isFromMe: false }),
      ]),
    ).toEqual([
      ['❤️', 2],
      ['😂', 1],
    ]);
  });
});
