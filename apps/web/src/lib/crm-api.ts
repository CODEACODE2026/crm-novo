import { buildApiUrl } from './api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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
  email: string | null;
  reference: string;
  planId: string;
  recurringValue: string;
  dueDate: string;
  billingNoticeDays: number;
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
export type ReceivablePurpose = 'RENEWAL' | 'INITIAL_ACTIVATION';
export type ReceivableDisplayStatus = ReceivableStatus | 'VENCIDO';
export type FinancialTransactionType = 'ENTRADA' | 'SAIDA';
export type FinancialTransactionOrigin = 'RECEIVABLE_PAYMENT' | 'MANUAL';
export type PaymentIntentStatus =
  'CREATED' | 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELED' | 'FAILED' | 'REFUNDED';
export type PaymentProviderCode = 'MOCK' | 'FASTFLOW' | 'FASTPAY' | 'DEPIX';
export type ReferralStatus = 'PENDING' | 'QUALIFIED' | 'REWARDED' | 'CANCELED';
export type ReferralRewardType = 'FREE_MONTH' | 'CREDIT' | 'CUSTOM';

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
  createdAt: string;
  receivable?: Receivable | null;
}

export interface Receivable {
  id: string;
  clientId: string;
  clientReferenceId?: string;
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
  createdAt: string;
  updatedAt: string;
  client?: Pick<Client, 'id' | 'name' | 'reference'>;
  clientReference?: Pick<ClientReference, 'id' | 'reference' | 'status'> & { planName?: string };
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
  referrerClientId: string;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
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
  referrerClient: ReferralClientSummary;
  rewardLabel: string;
  rewardPreview: {
    referrerStatus: ClientStatus;
    selectedClientReferenceId?: string | null;
    selectedReference?: string | null;
    currentDueDate: string | null;
    newDueDate: string | null;
    requiresClientReferenceSelection?: boolean;
  } | null;
}

export interface ClientReferralReceived {
  id: string;
  referrerClientId: string;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
  rewardValue: string | null;
  rewardDescription: string | null;
  qualifiedAt: string | null;
  appliedAt: string | null;
  canceledAt: string | null;
  referrerClient: Pick<ReferralClientSummary, 'id' | 'name' | 'reference' | 'status'>;
}

export interface ClientReferralsMade {
  total: number;
  qualified: number;
  rewarded: number;
  items: Array<{
    id: string;
    referredClientId: string;
    status: ReferralStatus;
    rewardType: ReferralRewardType;
    rewardValue: string | null;
    rewardDescription: string | null;
    qualifiedAt: string | null;
    appliedAt: string | null;
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
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>;
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
    purpose: 'RENEWAL' | 'INITIAL_ACTIVATION';
  } | null;
}

export interface ReceivableCycleReport {
  counts: Record<ReceivableCycleCode, number>;
  items: ReceivableCycleIssue[];
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

export interface PaginatedBillingDispatches {
  items: MessageDispatch[];
  pagination: PaginatedClients['pagination'];
}

export interface WhatsAppProviderHealth {
  online: boolean;
  version?: string | null;
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

export interface PaginatedClients {
  items: Client[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface RemovalPreview<TTarget> {
  target: TTarget;
  counts: Record<string, number>;
}

export interface ClientOption {
  id: string;
  name: string;
  reference: string;
  phoneNormalized: string;
}

export interface PaginatedReferrals {
  items: Referral[];
  pagination: PaginatedClients['pagination'];
}

export interface ClientPayload {
  name: string;
  phone: string;
  email?: string | undefined;
  reference: string;
  planId: string;
  recurringValue: number;
  dueDate: string;
  billingNoticeDays: number;
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
  email?: string | undefined;
  notes?: string | undefined;
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
  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 401) {
    window.location.assign('/login');
    throw new ApiError('Não autenticado.', response.status);
  }

  if (!response.ok) {
    const body = await parseJsonResponse<{ message?: string }>(response);
    throw new ApiError(body?.message ?? 'Não foi possível concluir a operação.', response.status);
  }

  return (await parseJsonResponse<T>(response)) as T;
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

export function listClientOptions(search: string) {
  const params = new URLSearchParams();
  const trimmedSearch = search.trim();

  if (trimmedSearch) params.set('search', trimmedSearch);

  const query = params.toString();
  return apiFetch<ClientOption[]>(`/clients/options${query ? `?${query}` : ''}`);
}

export function getClient(id: string) {
  return apiFetch<Client>(`/clients/${id}`);
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
    startDate?: string;
    endDate?: string;
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
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedReceivables>(`/receivables${query ? `?${query}` : ''}`);
}

export function getReceivablesSummary(
  filters: {
    clientId?: string;
    clientReferenceId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.clientReferenceId) params.set('clientReferenceId', filters.clientReferenceId);
  if (filters.search) params.set('search', filters.search);
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

export function createReceivablePix(id: string) {
  return apiFetch<PaymentIntent>(`/receivables/${id}/pix`, { method: 'POST' });
}

export function createReceivablesPix(receivableIds: string[]) {
  return apiFetch<PaymentIntent>('/receivables/pix', {
    method: 'POST',
    body: JSON.stringify({ receivableIds }),
  });
}

export function listPaymentIntents(receivableId: string) {
  return apiFetch<PaymentIntent[]>(`/receivables/${receivableId}/payment-intents`);
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

export function listPaymentProviderCredentials() {
  return apiFetch<PaymentProviderCredentialStatus[]>('/payment-provider-credentials');
}

export function savePaymentProviderCredential(payload: {
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>;
  name: string;
  token: string;
}) {
  return apiFetch<PaymentProviderCredentialStatus>('/payment-provider-credentials', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function testPaymentProviderCredential(
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>,
) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/test`,
    { method: 'POST' },
  );
}

export function deactivatePaymentProviderCredential(
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>,
) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/deactivate`,
    { method: 'POST' },
  );
}

export function setDefaultPaymentProvider(
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>,
) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/default`,
    { method: 'POST' },
  );
}

export function savePaymentWebhookSecret(
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>,
  secret: string,
) {
  return apiFetch<PaymentProviderCredentialStatus>(
    `/payment-provider-credentials/${provider}/webhook-secret`,
    {
      method: 'POST',
      body: JSON.stringify({ secret }),
    },
  );
}

export function registerPaymentWebhook(
  provider: Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>,
) {
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
    status?: MessageDispatch['status'] | '';
    search?: string;
    dueDate?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedBillingDispatches>(`/billing/dispatches${query ? `?${query}` : ''}`);
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
