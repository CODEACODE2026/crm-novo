'use client';

import {
  Fragment,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Download,
  Eye,
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Info,
  Loader2,
  MessagesSquare,
  Mic,
  Pause,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  Square,
  Trash2,
  Upload,
  UserCheck,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { ClientForm } from '../clients/client-form';
import { FinanceClientAutocomplete } from '../clients/finance-client-autocomplete';
import { PageHeader } from '../ui/admin-shell';
import { Button, IconButton } from '../ui/primitives';
import {
  ConversationMessageSearch,
  ConversationSearch,
  renderHighlightedSearchText,
} from './WhatsAppSearch';
import {
  ApiError,
  createClient,
  downloadWhatsAppConversationMedia,
  formatCurrency,
  getClient,
  getWhatsAppConversation,
  getWhatsAppConversationMessagesAround,
  linkWhatsAppConversationClient,
  listClientOptions,
  listPlans,
  listWhatsAppConnections,
  listWhatsAppConversationMessages,
  listWhatsAppConversations,
  markWhatsAppConversationRead,
  resolveWhatsAppConversation,
  retryWhatsAppConversationMessage,
  searchWhatsAppConversationMessages,
  sendWhatsAppConversationMedia,
  sendWhatsAppConversationMessage,
  sendWhatsAppConversationVoice,
  startWhatsAppConversation,
  type Client,
  type ClientOption,
  type ClientPayload,
  type Plan,
  type WhatsAppConnection,
  type WhatsAppConversation,
  type WhatsAppConversationMessage,
  type WhatsAppConversationMessageStatus,
  type WhatsAppConversationMessageType,
  type WhatsAppConversationMessagesCursor,
  type WhatsAppMessageSearchResult,
  type WhatsAppConversationStatus,
  type WhatsAppConversationSummary,
  type WhatsAppRealtimeEvent,
} from '../../lib/crm-api';
import { normalizeWhatsAppDisplayPhone } from '../../lib/whatsapp-actions';
import { formatNormalizedBrazilPhone } from '../clients/client-referral-select';
import { useWhatsAppRealtime } from './WhatsAppRealtimeProvider';

type ConversationFilter = 'all' | 'unread' | 'clients' | 'guests';
type StartConversationRecipientType = 'client' | 'guest';
export type ConversationComposerMedia = {
  file: File;
  kind: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
  previewUrl: string | null;
};

type ConversationIncomingFileResult =
  { ok: true; kind: ConversationComposerMedia['kind'] } | { ok: false; error: string };

type ConversationVoiceDraft = {
  conversationId: string;
  durationSeconds: number;
  file: File;
  previewUrl: string;
  requestId: string;
};

const conversationsPageSize = 20;
const conversationMessagesPageSize = 30;
const conversationMessageSearchPageSize = 50;
const firstConversationPage = 1;
const conversationDateSeparatorTimeZone = 'America/Sao_Paulo';
const conversationListPollingMs = 10000;
const conversationMessagesPollingMs = 4000;
const conversationListRealtimeFallbackPollingMs = 60000;
const conversationMessagesRealtimeFallbackPollingMs = 30000;
const activeConversationReadDebounceMs = 180;
const defaultConversationMediaMaxBytes = 10 * 1024 * 1024;
const videoConversationMediaMaxBytes = defaultConversationMediaMaxBytes;
const conversationMediaMaxBytes = defaultConversationMediaMaxBytes;
const conversationVideoMaxBytes = videoConversationMediaMaxBytes;
const conversationVoiceMaxSeconds = 60;
const allowedConversationImageMimeTypes = new Set(['image/jpeg', 'image/png']);
const allowedConversationDocumentMimeTypes = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
  'application/vnd.android.package-archive',
]);
const allowedConversationDocumentExtensions = new Set([
  'pdf',
  'txt',
  'doc',
  'docx',
  'zip',
  'rar',
  'psd',
  'apk',
]);
const conversationDocumentMimeTypesByExtension: Record<string, Set<string>> = {
  pdf: new Set(['application/pdf']),
  txt: new Set(['text/plain']),
  doc: new Set(['application/msword']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  zip: new Set(['application/zip', 'application/x-zip-compressed']),
  rar: new Set(['application/vnd.rar', 'application/x-rar-compressed']),
  psd: new Set(['image/vnd.adobe.photoshop', 'application/x-photoshop']),
  apk: new Set(['application/vnd.android.package-archive']),
};
const allowedConversationAudioMimeTypes = new Set(['audio/ogg', 'audio/mpeg', 'audio/mp4']);
const allowedConversationVideoMimeTypes = new Set(['video/mp4']);
const allowedConversationVideoExtensions = new Set(['mp4']);
export const conversationImageAccept = 'image/jpeg,image/png';
export const conversationDocumentAccept =
  'application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,image/vnd.adobe.photoshop,application/x-photoshop,application/vnd.android.package-archive,.zip,.rar,.psd,.apk';
export const conversationAudioAccept = 'audio/ogg,audio/mpeg,audio/mp4';
export const conversationVideoAccept = 'video/mp4';
const genericConversationFileMimeTypes = new Set(['', 'application/octet-stream']);
const preferredConversationVoiceMimeType = 'audio/webm;codecs=opus';
const fallbackConversationVoiceMimeType = 'audio/webm';

const conversationFilters = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'clients', label: 'Clientes' },
  { id: 'guests', label: 'Avulsos' },
] satisfies Array<{ id: ConversationFilter; label: string }>;

export function WhatsAppInbox({
  onOpenClient,
  onSummaryChange,
  onSummaryRefreshRequest,
}: {
  onOpenClient: (clientId: string) => Promise<void>;
  onSummaryChange: (summary: WhatsAppConversationSummary | null) => void;
  onSummaryRefreshRequest: () => Promise<WhatsAppConversationSummary | null>;
}) {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [summary, setSummary] = useState<WhatsAppConversationSummary | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<WhatsAppConversationMessage[]>([]);
  const [whatsAppConnections, setWhatsAppConnections] = useState<WhatsAppConnection[]>([]);
  const [clientDetail, setClientDetail] = useState<Client | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<WhatsAppConversationStatus | ''>('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedMedia, setSelectedMedia] = useState<ConversationComposerMedia | null>(null);
  const [dropOverlayVisible, setDropOverlayVisible] = useState(false);
  const [replyTarget, setReplyTarget] = useState<WhatsAppConversationMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [linkingClient, setLinkingClient] = useState(false);
  const [creatingGuestClient, setCreatingGuestClient] = useState(false);
  const [opening, setOpening] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [listError, setListError] = useState('');
  const [listLoadMoreError, setListLoadMoreError] = useState('');
  const [messagesError, setMessagesError] = useState('');
  const [olderMessagesError, setOlderMessagesError] = useState('');
  const [sendError, setSendError] = useState('');
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});
  const [retryingMessageIds, setRetryingMessageIds] = useState<Set<string>>(new Set());
  const [clientError, setClientError] = useState('');
  const [linkClientError, setLinkClientError] = useState('');
  const [guestClientCreateError, setGuestClientCreateError] = useState('');
  const [guestClientDuplicate, setGuestClientDuplicate] = useState<ClientOption | null>(null);
  const [guestClientCreatedUnlinked, setGuestClientCreatedUnlinked] = useState<ClientOption | null>(
    null,
  );
  const [mobileClientOpen, setMobileClientOpen] = useState(false);
  const [mobileMode, setMobileMode] = useState<'list' | 'chat'>('list');
  const [startConversationOpen, setStartConversationOpen] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [startConversationError, setStartConversationError] = useState('');
  const [guestClientCreateConversation, setGuestClientCreateConversation] =
    useState<WhatsAppConversation | null>(null);
  const [guestClientCreatePlans, setGuestClientCreatePlans] = useState<Plan[]>([]);
  const [guestClientCreatePlansLoading, setGuestClientCreatePlansLoading] = useState(false);
  const [newMessageNotice, setNewMessageNotice] = useState(false);
  const {
    realtimeConnected,
    setActiveConversationId: setGlobalActiveConversationId,
    subscribe: subscribeRealtime,
  } = useWhatsAppRealtime();
  const [conversationPage, setConversationPage] = useState(firstConversationPage);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] =
    useState<WhatsAppConversationMessagesCursor | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [hasNewerMessages, setHasNewerMessages] = useState(false);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const [targetSearchTerm, setTargetSearchTerm] = useState('');
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchInput, setMessageSearchInput] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<WhatsAppMessageSearchResult[]>(
    [],
  );
  const [messageSearchIndex, setMessageSearchIndex] = useState(0);
  const [messageSearchPage, setMessageSearchPage] = useState(firstConversationPage);
  const [messageSearchHasMore, setMessageSearchHasMore] = useState(false);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchLoadingMore, setMessageSearchLoadingMore] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const lastReadConversationRef = useRef<string | null>(null);
  const pendingInitialScrollConversationRef = useRef<string | null>(null);
  const pendingSendScrollConversationRef = useRef<string | null>(null);
  const pendingComposerFocusRef = useRef(false);
  const sendingRef = useRef(false);
  const retryingMessagesRef = useRef(new Set<string>());
  const startingConversationRef = useRef(false);
  const realtimeListRefreshTimeoutRef = useRef<number | null>(null);
  const pendingReadTimeoutsRef = useRef(new Map<string, number>());
  const readInFlightConversationIdsRef = useRef(new Set<string>());
  const readRetryConversationIdsRef = useRef(new Set<string>());
  const activeConversationReadSchedulerRef = useRef<(conversationId: string) => void>(() => {});
  const conversationListQueryKeyRef = useRef('');
  const conversationListRequestGenerationRef = useRef(0);
  const olderMessagesLoadedRef = useRef(false);
  const olderMessagesLoadingRef = useRef(false);
  const messagesRef = useRef<WhatsAppConversationMessage[]>([]);
  const conversationsRef = useRef<WhatsAppConversation[]>([]);
  const selectedConversationRef = useRef<WhatsAppConversation | null>(null);
  const summaryRef = useRef<WhatsAppConversationSummary | null>(null);
  const targetHighlightTimeoutRef = useRef<number | null>(null);
  const openMessageSearchGenerationRef = useRef(0);
  const messageSearchRequestKeyRef = useRef('');
  const messageSearchResultsRef = useRef<WhatsAppMessageSearchResult[]>([]);
  const messageSearchIndexRef = useRef(0);
  const chatDropDepthRef = useRef(0);

  const selectedDraft = selectedConversation ? (drafts[selectedConversation.id] ?? '') : '';

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    chatDropDepthRef.current = 0;
    setDropOverlayVisible(false);
    setSelectedMedia((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, [selectedConversation?.id]);

  const loadConversations = useCallback(
    async ({
      append = false,
      page = firstConversationPage,
      preserveLoaded = false,
      silent = false,
    }: { append?: boolean; page?: number; preserveLoaded?: boolean; silent?: boolean } = {}) => {
      const requestQueryKey = JSON.stringify({ filter, search, statusFilter });
      conversationListQueryKeyRef.current = requestQueryKey;
      const requestGeneration = nextConversationListRequestGeneration(
        conversationListRequestGenerationRef.current,
        append,
      );
      if (!append) {
        conversationListRequestGenerationRef.current = requestGeneration;
      }

      if (append) {
        setListLoadingMore(true);
        setListLoadMoreError('');
      } else if (!silent) {
        setListLoading(true);
      }
      if (!append) {
        setListError('');
        setListLoadMoreError('');
      }
      if (!append && !preserveLoaded && !silent) {
        setConversations([]);
        setConversationPage(firstConversationPage);
        setHasMoreConversations(false);
      }

      try {
        const filters: Parameters<typeof listWhatsAppConversations>[0] = {
          page,
          pageSize: conversationsPageSize,
        };
        if (search) filters.search = search;
        if (statusFilter) filters.status = statusFilter;
        if (filter === 'unread') filters.unreadOnly = true;
        if (filter === 'clients') filters.hasClient = true;
        if (filter === 'guests') filters.hasClient = false;

        const payload = await listWhatsAppConversations({
          ...filters,
        });
        if (
          !shouldApplyConversationListResponse({
            currentGeneration: conversationListRequestGenerationRef.current,
            currentQueryKey: conversationListQueryKeyRef.current,
            requestGeneration,
            requestQueryKey,
          })
        ) {
          return;
        }

        setConversations((current) => {
          if (append || preserveLoaded) {
            return mergeConversationLists(current, payload.items);
          }
          return payload.items;
        });
        setConversationPage(page);
        setHasMoreConversations(payload.pagination.hasMore ?? page < payload.pagination.totalPages);
        setSummary(payload.summary);
        onSummaryChange(payload.summary);
        setSelectedConversation((current) => {
          if (!current) return null;
          return payload.items.find((item) => item.id === current.id) ?? current;
        });
      } catch (err) {
        const message = conversationErrorMessage(err, 'Falha ao carregar conversas.');
        if (append) {
          setListLoadMoreError(message);
        } else {
          setListError(message);
        }
      } finally {
        if (append) {
          setListLoadingMore(false);
        } else if (!silent) {
          setListLoading(false);
        }
      }
    },
    [filter, onSummaryChange, search, statusFilter],
  );

  const loadMessages = useCallback(
    async (
      conversationId: string,
      { replace = false, silent = false }: { replace?: boolean; silent?: boolean } = {},
    ) => {
      if (!silent) {
        setMessagesLoading(true);
      }
      setMessagesError('');
      if (replace) {
        setOlderMessagesError('');
      }

      const shouldStick = isConversationScrollNearBottom(messagesScrollRef.current);

      try {
        const payload = await listWhatsAppConversationMessages(conversationId, {
          page: firstConversationPage,
          pageSize: conversationMessagesPageSize,
        });
        if (activeConversationIdRef.current !== conversationId) return null;
        const mergedMessages = replace
          ? mergeConversationMessages([], payload.items)
          : mergeConversationMessages(messagesRef.current, payload.items);
        setMessages(mergedMessages);
        messagesRef.current = mergedMessages;
        if (replace) {
          olderMessagesLoadedRef.current = false;
        }
        if (replace || !olderMessagesLoadedRef.current) {
          setOlderMessagesCursor(payload.pagination.nextCursor ?? null);
          setHasOlderMessages(Boolean(payload.pagination.hasMore));
          setHasNewerMessages(false);
        }
        if (!replace) {
          scheduleConversationScroll(() => {
            if (shouldStick) {
              scrollConversationContainerToBottom(messagesScrollRef.current);
            } else if (silent) {
              setNewMessageNotice(true);
            }
          });
        }
        return mergedMessages;
      } catch (err) {
        setMessagesError(conversationErrorMessage(err, 'Falha ao carregar mensagens.'));
        return null;
      } finally {
        if (!silent) {
          setMessagesLoading(false);
        }
      }
    },
    [],
  );

  const loadMoreConversations = useCallback(async () => {
    if (listLoadingMore || listLoading || !hasMoreConversations) return;
    await loadConversations({
      append: true,
      page: conversationPage + 1,
      silent: true,
    });
  }, [conversationPage, hasMoreConversations, listLoading, listLoadingMore, loadConversations]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = selectedConversation?.id;
    if (
      !conversationId ||
      !olderMessagesCursor ||
      olderMessagesLoadingRef.current ||
      olderMessagesLoading ||
      messagesLoading ||
      !hasOlderMessages
    ) {
      return;
    }

    const element = messagesScrollRef.current;
    const previousScrollHeight = element?.scrollHeight ?? 0;
    const previousScrollTop = element?.scrollTop ?? 0;

    setOlderMessagesLoading(true);
    olderMessagesLoadingRef.current = true;
    setOlderMessagesError('');

    try {
      const payload = await listWhatsAppConversationMessages(conversationId, {
        beforeCreatedAt: olderMessagesCursor.createdAt,
        beforeId: olderMessagesCursor.id,
        page: firstConversationPage,
        pageSize: conversationMessagesPageSize,
      });
      if (activeConversationIdRef.current !== conversationId) return;

      const mergedMessages = mergeConversationMessages(messagesRef.current, payload.items);
      setMessages(mergedMessages);
      messagesRef.current = mergedMessages;
      olderMessagesLoadedRef.current = true;
      setOlderMessagesCursor(payload.pagination.nextCursor ?? null);
      setHasOlderMessages(Boolean(payload.pagination.hasMore));
      scheduleConversationScroll(() => {
        if (activeConversationIdRef.current !== conversationId) return;
        const currentElement = messagesScrollRef.current;
        if (!currentElement) return;
        currentElement.scrollTop =
          previousScrollTop + (currentElement.scrollHeight - previousScrollHeight);
      });
    } catch (err) {
      setOlderMessagesError(
        conversationErrorMessage(err, 'Falha ao carregar mensagens anteriores.'),
      );
    } finally {
      olderMessagesLoadingRef.current = false;
      setOlderMessagesLoading(false);
    }
  }, [
    hasOlderMessages,
    messagesLoading,
    olderMessagesLoading,
    olderMessagesCursor,
    selectedConversation?.id,
  ]);

  const loadLatestMessages = useCallback(async () => {
    const conversationId = selectedConversation?.id;
    if (!conversationId || messagesLoading) return;

    pendingInitialScrollConversationRef.current = conversationId;
    setTargetMessageId(null);
    setTargetSearchTerm('');
    setHasNewerMessages(false);
    await loadMessages(conversationId, { replace: true });
  }, [loadMessages, messagesLoading, selectedConversation?.id]);

  const resetMessageSearch = useCallback(() => {
    messageSearchRequestKeyRef.current = JSON.stringify({ state: 'closed', time: Date.now() });
    setMessageSearchOpen(false);
    setMessageSearchInput('');
    setMessageSearchQuery('');
    messageSearchResultsRef.current = [];
    messageSearchIndexRef.current = 0;
    setMessageSearchResults([]);
    setMessageSearchIndex(0);
    setMessageSearchPage(firstConversationPage);
    setMessageSearchHasMore(false);
    setMessageSearchLoading(false);
    setMessageSearchLoadingMore(false);
    setMessageSearchError('');
    setTargetMessageId(null);
    setTargetSearchTerm('');
  }, []);

  const updateMessageSearchInput = useCallback(
    (value: string) => {
      const query = value.trim();
      messageSearchRequestKeyRef.current = JSON.stringify({
        conversationId: selectedConversation?.id ?? null,
        query,
        state: 'typing',
        time: Date.now(),
      });
      setMessageSearchInput(value);
      setMessageSearchError('');
      messageSearchResultsRef.current = [];
      messageSearchIndexRef.current = 0;
      setMessageSearchResults([]);
      setMessageSearchIndex(0);
      setMessageSearchPage(firstConversationPage);
      setMessageSearchHasMore(false);
      setMessageSearchLoading(false);
      setMessageSearchLoadingMore(false);
      setTargetMessageId(null);
      setTargetSearchTerm('');
    },
    [selectedConversation?.id],
  );

  const activateMessageSearchResult = useCallback(
    (result: WhatsAppMessageSearchResult, term: string, index: number) => {
      if (activeConversationIdRef.current !== result.conversation.id) return;

      messageSearchIndexRef.current = index;
      setMessageSearchIndex(index);
      setTargetSearchTerm(term);

      const alreadyLoaded = messagesRef.current.some((message) => message.id === result.message.id);
      if (alreadyLoaded) {
        setTargetMessageId(result.message.id);
        return;
      }

      void openMessageSearchResult(result, term);
    },
    [],
  );

  const loadMessageSearchResults = useCallback(
    async ({
      append,
      conversationId,
      page,
      query,
    }: {
      append: boolean;
      conversationId: string;
      page: number;
      query: string;
    }) => {
      const requestKey = JSON.stringify({ append, conversationId, page, query });
      messageSearchRequestKeyRef.current = requestKey;
      if (append) {
        setMessageSearchLoadingMore(true);
      } else {
        setMessageSearchLoading(true);
        setMessageSearchResults([]);
        setMessageSearchIndex(0);
      }
      setMessageSearchError('');

      try {
        const payload = await searchWhatsAppConversationMessages({
          conversationId,
          q: query,
          page,
          pageSize: conversationMessageSearchPageSize,
        });
        if (
          messageSearchRequestKeyRef.current !== requestKey ||
          activeConversationIdRef.current !== conversationId
        ) {
          return;
        }

        const currentResults = messageSearchResultsRef.current;
        const currentResultId = currentResults[messageSearchIndexRef.current]?.message.id ?? null;
        const results = mergeMessageSearchResults(append ? currentResults : [], payload.items);
        const nextIndex = currentResultId
          ? Math.max(
              0,
              results.findIndex((result) => result.message.id === currentResultId),
            )
          : 0;
        messageSearchResultsRef.current = results;
        messageSearchIndexRef.current = nextIndex;
        setMessageSearchResults(results);
        setMessageSearchPage(page);
        setMessageSearchHasMore(Boolean(payload.pagination.hasMore));
        setMessageSearchIndex(nextIndex);
        if (!append && results[0]) {
          activateMessageSearchResult(results[0], query, 0);
        } else if (!results.length) {
          setTargetMessageId(null);
          setTargetSearchTerm('');
        }
      } catch (err) {
        if (messageSearchRequestKeyRef.current === requestKey) {
          setMessageSearchError(searchMessageErrorMessage(err));
        }
      } finally {
        if (messageSearchRequestKeyRef.current === requestKey) {
          setMessageSearchLoading(false);
          setMessageSearchLoadingMore(false);
        }
      }
    },
    [activateMessageSearchResult],
  );

  const goToMessageSearchResult = useCallback(
    (direction: 'next' | 'previous') => {
      if (!messageSearchResults.length) return;
      const delta = direction === 'next' ? 1 : -1;
      const nextIndex =
        (messageSearchIndex + delta + messageSearchResults.length) % messageSearchResults.length;
      const result = messageSearchResults[nextIndex];
      if (!result) return;

      activateMessageSearchResult(result, messageSearchQuery, nextIndex);
    },
    [activateMessageSearchResult, messageSearchIndex, messageSearchQuery, messageSearchResults],
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadStartConversationConnections = useCallback(async () => {
    try {
      setWhatsAppConnections(await listWhatsAppConnections());
    } catch {
      setWhatsAppConnections([]);
    }
  }, []);

  const loadGuestClientCreatePlans = useCallback(async () => {
    setGuestClientCreatePlansLoading(true);

    try {
      setGuestClientCreatePlans(await listPlans());
    } catch (err) {
      setGuestClientCreateError(conversationErrorMessage(err, 'Falha ao carregar planos.'));
      setGuestClientCreatePlans([]);
    } finally {
      setGuestClientCreatePlansLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!messageSearchOpen) return undefined;

    const timer = window.setTimeout(() => {
      setMessageSearchQuery(messageSearchInput.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [messageSearchInput, messageSearchOpen]);

  useEffect(() => {
    const conversationId = selectedConversation?.id;
    if (!messageSearchOpen || !conversationId) return;

    if (messageSearchQuery.length < 2) {
      messageSearchRequestKeyRef.current = JSON.stringify({
        conversationId,
        query: messageSearchQuery,
        state: 'idle',
      });
      messageSearchResultsRef.current = [];
      messageSearchIndexRef.current = 0;
      setMessageSearchResults([]);
      setMessageSearchIndex(0);
      setMessageSearchPage(firstConversationPage);
      setMessageSearchHasMore(false);
      setMessageSearchError('');
      setMessageSearchLoading(false);
      setMessageSearchLoadingMore(false);
      return;
    }

    const requestKey = JSON.stringify({
      append: false,
      conversationId,
      page: firstConversationPage,
      query: messageSearchQuery,
    });
    if (messageSearchRequestKeyRef.current === requestKey) return;

    void loadMessageSearchResults({
      append: false,
      conversationId,
      page: firstConversationPage,
      query: messageSearchQuery,
    });
  }, [loadMessageSearchResults, messageSearchOpen, messageSearchQuery, selectedConversation?.id]);

  const loadMoreMessageSearchResults = useCallback(() => {
    const conversationId = selectedConversation?.id;
    if (
      !conversationId ||
      !messageSearchQuery ||
      !messageSearchHasMore ||
      messageSearchLoading ||
      messageSearchLoadingMore
    ) {
      return;
    }

    void loadMessageSearchResults({
      append: true,
      conversationId,
      page: messageSearchPage + 1,
      query: messageSearchQuery,
    });
  }, [
    loadMessageSearchResults,
    messageSearchHasMore,
    messageSearchLoading,
    messageSearchLoadingMore,
    messageSearchPage,
    messageSearchQuery,
    selectedConversation?.id,
  ]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    void loadStartConversationConnections();
  }, [loadStartConversationConnections]);

  const isAppVisibleAndFocused = useCallback(
    () => document.visibilityState === 'visible' && document.hasFocus(),
    [],
  );

  const applyReadConversation = useCallback(
    (
      readConversation: WhatsAppConversation,
      unreadBeforeRead: number,
      { updateSelected = true }: { updateSelected?: boolean } = {},
    ) => {
      conversationListRequestGenerationRef.current = advanceConversationListGeneration(
        conversationListRequestGenerationRef.current,
      );

      setConversations((current) => {
        const next = mergeConversationById(current, readConversation);
        conversationsRef.current = next;
        return next;
      });

      if (updateSelected && activeConversationIdRef.current === readConversation.id) {
        setSelectedConversation(readConversation);
        selectedConversationRef.current = readConversation;
      }

      setSummary((current) => {
        const next = updateConversationSummaryAfterRead(
          current,
          unreadBeforeRead,
          readConversation.unreadCount,
        );
        if (next !== current) {
          summaryRef.current = next;
          onSummaryChange(next);
        }
        return next;
      });
      void onSummaryRefreshRequest();
    },
    [onSummaryChange, onSummaryRefreshRequest],
  );

  const clearPendingReadTimeout = useCallback((conversationId: string) => {
    const timeout = pendingReadTimeoutsRef.current.get(conversationId);
    if (timeout === undefined) return;
    window.clearTimeout(timeout);
    pendingReadTimeoutsRef.current.delete(conversationId);
  }, []);

  const clearPendingReadTimeouts = useCallback(() => {
    for (const timeout of pendingReadTimeoutsRef.current.values()) {
      window.clearTimeout(timeout);
    }
    pendingReadTimeoutsRef.current.clear();
  }, []);

  const runActiveConversationRead = useCallback(
    async (conversationId: string) => {
      clearPendingReadTimeout(conversationId);

      if (activeConversationIdRef.current !== conversationId || !isAppVisibleAndFocused()) return;

      if (readInFlightConversationIdsRef.current.has(conversationId)) {
        readRetryConversationIdsRef.current.add(conversationId);
        return;
      }

      readInFlightConversationIdsRef.current.add(conversationId);
      lastReadConversationRef.current = conversationId;

      try {
        const detail = await getWhatsAppConversation(conversationId);
        setConversations((current) => {
          const next = mergeConversationById(current, detail);
          conversationsRef.current = next;
          return next;
        });
        if (activeConversationIdRef.current === detail.id) {
          setSelectedConversation(detail);
          selectedConversationRef.current = detail;
        }

        if (
          activeConversationIdRef.current !== conversationId ||
          !isAppVisibleAndFocused() ||
          detail.unreadCount <= 0
        ) {
          return;
        }

        const readConversation = await markWhatsAppConversationRead(detail.id);
        applyReadConversation(readConversation, detail.unreadCount);

        if (
          readConversation.unreadCount > 0 &&
          activeConversationIdRef.current === conversationId &&
          isAppVisibleAndFocused()
        ) {
          readRetryConversationIdsRef.current.add(conversationId);
        }
      } catch {
        readRetryConversationIdsRef.current.delete(conversationId);
      } finally {
        readInFlightConversationIdsRef.current.delete(conversationId);
        lastReadConversationRef.current = null;

        const retryRequested = readRetryConversationIdsRef.current.delete(conversationId);
        const activeConversation =
          selectedConversationRef.current?.id === conversationId
            ? selectedConversationRef.current
            : (conversationsRef.current.find(
                (conversation) => conversation.id === conversationId,
              ) ?? null);

        if (
          shouldRetryActiveConversationRead({
            activeConversation,
            activeConversationId: activeConversationIdRef.current,
            conversationId,
            focused: document.hasFocus(),
            retryRequested,
            visible: document.visibilityState === 'visible',
          })
        ) {
          activeConversationReadSchedulerRef.current(conversationId);
        }
      }
    },
    [applyReadConversation, clearPendingReadTimeout, isAppVisibleAndFocused],
  );

  const scheduleActiveConversationRead = useCallback(
    (conversationId: string, delayMs = activeConversationReadDebounceMs) => {
      if (activeConversationIdRef.current !== conversationId || !isAppVisibleAndFocused()) return;

      clearPendingReadTimeout(conversationId);
      const timeout = window.setTimeout(() => {
        pendingReadTimeoutsRef.current.delete(conversationId);
        void runActiveConversationRead(conversationId);
      }, delayMs);
      pendingReadTimeoutsRef.current.set(conversationId, timeout);
    },
    [clearPendingReadTimeout, isAppVisibleAndFocused, runActiveConversationRead],
  );

  activeConversationReadSchedulerRef.current = scheduleActiveConversationRead;

  const scheduleRealtimeListRefresh = useCallback(() => {
    if (realtimeListRefreshTimeoutRef.current !== null) {
      window.clearTimeout(realtimeListRefreshTimeoutRef.current);
    }

    realtimeListRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeListRefreshTimeoutRef.current = null;
      void loadConversations({ preserveLoaded: true, silent: true });
    }, 150);
  }, [loadConversations]);

  const handleRealtimeEvent = useCallback(
    (event: WhatsAppRealtimeEvent) => {
      if (event.type === 'message.created' || event.type === 'message.updated') {
        if (activeConversationIdRef.current === event.conversationId) {
          void (async () => {
            const messagesBeforeLoad = messagesRef.current;
            const loadedMessages = await loadMessages(event.conversationId, { silent: true });
            const createdMessage = resolveRealtimeCreatedMessage(
              event,
              loadedMessages,
              messagesBeforeLoad,
            );
            if (
              shouldAutoReadRealtimeMessage({
                activeConversationId: activeConversationIdRef.current,
                conversationId: event.conversationId,
                eventType: event.type,
                messageDirection: createdMessage?.direction ?? null,
                visible: document.visibilityState === 'visible',
                focused: document.hasFocus(),
              })
            ) {
              scheduleActiveConversationRead(event.conversationId);
            }
          })();
        }
        scheduleRealtimeListRefresh();
        return;
      }

      if (event.type === 'conversation.updated') {
        scheduleRealtimeListRefresh();
      }
    },
    [loadMessages, scheduleActiveConversationRead, scheduleRealtimeListRefresh],
  );

  useEffect(() => subscribeRealtime(handleRealtimeEvent), [handleRealtimeEvent, subscribeRealtime]);

  useEffect(() => {
    setGlobalActiveConversationId(selectedConversation?.id ?? null);
    return () => setGlobalActiveConversationId(null);
  }, [selectedConversation, setGlobalActiveConversationId]);

  useEffect(() => {
    const scheduleVisibleActiveConversationRead = () => {
      const conversationId = activeConversationIdRef.current;
      const activeConversation = conversationId
        ? ((selectedConversationRef.current?.id === conversationId
            ? selectedConversationRef.current
            : conversationsRef.current.find(
                (conversation) => conversation.id === conversationId,
              )) ?? null)
        : null;

      if (
        conversationId &&
        shouldReadVisibleConversationOnReturn({
          activeConversation,
          activeConversationId: conversationId,
          visible: document.visibilityState === 'visible',
          focused: document.hasFocus(),
        })
      ) {
        scheduleActiveConversationRead(conversationId);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearPendingReadTimeouts();
        return;
      }

      scheduleVisibleActiveConversationRead();
    };
    const handleFocus = () => scheduleVisibleActiveConversationRead();
    const handleBlur = () => clearPendingReadTimeouts();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      clearPendingReadTimeouts();
    };
  }, [clearPendingReadTimeouts, scheduleActiveConversationRead]);

  useEffect(() => {
    const delay = realtimeConnected
      ? conversationListRealtimeFallbackPollingMs
      : conversationListPollingMs;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadConversations({ preserveLoaded: true, silent: true });
    }, delay);

    return () => window.clearInterval(interval);
  }, [loadConversations, realtimeConnected]);

  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;

    const updateChatViewportHeight = () => {
      const shouldKeepBottom = isConversationScrollNearBottom(messagesScrollRef.current);
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      root.style.setProperty('--chat-viewport-height', `${Math.round(viewportHeight)}px`);
      if (shouldKeepBottom) {
        scheduleConversationScroll(() => {
          scrollConversationContainerToBottom(messagesScrollRef.current);
        });
      }
    };

    updateChatViewportHeight();
    visualViewport?.addEventListener('resize', updateChatViewportHeight);
    window.addEventListener('resize', updateChatViewportHeight);

    return () => {
      visualViewport?.removeEventListener('resize', updateChatViewportHeight);
      window.removeEventListener('resize', updateChatViewportHeight);
      root.style.removeProperty('--chat-viewport-height');
    };
  }, []);

  useEffect(() => {
    if (!selectedConversation) return undefined;

    const delay = realtimeConnected
      ? conversationMessagesRealtimeFallbackPollingMs
      : conversationMessagesPollingMs;
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      void loadMessages(selectedConversation.id, { silent: true });
    }, delay);

    return () => window.clearInterval(interval);
  }, [loadMessages, realtimeConnected, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation || messagesLoading) return;
    if (pendingInitialScrollConversationRef.current !== selectedConversation.id) return;

    pendingInitialScrollConversationRef.current = null;
    scheduleConversationScroll(() => {
      scrollConversationContainerToBottom(messagesScrollRef.current);
    });
  }, [messages, messagesLoading, selectedConversation]);

  useEffect(() => {
    if (!targetMessageId || messagesLoading) return;

    scheduleConversationScroll(() => {
      const target = messagesScrollRef.current?.querySelector<HTMLElement>(
        `[data-message-id="${targetMessageId}"]`,
      );
      target?.scrollIntoView({ block: 'center' });
    });

    if (targetHighlightTimeoutRef.current !== null) {
      window.clearTimeout(targetHighlightTimeoutRef.current);
    }
    targetHighlightTimeoutRef.current = window.setTimeout(() => {
      setTargetMessageId(null);
      targetHighlightTimeoutRef.current = null;
    }, 2600);
  }, [messages, messagesLoading, targetMessageId]);

  useEffect(() => {
    if (!selectedConversation) return;
    if (pendingSendScrollConversationRef.current !== selectedConversation.id) return;

    pendingSendScrollConversationRef.current = null;
    scheduleConversationScroll(() => {
      scrollConversationContainerToBottom(messagesScrollRef.current);
    });
  }, [messages, selectedConversation]);

  useEffect(() => {
    if (sending || !pendingComposerFocusRef.current || composerFocusRequest === 0) return;

    pendingComposerFocusRef.current = false;
    scheduleComposerFocus(() => {
      composerRef.current?.focus();
    });
  }, [composerFocusRequest, sending]);

  useEffect(() => {
    return () => {
      disposeConversationComposerMedia(selectedMedia);
    };
  }, [selectedMedia]);

  useEffect(() => {
    return () => {
      if (realtimeListRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeListRefreshTimeoutRef.current);
      }
      if (targetHighlightTimeoutRef.current !== null) {
        window.clearTimeout(targetHighlightTimeoutRef.current);
      }
    };
  }, []);

  function handleIncomingFile(
    file: File,
    {
      expectedKind = null,
      notice = '',
    }: { expectedKind?: ConversationComposerMedia['kind'] | null; notice?: string } = {},
  ) {
    if (sending || sendingRef.current) {
      setSendError('Aguarde o envio atual terminar antes de anexar outro arquivo.');
      return false;
    }

    const validation = classifyConversationIncomingFile(file);
    if (!validation.ok) {
      setSendError(validation.error);
      return false;
    }

    if (expectedKind && validation.kind !== expectedKind) {
      setSendError('Tipo de arquivo não suportado para esta opção de anexo.');
      return false;
    }

    const replyNotice = replyTarget
      ? 'Anexo selecionado como nova mensagem; respostas com mídia ainda não estão disponíveis.'
      : '';
    if (replyTarget) {
      setReplyTarget(null);
    }

    setSelectedMedia((current) => {
      disposeConversationComposerMedia(current);
      return createConversationComposerMedia(file, validation.kind);
    });
    setSendError([notice, replyNotice].filter(Boolean).join(' '));
    scheduleComposerFocus(() => {
      composerRef.current?.focus();
    });
    return true;
  }

  function selectComposerMedia(kind: ConversationComposerMedia['kind'], file: File) {
    handleIncomingFile(file, { expectedKind: kind });
  }

  function clearComposerMedia() {
    setSelectedMedia((current) => {
      disposeConversationComposerMedia(current);
      return null;
    });
  }

  function resetChatDropState() {
    chatDropDepthRef.current = 0;
    setDropOverlayVisible(false);
  }

  function dataTransferHasFiles(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.types).includes('Files');
  }

  function handleIncomingFileList(files: FileList | File[]) {
    const file = Array.from(files)[0];
    if (!file) return false;

    const notice =
      files.length > 1 ? 'Apenas um arquivo por vez. Usei o primeiro arquivo selecionado.' : '';
    return handleIncomingFile(file, { notice });
  }

  function clipboardIncomingFiles(clipboardData: DataTransfer) {
    const filesByKey = new Map<string, File>();
    const addFile = (file: File | null) => {
      if (!file) return;
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
      if (!filesByKey.has(key)) {
        filesByKey.set(key, file);
      }
    };

    Array.from(clipboardData.files).forEach(addFile);
    Array.from(clipboardData.items)
      .filter((item) => item.kind === 'file')
      .forEach((item) => addFile(item.getAsFile()));

    return Array.from(filesByKey.values());
  }

  function handleChatDragEnter(event: ReactDragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    chatDropDepthRef.current += 1;
    if (!sending && !sendingRef.current) {
      setDropOverlayVisible(true);
    }
  }

  function handleChatDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = sending || sendingRef.current ? 'none' : 'copy';
  }

  function handleChatDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    chatDropDepthRef.current = Math.max(0, chatDropDepthRef.current - 1);
    if (chatDropDepthRef.current === 0) {
      setDropOverlayVisible(false);
    }
  }

  function handleChatDrop(event: ReactDragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    resetChatDropState();
    handleIncomingFileList(event.dataTransfer.files);
  }

  function handleChatPaste(event: ReactClipboardEvent<HTMLElement>) {
    const files = clipboardIncomingFiles(event.clipboardData);
    if (!files.length) return;

    event.preventDefault();
    if (sending || sendingRef.current) {
      setSendError('Aguarde o envio atual terminar antes de anexar outro arquivo.');
      return;
    }

    handleIncomingFileList(files);
  }

  async function selectConversation(conversation: WhatsAppConversation) {
    openMessageSearchGenerationRef.current += 1;
    resetMessageSearch();
    activeConversationIdRef.current = conversation.id;
    pendingInitialScrollConversationRef.current = conversation.id;
    setSelectedConversation(conversation);
    setMessages([]);
    setClientDetail(null);
    setClientError('');
    setLinkClientError('');
    setGuestClientCreateError('');
    setGuestClientDuplicate(null);
    setGuestClientCreatedUnlinked(null);
    setGuestClientCreateConversation(null);
    setMessagesError('');
    setOlderMessagesError('');
    setRetryErrors({});
    setOlderMessagesCursor(null);
    setHasOlderMessages(false);
    olderMessagesLoadedRef.current = false;
    olderMessagesLoadingRef.current = false;
    messagesRef.current = [];
    setHasNewerMessages(false);
    setTargetMessageId(null);
    setTargetSearchTerm('');
    setSendError('');
    setReplyTarget(null);
    clearComposerMedia();
    setNewMessageNotice(false);
    setMobileMode('chat');
    setOpening(true);

    try {
      const [detail] = await Promise.all([
        getWhatsAppConversation(conversation.id),
        loadMessages(conversation.id, { replace: true }),
      ]);
      if (activeConversationIdRef.current !== conversation.id) return;
      setSelectedConversation(detail);
      setConversations((current) => mergeConversationById(current, detail));

      if (detail.unreadCount > 0) {
        scheduleActiveConversationRead(detail.id);
      }

      if (detail.client?.id) {
        try {
          setClientDetail(await getClient(detail.client.id));
        } catch (err) {
          setClientError(conversationErrorMessage(err, 'Falha ao carregar cliente.'));
        }
      }
    } catch (err) {
      setMessagesError(conversationErrorMessage(err, 'Falha ao abrir conversa.'));
    } finally {
      if (activeConversationIdRef.current === conversation.id) {
        setOpening(false);
      }
    }
  }

  async function openMessageSearchResult(result: WhatsAppMessageSearchResult, term: string) {
    const conversationId = result.conversation.id;
    const requestGeneration = openMessageSearchGenerationRef.current + 1;
    openMessageSearchGenerationRef.current = requestGeneration;
    activeConversationIdRef.current = conversationId;
    pendingInitialScrollConversationRef.current = null;
    setOpening(true);
    setMessagesLoading(true);
    setMessagesError('');
    setOlderMessagesError('');
    setRetryErrors({});
    setReplyTarget(null);
    setSelectedConversation((current) =>
      current?.id === conversationId
        ? current
        : {
            id: conversationId,
            whatsAppConnectionId: '',
            instanceName: null,
            provider: 'KIRAGO',
            externalInstanceId: null,
            displayName: result.conversation.displayName,
            contactName: null,
            phone: result.conversation.phone,
            phoneNormalized: result.conversation.phoneNormalized,
            status: 'OPEN',
            lastMessageAt: result.message.sentAt ?? result.message.createdAt,
            lastMessagePreview: result.snippet,
            unreadCount: 0,
            createdAt: result.message.createdAt,
            updatedAt: result.message.createdAt,
            client: result.conversation.client
              ? {
                  id: result.conversation.client.id,
                  name: result.conversation.client.name,
                  phone: '',
                  phoneNormalized: '',
                }
              : null,
          },
    );
    setClientDetail(null);
    setLinkClientError('');
    setSendError('');
    setNewMessageNotice(false);
    setMobileMode('chat');

    try {
      const [detail, context] = await Promise.all([
        getWhatsAppConversation(conversationId),
        getWhatsAppConversationMessagesAround(conversationId, result.message.id, {
          limit: Math.floor(conversationMessagesPageSize / 2),
        }),
      ]);
      if (
        activeConversationIdRef.current !== conversationId ||
        openMessageSearchGenerationRef.current !== requestGeneration
      ) {
        return;
      }
      const mergedMessages = mergeConversationMessages([], context.items);
      setSelectedConversation(detail);
      setConversations((current) => mergeConversationLists(current, [detail]));
      setMessages(mergedMessages);
      messagesRef.current = mergedMessages;
      olderMessagesLoadedRef.current = true;
      setOlderMessagesCursor(context.pagination.nextCursor ?? null);
      setHasOlderMessages(Boolean(context.pagination.hasOlder));
      setHasNewerMessages(Boolean(context.pagination.hasNewer));
      setTargetMessageId(context.targetId);
      setTargetSearchTerm(term);
      if (detail.client?.id) {
        try {
          setClientDetail(await getClient(detail.client.id));
        } catch (err) {
          setClientError(conversationErrorMessage(err, 'Falha ao carregar cliente.'));
        }
      }
    } catch (err) {
      setMessagesError(conversationErrorMessage(err, 'Falha ao abrir resultado da busca.'));
    } finally {
      setOpening(false);
      setMessagesLoading(false);
    }
  }

  async function jumpToQuotedMessage(message: WhatsAppConversationMessage) {
    if (!selectedConversation || !message.replyToMessageId) return;

    const loaded = messagesRef.current.some((item) => item.id === message.replyToMessageId);
    if (loaded) {
      setTargetSearchTerm('');
      setTargetMessageId(message.replyToMessageId);
      return;
    }

    setMessagesLoading(true);
    setMessagesError('');

    try {
      const context = await getWhatsAppConversationMessagesAround(
        selectedConversation.id,
        message.replyToMessageId,
        { limit: Math.floor(conversationMessagesPageSize / 2) },
      );
      const mergedMessages = mergeConversationMessages([], context.items);
      setMessages(mergedMessages);
      messagesRef.current = mergedMessages;
      olderMessagesLoadedRef.current = true;
      setOlderMessagesCursor(context.pagination.nextCursor ?? null);
      setHasOlderMessages(Boolean(context.pagination.hasOlder));
      setHasNewerMessages(Boolean(context.pagination.hasNewer));
      setTargetSearchTerm('');
      setTargetMessageId(context.targetId);
    } catch (err) {
      setMessagesError(conversationErrorMessage(err, 'Mensagem original não disponível.'));
    } finally {
      setMessagesLoading(false);
    }
  }

  function selectReplyTarget(message: WhatsAppConversationMessage) {
    setReplyTarget(message);
    setSendError('');
    scheduleComposerFocus(() => {
      composerRef.current?.focus();
    });
  }

  async function sendCurrentMessage(
    bodyOverride?: string,
    {
      focusComposer = true,
      replyToOverride = null,
    }: { focusComposer?: boolean; replyToOverride?: WhatsAppConversationMessage | null } = {},
  ) {
    if (!selectedConversation || sending || sendingRef.current) return;

    const body = (bodyOverride ?? selectedDraft).trim();
    const mediaToSend = bodyOverride ? null : selectedMedia;
    const replyToSend = bodyOverride ? replyToOverride : replyTarget;
    if (!body && !mediaToSend) return;
    if (replyToSend && mediaToSend) {
      setSendError('Resposta com anexo ainda não está disponível. Envie uma resposta em texto.');
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setSendError('');
    if (!bodyOverride && !mediaToSend) {
      setDrafts((current) =>
        (current[selectedConversation.id] ?? '').trim() === body
          ? { ...current, [selectedConversation.id]: '' }
          : current,
      );
    }
    if (focusComposer) {
      scheduleComposerFocus(() => {
        composerRef.current?.focus();
      });
    }

    try {
      const requestId = createConversationRequestId();
      const message = mediaToSend
        ? await sendWhatsAppConversationMedia(selectedConversation.id, {
            file: mediaToSend.file,
            caption: body,
            requestId,
          })
        : await sendWhatsAppConversationMessage(selectedConversation.id, {
            body,
            requestId,
            ...(replyToSend ? { replyToMessageId: replyToSend.id } : {}),
          });
      pendingSendScrollConversationRef.current = selectedConversation.id;
      setMessages((current) => mergeConversationMessages(current, [message]));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                lastMessageAt: message.sentAt ?? message.createdAt,
                lastMessagePreview: conversationLastMessagePreview(message),
              }
            : conversation,
        ),
      );
      if (mediaToSend) {
        clearComposerMedia();
      }
      if (!bodyOverride) {
        setDrafts((current) =>
          (current[selectedConversation.id] ?? '').trim() === body
            ? { ...current, [selectedConversation.id]: '' }
            : current,
        );
        setReplyTarget(null);
      }
      await loadConversations({ preserveLoaded: true, silent: true });
    } catch (err) {
      setSendError(conversationErrorMessage(err, 'Falha ao enviar mensagem.'));
      const failedAt = new Date().toISOString();
      const failedMessage: WhatsAppConversationMessage = {
        id: `local-failed-${failedAt}`,
        createdAt: failedAt,
        direction: 'OUTBOUND',
        deliveredAt: null,
        failedAt,
        isFromMe: true,
        mediaDurationSeconds: null,
        mediaAvailable: false,
        mediaFileName: mediaToSend?.file.name ?? null,
        mediaMimeType: mediaToSend?.file.type ?? null,
        mediaSizeBytes: mediaToSend?.file.size ?? null,
        retryAction: mediaToSend ? 'SELECT_FILE_AGAIN' : 'RETRY',
        messageDispatchId: null,
        providerMessageId: null,
        quotedText: replyToSend ? conversationMessageQuotePreview(replyToSend) : null,
        readAt: null,
        replyTo: replyToSend
          ? {
              id: replyToSend.id,
              direction: replyToSend.direction,
              type: replyToSend.type,
              text: replyToSend.text,
              mediaFileName: replyToSend.mediaFileName,
            }
          : null,
        replyToMessageId: replyToSend?.id ?? null,
        replyToProviderMessageId: replyToSend?.providerMessageId ?? null,
        sentAt: null,
        status: 'FAILED',
        text: body,
        type: mediaToSend?.kind ?? 'TEXT',
      };
      setMessages((current) => mergeConversationMessages(current, [failedMessage]));
    } finally {
      pendingComposerFocusRef.current = focusComposer;
      if (focusComposer) {
        setComposerFocusRequest((current) => current + 1);
      }
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function sendCurrentVoiceMessage(voice: ConversationVoiceDraft) {
    if (!selectedConversation || sending || sendingRef.current) return;
    if (voice.conversationId !== selectedConversation.id) {
      setSendError('A gravação pertence a outra conversa. Grave novamente nesta conversa.');
      throw new Error('Voice conversation changed.');
    }

    sendingRef.current = true;
    setSending(true);
    setSendError('');

    try {
      const message = await sendWhatsAppConversationVoice(selectedConversation.id, {
        file: voice.file,
        durationSeconds: voice.durationSeconds,
        requestId: voice.requestId,
      });
      if (activeConversationIdRef.current !== selectedConversation.id) return;

      pendingSendScrollConversationRef.current = selectedConversation.id;
      setMessages((current) => mergeConversationMessages(current, [message]));
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                lastMessageAt: message.sentAt ?? message.createdAt,
                lastMessagePreview: conversationLastMessagePreview(message),
              }
            : conversation,
        ),
      );
      await loadConversations({ preserveLoaded: true, silent: true });
    } catch (err) {
      setSendError(conversationErrorMessage(err, 'Falha ao enviar gravação.'));
      throw err;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function retryConversationMessage(message: WhatsAppConversationMessage) {
    if (!selectedConversation || message.retryAction !== 'RETRY') return;

    if (message.id.startsWith('local-failed-') && message.type === 'TEXT') {
      await sendCurrentMessage(message.text ?? '', {
        focusComposer: false,
        replyToOverride:
          message.replyTo && message.replyToMessageId
            ? {
                ...message,
                id: message.replyToMessageId,
                direction: message.replyTo.direction,
                type: message.replyTo.type,
                text: message.replyTo.text,
                mediaFileName: message.replyTo.mediaFileName,
              }
            : null,
      });
      return;
    }

    if (retryingMessagesRef.current.has(message.id)) return;

    retryingMessagesRef.current.add(message.id);
    setRetryingMessageIds(new Set(retryingMessagesRef.current));
    setRetryErrors((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });

    try {
      const retried = await retryWhatsAppConversationMessage(message.id);
      if (activeConversationIdRef.current !== selectedConversation.id) return;

      setMessages((current) => {
        const merged = mergeConversationMessages(current, [retried]);
        messagesRef.current = merged;
        return merged;
      });
      await loadConversations({ preserveLoaded: true, silent: true });
    } catch (err) {
      setRetryErrors((current) => ({
        ...current,
        [message.id]: conversationRetryErrorMessage(err),
      }));
    } finally {
      retryingMessagesRef.current.delete(message.id);
      setRetryingMessageIds(new Set(retryingMessagesRef.current));
    }
  }

  async function resolveSelectedConversation() {
    if (!selectedConversation || resolving || selectedConversation.status === 'RESOLVED') return;

    setResolving(true);
    setMessagesError('');

    try {
      const resolved = await resolveWhatsAppConversation(selectedConversation.id);
      setSelectedConversation(resolved);
      setConversations((current) =>
        current.map((item) => (item.id === resolved.id ? { ...item, ...resolved } : item)),
      );
    } catch (err) {
      setMessagesError(conversationErrorMessage(err, 'Falha ao resolver conversa.'));
    } finally {
      setResolving(false);
    }
  }

  async function linkSelectedConversationToClient(clientOption: ClientOption) {
    if (!selectedConversation || linkingClient) return;

    setLinkingClient(true);
    setLinkClientError('');
    setClientError('');

    try {
      const linked = await linkWhatsAppConversationClient(selectedConversation.id, {
        clientId: clientOption.id,
      });
      if (activeConversationIdRef.current !== linked.id) return;

      setSelectedConversation(linked);
      setConversations((current) =>
        current.map((item) => (item.id === linked.id ? { ...item, ...linked } : item)),
      );

      if (linked.client?.id) {
        try {
          setClientDetail(await getClient(linked.client.id));
        } catch (err) {
          setClientError(conversationErrorMessage(err, 'Falha ao carregar cliente.'));
        }
      }
    } catch (err) {
      setLinkClientError(linkClientErrorMessage(err));
    } finally {
      setLinkingClient(false);
    }
  }

  async function linkConversationToClient(conversationId: string, clientOption: ClientOption) {
    const linked = await linkWhatsAppConversationClient(conversationId, {
      clientId: clientOption.id,
    });
    if (activeConversationIdRef.current !== linked.id) return linked;

    setSelectedConversation(linked);
    setConversations((current) =>
      current.map((item) => (item.id === linked.id ? { ...item, ...linked } : item)),
    );

    if (linked.client?.id) {
      try {
        setClientDetail(await getClient(linked.client.id));
      } catch (err) {
        setClientError(conversationErrorMessage(err, 'Falha ao carregar cliente.'));
      }
    }

    return linked;
  }

  async function openGuestClientCreate(conversation: WhatsAppConversation) {
    setGuestClientCreateConversation(conversation);
    setGuestClientCreateError('');
    setGuestClientDuplicate(null);
    setGuestClientCreatedUnlinked(null);

    if (!guestClientCreatePlans.length) {
      await loadGuestClientCreatePlans();
    }
  }

  async function findDuplicateClientByPhone(phone: string, fallbackPhoneNormalized: string) {
    const expectedDigits = phoneDigits(phone) || phoneDigits(fallbackPhoneNormalized);
    if (!expectedDigits) return null;

    const options = await listClientOptions(phone, { limit: 10 });
    return (
      options.find((option) => phoneDigitsCompatible(option.phoneNormalized, expectedDigits)) ??
      null
    );
  }

  async function createClientFromGuestConversation(payload: ClientPayload) {
    if (!guestClientCreateConversation || creatingGuestClient) return;

    setCreatingGuestClient(true);
    setGuestClientCreateError('');
    setGuestClientDuplicate(null);
    setGuestClientCreatedUnlinked(null);

    try {
      const duplicate = await findDuplicateClientByPhone(
        payload.phone,
        guestClientCreateConversation.phoneNormalized,
      );

      if (duplicate) {
        setGuestClientDuplicate(duplicate);
        throw new Error('Já existe um cliente com este telefone.');
      }

      const created = await createClient(payload);
      const createdOption = clientOptionFromClient(created);
      setGuestClientCreatedUnlinked(createdOption);

      try {
        const linked = await linkConversationToClient(
          guestClientCreateConversation.id,
          createdOption,
        );
        if (activeConversationIdRef.current === linked.id) {
          setGuestClientCreateConversation(null);
          setGuestClientCreatedUnlinked(null);
          setMobileClientOpen(false);
          await loadConversations({ silent: true });
        }
      } catch (err) {
        setGuestClientCreateError(
          conversationErrorMessage(
            err,
            'Cliente criado, mas não foi possível vincular a conversa.',
          ),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const conflictMessage = /telefone/i.test(err.message)
          ? 'Já existe um cliente com este telefone.'
          : err.message;
        setGuestClientCreateError(conflictMessage);
        throw new Error(conflictMessage);
      }

      if (!(err instanceof Error && err.message === 'Já existe um cliente com este telefone.')) {
        setGuestClientCreateError(
          err instanceof Error ? err.message : 'Não foi possível cadastrar o cliente.',
        );
      }
      throw err;
    } finally {
      setCreatingGuestClient(false);
    }
  }

  async function retryGuestClientLink(clientOption: ClientOption) {
    if (!guestClientCreateConversation || creatingGuestClient) return;

    setCreatingGuestClient(true);
    setGuestClientCreateError('');

    try {
      const linked = await linkConversationToClient(guestClientCreateConversation.id, clientOption);
      if (activeConversationIdRef.current === linked.id) {
        setGuestClientCreateConversation(null);
        setGuestClientCreatedUnlinked(null);
        setGuestClientDuplicate(null);
        setMobileClientOpen(false);
        await loadConversations({ silent: true });
      }
    } catch (err) {
      setGuestClientCreateError(
        conversationErrorMessage(err, 'Não foi possível vincular a conversa.'),
      );
    } finally {
      setCreatingGuestClient(false);
    }
  }

  async function startNewConversation(input: {
    body: string;
    client: ClientOption | null;
    phone: string;
    recipientType: StartConversationRecipientType;
    whatsAppConnectionId: string;
  }) {
    if (startingConversation || startingConversationRef.current) return;

    startingConversationRef.current = true;
    setStartingConversation(true);
    setStartConversationError('');

    try {
      const payload =
        input.recipientType === 'client'
          ? {
              whatsAppConnectionId: input.whatsAppConnectionId,
              clientId: input.client!.id,
              body: input.body.trim(),
              requestId: createConversationRequestId(),
            }
          : {
              whatsAppConnectionId: input.whatsAppConnectionId,
              phone: input.phone.trim(),
              body: input.body.trim(),
              requestId: createConversationRequestId(),
            };
      const result = await startWhatsAppConversation(payload);

      setStartConversationOpen(false);
      setDrafts((current) => ({ ...current, [result.conversation.id]: '' }));
      setConversations((current) => upsertConversationList(current, result.conversation));
      setMessages([result.message]);
      activeConversationIdRef.current = result.conversation.id;
      pendingInitialScrollConversationRef.current = result.conversation.id;
      pendingSendScrollConversationRef.current = result.conversation.id;
      setSelectedConversation(result.conversation);
      setClientDetail(null);
      setClientError('');
      setMessagesError('');
      setSendError('');
      setLinkClientError('');
      setNewMessageNotice(false);
      setMobileMode('chat');

      if (result.conversation.client?.id) {
        try {
          setClientDetail(await getClient(result.conversation.client.id));
        } catch (err) {
          setClientError(conversationErrorMessage(err, 'Falha ao carregar cliente.'));
        }
      }

      await loadConversations({ silent: true });
      await loadMessages(result.conversation.id, { replace: true, silent: true });
    } catch (err) {
      setStartConversationError(startConversationErrorMessage(err));
    } finally {
      startingConversationRef.current = false;
      setStartingConversation(false);
    }
  }

  return (
    <section className={`conversations-view mobile-mode-${mobileMode}`}>
      <PageHeader
        eyebrow="WhatsApp Inbox"
        icon={MessagesSquare}
        title="Conversas"
        subtitle="Atendimento e histórico conversacional do WhatsApp"
        actions={
          <div className="conversation-page-actions">
            {summary && hasUnreadConversationSummary(summary) ? (
              <span className="conversation-summary-pill">
                {formatConversationSummary(summary)}
              </span>
            ) : null}
            <Button
              icon={Plus}
              size="sm"
              variant="primary"
              onClick={() => {
                setStartConversationError('');
                void loadStartConversationConnections();
                setStartConversationOpen(true);
              }}
            >
              Iniciar conversa
            </Button>
          </div>
        }
      />

      {startConversationOpen ? (
        <StartConversationModal
          connections={whatsAppConnections}
          error={startConversationError}
          loading={startingConversation}
          onClose={() => {
            if (!startingConversation) setStartConversationOpen(false);
          }}
          onSubmit={(input) => void startNewConversation(input)}
        />
      ) : null}

      {guestClientCreateConversation ? (
        <GuestConversationClientModal
          conversation={guestClientCreateConversation}
          duplicateClient={guestClientDuplicate}
          error={guestClientCreateError}
          loading={creatingGuestClient || guestClientCreatePlansLoading}
          plans={guestClientCreatePlans}
          unlinkedClient={guestClientCreatedUnlinked}
          onClose={() => {
            if (creatingGuestClient) return;
            setGuestClientCreateConversation(null);
            setGuestClientCreateError('');
            setGuestClientDuplicate(null);
            setGuestClientCreatedUnlinked(null);
          }}
          onLinkExisting={(client) => void retryGuestClientLink(client)}
          onOpenClient={(clientId) => void onOpenClient(clientId)}
          onRetryLink={(client) => void retryGuestClientLink(client)}
          onSubmit={(payload) => createClientFromGuestConversation(payload)}
        />
      ) : null}

      <div className="conversations-shell">
        <ConversationList
          conversations={conversations}
          hasMore={hasMoreConversations}
          filter={filter}
          listError={listError}
          loadMoreError={listLoadMoreError}
          loading={listLoading}
          loadingMore={listLoadingMore}
          searchInput={searchInput}
          selectedId={selectedConversation?.id ?? null}
          statusFilter={statusFilter}
          onFilterChange={setFilter}
          onLoadMore={() => void loadMoreConversations()}
          onSearchChange={setSearchInput}
          onSelect={(conversation) => void selectConversation(conversation)}
          onStatusFilterChange={setStatusFilter}
        />

        <section
          className="conversation-chat-panel"
          aria-label="Chat da conversa"
          onDragEnter={selectedConversation ? handleChatDragEnter : undefined}
          onDragLeave={selectedConversation ? handleChatDragLeave : undefined}
          onDragOver={selectedConversation ? handleChatDragOver : undefined}
          onDrop={selectedConversation ? handleChatDrop : undefined}
          onPaste={selectedConversation ? handleChatPaste : undefined}
        >
          {selectedConversation ? (
            <>
              {dropOverlayVisible ? (
                <div className="conversation-drop-overlay" role="status" aria-live="polite">
                  <span aria-hidden="true">
                    <Upload size={24} />
                  </span>
                  <strong>Solte o arquivo para anexar</strong>
                </div>
              ) : null}
              <ConversationHeader
                conversation={selectedConversation}
                opening={opening}
                resolving={resolving}
                onBack={() => setMobileMode('list')}
                onOpenClientPanel={() => setMobileClientOpen(true)}
                onResolve={() => void resolveSelectedConversation()}
                onToggleSearch={() => {
                  if (messageSearchOpen) {
                    resetMessageSearch();
                    return;
                  }
                  setMessageSearchOpen(true);
                  setMessageSearchError('');
                }}
              />

              <ConversationMessageSearch
                currentIndex={messageSearchIndex}
                error={messageSearchError}
                hasMore={messageSearchHasMore}
                hasResults={messageSearchResults.length > 0}
                loading={messageSearchLoading}
                loadingMore={messageSearchLoadingMore}
                open={messageSearchOpen}
                query={messageSearchInput}
                total={messageSearchResults.length}
                onClose={resetMessageSearch}
                onLoadMore={loadMoreMessageSearchResults}
                onNext={() => goToMessageSearchResult('next')}
                onPrevious={() => goToMessageSearchResult('previous')}
                onQueryChange={updateMessageSearchInput}
              />

              <div className="conversation-error-slot">
                {messagesError ? (
                  <div className="notice danger conversation-notice" role="alert">
                    {messagesError}
                  </div>
                ) : null}
              </div>

              <ConversationMessages
                conversationId={selectedConversation.id}
                messages={messages}
                hasOlder={hasOlderMessages}
                loading={messagesLoading}
                loadingOlder={olderMessagesLoading}
                messagesEndRef={messagesEndRef}
                hasNewer={hasNewerMessages}
                olderError={olderMessagesError}
                retryErrors={retryErrors}
                retryingMessageIds={retryingMessageIds}
                scrollRef={messagesScrollRef}
                showNewMessageNotice={newMessageNotice}
                targetMessageId={targetMessageId}
                targetSearchTerm={targetSearchTerm}
                onJumpToBottom={() => {
                  setNewMessageNotice(false);
                  scrollConversationContainerToBottom(messagesScrollRef.current);
                }}
                onLoadLatest={() => void loadLatestMessages()}
                onLoadOlder={() => void loadOlderMessages()}
                onQuoteClick={(message) => void jumpToQuotedMessage(message)}
                onReply={selectReplyTarget}
                onRetry={(message) => void retryConversationMessage(message)}
              />

              <ConversationComposer
                composerRef={composerRef}
                conversationId={selectedConversation.id}
                draft={selectedDraft}
                error={sendError}
                replyTarget={replyTarget}
                selectedMedia={selectedMedia}
                sending={sending}
                onChange={(value) => {
                  setDrafts((current) => ({
                    ...current,
                    [selectedConversation.id]: value,
                  }));
                }}
                onRemoveMedia={clearComposerMedia}
                onCancelReply={() => setReplyTarget(null)}
                onSelectMedia={selectComposerMedia}
                onSend={() => void sendCurrentMessage()}
                onSendVoice={(voice) => sendCurrentVoiceMessage(voice)}
              />
            </>
          ) : (
            <div className="conversation-empty-chat">
              <MessagesSquare aria-hidden="true" size={34} />
              <strong>Selecione uma conversa</strong>
              <span>O histórico e o contexto do cliente aparecem aqui.</span>
            </div>
          )}
        </section>

        <ConversationClientPanel
          client={clientDetail}
          clientError={clientError}
          conversation={selectedConversation}
          linkClientError={linkClientError}
          linkingClient={linkingClient}
          mobileOpen={mobileClientOpen}
          onCloseMobile={() => setMobileClientOpen(false)}
          onCreateClient={(conversation) => void openGuestClientCreate(conversation)}
          onLinkClient={(client) => void linkSelectedConversationToClient(client)}
          onOpenClient={(clientId) => void onOpenClient(clientId)}
        />
      </div>
    </section>
  );
}

function StartConversationModal({
  connections,
  error,
  loading,
  onClose,
  onSubmit,
}: {
  connections: WhatsAppConnection[];
  error: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (input: {
    body: string;
    client: ClientOption | null;
    phone: string;
    recipientType: StartConversationRecipientType;
    whatsAppConnectionId: string;
  }) => void;
}) {
  const [recipientType, setRecipientType] = useState<StartConversationRecipientType>('client');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [phone, setPhone] = useState('');
  const [connectionId, setConnectionId] = useState(connections[0]?.id ?? '');
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!connectionId && connections[0]?.id) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  useEffect(() => {
    setLocalError('');
  }, [recipientType, selectedClientId, phone, connectionId, body]);

  function submit(event: FormEvent) {
    event.preventDefault();

    const trimmedBody = body.trim();
    if (!connectionId) {
      setLocalError('Selecione uma instância WhatsApp conectada.');
      return;
    }
    if (recipientType === 'client' && !selectedClient) {
      setLocalError('Selecione um cliente cadastrado.');
      return;
    }
    if (recipientType === 'client' && !selectedClient?.phoneNormalized) {
      setLocalError('Cliente sem telefone válido para WhatsApp.');
      return;
    }
    if (recipientType === 'guest' && !phone.trim()) {
      setLocalError('Informe o telefone/WhatsApp do contato avulso.');
      return;
    }
    if (!trimmedBody) {
      setLocalError('Escreva a primeira mensagem.');
      return;
    }

    onSubmit({
      body: trimmedBody,
      client: selectedClient,
      phone,
      recipientType,
      whatsAppConnectionId: connectionId,
    });
  }

  const selectedClientPhone = selectedClient?.phoneNormalized
    ? formatNormalizedBrazilPhone(selectedClient.phoneNormalized)
    : '-';
  const friendlyConnectionLabel = (connection: WhatsAppConnection) =>
    connection.name || normalizeWhatsAppDisplayPhone(connection.phone) || 'WhatsApp conectado';

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal start-conversation-modal"
        aria-labelledby="start-conversation-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="start-conversation-title">Iniciar conversa</h2>
            <p>Inicie atendimento por cliente cadastrado ou contato avulso.</p>
          </div>
          <IconButton icon={X} label="Fechar iniciar conversa" onClick={onClose} />
        </header>

        <form className="start-conversation-form" onSubmit={submit}>
          <div className="form-tabs" role="tablist" aria-label="Tipo de destinatário">
            <button
              aria-selected={recipientType === 'client'}
              className={recipientType === 'client' ? 'active' : ''}
              role="tab"
              type="button"
              onClick={() => setRecipientType('client')}
            >
              Cliente
            </button>
            <button
              aria-selected={recipientType === 'guest'}
              className={recipientType === 'guest' ? 'active' : ''}
              role="tab"
              type="button"
              onClick={() => setRecipientType('guest')}
            >
              Avulso
            </button>
          </div>

          {recipientType === 'client' ? (
            <>
              <FinanceClientAutocomplete
                label="Cliente"
                placeholder="Buscar por nome, telefone ou e-mail..."
                required
                selectedClient={selectedClient}
                value={selectedClientId}
                onChange={(clientId, option) => {
                  setSelectedClientId(clientId);
                  setSelectedClient(option);
                }}
              />
              {selectedClient ? (
                <div className="start-conversation-client-preview">
                  <strong>{selectedClient.name}</strong>
                  <span>{selectedClientPhone}</span>
                  {!selectedClient.phoneNormalized ? (
                    <small>Cliente sem telefone válido para WhatsApp.</small>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <label className="field">
              <span>Telefone/WhatsApp *</span>
              <input
                inputMode="tel"
                placeholder="Ex.: (44) 99999-9999"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
          )}

          <label className="field">
            <span>Instância WhatsApp *</span>
            <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)}>
              {connections.length ? (
                connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {friendlyConnectionLabel(connection)}
                  </option>
                ))
              ) : (
                <option value="">Nenhuma instância conectada</option>
              )}
            </select>
          </label>

          <label className="field">
            <span>Primeira mensagem *</span>
            <textarea
              placeholder="Digite a mensagem inicial..."
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>

          {localError || error ? (
            <div className="notice danger conversation-notice" role="alert">
              {localError || error}
            </div>
          ) : null}

          <div className="form-actions">
            <Button disabled={loading} variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              icon={Send}
              loading={loading}
              variant="primary"
              type="submit"
              disabled={!connections.length || loading}
            >
              Iniciar conversa
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ConversationList({
  conversations,
  filter,
  hasMore,
  listError,
  loadMoreError,
  loading,
  loadingMore,
  searchInput,
  selectedId,
  statusFilter,
  onFilterChange,
  onLoadMore,
  onSearchChange,
  onSelect,
  onStatusFilterChange,
}: {
  conversations: WhatsAppConversation[];
  filter: ConversationFilter;
  hasMore: boolean;
  listError: string;
  loadMoreError: string;
  loading: boolean;
  loadingMore: boolean;
  searchInput: string;
  selectedId: string | null;
  statusFilter: WhatsAppConversationStatus | '';
  onFilterChange: (filter: ConversationFilter) => void;
  onLoadMore: () => void;
  onSearchChange: (search: string) => void;
  onSelect: (conversation: WhatsAppConversation) => void;
  onStatusFilterChange: (status: WhatsAppConversationStatus | '') => void;
}) {
  const emptyCopy = 'Nenhuma conversa encontrada.';

  return (
    <aside className="conversation-list-panel" aria-label="Lista de conversas">
      <div className="conversation-panel-header">
        <div>
          <h3>Conversas</h3>
          <span>{loading ? 'Atualizando...' : `${conversations.length} visíveis`}</span>
        </div>
      </div>

      <ConversationSearch query={searchInput} onQueryChange={onSearchChange} />

      <div className="conversation-filter-row" role="tablist" aria-label="Filtros de conversas">
        {conversationFilters.map((item) => (
          <button
            aria-selected={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            key={item.id}
            role="tab"
            type="button"
            onClick={() => onFilterChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="conversation-status-filter">
        <span>Status</span>
        <select
          value={statusFilter}
          onChange={(event) =>
            onStatusFilterChange(event.target.value as WhatsAppConversationStatus | '')
          }
        >
          <option value="">Todos</option>
          <option value="OPEN">Abertas</option>
          <option value="RESOLVED">Resolvidas</option>
        </select>
      </label>

      {listError ? (
        <div className="notice danger conversation-notice" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="conversation-list-items">
        {conversations.map((conversation) => (
          <ConversationListItem
            conversation={conversation}
            key={conversation.id}
            selected={selectedId === conversation.id}
            onSelect={onSelect}
          />
        ))}
        {!conversations.length && !loading ? (
          <div className="conversation-empty-list">{emptyCopy}</div>
        ) : null}
        {conversations.length ? (
          <div className="conversation-list-more">
            {loadMoreError ? (
              <div className="notice danger conversation-notice" role="alert">
                {loadMoreError}
              </div>
            ) : null}
            {hasMore ? (
              <Button loading={loadingMore} size="sm" variant="ghost" onClick={onLoadMore}>
                Carregar mais conversas
              </Button>
            ) : (
              <span>Fim da lista</span>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ConversationListItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: WhatsAppConversation;
  selected: boolean;
  onSelect: (conversation: WhatsAppConversation) => void;
}) {
  return (
    <button
      aria-current={selected ? 'true' : undefined}
      className={`conversation-list-item ${selected ? 'active' : ''}`}
      type="button"
      onClick={() => onSelect(conversation)}
    >
      <span className="conversation-avatar">{conversationInitial(conversation)}</span>
      <span className="conversation-list-copy">
        <span className="conversation-list-title-row">
          <strong>{conversation.displayName}</strong>
          <small>
            {conversationDateLabel(conversation.lastMessageAt ?? conversation.updatedAt)}
          </small>
        </span>
        <span className="conversation-preview-row">
          <span>{conversation.lastMessagePreview ?? '[Mensagem]'}</span>
          {conversation.unreadCount > 0 ? (
            <span className="conversation-unread-badge">{conversation.unreadCount}</span>
          ) : null}
        </span>
        <span className="conversation-list-meta-row">
          <span>
            {normalizeWhatsAppDisplayPhone(conversation.phoneNormalized) ?? conversation.phone}
          </span>
          <span className={`conversation-kind ${conversation.client ? 'client' : 'guest'}`}>
            {conversation.client ? 'Cliente' : 'Avulso'}
          </span>
        </span>
      </span>
    </button>
  );
}

function ConversationHeader({
  conversation,
  opening,
  resolving,
  onBack,
  onOpenClientPanel,
  onResolve,
  onToggleSearch,
}: {
  conversation: WhatsAppConversation;
  opening: boolean;
  resolving: boolean;
  onBack: () => void;
  onOpenClientPanel: () => void;
  onResolve: () => void;
  onToggleSearch: () => void;
}) {
  const instanceLabel = conversationInstanceLabel(conversation.instanceName);
  const phoneLabel =
    normalizeWhatsAppDisplayPhone(conversation.phoneNormalized) ?? conversation.phone;

  return (
    <header className="conversation-header">
      <button className="conversation-mobile-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" size={16} />
        <span>Voltar</span>
      </button>
      <div className="conversation-header-main">
        <span className="conversation-avatar large">{conversationInitial(conversation)}</span>
        <div>
          <h3>{conversation.displayName}</h3>
          <p>{instanceLabel ? `${phoneLabel} · ${instanceLabel}` : phoneLabel}</p>
          <div className="conversation-header-badges">
            <span className={`conversation-kind ${conversation.client ? 'client' : 'guest'}`}>
              {conversation.client ? 'Cliente' : 'Avulso'}
            </span>
            <span
              className={`conversation-status-badge status-${conversation.status.toLowerCase()}`}
            >
              {conversation.status}
            </span>
            {opening ? <span className="conversation-sync-badge">Carregando</span> : null}
          </div>
        </div>
      </div>
      <div className="conversation-header-actions">
        <IconButton icon={Search} label="Buscar nesta conversa" onClick={onToggleSearch} />
        <IconButton
          icon={Info}
          label="Abrir contexto do cliente"
          className="conversation-mobile-context"
          onClick={onOpenClientPanel}
        />
        {conversation.status === 'RESOLVED' ? (
          <span className="conversation-resolved-label">Resolvida</span>
        ) : (
          <Button icon={CircleCheck} loading={resolving} size="sm" onClick={onResolve}>
            Resolver
          </Button>
        )}
      </div>
    </header>
  );
}

function ConversationMessages({
  conversationId,
  hasOlder,
  hasNewer,
  loading,
  loadingOlder,
  messages,
  messagesEndRef,
  olderError,
  retryErrors,
  retryingMessageIds,
  onJumpToBottom,
  onLoadLatest,
  onLoadOlder,
  onQuoteClick,
  onReply,
  onRetry,
  scrollRef,
  showNewMessageNotice,
  targetMessageId,
  targetSearchTerm,
}: {
  conversationId: string;
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  loadingOlder: boolean;
  messages: WhatsAppConversationMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  olderError: string;
  retryErrors: Record<string, string>;
  retryingMessageIds: Set<string>;
  onJumpToBottom: () => void;
  onLoadLatest: () => void;
  onLoadOlder: () => void;
  onQuoteClick: (message: WhatsAppConversationMessage) => void;
  onReply: (message: WhatsAppConversationMessage) => void;
  onRetry: (message: WhatsAppConversationMessage) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showNewMessageNotice: boolean;
  targetMessageId: string | null;
  targetSearchTerm: string;
}) {
  const renderableMessages = messages.filter(isRenderableConversationMessage);

  return (
    <div className="conversation-messages-wrap">
      <div className="conversation-messages" ref={scrollRef}>
        {loading ? <div className="conversation-loading">Carregando mensagens...</div> : null}
        {messages.length ? (
          <div className="conversation-history-controls">
            {olderError ? (
              <div className="notice danger conversation-notice" role="alert">
                {olderError}
              </div>
            ) : null}
            {hasOlder ? (
              <Button loading={loadingOlder} size="sm" variant="ghost" onClick={onLoadOlder}>
                Carregar mensagens anteriores
              </Button>
            ) : (
              <span>Sem mensagens antigas</span>
            )}
            {hasNewer ? (
              <Button size="sm" variant="ghost" onClick={onLoadLatest}>
                Voltar às mais recentes
              </Button>
            ) : null}
          </div>
        ) : null}
        {renderableMessages.length ? (
          <div className="conversation-message-stack">
            {renderableMessages.map((message, index) => {
              const previousMessage = index > 0 ? renderableMessages[index - 1] : null;
              const currentDateKey = conversationMessageDateKey(message);
              const previousDateKey = previousMessage
                ? conversationMessageDateKey(previousMessage)
                : null;
              const showDateSeparator = currentDateKey !== previousDateKey;

              return (
                <Fragment key={message.id}>
                  {showDateSeparator ? (
                    <ConversationDateSeparator label={conversationMessageDateLabel(message)} />
                  ) : null}
                  <ConversationBubble
                    conversationId={conversationId}
                    highlighted={targetMessageId === message.id}
                    message={message}
                    retryError={retryErrors[message.id] ?? ''}
                    retrying={retryingMessageIds.has(message.id)}
                    searchTerm={targetMessageId === message.id ? targetSearchTerm : ''}
                    onQuoteClick={onQuoteClick}
                    onReply={onReply}
                    onRetry={onRetry}
                  />
                </Fragment>
              );
            })}
          </div>
        ) : null}
        {!renderableMessages.length && !loading ? (
          <div className="conversation-empty-chat compact">Nenhuma mensagem nesta conversa.</div>
        ) : null}
        <div className="conversation-message-end" ref={messagesEndRef} />
      </div>
      {showNewMessageNotice ? (
        <button className="new-message-indicator" type="button" onClick={onJumpToBottom}>
          Nova mensagem
        </button>
      ) : null}
    </div>
  );
}

function ConversationDateSeparator({ label }: { label: string }) {
  return (
    <div
      aria-label={`Mensagens de ${label.toLowerCase()}`}
      className="conversation-date-separator"
      role="separator"
    >
      {label}
    </div>
  );
}

export function isRenderableConversationMessage(message: WhatsAppConversationMessage) {
  if (message.text?.trim()) {
    return true;
  }

  if (message.type === 'TEXT' || message.type === 'UNKNOWN') {
    return false;
  }

  return (
    message.type === 'IMAGE' ||
    message.type === 'VIDEO' ||
    message.type === 'AUDIO' ||
    message.type === 'DOCUMENT' ||
    message.type === 'LOCATION'
  );
}

export function classifyConversationIncomingFile(file: File): ConversationIncomingFileResult {
  const mimeType = file.type.split(';')[0]?.trim().toLowerCase() || '';
  const extension = conversationFileExtension(file.name);
  const isVideoFile =
    allowedConversationVideoMimeTypes.has(mimeType) ||
    allowedConversationVideoExtensions.has(extension);
  const maxBytes = isVideoFile ? conversationVideoMaxBytes : conversationMediaMaxBytes;

  if (file.size > maxBytes) {
    return {
      ok: false,
      error: isVideoFile
        ? 'Vídeo excede o limite de 10 MB permitido para envio por WhatsApp.'
        : 'Arquivo excede o limite de 10 MB permitido.',
    };
  }

  if (allowedConversationDocumentExtensions.has(extension)) {
    return isAllowedConversationDocument(mimeType, extension)
      ? { ok: true, kind: 'DOCUMENT' }
      : { ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' };
  }

  if (allowedConversationVideoExtensions.has(extension)) {
    return allowedConversationVideoMimeTypes.has(mimeType)
      ? { ok: true, kind: 'VIDEO' }
      : { ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' };
  }

  if (allowedConversationImageMimeTypes.has(mimeType)) {
    return { ok: true, kind: 'IMAGE' };
  }

  if (isAllowedConversationDocument(mimeType, extension)) {
    return { ok: true, kind: 'DOCUMENT' };
  }

  if (allowedConversationAudioMimeTypes.has(mimeType)) {
    return { ok: true, kind: 'AUDIO' };
  }

  if (mimeType.startsWith('video/')) {
    return { ok: false, error: 'Formato de vídeo não suportado. Envie MP4.' };
  }

  if (mimeType.startsWith('audio/')) {
    return { ok: false, error: 'Formato de áudio não suportado. Envie OGG, MP3 ou M4A.' };
  }

  return { ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' };
}

export function createConversationComposerMedia(
  file: File,
  kind: ConversationComposerMedia['kind'],
): ConversationComposerMedia {
  return {
    file,
    kind,
    previewUrl:
      kind === 'IMAGE' || kind === 'AUDIO' || kind === 'VIDEO' ? URL.createObjectURL(file) : null,
  };
}

export function disposeConversationComposerMedia(media: ConversationComposerMedia | null) {
  if (media?.previewUrl) {
    URL.revokeObjectURL(media.previewUrl);
  }
}

export function conversationComposerActionMode(
  draft: string,
  selectedMedia: ConversationComposerMedia | null,
  sending: boolean,
) {
  return draft.trim() || selectedMedia || sending ? 'SEND' : 'VOICE';
}

function conversationFileExtension(fileName: string) {
  const cleanName = fileName.split(/[\\/]/).pop()?.trim() ?? '';
  const lastDot = cleanName.lastIndexOf('.');

  return lastDot >= 0 ? cleanName.slice(lastDot + 1).toLowerCase() : '';
}

function isAllowedConversationDocument(mimeType: string, extension: string) {
  if (!allowedConversationDocumentExtensions.has(extension)) {
    return false;
  }

  if (genericConversationFileMimeTypes.has(mimeType)) {
    return true;
  }

  if (!allowedConversationDocumentMimeTypes.has(mimeType)) {
    return false;
  }

  return conversationDocumentMimeTypesByExtension[extension]?.has(mimeType) ?? false;
}

function ConversationBubble({
  conversationId,
  highlighted,
  message,
  retryError,
  retrying,
  searchTerm,
  onQuoteClick,
  onReply,
  onRetry,
}: {
  conversationId: string;
  highlighted: boolean;
  message: WhatsAppConversationMessage;
  retryError: string;
  retrying: boolean;
  searchTerm: string;
  onQuoteClick: (message: WhatsAppConversationMessage) => void;
  onReply: (message: WhatsAppConversationMessage) => void;
  onRetry: (message: WhatsAppConversationMessage) => void;
}) {
  const outbound = message.direction === 'OUTBOUND';
  if (!isRenderableConversationMessage(message)) {
    return null;
  }

  const hasAvailableImage = message.type === 'IMAGE' && message.mediaAvailable;
  const hasAvailableInlineMedia =
    (message.type === 'IMAGE' || message.type === 'AUDIO') && message.mediaAvailable;
  const text = hasAvailableInlineMedia ? '' : conversationMessageDisplayText(message);
  const caption = conversationMessageCaption(message);

  return (
    <article
      className={`conversation-bubble-row ${outbound ? 'outbound' : 'inbound'} ${
        highlighted ? 'target-highlight' : ''
      }`}
      data-message-id={message.id}
    >
      <div
        className={`conversation-bubble ${outbound ? 'outbound' : 'inbound'} ${
          hasAvailableImage ? 'has-image-media' : ''
        }`}
      >
        <button
          className="conversation-reply-action"
          type="button"
          title="Responder"
          aria-label="Responder mensagem"
          onClick={() => onReply(message)}
        >
          <Reply aria-hidden="true" size={14} />
        </button>
        <ConversationQuote message={message} onClick={() => onQuoteClick(message)} />
        {text ? <p>{renderHighlightedSearchText(text, searchTerm)}</p> : null}
        <ConversationMediaContent conversationId={conversationId} message={message} />
        {caption ? <span className="conversation-caption">{caption}</span> : null}
        <footer>
          <span>{conversationMessageTime(message)}</span>
          {outbound ? <ConversationMessageStatusIcon status={message.status} /> : null}
        </footer>
        {message.status === 'FAILED' && outbound ? (
          <div className="conversation-message-failure">
            <strong>Falhou ao enviar</strong>
            {retryError ? <span>{retryError}</span> : null}
            {message.retryAction === 'RETRY' ? (
              <button
                className="conversation-message-retry"
                disabled={retrying}
                type="button"
                onClick={() => onRetry(message)}
              >
                {retrying ? 'Tentando...' : 'Tentar novamente'}
              </button>
            ) : null}
            {message.retryAction === 'SELECT_FILE_AGAIN' ? (
              <span>Selecionar arquivo novamente</span>
            ) : null}
            {message.retryAction === 'RECORD_AGAIN' ? <span>Gravar novamente</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ConversationQuote({
  message,
  onClick,
}: {
  message: WhatsAppConversationMessage;
  onClick: () => void;
}) {
  const preview = message.quotedText || conversationReplyFallbackPreview(message);

  if (!preview) {
    return null;
  }

  const available = Boolean(message.replyToMessageId);

  return (
    <button
      className={`conversation-quote ${available ? '' : 'unavailable'}`}
      type="button"
      title={available ? 'Ir para mensagem original' : 'Mensagem original não disponível'}
      onClick={() => {
        if (available) onClick();
      }}
    >
      <strong>
        {message.replyTo ? conversationReplyAuthorLabel(message.replyTo) : 'Mensagem citada'}
      </strong>
      <span>{preview}</span>
    </button>
  );
}

function useMediaVisibility(enabled: boolean) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || visible) return undefined;

    const element = elementRef.current;
    if (!element) return undefined;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px', threshold: 0.01 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [enabled, visible]);

  return { elementRef, visible };
}

function ConversationMediaContent({
  conversationId,
  message,
}: {
  conversationId: string;
  message: WhatsAppConversationMessage;
}) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const [pdfPreviewRequested, setPdfPreviewRequested] = useState(false);
  const mountedRef = useRef(false);
  const mediaUrlRef = useRef<string | null>(null);
  const loadingPromiseRef = useRef<Promise<string | null> | null>(null);
  const requestGenerationRef = useRef(0);
  const imageButtonRef = useRef<HTMLButtonElement | null>(null);
  const lightboxCloseRef = useRef<HTMLButtonElement | null>(null);
  const isPdfDocument =
    message.type === 'DOCUMENT' && message.mediaMimeType?.toLowerCase() === 'application/pdf';
  const imageAutoVisible = message.type === 'IMAGE' && message.mediaAvailable && !mediaUrl;
  const { elementRef: visibilityRef, visible: mediaVisible } = useMediaVisibility(imageAutoVisible);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (mediaUrlRef.current) {
        URL.revokeObjectURL(mediaUrlRef.current);
        mediaUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setImageLightboxOpen(false);
    setPdfPreviewRequested(false);
    setError(false);
    requestGenerationRef.current += 1;
    loadingPromiseRef.current = null;
    if (mediaUrlRef.current) {
      URL.revokeObjectURL(mediaUrlRef.current);
      mediaUrlRef.current = null;
    }
    setMediaUrl(null);
  }, [conversationId, message.id, message.mediaAvailable]);

  const loadMedia = useCallback(async () => {
    if (!message.mediaAvailable) return null;
    if (mediaUrlRef.current) return mediaUrlRef.current;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    setLoading(true);
    setError(false);
    const requestGeneration = requestGenerationRef.current;

    const request = downloadWhatsAppConversationMedia(conversationId, message.id)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);

        if (!mountedRef.current || requestGeneration !== requestGenerationRef.current) {
          URL.revokeObjectURL(objectUrl);
          return null;
        }

        if (mediaUrlRef.current && mediaUrlRef.current !== objectUrl) {
          URL.revokeObjectURL(mediaUrlRef.current);
        }

        mediaUrlRef.current = objectUrl;
        setMediaUrl(objectUrl);
        return objectUrl;
      })
      .catch(() => {
        if (mountedRef.current && requestGeneration === requestGenerationRef.current) {
          setError(true);
        }
        return null;
      })
      .finally(() => {
        if (requestGeneration === requestGenerationRef.current) {
          loadingPromiseRef.current = null;
          if (mountedRef.current) setLoading(false);
        }
      });

    loadingPromiseRef.current = request;
    return request;
  }, [conversationId, message.id, message.mediaAvailable]);

  const closeImageLightbox = useCallback(() => {
    setImageLightboxOpen(false);
    window.setTimeout(() => {
      if (mountedRef.current) imageButtonRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    if (message.type !== 'IMAGE' || !mediaVisible || mediaUrl) return;

    void loadMedia();
  }, [loadMedia, mediaUrl, mediaVisible, message.type]);

  useEffect(() => {
    if (!imageLightboxOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => lightboxCloseRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeImageLightbox();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [closeImageLightbox, imageLightboxOpen]);

  async function openDocument() {
    const objectUrl = mediaUrl ?? (await loadMedia());
    if (!objectUrl) return;

    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }

  async function openImageLightbox() {
    const objectUrl = mediaUrl ?? (await loadMedia());
    if (!objectUrl) return;

    setImageLightboxOpen(true);
  }

  async function requestPdfPreview() {
    setPdfPreviewRequested(true);
    await loadMedia();
  }

  if (!isRenderableConversationMedia(message.type)) {
    return null;
  }

  if (!message.mediaAvailable) {
    return message.type === 'AUDIO' ? (
      <span className="conversation-media-meta">Mídia indisponível</span>
    ) : message.type === 'DOCUMENT' && message.mediaFileName ? (
      <span className="conversation-media-meta">
        {message.mediaFileName}
        {message.mediaSizeBytes ? ` | ${formatFileSize(message.mediaSizeBytes)}` : ''}
      </span>
    ) : message.type === 'DOCUMENT' ? (
      <span className="conversation-media-meta">Mídia indisponível</span>
    ) : null;
  }

  if (message.type === 'DOCUMENT') {
    const fileName = message.mediaFileName || 'Documento';
    const documentType = conversationDocumentTypeLabel(fileName, message.mediaMimeType);
    const fileSize = message.mediaSizeBytes ? formatFileSize(message.mediaSizeBytes) : null;
    const documentMeta = [documentType, fileSize].filter(Boolean).join(' | ');
    const showPdfPreview = isPdfDocument && pdfPreviewRequested && !error;
    const previewUrl =
      showPdfPreview && mediaUrl
        ? `${mediaUrl}#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH`
        : null;

    return (
      <div className={`conversation-document-media ${showPdfPreview ? 'has-pdf-preview' : ''}`}>
        {showPdfPreview ? (
          <button
            aria-label={`Abrir ou baixar prévia de ${fileName}`}
            className="conversation-document-preview"
            disabled={loading && !mediaUrl}
            type="button"
            onClick={() => void openDocument()}
          >
            {previewUrl ? (
              <object
                aria-hidden="true"
                className="conversation-document-preview-frame"
                data={previewUrl}
                tabIndex={-1}
                type="application/pdf"
              >
                <span>{fileName}</span>
              </object>
            ) : (
              <span className="conversation-document-preview-skeleton" aria-hidden="true" />
            )}
          </button>
        ) : null}
        <div className="conversation-document-details">
          <span className="conversation-document-icon" aria-hidden="true">
            <FileText size={18} />
            {isPdfDocument ? <span>PDF</span> : null}
          </span>
          <span className="conversation-document-copy">
            <strong>{fileName}</strong>
            <small>{documentMeta}</small>
            {error ? (
              <small className="conversation-document-error">Falha ao carregar</small>
            ) : null}
          </span>
          {isPdfDocument ? (
            <button
              aria-label={`Visualizar PDF ${fileName}`}
              className="conversation-document-action"
              disabled={loading && !mediaUrl}
              type="button"
              onClick={() => void requestPdfPreview()}
            >
              <Eye size={15} aria-hidden="true" />
              <span>
                {loading && pdfPreviewRequested && !mediaUrl ? 'Carregando...' : 'Visualizar'}
              </span>
            </button>
          ) : null}
          <button
            aria-label={`Abrir ou baixar ${fileName}`}
            className="conversation-document-action"
            disabled={loading && !mediaUrl}
            type="button"
            onClick={() => void openDocument()}
          >
            <Download size={15} aria-hidden="true" />
            <span>{loading && !mediaUrl ? 'Abrindo...' : 'Abrir / Baixar'}</span>
          </button>
        </div>
      </div>
    );
  }

  if (message.type === 'IMAGE' && !mediaUrl) {
    return (
      <div ref={visibilityRef} className="conversation-media-unavailable image-placeholder">
        <span>{loading ? 'Carregando imagem...' : 'Imagem disponível'}</span>
        {error ? <span>Falha ao carregar</span> : null}
        <button type="button" onClick={() => void openImageLightbox()}>
          {loading ? 'Carregando...' : error ? 'Tentar novamente' : 'Carregar imagem'}
        </button>
      </div>
    );
  }

  if (message.type === 'AUDIO') {
    return (
      <ConversationAudioPlayer
        durationSeconds={message.mediaDurationSeconds}
        loading={loading}
        loadError={error}
        outbound={message.direction === 'OUTBOUND'}
        onLoadSource={loadMedia}
        src={mediaUrl}
      />
    );
  }

  if (message.type === 'VIDEO' && !mediaUrl) {
    return (
      <div className="conversation-media-unavailable">
        <span>
          {loading ? 'Carregando vídeo...' : conversationMediaUnavailableText(message.type)}
        </span>
        <button type="button" onClick={() => void loadMedia()}>
          {loading ? 'Carregando...' : error ? 'Tentar novamente' : 'Carregar vídeo'}
        </button>
      </div>
    );
  }

  if (loading && !mediaUrl) {
    return <span className="conversation-media-loading">Carregando mídia...</span>;
  }

  if (error || !mediaUrl) {
    return (
      <div className="conversation-media-unavailable">
        <span>{conversationMediaUnavailableText(message.type)}</span>
        <button type="button" onClick={() => void loadMedia()}>
          Tentar novamente
        </button>
      </div>
    );
  }

  if (message.type === 'IMAGE') {
    return (
      <>
        <button
          ref={imageButtonRef}
          aria-label="Abrir imagem em tamanho grande"
          className="conversation-image-media"
          type="button"
          onClick={() => void openImageLightbox()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={message.text || message.mediaFileName || 'Imagem'} src={mediaUrl} />
        </button>
        {imageLightboxOpen ? (
          <div
            aria-modal="true"
            className="conversation-image-lightbox"
            role="dialog"
            aria-label="Imagem da conversa"
            onClick={closeImageLightbox}
          >
            <button
              ref={lightboxCloseRef}
              aria-label="Fechar imagem"
              className="conversation-image-lightbox-close"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                closeImageLightbox();
              }}
            >
              <X size={22} aria-hidden="true" />
            </button>
            <div className="conversation-image-lightbox-stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={message.text || message.mediaFileName || 'Imagem'}
                src={mediaUrl}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <video className="conversation-video-media" controls preload="metadata" src={mediaUrl}>
      <track kind="captions" />
    </video>
  );
}

function ConversationAudioPlayer({
  durationSeconds,
  loading,
  loadError,
  onLoadSource,
  outbound,
  src,
}: {
  durationSeconds: number | null;
  loading: boolean;
  loadError: boolean;
  onLoadSource: () => Promise<string | null>;
  outbound: boolean;
  src: string | null;
}) {
  const conversationAudioPlayEvent = 'crm-conversation-audio-play';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingPlaybackRef = useRef(false);
  const initialDuration = isFinitePositiveNumber(durationSeconds) ? durationSeconds : 0;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  useEffect(() => {
    function pauseOtherAudio(event: Event) {
      const audio = audioRef.current;
      const playingAudio =
        event instanceof CustomEvent ? (event.detail as HTMLAudioElement | null) : null;

      if (audio && playingAudio && playingAudio !== audio && !audio.paused) {
        audio.pause();
      }
    }

    window.addEventListener(conversationAudioPlayEvent, pauseOtherAudio);

    return () => {
      window.removeEventListener(conversationAudioPlayEvent, pauseOtherAudio);
    };
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(initialDuration);
    setPlaying(false);
    if (!pendingPlaybackRef.current) setWaiting(false);
    setFailed(loadError);
  }, [initialDuration, loadError, src]);

  useEffect(() => {
    if (!src || !pendingPlaybackRef.current) return;

    pendingPlaybackRef.current = false;
    const audio = audioRef.current;
    if (!audio) return;

    setWaiting(true);
    audio.play().catch(() => {
      setWaiting(false);
      setPlaying(false);
    });
  }, [src]);

  function syncTime() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(isFinitePositiveNumber(audio.currentTime) ? audio.currentTime : 0);
  }

  function syncDuration() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isFinitePositiveNumber(audio.duration)) setDuration(audio.duration);
  }

  function seekTo(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || failed || duration <= 0) return;

    const safeTime = Math.min(duration, Math.max(0, nextTime));
    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }

  async function togglePlayback() {
    if (!src) {
      if (loading) return;

      pendingPlaybackRef.current = true;
      setWaiting(true);
      setFailed(false);
      const objectUrl = await onLoadSource();

      if (!objectUrl) {
        pendingPlaybackRef.current = false;
        setWaiting(false);
        setFailed(true);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio || failed) return;

    try {
      if (audio.paused) {
        setWaiting(true);
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setWaiting(false);
      setPlaying(false);
    }
  }

  function seek(event: ReactMouseEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    if (!audio || failed || duration <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  }

  function seekWithKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (failed || duration <= 0) return;

    const stepSeconds = event.shiftKey ? 10 : 5;
    const keySeekMap: Record<string, number> = {
      ArrowLeft: currentTime - stepSeconds,
      ArrowRight: currentTime + stepSeconds,
      End: duration,
      Home: 0,
      PageDown: currentTime - 15,
      PageUp: currentTime + 15,
    };

    const nextTime = keySeekMap[event.key];
    if (nextTime === undefined) return;

    event.preventDefault();
    seekTo(nextTime);
  }

  const buttonLabel = failed
    ? 'Áudio indisponível'
    : waiting || loading
      ? 'Carregando áudio'
      : playing
        ? 'Pausar áudio'
        : 'Reproduzir áudio';

  return (
    <div className={`conversation-audio-player ${outbound ? 'outbound' : 'inbound'}`}>
      {src ? (
        <audio
          ref={audioRef}
          className="conversation-audio-media"
          preload="metadata"
          src={src}
          onCanPlay={() => {
            setWaiting(false);
            syncDuration();
          }}
          onDurationChange={syncDuration}
          onEnded={() => {
            const audio = audioRef.current;
            if (audio) audio.currentTime = 0;
            setPlaying(false);
            setWaiting(false);
            setCurrentTime(0);
          }}
          onError={() => {
            setFailed(true);
            setWaiting(false);
            setPlaying(false);
          }}
          onLoadedMetadata={syncDuration}
          onPause={() => {
            setPlaying(false);
            setWaiting(false);
          }}
          onPlay={() => {
            const audio = audioRef.current;
            if (audio) {
              window.dispatchEvent(new CustomEvent(conversationAudioPlayEvent, { detail: audio }));
            }
            setPlaying(true);
            setFailed(false);
          }}
          onPlaying={() => {
            setPlaying(true);
            setWaiting(false);
          }}
          onTimeUpdate={syncTime}
          onWaiting={() => setWaiting(true)}
        />
      ) : null}
      <button
        aria-label={buttonLabel}
        className="conversation-audio-toggle"
        disabled={failed && !loadError}
        type="button"
        onClick={() => void togglePlayback()}
      >
        {waiting || loading ? (
          <Loader2 size={17} aria-hidden="true" />
        ) : playing ? (
          <Pause size={17} aria-hidden="true" />
        ) : (
          <Play size={17} aria-hidden="true" />
        )}
      </button>
      <div className="conversation-audio-main">
        <button
          aria-label="Buscar posição do áudio"
          aria-valuemax={Math.floor(duration)}
          aria-valuemin={0}
          aria-valuenow={Math.floor(currentTime)}
          aria-valuetext={`${formatConversationAudioTime(currentTime)} de ${formatConversationAudioTime(
            duration,
          )}`}
          className="conversation-audio-progress"
          disabled={failed || duration <= 0}
          role="slider"
          type="button"
          onClick={seek}
          onKeyDown={seekWithKeyboard}
        >
          <span className="conversation-audio-track" aria-hidden="true">
            <span className="conversation-audio-fill" style={{ width: `${progress}%` }} />
          </span>
        </button>
        <span className="conversation-audio-time">
          {formatConversationAudioTime(currentTime)} / {formatConversationAudioTime(duration)}
        </span>
      </div>
    </div>
  );
}

function ConversationComposer({
  composerRef,
  conversationId,
  draft,
  error,
  replyTarget,
  selectedMedia,
  sending,
  onChange,
  onCancelReply,
  onRemoveMedia,
  onSelectMedia,
  onSend,
  onSendVoice,
}: {
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  draft: string;
  error: string;
  replyTarget: WhatsAppConversationMessage | null;
  selectedMedia: ConversationComposerMedia | null;
  sending: boolean;
  onChange: (value: string) => void;
  onCancelReply: () => void;
  onRemoveMedia: () => void;
  onSelectMedia: (kind: ConversationComposerMedia['kind'], file: File) => void;
  onSend: () => void;
  onSendVoice: (voice: ConversationVoiceDraft) => Promise<void>;
}) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<ConversationVoiceDraft | null>(null);
  const [voiceError, setVoiceError] = useState('');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const stoppingVoiceRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceSendingRef = useRef(false);
  const hasText = Boolean(draft.trim());
  const hasSendableContent = Boolean(hasText || selectedMedia);
  const actionMode = conversationComposerActionMode(draft, selectedMedia, sending);
  const shouldShowSendAction = actionMode === 'SEND';
  const canSend = hasSendableContent && !sending;
  const canSendVoice = Boolean(voiceDraft) && !sending && !recording;

  useEffect(() => {
    return () => {
      cancelVoiceRecording();
    };
  }, [conversationId]);

  function selectFile(kind: ConversationComposerMedia['kind'], file: File | undefined) {
    if (!file) return;
    onSelectMedia(kind, file);
    setAttachmentMenuOpen(false);
  }

  function clearVoicePreview() {
    setVoiceDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
    setVoiceSeconds(0);
  }

  function stopVoiceTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function clearVoiceTimers() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (maxDurationTimeoutRef.current !== null) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }

  function handleRecorderStop(recorder: MediaRecorder) {
    clearVoiceTimers();
    stopVoiceTracks();
    setRecording(false);
    mediaRecorderRef.current = null;
    stoppingVoiceRef.current = false;

    const durationSeconds = Math.min(
      conversationVoiceMaxSeconds,
      Math.max(
        1,
        Math.ceil(
          recordingStartedAtRef.current
            ? (Date.now() - recordingStartedAtRef.current) / 1000
            : voiceSeconds,
        ),
      ),
    );
    recordingStartedAtRef.current = null;

    const discard = discardRecordingRef.current;
    discardRecordingRef.current = false;

    if (discard) {
      chunksRef.current = [];
      setVoiceSeconds(0);
      return;
    }

    const mimeType = recorder.mimeType || fallbackConversationVoiceMimeType;
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (!blob.size) {
      setVoiceError('Não foi possível capturar áudio do microfone.');
      setVoiceSeconds(0);
      return;
    }

    const file = new File([blob], `voice-${Date.now()}.webm`, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);
    setVoiceDraft((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return {
        conversationId,
        durationSeconds,
        file,
        previewUrl,
        requestId: createConversationRequestId(),
      };
    });
    setVoiceSeconds(durationSeconds);
  }

  function finishRecording(discard: boolean) {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      clearVoiceTimers();
      stopVoiceTracks();
      setRecording(false);
      stoppingVoiceRef.current = false;
      discardRecordingRef.current = false;
      return;
    }

    if (stoppingVoiceRef.current) {
      if (discard) {
        discardRecordingRef.current = true;
      }
      return;
    }

    discardRecordingRef.current = discard;
    stoppingVoiceRef.current = true;
    clearVoiceTimers();

    if (recorder.state === 'inactive') {
      handleRecorderStop(recorder);
      return;
    }

    recorder.stop();
  }

  function cancelVoiceRecording() {
    finishRecording(true);
    clearVoicePreview();
    setVoiceError('');
  }

  function voiceMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    if (MediaRecorder.isTypeSupported(preferredConversationVoiceMimeType)) {
      return preferredConversationVoiceMimeType;
    }
    if (MediaRecorder.isTypeSupported(fallbackConversationVoiceMimeType)) {
      return fallbackConversationVoiceMimeType;
    }
    return null;
  }

  async function startVoiceRecording() {
    setVoiceError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
      return;
    }

    const mimeType = voiceMimeType();
    if (!mimeType) {
      setVoiceError('Gravação WebM/Opus não é suportada neste navegador.');
      return;
    }

    try {
      clearVoicePreview();
      onRemoveMedia();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      discardRecordingRef.current = false;
      stoppingVoiceRef.current = false;
      chunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setVoiceSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setVoiceError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
        finishRecording(true);
      };
      recorder.onstop = () => {
        handleRecorderStop(recorder);
      };

      recorder.start();
      setRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        if (!recordingStartedAtRef.current) return;
        setVoiceSeconds(
          Math.min(
            conversationVoiceMaxSeconds,
            Math.floor((Date.now() - recordingStartedAtRef.current) / 1000),
          ),
        );
      }, 250);
      maxDurationTimeoutRef.current = window.setTimeout(() => {
        finishRecording(false);
      }, conversationVoiceMaxSeconds * 1000);
    } catch {
      clearVoiceTimers();
      stopVoiceTracks();
      setRecording(false);
      setVoiceError('Não foi possível acessar o microfone. Verifique a permissão do navegador.');
    }
  }

  async function sendVoiceDraft() {
    if (!voiceDraft || sending || voiceSendingRef.current) return;

    voiceSendingRef.current = true;
    try {
      await onSendVoice(voiceDraft);
      clearVoicePreview();
      setVoiceError('');
    } catch {
      setVoiceError('Falha ao enviar gravação. Você pode tentar novamente.');
    } finally {
      voiceSendingRef.current = false;
    }
  }

  return (
    <form
      className="conversation-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (shouldShowSendAction) {
          onSend();
        }
      }}
    >
      {error ? (
        <div className="notice danger conversation-notice" role="alert">
          {error}
        </div>
      ) : null}
      {voiceError ? (
        <div className="notice danger conversation-notice" role="alert">
          {voiceError}
        </div>
      ) : null}
      {replyTarget ? (
        <div className="conversation-reply-preview">
          <Reply aria-hidden="true" size={16} />
          <span>
            <strong>
              Respondendo a {replyTarget.direction === 'OUTBOUND' ? 'você' : 'contato'}
            </strong>
            <small>{conversationMessageQuotePreview(replyTarget)}</small>
          </span>
          <IconButton icon={X} label="Cancelar resposta" onClick={onCancelReply} />
        </div>
      ) : null}
      {recording ? (
        <div className="conversation-voice-recorder" role="status">
          <span className="conversation-recording-dot" aria-hidden="true" />
          <strong>{formatConversationAudioTime(voiceSeconds)}</strong>
          <IconButton
            icon={X}
            label="Cancelar gravação"
            disabled={Boolean(sending)}
            onClick={cancelVoiceRecording}
          />
          <IconButton
            icon={Square}
            label="Parar gravação"
            disabled={Boolean(sending)}
            onClick={() => finishRecording(false)}
          />
        </div>
      ) : null}
      {voiceDraft ? (
        <div className="conversation-voice-preview">
          <span className="conversation-attachment-file-icon" aria-hidden="true">
            <FileAudio size={18} />
          </span>
          <span>
            <strong>Gravação de voz</strong>
            <small>{formatConversationAudioTime(voiceDraft.durationSeconds)}</small>
            <audio
              className="conversation-attachment-audio-preview"
              controls
              preload="metadata"
              src={voiceDraft.previewUrl}
            />
          </span>
          <IconButton
            icon={Trash2}
            label="Cancelar gravação"
            disabled={Boolean(sending)}
            onClick={clearVoicePreview}
          />
          <IconButton
            icon={Send}
            label="Enviar gravação"
            disabled={!canSendVoice}
            onClick={() => void sendVoiceDraft()}
          />
        </div>
      ) : null}
      {selectedMedia ? (
        <div className="conversation-attachment-preview">
          {selectedMedia.kind === 'IMAGE' && selectedMedia.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" src={selectedMedia.previewUrl} />
          ) : selectedMedia.kind === 'VIDEO' && selectedMedia.previewUrl ? (
            <video
              className="conversation-attachment-video-preview"
              controls
              preload="metadata"
              src={selectedMedia.previewUrl}
            >
              <track kind="captions" />
            </video>
          ) : (
            <span className="conversation-attachment-file-icon" aria-hidden="true">
              {selectedMedia.kind === 'AUDIO' ? (
                <FileAudio size={18} />
              ) : selectedMedia.kind === 'VIDEO' ? (
                <FileVideo size={18} />
              ) : (
                <FileText size={18} />
              )}
            </span>
          )}
          <span>
            <strong>{selectedMedia.file.name}</strong>
            <small>{formatFileSize(selectedMedia.file.size)}</small>
            {selectedMedia.kind === 'AUDIO' && selectedMedia.previewUrl ? (
              <audio
                className="conversation-attachment-audio-preview"
                controls
                preload="metadata"
                src={selectedMedia.previewUrl}
              />
            ) : null}
          </span>
          <IconButton icon={X} label="Remover anexo" onClick={onRemoveMedia} />
        </div>
      ) : null}
      <div className="conversation-composer-tools">
        <div className="conversation-attach-control">
          <IconButton
            icon={Plus}
            label="Anexar arquivo"
            disabled={recording || sending}
            onClick={() => setAttachmentMenuOpen((current) => !current)}
          />
          {attachmentMenuOpen ? (
            <div className="conversation-attach-menu">
              <button type="button" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon aria-hidden="true" size={16} />
                <span>Imagem</span>
              </button>
              <button type="button" onClick={() => documentInputRef.current?.click()}>
                <FileText aria-hidden="true" size={16} />
                <span>Documento</span>
              </button>
              <button type="button" onClick={() => audioInputRef.current?.click()}>
                <FileAudio aria-hidden="true" size={16} />
                <span>Áudio</span>
              </button>
              <button type="button" onClick={() => videoInputRef.current?.click()}>
                <FileVideo aria-hidden="true" size={16} />
                <span>Vídeo</span>
              </button>
            </div>
          ) : null}
          <input
            ref={imageInputRef}
            accept={conversationImageAccept}
            className="sr-only"
            type="file"
            onChange={(event) => {
              selectFile('IMAGE', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={documentInputRef}
            accept={conversationDocumentAccept}
            className="sr-only"
            type="file"
            onChange={(event) => {
              selectFile('DOCUMENT', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={audioInputRef}
            accept={conversationAudioAccept}
            className="sr-only"
            type="file"
            onChange={(event) => {
              selectFile('AUDIO', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <input
            ref={videoInputRef}
            accept={conversationVideoAccept}
            className="sr-only"
            type="file"
            onChange={(event) => {
              selectFile('VIDEO', event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <label>
        <span className="sr-only">Digite uma mensagem</span>
        <textarea
          aria-label="Digite uma mensagem"
          aria-busy={sending}
          ref={composerRef}
          placeholder="Digite uma mensagem..."
          rows={2}
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && replyTarget) {
              event.preventDefault();
              onCancelReply();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (shouldShowSendAction) {
                onSend();
              }
            }
          }}
        />
      </label>
      {shouldShowSendAction ? (
        <Button
          aria-label="Enviar mensagem"
          className="conversation-primary-action"
          icon={Send}
          loading={sending}
          title="Enviar mensagem"
          variant="primary"
          disabled={!canSend}
          type="submit"
          onMouseDown={(event) => {
            if (document.activeElement === composerRef.current) {
              event.preventDefault();
            }
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== 'mouse' && document.activeElement === composerRef.current) {
              event.preventDefault();
            }
          }}
          onPointerUp={(event) => {
            if (event.pointerType !== 'mouse') {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }
          }}
        >
          Enviar mensagem
        </Button>
      ) : (
        <IconButton
          className="conversation-primary-action"
          icon={Mic}
          label="Gravar áudio"
          disabled={recording || sending || Boolean(voiceDraft)}
          onClick={() => void startVoiceRecording()}
        />
      )}
    </form>
  );
}

function ConversationClientPanel({
  client,
  clientError,
  conversation,
  linkClientError,
  linkingClient,
  mobileOpen,
  onCloseMobile,
  onCreateClient,
  onLinkClient,
  onOpenClient,
}: {
  client: Client | null;
  clientError: string;
  conversation: WhatsAppConversation | null;
  linkClientError: string;
  linkingClient: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onCreateClient: (conversation: WhatsAppConversation) => void;
  onLinkClient: (client: ClientOption) => void;
  onOpenClient: (clientId: string) => void;
}) {
  return (
    <>
      <aside className="conversation-client-panel" aria-label="Contexto do cliente">
        <ConversationClientPanelContent
          client={client}
          clientError={clientError}
          conversation={conversation}
          linkClientError={linkClientError}
          linkingClient={linkingClient}
          onCreateClient={onCreateClient}
          onLinkClient={onLinkClient}
          onOpenClient={onOpenClient}
        />
      </aside>
      {mobileOpen ? (
        <div className="modal-backdrop conversation-client-drawer" role="presentation">
          <section className="modal" aria-labelledby="conversation-client-panel-title">
            <header className="modal-header">
              <h2 id="conversation-client-panel-title">Contexto</h2>
              <IconButton icon={X} label="Fechar contexto" onClick={onCloseMobile} />
            </header>
            <ConversationClientPanelContent
              client={client}
              clientError={clientError}
              conversation={conversation}
              linkClientError={linkClientError}
              linkingClient={linkingClient}
              onCreateClient={onCreateClient}
              onLinkClient={onLinkClient}
              onOpenClient={onOpenClient}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}

function ConversationClientPanelContent({
  client,
  clientError,
  conversation,
  linkClientError,
  linkingClient,
  onCreateClient,
  onLinkClient,
  onOpenClient,
}: {
  client: Client | null;
  clientError: string;
  conversation: WhatsAppConversation | null;
  linkClientError: string;
  linkingClient: boolean;
  onCreateClient: (conversation: WhatsAppConversation) => void;
  onLinkClient: (client: ClientOption) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  useEffect(() => {
    setLinkOpen(false);
    setSelectedClientId('');
    setSelectedClient(null);
  }, [conversation?.id, client?.id]);

  if (!conversation) {
    return (
      <div className="conversation-empty-panel">
        <Info aria-hidden="true" size={22} />
        <span>Selecione uma conversa para ver o contexto.</span>
      </div>
    );
  }

  if (clientError) {
    return <div className="notice danger conversation-notice">{clientError}</div>;
  }

  if (client) {
    const pendingAmount = (client.receivables ?? [])
      ?.filter(
        (receivable) =>
          receivable.displayStatus === 'PENDENTE' || receivable.displayStatus === 'VENCIDO',
      )
      .reduce((total, receivable) => total + Number(receivable.amount), 0);

    return (
      <div className="conversation-context-card">
        <span className="conversation-kind client">Cliente</span>
        <h3>Dados do cliente</h3>
        <dl className="detail-list">
          <div>
            <dt>Nome</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{normalizeWhatsAppDisplayPhone(client.phoneNormalized) ?? client.phone}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>{client.email ?? '-'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{client.status}</dd>
          </div>
          <div>
            <dt>Referências</dt>
            <dd>{client.references?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Total a receber</dt>
            <dd>{formatCurrency(pendingAmount)}</dd>
          </div>
        </dl>
        <Button icon={ArrowRight} variant="primary" onClick={() => onOpenClient(client.id)}>
          Abrir cliente
        </Button>
      </div>
    );
  }

  const instanceLabel = conversationInstanceLabel(conversation.instanceName);
  const conversationPhone =
    normalizeWhatsAppDisplayPhone(conversation.phoneNormalized) ?? conversation.phone;
  const selectedClientPhone = selectedClient?.phoneNormalized
    ? formatNormalizedBrazilPhone(selectedClient.phoneNormalized)
    : '-';
  const phoneDiffers =
    Boolean(selectedClient?.phoneNormalized) &&
    selectedClient?.phoneNormalized !== conversation.phoneNormalized;

  return (
    <div className="conversation-context-card">
      <span className="conversation-kind guest">Avulso</span>
      <h3>Contato avulso</h3>
      <dl className="detail-list">
        <div>
          <dt>Nome</dt>
          <dd>{conversation.displayName}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{conversationPhone}</dd>
        </div>
        {instanceLabel ? (
          <div>
            <dt>Instância</dt>
            <dd>{instanceLabel}</dd>
          </div>
        ) : null}
      </dl>
      <div className="conversation-link-client">
        <Button
          icon={UserRoundPlus}
          size="sm"
          variant="primary"
          onClick={() => onCreateClient(conversation)}
        >
          Cadastrar cliente
        </Button>
        <Button
          icon={UserCheck}
          size="sm"
          variant="secondary"
          onClick={() => setLinkOpen((current) => !current)}
        >
          Vincular a cliente
        </Button>

        {linkOpen ? (
          <div className="conversation-link-client-form">
            <FinanceClientAutocomplete
              label="Buscar cliente"
              placeholder="Buscar por nome, telefone ou e-mail..."
              selectedClient={selectedClient}
              value={selectedClientId}
              onChange={(clientId, option) => {
                setSelectedClientId(clientId);
                setSelectedClient(option);
              }}
            />

            {selectedClient ? (
              <div className="conversation-link-confirmation">
                <strong>Vincular conversa a: {selectedClient.name}</strong>
                <dl className="detail-list compact">
                  <div>
                    <dt>Telefone da conversa</dt>
                    <dd>{conversationPhone}</dd>
                  </div>
                  <div>
                    <dt>Telefone do cliente</dt>
                    <dd>{selectedClientPhone}</dd>
                  </div>
                </dl>
                {phoneDiffers ? (
                  <div className="notice warning conversation-notice">
                    O telefone desta conversa é diferente do telefone principal do cliente.
                  </div>
                ) : null}
                <div className="conversation-link-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedClientId('');
                      setSelectedClient(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    icon={UserCheck}
                    loading={linkingClient}
                    size="sm"
                    variant="primary"
                    onClick={() => onLinkClient(selectedClient)}
                  >
                    Vincular cliente
                  </Button>
                </div>
              </div>
            ) : null}

            {linkClientError ? (
              <div className="notice danger conversation-notice" role="alert">
                {linkClientError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GuestConversationClientModal({
  conversation,
  duplicateClient,
  error,
  loading,
  plans,
  unlinkedClient,
  onClose,
  onLinkExisting,
  onOpenClient,
  onRetryLink,
  onSubmit,
}: {
  conversation: WhatsAppConversation;
  duplicateClient: ClientOption | null;
  error: string;
  loading: boolean;
  plans: Plan[];
  unlinkedClient: ClientOption | null;
  onClose: () => void;
  onLinkExisting: (client: ClientOption) => void;
  onOpenClient: (clientId: string) => void;
  onRetryLink: (client: ClientOption) => void;
  onSubmit: (payload: ClientPayload) => Promise<void>;
}) {
  const conversationPhone =
    normalizeWhatsAppDisplayPhone(conversation.phoneNormalized) ?? conversation.phone;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal client-form-modal client-create-modal conversation-client-create-modal"
        aria-labelledby="conversation-client-create-title"
      >
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <UserRoundPlus size={15} />
          </span>
          <div>
            <span className="metric-label">Contato avulso</span>
            <h2 id="conversation-client-create-title">Cadastrar cliente</h2>
            <p>WhatsApp da conversa: {conversationPhone}</p>
          </div>
          <IconButton icon={X} label="Fechar cadastro de cliente" onClick={onClose} />
        </header>

        <div className="conversation-client-create-body">
          {error ? (
            <div className="notice danger conversation-notice" role="alert">
              {error}
            </div>
          ) : null}

          {duplicateClient ? (
            <div className="conversation-link-confirmation">
              <strong>Já existe um cliente com este telefone: {duplicateClient.name}</strong>
              <span>{formatNormalizedBrazilPhone(duplicateClient.phoneNormalized)}</span>
              <div className="conversation-link-actions">
                <Button
                  icon={ArrowRight}
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenClient(duplicateClient.id)}
                >
                  Abrir cliente
                </Button>
                <Button
                  icon={UserCheck}
                  loading={loading}
                  size="sm"
                  variant="primary"
                  onClick={() => onLinkExisting(duplicateClient)}
                >
                  Vincular ao cliente existente
                </Button>
              </div>
            </div>
          ) : null}

          {unlinkedClient ? (
            <div className="conversation-link-confirmation">
              <strong>Cliente criado, mas a conversa ainda não foi vinculada.</strong>
              <span>{unlinkedClient.name}</span>
              <div className="conversation-link-actions">
                <Button
                  icon={ArrowRight}
                  size="sm"
                  variant="ghost"
                  onClick={() => onOpenClient(unlinkedClient.id)}
                >
                  Abrir cliente criado
                </Button>
                <Button
                  icon={UserCheck}
                  loading={loading}
                  size="sm"
                  variant="primary"
                  onClick={() => onRetryLink(unlinkedClient)}
                >
                  Tentar vincular novamente
                </Button>
              </div>
            </div>
          ) : null}

          {!unlinkedClient ? (
            plans.length ? (
              <ClientForm
                initialValues={{ phone: conversationPhone }}
                plans={plans}
                submitLabel="Cadastrar e vincular"
                onCancel={onClose}
                onSubmit={async (payload) => onSubmit(payload as ClientPayload)}
              />
            ) : (
              <div className="conversation-empty-panel">
                <Info aria-hidden="true" size={22} />
                <span>{loading ? 'Carregando planos...' : 'Nenhum plano disponível.'}</span>
              </div>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}

function phoneDigits(value: string | null | undefined) {
  return value?.replace(/\D/g, '') ?? '';
}

function phoneDigitsCompatible(left: string, right: string) {
  const leftDigits = phoneDigits(left);
  const rightDigits = phoneDigits(right);

  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;
  if (Math.min(leftDigits.length, rightDigits.length) < 10) return false;

  return leftDigits.endsWith(rightDigits) || rightDigits.endsWith(leftDigits);
}

function clientOptionFromClient(client: Client): ClientOption {
  return {
    email: client.email,
    id: client.id,
    name: client.name,
    phoneNormalized: client.phoneNormalized,
    preferredPixProvider: client.preferredPixProvider,
    reference: client.reference,
  };
}

function mergeConversationMessages(
  current: WhatsAppConversationMessage[],
  incoming: WhatsAppConversationMessage[],
) {
  const map = new Map<string, WhatsAppConversationMessage>();
  for (const message of [...current, ...incoming]) {
    map.set(message.id, message);
  }
  return [...map.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
      left.id.localeCompare(right.id),
  );
}

function upsertConversationList(
  current: WhatsAppConversation[],
  conversation: WhatsAppConversation,
) {
  const existing = current.filter((item) => item.id !== conversation.id);
  return [conversation, ...existing].sort(
    (left, right) =>
      conversationListSortTime(right) - conversationListSortTime(left) ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function mergeConversationLists(
  current: WhatsAppConversation[],
  incoming: WhatsAppConversation[],
) {
  const map = new Map<string, WhatsAppConversation>();
  for (const conversation of [...current, ...incoming]) {
    map.set(conversation.id, conversation);
  }
  return [...map.values()].sort(
    (left, right) =>
      conversationListSortTime(right) - conversationListSortTime(left) ||
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
      right.id.localeCompare(left.id),
  );
}

export function mergeConversationById(
  current: WhatsAppConversation[],
  incoming: WhatsAppConversation,
) {
  let found = false;
  const merged = current.map((conversation) => {
    if (conversation.id !== incoming.id) {
      return conversation;
    }

    found = true;
    return { ...conversation, ...incoming };
  });

  if (found) {
    return merged;
  }

  return mergeConversationLists(current, [incoming]);
}

export function nextConversationListRequestGeneration(currentGeneration: number, append: boolean) {
  return append ? currentGeneration : currentGeneration + 1;
}

export function advanceConversationListGeneration(currentGeneration: number) {
  return currentGeneration + 1;
}

export function shouldApplyConversationListResponse({
  currentGeneration,
  currentQueryKey,
  requestGeneration,
  requestQueryKey,
}: {
  currentGeneration: number;
  currentQueryKey: string;
  requestGeneration: number;
  requestQueryKey: string;
}) {
  return currentGeneration === requestGeneration && currentQueryKey === requestQueryKey;
}

export function updateConversationSummaryAfterRead(
  summary: WhatsAppConversationSummary | null,
  unreadBeforeRead: number,
  unreadAfterRead: number,
) {
  if (!summary) return summary;

  const readDelta = Math.max(0, unreadBeforeRead - unreadAfterRead);
  if (readDelta <= 0) return summary;

  return {
    totalUnreadConversations:
      unreadAfterRead === 0
        ? Math.max(0, summary.totalUnreadConversations - 1)
        : summary.totalUnreadConversations,
    totalUnreadMessages: Math.max(0, summary.totalUnreadMessages - readDelta),
  };
}

export function shouldAutoReadRealtimeMessage({
  activeConversationId,
  conversationId,
  eventType,
  messageDirection,
  visible,
  focused,
}: {
  activeConversationId: string | null;
  conversationId: string;
  eventType: WhatsAppRealtimeEvent['type'];
  messageDirection: WhatsAppConversationMessage['direction'] | null;
  visible: boolean;
  focused: boolean;
}) {
  return (
    eventType === 'message.created' &&
    activeConversationId === conversationId &&
    messageDirection === 'INBOUND' &&
    visible &&
    focused
  );
}

export function resolveRealtimeCreatedMessage(
  event: Pick<WhatsAppRealtimeEvent, 'messageId' | 'type'>,
  loadedMessages: WhatsAppConversationMessage[] | null,
  previousMessages: WhatsAppConversationMessage[],
) {
  if (!loadedMessages?.length || event.type !== 'message.created') {
    return null;
  }

  if (event.messageId) {
    const matched = loadedMessages.find(
      (message) => message.id === event.messageId || message.providerMessageId === event.messageId,
    );
    if (matched) return matched;
  }

  const previousIds = new Set(previousMessages.map((message) => message.id));
  const previousProviderIds = new Set(
    previousMessages
      .map((message) => message.providerMessageId)
      .filter((providerMessageId): providerMessageId is string => Boolean(providerMessageId)),
  );
  const newlyLoadedMessages = loadedMessages.filter(
    (message) =>
      !previousIds.has(message.id) &&
      (!message.providerMessageId || !previousProviderIds.has(message.providerMessageId)),
  );

  return newlyLoadedMessages.length === 1 ? newlyLoadedMessages[0]! : null;
}

export function shouldReadVisibleConversationOnReturn({
  activeConversation,
  activeConversationId,
  visible,
  focused,
}: {
  activeConversation: WhatsAppConversation | null;
  activeConversationId: string | null;
  visible: boolean;
  focused: boolean;
}) {
  return Boolean(
    activeConversation &&
    activeConversation.id === activeConversationId &&
    activeConversation.unreadCount > 0 &&
    visible &&
    focused,
  );
}

export function shouldRetryActiveConversationRead({
  activeConversation,
  activeConversationId,
  conversationId,
  retryRequested,
  visible,
  focused,
}: {
  activeConversation: WhatsAppConversation | null;
  activeConversationId: string | null;
  conversationId: string;
  retryRequested: boolean;
  visible: boolean;
  focused: boolean;
}) {
  return Boolean(
    retryRequested &&
    activeConversation &&
    activeConversation.id === conversationId &&
    activeConversation.id === activeConversationId &&
    activeConversation.unreadCount > 0 &&
    visible &&
    focused,
  );
}

function compareMessageSearchResultsByTime(
  left: WhatsAppMessageSearchResult,
  right: WhatsAppMessageSearchResult,
) {
  const leftTime = new Date(left.message.sentAt ?? left.message.createdAt).getTime();
  const rightTime = new Date(right.message.sentAt ?? right.message.createdAt).getTime();
  return leftTime - rightTime || left.message.id.localeCompare(right.message.id);
}

function mergeMessageSearchResults(
  current: WhatsAppMessageSearchResult[],
  incoming: WhatsAppMessageSearchResult[],
) {
  const map = new Map<string, WhatsAppMessageSearchResult>();
  for (const result of [...current, ...incoming]) {
    map.set(result.message.id, result);
  }
  return [...map.values()].sort(compareMessageSearchResultsByTime);
}

function conversationListSortTime(conversation: WhatsAppConversation) {
  return conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
}

function createConversationRequestId() {
  return crypto.randomUUID();
}

function hasUnreadConversationSummary(summary: WhatsAppConversationSummary) {
  return summary.totalUnreadConversations > 0 || summary.totalUnreadMessages > 0;
}

function formatConversationSummary(summary: WhatsAppConversationSummary) {
  return `${pluralizePt(summary.totalUnreadConversations, 'conversa não lida', 'conversas não lidas')} · ${pluralizePt(summary.totalUnreadMessages, 'mensagem', 'mensagens')}`;
}

function pluralizePt(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function conversationInstanceLabel(instanceName: string | null) {
  if (!instanceName) return null;
  if (isTechnicalInstanceName(instanceName)) return null;
  return instanceName;
}

function isTechnicalInstanceName(value: string) {
  return /(?:^|-)crm-novo(?:-|$)/i.test(value) || /^[a-f0-9-]{20,}$/i.test(value);
}

function conversationInitial(conversation: WhatsAppConversation) {
  return (conversation.displayName || conversation.phone || '?').slice(0, 1).toUpperCase();
}

function conversationDateLabel(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function conversationMessageTime(message: WhatsAppConversationMessage) {
  const value = message.sentAt ?? message.createdAt;
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function conversationMessageDateKey(message: WhatsAppConversationMessage) {
  return conversationDateKeyFromValue(message.sentAt ?? message.createdAt);
}

function conversationMessageDateLabel(message: WhatsAppConversationMessage) {
  const messageParts = conversationDateParts(message.sentAt ?? message.createdAt);
  const messageKey = conversationDateKeyFromParts(messageParts);
  const todayParts = conversationDateParts(new Date());
  const todayKey = conversationDateKeyFromParts(todayParts);
  const yesterdayKey = conversationYesterdayKey(todayParts);

  if (messageKey === todayKey) return 'Hoje';
  if (messageKey === yesterdayKey) return 'Ontem';
  return `${messageParts.day}/${messageParts.month}/${messageParts.year}`;
}

function conversationDateKeyFromValue(value: string | Date) {
  return conversationDateKeyFromParts(conversationDateParts(value));
}

function conversationYesterdayKey(todayParts: { day: string; month: string; year: string }) {
  const yesterday = new Date(
    Date.UTC(Number(todayParts.year), Number(todayParts.month) - 1, Number(todayParts.day) - 1, 12),
  );
  return conversationDateKeyFromValue(yesterday);
}

function conversationDateKeyFromParts(parts: { day: string; month: string; year: string }) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function conversationDateParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: conversationDateSeparatorTimeZone,
    year: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return {
    day: part('day'),
    month: part('month'),
    year: part('year'),
  };
}

function conversationMessageStatusLabel(status: WhatsAppConversationMessageStatus) {
  const labels = {
    DELIVERED: 'Entregue',
    FAILED: 'Falhou',
    PENDING: 'Enviando',
    READ: 'Visualizada',
    SENT: 'Enviada',
  } satisfies Record<WhatsAppConversationMessageStatus, string>;
  return labels[status];
}

function ConversationMessageStatusIcon({ status }: { status: WhatsAppConversationMessageStatus }) {
  const label = conversationMessageStatusLabel(status);

  return (
    <span
      aria-label={label}
      className={`conversation-message-status status-${status.toLowerCase()}`}
      title={label}
    >
      {conversationMessageStatusSymbol(status)}
    </span>
  );
}

function conversationMessageStatusSymbol(status: WhatsAppConversationMessageStatus) {
  const symbols = {
    DELIVERED: '✓✓',
    FAILED: '!',
    PENDING: '◷',
    READ: '✓✓',
    SENT: '✓',
  } satisfies Record<WhatsAppConversationMessageStatus, string>;
  return symbols[status];
}

function conversationLastMessagePreview(message: WhatsAppConversationMessage) {
  const text = message.text?.trim();
  if (text) return text;
  if (message.type === 'IMAGE') return '[Imagem]';
  if (message.type === 'DOCUMENT') return message.mediaFileName || 'Documento';
  return conversationMessagePlaceholder(message.type) || '[Mensagem]';
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

function conversationDocumentTypeLabel(fileName: string, mimeType: string | null) {
  const normalizedMime = mimeType?.split(';')[0]?.trim().toLowerCase() || '';
  if (normalizedMime === 'application/pdf') return 'PDF';

  const extension = fileName.match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (extension) return extension.toUpperCase();

  if (normalizedMime) {
    const subtype = normalizedMime
      .split('/')[1]
      ?.replace(/^vnd\./, '')
      .split(/[.+-]/)[0];
    if (subtype) return subtype.toUpperCase().slice(0, 12);
  }

  return 'Arquivo';
}

function isFinitePositiveNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatConversationAudioTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function conversationMessagePlaceholder(type: WhatsAppConversationMessageType) {
  const labels = {
    AUDIO: '',
    BUTTON: '[Mensagem interativa]',
    DOCUMENT: '',
    IMAGE: '[Imagem]',
    LOCATION: '[Localização]',
    TEXT: '',
    UNKNOWN: '',
    VIDEO: '[Vídeo]',
  } satisfies Record<WhatsAppConversationMessageType, string>;
  return labels[type];
}

function isRenderableConversationMedia(type: WhatsAppConversationMessageType) {
  return type === 'IMAGE' || type === 'DOCUMENT' || type === 'AUDIO' || type === 'VIDEO';
}

function conversationMediaUnavailableText(type: WhatsAppConversationMessageType) {
  if (type === 'AUDIO') return 'Mídia indisponível';
  if (type === 'DOCUMENT') return 'Mídia indisponível';
  return conversationMessagePlaceholder(type);
}

function conversationMessageDisplayText(message: WhatsAppConversationMessage) {
  if (message.type === 'TEXT') return message.text || '';
  return conversationMessagePlaceholder(message.type);
}

function conversationMessageCaption(message: WhatsAppConversationMessage) {
  if (message.type === 'TEXT') return '';
  return message.text?.trim() || '';
}

function conversationMessageQuotePreview(message: WhatsAppConversationMessage) {
  const text = message.text?.trim();
  if (text) return text.slice(0, 160);
  if (message.type === 'IMAGE') return 'Imagem';
  if (message.type === 'AUDIO') return 'Áudio';
  if (message.type === 'DOCUMENT') return message.mediaFileName || 'Documento';
  if (message.type === 'VIDEO') return 'Vídeo';
  if (message.type === 'LOCATION') return 'Localização';
  return 'Mensagem';
}

function conversationReplyFallbackPreview(message: WhatsAppConversationMessage) {
  if (message.replyTo) {
    return conversationMessageQuotePreview({
      ...message,
      text: message.replyTo.text,
      type: message.replyTo.type,
      mediaFileName: message.replyTo.mediaFileName,
    });
  }

  return message.replyToProviderMessageId ? 'Mensagem' : '';
}

function conversationReplyAuthorLabel(
  message: NonNullable<WhatsAppConversationMessage['replyTo']>,
) {
  return message.direction === 'OUTBOUND' ? 'Você' : 'Contato';
}

function isConversationScrollNearBottom(element: HTMLDivElement | null) {
  if (!element) return true;
  if (!isConversationScrollable(element)) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

function isConversationScrollable(element: HTMLDivElement) {
  return element.scrollHeight > element.clientHeight + 2;
}

function scheduleConversationScroll(action: () => void) {
  window.requestAnimationFrame(() => {
    action();
    window.requestAnimationFrame(action);
  });
}

function scheduleComposerFocus(action: () => void) {
  window.queueMicrotask(() => {
    window.requestAnimationFrame(action);
  });
}

function scrollConversationContainerToBottom(element: HTMLDivElement | null) {
  if (!element) return;
  if (!isConversationScrollable(element)) return;
  element.scrollTop = element.scrollHeight;
}

function conversationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && /conex|connection|network|fetch/i.test(error.message)) {
    return 'Conexão indisponível. Tente novamente em instantes.';
  }
  if (error instanceof Error && /404|não encontr|not found/i.test(error.message)) {
    return 'Conversa inexistente ou não disponível.';
  }
  return fallback;
}

function searchMessageErrorMessage(error?: unknown) {
  if (error instanceof Error && /429|too many|muitas buscas|rate limit/i.test(error.message)) {
    return 'Muitas buscas em sequência. Aguarde alguns segundos.';
  }
  return 'Não foi possível buscar mensagens';
}

function conversationRetryErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const payload =
      error.payload && typeof error.payload === 'object'
        ? (error.payload as { code?: unknown; message?: unknown })
        : null;
    const code = typeof payload?.code === 'string' ? payload.code : null;

    if (code === 'WHATSAPP_RETRY_MEDIA_FILE_MISSING') {
      return 'Arquivo não disponível para reenviar.';
    }

    if (code === 'WHATSAPP_RETRY_MEDIA_UNAVAILABLE') {
      return 'Arquivo não disponível. Selecione novamente.';
    }

    if (code === 'WHATSAPP_RETRY_VOICE_RE_RECORD_REQUIRED') {
      return 'Gravação indisponível. Grave novamente.';
    }

    if (error.status === 409) {
      return 'Conexão indisponível ou mensagem já em nova tentativa.';
    }

    if (error.status === 503) {
      return 'Provider indisponível. Tente novamente em instantes.';
    }
  }

  return conversationErrorMessage(error, 'Falha ao reenviar mensagem.');
}

function linkClientErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    const payload =
      error.payload && typeof error.payload === 'object'
        ? (error.payload as { code?: unknown })
        : null;

    if (payload?.code === 'CONVERSATION_ALREADY_LINKED') {
      return 'Esta conversa já está vinculada a outro cliente.';
    }

    return 'Outra operação vinculou esta conversa antes. Atualize e tente novamente.';
  }

  if (error instanceof ApiError && error.status === 404) {
    return 'Conversa ou cliente inexistente.';
  }

  if (error instanceof Error && /conex|connection|network|fetch/i.test(error.message)) {
    return 'Conexão indisponível. Tente novamente em instantes.';
  }

  return 'Falha ao vincular cliente.';
}

function startConversationErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    const payload =
      error.payload && typeof error.payload === 'object'
        ? (error.payload as { code?: unknown })
        : null;

    if (payload?.code === 'CONVERSATION_ALREADY_LINKED') {
      return 'Já existe conversa para este telefone vinculada a outro cliente.';
    }

    return 'Não foi possível iniciar a conversa com estes dados.';
  }

  if (error instanceof ApiError && error.status === 400) {
    return 'Revise telefone, cliente e mensagem antes de enviar.';
  }

  if (error instanceof ApiError && error.status === 404) {
    return 'Cliente, conversa ou instância WhatsApp não encontrada.';
  }

  if (error instanceof Error && /conex|connection|network|fetch/i.test(error.message)) {
    return 'Conexão indisponível. Tente novamente em instantes.';
  }

  return 'Falha ao iniciar conversa.';
}
