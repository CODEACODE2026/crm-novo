import { describe, expect, it, vi } from 'vitest';
import {
  conversationPresenceLabel,
  createLimitedMessageIdCache,
  createSummaryRefreshController,
  formatUnreadBadge,
  inboundConversationPresenceTtlMs,
  type InboundConversationPresenceMap,
  removeInboundConversationPresence,
  shouldNotifyWhatsAppSound,
  setInboundConversationPresence,
} from './WhatsAppRealtimeProvider';
import type { WhatsAppConversationSummary } from '../../lib/crm-api';

function deferredSummary() {
  let resolve!: (summary: WhatsAppConversationSummary) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<WhatsAppConversationSummary>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

describe('WhatsApp realtime provider helpers', () => {
  it('formats global unread badge values', () => {
    expect(formatUnreadBadge(0)).toBeNull();
    expect(formatUnreadBadge(null)).toBeNull();
    expect(formatUnreadBadge(7)).toBe('7');
    expect(formatUnreadBadge(99)).toBe('99');
    expect(formatUnreadBadge(100)).toBe('99+');
  });

  it('reduces inbound conversation presence without creating paused state', () => {
    const empty: InboundConversationPresenceMap = {};
    const recording = setInboundConversationPresence(empty, 'conversation-a', 'recording_audio');
    expect(recording).toEqual({ 'conversation-a': 'recording_audio' });
    expect(conversationPresenceLabel(recording['conversation-a'])).toBe('gravando áudio...');
    expect(setInboundConversationPresence(recording, 'conversation-a', 'recording_audio')).toBe(
      recording,
    );

    const cleared = removeInboundConversationPresence(recording, 'conversation-a');
    expect(cleared).toEqual({});
    expect(removeInboundConversationPresence(cleared, 'conversation-a')).toBe(cleared);
    expect(conversationPresenceLabel(cleared['conversation-a'])).toBeNull();
    expect(inboundConversationPresenceTtlMs).toBe(6000);
  });

  it('notifies only for real inbound message.created events with a message id', () => {
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: 'INBOUND',
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(true);

    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: 'OUTBOUND',
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: 'INBOUND',
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'conversation.presence',
        visible: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: 'INBOUND',
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.updated',
        visible: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: undefined,
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: null,
        direction: 'INBOUND',
        focused: true,
        messageId: undefined,
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(false);
  });

  it('keeps active visible focused inbox messages quiet but not background or other conversations', () => {
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: 'conversation-1',
        direction: 'INBOUND',
        focused: true,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(false);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: 'conversation-1',
        direction: 'INBOUND',
        focused: false,
        messageId: 'message-1',
        soundEnabled: true,
        targetConversationId: 'conversation-1',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(true);
    expect(
      shouldNotifyWhatsAppSound({
        activeConversationId: 'conversation-1',
        direction: 'INBOUND',
        focused: true,
        messageId: 'message-2',
        soundEnabled: true,
        targetConversationId: 'conversation-2',
        type: 'message.created',
        visible: true,
      }),
    ).toBe(true);
  });

  it('dedupes message ids with a limited FIFO cache', () => {
    const cache = createLimitedMessageIdCache(2);

    expect(cache.add('a')).toBe(true);
    expect(cache.add('a')).toBe(false);
    expect(cache.add('b')).toBe(true);
    expect(cache.add('c')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.size()).toBe(2);
  });

  it('coalesces summary refresh bursts and applies only the latest response', async () => {
    const first = deferredSummary();
    const second = deferredSummary();
    const applySummary = vi.fn();
    const loadSummary = vi
      .fn<() => Promise<WhatsAppConversationSummary>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = createSummaryRefreshController({
      applySummary,
      isEnabled: () => true,
      loadSummary,
    });

    const refreshes = [
      controller.refresh(),
      controller.refresh(),
      controller.refresh(),
      controller.refresh(),
      controller.refresh(),
    ];

    expect(loadSummary).toHaveBeenCalledTimes(1);

    first.resolve({ totalUnreadConversations: 1, totalUnreadMessages: 3 });
    await Promise.resolve();

    expect(loadSummary).toHaveBeenCalledTimes(2);
    expect(applySummary).not.toHaveBeenCalled();

    second.resolve({ totalUnreadConversations: 2, totalUnreadMessages: 5 });

    await expect(Promise.all(refreshes)).resolves.toEqual([
      { totalUnreadConversations: 2, totalUnreadMessages: 5 },
      { totalUnreadConversations: 2, totalUnreadMessages: 5 },
      { totalUnreadConversations: 2, totalUnreadMessages: 5 },
      { totalUnreadConversations: 2, totalUnreadMessages: 5 },
      { totalUnreadConversations: 2, totalUnreadMessages: 5 },
    ]);
    expect(applySummary).toHaveBeenCalledTimes(1);
    expect(applySummary).toHaveBeenCalledWith({
      totalUnreadConversations: 2,
      totalUnreadMessages: 5,
    });
  });
});
