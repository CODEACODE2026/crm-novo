import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceConversationListGeneration,
  allowedWhatsAppReactionEmojis,
  buildContactFinancialSummary,
  buildContactRecentActivity,
  calculateQuickReplyMenuViewportPosition,
  calculateReactionPickerPosition,
  classifyContactPixState,
  classifyConversationIncomingFile,
  ConversationContactContent,
  ConversationPixCopyAction,
  contactDrawerVisibleItems,
  contactReferenceFinancialState,
  contactReferenceActionMatrix,
  contactOpenReceivable,
  contactPixCanSendWhatsApp,
  contactPixReplacementPayload,
  contactPixWhatsAppButtonLabel,
  contactReceivablePaginationPages,
  contactReceivableAllowsPixAction,
  filterContactReferences,
  findExactSharedContactClient,
  findExactSharedContactConversation,
  hasAmbiguousSharedContactConversation,
  contactRelevantReceivable,
  contactReceivablesForReference,
  conversationComposerActionMode,
  conversationInitials,
  conversationMessageFooterLabel,
  conversationPixCopyButtonLabel,
  conversationVideoAccept,
  createConversationComposerMedia,
  disposeConversationComposerMedia,
  conversationMessageCaption,
  conversationMessageDisplayText,
  conversationMediaUnavailableText,
  isConversationPixCopyEligible,
  isDeleteEligibleConversationMessage,
  isEditEligibleConversationMessage,
  isForwardEligibleConversationMessage,
  isAvailableInlineConversationMedia,
  isRenderableConversationMessage,
  isTechnicalVideoPlaceholder,
  isTechnicalStickerPlaceholder,
  mergeConversationById,
  mergeConversationLists,
  mergeConversationMessages,
  nextOwnReactionEmoji,
  nextConversationPresenceState,
  nextConversationListRequestGeneration,
  resolveRealtimeCreatedMessage,
  savedStickerPreviewKind,
  sharedContactBrazilPhoneCandidates,
  shouldApplySharedContactActionResult,
  resolveConversationPixCopyAction,
  shouldAutoReadRealtimeMessage,
  shouldApplyConversationListResponse,
  shouldReadVisibleConversationOnReturn,
  shouldRetryActiveConversationRead,
  sortContactReferences,
  stopConversationPixCopyEvent,
  summarizeConversationReactions,
  updateConversationSummaryAfterRead,
} from './WhatsAppInbox';
import {
  applyWhatsAppSlashQuickReply,
  applyWhatsAppQuickReply,
  filterWhatsAppQuickReplies,
  whatsAppQuickReplySlashQuery,
  whatsAppQuickReplyPreview,
} from './whatsapp-quick-replies';
import type {
  ClientEvent,
  ClientOption,
  ClientReference,
  PaymentIntent,
  Receivable,
  Renewal,
  WhatsAppConversation,
  WhatsAppConversationMessage,
} from '../../lib/crm-api';
import type { ConversationPixCopyCache, ConversationPixCopyInFlight } from './WhatsAppInbox';

const currentDir = dirname(fileURLToPath(import.meta.url));
const whatsAppInboxSource = readFileSync(join(currentDir, 'WhatsAppInbox.tsx'), 'utf8');
const dashboardSource = readFileSync(join(currentDir, '../../app/dashboard/page.tsx'), 'utf8');
const whatsAppRealtimeProviderSource = readFileSync(
  join(currentDir, 'WhatsAppRealtimeProvider.tsx'),
  'utf8',
);
const whatsAppQuickRepliesSource = readFileSync(
  join(currentDir, 'whatsapp-quick-replies.ts'),
  'utf8',
);
const quickReplyFilterFixture = [
  {
    id: 'expired-pix',
    label: 'PIX expirado',
    text: 'Esse PIX expirou. Posso gerar uma nova cobrança para você.',
  },
  {
    id: 'follow-up',
    label: 'Retorno',
    text: 'Assim que eu tiver uma atualização, retorno por aqui.',
  },
];
const referenceLifecycleModalsSource = readFileSync(
  join(currentDir, '../clients/reference-lifecycle-modals.tsx'),
  'utf8',
);
const globalStylesSource = readFileSync(join(currentDir, '../../app/globals.css'), 'utf8');

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
    needsManualFollowUp: false,
    lastAutoReplyAt: null,
    labels: [],
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
    editedAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    deleted: false,
    deletedAt: null,
    deletedForEveryone: false,
    isFromMe: false,
    isAutoReply: false,
    providerMessageId: 'provider-message-1',
    replyTo: null,
    replyToMessageId: null,
    replyToProviderMessageId: null,
    quotedText: null,
    mediaMimeType: null,
    mediaFileName: null,
    mediaSizeBytes: null,
    mediaDurationSeconds: null,
    contacts: [],
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

function contactReference(id: string, overrides: Partial<ClientReference> = {}): ClientReference {
  return {
    id,
    billingAnchorDay: 10,
    billingNoticeDays: 5,
    canceledAt: null,
    canceledByUserId: null,
    cancellationReason: null,
    clientId: 'client-1',
    createdAt: '2026-10-01T12:00:00.000Z',
    dueDate: '2026-10-10',
    inactivatedAt: null,
    inactivatedByUserId: null,
    inactivationReason: null,
    notes: null,
    plan: {
      id: 'plan-1',
      active: true,
      defaultValue: '100.00',
      durationMonths: 1,
      name: 'Mensal',
    },
    planId: 'plan-1',
    recurringValue: '100.00',
    reference: `ref-${id}`,
    status: 'ATIVO',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function receivable(id: string, overrides: Partial<Receivable> = {}): Receivable {
  return {
    id,
    amount: '100.00',
    canceledAt: null,
    cancelReason: null,
    clientId: 'client-1',
    clientReferenceId: 'reference-1',
    createdAt: '2026-10-01T12:00:00.000Z',
    description: `Cobrança ${id}`,
    displayStatus: 'PENDENTE',
    dueDate: '2026-10-10',
    paidAt: null,
    paymentIntents: [],
    purpose: 'RENEWAL',
    renewalId: null,
    sourceKind: 'RECEIVABLE',
    status: 'PENDENTE',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function renewal(id: string, overrides: Partial<Renewal> = {}): Renewal {
  return {
    id,
    amount: '100.00',
    clientId: 'client-1',
    clientReferenceId: 'reference-1',
    createdAt: '2026-10-01T12:00:00.000Z',
    durationMonths: 1,
    newDueDate: '2026-11-10',
    planId: 'plan-1',
    planName: 'Mensal',
    previousDueDate: '2026-10-10',
    receivable: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

function clientEvent(id: string, overrides: Partial<ClientEvent> = {}): ClientEvent {
  return {
    id,
    createdAt: '2026-10-01T12:00:00.000Z',
    description: null,
    title: `Evento ${id}`,
    type: 'CLIENT_REFERENCE_REACTIVATION_REQUESTED',
    ...overrides,
  };
}

function paymentIntent(id: string, overrides: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id,
    amount: '100.00',
    blockchainTxId: null,
    createdAt: '2026-10-01T12:00:00.000Z',
    expiresAt: '2026-10-12T12:30:00.000Z',
    externalDepixId: null,
    externalStatus: null,
    failureCode: null,
    failureMessage: null,
    lastSyncAt: null,
    paidAt: null,
    paymentGroupId: null,
    pixCopyPaste: '000201',
    provider: 'FASTPAY',
    providerTransactionId: 'tx-1',
    qrCodeData: null,
    receivableId: 'open-1',
    status: 'WAITING_PAYMENT',
    updatedAt: '2026-10-01T12:00:00.000Z',
    ...overrides,
  };
}

function pixCopyCache(): ConversationPixCopyCache {
  return new Map();
}

function pixCopyInFlight(): ConversationPixCopyInFlight {
  return new Map();
}

describe('WhatsAppInbox unread reconciliation helpers', () => {
  it('builds WhatsApp-style avatar initials and falls back for missing names', () => {
    expect(conversationInitials(conversation('1', { displayName: 'Maria Silva' }))).toBe('MS');
    expect(conversationInitials(conversation('1', { displayName: '  João   ' }))).toBe('J');
    expect(conversationInitials(conversation('1', { displayName: 'Ana Maria Souza' }))).toBe('AS');
    expect(conversationInitials(conversation('1', { displayName: '' }))).toBe('');
  });

  it('wires conversation avatars into sidebar and header with image error fallback', () => {
    expect(whatsAppInboxSource).toContain('getWhatsAppConversationAvatar');
    expect(whatsAppInboxSource).toContain('avatarClientCacheTtlMs');
    expect(whatsAppInboxSource).toContain('avatarClientConcurrency = 4');
    expect(whatsAppInboxSource).toContain('avatarInFlightRef');
    expect(whatsAppInboxSource).toContain('<ConversationAvatar');
    expect(whatsAppInboxSource).toContain('onError={() =>');
    expect(whatsAppInboxSource).toContain('conversation-unread-badge');
    expect(whatsAppInboxSource).toContain('conversation-presence-label');
    expect(globalStylesSource).toContain('.conversation-avatar.has-image');
    expect(globalStylesSource).toContain('object-fit: cover');
  });

  it('wires avatar preview lightbox without adding another avatar fetch path', () => {
    expect(whatsAppInboxSource).toContain('WhatsAppAvatarPreview');
    expect(whatsAppInboxSource).toContain('aria-label="Ver foto de perfil"');
    expect(whatsAppInboxSource).toContain('aria-modal="true"');
    expect(whatsAppInboxSource).toContain('role="dialog"');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('document.body.style.overflow =');
    expect(whatsAppInboxSource).toContain('event.target === event.currentTarget');
    expect(whatsAppInboxSource).toContain('onMouseDown={(event) => event.stopPropagation()}');
    expect(whatsAppInboxSource).toContain('handleAvatarPreviewImageError');
    expect(whatsAppInboxSource).not.toContain('Preview: false');
    expect(globalStylesSource).toContain('.whatsapp-avatar-preview-backdrop');
    expect(globalStylesSource).toContain('width: min(80vw, 700px)');
    expect(globalStylesSource).toContain('height: min(80vw, 700px)');
    expect(globalStylesSource).toContain('width: 100%');
    expect(globalStylesSource).toContain('height: 100%');
    expect(globalStylesSource).toContain('max-height: 80vh');
    expect(globalStylesSource).toContain('height: min(calc(100vw - 32px), 75vh)');
  });

  it('detects PIX copy eligibility only from pixContext', () => {
    expect(
      isConversationPixCopyEligible(
        message({
          direction: 'OUTBOUND',
          text: 'PIX\nValor: R$ 30,00',
          pixContext: {
            amount: '30.00',
            buttonLabel: 'Copiar Chave PIX',
            paymentIntentId: 'intent-1',
          },
        }),
      ),
    ).toBe(true);
    expect(isConversationPixCopyEligible(message({ text: 'PIX\ntexto comum' }))).toBe(false);
  });

  it('keeps PIX messages renderable through their body text without making empty pixContext renderable', () => {
    expect(
      isRenderableConversationMessage(
        message({
          direction: 'OUTBOUND',
          text: 'PIX\nValor: R$ 30,00',
          pixContext: {
            amount: '30.00',
            buttonLabel: 'Copiar Chave PIX',
            paymentIntentId: 'intent-1',
          },
        }),
      ),
    ).toBe(true);
    expect(
      isRenderableConversationMessage(
        message({
          direction: 'OUTBOUND',
          text: null,
          pixContext: {
            amount: '30.00',
            buttonLabel: 'Copiar Chave PIX',
            paymentIntentId: 'intent-1',
          },
        }),
      ),
    ).toBe(false);
  });

  it('labels the PIX copy button without exposing the PIX payload', () => {
    expect(conversationPixCopyButtonLabel(' Copiar Chave PIX ')).toBe('Copiar Chave PIX');
    expect(conversationPixCopyButtonLabel('', { status: 'loading' })).toBe('Copiando...');
    expect(conversationPixCopyButtonLabel('', { status: 'success' })).toBe('PIX copiado');
    expect(conversationPixCopyButtonLabel('', { status: 'expired' })).toBe('PIX expirado');
    expect(conversationPixCopyButtonLabel('', { status: 'unavailable' })).toBe('PIX indisponível');
    expect(conversationPixCopyButtonLabel('', { status: 'fetch_error' })).toBe(
      'Não foi possível carregar o PIX',
    );
    expect(conversationPixCopyButtonLabel('', { status: 'copy_error' })).toBe(
      'Não foi possível copiar o PIX',
    );
  });

  it('renders the PIX copy action from pixContext without leaking the copy-paste payload', () => {
    const onCopyPix = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ConversationPixCopyAction, {
        message: message({
          direction: 'OUTBOUND',
          text: 'PIX\nValor: R$ 30,00',
          pixContext: {
            amount: '30.00',
            buttonLabel: 'Copiar <Chave> PIX',
            paymentIntentId: 'intent-1',
          },
        }),
        onCopyPix,
      }),
    );

    expect(html).toContain('class="conversation-pix-copy"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Copiar chave PIX"');
    expect(html).toContain('Copiar &lt;Chave&gt; PIX');
    expect(html).not.toContain('PIX-COPY-SECRET');
    expect(html).not.toContain('pixCopyPaste');
    expect(html).not.toContain('data-pix');
    expect(onCopyPix).not.toHaveBeenCalled();
  });

  it('does not render a PIX copy action for regular messages or PIX-looking text without pixContext', () => {
    const onCopyPix = vi.fn();

    expect(
      renderToStaticMarkup(
        createElement(ConversationPixCopyAction, {
          message: message({ text: 'PIX\nValor: R$ 30,00' }),
          onCopyPix,
        }),
      ),
    ).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(ConversationPixCopyAction, {
          message: message({ text: 'Mensagem comum' }),
          onCopyPix,
        }),
      ),
    ).toBe('');
  });

  it('stops PIX copy click propagation before delegating to the action', () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    stopConversationPixCopyEvent(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('resolves PIX copy lazily and copies only available payloads', async () => {
    const fetchPixCopy = vi.fn().mockResolvedValue({
      available: true,
      expiresAt: '2099-10-10T00:30:00.000Z',
      isExpired: false,
      pixCopyPaste: 'PIX-COPY-SECRET',
      status: 'WAITING_PAYMENT',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const cache = pixCopyCache();
    const inFlight = pixCopyInFlight();

    expect(fetchPixCopy).not.toHaveBeenCalled();
    await expect(
      resolveConversationPixCopyAction({
        cache,
        fetchPixCopy,
        inFlight,
        paymentIntentId: 'intent-1',
        writeText,
      }),
    ).resolves.toEqual({ status: 'success' });

    expect(fetchPixCopy).toHaveBeenCalledWith('intent-1');
    expect(writeText).toHaveBeenCalledWith('PIX-COPY-SECRET');
  });

  it('does not copy expired, unavailable, failed fetch, or failed clipboard PIX payloads', async () => {
    const expiredFetch = vi.fn().mockResolvedValue({
      available: false,
      expiresAt: '2026-10-10T00:30:00.000Z',
      isExpired: true,
      pixCopyPaste: null,
      status: 'EXPIRED',
    });
    const unavailableFetch = vi.fn().mockResolvedValue({
      available: false,
      expiresAt: null,
      isExpired: false,
      pixCopyPaste: null,
      status: 'WAITING_PAYMENT',
    });
    const rejectedFetch = vi.fn().mockRejectedValue(new Error('offline'));
    const rejectedClipboardFetch = vi.fn().mockResolvedValue({
      available: true,
      expiresAt: null,
      isExpired: false,
      pixCopyPaste: 'PIX-COPY-SECRET',
      status: 'WAITING_PAYMENT',
    });
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      resolveConversationPixCopyAction({
        cache: pixCopyCache(),
        fetchPixCopy: expiredFetch,
        inFlight: pixCopyInFlight(),
        paymentIntentId: 'expired',
        writeText,
      }),
    ).resolves.toEqual({ status: 'expired' });
    await expect(
      resolveConversationPixCopyAction({
        cache: pixCopyCache(),
        fetchPixCopy: unavailableFetch,
        inFlight: pixCopyInFlight(),
        paymentIntentId: 'unavailable',
        writeText,
      }),
    ).resolves.toEqual({ status: 'unavailable' });
    await expect(
      resolveConversationPixCopyAction({
        cache: pixCopyCache(),
        fetchPixCopy: rejectedFetch,
        inFlight: pixCopyInFlight(),
        paymentIntentId: 'fetch-error',
        writeText,
      }),
    ).resolves.toEqual({ status: 'fetch_error' });
    await expect(
      resolveConversationPixCopyAction({
        cache: pixCopyCache(),
        fetchPixCopy: rejectedClipboardFetch,
        inFlight: pixCopyInFlight(),
        paymentIntentId: 'copy-error',
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      }),
    ).resolves.toEqual({ status: 'copy_error' });

    expect(writeText).not.toHaveBeenCalled();
  });

  it('dedupes in-flight PIX copy requests and reuses cached endpoint results', async () => {
    let resolveFetch: (value: {
      available: boolean;
      expiresAt: string | null;
      isExpired: boolean;
      pixCopyPaste: string | null;
      status: 'WAITING_PAYMENT';
    }) => void = () => {};
    const fetchPixCopy = vi.fn(
      () =>
        new Promise<{
          available: boolean;
          expiresAt: string | null;
          isExpired: boolean;
          pixCopyPaste: string | null;
          status: 'WAITING_PAYMENT';
        }>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    const cache = pixCopyCache();
    const inFlight = pixCopyInFlight();

    const first = resolveConversationPixCopyAction({
      cache,
      fetchPixCopy,
      inFlight,
      paymentIntentId: 'intent-1',
      writeText,
    });
    const second = resolveConversationPixCopyAction({
      cache,
      fetchPixCopy,
      inFlight,
      paymentIntentId: 'intent-1',
      writeText,
    });

    expect(fetchPixCopy).toHaveBeenCalledTimes(1);
    resolveFetch?.({
      available: true,
      expiresAt: null,
      isExpired: false,
      pixCopyPaste: 'PIX-COPY-SECRET',
      status: 'WAITING_PAYMENT',
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'success' },
      { status: 'success' },
    ]);

    await resolveConversationPixCopyAction({
      cache,
      fetchPixCopy,
      inFlight,
      paymentIntentId: 'intent-1',
      writeText,
    });

    expect(fetchPixCopy).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it('wires the PIX copy action inside message bubbles without rendering PIX payloads', () => {
    expect(whatsAppInboxSource).toContain('getPaymentIntentPixCopy');
    expect(whatsAppInboxSource).toContain('ConversationPixCopyAction');
    expect(whatsAppInboxSource).toContain('message.pixContext?.paymentIntentId');
    expect(whatsAppInboxSource).toContain('navigator.clipboard.writeText(value)');
    expect(whatsAppInboxSource).toContain('pixCopyCacheRef');
    expect(whatsAppInboxSource).toContain('pixCopyInFlightRef');
    expect(whatsAppInboxSource).toContain('pixCopyMountedRef');
    expect(whatsAppInboxSource).toContain('if (!pixCopyMountedRef.current) return;');
    expect(whatsAppInboxSource).toContain('stopConversationPixCopyEvent(event)');
    expect(whatsAppInboxSource).toContain('aria-label="Copiar chave PIX"');
    expect(whatsAppInboxSource).toContain('type="button"');
    expect(whatsAppInboxSource).not.toContain('data-pix');
    expect(globalStylesSource).toContain('.conversation-pix-copy');
    expect(globalStylesSource).toContain('width: 100%');
    expect(globalStylesSource).toContain('min-height: 36px');
  });

  it('wires the contact info drawer with references and existing PIX flow actions', () => {
    expect(whatsAppInboxSource).toContain('conversation-contact-name-button');
    expect(whatsAppInboxSource).toContain('conversation-contact-drawer');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('listReceivables({');
    expect(whatsAppInboxSource).toContain('listContactReceivables(client.id)');
    expect(whatsAppInboxSource).toContain('listReceivables({ clientId, page: 1, pageSize })');
    expect(whatsAppInboxSource).toContain('contactReceivablePaginationPages({');
    expect(whatsAppInboxSource).toContain('ConversationReferenceList');
    expect(whatsAppInboxSource).toContain('ConversationReferenceCard');
    expect(whatsAppInboxSource).toContain('buildContactFinancialSummary(client.references ?? []');
    expect(whatsAppInboxSource).toContain('financialSummary ? <ConversationFinancialSummary');
    expect(whatsAppInboxSource).toContain('buildContactRecentActivity({');
    expect(whatsAppInboxSource).toContain('ConversationRecentActivity');
    expect(whatsAppInboxSource).toContain('Atividade recente');
    expect(whatsAppInboxSource).toContain('Nenhuma atividade recente');
    expect(whatsAppInboxSource).toContain('Gerar PIX');
    expect(whatsAppInboxSource).toContain('createReceivablePix(receivable.id)');
    expect(whatsAppInboxSource).toContain('Recriar PIX');
    expect(whatsAppInboxSource).toContain('previewReceivablePixReplacement(receivable.id');
    expect(whatsAppInboxSource).toContain('window.confirm(`${preview.warning}');
    expect(whatsAppInboxSource).toContain('replaceReceivablePix(receivable.id');
    expect(whatsAppInboxSource).toContain(
      'contactPixReplacementPayload(receivable, currentIntent)',
    );
    expect(whatsAppInboxSource).toContain('PIX recriado com sucesso');
    expect(whatsAppInboxSource).toContain('Enviar no WhatsApp');
    expect(whatsAppInboxSource).toContain('sendPaymentIntentWhatsApp(intent.id)');
    expect(whatsAppInboxSource).toContain('contactPixCanSendWhatsApp(openReceivable, visiblePix)');
    expect(whatsAppInboxSource).toContain('contactPixWhatsAppIntentIdsRef.current.has(intent.id)');
    expect(whatsAppInboxSource).toContain('contactPixWhatsAppIntentIdsRef.current.add(intent.id)');
    expect(whatsAppInboxSource).toContain(
      'contactPixWhatsAppIntentIdsRef.current.delete(intent.id)',
    );
    expect(whatsAppInboxSource).toContain('pixWhatsAppBusyIntentIds.has(visiblePix.id)');
    expect(whatsAppInboxSource).toContain('disabled={pixWhatsAppSending}');
    expect(whatsAppInboxSource).toContain('contactPixWhatsAppButtonLabel(pixWhatsAppSending)');
    expect(whatsAppInboxSource).not.toContain('pixCopyPaste: visiblePix.pixCopyPaste');
    expect(whatsAppInboxSource).not.toContain('phoneNormalized: conversation.phoneNormalized');
    expect(whatsAppInboxSource).toContain('preserveNotice: true');
    expect(whatsAppInboxSource).toContain("reference.status === 'CANCELADO'");
    expect(whatsAppInboxSource).toContain('ReferenceRenewalModal');
    expect(whatsAppInboxSource).toContain('ReferenceReactivationModal');
    expect(referenceLifecycleModalsSource).toContain('previewReferenceRenewal(reference.id');
    expect(referenceLifecycleModalsSource).toContain('PENDING_REACTIVATION_EXISTS');
    expect(whatsAppInboxSource).toContain('confirmReferenceRenewal(target.reference.id');
    expect(whatsAppInboxSource).toContain('createReferenceReactivation(target.reference.id');
    expect(whatsAppInboxSource).toContain("kind: 'whatsapp' as const");
    expect(whatsAppInboxSource).toContain('conversationId');
    expect(whatsAppInboxSource).toContain('contactPanelOpen');
    expect(whatsAppInboxSource).toContain("tab: 'receivables'");
    expect(whatsAppInboxSource).toContain('if (!request.conversationId)');
    expect(whatsAppInboxSource).toContain('openContactPanel: restoreContactPanelOpen');
    expect(whatsAppInboxSource).toContain('onConversationLocationChange({');
    expect(whatsAppInboxSource).toContain('conversationId: selectedConversation.id');
    expect(whatsAppInboxSource).toContain('Abrir cliente');
    expect(globalStylesSource).toContain('.conversation-contact-drawer');
    expect(globalStylesSource).toContain('.conversation-reference-card');
    expect(globalStylesSource).toContain('.conversation-financial-summary');
    expect(globalStylesSource).toContain('.conversation-recent-activity');
    expect(globalStylesSource).toContain('.conversation-activity-item');
    expect(globalStylesSource).toContain('width: min(430px, calc(100vw - 24px))');
    expect(globalStylesSource).toContain('width: min(100vw, 440px)');
  });

  it('keeps the contact drawer compact, readable and responsive without changing its actions', () => {
    const financialPosition = whatsAppInboxSource.indexOf(
      'financialSummary ? <ConversationFinancialSummary',
    );
    const notesPosition = whatsAppInboxSource.indexOf(
      'conversation-contact-section conversation-internal-notes',
    );

    expect(whatsAppInboxSource).toContain('if (!open) return null;');
    expect(whatsAppInboxSource).toContain('label="Fechar informações do contato"');
    expect(whatsAppInboxSource).toContain('conversation-contact-profile-copy');
    expect(whatsAppInboxSource).toContain('conversation-client-summary-grid');
    expect(whatsAppInboxSource).toContain("linked ? 'Cliente vinculado'");
    expect(whatsAppInboxSource).toContain('onOpenClient: () => onOpenClient(loadedClient.id)');
    expect(whatsAppInboxSource).toContain('Abrir cliente');
    expect(financialPosition).toBeGreaterThan(-1);
    expect(notesPosition).toBeGreaterThan(financialPosition);

    expect(globalStylesSource).toContain('overflow-x: hidden');
    expect(globalStylesSource).toContain('grid-template-columns: 46px minmax(0, 1fr) auto');
    expect(globalStylesSource).toContain('width: 46px');
    expect(globalStylesSource).toContain('.conversation-client-summary-grid');
    expect(globalStylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    expect(globalStylesSource).toContain('.conversation-activity-item:last-child');
    expect(globalStylesSource).toContain('border-bottom: 0');
    expect(globalStylesSource).toContain('.conversation-reference-card .detail-list.compact');
    expect(globalStylesSource).toContain('grid-template-columns: 42px minmax(0, 1fr)');
    expect(globalStylesSource).toContain('.conversation-activity-amount');
    expect(globalStylesSource).toContain('grid-column: 2');
  });

  it('keeps contact internal notes on the client update path only', () => {
    expect(whatsAppInboxSource).toContain('Notas internas');
    expect(whatsAppInboxSource).toContain('Nenhuma nota interna');
    expect(whatsAppInboxSource).toContain('Adicionar nota');
    expect(whatsAppInboxSource).toContain("{client.notes ? 'Editar' : 'Adicionar nota'}");
    expect(whatsAppInboxSource).toContain('aria-label="Nota interna do cliente"');
    expect(whatsAppInboxSource).toContain('updateClient(clientId, { notes: notes.trim() })');
    expect(whatsAppInboxSource).toContain('await loadContactInfo(selectedConversationRef.current');
    expect(whatsAppInboxSource).toContain('silent: true');
    expect(whatsAppInboxSource).toContain('preserveNotice: true');
    expect(whatsAppInboxSource).toContain("notice: 'Nota salva.'");
    expect(whatsAppInboxSource).toContain("setNotesDraft(client.notes ?? '')");
    expect(whatsAppInboxSource).toContain('disabled={notesSaving}');
    expect(whatsAppInboxSource).toContain('notesContextRef');
    expect(whatsAppInboxSource).toContain('currentContext.clientId === requestContext.clientId');
    expect(whatsAppInboxSource).toContain(
      'currentContext.conversationId === requestContext.conversationId',
    );
    expect(whatsAppInboxSource).not.toContain('dangerouslySetInnerHTML');
    expect(whatsAppInboxSource).not.toContain('sendWhatsAppMessage(notes');
    expect(whatsAppInboxSource).not.toContain('sendWhatsAppConversationMessage(notes');
    expect(whatsAppInboxSource).not.toContain('sendPaymentIntentWhatsApp(notes');
    expect(globalStylesSource).toContain('.conversation-internal-notes');
    expect(globalStylesSource).toContain('.conversation-internal-notes-editor');
    expect(globalStylesSource).toContain('white-space: pre-wrap');
  });

  it('builds no contact recent activity when sources are empty or client is absent', () => {
    expect(buildContactRecentActivity({ receivables: [], renewals: [], clientEvents: [] })).toEqual(
      [],
    );
  });

  it('uses paid receivable status plus real paidAt for contact payment activity', () => {
    const activities = buildContactRecentActivity({
      receivables: [
        receivable('paid', {
          amount: '49.90',
          paidAt: '2026-10-10T14:32:00.000Z',
          status: 'PAGO',
          displayStatus: 'PAGO',
        }),
        receivable('paid-without-date', {
          paidAt: null,
          status: 'PAGO',
          displayStatus: 'PAGO',
        }),
      ],
    });

    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      amount: '49.90',
      occurredAt: '2026-10-10T14:32:00.000Z',
      title: 'Pagamento recebido',
      type: 'PAYMENT',
    });
  });

  it('uses createdAt for pending receivable creation activity', () => {
    expect(
      buildContactRecentActivity({
        receivables: [
          receivable('created', {
            createdAt: '2026-10-09T10:00:00.000Z',
            displayStatus: 'PENDENTE',
            status: 'PENDENTE',
          }),
        ],
      })[0],
    ).toMatchObject({
      occurredAt: '2026-10-09T10:00:00.000Z',
      title: 'Cobrança gerada',
      type: 'RECEIVABLE_CREATED',
    });
  });

  it('uses dueDate for overdue activity only when the charge is still pending', () => {
    const activities = buildContactRecentActivity({
      now: Date.parse('2026-10-12T12:00:00.000Z'),
      receivables: [
        receivable('overdue', {
          dueDate: '2026-10-01',
          displayStatus: 'VENCIDO',
          status: 'PENDENTE',
        }),
        receivable('paid-overdue-looking', {
          dueDate: '2026-10-02',
          displayStatus: 'VENCIDO',
          paidAt: '2026-10-03T12:00:00.000Z',
          status: 'PAGO',
        }),
      ],
    });

    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({ title: 'Pagamento recebido', type: 'PAYMENT' });
    expect(activities[1]).toMatchObject({
      occurredAt: '2026-10-01',
      title: 'Cobrança venceu',
      type: 'RECEIVABLE_OVERDUE',
    });
  });

  it('adds renewal activity from real renewals', () => {
    const activities = buildContactRecentActivity({
      renewals: [
        renewal('renewal-1', {
          amount: '49.90',
          createdAt: '2026-10-05T10:00:00.000Z',
          planName: 'Plano Mensal',
        }),
      ],
    });

    expect(activities[0]).toMatchObject({
      amount: '49.90',
      occurredAt: '2026-10-05T10:00:00.000Z',
      subtitle: 'Plano Mensal',
      title: 'Renovação realizada',
      type: 'RENEWAL',
    });
  });

  it('adds reactivation activity only from official client events', () => {
    const activities = buildContactRecentActivity({
      clientEvents: [
        clientEvent('reactivation-requested', {
          createdAt: '2026-10-04T10:00:00.000Z',
          description: 'Aguardando pagamento.',
          type: 'CLIENT_REFERENCE_REACTIVATION_REQUESTED',
        }),
        clientEvent('reactivation-done', {
          createdAt: '2026-10-06T10:00:00.000Z',
          type: 'CLIENT_REFERENCE_REACTIVATED',
        }),
        clientEvent('technical', { type: 'PIX_PAYMENT_STATUS_UPDATED' }),
      ],
    });

    expect(activities).toHaveLength(2);
    expect(activities.map((item) => item.title)).toEqual([
      'Reativação concluída',
      'Reativação iniciada',
    ]);
  });

  it('orders, dedupes and limits contact recent activity by reliable dates', () => {
    const renewalReceivable = receivable('renewal-receivable', {
      createdAt: '2026-10-08T10:00:00.000Z',
      renewalId: 'renewal-1',
    });
    const activities = buildContactRecentActivity({
      limit: 3,
      receivables: [
        renewalReceivable,
        receivable('created-new', { createdAt: '2026-10-11T10:00:00.000Z' }),
        receivable('created-old', { createdAt: '2026-10-01T10:00:00.000Z' }),
      ],
      renewals: [
        renewal('renewal-1', {
          createdAt: '2026-10-09T10:00:00.000Z',
          receivable: renewalReceivable,
        }),
      ],
      clientEvents: [
        clientEvent('reactivation', {
          createdAt: '2026-10-10T10:00:00.000Z',
          type: 'CLIENT_REFERENCE_REACTIVATION_REQUESTED',
        }),
      ],
    });

    expect(activities).toHaveLength(3);
    expect(activities.map((item) => item.title)).toEqual([
      'Cobrança gerada',
      'Reativação iniciada',
      'Renovação realizada',
    ]);
    expect(activities.some((item) => item.id === 'receivable-created:renewal-receivable')).toBe(
      false,
    );
  });

  it('ignores invalid activity dates', () => {
    expect(
      buildContactRecentActivity({
        receivables: [
          receivable('invalid-paid', {
            paidAt: 'not-a-date',
            status: 'PAGO',
            displayStatus: 'PAGO',
          }),
          receivable('invalid-created', { createdAt: 'not-a-date' }),
          receivable('invalid-overdue', {
            dueDate: '2026-99-99',
            displayStatus: 'VENCIDO',
            status: 'PENDENTE',
          }),
        ],
        renewals: [renewal('invalid-renewal', { createdAt: 'not-a-date' })],
        clientEvents: [clientEvent('invalid-event', { createdAt: 'not-a-date' })],
      }),
    ).toEqual([]);
  });

  it('builds an empty contact financial summary without inventing zero-value cards', () => {
    const summary = buildContactFinancialSummary([contactReference('reference-1')], []);

    expect(summary).toMatchObject({
      activeReferenceCount: 1,
      lastPayment: null,
      nextDueDate: null,
      oldestOverdueDays: null,
      openAmount: 0,
      openCount: 0,
      overdueAmount: 0,
      overdueCount: 0,
      state: 'CURRENT',
    });
  });

  it('summarizes one open receivable without counting paid or canceled charges as open', () => {
    const open = receivable('open-1', {
      amount: '49.90',
      dueDate: '2026-10-15',
      displayStatus: 'PENDENTE',
      status: 'PENDENTE',
    });
    const paid = receivable('paid-1', {
      amount: '80.00',
      displayStatus: 'PAGO',
      paidAt: '2026-10-10',
      status: 'PAGO',
    });
    const canceled = receivable('canceled-1', {
      amount: '70.00',
      displayStatus: 'CANCELADO',
      status: 'CANCELADO',
    });

    const summary = buildContactFinancialSummary(
      [contactReference('reference-1')],
      [open, paid, canceled],
      Date.parse('2026-10-12T12:00:00.000Z'),
    );

    expect(summary.openAmount).toBe(49.9);
    expect(summary.openCount).toBe(1);
    expect(summary.overdueAmount).toBe(0);
    expect(summary.overdueCount).toBe(0);
    expect(summary.nextDueDate).toBe('2026-10-15');
    expect(summary.lastPayment).toEqual({ amount: '80.00', paidAt: '2026-10-10' });
    expect(summary.state).toBe('PENDING');
  });

  it('summarizes overdue receivables using existing display status and oldest due date', () => {
    const overdueOld = receivable('overdue-old', {
      amount: '40.00',
      dueDate: '2026-09-30',
      displayStatus: 'VENCIDO',
      status: 'PENDENTE',
    });
    const overdueRecent = receivable('overdue-recent', {
      amount: '49.80',
      dueDate: '2026-10-10',
      displayStatus: 'VENCIDO',
      status: 'PENDENTE',
    });

    const summary = buildContactFinancialSummary(
      [contactReference('reference-1')],
      [overdueRecent, overdueOld],
      Date.parse('2026-10-12T12:00:00.000Z'),
    );

    expect(summary.openAmount).toBe(89.8);
    expect(summary.openCount).toBe(2);
    expect(summary.overdueAmount).toBe(89.8);
    expect(summary.overdueCount).toBe(2);
    expect(summary.oldestOverdueDays).toBe(12);
    expect(summary.state).toBe('OVERDUE');
  });

  it('picks the nearest future due date across multiple open receivables', () => {
    const summary = buildContactFinancialSummary(
      [contactReference('reference-1')],
      [
        receivable('future-late', { dueDate: '2026-10-20' }),
        receivable('future-soon', { dueDate: '2026-10-15' }),
        receivable('paid-future', {
          dueDate: '2026-10-13',
          displayStatus: 'PAGO',
          paidAt: '2026-10-11',
          status: 'PAGO',
        }),
      ],
      Date.parse('2026-10-12T12:00:00.000Z'),
    );

    expect(summary.nextDueDate).toBe('2026-10-15');
    expect(summary.openAmount).toBe(200);
    expect(summary.openCount).toBe(2);
  });

  it('counts only active references in the contact financial summary', () => {
    const summary = buildContactFinancialSummary(
      [
        contactReference('active-1', { status: 'ATIVO' }),
        contactReference('active-2', { status: 'ATIVO' }),
        contactReference('inactive', { status: 'INATIVO' }),
        contactReference('canceled', { status: 'CANCELADO' }),
      ],
      [],
    );

    expect(summary.activeReferenceCount).toBe(2);
  });

  it('uses last payment only when paidAt is available', () => {
    const summary = buildContactFinancialSummary(
      [contactReference('reference-1')],
      [
        receivable('paid-without-date', {
          amount: '10.00',
          displayStatus: 'PAGO',
          paidAt: null,
          status: 'PAGO',
        }),
        receivable('paid-old', {
          amount: '20.00',
          displayStatus: 'PAGO',
          paidAt: '2026-10-01',
          status: 'PAGO',
        }),
        receivable('paid-new', {
          amount: '30.00',
          displayStatus: 'PAGO',
          paidAt: '2026-10-10',
          status: 'PAGO',
        }),
      ],
    );

    expect(summary.lastPayment).toEqual({ amount: '30.00', paidAt: '2026-10-10' });
  });

  it('does not surface invalid dates as next due or overdue days', () => {
    const summary = buildContactFinancialSummary(
      [contactReference('reference-1')],
      [
        receivable('invalid-next-due', {
          dueDate: 'not-a-date',
          displayStatus: 'PENDENTE',
          status: 'PENDENTE',
        }),
        receivable('invalid-overdue', {
          dueDate: '2026-13-99',
          displayStatus: 'VENCIDO',
          status: 'PENDENTE',
        }),
      ],
      Date.parse('2026-10-12T12:00:00.000Z'),
    );

    expect(summary.nextDueDate).toBeNull();
    expect(summary.oldestOverdueDays).toBeNull();
    expect(summary.overdueCount).toBe(1);
    expect(summary.state).toBe('OVERDUE');
  });

  it('builds finite receivable pagination page lists from official metadata', () => {
    expect(contactReceivablePaginationPages({ loadedCount: 10, total: 10, totalPages: 1 })).toEqual(
      [],
    );
    expect(
      contactReceivablePaginationPages({ loadedCount: 100, total: 250, totalPages: 3 }),
    ).toEqual([2, 3]);
    expect(
      contactReceivablePaginationPages({
        currentPage: 2,
        loadedCount: 200,
        total: 250,
        totalPages: 3,
      }),
    ).toEqual([3]);
  });

  it('maps receivables to references by clientReferenceId and picks only valid open charges', () => {
    const openForFirst = receivable('open-1', {
      clientReferenceId: 'reference-1',
      dueDate: '2026-10-12',
      displayStatus: 'PENDENTE',
      status: 'PENDENTE',
    });
    const paidForFirst = receivable('paid-1', {
      clientReferenceId: 'reference-1',
      displayStatus: 'PAGO',
      status: 'PAGO',
    });
    const openForSecond = receivable('open-2', {
      clientReferenceId: 'reference-2',
      dueDate: '2026-10-01',
      displayStatus: 'VENCIDO',
      status: 'PENDENTE',
    });

    expect(
      contactReceivablesForReference([openForFirst, paidForFirst, openForSecond], 'reference-1'),
    ).toEqual([openForFirst, paidForFirst]);
    expect(contactOpenReceivable([paidForFirst])).toBeUndefined();
    expect(contactOpenReceivable([openForFirst, openForSecond])).toBe(openForSecond);
    expect(contactRelevantReceivable([paidForFirst])).toBe(paidForFirst);
    expect(contactRelevantReceivable([paidForFirst, openForFirst])).toBe(openForFirst);
  });

  it('classifies drawer PIX state from status and expiration instead of copy-paste alone', () => {
    const now = Date.parse('2026-10-12T12:00:00.000Z');

    expect(classifyContactPixState(null, now)).toBe('NO_PIX');
    expect(
      classifyContactPixState(
        paymentIntent('active', { expiresAt: '2026-10-12T12:30:00.000Z' }),
        now,
      ),
    ).toBe('ACTIVE_PIX');
    expect(
      classifyContactPixState(
        paymentIntent('created', { expiresAt: '2026-10-12T12:30:00.000Z', status: 'CREATED' }),
        now,
      ),
    ).toBe('ACTIVE_PIX');
    expect(
      classifyContactPixState(
        paymentIntent('expired-time', { expiresAt: '2026-10-12T11:59:59.000Z' }),
        now,
      ),
    ).toBe('EXPIRED_PIX');
    expect(
      classifyContactPixState(
        paymentIntent('expired-status', { status: 'EXPIRED', expiresAt: null }),
        now,
      ),
    ).toBe('EXPIRED_PIX');
    expect(classifyContactPixState(paymentIntent('paid', { status: 'PAID' }), now)).toBe('NO_PIX');
    expect(classifyContactPixState(paymentIntent('canceled', { status: 'CANCELED' }), now)).toBe(
      'NO_PIX',
    );
  });

  it('builds the contact PIX replacement payload from the selected receivable and current intent', () => {
    const currentReceivable = receivable('open-1');
    const currentIntent = paymentIntent('intent-1', {
      provider: 'FASTPIX',
      receivableId: currentReceivable.id,
    });

    expect(contactPixReplacementPayload(currentReceivable, currentIntent)).toEqual({
      provider: 'FASTPIX',
      expectedCurrentIntentId: 'intent-1',
      reason: 'QR expirado',
      idempotencyKey: 'contact-info-pix-replace:open-1:intent-1:FASTPIX',
    });
    expect(
      contactPixReplacementPayload(
        receivable('other-reference-receivable'),
        paymentIntent('intent-2', { receivableId: 'open-1' }),
      ),
    ).toBeNull();
  });

  it('blocks PIX actions for paid and canceled receivables', () => {
    expect(contactReceivableAllowsPixAction(receivable('open', { status: 'PENDENTE' }))).toBe(true);
    expect(contactReceivableAllowsPixAction(receivable('paid', { status: 'PAGO' }))).toBe(false);
    expect(contactReceivableAllowsPixAction(receivable('canceled', { status: 'CANCELADO' }))).toBe(
      false,
    );
    expect(contactReceivableAllowsPixAction(null)).toBe(false);
  });

  it('builds the quick action matrix by reference and PIX state', () => {
    const now = Date.parse('2026-10-12T12:00:00.000Z');
    const activeReference = contactReference('active', { status: 'ATIVO' });
    const canceledReference = contactReference('canceled', { status: 'CANCELADO' });
    const inactiveReference = contactReference('inactive', { status: 'INATIVO' });
    const openReceivable = receivable('open-1');
    const activePix = paymentIntent('intent-1', {
      receivableId: openReceivable.id,
      status: 'WAITING_PAYMENT',
    });

    expect(contactReferenceActionMatrix(activeReference, openReceivable, null, now)).toMatchObject({
      generatePix: true,
      primary: 'GENERATE_PIX',
      renew: true,
      viewReceivable: true,
    });
    expect(
      contactReferenceActionMatrix(activeReference, openReceivable, activePix, now),
    ).toMatchObject({
      copyPix: true,
      primary: 'SEND_PIX_WHATSAPP',
      sendPixWhatsApp: true,
      viewReceivable: true,
    });
    expect(
      contactReferenceActionMatrix(
        activeReference,
        openReceivable,
        paymentIntent('expired', {
          expiresAt: '2026-10-12T11:59:59.000Z',
          receivableId: openReceivable.id,
        }),
        now,
      ),
    ).toMatchObject({
      primary: 'RECREATE_PIX',
      recreatePix: true,
      sendPixWhatsApp: false,
    });
    expect(
      contactReferenceActionMatrix(canceledReference, openReceivable, null, now),
    ).toMatchObject({
      primary: 'REACTIVATE',
      reactivate: true,
      renew: false,
    });
    expect(
      contactReferenceActionMatrix(inactiveReference, openReceivable, null, now),
    ).toMatchObject({
      generatePix: false,
      primary: null,
      reactivate: false,
      renew: false,
    });
    expect(
      contactReferenceActionMatrix(
        activeReference,
        receivable('paid', { status: 'PAGO' }),
        null,
        now,
      ),
    ).toMatchObject({
      generatePix: false,
      primary: null,
      viewReceivable: true,
    });
    expect(
      contactReferenceActionMatrix(
        activeReference,
        openReceivable,
        paymentIntent('canceled-intent', {
          receivableId: openReceivable.id,
          status: 'CANCELED',
        }),
        now,
      ),
    ).toMatchObject({
      copyPix: false,
      sendPixWhatsApp: false,
    });
    expect(
      contactReferenceActionMatrix(
        activeReference,
        openReceivable,
        paymentIntent('superseded-intent', {
          receivableId: openReceivable.id,
          status: 'SUPERSEDED',
        }),
        now,
      ),
    ).toMatchObject({
      copyPix: false,
      sendPixWhatsApp: false,
    });
  });

  it('allows WhatsApp PIX sending only for the current active receivable intent', () => {
    const now = Date.parse('2026-10-12T12:00:00.000Z');
    const currentReceivable = receivable('open-1');
    const currentIntent = paymentIntent('intent-1', {
      pixCopyPaste: '000201',
      receivableId: currentReceivable.id,
      status: 'WAITING_PAYMENT',
    });

    expect(contactPixCanSendWhatsApp(currentReceivable, currentIntent, now)).toBe(true);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('created', { receivableId: currentReceivable.id, status: 'CREATED' }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('expired', {
          expiresAt: '2026-10-12T11:59:59.000Z',
          receivableId: currentReceivable.id,
        }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('missing-payload', {
          pixCopyPaste: null,
          receivableId: currentReceivable.id,
        }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('other-receivable', { receivableId: 'receivable-from-another-reference' }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(receivable('paid', { status: 'PAGO' }), currentIntent, now),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        receivable('canceled', { status: 'CANCELADO' }),
        currentIntent,
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('paid-intent', {
          paidAt: '2026-10-12T12:05:00.000Z',
          receivableId: currentReceivable.id,
          status: 'PAID',
        }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('canceled-intent', {
          receivableId: currentReceivable.id,
          status: 'CANCELED',
        }),
        now,
      ),
    ).toBe(false);
    expect(
      contactPixCanSendWhatsApp(
        currentReceivable,
        paymentIntent('superseded', {
          receivableId: currentReceivable.id,
          status: 'SUPERSEDED',
        }),
        now,
      ),
    ).toBe(false);
  });

  it('labels WhatsApp PIX sending by the intent loading state', () => {
    expect(contactPixWhatsAppButtonLabel(false)).toBe('Enviar no WhatsApp');
    expect(contactPixWhatsAppButtonLabel(true)).toBe('Enviando...');
  });

  it('sorts contact references without treating canceled as renewal candidates', () => {
    const canceled = contactReference('canceled', { status: 'CANCELADO' });
    const active = contactReference('active', { status: 'ATIVO', dueDate: '2026-10-20' });
    const pending = contactReference('pending', { status: 'PENDENTE_PAGAMENTO' });

    expect(
      sortContactReferences([canceled, pending, active]).map((reference) => reference.id),
    ).toEqual(['active', 'pending', 'canceled']);
  });

  it('classifies only current unpaid receivables as open or overdue', () => {
    const reference = contactReference('reference-1');
    const historicalPaid = receivable('paid-overdue-history', {
      clientReferenceId: reference.id,
      displayStatus: 'PAGO',
      dueDate: '2025-01-01',
      paidAt: '2025-01-02',
      status: 'PAGO',
    });
    const pending = receivable('pending', {
      clientReferenceId: reference.id,
      displayStatus: 'PENDENTE',
      status: 'PENDENTE',
    });
    const overdue = receivable('overdue', {
      clientReferenceId: reference.id,
      displayStatus: 'VENCIDO',
      status: 'PENDENTE',
    });

    expect(contactReferenceFinancialState(reference, [historicalPaid])).toBe('CLEAR');
    expect(contactReferenceFinancialState(reference, [historicalPaid, pending])).toBe('OPEN');
    expect(contactReferenceFinancialState(reference, [historicalPaid, pending, overdue])).toBe(
      'OVERDUE',
    );
  });

  it('filters reference and financial statuses without mixing their semantics', () => {
    const active = contactReference('active', { status: 'ATIVO' });
    const canceled = contactReference('canceled', { status: 'CANCELADO' });
    const overdue = contactReference('overdue', { status: 'INATIVO' });
    const receivables = [
      receivable('overdue-charge', {
        clientReferenceId: overdue.id,
        displayStatus: 'VENCIDO',
        status: 'PENDENTE',
      }),
    ];
    const references = [active, canceled, overdue];

    expect(filterContactReferences(references, receivables, 'ALL')).toEqual(references);
    expect(filterContactReferences(references, receivables, 'ACTIVE')).toEqual([active]);
    expect(filterContactReferences(references, receivables, 'CANCELED')).toEqual([canceled]);
    expect(filterContactReferences(references, receivables, 'OVERDUE')).toEqual([overdue]);
    expect(filterContactReferences(references, receivables, 'OPEN')).toEqual([overdue]);
    expect(filterContactReferences([canceled], [], 'ACTIVE')).toEqual([]);
  });

  it('sorts financial attention first while preserving stable order inside each group', () => {
    const clearFirst = contactReference('clear-first');
    const open = contactReference('open');
    const overdueFirst = contactReference('overdue-first');
    const overdueSecond = contactReference('overdue-second');
    const clearSecond = contactReference('clear-second');
    const references = [clearFirst, open, overdueFirst, overdueSecond, clearSecond];
    const receivables = [
      receivable('open-charge', {
        clientReferenceId: open.id,
        displayStatus: 'PENDENTE',
        status: 'PENDENTE',
      }),
      receivable('overdue-first-charge', {
        clientReferenceId: overdueFirst.id,
        displayStatus: 'VENCIDO',
        status: 'PENDENTE',
      }),
      receivable('overdue-second-charge', {
        clientReferenceId: overdueSecond.id,
        displayStatus: 'VENCIDO',
        status: 'PENDENTE',
      }),
    ];

    expect(sortContactReferences(references, receivables).map((reference) => reference.id)).toEqual(
      ['overdue-first', 'overdue-second', 'open', 'clear-first', 'clear-second'],
    );
  });

  it('limits references to four and activities to three without deleting loaded data', () => {
    const items = Array.from({ length: 8 }, (_, index) => `item-${index + 1}`);
    expect(contactDrawerVisibleItems([], false, 4)).toEqual([]);
    expect(contactDrawerVisibleItems(items.slice(0, 1), false, 4)).toEqual(items.slice(0, 1));
    expect(contactDrawerVisibleItems(items.slice(0, 4), false, 4)).toEqual(items.slice(0, 4));
    expect(contactDrawerVisibleItems(items, false, 4)).toEqual(items.slice(0, 4));
    expect(contactDrawerVisibleItems(items.slice(0, 3), false, 3)).toEqual(items.slice(0, 3));
    expect(contactDrawerVisibleItems(items, false, 3)).toEqual(items.slice(0, 3));
    expect(contactDrawerVisibleItems(items, true, 4)).toEqual(items);
    expect(contactDrawerVisibleItems(items, false, -1)).toEqual([]);
  });

  it('dedupes outbound presence state transitions locally', () => {
    expect(nextConversationPresenceState(undefined, 'composing:text')).toBe('composing:text');
    expect(nextConversationPresenceState(undefined, 'paused')).toBeNull();
    expect(nextConversationPresenceState('composing:text', 'composing:text')).toBeNull();
    expect(nextConversationPresenceState('composing:text', 'paused')).toBe('paused');
    expect(nextConversationPresenceState('paused', 'paused')).toBeNull();
    expect(nextConversationPresenceState('composing:text', 'composing:audio')).toBe(
      'composing:audio',
    );
    expect(nextConversationPresenceState('composing:audio', 'paused')).toBe('paused');
  });

  it('keeps repeated typing local until a meaningful state change happens', () => {
    let state: 'paused' | 'composing:text' | 'composing:audio' | undefined;
    const sent: string[] = [];

    for (const character of 'Olá tudo bem, gostaria de saber...') {
      expect(character.length).toBe(1);
      const next = nextConversationPresenceState(state, 'composing:text');
      if (next) {
        sent.push(next);
        state = next;
      }
    }

    const paused = nextConversationPresenceState(state, 'paused');
    if (paused) {
      sent.push(paused);
      state = paused;
    }

    const resumed = nextConversationPresenceState(state, 'composing:text');
    if (resumed) {
      sent.push(resumed);
      state = resumed;
    }

    const audio = nextConversationPresenceState(state, 'composing:audio');
    if (audio) {
      sent.push(audio);
      state = audio;
    }

    const audioPaused = nextConversationPresenceState(state, 'paused');
    if (audioPaused) sent.push(audioPaused);

    expect(sent).toEqual([
      'composing:text',
      'paused',
      'composing:text',
      'composing:audio',
      'paused',
    ]);
  });

  it('wires outbound presence to typing, cleanup, send, conversation switch and audio recording', () => {
    expect(whatsAppInboxSource).toContain('conversationPresencePauseDelayMs = 3000');
    expect(whatsAppInboxSource).toContain(
      "void sendConversationPresence(conversationId, 'composing')",
    );
    expect(whatsAppInboxSource).toContain(
      "void sendConversationPresence(conversationId, 'composing', 'audio')",
    );
    expect(whatsAppInboxSource).toContain('setWhatsAppConversationPresence(conversationId');
    expect(whatsAppInboxSource).toContain(
      'noteTextComposerActivity(selectedConversation.id, value)',
    );
    expect(whatsAppInboxSource).toContain('pauseConversationPresence(selectedConversation.id)');
    expect(whatsAppInboxSource).toContain(
      'onBlur={() => pauseConversationPresence(selectedConversation.id)}',
    );
    expect(whatsAppInboxSource).toContain('document.visibilityState ===');
    expect(whatsAppInboxSource).toContain('onVoiceRecordingChangeRef.current(true)');
    expect(whatsAppInboxSource).toContain('onVoiceRecordingChangeRef.current(false)');
  });

  it('wires inbound recording presence to the active conversation header only', () => {
    expect(whatsAppInboxSource).toContain('conversationPresenceLabel');
    expect(whatsAppInboxSource).toContain('conversationPresence[selectedConversation.id]');
    expect(whatsAppInboxSource).toContain('presence={conversationPresenceLabel');
    expect(whatsAppInboxSource).toContain("event.type === 'conversation.presence'");
    expect(whatsAppInboxSource).toContain('className="conversation-presence-label"');
    expect(globalStylesSource).toContain('.conversation-presence-label');
    expect(whatsAppRealtimeProviderSource).toContain('digitando...');
  });

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
      classifyConversationIncomingFile(
        new File(['sticker'], 'figurinha.webp', { type: 'image/webp' }),
      ),
    ).toEqual({ ok: false, error: 'Tipo de arquivo não suportado para envio por WhatsApp.' });
    expect(
      classifyConversationIncomingFile(
        new File(['sticker'], 'figurinha.webp', { type: 'image/webp' }),
        { expectedKind: 'STICKER' },
      ),
    ).toEqual({ ok: true, kind: 'STICKER' });
    expect(
      classifyConversationIncomingFile(new File(['video'], 'VIDEO.MP4', { type: 'video/mp4' })),
    ).toEqual({ ok: true, kind: 'VIDEO' });
    expect(conversationVideoAccept).toContain('video/mp4');

    expect(savedStickerPreviewKind('image/webp')).toBe('image');
    expect(savedStickerPreviewKind('image/webp; charset=binary')).toBe('image');
    expect(savedStickerPreviewKind('video/mp4')).toBe('video');
    expect(savedStickerPreviewKind('application/octet-stream')).toBe('unsupported');

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

  it('renders IMAGE and STICKER as media instead of technical text fallbacks', () => {
    const inboundImage = message({
      direction: 'INBOUND',
      mediaAvailable: true,
      mediaMimeType: 'image/jpeg',
      text: null,
      type: 'IMAGE',
    });
    const outboundSticker = message({
      direction: 'OUTBOUND',
      mediaAvailable: true,
      mediaMimeType: 'image/webp',
      text: ':sticker:',
      type: 'STICKER',
    });

    expect(isAvailableInlineConversationMedia(inboundImage)).toBe(true);
    expect(isAvailableInlineConversationMedia(outboundSticker)).toBe(true);
    expect(conversationMessageDisplayText(inboundImage)).toBe('');
    expect(conversationMessageDisplayText(outboundSticker)).toBe('');
    expect(conversationMessageCaption(outboundSticker)).toBe('');
    expect(isTechnicalStickerPlaceholder(':sticker:')).toBe(true);
    expect(isTechnicalStickerPlaceholder('[Figurinha]')).toBe(true);
  });

  it('uses explicit unavailable states only when media is actually unavailable', () => {
    expect(conversationMediaUnavailableText('IMAGE')).toBe('Imagem indisponível');
    expect(conversationMediaUnavailableText('STICKER')).toBe('Figurinha indisponível');
    expect(conversationMediaUnavailableText('VIDEO')).toBe('[Vídeo]');
    expect(whatsAppInboxSource).toContain('if (!message.mediaAvailable)');
    expect(whatsAppInboxSource).toContain('role="status"');
    expect(whatsAppInboxSource).toContain("message.type === 'IMAGE'");
    expect(whatsAppInboxSource).toContain("message.type === 'STICKER'");
  });

  it('keeps the attachment menu focused on media uploads and the saved sticker library', () => {
    expect(whatsAppInboxSource).toContain('const attachmentMenuRef = useRef');
    expect(whatsAppInboxSource).toContain('if (!attachmentMenuOpen) return undefined;');
    expect(whatsAppInboxSource).toContain('attachmentMenuRef.current?.contains(target)');
    expect(whatsAppInboxSource).toContain(
      "document.addEventListener('pointerdown', closeOnPointerDown, true)",
    );
    expect(whatsAppInboxSource).toContain(
      "document.removeEventListener('pointerdown', closeOnPointerDown, true)",
    );
    expect(whatsAppInboxSource).toContain(
      "document.addEventListener('keydown', closeOnKeyDown, true)",
    );
    expect(whatsAppInboxSource).toContain(
      "document.removeEventListener('keydown', closeOnKeyDown, true)",
    );
    expect(whatsAppInboxSource).toContain("event.key !== 'Escape'");
    expect(whatsAppInboxSource).toContain('event.preventDefault()');
    expect(whatsAppInboxSource).toContain('event.stopPropagation()');
    expect(whatsAppInboxSource).toContain('<span>Imagem</span>');
    expect(whatsAppInboxSource).toContain('<span>Documento</span>');
    expect(whatsAppInboxSource).toContain('<span>Áudio</span>');
    expect(whatsAppInboxSource).toContain('<span>Vídeo</span>');
    expect(whatsAppInboxSource).toContain('<span>Figurinhas</span>');
    expect(whatsAppInboxSource).toContain('onClick={openSavedStickerPicker}');
    expect(whatsAppInboxSource).toContain('setAttachmentMenuOpen(false)');
    expect(whatsAppInboxSource).toContain('setSavedStickerPickerOpen((current) => {');
    expect(whatsAppInboxSource).toContain('onSendSavedSticker(sticker)');
    expect(whatsAppInboxSource).toContain("type === 'STICKER'");
    expect(whatsAppInboxSource).not.toContain('<span>Figurinha</span>');
    expect(whatsAppInboxSource).not.toContain('<span>Figurinhas salvas</span>');
    expect(whatsAppInboxSource).not.toContain('stickerInputRef');
    expect(whatsAppInboxSource).not.toContain('conversationStickerAccept');
    expect(whatsAppInboxSource).not.toContain("selectFile('STICKER'");
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

  it('keeps quick reply helpers pure and free from local fallback content', () => {
    expect(whatsAppQuickRepliesSource).not.toContain('WHATSAPP_DEFAULT_QUICK_REPLIES');
    expect(whatsAppQuickRepliesSource).not.toContain('Aguardando pagamento');
    expect(whatsAppQuickRepliesSource).not.toContain('Pagamento confirmado');
    expect(whatsAppQuickRepliesSource).not.toContain('sendPaymentIntentWhatsApp');
    expect(whatsAppQuickRepliesSource).not.toContain('createReceivablePix');
    expect(whatsAppQuickRepliesSource).not.toContain('localStorage');
    expect(whatsAppQuickRepliesSource).not.toContain('sessionStorage');
    expect(whatsAppQuickRepliesSource).not.toContain('dangerouslySetInnerHTML');
  });

  it('loads quick replies from the API with loading, empty, and managed error states', () => {
    expect(whatsAppInboxSource).toContain('listWhatsAppQuickReplies');
    expect(whatsAppInboxSource).toContain('setQuickReplies(replies)');
    expect(whatsAppInboxSource).toContain('setQuickReplies([])');
    expect(whatsAppInboxSource).toContain('Carregando respostas...');
    expect(whatsAppInboxSource).toContain('Nenhuma resposta rápida disponível.');
    expect(whatsAppInboxSource).toContain('quickRepliesError');
    expect(whatsAppInboxSource).toContain('Não foi possível carregar respostas rápidas.');
    expect(whatsAppInboxSource).not.toContain('Usando respostas locais.');
    expect(whatsAppInboxSource).not.toContain(
      'filterWhatsAppQuickReplies(WHATSAPP_DEFAULT_QUICK_REPLIES',
    );
  });

  it('filters and previews quick replies by label or text', () => {
    const replies = [...quickReplyFilterFixture];

    expect(filterWhatsAppQuickReplies(replies, '')).toBe(replies);
    expect(filterWhatsAppQuickReplies(replies, 'pix').map((reply) => reply.id)).toEqual([
      'expired-pix',
    ]);
    expect(filterWhatsAppQuickReplies(replies, 'ATUALIZAÇÃO').map((reply) => reply.id)).toEqual([
      'follow-up',
    ]);
    expect(replies).toEqual(quickReplyFilterFixture);
    expect(whatsAppQuickReplyPreview('Mensagem curta')).toBe('Mensagem curta');
    expect(whatsAppQuickReplyPreview('A'.repeat(70), 12)).toBe('AAAAAAAAA...');
    expect(whatsAppQuickReplyPreview('Linha 1\nLinha 2', 20)).toBe('Linha 1 Linha 2');
  });

  it('applies quick replies without losing existing composer text', () => {
    expect(applyWhatsAppQuickReply('', 'Olá!')).toEqual({ cursor: 4, text: 'Olá!' });
    expect(applyWhatsAppQuickReply('Texto existente', 'Olá!')).toEqual({
      cursor: 'Texto existente\nOlá!'.length,
      text: 'Texto existente\nOlá!',
    });
    expect(applyWhatsAppQuickReply('Antes depois', 'Olá!', { start: 6, end: 6 })).toEqual({
      cursor: 'Antes\nOlá!'.length,
      text: 'Antes\nOlá!\ndepois',
    });
    expect(applyWhatsAppQuickReply('Antes depois', 'Olá!', { start: 6, end: 12 })).toEqual({
      cursor: 'Antes\nOlá!'.length,
      text: 'Antes\nOlá!',
    });
    expect(
      applyWhatsAppQuickReply('Texto existente  ', 'Olá!', {
        end: undefined,
        start: undefined,
      } as unknown as { end: number; start: number }),
    ).toEqual({
      cursor: 'Texto existente\nOlá!'.length,
      text: 'Texto existente\nOlá!',
    });
    expect(applyWhatsAppQuickReply('Texto', '<img src=x onerror=alert(1)>')).toEqual({
      cursor: 'Texto\n<img src=x onerror=alert(1)>'.length,
      text: 'Texto\n<img src=x onerror=alert(1)>',
    });
  });

  it('detects slash quick reply mode only when the composer contains slash query text', () => {
    expect(whatsAppQuickReplySlashQuery('/')).toBe('');
    expect(whatsAppQuickReplySlashQuery('/pix')).toBe('pix');
    expect(whatsAppQuickReplySlashQuery('/PIX')).toBe('PIX');
    expect(whatsAppQuickReplySlashQuery('bom dia / tudo bem')).toBeNull();
    expect(whatsAppQuickReplySlashQuery('https://codeacode.com')).toBeNull();
    expect(whatsAppQuickReplySlashQuery('10/10/2026')).toBeNull();
    expect(whatsAppQuickReplySlashQuery('/pix agora')).toBeNull();
    expect(applyWhatsAppSlashQuickReply('Esse PIX expirou.')).toEqual({
      cursor: 'Esse PIX expirou.'.length,
      text: 'Esse PIX expirou.',
    });
  });

  it('keeps quick replies slash-only without sending automatically', () => {
    const applyQuickReplyStart = whatsAppInboxSource.indexOf('function applyQuickReply(');
    const clearVoicePreviewStart = whatsAppInboxSource.indexOf(
      'function clearVoicePreview()',
      applyQuickReplyStart,
    );
    const applyQuickReplySource = whatsAppInboxSource.slice(
      applyQuickReplyStart,
      clearVoicePreviewStart,
    );

    expect(whatsAppInboxSource).not.toContain('MessageSquareText');
    expect(whatsAppInboxSource).not.toContain('label="Respostas rápidas"');
    expect(whatsAppInboxSource).not.toContain('quickReplyButtonRef');
    expect(whatsAppInboxSource).not.toContain('quickReplyMenuOpen');
    expect(whatsAppInboxSource).not.toContain('quickReplySearch');
    expect(whatsAppInboxSource).not.toContain('conversation-quick-reply-search');
    expect(whatsAppInboxSource).toContain(
      'className="conversation-quick-reply-menu conversation-quick-reply-menu-slash"',
    );
    expect(whatsAppInboxSource).toContain('filterWhatsAppQuickReplies(');
    expect(whatsAppInboxSource).not.toContain('applyWhatsAppQuickReply(');
    expect(whatsAppInboxSource).toContain('onClick={() => applyQuickReply(reply)}');
    expect(whatsAppInboxSource).toContain('composerRef.current?.focus()');
    expect(whatsAppInboxSource).toContain('composerRef.current?.setSelectionRange');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain("event.key === 'Enter'");
    expect(whatsAppInboxSource).toContain('setAttachmentMenuOpen(false)');
    expect(whatsAppInboxSource).toContain('role="listbox"');
    expect(whatsAppInboxSource).toContain('role="option"');
    expect(applyQuickReplySource).toContain('onChange(result.text)');
    expect(applyQuickReplySource).toContain('applyWhatsAppSlashQuickReply(reply.text)');
    expect(applyQuickReplySource).not.toContain('onSend');
    expect(applyQuickReplySource).not.toContain('sendCurrentMessage');
    expect(applyQuickReplySource).not.toContain('sendWhatsAppConversationMessage');
    expect(applyQuickReplySource).not.toContain('sendPaymentIntentWhatsApp');
    expect(applyQuickReplySource).not.toContain('setReplyTarget');
    expect(applyQuickReplySource).not.toContain('setSelectedMedia');
    expect(applyQuickReplySource).not.toContain('onRemoveMedia');
    expect(globalStylesSource).toContain('.conversation-quick-reply-menu');
    expect(globalStylesSource).toContain('max-height: min(360px, calc(100dvh - 160px))');
    expect(globalStylesSource).toContain('@media');
    expect(globalStylesSource).toContain('top: var(--conversation-quick-reply-menu-top, auto)');
    expect(globalStylesSource).toContain(
      'max-height: var(--conversation-quick-reply-menu-max-height, min(38dvh, 280px))',
    );
  });

  it('wires slash quick replies to keyboard navigation without changing reply or attachment state', () => {
    const textareaKeyDownStart = whatsAppInboxSource.indexOf(
      'onKeyDown={(event) => {',
      whatsAppInboxSource.indexOf('aria-label="Digite uma mensagem"'),
    );
    const keyDownStart = whatsAppInboxSource.indexOf(
      'if (quickReplySlashMenuOpen) {',
      textareaKeyDownStart,
    );
    const replyEscapeStart = whatsAppInboxSource.indexOf(
      "if (event.key === 'Escape' && replyTarget)",
      keyDownStart,
    );
    const slashKeyDownSource = whatsAppInboxSource.slice(keyDownStart, replyEscapeStart);

    expect(whatsAppInboxSource).toContain('whatsAppQuickReplySlashQuery(draft)');
    expect(whatsAppInboxSource).toContain('quickReplySlashMenuOpen');
    expect(whatsAppInboxSource).toContain("const quickReplyQuery = quickReplySlashQuery ?? ''");
    expect(whatsAppInboxSource).toContain('conversation-quick-reply-menu-slash');
    expect(whatsAppInboxSource).toContain('aria-activedescendant');
    expect(whatsAppInboxSource).toContain('aria-expanded={quickReplySlashMenuOpen}');
    expect(slashKeyDownSource).toContain("event.key === 'Enter'");
    expect(slashKeyDownSource).toContain('selectActiveQuickReply()');
    expect(slashKeyDownSource).toContain("event.key === 'ArrowDown'");
    expect(slashKeyDownSource).toContain('moveActiveQuickReply(1)');
    expect(slashKeyDownSource).toContain("event.key === 'ArrowUp'");
    expect(slashKeyDownSource).toContain('moveActiveQuickReply(-1)');
    expect(slashKeyDownSource).toContain("event.key === 'Escape'");
    expect(slashKeyDownSource).toContain('setQuickReplySlashDismissedDraft(draft)');
    expect(slashKeyDownSource).toContain('event.nativeEvent.isComposing');
    expect(slashKeyDownSource).not.toContain('onSend');
    expect(slashKeyDownSource).not.toContain('onCancelReply');
    expect(slashKeyDownSource).not.toContain('onRemoveMedia');
    expect(globalStylesSource).toContain('position: fixed;');
    expect(globalStylesSource).toContain('--conversation-quick-reply-menu-max-height');
    expect(globalStylesSource).toContain('-webkit-overflow-scrolling: touch');
    expect(globalStylesSource).toContain('overscroll-behavior: contain');
    expect(globalStylesSource).toContain('min-height: 52px');
    expect(globalStylesSource).toContain('-webkit-line-clamp: 2');
    expect(globalStylesSource).toContain('env(safe-area-inset-left)');
    expect(globalStylesSource).toContain('env(safe-area-inset-right)');
    expect(globalStylesSource).toContain(".conversation-quick-reply-option[aria-selected='true']");
  });

  it('positions mobile slash quick replies inside the visual viewport above the composer', () => {
    expect(
      calculateQuickReplyMenuViewportPosition({
        composerRect: { top: 360 },
        viewportHeight: 420,
        viewportOffsetTop: 0,
      }),
    ).toEqual({
      maxHeight: 280,
      top: 72,
    });

    expect(
      calculateQuickReplyMenuViewportPosition({
        composerRect: { top: 260 },
        viewportHeight: 300,
        viewportOffsetTop: 24,
      }),
    ).toEqual({
      maxHeight: 208,
      top: 44,
    });

    expect(
      calculateQuickReplyMenuViewportPosition({
        composerRect: null,
        viewportHeight: 300,
      }),
    ).toEqual({
      maxHeight: 272,
      top: 20,
    });
  });

  it('keeps quick reply viewport math finite for small or invalid mobile viewports', () => {
    expect(
      calculateQuickReplyMenuViewportPosition({
        composerRect: { top: 70 },
        viewportHeight: 80,
      }),
    ).toEqual({
      maxHeight: 52,
      top: 10,
    });

    const invalidPosition = calculateQuickReplyMenuViewportPosition({
      composerRect: { top: Number.NaN },
      viewportHeight: Number.NaN,
      viewportOffsetTop: Number.NaN,
      viewportGap: Number.NaN,
      composerGap: Number.NaN,
      maxHeight: Number.NaN,
      minHeight: Number.NaN,
    });

    expect(Number.isFinite(invalidPosition.top)).toBe(true);
    expect(Number.isFinite(invalidPosition.maxHeight)).toBe(true);
    expect(invalidPosition.top).toBeGreaterThanOrEqual(0);
    expect(invalidPosition.maxHeight).toBeGreaterThan(0);
  });

  it('keeps mobile slash quick replies above message action rails and reaction overlays', () => {
    expect(whatsAppInboxSource).toContain('window.visualViewport');
    expect(whatsAppInboxSource).toContain('calculateQuickReplyMenuViewportPosition');
    expect(whatsAppInboxSource).toContain('conversationQuickReplyMenu');
    expect(whatsAppInboxSource).toContain(
      "'--conversation-quick-reply-menu-top': `${position.top}px`",
    );
    expect(globalStylesSource).toContain(
      ":root[data-conversation-quick-reply-menu='open'] .conversation-message-actions",
    );
    expect(globalStylesSource).toContain(
      ":root[data-conversation-quick-reply-menu='open'] .conversation-reaction-picker",
    );
    expect(globalStylesSource).toContain('.conversation-composer.has-slash-quick-reply-menu');
    expect(globalStylesSource).toContain('z-index: 1300;');
  });

  it('registers visual viewport and window listeners only while slash quick replies are visible', () => {
    const quickReplyViewportEffectStart = whatsAppInboxSource.indexOf(
      'useLayoutEffect(() => {',
      whatsAppInboxSource.indexOf('quickReplyMenuViewportStyle'),
    );
    const quickReplyViewportEffectEnd = whatsAppInboxSource.indexOf(
      'useEffect(() => {',
      quickReplyViewportEffectStart,
    );
    const quickReplyViewportEffectSource = whatsAppInboxSource.slice(
      quickReplyViewportEffectStart,
      quickReplyViewportEffectEnd,
    );

    expect(quickReplyViewportEffectSource).toContain('if (!quickReplyMenuVisible)');
    expect(quickReplyViewportEffectSource).toContain("visualViewport?.addEventListener('resize'");
    expect(quickReplyViewportEffectSource).toContain("visualViewport?.addEventListener('scroll'");
    expect(quickReplyViewportEffectSource).toContain("window.addEventListener('resize'");
    expect(quickReplyViewportEffectSource).toContain("window.addEventListener('orientationchange'");
    expect(quickReplyViewportEffectSource).toContain(
      "visualViewport?.removeEventListener('resize'",
    );
    expect(quickReplyViewportEffectSource).toContain(
      "visualViewport?.removeEventListener('scroll'",
    );
    expect(quickReplyViewportEffectSource).toContain("window.removeEventListener('resize'");
    expect(quickReplyViewportEffectSource).toContain(
      "window.removeEventListener('orientationchange'",
    );
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

  it('preserves backend conversation order while updating existing rows and appending the next page', () => {
    const current = [
      conversation('recent-first', { lastMessageAt: '2026-10-16T10:00:00.000Z' }),
      conversation('older-second', { lastMessageAt: '2026-10-01T10:00:00.000Z' }),
    ];
    const incoming = [
      conversation('recent-first', {
        lastMessageAt: '2026-10-16T11:00:00.000Z',
        unreadCount: 2,
      }),
      conversation('next-page', { lastMessageAt: '2026-09-17T10:00:00.000Z' }),
    ];

    const merged = mergeConversationLists(current, incoming);

    expect(merged.map((item) => item.id)).toEqual(['recent-first', 'older-second', 'next-page']);
    expect(merged[0]?.unreadCount).toBe(2);
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
    expect(
      isRenderableConversationMessage(
        message({
          type: 'CONTACT',
          text: null,
          contacts: [{ displayName: 'João', phones: ['+55 44 99999-9999'] }],
        }),
      ),
    ).toBe(true);
    expect(
      isRenderableConversationMessage(message({ type: 'CONTACTS', text: null, contacts: [] })),
    ).toBe(true);
  });

  it('renders shared contact cards without treating vCard content as HTML', () => {
    expect(
      conversationMessageDisplayText(
        message({
          type: 'CONTACT',
          text: null,
          contacts: [{ displayName: 'João', phones: ['+55 44 99999-9999'] }],
        }),
      ),
    ).toBe('');
    expect(whatsAppInboxSource).toContain('function ConversationContactContent');
    expect(whatsAppInboxSource).toContain("contact.displayName || 'Contato sem nome'");
    expect(whatsAppInboxSource).toContain('Telefone não informado');
    expect(whatsAppInboxSource).not.toContain('dangerouslySetInnerHTML');
    expect(globalStylesSource).toContain('.conversation-shared-contact');
  });

  it('builds exact Brazilian phone candidates without accepting unsupported international numbers', () => {
    expect(sharedContactBrazilPhoneCandidates('+55 44 9821-2815')).toEqual([
      '554498212815',
      '5544998212815',
    ]);
    expect(sharedContactBrazilPhoneCandidates('55 44 99821-2815')).toEqual([
      '5544998212815',
      '554498212815',
    ]);
    expect(sharedContactBrazilPhoneCandidates('(44) 3333-2222')).toEqual(['554433332222']);
    expect(sharedContactBrazilPhoneCandidates('+1 415 555 0100')).toEqual([]);
    expect(sharedContactBrazilPhoneCandidates('001 415 555 0100')).toEqual([]);
    expect(sharedContactBrazilPhoneCandidates('123')).toEqual([]);
  });

  it('matches a shared contact conversation only by exact phone and selected connection', () => {
    const candidates = sharedContactBrazilPhoneCandidates('+55 44 9821-2815');
    const expected = conversation('expected', { phoneNormalized: '5544998212815' });
    const items = [
      conversation('other-connection', {
        phoneNormalized: '5544998212815',
        whatsAppConnectionId: 'connection-2',
      }),
      conversation('partial', { phoneNormalized: '44554998212815' }),
      expected,
    ];

    expect(findExactSharedContactConversation(items, 'connection-1', candidates)).toBe(expected);
    expect(findExactSharedContactConversation(items, 'connection-3', candidates)).toBeNull();
  });

  it('blocks ambiguous legacy and canonical conversation matches', () => {
    const candidates = sharedContactBrazilPhoneCandidates('+55 44 9821-2815');
    const legacy = conversation('legacy', { phoneNormalized: '554498212815' });
    const canonical = conversation('canonical', { phoneNormalized: '5544998212815' });

    expect(
      findExactSharedContactConversation([legacy, canonical], 'connection-1', candidates),
    ).toBe(null);
    expect(
      hasAmbiguousSharedContactConversation([legacy, canonical], 'connection-1', candidates),
    ).toBe(true);
    expect(
      hasAmbiguousSharedContactConversation([legacy, legacy], 'connection-1', candidates),
    ).toBe(false);
  });

  it('discards stale shared-contact action responses after context changes', () => {
    expect(shouldApplySharedContactActionResult('source', 'source', true)).toBe(true);
    expect(shouldApplySharedContactActionResult('source', 'other', true)).toBe(false);
    expect(shouldApplySharedContactActionResult('source', 'source', false)).toBe(false);
    expect(shouldApplySharedContactActionResult('source', null, true)).toBe(false);
  });

  it('opens a client only for one unambiguous exact phone match', () => {
    const candidates = sharedContactBrazilPhoneCandidates('+55 44 9821-2815');
    const exact: ClientOption = {
      email: null,
      id: 'client-1',
      name: 'Bruno',
      phoneNormalized: '5544998212815',
      preferredPixProvider: null,
      reference: 'BRUNO',
    };
    const partial = { ...exact, id: 'client-2', phoneNormalized: '44554998212815' };

    expect(findExactSharedContactClient([partial, exact], candidates)).toBe(exact);
    expect(
      findExactSharedContactClient(
        [exact, { ...exact, id: 'client-3', phoneNormalized: '554498212815' }],
        candidates,
      ),
    ).toBeNull();
  });

  it('keeps shared contact actions explicit, accessible and free of automatic sends', () => {
    const actionStart = whatsAppInboxSource.indexOf('const startSharedContactConversation');
    const actionEnd = whatsAppInboxSource.indexOf('const openSharedContactClient', actionStart);
    const startActionSource = whatsAppInboxSource.slice(actionStart, actionEnd);

    expect(startActionSource).toContain('setStartConversationSeed');
    expect(startActionSource).not.toContain('startWhatsAppConversation(');
    expect(whatsAppInboxSource).toContain('Telefone para a ação');
    expect(whatsAppInboxSource).toContain('Iniciar conversa');
    expect(whatsAppInboxSource).toContain('Ver cliente');
    expect(whatsAppInboxSource).toContain('disabled={!selectedPhoneIsValid');
    expect(whatsAppInboxSource).toContain('actionInFlightRef.current');
    expect(whatsAppInboxSource).toContain('shouldApplySharedContactActionResult');
    expect(globalStylesSource).toContain('@media (max-width: 430px)');
    expect(globalStylesSource).toContain(
      '.conversation-shared-contact-actions button:focus-visible',
    );
  });

  it('renders independent actions for one, many and phone-less shared contacts', () => {
    const noop = () => Promise.resolve();
    const singleMarkup = renderToStaticMarkup(
      createElement(ConversationContactContent, {
        message: message({
          type: 'CONTACT',
          contacts: [{ displayName: 'Bruno', phones: ['+55 44 99821-2815'] }],
        }),
        onOpenClient: noop,
        onStartConversation: noop,
      }),
    );
    const contacts = Array.from({ length: 10 }, (_, index) => ({
      displayName: `Contato ${index + 1}`,
      phones: index === 0 ? [] : [`+55 44 99821-${String(2800 + index)}`],
    }));
    const manyMarkup = renderToStaticMarkup(
      createElement(ConversationContactContent, {
        message: message({ type: 'CONTACTS', contacts }),
        onOpenClient: noop,
        onStartConversation: noop,
      }),
    );
    const multiplePhonesMarkup = renderToStaticMarkup(
      createElement(ConversationContactContent, {
        message: message({
          type: 'CONTACT',
          contacts: [
            {
              displayName: 'João',
              phones: ['+55 44 99821-2815', '+55 44 3333-2222'],
            },
          ],
        }),
        onOpenClient: noop,
        onStartConversation: noop,
      }),
    );

    expect(singleMarkup).toContain('Iniciar conversa');
    expect(singleMarkup).toContain('Ver cliente');
    expect(manyMarkup.match(/<article/g)).toHaveLength(10);
    expect(manyMarkup).toContain('Telefone não informado');
    expect(multiplePhonesMarkup).toContain('<select');
    expect(multiplePhonesMarkup).toContain('Selecione um telefone');
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

  it('keeps deleted tombstones renderable while hiding media captions and reactions in source', () => {
    const deleted = message({
      direction: 'OUTBOUND',
      type: 'IMAGE',
      text: null,
      deleted: true,
      deletedAt: '2026-10-10T12:35:00.000Z',
      deletedForEveryone: true,
      mediaAvailable: true,
      mediaFileName: 'foto.png',
      reactions: [reaction({ emoji: '❤️' })],
      retryAction: 'RETRY',
    });

    expect(isRenderableConversationMessage(deleted)).toBe(true);
    expect(conversationMessageCaption(deleted)).toBe('');
    expect(isDeleteEligibleConversationMessage(deleted)).toBe(false);
    expect(whatsAppInboxSource).toContain('Mensagem apagada');
    expect(whatsAppInboxSource).toContain('!message.deleted ? <ConversationReactionSummary');
    expect(whatsAppInboxSource).toContain('!message.deleted ? (');
  });

  it('shows delete action only for outbound provider-backed messages with confirmation UX', () => {
    expect(
      isDeleteEligibleConversationMessage(
        message({ direction: 'OUTBOUND', providerMessageId: 'provider-id' }),
      ),
    ).toBe(true);
    expect(
      isDeleteEligibleConversationMessage(
        message({ direction: 'INBOUND', providerMessageId: 'provider-id' }),
      ),
    ).toBe(false);
    expect(
      isDeleteEligibleConversationMessage(
        message({ direction: 'OUTBOUND', providerMessageId: null }),
      ),
    ).toBe(false);
    expect(whatsAppInboxSource).toContain('Apagar esta mensagem?');
    expect(whatsAppInboxSource).toContain('deleteWhatsAppConversationMessage');
    expect(globalStylesSource).toContain('.conversation-delete-confirm');
  });

  it('uses a viewport-safe accessible modal for mobile message deletion confirmation', () => {
    expect(whatsAppInboxSource).toContain('ConversationMobileDeleteConfirmation');
    expect(whatsAppInboxSource).toContain("window.matchMedia('(max-width: 620px)')");
    expect(whatsAppInboxSource).toContain('className="conversation-delete-modal-backdrop"');
    expect(whatsAppInboxSource).toContain('aria-modal="true"');
    expect(whatsAppInboxSource).toContain('aria-labelledby={titleId}');
    expect(whatsAppInboxSource).toContain('aria-describedby={descriptionId}');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('cancelButtonRef.current?.focus()');
    expect(whatsAppInboxSource).toContain('modalRef.current?.focus()');
    expect(whatsAppInboxSource).toContain('tabIndex={-1}');
    expect(globalStylesSource).toContain('.conversation-delete-modal-backdrop {');
    expect(globalStylesSource).toContain('position: fixed;');
    expect(globalStylesSource).toContain('height: var(--chat-viewport-height, 100dvh);');
    expect(globalStylesSource).toContain('max-width: calc(100vw - 32px);');
    expect(globalStylesSource).toContain('env(safe-area-inset-left)');
    expect(globalStylesSource).toContain('min-height: 44px;');
    expect(globalStylesSource).not.toContain(
      '.conversation-message-mobile-actions .conversation-delete-confirm',
    );
  });

  it('offers inline edit only for non-deleted outbound provider-backed text messages', () => {
    expect(
      isEditEligibleConversationMessage(
        message({ direction: 'OUTBOUND', type: 'TEXT', providerMessageId: 'provider-id' }),
      ),
    ).toBe(true);

    for (const candidate of [
      message({ direction: 'INBOUND', type: 'TEXT', providerMessageId: 'provider-id' }),
      message({ direction: 'OUTBOUND', type: 'TEXT', providerMessageId: null }),
      message({ direction: 'OUTBOUND', type: 'TEXT', deleted: true }),
      ...(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'] as const).map((type) =>
        message({ direction: 'OUTBOUND', type, providerMessageId: 'provider-id' }),
      ),
    ]) {
      expect(isEditEligibleConversationMessage(candidate)).toBe(false);
    }

    expect(whatsAppInboxSource).toContain('aria-label="Editar mensagem"');
    expect(whatsAppInboxSource).toContain('aria-label="Editar texto da mensagem"');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain("event.key === 'Enter'");
    expect(whatsAppInboxSource).toContain('!event.shiftKey');
    expect(whatsAppInboxSource).toContain('!event.nativeEvent.isComposing');
    expect(whatsAppInboxSource).toContain("{savingEdit ? 'Salvando...' : 'Salvar'}");
    expect(whatsAppInboxSource).toContain('editWhatsAppConversationMessage');
    expect(globalStylesSource).toContain('.conversation-message-editor');
    expect(whatsAppInboxSource).toContain(
      "setEditError(conversationErrorMessage(err, 'Não foi possível editar esta mensagem.'))",
    );
  });

  it('shows only the time for original messages and Editada with the edit time when persisted', () => {
    const original = message({
      sentAt: '2026-10-08T12:00:00.000Z',
      editedAt: null,
    });
    const edited = message({
      sentAt: '2026-10-08T12:00:00.000Z',
      editedAt: '2026-10-08T12:22:00.000Z',
    });

    expect(conversationMessageFooterLabel(original)).toBe(
      new Date(original.sentAt!).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
    expect(conversationMessageFooterLabel(edited)).toBe(
      `Editada ${new Date(edited.editedAt!).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`,
    );
    expect(whatsAppInboxSource).toContain('{conversationMessageFooterLabel(message)}');
    expect(whatsAppInboxSource).toContain("message.isAutoReply ? 'Automática · ' : ''");
    expect(whatsAppInboxSource).toContain(
      '{outbound ? <ConversationMessageStatusIcon status={message.status} /> : null}',
    );
    expect(globalStylesSource).toContain('.conversation-bubble footer');
    expect(globalStylesSource).toContain('line-height: 1;');
  });

  it('keeps message actions outside the bubble so short messages stay compact', () => {
    expect(whatsAppInboxSource).toContain('className={`conversation-message-actions');
    expect(whatsAppInboxSource).toContain('{outbound ? actionRail : null}');
    expect(whatsAppInboxSource).toContain('{!outbound ? actionRail : null}');
    expect(globalStylesSource).toContain('.conversation-message-actions');
    expect(globalStylesSource).toContain('flex: 0 0 auto;');
    expect(globalStylesSource).toContain('pointer-events: none;');
    expect(globalStylesSource).toContain('.conversation-bubble-row.outbound .conversation-bubble');
    expect(globalStylesSource).toContain('.conversation-bubble-row.inbound .conversation-bubble');
    expect(globalStylesSource).toContain('max-width: min(90%, calc(100% - 52px));');
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

  it('positions the reaction picker inside the viewport and flips above near the bottom edge', () => {
    expect(
      calculateReactionPickerPosition({
        triggerRect: {
          left: 320,
          right: 350,
          top: 220,
          bottom: 250,
          width: 30,
          height: 30,
        },
        viewportWidth: 720,
        viewportHeight: 640,
        pickerWidth: 260,
        pickerHeight: 48,
      }),
    ).toMatchObject({ left: 205, top: 258, placement: 'bottom' });

    expect(
      calculateReactionPickerPosition({
        triggerRect: {
          left: 680,
          right: 710,
          top: 590,
          bottom: 620,
          width: 30,
          height: 30,
        },
        viewportWidth: 720,
        viewportHeight: 640,
        pickerWidth: 260,
        pickerHeight: 48,
      }),
    ).toMatchObject({ left: 448, top: 534, placement: 'top' });
  });

  it('keeps the reaction picker portal safe with outside click, escape and listener cleanup', () => {
    expect(whatsAppInboxSource).toContain("import { createPortal } from 'react-dom'");
    expect(whatsAppInboxSource).toContain('createPortal(');
    expect(whatsAppInboxSource).toContain('document.body');
    expect(whatsAppInboxSource).toContain('if (!open) {');
    expect(whatsAppInboxSource).toContain("window.addEventListener('resize', updatePosition)");
    expect(whatsAppInboxSource).toContain(
      "window.addEventListener('scroll', updatePosition, true)",
    );
    expect(whatsAppInboxSource).toContain("window.removeEventListener('resize', updatePosition)");
    expect(whatsAppInboxSource).toContain(
      "window.removeEventListener('scroll', updatePosition, true)",
    );
    expect(whatsAppInboxSource).toContain(
      "document.addEventListener('pointerdown', handlePointerDown)",
    );
    expect(whatsAppInboxSource).toContain(
      "document.removeEventListener('pointerdown', handlePointerDown)",
    );
    expect(whatsAppInboxSource).toContain("document.addEventListener('keydown', handleKeyDown)");
    expect(whatsAppInboxSource).toContain("document.removeEventListener('keydown', handleKeyDown)");
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('pickerRef.current?.contains(target)');
    expect(whatsAppInboxSource).toContain('triggerRef.current?.contains(target)');
  });

  it('keeps reaction picker CSS fixed, layered and mobile-safe', () => {
    expect(globalStylesSource).toContain('.conversation-reaction-picker {');
    expect(globalStylesSource).toContain('position: fixed;');
    expect(globalStylesSource).toContain('z-index: 1200;');
    expect(globalStylesSource).toContain('overflow-x: auto;');
    expect(globalStylesSource).toContain('scrollbar-width: none;');
    expect(globalStylesSource).toContain('.conversation-reaction-picker.top');
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
      editedAt: '2026-10-08T12:22:00.000Z',
      reactions: [reaction({ id: 'reaction-updated', emoji: '😂', isFromMe: true })],
    });
    const merged = mergeConversationMessages([stale], [updated]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.reactions).toEqual([
      expect.objectContaining({ emoji: '😂', isFromMe: true }),
    ]);
    expect(merged[0]?.editedAt).toBe('2026-10-08T12:22:00.000Z');
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

  it('replaces stale message state with a deleted realtime tombstone', () => {
    const stale = message({
      id: 'message-delete',
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      text: 'contrato secreto',
      mediaFileName: 'Contrato sigiloso.pdf',
      mediaMimeType: 'application/pdf',
      mediaSizeBytes: 123,
      mediaAvailable: true,
      retryAction: 'RETRY',
      reactions: [reaction({ emoji: '❤️', isFromMe: true })],
    });
    const tombstone = message({
      id: 'message-delete',
      direction: 'OUTBOUND',
      type: 'DOCUMENT',
      text: null,
      deleted: true,
      deletedAt: '2026-10-10T12:35:00.000Z',
      deletedForEveryone: true,
      mediaFileName: null,
      mediaMimeType: null,
      mediaSizeBytes: null,
      mediaAvailable: false,
      retryAction: null,
      reactions: [],
    });
    const merged = mergeConversationMessages([stale], [tombstone]);

    expect(merged).toEqual([tombstone]);
    expect(JSON.stringify(merged)).not.toContain('contrato secreto');
    expect(JSON.stringify(merged)).not.toContain('Contrato sigiloso.pdf');
    expect(JSON.stringify(merged)).not.toContain('❤️');
  });

  it('renders automatic replies and pending follow-up without changing manual bubbles', () => {
    const automatic = message({ isAutoReply: true });
    const manual = message({ id: 'manual-message', isAutoReply: false });
    const merged = mergeConversationMessages([manual], [automatic]);

    expect(automatic.isAutoReply).toBe(true);
    expect(manual.isAutoReply).toBe(false);
    expect(merged.some((item) => item.isAutoReply)).toBe(true);
    expect(whatsAppInboxSource).toContain("message.isAutoReply ? 'Automática · ' : ''");
    expect(whatsAppInboxSource).toContain("id: 'followup', label: 'Aguardando retorno'");
    expect(whatsAppInboxSource).toContain('filters.needsManualFollowUp = true');
    expect(whatsAppInboxSource).toContain('Retorno pendente');
    expect(whatsAppInboxSource).toContain('Resposta automática ativa');
    expect(whatsAppInboxSource).toContain('updateWhatsAppAutoReply');
    expect(whatsAppInboxSource).toContain(
      'config.whatsAppConnectionId === selectedConversation?.whatsAppConnectionId',
    );
    expect(globalStylesSource).toContain('.conversation-auto-reply-banner');
    expect(globalStylesSource).toContain('@media (max-width: 720px)');
  });

  it('keeps the desktop conversation list compact with a subtle usable scrollbar', () => {
    const scrollAreaStyles =
      globalStylesSource.match(/\.conversation-list-items \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(globalStylesSource).toContain('grid-template-columns: 16px minmax(0, 1fr) auto;');
    expect(globalStylesSource).toContain('grid-template-columns: 30px minmax(0, 1fr);');
    expect(globalStylesSource).toContain('min-height: 24px;');
    expect(globalStylesSource).toContain('padding: 6px 5px;');
    expect(scrollAreaStyles).toContain('overflow-x: hidden;');
    expect(scrollAreaStyles).toContain('overflow-y: auto;');
    expect(scrollAreaStyles).toContain('scrollbar-width: thin;');
    expect(scrollAreaStyles).not.toContain('scrollbar-width: none;');
    expect(globalStylesSource).toContain('.conversation-list-items::-webkit-scrollbar');
    expect(globalStylesSource).toContain('.conversation-list-items::-webkit-scrollbar-track');
    expect(globalStylesSource).toContain('.conversation-list-items::-webkit-scrollbar-thumb');
    expect(globalStylesSource).toContain('width: 4px;');
    expect(globalStylesSource).toContain('.conversation-list-items:hover::-webkit-scrollbar-thumb');
    expect(scrollAreaStyles).toContain('overscroll-behavior: contain;');
    expect(globalStylesSource).toContain('.conversation-list-meta-row .conversation-kind');
  });

  it('restores touch-friendly controls and conversation rows on mobile', () => {
    expect(globalStylesSource).toContain(
      '.conversation-list-panel .conversation-panel-header .ui-icon-button,',
    );
    expect(globalStylesSource).toContain('grid-template-columns: 34px minmax(0, 1fr);');
    expect(globalStylesSource).toContain('min-height: 36px;');
    expect(globalStylesSource).toContain('padding: 7px;');
  });

  it('preserves every conversation list filter while changing only presentation', () => {
    expect(whatsAppInboxSource).toContain("useState<AttendanceFilter>('ACTIVE')");
    expect(whatsAppInboxSource).toContain("{ id: 'ACTIVE', label: 'Atendimentos' }");
    expect(whatsAppInboxSource).toContain("{ id: 'PENDING', label: 'Pendentes' }");
    expect(whatsAppInboxSource).toContain("{ id: 'IN_PROGRESS', label: 'Em andamento' }");
    expect(whatsAppInboxSource).toContain("{ id: 'ALL', label: 'Todas' }");
    expect(whatsAppInboxSource).toContain('attendanceStatus: attendanceFilter');
    expect(whatsAppInboxSource).toContain("{ id: 'all', label: 'Todas' }");
    expect(whatsAppInboxSource).toContain("{ id: 'unread', label: 'Não lidas' }");
    expect(whatsAppInboxSource).toContain("{ id: 'followup', label: 'Aguardando retorno' }");
    expect(whatsAppInboxSource).toContain("{ id: 'clients', label: 'Clientes' }");
    expect(whatsAppInboxSource).toContain("{ id: 'guests', label: 'Avulsos' }");
    expect(whatsAppInboxSource).toContain('Filtro secundário de conversas');
    expect(whatsAppInboxSource).toContain(
      'onFilterChange(event.target.value as ConversationFilter)',
    );
    expect(whatsAppInboxSource).toContain('onStatusFilterChange(');
    expect(whatsAppInboxSource).toContain('Nenhum atendimento aguardando no momento.');
    expect(whatsAppInboxSource).toContain('Nenhum atendimento pendente.');
    expect(whatsAppInboxSource).toContain('Nenhum atendimento em andamento.');
    expect(whatsAppInboxSource).toContain('scheduleRealtimeListRefresh(true)');
    const forwardModalSource = whatsAppInboxSource.slice(
      whatsAppInboxSource.indexOf('function ForwardConversationMessageModal('),
      whatsAppInboxSource.indexOf('function ConversationLabelManager('),
    );
    expect(forwardModalSource).toContain("attendanceStatus: 'ALL'");
  });

  it('uses backend recent-activity order for refresh, realtime replacement and pagination', () => {
    const loadConversationsSource = whatsAppInboxSource.slice(
      whatsAppInboxSource.indexOf('const loadConversations = useCallback('),
      whatsAppInboxSource.indexOf('const loadMessages = useCallback('),
    );
    const mergeListsSource = whatsAppInboxSource.slice(
      whatsAppInboxSource.indexOf('export function mergeConversationLists('),
      whatsAppInboxSource.indexOf('export function mergeConversationById('),
    );

    expect(loadConversationsSource).toContain('pageSize: requestPageSize');
    expect(loadConversationsSource).toContain('if (append)');
    expect(loadConversationsSource).toContain('return payload.items');
    expect(loadConversationsSource).toContain('refreshPageCount * conversationsPageSize');
    expect(mergeListsSource).not.toContain('.sort(');
    expect(whatsAppInboxSource).toContain('scheduleRealtimeListRefresh(true)');
  });

  it('keeps text bubbles dense, content-sized and aligned without horizontal overflow', () => {
    const messageViewportStyles =
      globalStylesSource.match(
        /\.conversation-chat-panel \.conversation-messages \{[\s\S]*?\n\}/,
      )?.[0] ?? '';
    const desktopBubbleStyles =
      globalStylesSource.match(
        /\.conversation-chat-panel \.conversation-bubble \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? '';
    const bubbleTextStyles =
      globalStylesSource.match(/\.conversation-bubble p \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(globalStylesSource).toContain('@media (min-width: 981px)');
    expect(desktopBubbleStyles).toContain('width: fit-content;');
    expect(desktopBubbleStyles).toContain('max-width: min(62%, 620px);');
    expect(desktopBubbleStyles).toContain('line-height: 1.38;');
    expect(globalStylesSource).toContain('.conversation-bubble-row.outbound');
    expect(globalStylesSource).toContain('justify-content: flex-end;');
    expect(globalStylesSource).toContain('.conversation-bubble-row.inbound');
    expect(globalStylesSource).toContain('justify-content: flex-start;');
    expect(bubbleTextStyles).toContain('overflow-wrap: anywhere;');
    expect(bubbleTextStyles).toContain('white-space: pre-wrap;');
    expect(messageViewportStyles).toContain('overflow-x: hidden;');
    expect(globalStylesSource).toContain('overflow-y: auto;');
  });

  it('contains every media type, replies, reactions and footer inside the compact bubble', () => {
    const desktopMediaBubbleStyles =
      globalStylesSource.match(
        /\.conversation-chat-panel \.conversation-bubble\.has-image-media \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? '';
    const imageStyles =
      globalStylesSource.match(/\.conversation-image-media img \{[\s\S]*?\n\}/)?.[0] ?? '';

    expect(desktopMediaBubbleStyles).toContain('width: fit-content;');
    expect(desktopMediaBubbleStyles).toContain('max-width: min(62%, 380px);');
    expect(globalStylesSource).toContain('width: min(340px, 100%);');
    expect(globalStylesSource).toContain('max-height: 320px;');
    expect(imageStyles).toContain('height: auto;');
    expect(imageStyles).toContain('object-fit: contain;');
    expect(globalStylesSource).toContain('.conversation-document-media');
    expect(globalStylesSource).toContain('.conversation-video-media');
    expect(globalStylesSource).toContain('.conversation-audio-player');
    expect(globalStylesSource).toContain('.conversation-sticker-media');
    expect(globalStylesSource).toContain('.conversation-quote');
    expect(globalStylesSource).toContain('.conversation-reaction-summary');
    expect(globalStylesSource).toContain('.conversation-bubble footer');
    expect(whatsAppInboxSource).toContain("message.isAutoReply ? 'Automática · ' : ''");
    expect(whatsAppInboxSource).toContain('conversationMessageFooterLabel(message)');
  });

  it('compacts the desktop composer and scrollbar while preserving tablet and mobile comfort', () => {
    const messageViewportStyles =
      globalStylesSource.match(
        /\.conversation-chat-panel \.conversation-messages \{[\s\S]*?\n\}/,
      )?.[0] ?? '';

    expect(messageViewportStyles).toContain('scrollbar-width: thin;');
    expect(messageViewportStyles).not.toContain('scrollbar-width: none;');
    expect(messageViewportStyles).not.toContain('display: none;');
    expect(globalStylesSource).toContain(
      '.conversation-chat-panel .conversation-messages::-webkit-scrollbar',
    );
    expect(globalStylesSource).toContain('.conversation-messages:hover::-webkit-scrollbar-thumb');
    expect(globalStylesSource).toContain('min-height: 68px;');
    expect(globalStylesSource).toContain('min-height: 38px;');
    expect(globalStylesSource).toContain('@media (min-width: 621px) and (max-width: 980px)');
    expect(globalStylesSource).toContain('max-width: min(72%, 560px);');
    expect(globalStylesSource).toContain('max-width: min(90%, calc(100% - 52px));');
    expect(globalStylesSource).toContain('width: min(82vw, 100%);');
    expect(globalStylesSource).toContain('min-height: 42px;');
  });

  it('offers forwarding only for supported non-deleted message content', () => {
    for (const type of ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'] as const) {
      expect(
        isForwardEligibleConversationMessage(
          message({
            type,
            text: type === 'TEXT' ? 'Conteúdo atual' : null,
            mediaAvailable: type !== 'TEXT',
            mediaMimeType: type === 'STICKER' ? 'image/webp' : null,
          }),
        ),
      ).toBe(true);
    }

    expect(isForwardEligibleConversationMessage(message({ deleted: true }))).toBe(false);
    expect(
      isForwardEligibleConversationMessage(message({ deletedAt: '2026-10-15T10:00:00Z' })),
    ).toBe(false);
    expect(isForwardEligibleConversationMessage(message({ type: 'TEXT', text: '   ' }))).toBe(
      false,
    );
    expect(isForwardEligibleConversationMessage(message({ type: 'LOCATION' }))).toBe(false);
    expect(
      isForwardEligibleConversationMessage(
        message({ type: 'STICKER', mediaAvailable: true, mediaMimeType: 'video/mp4' }),
      ),
    ).toBe(false);
    expect(
      isForwardEligibleConversationMessage(message({ type: 'IMAGE', mediaAvailable: false })),
    ).toBe(false);
  });

  it('keeps forwarding scoped, searchable, accessible and single-target in the Inbox', () => {
    expect(whatsAppInboxSource).toContain('aria-label="Encaminhar mensagem"');
    expect(whatsAppInboxSource).toContain('role="dialog"');
    expect(whatsAppInboxSource).toContain('aria-modal="true"');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('Buscar conversa por nome ou telefone');
    expect(whatsAppInboxSource).toContain(
      'whatsAppConnectionId: sourceConversation.whatsAppConnectionId',
    );
    expect(whatsAppInboxSource).toContain(
      'result.items.filter((item) => item.id !== sourceConversation.id)',
    );
    expect(whatsAppInboxSource).toContain('aria-pressed={selectedId === conversation.id}');
    expect(whatsAppInboxSource).toContain("loading ? 'Encaminhando...' : 'Encaminhar'");
    expect(whatsAppInboxSource).toContain('forwardingRef.current');
    expect(whatsAppInboxSource).toContain('submissionRef.current?.targetConversationId');
    expect(whatsAppInboxSource).toContain(
      'onSubmit(submission.targetConversationId, submission.requestId)',
    );
  });

  it('renders compact previews and a persistent forwarded marker without exposing source contact data', () => {
    expect(whatsAppInboxSource).toContain('function ConversationForwardPreview');
    expect(whatsAppInboxSource).toContain("message.type === 'VIDEO'");
    expect(whatsAppInboxSource).toContain("message.type === 'AUDIO'");
    expect(whatsAppInboxSource).toContain("message.type === 'DOCUMENT'");
    expect(whatsAppInboxSource).toContain("message.type === 'STICKER'");
    expect(whatsAppInboxSource).toContain('message.isForwarded');
    expect(whatsAppInboxSource).toContain('>Encaminhada</span>');
    expect(whatsAppInboxSource).not.toContain('forwardedFromConversationId}</');
    expect(whatsAppInboxSource).not.toContain('forwardedFromMessageId}</');
  });

  it('keeps the forwarding modal responsive, focus-visible and vertically scrollable', () => {
    expect(globalStylesSource).toContain('.conversation-forward-modal');
    expect(globalStylesSource).toContain('.conversation-forward-destinations');
    expect(globalStylesSource).toContain('overflow-y: auto;');
    expect(globalStylesSource).toContain('.conversation-forward-destination:focus-visible');
    expect(globalStylesSource).toContain('.conversation-forward-destination.selected');
    expect(globalStylesSource).toContain('@media (max-width: 620px)');
    expect(globalStylesSource).toContain('max-height: min(84dvh, 680px);');
    expect(globalStylesSource).toContain('min-height: 44px;');
    expect(whatsAppInboxSource).toContain("event.key !== 'Tab'");
    expect(whatsAppInboxSource).toContain('modalRef.current?.querySelectorAll<HTMLElement>');
  });

  it('renders compact conversation label chips, manager and a combinable server-side filter', () => {
    expect(whatsAppInboxSource).toContain('function ConversationLabelChips');
    expect(whatsAppInboxSource).toContain('labels.slice(0, limit)');
    expect(whatsAppInboxSource).toContain('labels.length - limit');
    expect(whatsAppInboxSource).toContain(
      '<span className="conversation-label-name">{label.name}</span>',
    );
    expect(whatsAppInboxSource).toContain('Aplicar etiquetas');
    expect(whatsAppInboxSource).toContain('type="checkbox"');
    expect(whatsAppInboxSource).toContain('setWhatsAppConversationLabels');
    expect(whatsAppInboxSource).toContain('if (labelFilter) filters.labelId = labelFilter');
    expect(whatsAppInboxSource).toContain(
      'labelFilter && err instanceof ApiError && err.status === 404',
    );
    expect(whatsAppInboxSource).toContain("setLabelFilter('');");
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(globalStylesSource).toContain('.conversation-label-chip');
    expect(globalStylesSource).toContain('.conversation-label-manager');
    expect(globalStylesSource).toContain('min-height: 44px;');
  });

  it('keeps label filters in the list flow and renders the manager as a fixed portal overlay', () => {
    expect(whatsAppInboxSource).toContain(
      'className="conversation-list-panel conversation-list-panel-with-labels"',
    );
    expect(globalStylesSource).toContain('.conversation-list-panel-with-labels {');
    expect(globalStylesSource).toContain('flex-direction: column;');
    expect(globalStylesSource).toContain(
      '.conversation-list-panel-with-labels > :not(.conversation-list-items)',
    );
    expect(globalStylesSource).toContain(
      '.conversation-list-panel-with-labels .conversation-list-items',
    );
    expect(globalStylesSource).toContain('flex: 1 1 auto;');
    expect(whatsAppInboxSource).toContain('className="conversation-label-manager-backdrop"');
    expect(whatsAppInboxSource).toContain('document.body,');
    expect(whatsAppInboxSource).toContain("document.body.style.overflow = 'hidden';");
    expect(whatsAppInboxSource).toContain('document.body.style.overflow = previousBodyOverflow;');
    expect(globalStylesSource).toContain('.conversation-label-manager-backdrop {');
    expect(globalStylesSource).toContain('position: fixed;');
    expect(globalStylesSource).toContain('inset: 0;');
    expect(globalStylesSource).toContain('z-index: 1700;');
    expect(globalStylesSource).toContain('max-height: min(80dvh, 680px);');
    expect(globalStylesSource).toContain('.conversation-label-options {');
    expect(globalStylesSource).toContain('overscroll-behavior: contain;');
    expect(globalStylesSource).toContain('.conversation-label-manager .conversation-modal-actions');
  });

  it('keeps conversation labels compact and subordinate in the list and chat header', () => {
    expect(whatsAppInboxSource).toContain(
      '<ConversationLabelChips labels={conversation.labels} limit={2} />\n        </span>',
    );
    expect(whatsAppInboxSource).toContain(
      '<ConversationLabelChips labels={conversation.labels} limit={3} />',
    );
    expect(whatsAppInboxSource).toContain('labels.slice(0, limit)');
    expect(whatsAppInboxSource).toContain('labels.length - limit');
    expect(globalStylesSource).toContain('.conversation-list-meta-row .conversation-label-chips');
    expect(globalStylesSource).toContain('flex: 0 1 auto;');
    expect(globalStylesSource).toContain('justify-content: flex-start;');
    expect(globalStylesSource).toContain('.conversation-header-badges > .conversation-label-chips');
    expect(globalStylesSource).toContain('min-height: 15px;');
    expect(globalStylesSource).toContain('font-size: 9px;');
    expect(globalStylesSource).toContain('background: rgb(255 255 255 / 2%);');
    expect(globalStylesSource).toContain('.conversation-label-name {');
    expect(globalStylesSource).toContain('text-overflow: ellipsis;');
    expect(globalStylesSource).toContain('white-space: nowrap;');
    expect(globalStylesSource).toContain(
      '.conversation-label-chip.color-blue .conversation-label-dot',
    );
    expect(globalStylesSource).toContain('flex-wrap: wrap;');
    expect(globalStylesSource).toContain('max-height: 38px;');
    expect(globalStylesSource).toContain('.conversation-list-meta-row .conversation-kind');
    expect(globalStylesSource).toContain('.conversation-header-badges .conversation-status-badge');
  });

  it('keeps contact kind, status and labels in the same ordered header badge row', () => {
    expect(whatsAppInboxSource).toContain("{conversation.client ? 'Cliente' : 'Avulso'}");
    expect(whatsAppInboxSource).toContain('{conversation.status}');
    expect(whatsAppInboxSource).toContain(
      '{opening ? <span className="conversation-sync-badge">Carregando</span> : null}\n            <ConversationLabelChips labels={conversation.labels} limit={3} />\n          </div>',
    );
    expect(whatsAppInboxSource).toContain('if (!labels.length) return null;');
    expect(globalStylesSource).toContain(
      '.conversation-header-badges > .conversation-label-chips {',
    );
    expect(globalStylesSource).toContain('flex: 0 1 auto;');
    expect(globalStylesSource).toContain('flex-wrap: wrap;');
    expect(globalStylesSource).toContain('max-height: 38px;');
    expect(whatsAppInboxSource).toContain('className="conversation-header-actions"');
  });

  it('keeps phone, contact kind, follow-up and labels grouped in the list metadata row', () => {
    const listLabelStyles = (
      globalStylesSource.match(
        /\.conversation-list-meta-row \.conversation-label-chips \{[\s\S]*?\n\s*\}/g,
      ) ?? []
    ).join('\n');

    expect(whatsAppInboxSource).toContain(
      "{conversation.client ? 'Cliente' : 'Avulso'}\n          </span>",
    );
    expect(whatsAppInboxSource).toContain(
      '<span className="conversation-followup-badge">Retorno pendente</span>',
    );
    expect(whatsAppInboxSource).toContain(
      '<ConversationLabelChips labels={conversation.labels} limit={2} />\n        </span>',
    );
    expect(globalStylesSource).toContain('.conversation-list-meta-row {');
    expect(globalStylesSource).toContain('justify-content: flex-start;');
    expect(globalStylesSource).toContain('.conversation-list-meta-row > span:first-child {');
    expect(globalStylesSource).toContain('text-overflow: ellipsis;');
    expect(listLabelStyles).toContain('flex-basis: auto;');
    expect(listLabelStyles).toContain('flex: 0 1 auto;');
    expect(listLabelStyles).toContain('justify-content: flex-start;');
    expect(listLabelStyles).not.toContain('flex-basis: 120px;');
    expect(listLabelStyles).not.toContain('flex: 0 1 112px;');
    expect(listLabelStyles).not.toContain('margin-left: auto;');
    expect(whatsAppInboxSource).toContain('className="conversation-list-title-row"');
    expect(whatsAppInboxSource).toContain(
      '<ConversationLabelChips labels={conversation.labels} limit={3} />',
    );
  });

  it('compacts the mobile list controls before the independently scrolling conversations', () => {
    expect(whatsAppInboxSource).toContain('conversation-attendance-filter-row');
    expect(whatsAppInboxSource).toContain("item.id === 'followup' ? 'Aguardando' : item.label");
    expect(whatsAppInboxSource).toContain('className="conversation-secondary-filters"');
    expect(whatsAppInboxSource).toContain('aria-label="Filtro secundário de conversas"');
    expect(whatsAppInboxSource).toContain('aria-label="Filtrar por status"');
    expect(whatsAppInboxSource).toContain('aria-label="Filtrar por etiqueta"');
    expect(globalStylesSource).toContain('overscroll-behavior-inline: contain;');
    expect(globalStylesSource).toContain('scrollbar-width: none;');
    expect(globalStylesSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(globalStylesSource).toContain('min-height: 42px;');
    expect(globalStylesSource).toContain('grid-template-columns: 40px minmax(0, 1fr);');
    expect(globalStylesSource).toContain('flex: 1 1 auto;');
    expect(globalStylesSource).toContain('overflow-y: auto;');
  });

  it('adds a mobile-only accessible return to the dashboard through existing navigation', () => {
    expect(whatsAppInboxSource).toContain('aria-label="Voltar ao Dashboard"');
    expect(whatsAppInboxSource).toContain('className="conversation-dashboard-back"');
    expect(whatsAppInboxSource).toContain('onClick={onBackToDashboard}');
    expect(dashboardSource).toContain('onBackToDashboard={handleBackToDashboard}');
    expect(globalStylesSource).toContain('.conversation-dashboard-back,');
    expect(globalStylesSource).toContain('.conversation-dashboard-back {');
    expect(globalStylesSource).toContain('flex: 0 0 44px;');
  });

  it('locks only the mobile Inbox page to the visual viewport and restores the document contract', () => {
    expect(whatsAppInboxSource).toContain(
      "const mobileInboxQuery = window.matchMedia('(max-width: 620px)')",
    );
    expect(whatsAppInboxSource).toContain('if (mobileInboxQuery.matches)');
    expect(whatsAppInboxSource).toContain(
      "root.setAttribute('data-mobile-conversation-inbox', 'open')",
    );
    expect(whatsAppInboxSource).toContain("root.removeAttribute('data-mobile-conversation-inbox')");
    expect(whatsAppInboxSource).toContain(
      "root.setAttribute('data-mobile-conversation-inbox', previousMobileInboxState)",
    );
    expect(globalStylesSource).toContain("html[data-mobile-conversation-inbox='open'] body");
    expect(globalStylesSource).toContain('height: var(--chat-viewport-height, 100svh);');
    expect(globalStylesSource).toContain('overscroll-behavior: none;');
    expect(whatsAppInboxSource).toContain('const viewportHeight = visualViewport?.height');
    expect(whatsAppInboxSource).toContain(
      "visualViewport?.addEventListener('resize', updateChatViewportHeight)",
    );
    expect(whatsAppInboxSource).toContain(
      "visualViewport?.removeEventListener('resize', updateChatViewportHeight)",
    );
    expect(whatsAppInboxSource).toContain(
      "mobileInboxQuery.addEventListener('change', updateMobileInboxDocumentState)",
    );
    expect(whatsAppInboxSource).toContain(
      "mobileInboxQuery.removeEventListener('change', updateMobileInboxDocumentState)",
    );
  });

  it('uses one compact accessible mobile chat header row with an overflow action menu', () => {
    expect(whatsAppInboxSource).toContain('className="conversation-mobile-back"');
    expect(whatsAppInboxSource).toContain('aria-label="Voltar para conversas"');
    expect(whatsAppInboxSource).toContain('className="conversation-header-actions-mobile"');
    expect(whatsAppInboxSource).toContain('label="Mais ações da conversa"');
    expect(whatsAppInboxSource).toContain("label: 'Etiquetas'");
    expect(whatsAppInboxSource).toContain("label: 'Buscar na conversa'");
    expect(whatsAppInboxSource).toContain("label: 'Informações do contato'");
    expect(globalStylesSource).toContain("grid-template-areas: 'back contact actions';");
    expect(globalStylesSource).toContain('grid-template-columns: 40px minmax(0, 1fr) 40px;');
    expect(globalStylesSource).toContain('.conversation-mobile-back span {');
    expect(globalStylesSource).toContain('.conversation-header-actions-mobile .ui-icon-button');
    expect(globalStylesSource).toContain('max-height: 34px;');
    expect(globalStylesSource).toContain('flex-wrap: wrap;');
    expect(whatsAppInboxSource).toContain("conversation.status === 'RESOLVED'");
    expect(whatsAppInboxSource).toContain("label: 'Resolver conversa'");
    expect(whatsAppInboxSource).toContain('className="conversation-header-actions"');
  });

  it('collapses mobile message actions and keeps the composer touch-safe and compact', () => {
    expect(whatsAppInboxSource).toContain('const mobileActionItems: ActionMenuItem[]');
    expect(whatsAppInboxSource).toContain('label="Ações da mensagem"');
    expect(whatsAppInboxSource).toContain("label: 'Responder'");
    expect(whatsAppInboxSource).toContain("label: 'Encaminhar'");
    expect(whatsAppInboxSource).toContain('label: `Reagir com ${emoji}`');
    expect(whatsAppInboxSource).toContain("label: savingEdit ? 'Salvando edição...' : 'Editar'");
    expect(whatsAppInboxSource).toContain("label: deleting ? 'Apagando...' : 'Apagar'");
    expect(globalStylesSource).toContain(
      '.conversation-message-actions > :not(.conversation-message-mobile-actions)',
    );
    expect(globalStylesSource).toContain('.conversation-message-mobile-actions .ui-icon-button');
    expect(globalStylesSource).toContain('max-width: min(90%, calc(100% - 52px));');
    expect(globalStylesSource).toContain('min-height: 56px;');
    expect(globalStylesSource).toContain('padding: 6px 8px max(6px, env(safe-area-inset-bottom));');
    expect(globalStylesSource).toContain('min-height: 44px;');
    expect(globalStylesSource).toContain('max-height: 96px;');
    expect(globalStylesSource).toContain('var(--chat-viewport-height, 100svh)');
  });

  it('keeps mobile PIX cards touch-safe and inside compact bubbles', () => {
    expect(whatsAppInboxSource).toContain('aria-label="Copiar chave PIX"');
    expect(globalStylesSource).toContain('.conversation-pix-copy-action {');
    expect(globalStylesSource).toContain('.conversation-pix-copy-action span {');
    expect(globalStylesSource).toContain('text-overflow: ellipsis;');
    expect(globalStylesSource).toContain('min-height: 44px;');
    expect(globalStylesSource).toContain('max-width: min(92%, calc(100% - 52px));');
  });
});
