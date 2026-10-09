'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createWhatsAppRealtimeEventSource,
  listWhatsAppConversations,
  type WhatsAppConversationSummary,
  type WhatsAppRealtimeEvent,
} from '../../lib/crm-api';

const soundEnabledStorageKey = 'crm.whatsapp.messageSoundEnabled';
const notificationSoundPath = '/sounds/message-notification.ogg';
const notifiedMessageCacheLimit = 200;

type WhatsAppRealtimeHandler = (event: WhatsAppRealtimeEvent) => void;

export interface WhatsAppRealtimeContextValue {
  activeConversationId: string | null;
  refreshSummary: () => Promise<WhatsAppConversationSummary | null>;
  realtimeConnected: boolean;
  setActiveConversationId: (conversationId: string | null) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSummary: (summary: WhatsAppConversationSummary | null) => void;
  soundEnabled: boolean;
  subscribe: (handler: WhatsAppRealtimeHandler) => () => void;
  summary: WhatsAppConversationSummary | null;
}

const WhatsAppRealtimeContext = createContext<WhatsAppRealtimeContextValue | null>(null);

export function WhatsAppRealtimeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WhatsAppRealtimeContextValue;
}) {
  return (
    <WhatsAppRealtimeContext.Provider value={value}>{children}</WhatsAppRealtimeContext.Provider>
  );
}

export function useWhatsAppRealtime() {
  const value = useContext(WhatsAppRealtimeContext);
  if (!value) {
    throw new Error('useWhatsAppRealtime must be used inside WhatsAppRealtimeProvider');
  }
  return value;
}

export function useWhatsAppRealtimeManager(enabled = true): WhatsAppRealtimeContextValue {
  const [summary, setSummary] = useState<WhatsAppConversationSummary | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const handlersRef = useRef(new Set<WhatsAppRealtimeHandler>());
  const activeConversationIdRef = useRef<string | null>(null);
  const soundEnabledRef = useRef(true);
  const enabledRef = useRef(enabled);
  const operatorInteractedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notifiedMessageIdsRef = useRef(createLimitedMessageIdCache(notifiedMessageCacheLimit));
  const summaryRefreshRef = useRef<ReturnType<typeof createSummaryRefreshController> | null>(null);

  if (!summaryRefreshRef.current) {
    summaryRefreshRef.current = createSummaryRefreshController({
      applySummary: setSummary,
      isEnabled: () => enabledRef.current,
      loadSummary: async () => {
        const payload = await listWhatsAppConversations({ page: 1, pageSize: 1 });
        return payload.summary;
      },
    });
  }

  const refreshSummary = useCallback(
    () => summaryRefreshRef.current?.refresh() ?? Promise.resolve(null),
    [],
  );

  const setSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    setSoundEnabledState(enabled);
    try {
      window.localStorage.setItem(soundEnabledStorageKey, enabled ? 'true' : 'false');
    } catch {
      // Local storage can be unavailable in private or restricted contexts.
    }
  }, []);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    activeConversationIdRef.current = conversationId;
    setActiveConversationIdState(conversationId);
  }, []);

  const subscribe = useCallback((handler: WhatsAppRealtimeHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    if (!operatorInteractedRef.current || !soundEnabledRef.current) return;

    const audio = audioRef.current ?? new Audio(notificationSoundPath);
    audioRef.current = audio;
    audio.volume = 0.32;
    audio.currentTime = 0;

    void audio.play().catch(() => undefined);
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: WhatsAppRealtimeEvent) => {
      for (const handler of handlersRef.current) {
        handler(event);
      }

      if (event.type === 'message.created' || event.type === 'conversation.updated') {
        void refreshSummary();
      }

      if (
        shouldNotifyWhatsAppSound({
          activeConversationId: activeConversationIdRef.current,
          direction: event.direction,
          focused: document.hasFocus(),
          messageId: event.messageId,
          soundEnabled: soundEnabledRef.current,
          targetConversationId: event.conversationId,
          type: event.type,
          visible: document.visibilityState === 'visible',
        }) &&
        notifiedMessageIdsRef.current.add(event.messageId)
      ) {
        playNotificationSound();
      }
    },
    [playNotificationSound, refreshSummary],
  );

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setRealtimeConnected(false);
      setSummary(null);
    }
  }, [enabled]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(soundEnabledStorageKey);
      const enabled = stored === null ? true : stored !== 'false';
      soundEnabledRef.current = enabled;
      setSoundEnabledState(enabled);
    } catch {
      soundEnabledRef.current = true;
      setSoundEnabledState(true);
    }
  }, []);

  useEffect(() => {
    const markInteracted = () => {
      operatorInteractedRef.current = true;
    };

    window.addEventListener('pointerdown', markInteracted, { once: true });
    window.addEventListener('keydown', markInteracted, { once: true });

    return () => {
      window.removeEventListener('pointerdown', markInteracted);
      window.removeEventListener('keydown', markInteracted);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    void refreshSummary();
  }, [enabled, refreshSummary]);

  useEffect(() => {
    if (!enabled) return undefined;

    const eventSource = createWhatsAppRealtimeEventSource();
    const handleOpen = () => {
      setRealtimeConnected(true);
      void refreshSummary();
    };
    const handleError = () => setRealtimeConnected(false);
    const handleMessage = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as WhatsAppRealtimeEvent;
        if (!payload.conversationId || !payload.type) return;
        handleRealtimeEvent(payload);
      } catch {
        setRealtimeConnected(false);
      }
    };

    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('error', handleError);
    eventSource.addEventListener('message.created', handleMessage);
    eventSource.addEventListener('message.updated', handleMessage);
    eventSource.addEventListener('conversation.updated', handleMessage);

    return () => {
      eventSource.removeEventListener('open', handleOpen);
      eventSource.removeEventListener('error', handleError);
      eventSource.removeEventListener('message.created', handleMessage);
      eventSource.removeEventListener('message.updated', handleMessage);
      eventSource.removeEventListener('conversation.updated', handleMessage);
      eventSource.close();
      setRealtimeConnected(false);
    };
  }, [enabled, handleRealtimeEvent, refreshSummary]);

  return useMemo(
    () => ({
      activeConversationId,
      refreshSummary,
      realtimeConnected,
      setActiveConversationId,
      setSoundEnabled,
      setSummary,
      soundEnabled,
      subscribe,
      summary,
    }),
    [
      activeConversationId,
      refreshSummary,
      realtimeConnected,
      setActiveConversationId,
      setSoundEnabled,
      soundEnabled,
      subscribe,
      summary,
    ],
  );
}

export function shouldNotifyWhatsAppSound({
  activeConversationId,
  direction,
  focused,
  messageId,
  soundEnabled,
  targetConversationId,
  type,
  visible,
}: {
  activeConversationId: string | null;
  direction: WhatsAppRealtimeEvent['direction'];
  focused: boolean;
  messageId: string | undefined;
  soundEnabled: boolean;
  targetConversationId: string;
  type: WhatsAppRealtimeEvent['type'];
  visible: boolean;
}) {
  return (
    soundEnabled &&
    type === 'message.created' &&
    direction === 'INBOUND' &&
    Boolean(messageId) &&
    !(activeConversationId === targetConversationId && visible && focused)
  );
}

export function formatUnreadBadge(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return value > 99 ? '99+' : String(value);
}

export function createLimitedMessageIdCache(limit: number) {
  const ids: string[] = [];
  const set = new Set<string>();

  return {
    add(messageId: string | undefined) {
      if (!messageId) return false;
      if (set.has(messageId)) return false;

      set.add(messageId);
      ids.push(messageId);

      while (ids.length > limit) {
        const removed = ids.shift();
        if (removed) set.delete(removed);
      }

      return true;
    },
    has(messageId: string) {
      return set.has(messageId);
    },
    size() {
      return set.size;
    },
  };
}

export function createSummaryRefreshController({
  applySummary,
  isEnabled,
  loadSummary,
}: {
  applySummary: (summary: WhatsAppConversationSummary) => void;
  isEnabled: () => boolean;
  loadSummary: () => Promise<WhatsAppConversationSummary>;
}) {
  let inFlight: Promise<WhatsAppConversationSummary | null> | null = null;
  let rerunRequested = false;

  return {
    refresh() {
      if (!isEnabled()) return Promise.resolve(null);

      if (inFlight) {
        rerunRequested = true;
        return inFlight;
      }

      inFlight = (async () => {
        let latestSummary: WhatsAppConversationSummary | null = null;

        do {
          rerunRequested = false;

          try {
            const summary = await loadSummary();
            latestSummary = summary;

            if (!rerunRequested && isEnabled()) {
              applySummary(summary);
            }
          } catch {
            latestSummary = null;
          }
        } while (rerunRequested && isEnabled());

        return latestSummary;
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
  };
}
