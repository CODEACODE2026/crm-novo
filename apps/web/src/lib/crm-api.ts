import { buildApiUrl } from './api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let unauthorizedRedirectInFlight = false;

export function resetUnauthorizedRedirectForTests() {
  unauthorizedRedirectInFlight = false;
}

function redirectToLoginOnce() {
  if (unauthorizedRedirectInFlight || window.location.pathname === '/login') {
    return;
  }

  unauthorizedRedirectInFlight = true;
  window.location.assign('/login');
}

export type ClientStatus = 'PENDENTE_PAGAMENTO' | 'ATIVO' | 'INATIVO' | 'CANCELADO';

export interface Plan {
  id: string;
  name: string;
  durationMonths: number;
  defaultValue: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  phoneE164?: string | null;
  phoneCountry?: string | null;
  email: string | null;
  reference: string;
  planId: string;
  recurringValue: string;
  dueDate: string;
  billingNoticeDays: number;
  preferredPixProvider: PaymentProviderCode | null;
  notes: string | null;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
  plan: Plan;
  references?: ClientReference[];
  events?: ClientEvent[];
  statusHistory?: ClientStatusHistory[];
  renewals?: Renewal[];
  receivables?: Receivable[];
  recoveryCampaigns?: RecoveryCampaign[];
  messageDispatches?: ClientMessageDispatch[];
  initialActivation?: InitialActivationResult | null;
  referralReceived?: ClientReferralReceived | null;
  referralsReceived?: ClientReferralReceived[];
  referralsMade?: ClientReferralsMade;
}

export interface ClientReference {
  id: string;
  clientId: string;
  reference: string;
  planId: string;
  recurringValue: string;
  dueDate: string;
  billingAnchorDay: number;
  billingNoticeDays: number;
  internationalBillingEnabled?: boolean;
  status: ClientStatus;
  notes: string | null;
  inactivatedAt: string | null;
  inactivationReason: string | null;
  inactivatedByUserId: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  canceledByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  plan: Plan;
}

export interface InitialActivationResult {
  initialReceivableId?: string | null;
  paymentIntentId?: string | null;
  messageDispatchId?: string | null;
  warning?: string | null;
  message?: string | null;
  reusedApproval?: boolean;
}

export interface ClientEvent {
  id: string;
  type:
    | 'CLIENT_CREATED'
    | 'CLIENT_UPDATED'
    | 'STATUS_CHANGED'
    | 'CLIENT_RENEWED'
    | 'CLIENT_REFERENCE_REACTIVATION_REQUESTED'
    | 'CLIENT_REFERENCE_REACTIVATED'
    | 'RENEWAL_REVERTED'
    | 'PAYMENT_REGISTERED'
    | 'RECEIVABLE_CANCELED'
    | 'FINANCIAL_TRANSACTION_CREATED'
    | 'WHATSAPP_MESSAGE_SENT'
    | 'PIX_PAYMENT_INTENT_CREATED'
    | 'PIX_PAYMENT_STATUS_UPDATED'
    | 'RECOVERY_CAMPAIGN_STARTED'
    | 'RECOVERY_CAMPAIGN_CANCELED'
    | 'RECOVERY_CAMPAIGN_COMPLETED'
    | 'REFERRAL_CREATED'
    | 'REFERRAL_QUALIFIED'
    | 'REFERRAL_REWARD_APPLIED'
    | 'REFERRAL_CANCELED';
  title: string;
  description: string | null;
  createdAt: string;
}

export interface ClientStatusHistory {
  id: string;
  previousStatus: ClientStatus;
  newStatus: ClientStatus;
  reason: string | null;
  createdAt: string;
}

export interface ClientMessageDispatch {
  id: string;
  clientId?: string | null;
  clientReferenceId?: string | null;
  receivableId?: string | null;
  phone: string;
  body: string;
  renderedContent: string | null;
  origin: 'MANUAL' | 'INITIAL_ACTIVATION' | 'BILLING' | 'RECOVERY';
  status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELED' | 'IGNORED';
  scheduledFor: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  itemCount?: number;
  totalAmount?: string | null;
  dueDateLabel?: string | null;
  items?: Array<{
    id: string;
    receivableId: string;
    clientReferenceId: string;
    reference: string;
    amount: string;
    dueDate: string;
    status: ReceivableStatus;
  }>;
  client?: Pick<Client, 'id' | 'name' | 'reference' | 'status'> & { planName?: string | null };
  clientReference?: Pick<ClientReference, 'id' | 'reference' | 'status'> & {
    planName?: string | null;
  };
}

export type ReceivableStatus = 'PENDENTE' | 'PAGO' | 'CANCELADO';
export type ReceivablePurpose = 'RENEWAL' | 'INITIAL_ACTIVATION' | 'REACTIVATION' | 'MANUAL_CHARGE';
export type ReceivableDisplayStatus = ReceivableStatus | 'VENCIDO';
export type FinancialTransactionType = 'ENTRADA' | 'SAIDA';
export type FinancialTransactionOrigin = 'RECEIVABLE_PAYMENT' | 'MANUAL' | 'LEGACY_IMPORT';
export type FinancialPaymentMethod = 'PIX' | 'BOLETO' | 'CARTAO' | 'TRANSFERENCIA';
export type PaymentIntentStatus =
  | 'CREATED'
  | 'WAITING_PAYMENT'
  | 'SUPERSEDED'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELED'
  | 'FAILED'
  | 'REFUNDED';
export type PaymentProviderCode = 'MOCK' | 'FASTFLOW' | 'FASTPIX' | 'FASTPAY' | 'DEPIX';
export type ConfigurablePaymentProvider = Extract<
  PaymentProviderCode,
  'FASTFLOW' | 'FASTPIX' | 'FASTPAY'
>;
export type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'CANCELED';
export type ReferralRewardType = 'FREE_MONTH' | 'CREDIT' | 'CUSTOM';
export type ReferralOrigin = 'AUTOMATIC' | 'MANUAL';
export type ReferralHistoryAction =
  'CREATED' | 'QUALIFIED' | 'UPDATED' | 'CANCELED' | 'REWARD_APPLIED';
export type RenewalStatus = 'ACTIVE' | 'REVERTED';

export interface Renewal {
  id: string;
  clientId: string;
  clientReferenceId?: string;
  planId: string;
  planName: string;
  durationMonths: number;
  previousDueDate: string;
  newDueDate: string;
  amount: string;
  status?: RenewalStatus;
  createdAt: string;
  receivable?: Receivable | null;
}

export interface Receivable {
  sourceKind?: 'RECEIVABLE' | 'LEGACY_IMPORT';
  sourceId?: string;
  id: string;
  clientId: string | null;
  clientReferenceId?: string | null;
  renewalId: string | null;
  purpose: ReceivablePurpose;
  description: string;
  amount: string;
  dueDate: string;
  status: ReceivableStatus;
  displayStatus: ReceivableDisplayStatus;
  paidAt: string | null;
  canceledAt: string | null;
  cancelReason?: string | null;
  paymentTransactionId?: string | null;
  paymentIntents?: PaymentIntent[];
  activePix?: PaymentIntent | null;
  paymentMethod?: FinancialPaymentMethod | null;
  origin?: FinancialTransactionOrigin;
  category?: FinancialCategory | null;
  originalDescription?: string;
  notes?: string | null;
  payerName?: string | null;
  payerPhone?: string | null;
  payerPhoneMasked?: string | null;
  payerPhoneNormalized?: string | null;
  financialCategoryId?: string | null;
  manualChargeIdempotencyKey?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<Client, 'id' | 'name' | 'reference' | 'preferredPixProvider'> | null;
  clientReference?:
    | (Pick<ClientReference, 'id' | 'reference' | 'status'> & {
        planName?: string;
      })
    | null;
}

export interface PaymentIntent {
  id: string;
  receivableId: string | null;
  paymentGroupId?: string | null;
  provider: PaymentProviderCode;
  providerTransactionId: string | null;
  externalStatus: string | null;
  externalDepixId: string | null;
  blockchainTxId: string | null;
  status: PaymentIntentStatus;
  amount: string;
  pixCopyPaste: string | null;
  qrCodeData: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  lastSyncAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivePixConflictReceivable {
  id: string;
  description: string;
  amount: string;
  dueDate: string;
  status: ReceivableStatus;
  clientReferenceId: string;
  reference: string;
}

export interface ActivePixConflictPayload {
  message: string;
  code: 'ACTIVE_PIX_CONFLICT';
  activePix: {
    type: 'INDIVIDUAL' | 'GROUPED';
    matchesSelectedGroup: boolean;
    paymentIntent: PaymentIntent;
    receivable?: ActivePixConflictReceivable;
    paymentGroup?: {
      id: string;
      itemCount: number;
      totalAmount: string;
      items: ActivePixConflictReceivable[];
    } | null;
  };
}

export interface PixWhatsAppSendResult {
  success: boolean;
  messageDispatchId: string;
  dispatchId?: string;
  status?: ClientMessageDispatch['status'];
  phoneMasked?: string;
  createdAt?: string;
  sentAt: string | null;
  destinationMasked: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  reused?: boolean;
  idempotent?: boolean;
}

export interface PaymentIntentPixCopyResult {
  available: boolean;
  pixCopyPaste: string | null;
  status: PaymentIntentStatus;
  expiresAt: string | null;
  isExpired: boolean;
}

export interface WhatsAppQuickReply {
  id: string;
  label: string;
  text: string;
}

export interface WhatsAppQuickReplyAdmin extends WhatsAppQuickReply {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppQuickReplyPayload {
  label: string;
  text: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PixReconciliationPreview {
  adoptable: boolean;
  provider: PaymentProviderCode;
  providerTransactionId: string;
  receivable: {
    id: string;
    clientId: string;
    clientName: string;
    status: ReceivableStatus;
    amount: string;
    paidAt: string | null;
  };
  external: {
    provider: PaymentProviderCode;
    providerTransactionId: string;
    status: PaymentIntentStatus;
    externalStatus: string | null;
    amount: string;
    expiresAt: string | null;
    paidAt: string | null;
    hasPixCopyPaste: boolean;
    hasQrCodeData: boolean;
    externalDepixId: string | null;
    blockchainTxId: string | null;
  } | null;
  impact: string[];
  blockers: Array<{ code: string; message: string }>;
  warning: string;
}

export interface PixReplacementPreview {
  replaceable: boolean;
  provider: PaymentProviderCode;
  receivable: {
    id: string;
    clientId: string;
    clientName: string;
    status: ReceivableStatus;
    amount: string;
    paidAt: string | null;
  };
  currentIntent: PaymentIntent | null;
  warning: string;
  impact: string[];
  blockers: Array<{ code: string; message: string }>;
}

export interface PixReplacementRecoveryPreview {
  recoverable: boolean;
  provider: PaymentProviderCode;
  providerTransactionId: string;
  receivable: PixReconciliationPreview['receivable'];
  currentIntent: PaymentIntent | null;
  expectedCurrentIntentId: string | null;
  external: PixReconciliationPreview['external'];
  impact: string[];
  blockers: Array<{ code: string; message: string }>;
  warning: string;
}

export interface PaymentGroupPaymentResult {
  id: string;
  clientId: string;
  status: string;
  totalAmount: string;
  paidAt: string | null;
  receivableIds: string[];
  transactionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferralClientSummary {
  id: string;
  name: string;
  reference: string;
  phone?: string;
  phoneNormalized?: string;
  status: ClientStatus;
  dueDate?: string;
  billingAnchorDay?: number;
}

export interface Referral {
  id: string;
  referredClientId: string;
  referredClientReferenceId: string | null;
  referrerClientId: string;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
  origin: ReferralOrigin;
  rewardValue: string | null;
  rewardDescription: string | null;
  qualifiedAt: string | null;
  appliedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  appliedPreviousDueDate: string | null;
  appliedNewDueDate: string | null;
  createdAt: string;
  updatedAt: string;
  referredClient: ReferralClientSummary;
  referredClientReference: ReferralTargetReference | null;
  referrerClient: ReferralClientSummary;
  rewardLabel: string;
  history?: Array<{
    id: string;
    action: ReferralHistoryAction;
    actor: { id: string; name: string } | null;
    reason: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    createdAt: string;
  }>;
  rewardPreview: {
    referrerStatus: ClientStatus;
    selectedClientReferenceId?: string | null;
    selectedReference?: string | null;
    currentDueDate: string | null;
    newDueDate: string | null;
    requiresClientReferenceSelection?: boolean;
  } | null;
}

export type ReferralTargetReference = Pick<ClientReference, 'id' | 'reference' | 'status'>;

export interface ClientReferralReceived {
  id: string;
  referredClientReferenceId: string | null;
  referrerClientId: string;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
  rewardValue: string | null;
  rewardDescription: string | null;
  qualifiedAt: string | null;
  appliedAt: string | null;
  canceledAt: string | null;
  referredClientReference: ReferralTargetReference | null;
  referrerClient: Pick<ReferralClientSummary, 'id' | 'name' | 'reference' | 'status'>;
}

export interface ClientReferralsMade {
  total: number;
  qualified: number;
  rewarded: number;
  items: Array<{
    id: string;
    referredClientId: string;
    referredClientReferenceId: string | null;
    status: ReferralStatus;
    rewardType: ReferralRewardType;
    rewardValue: string | null;
    rewardDescription: string | null;
    qualifiedAt: string | null;
    appliedAt: string | null;
    referredClientReference: ReferralTargetReference | null;
    referredClient: Pick<ReferralClientSummary, 'id' | 'name' | 'reference' | 'status'>;
  }>;
}

export interface ReferralSummary {
  total: number;
  pending: number;
  qualified: number;
  rewarded: number;
  canceled: number;
  awaitingReward: number;
}

export interface PaymentProviderCredentialStatus {
  id?: string;
  provider: ConfigurablePaymentProvider;
  name?: string;
  configured: boolean;
  active?: boolean;
  tokenMask?: string;
  webhookSecretConfigured?: boolean;
  webhookSecretMask?: string | null;
  webhookConfiguredAt?: string | null;
  webhookUrl?: string | null;
  webhookRegisteredAt?: string | null;
  defaultForPix?: boolean;
  validatedAt?: string | null;
  lastValidationStatus?: string | null;
  status: 'NAO_CONFIGURADO' | 'CONFIGURADO' | 'VALIDO' | 'ERRO';
  providerLabel?: string | null;
  partner?: { id?: string; name?: string; email?: string } | null;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: FinancialTransactionType;
  active: boolean;
}

export interface FinancialTransaction {
  id: string;
  type: FinancialTransactionType;
  origin: FinancialTransactionOrigin;
  paymentMethod: FinancialPaymentMethod | null;
  categoryId: string;
  clientId: string | null;
  clientReferenceId?: string | null;
  receivableId: string | null;
  description: string;
  amount: string;
  transactionDate: string;
  notes: string | null;
  category: FinancialCategory;
  client: Pick<Client, 'id' | 'name' | 'reference'> | null;
  clientReference: Pick<ClientReference, 'id' | 'reference'> | null;
}

export interface PaginatedReceivables {
  items: Receivable[];
  pagination: PaginatedClients['pagination'];
}

export interface PaginatedFinancialTransactions {
  items: FinancialTransaction[];
  pagination: PaginatedClients['pagination'];
}

export interface ReceivablesSummary {
  pendingAmount: string;
  paidAmount: string;
  overdueAmount: string;
  canceledAmount: string;
}

export interface PaymentIntentsSummary {
  total: number;
}

export interface FinancialSummary {
  startDate: string;
  endDate: string;
  received: string;
  receivablePending: string;
  receivableOverdue: string;
  entries: string;
  expenses: string;
  balance: string;
}

export interface DashboardSummary {
  period: {
    startDate: string;
    endDate: string;
    label: string;
  };
  today: string;
  clients: {
    active: number;
    inactive: number;
    canceled: number;
    newInPeriod: number;
    distribution: Array<{ status: ClientStatus; total: number }>;
  };
  dueDates: {
    dueToday: number;
    upcomingSevenDays: number;
    overdueClients: number;
  };
  finance: FinancialSummaryFields;
  renewals: {
    count: number;
    amount: string;
  };
  pending: {
    counts: {
      overdueReceivables: number;
      waitingPix: number;
      failedPix: number;
      billingScheduledToday: number;
      billingFailed: number;
      activeRecoveryCampaigns: number;
      failedRecoveryDispatches: number;
      pendingWaitlistContacts: number;
      qualifiedReferralsAwaitingReward: number;
    };
    items: Array<{
      label: string;
      count: number;
      action: 'finance' | 'billing' | 'automations' | 'waitlist' | 'clients';
    }>;
  };
  charts: {
    grouping: 'day' | 'month';
    cashflow: Array<{ period: string; entries: string; expenses: string }>;
    received: Array<{ period: string; amount: string }>;
    clients: Array<{ label: string; value: number }>;
  };
  lists: {
    dueToday: DashboardClientDue[];
    upcomingDue: DashboardClientDue[];
    overdueReceivables: DashboardOverdueReceivable[];
    recentActivity: DashboardActivity[];
  };
}

export type FinancialSummaryFields = Pick<
  FinancialSummary,
  'received' | 'receivablePending' | 'receivableOverdue' | 'entries' | 'expenses' | 'balance'
>;

export interface DashboardClientDue {
  id: string;
  clientReferenceId: string;
  name: string;
  reference: string;
  planName: string;
  recurringValue: string;
  dueDate: string;
  status: ClientStatus;
}

export interface DashboardOverdueReceivable {
  id: string;
  clientId: string;
  clientName: string;
  clientReference: string;
  description: string;
  dueDate: string;
  amount: string;
  daysOverdue: number;
}

export interface DashboardActivity {
  id: string;
  type: string;
  title: string;
  description: string | null;
  createdAt: string;
  client: Pick<Client, 'id' | 'name' | 'reference'>;
}

export type WhatsAppConnectionStatus =
  'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED' | 'CONNECTED' | 'ERROR';

export interface WhatsAppConnection {
  id: string;
  name: string;
  provider: 'KIRAGO';
  providerUserId: string | null;
  phone: string | null;
  status: WhatsAppConnectionStatus;
  connected: boolean;
  loggedIn: boolean;
  webhookConfigured: boolean;
  lastStatusAt: string | null;
  connectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDispatch {
  id: string;
  clientId: string | null;
  receivableId?: string | null;
  templateId?: string | null;
  whatsAppConnectionId: string | null;
  phone: string;
  body: string;
  renderedContent?: string | null;
  origin: 'MANUAL' | 'INITIAL_ACTIVATION' | 'BILLING' | 'RECOVERY';
  status: 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELED' | 'IGNORED';
  requestId: string;
  idempotencyKey?: string | null;
  scheduledFor?: string | null;
  nextAttemptAt?: string | null;
  attempts?: number;
  providerMessageId: string | null;
  errorCode?: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  client:
    (Pick<Client, 'id' | 'name' | 'reference' | 'status'> & { planName?: string | null }) | null;
  clientReference?: Pick<ClientReference, 'id' | 'reference' | 'status'> | null;
  receivable?: Pick<Receivable, 'id' | 'amount' | 'dueDate' | 'status'> | null;
  template?: {
    id: string;
    name: string;
    type: 'BILLING_DUE' | 'BILLING_DUE_GROUPED';
    active: boolean;
  } | null;
  itemCount?: number;
  totalAmount?: string | null;
  dueDateLabel?: string | null;
  items?: Array<{
    id: string;
    receivableId: string;
    clientReferenceId: string;
    reference: string;
    amount: string;
    dueDate: string;
    status: Receivable['status'];
  }>;
  connection: Pick<WhatsAppConnection, 'id' | 'name' | 'provider'> | null;
}

export type WhatsAppConversationStatus = 'OPEN' | 'RESOLVED';
export type WhatsAppConversationLabelColor =
  'BLUE' | 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'PURPLE' | 'PINK' | 'TEAL' | 'GRAY';
export interface WhatsAppConversationLabel {
  id: string;
  name: string;
  color: WhatsAppConversationLabelColor;
}
export interface WhatsAppConversationLabelAdmin extends WhatsAppConversationLabel {
  whatsAppConnectionId: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: { assignments: number };
}
export type WhatsAppAttendanceStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
export interface WhatsAppAttendanceAutoReplyContext {
  sent: boolean;
  count?: number;
  lastSentAt: string | null;
  mode: WhatsAppAutoReplyMode | null;
  executionId?: string | null;
}
export interface WhatsAppAttendanceSummary {
  id: string;
  status: WhatsAppAttendanceStatus;
  openedAt: string;
  firstAgentReplyAt: string | null;
  inboundMessagesCount: number;
  outboundMessagesCount: number;
  autoReply: WhatsAppAttendanceAutoReplyContext;
}
export interface WhatsAppAttendance extends WhatsAppAttendanceSummary {
  conversationId: string;
  whatsAppConnectionId: string;
  clientId: string | null;
  resolvedAt: string | null;
  category: { id: string; name: string; color: WhatsAppConversationLabelColor } | null;
  resolutionNote: string | null;
  resolvedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}
export interface WhatsAppAttendanceCategory {
  id: string;
  whatsAppConnectionId: string;
  name: string;
  systemKey: string | null;
  color: WhatsAppConversationLabelColor;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: { attendances: number };
}
export interface WhatsAppAttendanceAnalytics {
  period: {
    from: string;
    to: string;
    timezone: 'America/Sao_Paulo';
    granularity: 'day' | 'month';
  };
  summary: {
    totalAttendances: number;
    pending: number;
    inProgress: number;
    resolved: number;
    resolvedToday: number;
    resolutionRate: number;
    firstResponseAvgSeconds: number;
    resolutionAvgSeconds: number;
    receivedMessages: number;
    sentManualMessages: number;
    pendingWithAutoReply: number;
    attendancesWithAutoReply: number;
    autoRepliesSentInPeriod: number;
    autoReplyCoverageRate: number;
  };
  statusDistribution: Array<{
    status: WhatsAppAttendanceStatus;
    count: number;
    percentage: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    name: string;
    color: WhatsAppConversationLabelColor;
    count: number;
    percentage: number;
  }>;
  topClients: Array<{
    clientId: string;
    clientName: string;
    phone: string;
    attendancesCount: number;
    resolvedCount: number;
    avgResolutionSeconds: number;
  }>;
  dailyVolume: Array<{ period: string; opened: number; resolved: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
  weekdayDistribution: Array<{ weekday: number; count: number }>;
  waitingFirstResponse: WhatsAppAttendanceAnalyticsOpenItem[];
  oldestOpenAttendances: WhatsAppAttendanceAnalyticsOpenItem[];
}
export interface WhatsAppAttendanceAnalyticsOpenItem {
  attendanceId: string;
  conversationId: string;
  clientId: string | null;
  clientName: string;
  phone: string;
  status: Exclude<WhatsAppAttendanceStatus, 'RESOLVED'>;
  openedAt: string;
  ageSeconds: number;
  inboundMessagesCount: number;
  outboundMessagesCount: number;
  hasAutoReply: boolean;
  lastAutoReplyAt: string | null;
  autoReplyMode: WhatsAppAutoReplyMode | null;
}
export type WhatsAppConversationMessageDirection = 'INBOUND' | 'OUTBOUND';
export type WhatsAppConversationMessageStatus =
  'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type WhatsAppConversationMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'DOCUMENT'
  | 'VIDEO'
  | 'STICKER'
  | 'LOCATION'
  | 'CONTACT'
  | 'CONTACTS'
  | 'BUTTON'
  | 'UNKNOWN';

export interface WhatsAppSharedContact {
  displayName: string | null;
  phones: string[];
}

export interface WhatsAppConversation {
  id: string;
  whatsAppConnectionId: string;
  instanceName: string | null;
  provider: 'KIRAGO';
  externalInstanceId: string | null;
  client: Pick<Client, 'id' | 'name' | 'phone' | 'phoneNormalized' | 'phoneE164'> | null;
  displayName: string;
  contactName: string | null;
  phone: string;
  phoneNormalized: string;
  phoneE164?: string | null;
  phoneCountry?: string | null;
  status: WhatsAppConversationStatus;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  needsManualFollowUp: boolean;
  lastAutoReplyAt: string | null;
  labels: WhatsAppConversationLabel[];
  activeAttendance?: WhatsAppAttendanceSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversationSummary {
  totalUnreadConversations: number;
  totalUnreadMessages: number;
}

export interface WhatsAppSavedSticker {
  id: string;
  mimeType: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveWhatsAppStickerResult {
  sticker: WhatsAppSavedSticker;
  alreadyExisted: boolean;
}

export interface WhatsAppConversationAvatar {
  available: boolean;
  url: string | null;
}

export interface WhatsAppConversationMessage {
  id: string;
  direction: WhatsAppConversationMessageDirection;
  type: WhatsAppConversationMessageType;
  text: string | null;
  status: WhatsAppConversationMessageStatus;
  sentAt: string | null;
  editedAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  deleted: boolean;
  deletedAt: string | null;
  deletedForEveryone: boolean;
  isFromMe: boolean;
  isAutoReply: boolean;
  isForwarded?: boolean;
  providerMessageId: string | null;
  replyToMessageId: string | null;
  replyToProviderMessageId: string | null;
  quotedText: string | null;
  replyTo: {
    id: string;
    direction: WhatsAppConversationMessageDirection;
    type: WhatsAppConversationMessageType;
    text: string | null;
    mediaFileName: string | null;
    deleted: boolean;
    deletedAt: string | null;
    deletedForEveryone: boolean;
  } | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaSizeBytes: number | null;
  mediaDurationSeconds: number | null;
  contacts: WhatsAppSharedContact[];
  reactions: WhatsAppMessageReaction[];
  mediaAvailable: boolean;
  retryAction: 'RETRY' | 'SELECT_FILE_AGAIN' | 'RECORD_AGAIN' | null;
  messageDispatchId: string | null;
  pixContext?: {
    paymentIntentId: string;
    amount: string | null;
    buttonLabel: string;
  } | null;
  createdAt: string;
}

export type WhatsAppAutoReplyMode = 'AWAY' | 'SERVICE_UNAVAILABLE' | 'CUSTOM';
export type WhatsAppAutoReplyAudience = 'ALL' | 'LINKED_CLIENTS' | 'UNLINKED_CONTACTS';

export interface WhatsAppAutoReplyConfig {
  id: string | null;
  whatsAppConnectionId: string;
  connectionName: string;
  connectionStatus: WhatsAppConnectionStatus;
  enabled: boolean;
  mode: WhatsAppAutoReplyMode;
  message: string;
  cooldownMinutes: number;
  audience: WhatsAppAutoReplyAudience;
  startsAt: string | null;
  endsAt: string | null;
  timezone: 'America/Sao_Paulo';
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateWhatsAppAutoReplyPayload {
  enabled: boolean;
  mode: WhatsAppAutoReplyMode;
  message: string;
  cooldownMinutes: number;
  audience: WhatsAppAutoReplyAudience;
  startsAt: string | null;
  endsAt: string | null;
}

export interface WhatsAppMessageReaction {
  id: string;
  emoji: string;
  reactorKey: string;
  isFromMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedWhatsAppConversations {
  items: WhatsAppConversation[];
  pagination: PaginatedClients['pagination'];
  summary: WhatsAppConversationSummary;
}

export interface PaginatedWhatsAppConversationMessages {
  items: WhatsAppConversationMessage[];
  pagination: {
    page: number;
    pageSize?: number;
    limit?: number;
    total: number | null;
    totalPages: number | null;
    hasMore?: boolean;
    nextPage?: number | null;
    nextCursor?: WhatsAppConversationMessagesCursor | null;
  };
}

export interface WhatsAppConversationMessagesCursor {
  createdAt: string;
  id: string;
}

export interface WhatsAppMessageSearchResult {
  message: WhatsAppConversationMessage;
  conversation: {
    id: string;
    displayName: string;
    phone: string;
    phoneNormalized: string;
    client: Pick<Client, 'id' | 'name'> | null;
  };
  snippet: string;
}

export interface PaginatedWhatsAppMessageSearchResults {
  items: WhatsAppMessageSearchResult[];
  pagination: PaginatedClients['pagination'];
}

export interface WhatsAppMessageContext {
  targetId: string;
  items: WhatsAppConversationMessage[];
  pagination: PaginatedWhatsAppConversationMessages['pagination'] & {
    hasOlder: boolean;
    hasNewer: boolean;
  };
}

export interface StartWhatsAppConversationResult {
  conversation: WhatsAppConversation;
  message: WhatsAppConversationMessage;
  reusedConversation: boolean;
  clientLinked: boolean;
}

export type WhatsAppRealtimeEventType =
  'conversation.presence' | 'conversation.updated' | 'message.created' | 'message.updated';

export interface WhatsAppRealtimeEvent {
  type: WhatsAppRealtimeEventType;
  conversationId: string;
  direction?: WhatsAppConversationMessageDirection;
  messageId?: string;
  occurredAt: string;
  state?: 'typing' | 'recording_audio' | null;
}

export interface BillingSummary {
  scheduled: number;
  sent: number;
  failed: number;
  ignoredOrCanceled: number;
  scheduledToday?: number;
  sentToday?: number;
  failedToday?: number;
  next?: MessageDispatch[];
  cycleIssues?: ReceivableCycleIssue[];
  settings?: BillingAutomationSettings;
}

export interface BillingDispatchSummary {
  scheduled: number;
  sent: number;
  failed: number;
  ignoredOrCanceled: number;
  internationalBlocked: number;
  internationalBlockedReasons: Array<{ code: string; message: string; count: number }>;
}

export type ReceivableCycleCode =
  | 'OK'
  | 'MISSING_RECEIVABLE'
  | 'RECEIVABLE_DIVERGENT'
  | 'RECEIVABLE_PAID'
  | 'RECEIVABLE_CANCELED'
  | 'REFERENCE_NOT_BILLABLE';

export interface ReceivableCycleIssue {
  clientId: string;
  clientName: string;
  clientReferenceId: string;
  reference: string;
  planName: string;
  amount: string;
  dueDate: string;
  code: ReceivableCycleCode;
  reason: string;
  receivable: {
    id: string;
    dueDate: string;
    status: 'PENDENTE' | 'PAGO' | 'CANCELADO';
    amount: string;
    purpose: ReceivablePurpose;
  } | null;
}

export interface ReceivableCycleReport {
  counts: Record<ReceivableCycleCode, number>;
  items: ReceivableCycleIssue[];
}

export type LegacyImportClassification =
  | 'READY_CREATE'
  | 'READY_UPDATE'
  | 'UNCHANGED'
  | 'POSSIBLE_MATCH'
  | 'SKIPPED_NOT_ACTIVE'
  | 'CONFLICT'
  | 'INVALID';

export interface LegacyImportCandidateMatch {
  field: 'reference' | 'phone' | 'email' | 'name';
  clientId: string;
  clientName: string;
  clientReferenceId?: string | null;
  reference?: string | null;
}

export interface LegacyImportPreviewRow {
  index: number;
  legacyClientId: string | null;
  name: string | null;
  reference: string | null;
  status: string | null;
  normalizedStatus: ClientStatus | null;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  plan: { id: string | null; name: string | null; durationMonths: number } | null;
  recurringValue: string | null;
  dueDate: string | null;
  billingAnchorDay: number | null;
  billingNoticeDays: number | null;
  legacyCreatedAt: string | null;
  legacyUpdatedAt: string | null;
  legacyDisabledAt: string | null;
  payloadHash: string | null;
  classification: LegacyImportClassification;
  errors: string[];
  warnings: string[];
  candidateMatches: LegacyImportCandidateMatch[];
}

export interface LegacyImportPreview {
  summary: {
    total: number;
    readyCreate: number;
    readyCreateActive: number;
    readyCreateCanceled: number;
    readyUpdate: number;
    unchanged: number;
    possibleMatch: number;
    notActive: number;
    conflict: number;
    invalid: number;
  };
  ignoredFields: string[];
  rows: LegacyImportPreviewRow[];
}

export type LegacyPaymentPreviewClassification =
  | 'READY_PAID_HISTORY'
  | 'UNCHANGED'
  | 'CLIENT_NOT_IMPORTED'
  | 'PENDING_NOT_SUPPORTED'
  | 'UNSUPPORTED'
  | 'CONFLICT'
  | 'INVALID';

export interface LegacyPaymentPreviewRow {
  index: number;
  legacyPaymentId: string | null;
  legacyClientId: string | null;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  clientName: string | null;
  reference: string | null;
  legacyStatus: string | null;
  transactionType: string | null;
  dataCriado: string | null;
  dataPagamento: string | null;
  amount: string | null;
  transactionDate: string | null;
  paymentMethod: FinancialPaymentMethod | null;
  observation: string | null;
  category: { id: string; name: string; type: FinancialTransactionType } | null;
  receivableId: null;
  classification: LegacyPaymentPreviewClassification;
  errors: string[];
  warnings: string[];
  payloadHash: string | null;
}

export interface LegacyPaymentPreview {
  summary: {
    total: number;
    readyPaidHistory: number;
    unchanged: number;
    clientNotImported: number;
    pending: number;
    unsupported: number;
    conflict: number;
    invalid: number;
  };
  hashFields: string[];
  rows: LegacyPaymentPreviewRow[];
}

export type LegacyCutoverPreviewClassification =
  'READY' | 'UNCHANGED' | 'CONFLICT' | 'INVALID' | 'HISTORICAL_CANCELED' | 'SKIPPED_NOT_ACTIVE';

export interface LegacyCutoverPreviewRow {
  legacyClientId: string;
  crmClientId: string | null;
  crmClientReferenceId: string | null;
  clientName: string | null;
  reference: string | null;
  clientStatus: ClientStatus | null;
  referenceStatus: ClientStatus | null;
  planId: string | null;
  planName: string | null;
  amount: string | null;
  dueDate: string | null;
  billingAnchorDay: number | null;
  billingNoticeDays: number | null;
  purpose: 'RENEWAL';
  existingReceivable: {
    id: string;
    amount: string;
    dueDate: string;
    purpose: ReceivablePurpose;
    status: ReceivableStatus;
  } | null;
  scheduledForEstimated: string | null;
  dispatchReady: boolean;
  dispatchWarnings: string[];
  classification: LegacyCutoverPreviewClassification;
  errors: string[];
  warnings: string[];
}

export interface LegacyCutoverPreview {
  mode: 'READ_ONLY';
  unit: 'CLIENT_REFERENCE';
  purpose: 'RENEWAL';
  summary: {
    total: number;
    ready: number;
    unchanged: number;
    historicalCanceled: number;
    notActive: number;
    conflict: number;
    invalid: number;
    warnings: number;
    noticeDatePassed: number;
    dueToday: number;
    dispatchNotReady: number;
  };
  metadata: {
    unique: string[];
    billingSchedulerControlledBy: string;
    billingSchedulerStatus: 'DISABLED' | 'ENABLED';
    recoverySchedulerControlledBy: string;
    recoverySchedulerStatus: 'DISABLED' | 'ENABLED';
    safety: string;
  };
  rows: LegacyCutoverPreviewRow[];
}

export interface LegacyCutoverActivateResult {
  mode: 'CONTROLLED_ACTIVATION';
  unit: 'CLIENT_REFERENCE';
  purpose: 'RENEWAL';
  summary: {
    requested: number;
    created: number;
    unchanged: number;
    skipped: number;
    failed: number;
    warnings: number;
  };
  rows: Array<{
    legacyClientId: string | null;
    crmClientId: string | null;
    crmClientReferenceId: string | null;
    reference: string | null;
    result: 'CREATED' | 'UNCHANGED' | 'SKIPPED' | 'FAILED';
    receivableId?: string;
    code?: string;
    message?: string;
    warnings: string[];
  }>;
}

export type LegacyImportPlanCycle = 'MENSAL' | 'BIMESTRAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
export type LegacyImportPlanMapping = Partial<Record<LegacyImportPlanCycle, string>>;

export interface LegacyImportResultRow {
  legacyClientId: string | null;
  result: 'IMPORTED' | 'SKIPPED' | 'FAILED';
  crmClientId?: string;
  crmClientReferenceId?: string;
  code: string;
  message: string;
}

export interface LegacyImportResult {
  summary: {
    requested: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  rows: LegacyImportResultRow[];
}

export interface LegacyPaymentImportResultRow {
  legacyPaymentId: string | null;
  legacyClientId: string | null;
  result: 'IMPORTED' | 'SKIPPED' | 'FAILED';
  financialTransactionId?: string;
  code: string;
  message: string;
}

export interface LegacyPaymentImportResult {
  summary: {
    requested: number;
    imported: number;
    skipped: number;
    failed: number;
  };
  rows: LegacyPaymentImportResultRow[];
}

export interface ReceivableCyclePreview {
  allowed: boolean;
  status: {
    code: ReceivableCycleCode;
    reason: string;
  };
  preview: {
    clientReferenceId: string;
    reference: string;
    amount: string;
    dueDate: string;
    purpose: 'RENEWAL';
    description: string;
  } | null;
}

export interface BillingAutomationSettings {
  id: string;
  enabled: boolean;
  sendTime: string;
  sendIntervalSeconds: number;
  timezone: 'America/Sao_Paulo';
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryAutomationStepSettings {
  stepNumber: number;
  enabled: boolean;
  offsetDays: number;
  templateType: MessageTemplate['type'];
}

export interface RecoveryAutomationSettings {
  id: string;
  enabled: boolean;
  sendTime: string;
  timezone: 'America/Sao_Paulo';
  sendIntervalSeconds: number;
  steps: RecoveryAutomationStepSettings[];
  day3Enabled: boolean;
  day3OffsetDays: number;
  day10Enabled: boolean;
  day10OffsetDays: number;
  day15Enabled: boolean;
  day15OffsetDays: number;
  day30Enabled: boolean;
  day30OffsetDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type:
    | 'INITIAL_ACTIVATION'
    | 'BILLING_DUE'
    | 'BILLING_DUE_GROUPED'
    | 'RECOVERY_DAY_3'
    | 'RECOVERY_DAY_7'
    | 'RECOVERY_DAY_10'
    | 'RECOVERY_DAY_15'
    | 'RECOVERY_DAY_30';
  content: string;
  active: boolean;
  variables: string[];
  supportedVariables?: string[];
  createdAt: string;
  updatedAt: string;
}

export type RecoveryCampaignStatus = 'ATIVA' | 'CONCLUIDA' | 'CANCELADA';
export type RecoveryCampaignStepStatus = 'SCHEDULED' | 'SENT' | 'FAILED' | 'CANCELED' | 'IGNORED';

export interface RecoveryCampaignStep {
  id: string;
  campaignId: string;
  stepNumber: number;
  delayDays: number;
  templateId: string | null;
  dispatchId: string | null;
  scheduledFor: string;
  status: RecoveryCampaignStepStatus;
  sentAt: string | null;
  canceledAt: string | null;
  template: Pick<MessageTemplate, 'id' | 'name' | 'type' | 'active'> | null;
  dispatch: {
    id: string;
    status: MessageDispatch['status'];
    attempts: number;
    scheduledFor: string | null;
    nextAttemptAt: string | null;
    sentAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
}

export interface RecoveryCampaign {
  id: string;
  clientId: string;
  clientReferenceId: string;
  receivableId: string;
  status: RecoveryCampaignStatus;
  startedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  createdAt?: string;
  updatedAt?: string;
  client?: Pick<Client, 'id' | 'name' | 'reference' | 'status'> & { planName?: string | null };
  clientReference?: Pick<ClientReference, 'id' | 'reference' | 'status'>;
  receivable:
    | (Pick<Receivable, 'id' | 'description' | 'amount' | 'dueDate' | 'status'> & {
        daysOverdue: number;
      })
    | null;
  steps: RecoveryCampaignStep[];
}

export interface RecoverySummary {
  active: number;
  completed: number;
  canceled: number;
  scheduled: number;
  failed: number;
}

export interface PaginatedRecoveryCampaigns {
  items: RecoveryCampaign[];
  pagination: PaginatedClients['pagination'];
}

export type ReportType =
  | 'clients'
  | 'references'
  | 'renewals'
  | 'receivables'
  | 'finance'
  | 'billing'
  | 'recovery'
  | 'referrals';

export interface OperationalReport {
  columns: string[];
  rows: Array<Record<string, string>>;
  total: number;
  limited: boolean;
  summary: Record<string, unknown>;
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  search?: string;
  clientStatus?: ClientStatus | '';
  planId?: string;
  receivableDisplayStatus?: ReceivableDisplayStatus | '';
  transactionType?: FinancialTransactionType | '';
  transactionOrigin?: FinancialTransactionOrigin | '';
  categoryId?: string;
  dispatchStatus?: MessageDispatch['status'] | '';
  recoveryStatus?: RecoveryCampaignStatus | '';
  referralStatus?: ReferralStatus | '';
  referrerClientId?: string;
}

export type ReportsIntelligencePreset =
  | 'today'
  | 'last_7_days'
  | 'this_month'
  | 'previous_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'this_year'
  | 'previous_year'
  | 'custom';

export interface ReportsIntelligenceMetric<Value extends number | string> {
  value: Value;
  previousValue: Value;
  changePercent: string | null;
  comparison: 'percentage' | 'new';
}

export interface ReportsIntelligenceOverview {
  meta: {
    preset: ReportsIntelligencePreset;
    timezone: 'America/Sao_Paulo';
    period: { startDate: string; endDate: string };
    comparisonPeriod: { startDate: string; endDate: string };
    granularity: 'day' | 'month' | 'year';
    generatedAt: string;
    dataQuality: Array<{ code: string; message: string }>;
  };
  kpis: {
    received: ReportsIntelligenceMetric<string>;
    receivedOperational: ReportsIntelligenceMetric<string>;
    receivedLegacy: ReportsIntelligenceMetric<string>;
    manualEntries: ReportsIntelligenceMetric<string>;
    payments: ReportsIntelligenceMetric<number>;
    averageTicket: ReportsIntelligenceMetric<string>;
    newClients: ReportsIntelligenceMetric<number>;
    activeClients: ReportsIntelligenceMetric<number>;
    paidActivations: ReportsIntelligenceMetric<number>;
    paidRenewals: ReportsIntelligenceMetric<number>;
    paidReactivations: ReportsIntelligenceMetric<number>;
    canceledReferences: ReportsIntelligenceMetric<number>;
    pendingReceivables: ReportsIntelligenceMetric<string>;
    overdueReceivables: ReportsIntelligenceMetric<string>;
  };
  charts: {
    financialEvolution: Array<{
      bucket: string;
      received: string;
      operational: string;
      legacy: string;
      payments: number;
    }>;
    newClients: Array<{ bucket: string; total: number }>;
    paidLifecycle: Array<{
      bucket: string;
      activations: number;
      renewals: number;
      reactivations: number;
    }>;
  };
}

export interface ReportsIntelligenceFinance {
  meta: ReportsIntelligenceOverview['meta'];
  kpis: {
    received: ReportsIntelligenceMetric<string>;
    operational: ReportsIntelligenceMetric<string>;
    legacy: ReportsIntelligenceMetric<string>;
    manual: ReportsIntelligenceMetric<string>;
    payments: ReportsIntelligenceMetric<number>;
    averageTicket: ReportsIntelligenceMetric<string>;
    pending: ReportsIntelligenceMetric<string>;
    overdue: ReportsIntelligenceMetric<string>;
  };
  charts: {
    evolution: Array<{
      bucket: string;
      received: string;
      operational: string;
      legacy: string;
      manual: string;
      payments: number;
      operationalPayments: number;
      averageTicket: string;
    }>;
    periodComparison: Array<{
      bucket: string;
      comparisonBucket: string | null;
      current: string;
      previous: string;
    }>;
    averageTicket: Array<{ bucket: string; value: string; payments: number }>;
    byOrigin: Array<{
      origin: 'RECEIVABLE_PAYMENT' | 'LEGACY_IMPORT' | 'MANUAL';
      label: string;
      value: string;
    }>;
    flowAndStock: Array<{
      key: 'received' | 'pending' | 'overdue';
      label: string;
      semantics: 'flow' | 'stock';
      value: string;
    }>;
    annualComparison: Array<{
      bucket: string;
      comparisonBucket: string | null;
      current: string;
      previous: string;
    }> | null;
  };
}

export interface ReportsIntelligenceClients {
  meta: ReportsIntelligenceOverview['meta'];
  kpis: {
    newClients: ReportsIntelligenceMetric<number>;
    activeClients: ReportsIntelligenceMetric<number>;
    clientsWithoutActiveReference: ReportsIntelligenceMetric<number>;
    activeReferences: ReportsIntelligenceMetric<number>;
    newReferences: ReportsIntelligenceMetric<number>;
    canceledReferences: ReportsIntelligenceMetric<number>;
    clientsAffectedByCancellation: ReportsIntelligenceMetric<number>;
    monthlyAverageNewClients: { value: string | null; applicable: boolean; months: number };
    activePortfolioVariation: ReportsIntelligenceMetric<number>;
  };
  charts: {
    newClients: Array<{ bucket: string; total: number }>;
    periodComparison: Array<{ label: string; value: number }>;
    referenceMovement: Array<{ bucket: string; created: number; canceled: number }>;
    statusDistribution: Array<{ status: string; label: string; total: number }>;
    planDistribution: Array<{ planId: string; planName: string; total: number }>;
    activePortfolio: Array<{
      bucket: string;
      activeClients: number;
      activeReferences: number;
      historicalLimitation: boolean;
    }>;
    monthlyAcquisition: Array<{ bucket: string; total: number }> | null;
  };
}

export interface ReportsIntelligenceRenewals {
  meta: ReportsIntelligenceOverview['meta'];
  kpis: {
    paidRenewals: ReportsIntelligenceMetric<number>;
    renewalRevenue: ReportsIntelligenceMetric<string>;
    renewalAverageTicket: ReportsIntelligenceMetric<string>;
    paidActivations: ReportsIntelligenceMetric<number>;
    activationRevenue: ReportsIntelligenceMetric<string>;
    paidReactivations: ReportsIntelligenceMetric<number>;
    reactivationRevenue: ReportsIntelligenceMetric<string>;
    renewalReversals: ReportsIntelligenceMetric<number>;
  };
  charts: {
    paidRenewals: Array<{ bucket: string; total: number }>;
    renewalRevenue: Array<{ bucket: string; value: string }>;
    paidLifecycle: Array<{
      bucket: string;
      activations: number;
      renewals: number;
      reactivations: number;
    }>;
    renewalComparison: Array<{
      bucket: string;
      comparisonBucket: string | null;
      current: number;
      previous: number;
    }>;
    revenueComposition: Array<{
      purpose: 'INITIAL_ACTIVATION' | 'RENEWAL' | 'REACTIVATION';
      label: string;
      value: string;
      sharePercent: string;
    }>;
    renewalAverageTicket: Array<{ bucket: string; value: string; payments: number }>;
    reversals: Array<{ bucket: string; total: number }>;
  };
}

export interface PaginatedBillingDispatches {
  items: MessageDispatch[];
  pagination: PaginatedClients['pagination'];
}

export interface WhatsAppProviderHealth {
  online: boolean;
  version?: string | null;
}

export interface HealthStatus {
  ok: boolean;
  service: string;
  timestamp: string;
}

export type WhatsAppPendingContactStatus = 'PENDENTE' | 'APROVADO' | 'IGNORADO';
export type WhatsAppInboundMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'live_location'
  | 'contact'
  | 'contacts'
  | 'reaction'
  | 'button_response'
  | 'list_response'
  | 'interactive_response'
  | 'unknown';

export interface WhatsAppInboundMessage {
  id: string;
  providerMessageId: string | null;
  phoneNormalized: string | null;
  direction: 'INCOMING' | 'OUTGOING';
  messageType: WhatsAppInboundMessageType;
  text: string | null;
  messageTimestamp: string | null;
  receivedAt: string;
  contactName: string | null;
  mediaMetadata: Record<string, unknown> | null;
}

export interface WhatsAppPendingContact {
  id: string;
  whatsAppConnectionId: string;
  phone: string;
  phoneNormalized: string;
  phoneE164?: string | null;
  contactName: string | null;
  status: WhatsAppPendingContactStatus;
  firstMessageText: string | null;
  lastMessageText: string | null;
  firstMessageType: WhatsAppInboundMessageType;
  lastMessageType: WhatsAppInboundMessageType;
  firstMessageId: string | null;
  lastMessageId: string | null;
  firstContactAt: string;
  lastContactAt: string;
  messageCount: number;
  clientId: string | null;
  approvedAt: string | null;
  ignoredAt: string | null;
  ignoreReason: string | null;
  createdAt: string;
  updatedAt: string;
  connection: Pick<WhatsAppConnection, 'id' | 'name' | 'provider'>;
  client: Pick<Client, 'id' | 'name' | 'reference'> | null;
  inboundMessages?: WhatsAppInboundMessage[];
}

export interface WhatsAppPendingContactsSummary {
  pending: number;
  approvedToday: number;
  ignored: number;
}

export interface PaginatedWhatsAppPendingContacts {
  items: WhatsAppPendingContact[];
  pagination: PaginatedClients['pagination'];
}

export interface FinancialTransactionPayload {
  description: string;
  categoryId: string;
  amount: number;
  transactionDate: string;
  clientId?: string | undefined;
  notes?: string | undefined;
}

export type ManualChargePayerType = 'REGISTERED_CLIENT' | 'GUEST';

export interface ManualChargePayload {
  description: string;
  categoryId: string;
  amount: number;
  dueDate: string;
  payerType: ManualChargePayerType;
  idempotencyKey: string;
  clientId?: string;
  payerName?: string;
  payerPhone?: string;
}

export interface PaginatedClients {
  items: Client[];
  pagination: {
    page: number;
    pageSize: number;
    limit?: number;
    total: number;
    totalPages: number;
    hasMore?: boolean;
    nextPage?: number | null;
  };
}

export interface PaginatedClientEvents {
  items: ClientEvent[];
  pagination: PaginatedClients['pagination'];
}

export interface RemovalPreview<TTarget> {
  target: TTarget;
  counts: Record<string, number>;
}

export interface ClientOption {
  email: string | null;
  id: string;
  name: string;
  reference: string;
  phoneCountry?: string | null;
  phoneE164?: string | null;
  phoneNormalized: string;
  preferredPixProvider: PaymentProviderCode | null;
}

export interface PaginatedReferrals {
  items: Referral[];
  pagination: PaginatedClients['pagination'];
}

export interface ClientPayload {
  name: string;
  phone: string;
  phoneCountry?: string | undefined;
  email?: string | null | undefined;
  reference: string;
  planId: string;
  recurringValue: number;
  dueDate: string;
  billingNoticeDays: number;
  internationalBillingEnabled?: boolean | undefined;
  preferredPixProvider?: PaymentProviderCode | null | undefined;
  notes?: string | undefined;
  referrerClientId?: string | undefined;
  referralRewardType?: ReferralRewardType | undefined;
  referralRewardValue?: number | undefined;
  referralRewardDescription?: string | undefined;
  generateInitialReceivable?: boolean | undefined;
}

export interface ClientUpdatePayload {
  name?: string | undefined;
  phone?: string | undefined;
  phoneCountry?: string | undefined;
  email?: string | null | undefined;
  notes?: string | undefined;
  preferredPixProvider?: PaymentProviderCode | null | undefined;
}

export interface ApproveWhatsAppPendingContactPayload {
  name: string;
  email?: string | undefined;
  reference: string;
  planId: string;
  recurringValue: number;
  dueDate: string;
  billingNoticeDays: number;
  notes?: string | undefined;
  generateInitialReceivable?: boolean | undefined;
  sendPixWhatsAppNow?: boolean | undefined;
  referrerClientId?: string | undefined;
  referralRewardType?: ReferralRewardType | undefined;
  referralRewardValue?: number | undefined;
  referralRewardDescription?: string | undefined;
}

export interface PlanPayload {
  name: string;
  durationMonths: number;
  defaultValue: number;
  active?: boolean | undefined;
}

export interface ClientListFilters {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  status?: ClientStatus | '' | undefined;
  planId?: string | undefined;
}

export interface RenewalPreview {
  clientId: string;
  clientReferenceId?: string;
  reference?: string;
  clientName: string;
  clientStatus: ClientStatus;
  currentPlan: Pick<Plan, 'id' | 'name' | 'durationMonths'>;
  selectedPlan: Pick<Plan, 'id' | 'name' | 'durationMonths'>;
  planChanged: boolean;
  amount: string;
  previousDueDate: string;
  newDueDate: string;
  billingAnchorDay: number;
  receivableDescription: string;
}

export interface RenewalResult {
  idempotentReplay: boolean;
  client: Client;
  clientReference?: Pick<ClientReference, 'id' | 'reference' | 'status'>;
  renewal: Renewal;
  receivable: Receivable;
  newDueDate: string;
}

export interface ReactivationResult {
  id: string;
  alreadyExisted: boolean;
  clientId: string;
  clientReferenceId: string;
  receivableId: string;
  status: 'PENDING' | 'PAID' | 'CANCELED';
  activationDate: string;
  billingAnchorDay: number;
  recurringValue: string;
  plan: Pick<Plan, 'id' | 'name' | 'durationMonths' | 'active'> & { defaultValue: string };
  previous: {
    planId: string | null;
    planName: string | null;
    amount: string | null;
    dueDate: string | null;
    billingAnchorDay: number | null;
    status: ClientStatus | null;
  };
  client: Pick<Client, 'id' | 'name' | 'status'>;
  clientReference: Pick<
    ClientReference,
    'id' | 'reference' | 'status' | 'planId' | 'recurringValue' | 'dueDate' | 'billingAnchorDay'
  >;
  receivable: Receivable;
}

export interface RenewalRevertPreview {
  reversible: boolean;
  renewal: {
    id: string;
    status: RenewalStatus;
    createdAt: string;
  };
  current: {
    planId: string;
    planName: string;
    amount: string;
    dueDate: string;
    billingAnchorDay: number;
    status: ClientStatus;
  };
  restore: {
    planId: string | null;
    planName: string | null;
    amount: string | null;
    dueDate: string | null;
    billingAnchorDay: number | null;
    status: ClientStatus | null;
  };
  receivable: {
    id: string | null;
    status: ReceivableStatus | null;
    amount: string | null;
    dueDate: string | null;
    action: 'CANCEL' | 'PRESERVE_CANCELED' | 'BLOCK_PAID' | 'NONE';
  };
  pix: {
    total: number;
    active: number;
    paid: number;
    action: 'CANCEL_REQUIRED' | 'PRESERVE_HISTORY' | 'BLOCK_PAID' | 'NONE';
  };
  billing: {
    futureToCancel: number;
    sentToPreserve: number;
  };
  recovery: {
    active: boolean;
    action: 'CANCEL' | 'NONE';
  };
  previousCycle: {
    dueDate: string | null;
    receivableId: string | null;
    status: ReceivableStatus | 'INEXISTENTE';
    action: 'PRESERVE' | 'PRESERVE_CANCELED' | 'NONE' | 'BLOCK_PRESERVE_PAID';
  };
  blockers: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

export interface RenewalReversalResult {
  idempotentReplay: boolean;
  renewal: {
    id: string;
    clientId: string;
    clientReferenceId: string;
    status: RenewalStatus;
    newDueDate: string;
    previousDueDate: string;
  };
  reference: {
    id: string;
    reference: string;
    planId: string;
    planName: string;
    recurringValue: string;
    dueDate: string;
    billingAnchorDay: number;
    status: ClientStatus;
  };
  reversal: {
    id: string;
    renewalId: string;
    clientId: string;
    clientReferenceId: string;
    reason: string | null;
    idempotencyKey: string;
    createdByUserId: string | null;
    createdAt: string;
  };
  impacts: {
    receivable: { id: string; status: ReceivableStatus; canceled: boolean } | null;
    billing: { futureCanceled: number };
    recovery: { action: 'CANCEL' | 'NONE' };
  };
}

const paymentNotesMaxLength = 2000;

type PaymentPayloadInput = {
  paymentDate: string;
  categoryId?: string;
  notes?: string;
};

function paymentPayload(payload: PaymentPayloadInput) {
  const notes = payload.notes?.trim().slice(0, paymentNotesMaxLength);

  return {
    paymentDate: payload.paymentDate,
    ...(payload.categoryId ? { categoryId: payload.categoryId } : {}),
    ...(notes ? { notes } : {}),
  };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const body = init?.body;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401) {
    redirectToLoginOnce();
    throw new ApiError('Não autenticado.', response.status);
  }

  if (!response.ok) {
    const body = await parseJsonResponse<{ message?: string } & Record<string, unknown>>(response);
    throw new ApiError(
      body?.message ?? 'Não foi possível concluir a operação.',
      response.status,
      body,
    );
  }

  return (await parseJsonResponse<T>(response)) as T;
}

export function getHealthStatus() {
  return apiFetch<HealthStatus>('/health');
}

async function parseJsonResponse<T>(response: Response): Promise<T | undefined> {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

export function formatDate(value: string) {
  const [year, month, dayWithTime] = value.split('-');
  const day = dayWithTime?.slice(0, 2);

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

export function listPlans() {
  return apiFetch<Plan[]>('/plans');
}

export function createPlan(payload: PlanPayload) {
  return apiFetch<Plan>('/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updatePlan(id: string, payload: Partial<PlanPayload>) {
  return apiFetch<Plan>(`/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deletePlan(id: string) {
  return apiFetch<Plan>(`/plans/${id}`, { method: 'DELETE' });
}

export function listClients(filters: ClientListFilters = {}) {
  const params = new URLSearchParams();

  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.planId) params.set('planId', filters.planId);

  const query = params.toString();
  return apiFetch<PaginatedClients>(`/clients${query ? `?${query}` : ''}`);
}

export function listClientOptions(search: string, options: { limit?: number } = {}) {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();

  if (trimmedSearch) params.set('search', trimmedSearch);
  if (options.limit) params.set('limit', String(options.limit));

  const query = params.toString();
  return apiFetch<ClientOption[]>(`/clients/options${query ? `?${query}` : ''}`);
}

export function previewLegacyClients(payload: unknown) {
  return apiFetch<LegacyImportPreview>('/legacy-import/clients/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewLegacyPayments(payload: unknown) {
  const body = Array.isArray(payload)
    ? {
        schemaVersion: 1,
        source: 'legacy',
        payments: payload,
      }
    : payload;

  return apiFetch<LegacyPaymentPreview>('/legacy-import/payments/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function previewLegacyCutover() {
  return apiFetch<LegacyCutoverPreview>('/legacy-import/cutover/preview', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function activateLegacyCutover(clientReferenceIds?: string[]) {
  return apiFetch<LegacyCutoverActivateResult>('/legacy-import/cutover/activate', {
    method: 'POST',
    body: JSON.stringify(clientReferenceIds?.length ? { clientReferenceIds } : {}),
  });
}

export function importLegacyPayments(payload: unknown) {
  const body = Array.isArray(payload)
    ? {
        schemaVersion: 1,
        source: 'legacy',
        payments: payload,
      }
    : payload;

  return apiFetch<LegacyPaymentImportResult>('/legacy-import/payments/import', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function importLegacyClients(payload: unknown) {
  return apiFetch<LegacyImportResult>('/legacy-import/clients/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getClient(id: string) {
  return apiFetch<Client>(`/clients/${id}`);
}

export interface ClientPhoneCapabilities {
  capabilityModel?: 'OPERATION_V1';
  enabled: boolean;
  internationalWriteEnabled: boolean;
  internationalClientWriteEnabled: boolean;
  internationalWhatsAppSendEnabled: boolean;
  internationalManualTextSendEnabled?: boolean;
  internationalMessageActionsEnabled?: boolean;
  internationalManualMediaEnabled?: boolean;
  internationalManualMediaCountries?: string[];
  internationalManualVoiceEnabled?: boolean;
  internationalManualVoiceCountries?: string[];
  internationalManualPixEnabled?: boolean;
  internationalBillingOptInSupported?: boolean;
  internationalBillingSendEnabled: boolean;
  operationCapabilities?: {
    clientPhoneWrite?: { enabled: boolean };
    manualText?: { enabled: boolean };
    messageAction?: { enabled: boolean };
    manualMedia?: { enabled: boolean };
    manualVoice?: { enabled: boolean };
    manualPix?: { enabled: boolean; requiresFinancialAuthorization?: boolean };
    pixButton?: { enabled: boolean; requiresFinancialAuthorization?: boolean };
    autoReply?: { enabled: boolean };
    billing?: { enabled: boolean; requiresFinancialAuthorization?: boolean };
    recovery?: { enabled: boolean; requiresFinancialAuthorization?: boolean };
  };
  defaultCountry: 'BR';
  supportedCountries: Array<{ country: string; callingCode: string }>;
}

export function getClientPhoneCapabilities() {
  return apiFetch<ClientPhoneCapabilities>('/clients/capabilities/phone');
}

export function serializeClientReferencePayload<T extends Record<string, unknown>>(
  payload: T & { internationalBillingEnabled?: boolean | undefined },
  internationalBillingOptInSupported: boolean,
) {
  const { internationalBillingEnabled, ...legacyPayload } = payload;

  if (!internationalBillingOptInSupported || internationalBillingEnabled === undefined) {
    return legacyPayload;
  }

  return { ...legacyPayload, internationalBillingEnabled };
}

export function getClientEvents(id: string, filters: { page?: number; pageSize?: number } = {}) {
  const params = new URLSearchParams();

  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedClientEvents>(`/clients/${id}/events${query ? `?${query}` : ''}`);
}

export function createClient(payload: ClientPayload) {
  return apiFetch<Client>('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateClient(id: string, payload: ClientUpdatePayload) {
  return apiFetch<Client>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateClientStatus(id: string, status: ClientStatus, reason?: string) {
  return apiFetch<Client>(`/clients/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      ...(reason ? { reason } : {}),
    }),
  });
}

export function listClientReferences(clientId: string) {
  return apiFetch<ClientReference[]>(`/clients/${clientId}/references`);
}

export function createClientReference(
  clientId: string,
  payload: Omit<ClientPayload, 'name' | 'phone' | 'email'>,
) {
  return apiFetch<ClientReference>(`/clients/${clientId}/references`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateClientReference(
  referenceId: string,
  payload: Partial<Omit<ClientPayload, 'name' | 'phone' | 'email'>>,
) {
  return apiFetch<ClientReference>(`/clients/references/${referenceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateClientReferenceStatus(
  referenceId: string,
  status: ClientStatus,
  reason?: string,
) {
  return apiFetch<ClientReference>(`/clients/references/${referenceId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      status,
      ...(reason ? { reason } : {}),
    }),
  });
}

export function deleteClientReference(referenceId: string, confirmation: 'REMOVER') {
  return apiFetch<{ id: string; removed: true; counts: Record<string, number> }>(
    `/clients/references/${referenceId}`,
    { method: 'DELETE', body: JSON.stringify({ confirmation }) },
  );
}

export function deleteClient(id: string, confirmation: 'REMOVER') {
  return apiFetch<{ id: string; removed: true; counts: Record<string, number> }>(`/clients/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirmation }),
  });
}

export function previewDeleteClientReference(referenceId: string) {
  return apiFetch<RemovalPreview<ClientReference>>(
    `/clients/references/${referenceId}/deletion-preview`,
  );
}

export function previewDeleteClient(id: string) {
  return apiFetch<RemovalPreview<Pick<Client, 'id' | 'name' | 'reference'>>>(
    `/clients/${id}/deletion-preview`,
  );
}

export function previewRenewal(clientId: string, payload: { planId: string; amount: number }) {
  return apiFetch<RenewalPreview>(`/clients/${clientId}/renewals/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewReferenceRenewal(
  clientReferenceId: string,
  payload: { planId: string; amount: number },
) {
  return apiFetch<RenewalPreview>(`/client-references/${clientReferenceId}/renewals/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function confirmRenewal(
  clientId: string,
  payload: { planId: string; amount: number; idempotencyKey: string },
) {
  return apiFetch<RenewalResult>(`/clients/${clientId}/renewals`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function confirmReferenceRenewal(
  clientReferenceId: string,
  payload: { planId: string; amount: number; idempotencyKey: string },
) {
  return apiFetch<RenewalResult>(`/client-references/${clientReferenceId}/renewals`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createReferenceReactivation(
  clientReferenceId: string,
  payload: { planId: string; amount: number; activationDate: string; idempotencyKey: string },
) {
  return apiFetch<ReactivationResult>(`/client-references/${clientReferenceId}/reactivations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewRenewalReversal(clientReferenceId: string, renewalId: string) {
  return apiFetch<RenewalRevertPreview>(
    `/client-references/${clientReferenceId}/renewals/${renewalId}/revert/preview`,
  );
}

export function confirmRenewalReversal(
  clientReferenceId: string,
  renewalId: string,
  payload: { reason: string; idempotencyKey: string },
) {
  return apiFetch<RenewalReversalResult>(
    `/client-references/${clientReferenceId}/renewals/${renewalId}/revert`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function listFinancialCategories() {
  return apiFetch<FinancialCategory[]>('/financial-categories');
}

export function createFinancialCategory(payload: {
  name: string;
  type: FinancialTransactionType;
  active?: boolean;
}) {
  return apiFetch<FinancialCategory>('/financial-categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateFinancialCategory(
  id: string,
  payload: Partial<{ name: string; type: FinancialTransactionType; active: boolean }>,
) {
  return apiFetch<FinancialCategory>(`/financial-categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteFinancialCategory(id: string) {
  return apiFetch<FinancialCategory>(`/financial-categories/${id}`, { method: 'DELETE' });
}

export function getFinancialSummary(filters: { startDate?: string; endDate?: string } = {}) {
  const params = new URLSearchParams();

  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  const query = params.toString();
  return apiFetch<FinancialSummary>(`/finance/summary${query ? `?${query}` : ''}`);
}

export function getDashboardSummary(filters: { startDate?: string; endDate?: string } = {}) {
  const params = new URLSearchParams();

  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  const query = params.toString();
  return apiFetch<DashboardSummary>(`/dashboard/summary${query ? `?${query}` : ''}`);
}

function reportParams(filters: ReportFilters = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  return params.toString();
}

export function getReport(type: ReportType, filters: ReportFilters = {}) {
  const query = reportParams(filters);
  return apiFetch<OperationalReport>(`/reports/${type}${query ? `?${query}` : ''}`);
}

export function getReportsIntelligenceOverview(
  filters: {
    preset: ReportsIntelligencePreset;
    startDate?: string;
    endDate?: string;
  },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ preset: filters.preset });
  if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
  }

  return apiFetch<ReportsIntelligenceOverview>(
    `/reports/intelligence/overview?${params}`,
    signal ? { signal } : undefined,
  );
}

export function getReportsIntelligenceFinance(
  filters: {
    preset: ReportsIntelligencePreset;
    startDate?: string;
    endDate?: string;
  },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ preset: filters.preset });
  if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
  }

  return apiFetch<ReportsIntelligenceFinance>(
    `/reports/intelligence/finance?${params}`,
    signal ? { signal } : undefined,
  );
}

export function getReportsIntelligenceClients(
  filters: { preset: ReportsIntelligencePreset; startDate?: string; endDate?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ preset: filters.preset });
  if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
  }
  return apiFetch<ReportsIntelligenceClients>(
    `/reports/intelligence/clients?${params}`,
    signal ? { signal } : undefined,
  );
}

export function getReportsIntelligenceRenewals(
  filters: { preset: ReportsIntelligencePreset; startDate?: string; endDate?: string },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ preset: filters.preset });
  if (filters.preset === 'custom' && filters.startDate && filters.endDate) {
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
  }
  return apiFetch<ReportsIntelligenceRenewals>(
    `/reports/intelligence/renewals?${params}`,
    signal ? { signal } : undefined,
  );
}

export function listReferrals(
  filters: {
    search?: string;
    status?: ReferralStatus | '';
    referrerClientId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  const query = params.toString();
  return apiFetch<PaginatedReferrals>(`/referrals${query ? `?${query}` : ''}`);
}

export function getReferralSummary(
  filters: {
    search?: string;
    referrerClientId?: string;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });

  const query = params.toString();
  return apiFetch<ReferralSummary>(`/referrals/summary${query ? `?${query}` : ''}`);
}

export function getReferral(id: string) {
  return apiFetch<Referral>(`/referrals/${id}`);
}

export function createReferral(payload: {
  referredClientId: string;
  referredClientReferenceId: string;
  referrerClientId: string;
  rewardType: ReferralRewardType;
  rewardValue?: number;
  rewardDescription?: string;
}) {
  return apiFetch<Referral>('/referrals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateReferral(
  id: string,
  payload: {
    referrerClientId: string;
    rewardType: ReferralRewardType;
    rewardValue?: number;
    rewardDescription?: string;
    expectedUpdatedAt: string;
  },
) {
  return apiFetch<Referral>(`/referrals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function applyReferralReward(
  id: string,
  payload: { clientReferenceId?: string; rewardValue?: number; rewardDescription?: string } = {},
) {
  return apiFetch<Referral>(`/referrals/${id}/apply-reward`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelReferral(id: string, reason: string) {
  return apiFetch<Referral>(`/referrals/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function downloadReportCsv(type: ReportType, filters: ReportFilters = {}) {
  const query = reportParams(filters);
  const response = await fetch(buildApiUrl(`/reports/${type}.csv${query ? `?${query}` : ''}`), {
    credentials: 'include',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Não foi possível exportar CSV.');
  }

  return response.blob();
}

export function listReceivables(
  filters: {
    clientId?: string;
    clientReferenceId?: string;
    status?: ReceivableDisplayStatus | '';
    search?: string;
    dueDate?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
    sort?: 'dueDateAsc';
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.sort) params.set('sort', filters.sort);

  const query = params.toString();
  return apiFetch<PaginatedReceivables>(`/receivables${query ? `?${query}` : ''}`);
}

export function getReceivable(id: string) {
  return apiFetch<Receivable>(`/receivables/${id}`);
}

export function getReceivablesSummary(
  filters: {
    clientId?: string;
    clientReferenceId?: string;
    status?: ReceivableDisplayStatus | '';
    search?: string;
    dueDate?: string;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  const query = params.toString();
  return apiFetch<ReceivablesSummary>(`/receivables/summary${query ? `?${query}` : ''}`);
}

export function payReceivable(
  id: string,
  payload: { paymentDate: string; categoryId?: string; notes?: string },
) {
  return apiFetch<FinancialTransaction>(`/receivables/${id}/payment`, {
    method: 'POST',
    body: JSON.stringify(paymentPayload(payload)),
  });
}

export function payReceivables(payload: {
  receivableIds: string[];
  paymentDate: string;
  categoryId?: string;
  notes?: string;
}) {
  return apiFetch<PaymentGroupPaymentResult>('/receivables/payments', {
    method: 'POST',
    body: JSON.stringify({
      receivableIds: payload.receivableIds,
      ...paymentPayload(payload),
    }),
  });
}

export function createReceivablePix(id: string, provider?: PaymentProviderCode) {
  return apiFetch<PaymentIntent>(`/receivables/${id}/pix`, {
    method: 'POST',
    ...(provider ? { body: JSON.stringify({ provider }) } : {}),
  });
}

export function previewReceivablePixReplacement(
  id: string,
  payload: { provider: PaymentProviderCode },
) {
  const params = new URLSearchParams();
  params.set('provider', payload.provider);

  return apiFetch<PixReplacementPreview>(`/receivables/${id}/pix/replace-preview?${params}`);
}

export function replaceReceivablePix(
  id: string,
  payload: {
    provider: PaymentProviderCode;
    expectedCurrentIntentId: string;
    reason?: string;
    idempotencyKey?: string;
  },
) {
  return apiFetch<PaymentIntent>(`/receivables/${id}/pix/replace`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewReceivablePixReplacementRecovery(
  id: string,
  payload: { provider: PaymentProviderCode; providerTransactionId: string },
) {
  const params = new URLSearchParams();
  params.set('provider', payload.provider);
  params.set('providerTransactionId', payload.providerTransactionId);

  return apiFetch<PixReplacementRecoveryPreview>(
    `/receivables/${id}/pix/replace-recovery-preview?${params}`,
  );
}

export function recoverReceivablePixReplacement(
  id: string,
  payload: {
    provider: PaymentProviderCode;
    providerTransactionId: string;
    expectedCurrentIntentId: string;
    reason?: string;
    idempotencyKey?: string;
  },
) {
  return apiFetch<PaymentIntent>(`/receivables/${id}/pix/replace-recovery`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function previewReceivablePixReconciliation(
  id: string,
  payload: { provider: PaymentProviderCode; providerTransactionId: string },
) {
  const params = new URLSearchParams();
  params.set('provider', payload.provider);
  params.set('providerTransactionId', payload.providerTransactionId);

  return apiFetch<PixReconciliationPreview>(
    `/receivables/${id}/pix/reconcile-preview?${params.toString()}`,
  );
}

export function reconcileReceivablePix(
  id: string,
  payload: {
    provider: PaymentProviderCode;
    providerTransactionId: string;
    reason?: string;
    idempotencyKey?: string;
  },
) {
  return apiFetch<PaymentIntent>(`/receivables/${id}/pix/reconcile`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createReceivablesPix(
  receivableIds: string[],
  provider?: ConfigurablePaymentProvider,
) {
  return apiFetch<PaymentIntent>('/receivables/pix', {
    method: 'POST',
    body: JSON.stringify({ receivableIds, ...(provider ? { provider } : {}) }),
  });
}

export function replaceReceivablesPix(payload: {
  receivableIds: string[];
  provider: ConfigurablePaymentProvider;
  expectedCurrentIntentId: string;
  reason?: string;
  idempotencyKey?: string;
}) {
  return apiFetch<PaymentIntent>('/receivables/pix/replace', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listPaymentIntents(receivableId: string) {
  return apiFetch<PaymentIntent[]>(`/receivables/${receivableId}/payment-intents`);
}

export function getPaymentIntentsSummary(filters: { clientId: string }) {
  const params = new URLSearchParams();

  params.set('clientId', filters.clientId);

  return apiFetch<PaymentIntentsSummary>(`/payment-intents/summary?${params.toString()}`);
}

export function getPaymentIntentPixCopy(id: string) {
  return apiFetch<PaymentIntentPixCopyResult>(`/payment-intents/${id}/pix-copy`);
}

export function listWhatsAppQuickReplies() {
  return apiFetch<WhatsAppQuickReply[]>('/whatsapp/quick-replies');
}

export function listWhatsAppQuickRepliesAdmin() {
  return apiFetch<WhatsAppQuickReplyAdmin[]>('/whatsapp/quick-replies/admin');
}

export function createWhatsAppQuickReply(payload: WhatsAppQuickReplyPayload) {
  return apiFetch<WhatsAppQuickReplyAdmin>('/whatsapp/quick-replies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateWhatsAppQuickReply(id: string, payload: Partial<WhatsAppQuickReplyPayload>) {
  return apiFetch<WhatsAppQuickReplyAdmin>(`/whatsapp/quick-replies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteWhatsAppQuickReply(id: string) {
  return apiFetch<{ success: boolean }>(`/whatsapp/quick-replies/${id}`, { method: 'DELETE' });
}

export function syncPaymentIntent(id: string) {
  return apiFetch<PaymentIntent>(`/payment-intents/${id}/sync`, { method: 'POST' });
}

export function confirmMockPaymentIntent(id: string) {
  return apiFetch<PaymentIntent>(`/payment-intents/${id}/mock-confirm`, { method: 'POST' });
}

export function cancelPaymentIntent(id: string) {
  return apiFetch<PaymentIntent>(`/payment-intents/${id}/cancel`, { method: 'POST' });
}

export function sendPaymentIntentWhatsApp(id: string) {
  return apiFetch<PixWhatsAppSendResult>(`/payment-intents/${id}/send-whatsapp`, {
    method: 'POST',
  });
}

export function listPaymentProviderCredentials() {
  return apiFetch<PaymentProviderCredentialStatus[]>('/payment-provider-credentials');
}

export function savePaymentProviderCredential(payload: {
  provider: ConfigurablePaymentProvider;
  name: string;
  token: string;
}) {
  return apiFetch<PaymentProviderCredentialStatus>('/payment-provider-credentials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function testPaymentProviderCredential(provider: ConfigurablePaymentProvider) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/test`,
    { method: 'POST' },
  );
}

export function deactivatePaymentProviderCredential(provider: ConfigurablePaymentProvider) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/deactivate`,
    { method: 'POST' },
  );
}

export function setDefaultPaymentProvider(provider: ConfigurablePaymentProvider) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/default`,
    { method: 'POST' },
  );
}

export function savePaymentWebhookSecret(provider: ConfigurablePaymentProvider, secret: string) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/webhook-secret`,
    {
      method: 'POST',
      body: JSON.stringify({ secret }),
    },
  );
}

export function registerPaymentWebhook(provider: ConfigurablePaymentProvider) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/webhook/register`,
    { method: 'POST' },
  );
}

export function cancelReceivable(id: string, payload: { reason: string }) {
  return apiFetch<Receivable>(`/receivables/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listFinancialTransactions(
  filters: {
    type?: FinancialTransactionType;
    origin?: FinancialTransactionOrigin;
    clientId?: string;
    clientReferenceId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.type) params.set('type', filters.type);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.search) params.set('search', filters.search);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedFinancialTransactions>(
    `/financial-transactions${query ? `?${query}` : ''}`,
  );
}

export function createManualEntry(payload: FinancialTransactionPayload) {
  return apiFetch<FinancialTransaction>('/financial-transactions/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createManualCharge(payload: ManualChargePayload) {
  return apiFetch<Receivable>('/receivables/manual-charges', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createManualExpense(payload: FinancialTransactionPayload) {
  return apiFetch<FinancialTransaction>('/financial-transactions/expenses', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateFinancialTransaction(
  id: string,
  payload: Partial<FinancialTransactionPayload>,
) {
  return apiFetch<FinancialTransaction>(`/financial-transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteFinancialTransaction(id: string) {
  return apiFetch<FinancialTransaction>(`/financial-transactions/${id}`, { method: 'DELETE' });
}

export function getWhatsAppConnection() {
  return apiFetch<WhatsAppConnection | null>('/whatsapp/connection');
}

export function listWhatsAppConnections() {
  return apiFetch<WhatsAppConnection[]>('/whatsapp/connections');
}

export function createWhatsAppConnection(payload: { name: string }) {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function connectWhatsApp() {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection/connect', { method: 'POST' });
}

export function refreshWhatsAppStatus() {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection/status');
}

export function getWhatsAppQrCode() {
  return apiFetch<{ qrCode: string }>('/whatsapp/connection/qr');
}

export function disconnectWhatsApp() {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection/disconnect', { method: 'POST' });
}

export function logoutWhatsApp() {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection/logout', { method: 'POST' });
}

export function getWhatsAppWebhook() {
  return apiFetch<unknown>('/whatsapp/connection/webhook');
}

export function configureWhatsAppWebhook() {
  return apiFetch<WhatsAppConnection>('/whatsapp/connection/webhook', { method: 'POST' });
}

export function sendWhatsAppMessage(payload: {
  clientId: string;
  body: string;
  requestId: string;
}) {
  return apiFetch<MessageDispatch>('/whatsapp/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listWhatsAppMessages() {
  return apiFetch<MessageDispatch[]>('/whatsapp/messages');
}

export function listWhatsAppConversations(
  filters: {
    attendanceStatus?: 'ACTIVE' | 'ALL' | 'IN_PROGRESS' | 'PENDING';
    clientId?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    status?: WhatsAppConversationStatus | '';
    unreadOnly?: boolean;
    needsManualFollowUp?: boolean;
    whatsAppConnectionId?: string;
    hasClient?: boolean;
    labelId?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('limit', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  if (filters.attendanceStatus) params.set('attendanceStatus', filters.attendanceStatus);
  if (filters.status) params.set('status', filters.status);
  if (filters.unreadOnly) params.set('unreadOnly', 'true');
  if (filters.needsManualFollowUp) params.set('needsManualFollowUp', 'true');
  if (filters.hasClient !== undefined) params.set('hasClient', String(filters.hasClient));
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.whatsAppConnectionId) {
    params.set('whatsAppConnectionId', filters.whatsAppConnectionId);
  }
  if (filters.labelId) params.set('labelId', filters.labelId);

  const query = params.toString();
  return apiFetch<PaginatedWhatsAppConversations>(
    `/whatsapp/conversations${query ? `?${query}` : ''}`,
  );
}

export function listWhatsAppAutoReplies() {
  return apiFetch<WhatsAppAutoReplyConfig[]>('/whatsapp/auto-replies');
}

export function getWhatsAppAutoReply(connectionId: string) {
  return apiFetch<WhatsAppAutoReplyConfig>(`/whatsapp/connections/${connectionId}/auto-reply`);
}

export function updateWhatsAppAutoReply(
  connectionId: string,
  payload: UpdateWhatsAppAutoReplyPayload,
) {
  return apiFetch<WhatsAppAutoReplyConfig>(`/whatsapp/connections/${connectionId}/auto-reply`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function getWhatsAppConversation(id: string) {
  return apiFetch<WhatsAppConversation>(`/whatsapp/conversations/${id}`);
}

export function listWhatsAppConversationLabels(connectionId: string) {
  return apiFetch<WhatsAppConversationLabelAdmin[]>(`/whatsapp/connections/${connectionId}/labels`);
}

export function createWhatsAppConversationLabel(
  connectionId: string,
  payload: { name: string; color: WhatsAppConversationLabelColor },
) {
  return apiFetch<WhatsAppConversationLabelAdmin>(`/whatsapp/connections/${connectionId}/labels`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateWhatsAppConversationLabel(
  connectionId: string,
  labelId: string,
  payload: { name?: string; color?: WhatsAppConversationLabelColor },
) {
  return apiFetch<WhatsAppConversationLabelAdmin>(
    `/whatsapp/connections/${connectionId}/labels/${labelId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteWhatsAppConversationLabel(connectionId: string, labelId: string) {
  return apiFetch<{ deleted: boolean; id: string }>(
    `/whatsapp/connections/${connectionId}/labels/${labelId}`,
    { method: 'DELETE' },
  );
}

export function listWhatsAppAttendanceCategories(connectionId: string, activeOnly = false) {
  return apiFetch<WhatsAppAttendanceCategory[]>(
    `/whatsapp/connections/${connectionId}/attendance-categories${activeOnly ? '?activeOnly=true' : ''}`,
  );
}

export function createWhatsAppAttendanceCategory(
  connectionId: string,
  payload: { name: string; color: WhatsAppConversationLabelColor; sortOrder?: number },
) {
  return apiFetch<WhatsAppAttendanceCategory>(
    `/whatsapp/connections/${connectionId}/attendance-categories`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function updateWhatsAppAttendanceCategory(
  connectionId: string,
  categoryId: string,
  payload: Partial<Pick<WhatsAppAttendanceCategory, 'name' | 'color' | 'isActive' | 'sortOrder'>>,
) {
  return apiFetch<WhatsAppAttendanceCategory>(
    `/whatsapp/connections/${connectionId}/attendance-categories/${categoryId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function deleteWhatsAppAttendanceCategory(connectionId: string, categoryId: string) {
  return apiFetch<{ deleted: boolean; deactivated: boolean }>(
    `/whatsapp/connections/${connectionId}/attendance-categories/${categoryId}`,
    { method: 'DELETE' },
  );
}

export function setWhatsAppConversationLabels(conversationId: string, labelIds: string[]) {
  return apiFetch<WhatsAppConversation>(`/whatsapp/conversations/${conversationId}/labels`, {
    method: 'PUT',
    body: JSON.stringify({ labelIds }),
  });
}

export function getWhatsAppConversationAvatar(id: string) {
  return apiFetch<WhatsAppConversationAvatar>(`/whatsapp/conversations/${id}/avatar`);
}

export function listWhatsAppConversationMessages(
  id: string,
  filters: {
    beforeCreatedAt?: string;
    beforeId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('limit', String(filters.pageSize));
  if (filters.beforeCreatedAt) params.set('beforeCreatedAt', filters.beforeCreatedAt);
  if (filters.beforeId) params.set('beforeId', filters.beforeId);

  const query = params.toString();
  return apiFetch<PaginatedWhatsAppConversationMessages>(
    `/whatsapp/conversations/${id}/messages${query ? `?${query}` : ''}`,
  );
}

export function searchWhatsAppConversationMessages(filters: {
  conversationId?: string;
  q: string;
  page?: number;
  pageSize?: number;
}) {
  const params = new URLSearchParams();
  params.set('q', filters.q);
  if (filters.conversationId) params.set('conversationId', filters.conversationId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('limit', String(filters.pageSize));

  return apiFetch<PaginatedWhatsAppMessageSearchResults>(`/whatsapp/messages/search?${params}`);
}

export function getWhatsAppConversationMessagesAround(
  conversationId: string,
  messageId: string,
  filters: { limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();

  return apiFetch<WhatsAppMessageContext>(
    `/whatsapp/conversations/${conversationId}/messages/around/${messageId}${
      query ? `?${query}` : ''
    }`,
  );
}

export function createWhatsAppRealtimeEventSource() {
  return new EventSource(buildApiUrl('/whatsapp/events'), { withCredentials: true });
}

export function sendWhatsAppConversationMessage(
  id: string,
  payload: { body: string; requestId: string; replyToMessageId?: string },
) {
  return apiFetch<WhatsAppConversationMessage>(`/whatsapp/conversations/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type WhatsAppConversationPresencePayload = {
  state: 'composing' | 'paused';
  media?: 'audio' | null;
};

export function setWhatsAppConversationPresence(
  id: string,
  payload: WhatsAppConversationPresencePayload,
) {
  return apiFetch<{ success: boolean }>(`/whatsapp/conversations/${id}/presence`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function updateWhatsAppConversationMessageReaction(
  conversationId: string,
  messageId: string,
  emoji: string | null,
) {
  return apiFetch<WhatsAppConversationMessage>(
    `/whatsapp/conversations/${conversationId}/messages/${messageId}/reaction`,
    {
      method: 'PUT',
      body: JSON.stringify({ emoji }),
    },
  );
}

export function editWhatsAppConversationMessage(
  conversationId: string,
  messageId: string,
  body: string,
) {
  return apiFetch<WhatsAppConversationMessage>(
    `/whatsapp/conversations/${conversationId}/messages/${messageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    },
  );
}

export function deleteWhatsAppConversationMessage(conversationId: string, messageId: string) {
  return apiFetch<WhatsAppConversationMessage>(
    `/whatsapp/conversations/${conversationId}/messages/${messageId}`,
    { method: 'DELETE' },
  );
}

export function forwardWhatsAppConversationMessage(
  sourceConversationId: string,
  messageId: string,
  payload: { targetConversationId: string; requestId: string },
) {
  return apiFetch<WhatsAppConversationMessage>(
    `/whatsapp/conversations/${sourceConversationId}/messages/${messageId}/forward`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function listWhatsAppSavedStickers() {
  return apiFetch<WhatsAppSavedSticker[]>('/whatsapp/saved-stickers');
}

export function getWhatsAppSavedStickerMediaUrl(id: string) {
  return buildApiUrl(`/whatsapp/saved-stickers/${id}/media`);
}

export async function getWhatsAppSavedStickerMediaBlob(
  id: string,
  init?: Pick<RequestInit, 'signal'>,
) {
  const response = await fetch(buildApiUrl(`/whatsapp/saved-stickers/${id}/media`), {
    credentials: 'include',
    ...init,
  });

  if (response.status === 401) {
    redirectToLoginOnce();
    throw new ApiError('Não autenticado.', response.status);
  }

  if (!response.ok) {
    const body = await parseJsonResponse<{ message?: string } & Record<string, unknown>>(response);
    throw new ApiError(
      body?.message ?? 'Não foi possível carregar a prévia da figurinha.',
      response.status,
      body,
    );
  }

  return response.blob();
}

export function saveWhatsAppStickerMessage(messageId: string) {
  return apiFetch<SaveWhatsAppStickerResult>(`/whatsapp/messages/${messageId}/save-sticker`, {
    method: 'POST',
  });
}

export function deleteWhatsAppSavedSticker(id: string) {
  return apiFetch<{ success: boolean }>(`/whatsapp/saved-stickers/${id}`, {
    method: 'DELETE',
  });
}

export function sendWhatsAppSavedSticker(
  conversationId: string,
  stickerId: string,
  payload: { requestId: string; replyToMessageId?: string },
) {
  return apiFetch<WhatsAppConversationMessage>(
    `/whatsapp/conversations/${conversationId}/saved-stickers/${stickerId}/send`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function sendWhatsAppConversationMedia(
  id: string,
  payload: {
    file: File;
    caption?: string;
    requestId: string;
    replyToMessageId?: string;
    mediaKind?: 'STICKER';
  },
) {
  const formData = new FormData();
  formData.set('file', payload.file);
  formData.set('requestId', payload.requestId);
  if (payload.mediaKind) {
    formData.set('mediaKind', payload.mediaKind);
  }
  if (payload.replyToMessageId) {
    formData.set('replyToMessageId', payload.replyToMessageId);
  }
  if (payload.caption?.trim()) {
    formData.set('caption', payload.caption.trim());
  }

  return apiFetch<WhatsAppConversationMessage>(`/whatsapp/conversations/${id}/media`, {
    method: 'POST',
    body: formData,
  });
}

export function sendWhatsAppConversationVoice(
  id: string,
  payload: { file: File; durationSeconds: number; requestId: string },
) {
  const formData = new FormData();
  formData.set('file', payload.file);
  formData.set('requestId', payload.requestId);
  formData.set('durationSeconds', String(payload.durationSeconds));

  return apiFetch<WhatsAppConversationMessage>(`/whatsapp/conversations/${id}/voice`, {
    method: 'POST',
    body: formData,
  });
}

export function retryWhatsAppConversationMessage(messageId: string) {
  return apiFetch<WhatsAppConversationMessage>(`/whatsapp/messages/${messageId}/retry`, {
    method: 'POST',
  });
}

export async function downloadWhatsAppConversationMedia(conversationId: string, messageId: string) {
  const response = await fetch(
    buildApiUrl(`/whatsapp/conversations/${conversationId}/messages/${messageId}/media`),
    { credentials: 'include' },
  );

  if (response.status === 401) {
    redirectToLoginOnce();
    throw new ApiError('Não autenticado.', response.status);
  }

  if (!response.ok) {
    const body = await parseJsonResponse<{ message?: string } & Record<string, unknown>>(response);
    throw new ApiError(body?.message ?? 'Não foi possível baixar a mídia.', response.status, body);
  }

  return response.blob();
}

export function startWhatsAppConversation(payload: {
  whatsAppConnectionId: string;
  clientId?: string;
  phone?: string;
  body: string;
  requestId: string;
}) {
  return apiFetch<StartWhatsAppConversationResult>('/whatsapp/conversations/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function linkWhatsAppConversationClient(id: string, payload: { clientId: string }) {
  return apiFetch<WhatsAppConversation>(`/whatsapp/conversations/${id}/link-client`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function markWhatsAppConversationRead(id: string) {
  return apiFetch<WhatsAppConversation>(`/whatsapp/conversations/${id}/read`, {
    method: 'POST',
  });
}

export function resolveWhatsAppConversation(
  id: string,
  payload: { categoryId?: string; resolutionNote?: string } = {},
) {
  return apiFetch<WhatsAppConversation>(`/whatsapp/conversations/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getWhatsAppActiveAttendance(conversationId: string) {
  return apiFetch<WhatsAppAttendance | null>(
    `/whatsapp/conversations/${conversationId}/attendance`,
  );
}

export function getWhatsAppAttendanceAnalytics(
  filters: {
    connectionId?: string;
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    status?: WhatsAppAttendanceStatus;
  } = {},
) {
  const params = new URLSearchParams();
  if (filters.connectionId) params.set('connectionId', filters.connectionId);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return apiFetch<WhatsAppAttendanceAnalytics>(
    `/whatsapp/attendances/analytics${query ? `?${query}` : ''}`,
    { cache: 'no-store' },
  );
}

export function listWhatsAppConversationAttendances(
  conversationId: string,
  filters: { page?: number; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiFetch<{
    items: WhatsAppAttendance[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>(`/whatsapp/conversations/${conversationId}/attendances${query ? `?${query}` : ''}`);
}

export function listWhatsAppClientAttendances(
  clientId: string,
  filters: { page?: number; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const query = params.toString();
  return apiFetch<{
    items: WhatsAppAttendance[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }>(`/whatsapp/clients/${clientId}/attendances${query ? `?${query}` : ''}`);
}

export function getBillingSummary() {
  return apiFetch<BillingSummary>('/billing/summary');
}

export function getBillingAutomationSettings() {
  return apiFetch<BillingAutomationSettings>('/billing/automation-settings');
}

export function updateBillingAutomationSettings(payload: {
  enabled?: boolean;
  sendTime?: string;
  sendIntervalSeconds?: number;
  timezone?: 'America/Sao_Paulo';
}) {
  return apiFetch<BillingAutomationSettings>('/billing/automation-settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function reconcileBillingReceivables() {
  return apiFetch<ReceivableCycleReport>('/billing/reconcile-receivables', {
    method: 'POST',
  });
}

export function previewCurrentCycleReceivable(clientReferenceId: string) {
  return apiFetch<ReceivableCyclePreview>(
    `/billing/client-references/${clientReferenceId}/current-cycle-receivable/preview`,
  );
}

export function generateCurrentCycleReceivable(clientReferenceId: string) {
  return apiFetch<{ action: 'created' | 'kept'; receivable: unknown }>(
    `/billing/client-references/${clientReferenceId}/current-cycle-receivable`,
    { method: 'POST' },
  );
}

export function listBillingDispatches(
  filters: {
    clientId?: string;
    clientReferenceId?: string;
    status?: MessageDispatch['status'] | '';
    search?: string;
    startDate?: string;
    endDate?: string;
    dueDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedBillingDispatches>(`/billing/dispatches${query ? `?${query}` : ''}`);
}

export function getBillingDispatchSummary(
  filters: {
    clientId?: string;
    clientReferenceId?: string;
    status?: MessageDispatch['status'] | '';
    search?: string;
    startDate?: string;
    endDate?: string;
    dueDate?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);

  const query = params.toString();
  return apiFetch<BillingDispatchSummary>(`/billing/dispatches/summary${query ? `?${query}` : ''}`);
}

export function getBillingDispatch(id: string) {
  return apiFetch<MessageDispatch>(`/billing/dispatches/${id}`);
}

export function reconcileBilling() {
  return apiFetch<{ created: number; kept: number; canceled: number; skipped: number }>(
    '/billing/reconcile',
    { method: 'POST' },
  );
}

export function sendBillingNow(id: string) {
  return apiFetch<{ processed: number; results: MessageDispatch[] }>(
    `/billing/dispatches/${id}/send-now`,
    { method: 'POST' },
  );
}

export function listMessageTemplates() {
  return apiFetch<MessageTemplate[]>('/billing/templates');
}

export function updateMessageTemplate(
  id: string,
  payload: { name?: string; content?: string; active?: boolean },
) {
  return apiFetch<MessageTemplate>(`/billing/templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function previewMessageTemplate(
  id: string,
  payload: {
    content?: string;
    name?: string;
    value?: string;
    dueDate?: string;
    plan?: string;
    reference?: string;
    daysOverdue?: string;
  },
) {
  return apiFetch<{ templateId: string; renderedContent: string }>(
    `/billing/templates/${id}/preview`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}

export function getRecoverySummary() {
  return apiFetch<RecoverySummary>('/recovery/summary');
}

export function getRecoveryAutomationSettings() {
  return apiFetch<RecoveryAutomationSettings>('/recovery/automation-settings');
}

export function updateRecoveryAutomationSettings(
  payload: Partial<
    Pick<
      RecoveryAutomationSettings,
      | 'enabled'
      | 'sendTime'
      | 'timezone'
      | 'sendIntervalSeconds'
      | 'day3Enabled'
      | 'day3OffsetDays'
      | 'day10Enabled'
      | 'day10OffsetDays'
      | 'day15Enabled'
      | 'day15OffsetDays'
      | 'day30Enabled'
      | 'day30OffsetDays'
    >
  >,
) {
  return apiFetch<RecoveryAutomationSettings>('/recovery/automation-settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listRecoveryCampaigns(
  filters: {
    status?: RecoveryCampaignStatus | '';
    search?: string;
    clientId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedRecoveryCampaigns>(`/recovery/campaigns${query ? `?${query}` : ''}`);
}

export function cancelRecoveryCampaign(id: string) {
  return apiFetch<RecoveryCampaign>(`/recovery/campaigns/${id}/cancel`, { method: 'POST' });
}

export function reconcileRecovery() {
  return apiFetch<{ kept: number; created: number; canceled: number; completed: number }>(
    '/recovery/reconcile',
    { method: 'POST' },
  );
}

export function getWhatsAppProviderHealth() {
  return apiFetch<WhatsAppProviderHealth>('/whatsapp/provider/health');
}

export function listWhatsAppPendingContacts(
  filters: {
    status?: WhatsAppPendingContactStatus | '';
    search?: string;
    connectionId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.connectionId) params.set('connectionId', filters.connectionId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedWhatsAppPendingContacts>(
    `/whatsapp/pending-contacts${query ? `?${query}` : ''}`,
  );
}

export function getWhatsAppPendingContactsSummary() {
  return apiFetch<WhatsAppPendingContactsSummary>('/whatsapp/pending-contacts/summary');
}

export function getWhatsAppPendingContact(id: string) {
  return apiFetch<WhatsAppPendingContact>(`/whatsapp/pending-contacts/${id}`);
}

export function ignoreWhatsAppPendingContact(id: string, reason?: string) {
  return apiFetch<WhatsAppPendingContact>(`/whatsapp/pending-contacts/${id}/ignore`, {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function reopenWhatsAppPendingContact(id: string) {
  return apiFetch<WhatsAppPendingContact>(`/whatsapp/pending-contacts/${id}/reopen`, {
    method: 'POST',
  });
}

export function approveWhatsAppPendingContact(
  id: string,
  payload: ApproveWhatsAppPendingContactPayload,
) {
  return apiFetch<Client>(`/whatsapp/pending-contacts/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
