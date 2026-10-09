import { describe, expect, it } from 'vitest';
import {
  advanceConversationListGeneration,
  isRenderableConversationMessage,
  mergeConversationById,
  mergeConversationLists,
  nextConversationListRequestGeneration,
  shouldAutoReadRealtimeMessage,
  shouldApplyConversationListResponse,
  shouldReadVisibleConversationOnReturn,
  shouldRetryActiveConversationRead,
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
    mediaMimeType: null,
    mediaFileName: null,
    mediaSizeBytes: null,
    mediaDurationSeconds: null,
    mediaAvailable: false,
    retryAction: null,
    messageDispatchId: null,
    createdAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('WhatsAppInbox unread reconciliation helpers', () => {
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
});
