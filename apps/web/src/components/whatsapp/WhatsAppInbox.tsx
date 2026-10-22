'use client';

import {
  default as React,
  Fragment,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronDown,
  CircleCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileAudio,
  FileText,
  FileVideo,
  Forward as ForwardIcon,
  Image as ImageIcon,
  Info,
  Loader2,
  MessagesSquare,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  QrCode,
  RefreshCw,
  Reply,
  Search,
  Send,
  SmilePlus,
  Square,
  Tags,
  Trash2,
  Upload,
  User,
  UserCheck,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { ClientForm } from '../clients/client-form';
import { FinanceClientAutocomplete } from '../clients/finance-client-autocomplete';
import { ActionMenu, Button, IconButton, type ActionMenuItem } from '../ui/primitives';
import {
  formatWaitingDuration,
  getHumanWaitingSeconds,
  getWaitingPriority,
  useWaitingClock,
  waitingPriorityLabels,
} from '../../lib/attendance-waiting';
import {
  ConversationMessageSearch,
  ConversationSearch,
  renderHighlightedSearchText,
} from './WhatsAppSearch';
import { WhatsAppImageLightbox } from './WhatsAppImageLightbox';
import { WhatsAppImageAnnotationEditor } from './WhatsAppImageAnnotationEditor';
import {
  ApiError,
  createClient,
  createWhatsAppConversationLabel,
  confirmReferenceRenewal,
  createReferenceReactivation,
  deleteWhatsAppSavedSticker,
  deleteWhatsAppConversationMessage,
  editWhatsAppConversationMessage,
  forwardWhatsAppConversationMessage,
  downloadWhatsAppConversationMedia,
  formatCurrency,
  formatDate,
  getClient,
  getClientPhoneCapabilities,
  getPaymentIntentPixCopy,
  listWhatsAppQuickReplies,
  listWhatsAppAutoReplies,
  getWhatsAppConversation,
  getWhatsAppConversationAvatar,
  getWhatsAppConversationMessagesAround,
  getWhatsAppSavedStickerMediaBlob,
  linkWhatsAppConversationClient,
  listClientOptions,
  listReceivables,
  listPlans,
  listWhatsAppConnections,
  listWhatsAppConversationMessages,
  listWhatsAppConversationLabels,
  listWhatsAppAttendanceCategories,
  listWhatsAppConversationAttendances,
  listWhatsAppClientAttendances,
  listWhatsAppConversations,
  markWhatsAppConversationRead,
  listWhatsAppSavedStickers,
  createReceivablePix,
  previewReceivablePixReplacement,
  replaceReceivablePix,
  resolveWhatsAppConversation,
  retryWhatsAppConversationMessage,
  searchWhatsAppConversationMessages,
  saveWhatsAppStickerMessage,
  sendPaymentIntentWhatsApp,
  sendWhatsAppSavedSticker,
  sendWhatsAppConversationMedia,
  sendWhatsAppConversationMessage,
  sendWhatsAppConversationVoice,
  setWhatsAppConversationPresence,
  setWhatsAppConversationLabels,
  startWhatsAppConversation,
  updateClient,
  updateWhatsAppConversationMessageReaction,
  updateWhatsAppAutoReply,
  type Client,
  type ClientEvent,
  type ClientReference,
  type ClientOption,
  type ClientPayload,
  type PaymentIntent,
  type PaymentIntentPixCopyResult,
  type Plan,
  type Receivable,
  type Renewal,
  type WhatsAppConnection,
  type WhatsAppAutoReplyConfig,
  type WhatsAppConversationAvatar,
  type WhatsAppConversation,
  type WhatsAppConversationLabel,
  type WhatsAppConversationLabelAdmin,
  type WhatsAppConversationLabelColor,
  type WhatsAppConversationMessage,
  type WhatsAppSavedSticker,
  type WhatsAppSharedContact,
  type WhatsAppConversationMessageStatus,
  type WhatsAppConversationMessageType,
  type WhatsAppConversationMessagesCursor,
  type WhatsAppMessageSearchResult,
  type WhatsAppConversationStatus,
  type WhatsAppConversationSummary,
  type WhatsAppAttendance,
  type WhatsAppAttendanceCategory,
  type WhatsAppQuickReply,
  type WhatsAppRealtimeEvent,
} from '../../lib/crm-api';
import {
  ReferenceReactivationModal,
  ReferenceRenewalModal,
  type ReferenceLifecycleTarget,
} from '../clients/reference-lifecycle-modals';
import { normalizeWhatsAppDisplayPhone } from '../../lib/whatsapp-actions';
import { formatNormalizedBrazilPhone } from '../clients/client-referral-select';
import { conversationPresenceLabel, useWhatsAppRealtime } from './WhatsAppRealtimeProvider';
import {
  applyWhatsAppSlashQuickReply,
  filterWhatsAppQuickReplies,
  whatsAppQuickReplySlashQuery,
  whatsAppQuickReplyPreview,
} from './whatsapp-quick-replies';

type ConversationFilter = 'all' | 'unread' | 'followup' | 'clients' | 'guests';
type AttendanceFilter = 'ACTIVE' | 'PENDING' | 'IN_PROGRESS' | 'ALL';
type ContactDrawerTab = 'summary' | 'attendances' | 'financial';
type StartConversationRecipientType = 'client' | 'guest';
type SharedContactActionResult = { feedback?: string } | void;
type SharedContactAction = (
  contact: WhatsAppSharedContact,
  phone: string,
  isCurrent: () => boolean,
) => Promise<SharedContactActionResult>;
type SharedContactConversationLookup = {
  ambiguous: boolean;
  conversation: WhatsAppConversation | null;
};
type StartConversationSeed = {
  phone: string;
  whatsAppConnectionId: string;
} | null;
export type ConversationComposerMedia = {
  file: File;
  kind: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO' | 'STICKER';
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

type ConversationOpenClientOptions = {
  origin?: {
    contactPanelOpen?: boolean;
    conversationId: string;
    kind: 'whatsapp';
  };
  receivable?: Receivable;
  tab?: 'overview' | 'references' | 'receivables' | 'messages' | 'timeline' | 'more';
};

type ConversationRestoreRequest = {
  contactPanelOpen?: boolean;
  conversationId: string | null;
  sequence: number;
  view: 'conversations';
};

type ConversationLocationContext = {
  contactPanelOpen?: boolean;
  conversationId: string;
};

const conversationsPageSize = 20;
const conversationsRefreshPageSizeLimit = 100;
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
const videoConversationMediaMaxBytes = 50 * 1024 * 1024;
const conversationMediaMaxBytes = defaultConversationMediaMaxBytes;
const conversationVideoMaxBytes = videoConversationMediaMaxBytes;
const conversationVoiceMaxSeconds = 60;
const allowedConversationImageMimeTypes = new Set(['image/jpeg', 'image/png']);
const allowedConversationStickerMimeTypes = new Set(['image/webp']);
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
export type SavedStickerPreviewKind = 'image' | 'video' | 'unsupported';
const genericConversationFileMimeTypes = new Set(['', 'application/octet-stream']);
const preferredConversationVoiceMimeType = 'audio/webm;codecs=opus';
const fallbackConversationVoiceMimeType = 'audio/webm';
export const allowedWhatsAppReactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const reactionPickerViewportGap = 12;
const reactionPickerOffset = 8;
const reactionPickerDefaultSize = { width: 284, height: 52 };
const quickReplyMenuViewportGap = 10;
const quickReplyMenuComposerGap = 8;
const quickReplyMenuMobileMaxHeight = 280;
const quickReplyMenuMobileMinHeight = 112;
const conversationPresencePauseDelayMs = 3000;
const sharedContactLookupCacheTtlMs = 30_000;

type ConversationPresenceKind = 'text' | 'audio';
type ConversationPresenceState = 'paused' | `composing:${ConversationPresenceKind}`;
type ConversationAvatarState = {
  loading: boolean;
  response: WhatsAppConversationAvatar | null;
  failedUrl: string | null;
};
type ConversationAvatarPreview = {
  conversationId: string;
  name: string;
  url: string;
};
type ConversationContactInfoState = {
  conversationId: string | null;
  loading: boolean;
  error: string;
  client: Client | null;
  receivables: Receivable[];
  pixIntent: PaymentIntent | null;
  notice: string;
};
export type ContactFinancialSummaryState = 'CURRENT' | 'PENDING' | 'OVERDUE';
export type ContactFinancialSummary = {
  activeReferenceCount: number;
  lastPayment: { amount: string; paidAt: string } | null;
  nextDueDate: string | null;
  oldestOverdueDays: number | null;
  openAmount: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  state: ContactFinancialSummaryState;
};
export type ContactPixState = 'NO_PIX' | 'ACTIVE_PIX' | 'EXPIRED_PIX';
export type ContactPixReplacementPayload = {
  provider: PaymentIntent['provider'];
  expectedCurrentIntentId: string;
  reason: string;
  idempotencyKey: string;
};
export type ContactRecentActivityType =
  'PAYMENT' | 'RECEIVABLE_CREATED' | 'RECEIVABLE_OVERDUE' | 'RENEWAL' | 'REACTIVATION';
export type ContactRecentActivityItem = {
  id: string;
  type: ContactRecentActivityType;
  occurredAt: string;
  title: string;
  subtitle?: string;
  amount?: string;
  referenceId?: string | null;
  receivableId?: string | null;
};

export function nextConversationPresenceState(
  current: ConversationPresenceState | undefined,
  next: ConversationPresenceState,
) {
  if (current === undefined && next === 'paused') return null;
  return current === next ? null : next;
}

const conversationFilters = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'followup', label: 'Aguardando retorno' },
  { id: 'clients', label: 'Clientes' },
  { id: 'guests', label: 'Avulsos' },
] satisfies Array<{ id: ConversationFilter; label: string }>;
const attendanceFilters = [
  { id: 'ACTIVE', label: 'Atendimentos' },
  { id: 'PENDING', label: 'Pendentes' },
  { id: 'IN_PROGRESS', label: 'Em andamento' },
  { id: 'ALL', label: 'Todas' },
] satisfies Array<{ id: AttendanceFilter; label: string }>;
const contactDrawerTabs = [
  { id: 'summary', label: 'Resumo' },
  { id: 'attendances', label: 'Atendimentos' },
  { id: 'financial', label: 'Financeiro' },
] satisfies Array<{ id: ContactDrawerTab; label: string }>;
const avatarClientCacheTtlMs = 55 * 60 * 1000;
const avatarClientConcurrency = 4;

export type ConversationPixCopyOutcomeStatus =
  'copy_error' | 'expired' | 'fetch_error' | 'success' | 'unavailable';

export type ConversationPixCopyButtonStatus = ConversationPixCopyOutcomeStatus | 'idle' | 'loading';

export type ConversationPixCopyState = {
  status: ConversationPixCopyButtonStatus;
};

export type ConversationPixCopyOutcome = {
  status: ConversationPixCopyOutcomeStatus;
};

export type ConversationPixCopyCache = Map<string, PaymentIntentPixCopyResult>;
export type ConversationPixCopyInFlight = Map<string, Promise<ConversationPixCopyOutcome>>;

export async function resolveConversationPixCopyAction({
  cache,
  fetchPixCopy,
  inFlight,
  paymentIntentId,
  writeText,
}: {
  cache: ConversationPixCopyCache;
  fetchPixCopy: (paymentIntentId: string) => Promise<PaymentIntentPixCopyResult>;
  inFlight: ConversationPixCopyInFlight;
  paymentIntentId: string;
  writeText: (value: string) => Promise<void>;
}): Promise<ConversationPixCopyOutcome> {
  const existing = inFlight.get(paymentIntentId);

  if (existing) {
    return existing;
  }

  const request = (async () => {
    let result = cache.get(paymentIntentId);

    if (!result) {
      try {
        result = await fetchPixCopy(paymentIntentId);
        cache.set(paymentIntentId, result);
      } catch {
        return { status: 'fetch_error' as const };
      }
    }

    if (result.isExpired) {
      return { status: 'expired' as const };
    }

    if (!result.available || !result.pixCopyPaste) {
      return { status: 'unavailable' as const };
    }

    try {
      await writeText(result.pixCopyPaste);
      return { status: 'success' as const };
    } catch {
      return { status: 'copy_error' as const };
    }
  })().finally(() => {
    inFlight.delete(paymentIntentId);
  });

  inFlight.set(paymentIntentId, request);
  return request;
}

export function isConversationPixCopyEligible(message: WhatsAppConversationMessage) {
  return Boolean(message.pixContext?.paymentIntentId);
}

export function savedStickerPreviewKind(mimeType: string): SavedStickerPreviewKind {
  const normalized = savedStickerPreviewMimeType(mimeType);

  if (normalized === 'image/webp') return 'image';
  if (normalized === 'video/mp4') return 'video';

  return 'unsupported';
}

export function savedStickerPreviewMimeType(mimeType: string) {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';

  if (normalized === 'image/webp' || normalized === 'video/mp4') return normalized;

  return null;
}

export function conversationPixCopyButtonLabel(
  buttonLabel: string | null | undefined,
  state?: ConversationPixCopyState,
) {
  if (state?.status === 'loading') return 'Copiando...';
  if (state?.status === 'success') return 'PIX copiado';
  if (state?.status === 'expired') return 'PIX expirado';
  if (state?.status === 'unavailable') return 'PIX indisponível';
  if (state?.status === 'fetch_error') return 'Não foi possível carregar o PIX';
  if (state?.status === 'copy_error') return 'Não foi possível copiar o PIX';
  return buttonLabel?.trim() || 'Copiar Chave PIX';
}

export function stopConversationPixCopyEvent(
  event: Pick<ReactMouseEvent<HTMLButtonElement>, 'preventDefault' | 'stopPropagation'>,
) {
  event.preventDefault();
  event.stopPropagation();
}

export function sharedContactBrazilPhoneCandidates(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (!digits || trimmed.startsWith('00')) return [];
  if (trimmed.startsWith('+') && !digits.startsWith('55')) return [];

  const withCountryCode = digits.startsWith('55') ? digits : `55${digits}`;
  if (!/^55\d{10,11}$/.test(withCountryCode)) return [];

  const candidates = new Set([withCountryCode]);
  const subscriber = withCountryCode.slice(4);

  if (/^[6-9]\d{7}$/.test(subscriber)) {
    candidates.add(`${withCountryCode.slice(0, 4)}9${subscriber}`);
  } else if (/^9[6-9]\d{7}$/.test(subscriber)) {
    candidates.add(`${withCountryCode.slice(0, 4)}${subscriber.slice(1)}`);
  }

  return [...candidates];
}

export function findExactSharedContactConversation(
  conversations: WhatsAppConversation[],
  whatsAppConnectionId: string,
  phoneCandidates: string[],
) {
  const candidates = new Set(phoneCandidates);
  const matches = conversations.filter(
    (conversation) =>
      conversation.whatsAppConnectionId === whatsAppConnectionId &&
      candidates.has(phoneDigits(conversation.phoneNormalized)),
  );
  const uniqueMatches = [
    ...new Map(matches.map((conversation) => [conversation.id, conversation])).values(),
  ];
  return uniqueMatches.length === 1 ? (uniqueMatches[0] ?? null) : null;
}

export function hasAmbiguousSharedContactConversation(
  conversations: WhatsAppConversation[],
  whatsAppConnectionId: string,
  phoneCandidates: string[],
) {
  const candidates = new Set(phoneCandidates);
  return (
    new Set(
      conversations
        .filter(
          (conversation) =>
            conversation.whatsAppConnectionId === whatsAppConnectionId &&
            candidates.has(phoneDigits(conversation.phoneNormalized)),
        )
        .map((conversation) => conversation.id),
    ).size > 1
  );
}

export function findExactSharedContactClient(clients: ClientOption[], phoneCandidates: string[]) {
  const candidates = new Set(phoneCandidates);
  const exactMatches = clients.filter((client) =>
    candidates.has(phoneDigits(client.phoneNormalized)),
  );
  return exactMatches.length === 1 ? (exactMatches[0] ?? null) : null;
}

export function shouldApplySharedContactActionResult(
  sourceConversationId: string,
  currentConversationId: string | null | undefined,
  cardIsCurrent: boolean,
) {
  return cardIsCurrent && sourceConversationId === currentConversationId;
}

export function WhatsAppInbox({
  onBackToConversationList,
  onBackToDashboard,
  onConversationLocationChange,
  onOpenAutoReplySettings,
  onOpenClient,
  onRestoreRequestConsumed,
  onSummaryChange,
  onSummaryRefreshRequest,
  restoreRequest,
}: {
  onBackToConversationList: () => void;
  onBackToDashboard: () => void;
  onConversationLocationChange: (context: ConversationLocationContext) => void;
  onOpenAutoReplySettings: () => void;
  onOpenClient: (clientId: string, options?: ConversationOpenClientOptions) => Promise<void>;
  onRestoreRequestConsumed?: (sequence: number) => void;
  onSummaryChange: (summary: WhatsAppConversationSummary | null) => void;
  onSummaryRefreshRequest: () => Promise<WhatsAppConversationSummary | null>;
  restoreRequest?: ConversationRestoreRequest | null;
}) {
  const waitingClockNow = useWaitingClock();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [summary, setSummary] = useState<WhatsAppConversationSummary | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<WhatsAppConversationMessage[]>([]);
  const [whatsAppConnections, setWhatsAppConnections] = useState<WhatsAppConnection[]>([]);
  const [autoReplyConfigs, setAutoReplyConfigs] = useState<WhatsAppAutoReplyConfig[]>([]);
  const [autoReplyError, setAutoReplyError] = useState('');
  const [autoReplyDisabling, setAutoReplyDisabling] = useState(false);
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReply[]>([]);
  const [quickRepliesLoading, setQuickRepliesLoading] = useState(true);
  const [quickRepliesError, setQuickRepliesError] = useState('');
  const [savedStickers, setSavedStickers] = useState<WhatsAppSavedSticker[]>([]);
  const [savedStickersLoaded, setSavedStickersLoaded] = useState(false);
  const [savedStickersLoading, setSavedStickersLoading] = useState(false);
  const [savedStickersError, setSavedStickersError] = useState('');
  const [savedStickersNotice, setSavedStickersNotice] = useState('');
  const [savingStickerMessageIds, setSavingStickerMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [saveStickerFeedback, setSaveStickerFeedback] = useState<Record<string, string>>({});
  const [deletingSavedStickerIds, setDeletingSavedStickerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [deleteSavedStickerConfirmId, setDeleteSavedStickerConfirmId] = useState<string | null>(
    null,
  );
  const [contactPanelOpen, setContactPanelOpen] = useState(false);
  const [contactInfo, setContactInfo] = useState<ConversationContactInfoState>({
    conversationId: null,
    loading: false,
    error: '',
    client: null,
    receivables: [],
    pixIntent: null,
    notice: '',
  });
  const [contactPixReceivableId, setContactPixReceivableId] = useState<string | null>(null);
  const [contactPixWhatsAppIntentIds, setContactPixWhatsAppIntentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [contactLifecyclePlans, setContactLifecyclePlans] = useState<Plan[]>([]);
  const [contactLifecyclePlansLoading, setContactLifecyclePlansLoading] = useState(false);
  const [contactRenewalTarget, setContactRenewalTarget] = useState<ReferenceLifecycleTarget | null>(
    null,
  );
  const [contactReactivationTarget, setContactReactivationTarget] =
    useState<ReferenceLifecycleTarget | null>(null);
  const [contactLifecycleBusyReferenceId, setContactLifecycleBusyReferenceId] = useState<
    string | null
  >(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('ACTIVE');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<WhatsAppConversationStatus | ''>('');
  const [labelFilter, setLabelFilter] = useState('');
  const [conversationLabels, setConversationLabels] = useState<WhatsAppConversationLabelAdmin[]>(
    [],
  );
  const [labelManagerOpen, setLabelManagerOpen] = useState(false);
  const [labelManagerSaving, setLabelManagerSaving] = useState(false);
  const [labelManagerError, setLabelManagerError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [internationalManualTextSendEnabled, setInternationalManualTextSendEnabled] =
    useState(false);
  const [selectedMedia, setSelectedMedia] = useState<ConversationComposerMedia | null>(null);
  const [pendingImageAnnotation, setPendingImageAnnotation] = useState<File | null>(null);
  const [dropOverlayVisible, setDropOverlayVisible] = useState(false);
  const [replyTarget, setReplyTarget] = useState<WhatsAppConversationMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveAttendanceOpen, setResolveAttendanceOpen] = useState(false);
  const [attendanceCategories, setAttendanceCategories] = useState<WhatsAppAttendanceCategory[]>(
    [],
  );
  const [attendanceCategoriesLoading, setAttendanceCategoriesLoading] = useState(false);
  const [attendanceCategoriesError, setAttendanceCategoriesError] = useState('');
  const [resolveAttendanceError, setResolveAttendanceError] = useState('');
  const [attendanceHistory, setAttendanceHistory] = useState<WhatsAppAttendance[]>([]);
  const [attendanceHistoryLoading, setAttendanceHistoryLoading] = useState(false);
  const [attendanceHistoryError, setAttendanceHistoryError] = useState('');
  const [attendanceHistoryPage, setAttendanceHistoryPage] = useState(1);
  const [attendanceHistoryHasMore, setAttendanceHistoryHasMore] = useState(false);
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
  const [reactionErrors, setReactionErrors] = useState<Record<string, string>>({});
  const [reactingMessageIds, setReactingMessageIds] = useState<Set<string>>(new Set());
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [deletingMessageIds, setDeletingMessageIds] = useState<Set<string>>(new Set());
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEditMessageId, setSavingEditMessageId] = useState<string | null>(null);
  const [forwardMessage, setForwardMessage] = useState<WhatsAppConversationMessage | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [forwardError, setForwardError] = useState('');
  const [linkClientError, setLinkClientError] = useState('');
  const [guestClientCreateError, setGuestClientCreateError] = useState('');
  const [guestClientDuplicate, setGuestClientDuplicate] = useState<ClientOption | null>(null);
  const [guestClientCreatedUnlinked, setGuestClientCreatedUnlinked] = useState<ClientOption | null>(
    null,
  );
  const [mobileMode, setMobileMode] = useState<'list' | 'chat'>('list');
  const [startConversationOpen, setStartConversationOpen] = useState(false);
  const [startConversationSeed, setStartConversationSeed] = useState<StartConversationSeed>(null);
  const [startingConversation, setStartingConversation] = useState(false);
  const [startConversationError, setStartConversationError] = useState('');
  const [guestClientCreateConversation, setGuestClientCreateConversation] =
    useState<WhatsAppConversation | null>(null);
  const [guestClientCreatePlans, setGuestClientCreatePlans] = useState<Plan[]>([]);
  const [guestClientCreatePlansLoading, setGuestClientCreatePlansLoading] = useState(false);
  const [newMessageNotice, setNewMessageNotice] = useState(false);
  const {
    conversationPresence,
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
  const [conversationAvatars, setConversationAvatars] = useState<
    Record<string, ConversationAvatarState>
  >({});
  const [avatarPreview, setAvatarPreview] = useState<ConversationAvatarPreview | null>(null);
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
  const reactingMessagesRef = useRef(new Set<string>());
  const deletingMessagesRef = useRef(new Set<string>());
  const editingMessageRef = useRef<string | null>(null);
  const forwardingRef = useRef(false);
  const startingConversationRef = useRef(false);
  const sharedContactConversationLookupsRef = useRef(
    new Map<string, Promise<SharedContactConversationLookup>>(),
  );
  const sharedContactClientLookupsRef = useRef(new Map<string, Promise<ClientOption | null>>());
  const sharedContactConversationCacheRef = useRef(
    new Map<string, { expiresAt: number; value: SharedContactConversationLookup }>(),
  );
  const sharedContactClientCacheRef = useRef(
    new Map<string, { expiresAt: number; value: ClientOption | null }>(),
  );
  const contactPixWhatsAppIntentIdsRef = useRef(new Set<string>());
  const realtimeListRefreshTimeoutRef = useRef<number | null>(null);
  const realtimeListReplaceRef = useRef(false);
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
  const avatarCacheRef = useRef(
    new Map<string, { response: WhatsAppConversationAvatar; expiresAt: number }>(),
  );
  const avatarInFlightRef = useRef(new Map<string, Promise<WhatsAppConversationAvatar>>());
  const avatarMountedRef = useRef(true);
  const messageSearchRequestKeyRef = useRef('');
  const messageSearchResultsRef = useRef<WhatsAppMessageSearchResult[]>([]);
  const messageSearchIndexRef = useRef(0);
  const chatDropDepthRef = useRef(0);
  const presenceStatesRef = useRef<Record<string, ConversationPresenceState>>({});
  const presencePauseTimeoutsRef = useRef<Record<string, number>>({});

  const selectedDraft = selectedConversation ? (drafts[selectedConversation.id] ?? '') : '';
  const selectedConversationIsInternational =
    isInternationalWhatsAppConversation(selectedConversation);
  const internationalComposerBlocked =
    selectedConversationIsInternational && !internationalManualTextSendEnabled;
  const internationalTextOnly =
    selectedConversationIsInternational && internationalManualTextSendEnabled;

  useEffect(() => {
    let canceled = false;
    void getClientPhoneCapabilities()
      .then((capabilities) => {
        if (!canceled) {
          setInternationalManualTextSendEnabled(
            capabilities.internationalManualTextSendEnabled === true,
          );
        }
      })
      .catch(() => {
        if (!canceled) setInternationalManualTextSendEnabled(false);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    async function loadQuickReplies() {
      setQuickRepliesLoading(true);
      setQuickRepliesError('');

      try {
        const replies = await listWhatsAppQuickReplies();
        if (canceled) return;
        setQuickReplies(replies);
      } catch (err) {
        if (canceled) return;
        setQuickReplies([]);
        setQuickRepliesError(
          err instanceof Error ? err.message : 'Não foi possível carregar respostas rápidas.',
        );
      } finally {
        if (!canceled) {
          setQuickRepliesLoading(false);
        }
      }
    }

    void loadQuickReplies();

    return () => {
      canceled = true;
    };
  }, []);

  const loadSavedStickers = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (savedStickersLoading || (savedStickersLoaded && !force)) return;

      setSavedStickersLoading(true);
      setSavedStickersError('');
      setSavedStickersNotice('');

      try {
        const stickers = await listWhatsAppSavedStickers();
        setSavedStickers(stickers);
        setSavedStickersLoaded(true);
      } catch (err) {
        setSavedStickersError(
          err instanceof Error ? err.message : 'Não foi possível carregar figurinhas salvas.',
        );
      } finally {
        setSavedStickersLoading(false);
      }
    },
    [savedStickersLoaded, savedStickersLoading],
  );

  const fetchConversationAvatar = useCallback((conversationId: string) => {
    const cached = avatarCacheRef.current.get(conversationId);
    const nowMs = Date.now();

    if (cached && cached.expiresAt > nowMs) {
      if (avatarMountedRef.current) {
        setConversationAvatars((current) => ({
          ...current,
          [conversationId]: {
            loading: false,
            response: cached.response,
            failedUrl:
              current[conversationId]?.failedUrl === cached.response.url
                ? (current[conversationId]?.failedUrl ?? null)
                : null,
          },
        }));
      }
      return Promise.resolve(cached.response);
    }

    if (cached) {
      avatarCacheRef.current.delete(conversationId);
    }

    const existing = avatarInFlightRef.current.get(conversationId);
    if (existing) {
      return existing;
    }

    if (avatarMountedRef.current) {
      setConversationAvatars((current) => ({
        ...current,
        [conversationId]: {
          loading: true,
          response: current[conversationId]?.response ?? null,
          failedUrl: current[conversationId]?.failedUrl ?? null,
        },
      }));
    }

    const request = getWhatsAppConversationAvatar(conversationId)
      .catch(() => ({ available: false, url: null }))
      .then((response) => {
        avatarCacheRef.current.set(conversationId, {
          response,
          expiresAt: Date.now() + avatarClientCacheTtlMs,
        });
        if (avatarMountedRef.current) {
          setConversationAvatars((current) => ({
            ...current,
            [conversationId]: {
              loading: false,
              response,
              failedUrl:
                current[conversationId]?.failedUrl === response.url
                  ? (current[conversationId]?.failedUrl ?? null)
                  : null,
            },
          }));
        }
        return response;
      })
      .finally(() => {
        avatarInFlightRef.current.delete(conversationId);
      });

    avatarInFlightRef.current.set(conversationId, request);
    return request;
  }, []);

  const handleAvatarImageError = useCallback((conversationId: string, url: string) => {
    if (!avatarMountedRef.current) return;
    setConversationAvatars((current) => ({
      ...current,
      [conversationId]: {
        loading: false,
        response: current[conversationId]?.response ?? { available: false, url: null },
        failedUrl: url,
      },
    }));
  }, []);

  const openAvatarPreview = useCallback((conversation: WhatsAppConversation, url: string) => {
    setAvatarPreview({ conversationId: conversation.id, name: conversation.displayName, url });
  }, []);

  const closeAvatarPreview = useCallback(() => {
    setAvatarPreview(null);
  }, []);

  const handleAvatarPreviewImageError = useCallback(() => {
    if (!avatarPreview) return;
    handleAvatarImageError(avatarPreview.conversationId, avatarPreview.url);
    setAvatarPreview(null);
  }, [avatarPreview, handleAvatarImageError]);

  useEffect(() => {
    avatarMountedRef.current = true;

    return () => {
      avatarMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    const ids = Array.from(
      new Set([
        ...conversations.map((conversation) => conversation.id),
        ...(selectedConversation ? [selectedConversation.id] : []),
      ]),
    );
    let cancelled = false;
    let cursor = 0;

    async function loadNext(): Promise<void> {
      if (cancelled) return;
      const conversationId = ids[cursor];
      cursor += 1;
      if (!conversationId) return;
      await fetchConversationAvatar(conversationId);
      return loadNext();
    }

    const workers = Array.from({ length: Math.min(avatarClientConcurrency, ids.length) }, () =>
      loadNext(),
    );
    void Promise.all(workers);

    return () => {
      cancelled = true;
    };
  }, [conversations, fetchConversationAvatar, selectedConversation]);

  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  useEffect(() => {
    chatDropDepthRef.current = 0;
    setDropOverlayVisible(false);
    setPendingImageAnnotation(null);
    setSelectedMedia((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }, [selectedConversation?.id]);

  const sendConversationPresence = useCallback(
    async (
      conversationId: string,
      state: 'composing' | 'paused',
      media?: 'audio',
      { force = false }: { force?: boolean } = {},
    ) => {
      const nextState: ConversationPresenceState =
        state === 'paused' ? 'paused' : media === 'audio' ? 'composing:audio' : 'composing:text';
      const transition = force
        ? nextState
        : nextConversationPresenceState(presenceStatesRef.current[conversationId], nextState);

      if (!transition) return;

      presenceStatesRef.current[conversationId] = transition;

      try {
        await setWhatsAppConversationPresence(conversationId, {
          state,
          ...(state === 'composing' && media ? { media } : {}),
        });
      } catch {
        // Presence is best effort; composer and message send must keep working.
      }
    },
    [],
  );

  const clearPresencePauseTimer = useCallback((conversationId: string) => {
    const timeoutId = presencePauseTimeoutsRef.current[conversationId];
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      delete presencePauseTimeoutsRef.current[conversationId];
    }
  }, []);

  const pauseConversationPresence = useCallback(
    (conversationId: string, options: { force?: boolean } = {}) => {
      clearPresencePauseTimer(conversationId);
      void sendConversationPresence(conversationId, 'paused', undefined, options);
    },
    [clearPresencePauseTimer, sendConversationPresence],
  );

  const scheduleTextPresencePause = useCallback(
    (conversationId: string) => {
      clearPresencePauseTimer(conversationId);
      presencePauseTimeoutsRef.current[conversationId] = window.setTimeout(() => {
        delete presencePauseTimeoutsRef.current[conversationId];
        void sendConversationPresence(conversationId, 'paused');
      }, conversationPresencePauseDelayMs);
    },
    [clearPresencePauseTimer, sendConversationPresence],
  );

  const noteTextComposerActivity = useCallback(
    (conversationId: string, value: string) => {
      if (!value.trim()) {
        pauseConversationPresence(conversationId);
        return;
      }

      void sendConversationPresence(conversationId, 'composing');
      scheduleTextPresencePause(conversationId);
    },
    [pauseConversationPresence, scheduleTextPresencePause, sendConversationPresence],
  );

  const noteAudioRecordingPresence = useCallback(
    (conversationId: string, recording: boolean) => {
      if (recording) {
        clearPresencePauseTimer(conversationId);
        void sendConversationPresence(conversationId, 'composing', 'audio');
        return;
      }

      pauseConversationPresence(conversationId);
    },
    [clearPresencePauseTimer, pauseConversationPresence, sendConversationPresence],
  );

  useEffect(() => {
    const previousConversation = selectedConversationRef.current;
    return () => {
      const conversationId = previousConversation?.id;
      if (conversationId) {
        pauseConversationPresence(conversationId);
      }
    };
  }, [pauseConversationPresence, selectedConversation?.id]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && selectedConversationRef.current?.id) {
        pauseConversationPresence(selectedConversationRef.current.id);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
      Object.keys(presencePauseTimeoutsRef.current).forEach(clearPresencePauseTimer);
      if (selectedConversationRef.current?.id) {
        pauseConversationPresence(selectedConversationRef.current.id);
      }
    };
  }, [clearPresencePauseTimer, pauseConversationPresence]);

  const loadConversations = useCallback(
    async ({
      append = false,
      page = firstConversationPage,
      preserveLoaded = false,
      silent = false,
    }: { append?: boolean; page?: number; preserveLoaded?: boolean; silent?: boolean } = {}) => {
      const requestQueryKey = JSON.stringify({
        attendanceFilter,
        filter,
        labelFilter,
        search,
        statusFilter,
      });
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
        const refreshPageCount = Math.max(
          firstConversationPage,
          Math.ceil(conversationsRef.current.length / conversationsPageSize),
        );
        const requestPage = preserveLoaded ? firstConversationPage : page;
        const requestPageSize = preserveLoaded
          ? Math.min(conversationsRefreshPageSizeLimit, refreshPageCount * conversationsPageSize)
          : conversationsPageSize;
        const filters: Parameters<typeof listWhatsAppConversations>[0] = {
          attendanceStatus: attendanceFilter,
          page: requestPage,
          pageSize: requestPageSize,
        };
        if (search) filters.search = search;
        if (statusFilter) filters.status = statusFilter;
        if (filter === 'unread') filters.unreadOnly = true;
        if (filter === 'followup') filters.needsManualFollowUp = true;
        if (filter === 'clients') filters.hasClient = true;
        if (filter === 'guests') filters.hasClient = false;
        if (labelFilter) filters.labelId = labelFilter;

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
          if (append) {
            return mergeConversationLists(current, payload.items);
          }
          return payload.items;
        });
        const loadedPage = preserveLoaded
          ? Math.max(firstConversationPage, Math.ceil(payload.items.length / conversationsPageSize))
          : page;
        setConversationPage(loadedPage);
        setHasMoreConversations(
          payload.pagination.hasMore ?? requestPage < payload.pagination.totalPages,
        );
        setSummary(payload.summary);
        onSummaryChange(payload.summary);
        setSelectedConversation((current) => {
          if (!current) return null;
          return payload.items.find((item) => item.id === current.id) ?? current;
        });
      } catch (err) {
        if (labelFilter && err instanceof ApiError && err.status === 404) {
          setLabelFilter('');
          setListError('');
          return;
        }
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
    [attendanceFilter, filter, labelFilter, onSummaryChange, search, statusFilter],
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
      const connections = await listWhatsAppConnections();
      setWhatsAppConnections(connections);
      return connections;
    } catch {
      setWhatsAppConnections([]);
      return [];
    }
  }, []);

  const loadAutoReplyConfigs = useCallback(async () => {
    try {
      setAutoReplyConfigs(await listWhatsAppAutoReplies());
      setAutoReplyError('');
    } catch {
      setAutoReplyError('Não foi possível atualizar o status da resposta automática.');
    }
  }, []);

  useEffect(() => {
    void loadAutoReplyConfigs();
  }, [loadAutoReplyConfigs]);

  const loadConversationLabels = useCallback(async () => {
    try {
      const groups = await Promise.all(
        autoReplyConfigs.map((config) =>
          listWhatsAppConversationLabels(config.whatsAppConnectionId),
        ),
      );
      setConversationLabels(groups.flat());
    } catch {
      setConversationLabels([]);
    }
  }, [autoReplyConfigs]);

  useEffect(() => {
    void loadConversationLabels();
  }, [loadConversationLabels]);

  async function saveSelectedConversationLabels(labelIds: string[]) {
    if (!selectedConversation || labelManagerSaving) return;
    setLabelManagerSaving(true);
    setLabelManagerError('');
    try {
      const updated = await setWhatsAppConversationLabels(selectedConversation.id, labelIds);
      setSelectedConversation(updated);
      setConversations((current) => mergeConversationById(current, updated));
      setLabelManagerOpen(false);
    } catch (error) {
      setLabelManagerError(conversationErrorMessage(error, 'Não foi possível salvar etiquetas.'));
    } finally {
      setLabelManagerSaving(false);
    }
  }

  async function createLabelFromConversation(input: {
    name: string;
    color: WhatsAppConversationLabelColor;
  }) {
    if (!selectedConversation) return null;
    const created = await createWhatsAppConversationLabel(
      selectedConversation.whatsAppConnectionId,
      input,
    );
    setConversationLabels((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return created;
  }

  async function disableAutoReply(config: WhatsAppAutoReplyConfig) {
    if (autoReplyDisabling) return;
    setAutoReplyDisabling(true);
    setAutoReplyError('');

    try {
      const updated = await updateWhatsAppAutoReply(config.whatsAppConnectionId, {
        enabled: false,
        mode: config.mode,
        message: config.message,
        cooldownMinutes: config.cooldownMinutes,
        audience: config.audience,
        startsAt: config.startsAt,
        endsAt: config.endsAt,
      });
      setAutoReplyConfigs((current) =>
        current.map((item) =>
          item.whatsAppConnectionId === updated.whatsAppConnectionId ? updated : item,
        ),
      );
    } catch {
      setAutoReplyError('Não foi possível desativar a resposta automática.');
    } finally {
      setAutoReplyDisabling(false);
    }
  }

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
    const request = restoreRequest;
    if (!request) return undefined;

    if (!request.conversationId) {
      activeConversationIdRef.current = null;
      openMessageSearchGenerationRef.current += 1;
      resetMessageSearch();
      setSelectedConversation(null);
      setMessages([]);
      messagesRef.current = [];
      setContactPanelOpen(false);
      setMobileMode('list');
      onRestoreRequestConsumed?.(request.sequence);
      return undefined;
    }

    let active = true;
    const restoreConversationId = request.conversationId;
    const restoreContactPanelOpen = Boolean(request.contactPanelOpen);
    const restoreSequence = request.sequence;

    async function restoreConversation() {
      const existingConversation =
        conversations.find((conversation) => conversation.id === restoreConversationId) ?? null;

      try {
        const conversation =
          existingConversation ?? (await getWhatsAppConversation(restoreConversationId));
        if (!active) return;

        setConversations((current) => mergeConversationById(current, conversation));
        await selectConversation(conversation, {
          openContactPanel: restoreContactPanelOpen,
        });
        if (active) onRestoreRequestConsumed?.(restoreSequence);
      } catch (err) {
        if (active) {
          setMessagesError(conversationErrorMessage(err, 'Falha ao restaurar conversa.'));
        }
      }
    }

    void restoreConversation();

    return () => {
      active = false;
    };
  }, [onRestoreRequestConsumed, restoreRequest?.sequence]);

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

  const loadContactInfo = useCallback(
    async (
      conversation: WhatsAppConversation | null = selectedConversationRef.current,
      options: { silent?: boolean; preserveNotice?: boolean } = {},
    ) => {
      if (!conversation) return;

      if (!conversation.client?.id) {
        setContactInfo((current) => ({
          ...current,
          conversationId: conversation.id,
          loading: false,
          error: '',
          client: null,
          receivables: [],
          pixIntent: options.preserveNotice ? current.pixIntent : null,
          notice: options.preserveNotice ? current.notice : '',
        }));
        return;
      }

      if (!options.silent) {
        setContactInfo((current) => ({
          ...current,
          conversationId: conversation.id,
          loading: true,
          error: '',
          client: current.conversationId === conversation.id ? current.client : null,
          receivables: current.conversationId === conversation.id ? current.receivables : [],
          pixIntent: options.preserveNotice ? current.pixIntent : null,
          notice: options.preserveNotice ? current.notice : '',
        }));
      }

      try {
        const client = await getClient(conversation.client.id);
        if (activeConversationIdRef.current !== conversation.id) return;

        const receivables = await listContactReceivables(client.id);
        if (activeConversationIdRef.current !== conversation.id) return;

        setContactInfo((current) => ({
          conversationId: conversation.id,
          loading: false,
          error: '',
          client,
          receivables,
          pixIntent:
            options.preserveNotice && current.conversationId === conversation.id
              ? current.pixIntent
              : null,
          notice:
            options.preserveNotice && current.conversationId === conversation.id
              ? current.notice
              : '',
        }));
      } catch (err) {
        if (activeConversationIdRef.current !== conversation.id) return;
        setContactInfo((current) => ({
          ...current,
          conversationId: conversation.id,
          loading: false,
          error: conversationErrorMessage(err, 'Falha ao carregar informações do contato.'),
        }));
      }
    },
    [],
  );

  useEffect(() => {
    if (!contactPanelOpen) return;
    void loadContactInfo(selectedConversation);
  }, [contactPanelOpen, loadContactInfo, selectedConversation?.id]);

  useEffect(() => {
    if (!contactPanelOpen || !selectedConversation) {
      setAttendanceHistory([]);
      setAttendanceHistoryError('');
      return;
    }

    let active = true;
    setAttendanceHistoryLoading(true);
    setAttendanceHistoryError('');
    const request = selectedConversation.client?.id
      ? listWhatsAppClientAttendances(selectedConversation.client.id, { limit: 5 })
      : listWhatsAppConversationAttendances(selectedConversation.id, { limit: 5 });
    void request
      .then((response) => {
        if (active) {
          setAttendanceHistory(response.items);
          setAttendanceHistoryPage(1);
          setAttendanceHistoryHasMore(response.pagination.hasMore);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAttendanceHistoryError(
            conversationErrorMessage(error, 'Falha ao carregar atendimentos.'),
          );
        }
      })
      .finally(() => {
        if (active) setAttendanceHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [contactPanelOpen, selectedConversation?.client?.id, selectedConversation?.id]);

  async function loadMoreAttendanceHistory() {
    if (!selectedConversation || attendanceHistoryLoading || !attendanceHistoryHasMore) return;
    const nextPage = attendanceHistoryPage + 1;
    setAttendanceHistoryLoading(true);
    setAttendanceHistoryError('');
    try {
      const response = selectedConversation.client?.id
        ? await listWhatsAppClientAttendances(selectedConversation.client.id, {
            page: nextPage,
            limit: 5,
          })
        : await listWhatsAppConversationAttendances(selectedConversation.id, {
            page: nextPage,
            limit: 5,
          });
      setAttendanceHistory((current) => [...current, ...response.items]);
      setAttendanceHistoryPage(nextPage);
      setAttendanceHistoryHasMore(response.pagination.hasMore);
    } catch (error) {
      setAttendanceHistoryError(conversationErrorMessage(error, 'Falha ao carregar atendimentos.'));
    } finally {
      setAttendanceHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!contactPanelOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setContactPanelOpen(false);
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [contactPanelOpen]);

  const scheduleRealtimeListRefresh = useCallback(
    (replace = false) => {
      realtimeListReplaceRef.current = realtimeListReplaceRef.current || replace;
      if (realtimeListRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeListRefreshTimeoutRef.current);
      }

      realtimeListRefreshTimeoutRef.current = window.setTimeout(() => {
        realtimeListRefreshTimeoutRef.current = null;
        const shouldReplace = realtimeListReplaceRef.current;
        realtimeListReplaceRef.current = false;
        void loadConversations({ preserveLoaded: !shouldReplace, silent: true });
      }, 150);
    },
    [loadConversations],
  );

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

      if (event.type === 'conversation.presence') {
        return;
      }

      if (event.type === 'conversation.updated') {
        scheduleRealtimeListRefresh(true);
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
    if (!selectedConversation?.id) return;

    onConversationLocationChange({
      contactPanelOpen,
      conversationId: selectedConversation.id,
    });
  }, [contactPanelOpen, onConversationLocationChange, selectedConversation?.id]);

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
    const mobileInboxQuery = window.matchMedia('(max-width: 620px)');
    const previousMobileInboxState = root.getAttribute('data-mobile-conversation-inbox');

    const updateMobileInboxDocumentState = () => {
      if (mobileInboxQuery.matches) {
        root.setAttribute('data-mobile-conversation-inbox', 'open');
      } else if (previousMobileInboxState === null) {
        root.removeAttribute('data-mobile-conversation-inbox');
      } else {
        root.setAttribute('data-mobile-conversation-inbox', previousMobileInboxState);
      }
    };

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

    updateMobileInboxDocumentState();
    updateChatViewportHeight();
    mobileInboxQuery.addEventListener('change', updateMobileInboxDocumentState);
    visualViewport?.addEventListener('resize', updateChatViewportHeight);
    window.addEventListener('resize', updateChatViewportHeight);

    return () => {
      mobileInboxQuery.removeEventListener('change', updateMobileInboxDocumentState);
      visualViewport?.removeEventListener('resize', updateChatViewportHeight);
      window.removeEventListener('resize', updateChatViewportHeight);
      root.style.removeProperty('--chat-viewport-height');
      if (previousMobileInboxState === null) {
        root.removeAttribute('data-mobile-conversation-inbox');
      } else {
        root.setAttribute('data-mobile-conversation-inbox', previousMobileInboxState);
      }
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

    const validation = classifyConversationIncomingFile(file, { expectedKind });
    if (!validation.ok) {
      setSendError(validation.error);
      return false;
    }

    if (expectedKind && validation.kind !== expectedKind) {
      setSendError('Tipo de arquivo não suportado para esta opção de anexo.');
      return false;
    }

    if (validation.kind === 'IMAGE') {
      setPendingImageAnnotation(file);
      setSendError(notice);
      return true;
    }

    const keepsStickerReply = replyTarget && validation.kind === 'STICKER';
    const replyNotice =
      replyTarget && !keepsStickerReply
        ? 'Anexo selecionado como nova mensagem; respostas com mídia ainda não estão disponíveis.'
        : '';
    if (replyTarget && !keepsStickerReply) {
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

  async function selectConversation(
    conversation: WhatsAppConversation,
    options: { openContactPanel?: boolean } = {},
  ) {
    openMessageSearchGenerationRef.current += 1;
    resetMessageSearch();
    activeConversationIdRef.current = conversation.id;
    pendingInitialScrollConversationRef.current = conversation.id;
    setSelectedConversation(conversation);
    setMessages([]);
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
    editingMessageRef.current = null;
    setEditingMessageId(null);
    setEditBody('');
    setEditError('');
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

      if (options.openContactPanel) {
        setContactPanelOpen(true);
        void loadContactInfo(detail);
      } else if (contactPanelOpen) {
        void loadContactInfo(detail);
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
            needsManualFollowUp: false,
            lastAutoReplyAt: null,
            labels: [],
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
      if (contactPanelOpen) void loadContactInfo(detail);
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

  async function saveStickerMessage(message: WhatsAppConversationMessage) {
    if (message.type !== 'STICKER' || savingStickerMessageIds.has(message.id)) return;

    setSavingStickerMessageIds((current) => new Set(current).add(message.id));
    setSaveStickerFeedback((current) => ({ ...current, [message.id]: 'Salvando...' }));
    setSavedStickersNotice('');

    try {
      const result = await saveWhatsAppStickerMessage(message.id);
      setSavedStickers((current) => {
        const withoutDuplicate = current.filter((sticker) => sticker.id !== result.sticker.id);
        return [result.sticker, ...withoutDuplicate];
      });
      setSavedStickersLoaded(true);
      setSaveStickerFeedback((current) => ({
        ...current,
        [message.id]: result.alreadyExisted ? 'Figurinha já estava salva.' : 'Figurinha salva.',
      }));
    } catch (err) {
      setSaveStickerFeedback((current) => ({
        ...current,
        [message.id]: conversationErrorMessage(err, 'Falha ao salvar figurinha.'),
      }));
    } finally {
      setSavingStickerMessageIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
    }
  }

  async function sendSavedStickerFromLibrary(sticker: WhatsAppSavedSticker) {
    if (!selectedConversation || sending || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setSendError('');
    pauseConversationPresence(selectedConversation.id);

    try {
      const message = await sendWhatsAppSavedSticker(selectedConversation.id, sticker.id, {
        requestId: createConversationRequestId(),
        ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
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
      setReplyTarget(null);
      await loadConversations({ preserveLoaded: true, silent: true });
    } catch (err) {
      setSendError(conversationErrorMessage(err, 'Falha ao enviar figurinha salva.'));
    } finally {
      pendingComposerFocusRef.current = true;
      setComposerFocusRequest((current) => current + 1);
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function deleteSavedStickerFromLibrary(sticker: WhatsAppSavedSticker) {
    if (deletingSavedStickerIds.has(sticker.id)) return;

    setDeletingSavedStickerIds((current) => new Set(current).add(sticker.id));
    setSavedStickersError('');
    setSavedStickersNotice('');

    try {
      await deleteWhatsAppSavedSticker(sticker.id);
      setSavedStickers((current) => current.filter((item) => item.id !== sticker.id));
      setDeleteSavedStickerConfirmId(null);
      setSavedStickersNotice('Figurinha excluída.');
    } catch (err) {
      setSavedStickersError(
        err instanceof Error ? err.message : 'Não foi possível excluir a figurinha.',
      );
    } finally {
      setDeletingSavedStickerIds((current) => {
        const next = new Set(current);
        next.delete(sticker.id);
        return next;
      });
    }
  }

  async function sendCurrentMessage(
    bodyOverride?: string,
    {
      focusComposer = true,
      replyToOverride = null,
      mediaOverride = null,
      mediaCaptionOverride,
      ignoreReply = false,
    }: {
      focusComposer?: boolean;
      replyToOverride?: WhatsAppConversationMessage | null;
      mediaOverride?: ConversationComposerMedia | null;
      mediaCaptionOverride?: string;
      ignoreReply?: boolean;
    } = {},
  ) {
    if (!selectedConversation || sending || sendingRef.current) return false;

    const hasMediaCaptionOverride = mediaCaptionOverride !== undefined;
    const body = (mediaCaptionOverride ?? bodyOverride ?? selectedDraft).trim();
    const mediaToSend = hasMediaCaptionOverride
      ? mediaOverride
      : bodyOverride
        ? null
        : (mediaOverride ?? selectedMedia);
    const replyToSend = ignoreReply ? null : bodyOverride ? replyToOverride : replyTarget;
    if (selectedConversationIsInternational) {
      if (!internationalManualTextSendEnabled) {
        setSendError('O envio internacional ainda não está habilitado para esta conversa.');
        return false;
      }
      if (mediaToSend || replyToSend || bodyOverride !== undefined) {
        setSendError('Conversas internacionais permitem somente texto manual simples nesta etapa.');
        return false;
      }
    }
    if (!body && !mediaToSend) return false;
    if (replyToSend && mediaToSend && mediaToSend.kind !== 'STICKER') {
      setSendError('Resposta com anexo ainda não está disponível. Envie uma resposta em texto.');
      return false;
    }

    sendingRef.current = true;
    setSending(true);
    setSendError('');
    pauseConversationPresence(selectedConversation.id);
    if (bodyOverride === undefined && !hasMediaCaptionOverride && !mediaToSend) {
      setDrafts((current) =>
        (current[selectedConversation.id] ?? '').trim() === body
          ? { ...current, [selectedConversation.id]: '' }
          : current,
      );
    }
    let sent = false;
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
            ...(replyToSend && mediaToSend.kind === 'STICKER'
              ? { replyToMessageId: replyToSend.id }
              : {}),
            ...(mediaToSend.kind === 'STICKER' ? { mediaKind: 'STICKER' as const } : {}),
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
      if (bodyOverride === undefined && !hasMediaCaptionOverride) {
        setDrafts((current) =>
          (current[selectedConversation.id] ?? '').trim() === body
            ? { ...current, [selectedConversation.id]: '' }
            : current,
        );
        setReplyTarget(null);
      }
      sent = true;
      await loadConversations({ preserveLoaded: true, silent: true });
    } catch (err) {
      setSendError(conversationErrorMessage(err, 'Falha ao enviar mensagem.'));
      const failedAt = new Date().toISOString();
      const failedMessage: WhatsAppConversationMessage = {
        id: `local-failed-${failedAt}`,
        createdAt: failedAt,
        deleted: false,
        deletedAt: null,
        deletedForEveryone: false,
        direction: 'OUTBOUND',
        deliveredAt: null,
        editedAt: null,
        failedAt,
        isFromMe: true,
        isAutoReply: false,
        mediaDurationSeconds: null,
        mediaAvailable: false,
        mediaFileName: mediaToSend?.file.name ?? null,
        mediaMimeType: mediaToSend?.file.type ?? null,
        mediaSizeBytes: mediaToSend?.file.size ?? null,
        contacts: [],
        retryAction: mediaToSend ? 'SELECT_FILE_AGAIN' : 'RETRY',
        messageDispatchId: null,
        providerMessageId: null,
        quotedText: replyToSend ? conversationMessageQuotePreview(replyToSend) : null,
        readAt: null,
        reactions: [],
        replyTo: replyToSend
          ? {
              id: replyToSend.id,
              direction: replyToSend.direction,
              type: replyToSend.type,
              text: replyToSend.text,
              mediaFileName: replyToSend.mediaFileName,
              deleted: replyToSend.deleted,
              deletedAt: replyToSend.deletedAt,
              deletedForEveryone: replyToSend.deletedForEveryone,
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
    return sent;
  }

  function cancelImageAnnotation() {
    setPendingImageAnnotation(null);
    scheduleComposerFocus(() => composerRef.current?.focus());
  }

  async function sendAnnotatedImage(file: File, caption: string) {
    const validation = classifyConversationIncomingFile(file, { expectedKind: 'IMAGE' });
    if (!validation.ok) return validation.error;

    const sent = await sendCurrentMessage(undefined, {
      focusComposer: false,
      mediaOverride: { file, kind: 'IMAGE', previewUrl: null },
      mediaCaptionOverride: caption,
      ignoreReply: true,
    });
    if (!sent) return 'Não foi possível enviar a imagem. Tente novamente.';

    setPendingImageAnnotation(null);
    scheduleComposerFocus(() => composerRef.current?.focus());
    return null;
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
    pauseConversationPresence(selectedConversation.id);

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

  async function resolveSelectedConversation(
    payload: {
      categoryId?: string;
      resolutionNote?: string;
    } = {},
  ) {
    if (!selectedConversation || resolving || selectedConversation.status === 'RESOLVED') return;

    setResolving(true);
    setMessagesError('');
    setResolveAttendanceError('');

    try {
      const resolved = await resolveWhatsAppConversation(selectedConversation.id, payload);
      setSelectedConversation(resolved);
      setConversations((current) =>
        current.map((item) => (item.id === resolved.id ? { ...item, ...resolved } : item)),
      );
      setResolveAttendanceOpen(false);
      setResolveAttendanceError('');
      if (contactPanelOpen) {
        const history = resolved.client?.id
          ? await listWhatsAppClientAttendances(resolved.client.id, { limit: 5 })
          : await listWhatsAppConversationAttendances(resolved.id, { limit: 5 });
        setAttendanceHistory(history.items);
        setAttendanceHistoryPage(1);
        setAttendanceHistoryHasMore(history.pagination.hasMore);
      }
    } catch (err) {
      const error = conversationErrorMessage(err, 'Falha ao resolver conversa.');
      setResolveAttendanceError(error);
      setMessagesError(error);
    } finally {
      setResolving(false);
    }
  }

  async function requestResolveSelectedConversation() {
    if (!selectedConversation?.activeAttendance) {
      await resolveSelectedConversation();
      return;
    }

    setResolveAttendanceOpen(true);
    setAttendanceCategoriesLoading(true);
    setAttendanceCategories([]);
    setAttendanceCategoriesError('');
    setResolveAttendanceError('');
    setMessagesError('');
    try {
      const categories = await listWhatsAppAttendanceCategories(
        selectedConversation.whatsAppConnectionId,
        true,
      );
      setAttendanceCategories(categories);
    } catch (err) {
      const error = conversationErrorMessage(err, 'Falha ao carregar categorias.');
      setAttendanceCategoriesError(error);
      setMessagesError(error);
    } finally {
      setAttendanceCategoriesLoading(false);
    }
  }

  async function linkSelectedConversationToClient(clientOption: ClientOption) {
    if (!selectedConversation || linkingClient) return;

    setLinkingClient(true);
    setLinkClientError('');

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
        if (contactPanelOpen) void loadContactInfo(linked);
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
      if (contactPanelOpen) void loadContactInfo(linked);
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

  async function generateContactReceivablePix(receivable: Receivable) {
    if (contactPixReceivableId) return;

    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    setContactPixReceivableId(receivable.id);
    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      const intent = await createReceivablePix(receivable.id);
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        pixIntent: intent,
        notice:
          intent.status === 'WAITING_PAYMENT'
            ? 'PIX disponível para esta cobrança.'
            : 'PIX registrado para esta cobrança.',
      }));
      await loadContactInfo(selectedConversationRef.current, {
        silent: true,
        preserveNotice: true,
      });
    } catch (err) {
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        error: conversationErrorMessage(err, 'Não foi possível gerar o PIX.'),
      }));
    } finally {
      setContactPixReceivableId(null);
    }
  }

  async function recreateContactReceivablePix(
    receivable: Receivable,
    currentIntent: PaymentIntent,
  ) {
    if (contactPixReceivableId) return;

    const replacementPayload = contactPixReplacementPayload(receivable, currentIntent);
    if (!replacementPayload) return;

    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    setContactPixReceivableId(receivable.id);
    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      const preview = await previewReceivablePixReplacement(receivable.id, {
        provider: currentIntent.provider,
      });
      if (selectedConversationRef.current?.id !== conversationId) return;
      if (preview.currentIntent?.id !== currentIntent.id) {
        throw new Error('PIX atual mudou. Recarregue as informações do contato antes de recriar.');
      }
      if (!preview.replaceable) {
        throw new Error(
          preview.blockers.map((blocker) => blocker.message).join(' ') ||
            'Este PIX não pode ser recriado agora.',
        );
      }
      const confirmed = window.confirm(`${preview.warning}\n\nConfirmar novo PIX?`);
      if (!confirmed) return;
      if (selectedConversationRef.current?.id !== conversationId) return;

      const intent = await replaceReceivablePix(receivable.id, replacementPayload);
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        pixIntent: intent,
        notice: 'PIX recriado com sucesso',
      }));
      await loadContactInfo(selectedConversationRef.current, {
        silent: true,
        preserveNotice: true,
      });
    } catch (err) {
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        error: conversationErrorMessage(err, 'Não foi possível recriar o PIX.'),
      }));
    } finally {
      setContactPixReceivableId(null);
    }
  }

  async function copyContactPix(intent: PaymentIntent) {
    if (!intent.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(intent.pixCopyPaste);
      setContactInfo((current) => ({ ...current, notice: 'PIX copiado.' }));
    } catch {
      setContactInfo((current) => ({
        ...current,
        error: 'Não foi possível copiar o PIX. Copie o código manualmente.',
      }));
    }
  }

  async function sendContactPixWhatsApp(receivable: Receivable, intent: PaymentIntent) {
    if (
      contactPixWhatsAppIntentIdsRef.current.has(intent.id) ||
      !contactPixCanSendWhatsApp(receivable, intent)
    ) {
      return;
    }

    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    contactPixWhatsAppIntentIdsRef.current.add(intent.id);
    setContactPixWhatsAppIntentIds(new Set(contactPixWhatsAppIntentIdsRef.current));
    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      const result = await sendPaymentIntentWhatsApp(intent.id);
      if (selectedConversationRef.current?.id !== conversationId) return;
      if (!result.success) {
        throw new Error(result.errorMessage ?? 'Não foi possível enviar o PIX pelo WhatsApp.');
      }

      setContactInfo((current) => ({
        ...current,
        notice:
          result.reused || result.idempotent
            ? 'PIX já estava enviado pelo WhatsApp.'
            : 'PIX enviado pelo WhatsApp.',
      }));
    } catch (err) {
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        error: conversationErrorMessage(err, 'Não foi possível enviar o PIX pelo WhatsApp.'),
      }));
    } finally {
      contactPixWhatsAppIntentIdsRef.current.delete(intent.id);
      setContactPixWhatsAppIntentIds(new Set(contactPixWhatsAppIntentIdsRef.current));
    }
  }

  async function saveContactInternalNotes(clientId: string, notes: string) {
    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      const updatedClient = await updateClient(clientId, { notes: notes.trim() });
      if (selectedConversationRef.current?.id !== conversationId) return;

      setContactInfo((current) => ({
        ...current,
        client:
          current.client?.id === updatedClient.id
            ? {
                ...current.client,
                notes: updatedClient.notes,
                updatedAt: updatedClient.updatedAt,
              }
            : current.client,
        notice: 'Nota salva.',
      }));
      await loadContactInfo(selectedConversationRef.current, {
        silent: true,
        preserveNotice: true,
      });
    } catch (err) {
      if (selectedConversationRef.current?.id === conversationId) {
        setContactInfo((current) => ({
          ...current,
          error: conversationErrorMessage(err, 'Não foi possível salvar a nota interna.'),
        }));
      }
      throw err;
    }
  }

  async function ensureContactLifecyclePlans() {
    if (contactLifecyclePlans.length) return contactLifecyclePlans;

    setContactLifecyclePlansLoading(true);
    try {
      const plans = await listPlans();
      setContactLifecyclePlans(plans);
      return plans;
    } finally {
      setContactLifecyclePlansLoading(false);
    }
  }

  async function openContactRenewal(reference: ClientReference) {
    const client = contactInfo.client;
    if (!client || reference.status !== 'ATIVO') return;

    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    setContactLifecycleBusyReferenceId(reference.id);
    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      await ensureContactLifecyclePlans();
      if (selectedConversationRef.current?.id !== conversationId) return;
      setContactRenewalTarget({ client, reference });
    } catch (err) {
      if (selectedConversationRef.current?.id !== conversationId) return;
      setContactInfo((current) => ({
        ...current,
        error: conversationErrorMessage(err, 'Não foi possível abrir a renovação.'),
      }));
    } finally {
      setContactLifecycleBusyReferenceId(null);
    }
  }

  async function openContactReactivation(reference: ClientReference) {
    const client = contactInfo.client;
    if (!client || reference.status !== 'CANCELADO') return;

    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    setContactLifecycleBusyReferenceId(reference.id);
    setContactInfo((current) => ({ ...current, error: '', notice: '' }));

    try {
      await ensureContactLifecyclePlans();
      if (selectedConversationRef.current?.id !== conversationId) return;
      setContactReactivationTarget({ client, reference });
    } catch (err) {
      if (selectedConversationRef.current?.id !== conversationId) return;
      setContactInfo((current) => ({
        ...current,
        error: conversationErrorMessage(err, 'Não foi possível abrir a reativação.'),
      }));
    } finally {
      setContactLifecycleBusyReferenceId(null);
    }
  }

  async function confirmContactRenewal(
    target: ReferenceLifecycleTarget,
    payload: { planId: string; amount: number; idempotencyKey: string },
  ) {
    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    const result = await confirmReferenceRenewal(target.reference.id, payload);
    if (selectedConversationRef.current?.id !== conversationId) return;

    setContactRenewalTarget(null);
    setContactInfo((current) => ({
      ...current,
      notice: `Referência ${target.reference.reference} renovada. Novo vencimento: ${formatDate(result.newDueDate)}.`,
      error: '',
    }));
    await loadContactInfo(selectedConversationRef.current, { silent: true, preserveNotice: true });
  }

  async function confirmContactReactivation(
    target: ReferenceLifecycleTarget,
    payload: { planId: string; amount: number; activationDate: string; idempotencyKey: string },
  ) {
    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;

    const result = await createReferenceReactivation(target.reference.id, payload);
    if (selectedConversationRef.current?.id !== conversationId) return;

    setContactReactivationTarget(null);
    setContactInfo((current) => ({
      ...current,
      notice: `Reativação de ${target.reference.reference} criada e aguardando pagamento. A referência continua CANCELADA.`,
      error: '',
      pixIntent:
        result.receivable.activePix ?? result.receivable.paymentIntents?.[0] ?? current.pixIntent,
    }));
    await loadContactInfo(selectedConversationRef.current, { silent: true, preserveNotice: true });
  }

  async function openContactReceivable(clientId: string, receivable: Receivable) {
    const conversationId = selectedConversationRef.current?.id;

    await onOpenClient(clientId, {
      ...(conversationId
        ? {
            origin: {
              contactPanelOpen,
              conversationId,
              kind: 'whatsapp' as const,
            },
          }
        : {}),
      tab: 'receivables',
      receivable,
    });
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

  async function updateConversationReaction(message: WhatsAppConversationMessage, emoji: string) {
    if (!selectedConversation) return;
    if (message.deleted) return;
    if (reactingMessagesRef.current.has(message.id)) return;

    const nextEmoji = nextOwnReactionEmoji(message, emoji);

    reactingMessagesRef.current.add(message.id);
    setReactingMessageIds(new Set(reactingMessagesRef.current));
    setReactionErrors((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });

    try {
      const updated = await updateWhatsAppConversationMessageReaction(
        selectedConversation.id,
        message.id,
        nextEmoji,
      );
      setMessages((current) => mergeConversationMessages(current, [updated]));
      setReactionPickerMessageId(null);
    } catch (err) {
      setReactionErrors((current) => ({
        ...current,
        [message.id]: conversationErrorMessage(err, 'Falha ao atualizar reação.'),
      }));
    } finally {
      reactingMessagesRef.current.delete(message.id);
      setReactingMessageIds(new Set(reactingMessagesRef.current));
    }
  }

  async function deleteConversationMessage(message: WhatsAppConversationMessage) {
    if (!selectedConversation) return;
    if (!isDeleteEligibleConversationMessage(message)) return;
    if (deletingMessagesRef.current.has(message.id)) return;

    deletingMessagesRef.current.add(message.id);
    setDeletingMessageIds(new Set(deletingMessagesRef.current));
    setDeleteErrors((current) => {
      const next = { ...current };
      delete next[message.id];
      return next;
    });

    try {
      const updated = await deleteWhatsAppConversationMessage(selectedConversation.id, message.id);
      setMessages((current) => mergeConversationMessages(current, [updated]));
      setDeleteConfirmMessageId(null);
      setReactionPickerMessageId((current) => (current === message.id ? null : current));
      if (replyTarget?.id === message.id) {
        setReplyTarget(updated);
      }
    } catch (err) {
      setDeleteErrors((current) => ({
        ...current,
        [message.id]: conversationErrorMessage(
          err,
          'Não foi possível apagar esta mensagem no WhatsApp.',
        ),
      }));
    } finally {
      deletingMessagesRef.current.delete(message.id);
      setDeletingMessageIds(new Set(deletingMessagesRef.current));
    }
  }

  function startEditingConversationMessage(message: WhatsAppConversationMessage) {
    if (!isEditEligibleConversationMessage(message) || savingEditMessageId) return;
    editingMessageRef.current = message.id;
    setEditingMessageId(message.id);
    setEditBody(message.text ?? '');
    setEditError('');
    setDeleteConfirmMessageId(null);
    setReactionPickerMessageId(null);
  }

  function cancelEditingConversationMessage() {
    if (savingEditMessageId) return;
    editingMessageRef.current = null;
    setEditingMessageId(null);
    setEditBody('');
    setEditError('');
  }

  async function saveEditedConversationMessage(message: WhatsAppConversationMessage) {
    if (!selectedConversation || editingMessageRef.current !== message.id || savingEditMessageId) {
      return;
    }

    const body = editBody.trim();
    if (!body) {
      setEditError('Digite o novo texto da mensagem.');
      return;
    }
    if (body === message.text?.trim()) {
      setEditError('Altere o texto antes de salvar.');
      return;
    }

    const conversationId = selectedConversation.id;
    setSavingEditMessageId(message.id);
    setEditError('');

    try {
      const updated = await editWhatsAppConversationMessage(conversationId, message.id, body);
      if (activeConversationIdRef.current === conversationId) {
        setMessages((current) => mergeConversationMessages(current, [updated]));
      }
      if (editingMessageRef.current === message.id) {
        editingMessageRef.current = null;
        setEditingMessageId(null);
        setEditBody('');
      }
      await loadConversations({ silent: true });
    } catch (err) {
      setEditError(conversationErrorMessage(err, 'Não foi possível editar esta mensagem.'));
    } finally {
      setSavingEditMessageId(null);
    }
  }

  function openForwardMessage(message: WhatsAppConversationMessage) {
    if (!selectedConversation || !isForwardEligibleConversationMessage(message) || forwarding) {
      return;
    }

    setForwardMessage(message);
    setForwardError('');
    setDeleteConfirmMessageId(null);
    setReactionPickerMessageId(null);
  }

  function closeForwardMessage() {
    if (forwarding) return;
    setForwardMessage(null);
    setForwardError('');
  }

  async function submitForwardMessage(targetConversationId: string, requestId: string) {
    if (!selectedConversation || !forwardMessage || forwardingRef.current) return;

    forwardingRef.current = true;
    setForwarding(true);
    setForwardError('');

    try {
      const forwarded = await forwardWhatsAppConversationMessage(
        selectedConversation.id,
        forwardMessage.id,
        {
          targetConversationId,
          requestId,
        },
      );

      if (forwarded.status === 'FAILED') {
        setForwardError('Não foi possível encaminhar esta mensagem.');
        return;
      }

      setForwardMessage(null);
      await loadConversations({ silent: true });
    } catch (err) {
      setForwardError(conversationErrorMessage(err, 'Não foi possível encaminhar esta mensagem.'));
    } finally {
      forwardingRef.current = false;
      setForwarding(false);
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

  function sharedContactActionContext(phone: string) {
    const conversation = selectedConversationRef.current;
    if (!conversation) {
      return { error: 'Selecione uma conversa antes de usar este contato.' } as const;
    }

    const phoneCandidates = sharedContactBrazilPhoneCandidates(phone);
    if (!phoneCandidates.length) {
      return {
        error: 'Número incompatível com o fluxo atual, que aceita telefones brasileiros.',
      } as const;
    }

    return {
      conversation,
      phoneCandidates,
      lookupKey: `${conversation.whatsAppConnectionId}:${[...phoneCandidates].sort().join(',')}`,
    } as const;
  }

  async function findSharedContactConversation(
    currentConversation: WhatsAppConversation,
    phoneCandidates: string[],
    lookupKey: string,
  ) {
    const localMatch = findExactSharedContactConversation(
      conversationsRef.current,
      currentConversation.whatsAppConnectionId,
      phoneCandidates,
    );
    if (localMatch) return { ambiguous: false, conversation: localMatch };
    if (
      hasAmbiguousSharedContactConversation(
        conversationsRef.current,
        currentConversation.whatsAppConnectionId,
        phoneCandidates,
      )
    ) {
      return { ambiguous: true, conversation: null };
    }

    const cached = sharedContactConversationCacheRef.current.get(lookupKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    sharedContactConversationCacheRef.current.delete(lookupKey);

    const existingLookup = sharedContactConversationLookupsRef.current.get(lookupKey);
    if (existingLookup) return existingLookup;

    const lookup = Promise.all(
      phoneCandidates.map((candidate) =>
        listWhatsAppConversations({
          attendanceStatus: 'ALL',
          page: 1,
          pageSize: 20,
          search: candidate,
          whatsAppConnectionId: currentConversation.whatsAppConnectionId,
        }),
      ),
    )
      .then((pages) => {
        const conversations = pages.flatMap((page) => page.items);
        const result: SharedContactConversationLookup = {
          ambiguous: hasAmbiguousSharedContactConversation(
            conversations,
            currentConversation.whatsAppConnectionId,
            phoneCandidates,
          ),
          conversation: findExactSharedContactConversation(
            conversations,
            currentConversation.whatsAppConnectionId,
            phoneCandidates,
          ),
        };
        sharedContactConversationCacheRef.current.set(lookupKey, {
          expiresAt: Date.now() + sharedContactLookupCacheTtlMs,
          value: result,
        });
        return result;
      })
      .finally(() => sharedContactConversationLookupsRef.current.delete(lookupKey));

    sharedContactConversationLookupsRef.current.set(lookupKey, lookup);
    return lookup;
  }

  const startSharedContactConversation: SharedContactAction = async (
    _contact,
    phone,
    isCurrent,
  ) => {
    const context = sharedContactActionContext(phone);
    if ('error' in context) return { feedback: context.error };

    try {
      const lookup = await findSharedContactConversation(
        context.conversation,
        context.phoneCandidates,
        context.lookupKey,
      );
      if (
        !shouldApplySharedContactActionResult(
          context.conversation.id,
          selectedConversationRef.current?.id,
          isCurrent(),
        )
      )
        return;
      if (lookup.ambiguous) {
        return {
          feedback:
            'Há mais de uma conversa exata para as variantes deste telefone. Selecione a conversa manualmente.',
        };
      }
      if (lookup.conversation) {
        await selectConversation(lookup.conversation);
        return;
      }

      const availableConnections = await loadStartConversationConnections();
      if (
        !shouldApplySharedContactActionResult(
          context.conversation.id,
          selectedConversationRef.current?.id,
          isCurrent(),
        )
      )
        return;
      if (
        !availableConnections.some(
          (connection) => connection.id === context.conversation.whatsAppConnectionId,
        )
      ) {
        return {
          feedback: 'A conexão WhatsApp desta conversa não está disponível para iniciar um chat.',
        };
      }

      setStartConversationError('');
      setStartConversationSeed({
        phone,
        whatsAppConnectionId: context.conversation.whatsAppConnectionId,
      });
      setStartConversationOpen(true);
      return;
    } catch (err) {
      return {
        feedback: conversationErrorMessage(
          err,
          'Não foi possível localizar ou preparar a conversa.',
        ),
      };
    }
  };

  const openSharedContactClient: SharedContactAction = async (_contact, phone, isCurrent) => {
    const context = sharedContactActionContext(phone);
    if ('error' in context) return { feedback: context.error };

    const cached = sharedContactClientCacheRef.current.get(context.lookupKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (!cached.value) {
        return {
          feedback:
            'Cliente não localizado com correspondência exata. O cadastro rápido não está disponível nesta etapa.',
        };
      }
      if (
        !shouldApplySharedContactActionResult(
          context.conversation.id,
          selectedConversationRef.current?.id,
          isCurrent(),
        )
      )
        return;
      await onOpenClient(cached.value.id);
      return;
    }
    sharedContactClientCacheRef.current.delete(context.lookupKey);

    const existingLookup = sharedContactClientLookupsRef.current.get(context.lookupKey);
    const lookup =
      existingLookup ??
      Promise.all(
        context.phoneCandidates.map((candidate) => listClientOptions(candidate, { limit: 10 })),
      )
        .then((groups) => {
          const clientsById = new Map<string, ClientOption>();
          groups.flat().forEach((client) => clientsById.set(client.id, client));
          const result = findExactSharedContactClient(
            [...clientsById.values()],
            context.phoneCandidates,
          );
          sharedContactClientCacheRef.current.set(context.lookupKey, {
            expiresAt: Date.now() + sharedContactLookupCacheTtlMs,
            value: result,
          });
          return result;
        })
        .finally(() => sharedContactClientLookupsRef.current.delete(context.lookupKey));

    if (!existingLookup) sharedContactClientLookupsRef.current.set(context.lookupKey, lookup);

    try {
      const client = await lookup;
      if (
        !shouldApplySharedContactActionResult(
          context.conversation.id,
          selectedConversationRef.current?.id,
          isCurrent(),
        )
      )
        return;
      if (!client) {
        return {
          feedback:
            'Cliente não localizado com correspondência exata. O cadastro rápido não está disponível nesta etapa.',
        };
      }
      await onOpenClient(client.id);
      return;
    } catch (err) {
      return {
        feedback: conversationErrorMessage(err, 'Não foi possível consultar ou abrir o cliente.'),
      };
    }
  };

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
      setStartConversationSeed(null);
      setDrafts((current) => ({ ...current, [result.conversation.id]: '' }));
      setConversations((current) => upsertConversationList(current, result.conversation));
      setMessages([result.message]);
      activeConversationIdRef.current = result.conversation.id;
      pendingInitialScrollConversationRef.current = result.conversation.id;
      pendingSendScrollConversationRef.current = result.conversation.id;
      setSelectedConversation(result.conversation);
      setMessagesError('');
      setSendError('');
      setLinkClientError('');
      setNewMessageNotice(false);
      setMobileMode('chat');

      if (contactPanelOpen) void loadContactInfo(result.conversation);

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
      {startConversationOpen ? (
        <StartConversationModal
          connections={whatsAppConnections}
          error={startConversationError}
          initialConnectionId={startConversationSeed?.whatsAppConnectionId}
          initialPhone={startConversationSeed?.phone}
          initialRecipientType={startConversationSeed ? 'guest' : undefined}
          loading={startingConversation}
          onClose={() => {
            if (!startingConversation) {
              setStartConversationOpen(false);
              setStartConversationSeed(null);
            }
          }}
          onSubmit={(input) => void startNewConversation(input)}
        />
      ) : null}

      {forwardMessage && selectedConversation ? (
        <ForwardConversationMessageModal
          error={forwardError}
          loading={forwarding}
          message={forwardMessage}
          sourceConversation={selectedConversation}
          onClose={closeForwardMessage}
          onSubmit={(targetConversationId, requestId) =>
            void submitForwardMessage(targetConversationId, requestId)
          }
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

      {contactRenewalTarget ? (
        <ReferenceRenewalModal
          modalClassName="conversation-lifecycle-modal"
          plans={contactLifecyclePlans.filter(
            (plan) => plan.active || plan.id === contactRenewalTarget.reference.planId,
          )}
          target={contactRenewalTarget}
          onClose={() => setContactRenewalTarget(null)}
          onConfirm={(payload) => confirmContactRenewal(contactRenewalTarget, payload)}
        />
      ) : null}

      {contactReactivationTarget ? (
        <ReferenceReactivationModal
          modalClassName="conversation-lifecycle-modal"
          plans={contactLifecyclePlans.filter((plan) => plan.active)}
          target={contactReactivationTarget}
          onClose={() => setContactReactivationTarget(null)}
          onConfirm={(payload) => confirmContactReactivation(contactReactivationTarget, payload)}
        />
      ) : null}

      {avatarPreview ? (
        <WhatsAppAvatarPreview
          name={avatarPreview.name}
          url={avatarPreview.url}
          onClose={closeAvatarPreview}
          onImageError={handleAvatarPreviewImageError}
        />
      ) : null}

      {resolveAttendanceOpen && selectedConversation?.activeAttendance ? (
        <ResolveAttendanceModal
          attendance={selectedConversation.activeAttendance}
          categories={attendanceCategories}
          categoriesError={attendanceCategoriesError}
          categoriesLoading={attendanceCategoriesLoading}
          resolveError={resolveAttendanceError}
          submitting={resolving}
          onClose={() => {
            if (!resolving) setResolveAttendanceOpen(false);
          }}
          onResolve={(payload) => resolveSelectedConversation(payload)}
        />
      ) : null}

      {labelManagerOpen && selectedConversation ? (
        <ConversationLabelManager
          conversation={selectedConversation}
          error={labelManagerError}
          labels={conversationLabels.filter(
            (label) => label.whatsAppConnectionId === selectedConversation.whatsAppConnectionId,
          )}
          saving={labelManagerSaving}
          onClose={() => {
            if (!labelManagerSaving) setLabelManagerOpen(false);
          }}
          onCreate={createLabelFromConversation}
          onSave={saveSelectedConversationLabels}
        />
      ) : null}

      {autoReplyConfigs
        .filter(
          (config) =>
            config.enabled &&
            config.whatsAppConnectionId === selectedConversation?.whatsAppConnectionId,
        )
        .map((config) => (
          <div className="conversation-auto-reply-banner" key={config.whatsAppConnectionId}>
            <div>
              <strong>🟠 Resposta automática ativa · {config.connectionName}</strong>
              <span>{config.message}</span>
            </div>
            <div>
              <Button size="sm" variant="ghost" onClick={onOpenAutoReplySettings}>
                Configurar
              </Button>
              <Button
                loading={autoReplyDisabling}
                size="sm"
                variant="secondary"
                onClick={() => void disableAutoReply(config)}
              >
                Desativar
              </Button>
            </div>
          </div>
        ))}
      {autoReplyError ? (
        <div className="notice danger conversation-notice">{autoReplyError}</div>
      ) : null}

      <div className="conversations-shell">
        <ConversationList
          attendanceFilter={attendanceFilter}
          conversations={conversations}
          hasMore={hasMoreConversations}
          filter={filter}
          listError={listError}
          loadMoreError={listLoadMoreError}
          loading={listLoading}
          loadingMore={listLoadingMore}
          avatars={conversationAvatars}
          searchInput={searchInput}
          selectedId={selectedConversation?.id ?? null}
          summary={summary}
          waitingClockNow={waitingClockNow}
          statusFilter={statusFilter}
          labels={conversationLabels}
          labelFilter={labelFilter}
          onBackToDashboard={onBackToDashboard}
          onAvatarError={handleAvatarImageError}
          onAvatarPreview={openAvatarPreview}
          onAttendanceFilterChange={setAttendanceFilter}
          onFilterChange={setFilter}
          onLoadMore={() => void loadMoreConversations()}
          onSearchChange={setSearchInput}
          onSelect={(conversation) => void selectConversation(conversation)}
          onStartConversation={() => {
            setStartConversationError('');
            setStartConversationSeed(null);
            void loadStartConversationConnections();
            setStartConversationOpen(true);
          }}
          onStatusFilterChange={setStatusFilter}
          onLabelFilterChange={setLabelFilter}
        />

        <section
          className="conversation-chat-panel"
          aria-label="Chat da conversa"
          onDragEnter={
            selectedConversation && !selectedConversationIsInternational
              ? handleChatDragEnter
              : undefined
          }
          onDragLeave={
            selectedConversation && !selectedConversationIsInternational
              ? handleChatDragLeave
              : undefined
          }
          onDragOver={
            selectedConversation && !selectedConversationIsInternational
              ? handleChatDragOver
              : undefined
          }
          onDrop={
            selectedConversation && !selectedConversationIsInternational
              ? handleChatDrop
              : undefined
          }
          onPaste={
            selectedConversation && !selectedConversationIsInternational
              ? handleChatPaste
              : undefined
          }
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
                avatar={conversationAvatars[selectedConversation.id]}
                opening={opening}
                presence={conversationPresenceLabel(conversationPresence[selectedConversation.id])}
                resolving={resolving}
                waitingClockNow={waitingClockNow}
                onAvatarError={handleAvatarImageError}
                onAvatarPreview={openAvatarPreview}
                onBack={onBackToConversationList}
                onOpenClientPanel={() => setContactPanelOpen(true)}
                onResolve={() => void requestResolveSelectedConversation()}
                onToggleSearch={() => {
                  if (messageSearchOpen) {
                    resetMessageSearch();
                    return;
                  }
                  setMessageSearchOpen(true);
                  setMessageSearchError('');
                }}
                onManageLabels={() => {
                  setLabelManagerError('');
                  setLabelManagerOpen(true);
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
                outboundActionsDisabled={selectedConversationIsInternational}
                messages={messages}
                hasOlder={hasOlderMessages}
                loading={messagesLoading}
                loadingOlder={olderMessagesLoading}
                messagesEndRef={messagesEndRef}
                hasNewer={hasNewerMessages}
                olderError={olderMessagesError}
                reactionErrors={reactionErrors}
                reactionPickerMessageId={reactionPickerMessageId}
                reactingMessageIds={reactingMessageIds}
                deleteConfirmMessageId={deleteConfirmMessageId}
                deleteErrors={deleteErrors}
                deletingMessageIds={deletingMessageIds}
                editingMessageId={editingMessageId}
                editBody={editBody}
                editError={editError}
                savingEditMessageId={savingEditMessageId}
                retryErrors={retryErrors}
                retryingMessageIds={retryingMessageIds}
                saveStickerFeedback={saveStickerFeedback}
                savingStickerMessageIds={savingStickerMessageIds}
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
                onReaction={(message, emoji) => void updateConversationReaction(message, emoji)}
                onReactionPickerChange={setReactionPickerMessageId}
                onDelete={(message) => void deleteConversationMessage(message)}
                onDeleteConfirmChange={setDeleteConfirmMessageId}
                onEdit={startEditingConversationMessage}
                onEditBodyChange={setEditBody}
                onEditCancel={cancelEditingConversationMessage}
                onEditSave={(message) => void saveEditedConversationMessage(message)}
                onForward={openForwardMessage}
                onReply={selectReplyTarget}
                onRetry={(message) => void retryConversationMessage(message)}
                onSaveSticker={(message) => void saveStickerMessage(message)}
                onStartSharedContactConversation={startSharedContactConversation}
                onOpenSharedContactClient={openSharedContactClient}
              />

              <ConversationComposer
                composerRef={composerRef}
                conversationId={selectedConversation.id}
                draft={selectedDraft}
                error={sendError}
                quickReplies={quickReplies}
                quickRepliesError={quickRepliesError}
                quickRepliesLoading={quickRepliesLoading}
                savedStickers={savedStickers}
                savedStickersError={savedStickersError}
                savedStickersLoaded={savedStickersLoaded}
                savedStickersLoading={savedStickersLoading}
                savedStickersNotice={savedStickersNotice}
                deleteSavedStickerConfirmId={deleteSavedStickerConfirmId}
                deletingSavedStickerIds={deletingSavedStickerIds}
                replyTarget={replyTarget}
                selectedMedia={selectedMedia}
                sending={sending}
                blocked={internationalComposerBlocked}
                textOnly={internationalTextOnly}
                onChange={(value) => {
                  setDrafts((current) => ({
                    ...current,
                    [selectedConversation.id]: value,
                  }));
                  if (!selectedConversationIsInternational) {
                    noteTextComposerActivity(selectedConversation.id, value);
                  }
                }}
                onBlur={() => {
                  if (!selectedConversationIsInternational) {
                    pauseConversationPresence(selectedConversation.id);
                  }
                }}
                onRemoveMedia={clearComposerMedia}
                onCancelReply={() => setReplyTarget(null)}
                onSelectMedia={selectComposerMedia}
                onSend={() => void sendCurrentMessage()}
                onDeleteSavedSticker={(sticker) => void deleteSavedStickerFromLibrary(sticker)}
                onDeleteSavedStickerConfirmChange={(stickerId) => {
                  setDeleteSavedStickerConfirmId(stickerId);
                  setSavedStickersError('');
                }}
                onLoadSavedStickers={() => void loadSavedStickers()}
                onSendSavedSticker={(sticker) => void sendSavedStickerFromLibrary(sticker)}
                onSendVoice={(voice) => sendCurrentVoiceMessage(voice)}
                onVoiceRecordingChange={(recording) => {
                  if (!selectedConversationIsInternational) {
                    noteAudioRecordingPresence(selectedConversation.id, recording);
                  }
                }}
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
          attendances={attendanceHistory}
          attendancesError={attendanceHistoryError}
          attendancesHasMore={attendanceHistoryHasMore}
          attendancesLoading={attendanceHistoryLoading}
          avatar={selectedConversation ? conversationAvatars[selectedConversation.id] : undefined}
          contactInfo={contactInfo}
          pixBusyReceivableId={contactPixReceivableId}
          pixWhatsAppBusyIntentIds={contactPixWhatsAppIntentIds}
          conversation={selectedConversation}
          linkClientError={linkClientError}
          linkingClient={linkingClient}
          open={contactPanelOpen}
          waitingClockNow={waitingClockNow}
          onClose={() => setContactPanelOpen(false)}
          onLoadMoreAttendances={() => void loadMoreAttendanceHistory()}
          onCreateClient={(conversation) => void openGuestClientCreate(conversation)}
          onGeneratePix={(receivable) => void generateContactReceivablePix(receivable)}
          onRecreatePix={(receivable, intent) =>
            void recreateContactReceivablePix(receivable, intent)
          }
          onSendPixWhatsApp={(receivable, intent) =>
            void sendContactPixWhatsApp(receivable, intent)
          }
          onLinkClient={(client) => void linkSelectedConversationToClient(client)}
          onReactivateReference={(reference) => void openContactReactivation(reference)}
          onRenewReference={(reference) => void openContactRenewal(reference)}
          onSaveInternalNotes={(clientId, notes) => saveContactInternalNotes(clientId, notes)}
          onOpenClient={(clientId) => void onOpenClient(clientId)}
          onViewReceivable={(clientId, receivable) =>
            void openContactReceivable(clientId, receivable)
          }
          onCopyPix={(intent) => void copyContactPix(intent)}
          lifecycleBusyReferenceId={contactLifecycleBusyReferenceId}
          lifecyclePlansLoading={contactLifecyclePlansLoading}
        />
      </div>
      {pendingImageAnnotation ? (
        <WhatsAppImageAnnotationEditor
          key={`${pendingImageAnnotation.name}:${pendingImageAnnotation.size}:${pendingImageAnnotation.lastModified}`}
          file={pendingImageAnnotation}
          sending={sending}
          onCancel={cancelImageAnnotation}
          onSend={sendAnnotatedImage}
        />
      ) : null}
    </section>
  );
}

function ResolveAttendanceModal({
  attendance,
  categories,
  categoriesError,
  categoriesLoading,
  resolveError,
  submitting,
  onClose,
  onResolve,
}: {
  attendance: NonNullable<WhatsAppConversation['activeAttendance']>;
  categories: WhatsAppAttendanceCategory[];
  categoriesError: string;
  categoriesLoading: boolean;
  resolveError: string;
  submitting: boolean;
  onClose: () => void;
  onResolve: (payload: { categoryId: string; resolutionNote?: string }) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  const activeCategories = categories.filter((category) => category.isActive);

  useEffect(() => {
    closeRef.current = onClose;
    submittingRef.current = submitting;
  }, [onClose, submitting]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) closeRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    if (!categoriesLoading) selectRef.current?.focus();
  }, [categoriesLoading]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryId || submitting || categoriesLoading) return;
    await onResolve({ categoryId, ...(note.trim() ? { resolutionNote: note.trim() } : {}) });
  }

  return createPortal(
    <div
      className="resolve-attendance-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        aria-labelledby="resolve-attendance-title"
        aria-modal="true"
        className="resolve-attendance-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => void submit(event)}
      >
        <header>
          <div>
            <span className="metric-label">Atendimento</span>
            <h3 id="resolve-attendance-title">Resolver atendimento</h3>
          </div>
          <IconButton disabled={submitting} icon={X} label="Fechar" onClick={onClose} />
        </header>
        <div className="resolve-attendance-content">
          <div className="attendance-resolution-summary">
            <span>Aberto há: {attendanceElapsedLabel(attendance.openedAt)}</span>
            <span>
              Primeira resposta:{' '}
              {attendance.firstAgentReplyAt
                ? attendanceDurationLabel(attendance.openedAt, attendance.firstAgentReplyAt)
                : 'Ainda não respondido'}
            </span>
            <span>
              Mensagens: {attendance.inboundMessagesCount} recebidas ·{' '}
              {attendance.outboundMessagesCount} manuais
            </span>
          </div>
          {categoriesLoading ? (
            <div className="notice" role="status">
              Carregando categorias...
            </div>
          ) : null}
          {categoriesError ? (
            <div className="notice danger" role="alert">
              {categoriesError}
            </div>
          ) : null}
          {!categoriesLoading && !categoriesError && !activeCategories.length ? (
            <div className="notice warning" role="status">
              Nenhuma categoria ativa. Cadastre ou ative uma categoria em Configurações &gt;
              WhatsApp.
            </div>
          ) : null}
          <label className="field">
            <span>Categoria *</span>
            <select
              ref={selectRef}
              required
              disabled={submitting || categoriesLoading || !activeCategories.length}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Selecione</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observação</span>
            <textarea
              disabled={submitting}
              maxLength={4000}
              rows={5}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {resolveError ? (
            <div className="notice danger" role="alert">
              {resolveError}
            </div>
          ) : null}
        </div>
        <footer>
          <Button disabled={submitting} type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!categoryId || submitting || categoriesLoading || Boolean(categoriesError)}
            loading={submitting}
            type="submit"
          >
            Resolver atendimento
          </Button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

function ForwardConversationMessageModal({
  error,
  loading,
  message,
  sourceConversation,
  onClose,
  onSubmit,
}: {
  error: string;
  loading: boolean;
  message: WhatsAppConversationMessage;
  sourceConversation: WhatsAppConversation;
  onClose: () => void;
  onSubmit: (targetConversationId: string, requestId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [destinations, setDestinations] = useState<WhatsAppConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState('');
  const requestGenerationRef = useRef(0);
  const submissionRef = useRef<{ requestId: string; targetConversationId: string } | null>(null);
  const modalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) return;

      if (
        event.shiftKey &&
        (document.activeElement === first || !modalRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [loading, onClose]);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    const timer = window.setTimeout(
      () => {
        void (async () => {
          setSearchLoading(true);
          setSearchError('');

          try {
            const search = query.trim();
            const result = await listWhatsAppConversations({
              attendanceStatus: 'ALL',
              page: 1,
              pageSize: 20,
              ...(search ? { search } : {}),
              whatsAppConnectionId: sourceConversation.whatsAppConnectionId,
            });
            if (generation !== requestGenerationRef.current) return;
            setDestinations(result.items.filter((item) => item.id !== sourceConversation.id));
          } catch (err) {
            if (generation !== requestGenerationRef.current) return;
            setDestinations([]);
            setSearchError(
              conversationErrorMessage(err, 'Não foi possível carregar as conversas disponíveis.'),
            );
          } finally {
            if (generation === requestGenerationRef.current) setSearchLoading(false);
          }
        })();
      },
      query ? 250 : 0,
    );

    return () => {
      window.clearTimeout(timer);
      requestGenerationRef.current += 1;
    };
  }, [query, sourceConversation.id, sourceConversation.whatsAppConnectionId]);

  return (
    <div
      className="modal-backdrop conversation-forward-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <section
        ref={modalRef}
        aria-labelledby="conversation-forward-title"
        aria-modal="true"
        className="modal conversation-forward-modal"
        role="dialog"
      >
        <div className="conversation-forward-header">
          <div>
            <span className="eyebrow">WhatsApp</span>
            <h2 id="conversation-forward-title">Encaminhar mensagem</h2>
          </div>
          <IconButton icon={X} label="Fechar" disabled={loading} onClick={onClose} />
        </div>

        <ConversationForwardPreview conversationId={sourceConversation.id} message={message} />

        <label className="conversation-forward-search">
          <span>Buscar conversa por nome ou telefone</span>
          <div>
            <Search aria-hidden="true" size={16} />
            <input
              autoFocus
              disabled={loading}
              placeholder="Nome ou telefone"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedId(null);
                submissionRef.current = null;
              }}
            />
          </div>
        </label>

        <div className="conversation-forward-destinations" aria-live="polite">
          {searchLoading ? <span className="conversation-forward-state">Carregando...</span> : null}
          {!searchLoading && searchError ? (
            <span className="conversation-forward-state danger" role="alert">
              {searchError}
            </span>
          ) : null}
          {!searchLoading && !searchError && !destinations.length ? (
            <span className="conversation-forward-state">
              Nenhuma conversa elegível encontrada.
            </span>
          ) : null}
          {!searchLoading && !searchError
            ? destinations.map((conversation) => (
                <button
                  aria-pressed={selectedId === conversation.id}
                  className={`conversation-forward-destination ${
                    selectedId === conversation.id ? 'selected' : ''
                  }`}
                  disabled={loading}
                  key={conversation.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(conversation.id);
                    if (submissionRef.current?.targetConversationId !== conversation.id) {
                      submissionRef.current = null;
                    }
                  }}
                >
                  <span className="conversation-forward-avatar" aria-hidden="true">
                    {conversationInitials(conversation)}
                  </span>
                  <span>
                    <strong>{conversation.displayName}</strong>
                    <small>{conversation.phone}</small>
                  </span>
                  <span className="conversation-kind">
                    {conversation.client ? 'Cliente' : 'Avulso'}
                  </span>
                </button>
              ))
            : null}
        </div>

        {error ? (
          <div className="notice danger conversation-forward-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="conversation-forward-actions">
          <Button disabled={loading} variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            icon={ForwardIcon}
            loading={loading}
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return;
              const submission =
                submissionRef.current?.targetConversationId === selectedId
                  ? submissionRef.current
                  : {
                      targetConversationId: selectedId,
                      requestId: crypto.randomUUID(),
                    };
              submissionRef.current = submission;
              onSubmit(submission.targetConversationId, submission.requestId);
            }}
          >
            {loading ? 'Encaminhando...' : 'Encaminhar'}
          </Button>
        </div>
      </section>
    </div>
  );
}

function ConversationForwardPreview({
  conversationId,
  message,
}: {
  conversationId: string;
  message: WhatsAppConversationMessage;
}) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const canLoadThumbnail =
    (message.type === 'IMAGE' || message.type === 'STICKER') && message.mediaAvailable;

  useEffect(() => {
    if (!canLoadThumbnail) return undefined;
    let active = true;
    let objectUrl: string | null = null;

    void downloadWhatsAppConversationMedia(conversationId, message.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbnailUrl(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [canLoadThumbnail, conversationId, message.id]);

  const text = message.text?.trim();
  const label =
    message.type === 'VIDEO'
      ? 'Vídeo'
      : message.type === 'AUDIO'
        ? 'Áudio'
        : message.type === 'DOCUMENT'
          ? message.mediaFileName || 'Documento'
          : message.type === 'STICKER'
            ? 'Figurinha'
            : message.type === 'IMAGE'
              ? 'Imagem'
              : text || 'Mensagem';

  return (
    <div className="conversation-forward-preview">
      {thumbnailUrl ? <img alt="Prévia da mensagem" src={thumbnailUrl} /> : null}
      <span>
        <strong>{label}</strong>
        {text && message.type !== 'TEXT' ? <small>{text}</small> : null}
      </span>
    </div>
  );
}

function StartConversationModal({
  connections,
  error,
  initialConnectionId,
  initialPhone,
  initialRecipientType,
  loading,
  onClose,
  onSubmit,
}: {
  connections: WhatsAppConnection[];
  error: string;
  initialConnectionId?: string | undefined;
  initialPhone?: string | undefined;
  initialRecipientType?: StartConversationRecipientType | undefined;
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
  const [recipientType, setRecipientType] = useState<StartConversationRecipientType>(
    initialRecipientType ?? 'client',
  );
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [connectionId, setConnectionId] = useState(initialConnectionId ?? connections[0]?.id ?? '');
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

function WhatsAppAvatarPreview({
  name,
  url,
  onClose,
  onImageError,
}: {
  name: string;
  url: string;
  onClose: () => void;
  onImageError: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="whatsapp-avatar-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-label={`Foto de perfil de ${name || 'contato'}`}
        aria-modal="true"
        className="whatsapp-avatar-preview"
        role="dialog"
      >
        <IconButton
          ref={closeButtonRef}
          icon={X}
          label="Fechar foto de perfil"
          className="whatsapp-avatar-preview-close"
          onClick={onClose}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name ? `Foto de perfil de ${name}` : 'Foto de perfil'}
          draggable={false}
          src={url}
          onError={onImageError}
          onMouseDown={(event) => event.stopPropagation()}
        />
      </section>
    </div>,
    document.body,
  );
}

const conversationLabelColors: WhatsAppConversationLabelColor[] = [
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'RED',
  'PURPLE',
  'PINK',
  'TEAL',
  'GRAY',
];

function ConversationLabelChips({
  labels,
  limit,
}: {
  labels: WhatsAppConversationLabel[];
  limit: number;
}) {
  if (!labels.length) return null;
  const visible = labels.slice(0, limit);
  return (
    <span className="conversation-label-chips" aria-label="Etiquetas da conversa">
      {visible.map((label) => (
        <span
          className={`conversation-label-chip color-${label.color.toLowerCase()}`}
          key={label.id}
        >
          <span aria-hidden="true" className="conversation-label-dot" />
          <span className="conversation-label-name">{label.name}</span>
        </span>
      ))}
      {labels.length > limit ? (
        <span className="conversation-label-more">+{labels.length - limit}</span>
      ) : null}
    </span>
  );
}

function ConversationLabelManager({
  conversation,
  error,
  labels,
  saving,
  onClose,
  onCreate,
  onSave,
}: {
  conversation: WhatsAppConversation;
  error: string;
  labels: WhatsAppConversationLabel[];
  saving: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    color: WhatsAppConversationLabelColor;
  }) => Promise<WhatsAppConversationLabelAdmin | null>;
  onSave: (labelIds: string[]) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState(() =>
    conversation.labels.map((label) => label.id),
  );
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<WhatsAppConversationLabelColor>('BLUE');
  const [createError, setCreateError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);

  useEffect(() => {
    closeRef.current = onClose;
    savingRef.current = saving;
  }, [onClose, saving]);

  useEffect(() => {
    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener('keydown', onKeyDown);
      returnFocus?.focus();
    };
  }, []);

  async function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError('');
    try {
      const created = await onCreate({ name: name.trim(), color });
      if (created) setSelectedIds((current) => [...new Set([...current, created.id])]);
      setName('');
    } catch (createLabelError) {
      setCreateError(
        conversationErrorMessage(createLabelError, 'Não foi possível criar a etiqueta.'),
      );
    } finally {
      setCreating(false);
    }
  }

  return createPortal(
    <div className="conversation-label-manager-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="conversation-label-manager-title"
        aria-modal="true"
        className="conversation-modal-card conversation-label-manager"
        ref={modalRef}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="conversation-modal-header">
          <div>
            <h3 id="conversation-label-manager-title">Aplicar etiquetas</h3>
            <p>{conversation.displayName}</p>
          </div>
          <IconButton icon={X} label="Fechar" onClick={onClose} />
        </div>
        <div className="conversation-label-options">
          {labels.length ? (
            labels.map((label) => (
              <label key={label.id} className="conversation-label-option">
                <input
                  checked={selectedIds.includes(label.id)}
                  type="checkbox"
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, label.id])]
                        : current.filter((id) => id !== label.id),
                    )
                  }
                />
                <span className={`conversation-label-dot color-${label.color.toLowerCase()}`} />
                <span>{label.name}</span>
              </label>
            ))
          ) : (
            <p className="conversation-label-empty">Nenhuma etiqueta nesta conexão.</p>
          )}
        </div>
        <form className="conversation-label-create" onSubmit={(event) => void createLabel(event)}>
          <label>
            <span>Nova etiqueta</span>
            <input
              ref={nameRef}
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="conversation-label-palette" aria-label="Cor da etiqueta">
            {conversationLabelColors.map((item) => (
              <button
                aria-label={`Cor ${item.toLowerCase()}`}
                aria-pressed={color === item}
                className={`color-${item.toLowerCase()} ${color === item ? 'active' : ''}`}
                key={item}
                type="button"
                onClick={() => setColor(item)}
              />
            ))}
          </div>
          <Button disabled={!name.trim()} loading={creating} size="sm" type="submit">
            Criar
          </Button>
        </form>
        {createError || error ? <div className="notice danger">{createError || error}</div> : null}
        <div className="conversation-modal-actions">
          <Button disabled={saving} variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} onClick={() => void onSave(selectedIds)}>
            Salvar
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ConversationList({
  attendanceFilter,
  conversations,
  filter,
  hasMore,
  listError,
  loadMoreError,
  loading,
  loadingMore,
  avatars,
  searchInput,
  selectedId,
  summary,
  waitingClockNow,
  statusFilter,
  labels,
  labelFilter,
  onBackToDashboard,
  onAvatarError,
  onAvatarPreview,
  onAttendanceFilterChange,
  onFilterChange,
  onLoadMore,
  onSearchChange,
  onSelect,
  onStartConversation,
  onStatusFilterChange,
  onLabelFilterChange,
}: {
  attendanceFilter: AttendanceFilter;
  conversations: WhatsAppConversation[];
  filter: ConversationFilter;
  hasMore: boolean;
  listError: string;
  loadMoreError: string;
  loading: boolean;
  loadingMore: boolean;
  avatars: Record<string, ConversationAvatarState>;
  searchInput: string;
  selectedId: string | null;
  summary: WhatsAppConversationSummary | null;
  waitingClockNow: number;
  statusFilter: WhatsAppConversationStatus | '';
  labels: WhatsAppConversationLabel[];
  labelFilter: string;
  onBackToDashboard: () => void;
  onAvatarError: (conversationId: string, url: string) => void;
  onAvatarPreview: (conversation: WhatsAppConversation, url: string) => void;
  onAttendanceFilterChange: (filter: AttendanceFilter) => void;
  onFilterChange: (filter: ConversationFilter) => void;
  onLoadMore: () => void;
  onSearchChange: (search: string) => void;
  onSelect: (conversation: WhatsAppConversation) => void;
  onStartConversation: () => void;
  onStatusFilterChange: (status: WhatsAppConversationStatus | '') => void;
  onLabelFilterChange: (labelId: string) => void;
}) {
  const emptyCopy =
    attendanceFilter === 'ACTIVE'
      ? 'Nenhum atendimento aguardando no momento.'
      : attendanceFilter === 'PENDING'
        ? 'Nenhum atendimento pendente.'
        : attendanceFilter === 'IN_PROGRESS'
          ? 'Nenhum atendimento em andamento.'
          : 'Nenhuma conversa encontrada.';

  return (
    <aside
      className="conversation-list-panel conversation-list-panel-with-labels"
      aria-label="Lista de conversas"
    >
      <div className="conversation-panel-header">
        <div className="conversation-list-heading">
          <button
            aria-label="Voltar ao Dashboard"
            className="conversation-dashboard-back"
            type="button"
            onClick={onBackToDashboard}
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <div>
            <h3>Conversas</h3>
            <span>{loading ? 'Atualizando...' : `${conversations.length} visíveis`}</span>
          </div>
        </div>
        <IconButton icon={Plus} label="Iniciar conversa" onClick={onStartConversation} />
      </div>

      <div className="conversation-summary-slot">
        {summary && hasUnreadConversationSummary(summary) ? (
          <span className="conversation-summary-pill">{formatConversationSummary(summary)}</span>
        ) : null}
      </div>

      <ConversationSearch query={searchInput} onQueryChange={onSearchChange} />

      <div
        className="conversation-filter-row conversation-attendance-filter-row"
        role="tablist"
        aria-label="Filtros de atendimento"
      >
        {attendanceFilters.map((item) => (
          <button
            aria-selected={attendanceFilter === item.id}
            className={attendanceFilter === item.id ? 'active' : ''}
            key={item.id}
            role="tab"
            type="button"
            onClick={() => onAttendanceFilterChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="conversation-secondary-filters">
        <label className="conversation-kind-filter">
          <span>Conversas</span>
          <select
            aria-label="Filtro secundário de conversas"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value as ConversationFilter)}
          >
            {conversationFilters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id === 'followup' ? 'Aguardando' : item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="conversation-status-filter">
          <span>Status</span>
          <select
            aria-label="Filtrar por status"
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

        <label className="conversation-label-filter">
          <span>Etiquetas</span>
          <select
            aria-label="Filtrar por etiqueta"
            value={labelFilter}
            onChange={(event) => onLabelFilterChange(event.target.value)}
          >
            <option value="">Todas</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listError ? (
        <div className="notice danger conversation-notice" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="conversation-list-items">
        {conversations.map((conversation) => (
          <ConversationListItem
            avatar={avatars[conversation.id]}
            conversation={conversation}
            key={conversation.id}
            selected={selectedId === conversation.id}
            waitingClockNow={waitingClockNow}
            onAvatarError={onAvatarError}
            onAvatarPreview={onAvatarPreview}
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

function ConversationAvatar({
  avatar,
  conversation,
  size,
  onImageError,
  onPreview,
}: {
  avatar?: ConversationAvatarState | undefined;
  conversation: WhatsAppConversation;
  size?: 'large';
  onImageError: (conversationId: string, url: string) => void;
  onPreview?: (conversation: WhatsAppConversation, url: string) => void;
}) {
  const url = avatar?.response?.available ? avatar.response.url : null;
  const showImage = Boolean(url && avatar?.failedUrl !== url);
  const initials = conversationInitials(conversation);
  const canPreview = Boolean(showImage && url && onPreview);

  function openPreview(event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (url) onPreview?.(conversation, url);
  }

  const content = showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      draggable={false}
      src={url ?? undefined}
      onError={() => {
        if (url) onImageError(conversation.id, url);
      }}
    />
  ) : initials ? (
    initials
  ) : (
    <User size={size === 'large' ? 20 : 18} />
  );

  const className = `conversation-avatar${size === 'large' ? ' large' : ''}${
    avatar?.loading ? ' loading' : ''
  }${showImage ? ' has-image' : ''}${canPreview ? ' is-clickable' : ''}`;

  if (canPreview) {
    return (
      <button
        aria-label="Ver foto de perfil"
        className={className}
        type="button"
        onClick={openPreview}
      >
        {content}
      </button>
    );
  }

  return (
    <span aria-hidden="true" className={className}>
      {content}
    </span>
  );
}

function ConversationListItem({
  avatar,
  conversation,
  selected,
  waitingClockNow,
  onAvatarError,
  onAvatarPreview,
  onSelect,
}: {
  avatar?: ConversationAvatarState | undefined;
  conversation: WhatsAppConversation;
  selected: boolean;
  waitingClockNow: number;
  onAvatarError: (conversationId: string, url: string) => void;
  onAvatarPreview: (conversation: WhatsAppConversation, url: string) => void;
  onSelect: (conversation: WhatsAppConversation) => void;
}) {
  const pendingAttendance =
    conversation.activeAttendance?.status === 'PENDING' ? conversation.activeAttendance : null;
  const waitingSeconds = pendingAttendance
    ? getHumanWaitingSeconds(pendingAttendance.openedAt, waitingClockNow)
    : 0;
  const waitingPriority = pendingAttendance ? getWaitingPriority(waitingSeconds) : null;

  return (
    <div
      aria-current={selected ? 'true' : undefined}
      className={`conversation-list-item ${selected ? 'active' : ''}${
        waitingPriority ? ` waiting-${waitingPriority.toLowerCase()}` : ''
      }`}
    >
      <ConversationAvatar
        avatar={avatar}
        conversation={conversation}
        onImageError={onAvatarError}
        onPreview={onAvatarPreview}
      />
      <button
        className="conversation-list-main"
        type="button"
        onClick={() => onSelect(conversation)}
      >
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
          <span>{conversationDisplayPhone(conversation)}</span>
          <span className={`conversation-kind ${conversation.client ? 'client' : 'guest'}`}>
            {conversation.client ? 'Cliente' : 'Avulso'}
          </span>
          {conversation.needsManualFollowUp ? (
            <span className="conversation-followup-badge">Retorno pendente</span>
          ) : null}
          {pendingAttendance && waitingPriority ? (
            <span
              aria-label={`${waitingPriorityLabels[waitingPriority]}: aguardando resposta humana há ${formatWaitingDuration(waitingSeconds)}`}
              className={`attendance-waiting-badge priority-${waitingPriority.toLowerCase()}`}
              title="Tempo desde a abertura do atendimento, sem considerar respostas automáticas"
            >
              <Clock3 aria-hidden="true" size={11} />
              <span className="attendance-waiting-level">
                {waitingPriorityLabels[waitingPriority]} ·{' '}
              </span>
              {formatWaitingDuration(waitingSeconds)}
            </span>
          ) : null}
          {conversation.activeAttendance?.status === 'PENDING' &&
          conversation.activeAttendance.autoReply.sent ? (
            <span className="attendance-auto-reply-badge" title="Resposta automática enviada">
              <Bot aria-hidden="true" size={12} /> Automática
            </span>
          ) : null}
          <ConversationLabelChips labels={conversation.labels} limit={2} />
        </span>
      </button>
    </div>
  );
}

function ConversationHeader({
  avatar,
  conversation,
  opening,
  presence,
  resolving,
  waitingClockNow,
  onAvatarError,
  onAvatarPreview,
  onBack,
  onOpenClientPanel,
  onResolve,
  onToggleSearch,
  onManageLabels,
}: {
  avatar?: ConversationAvatarState | undefined;
  conversation: WhatsAppConversation;
  opening: boolean;
  presence: string | null;
  resolving: boolean;
  waitingClockNow: number;
  onAvatarError: (conversationId: string, url: string) => void;
  onAvatarPreview: (conversation: WhatsAppConversation, url: string) => void;
  onBack: () => void;
  onOpenClientPanel: () => void;
  onResolve: () => void;
  onToggleSearch: () => void;
  onManageLabels: () => void;
}) {
  const instanceLabel = conversationInstanceLabel(conversation.instanceName);
  const phoneLabel = conversationDisplayPhone(conversation);
  const pendingWaitingSeconds =
    conversation.activeAttendance?.status === 'PENDING'
      ? getHumanWaitingSeconds(conversation.activeAttendance.openedAt, waitingClockNow)
      : null;
  const pendingWaitingPriority =
    pendingWaitingSeconds === null ? null : getWaitingPriority(pendingWaitingSeconds);

  return (
    <header className="conversation-header">
      <button
        aria-label="Voltar para conversas"
        className="conversation-mobile-back"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        <span>Voltar</span>
      </button>
      <div className="conversation-header-main">
        <ConversationAvatar
          avatar={avatar}
          conversation={conversation}
          size="large"
          onImageError={onAvatarError}
          onPreview={onAvatarPreview}
        />
        <div>
          <button
            className="conversation-contact-name-button"
            type="button"
            onClick={onOpenClientPanel}
          >
            {conversation.displayName}
          </button>
          <p>{instanceLabel ? `${phoneLabel} · ${instanceLabel}` : phoneLabel}</p>
          {presence ? <small className="conversation-presence-label">{presence}</small> : null}
          <div className="conversation-header-badges">
            <span className={`conversation-kind ${conversation.client ? 'client' : 'guest'}`}>
              {conversation.client ? 'Cliente' : 'Avulso'}
            </span>
            <span
              className={`conversation-status-badge status-${conversation.status.toLowerCase()}`}
            >
              {conversation.status}
            </span>
            {conversation.activeAttendance ? (
              <span
                className={`attendance-status ${conversation.activeAttendance.status.toLowerCase()}`}
              >
                {attendanceStatusLabel(conversation.activeAttendance.status)}
              </span>
            ) : null}
            {opening ? <span className="conversation-sync-badge">Carregando</span> : null}
            <ConversationLabelChips labels={conversation.labels} limit={3} />
          </div>
          {conversation.activeAttendance?.status === 'PENDING' ? (
            <div
              className={`attendance-human-waiting priority-${pendingWaitingPriority?.toLowerCase() ?? 'normal'}`}
            >
              <span>
                <Clock3 aria-hidden="true" size={12} />{' '}
                {pendingWaitingPriority
                  ? waitingPriorityLabels[pendingWaitingPriority]
                  : 'Aguardando'}{' '}
                · Aguardando resposta humana há {formatWaitingDuration(pendingWaitingSeconds ?? 0)}
              </span>
              {conversation.activeAttendance.autoReply.sent ? (
                <small>
                  <Bot aria-hidden="true" size={12} /> Resposta automática enviada ·{' '}
                  {autoReplyModeLabel(conversation.activeAttendance.autoReply.mode)} ·{' '}
                  {formatAutoReplyTime(conversation.activeAttendance.autoReply.lastSentAt)}
                </small>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="conversation-header-actions">
        <IconButton icon={Tags} label="Gerenciar etiquetas" onClick={onManageLabels} />
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
      <div className="conversation-header-actions-mobile">
        <ActionMenu
          label="Mais ações da conversa"
          items={[
            { label: 'Etiquetas', icon: Tags, onSelect: onManageLabels },
            { label: 'Buscar na conversa', icon: Search, onSelect: onToggleSearch },
            { label: 'Informações do contato', icon: Info, onSelect: onOpenClientPanel },
            ...(conversation.status === 'RESOLVED'
              ? []
              : [
                  {
                    label: 'Resolver conversa',
                    icon: CircleCheck,
                    disabled: resolving,
                    onSelect: onResolve,
                  },
                ]),
          ]}
        />
      </div>
    </header>
  );
}

function ConversationMessages({
  conversationId,
  outboundActionsDisabled,
  hasOlder,
  hasNewer,
  loading,
  loadingOlder,
  messages,
  messagesEndRef,
  olderError,
  deleteConfirmMessageId,
  deleteErrors,
  deletingMessageIds,
  editingMessageId,
  editBody,
  editError,
  savingEditMessageId,
  retryErrors,
  retryingMessageIds,
  saveStickerFeedback,
  savingStickerMessageIds,
  onJumpToBottom,
  onLoadLatest,
  onLoadOlder,
  onQuoteClick,
  onReaction,
  onReactionPickerChange,
  onDelete,
  onDeleteConfirmChange,
  onEdit,
  onEditBodyChange,
  onEditCancel,
  onEditSave,
  onForward,
  onReply,
  onRetry,
  onSaveSticker,
  onStartSharedContactConversation,
  onOpenSharedContactClient,
  reactionErrors,
  reactionPickerMessageId,
  reactingMessageIds,
  scrollRef,
  showNewMessageNotice,
  targetMessageId,
  targetSearchTerm,
}: {
  conversationId: string;
  outboundActionsDisabled: boolean;
  hasOlder: boolean;
  hasNewer: boolean;
  loading: boolean;
  loadingOlder: boolean;
  messages: WhatsAppConversationMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  olderError: string;
  deleteConfirmMessageId: string | null;
  deleteErrors: Record<string, string>;
  deletingMessageIds: Set<string>;
  editingMessageId: string | null;
  editBody: string;
  editError: string;
  savingEditMessageId: string | null;
  retryErrors: Record<string, string>;
  retryingMessageIds: Set<string>;
  saveStickerFeedback: Record<string, string>;
  savingStickerMessageIds: Set<string>;
  onJumpToBottom: () => void;
  onLoadLatest: () => void;
  onLoadOlder: () => void;
  onQuoteClick: (message: WhatsAppConversationMessage) => void;
  onReaction: (message: WhatsAppConversationMessage, emoji: string) => void;
  onReactionPickerChange: (messageId: string | null) => void;
  onDelete: (message: WhatsAppConversationMessage) => void;
  onDeleteConfirmChange: (messageId: string | null) => void;
  onEdit: (message: WhatsAppConversationMessage) => void;
  onEditBodyChange: (body: string) => void;
  onEditCancel: () => void;
  onEditSave: (message: WhatsAppConversationMessage) => void;
  onForward: (message: WhatsAppConversationMessage) => void;
  onReply: (message: WhatsAppConversationMessage) => void;
  onRetry: (message: WhatsAppConversationMessage) => void;
  onSaveSticker: (message: WhatsAppConversationMessage) => void;
  onStartSharedContactConversation: SharedContactAction;
  onOpenSharedContactClient: SharedContactAction;
  reactionErrors: Record<string, string>;
  reactionPickerMessageId: string | null;
  reactingMessageIds: Set<string>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showNewMessageNotice: boolean;
  targetMessageId: string | null;
  targetSearchTerm: string;
}) {
  const renderableMessages = messages.filter(isRenderableConversationMessage);
  const pixCopyCacheRef = useRef<ConversationPixCopyCache>(new Map());
  const pixCopyInFlightRef = useRef<ConversationPixCopyInFlight>(new Map());
  const pixCopyFeedbackTimersRef = useRef<Map<string, number>>(new Map());
  const pixCopyMountedRef = useRef(true);
  const [pixCopyStates, setPixCopyStates] = useState<Record<string, ConversationPixCopyState>>({});

  useEffect(() => {
    const timers = pixCopyFeedbackTimersRef.current;

    return () => {
      pixCopyMountedRef.current = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const setPixCopyState = useCallback(
    (paymentIntentId: string, state: ConversationPixCopyState, reset = false) => {
      if (!pixCopyMountedRef.current) return;

      const currentTimer = pixCopyFeedbackTimersRef.current.get(paymentIntentId);

      if (currentTimer) {
        window.clearTimeout(currentTimer);
        pixCopyFeedbackTimersRef.current.delete(paymentIntentId);
      }

      setPixCopyStates((current) => ({ ...current, [paymentIntentId]: state }));

      if (reset) {
        const timer = window.setTimeout(() => {
          setPixCopyStates((current) => {
            const next = { ...current };
            delete next[paymentIntentId];
            return next;
          });
          pixCopyFeedbackTimersRef.current.delete(paymentIntentId);
        }, 2400);
        pixCopyFeedbackTimersRef.current.set(paymentIntentId, timer);
      }
    },
    [],
  );

  const handlePixCopy = useCallback(
    async (message: WhatsAppConversationMessage) => {
      const paymentIntentId = message.pixContext?.paymentIntentId;

      if (!paymentIntentId) return;

      if (!navigator.clipboard?.writeText) {
        setPixCopyState(paymentIntentId, { status: 'copy_error' }, true);
        return;
      }

      setPixCopyState(paymentIntentId, { status: 'loading' });
      const outcome = await resolveConversationPixCopyAction({
        cache: pixCopyCacheRef.current,
        fetchPixCopy: getPaymentIntentPixCopy,
        inFlight: pixCopyInFlightRef.current,
        paymentIntentId,
        writeText: (value) => navigator.clipboard.writeText(value),
      });

      setPixCopyState(paymentIntentId, { status: outcome.status }, true);
    },
    [setPixCopyState],
  );

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
                    outboundActionsDisabled={outboundActionsDisabled}
                    highlighted={targetMessageId === message.id}
                    message={message}
                    deleteConfirmOpen={deleteConfirmMessageId === message.id}
                    deleteError={deleteErrors[message.id] ?? ''}
                    deleting={deletingMessageIds.has(message.id)}
                    editing={editingMessageId === message.id}
                    editBody={editingMessageId === message.id ? editBody : ''}
                    editError={editingMessageId === message.id ? editError : ''}
                    savingEdit={savingEditMessageId === message.id}
                    reactionError={reactionErrors[message.id] ?? ''}
                    reactionPickerOpen={reactionPickerMessageId === message.id}
                    reacting={reactingMessageIds.has(message.id)}
                    retryError={retryErrors[message.id] ?? ''}
                    retrying={retryingMessageIds.has(message.id)}
                    saveStickerFeedback={saveStickerFeedback[message.id] ?? ''}
                    savingSticker={savingStickerMessageIds.has(message.id)}
                    pixCopyState={
                      message.pixContext?.paymentIntentId
                        ? pixCopyStates[message.pixContext.paymentIntentId]
                        : undefined
                    }
                    searchTerm={targetMessageId === message.id ? targetSearchTerm : ''}
                    onCopyPix={(message) => {
                      void handlePixCopy(message);
                    }}
                    onQuoteClick={onQuoteClick}
                    onReaction={onReaction}
                    onReactionPickerChange={onReactionPickerChange}
                    onDelete={onDelete}
                    onDeleteConfirmChange={onDeleteConfirmChange}
                    onEdit={onEdit}
                    onEditBodyChange={onEditBodyChange}
                    onEditCancel={onEditCancel}
                    onEditSave={onEditSave}
                    onForward={onForward}
                    onReply={onReply}
                    onRetry={onRetry}
                    onSaveSticker={onSaveSticker}
                    onStartSharedContactConversation={onStartSharedContactConversation}
                    onOpenSharedContactClient={onOpenSharedContactClient}
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
  if (message.deleted) {
    return true;
  }

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
    message.type === 'STICKER' ||
    message.type === 'LOCATION' ||
    message.type === 'CONTACT' ||
    message.type === 'CONTACTS'
  );
}

export function isDeleteEligibleConversationMessage(message: WhatsAppConversationMessage) {
  return message.direction === 'OUTBOUND' && Boolean(message.providerMessageId) && !message.deleted;
}

export function isEditEligibleConversationMessage(message: WhatsAppConversationMessage) {
  return (
    message.direction === 'OUTBOUND' &&
    message.type === 'TEXT' &&
    Boolean(message.providerMessageId) &&
    !message.deleted
  );
}

export function isForwardEligibleConversationMessage(message: WhatsAppConversationMessage) {
  if (message.deleted || message.deletedAt || message.deletedForEveryone) return false;
  if (message.type === 'TEXT') return Boolean(message.text?.trim());
  if (
    message.type !== 'IMAGE' &&
    message.type !== 'VIDEO' &&
    message.type !== 'AUDIO' &&
    message.type !== 'DOCUMENT' &&
    message.type !== 'STICKER'
  ) {
    return false;
  }
  if (!message.mediaAvailable) return false;

  return message.type !== 'STICKER' || message.mediaMimeType?.toLowerCase() === 'image/webp';
}

export function classifyConversationIncomingFile(
  file: File,
  { expectedKind = null }: { expectedKind?: ConversationComposerMedia['kind'] | null } = {},
): ConversationIncomingFileResult {
  const mimeType = file.type.split(';')[0]?.trim().toLowerCase() || '';
  const extension = conversationFileExtension(file.name);
  const isStickerPicker = expectedKind === 'STICKER';
  const isVideoFile =
    allowedConversationVideoMimeTypes.has(mimeType) ||
    allowedConversationVideoExtensions.has(extension);
  const maxBytes =
    isVideoFile && !isStickerPicker ? conversationVideoMaxBytes : conversationMediaMaxBytes;

  if (file.size > maxBytes) {
    return {
      ok: false,
      error: isVideoFile
        ? 'Vídeo excede o limite de 50 MB permitido para envio por WhatsApp.'
        : 'Arquivo excede o limite de 10 MB permitido.',
    };
  }

  if (isStickerPicker) {
    return allowedConversationStickerMimeTypes.has(mimeType) && extension === 'webp'
      ? { ok: true, kind: 'STICKER' }
      : { ok: false, error: 'Figurinha deve ser um arquivo WEBP.' };
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
      kind === 'IMAGE' || kind === 'AUDIO' || kind === 'VIDEO' || kind === 'STICKER'
        ? URL.createObjectURL(file)
        : null,
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
  outboundActionsDisabled,
  deleteConfirmOpen,
  deleteError,
  deleting,
  editing,
  editBody,
  editError,
  savingEdit,
  highlighted,
  message,
  reactionError,
  reactionPickerOpen,
  reacting,
  retryError,
  retrying,
  saveStickerFeedback,
  savingSticker,
  pixCopyState,
  searchTerm,
  onCopyPix,
  onQuoteClick,
  onReaction,
  onReactionPickerChange,
  onDelete,
  onDeleteConfirmChange,
  onEdit,
  onEditBodyChange,
  onEditCancel,
  onEditSave,
  onForward,
  onReply,
  onRetry,
  onSaveSticker,
  onStartSharedContactConversation,
  onOpenSharedContactClient,
}: {
  conversationId: string;
  outboundActionsDisabled: boolean;
  deleteConfirmOpen: boolean;
  deleteError: string;
  deleting: boolean;
  editing: boolean;
  editBody: string;
  editError: string;
  savingEdit: boolean;
  highlighted: boolean;
  message: WhatsAppConversationMessage;
  reactionError: string;
  reactionPickerOpen: boolean;
  reacting: boolean;
  retryError: string;
  retrying: boolean;
  saveStickerFeedback: string;
  savingSticker: boolean;
  pixCopyState?: ConversationPixCopyState | undefined;
  searchTerm: string;
  onCopyPix: (message: WhatsAppConversationMessage) => void;
  onQuoteClick: (message: WhatsAppConversationMessage) => void;
  onReaction: (message: WhatsAppConversationMessage, emoji: string) => void;
  onReactionPickerChange: (messageId: string | null) => void;
  onDelete: (message: WhatsAppConversationMessage) => void;
  onDeleteConfirmChange: (messageId: string | null) => void;
  onEdit: (message: WhatsAppConversationMessage) => void;
  onEditBodyChange: (body: string) => void;
  onEditCancel: () => void;
  onEditSave: (message: WhatsAppConversationMessage) => void;
  onForward: (message: WhatsAppConversationMessage) => void;
  onReply: (message: WhatsAppConversationMessage) => void;
  onRetry: (message: WhatsAppConversationMessage) => void;
  onSaveSticker: (message: WhatsAppConversationMessage) => void;
  onStartSharedContactConversation: SharedContactAction;
  onOpenSharedContactClient: SharedContactAction;
}) {
  const outbound = message.direction === 'OUTBOUND';
  const reactionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteEligible = isDeleteEligibleConversationMessage(message);
  const editEligible = isEditEligibleConversationMessage(message);
  const forwardEligible = isForwardEligibleConversationMessage(message);

  if (!isRenderableConversationMessage(message)) {
    return null;
  }

  const hasAvailableImage =
    (message.type === 'IMAGE' || message.type === 'STICKER') && message.mediaAvailable;
  const hasAvailableInlineMedia = isAvailableInlineConversationMedia(message);
  const canSaveSticker =
    message.type === 'STICKER' &&
    message.mediaAvailable &&
    !message.deleted &&
    message.mediaMimeType?.toLowerCase() === 'image/webp';
  const text = hasAvailableInlineMedia ? '' : conversationMessageDisplayText(message);
  const caption = conversationMessageCaption(message);
  const mobileActionItems: ActionMenuItem[] = [
    {
      label: 'Responder',
      icon: Reply,
      disabled: outboundActionsDisabled,
      onSelect: () => onReply(message),
    },
    ...(canSaveSticker
      ? [
          {
            label: savingSticker ? 'Salvando figurinha...' : 'Salvar figurinha',
            icon: Download,
            disabled: savingSticker,
            onSelect: () => onSaveSticker(message),
          },
        ]
      : []),
    ...(forwardEligible
      ? [
          {
            label: 'Encaminhar',
            icon: ForwardIcon,
            disabled: outboundActionsDisabled,
            onSelect: () => onForward(message),
          },
        ]
      : []),
    ...(editEligible
      ? [
          {
            label: savingEdit ? 'Salvando edição...' : 'Editar',
            icon: Pencil,
            disabled: outboundActionsDisabled || savingEdit,
            onSelect: () => onEdit(message),
          },
        ]
      : []),
    ...(!message.deleted
      ? allowedWhatsAppReactionEmojis.map((emoji) => ({
          label: `Reagir com ${emoji}`,
          disabled: outboundActionsDisabled || reacting,
          onSelect: () => onReaction(message, emoji),
          section: 'Reagir',
        }))
      : []),
    ...(deleteEligible
      ? [
          {
            label: deleting ? 'Apagando...' : 'Apagar',
            icon: Trash2,
            danger: true,
            disabled: outboundActionsDisabled || deleting,
            onSelect: () => onDeleteConfirmChange(message.id),
            section: 'Mensagem',
          },
        ]
      : []),
  ];
  const actionRail = (
    <div
      className={`conversation-message-actions ${outbound ? 'outbound' : 'inbound'}`}
      aria-label="Acoes da mensagem"
    >
      <div className="conversation-message-mobile-actions">
        <ActionMenu items={mobileActionItems} label="Ações da mensagem" />
      </div>
      <button
        className="conversation-reply-action"
        type="button"
        title="Responder"
        aria-label="Responder mensagem"
        disabled={outboundActionsDisabled}
        onClick={() => onReply(message)}
      >
        <Reply aria-hidden="true" size={14} />
      </button>
      {canSaveSticker ? (
        <button
          className="conversation-save-sticker-action"
          type="button"
          title="Salvar figurinha"
          aria-label="Salvar figurinha"
          disabled={savingSticker}
          onClick={() => onSaveSticker(message)}
        >
          {savingSticker ? (
            <Loader2 aria-hidden="true" size={14} />
          ) : (
            <Download aria-hidden="true" size={14} />
          )}
        </button>
      ) : null}
      {forwardEligible ? (
        <button
          className="conversation-forward-action"
          type="button"
          title="Encaminhar"
          aria-label="Encaminhar mensagem"
          disabled={outboundActionsDisabled}
          onClick={() => onForward(message)}
        >
          <ForwardIcon aria-hidden="true" size={14} />
        </button>
      ) : null}
      {editEligible ? (
        <button
          className="conversation-edit-action"
          type="button"
          title="Editar"
          aria-label="Editar mensagem"
          aria-expanded={editing}
          disabled={outboundActionsDisabled || savingEdit}
          onClick={() => onEdit(message)}
        >
          {savingEdit ? (
            <Loader2 aria-hidden="true" size={14} />
          ) : (
            <Pencil aria-hidden="true" size={14} />
          )}
        </button>
      ) : null}
      {deleteEligible ? (
        <div className="conversation-delete-action-wrap">
          <button
            className="conversation-delete-action"
            type="button"
            title="Apagar"
            aria-label="Apagar mensagem"
            aria-expanded={deleteConfirmOpen}
            disabled={outboundActionsDisabled || deleting}
            onClick={() => onDeleteConfirmChange(deleteConfirmOpen ? null : message.id)}
          >
            {deleting ? (
              <Loader2 aria-hidden="true" size={14} />
            ) : (
              <Trash2 aria-hidden="true" size={14} />
            )}
          </button>
          {deleteConfirmOpen ? (
            <div className="conversation-delete-confirm" role="dialog" aria-label="Apagar mensagem">
              <span>Apagar esta mensagem?</span>
              <div>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => onDeleteConfirmChange(null)}
                >
                  Cancelar
                </button>
                <button type="button" disabled={deleting} onClick={() => onDelete(message)}>
                  {deleting ? 'Apagando...' : 'Apagar'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {!message.deleted ? (
        <div className="conversation-reaction-action-wrap">
          <button
            ref={reactionTriggerRef}
            className="conversation-reaction-action"
            type="button"
            title="Reagir"
            aria-label="Reagir à mensagem"
            aria-expanded={reactionPickerOpen}
            disabled={outboundActionsDisabled || reacting}
            onClick={() => onReactionPickerChange(reactionPickerOpen ? null : message.id)}
          >
            {reacting ? (
              <Loader2 aria-hidden="true" size={14} />
            ) : (
              <SmilePlus aria-hidden="true" size={14} />
            )}
          </button>
          <ConversationReactionPickerPortal
            message={message}
            open={reactionPickerOpen}
            reacting={reacting}
            triggerRef={reactionTriggerRef}
            onClose={() => onReactionPickerChange(null)}
            onReaction={onReaction}
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <article
      className={`conversation-bubble-row ${outbound ? 'outbound' : 'inbound'} ${
        highlighted ? 'target-highlight' : ''
      }`}
      data-message-id={message.id}
    >
      {outbound ? actionRail : null}
      <div
        className={`conversation-bubble ${outbound ? 'outbound' : 'inbound'} ${
          hasAvailableImage ? 'has-image-media' : ''
        }`}
      >
        <ConversationQuote message={message} onClick={() => onQuoteClick(message)} />
        {message.isForwarded ? (
          <span className="conversation-forwarded-label">Encaminhada</span>
        ) : null}
        {editing ? (
          <div className="conversation-message-editor">
            <textarea
              aria-label="Editar texto da mensagem"
              autoFocus
              disabled={savingEdit}
              maxLength={2000}
              rows={3}
              value={editBody}
              onChange={(event) => onEditBodyChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onEditCancel();
                } else if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  onEditSave(message);
                }
              }}
            />
            {editError ? <span role="alert">{editError}</span> : null}
            <div>
              <button type="button" disabled={savingEdit} onClick={onEditCancel}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  savingEdit || !editBody.trim() || editBody.trim() === message.text?.trim()
                }
                onClick={() => onEditSave(message)}
              >
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        ) : message.deleted ? (
          <p className="conversation-message-deleted">Mensagem apagada</p>
        ) : text ? (
          <p>{renderHighlightedSearchText(text, searchTerm)}</p>
        ) : null}
        {!message.deleted ? (
          <ConversationContactContent
            message={message}
            onOpenClient={onOpenSharedContactClient}
            onStartConversation={onStartSharedContactConversation}
          />
        ) : null}
        {!message.deleted ? (
          <ConversationMediaContent conversationId={conversationId} message={message} />
        ) : null}
        {caption ? <span className="conversation-caption">{caption}</span> : null}
        {!message.deleted ? (
          <ConversationPixCopyAction message={message} state={pixCopyState} onCopyPix={onCopyPix} />
        ) : null}
        {!message.deleted ? <ConversationReactionSummary reactions={message.reactions} /> : null}
        {reactionError ? (
          <div className="conversation-reaction-error" role="alert">
            {reactionError}
          </div>
        ) : null}
        {deleteError ? (
          <div className="conversation-reaction-error" role="alert">
            {deleteError}
          </div>
        ) : null}
        {saveStickerFeedback ? (
          <div className="conversation-reaction-error" role="status">
            {saveStickerFeedback}
          </div>
        ) : null}
        <footer>
          <span>
            {message.isAutoReply ? 'Automática · ' : ''}
            {conversationMessageFooterLabel(message)}
          </span>
          {outbound ? <ConversationMessageStatusIcon status={message.status} /> : null}
        </footer>
        {!message.deleted && message.status === 'FAILED' && outbound ? (
          <div className="conversation-message-failure">
            <strong>Falhou ao enviar</strong>
            {retryError ? <span>{retryError}</span> : null}
            {message.retryAction === 'RETRY' ? (
              <button
                className="conversation-message-retry"
                disabled={outboundActionsDisabled || retrying}
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
      {!outbound ? actionRail : null}
      {deleteConfirmOpen ? (
        <ConversationMobileDeleteConfirmation
          deleting={deleting}
          message={message}
          onDelete={onDelete}
          onDeleteConfirmChange={onDeleteConfirmChange}
        />
      ) : null}
    </article>
  );
}

function ConversationMobileDeleteConfirmation({
  deleting,
  message,
  onDelete,
  onDeleteConfirmChange,
}: {
  deleting: boolean;
  message: WhatsAppConversationMessage;
  onDelete: (message: WhatsAppConversationMessage) => void;
  onDeleteConfirmChange: (messageId: string | null) => void;
}) {
  const [mobile, setMobile] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const modalRef = useRef<HTMLElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deletingRef = useRef(deleting);
  const onDeleteRef = useRef(onDelete);
  const onDeleteConfirmChangeRef = useRef(onDeleteConfirmChange);

  useEffect(() => {
    deletingRef.current = deleting;
    onDeleteRef.current = onDelete;
    onDeleteConfirmChangeRef.current = onDeleteConfirmChange;
  }, [deleting, onDelete, onDeleteConfirmChange]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 620px)');
    const update = () => setMobile(query.matches);

    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && !deletingRef.current) {
        event.preventDefault();
        onDeleteConfirmChangeRef.current(null);
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      if (
        event.shiftKey &&
        (document.activeElement === first || !modalRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mobile]);

  useEffect(() => {
    if (!mobile) return;
    if (deleting) {
      modalRef.current?.focus();
    } else {
      cancelButtonRef.current?.focus();
    }
  }, [deleting, mobile]);

  if (!mobile) return null;

  return createPortal(
    <div className="conversation-delete-modal-backdrop" role="presentation">
      <section
        ref={modalRef}
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="conversation-delete-modal"
        role="dialog"
        tabIndex={-1}
      >
        <h2 id={titleId}>Apagar esta mensagem?</h2>
        <p id={descriptionId}>Confirme para continuar ou cancele para manter a mensagem.</p>
        <div>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={deleting}
            onClick={() => onDeleteConfirmChangeRef.current(null)}
          >
            Cancelar
          </button>
          <button type="button" disabled={deleting} onClick={() => onDeleteRef.current(message)}>
            {deleting ? 'Apagando...' : 'Apagar'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

type ReactionPickerPosition = {
  left: number;
  top: number;
  placement: 'top' | 'bottom';
  maxWidth: number;
};

export function calculateReactionPickerPosition({
  triggerRect,
  viewportWidth,
  viewportHeight,
  pickerWidth = reactionPickerDefaultSize.width,
  pickerHeight = reactionPickerDefaultSize.height,
}: {
  triggerRect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;
  viewportWidth: number;
  viewportHeight: number;
  pickerWidth?: number;
  pickerHeight?: number;
}): ReactionPickerPosition {
  const availableWidth = Math.max(0, viewportWidth - reactionPickerViewportGap * 2);
  const effectivePickerWidth = Math.min(pickerWidth, availableWidth);
  const hasRoomBelow =
    viewportHeight - triggerRect.bottom >=
    pickerHeight + reactionPickerOffset + reactionPickerViewportGap;
  const hasRoomAbove =
    triggerRect.top >= pickerHeight + reactionPickerOffset + reactionPickerViewportGap;
  const placement = hasRoomBelow || !hasRoomAbove ? 'bottom' : 'top';
  const preferredLeft = triggerRect.left + triggerRect.width / 2 - effectivePickerWidth / 2;
  const minLeft = reactionPickerViewportGap;
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - effectivePickerWidth - reactionPickerViewportGap,
  );
  const left = Math.min(Math.max(preferredLeft, minLeft), maxLeft);
  const unclampedTop =
    placement === 'bottom'
      ? triggerRect.bottom + reactionPickerOffset
      : triggerRect.top - pickerHeight - reactionPickerOffset;
  const minTop = reactionPickerViewportGap;
  const maxTop = Math.max(minTop, viewportHeight - pickerHeight - reactionPickerViewportGap);
  const top = Math.min(Math.max(unclampedTop, minTop), maxTop);

  return {
    left: Math.round(left),
    top: Math.round(top),
    placement,
    maxWidth: Math.round(effectivePickerWidth),
  };
}

type QuickReplyMenuViewportPosition = {
  top: number;
  maxHeight: number;
};

export function calculateQuickReplyMenuViewportPosition({
  composerRect,
  viewportHeight,
  viewportOffsetTop = 0,
  viewportGap = quickReplyMenuViewportGap,
  composerGap = quickReplyMenuComposerGap,
  maxHeight = quickReplyMenuMobileMaxHeight,
  minHeight = quickReplyMenuMobileMinHeight,
}: {
  composerRect: Pick<DOMRect, 'top'> | null;
  viewportHeight: number;
  viewportOffsetTop?: number;
  viewportGap?: number;
  composerGap?: number;
  maxHeight?: number;
  minHeight?: number;
}): QuickReplyMenuViewportPosition {
  const safeViewportGap = Math.max(
    0,
    Number.isFinite(viewportGap) ? viewportGap : quickReplyMenuViewportGap,
  );
  const safeComposerGap = Math.max(
    0,
    Number.isFinite(composerGap) ? composerGap : quickReplyMenuComposerGap,
  );
  const safeViewportHeight = Math.max(
    1,
    Number.isFinite(viewportHeight) ? viewportHeight : quickReplyMenuMobileMinHeight,
  );
  const viewportCapacity = Math.max(1, safeViewportHeight - safeViewportGap * 2);
  const safeMinHeight = Math.max(
    1,
    Math.min(
      Number.isFinite(minHeight) ? minHeight : quickReplyMenuMobileMinHeight,
      viewportCapacity,
    ),
  );
  const safeMaxHeight = Math.max(
    safeMinHeight,
    Number.isFinite(maxHeight) ? maxHeight : quickReplyMenuMobileMaxHeight,
  );
  const viewportTop = Math.max(0, Number.isFinite(viewportOffsetTop) ? viewportOffsetTop : 0);
  const viewportBottom = viewportTop + safeViewportHeight;
  const composerTop =
    composerRect && Number.isFinite(composerRect.top)
      ? Math.max(viewportTop, Math.min(composerRect.top, viewportBottom))
      : viewportBottom;
  const menuBottom = Math.max(viewportTop + safeMinHeight, composerTop - safeComposerGap);
  const availableHeight = Math.max(safeMinHeight, menuBottom - viewportTop - safeViewportGap * 2);
  const effectiveMaxHeight = Math.max(safeMinHeight, Math.min(safeMaxHeight, availableHeight));
  const top = Math.max(viewportTop + safeViewportGap, menuBottom - effectiveMaxHeight);

  return {
    top: Math.round(top),
    maxHeight: Math.round(Math.max(1, menuBottom - top)),
  };
}

function ConversationReactionPickerPortal({
  message,
  open,
  reacting,
  triggerRef,
  onClose,
  onReaction,
}: {
  message: WhatsAppConversationMessage;
  open: boolean;
  reacting: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onReaction: (message: WhatsAppConversationMessage, emoji: string) => void;
}) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ReactionPickerPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) return;

      const pickerRect = pickerRef.current?.getBoundingClientRect();
      setPosition(
        calculateReactionPickerPosition({
          triggerRect: trigger.getBoundingClientRect(),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          pickerWidth: pickerRect?.width || reactionPickerDefaultSize.width,
          pickerHeight: pickerRect?.height || reactionPickerDefaultSize.height,
        }),
      );
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) return;
      if (pickerRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, triggerRef]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={pickerRef}
      className={`conversation-reaction-picker ${position?.placement ?? 'bottom'}`}
      role="menu"
      aria-label="Selecionar reação"
      style={{
        left: position ? `${position.left}px` : '-9999px',
        top: position ? `${position.top}px` : '-9999px',
        maxWidth: position ? `${position.maxWidth}px` : undefined,
      }}
    >
      {allowedWhatsAppReactionEmojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          className={
            message.reactions.some((reaction) => reaction.isFromMe && reaction.emoji === emoji)
              ? 'active'
              : ''
          }
          disabled={reacting}
          onClick={() => onReaction(message, emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body,
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

export function ConversationPixCopyAction({
  message,
  state,
  onCopyPix,
}: {
  message: WhatsAppConversationMessage;
  state?: ConversationPixCopyState | undefined;
  onCopyPix: (message: WhatsAppConversationMessage) => void;
}) {
  if (!isConversationPixCopyEligible(message)) {
    return null;
  }

  const loading = state?.status === 'loading';
  const feedback =
    state && state.status !== 'idle' && state.status !== 'loading'
      ? conversationPixCopyButtonLabel(message.pixContext?.buttonLabel, state)
      : '';
  const label = conversationPixCopyButtonLabel(message.pixContext?.buttonLabel, state);

  return (
    <div className="conversation-pix-copy">
      <button
        aria-label="Copiar chave PIX"
        className={`conversation-pix-copy-action ${state?.status ?? 'idle'}`}
        disabled={loading}
        type="button"
        onClick={(event) => {
          stopConversationPixCopyEvent(event);
          onCopyPix(message);
        }}
      >
        {loading ? <Loader2 aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
        <span>{label}</span>
      </button>
      {feedback ? (
        <span className={`conversation-pix-copy-feedback ${state?.status}`} role="status">
          {feedback}
        </span>
      ) : null}
    </div>
  );
}

function ConversationReactionSummary({
  reactions,
}: {
  reactions: WhatsAppConversationMessage['reactions'];
}) {
  const counts = summarizeConversationReactions(reactions);

  if (!counts.length) {
    return null;
  }

  return (
    <div className="conversation-reaction-summary">
      {counts.map(([emoji, count]) => (
        <span key={emoji}>
          {emoji} {count}
        </span>
      ))}
    </div>
  );
}

export function nextOwnReactionEmoji(message: WhatsAppConversationMessage, emoji: string) {
  const ownReaction = message.reactions.find((reaction) => reaction.isFromMe);
  return ownReaction?.emoji === emoji ? null : emoji;
}

export function summarizeConversationReactions(
  reactions: WhatsAppConversationMessage['reactions'],
) {
  const counts = reactions.reduce<Record<string, number>>((acc, reaction) => {
    acc[reaction.emoji] = (acc[reaction.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts);
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

export function ConversationContactContent({
  message,
  onOpenClient,
  onStartConversation,
}: {
  message: WhatsAppConversationMessage;
  onOpenClient: SharedContactAction;
  onStartConversation: SharedContactAction;
}) {
  if (message.type !== 'CONTACT' && message.type !== 'CONTACTS') return null;

  const sharedContacts = message.contacts ?? [];
  const contacts = sharedContacts.length ? sharedContacts : [{ displayName: null, phones: [] }];

  return (
    <div className="conversation-shared-contacts" aria-label="Contatos compartilhados">
      {contacts.map((contact, index) => (
        <SharedContactCard
          contact={contact}
          key={`${contact.displayName ?? 'contact'}-${index}`}
          onOpenClient={onOpenClient}
          onStartConversation={onStartConversation}
        />
      ))}
    </div>
  );
}

function SharedContactCard({
  contact,
  onOpenClient,
  onStartConversation,
}: {
  contact: WhatsAppSharedContact;
  onOpenClient: SharedContactAction;
  onStartConversation: SharedContactAction;
}) {
  const actionablePhones = contact.phones.filter(
    (phone, index, phones) =>
      sharedContactBrazilPhoneCandidates(phone).length > 0 && phones.indexOf(phone) === index,
  );
  const actionContextKey = `${contact.displayName ?? ''}\u0000${contact.phones.join('\u0000')}`;
  const defaultSelectedPhone = actionablePhones.length === 1 ? (actionablePhones[0] ?? '') : '';
  const [selectedPhone, setSelectedPhone] = useState(defaultSelectedPhone);
  const [busyAction, setBusyAction] = useState<'client' | 'conversation' | null>(null);
  const [feedback, setFeedback] = useState('');
  const actionGenerationRef = useRef(0);
  const actionInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const selectedPhoneIsValid = actionablePhones.includes(selectedPhone);

  useEffect(() => {
    actionGenerationRef.current += 1;
    actionInFlightRef.current = false;
    setSelectedPhone(defaultSelectedPhone);
    setBusyAction(null);
    setFeedback('');
  }, [actionContextKey, defaultSelectedPhone]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      actionGenerationRef.current += 1;
      actionInFlightRef.current = false;
    };
  }, []);

  async function runAction(action: 'client' | 'conversation') {
    if (actionInFlightRef.current || !selectedPhoneIsValid) return;

    actionInFlightRef.current = true;
    const actionGeneration = actionGenerationRef.current + 1;
    actionGenerationRef.current = actionGeneration;
    const isCurrent = () => mountedRef.current && actionGenerationRef.current === actionGeneration;
    setBusyAction(action);
    setFeedback('');
    try {
      const result = await (action === 'conversation'
        ? onStartConversation(contact, selectedPhone, isCurrent)
        : onOpenClient(contact, selectedPhone, isCurrent));
      if (!isCurrent()) return;
      setFeedback(result?.feedback ?? '');
    } catch {
      if (!isCurrent()) return;
      setFeedback('Não foi possível concluir a ação. Tente novamente.');
    } finally {
      if (isCurrent()) {
        actionInFlightRef.current = false;
        setBusyAction(null);
      }
    }
  }

  return (
    <article className="conversation-shared-contact">
      <User aria-hidden="true" size={22} />
      <div className="conversation-shared-contact-content">
        <strong>{contact.displayName || 'Contato sem nome'}</strong>
        {contact.phones.length ? (
          contact.phones.map((phone, index) => (
            <span key={`${phone}-${index}`}>{phone || 'Telefone não informado'}</span>
          ))
        ) : (
          <span>Telefone não informado</span>
        )}
        <small>Contato compartilhado</small>

        {contact.phones.length > 0 && actionablePhones.length === 0 ? (
          <p className="conversation-shared-contact-feedback" role="status">
            Ações para telefone internacional ficam indisponíveis até a ativação coordenada.
          </p>
        ) : null}

        {actionablePhones.length > 1 ? (
          <label className="conversation-shared-contact-phone-picker">
            <span>Telefone para a ação</span>
            <select
              aria-label={`Telefone para ${contact.displayName || 'contato compartilhado'}`}
              disabled={busyAction !== null}
              value={selectedPhone}
              onChange={(event) => {
                actionGenerationRef.current += 1;
                setSelectedPhone(event.target.value);
                setFeedback('');
              }}
            >
              <option value="">Selecione um telefone</option>
              {actionablePhones.map((phone) => (
                <option key={phone} value={phone}>
                  {phone}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="conversation-shared-contact-actions">
          <button
            type="button"
            disabled={!selectedPhoneIsValid || busyAction !== null}
            onClick={() => void runAction('conversation')}
          >
            {busyAction === 'conversation' ? (
              <Loader2 aria-hidden="true" className="spin" size={14} />
            ) : (
              <MessagesSquare aria-hidden="true" size={14} />
            )}
            Iniciar conversa
          </button>
          <button
            type="button"
            disabled={!selectedPhoneIsValid || busyAction !== null}
            onClick={() => void runAction('client')}
          >
            {busyAction === 'client' ? (
              <Loader2 aria-hidden="true" className="spin" size={14} />
            ) : (
              <UserCheck aria-hidden="true" size={14} />
            )}
            Ver cliente
          </button>
        </div>

        {!actionablePhones.length ? (
          <span className="conversation-shared-contact-feedback" role="status">
            Número indisponível ou incompatível com o fluxo brasileiro atual.
          </span>
        ) : feedback ? (
          <span className="conversation-shared-contact-feedback" role="status">
            {feedback}
          </span>
        ) : null}
      </div>
    </article>
  );
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
  const isPdfDocument =
    message.type === 'DOCUMENT' && message.mediaMimeType?.toLowerCase() === 'application/pdf';
  const imageAutoVisible =
    (message.type === 'IMAGE' || message.type === 'STICKER') && message.mediaAvailable && !mediaUrl;
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
    if ((message.type !== 'IMAGE' && message.type !== 'STICKER') || !mediaVisible || mediaUrl) {
      return;
    }

    void loadMedia();
  }, [loadMedia, mediaUrl, mediaVisible, message.type]);

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
    ) : (
      <div className="conversation-media-unavailable" role="status">
        <span>{conversationMediaUnavailableText(message.type)}</span>
      </div>
    );
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

  if (message.type === 'STICKER' && !mediaUrl) {
    return (
      <div ref={visibilityRef} className="conversation-media-unavailable sticker-placeholder">
        <span>{loading ? 'Carregando figurinha...' : 'Figurinha disponível'}</span>
        {error ? <span>Falha ao carregar</span> : null}
        <button type="button" onClick={() => void loadMedia()}>
          {loading ? 'Carregando...' : error ? 'Tentar novamente' : 'Carregar figurinha'}
        </button>
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

  if (message.type === 'STICKER') {
    const stickerAlt = message.text || message.mediaFileName || 'Figurinha';

    if (message.mediaMimeType?.split(';')[0]?.trim().toLowerCase() === 'video/mp4') {
      return (
        <video
          aria-label={stickerAlt}
          autoPlay
          className="conversation-sticker-media"
          loop
          muted
          playsInline
          preload="metadata"
          src={mediaUrl}
        >
          <track kind="captions" />
        </video>
      );
    }

    return (
      <span className="conversation-sticker-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={stickerAlt} src={mediaUrl} />
      </span>
    );
  }

  if (message.type === 'IMAGE') {
    const imageAlt = message.text || message.mediaFileName || 'Imagem';

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
          <img alt={imageAlt} src={mediaUrl} />
        </button>
        {imageLightboxOpen ? (
          <WhatsAppImageLightbox alt={imageAlt} src={mediaUrl} onClose={closeImageLightbox} />
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
  blocked,
  composerRef,
  conversationId,
  draft,
  error,
  quickReplies,
  quickRepliesError,
  quickRepliesLoading,
  savedStickers,
  savedStickersError,
  savedStickersLoaded,
  savedStickersLoading,
  savedStickersNotice,
  deleteSavedStickerConfirmId,
  deletingSavedStickerIds,
  replyTarget,
  selectedMedia,
  sending,
  textOnly,
  onChange,
  onBlur,
  onCancelReply,
  onRemoveMedia,
  onSelectMedia,
  onDeleteSavedSticker,
  onDeleteSavedStickerConfirmChange,
  onLoadSavedStickers,
  onSend,
  onSendSavedSticker,
  onSendVoice,
  onVoiceRecordingChange,
}: {
  blocked: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  draft: string;
  error: string;
  quickReplies: WhatsAppQuickReply[];
  quickRepliesError: string;
  quickRepliesLoading: boolean;
  savedStickers: WhatsAppSavedSticker[];
  savedStickersError: string;
  savedStickersLoaded: boolean;
  savedStickersLoading: boolean;
  savedStickersNotice: string;
  deleteSavedStickerConfirmId: string | null;
  deletingSavedStickerIds: Set<string>;
  replyTarget: WhatsAppConversationMessage | null;
  selectedMedia: ConversationComposerMedia | null;
  sending: boolean;
  textOnly: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
  onCancelReply: () => void;
  onRemoveMedia: () => void;
  onSelectMedia: (kind: ConversationComposerMedia['kind'], file: File) => void;
  onDeleteSavedSticker: (sticker: WhatsAppSavedSticker) => void;
  onDeleteSavedStickerConfirmChange: (stickerId: string | null) => void;
  onLoadSavedStickers: () => void;
  onSend: () => void;
  onSendSavedSticker: (sticker: WhatsAppSavedSticker) => void;
  onSendVoice: (voice: ConversationVoiceDraft) => Promise<void>;
  onVoiceRecordingChange: (recording: boolean) => void;
}) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [savedStickerPickerOpen, setSavedStickerPickerOpen] = useState(false);
  const [savedStickerPreviewUrls, setSavedStickerPreviewUrls] = useState<Record<string, string>>(
    {},
  );
  const [loadingSavedStickerPreviewIds, setLoadingSavedStickerPreviewIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [failedSavedStickerPreviewIds, setFailedSavedStickerPreviewIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [quickReplyActiveIndex, setQuickReplyActiveIndex] = useState(0);
  const [quickReplySlashDismissedDraft, setQuickReplySlashDismissedDraft] = useState<string | null>(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<ConversationVoiceDraft | null>(null);
  const [voiceError, setVoiceError] = useState('');
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null);
  const composerContainerRef = useRef<HTMLFormElement | null>(null);
  const savedStickerPickerRef = useRef<HTMLDivElement | null>(null);
  const savedStickerPreviewUrlsRef = useRef(new Map<string, string>());
  const loadingSavedStickerPreviewIdsRef = useRef(new Set<string>());
  const savedStickerPreviewAbortRef = useRef(new Map<string, AbortController>());
  const savedStickerPickerOpenRef = useRef(false);
  const savedStickerIdsRef = useRef(new Set<string>());
  const composerMountedRef = useRef(false);
  const quickReplyMenuRef = useRef<HTMLDivElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const stoppingVoiceRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceSendingRef = useRef(false);
  const onVoiceRecordingChangeRef = useRef(onVoiceRecordingChange);
  const [quickReplyMenuViewportStyle, setQuickReplyMenuViewportStyle] =
    useState<React.CSSProperties>({});
  const hasText = Boolean(draft.trim());
  const hasSendableContent = Boolean(hasText || (!textOnly && selectedMedia));
  const actionMode = conversationComposerActionMode(draft, selectedMedia, sending);
  const shouldShowSendAction = actionMode === 'SEND';
  const canSend = hasSendableContent && !sending && !blocked;
  const canSendVoice = Boolean(voiceDraft) && !sending && !recording;
  const quickReplySlashQuery = whatsAppQuickReplySlashQuery(draft);
  const quickReplySlashMenuOpen =
    quickReplySlashQuery !== null && quickReplySlashDismissedDraft !== draft;
  const quickReplyMenuVisible = quickReplySlashMenuOpen;
  const quickReplyQuery = quickReplySlashQuery ?? '';
  const visibleQuickReplies = quickRepliesLoading
    ? []
    : filterWhatsAppQuickReplies(quickReplies, quickReplyQuery);
  const activeQuickReply =
    quickReplyActiveIndex >= 0 ? visibleQuickReplies[quickReplyActiveIndex] : undefined;
  const activeQuickReplyId = activeQuickReply
    ? `conversation-quick-reply-${activeQuickReply.id}`
    : undefined;
  const savedStickerDeleteCandidate =
    savedStickers.find((sticker) => sticker.id === deleteSavedStickerConfirmId) ?? null;

  useEffect(() => {
    onVoiceRecordingChangeRef.current = onVoiceRecordingChange;
  }, [onVoiceRecordingChange]);

  useEffect(() => {
    return () => {
      cancelVoiceRecording();
      onVoiceRecordingChangeRef.current(false);
    };
  }, [conversationId]);

  useEffect(() => {
    if (!quickReplyMenuVisible) return undefined;

    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!quickReplyMenuRef.current?.contains(target)) {
        if (quickReplySlashMenuOpen) {
          setQuickReplySlashDismissedDraft(draft);
        }
      }
    }

    function closeOnKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setQuickReplySlashDismissedDraft(draft);
        composerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnKeyDown, true);
    };
  }, [composerRef, draft, quickReplyMenuVisible, quickReplySlashMenuOpen]);

  useLayoutEffect(() => {
    if (!quickReplyMenuVisible) {
      setQuickReplyMenuViewportStyle({});
      return undefined;
    }

    function updateQuickReplyMenuViewportStyle() {
      const visualViewport = window.visualViewport;
      const position = calculateQuickReplyMenuViewportPosition({
        composerRect: composerContainerRef.current?.getBoundingClientRect() ?? null,
        viewportHeight: visualViewport?.height ?? window.innerHeight,
        viewportOffsetTop: visualViewport?.offsetTop ?? 0,
      });

      setQuickReplyMenuViewportStyle({
        '--conversation-quick-reply-menu-top': `${position.top}px`,
        '--conversation-quick-reply-menu-max-height': `${position.maxHeight}px`,
      } as React.CSSProperties);
    }

    updateQuickReplyMenuViewportStyle();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', updateQuickReplyMenuViewportStyle);
    visualViewport?.addEventListener('scroll', updateQuickReplyMenuViewportStyle);
    window.addEventListener('resize', updateQuickReplyMenuViewportStyle);
    window.addEventListener('orientationchange', updateQuickReplyMenuViewportStyle);

    return () => {
      visualViewport?.removeEventListener('resize', updateQuickReplyMenuViewportStyle);
      visualViewport?.removeEventListener('scroll', updateQuickReplyMenuViewportStyle);
      window.removeEventListener('resize', updateQuickReplyMenuViewportStyle);
      window.removeEventListener('orientationchange', updateQuickReplyMenuViewportStyle);
    };
  }, [quickReplyMenuVisible]);

  useEffect(() => {
    const root = document.documentElement;

    if (quickReplySlashMenuOpen) {
      root.dataset.conversationQuickReplyMenu = 'open';
      return () => {
        if (root.dataset.conversationQuickReplyMenu === 'open') {
          delete root.dataset.conversationQuickReplyMenu;
        }
      };
    }

    if (root.dataset.conversationQuickReplyMenu === 'open') {
      delete root.dataset.conversationQuickReplyMenu;
    }

    return undefined;
  }, [quickReplySlashMenuOpen]);

  useEffect(() => {
    if (quickReplySlashDismissedDraft !== null && quickReplySlashDismissedDraft !== draft) {
      setQuickReplySlashDismissedDraft(null);
    }
  }, [draft, quickReplySlashDismissedDraft]);

  useEffect(() => {
    if (!quickReplyMenuVisible) {
      setQuickReplyActiveIndex(0);
      return;
    }

    setQuickReplyActiveIndex((current) => {
      if (!visibleQuickReplies.length) return -1;
      if (current < 0) return 0;
      return Math.min(current, visibleQuickReplies.length - 1);
    });
  }, [quickReplyMenuVisible, visibleQuickReplies.length]);

  useEffect(() => {
    if (!attachmentMenuOpen) return undefined;

    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (attachmentMenuRef.current?.contains(target)) return;

      setAttachmentMenuOpen(false);
    }

    function closeOnKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      event.stopPropagation();
      setAttachmentMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnKeyDown, true);
    };
  }, [attachmentMenuOpen]);

  useEffect(() => {
    composerMountedRef.current = true;

    return () => {
      composerMountedRef.current = false;
      clearSavedStickerPreviewCache(undefined, { updateState: false });
    };
  }, []);

  useEffect(() => {
    savedStickerPickerOpenRef.current = savedStickerPickerOpen;
  }, [savedStickerPickerOpen]);

  useEffect(() => {
    closeSavedStickerPicker();
  }, [conversationId]);

  useEffect(() => {
    if (!savedStickerPickerOpen) {
      clearSavedStickerPreviewCache();
      onDeleteSavedStickerConfirmChange(null);
      return;
    }

    const availableStickerIds = new Set(savedStickers.map((sticker) => sticker.id));
    savedStickerIdsRef.current = availableStickerIds;

    savedStickerPreviewUrlsRef.current.forEach((objectUrl, stickerId) => {
      if (!availableStickerIds.has(stickerId)) {
        URL.revokeObjectURL(objectUrl);
        savedStickerPreviewUrlsRef.current.delete(stickerId);
        savedStickerPreviewAbortRef.current.get(stickerId)?.abort();
        savedStickerPreviewAbortRef.current.delete(stickerId);
        loadingSavedStickerPreviewIdsRef.current.delete(stickerId);
      }
    });

    setSavedStickerPreviewUrls(Object.fromEntries(savedStickerPreviewUrlsRef.current));
    setLoadingSavedStickerPreviewIds((current) => {
      const next = new Set([...current].filter((stickerId) => availableStickerIds.has(stickerId)));
      return next.size === current.size ? current : next;
    });
    setFailedSavedStickerPreviewIds((current) => {
      const next = new Set([...current].filter((stickerId) => availableStickerIds.has(stickerId)));
      return next.size === current.size ? current : next;
    });

    savedStickers.forEach((sticker) => {
      if (savedStickerPreviewKind(sticker.mimeType) === 'unsupported') {
        markSavedStickerPreviewFailed(sticker.id);
        return;
      }

      void loadSavedStickerPreview(sticker);
    });
  }, [onDeleteSavedStickerConfirmChange, savedStickerPickerOpen, savedStickers]);

  useEffect(() => {
    if (!savedStickerPickerOpen && !deleteSavedStickerConfirmId) return undefined;

    function closeOnPointerDown(event: PointerEvent) {
      if (deleteSavedStickerConfirmId) return;

      const target = event.target as Node;

      if (savedStickerPickerRef.current?.contains(target)) return;
      closeSavedStickerPicker();
    }

    function closeOnKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();

      if (deleteSavedStickerConfirmId) {
        onDeleteSavedStickerConfirmChange(null);
        return;
      }

      closeSavedStickerPicker();
    }

    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnKeyDown, true);
    };
  }, [deleteSavedStickerConfirmId, savedStickerPickerOpen, onDeleteSavedStickerConfirmChange]);

  function selectFile(kind: ConversationComposerMedia['kind'], file: File | undefined) {
    if (!file) return;
    onSelectMedia(kind, file);
    setAttachmentMenuOpen(false);
    closeSavedStickerPicker();
  }

  function openSavedStickerPicker() {
    setAttachmentMenuOpen(false);
    setSavedStickerPickerOpen((current) => {
      const next = !current;

      if (next && !savedStickersLoaded) {
        onLoadSavedStickers();
      }

      return next;
    });
  }

  function sendSavedSticker(sticker: WhatsAppSavedSticker) {
    closeSavedStickerPicker();
    onSendSavedSticker(sticker);
  }

  function closeSavedStickerPicker() {
    setSavedStickerPickerOpen(false);
    onDeleteSavedStickerConfirmChange(null);
  }

  function clearSavedStickerPreviewCache(
    stickerId?: string,
    options: { updateState?: boolean } = {},
  ) {
    const updateState = options.updateState ?? true;
    const stickerIds = stickerId ? [stickerId] : [...savedStickerPreviewUrlsRef.current.keys()];

    stickerIds.forEach((currentStickerId) => {
      const objectUrl = savedStickerPreviewUrlsRef.current.get(currentStickerId);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        savedStickerPreviewUrlsRef.current.delete(currentStickerId);
      }

      savedStickerPreviewAbortRef.current.get(currentStickerId)?.abort();
      savedStickerPreviewAbortRef.current.delete(currentStickerId);
      loadingSavedStickerPreviewIdsRef.current.delete(currentStickerId);
    });

    if (!updateState || !composerMountedRef.current) return;

    setSavedStickerPreviewUrls(Object.fromEntries(savedStickerPreviewUrlsRef.current));
    setLoadingSavedStickerPreviewIds(new Set(loadingSavedStickerPreviewIdsRef.current));
  }

  async function loadSavedStickerPreview(sticker: WhatsAppSavedSticker) {
    const stickerId = sticker.id;

    if (
      savedStickerPreviewUrlsRef.current.has(stickerId) ||
      loadingSavedStickerPreviewIdsRef.current.has(stickerId) ||
      failedSavedStickerPreviewIds.has(stickerId)
    ) {
      return;
    }

    const controller = new AbortController();
    savedStickerPreviewAbortRef.current.set(stickerId, controller);
    loadingSavedStickerPreviewIdsRef.current.add(stickerId);
    setLoadingSavedStickerPreviewIds(new Set(loadingSavedStickerPreviewIdsRef.current));

    try {
      const blob = await getWhatsAppSavedStickerMediaBlob(stickerId, { signal: controller.signal });
      if (
        controller.signal.aborted ||
        !composerMountedRef.current ||
        !savedStickerPickerOpenRef.current ||
        !savedStickerIdsRef.current.has(stickerId)
      ) {
        return;
      }

      const expectedMimeType = savedStickerPreviewMimeType(sticker.mimeType);
      const blobMimeType = savedStickerPreviewMimeType(blob.type);

      if (!blob.size || !expectedMimeType || blobMimeType !== expectedMimeType) {
        throw new Error('Invalid saved sticker preview blob.');
      }

      const objectUrl = URL.createObjectURL(blob);
      const previousObjectUrl = savedStickerPreviewUrlsRef.current.get(stickerId);
      if (previousObjectUrl) {
        URL.revokeObjectURL(previousObjectUrl);
      }

      savedStickerPreviewUrlsRef.current.set(stickerId, objectUrl);
      setSavedStickerPreviewUrls(Object.fromEntries(savedStickerPreviewUrlsRef.current));
    } catch {
      if (controller.signal.aborted) return;
      markSavedStickerPreviewFailed(stickerId);
    } finally {
      savedStickerPreviewAbortRef.current.delete(stickerId);
      loadingSavedStickerPreviewIdsRef.current.delete(stickerId);
      if (composerMountedRef.current && savedStickerPickerOpenRef.current) {
        setLoadingSavedStickerPreviewIds(new Set(loadingSavedStickerPreviewIdsRef.current));
      }
    }
  }

  function markSavedStickerPreviewFailed(stickerId: string) {
    clearSavedStickerPreviewCache(stickerId);
    setFailedSavedStickerPreviewIds((current) => {
      if (current.has(stickerId)) return current;

      const next = new Set(current);
      next.add(stickerId);
      return next;
    });
  }

  function applyQuickReply(reply: WhatsAppQuickReply) {
    const result = applyWhatsAppSlashQuickReply(reply.text);

    onChange(result.text);
    setQuickReplySlashDismissedDraft(null);

    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function selectActiveQuickReply() {
    if (!activeQuickReply) return;
    applyQuickReply(activeQuickReply);
  }

  function moveActiveQuickReply(step: 1 | -1) {
    if (!visibleQuickReplies.length) return;

    setQuickReplyActiveIndex((current) => {
      const safeCurrent = current < 0 ? 0 : current;
      return (safeCurrent + step + visibleQuickReplies.length) % visibleQuickReplies.length;
    });
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
    onVoiceRecordingChangeRef.current(false);
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
        onVoiceRecordingChangeRef.current(false);
        finishRecording(true);
      };
      recorder.onstop = () => {
        handleRecorderStop(recorder);
      };

      recorder.start();
      setRecording(true);
      onVoiceRecordingChangeRef.current(true);
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
      onVoiceRecordingChangeRef.current(false);
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
      ref={composerContainerRef}
      className={`conversation-composer ${quickReplyMenuVisible ? 'has-quick-reply-menu' : ''} ${
        quickReplySlashMenuOpen ? 'has-slash-quick-reply-menu' : ''
      }`.trim()}
      onSubmit={(event) => {
        event.preventDefault();
        if (quickReplySlashMenuOpen) {
          selectActiveQuickReply();
          return;
        }
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
      {blocked ? (
        <div className="notice warning conversation-notice" role="status">
          O envio internacional está indisponível. Seu rascunho será preservado.
        </div>
      ) : textOnly ? (
        <div className="notice info conversation-notice" role="status">
          Conversa internacional: somente texto manual simples está disponível.
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
          {(selectedMedia.kind === 'IMAGE' || selectedMedia.kind === 'STICKER') &&
          selectedMedia.previewUrl ? (
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
        <div ref={attachmentMenuRef} className="conversation-attach-control">
          <IconButton
            icon={Plus}
            label="Anexar arquivo"
            disabled={blocked || textOnly || recording || sending}
            onClick={() => {
              setAttachmentMenuOpen((current) => !current);
            }}
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
              <button type="button" onClick={openSavedStickerPicker}>
                <MessagesSquare aria-hidden="true" size={16} />
                <span>Figurinhas</span>
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
      {savedStickerPickerOpen ? (
        <div ref={savedStickerPickerRef} className="conversation-saved-sticker-picker">
          {savedStickersLoading ? (
            <div className="conversation-saved-sticker-state">Carregando...</div>
          ) : savedStickersError ? (
            <div className="conversation-saved-sticker-state warning">{savedStickersError}</div>
          ) : savedStickers.length ? (
            <>
              {savedStickersNotice ? (
                <div className="conversation-saved-sticker-state success">
                  {savedStickersNotice}
                </div>
              ) : null}
              <div className="conversation-saved-sticker-grid">
                {savedStickers.map((sticker) => {
                  const deleting = deletingSavedStickerIds.has(sticker.id);
                  const previewKind = savedStickerPreviewKind(sticker.mimeType);
                  const previewUrl = savedStickerPreviewUrls[sticker.id];
                  const previewLoading = loadingSavedStickerPreviewIds.has(sticker.id);
                  const previewFailed = failedSavedStickerPreviewIds.has(sticker.id);

                  return (
                    <div className="conversation-saved-sticker-item" key={sticker.id}>
                      <button
                        type="button"
                        className="conversation-saved-sticker-thumb"
                        disabled={sending || deleting || previewLoading}
                        onClick={() => sendSavedSticker(sticker)}
                        aria-label="Enviar figurinha salva"
                      >
                        {previewLoading ? (
                          <span
                            className="conversation-saved-sticker-placeholder loading"
                            aria-label="Carregando prévia da figurinha"
                          />
                        ) : previewUrl && previewKind === 'image' && !previewFailed ? (
                          <span className="conversation-saved-sticker-preview">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              alt=""
                              decoding="async"
                              loading="lazy"
                              src={previewUrl}
                              onError={() => markSavedStickerPreviewFailed(sticker.id)}
                            />
                          </span>
                        ) : previewUrl && previewKind === 'video' && !previewFailed ? (
                          <video
                            aria-label="Prévia da figurinha salva"
                            autoPlay
                            className="conversation-saved-sticker-preview"
                            loop
                            muted
                            playsInline
                            preload="metadata"
                            src={previewUrl}
                            onError={() => markSavedStickerPreviewFailed(sticker.id)}
                          >
                            <track kind="captions" />
                          </video>
                        ) : (
                          <span className="conversation-saved-sticker-placeholder">
                            <ImageIcon aria-hidden="true" size={18} />
                            <span>Indisponível</span>
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="conversation-saved-sticker-delete"
                        disabled={deleting}
                        aria-label="Excluir figurinha salva"
                        title="Excluir"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteSavedStickerConfirmChange(sticker.id);
                        }}
                      >
                        {deleting ? (
                          <Loader2 aria-hidden="true" size={13} />
                        ) : (
                          <Trash2 aria-hidden="true" size={13} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="conversation-saved-sticker-state">
              <strong>Nenhuma figurinha salva.</strong>
              <span>Salve uma figurinha recebida para encontrá-la aqui.</span>
            </div>
          )}
        </div>
      ) : null}
      {savedStickerDeleteCandidate ? (
        <div
          className="conversation-saved-sticker-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onDeleteSavedStickerConfirmChange(null);
            }
          }}
        >
          <div
            aria-modal="true"
            className="conversation-saved-sticker-modal"
            role="dialog"
            aria-labelledby="conversation-saved-sticker-delete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="conversation-saved-sticker-delete-title">Excluir figurinha salva?</h2>
            <p>Esta ação removerá a figurinha da sua biblioteca.</p>
            {savedStickersError ? (
              <div className="conversation-saved-sticker-modal-error" role="alert">
                {savedStickersError}
              </div>
            ) : null}
            <div className="conversation-saved-sticker-modal-actions">
              <button
                type="button"
                disabled={deletingSavedStickerIds.has(savedStickerDeleteCandidate.id)}
                onClick={() => onDeleteSavedStickerConfirmChange(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deletingSavedStickerIds.has(savedStickerDeleteCandidate.id)}
                onClick={() => onDeleteSavedSticker(savedStickerDeleteCandidate)}
              >
                {deletingSavedStickerIds.has(savedStickerDeleteCandidate.id)
                  ? 'Excluindo...'
                  : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {quickReplyMenuVisible ? (
        <div
          className="conversation-quick-reply-menu conversation-quick-reply-menu-slash"
          ref={quickReplyMenuRef}
          style={quickReplyMenuViewportStyle}
        >
          <div
            aria-activedescendant={activeQuickReplyId}
            className="conversation-quick-reply-list"
            id="conversation-quick-reply-list"
            role="listbox"
          >
            {quickRepliesLoading ? (
              <span className="conversation-quick-reply-empty">Carregando respostas...</span>
            ) : quickRepliesError ? (
              <>
                <span className="conversation-quick-reply-empty conversation-quick-reply-warning">
                  {quickRepliesError}
                </span>
                {visibleQuickReplies.length ? (
                  visibleQuickReplies.map((reply, index) => (
                    <button
                      key={reply.id}
                      id={`conversation-quick-reply-${reply.id}`}
                      className="conversation-quick-reply-option"
                      type="button"
                      aria-selected={index === quickReplyActiveIndex}
                      role="option"
                      onClick={() => applyQuickReply(reply)}
                    >
                      <strong>{reply.label}</strong>
                      <small>{whatsAppQuickReplyPreview(reply.text)}</small>
                    </button>
                  ))
                ) : (
                  <span className="conversation-quick-reply-empty">
                    Nenhuma resposta rápida disponível.
                  </span>
                )}
              </>
            ) : visibleQuickReplies.length ? (
              visibleQuickReplies.map((reply, index) => (
                <button
                  key={reply.id}
                  id={`conversation-quick-reply-${reply.id}`}
                  className="conversation-quick-reply-option"
                  type="button"
                  aria-selected={index === quickReplyActiveIndex}
                  role="option"
                  onClick={() => applyQuickReply(reply)}
                >
                  <strong>{reply.label}</strong>
                  <small>{whatsAppQuickReplyPreview(reply.text)}</small>
                </button>
              ))
            ) : (
              <span className="conversation-quick-reply-empty">
                {quickReplies.length
                  ? 'Nenhuma resposta encontrada.'
                  : 'Nenhuma resposta rápida disponível.'}
              </span>
            )}
          </div>
        </div>
      ) : null}
      <label>
        <span className="sr-only">Digite uma mensagem</span>
        <textarea
          aria-label="Digite uma mensagem"
          aria-busy={sending}
          aria-expanded={quickReplySlashMenuOpen}
          aria-activedescendant={quickReplySlashMenuOpen ? activeQuickReplyId : undefined}
          aria-controls={quickReplySlashMenuOpen ? 'conversation-quick-reply-list' : undefined}
          ref={composerRef}
          disabled={blocked}
          placeholder="Digite uma mensagem..."
          rows={2}
          value={draft}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={(event) => {
            if (quickReplySlashMenuOpen) {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                setQuickReplySlashDismissedDraft(draft);
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveActiveQuickReply(1);
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveActiveQuickReply(-1);
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                selectActiveQuickReply();
                return;
              }
            }
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
          disabled={blocked || textOnly || recording || sending || Boolean(voiceDraft)}
          onClick={() => void startVoiceRecording()}
        />
      )}
    </form>
  );
}

function attendanceDurationLabel(start: string, end: string) {
  const milliseconds = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

function attendanceCompactDurationLabel(start: string, end: string | null) {
  if (!end) return '-';
  const milliseconds = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatAttendanceCompactDate(value: string) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} · ${part('hour')}:${part('minute')}`;
}

function attendanceElapsedLabel(openedAt: string) {
  return attendanceDurationLabel(openedAt, new Date().toISOString());
}

function attendanceStatusLabel(status: WhatsAppAttendance['status']) {
  if (status === 'PENDING') return 'Pendente';
  if (status === 'IN_PROGRESS') return 'Em atendimento';
  return 'Resolvido';
}

function autoReplyModeLabel(mode: WhatsAppAttendance['autoReply']['mode']) {
  if (mode === 'AWAY') return 'Ausente';
  if (mode === 'SERVICE_UNAVAILABLE') return 'Indisponibilidade';
  if (mode === 'CUSTOM') return 'Personalizada';
  return 'Automática';
}

function formatAutoReplyTime(value: string | null) {
  if (!value) return 'horário indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function formatAutoReplyDateTime(value: string | null) {
  if (!value) return 'data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function ConversationAttendanceHistory({
  attendances,
  error,
  hasMore,
  loading,
  onLoadMore,
}: {
  attendances: WhatsAppAttendance[];
  error: string;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const [expandedAttendanceId, setExpandedAttendanceId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedAttendanceId((current) =>
      current && attendances.some((attendance) => attendance.id === current) ? current : null,
    );
  }, [attendances]);

  return (
    <section className="conversation-contact-section conversation-attendance-history">
      <div className="conversation-contact-section-title">
        <span>Atendimentos</span>
      </div>
      {loading ? (
        <div className="conversation-loading-row">
          <Loader2 aria-hidden="true" size={15} /> Carregando atendimentos...
        </div>
      ) : null}
      {error ? <div className="notice danger">{error}</div> : null}
      {!loading && !error && !attendances.length ? (
        <p className="muted-value">Nenhum atendimento registrado.</p>
      ) : null}
      <div className="conversation-attendance-list">
        {attendances.map((attendance) => {
          const expanded = expandedAttendanceId === attendance.id;
          const detailsId = `attendance-history-details-${attendance.id}`;
          const categoryName =
            attendance.category?.name ?? attendanceStatusLabel(attendance.status);

          return (
            <article
              key={attendance.id}
              className={`conversation-attendance-item${expanded ? ' is-expanded' : ''}`}
            >
              <button
                type="button"
                className="conversation-attendance-toggle"
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={() =>
                  setExpandedAttendanceId((current) =>
                    current === attendance.id ? null : attendance.id,
                  )
                }
              >
                <span className="conversation-attendance-primary-row">
                  <strong title={categoryName}>{categoryName}</strong>
                  <span className={`attendance-status ${attendance.status.toLowerCase()}`}>
                    {attendanceStatusLabel(attendance.status)}
                  </span>
                </span>
                <span className="conversation-attendance-compact-date">
                  <time dateTime={attendance.openedAt}>
                    {formatAttendanceCompactDate(attendance.openedAt)}
                  </time>
                  {attendance.autoReply.sent ? (
                    <span
                      className="conversation-attendance-auto-reply-indicator"
                      title="Resposta automática enviada"
                    >
                      <Bot aria-hidden="true" size={13} />
                      <span className="sr-only">Resposta automática enviada</span>
                    </span>
                  ) : null}
                </span>
                <span className="conversation-attendance-compact-metrics">
                  Resp.{' '}
                  {attendanceCompactDurationLabel(
                    attendance.openedAt,
                    attendance.firstAgentReplyAt,
                  )}{' '}
                  · Total{' '}
                  {attendanceCompactDurationLabel(attendance.openedAt, attendance.resolvedAt)}
                </span>
                {attendance.resolutionNote ? (
                  <span className="conversation-attendance-note-preview">
                    {attendance.resolutionNote}
                  </span>
                ) : null}
                <ChevronDown
                  aria-hidden="true"
                  className="conversation-attendance-chevron"
                  size={17}
                />
              </button>
              {expanded ? (
                <div id={detailsId} className="conversation-attendance-details">
                  <strong className="conversation-attendance-full-category">{categoryName}</strong>
                  <time dateTime={attendance.openedAt}>
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                      timeZone: 'America/Sao_Paulo',
                    }).format(new Date(attendance.openedAt))}
                  </time>
                  <dl>
                    <div>
                      <dt>Primeira resposta</dt>
                      <dd>
                        {attendance.firstAgentReplyAt
                          ? attendanceDurationLabel(
                              attendance.openedAt,
                              attendance.firstAgentReplyAt,
                            )
                          : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>Tempo total</dt>
                      <dd>
                        {attendance.resolvedAt
                          ? attendanceDurationLabel(attendance.openedAt, attendance.resolvedAt)
                          : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>Recebidas</dt>
                      <dd>{attendance.inboundMessagesCount}</dd>
                    </div>
                    <div>
                      <dt>Manuais</dt>
                      <dd>{attendance.outboundMessagesCount}</dd>
                    </div>
                  </dl>
                  {attendance.autoReply.sent ? (
                    <div className="attendance-history-auto-reply">
                      <Bot aria-hidden="true" size={14} />
                      <span>
                        Resposta automática: Sim · {autoReplyModeLabel(attendance.autoReply.mode)} ·{' '}
                        {formatAutoReplyDateTime(attendance.autoReply.lastSentAt)}
                        {attendance.autoReply.count && attendance.autoReply.count > 1
                          ? ` · ${attendance.autoReply.count} envios`
                          : ''}
                      </span>
                    </div>
                  ) : null}
                  {attendance.resolutionNote ? (
                    <p className="conversation-attendance-full-note">{attendance.resolutionNote}</p>
                  ) : null}
                  {attendance.resolvedBy ? (
                    <small>Resolvido por {attendance.resolvedBy.name}</small>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {hasMore ? (
        <Button disabled={loading} size="sm" variant="secondary" onClick={onLoadMore}>
          Ver mais
        </Button>
      ) : null}
    </section>
  );
}

function ConversationClientPanel({
  attendances,
  attendancesError,
  attendancesHasMore,
  attendancesLoading,
  avatar,
  contactInfo,
  conversation,
  linkClientError,
  linkingClient,
  lifecycleBusyReferenceId,
  lifecyclePlansLoading,
  open,
  pixBusyReceivableId,
  pixWhatsAppBusyIntentIds,
  waitingClockNow,
  onClose,
  onCopyPix,
  onCreateClient,
  onGeneratePix,
  onRecreatePix,
  onReactivateReference,
  onSendPixWhatsApp,
  onRenewReference,
  onSaveInternalNotes,
  onLinkClient,
  onLoadMoreAttendances,
  onOpenClient,
  onViewReceivable,
}: {
  attendances: WhatsAppAttendance[];
  attendancesError: string;
  attendancesHasMore: boolean;
  attendancesLoading: boolean;
  avatar?: ConversationAvatarState | undefined;
  contactInfo: ConversationContactInfoState;
  conversation: WhatsAppConversation | null;
  linkClientError: string;
  linkingClient: boolean;
  lifecycleBusyReferenceId: string | null;
  lifecyclePlansLoading: boolean;
  open: boolean;
  pixBusyReceivableId: string | null;
  pixWhatsAppBusyIntentIds: ReadonlySet<string>;
  waitingClockNow: number;
  onClose: () => void;
  onCopyPix: (intent: PaymentIntent) => void;
  onCreateClient: (conversation: WhatsAppConversation) => void;
  onGeneratePix: (receivable: Receivable) => void;
  onRecreatePix: (receivable: Receivable, intent: PaymentIntent) => void;
  onReactivateReference: (reference: ClientReference) => void;
  onSendPixWhatsApp: (receivable: Receivable, intent: PaymentIntent) => void;
  onRenewReference: (reference: ClientReference) => void;
  onSaveInternalNotes: (clientId: string, notes: string) => Promise<void>;
  onLinkClient: (client: ClientOption) => void;
  onLoadMoreAttendances: () => void;
  onOpenClient: (clientId: string) => void;
  onViewReceivable: (clientId: string, receivable: Receivable) => void;
}) {
  const [activeTab, setActiveTab] = useState<ContactDrawerTab>('summary');

  useEffect(() => {
    setActiveTab('summary');
  }, [conversation?.id, open]);

  if (!open) return null;

  const loadedClient = contactInfo.client;

  function selectTab(tab: ContactDrawerTab) {
    setActiveTab(tab);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = contactDrawerTabs.findIndex((tab) => tab.id === activeTab);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? contactDrawerTabs.length - 1
          : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + contactDrawerTabs.length) %
            contactDrawerTabs.length;
    const nextTab = contactDrawerTabs[nextIndex];
    if (!nextTab) return;

    selectTab(nextTab.id);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-contact-tab="${nextTab.id}"]`)
      ?.focus();
  }

  return (
    <div className="conversation-contact-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="conversation-client-panel conversation-contact-drawer"
        aria-labelledby="conversation-contact-name"
        aria-modal="true"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="conversation-contact-drawer-header">
          {conversation ? (
            <ConversationContactHeader
              avatar={avatar}
              conversation={conversation}
              linked={Boolean(conversation.client)}
              linkedClient={loadedClient}
              {...(loadedClient ? { onOpenClient: () => onOpenClient(loadedClient.id) } : {})}
            />
          ) : (
            <h2 id="conversation-contact-name">Contato</h2>
          )}
          <IconButton icon={X} label="Fechar informações do contato" onClick={onClose} />
        </header>
        <div
          aria-label="Seções das informações do contato"
          className="conversation-contact-tabs"
          role="tablist"
        >
          {contactDrawerTabs.map((tab) => (
            <button
              aria-controls={`conversation-contact-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              data-contact-tab={tab.id}
              id={`conversation-contact-tab-${tab.id}`}
              key={tab.id}
              role="tab"
              tabIndex={activeTab === tab.id ? 0 : -1}
              type="button"
              onClick={() => selectTab(tab.id)}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          aria-labelledby={`conversation-contact-tab-${activeTab}`}
          className="conversation-contact-tabpanel"
          id={`conversation-contact-panel-${activeTab}`}
          role="tabpanel"
        >
          <ConversationClientPanelContent
            activeTab={activeTab}
            attendances={attendances}
            attendancesError={attendancesError}
            attendancesHasMore={attendancesHasMore}
            attendancesLoading={attendancesLoading}
            contactInfo={contactInfo}
            conversation={conversation}
            linkClientError={linkClientError}
            linkingClient={linkingClient}
            lifecycleBusyReferenceId={lifecycleBusyReferenceId}
            lifecyclePlansLoading={lifecyclePlansLoading}
            pixBusyReceivableId={pixBusyReceivableId}
            pixWhatsAppBusyIntentIds={pixWhatsAppBusyIntentIds}
            waitingClockNow={waitingClockNow}
            onCopyPix={onCopyPix}
            onCreateClient={onCreateClient}
            onGeneratePix={onGeneratePix}
            onRecreatePix={onRecreatePix}
            onReactivateReference={onReactivateReference}
            onSendPixWhatsApp={onSendPixWhatsApp}
            onRenewReference={onRenewReference}
            onSaveInternalNotes={onSaveInternalNotes}
            onLinkClient={onLinkClient}
            onLoadMoreAttendances={onLoadMoreAttendances}
            onOpenClient={onOpenClient}
            onViewReceivable={onViewReceivable}
          />
        </div>
      </aside>
    </div>
  );
}

function ConversationClientPanelContent({
  activeTab,
  attendances,
  attendancesError,
  attendancesHasMore,
  attendancesLoading,
  contactInfo,
  conversation,
  linkClientError,
  linkingClient,
  lifecycleBusyReferenceId,
  lifecyclePlansLoading,
  pixBusyReceivableId,
  pixWhatsAppBusyIntentIds,
  waitingClockNow,
  onCopyPix,
  onCreateClient,
  onGeneratePix,
  onRecreatePix,
  onReactivateReference,
  onSendPixWhatsApp,
  onRenewReference,
  onSaveInternalNotes,
  onLinkClient,
  onLoadMoreAttendances,
  onOpenClient,
  onViewReceivable,
}: {
  activeTab: ContactDrawerTab;
  attendances: WhatsAppAttendance[];
  attendancesError: string;
  attendancesHasMore: boolean;
  attendancesLoading: boolean;
  contactInfo: ConversationContactInfoState;
  conversation: WhatsAppConversation | null;
  linkClientError: string;
  linkingClient: boolean;
  lifecycleBusyReferenceId: string | null;
  lifecyclePlansLoading: boolean;
  pixBusyReceivableId: string | null;
  pixWhatsAppBusyIntentIds: ReadonlySet<string>;
  waitingClockNow: number;
  onCopyPix: (intent: PaymentIntent) => void;
  onCreateClient: (conversation: WhatsAppConversation) => void;
  onGeneratePix: (receivable: Receivable) => void;
  onRecreatePix: (receivable: Receivable, intent: PaymentIntent) => void;
  onReactivateReference: (reference: ClientReference) => void;
  onSendPixWhatsApp: (receivable: Receivable, intent: PaymentIntent) => void;
  onRenewReference: (reference: ClientReference) => void;
  onSaveInternalNotes: (clientId: string, notes: string) => Promise<void>;
  onLinkClient: (client: ClientOption) => void;
  onLoadMoreAttendances: () => void;
  onOpenClient: (clientId: string) => void;
  onViewReceivable: (clientId: string, receivable: Receivable) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState('');
  const client = contactInfo.client;
  const notesContextRef = useRef({
    clientId: client?.id ?? null,
    conversationId: conversation?.id ?? null,
  });
  const financialSummary = client
    ? buildContactFinancialSummary(client.references ?? [], contactInfo.receivables)
    : null;
  const recentActivity = client
    ? buildContactRecentActivity({
        clientEvents: client.events ?? [],
        receivables: contactInfo.receivables,
        renewals: client.renewals ?? [],
      })
    : [];
  const hasFinancialData = Boolean(
    client &&
    ((client.references?.length ?? 0) > 0 ||
      contactInfo.receivables.length > 0 ||
      recentActivity.length > 0),
  );

  useEffect(() => {
    notesContextRef.current = {
      clientId: client?.id ?? null,
      conversationId: conversation?.id ?? null,
    };
  });

  useEffect(() => {
    setLinkOpen(false);
    setSelectedClientId('');
    setSelectedClient(null);
    setNotesEditing(false);
    setNotesDraft(client?.notes ?? '');
    setNotesSaving(false);
    setNotesError('');
  }, [conversation?.id, client?.id]);

  useEffect(() => {
    if (!notesEditing) setNotesDraft(client?.notes ?? '');
  }, [client?.notes, notesEditing]);

  async function saveInternalNotes() {
    if (!client || notesSaving) return;

    const requestContext = {
      clientId: client.id,
      conversationId: conversation?.id ?? null,
    };
    setNotesSaving(true);
    setNotesError('');
    try {
      await onSaveInternalNotes(client.id, notesDraft);
      const currentContext = notesContextRef.current;
      if (
        currentContext.clientId === requestContext.clientId &&
        currentContext.conversationId === requestContext.conversationId
      ) {
        setNotesEditing(false);
      }
    } catch (err) {
      const currentContext = notesContextRef.current;
      if (
        currentContext.clientId === requestContext.clientId &&
        currentContext.conversationId === requestContext.conversationId
      ) {
        setNotesError(conversationErrorMessage(err, 'Não foi possível salvar a nota interna.'));
      }
    } finally {
      const currentContext = notesContextRef.current;
      if (
        currentContext.clientId === requestContext.clientId &&
        currentContext.conversationId === requestContext.conversationId
      ) {
        setNotesSaving(false);
      }
    }
  }

  if (!conversation) {
    return (
      <div className="conversation-empty-panel">
        <Info aria-hidden="true" size={22} />
        <span>Selecione uma conversa para ver o contexto.</span>
      </div>
    );
  }

  const phoneLabel = conversationDisplayPhone(conversation);

  if (activeTab === 'attendances') {
    return (
      <div className="conversation-contact-tab-content">
        <ConversationAttendanceHistory
          attendances={attendances}
          error={attendancesError}
          hasMore={attendancesHasMore}
          loading={attendancesLoading}
          onLoadMore={onLoadMoreAttendances}
        />
      </div>
    );
  }

  const linkedConversation = Boolean(conversation.client);
  if (linkedConversation && !client) {
    return (
      <div className="conversation-contact-tab-content">
        {contactInfo.loading ? (
          <div className="conversation-loading-row" role="status">
            <Loader2 aria-hidden="true" size={15} />
            Carregando informações...
          </div>
        ) : null}
        {contactInfo.error ? (
          <div className="notice danger conversation-notice" role="alert">
            {contactInfo.error}
          </div>
        ) : null}
      </div>
    );
  }

  if (client && activeTab === 'financial' && !hasFinancialData) {
    return (
      <div className="conversation-contact-tab-content">
        {contactInfo.loading ? (
          <div className="conversation-loading-row" role="status">
            <Loader2 aria-hidden="true" size={15} />
            Atualizando informações financeiras...
          </div>
        ) : null}
        {contactInfo.error ? (
          <div className="notice danger conversation-notice" role="alert">
            {contactInfo.error}
          </div>
        ) : null}
        {!contactInfo.loading && !contactInfo.error ? (
          <div className="conversation-empty-panel conversation-tab-empty">
            <Info aria-hidden="true" size={22} />
            <span>Nenhuma cobrança encontrada.</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (client && activeTab === 'financial') {
    return (
      <div className="conversation-contact-tab-content conversation-financial-tab">
        {contactInfo.loading ? (
          <div className="conversation-loading-row" role="status">
            <Loader2 aria-hidden="true" size={15} />
            Atualizando informações financeiras...
          </div>
        ) : null}
        {contactInfo.error ? (
          <div className="notice danger conversation-notice" role="alert">
            {contactInfo.error}
          </div>
        ) : null}
        {contactInfo.notice ? (
          <div className="notice success conversation-notice">{contactInfo.notice}</div>
        ) : null}
        {financialSummary ? <ConversationFinancialSummary summary={financialSummary} /> : null}
        <ConversationReferenceList
          allowPixWhatsApp={!isInternationalWhatsAppConversation(conversation)}
          client={client}
          lifecycleBusyReferenceId={lifecycleBusyReferenceId}
          lifecyclePlansLoading={lifecyclePlansLoading}
          pixBusyReceivableId={pixBusyReceivableId}
          pixWhatsAppBusyIntentIds={pixWhatsAppBusyIntentIds}
          pixIntent={contactInfo.pixIntent}
          receivables={contactInfo.receivables}
          onCopyPix={onCopyPix}
          onGeneratePix={onGeneratePix}
          onRecreatePix={onRecreatePix}
          onReactivateReference={onReactivateReference}
          onSendPixWhatsApp={onSendPixWhatsApp}
          onRenewReference={onRenewReference}
          onOpenClient={onOpenClient}
          onViewReceivable={onViewReceivable}
        />
        <ConversationRecentActivity
          clientId={client.id}
          items={recentActivity}
          receivables={contactInfo.receivables}
          onViewReceivable={onViewReceivable}
        />
      </div>
    );
  }

  if (client) {
    return (
      <div className="conversation-contact-tab-content conversation-summary-tab">
        <ConversationActiveAttendanceSummary
          attendance={conversation.activeAttendance}
          nowMs={waitingClockNow}
        />
        {contactInfo.error ? (
          <div className="notice danger conversation-notice" role="alert">
            {contactInfo.error}
          </div>
        ) : null}
        {contactInfo.notice ? (
          <div className="notice success conversation-notice">{contactInfo.notice}</div>
        ) : null}
        <section className="conversation-contact-section conversation-client-summary">
          <div className="conversation-contact-section-title">
            <span>Cliente</span>
          </div>
          <dl className="detail-list conversation-client-summary-grid">
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
              <dd>
                <ConversationStatusBadge status={client.status} />
              </dd>
            </div>
          </dl>
        </section>
        {financialSummary ? <ConversationFinancialOverview summary={financialSummary} /> : null}
        <section className="conversation-contact-section conversation-internal-notes">
          <div className="conversation-contact-section-title">
            <span>Notas internas</span>
            {!notesEditing ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setNotesDraft(client.notes ?? '');
                  setNotesError('');
                  setNotesEditing(true);
                }}
              >
                {client.notes ? 'Editar' : 'Adicionar nota'}
              </Button>
            ) : null}
          </div>
          {notesEditing ? (
            <div className="conversation-internal-notes-editor">
              <textarea
                aria-label="Nota interna do cliente"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                disabled={notesSaving}
                rows={4}
              />
              {notesError ? (
                <div className="error-message" role="alert">
                  {notesError}
                </div>
              ) : null}
              <div className="conversation-internal-notes-actions">
                <Button size="sm" onClick={() => void saveInternalNotes()} disabled={notesSaving}>
                  {notesSaving ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setNotesDraft(client.notes ?? '');
                    setNotesError('');
                    setNotesEditing(false);
                  }}
                  disabled={notesSaving}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className={!client.notes ? 'muted-value' : ''}>
              {client.notes ?? 'Nenhuma nota interna'}
            </p>
          )}
        </section>
      </div>
    );
  }

  const instanceLabel = conversationInstanceLabel(conversation.instanceName);
  const selectedClientPhone = selectedClient?.phoneNormalized
    ? formatNormalizedBrazilPhone(selectedClient.phoneNormalized)
    : '-';
  const phoneDiffers =
    Boolean(selectedClient?.phoneNormalized) &&
    selectedClient?.phoneNormalized !== conversation.phoneNormalized;

  if (activeTab === 'financial') {
    return (
      <div className="conversation-contact-tab-content">
        <div className="conversation-empty-panel conversation-tab-empty">
          <Info aria-hidden="true" size={22} />
          <span>Este contato não está vinculado a um cliente.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-contact-tab-content conversation-summary-tab">
      <ConversationActiveAttendanceSummary
        attendance={conversation.activeAttendance}
        nowMs={waitingClockNow}
      />
      <section className="conversation-contact-section">
        <div className="conversation-contact-section-title">
          <span>Contato não vinculado</span>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Nome</dt>
            <dd>{conversation.displayName}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{phoneLabel}</dd>
          </div>
          {instanceLabel ? (
            <div>
              <dt>Instância</dt>
              <dd>{instanceLabel}</dd>
            </div>
          ) : null}
        </dl>
      </section>
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
                    <dd>{phoneLabel}</dd>
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

function ConversationActiveAttendanceSummary({
  attendance,
  nowMs,
}: {
  attendance: WhatsAppConversation['activeAttendance'];
  nowMs: number;
}) {
  if (!attendance) return null;

  const elapsedSeconds = getHumanWaitingSeconds(attendance.openedAt, nowMs);
  const pending = attendance.status === 'PENDING';

  return (
    <section className="conversation-contact-section conversation-current-attendance">
      <div className="conversation-contact-section-title">
        <span>Atendimento atual</span>
        <span className={`attendance-status ${attendance.status.toLowerCase()}`}>
          {attendanceStatusLabel(attendance.status)}
        </span>
      </div>
      <p>
        <Clock3 aria-hidden="true" size={14} />
        {pending ? 'Aguardando resposta humana há' : 'Aberto há'}{' '}
        <strong>{formatWaitingDuration(elapsedSeconds)}</strong>
      </p>
      <small>
        {attendance.inboundMessagesCount} recebidas · {attendance.outboundMessagesCount} manuais
      </small>
      {attendance.autoReply.sent ? (
        <div className="attendance-history-auto-reply">
          <Bot aria-hidden="true" size={14} />
          <span>
            Resposta automática enviada · {autoReplyModeLabel(attendance.autoReply.mode)} ·{' '}
            {formatAutoReplyTime(attendance.autoReply.lastSentAt)}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function ConversationFinancialOverview({ summary }: { summary: ContactFinancialSummary }) {
  return (
    <section className="conversation-contact-section conversation-financial-overview">
      <div className="conversation-contact-section-title">
        <span>Financeiro</span>
        <span
          className={`conversation-reference-status finance-summary-${summary.state.toLowerCase()}`}
        >
          {contactFinancialStateLabel(summary.state)}
        </span>
      </div>
      <div className="conversation-financial-overview-grid">
        <div>
          <span>Em aberto</span>
          <strong>{formatCurrency(summary.openAmount)}</strong>
          <small>{contactChargeCountLabel(summary.openCount, false)}</small>
        </div>
        <div>
          <span>Próximo vencimento</span>
          <strong>{summary.nextDueDate ? formatDate(summary.nextDueDate) : '-'}</strong>
          <small>{contactReferenceCountLabel(summary.activeReferenceCount)}</small>
        </div>
      </div>
    </section>
  );
}

function ConversationContactHeader({
  avatar,
  conversation,
  linked,
  linkedClient,
  onOpenClient,
}: {
  avatar?: ConversationAvatarState | undefined;
  conversation: WhatsAppConversation;
  linked: boolean;
  linkedClient: Client | null;
  onOpenClient?: () => void;
}) {
  const phoneLabel = conversationDisplayPhone(conversation);
  const imageUrl = avatar?.response?.available ? avatar.response.url : null;

  return (
    <section className="conversation-contact-profile">
      <span className={`conversation-contact-profile-avatar${imageUrl ? ' has-image' : ''}`}>
        {imageUrl ? <img alt="" src={imageUrl} /> : conversationInitials(conversation)}
      </span>
      <div className="conversation-contact-profile-copy">
        <h3 id="conversation-contact-name">{conversation.displayName}</h3>
        <p>{phoneLabel}</p>
        <span className={`conversation-kind ${linked ? 'client' : 'guest'}`}>
          {linked ? 'Cliente vinculado' : 'Contato não vinculado'}
        </span>
      </div>
      {linkedClient && onOpenClient ? (
        <Button icon={ArrowRight} size="sm" variant="secondary" onClick={onOpenClient}>
          Abrir cliente
        </Button>
      ) : null}
    </section>
  );
}

function ConversationFinancialSummary({ summary }: { summary: ContactFinancialSummary }) {
  const stateLabel = contactFinancialStateLabel(summary.state);
  const hasOpenReceivables = summary.openCount > 0;
  const overdueAlert = contactOverdueAlert(summary);

  return (
    <section className="conversation-contact-section conversation-financial-summary">
      <div className="conversation-contact-section-title">
        <span>Situação financeira</span>
        <span
          className={`conversation-reference-status finance-summary-${summary.state.toLowerCase()}`}
        >
          {stateLabel}
        </span>
      </div>
      {overdueAlert ? (
        <div className="conversation-financial-alert" role="note">
          {overdueAlert}
        </div>
      ) : null}
      {hasOpenReceivables ? (
        <div className="conversation-financial-grid">
          <div>
            <span>Em aberto</span>
            <strong>{formatCurrency(summary.openAmount)}</strong>
            <small>{contactChargeCountLabel(summary.openCount, false)}</small>
          </div>
          {summary.overdueCount > 0 ? (
            <div className="is-overdue">
              <span>Vencido</span>
              <strong>{formatCurrency(summary.overdueAmount)}</strong>
              <small>{contactChargeCountLabel(summary.overdueCount, true)}</small>
            </div>
          ) : null}
          {summary.nextDueDate ? (
            <div>
              <span>Próx. vencimento</span>
              <strong>{formatDate(summary.nextDueDate)}</strong>
            </div>
          ) : null}
          <div>
            <span>Referências ativas</span>
            <strong>{summary.activeReferenceCount}</strong>
            <small>{contactReferenceCountLabel(summary.activeReferenceCount)}</small>
          </div>
          {summary.lastPayment ? (
            <div>
              <span>Último pagamento</span>
              <strong>{formatDate(summary.lastPayment.paidAt)}</strong>
              <small>{formatCurrency(summary.lastPayment.amount)}</small>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="conversation-financial-empty">
          <span>Nenhuma cobrança em aberto</span>
          <small>{contactReferenceCountLabel(summary.activeReferenceCount)}</small>
          {summary.lastPayment ? (
            <small>
              Último pagamento: {formatDate(summary.lastPayment.paidAt)} ·{' '}
              {formatCurrency(summary.lastPayment.amount)}
            </small>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ConversationRecentActivity({
  clientId,
  items,
  receivables,
  onViewReceivable,
}: {
  clientId: string;
  items: ContactRecentActivityItem[];
  receivables: Receivable[];
  onViewReceivable: (clientId: string, receivable: Receivable) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const activityIdentity = items.map((item) => item.id).join('|');
  const visibleItems = contactDrawerVisibleItems(items, showAll, 3);

  useEffect(() => {
    setShowAll(false);
  }, [clientId, activityIdentity]);

  return (
    <section className="conversation-contact-section conversation-recent-activity">
      <div className="conversation-contact-section-title">
        <span>Atividade recente</span>
        <small>{items.length}</small>
      </div>
      {items.length ? (
        <>
          <div className="conversation-activity-list">
            {visibleItems.map((item) => {
              const receivable = item.receivableId
                ? receivables.find((candidate) => candidate.id === item.receivableId)
                : null;
              const canViewReceivable = Boolean(
                receivable && receivable.sourceKind !== 'LEGACY_IMPORT',
              );

              return (
                <article className="conversation-activity-item" key={item.id}>
                  <span
                    className={`conversation-activity-dot activity-${item.type.toLowerCase()}`}
                    aria-hidden="true"
                  />
                  <div className="conversation-activity-main">
                    <div className="conversation-activity-heading">
                      <strong>{item.title}</strong>
                      {item.amount ? (
                        <strong className="conversation-activity-amount">
                          {formatCurrency(item.amount)}
                        </strong>
                      ) : null}
                    </div>
                    <p className="conversation-activity-meta">
                      <span>{formatDateTime(item.occurredAt)}</span>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                    </p>
                    {canViewReceivable && receivable ? (
                      <Button
                        icon={Eye}
                        size="sm"
                        variant="ghost"
                        onClick={() => onViewReceivable(clientId, receivable)}
                      >
                        Ver cobrança
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {items.length > 3 ? (
            <Button
              className="conversation-activity-toggle"
              size="sm"
              variant="ghost"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? 'Recolher atividades' : 'Ver mais atividades'}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="conversation-activity-empty">Nenhuma atividade recente</div>
      )}
    </section>
  );
}

function ConversationReferenceList({
  allowPixWhatsApp,
  client,
  lifecycleBusyReferenceId,
  lifecyclePlansLoading,
  pixBusyReceivableId,
  pixWhatsAppBusyIntentIds,
  pixIntent,
  receivables,
  onCopyPix,
  onGeneratePix,
  onRecreatePix,
  onReactivateReference,
  onSendPixWhatsApp,
  onRenewReference,
  onOpenClient,
  onViewReceivable,
}: {
  allowPixWhatsApp: boolean;
  client: Client;
  lifecycleBusyReferenceId: string | null;
  lifecyclePlansLoading: boolean;
  pixBusyReceivableId: string | null;
  pixWhatsAppBusyIntentIds: ReadonlySet<string>;
  pixIntent: PaymentIntent | null;
  receivables: Receivable[];
  onCopyPix: (intent: PaymentIntent) => void;
  onGeneratePix: (receivable: Receivable) => void;
  onRecreatePix: (receivable: Receivable, intent: PaymentIntent) => void;
  onReactivateReference: (reference: ClientReference) => void;
  onSendPixWhatsApp: (receivable: Receivable, intent: PaymentIntent) => void;
  onRenewReference: (reference: ClientReference) => void;
  onOpenClient: (clientId: string) => void;
  onViewReceivable: (clientId: string, receivable: Receivable) => void;
}) {
  const references = sortContactReferences(client.references ?? [], receivables);
  const referenceIdentity = references.map((reference) => reference.id).join('|');
  const [expandedReferenceId, setExpandedReferenceId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContactReferenceFilter>('ALL');
  const [showAll, setShowAll] = useState(false);
  const filteredReferences = filterContactReferences(references, receivables, filter);
  const visibleReferences = contactDrawerVisibleItems(filteredReferences, showAll, 4);

  useEffect(() => {
    setExpandedReferenceId((current) =>
      current && referenceIdentity.split('|').includes(current) ? current : null,
    );
  }, [client.id, referenceIdentity]);

  useEffect(() => {
    setFilter('ALL');
    setShowAll(false);
  }, [client.id]);

  function selectFilter(nextFilter: ContactReferenceFilter) {
    setFilter(nextFilter);
    setShowAll(false);
    setExpandedReferenceId(null);
  }

  return (
    <section className="conversation-contact-section conversation-reference-section">
      <div className="conversation-contact-section-title">
        <span>Referências ({references.length})</span>
        {filter !== 'ALL' ? <small>{filteredReferences.length} encontradas</small> : null}
      </div>
      {references.length ? (
        <>
          {references.length > 1 ? (
            <div className="conversation-reference-filters" aria-label="Filtrar referências">
              {contactReferenceFilters.map((option) => (
                <button
                  aria-pressed={filter === option.id}
                  className={filter === option.id ? 'is-active' : ''}
                  key={option.id}
                  type="button"
                  onClick={() => selectFilter(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {filteredReferences.length ? (
            <div className="conversation-reference-list">
              {visibleReferences.map((reference) => {
                const expanded = expandedReferenceId === reference.id;
                return (
                  <ConversationReferenceCard
                    allowPixWhatsApp={allowPixWhatsApp}
                    key={reference.id}
                    clientId={client.id}
                    expanded={expanded}
                    lifecycleBusyReferenceId={lifecycleBusyReferenceId}
                    lifecyclePlansLoading={lifecyclePlansLoading}
                    pixBusyReceivableId={pixBusyReceivableId}
                    pixWhatsAppBusyIntentIds={pixWhatsAppBusyIntentIds}
                    pixIntent={pixIntent}
                    receivables={contactReceivablesForReference(receivables, reference.id)}
                    reference={reference}
                    onCopyPix={onCopyPix}
                    onGeneratePix={onGeneratePix}
                    onRecreatePix={onRecreatePix}
                    onReactivateReference={onReactivateReference}
                    onSendPixWhatsApp={onSendPixWhatsApp}
                    onRenewReference={onRenewReference}
                    onOpenClient={onOpenClient}
                    onToggle={() =>
                      setExpandedReferenceId((current) =>
                        current === reference.id ? null : reference.id,
                      )
                    }
                    onViewReceivable={onViewReceivable}
                  />
                );
              })}
            </div>
          ) : (
            <div className="conversation-reference-filter-empty">
              Nenhuma referência neste filtro.
            </div>
          )}
          {filteredReferences.length > 4 ? (
            <Button
              className="conversation-reference-list-toggle"
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAll((current) => !current);
                setExpandedReferenceId(null);
              }}
            >
              {showAll
                ? 'Recolher referências'
                : `Ver todas as referências (${filteredReferences.length})`}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="conversation-empty-panel">
          <Info aria-hidden="true" size={22} />
          <span>Nenhuma referência cadastrada.</span>
        </div>
      )}
    </section>
  );
}

function ConversationReferenceCard({
  allowPixWhatsApp,
  clientId,
  expanded,
  lifecycleBusyReferenceId,
  lifecyclePlansLoading,
  pixBusyReceivableId,
  pixWhatsAppBusyIntentIds,
  pixIntent,
  receivables,
  reference,
  onCopyPix,
  onGeneratePix,
  onRecreatePix,
  onReactivateReference,
  onSendPixWhatsApp,
  onRenewReference,
  onOpenClient,
  onToggle,
  onViewReceivable,
}: {
  allowPixWhatsApp: boolean;
  clientId: string;
  expanded: boolean;
  lifecycleBusyReferenceId: string | null;
  lifecyclePlansLoading: boolean;
  pixBusyReceivableId: string | null;
  pixWhatsAppBusyIntentIds: ReadonlySet<string>;
  pixIntent: PaymentIntent | null;
  receivables: Receivable[];
  reference: ClientReference;
  onCopyPix: (intent: PaymentIntent) => void;
  onGeneratePix: (receivable: Receivable) => void;
  onRecreatePix: (receivable: Receivable, intent: PaymentIntent) => void;
  onReactivateReference: (reference: ClientReference) => void;
  onSendPixWhatsApp: (receivable: Receivable, intent: PaymentIntent) => void;
  onRenewReference: (reference: ClientReference) => void;
  onOpenClient: (clientId: string) => void;
  onToggle: () => void;
  onViewReceivable: (clientId: string, receivable: Receivable) => void;
}) {
  const openReceivable = contactOpenReceivable(receivables);
  const relevantReceivable = contactRelevantReceivable(receivables);
  const activePix = openReceivable?.activePix ?? null;
  const generatedPix =
    pixIntent && pixIntent.receivableId && pixIntent.receivableId === openReceivable?.id
      ? pixIntent
      : null;
  const visiblePix = generatedPix ?? activePix;
  const pixState = classifyContactPixState(visiblePix);
  const canActOnPix = contactReceivableAllowsPixAction(openReceivable);
  const canSendPixWhatsApp =
    allowPixWhatsApp && contactPixCanSendWhatsApp(openReceivable, visiblePix);
  const pixWhatsAppSending = visiblePix ? pixWhatsAppBusyIntentIds.has(visiblePix.id) : false;
  const actions = contactReferenceActionMatrix(
    reference,
    openReceivable ?? relevantReceivable,
    visiblePix,
  );
  const lifecycleBusy = lifecycleBusyReferenceId === reference.id || lifecyclePlansLoading;
  const detailsId = `conversation-reference-details-${reference.id}`;
  const financialStatus = openReceivable
    ? receivableStatusText(openReceivable.displayStatus)
    : 'Sem cobrança em aberto';
  const pixSummary = visiblePix
    ? pixState === 'EXPIRED_PIX'
      ? 'PIX expirado'
      : `PIX ${paymentIntentStatusText(visiblePix.status).toLowerCase()}`
    : null;

  return (
    <article className={`conversation-reference-card${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="conversation-reference-toggle"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={onToggle}
      >
        <span className="conversation-reference-primary-row">
          <strong title={reference.reference}>{reference.reference}</strong>
          <ConversationStatusBadge status={reference.status} />
        </span>
        <span className="conversation-reference-secondary-row">
          <span
            className="conversation-reference-summary"
            title={reference.plan?.name ?? undefined}
          >
            <span>{reference.plan?.name ?? 'Plano não informado'}</span>
            <span>{formatCurrency(reference.recurringValue)}</span>
            <span>Vence {formatDate(reference.dueDate)}</span>
            {pixSummary ? <span>{pixSummary}</span> : null}
          </span>
          {openReceivable ? (
            <ConversationReceivableStatusBadge status={openReceivable.displayStatus} />
          ) : (
            <span className="conversation-reference-financial-text">{financialStatus}</span>
          )}
        </span>
        <ChevronDown aria-hidden="true" className="conversation-reference-chevron" size={17} />
      </button>
      {expanded ? (
        <div id={detailsId} className="conversation-reference-details">
          <div className="conversation-reference-card-header">
            <div>
              <strong>{reference.reference}</strong>
              <span>{reference.plan?.name ?? 'Plano não informado'}</span>
            </div>
            <ConversationStatusBadge status={reference.status} />
          </div>
          <dl className="detail-list compact">
            <div>
              <dt>Valor</dt>
              <dd>{formatCurrency(reference.recurringValue)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{formatDate(reference.dueDate)}</dd>
            </div>
            <div>
              <dt>Dia base</dt>
              <dd>{reference.billingAnchorDay}</dd>
            </div>
            <div>
              <dt>Situação financeira</dt>
              <dd>
                {openReceivable ? (
                  <ConversationReceivableStatusBadge status={openReceivable.displayStatus} />
                ) : (
                  financialStatus
                )}
              </dd>
            </div>
          </dl>
          {reference.notes ? (
            <p className="conversation-reference-note">{reference.notes}</p>
          ) : null}
          {visiblePix ? (
            <div className="conversation-reference-pix">
              <div>
                <span>
                  PIX {paymentIntentStatusText(visiblePix.status)}
                  {visiblePix.provider ? ` · ${visiblePix.provider}` : ''}
                </span>
                {visiblePix.expiresAt ? (
                  <small>
                    {pixState === 'EXPIRED_PIX' ? 'PIX expirado em ' : 'PIX válido até '}
                    {formatDateTime(visiblePix.expiresAt)}
                  </small>
                ) : null}
              </div>
              {pixState === 'ACTIVE_PIX' && visiblePix.pixCopyPaste ? (
                <Button
                  icon={QrCode}
                  size="sm"
                  variant={actions.primary === 'COPY_PIX' ? 'primary' : 'secondary'}
                  onClick={() => onCopyPix(visiblePix)}
                >
                  Copiar PIX
                </Button>
              ) : null}
              {canSendPixWhatsApp && openReceivable && visiblePix ? (
                <Button
                  disabled={pixWhatsAppSending}
                  icon={Send}
                  size="sm"
                  variant={actions.primary === 'SEND_PIX_WHATSAPP' ? 'primary' : 'secondary'}
                  onClick={() => onSendPixWhatsApp(openReceivable, visiblePix)}
                >
                  {contactPixWhatsAppButtonLabel(pixWhatsAppSending)}
                </Button>
              ) : null}
              {canActOnPix && openReceivable && pixState === 'EXPIRED_PIX' ? (
                <Button
                  icon={RefreshCw}
                  loading={pixBusyReceivableId === openReceivable.id}
                  size="sm"
                  variant="primary"
                  onClick={() => onRecreatePix(openReceivable, visiblePix)}
                >
                  Recriar PIX
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="conversation-reference-actions">
            {canActOnPix && openReceivable && pixState === 'NO_PIX' ? (
              <Button
                icon={QrCode}
                loading={pixBusyReceivableId === openReceivable.id}
                size="sm"
                variant="primary"
                onClick={() => onGeneratePix(openReceivable)}
              >
                Gerar PIX
              </Button>
            ) : null}
            {actions.viewReceivable && relevantReceivable ? (
              <Button
                icon={Eye}
                size="sm"
                variant="secondary"
                onClick={() => onViewReceivable(clientId, relevantReceivable)}
              >
                Ver cobrança
              </Button>
            ) : null}
            {actions.renew ? (
              <Button
                icon={RefreshCw}
                loading={lifecycleBusy}
                size="sm"
                variant="secondary"
                onClick={() => onRenewReference(reference)}
              >
                Renovar
              </Button>
            ) : null}
            {actions.reactivate ? (
              <Button
                icon={RefreshCw}
                loading={lifecycleBusy}
                size="sm"
                variant="primary"
                onClick={() => onReactivateReference(reference)}
              >
                Reativar
              </Button>
            ) : null}
            <Button
              icon={ArrowRight}
              size="sm"
              variant="ghost"
              onClick={() => onOpenClient(clientId)}
            >
              Abrir cliente
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ConversationStatusBadge({ status }: { status: Client['status'] }) {
  return (
    <span className={`conversation-reference-status status-${status.toLowerCase()}`}>{status}</span>
  );
}

function ConversationReceivableStatusBadge({ status }: { status: Receivable['displayStatus'] }) {
  return (
    <span className={`conversation-reference-status finance-${status.toLowerCase()}`}>
      {receivableStatusText(status)}
    </span>
  );
}

export type ContactReferenceFilter = 'ALL' | 'OPEN' | 'OVERDUE' | 'ACTIVE' | 'CANCELED';
export type ContactReferenceFinancialState = 'OVERDUE' | 'OPEN' | 'CLEAR';

export function contactDrawerVisibleItems<T>(items: T[], showAll: boolean, initialLimit: number) {
  return showAll ? items : items.slice(0, Math.max(0, initialLimit));
}

const contactReferenceFilters: Array<{ id: ContactReferenceFilter; label: string }> = [
  { id: 'ALL', label: 'Todas' },
  { id: 'OPEN', label: 'Em aberto' },
  { id: 'OVERDUE', label: 'Vencidas' },
  { id: 'ACTIVE', label: 'Ativas' },
  { id: 'CANCELED', label: 'Canceladas' },
];

export function contactReferenceFinancialState(
  reference: ClientReference,
  receivables: Receivable[],
): ContactReferenceFinancialState {
  const referenceReceivables = contactReceivablesForReference(receivables, reference.id).filter(
    (receivable) => receivable.sourceKind !== 'LEGACY_IMPORT',
  );
  if (
    referenceReceivables.some(
      (receivable) => receivable.status === 'PENDENTE' && receivable.displayStatus === 'VENCIDO',
    )
  ) {
    return 'OVERDUE';
  }
  if (referenceReceivables.some((receivable) => contactReceivableAllowsPixAction(receivable))) {
    return 'OPEN';
  }
  return 'CLEAR';
}

export function filterContactReferences(
  references: ClientReference[],
  receivables: Receivable[],
  filter: ContactReferenceFilter,
) {
  if (filter === 'ALL') return references;
  return references.filter((reference) => {
    if (filter === 'ACTIVE') return reference.status === 'ATIVO';
    if (filter === 'CANCELED') return reference.status === 'CANCELADO';
    const financialState = contactReferenceFinancialState(reference, receivables);
    return filter === 'OVERDUE'
      ? financialState === 'OVERDUE'
      : financialState === 'OPEN' || financialState === 'OVERDUE';
  });
}

export function sortContactReferences(
  references: ClientReference[],
  receivables: Receivable[] = [],
) {
  const rank = (reference: ClientReference) => {
    const financialState = contactReferenceFinancialState(reference, receivables);
    if (financialState === 'OVERDUE') return 0;
    if (financialState === 'OPEN') return 1;
    if (reference.status === 'ATIVO') return 2;
    if (reference.status === 'PENDENTE_PAGAMENTO') return 3;
    if (reference.status === 'INATIVO') return 4;
    return 5;
  };
  const indexed = references.map((reference, index) => ({
    index,
    rank: rank(reference),
    reference,
  }));
  return indexed
    .sort((a, b) => {
      return a.rank - b.rank || a.index - b.index;
    })
    .map(({ reference }) => reference);
}

export type ContactReferencePrimaryAction =
  'GENERATE_PIX' | 'RECREATE_PIX' | 'SEND_PIX_WHATSAPP' | 'COPY_PIX' | 'REACTIVATE' | null;

export function contactReferenceActionMatrix(
  reference: Pick<ClientReference, 'status'>,
  receivable: Receivable | null | undefined,
  intent: PaymentIntent | null | undefined,
  now = Date.now(),
) {
  const pixState = classifyContactPixState(intent, now);
  const canActOnPix = contactReceivableAllowsPixAction(receivable);
  const canSendPixWhatsApp = contactPixCanSendWhatsApp(receivable, intent, now);
  const canCopyPix = Boolean(intent?.pixCopyPaste && pixState === 'ACTIVE_PIX' && canActOnPix);
  const canGeneratePix = Boolean(
    reference.status === 'ATIVO' && canActOnPix && pixState === 'NO_PIX',
  );
  const canRecreatePix = Boolean(
    reference.status === 'ATIVO' && canActOnPix && pixState === 'EXPIRED_PIX',
  );
  const canRenew = reference.status === 'ATIVO';
  const canReactivate = reference.status === 'CANCELADO';
  const viewReceivable = Boolean(receivable && receivable.sourceKind !== 'LEGACY_IMPORT');
  const primary: ContactReferencePrimaryAction = canReactivate
    ? 'REACTIVATE'
    : canRecreatePix
      ? 'RECREATE_PIX'
      : canSendPixWhatsApp
        ? 'SEND_PIX_WHATSAPP'
        : canCopyPix
          ? 'COPY_PIX'
          : canGeneratePix
            ? 'GENERATE_PIX'
            : null;

  return {
    copyPix: canCopyPix,
    generatePix: canGeneratePix,
    primary,
    reactivate: canReactivate,
    recreatePix: canRecreatePix,
    renew: canRenew,
    sendPixWhatsApp: canSendPixWhatsApp,
    viewReceivable,
  };
}

export function contactReceivablesForReference(receivables: Receivable[], referenceId: string) {
  return receivables.filter((receivable) => receivable.clientReferenceId === referenceId);
}

async function listContactReceivables(clientId: string) {
  const pageSize = 100;
  const firstPage = await listReceivables({ clientId, page: 1, pageSize });
  const items = [...firstPage.items];

  for (const page of contactReceivablePaginationPages({
    loadedCount: items.length,
    total: firstPage.pagination.total,
    totalPages: firstPage.pagination.totalPages,
  })) {
    const payload = await listReceivables({ clientId, page, pageSize });
    items.push(...payload.items);
    if (items.length >= firstPage.pagination.total) break;
  }

  return items.filter((receivable) => receivable.sourceKind !== 'LEGACY_IMPORT');
}

export function contactReceivablePaginationPages({
  currentPage = 1,
  loadedCount,
  total,
  totalPages,
}: {
  currentPage?: number;
  loadedCount: number;
  total: number;
  totalPages: number;
}) {
  if (loadedCount >= total) return [];

  const lastPage = Math.max(currentPage, totalPages);
  const pages: number[] = [];
  for (let page = currentPage + 1; page <= lastPage; page += 1) {
    pages.push(page);
  }

  return pages;
}

export function contactOpenReceivable(receivables: Receivable[]) {
  return receivables
    .filter(
      (receivable) => receivable.displayStatus === 'VENCIDO' || receivable.status === 'PENDENTE',
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
}

export function contactRelevantReceivable(receivables: Receivable[]) {
  return (
    contactOpenReceivable(receivables) ??
    [...receivables]
      .filter((receivable) => receivable.sourceKind !== 'LEGACY_IMPORT')
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0]
  );
}

export function classifyContactPixState(
  intent: PaymentIntent | null | undefined,
  now = Date.now(),
): ContactPixState {
  if (!intent) return 'NO_PIX';
  if (intent.status === 'EXPIRED') return 'EXPIRED_PIX';
  if (
    intent.status === 'WAITING_PAYMENT' &&
    intent.expiresAt &&
    Date.parse(intent.expiresAt) <= now
  ) {
    return 'EXPIRED_PIX';
  }
  if (intent.status === 'CREATED' || intent.status === 'WAITING_PAYMENT') {
    return 'ACTIVE_PIX';
  }
  return 'NO_PIX';
}

export function contactReceivableAllowsPixAction(receivable: Receivable | null | undefined) {
  return Boolean(receivable && receivable.status !== 'PAGO' && receivable.status !== 'CANCELADO');
}

export function buildContactFinancialSummary(
  references: ClientReference[],
  receivables: Receivable[],
  now = Date.now(),
): ContactFinancialSummary {
  const activeReferenceCount = references.filter(
    (reference) => reference.status === 'ATIVO',
  ).length;
  const officialReceivables = receivables.filter(
    (receivable) => receivable.sourceKind !== 'LEGACY_IMPORT',
  );
  const openReceivables = officialReceivables.filter((receivable) =>
    contactReceivableAllowsPixAction(receivable),
  );
  const overdueReceivables = openReceivables.filter(
    (receivable) => receivable.displayStatus === 'VENCIDO',
  );
  const todayKey = contactDateKey(new Date(now).toISOString());
  const nextDueDate =
    todayKey === null
      ? null
      : (openReceivables
          .map((receivable) => ({ receivable, dueDateKey: contactDateKey(receivable.dueDate) }))
          .filter(
            (item): item is { receivable: Receivable; dueDateKey: string } =>
              item.receivable.displayStatus !== 'VENCIDO' &&
              item.dueDateKey !== null &&
              item.dueDateKey > todayKey,
          )
          .sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey))[0]?.receivable.dueDate ?? null);
  const lastPayment =
    officialReceivables
      .map((receivable) => ({ receivable, paidAtKey: contactDateKey(receivable.paidAt) }))
      .filter(
        (item): item is { receivable: Receivable; paidAtKey: string } =>
          item.receivable.status === 'PAGO' && item.paidAtKey !== null,
      )
      .sort((a, b) => b.paidAtKey.localeCompare(a.paidAtKey))[0]?.receivable ?? null;
  const oldestOverdue = overdueReceivables
    .map((receivable) => ({ receivable, dueDateKey: contactDateKey(receivable.dueDate) }))
    .filter(
      (item): item is { receivable: Receivable; dueDateKey: string } => item.dueDateKey !== null,
    )
    .sort((a, b) => a.dueDateKey.localeCompare(b.dueDateKey))[0];
  const oldestOverdueDays =
    oldestOverdue && todayKey
      ? Math.max(0, contactDateDiffDays(oldestOverdue.dueDateKey, todayKey))
      : null;

  return {
    activeReferenceCount,
    lastPayment: lastPayment ? { amount: lastPayment.amount, paidAt: lastPayment.paidAt! } : null,
    nextDueDate,
    oldestOverdueDays,
    openAmount: contactReceivableAmount(openReceivables),
    openCount: openReceivables.length,
    overdueAmount: contactReceivableAmount(overdueReceivables),
    overdueCount: overdueReceivables.length,
    state:
      overdueReceivables.length > 0
        ? 'OVERDUE'
        : openReceivables.length > 0
          ? 'PENDING'
          : 'CURRENT',
  };
}

export function buildContactRecentActivity({
  clientEvents = [],
  limit = 6,
  now = Date.now(),
  receivables = [],
  renewals = [],
}: {
  clientEvents?: ClientEvent[];
  limit?: number;
  now?: number;
  receivables?: Receivable[];
  renewals?: Renewal[];
}): ContactRecentActivityItem[] {
  const renewalById = new Map(
    renewals
      .filter((renewal) => validContactActivityTimestamp(renewal.createdAt))
      .map((renewal) => [renewal.id, renewal]),
  );
  const renewalReceivableIds = new Set(
    renewals.map((renewal) => renewal.receivable?.id).filter((id): id is string => Boolean(id)),
  );
  const items: ContactRecentActivityItem[] = [];

  for (const receivable of receivables) {
    if (receivable.sourceKind === 'LEGACY_IMPORT') continue;

    if (receivable.status === 'PAGO' && validContactActivityTimestamp(receivable.paidAt)) {
      items.push({
        amount: receivable.amount,
        id: `receivable-payment:${receivable.id}`,
        occurredAt: receivable.paidAt!,
        receivableId: receivable.id,
        referenceId: receivable.clientReferenceId ?? null,
        subtitle: contactActivityReceivableSubtitle(receivable),
        title: 'Pagamento recebido',
        type: 'PAYMENT',
      });
      continue;
    }

    const renewal = receivable.renewalId ? renewalById.get(receivable.renewalId) : null;
    if (renewal) continue;

    if (
      receivable.displayStatus === 'VENCIDO' &&
      receivable.status === 'PENDENTE' &&
      validContactActivityDate(receivable.dueDate) &&
      contactDateKey(receivable.dueDate)! <= contactDateKey(new Date(now).toISOString())!
    ) {
      items.push({
        amount: receivable.amount,
        id: `receivable-overdue:${receivable.id}`,
        occurredAt: receivable.dueDate,
        receivableId: receivable.id,
        referenceId: receivable.clientReferenceId ?? null,
        subtitle: contactActivityReceivableSubtitle(receivable),
        title: 'Cobrança venceu',
        type: 'RECEIVABLE_OVERDUE',
      });
      continue;
    }

    if (receivable.displayStatus === 'VENCIDO') continue;

    if (
      receivable.status === 'PENDENTE' &&
      validContactActivityTimestamp(receivable.createdAt) &&
      !renewalReceivableIds.has(receivable.id)
    ) {
      items.push({
        amount: receivable.amount,
        id: `receivable-created:${receivable.id}`,
        occurredAt: receivable.createdAt,
        receivableId: receivable.id,
        referenceId: receivable.clientReferenceId ?? null,
        subtitle: contactActivityReceivableSubtitle(receivable),
        title: 'Cobrança gerada',
        type: 'RECEIVABLE_CREATED',
      });
    }
  }

  for (const renewal of renewals) {
    if (!validContactActivityTimestamp(renewal.createdAt)) continue;
    if (renewal.status === 'REVERTED') continue;

    items.push({
      amount: renewal.amount,
      id: `renewal:${renewal.id}`,
      occurredAt: renewal.createdAt,
      receivableId: renewal.receivable?.id ?? null,
      referenceId: renewal.clientReferenceId ?? null,
      subtitle: renewal.planName,
      title: 'Renovação realizada',
      type: 'RENEWAL',
    });
  }

  for (const event of clientEvents) {
    const activity = contactActivityFromClientEvent(event);
    if (activity) items.push(activity);
  }

  return dedupeContactRecentActivity(items)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, Math.max(0, limit));
}

function contactActivityFromClientEvent(event: ClientEvent): ContactRecentActivityItem | null {
  if (!validContactActivityTimestamp(event.createdAt)) return null;

  if (event.type === 'CLIENT_REFERENCE_REACTIVATION_REQUESTED') {
    return {
      id: `client-event:${event.id}`,
      occurredAt: event.createdAt,
      ...(event.description ? { subtitle: event.description } : {}),
      title: 'Reativação iniciada',
      type: 'REACTIVATION',
    };
  }

  if (event.type === 'CLIENT_REFERENCE_REACTIVATED') {
    return {
      id: `client-event:${event.id}`,
      occurredAt: event.createdAt,
      ...(event.description ? { subtitle: event.description } : {}),
      title: 'Reativação concluída',
      type: 'REACTIVATION',
    };
  }

  return null;
}

function dedupeContactRecentActivity(items: ContactRecentActivityItem[]) {
  const seen = new Set<string>();
  const deduped: ContactRecentActivityItem[] = [];

  for (const item of items) {
    const key = item.receivableId
      ? `${item.type}:${item.receivableId}`
      : `${item.type}:${item.id}:${item.occurredAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function contactActivityReceivableSubtitle(receivable: Receivable) {
  return (
    receivable.clientReference?.reference ??
    (receivable.purpose === 'MANUAL_CHARGE' ? 'Cobrança avulsa' : receivable.description)
  );
}

function validContactActivityTimestamp(value: string | null | undefined) {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function validContactActivityDate(value: string | null | undefined) {
  return contactDateKey(value) !== null;
}

function contactReceivableAmount(receivables: Receivable[]) {
  return receivables.reduce((total, receivable) => total + Number(receivable.amount || 0), 0);
}

function contactDateKey(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;

  const [, year, month, day] = match;
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function contactDateDiffDays(startKey: string, endKey: string) {
  const start = Date.UTC(
    Number(startKey.slice(0, 4)),
    Number(startKey.slice(5, 7)) - 1,
    Number(startKey.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(endKey.slice(0, 4)),
    Number(endKey.slice(5, 7)) - 1,
    Number(endKey.slice(8, 10)),
  );

  return Math.floor((end - start) / 86_400_000);
}

function contactFinancialStateLabel(state: ContactFinancialSummaryState) {
  const labels: Record<ContactFinancialSummaryState, string> = {
    CURRENT: 'EM DIA',
    OVERDUE: 'EM ATRASO',
    PENDING: 'PENDENTE',
  };

  return labels[state];
}

function contactChargeCountLabel(count: number, overdue: boolean) {
  const noun = count === 1 ? 'cobrança' : 'cobranças';
  return overdue ? `${count} ${noun} vencida${count === 1 ? '' : 's'}` : `${count} ${noun}`;
}

function contactReferenceCountLabel(count: number) {
  return `${count} ${count === 1 ? 'referência ativa' : 'referências ativas'}`;
}

function contactOverdueAlert(summary: ContactFinancialSummary) {
  if (summary.overdueCount === 0) return '';

  const base = `${contactChargeCountLabel(summary.overdueCount, true)} · ${formatCurrency(
    summary.overdueAmount,
  )}`;
  if (!summary.oldestOverdueDays) return base;

  return `${base} · mais antiga há ${summary.oldestOverdueDays} dias`;
}

export function contactPixCanSendWhatsApp(
  receivable: Receivable | null | undefined,
  intent: PaymentIntent | null | undefined,
  now = Date.now(),
) {
  return Boolean(
    receivable &&
    intent &&
    contactReceivableAllowsPixAction(receivable) &&
    intent.receivableId === receivable.id &&
    intent.status === 'WAITING_PAYMENT' &&
    intent.pixCopyPaste &&
    classifyContactPixState(intent, now) === 'ACTIVE_PIX',
  );
}

export function contactPixWhatsAppButtonLabel(sending: boolean) {
  return sending ? 'Enviando...' : 'Enviar no WhatsApp';
}

export function contactPixReplacementPayload(
  receivable: Receivable,
  currentIntent: PaymentIntent,
): ContactPixReplacementPayload | null {
  if (currentIntent.receivableId !== receivable.id) return null;

  return {
    provider: currentIntent.provider,
    expectedCurrentIntentId: currentIntent.id,
    reason: 'QR expirado',
    idempotencyKey: `contact-info-pix-replace:${receivable.id}:${currentIntent.id}:${currentIntent.provider}`,
  };
}

function receivableStatusText(status: Receivable['displayStatus']) {
  if (status === 'PENDENTE') return 'EM ABERTO';
  return status;
}

function paymentIntentStatusText(status: PaymentIntent['status']) {
  const labels: Record<PaymentIntent['status'], string> = {
    CANCELED: 'cancelado',
    CREATED: 'criado',
    EXPIRED: 'expirado',
    FAILED: 'com falha',
    PAID: 'pago',
    REFUNDED: 'estornado',
    SUPERSEDED: 'substituído',
    WAITING_PAYMENT: 'aguardando pagamento',
  };

  return labels[status];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
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
  const conversationPhone = conversationDisplayPhone(conversation);

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
                initialValues={{
                  phone: conversationPhone,
                  phoneCountry: conversation.phoneCountry ?? undefined,
                }}
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

function conversationDisplayPhone(conversation: WhatsAppConversation) {
  if (conversation.phoneE164 && !conversation.phoneE164.startsWith('+55')) {
    return conversation.phoneE164;
  }

  return normalizeWhatsAppDisplayPhone(conversation.phoneNormalized) ?? conversation.phone;
}

export function isInternationalWhatsAppConversation(
  conversation: WhatsAppConversation | null | undefined,
) {
  if (!conversation) return false;
  if (conversation.phoneCountry) return conversation.phoneCountry !== 'BR';
  return Boolean(conversation.phoneE164 && !conversation.phoneE164.startsWith('+55'));
}

export function phoneDigitsCompatible(left: string, right: string) {
  const leftDigits = phoneDigits(left);
  const rightDigits = phoneDigits(right);

  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;
  if (!leftDigits.startsWith('55') || !rightDigits.startsWith('55')) return false;

  const leftNational = leftDigits.slice(2);
  const rightNational = rightDigits.slice(2);
  if (![10, 11].includes(leftNational.length) || ![10, 11].includes(rightNational.length)) {
    return false;
  }

  const shorter = leftNational.length < rightNational.length ? leftNational : rightNational;
  const longer = leftNational.length > rightNational.length ? leftNational : rightNational;

  if (shorter.length !== 10 || longer.length !== 11) return false;

  return longer.startsWith(`${shorter.slice(0, 2)}9`) && longer.slice(3) === shorter.slice(2);
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

export function mergeConversationMessages(
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
  return [conversation, ...existing];
}

export function mergeConversationLists(
  current: WhatsAppConversation[],
  incoming: WhatsAppConversation[],
) {
  const incomingById = new Map(incoming.map((conversation) => [conversation.id, conversation]));
  const currentIds = new Set(current.map((conversation) => conversation.id));
  const merged = current.map((conversation) => incomingById.get(conversation.id) ?? conversation);
  for (const conversation of incoming) {
    if (!currentIds.has(conversation.id)) {
      merged.push(conversation);
    }
  }
  return merged;
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

export function conversationInitials(conversation: Pick<WhatsAppConversation, 'displayName'>) {
  const name = conversation.displayName.trim().replace(/\s+/g, ' ');
  if (!name) return '';
  const parts = name.split(' ').filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase().slice(0, 2);
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

export function conversationMessageFooterLabel(message: WhatsAppConversationMessage) {
  if (!message.editedAt) return conversationMessageTime(message);
  const editedTime = new Date(message.editedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Editada ${editedTime}`;
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
  if (message.type === 'CONTACT') return 'Contato compartilhado';
  if (message.type === 'CONTACTS') {
    return message.contacts?.length
      ? `${message.contacts.length} contatos compartilhados`
      : 'Contatos compartilhados';
  }
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
    CONTACT: '[Contato compartilhado]',
    CONTACTS: '[Contatos compartilhados]',
    DOCUMENT: '',
    IMAGE: '[Imagem]',
    LOCATION: '[Localização]',
    STICKER: '[Figurinha]',
    TEXT: '',
    UNKNOWN: '',
    VIDEO: '[Vídeo]',
  } satisfies Record<WhatsAppConversationMessageType, string>;
  return labels[type];
}

function isRenderableConversationMedia(type: WhatsAppConversationMessageType) {
  return (
    type === 'IMAGE' ||
    type === 'DOCUMENT' ||
    type === 'AUDIO' ||
    type === 'VIDEO' ||
    type === 'STICKER'
  );
}

export function conversationMediaUnavailableText(type: WhatsAppConversationMessageType) {
  if (type === 'AUDIO') return 'Mídia indisponível';
  if (type === 'DOCUMENT') return 'Mídia indisponível';
  if (type === 'IMAGE') return 'Imagem indisponível';
  if (type === 'STICKER') return 'Figurinha indisponível';
  return conversationMessagePlaceholder(type);
}

export function isAvailableInlineConversationMedia(message: WhatsAppConversationMessage) {
  return (
    (message.type === 'IMAGE' ||
      message.type === 'AUDIO' ||
      message.type === 'VIDEO' ||
      message.type === 'STICKER') &&
    message.mediaAvailable
  );
}

export function isTechnicalVideoPlaceholder(text: string | null | undefined) {
  return text?.trim().toLowerCase() === ':video:';
}

export function conversationMessageDisplayText(message: WhatsAppConversationMessage) {
  if (message.deleted) return 'Mensagem apagada';
  if (message.type === 'TEXT') return message.text || '';
  if (
    message.type === 'IMAGE' ||
    message.type === 'STICKER' ||
    message.type === 'CONTACT' ||
    message.type === 'CONTACTS'
  )
    return '';
  return conversationMessagePlaceholder(message.type);
}

export function conversationMessageCaption(message: WhatsAppConversationMessage) {
  if (message.deleted) return '';
  if (message.type === 'TEXT') return '';
  if (message.type === 'VIDEO' && isTechnicalVideoPlaceholder(message.text)) return '';
  if (message.type === 'STICKER' && isTechnicalStickerPlaceholder(message.text)) return '';
  return message.text?.trim() || '';
}

export function isTechnicalStickerPlaceholder(text: string | null | undefined) {
  const normalized = text?.trim().toLowerCase();
  return normalized === ':sticker:' || normalized === '[figurinha]';
}

function conversationMessageQuotePreview(message: WhatsAppConversationMessage) {
  if (message.deleted) return 'Mensagem apagada';
  const text = message.text?.trim();
  if (text) return text.slice(0, 160);
  if (message.type === 'IMAGE') return 'Imagem';
  if (message.type === 'AUDIO') return 'Áudio';
  if (message.type === 'DOCUMENT') return message.mediaFileName || 'Documento';
  if (message.type === 'VIDEO') return 'Vídeo';
  if (message.type === 'STICKER') return 'Figurinha';
  if (message.type === 'LOCATION') return 'Localização';
  if (message.type === 'CONTACT') return 'Contato compartilhado';
  if (message.type === 'CONTACTS') return 'Contatos compartilhados';
  return 'Mensagem';
}

function conversationReplyFallbackPreview(message: WhatsAppConversationMessage) {
  if (message.replyTo) {
    if (message.replyTo.deleted) return 'Mensagem apagada';

    return conversationMessageQuotePreview({
      ...message,
      text: message.replyTo.text,
      type: message.replyTo.type,
      mediaFileName: message.replyTo.mediaFileName,
      deleted: message.replyTo.deleted,
      deletedAt: message.replyTo.deletedAt,
      deletedForEveryone: message.replyTo.deletedForEveryone,
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
