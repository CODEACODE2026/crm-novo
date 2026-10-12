import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceConversationListGeneration,
  allowedWhatsAppReactionEmojis,
  calculateReactionPickerPosition,
  classifyContactPixState,
  classifyConversationIncomingFile,
  contactReferenceActionMatrix,
  contactOpenReceivable,
  contactPixCanSendWhatsApp,
  contactPixReplacementPayload,
  contactPixWhatsAppButtonLabel,
  contactReceivableAllowsPixAction,
  contactRelevantReceivable,
  contactReceivablesForReference,
  conversationComposerActionMode,
  conversationInitials,
  conversationVideoAccept,
  createConversationComposerMedia,
  disposeConversationComposerMedia,
  conversationMessageCaption,
  isDeleteEligibleConversationMessage,
  isAvailableInlineConversationMedia,
  isRenderableConversationMessage,
  isTechnicalVideoPlaceholder,
  mergeConversationById,
  mergeConversationLists,
  mergeConversationMessages,
  nextOwnReactionEmoji,
  nextConversationPresenceState,
  nextConversationListRequestGeneration,
  resolveRealtimeCreatedMessage,
  shouldAutoReadRealtimeMessage,
  shouldApplyConversationListResponse,
  shouldReadVisibleConversationOnReturn,
  shouldRetryActiveConversationRead,
  sortContactReferences,
  summarizeConversationReactions,
  updateConversationSummaryAfterRead,
} from './WhatsAppInbox';
import type {
  ClientReference,
  PaymentIntent,
  Receivable,
  WhatsAppConversation,
  WhatsAppConversationMessage,
} from '../../lib/crm-api';

const currentDir = dirname(fileURLToPath(import.meta.url));
const whatsAppInboxSource = readFileSync(join(currentDir, 'WhatsAppInbox.tsx'), 'utf8');
const whatsAppRealtimeProviderSource = readFileSync(
  join(currentDir, 'WhatsAppRealtimeProvider.tsx'),
  'utf8',
);
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
    deleted: false,
    deletedAt: null,
    deletedForEveryone: false,
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

  it('wires the contact info drawer with references and existing PIX flow actions', () => {
    expect(whatsAppInboxSource).toContain('conversation-contact-name-button');
    expect(whatsAppInboxSource).toContain('conversation-contact-drawer');
    expect(whatsAppInboxSource).toContain("event.key === 'Escape'");
    expect(whatsAppInboxSource).toContain('listReceivables({');
    expect(whatsAppInboxSource).toContain('clientReferenceId: reference.id');
    expect(whatsAppInboxSource).toContain('pageSize: 20');
    expect(whatsAppInboxSource).not.toContain('clientId: conversation.client.id');
    expect(whatsAppInboxSource).not.toContain('pageSize: 100');
    expect(whatsAppInboxSource).toContain('ConversationReferenceList');
    expect(whatsAppInboxSource).toContain('ConversationReferenceCard');
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
    expect(whatsAppInboxSource).toContain(
      "onOpenClient(clientId, { tab: 'receivables', receivable })",
    );
    expect(whatsAppInboxSource).toContain('Abrir cliente');
    expect(globalStylesSource).toContain('.conversation-contact-drawer');
    expect(globalStylesSource).toContain('.conversation-reference-card');
    expect(globalStylesSource).toContain('width: min(430px, calc(100vw - 24px))');
    expect(globalStylesSource).toContain('width: min(100vw, 440px)');
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

  it('keeps message actions outside the bubble so short messages stay compact', () => {
    expect(whatsAppInboxSource).toContain('className={`conversation-message-actions');
    expect(whatsAppInboxSource).toContain('{outbound ? actionRail : null}');
    expect(whatsAppInboxSource).toContain('{!outbound ? actionRail : null}');
    expect(globalStylesSource).toContain('.conversation-message-actions');
    expect(globalStylesSource).toContain('flex: 0 0 auto;');
    expect(globalStylesSource).toContain('pointer-events: none;');
    expect(globalStylesSource).toContain('.conversation-bubble-row.outbound .conversation-bubble');
    expect(globalStylesSource).toContain('.conversation-bubble-row.inbound .conversation-bubble');
    expect(globalStylesSource).toContain('max-width: min(88%, calc(100% - 100px));');
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
});
