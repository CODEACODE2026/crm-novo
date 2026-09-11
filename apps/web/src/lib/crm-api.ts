import { buildApiUrl } from './api';

export type ClientStatus = 'ATIVO' | 'INATIVO' | 'CANCELADO';

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
  events?: ClientEvent[];
  statusHistory?: ClientStatusHistory[];
  renewals?: Renewal[];
  receivables?: Receivable[];
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
    | 'FINANCIAL_TRANSACTION_CREATED';
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

export type ReceivableStatus = 'PENDENTE' | 'PAGO' | 'CANCELADO';
export type ReceivableDisplayStatus = ReceivableStatus | 'VENCIDO';
export type FinancialTransactionType = 'ENTRADA' | 'SAIDA';
export type FinancialTransactionOrigin = 'RECEIVABLE_PAYMENT' | 'MANUAL';

export interface Renewal {
  id: string;
  clientId: string;
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
  renewalId: string;
  description: string;
  amount: string;
  dueDate: string;
  status: ReceivableStatus;
  displayStatus: ReceivableDisplayStatus;
  paidAt: string | null;
  canceledAt: string | null;
  cancelReason?: string | null;
  paymentTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  client?: Pick<Client, 'id' | 'name' | 'reference'>;
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
  whatsAppConnectionId: string;
  phone: string;
  body: string;
  origin: 'MANUAL' | 'BILLING' | 'RECOVERY';
  status: 'PENDING' | 'SENT' | 'FAILED';
  requestId: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  client: Pick<Client, 'id' | 'name' | 'reference'> | null;
  connection: Pick<WhatsAppConnection, 'id' | 'name' | 'provider'> | null;
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
}

export interface PlanPayload {
  name: string;
  durationMonths: number;
  defaultValue: number;
  active?: boolean | undefined;
}

export interface ClientListFilters {
  search?: string | undefined;
  status?: ClientStatus | '' | undefined;
  planId?: string | undefined;
}

export interface RenewalPreview {
  clientId: string;
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
  renewal: Renewal;
  receivable: Receivable;
  newDueDate: string;
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
    throw new Error('Nao autenticado.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Nao foi possivel concluir a operacao.');
  }

  return (await response.json()) as T;
}

export function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value));
}

export function formatDate(value: string) {
  const [year, month, day] = value.split('-');
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

  if (filters.search) params.set('search', filters.search);
  if (filters.status) params.set('status', filters.status);
  if (filters.planId) params.set('planId', filters.planId);

  const query = params.toString();
  return apiFetch<PaginatedClients>(`/clients${query ? `?${query}` : ''}`);
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

export function updateClient(id: string, payload: ClientPayload) {
  return apiFetch<Client>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateClientStatus(id: string, status: ClientStatus, reason?: string) {
  return apiFetch<Client>(`/clients/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });
}

export function previewRenewal(clientId: string, payload: { planId: string; amount: number }) {
  return apiFetch<RenewalPreview>(`/clients/${clientId}/renewals/preview`, {
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

export function getFinancialSummary() {
  return apiFetch<FinancialSummary>('/finance/summary');
}

export function getDashboardSummary(filters: { startDate?: string; endDate?: string } = {}) {
  const params = new URLSearchParams();

  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);

  const query = params.toString();
  return apiFetch<DashboardSummary>(`/dashboard/summary${query ? `?${query}` : ''}`);
}

export function listReceivables(
  filters: {
    status?: ReceivableDisplayStatus | '';
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));

  const query = params.toString();
  return apiFetch<PaginatedReceivables>(`/receivables${query ? `?${query}` : ''}`);
}

export function payReceivable(
  id: string,
  payload: { paymentDate: string; categoryId?: string; notes?: string },
) {
  return apiFetch<FinancialTransaction>(`/receivables/${id}/payment`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const params = new URLSearchParams();

  if (filters.type) params.set('type', filters.type);
  if (filters.origin) params.set('origin', filters.origin);
  if (filters.search) params.set('search', filters.search);
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
