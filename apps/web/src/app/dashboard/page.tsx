'use client';

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  ArrowRight,
  ArrowLeft,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  CreditCard,
  Download,
  DollarSign,
  Eye,
  EyeOff,
  Filter,
  FileText,
  Gift,
  Globe2,
  History,
  Inbox,
  Info,
  LayoutDashboard,
  Layers,
  ListChecks,
  Mail,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Minus,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCcw,
  RefreshCw,
  Receipt,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Timer,
  Trash2,
  ToggleLeft,
  Upload,
  UserRound,
  UserRoundPlus,
  UserCheck,
  UsersRound,
  UserPlus,
  UserX,
  Users,
  Wifi,
  WifiOff,
  Workflow,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
  type AuthenticatedUser,
} from '@crm-novo/shared';
import { buildApiUrl } from '../../lib/api';
import { ClientForm } from '../../components/clients/client-form';
import { ClientReferralSelect } from '../../components/clients/client-referral-select';
import { StatusBadge } from '../../components/clients/status-badge';
import {
  clientInitial,
  clientNextDueSummary,
  clientOperationalSummary,
  clientReferenceStatusSummary,
  clientPlanSummary,
  clientReferenceCountLabel,
  clientReferenceSummary,
  dispatchTotalAmountLabel,
  dispatchReferenceSummaryFromDispatch,
  dispatchStatusTone,
  referenceStatusRequiresReason,
  receivableStatusTone,
  receivableVisualStatus,
} from '../../components/clients/client-ui-helpers';
import { PlanForm } from '../../components/plans/plan-form';
import { AdminShell, PageHeader } from '../../components/ui/admin-shell';
import {
  ActionMenu,
  Button,
  Card,
  IconButton,
  PaginationControls,
  SectionHeader,
  StatCard,
} from '../../components/ui/primitives';
import {
  ApiError,
  activateLegacyCutover,
  cancelReceivable,
  cancelPaymentIntent,
  confirmMockPaymentIntent,
  confirmRenewalReversal,
  confirmReferenceRenewal,
  createClient,
  createClientReference,
  createFinancialCategory,
  createManualCharge,
  createManualEntry,
  createManualExpense,
  createReferenceReactivation,
  createReceivablePix,
  createReceivablesPix,
  createPlan,
  deleteClient,
  deleteClientReference,
  deletePlan,
  deleteFinancialCategory,
  deleteFinancialTransaction,
  formatCurrency,
  formatDate,
  getClient,
  getClientEvents,
  getDashboardSummary,
  getReport,
  getFinancialSummary,
  getPaymentIntentsSummary,
  getReceivablesSummary,
  getWhatsAppConnection,
  getWhatsAppPendingContact,
  getWhatsAppPendingContactsSummary,
  getWhatsAppProviderHealth,
  getWhatsAppQrCode,
  getWhatsAppWebhook,
  ignoreWhatsAppPendingContact,
  listFinancialCategories,
  listClients,
  listFinancialTransactions,
  listPaymentProviderCredentials,
  listPlans,
  listPaymentIntents,
  listReceivables,
  listWhatsAppPendingContacts,
  listWhatsAppMessages,
  downloadReportCsv,
  logoutWhatsApp,
  payReceivable,
  payReceivables,
  importLegacyClients,
  importLegacyPayments,
  previewLegacyCutover,
  previewLegacyClients,
  previewLegacyPayments,
  previewDeleteClient,
  previewDeleteClientReference,
  previewReferenceRenewal,
  previewRenewalReversal,
  previewReceivablePixReconciliation,
  refreshWhatsAppStatus,
  reconcileReceivablePix,
  reopenWhatsAppPendingContact,
  sendWhatsAppMessage,
  updateClient,
  updateClientReference,
  updateClientReferenceStatus,
  updateFinancialCategory,
  updateFinancialTransaction,
  updatePlan,
  connectWhatsApp,
  createWhatsAppConnection,
  disconnectWhatsApp,
  configureWhatsAppWebhook,
  approveWhatsAppPendingContact,
  applyReferralReward,
  cancelRecoveryCampaign,
  cancelReferral,
  getBillingAutomationSettings,
  getBillingDispatch,
  getBillingDispatchSummary,
  getBillingSummary,
  generateCurrentCycleReceivable,
  getHealthStatus,
  getRecoverySummary,
  getRecoveryAutomationSettings,
  getReferral,
  getReferralSummary,
  listBillingDispatches,
  listMessageTemplates,
  listRecoveryCampaigns,
  listReferrals,
  previewMessageTemplate,
  previewCurrentCycleReceivable,
  previewReceivablePixReplacement,
  previewReceivablePixReplacementRecovery,
  recoverReceivablePixReplacement,
  reconcileBilling,
  reconcileBillingReceivables,
  reconcileRecovery,
  replaceReceivablesPix,
  replaceReceivablePix,
  sendBillingNow,
  sendPaymentIntentWhatsApp,
  savePaymentProviderCredential,
  setDefaultPaymentProvider,
  testPaymentProviderCredential,
  updateMessageTemplate,
  updateBillingAutomationSettings,
  updateRecoveryAutomationSettings,
  syncPaymentIntent,
  deactivatePaymentProviderCredential,
  registerPaymentWebhook,
  type BillingSummary,
  type BillingDispatchSummary,
  type BillingAutomationSettings,
  type ActivePixConflictPayload,
  type Client,
  type ClientEvent,
  type ClientPayload,
  type ClientReference,
  type ClientStatus,
  type ClientUpdatePayload,
  type DashboardSummary as DashboardSummaryPayload,
  type FinancialCategory,
  type FinancialPaymentMethod,
  type FinancialSummary,
  type FinancialTransaction,
  type FinancialTransactionOrigin,
  type FinancialTransactionPayload,
  type FinancialTransactionType,
  type HealthStatus,
  type LegacyCutoverPreview,
  type LegacyCutoverPreviewClassification,
  type LegacyCutoverPreviewRow,
  type LegacyImportClassification,
  type LegacyImportPlanCycle,
  type LegacyImportPlanMapping,
  type LegacyImportPreview,
  type LegacyImportPreviewRow,
  type LegacyImportResult,
  type LegacyPaymentPreview,
  type LegacyPaymentPreviewClassification,
  type LegacyPaymentPreviewRow,
  type PaginatedClients,
  type PaginatedClientEvents,
  type PaymentIntent,
  type PaymentIntentsSummary,
  type PaymentIntentStatus,
  type PaymentProviderCredentialStatus,
  type PaymentProviderCode,
  type PixReconciliationPreview,
  type PixWhatsAppSendResult,
  type PixReplacementRecoveryPreview,
  type PixReplacementPreview,
  type Receivable,
  type ReceivableDisplayStatus,
  type ReceivablesSummary,
  type ReactivationResult,
  type OperationalReport,
  type Plan,
  type ReportFilters,
  type ReportType,
  type Renewal,
  type RenewalPreview,
  type RenewalRevertPreview,
  type MessageDispatch,
  type MessageTemplate,
  type RecoveryCampaign,
  type RecoveryAutomationSettings,
  type RecoveryCampaignStatus,
  type RecoverySummary,
  type Referral,
  type ReferralStatus,
  type ReferralSummary,
  type WhatsAppConnection,
  type WhatsAppInboundMessageType,
  type WhatsAppPendingContact,
  type WhatsAppPendingContactStatus,
  type WhatsAppPendingContactsSummary,
  type WhatsAppProviderHealth,
} from '../../lib/crm-api';
import { readLegacyImportJsonFile } from '../../lib/legacy-import-file';
import {
  canStartWhatsAppAction,
  extractWebhookUrl,
  maskProviderUserId,
  normalizeWhatsAppDisplayPhone,
} from '../../lib/whatsapp-actions';
import {
  createWhatsAppQrPoller,
  startWhatsAppConnectionFlow,
  syncWhatsAppConnectionStatus,
  type WhatsAppQrPoller,
  whatsappQrStatus,
} from '../../lib/whatsapp-connection-flow';
import {
  billingMessageTemplates,
  messageTemplateTypeLabel,
  recoveryMessageTemplates,
  recoveryTemplateCards,
  removalCountLabel,
  reportSummaryLabel,
} from '../../lib/display-labels';
import {
  buildFinancialCategoryCreatePayload,
  filterFinancialCategories,
  financialCategoryTypeLabel,
  getFinancialCategoryFormState,
  summarizeFinancialCategories,
  type FinancialCategoryStatusFilter,
} from '../../lib/financial-categories';
import { sortPlansByDuration } from '../../lib/plan-utils';

type View =
  | 'dashboard'
  | 'clients'
  | 'finance'
  | 'plans'
  | 'whatsapp'
  | 'waitlist'
  | 'referrals'
  | 'billing'
  | 'automations'
  | 'reports'
  | 'imports'
  | 'settings';

type ClientDetailTab = 'overview' | 'references' | 'receivables' | 'messages' | 'timeline' | 'more';

type ClientDetailTabRequest = {
  tab: ClientDetailTab;
  receivable?: Receivable;
  sequence: number;
};
type FinanceTab = 'summary' | 'receivables' | 'entries' | 'expenses';
type FinanceQuickFilterId =
  'today' | 'pendingToday' | 'receivedToday' | 'overdue' | 'nextSevenDays';

function pendingReactivationFromError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (typeof error.payload !== 'object' || error.payload === null || Array.isArray(error.payload)) {
    return null;
  }

  const payload = error.payload as { code?: unknown; reactivation?: unknown };

  if (payload.code !== 'PENDING_REACTIVATION_EXISTS') return null;
  if (
    typeof payload.reactivation !== 'object' ||
    payload.reactivation === null ||
    Array.isArray(payload.reactivation)
  ) {
    return null;
  }

  return payload.reactivation as ReactivationResult;
}

function shortEntityId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'referrals', label: 'Indicações', icon: Gift },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'plans', label: 'Planos', icon: ToggleLeft },
  { id: 'billing', label: 'Cobranças', icon: Bell },
  { id: 'automations', label: 'Automações', icon: Activity },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'imports', label: 'Importação', icon: FileText },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'waitlist', label: 'Lista de Espera', icon: ListChecks },
  { id: 'settings', label: 'Configurações', icon: Settings },
] satisfies Array<{ id: View; label: string; icon: typeof LayoutDashboard }>;

const futureNavItems = [{ label: 'Renovações', icon: RefreshCcw }];
const listPageSize = 10;
const clientFinancePageSize = 20;
const monthNamesPt = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const shortMonthNamesPt = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

type DashboardPeriodMode = 'today' | 'current' | 'previous' | 'last30' | 'custom';

const dashboardPeriodOptions = [
  { value: 'today', label: 'Hoje' },
  { value: 'current', label: 'Mês atual' },
  { value: 'previous', label: 'Mês anterior' },
  { value: 'last30', label: 'Últimos 30 dias' },
  { value: 'custom', label: 'Personalizado' },
] satisfies Array<{ value: DashboardPeriodMode; label: string }>;

const dashboardPeriodLabels: Record<string, string> = {
  hoje: 'Hoje',
  mes_atual: 'Mês atual',
  mes_anterior: 'Mês anterior',
  ultimos_30_dias: 'Últimos 30 dias',
  periodo_personalizado: 'Período personalizado',
};

type FinancePeriod = {
  endDate: string;
  label: string;
  monthStart: Date;
  startDate: string;
};

type RenewalTarget = {
  client: Client;
  reference: ClientReference;
};

type ReactivationTarget = {
  client: Client;
  reference: ClientReference;
};

type RenewalReversalTarget = {
  client: Client;
  renewal: Renewal;
  preview: RenewalRevertPreview;
};

type DeletionDialogTarget =
  | {
      kind: 'client';
      client: Client;
      preview: Awaited<ReturnType<typeof previewDeleteClient>>;
    }
  | {
      kind: 'reference';
      client: Client;
      reference: ClientReference;
      preview: Awaited<ReturnType<typeof previewDeleteClientReference>>;
    };

export default function DashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientsPayload, setClientsPayload] = useState<PaginatedClients | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [financeInitialTab, setFinanceInitialTab] = useState<FinanceTab>('summary');
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection>('overview');
  const [settingsInitialBillingTab, setSettingsInitialBillingTab] =
    useState<SettingsBillingTab>('rules');
  const [clientDetailTabRequest, setClientDetailTabRequest] =
    useState<ClientDetailTabRequest | null>(null);
  const [renewalTarget, setRenewalTarget] = useState<RenewalTarget | null>(null);
  const [reactivationTarget, setReactivationTarget] = useState<ReactivationTarget | null>(null);
  const [renewalReversalTarget, setRenewalReversalTarget] = useState<RenewalReversalTarget | null>(
    null,
  );
  const [renewalReversalPreviewLoadingId, setRenewalReversalPreviewLoadingId] = useState<
    string | null
  >(null);
  const [deletionTarget, setDeletionTarget] = useState<DeletionDialogTarget | null>(null);
  const [renewalNotice, setRenewalNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [planId, setPlanId] = useState('');
  const [clientsPage, setClientsPage] = useState(1);
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

  const clients = clientsPayload?.items ?? [];

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setError('');

    try {
      const [nextPlans, nextClients] = await Promise.all([
        listPlans(),
        listClients({
          page: clientsPage,
          pageSize: listPageSize,
          search: search.trim() || undefined,
          status,
          planId: planId || undefined,
        }),
      ]);

      setPlans(nextPlans);
      setClientsPayload(nextClients);
      if (
        !nextClients.items.length &&
        nextClients.pagination.page > 1 &&
        nextClients.pagination.total > 0
      ) {
        setClientsPage(Math.max(1, nextClients.pagination.totalPages));
      }
      setSelectedClient((current) => {
        if (!current) return null;
        return nextClients.items.some((client) => client.id === current.id) ? current : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar clientes e planos.');
    } finally {
      setDataLoading(false);
    }
  }, [clientsPage, planId, search, status]);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch(buildApiUrl('/auth/me'), { credentials: 'include' });

        if (!response.ok) {
          window.location.assign('/login');
          return;
        }

        const payload = (await response.json()) as { user: AuthenticatedUser };
        setUser(payload.user);
      } catch {
        window.location.assign('/login');
      } finally {
        setLoadingSession(false);
      }
    }

    void loadSession();
  }, []);

  useEffect(() => {
    if (!loadingSession && user) {
      void loadData();
    }
  }, [loadData, loadingSession, user]);

  async function reloadAfterMutation() {
    await loadData();
    setClientFormOpen(false);
    setPlanFormOpen(false);
    setEditingClient(null);
    setEditingPlan(null);
  }

  function resetClientDetailState() {
    setSelectedClient(null);
    setEditingClient(null);
    setClientFormOpen(false);
    setRenewalTarget(null);
    setReactivationTarget(null);
    setRenewalReversalTarget(null);
    setRenewalReversalPreviewLoadingId(null);
    setDeletionTarget(null);
    setClientDetailTabRequest(null);
    setRenewalNotice('');
  }

  function resetClientListState() {
    setSearch('');
    setStatus('');
    setPlanId('');
    setClientsPage(1);
  }

  function resetClientModuleState() {
    resetClientDetailState();
    resetClientListState();
  }

  function handlePrimaryNavigation(nextView: View) {
    if (nextView === 'clients') {
      resetClientModuleState();
    } else if (view === 'clients') {
      resetClientDetailState();
    }

    if (nextView === 'settings') {
      setSettingsInitialSection('overview');
    }

    setView(nextView);
  }

  async function handleReferenceStatusChange(
    reference: ClientReference,
    nextStatus: ClientStatus,
    reasonOverride?: string,
  ) {
    if (!selectedClient) return;

    const actionLabel =
      nextStatus === 'INATIVO' ? 'inativar' : nextStatus === 'CANCELADO' ? 'cancelar' : 'ativar';
    const requiresReason = referenceStatusRequiresReason(nextStatus);
    const reason = reasonOverride;

    if (requiresReason && !reason?.trim()) {
      setError('Motivo obrigatório para inativar ou cancelar referência.');
      return;
    }

    const confirmed =
      reasonOverride ||
      window.confirm(
        [
          `${actionLabel[0]?.toUpperCase()}${actionLabel.slice(1)} referência?`,
          `Referência: ${reference.reference}`,
          `Cliente: ${selectedClient.name}`,
          `Status atual: ${reference.status}`,
          `Novo status: ${nextStatus}`,
        ]
          .filter(Boolean)
          .join('\n'),
      );

    if (!confirmed) {
      return;
    }

    await updateClientReferenceStatus(reference.id, nextStatus, reason?.trim() || undefined);
    const detailed = await getClient(selectedClient.id);
    setSelectedClient(detailed);
    await loadData();
  }

  async function handleRemoveReference(reference: ClientReference) {
    if (!selectedClient) return;

    const preview = await previewDeleteClientReference(reference.id);
    setDeletionTarget({ kind: 'reference', client: selectedClient, reference, preview });
  }

  async function handleRemoveClient(client: Client) {
    const preview = await previewDeleteClient(client.id);
    setDeletionTarget({ kind: 'client', client, preview });
  }

  async function confirmDeletion(target: DeletionDialogTarget) {
    if (target.kind === 'reference') {
      await deleteClientReference(target.reference.id, 'REMOVER');
      const detailed = await getClient(target.client.id);
      setSelectedClient(detailed);
      setRenewalNotice('Referência removida com segurança.');
      setDeletionTarget(null);
      await loadData();
      return;
    }

    await deleteClient(target.client.id, 'REMOVER');
    setSelectedClient(null);
    setRenewalNotice('Cliente removido com segurança.');
    setDeletionTarget(null);
    await loadData();
  }

  function openReferenceLifecycleAction(client: Client, reference?: ClientReference) {
    const selectedReference =
      reference ?? (client.references?.length === 1 ? client.references[0] : null);

    if (!selectedReference) {
      setSelectedClient(client);
      setView('clients');
      setRenewalNotice('Selecione uma referência específica para renovar.');
      return;
    }

    setRenewalNotice('');

    if (isReactivationReference(selectedReference)) {
      setReactivationTarget({ client, reference: selectedReference });
      return;
    }

    setRenewalTarget({ client, reference: selectedReference });
  }

  async function handleRenewalConfirm(
    target: RenewalTarget,
    payload: { planId: string; amount: number; idempotencyKey: string },
  ) {
    const result = await confirmReferenceRenewal(target.reference.id, payload);
    await loadData();
    const detailed = await getClient(target.client.id);
    setSelectedClient(detailed);
    setRenewalTarget(null);
    setRenewalNotice(
      `Referência ${target.reference.reference} renovada com sucesso. Novo vencimento: ${formatDate(result.newDueDate)}. Conta a receber criada: ${formatCurrency(result.receivable.amount)}.`,
    );
  }

  async function handleReactivationConfirm(
    target: ReactivationTarget,
    payload: { planId: string; amount: number; activationDate: string; idempotencyKey: string },
  ) {
    const result = await createReferenceReactivation(target.reference.id, payload);
    await loadData();
    const detailed = await getClient(target.client.id);
    setSelectedClient(detailed);
    setReactivationTarget(null);
    setRenewalNotice(
      `Reativação da referência ${target.reference.reference} criada e aguardando pagamento. A referência continua CANCELADA; gere o PIX manualmente em Cobranças/PIX. Conta a receber criada: ${formatCurrency(result.receivable.amount)}.`,
    );
  }

  async function openPendingReactivationBilling(reactivation: ReactivationResult) {
    await loadData();
    const detailed = await getClient(reactivation.clientId);
    setSelectedClient(detailed);
    setView('clients');
    setReactivationTarget(null);
    setClientDetailTabRequest({ tab: 'messages', sequence: Date.now() });
    setRenewalNotice(
      `Reativação aguardando pagamento para ${reactivation.clientReference.reference}. Cobrança existente: ${formatCurrency(reactivation.receivable.amount)} com vencimento em ${formatDate(reactivation.receivable.dueDate)}.`,
    );
  }

  async function openPendingReactivationPix(reactivation: ReactivationResult) {
    await loadData();
    const detailed = await getClient(reactivation.clientId);
    setSelectedClient(detailed);
    setView('clients');
    setReactivationTarget(null);
    setClientDetailTabRequest({
      receivable: reactivation.receivable,
      sequence: Date.now(),
      tab: 'receivables',
    });
    setRenewalNotice(
      `Reutilizando a cobrança existente da reativação ${reactivation.clientReference.reference}. Nenhuma nova reativação ou conta a receber foi criada.`,
    );
  }

  async function openRenewalReversal(client: Client, renewal: Renewal) {
    if (!renewal.clientReferenceId) {
      setRenewalNotice('Renovação sem referência vinculada para reversão.');
      return;
    }

    setRenewalNotice('');
    setRenewalReversalPreviewLoadingId(renewal.id);

    try {
      const preview = await previewRenewalReversal(renewal.clientReferenceId, renewal.id);
      setRenewalReversalTarget({ client, renewal, preview });
    } catch (err) {
      setRenewalNotice(
        err instanceof Error ? err.message : 'Não foi possível carregar a prévia da reversão.',
      );
    } finally {
      setRenewalReversalPreviewLoadingId(null);
    }
  }

  async function handleRenewalReversalConfirm(
    target: RenewalReversalTarget,
    payload: { reason: string; idempotencyKey: string },
  ) {
    if (!target.renewal.clientReferenceId) {
      throw new Error('Renovação sem referência vinculada para reversão.');
    }

    const result = await confirmRenewalReversal(
      target.renewal.clientReferenceId,
      target.renewal.id,
      payload,
    );
    await loadData();
    const detailed = await getClient(target.client.id);
    setSelectedClient(detailed);
    setRenewalReversalTarget(null);
    const successPrefix = result.idempotentReplay
      ? 'Renovação desfeita com sucesso.'
      : 'Renovação desfeita com sucesso.';
    setRenewalNotice(
      `${successPrefix} Referência restaurada para ${formatDate(result.reference.dueDate)}.`,
    );
  }

  if (loadingSession) {
    return (
      <main className="login-page">
        <section className="login-panel">Carregando area administrativa...</section>
      </main>
    );
  }

  return (
    <AdminShell
      activeId={view}
      collapsed={sidebarCollapsed}
      disabledItems={futureNavItems}
      items={navItems}
      subtitle={viewSubtitle(view)}
      title={viewTitle(view)}
      userName={user?.name}
      onNavigate={handlePrimaryNavigation}
      onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
    >
      {error ? <div className="notice danger">{error}</div> : null}
      {view === 'dashboard' ? (
        <OperationalDashboard
          onNewClient={() => {
            setEditingClient(null);
            setClientFormOpen(true);
            setView('clients');
          }}
          onOpenClient={async (id) => {
            const client = await getClient(id);
            setSelectedClient(client);
            setView('clients');
          }}
          onOpenFinance={(tab) => {
            setFinanceInitialTab(tab);
            setView('finance');
          }}
          onOpenOperationalView={(nextView) => setView(nextView)}
          onRenew={async (id, clientReferenceId) => {
            const client = await getClient(id);
            const reference = client.references?.find((item) => item.id === clientReferenceId);
            openReferenceLifecycleAction(client, reference);
          }}
        />
      ) : null}
      {view === 'clients' ? (
        <ClientsView
          clientFormOpen={clientFormOpen}
          clients={clients}
          clientsPagination={clientsPayload?.pagination ?? null}
          dataLoading={dataLoading}
          detailTabRequest={clientDetailTabRequest}
          editingClient={editingClient}
          onApplyFilters={() => void loadData()}
          onCreate={async (payload) => {
            const client = await createClient(payload);
            setSelectedClient(client);
            await reloadAfterMutation();
          }}
          onEdit={(client) => {
            setEditingClient(client);
            setClientFormOpen(true);
          }}
          onNew={() => {
            setEditingClient(null);
            setClientFormOpen(true);
          }}
          onReferenceLifecycleAction={openReferenceLifecycleAction}
          onRevertRenewal={(client, renewal) => void openRenewalReversal(client, renewal)}
          onCreateReference={async (client, payload) => {
            const reference = await createClientReference(client.id, payload);
            const detailed = await getClient(client.id);
            setSelectedClient(detailed);
            setRenewalNotice(
              `Referência ${reference.reference} criada aguardando pagamento. Gere o PIX manualmente em Cobranças/PIX; o Billing automático começa somente no próximo ciclo após o pagamento.`,
            );
            await loadData();
          }}
          onUpdateReference={async (reference, payload) => {
            await updateClientReference(reference.id, payload);
            const detailed = await getClient(reference.clientId);
            setSelectedClient(detailed);
            await loadData();
          }}
          onCloseForm={() => {
            setClientFormOpen(false);
            setEditingClient(null);
          }}
          onSelect={async (client) => {
            const detailed = await getClient(client.id);
            setSelectedClient(detailed);
          }}
          onClearSelection={() => setSelectedClient(null)}
          onRemoveClient={(client) => void handleRemoveClient(client)}
          onRemoveReference={(reference) => void handleRemoveReference(reference)}
          onReferenceStatusChange={(reference, nextStatus, reason) =>
            void handleReferenceStatusChange(reference, nextStatus, reason)
          }
          onClientsPageChange={setClientsPage}
          onFinancialMutation={async (clientId) => {
            const detailed = await getClient(clientId);
            setSelectedClient(detailed);
            await loadData();
          }}
          onWhatsAppSent={async (clientId) => {
            const detailed = await getClient(clientId);
            setSelectedClient(detailed);
          }}
          onUpdate={async (payload) => {
            if (!editingClient) return;
            const client = await updateClient(editingClient.id, payload);
            setSelectedClient(client);
            await reloadAfterMutation();
          }}
          planId={planId}
          plans={plans}
          search={search}
          selectedClient={selectedClient}
          setPlanId={(value) => {
            setPlanId(value);
            setClientsPage(1);
          }}
          setSearch={(value) => {
            setSearch(value);
            setClientsPage(1);
          }}
          setStatus={(value) => {
            setStatus(value);
            setClientsPage(1);
          }}
          status={status}
          renewalNotice={renewalNotice}
          renewalReversalPreviewLoadingId={renewalReversalPreviewLoadingId}
        />
      ) : null}
      {view === 'finance' ? <FinanceView clients={clients} initialTab={financeInitialTab} /> : null}
      {view === 'referrals' ? <ReferralsView clients={clients} /> : null}
      {view === 'plans' ? (
        <PlansView
          editingPlan={editingPlan}
          onCreate={async (payload) => {
            await createPlan(payload);
            await reloadAfterMutation();
          }}
          onDelete={async (id) => {
            await deletePlan(id);
            await reloadAfterMutation();
          }}
          onEdit={(plan) => {
            setEditingPlan(plan);
            setPlanFormOpen(true);
          }}
          onNew={() => {
            setEditingPlan(null);
            setPlanFormOpen(true);
          }}
          onCloseForm={() => {
            setEditingPlan(null);
            setPlanFormOpen(false);
          }}
          onUpdate={async (payload) => {
            if (!editingPlan) return;
            await updatePlan(editingPlan.id, payload);
            await reloadAfterMutation();
          }}
          planFormOpen={planFormOpen}
          plans={plans}
        />
      ) : null}
      {view === 'whatsapp' ? <WhatsAppView /> : null}
      {view === 'billing' ? <BillingView /> : null}
      {view === 'automations' ? (
        <AutomationsView
          onOpenBillingSettings={(tab = 'rules') => {
            setSettingsInitialSection('billing');
            setSettingsInitialBillingTab(tab);
            setView('settings');
          }}
        />
      ) : null}
      {view === 'reports' ? <ReportsView clients={clients} plans={plans} /> : null}
      {view === 'imports' ? <LegacyImportPreviewView plans={plans} /> : null}
      {view === 'settings' ? (
        <SettingsView
          initialBillingTab={settingsInitialBillingTab}
          initialSection={settingsInitialSection}
          onOpenAutomations={() => setView('automations')}
          onOpenFinance={() => setView('finance')}
          onOpenWhatsApp={() => setView('whatsapp')}
        />
      ) : null}
      {view === 'waitlist' ? (
        <WaitlistView
          plans={plans}
          onClientCreated={async (client) => {
            await loadData();
            setSelectedClient(client);
            setView('clients');
          }}
        />
      ) : null}
      {renewalTarget ? (
        <RenewalModal
          target={renewalTarget}
          plans={plans.filter((plan) => plan.active || plan.id === renewalTarget.reference.planId)}
          onClose={() => setRenewalTarget(null)}
          onConfirm={async (payload) => handleRenewalConfirm(renewalTarget, payload)}
        />
      ) : null}
      {reactivationTarget ? (
        <ReactivationModal
          target={reactivationTarget}
          plans={plans.filter((plan) => plan.active)}
          onClose={() => setReactivationTarget(null)}
          onConfirm={async (payload) => handleReactivationConfirm(reactivationTarget, payload)}
          onGeneratePix={openPendingReactivationPix}
          onGoToBilling={openPendingReactivationBilling}
        />
      ) : null}
      {renewalReversalTarget ? (
        <RenewalReversalModal
          target={renewalReversalTarget}
          onClose={() => setRenewalReversalTarget(null)}
          onConfirm={async (payload) =>
            handleRenewalReversalConfirm(renewalReversalTarget, payload)
          }
        />
      ) : null}
      {deletionTarget ? (
        <DeletionConfirmationModal
          target={deletionTarget}
          onClose={() => setDeletionTarget(null)}
          onConfirm={confirmDeletion}
        />
      ) : null}
    </AdminShell>
  );
}

function viewTitle(view: View) {
  const labels = {
    automations: 'Automações',
    billing: 'Cobranças',
    clients: 'Clientes',
    dashboard: 'Dashboard',
    finance: 'Financeiro',
    imports: 'Importação',
    plans: 'Planos',
    referrals: 'Indicações',
    reports: 'Relatórios',
    settings: 'Configurações',
    waitlist: 'Lista de Espera',
    whatsapp: 'WhatsApp',
  } satisfies Record<View, string>;

  return labels[view];
}

function viewSubtitle(view: View) {
  const subtitles = {
    automations: 'Rotinas operacionais e recuperação',
    billing: 'Cobranças, envios e acompanhamento',
    clients: 'Base de clientes, referências e histórico',
    dashboard: 'Visão operacional do dia e do período',
    finance: 'Receitas, despesas e contas a receber',
    imports: 'Preview temporário da migração legado',
    plans: 'Planos comerciais e recorrências',
    referrals: 'Indicações, benefícios e recompensas',
    reports: 'Exportações e análises administrativas',
    settings: 'Configurações técnicas do CRM',
    waitlist: 'Contatos recebidos pelo WhatsApp aguardando atendimento.',
    whatsapp: 'Conexão e mensagens operacionais',
  } satisfies Record<View, string>;

  return subtitles[view];
}

const legacyImportClassificationLabels = {
  CONFLICT: 'Conflito',
  INVALID: 'Inválido',
  POSSIBLE_MATCH: 'Possível match',
  READY_CREATE: 'Pronto criar',
  READY_UPDATE: 'Pronto atualizar',
  SKIPPED_NOT_ACTIVE: 'Fora da migração',
  UNCHANGED: 'Sem alteração',
} satisfies Record<LegacyImportClassification, string>;

const legacyImportClassificationTone = {
  CONFLICT: 'danger',
  INVALID: 'danger',
  POSSIBLE_MATCH: 'warning',
  READY_CREATE: 'success',
  READY_UPDATE: 'info',
  SKIPPED_NOT_ACTIVE: 'muted',
  UNCHANGED: 'muted',
} satisfies Record<LegacyImportClassification, string>;

const legacyImportFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'READY_CREATE', label: 'Criar' },
  { id: 'READY_CREATE_ACTIVE', label: 'Ativos' },
  { id: 'READY_CREATE_CANCELED', label: 'Históricos cancelados' },
  { id: 'READY_UPDATE', label: 'Atualizar' },
  { id: 'UNCHANGED', label: 'Sem alteração' },
  { id: 'POSSIBLE_MATCH', label: 'Matches' },
  { id: 'SKIPPED_NOT_ACTIVE', label: 'Fora da migração' },
  { id: 'CONFLICT', label: 'Conflitos' },
  { id: 'INVALID', label: 'Inválidos' },
] satisfies Array<{
  id: LegacyImportClassification | 'all' | 'READY_CREATE_ACTIVE' | 'READY_CREATE_CANCELED';
  label: string;
}>;

const legacyPaymentClassificationLabels = {
  CLIENT_NOT_IMPORTED: 'Cliente não importado',
  CONFLICT: 'Conflito',
  INVALID: 'Inválido',
  PENDING_NOT_SUPPORTED: 'Pendente',
  READY_PAID_HISTORY: 'Pronto histórico',
  UNCHANGED: 'Sem alteração',
  UNSUPPORTED: 'Não suportado',
} satisfies Record<LegacyPaymentPreviewClassification, string>;

const legacyPaymentClassificationTone = {
  CLIENT_NOT_IMPORTED: 'warning',
  CONFLICT: 'danger',
  INVALID: 'danger',
  PENDING_NOT_SUPPORTED: 'warning',
  READY_PAID_HISTORY: 'success',
  UNCHANGED: 'muted',
  UNSUPPORTED: 'warning',
} satisfies Record<LegacyPaymentPreviewClassification, string>;

const legacyPaymentFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'READY_PAID_HISTORY', label: 'Prontos' },
  { id: 'UNCHANGED', label: 'Sem alteração' },
  { id: 'CLIENT_NOT_IMPORTED', label: 'Cliente não importado' },
  { id: 'PENDING_NOT_SUPPORTED', label: 'Pendentes' },
  { id: 'UNSUPPORTED', label: 'Não suportados' },
  { id: 'CONFLICT', label: 'Conflitos' },
  { id: 'INVALID', label: 'Inválidos' },
] satisfies Array<{ id: LegacyPaymentPreviewClassification | 'all'; label: string }>;

const legacyCutoverClassificationLabels = {
  CONFLICT: 'Conflito',
  HISTORICAL_CANCELED: 'Histórico cancelado',
  INVALID: 'Inválido',
  READY: 'Pronta',
  SKIPPED_NOT_ACTIVE: 'Não elegível',
  UNCHANGED: 'Sem alteração',
} satisfies Record<LegacyCutoverPreviewClassification, string>;

const legacyCutoverClassificationTone = {
  CONFLICT: 'danger',
  HISTORICAL_CANCELED: 'muted',
  INVALID: 'danger',
  READY: 'success',
  SKIPPED_NOT_ACTIVE: 'warning',
  UNCHANGED: 'muted',
} satisfies Record<LegacyCutoverPreviewClassification, string>;

const legacyCutoverFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'READY', label: 'Prontas' },
  { id: 'UNCHANGED', label: 'Sem alteração' },
  { id: 'HISTORICAL_CANCELED', label: 'Históricos cancelados' },
  { id: 'SKIPPED_NOT_ACTIVE', label: 'Não elegíveis' },
  { id: 'CONFLICT', label: 'Conflitos' },
  { id: 'INVALID', label: 'Inválidas' },
  { id: 'warnings', label: 'Com avisos' },
] satisfies Array<{ id: LegacyCutoverPreviewClassification | 'all' | 'warnings'; label: string }>;

const legacyPaymentPageSize = 100;
const legacyCutoverActivationLimit = 500;

const legacyPlanCycles = [
  { cycle: 'MENSAL', label: 'Mensal', durationMonths: 1 },
  { cycle: 'BIMESTRAL', label: 'Bimestral', durationMonths: 2 },
  { cycle: 'TRIMESTRAL', label: 'Trimestral', durationMonths: 3 },
  { cycle: 'SEMESTRAL', label: 'Semestral', durationMonths: 6 },
  { cycle: 'ANUAL', label: 'Anual', durationMonths: 12 },
] satisfies Array<{ cycle: LegacyImportPlanCycle; label: string; durationMonths: number }>;

const legacyPlanCycleSet = new Set<LegacyImportPlanCycle>(
  legacyPlanCycles.map((item) => item.cycle),
);
const legacyPlanMappingSessionKey = 'crm-novo:legacy-import-plan-mapping';

function emptyLegacyCycleCounts() {
  return legacyPlanCycles.reduce(
    (counts, item) => ({ ...counts, [item.cycle]: 0 }),
    {} as Record<LegacyImportPlanCycle, number>,
  );
}

function normalizeLegacyPlanCycle(value: unknown) {
  const cycle = typeof value === 'string' ? value.trim().toUpperCase() : '';

  return legacyPlanCycleSet.has(cycle as LegacyImportPlanCycle)
    ? (cycle as LegacyImportPlanCycle)
    : null;
}

function countLegacyImportCycles(fileText: string) {
  const counts = emptyLegacyCycleCounts();

  if (!fileText.trim()) {
    return counts;
  }

  try {
    const payload = JSON.parse(fileText) as unknown;
    const clients =
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      Array.isArray((payload as { clients?: unknown }).clients)
        ? (payload as { clients: unknown[] }).clients
        : [];

    for (const client of clients) {
      if (typeof client !== 'object' || client === null || Array.isArray(client)) continue;

      const status =
        typeof (client as { status?: unknown }).status === 'string'
          ? (client as { status: string }).status.trim()
          : '';
      if (!['Ativo', 'Inativo', 'Cancelado'].includes(status)) continue;

      const cycle = normalizeLegacyPlanCycle((client as { type_cobranca?: unknown }).type_cobranca);
      if (cycle) counts[cycle] += 1;
    }
  } catch {
    return counts;
  }

  return counts;
}

function readLegacyPlanMappingSession() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.sessionStorage.getItem(legacyPlanMappingSessionKey);
    if (!stored) return {};

    const parsed = JSON.parse(stored) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return legacyPlanCycles.reduce((mapping, item) => {
      const planId = (parsed as Record<string, unknown>)[item.cycle];
      if (typeof planId === 'string' && planId.trim()) {
        mapping[item.cycle] = planId.trim();
      }

      return mapping;
    }, {} as LegacyImportPlanMapping);
  } catch {
    return {};
  }
}

function LegacyImportPreviewView({ plans }: { plans: Plan[] }) {
  const [tab, setTab] = useState<'clients' | 'finance' | 'cutover'>('clients');

  return (
    <section className="workspace-main legacy-import-view">
      <div className="legacy-import-tabs" role="tablist" aria-label="Tipo de importação legado">
        <button
          className={`segmented-button ${tab === 'clients' ? 'active' : ''}`}
          role="tab"
          type="button"
          aria-selected={tab === 'clients'}
          onClick={() => setTab('clients')}
        >
          Clientes
        </button>
        <button
          className={`segmented-button ${tab === 'finance' ? 'active' : ''}`}
          role="tab"
          type="button"
          aria-selected={tab === 'finance'}
          onClick={() => setTab('finance')}
        >
          Financeiro
        </button>
        <button
          className={`segmented-button ${tab === 'cutover' ? 'active' : ''}`}
          role="tab"
          type="button"
          aria-selected={tab === 'cutover'}
          onClick={() => setTab('cutover')}
        >
          Ativação operacional
        </button>
      </div>

      {tab === 'clients' ? <LegacyClientImportPreviewView plans={plans} /> : null}
      {tab === 'finance' ? <LegacyFinancialImportPreviewView /> : null}
      {tab === 'cutover' ? <LegacyCutoverPreviewView /> : null}
    </section>
  );
}

function LegacyCutoverPreviewView() {
  const [preview, setPreview] = useState<LegacyCutoverPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState(false);
  const activatingRef = useRef(false);
  const [activateConfirmOpen, setActivateConfirmOpen] = useState(false);
  const [activateResult, setActivateResult] = useState<Awaited<
    ReturnType<typeof activateLegacyCutover>
  > | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LegacyCutoverPreviewClassification | 'all' | 'warnings'>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [selectedReadyReferenceIds, setSelectedReadyReferenceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedRow, setSelectedRow] = useState<LegacyCutoverPreviewRow | null>(null);

  const filteredRows =
    preview?.rows.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'warnings') return row.warnings.length > 0 || row.dispatchWarnings.length > 0;
      return row.classification === filter;
    }) ?? [];
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / legacyPaymentPageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice(
    (safePage - 1) * legacyPaymentPageSize,
    safePage * legacyPaymentPageSize,
  );
  const schedulersDisabled =
    preview?.metadata.billingSchedulerStatus === 'DISABLED' &&
    preview.metadata.recoverySchedulerStatus === 'DISABLED';
  const readyReferenceIds =
    preview?.rows
      .filter((row) => row.classification === 'READY' && row.crmClientReferenceId)
      .map((row) => row.crmClientReferenceId as string) ?? [];
  const readyReferenceIdSet = useMemo(() => new Set(readyReferenceIds), [readyReferenceIds]);
  const selectedReadyIds = useMemo(
    () => [...selectedReadyReferenceIds].filter((id) => readyReferenceIdSet.has(id)),
    [readyReferenceIdSet, selectedReadyReferenceIds],
  );
  const selectedReadyCount = selectedReadyIds.length;
  const selectedReadyOverLimit = selectedReadyCount > legacyCutoverActivationLimit;
  const canActivate = Boolean(
    preview &&
    selectedReadyCount > 0 &&
    !selectedReadyOverLimit &&
    schedulersDisabled &&
    !loading &&
    !activating,
  );

  useEffect(() => {
    setPage(1);
  }, [filter, preview]);

  async function runPreview() {
    setLoading(true);
    setError('');
    setSelectedRow(null);
    setSelectedReadyReferenceIds(new Set());

    try {
      const result = await previewLegacyCutover();
      setPreview(result);
      setActivateResult(null);
      setFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível analisar o cutover.');
    } finally {
      setLoading(false);
    }
  }

  async function runActivate() {
    if (activatingRef.current || !canActivate) return;
    activatingRef.current = true;
    setActivating(true);
    setError('');

    try {
      const result = await activateLegacyCutover(selectedReadyIds);
      setActivateResult(result);
      setActivateConfirmOpen(false);
      const nextPreview = await previewLegacyCutover();
      setPreview(nextPreview);
      setSelectedReadyReferenceIds(new Set());
      setFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar o cutover.');
    } finally {
      activatingRef.current = false;
      setActivating(false);
    }
  }

  function toggleReadySelection(crmClientReferenceId: string, selected: boolean) {
    setSelectedReadyReferenceIds((current) => {
      const next = new Set(current);

      if (selected) {
        next.add(crmClientReferenceId);
      } else {
        next.delete(crmClientReferenceId);
      }

      return next;
    });
  }

  function selectAllReady() {
    setSelectedReadyReferenceIds(new Set(readyReferenceIds));
  }

  function clearReadySelection() {
    setSelectedReadyReferenceIds(new Set());
  }

  return (
    <section className="legacy-import-view">
      <PageHeader
        eyebrow="Legacy Import"
        icon={Workflow}
        title="Ativação operacional"
        subtitle="IMPORT3.2 ativação controlada"
        actions={
          <>
            <Button
              icon={RefreshCw}
              loading={loading}
              variant="secondary"
              onClick={() => void runPreview()}
            >
              Analisar cutover
            </Button>
            {preview && preview.summary.ready > 0 && !loading && !activating ? (
              <Button
                disabled={!canActivate}
                icon={Receipt}
                loading={activating}
                variant="primary"
                onClick={() => setActivateConfirmOpen(true)}
              >
                Criar Receivables de renovação
                {selectedReadyCount > 0 ? ` (${selectedReadyCount})` : ''}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="notice warning">
        Este preview não cria cobranças. Durante o cutover, mantenha Billing e Recovery
        desabilitados até a conferência final.
      </div>
      {error ? <div className="notice danger">{error}</div> : null}
      {preview ? (
        <div className={schedulersDisabled ? 'notice success' : 'notice danger'}>
          Billing Scheduler:{' '}
          {preview.metadata.billingSchedulerStatus === 'DISABLED' ? 'Desabilitado' : 'Habilitado'} ·
          Recovery Scheduler:{' '}
          {preview.metadata.recoverySchedulerStatus === 'DISABLED' ? 'Desabilitado' : 'Habilitado'}
        </div>
      ) : null}
      {selectedReadyOverLimit ? (
        <div className="notice danger">
          Limite de ativação: selecione no máximo {legacyCutoverActivationLimit} referências por
          execução.
        </div>
      ) : null}
      {activateResult ? (
        <div className="legacy-import-result" aria-live="polite">
          <span>Criadas: {activateResult.summary.created}</span>
          <span>Sem alteração: {activateResult.summary.unchanged}</span>
          <span>Ignoradas: {activateResult.summary.skipped}</span>
          <span>Falhas: {activateResult.summary.failed}</span>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="legacy-import-summary">
            <StatCard label="Total referências" value={preview.summary.total} />
            <StatCard label="Prontas" tone="success" value={preview.summary.ready} />
            <StatCard label="Sem alteração" value={preview.summary.unchanged} />
            <StatCard
              label="Históricos cancelados"
              tone="info"
              value={preview.summary.historicalCanceled}
            />
            <StatCard label="Não elegíveis" tone="warning" value={preview.summary.notActive} />
            <StatCard label="Conflitos" tone="danger" value={preview.summary.conflict} />
            <StatCard label="Inválidas" tone="danger" value={preview.summary.invalid} />
            <StatCard label="Com avisos" tone="warning" value={preview.summary.warnings} />
            <StatCard
              label="Aviso vencido"
              tone="warning"
              value={preview.summary.noticeDatePassed}
            />
            <StatCard
              label="Dispatch não pronto"
              tone="warning"
              value={preview.summary.dispatchNotReady}
            />
          </div>

          <div className="legacy-import-filter-row">
            {legacyCutoverFilters.map((item) => (
              <button
                className={`segmented-button ${filter === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="legacy-import-selection-bar">
            <strong>
              Selecionadas: {selectedReadyCount} de {readyReferenceIds.length} prontas
            </strong>
            <div>
              <Button
                disabled={!readyReferenceIds.length || loading || activating}
                icon={ListChecks}
                size="sm"
                variant="secondary"
                onClick={selectAllReady}
              >
                Selecionar todas as prontas
              </Button>
              <Button
                disabled={!selectedReadyCount || loading || activating}
                icon={XCircle}
                size="sm"
                variant="ghost"
                onClick={clearReadySelection}
              >
                Limpar seleção
              </Button>
            </div>
          </div>

          <div className="legacy-import-table-wrap">
            <table className="legacy-import-table legacy-cutover-table">
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Próximo vencimento</th>
                  <th>Avisar</th>
                  <th>Agendamento estimado</th>
                  <th>Situação</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const selectable = row.classification === 'READY' && row.crmClientReferenceId;
                  const selectionKey = row.crmClientReferenceId ?? '';

                  return (
                    <tr key={`${row.legacyClientId}:${row.crmClientReferenceId ?? 'missing'}`}>
                      <td>
                        <input
                          aria-label={`Selecionar referência ${row.reference ?? row.legacyClientId}`}
                          checked={selectable ? selectedReadyReferenceIds.has(selectionKey) : false}
                          disabled={!selectable || loading || activating}
                          type="checkbox"
                          onChange={(event) =>
                            toggleReadySelection(selectionKey, event.currentTarget.checked)
                          }
                        />
                      </td>
                      <td>
                        <strong>{row.clientName ?? '-'}</strong>
                        <small>Legado {row.legacyClientId}</small>
                      </td>
                      <td>{row.reference ?? '-'}</td>
                      <td>{row.planName ?? '-'}</td>
                      <td>{row.amount ? formatCurrency(row.amount) : '-'}</td>
                      <td>{row.dueDate ? formatDate(row.dueDate) : '-'}</td>
                      <td>{row.billingNoticeDays ?? '-'}</td>
                      <td>
                        {row.scheduledForEstimated
                          ? formatDateTime(row.scheduledForEstimated)
                          : '-'}
                      </td>
                      <td>
                        <span
                          className={`legacy-import-badge tone-${legacyCutoverClassificationTone[row.classification]}`}
                        >
                          {legacyCutoverClassificationLabels[row.classification]}
                        </span>
                        {row.warnings.length ? <small>{row.warnings.length} avisos</small> : null}
                      </td>
                      <td>
                        <IconButton
                          icon={Eye}
                          label="Ver detalhes"
                          size="sm"
                          onClick={() => setSelectedRow(row)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            itemLabel="referências"
            onPageChange={setPage}
            pagination={{
              page: safePage,
              pageSize: legacyPaymentPageSize,
              total: filteredRows.length,
              totalPages,
            }}
          />
        </>
      ) : null}

      {selectedRow ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal legacy-import-detail-modal"
            aria-labelledby="legacy-cutover-detail-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="legacy-cutover-detail-title">
                  {selectedRow.clientName ?? 'Mapping legado'}
                </h2>
                <p>{legacyCutoverClassificationLabels[selectedRow.classification]}</p>
              </div>
              <IconButton icon={X} label="Fechar" onClick={() => setSelectedRow(null)} />
            </header>
            <div className="legacy-import-detail-grid">
              <dl className="detail-list">
                <dt>Legacy client id</dt>
                <dd>{selectedRow.legacyClientId}</dd>
                <dt>Client status</dt>
                <dd>{selectedRow.clientStatus ?? '-'}</dd>
                <dt>Reference status</dt>
                <dd>{selectedRow.referenceStatus ?? '-'}</dd>
                <dt>Purpose</dt>
                <dd>{selectedRow.purpose}</dd>
                <dt>Existing Receivable</dt>
                <dd>
                  {selectedRow.existingReceivable
                    ? `${selectedRow.existingReceivable.status} · ${formatDate(
                        selectedRow.existingReceivable.dueDate,
                      )}`
                    : '-'}
                </dd>
              </dl>
              <dl className="detail-list">
                <dt>Plano</dt>
                <dd>{selectedRow.planName ?? '-'}</dd>
                <dt>Valor</dt>
                <dd>{selectedRow.amount ? formatCurrency(selectedRow.amount) : '-'}</dd>
                <dt>Due date</dt>
                <dd>{selectedRow.dueDate ? formatDate(selectedRow.dueDate) : '-'}</dd>
                <dt>Anchor</dt>
                <dd>{selectedRow.billingAnchorDay ?? '-'}</dd>
                <dt>Notice</dt>
                <dd>{selectedRow.billingNoticeDays ?? '-'}</dd>
              </dl>
              <div className="legacy-import-detail-section">
                <h3>Dispatch readiness</h3>
                <p
                  className={selectedRow.dispatchReady ? 'empty-state success-text' : 'empty-state'}
                >
                  {selectedRow.dispatchReady ? 'Pronto para agendamento' : 'Requer atenção'}
                </p>
                <CodeList items={selectedRow.dispatchWarnings} empty="Nenhum aviso operacional" />
                <h3>Erros</h3>
                {selectedRow.errors.includes('CONFLICT_PAST_DUE_DATE') ? (
                  <p className="notice danger">Vencimento passado — corrigir antes do cutover.</p>
                ) : null}
                <CodeList items={selectedRow.errors} empty="Nenhum erro" />
                <h3>Avisos</h3>
                {selectedRow.warnings.includes('WARNING_BILLING_NOTICE_DATE_PASSED') ? (
                  <p className="notice warning">
                    Data prevista de aviso já passou. Cliente ainda pode estar financeiramente
                    pronto.
                  </p>
                ) : null}
                <CodeList items={selectedRow.warnings} empty="Nenhum aviso" />
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {activateConfirmOpen && preview ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal legacy-import-confirm-modal"
            aria-labelledby="cutover-activate-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="cutover-activate-title">Criar Receivables de renovação?</h2>
                <p>Esta etapa cria somente contas a receber de renovação.</p>
              </div>
              <IconButton
                disabled={activating}
                icon={X}
                label="Fechar"
                onClick={() => setActivateConfirmOpen(false)}
              />
            </header>
            <div className="legacy-import-confirm-grid">
              <StatCard
                label="Referências selecionadas"
                tone="success"
                value={selectedReadyCount}
              />
              <StatCard label="Receivables a criar" tone="success" value={selectedReadyCount} />
              <StatCard label="MessageDispatches" value={0} />
              <StatCard label="PIX" value={0} />
              <StatCard label="WhatsApp" value={0} />
            </div>
            <p className="modal-copy">
              Esta etapa cria somente as contas a receber do próximo ciclo. Nenhuma cobrança será
              enviada enquanto Billing e Recovery permanecerem desabilitados. Mantenha ambos
              desabilitados até a conferência final.
            </p>
            <footer className="modal-actions">
              <Button
                disabled={activating}
                type="button"
                variant="secondary"
                onClick={() => setActivateConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={!canActivate}
                icon={Receipt}
                loading={activating}
                type="button"
                variant="primary"
                onClick={() => void runActivate()}
              >
                Criar Receivables de renovação
                {selectedReadyCount > 0 ? ` (${selectedReadyCount})` : ''}
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function LegacyClientImportPreviewView({ plans }: { plans: Plan[] }) {
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [planMapping, setPlanMapping] = useState<LegacyImportPlanMapping>(
    readLegacyPlanMappingSession,
  );
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<
    LegacyImportClassification | 'all' | 'READY_CREATE_ACTIVE' | 'READY_CREATE_CANCELED'
  >('all');
  const [selectedRow, setSelectedRow] = useState<LegacyImportPreviewRow | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importResult, setImportResult] = useState<LegacyImportResult | null>(null);
  const importInFlightRef = useRef(false);
  const activePlans = plans.filter((plan) => plan.active);
  const cycleCounts = useMemo(() => countLegacyImportCycles(fileText), [fileText]);
  const fileHasClientCounts = Boolean(fileText.trim());
  const usedCycles = legacyPlanCycles.filter((item) => cycleCounts[item.cycle] > 0);
  const mappedUsedCycleCount = usedCycles.filter((item) => planMapping[item.cycle]).length;
  const mappingCompletenessText = fileHasClientCounts
    ? `${mappedUsedCycleCount} de ${usedCycles.length} ciclos utilizados configurados.`
    : 'Carregue um JSON para ver os ciclos utilizados neste lote.';
  const readyCreateCount = preview?.summary.readyCreate ?? 0;

  const filteredRows =
    preview?.rows.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'READY_CREATE_ACTIVE') {
        return row.classification === 'READY_CREATE' && row.normalizedStatus === 'ATIVO';
      }
      if (filter === 'READY_CREATE_CANCELED') {
        return row.classification === 'READY_CREATE' && row.normalizedStatus === 'CANCELADO';
      }
      return row.classification === filter;
    }) ?? [];

  useEffect(() => {
    setPlanMapping((current) => {
      let changed = false;
      const next: LegacyImportPlanMapping = { ...current };
      const selectablePlans = plans.filter((plan) => plan.active);

      for (const item of legacyPlanCycles) {
        const candidates = selectablePlans.filter(
          (plan) => item.durationMonths === plan.durationMonths,
        );
        const currentPlan = next[item.cycle]
          ? candidates.find((plan) => plan.id === next[item.cycle])
          : null;

        if (currentPlan) continue;

        if (candidates.length === 1) {
          next[item.cycle] = candidates[0]!.id;
          changed = true;
          continue;
        }

        if (next[item.cycle]) {
          delete next[item.cycle];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [plans]);

  useEffect(() => {
    window.sessionStorage.setItem(legacyPlanMappingSessionKey, JSON.stringify(planMapping));
  }, [planMapping]);

  function handlePlanMappingChange(cycle: LegacyImportPlanCycle, planId: string) {
    setPlanMapping((current) => {
      const next = { ...current };
      if (planId) {
        next[cycle] = planId;
      } else {
        delete next[cycle];
      }
      return next;
    });
    setPreview(null);
    setSelectedRow(null);
    setFilter('all');
    setImportResult(null);
  }

  async function handleFileChange(file: File | undefined) {
    setPreview(null);
    setSelectedRow(null);
    setError('');
    setImportResult(null);

    if (!file) {
      setFileName('');
      setFileText('');
      return;
    }

    const fileRead = await readLegacyImportJsonFile(file);
    setFileName(fileRead.fileName);
    setFileText(fileRead.text);

    if (!fileRead.ok) {
      setError(fileRead.error);
    }
  }

  function buildLegacyImportPayload() {
    const payload = JSON.parse(fileText) as unknown;

    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? { ...payload, planMapping }
      : payload;
  }

  async function runPreview(options: { preserveImportResult?: boolean } = {}) {
    setLoading(true);
    setError('');
    setSelectedRow(null);
    if (!options.preserveImportResult) {
      setImportResult(null);
    }

    try {
      const result = await previewLegacyClients(buildLegacyImportPayload());
      setPreview(result);
      setFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o arquivo.');
    } finally {
      setLoading(false);
    }
  }

  async function runImportReadyCreate() {
    if (importInFlightRef.current) {
      return;
    }

    importInFlightRef.current = true;
    setImporting(true);
    setError('');

    try {
      const result = await importLegacyClients(buildLegacyImportPayload());
      setImportResult(result);
      setImportConfirmOpen(false);
      await runPreview({ preserveImportResult: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar os clientes.');
    } finally {
      importInFlightRef.current = false;
      setImporting(false);
    }
  }

  return (
    <section className="workspace-main legacy-import-view">
      <PageHeader
        eyebrow="Legacy Import"
        icon={FileText}
        title="Importação de clientes"
        subtitle="IMPORT1.1"
        actions={
          <>
            <Button
              disabled={!fileText || loading || importing}
              icon={RefreshCw}
              loading={loading}
              variant="secondary"
              onClick={() => void runPreview()}
            >
              Validar
            </Button>
            <Button
              disabled={!preview || readyCreateCount === 0 || loading || importing}
              icon={Upload}
              loading={importing}
              variant="primary"
              onClick={() => setImportConfirmOpen(true)}
            >
              Importar prontos
            </Button>
          </>
        }
      />

      {error ? <div className="notice danger">{error}</div> : null}

      {importResult ? (
        <div className="legacy-import-result" aria-live="polite">
          <strong>Resultado da importação</strong>
          <span>{importResult.summary.imported} importados</span>
          <span>{importResult.summary.skipped} ignorados</span>
          <span>{importResult.summary.failed} falhas</span>
        </div>
      ) : null}

      <section className="legacy-import-plan-mapping" aria-labelledby="legacy-plan-mapping-title">
        <div>
          <h2 id="legacy-plan-mapping-title">Mapeamento de planos do lote</h2>
          <p>
            Escolha uma vez qual plano do CRM corresponde a cada ciclo do sistema legado. A seleção
            será aplicada automaticamente a todos os clientes do arquivo com o mesmo tipo de
            cobrança.
          </p>
        </div>

        <div className="legacy-import-plan-status" aria-live="polite">
          <strong>Mapeamento do lote</strong>
          <span>{mappingCompletenessText}</span>
        </div>

        <div className="legacy-import-plan-grid">
          {legacyPlanCycles.map((item) => {
            const candidates = activePlans.filter(
              (plan) => item.durationMonths === plan.durationMonths,
            );
            const selectedPlanId = planMapping[item.cycle] ?? '';
            const hasSingleCandidate = candidates.length === 1;
            const hasNoCandidates = candidates.length === 0;
            const cycleClientCount = cycleCounts[item.cycle];
            const hasCycleClients = cycleClientCount > 0;
            const cycleCountText = fileHasClientCounts
              ? hasCycleClients
                ? `${cycleClientCount} ${
                    cycleClientCount === 1 ? 'cliente no arquivo' : 'clientes no arquivo'
                  }`
                : 'Nenhum cliente deste ciclo no arquivo.'
              : 'Carregue um JSON para ver quantos clientes usam este ciclo.';
            const isAutoSelected =
              hasSingleCandidate && selectedPlanId === candidates[0]?.id && Boolean(selectedPlanId);
            const scopeHint = !hasCycleClients
              ? 'Nenhum cliente deste ciclo no arquivo.'
              : !selectedPlanId
                ? `${cycleClientCount} ${
                    cycleClientCount === 1 ? 'cliente depende' : 'clientes dependem'
                  } deste mapeamento.`
                : isAutoSelected
                  ? 'Selecionado automaticamente — único plano compatível.'
                  : `Selecionado para todos os clientes ${item.label} deste arquivo.`;

            return (
              <label className="legacy-import-plan-row" key={item.cycle}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{formatPlanDuration(item.durationMonths)}</small>
                  <small>{cycleCountText}</small>
                </span>
                <select
                  aria-describedby={`legacy-plan-${item.cycle}-hint`}
                  aria-label={`Plano CRM para ciclo ${item.label}`}
                  value={selectedPlanId}
                  onChange={(event) => handlePlanMappingChange(item.cycle, event.target.value)}
                >
                  <option value="">
                    {hasNoCandidates
                      ? 'Nenhum plano ativo compatível'
                      : `Selecione o plano correspondente ao ciclo ${item.label}`}
                  </option>
                  {candidates.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - {formatCurrency(plan.defaultValue)}
                    </option>
                  ))}
                </select>
                <small id={`legacy-plan-${item.cycle}-hint`}>
                  {hasNoCandidates
                    ? 'Nenhum plano ativo compatível.'
                    : selectedPlanId || hasCycleClients
                      ? scopeHint
                      : `Selecione o plano correspondente ao ciclo ${item.label} se ele aparecer no lote.`}
                  {selectedPlanId
                    ? ' O valor do plano é apenas referência; o valor recorrente de cada cliente será preservado do arquivo legado.'
                    : ''}
                </small>
              </label>
            );
          })}
        </div>
      </section>

      <div className="legacy-import-upload">
        <label className="field">
          <span>Arquivo JSON</span>
          <input
            accept="application/json,.json"
            type="file"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
          />
        </label>
        <div className="legacy-import-file-state">
          <strong>{fileName || 'Nenhum arquivo selecionado'}</strong>
          <span>
            Ativo entra como ativo. Inativo e Cancelado entram como cancelados históricos. Novo e
            Pendente permanecem fora da migração.
          </span>
        </div>
      </div>

      {preview ? (
        <>
          <div className="legacy-import-summary">
            <StatCard label="Total" value={preview.summary.total} />
            <StatCard
              label="Prontos para criar"
              tone="success"
              value={preview.summary.readyCreate}
            />
            <StatCard
              label="Prontos ativos"
              tone="success"
              value={preview.summary.readyCreateActive}
            />
            <StatCard label="Históricos cancelados" value={preview.summary.readyCreateCanceled} />
            <StatCard
              label="Prontos para atualizar"
              tone="info"
              value={preview.summary.readyUpdate}
            />
            <StatCard label="Sem alteração" value={preview.summary.unchanged} />
            <StatCard
              label="Possíveis correspondências"
              tone="warning"
              value={preview.summary.possibleMatch}
            />
            <StatCard label="Fora da migração" value={preview.summary.notActive} />
            <StatCard label="Conflitos" tone="danger" value={preview.summary.conflict} />
            <StatCard label="Inválidos" tone="danger" value={preview.summary.invalid} />
          </div>

          <div className="legacy-import-filter-row">
            {legacyImportFilters.map((item) => (
              <button
                className={`segmented-button ${filter === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="legacy-import-table-wrap">
            <table className="legacy-import-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Telefone</th>
                  <th>Status legado</th>
                  <th>Status CRM</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Resultado</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={`${row.index}:${row.legacyClientId ?? 'invalid'}`}>
                    <td>
                      <strong>{row.name ?? '-'}</strong>
                      <span>{row.email ?? '-'}</span>
                    </td>
                    <td>{row.reference ?? '-'}</td>
                    <td>
                      <span>{row.phone ?? '-'}</span>
                      <small>{row.phoneNormalized ?? '-'}</small>
                    </td>
                    <td>{row.status ?? '-'}</td>
                    <td>{row.normalizedStatus ?? '-'}</td>
                    <td>
                      {row.plan?.name ??
                        (row.plan?.durationMonths ? `${row.plan.durationMonths} meses` : '-')}
                    </td>
                    <td>{row.recurringValue ? formatCurrency(row.recurringValue) : '-'}</td>
                    <td>{row.dueDate ? formatDate(row.dueDate) : '-'}</td>
                    <td>
                      <span
                        className={`legacy-import-badge tone-${legacyImportClassificationTone[row.classification]}`}
                      >
                        {legacyImportClassificationLabels[row.classification]}
                      </span>
                    </td>
                    <td>
                      <IconButton
                        icon={Eye}
                        label="Ver detalhes"
                        size="sm"
                        onClick={() => setSelectedRow(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {selectedRow ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal legacy-import-detail-modal"
            aria-labelledby="legacy-import-detail-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="legacy-import-detail-title">{selectedRow.name ?? 'Registro inválido'}</h2>
                <p>{legacyImportClassificationLabels[selectedRow.classification]}</p>
              </div>
              <IconButton icon={X} label="Fechar" onClick={() => setSelectedRow(null)} />
            </header>
            <div className="legacy-import-detail-grid">
              <dl className="detail-list">
                <dt>Legacy ID</dt>
                <dd>{selectedRow.legacyClientId ?? '-'}</dd>
                <dt>Referência</dt>
                <dd>{selectedRow.reference ?? '-'}</dd>
                <dt>Status CRM</dt>
                <dd>{selectedRow.normalizedStatus ?? '-'}</dd>
                <dt>Anchor</dt>
                <dd>{selectedRow.billingAnchorDay ?? '-'}</dd>
                <dt>Aviso</dt>
                <dd>{selectedRow.billingNoticeDays ?? '-'}</dd>
                <dt>Hash</dt>
                <dd className="legacy-import-hash-value">{selectedRow.payloadHash ?? '-'}</dd>
              </dl>
              <div className="legacy-import-detail-section">
                {selectedRow.classification === 'SKIPPED_NOT_ACTIVE' ? (
                  <p className="notice warning">
                    Novo e Pendente permanecem fora da migração. Pendências devem ser resolvidas no
                    legado antes do snapshot final.
                  </p>
                ) : null}
                {selectedRow.classification === 'READY_CREATE' &&
                selectedRow.normalizedStatus === 'CANCELADO' ? (
                  <p className="notice warning">
                    Este cadastro será preservado como Cancelado histórico, sem cobrança, WhatsApp,
                    PIX ou entrada no cutover.
                  </p>
                ) : null}
                <h3>Erros</h3>
                <CodeList items={selectedRow.errors} empty="Nenhum erro" />
                <h3>Avisos</h3>
                <CodeList items={selectedRow.warnings} empty="Nenhum aviso" />
              </div>
              <div className="legacy-import-detail-section">
                <h3>Correspondências</h3>
                {selectedRow.candidateMatches.length ? (
                  <ul className="legacy-import-match-list">
                    {selectedRow.candidateMatches.map((match) => (
                      <li key={`${match.field}:${match.clientId}:${match.clientReferenceId ?? ''}`}>
                        <strong>{match.clientName}</strong>
                        <span>
                          {match.field} · {match.reference ?? match.clientId}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">Nenhuma correspondência</p>
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {importConfirmOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" aria-labelledby="legacy-import-confirm-title">
            <header className="modal-header">
              <div>
                <h2 id="legacy-import-confirm-title">
                  Importar {readyCreateCount} clientes prontos?
                </h2>
                <p>Esta etapa importa apenas clientes e referências.</p>
              </div>
              <IconButton
                disabled={importing}
                icon={X}
                label="Fechar"
                onClick={() => setImportConfirmOpen(false)}
              />
            </header>
            <div className="legacy-import-confirm-grid">
              <StatCard label="Clientes" value={readyCreateCount} />
              <StatCard label="Receivables" value={0} />
              <StatCard label="Cobranças" value={0} />
              <StatCard label="PIX" value={0} />
            </div>
            <p className="modal-copy">
              O financeiro e os agendamentos serão migrados depois. Nenhum PIX, WhatsApp,
              Receivable, MessageDispatch ou FinancialTransaction será criado nesta etapa.
            </p>
            <footer className="modal-actions">
              <Button
                disabled={importing}
                type="button"
                variant="secondary"
                onClick={() => setImportConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                disabled={importing}
                loading={importing}
                type="button"
                variant="primary"
                onClick={() => void runImportReadyCreate()}
              >
                Confirmar importação
              </Button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function LegacyFinancialImportPreviewView() {
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [preview, setPreview] = useState<LegacyPaymentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<LegacyPaymentPreviewClassification | 'all'>('all');
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<LegacyPaymentPreviewRow | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [importResult, setImportResult] = useState<Awaited<
    ReturnType<typeof importLegacyPayments>
  > | null>(null);
  const importActionRef = useRef(false);
  const readyPaidHistoryCount = preview?.summary.readyPaidHistory ?? 0;
  const importBatchTooLarge = (preview?.summary.total ?? 0) > 2_000;

  const filteredRows =
    preview?.rows.filter((row) => filter === 'all' || row.classification === filter) ?? [];
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / legacyPaymentPageSize));
  const safePage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice(
    (safePage - 1) * legacyPaymentPageSize,
    safePage * legacyPaymentPageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [filter, preview]);

  async function handleFileChange(file: File | undefined) {
    setPreview(null);
    setSelectedRow(null);
    setImportResult(null);
    setConfirmImport(false);
    setError('');
    setFilter('all');
    setPage(1);

    if (!file) {
      setFileName('');
      setFileText('');
      return;
    }

    const fileRead = await readLegacyImportJsonFile(file, {
      maxSizeBytes: 8 * 1024 * 1024,
      maxSizeLabel: '8 MB',
    });
    setFileName(fileRead.fileName);
    setFileText(fileRead.text);

    if (!fileRead.ok) {
      setError(fileRead.error);
    }
  }

  function buildLegacyPaymentPreviewPayload() {
    const payload = JSON.parse(fileText) as unknown;

    if (Array.isArray(payload)) {
      return {
        schemaVersion: 1,
        source: 'legacy',
        payments: payload,
      };
    }

    return payload;
  }

  async function runPreview() {
    setLoading(true);
    setError('');
    setSelectedRow(null);

    try {
      const result = await previewLegacyPayments(buildLegacyPaymentPreviewPayload());
      setPreview(result);
      setImportResult(null);
      setFilter('all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível validar o financeiro.');
    } finally {
      setLoading(false);
    }
  }

  async function runImportReadyPaidHistory() {
    if (importActionRef.current || !preview || readyPaidHistoryCount === 0 || importBatchTooLarge) {
      return;
    }

    importActionRef.current = true;
    setImporting(true);
    setError('');

    try {
      const result = await importLegacyPayments(buildLegacyPaymentPreviewPayload());
      setImportResult(result);
      const nextPreview = await previewLegacyPayments(buildLegacyPaymentPreviewPayload());
      setPreview(nextPreview);
      setFilter('all');
      setConfirmImport(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível importar o histórico.');
    } finally {
      setImporting(false);
      importActionRef.current = false;
    }
  }

  return (
    <section className="legacy-import-view">
      <PageHeader
        eyebrow="Legacy Import"
        icon={Receipt}
        title="Importação financeira"
        subtitle="IMPORT2A.2 histórico pago"
        actions={
          <>
            <Button
              disabled={!fileText || loading || importing}
              icon={RefreshCw}
              loading={loading}
              variant="secondary"
              onClick={() => void runPreview()}
            >
              Validar
            </Button>
            <Button
              disabled={
                !preview ||
                readyPaidHistoryCount === 0 ||
                importBatchTooLarge ||
                loading ||
                importing
              }
              icon={Upload}
              loading={importing}
              variant="primary"
              onClick={() => setConfirmImport(true)}
            >
              Importar prontos
            </Button>
          </>
        }
      />

      {error ? <div className="notice danger">{error}</div> : null}
      {importResult ? (
        <div className="notice success">
          Importados: {importResult.summary.imported} | Ignorados: {importResult.summary.skipped} |
          Falhas: {importResult.summary.failed}
        </div>
      ) : null}
      {importBatchTooLarge ? (
        <div className="notice warning">
          Importação real limitada a 2.000 pagamentos por arquivo. Divida o JSON em lotes para
          importar os prontos.
        </div>
      ) : null}

      <div className="legacy-import-upload">
        <label className="field">
          <span>Arquivo JSON financeiro</span>
          <input
            accept="application/json,.json"
            type="file"
            onChange={(event) => void handleFileChange(event.target.files?.[0])}
          />
        </label>
        <div className="legacy-import-file-state">
          <strong>{fileName || 'Nenhum arquivo selecionado'}</strong>
          <span>
            Aceita array puro do MySQL ou envelope versionado. Preview read-only; lote recomendado:
            até 2.000 pagamentos por arquivo.
          </span>
        </div>
      </div>

      {preview ? (
        <>
          <div className="legacy-import-summary">
            <StatCard label="Total" value={preview.summary.total} />
            <StatCard
              label="Prontos histórico"
              tone="success"
              value={preview.summary.readyPaidHistory}
            />
            <StatCard label="Sem alteração" value={preview.summary.unchanged} />
            <StatCard
              label="Cliente não importado"
              tone="warning"
              value={preview.summary.clientNotImported}
            />
            <StatCard label="Pendentes" tone="warning" value={preview.summary.pending} />
            <StatCard label="Não suportados" tone="warning" value={preview.summary.unsupported} />
            <StatCard label="Conflitos" tone="danger" value={preview.summary.conflict} />
            <StatCard label="Inválidos" tone="danger" value={preview.summary.invalid} />
          </div>

          <div className="legacy-import-filter-row">
            {legacyPaymentFilters.map((item) => (
              <button
                className={`segmented-button ${filter === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="legacy-import-table-wrap">
            <table className="legacy-import-table legacy-payment-table">
              <thead>
                <tr>
                  <th>ID legado</th>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Data pagamento</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={`${row.index}:${row.legacyPaymentId ?? 'invalid'}`}>
                    <td>
                      <strong>{row.legacyPaymentId ?? '-'}</strong>
                      <small>Cliente legado {row.legacyClientId ?? '-'}</small>
                    </td>
                    <td>
                      <strong>{row.clientName ?? '-'}</strong>
                      <small>{row.crmClientId ?? '-'}</small>
                    </td>
                    <td>{row.reference ?? '-'}</td>
                    <td>{row.transactionDate ? formatDate(row.transactionDate) : '-'}</td>
                    <td>{financialPaymentMethodLabel(row.paymentMethod)}</td>
                    <td>{row.amount ? formatCurrency(row.amount) : '-'}</td>
                    <td>
                      <span
                        className={`legacy-import-badge tone-${legacyPaymentClassificationTone[row.classification]}`}
                      >
                        {legacyPaymentClassificationLabels[row.classification]}
                      </span>
                    </td>
                    <td>
                      <IconButton
                        icon={Eye}
                        label="Ver detalhes"
                        size="sm"
                        onClick={() => setSelectedRow(row)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            itemLabel="pagamentos"
            onPageChange={setPage}
            pagination={{
              page: safePage,
              pageSize: legacyPaymentPageSize,
              total: filteredRows.length,
              totalPages,
            }}
          />
        </>
      ) : null}

      {confirmImport ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal legacy-import-confirm-modal"
            aria-labelledby="legacy-payment-import-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="legacy-payment-import-title">
                  Importar {readyPaidHistoryCount} pagamento histórico?
                </h2>
                <p>Esta etapa registra somente pagamentos históricos já realizados.</p>
              </div>
              <IconButton icon={X} label="Fechar" onClick={() => setConfirmImport(false)} />
            </header>
            <div className="legacy-import-confirm-grid">
              <StatCard label="Pagamentos históricos" value={readyPaidHistoryCount} />
              <StatCard label="FinancialTransactions" value={readyPaidHistoryCount} />
              <StatCard label="Receivables" value={0} />
              <StatCard label="Cobranças" value={0} />
              <StatCard label="PIX operacionais" value={0} />
            </div>
            <div className="notice warning">
              Não cria contas a receber, novas cobranças, PIX operacionais, mensagens ou eventos de
              cliente.
            </div>
            <footer className="modal-actions">
              <Button variant="secondary" onClick={() => setConfirmImport(false)}>
                Cancelar
              </Button>
              <Button
                disabled={importing}
                icon={Upload}
                loading={importing}
                onClick={() => void runImportReadyPaidHistory()}
              >
                Confirmar importação
              </Button>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedRow ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal legacy-import-detail-modal"
            aria-labelledby="legacy-payment-detail-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="legacy-payment-detail-title">
                  Pagamento {selectedRow.legacyPaymentId ?? 'inválido'}
                </h2>
                <p>{legacyPaymentClassificationLabels[selectedRow.classification]}</p>
              </div>
              <IconButton icon={X} label="Fechar" onClick={() => setSelectedRow(null)} />
            </header>
            <div className="legacy-import-detail-grid">
              <dl className="detail-list">
                <dt>Legacy payment id</dt>
                <dd>{selectedRow.legacyPaymentId ?? '-'}</dd>
                <dt>Legacy client id</dt>
                <dd>{selectedRow.legacyClientId ?? '-'}</dd>
                <dt>CRM client</dt>
                <dd>{selectedRow.clientName ?? '-'}</dd>
                <dt>Referência</dt>
                <dd>{selectedRow.reference ?? '-'}</dd>
                <dt>Status legado</dt>
                <dd>{selectedRow.legacyStatus ?? '-'}</dd>
                <dt>Tipo</dt>
                <dd>{selectedRow.transactionType ?? '-'}</dd>
              </dl>
              <dl className="detail-list">
                <dt>Método</dt>
                <dd>{financialPaymentMethodLabel(selectedRow.paymentMethod)}</dd>
                <dt>Valor</dt>
                <dd>{selectedRow.amount ? formatCurrency(selectedRow.amount) : '-'}</dd>
                <dt>Data criado</dt>
                <dd>{selectedRow.dataCriado ?? '-'}</dd>
                <dt>Data pagamento</dt>
                <dd>{selectedRow.dataPagamento ? formatDate(selectedRow.dataPagamento) : '-'}</dd>
                <dt>Categoria</dt>
                <dd>{selectedRow.category?.name ?? '-'}</dd>
                <dt>Hash</dt>
                <dd className="legacy-import-hash-value">{selectedRow.payloadHash ?? '-'}</dd>
              </dl>
              <div className="legacy-import-detail-section">
                <h3>Observação</h3>
                <p className="empty-state">{selectedRow.observation ?? 'Sem observação'}</p>
                <h3>Erros</h3>
                <CodeList items={selectedRow.errors} empty="Nenhum erro" />
                <h3>Avisos</h3>
                <CodeList items={selectedRow.warnings} empty="Nenhum aviso" />
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function CodeList({ empty, items }: { empty: string; items: string[] }) {
  if (!items.length) {
    return <p className="empty-state">{empty}</p>;
  }

  return (
    <ul className="legacy-import-code-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function DeletionConfirmationModal({
  target,
  onClose,
  onConfirm,
}: {
  target: DeletionDialogTarget;
  onClose: () => void;
  onConfirm: (target: DeletionDialogTarget) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [showAllCounts, setShowAllCounts] = useState(false);
  const workingRef = useRef(false);
  const isClient = target.kind === 'client';
  const title = isClient ? 'Remover cliente' : 'Remover referência';
  const targetLabel = isClient ? target.client.name : target.reference.reference;
  const counts = Object.entries(target.preview.counts).filter(([, value]) => value > 0);
  const groupedCounts = removalCountGroups
    .map((group) => ({
      ...group,
      items: group.keys
        .map((key) => ({ key, label: removalCountLabel(key), value: target.preview.counts[key] }))
        .filter(
          (item): item is { key: string; label: string; value: number } => Number(item.value) > 0,
        ),
    }))
    .filter((group) => group.items.length > 0);
  const primaryCounts = counts.filter(([key]) => removalPrimaryCountKeys.includes(key)).slice(0, 6);
  const secondaryCounts = counts.filter(
    ([key]) => !primaryCounts.some(([primaryKey]) => primaryKey === key),
  );
  const canConfirm = confirmation === 'REMOVER';

  async function submit() {
    if (!canConfirm) {
      setError('Digite REMOVER para confirmar.');
      return;
    }

    if (workingRef.current) {
      return;
    }

    workingRef.current = true;
    setWorking(true);
    setError('');

    try {
      await onConfirm(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover.');
    } finally {
      workingRef.current = false;
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal deletion-modal" aria-labelledby="deletion-title">
        <header className="modal-header">
          <div>
            <span className="metric-label">AÇÃO DESTRUTIVA</span>
            <h2 id="deletion-title">{title}</h2>
            <p>{targetLabel}</p>
          </div>
          <IconButton disabled={working} icon={X} label="Fechar confirmação" onClick={onClose} />
        </header>
        <div className="deletion-modal-body">
          {error ? <div className="notice danger">{formatDeletionError(error)}</div> : null}
          <div className="notice danger">
            Esta ação removerá permanentemente {isClient ? 'o cliente' : 'a referência'} e os dados
            vinculados. Ela não poderá ser desfeita.
          </div>
          <section className="deletion-impact" aria-label="Resumo da remoção">
            <div className="section-heading">
              <span>Resumo da remoção</span>
              <strong>
                {target.preview.counts.total ?? counts.reduce((sum, [, value]) => sum + value, 0)}
              </strong>
            </div>
            <div className="deletion-impact-grid">
              {primaryCounts.map(([key, value]) => (
                <article key={key} className="deletion-impact-card">
                  <strong>{value}</strong>
                  <span>{removalCountLabel(key)}</span>
                </article>
              ))}
            </div>
            {secondaryCounts.length ? (
              <button
                className="link-button"
                type="button"
                onClick={() => setShowAllCounts((current) => !current)}
              >
                {showAllCounts ? 'Ocultar dados afetados' : 'Ver todos os dados afetados'}
              </button>
            ) : null}
            {showAllCounts ? (
              <div className="deletion-count-groups">
                {groupedCounts.map((group) => (
                  <section key={group.title}>
                    <h3>{group.title}</h3>
                    <dl>
                      {group.items.map((item) => (
                        <div key={item.key}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>
            ) : null}
          </section>
          <label className="field">
            <span>Digite REMOVER para confirmar</span>
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                }
              }}
            />
          </label>
        </div>
        <div className="button-row deletion-modal-footer">
          <Button disabled={working} icon={X} variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={working || !canConfirm}
            icon={Trash2}
            variant="danger"
            onClick={() => void submit()}
          >
            {working ? 'Removendo...' : 'Remover definitivamente'}
          </Button>
        </div>
      </section>
    </div>
  );
}

const removalPrimaryCountKeys = [
  'clients',
  'clientReferences',
  'receivables',
  'paymentIntents',
  'messageDispatches',
  'clientEvents',
];

const removalCountGroups = [
  {
    title: 'Cliente',
    keys: [
      'clients',
      'clientReferences',
      'statusHistory',
      'clientEvents',
      'whatsappPendingContacts',
      'whatsappInboundMessages',
    ],
  },
  {
    title: 'Financeiro',
    keys: [
      'receivables',
      'financialTransactions',
      'paymentIntents',
      'paymentWebhookEvents',
      'paymentGroups',
      'paymentGroupItems',
      'billingResponses',
    ],
  },
  {
    title: 'Cobrança',
    keys: [
      'messageDispatches',
      'messageDispatchItems',
      'recoveryCampaigns',
      'recoveryCampaignSteps',
    ],
  },
  {
    title: 'Renovações',
    keys: ['renewals', 'renewalReversals'],
  },
  {
    title: 'Indicações',
    keys: ['referrals', 'referralsReceived', 'referralsMade', 'referralsUpdated'],
  },
];

function formatDeletionError(message: string) {
  if (message === 'Internal server error') {
    return 'Não foi possível remover o cliente porque ainda existem vínculos não tratados. Atualize a página e tente novamente.';
  }

  return message;
}

function OperationalDashboard({
  onNewClient,
  onOpenClient,
  onOpenFinance,
  onOpenOperationalView,
  onRenew,
}: {
  onNewClient: () => void;
  onOpenClient: (id: string) => Promise<void>;
  onOpenFinance: (tab: FinanceTab) => void;
  onOpenOperationalView: (
    view: Extract<View, 'clients' | 'billing' | 'automations' | 'waitlist'>,
  ) => void;
  onRenew: (id: string, clientReferenceId?: string) => Promise<void>;
}) {
  const [summary, setSummary] = useState<DashboardSummaryPayload | null>(null);
  const [periodMode, setPeriodMode] = useState<DashboardPeriodMode>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dashboardRequestRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;
    setLoading(true);
    setError('');
    setSummary(null);

    try {
      const filters = buildDashboardPeriod(periodMode, customStart, customEnd);
      const nextSummary = await getDashboardSummary(filters);
      if (dashboardRequestRef.current !== requestId) return;
      setSummary(nextSummary);
    } catch (err) {
      if (dashboardRequestRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o dashboard.');
    } finally {
      if (dashboardRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [customEnd, customStart, periodMode]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const cashflowMax = maxChartValue(
    summary?.charts.cashflow.flatMap((item) => [item.entries, item.expenses]) ?? [],
  );
  const cashflowPoints = summary?.charts.cashflow ?? [];
  const hasCashflowData = cashflowPoints.length > 0;
  const financeBalance = Number(summary?.finance.balance ?? 0);
  const financeBalanceTone =
    financeBalance < 0 ? 'is-negative' : financeBalance > 0 ? 'is-positive' : 'is-neutral';
  const clientStatusDistribution = summary?.clients.distribution ?? [];
  const hasClientStatusDistribution =
    clientStatusDistribution.some((item) => item.status === 'ATIVO') &&
    clientStatusDistribution.some((item) => item.status === 'INATIVO') &&
    clientStatusDistribution.some((item) => item.status === 'CANCELADO');
  const selectedPeriodLabel =
    dashboardPeriodOptions.find((option) => option.value === periodMode)?.label ??
    'Período selecionado';
  const periodLabel = summary
    ? periodMode === 'custom'
      ? (dashboardPeriodLabels[summary.period.label] ?? selectedPeriodLabel)
      : selectedPeriodLabel
    : 'Indicadores reais do CRM, sem dados simulados.';

  return (
    <div className="dashboard-compact-layout">
      <PageHeader
        eyebrow="CRM NOVO UI 2.0"
        title="Dashboard operacional"
        subtitle={periodLabel}
        actions={
          <div className="quick-actions">
            <button className="primary-button" type="button" onClick={onNewClient}>
              <Plus aria-hidden="true" size={16} />
              <span className="quick-action-desktop-label">Novo cliente</span>
              <span className="quick-action-mobile-label">Cliente</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenFinance('entries')}
            >
              <DollarSign aria-hidden="true" size={16} />
              <span>Entrada</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenFinance('receivables')}
            >
              <Receipt aria-hidden="true" size={16} />
              <span>Recebíveis</span>
            </button>
          </div>
        }
      />

      <div className="dashboard-toolbar">
        <div className="period-controls" aria-label="Período do dashboard">
          {dashboardPeriodOptions.map(({ value, label }) => (
            <button
              className={periodMode === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => setPeriodMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {periodMode === 'custom' ? (
          <div className="custom-period">
            <input
              aria-label="Data inicial"
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
            />
            <input
              aria-label="Data final"
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </div>
        ) : null}
      </div>

      {error ? <div className="notice danger">{error}</div> : null}

      <div className="metric-grid dashboard-kpis">
        <StatCard
          icon={Users}
          label="Clientes ativos"
          tone="primary"
          value={loading ? '-' : (summary?.clients.active ?? 0)}
        />
        <StatCard
          icon={CalendarClock}
          label="Vencem hoje"
          tone="warning"
          value={loading ? '-' : (summary?.dueDates.dueToday ?? 0)}
        />
        <StatCard
          icon={DollarSign}
          label="A receber"
          tone="info"
          value={loading ? '-' : formatCurrency(String(summary?.finance.receivablePending ?? '0'))}
        />
        <StatCard
          icon={CreditCard}
          label="Receita do período"
          tone="success"
          value={loading ? '-' : formatCurrency(String(summary?.finance.received ?? '0'))}
        />
        <StatCard
          icon={Bell}
          label="Inadimplentes"
          tone="danger"
          value={loading ? '-' : (summary?.dueDates.overdueClients ?? 0)}
        />
        <StatCard
          icon={ListChecks}
          label="Pendências"
          tone="neutral"
          value={
            loading
              ? '-'
              : (summary?.pending.items.reduce((total, item) => total + item.count, 0) ?? 0)
          }
        />
      </div>

      <div className="dashboard-primary-grid">
        <Card className="chart-panel dashboard-finance-panel">
          <SectionHeader eyebrow="Financeiro" title="Desempenho financeiro" />
          <p className="dashboard-panel-subtitle">Entradas e saídas no período selecionado.</p>
          <div className="dashboard-finance-body">
            <div className="dashboard-cashflow-visual">
              {loading ? (
                <div className="dashboard-chart-skeleton" aria-label="Carregando gráfico" />
              ) : !hasCashflowData ? (
                <div className="empty-state compact-empty-state">
                  Sem movimentações financeiras no período.
                </div>
              ) : (
                <CashflowTemporalChart maxValue={cashflowMax} points={cashflowPoints} />
              )}
            </div>
            <div className="finance-side-metrics">
              {[
                {
                  icon: DollarSign,
                  label: 'Entradas',
                  tone: 'is-positive',
                  value: summary?.finance.entries,
                },
                {
                  icon: Minus,
                  label: 'Saídas',
                  tone: 'is-negative',
                  value: summary?.finance.expenses,
                },
                {
                  icon: CreditCard,
                  label: 'Saldo',
                  tone: financeBalanceTone,
                  value: summary?.finance.balance,
                },
                {
                  icon: RefreshCw,
                  label: 'Valor renovado',
                  tone: 'is-renewed',
                  value: summary?.renewals.amount,
                },
              ].map(({ icon: Icon, label, value, tone }) => (
                <div className={tone} key={label}>
                  <span>
                    <Icon aria-hidden="true" size={14} />
                    {label}
                  </span>
                  <strong>{loading ? '-' : formatCurrency(String(value ?? '0'))}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="chart-panel dashboard-status-panel">
          <SectionHeader eyebrow="Referências" title="Referências por status" />
          {loading ? (
            <div className="dashboard-donut-skeleton" aria-label="Carregando status" />
          ) : hasClientStatusDistribution ? (
            <ClientStatusDonut distribution={clientStatusDistribution} />
          ) : (
            <div className="empty-state compact-empty-state">
              Dados de status indisponíveis no contrato atual.
            </div>
          )}
        </Card>
      </div>

      <div className="dashboard-secondary-grid">
        <Card>
          <SectionHeader title="Vencimentos de hoje" />
          <CompactClientDueTable
            items={summary?.lists.dueToday ?? []}
            onOpen={onOpenClient}
            onRenew={onRenew}
          />
        </Card>

        <Card>
          <SectionHeader title="Pendências operacionais" />
          <div className="pending-list">
            {(summary?.pending.items ?? []).map((item) => (
              <button
                className="pending-item"
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.action === 'finance') {
                    onOpenFinance('receivables');
                    return;
                  }

                  onOpenOperationalView(item.action);
                }}
              >
                <CircleAlert aria-hidden="true" size={15} />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <ArrowRight aria-hidden="true" size={14} />
              </button>
            ))}
            {!summary?.pending.items.length ? (
              <div className="empty-state compact-empty-state dashboard-empty-state">
                <CircleCheck aria-hidden="true" size={20} />
                <strong>Sem pendências operacionais.</strong>
                <span>Nenhuma ação operacional pendente.</span>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionHeader
            title="Contas vencidas"
            action={
              <button
                className="secondary-button compact"
                type="button"
                onClick={() => onOpenFinance('receivables')}
              >
                Ver todos
              </button>
            }
          />
          <OverdueReceivablesTable
            items={summary?.lists.overdueReceivables ?? []}
            onOpenFinance={() => onOpenFinance('receivables')}
          />
        </Card>
      </div>
    </div>
  );
}

function CashflowTemporalChart({
  maxValue,
  points,
}: {
  maxValue: number;
  points: DashboardSummaryPayload['charts']['cashflow'];
}) {
  const width = 720;
  const height = 286;
  const margin = { bottom: 48, left: 76, right: 18, top: 18 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const scaledMax = niceChartMax(maxValue);
  const ticks = buildChartTicks(scaledMax, 4);
  const groupWidth = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.min(22, Math.max(10, groupWidth * 0.24));
  const barGap = Math.min(8, Math.max(5, groupWidth * 0.08));
  const toY = (value: string | number) =>
    margin.top + plotHeight - (Number(value) / scaledMax) * plotHeight;

  return (
    <div
      className="cashflow-temporal-chart"
      role="img"
      aria-label="Gráfico temporal de entradas e saídas no período selecionado."
    >
      <div className="cashflow-chart-legend" aria-hidden="true">
        <span className="is-entry">Entradas</span>
        <span className="is-expense">Saídas</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} focusable="false" aria-hidden="true">
        {ticks.map((tick) => {
          const y = toY(tick);

          return (
            <g className="cashflow-axis-tick" key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} />
              <text x={margin.left - 12} y={y + 4}>
                {formatAxisCurrency(tick)}
              </text>
            </g>
          );
        })}
        <line
          className="cashflow-axis-line"
          x1={margin.left}
          x2={width - margin.right}
          y1={margin.top + plotHeight}
          y2={margin.top + plotHeight}
        />
        {points.map((point, index) => {
          const groupStart = margin.left + index * groupWidth;
          const center = groupStart + groupWidth / 2;
          const entryHeight = margin.top + plotHeight - toY(point.entries);
          const expenseHeight = margin.top + plotHeight - toY(point.expenses);
          const entryX = center - barGap / 2 - barWidth;
          const expenseX = center + barGap / 2;

          return (
            <g className="cashflow-chart-group" key={point.period}>
              <rect
                className="cashflow-svg-bar bar-entry"
                height={entryHeight}
                rx="4"
                width={barWidth}
                x={entryX}
                y={toY(point.entries)}
              />
              <rect
                className="cashflow-svg-bar bar-expense"
                height={expenseHeight}
                rx="4"
                width={barWidth}
                x={expenseX}
                y={toY(point.expenses)}
              />
              {shouldShowCashflowTick(index, points.length) ? (
                <text
                  className="cashflow-x-label cashflow-x-label-desktop"
                  x={center}
                  y={height - 18}
                >
                  {formatPeriodLabel(point.period)}
                </text>
              ) : null}
              {shouldShowCashflowTick(index, points.length, true) ? (
                <text
                  className="cashflow-x-label cashflow-x-label-mobile"
                  x={center}
                  y={height - 18}
                >
                  {formatPeriodLabel(point.period)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="cashflow-chart-hotspots" aria-label="Detalhes do cashflow por período">
        {points.map((point, index) => (
          <button
            aria-label={`${formatTooltipPeriodLabel(point.period)}. Entradas ${formatCurrency(point.entries)}. Saídas ${formatCurrency(point.expenses)}.`}
            className="cashflow-chart-hotspot"
            data-tooltip={`${formatTooltipPeriodLabel(point.period)} | Entradas ${formatCurrency(point.entries)} | Saídas ${formatCurrency(point.expenses)}`}
            key={point.period}
            style={
              {
                '--hotspot-left': `${((margin.left + index * groupWidth) / width) * 100}%`,
                '--hotspot-width': `${(groupWidth / width) * 100}%`,
              } as CSSProperties
            }
            type="button"
          />
        ))}
      </div>
    </div>
  );
}

function ClientStatusDonut({
  distribution,
}: {
  distribution: DashboardSummaryPayload['clients']['distribution'];
}) {
  const items = [
    {
      color: 'var(--accent-strong)',
      label: 'Ativas',
      status: 'ATIVO' as ClientStatus,
      tone: 'is-active',
    },
    {
      color: 'var(--warning)',
      label: 'Inativas',
      status: 'INATIVO' as ClientStatus,
      tone: 'is-inactive',
    },
    {
      color: 'var(--danger)',
      label: 'Canceladas',
      status: 'CANCELADO' as ClientStatus,
      tone: 'is-canceled',
    },
  ].map((item) => ({
    ...item,
    value: distribution.find((entry) => entry.status === item.status)?.total ?? 0,
  }));
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (total === 0) {
    return (
      <div className="client-status-donut empty">
        <div className="donut-zero" aria-label="Total de referências por status: 0">
          <span>0</span>
          <small>referências</small>
        </div>
        <div className="empty-state compact-empty-state">Sem referências classificadas.</div>
      </div>
    );
  }

  return (
    <div className="client-status-donut">
      <figure className="donut-chart" aria-label={`Total de referências por status: ${total}`}>
        <svg viewBox="0 0 120 120" role="img">
          <circle className="donut-track" cx="60" cy="60" r={radius} />
          {items.map((item) => {
            const length = (item.value / total) * circumference;
            const dashOffset = -offset;
            offset += length;

            return (
              <circle
                className={`donut-segment ${item.tone}`}
                cx="60"
                cy="60"
                key={item.status}
                r={radius}
                style={
                  {
                    '--dash-length': length,
                    '--dash-offset': dashOffset,
                    stroke: item.color,
                    strokeDasharray: `${length} ${circumference - length}`,
                    strokeDashoffset: dashOffset,
                  } as CSSProperties
                }
              />
            );
          })}
        </svg>
        <figcaption>
          <strong>{total}</strong>
          <span>referências</span>
        </figcaption>
      </figure>
      <div className="donut-legend">
        {items.map((item) => {
          const percent = total > 0 ? Math.round((item.value / total) * 100) : 0;

          return (
            <div className={item.tone} key={item.status}>
              <span>{item.label}</span>
              <strong>
                {item.value} {percent}%
              </strong>
            </div>
          );
        })}
      </div>
      <p className="donut-summary">{total} referências classificadas.</p>
    </div>
  );
}

function ClientReferenceStatusSummary({
  items,
}: {
  items: ReturnType<typeof clientReferenceStatusSummary>;
}) {
  return (
    <div className="reference-status-summary" title="Situação baseada nas referências do cliente.">
      {items.map((item) => (
        <span
          className={`reference-status-item tone-${item.tone}`}
          key={item.status ?? 'sem-referencias'}
        >
          {item.status ? <span className="reference-status-dot" aria-hidden="true" /> : null}
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function CompactClientDueTable({
  items,
  onOpen,
  onRenew,
}: {
  items: DashboardSummaryPayload['lists']['dueToday'];
  onOpen: (id: string) => Promise<void>;
  onRenew: (id: string, clientReferenceId: string) => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="empty-state compact-empty-state dashboard-empty-state">
        <CalendarClock aria-hidden="true" size={20} />
        <strong>Nenhum cliente nesta lista.</strong>
        <span>Não há vencimentos para hoje.</span>
      </div>
    );
  }

  return (
    <div className="compact-table operational-list due-today-list">
      {items.map((client) => (
        <article key={client.id}>
          <div className="operational-list-main">
            <strong className="operational-list-title">{client.name}</strong>
            <span className="operational-list-reference">
              {client.reference} | {client.planName}
            </span>
          </div>
          <span className="operational-list-value">{formatCurrency(client.recurringValue)}</span>
          <span className="operational-list-date">{formatDate(client.dueDate)}</span>
          <div className="operational-list-status">
            <StatusBadge status={client.status} />
          </div>
          <div className="button-row operational-list-actions">
            <button
              aria-label={`Abrir cliente ${client.name}`}
              className="icon-button"
              title="Ver cliente"
              type="button"
              onClick={() => void onOpen(client.id)}
            >
              <Eye aria-hidden="true" size={16} />
            </button>
            <button
              aria-label={`Renovar ${client.reference}`}
              className="icon-button"
              title="Renovar"
              type="button"
              onClick={() => void onRenew(client.id, client.clientReferenceId)}
            >
              <RefreshCcw aria-hidden="true" size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function OverdueReceivablesTable({
  items,
  onOpenFinance,
}: {
  items: DashboardSummaryPayload['lists']['overdueReceivables'];
  onOpenFinance: () => void;
}) {
  if (!items.length) {
    return (
      <div className="empty-state compact-empty-state dashboard-empty-state">
        <Receipt aria-hidden="true" size={20} />
        <strong>Nenhuma conta vencida.</strong>
        <span>Não há cobranças em atraso no momento.</span>
      </div>
    );
  }

  return (
    <div className="compact-table operational-list overdue-list">
      {items.map((receivable) => (
        <article key={receivable.id}>
          <div className="operational-list-main">
            <strong className="operational-list-title">{receivable.clientName}</strong>
            <span className="operational-list-reference">
              {receivable.clientReference} | {receivable.description}
            </span>
          </div>
          <span className="operational-list-value">{formatCurrency(receivable.amount)}</span>
          <span className="operational-list-date">{formatDate(receivable.dueDate)}</span>
          <span className="operational-list-overdue-days">
            {receivable.daysOverdue} {receivable.daysOverdue === 1 ? 'dia' : 'dias'}
          </span>
          <button
            className="icon-button operational-list-actions"
            title="Abrir financeiro"
            type="button"
            onClick={onOpenFinance}
          >
            <CreditCard aria-hidden="true" size={16} />
          </button>
        </article>
      ))}
    </div>
  );
}

function buildDashboardPeriod(mode: DashboardPeriodMode, customStart: string, customEnd: string) {
  const today = new Date();
  const toDateInput = (date: Date) => date.toISOString().slice(0, 10);
  const todaySaoPaulo = formatSaoPauloDateInput(today);

  if (mode === 'custom') {
    return customStart && customEnd ? { startDate: customStart, endDate: customEnd } : {};
  }

  if (mode === 'today') {
    return { startDate: todaySaoPaulo, endDate: todaySaoPaulo };
  }

  if (mode === 'current') {
    return {};
  }

  if (mode === 'last30') {
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 29),
    );
    return { startDate: toDateInput(start), endDate: toDateInput(today) };
  }

  const monthOffset = mode === 'previous' ? -1 : 0;
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset + 1, 0));

  return { startDate: toDateInput(start), endDate: toDateInput(end) };
}

function buildFinancePeriod(monthStart: Date): FinancePeriod {
  const start = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const monthName = monthNamesPt[start.getUTCMonth()] ?? '';

  return {
    endDate: formatBusinessDate(end),
    label: `${monthName} ${start.getUTCFullYear()}`,
    monthStart: start,
    startDate: formatBusinessDate(start),
  };
}

function buildCustomFinancePeriod(
  label: string,
  startDate: string,
  endDate = startDate,
): FinancePeriod {
  const start = parseBusinessDate(startDate);

  return {
    endDate,
    label,
    monthStart: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)),
    startDate,
  };
}

function currentFinancePeriod() {
  return buildFinancePeriod(new Date());
}

function shiftFinancePeriod(period: FinancePeriod, months: number) {
  return buildFinancePeriod(
    new Date(
      Date.UTC(period.monthStart.getUTCFullYear(), period.monthStart.getUTCMonth() + months, 1),
    ),
  );
}

function addBusinessDaysInput(dateInput: string, days: number) {
  const date = parseBusinessDate(dateInput);
  date.setUTCDate(date.getUTCDate() + days);

  return formatBusinessDate(date);
}

function maxChartValue(values: string[]) {
  return Math.max(...values.map((value) => Number(value)), 1);
}

function niceChartMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;

  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return niceNormalized * magnitude;
}

function buildChartTicks(maxValue: number, steps: number) {
  return Array.from({ length: steps + 1 }, (_, index) => (maxValue / steps) * index).reverse();
}

function cashflowTickInterval(total: number, compact = false) {
  if (total <= 14) return 1;
  if (total <= 31) return compact ? 6 : 3;
  if (total <= 62) return compact ? 10 : 6;
  return compact ? 4 : 2;
}

function shouldShowCashflowTick(index: number, total: number, compact = false) {
  if (total <= 1) return true;
  const interval = cashflowTickInterval(total, compact);

  return index === 0 || index === total - 1 || index % interval === 0;
}

function formatAxisCurrency(value: number) {
  if (value >= 1000) {
    return `R$ ${new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: value >= 10000 ? 0 : 1,
      minimumFractionDigits: 0,
    }).format(value / 1000)} mil`;
  }

  return formatCurrency(String(value));
}

function formatPeriodLabel(period: string) {
  if (period.length === 7) {
    const [year, month] = period.split('-');
    const monthLabel = shortMonthNamesPt[Number(month) - 1] ?? month;
    return `${monthLabel}/${year}`;
  }

  if (period.length === 10) {
    const [, month, day] = period.split('-');
    return day && month ? `${day}/${month}` : period;
  }

  return formatDate(period);
}

function formatTooltipPeriodLabel(period: string) {
  if (period.length === 10) return formatDate(period);

  return formatPeriodLabel(period);
}

type ConfigurablePaymentProvider = Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPIX' | 'FASTPAY'>;

const configurablePaymentProviders = [
  'FASTFLOW',
  'FASTPIX',
  'FASTPAY',
] satisfies ConfigurablePaymentProvider[];

function ReferralsView({ clients }: { clients: Client[] }) {
  const [items, setItems] = useState<Referral[]>([]);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ReferralStatus | ''>('');
  const [referrerClientId, setReferrerClientId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginatedClients['pagination'] | null>(null);
  const [confirming, setConfirming] = useState<Referral | null>(null);
  const [detail, setDetail] = useState<Referral | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [canceling, setCanceling] = useState<Referral | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rewardClientReferenceId, setRewardClientReferenceId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const trimmedSearch = search.trim();
      const summaryFilters = {
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        ...(referrerClientId ? { referrerClientId } : {}),
      };
      const [list, nextSummary] = await Promise.all([
        listReferrals({
          page,
          pageSize: listPageSize,
          ...(trimmedSearch ? { search: trimmedSearch } : {}),
          ...(status ? { status } : {}),
          ...(referrerClientId ? { referrerClientId } : {}),
        }),
        getReferralSummary(summaryFilters),
      ]);
      setItems(list.items);
      setPagination(list.pagination);
      setSummary(nextSummary);
      if (!list.items.length && list.pagination.page > 1 && list.pagination.total > 0) {
        setPage(Math.max(1, list.pagination.totalPages));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar indicações.');
    } finally {
      setLoading(false);
    }
  }, [page, referrerClientId, search, status]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

  async function openReferralDetail(referral: Referral) {
    setDetail(referral);
    setDetailLoading(true);
    setError('');

    try {
      const current = await getReferral(referral.id);
      setDetail(current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a indicação.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function applyReward(referral: Referral) {
    setError('');

    try {
      await applyReferralReward(referral.id, {
        ...(referral.rewardType === 'FREE_MONTH'
          ? { clientReferenceId: rewardClientReferenceId }
          : {}),
      });
      setConfirming(null);
      setRewardClientReferenceId('');
      await loadReferrals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aplicar o benefício.');
    }
  }

  async function cancelCurrentReferral(referral: Referral) {
    const reason = cancelReason.trim();

    if (!reason) {
      setError('Informe o motivo do cancelamento.');
      return;
    }

    setError('');
    try {
      await cancelReferral(referral.id, reason);
      setCanceling(null);
      setCancelReason('');
      await loadReferrals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar a indicação.');
    }
  }

  const totalReferrals = summary?.total ?? 0;
  const kpis = [
    { icon: UsersRound, label: 'Total', tone: 'primary', value: totalReferrals },
    { icon: Clock, label: 'Pendentes', tone: 'warning', value: summary?.pending ?? 0 },
    { icon: CalendarDays, label: 'Qualificadas', tone: 'info', value: summary?.qualified ?? 0 },
    { icon: Gift, label: 'Benefícios aplicados', tone: 'success', value: summary?.rewarded ?? 0 },
    { icon: XCircle, label: 'Canceladas', tone: 'danger', value: summary?.canceled ?? 0 },
  ] satisfies Array<{
    icon: LucideIcon;
    label: string;
    tone: 'warning' | 'info' | 'success' | 'primary' | 'danger';
    value: number;
  }>;

  return (
    <section className="referrals-view">
      <PageHeader
        eyebrow="CRM NOVO UI 2.0"
        title="Indicações"
        subtitle="Acompanhe indicações, qualificações e benefícios dos clientes."
        icon={UsersRound}
      />
      {error ? <div className="notice danger">{error}</div> : null}

      <div className="metric-grid referrals-kpis">
        {kpis.map((kpi) => (
          <StatCard
            icon={kpi.icon}
            key={kpi.label}
            label={kpi.label}
            tone={kpi.tone}
            value={loading ? '-' : kpi.value}
          />
        ))}
      </div>

      <Card className="referrals-workspace">
        <SectionHeader
          eyebrow="Indicações"
          title="Acompanhe o ciclo das indicações realizadas pelos clientes."
        />
        <div className="toolbar referrals-toolbar">
          <div className="search-row">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Buscar indicador ou indicado"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Status da indicação"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ReferralStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="QUALIFIED">Qualificada</option>
            <option value="REWARDED">Benefício aplicado</option>
            <option value="CANCELED">Cancelada</option>
          </select>
          <select
            aria-label="Indicador"
            value={referrerClientId}
            onChange={(event) => {
              setReferrerClientId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os indicadores</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} · {clientReferenceCountLabel(client.references?.length ?? 1)}
              </option>
            ))}
          </select>
          <Button icon={Filter} onClick={() => void loadReferrals()}>
            Aplicar
          </Button>
        </div>
        <div className="table-wrap referrals-table-wrap">
          <table className="referrals-table">
            <thead>
              <tr>
                <th>Indicado</th>
                <th>Indicador</th>
                <th className="date-column">Data</th>
                <th className="finance-status-column">Status</th>
                <th>Benefício</th>
                <th className="date-column">Qualificação</th>
                <th className="date-column">Aplicação</th>
                <th className="finance-actions-column">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((referral) => (
                <tr key={referral.id}>
                  <td>
                    <ReferralClientCell client={referral.referredClient} />
                  </td>
                  <td>
                    <ReferralClientCell client={referral.referrerClient} />
                  </td>
                  <td className="date-column">{formatDateTime(referral.createdAt)}</td>
                  <td className="finance-status-column">
                    <span
                      className={`finance-status-pill tone-${referralStatusTone(referral.status)}`}
                    >
                      {referralStatusLabel(referral.status)}
                    </span>
                  </td>
                  <td>
                    <strong>{referralRewardTypeLabel(referral.rewardType)}</strong>
                    <span>{referralBenefitLabel(referral)}</span>
                  </td>
                  <td className="date-column">
                    {referral.qualifiedAt ? formatDateTime(referral.qualifiedAt) : '—'}
                  </td>
                  <td className="date-column">
                    {referral.appliedAt ? formatDateTime(referral.appliedAt) : '—'}
                  </td>
                  <td className="finance-actions-column">
                    <div className="table-actions">
                      <IconButton
                        icon={Eye}
                        label={`Visualizar indicação de ${referral.referredClient.name}`}
                        onClick={() => void openReferralDetail(referral)}
                      />
                      {referral.status === 'QUALIFIED' ? (
                        <Button
                          icon={Gift}
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setRewardClientReferenceId('');
                            setConfirming(referral);
                          }}
                        >
                          Aplicar benefício
                        </Button>
                      ) : null}
                      {referral.status !== 'REWARDED' && referral.status !== 'CANCELED' ? (
                        <ActionMenu
                          items={[
                            {
                              danger: true,
                              icon: XCircle,
                              label: 'Cancelar',
                              onSelect: () => {
                                setCancelReason('');
                                setCanceling(referral);
                              },
                            },
                          ]}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <UsersRound aria-hidden="true" size={20} />
                      <strong>{loading ? 'Carregando...' : 'Nenhuma indicação encontrada'}</strong>
                      {!loading ? (
                        <span>Nenhum registro corresponde aos filtros atuais.</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <PaginationControls
            itemLabel="indicações"
            pagination={pagination}
            onPageChange={setPage}
          />
        </div>
      </Card>

      {detail ? (
        <ReferralDetailModal
          loading={detailLoading}
          referral={detail}
          onClose={() => setDetail(null)}
        />
      ) : null}
      {confirming ? (
        <ReferralRewardModal
          clients={clients}
          referral={confirming}
          rewardClientReferenceId={rewardClientReferenceId}
          onApply={() => void applyReward(confirming)}
          onChangeReference={setRewardClientReferenceId}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      {canceling ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal referral-cancel-modal" aria-labelledby="referral-cancel-title">
            <header className="modal-header modal-header-with-icon">
              <span className="modal-icon danger" aria-hidden="true">
                <XCircle size={16} />
              </span>
              <div>
                <span className="metric-label">Cancelamento</span>
                <h2 id="referral-cancel-title">Cancelar indicação</h2>
                <p>Informe o motivo antes de cancelar esta indicação.</p>
              </div>
              <IconButton
                icon={X}
                label="Fechar cancelamento da indicação"
                onClick={() => setCanceling(null)}
              />
            </header>
            <label className="field referral-cancel-reason">
              <span>Motivo do cancelamento</span>
              <textarea
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <div className="button-row">
                <Button onClick={() => setCanceling(null)}>Cancelar</Button>
                <Button
                  icon={XCircle}
                  variant="danger"
                  onClick={() => void cancelCurrentReferral(canceling)}
                >
                  Confirmar cancelamento
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ReferralClientCell({ client }: { client: Referral['referredClient'] }) {
  return (
    <div className="referral-client-cell">
      <strong>{client.name}</strong>
      <span>{client.reference}</span>
    </div>
  );
}

function referralStatusLabel(status: ReferralStatus) {
  const labels = {
    PENDING: 'Pendente',
    QUALIFIED: 'Qualificada',
    REWARDED: 'Benefício aplicado',
    CANCELED: 'Cancelada',
  } satisfies Record<ReferralStatus, string>;

  return labels[status];
}

function referralStatusTone(status: ReferralStatus) {
  const tones = {
    PENDING: 'warning',
    QUALIFIED: 'info',
    REWARDED: 'success',
    CANCELED: 'danger',
  } satisfies Record<ReferralStatus, 'warning' | 'info' | 'success' | 'danger'>;

  return tones[status];
}

function referralRewardTypeLabel(type: Referral['rewardType']) {
  const labels = {
    FREE_MONTH: 'Mês grátis',
    CREDIT: 'Crédito',
    CUSTOM: 'Personalizado',
  } satisfies Record<Referral['rewardType'], string>;

  return labels[type];
}

function referralBenefitLabel(
  referral: Pick<Referral, 'rewardType' | 'rewardValue' | 'rewardDescription'>,
) {
  if (referral.rewardType === 'FREE_MONTH') return 'Mês grátis';
  if (referral.rewardType === 'CREDIT') {
    return referral.rewardValue
      ? `${formatCurrency(referral.rewardValue)} · Benefício registrado`
      : 'Benefício registrado';
  }

  return referral.rewardDescription ?? 'Benefício personalizado';
}

function ReferralDetailModal({
  loading,
  onClose,
  referral,
}: {
  loading: boolean;
  onClose: () => void;
  referral: Referral;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal referral-detail-modal" aria-labelledby="referral-detail-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <UsersRound size={16} />
          </span>
          <div>
            <span className="metric-label">Indicações</span>
            <h2 id="referral-detail-title">Detalhes da indicação</h2>
            <p>{loading ? 'Atualizando dados da indicação...' : 'Ciclo atual da indicação.'}</p>
          </div>
          <IconButton icon={X} label="Fechar detalhes da indicação" onClick={onClose} />
        </header>

        <div className="referral-detail-grid">
          {[
            ['Indicador', referral.referrerClient.name],
            ['Indicado', referral.referredClient.name],
            ['Data da indicação', formatDateTime(referral.createdAt)],
            ['Status', referralStatusLabel(referral.status)],
            ['Tipo de benefício', referralRewardTypeLabel(referral.rewardType)],
            ['Qualificada em', referral.qualifiedAt ? formatDateTime(referral.qualifiedAt) : null],
            [
              'Benefício aplicado em',
              referral.appliedAt ? formatDateTime(referral.appliedAt) : null,
            ],
            ['Cancelada em', referral.canceledAt ? formatDateTime(referral.canceledAt) : null],
            ['Motivo do cancelamento', referral.cancellationReason],
          ]
            .filter(([, value]) => Boolean(value))
            .map(([label, value]) => {
              const labelText = String(label);

              return (
                <div
                  className={[
                    labelText === 'Status' ? 'referral-detail-status' : '',
                    labelText.includes('em') || labelText.includes('Data')
                      ? 'referral-detail-date'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  key={labelText}
                >
                  <span>{labelText}</span>
                  <strong>{value}</strong>
                </div>
              );
            })}
        </div>

        <ReferralProgress referral={referral} />
      </section>
    </div>
  );
}

function ReferralProgress({ referral }: { referral: Referral }) {
  const steps = referralProgressSteps(referral);

  return (
    <div className="referral-progress">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <article className={`step-${step.state}`} key={step.label}>
            <span className={`referral-progress-icon state-${step.state}`} aria-hidden="true">
              <Icon size={15} />
            </span>
            <div>
              <strong>{step.label}</strong>
              <small>{step.date ? formatDateTime(step.date) : '—'}</small>
            </div>
            {index < steps.length - 1 ? <ArrowRight aria-hidden="true" size={16} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function referralProgressSteps(referral: Referral) {
  if (referral.status === 'CANCELED') {
    return [
      {
        date: referral.createdAt,
        icon: UsersRound,
        label: 'Indicação criada',
        state: 'complete',
      },
      {
        date: referral.canceledAt,
        icon: XCircle,
        label: 'Cancelada',
        state: 'canceled',
      },
    ] satisfies Array<ReferralProgressStep>;
  }

  return [
    {
      date: referral.createdAt,
      icon: UsersRound,
      label: 'Indicação criada',
      state: 'complete',
    },
    {
      date: referral.qualifiedAt,
      icon: CircleCheck,
      label: 'Qualificada',
      state:
        referral.status === 'PENDING'
          ? 'future'
          : referral.status === 'QUALIFIED'
            ? 'current'
            : 'complete',
    },
    {
      date: referral.appliedAt,
      icon: Gift,
      label: 'Benefício aplicado',
      state: referral.status === 'REWARDED' ? 'complete' : 'future',
    },
  ] satisfies Array<ReferralProgressStep>;
}

type ReferralProgressStep = {
  date: string | null;
  icon: LucideIcon;
  label: string;
  state: 'complete' | 'current' | 'future' | 'canceled';
};

function ReferralRewardModal({
  clients,
  onApply,
  onChangeReference,
  onClose,
  referral,
  rewardClientReferenceId,
}: {
  clients: Client[];
  onApply: () => void;
  onChangeReference: (id: string) => void;
  onClose: () => void;
  referral: Referral;
  rewardClientReferenceId: string;
}) {
  const referrer = clients.find((client) => client.id === referral.referrerClientId);
  const eligibleReferences =
    referrer?.references?.filter((reference) => reference.status !== 'CANCELADO') ?? [];
  const selectedReference = eligibleReferences.find(
    (reference) => reference.id === rewardClientReferenceId,
  );
  const freeMonthPreview = buildFreeMonthPreview(selectedReference);
  const canApplyFreeMonthReward =
    Boolean(rewardClientReferenceId) && Boolean(selectedReference) && Boolean(freeMonthPreview);
  const isApplyDisabled = referral.rewardType === 'FREE_MONTH' && !canApplyFreeMonthReward;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal referral-reward-modal" aria-labelledby="referral-reward-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <Gift size={16} />
          </span>
          <div>
            <span className="metric-label">Benefício</span>
            <h2 id="referral-reward-title">Aplicar benefício</h2>
            <p>Conceda o benefício ao cliente que realizou a indicação.</p>
          </div>
          <IconButton icon={X} label="Fechar aplicação de benefício" onClick={onClose} />
        </header>

        <div className="referral-detail-grid">
          <div>
            <span>Indicador</span>
            <strong>{referral.referrerClient.name}</strong>
          </div>
          <div>
            <span>Indicado</span>
            <strong>{referral.referredClient.name}</strong>
          </div>
          <div>
            <span>Tipo de benefício</span>
            <strong>{referralRewardTypeLabel(referral.rewardType)}</strong>
          </div>
        </div>

        {referral.rewardType === 'FREE_MONTH' ? (
          <>
            <label className="field">
              <span>Referência que receberá o benefício</span>
              <p className="field-help">
                Escolha qual serviço do cliente indicador receberá o mês grátis.
              </p>
              <select
                required
                value={rewardClientReferenceId}
                onChange={(event) => onChangeReference(event.target.value)}
              >
                <option value="">Selecione uma referência</option>
                {eligibleReferences.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.reference} · {reference.plan.name} · próximo vencimento{' '}
                    {formatDate(reference.dueDate)}
                  </option>
                ))}
              </select>
            </label>
            {selectedReference ? (
              <div className="selected-reward-reference">
                <span>Referência que receberá o benefício</span>
                <strong>{selectedReference.reference}</strong>
                <small>{selectedReference.plan.name}</small>
              </div>
            ) : null}
            <div className="free-month-preview">
              <article>
                <span>Vencimento atual</span>
                <strong>{freeMonthPreview?.currentDueDateLabel ?? '—'}</strong>
              </article>
              <ArrowRight aria-hidden="true" size={18} />
              <article>
                <span>Novo vencimento</span>
                <strong>{freeMonthPreview?.newDueDateLabel ?? '—'}</strong>
              </article>
            </div>
            <p className="field-help">O mês grátis adia o próximo vencimento em 1 mês.</p>
          </>
        ) : (
          <div className="notice">
            <strong>{referralBenefitLabel(referral)}</strong>
            <span>Benefício registrado na indicação.</span>
          </div>
        )}

        <div className="form-actions">
          <div className="button-row">
            <Button onClick={onClose}>Cancelar</Button>
            <Button disabled={isApplyDisabled} icon={Gift} variant="primary" onClick={onApply}>
              Aplicar benefício
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function buildFreeMonthPreview(reference?: ClientReference) {
  if (!reference) {
    return null;
  }

  try {
    const currentDueDate = reference.dueDate.slice(0, 10);
    const newDueDate = formatBusinessDate(
      addCalendarMonthsPreservingAnchor(
        parseBusinessDate(currentDueDate),
        1,
        reference.billingAnchorDay,
      ),
    );

    return {
      currentDueDate,
      currentDueDateLabel: formatDate(currentDueDate),
      newDueDate,
      newDueDateLabel: formatDate(newDueDate),
    };
  } catch {
    return null;
  }
}

const reportDefinitions = [
  { id: 'clients', label: 'Clientes' },
  { id: 'references', label: 'Referências/Serviços' },
  { id: 'renewals', label: 'Renovações' },
  { id: 'receivables', label: 'Contas a receber' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'billing', label: 'Cobranças' },
  { id: 'recovery', label: 'Recuperação' },
  { id: 'referrals', label: 'Indicações' },
] satisfies Array<{ id: ReportType; label: string }>;

function ReportsView({ clients, plans }: { clients: Client[]; plans: Plan[] }) {
  const [reportType, setReportType] = useState<ReportType>('clients');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [report, setReport] = useState<OperationalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sortedPlans = sortPlansByDuration(plans);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      setReport(await getReport(reportType, filters));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar relatório.');
    } finally {
      setLoading(false);
    }
  }, [filters, reportType]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function updateFilter<Key extends keyof ReportFilters>(key: Key, value: ReportFilters[Key]) {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  }

  async function exportCsv() {
    setError('');

    try {
      const blob = await downloadReportCsv(reportType, filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `crm-novo-${reportType}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível exportar CSV.');
    }
  }

  return (
    <section className="workspace-main reports-view">
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="tabs">
        {reportDefinitions.map((definition) => (
          <button
            className={reportType === definition.id ? 'active' : ''}
            key={definition.id}
            type="button"
            onClick={() => {
              setReportType(definition.id);
              setFilters({});
            }}
          >
            {definition.label}
          </button>
        ))}
      </div>

      <div className="toolbar report-filters">
        <label className="field compact-field">
          <span>Inicio</span>
          <input
            type="date"
            value={filters.startDate ?? ''}
            onChange={(event) => updateFilter('startDate', event.target.value)}
          />
        </label>
        <label className="field compact-field">
          <span>Fim</span>
          <input
            type="date"
            value={filters.endDate ?? ''}
            onChange={(event) => updateFilter('endDate', event.target.value)}
          />
        </label>
        <div className="search-row">
          <Search aria-hidden="true" size={18} />
          <input
            placeholder="Buscar cliente, referência ou descrição"
            value={filters.search ?? ''}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
        </div>
        {reportType === 'clients' ? (
          <>
            <select
              value={filters.clientStatus ?? ''}
              onChange={(event) =>
                updateFilter('clientStatus', event.target.value as ClientStatus | '')
              }
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE_PAGAMENTO">Pendente pagamento</option>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <select
              value={filters.planId ?? ''}
              onChange={(event) => updateFilter('planId', event.target.value)}
            >
              <option value="">Todos os planos</option>
              {sortedPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {reportType === 'receivables' ? (
          <select
            value={filters.receivableDisplayStatus ?? ''}
            onChange={(event) =>
              updateFilter(
                'receivableDisplayStatus',
                event.target.value as ReceivableDisplayStatus | '',
              )
            }
          >
            <option value="">Todas as situações</option>
            <option value="PENDENTE">Pendente</option>
            <option value="VENCIDO">Vencido</option>
            <option value="PAGO">Pago</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        ) : null}
        {reportType === 'finance' ? (
          <>
            <select
              value={filters.transactionType ?? ''}
              onChange={(event) =>
                updateFilter('transactionType', event.target.value as FinancialTransactionType | '')
              }
            >
              <option value="">Entradas e saídas</option>
              <option value="ENTRADA">Entradas</option>
              <option value="SAIDA">Saídas</option>
            </select>
            <select
              value={filters.transactionOrigin ?? ''}
              onChange={(event) =>
                updateFilter(
                  'transactionOrigin',
                  event.target.value as FinancialTransactionOrigin | '',
                )
              }
            >
              <option value="">Todas as origens</option>
              <option value="RECEIVABLE_PAYMENT">Contas a receber</option>
              <option value="LEGACY_IMPORT">Importação histórica</option>
              <option value="MANUAL">Manual</option>
            </select>
          </>
        ) : null}
        {reportType === 'billing' ? (
          <select
            value={filters.dispatchStatus ?? ''}
            onChange={(event) =>
              updateFilter('dispatchStatus', event.target.value as MessageDispatch['status'] | '')
            }
          >
            <option value="">Todos os status</option>
            <option value="SCHEDULED">Agendada</option>
            <option value="SENT">Enviada</option>
            <option value="FAILED">Falhada</option>
            <option value="CANCELED">Cancelada</option>
            <option value="IGNORED">Ignorada</option>
          </select>
        ) : null}
        {reportType === 'recovery' ? (
          <select
            value={filters.recoveryStatus ?? ''}
            onChange={(event) =>
              updateFilter('recoveryStatus', event.target.value as RecoveryCampaignStatus | '')
            }
          >
            <option value="">Todos os status</option>
            <option value="ATIVA">Ativa</option>
            <option value="CONCLUIDA">Concluida</option>
            <option value="CANCELADA">Cancelada</option>
          </select>
        ) : null}
        {reportType === 'referrals' ? (
          <>
            <select
              value={filters.referralStatus ?? ''}
              onChange={(event) =>
                updateFilter('referralStatus', event.target.value as ReferralStatus | '')
              }
            >
              <option value="">Todos os status</option>
              <option value="PENDING">Pendente</option>
              <option value="QUALIFIED">Qualificada</option>
              <option value="REWARDED">Recompensada</option>
              <option value="CANCELED">Cancelada</option>
            </select>
            <select
              value={filters.referrerClientId ?? ''}
              onChange={(event) => updateFilter('referrerClientId', event.target.value)}
            >
              <option value="">Todos os indicadores</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} · {client.reference}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button className="secondary-button" type="button" onClick={() => setFilters({})}>
          Limpar filtros
        </button>
        <button className="secondary-button" type="button" onClick={() => void loadReport()}>
          <RefreshCcw aria-hidden="true" size={16} />
          Atualizar
        </button>
        <button className="primary-button" type="button" onClick={() => void exportCsv()}>
          <Download aria-hidden="true" size={16} />
          CSV
        </button>
      </div>

      <div className="metric-grid report-kpis">
        <article className="metric-card compact">
          <span className="metric-label">Registros</span>
          <strong className="metric-value">{loading ? '-' : (report?.total ?? 0)}</strong>
          <p>{report?.limited ? 'Exibição limitada para manter performance.' : 'Filtro atual'}</p>
        </article>
        {report?.summary
          ? Object.entries(report.summary).map(([key, value]) => (
              <article className="metric-card compact" key={key}>
                <span className="metric-label">{reportSummaryLabel(key)}</span>
                <strong className="metric-value">{reportSummaryValue(value)}</strong>
              </article>
            ))
          : null}
      </div>

      <div className="table-wrap report-table">
        <table>
          <thead>
            <tr>
              {(report?.columns ?? []).map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(report?.rows ?? []).map((row, index) => (
              <tr key={`${reportType}-${index}`}>
                {(report?.columns ?? []).map((column) => (
                  <td key={column}>{row[column] || '-'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!report?.rows.length ? (
          <div className="empty-state">{loading ? 'Carregando...' : 'Nenhum registro.'}</div>
        ) : null}
      </div>
    </section>
  );
}

function reportSummaryValue(value: unknown) {
  if (Array.isArray(value)) return String(value.length);
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return formatCurrency(value);
  if (typeof value === 'number') return String(value);
  return '-';
}

type SettingsSection = 'overview' | 'finance' | 'payments' | 'whatsapp' | 'billing' | 'system';
type SettingsBillingTab = 'rules' | 'templates';

const settingsSections = [
  {
    description: 'Resumo das áreas administrativas do CRM.',
    icon: LayoutDashboard,
    id: 'overview',
    label: 'Visão geral',
  },
  {
    description: 'Categorias e parâmetros financeiros.',
    icon: CreditCard,
    id: 'finance',
    label: 'Financeiro',
  },
  {
    description: 'Provedores usados para gerar e receber PIX.',
    icon: QrCode,
    id: 'payments',
    label: 'Pagamentos',
  },
  {
    description: 'Resumo da integração operacional com a Kirago.',
    icon: MessageCircle,
    id: 'whatsapp',
    label: 'WhatsApp',
  },
  {
    description: 'Regras de cobrança, recuperação e mensagens automáticas.',
    icon: Workflow,
    id: 'billing',
    label: 'Cobrança e automações',
  },
  {
    description: 'Saúde da API e diagnósticos seguros.',
    icon: ShieldCheck,
    id: 'system',
    label: 'Sistema',
  },
] satisfies Array<{
  description: string;
  icon: LucideIcon;
  id: SettingsSection;
  label: string;
}>;

function SettingsView({
  initialBillingTab,
  initialSection,
  onOpenAutomations,
  onOpenFinance,
  onOpenWhatsApp,
}: {
  initialBillingTab: SettingsBillingTab;
  initialSection: SettingsSection;
  onOpenAutomations: () => void;
  onOpenFinance: () => void;
  onOpenWhatsApp: () => void;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [credentials, setCredentials] = useState<PaymentProviderCredentialStatus[]>([]);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingAutomationSettings | null>(null);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [billingSendTime, setBillingSendTime] = useState('09:00');
  const [billingSendIntervalSeconds, setBillingSendIntervalSeconds] = useState('8');
  const [recoverySettings, setRecoverySettings] = useState<RecoveryAutomationSettings | null>(null);
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoverySendTime, setRecoverySendTime] = useState('09:00');
  const [recoverySendIntervalSeconds, setRecoverySendIntervalSeconds] = useState('8');
  const [recoveryDay3Enabled, setRecoveryDay3Enabled] = useState(true);
  const [recoveryDay3OffsetDays, setRecoveryDay3OffsetDays] = useState('3');
  const [recoveryDay10Enabled, setRecoveryDay10Enabled] = useState(true);
  const [recoveryDay10OffsetDays, setRecoveryDay10OffsetDays] = useState('7');
  const [recoveryDay15Enabled, setRecoveryDay15Enabled] = useState(true);
  const [recoveryDay15OffsetDays, setRecoveryDay15OffsetDays] = useState('15');
  const [recoveryDay30Enabled, setRecoveryDay30Enabled] = useState(true);
  const [recoveryDay30OffsetDays, setRecoveryDay30OffsetDays] = useState('30');
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySaving, setRecoverySaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [healthError, setHealthError] = useState('');
  const [billingError, setBillingError] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const loadingRef = useRef(false);
  const actionRef = useRef(false);
  const billingSaveRef = useRef(false);
  const recoverySaveRef = useRef(false);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const loadCredentials = useCallback(async () => {
    if (loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError('');

    try {
      setCredentials(await listPaymentProviderCredentials());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar integrações.');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setError('');

    try {
      setCategories(await listFinancialCategories());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar categorias.');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const applyBillingSettings = useCallback((settings: BillingAutomationSettings) => {
    setBillingSettings(settings);
    setBillingEnabled(settings.enabled);
    setBillingSendTime(settings.sendTime);
    setBillingSendIntervalSeconds(String(settings.sendIntervalSeconds));
  }, []);

  const applyRecoverySettings = useCallback((settings: RecoveryAutomationSettings) => {
    setRecoverySettings(settings);
    setRecoveryEnabled(settings.enabled);
    setRecoverySendTime(settings.sendTime);
    setRecoverySendIntervalSeconds(String(settings.sendIntervalSeconds));
    setRecoveryDay3Enabled(settings.day3Enabled);
    setRecoveryDay3OffsetDays(String(settings.day3OffsetDays));
    setRecoveryDay10Enabled(settings.day10Enabled);
    setRecoveryDay10OffsetDays(String(settings.day10OffsetDays));
    setRecoveryDay15Enabled(settings.day15Enabled);
    setRecoveryDay15OffsetDays(String(settings.day15OffsetDays));
    setRecoveryDay30Enabled(settings.day30Enabled);
    setRecoveryDay30OffsetDays(String(settings.day30OffsetDays));
  }, []);

  const loadBillingSettings = useCallback(async () => {
    setBillingLoading(true);
    setBillingError('');

    try {
      applyBillingSettings(await getBillingAutomationSettings());
    } catch (err) {
      setBillingError(
        err instanceof Error ? err.message : 'Não foi possível carregar cobrança automática.',
      );
    } finally {
      setBillingLoading(false);
    }
  }, [applyBillingSettings]);

  const loadRecoverySettings = useCallback(async () => {
    setRecoveryLoading(true);
    setRecoveryError('');

    try {
      applyRecoverySettings(await getRecoveryAutomationSettings());
    } catch (err) {
      setRecoveryError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar recuperação de inadimplência.',
      );
    } finally {
      setRecoveryLoading(false);
    }
  }, [applyRecoverySettings]);

  useEffect(() => {
    if (activeSection === 'billing' && !billingSettings && !billingLoading) {
      void loadBillingSettings();
    }
    if (activeSection === 'billing' && !recoverySettings && !recoveryLoading) {
      void loadRecoverySettings();
    }
  }, [
    activeSection,
    billingLoading,
    billingSettings,
    loadBillingSettings,
    loadRecoverySettings,
    recoveryLoading,
    recoverySettings,
  ]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError('');

    try {
      setHealthStatus(await getHealthStatus());
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Não foi possível carregar status.');
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection === 'system' && !healthStatus && !healthLoading) {
      void loadHealth();
    }
  }, [activeSection, healthLoading, healthStatus, loadHealth]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    if (actionRef.current) return false;

    actionRef.current = true;
    setNotice('');
    setError('');

    try {
      await action();
      await loadCredentials();
      setNotice(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar integração.');
      return false;
    } finally {
      actionRef.current = false;
    }
  }

  const parsedBillingInterval = Number(billingSendIntervalSeconds);
  const billingIntervalValid =
    Number.isInteger(parsedBillingInterval) &&
    parsedBillingInterval >= 3 &&
    parsedBillingInterval <= 300;
  const billingDirty = Boolean(
    billingSettings &&
    (billingEnabled !== billingSettings.enabled ||
      billingSendTime !== billingSettings.sendTime ||
      parsedBillingInterval !== billingSettings.sendIntervalSeconds),
  );
  const parsedRecoveryInterval = Number(recoverySendIntervalSeconds);
  const parsedRecoveryDay3Offset = Number(recoveryDay3OffsetDays);
  const parsedRecoveryDay10Offset = Number(recoveryDay10OffsetDays);
  const parsedRecoveryDay15Offset = Number(recoveryDay15OffsetDays);
  const parsedRecoveryDay30Offset = Number(recoveryDay30OffsetDays);
  const recoveryIntervalValid =
    Number.isInteger(parsedRecoveryInterval) &&
    parsedRecoveryInterval >= 3 &&
    parsedRecoveryInterval <= 300;
  const recoveryOffsets = [
    parsedRecoveryDay3Offset,
    parsedRecoveryDay10Offset,
    parsedRecoveryDay15Offset,
    parsedRecoveryDay30Offset,
  ];
  const recoveryOffsetsValid =
    recoveryOffsets.every((offset) => Number.isInteger(offset) && offset >= 1 && offset <= 365) &&
    new Set(recoveryOffsets).size === recoveryOffsets.length &&
    recoveryOffsets.every((offset, index) => index === 0 || offset > recoveryOffsets[index - 1]!);
  const recoveryDirty = Boolean(
    recoverySettings &&
    (recoveryEnabled !== recoverySettings.enabled ||
      recoverySendTime !== recoverySettings.sendTime ||
      parsedRecoveryInterval !== recoverySettings.sendIntervalSeconds ||
      recoveryDay3Enabled !== recoverySettings.day3Enabled ||
      parsedRecoveryDay3Offset !== recoverySettings.day3OffsetDays ||
      recoveryDay10Enabled !== recoverySettings.day10Enabled ||
      parsedRecoveryDay10Offset !== recoverySettings.day10OffsetDays ||
      recoveryDay15Enabled !== recoverySettings.day15Enabled ||
      parsedRecoveryDay15Offset !== recoverySettings.day15OffsetDays ||
      recoveryDay30Enabled !== recoverySettings.day30Enabled ||
      parsedRecoveryDay30Offset !== recoverySettings.day30OffsetDays),
  );

  async function saveBillingAutomationSettings() {
    if (!billingSettings || billingSaveRef.current || !billingIntervalValid || !billingSendTime) {
      return;
    }

    billingSaveRef.current = true;
    setBillingSaving(true);
    setBillingError('');
    setNotice('');

    try {
      const next = await updateBillingAutomationSettings({
        enabled: billingEnabled,
        sendTime: billingSendTime,
        sendIntervalSeconds: parsedBillingInterval,
        timezone: billingSettings.timezone,
      });
      applyBillingSettings(next);
      setNotice('Configurações salvas.');
    } catch (err) {
      setBillingError(
        err instanceof Error ? err.message : 'Não foi possível salvar cobrança automática.',
      );
    } finally {
      setBillingSaving(false);
      billingSaveRef.current = false;
    }
  }

  async function saveRecoveryAutomationSettings() {
    if (
      !recoverySettings ||
      recoverySaveRef.current ||
      !recoveryIntervalValid ||
      !recoveryOffsetsValid ||
      !recoverySendTime
    ) {
      return;
    }

    recoverySaveRef.current = true;
    setRecoverySaving(true);
    setRecoveryError('');
    setNotice('');

    try {
      const next = await updateRecoveryAutomationSettings({
        enabled: recoveryEnabled,
        sendTime: recoverySendTime,
        sendIntervalSeconds: parsedRecoveryInterval,
        timezone: recoverySettings.timezone,
        day3Enabled: recoveryDay3Enabled,
        day3OffsetDays: parsedRecoveryDay3Offset,
        day10Enabled: recoveryDay10Enabled,
        day10OffsetDays: parsedRecoveryDay10Offset,
        day15Enabled: recoveryDay15Enabled,
        day15OffsetDays: parsedRecoveryDay15Offset,
        day30Enabled: recoveryDay30Enabled,
        day30OffsetDays: parsedRecoveryDay30Offset,
      });
      applyRecoverySettings(next);
      setNotice('Configurações de recuperação salvas.');
    } catch (err) {
      setRecoveryError(
        err instanceof Error
          ? err.message
          : 'Não foi possível salvar recuperação de inadimplência.',
      );
    } finally {
      setRecoverySaving(false);
      recoverySaveRef.current = false;
    }
  }

  const byProvider = (provider: ConfigurablePaymentProvider) =>
    credentials.find((credential) => credential.provider === provider) ?? {
      provider,
      configured: false,
      status: 'NAO_CONFIGURADO' as const,
    };
  const configuredProviders = credentials.filter((credential) => credential.configured).length;
  const defaultProvider = credentials.find((credential) => credential.defaultForPix);
  const activeSectionMeta =
    settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0]!;

  function openSection(section: SettingsSection) {
    setActiveSection(section);
    setNotice('');
    setError('');
  }

  return (
    <section className="workspace-main settings-v2">
      {error ? <div className="notice danger">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <PageHeader title="Configurações" subtitle="Gerencie preferências e integrações do CRM" />

      <div className="settings-v2-mobile-nav">
        <label className="field">
          <span>Seção</span>
          <select
            aria-label="Navegação interna de configurações"
            value={activeSection}
            onChange={(event) => openSection(event.target.value as SettingsSection)}
          >
            {settingsSections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="settings-v2-layout">
        <nav className="settings-v2-nav" aria-label="Navegação interna de configurações">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                aria-current={activeSection === section.id ? 'page' : undefined}
                className={activeSection === section.id ? 'active' : ''}
                key={section.id}
                type="button"
                onClick={() => openSection(section.id)}
              >
                <Icon aria-hidden="true" size={17} />
                <span>{section.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="settings-v2-content">
          <header className="settings-v2-section-header">
            <div>
              <span className="metric-label">Configurações</span>
              <h2>{activeSectionMeta.label}</h2>
              <p>{activeSectionMeta.description}</p>
            </div>
          </header>

          {activeSection === 'overview' ? (
            <SettingsOverview
              activeCategories={categories.filter((category) => category.active).length}
              configuredProviders={configuredProviders}
              defaultProvider={defaultProvider?.provider}
              onOpenAutomations={() => openSection('billing')}
              onOpenFinance={() => openSection('finance')}
              onOpenPayments={() => openSection('payments')}
              onOpenSystem={() => openSection('system')}
              onOpenWhatsApp={() => openSection('whatsapp')}
            />
          ) : null}

          {activeSection === 'finance' ? (
            <SettingsFinancePanel
              categories={categories}
              loading={categoriesLoading}
              onCreate={async (payload) => {
                await createFinancialCategory(payload);
                await loadCategories();
                setNotice('Categoria criada.');
              }}
              onDelete={async (id) => {
                await deleteFinancialCategory(id);
                await loadCategories();
                setNotice('Categoria removida ou inativada.');
              }}
              onOpenFinance={onOpenFinance}
              onRefresh={loadCategories}
              onUpdate={async (id, payload) => {
                await updateFinancialCategory(id, payload);
                await loadCategories();
                setNotice('Categoria atualizada.');
              }}
            />
          ) : null}

          {activeSection === 'payments' ? (
            <SettingsPaymentsPanel
              byProvider={byProvider}
              loading={loading}
              onRefresh={loadCredentials}
              runAction={runAction}
            />
          ) : null}

          {activeSection === 'whatsapp' ? (
            <SettingsPlaceholderPanel
              actionLabel="Abrir WhatsApp"
              description="A integração e a conexão Kirago são gerenciadas na central WhatsApp."
              icon={MessageCircle}
              title="WhatsApp"
              onAction={onOpenWhatsApp}
            />
          ) : null}

          {activeSection === 'billing' ? (
            <SettingsBillingAutomationPanel
              dirty={billingDirty}
              enabled={billingEnabled}
              error={billingError}
              intervalValid={billingIntervalValid}
              loading={billingLoading}
              saving={billingSaving}
              sendIntervalSeconds={billingSendIntervalSeconds}
              sendTime={billingSendTime}
              settings={billingSettings}
              onEnabledChange={setBillingEnabled}
              onRefresh={loadBillingSettings}
              onSave={saveBillingAutomationSettings}
              onSendIntervalSecondsChange={setBillingSendIntervalSeconds}
              onSendTimeChange={setBillingSendTime}
              recoveryDay10Enabled={recoveryDay10Enabled}
              recoveryDay10OffsetDays={recoveryDay10OffsetDays}
              recoveryDay15Enabled={recoveryDay15Enabled}
              recoveryDay15OffsetDays={recoveryDay15OffsetDays}
              recoveryDay30Enabled={recoveryDay30Enabled}
              recoveryDay30OffsetDays={recoveryDay30OffsetDays}
              recoveryDay3Enabled={recoveryDay3Enabled}
              recoveryDay3OffsetDays={recoveryDay3OffsetDays}
              recoveryDirty={recoveryDirty}
              recoveryEnabled={recoveryEnabled}
              recoveryError={recoveryError}
              recoveryIntervalValid={recoveryIntervalValid}
              recoveryLoading={recoveryLoading}
              recoveryOffsetsValid={recoveryOffsetsValid}
              recoverySaving={recoverySaving}
              recoverySendIntervalSeconds={recoverySendIntervalSeconds}
              recoverySendTime={recoverySendTime}
              recoverySettings={recoverySettings}
              initialBillingTab={initialBillingTab}
              onOpenAutomations={onOpenAutomations}
              onRecoveryDay10EnabledChange={setRecoveryDay10Enabled}
              onRecoveryDay10OffsetDaysChange={setRecoveryDay10OffsetDays}
              onRecoveryDay15EnabledChange={setRecoveryDay15Enabled}
              onRecoveryDay15OffsetDaysChange={setRecoveryDay15OffsetDays}
              onRecoveryDay30EnabledChange={setRecoveryDay30Enabled}
              onRecoveryDay30OffsetDaysChange={setRecoveryDay30OffsetDays}
              onRecoveryDay3EnabledChange={setRecoveryDay3Enabled}
              onRecoveryDay3OffsetDaysChange={setRecoveryDay3OffsetDays}
              onRecoveryEnabledChange={setRecoveryEnabled}
              onRecoveryRefresh={loadRecoverySettings}
              onRecoverySave={saveRecoveryAutomationSettings}
              onRecoverySendIntervalSecondsChange={setRecoverySendIntervalSeconds}
              onRecoverySendTimeChange={setRecoverySendTime}
            />
          ) : null}

          {activeSection === 'system' ? (
            <SettingsSystemPanel
              healthError={healthError}
              healthLoading={healthLoading}
              healthStatus={healthStatus}
              onRefresh={loadHealth}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsOverview({
  activeCategories,
  configuredProviders,
  defaultProvider,
  onOpenAutomations,
  onOpenFinance,
  onOpenPayments,
  onOpenSystem,
  onOpenWhatsApp,
}: {
  activeCategories: number;
  configuredProviders: number;
  defaultProvider: PaymentProviderCode | undefined;
  onOpenAutomations: () => void;
  onOpenFinance: () => void;
  onOpenPayments: () => void;
  onOpenSystem: () => void;
  onOpenWhatsApp: () => void;
}) {
  const cards = [
    {
      action: onOpenFinance,
      description: 'Categorias e parâmetros financeiros.',
      icon: CreditCard,
      status:
        activeCategories > 0
          ? `${activeCategories} categoria${activeCategories === 1 ? '' : 's'} ativa${
              activeCategories === 1 ? '' : 's'
            }`
          : null,
      title: 'Financeiro',
    },
    {
      action: onOpenPayments,
      description: 'Provedores PIX, credenciais e webhooks.',
      icon: QrCode,
      status: paymentProviderSummary(configuredProviders, defaultProvider),
      title: 'Pagamentos',
    },
    {
      action: onOpenWhatsApp,
      description: 'Integração e comunicação pelo WhatsApp.',
      icon: MessageCircle,
      status: null,
      title: 'WhatsApp',
    },
    {
      action: onOpenAutomations,
      description: 'Regras, mensagens e automações de cobrança.',
      icon: Workflow,
      status: null,
      title: 'Cobrança e automações',
    },
    {
      action: onOpenSystem,
      description: 'Status e informações técnicas do sistema.',
      icon: ShieldCheck,
      status: null,
      title: 'Sistema',
    },
  ] satisfies Array<{
    action: () => void;
    description: string;
    icon: LucideIcon;
    status: string | null;
    title: string;
  }>;

  return (
    <div className="settings-v2-home-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className="settings-v2-home-card" key={card.title}>
            <header>
              <span className="settings-v2-card-icon" aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </div>
            </header>
            <footer>
              {card.status ? <span className="settings-v2-card-status">{card.status}</span> : null}
              <button className="settings-v2-card-link" type="button" onClick={card.action}>
                Abrir <ArrowRight aria-hidden="true" size={14} />
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function paymentProviderSummary(
  configuredProviders: number,
  defaultProvider: PaymentProviderCode | undefined,
) {
  if (configuredProviders <= 0) return null;

  const providerLabel =
    configuredProviders === 1
      ? '1 provedor configurado'
      : `${configuredProviders} provedores configurados`;

  return defaultProvider
    ? `${providerLabel} • Padrão: ${paymentProviderDisplay(defaultProvider)}`
    : providerLabel;
}

function SettingsPaymentsPanel({
  byProvider,
  loading,
  onRefresh,
  runAction,
}: {
  byProvider: (provider: ConfigurablePaymentProvider) => PaymentProviderCredentialStatus;
  loading: boolean;
  onRefresh: () => Promise<void>;
  runAction: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  return (
    <div className="settings-v2-panel">
      <div className="settings-v2-toolbar">
        <Button
          icon={RefreshCcw}
          loading={loading}
          size="sm"
          variant="secondary"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </Button>
      </div>
      <div className="payment-provider-grid">
        {configurablePaymentProviders.map((provider) => (
          <PaymentProviderCard
            credential={byProvider(provider)}
            key={provider}
            loading={loading}
            provider={provider}
            onDeactivate={() =>
              runAction(
                () => deactivatePaymentProviderCredential(provider),
                `${paymentProviderLabel(provider)} desativado.`,
              )
            }
            onSave={(payload) =>
              runAction(
                () => savePaymentProviderCredential(payload),
                `${paymentProviderLabel(provider)} configurado.`,
              )
            }
            onSetDefault={() =>
              runAction(
                () => setDefaultPaymentProvider(provider),
                `${paymentProviderLabel(provider)} definido como padrao.`,
              )
            }
            onTest={() =>
              runAction(
                () => testPaymentProviderCredential(provider),
                `${paymentProviderLabel(provider)} validado.`,
              )
            }
            onRegisterWebhook={() =>
              runAction(
                () => registerPaymentWebhook(provider),
                `Webhook do ${paymentProviderLabel(provider)} registrado.`,
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

function SettingsFinancePanel({
  categories,
  loading,
  onCreate,
  onDelete,
  onOpenFinance,
  onRefresh,
  onUpdate,
}: {
  categories: FinancialCategory[];
  loading: boolean;
  onCreate: (payload: {
    name: string;
    type: FinancialTransactionType;
    active?: boolean;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenFinance: () => void;
  onRefresh: () => Promise<void>;
  onUpdate: (
    id: string,
    payload: Partial<{ name: string; type: FinancialTransactionType; active: boolean }>,
  ) => Promise<void>;
}) {
  return (
    <div className="settings-v2-panel settings-v2-finance-panel">
      <div className="settings-v2-toolbar">
        <Button
          icon={RefreshCcw}
          loading={loading}
          size="sm"
          variant="secondary"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </Button>
        <Button icon={ArrowRight} size="sm" variant="secondary" onClick={onOpenFinance}>
          Abrir Financeiro operacional
        </Button>
      </div>
      <FinancialCategoriesView
        categories={categories}
        onCreate={onCreate}
        onDelete={onDelete}
        onUpdate={onUpdate}
      />
    </div>
  );
}

type SettingsTemplateUsage = 'activation' | 'billing' | 'recovery' | 'legacy';
type SettingsTemplateUsageFilter = 'all' | 'billing' | 'recovery' | 'activation';
type SettingsTemplateStatusFilter = 'all' | 'active' | 'inactive';

const settingsTemplateUsageFilters = [
  { id: 'all', label: 'Todos' },
  { id: 'billing', label: 'Cobrança' },
  { id: 'recovery', label: 'Recuperação' },
  { id: 'activation', label: 'Ativação' },
] satisfies Array<{ id: SettingsTemplateUsageFilter; label: string }>;

const settingsTemplateStatusFilters = [
  { id: 'all', label: 'Todos os status' },
  { id: 'active', label: 'Ativos' },
  { id: 'inactive', label: 'Inativos' },
] satisfies Array<{ id: SettingsTemplateStatusFilter; label: string }>;

function settingsTemplateTypeLabel(type: MessageTemplate['type']) {
  const labels = {
    INITIAL_ACTIVATION: 'Ativação inicial',
    BILLING_DUE: 'Cobrança individual',
    BILLING_DUE_GROUPED: 'Cobrança agrupada',
    RECOVERY_DAY_3: 'Recuperação D+3',
    RECOVERY_DAY_7: 'Recuperação D+10',
    RECOVERY_DAY_10: 'Recuperação — template legado',
    RECOVERY_DAY_15: 'Recuperação D+15',
    RECOVERY_DAY_30: 'Recuperação D+30',
  } satisfies Record<MessageTemplate['type'], string>;

  return labels[type];
}

function settingsTemplateUsage(type: MessageTemplate['type']): SettingsTemplateUsage {
  if (type === 'INITIAL_ACTIVATION') return 'activation';
  if (type === 'BILLING_DUE' || type === 'BILLING_DUE_GROUPED') return 'billing';
  if (type === 'RECOVERY_DAY_10') return 'legacy';
  return 'recovery';
}

function settingsTemplateUsageLabel(type: MessageTemplate['type']) {
  const usage = settingsTemplateUsage(type);
  const labels = {
    activation: 'Ativação',
    billing: 'Cobrança',
    recovery: 'Recuperação atual',
    legacy: 'Legado',
  } satisfies Record<SettingsTemplateUsage, string>;

  return labels[usage];
}

function settingsTemplateDescription(type: MessageTemplate['type']) {
  const descriptions = {
    INITIAL_ACTIVATION: 'Mensagem usada na ativação inicial.',
    BILLING_DUE: 'Cobrança individual próxima ou na data de vencimento conforme fluxo real.',
    BILLING_DUE_GROUPED: 'Cobrança agrupada quando o cliente possui múltiplos itens no mesmo lote.',
    RECOVERY_DAY_3: 'Mensagem da primeira etapa de recuperação.',
    RECOVERY_DAY_7: 'Mensagem da etapa operacional exibida como D+10.',
    RECOVERY_DAY_10: 'Template legado, não usado pelas etapas atuais.',
    RECOVERY_DAY_15: 'Mensagem da etapa D+15.',
    RECOVERY_DAY_30: 'Mensagem da etapa D+30.',
  } satisfies Record<MessageTemplate['type'], string>;

  return descriptions[type];
}

function SettingsBillingAutomationPanel({
  dirty,
  enabled,
  error,
  intervalValid,
  loading,
  saving,
  sendIntervalSeconds,
  sendTime,
  settings,
  onEnabledChange,
  onRefresh,
  onSave,
  onSendIntervalSecondsChange,
  onSendTimeChange,
  recoveryDay10Enabled,
  recoveryDay10OffsetDays,
  recoveryDay15Enabled,
  recoveryDay15OffsetDays,
  recoveryDay30Enabled,
  recoveryDay30OffsetDays,
  recoveryDay3Enabled,
  recoveryDay3OffsetDays,
  recoveryDirty,
  recoveryEnabled,
  recoveryError,
  recoveryIntervalValid,
  recoveryLoading,
  recoveryOffsetsValid,
  recoverySaving,
  recoverySendIntervalSeconds,
  recoverySendTime,
  recoverySettings,
  initialBillingTab,
  onOpenAutomations,
  onRecoveryDay10EnabledChange,
  onRecoveryDay10OffsetDaysChange,
  onRecoveryDay15EnabledChange,
  onRecoveryDay15OffsetDaysChange,
  onRecoveryDay30EnabledChange,
  onRecoveryDay30OffsetDaysChange,
  onRecoveryDay3EnabledChange,
  onRecoveryDay3OffsetDaysChange,
  onRecoveryEnabledChange,
  onRecoveryRefresh,
  onRecoverySave,
  onRecoverySendIntervalSecondsChange,
  onRecoverySendTimeChange,
}: {
  dirty: boolean;
  enabled: boolean;
  error: string;
  intervalValid: boolean;
  loading: boolean;
  saving: boolean;
  sendIntervalSeconds: string;
  sendTime: string;
  settings: BillingAutomationSettings | null;
  onEnabledChange: (value: boolean) => void;
  onRefresh: () => Promise<void>;
  onSave: () => Promise<void>;
  onSendIntervalSecondsChange: (value: string) => void;
  onSendTimeChange: (value: string) => void;
  recoveryDay10Enabled: boolean;
  recoveryDay10OffsetDays: string;
  recoveryDay15Enabled: boolean;
  recoveryDay15OffsetDays: string;
  recoveryDay30Enabled: boolean;
  recoveryDay30OffsetDays: string;
  recoveryDay3Enabled: boolean;
  recoveryDay3OffsetDays: string;
  recoveryDirty: boolean;
  recoveryEnabled: boolean;
  recoveryError: string;
  recoveryIntervalValid: boolean;
  recoveryLoading: boolean;
  recoveryOffsetsValid: boolean;
  recoverySaving: boolean;
  recoverySendIntervalSeconds: string;
  recoverySendTime: string;
  recoverySettings: RecoveryAutomationSettings | null;
  initialBillingTab: SettingsBillingTab;
  onOpenAutomations: () => void;
  onRecoveryDay10EnabledChange: (value: boolean) => void;
  onRecoveryDay10OffsetDaysChange: (value: string) => void;
  onRecoveryDay15EnabledChange: (value: boolean) => void;
  onRecoveryDay15OffsetDaysChange: (value: string) => void;
  onRecoveryDay30EnabledChange: (value: boolean) => void;
  onRecoveryDay30OffsetDaysChange: (value: string) => void;
  onRecoveryDay3EnabledChange: (value: boolean) => void;
  onRecoveryDay3OffsetDaysChange: (value: string) => void;
  onRecoveryEnabledChange: (value: boolean) => void;
  onRecoveryRefresh: () => Promise<void>;
  onRecoverySave: () => Promise<void>;
  onRecoverySendIntervalSecondsChange: (value: string) => void;
  onRecoverySendTimeChange: (value: string) => void;
}) {
  const [activeBillingTab, setActiveBillingTab] = useState<SettingsBillingTab>(initialBillingTab);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [templateUsageFilter, setTemplateUsageFilter] =
    useState<SettingsTemplateUsageFilter>('all');
  const [templateStatusFilter, setTemplateStatusFilter] =
    useState<SettingsTemplateStatusFilter>('all');
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<MessageTemplate | null>(null);
  const [templatePreview, setTemplatePreview] = useState('');
  const [templatePreviewError, setTemplatePreviewError] = useState('');
  const [templatePreviewLoadingId, setTemplatePreviewLoadingId] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateEditorContent, setTemplateEditorContent] = useState('');
  const [templateEditorActive, setTemplateEditorActive] = useState(true);
  const [templateEditorError, setTemplateEditorError] = useState('');
  const [templateEditorNotice, setTemplateEditorNotice] = useState('');
  const [templateEditorPreview, setTemplateEditorPreview] = useState('');
  const [templateEditorPreviewError, setTemplateEditorPreviewError] = useState('');
  const [templateEditorPreviewLoading, setTemplateEditorPreviewLoading] = useState(false);
  const [templateEditorSaving, setTemplateEditorSaving] = useState(false);
  const templateEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const templateModalRef = useRef<HTMLElement | null>(null);
  const templateModalReturnFocusRef = useRef<HTMLElement | null>(null);
  const recoverySteps = [
    {
      enabled: recoveryDay3Enabled,
      label: 'D+3',
      offsetDays: recoveryDay3OffsetDays,
      onEnabledChange: onRecoveryDay3EnabledChange,
      onOffsetDaysChange: onRecoveryDay3OffsetDaysChange,
    },
    {
      enabled: recoveryDay10Enabled,
      label: 'D+10',
      offsetDays: recoveryDay10OffsetDays,
      onEnabledChange: onRecoveryDay10EnabledChange,
      onOffsetDaysChange: onRecoveryDay10OffsetDaysChange,
    },
    {
      enabled: recoveryDay15Enabled,
      label: 'D+15',
      offsetDays: recoveryDay15OffsetDays,
      onEnabledChange: onRecoveryDay15EnabledChange,
      onOffsetDaysChange: onRecoveryDay15OffsetDaysChange,
    },
    {
      enabled: recoveryDay30Enabled,
      label: 'D+30',
      offsetDays: recoveryDay30OffsetDays,
      onEnabledChange: onRecoveryDay30EnabledChange,
      onOffsetDaysChange: onRecoveryDay30OffsetDaysChange,
    },
  ];
  const activeTemplates = messageTemplates.filter((template) => template.active).length;
  const inactiveTemplates = messageTemplates.length - activeTemplates;
  const filteredTemplates = messageTemplates.filter((template) => {
    const usage = settingsTemplateUsage(template.type);
    const matchesUsage = templateUsageFilter === 'all' || usage === templateUsageFilter;
    const matchesStatus =
      templateStatusFilter === 'all' ||
      (templateStatusFilter === 'active' ? template.active : !template.active);
    const search = templateSearch.trim().toLowerCase();
    const matchesSearch =
      !search ||
      template.name.toLowerCase().includes(search) ||
      settingsTemplateTypeLabel(template.type).toLowerCase().includes(search);

    return matchesUsage && matchesStatus && matchesSearch;
  });
  const templateEditorDirty = editingTemplate
    ? templateEditorContent !== editingTemplate.content ||
      templateEditorActive !== editingTemplate.active
    : false;

  const loadMessageTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    setTemplatesError('');

    try {
      setMessageTemplates(await listMessageTemplates());
      setTemplatesLoaded(true);
    } catch (err) {
      setTemplatesError(
        err instanceof Error ? err.message : 'Não foi possível carregar templates.',
      );
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeBillingTab === 'templates' && !templatesLoaded && !templatesLoading) {
      void loadMessageTemplates();
    }
  }, [activeBillingTab, loadMessageTemplates, templatesLoaded, templatesLoading]);

  useEffect(() => {
    setActiveBillingTab(initialBillingTab);
  }, [initialBillingTab]);

  async function loadTemplatePreview(template: MessageTemplate) {
    if (!selectedTemplate) {
      templateModalReturnFocusRef.current = document.activeElement as HTMLElement | null;
    }
    setPreviewingTemplate(template);
    setSelectedTemplate(null);
    setTemplatePreview('');
    setTemplatePreviewError('');
    setTemplatePreviewLoadingId(template.id);

    try {
      const result = await previewMessageTemplate(template.id, {});
      setTemplatePreview(result.renderedContent);
    } catch (err) {
      setTemplatePreviewError(
        err instanceof Error ? err.message : 'Não foi possível gerar preview.',
      );
    } finally {
      setTemplatePreviewLoadingId('');
    }
  }

  function updateTemplateInState(updated: MessageTemplate) {
    setMessageTemplates((current) =>
      current.map((template) => (template.id === updated.id ? updated : template)),
    );
    setSelectedTemplate((current) => (current?.id === updated.id ? updated : current));
    setPreviewingTemplate((current) => (current?.id === updated.id ? updated : current));
  }

  function openTemplateDetail(template: MessageTemplate) {
    templateModalReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setSelectedTemplate(template);
    setPreviewingTemplate(null);
    setTemplatePreview('');
    setTemplatePreviewError('');
  }

  function closeTemplateDetail() {
    setSelectedTemplate(null);
    window.setTimeout(() => templateModalReturnFocusRef.current?.focus(), 0);
  }

  function openTemplateEditor(template: MessageTemplate) {
    templateModalReturnFocusRef.current = document.activeElement as HTMLElement | null;
    setEditingTemplate(template);
    setSelectedTemplate(null);
    setPreviewingTemplate(null);
    setTemplatePreview('');
    setTemplatePreviewError('');
    setTemplateEditorContent(template.content);
    setTemplateEditorActive(template.active);
    setTemplateEditorError('');
    setTemplateEditorNotice('');
    setTemplateEditorPreview('');
    setTemplateEditorPreviewError('');
  }

  function closeTemplatePreview() {
    setPreviewingTemplate(null);
    setTemplatePreview('');
    setTemplatePreviewError('');
    window.setTimeout(() => templateModalReturnFocusRef.current?.focus(), 0);
  }

  function closeTemplateEditor({ force = false }: { force?: boolean } = {}) {
    if (
      !force &&
      templateEditorDirty &&
      !window.confirm('Existem alterações não salvas. Deseja sair sem salvar?')
    ) {
      return;
    }

    setEditingTemplate(null);
    setTemplateEditorContent('');
    setTemplateEditorActive(true);
    setTemplateEditorError('');
    setTemplateEditorNotice('');
    setTemplateEditorPreview('');
    setTemplateEditorPreviewError('');
    window.setTimeout(() => templateModalReturnFocusRef.current?.focus(), 0);
  }

  function handleTemplateModalBackdrop(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (editingTemplate) {
      closeTemplateEditor();
      return;
    }
    if (selectedTemplate) closeTemplateDetail();
    if (previewingTemplate) closeTemplatePreview();
  }

  function handleTemplateModalKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (editingTemplate) {
      closeTemplateEditor();
      return;
    }
    if (selectedTemplate) closeTemplateDetail();
    if (previewingTemplate) closeTemplatePreview();
  }

  function insertTemplateVariable(variable: string) {
    const textarea = templateEditorTextareaRef.current;
    const placeholder = `{{${variable}}}`;
    const start = textarea?.selectionStart ?? templateEditorContent.length;
    const end = textarea?.selectionEnd ?? start;
    const nextContent = `${templateEditorContent.slice(0, start)}${placeholder}${templateEditorContent.slice(end)}`;
    const nextCursor = start + placeholder.length;

    setTemplateEditorContent(nextContent);
    window.setTimeout(() => {
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  async function previewTemplateEditorDraft() {
    if (!editingTemplate || templateEditorPreviewLoading) return;
    setTemplateEditorPreviewLoading(true);
    setTemplateEditorError('');
    setTemplateEditorPreviewError('');
    setTemplateEditorPreview('');

    try {
      const result = await previewMessageTemplate(editingTemplate.id, {
        content: templateEditorContent,
      });
      setTemplateEditorPreview(result.renderedContent);
    } catch (err) {
      setTemplateEditorPreviewError(
        err instanceof Error ? err.message : 'Não foi possível gerar preview.',
      );
    } finally {
      setTemplateEditorPreviewLoading(false);
    }
  }

  async function saveTemplateEditor() {
    if (!editingTemplate || templateEditorSaving || !templateEditorDirty) return;

    if (
      editingTemplate.active &&
      !templateEditorActive &&
      !window.confirm(
        'Inativar este template pode interromper envios automáticos que dependem dele. Deseja continuar?',
      )
    ) {
      return;
    }

    setTemplateEditorSaving(true);
    setTemplateEditorError('');
    setTemplateEditorNotice('');

    try {
      const updated = await updateMessageTemplate(editingTemplate.id, {
        content: templateEditorContent,
        active: templateEditorActive,
      });
      updateTemplateInState(updated);
      setEditingTemplate(updated);
      setTemplateEditorContent(updated.content);
      setTemplateEditorActive(updated.active);
      setTemplateEditorNotice('Template atualizado.');
      setTemplateEditorPreview('');
      setTemplateEditorPreviewError('');
    } catch (err) {
      setTemplateEditorError(
        err instanceof Error ? err.message : 'Não foi possível salvar template.',
      );
    } finally {
      setTemplateEditorSaving(false);
    }
  }

  useEffect(() => {
    if (!selectedTemplate && !previewingTemplate && !editingTemplate) return;

    window.setTimeout(() => {
      if (editingTemplate) {
        templateEditorTextareaRef.current?.focus();
        return;
      }
      templateModalRef.current?.focus();
    }, 0);
  }, [editingTemplate, previewingTemplate, selectedTemplate]);

  return (
    <div className="settings-v2-panel settings-billing-panel">
      <div className="settings-billing-subnav" role="tablist" aria-label="Cobrança e automações">
        <button
          aria-selected={activeBillingTab === 'rules'}
          className={activeBillingTab === 'rules' ? 'active' : ''}
          role="tab"
          type="button"
          onClick={() => setActiveBillingTab('rules')}
        >
          Regras
        </button>
        <button
          aria-selected={activeBillingTab === 'templates'}
          className={activeBillingTab === 'templates' ? 'active' : ''}
          role="tab"
          type="button"
          onClick={() => setActiveBillingTab('templates')}
        >
          Templates
        </button>
      </div>

      {activeBillingTab === 'rules' ? (
        <>
          {error ? <div className="notice danger">{error}</div> : null}
          <div className="settings-v2-toolbar">
            <Button
              icon={RefreshCcw}
              loading={loading}
              size="sm"
              variant="secondary"
              onClick={() => void onRefresh()}
            >
              Atualizar
            </Button>
          </div>

          <section className="settings-billing-section" aria-labelledby="settings-billing-title">
            <header className="settings-billing-header">
              <div>
                <span className="metric-label">Cobrança e automações</span>
                <h3 id="settings-billing-title">Cobrança automática</h3>
                <p>Configure quando e como as cobranças automáticas serão processadas.</p>
              </div>
              <span className={`finance-status-pill tone-${enabled ? 'success' : 'muted'}`}>
                {!settings ? 'Indisponível' : enabled ? 'Ativada' : 'Desativada'}
              </span>
            </header>

            <label className="toggle-field settings-billing-toggle">
              <input
                checked={enabled}
                disabled={loading || saving || !settings}
                type="checkbox"
                onChange={(event) => onEnabledChange(event.target.checked)}
              />
              <span>
                Ativar cobrança automática
                <small>Quando ativada, o CRM agenda cobranças elegíveis automaticamente.</small>
              </span>
            </label>

            <div className="settings-billing-form-grid">
              <label className="field">
                <span>Horário de envio</span>
                <input
                  disabled={loading || saving || !settings}
                  required
                  type="time"
                  value={settings ? sendTime : ''}
                  onChange={(event) => onSendTimeChange(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Intervalo entre mensagens</span>
                <input
                  aria-describedby="billing-send-interval-help"
                  disabled={loading || saving || !settings}
                  max={300}
                  min={3}
                  required
                  step={1}
                  type="number"
                  value={settings ? sendIntervalSeconds : ''}
                  onChange={(event) => onSendIntervalSecondsChange(event.target.value)}
                />
                <small id="billing-send-interval-help">
                  Tempo de espera entre mensagens programadas para o mesmo lote, em segundos.
                </small>
                {!intervalValid ? (
                  <small className="error-message">Use um valor entre 3 e 300.</small>
                ) : null}
              </label>

              <div className="field settings-billing-readonly-field">
                <span>Fuso horário</span>
                <strong>{settings?.timezone ?? 'Indisponível'}</strong>
                <small>Usado para calcular horário e dia das cobranças.</small>
              </div>
            </div>

            <div className="settings-billing-note">
              <Info aria-hidden="true" size={16} />
              <span>Os envios dependem de uma conexão WhatsApp operacional.</span>
            </div>

            <footer className="settings-billing-actions">
              <Button
                disabled={!dirty || !intervalValid || !sendTime || !settings}
                icon={CircleCheck}
                loading={saving}
                variant="primary"
                onClick={() => void onSave()}
              >
                Salvar configurações
              </Button>
            </footer>
          </section>

          <section className="settings-billing-section" aria-labelledby="settings-recovery-title">
            {recoveryError ? (
              <div className="notice danger" role="alert">
                {recoveryError}
              </div>
            ) : null}
            <header className="settings-billing-header">
              <div>
                <h3 id="settings-recovery-title">Recuperação de inadimplência</h3>
                <p>Configure quando o CRM deve entrar em contato com clientes inadimplentes.</p>
              </div>
              <span className={`finance-status-pill tone-${recoveryEnabled ? 'success' : 'muted'}`}>
                {!recoverySettings
                  ? 'Indisponível'
                  : recoveryEnabled
                    ? 'Envios automáticos ativos'
                    : 'Envios automáticos pausados'}
              </span>
            </header>

            <label className="toggle-field settings-billing-toggle">
              <input
                checked={recoveryEnabled}
                disabled={recoveryLoading || recoverySaving || !recoverySettings}
                type="checkbox"
                onChange={(event) => onRecoveryEnabledChange(event.target.checked)}
              />
              <span>
                Ativar envios automáticos de recuperação
                <small>
                  Quando desativado, o CRM não envia mensagens de recuperação automaticamente.
                  Campanhas e agendamentos podem continuar sendo preparados para uma futura
                  reativação.
                </small>
              </span>
            </label>

            <div className="settings-billing-form-grid">
              <label className="field">
                <span>Horário de envio</span>
                <input
                  disabled={recoveryLoading || recoverySaving || !recoverySettings}
                  required
                  type="time"
                  value={recoverySettings ? recoverySendTime : ''}
                  onChange={(event) => onRecoverySendTimeChange(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Intervalo entre mensagens</span>
                <input
                  aria-describedby="recovery-send-interval-help"
                  disabled={recoveryLoading || recoverySaving || !recoverySettings}
                  max={300}
                  min={3}
                  required
                  step={1}
                  type="number"
                  value={recoverySettings ? recoverySendIntervalSeconds : ''}
                  onChange={(event) => onRecoverySendIntervalSecondsChange(event.target.value)}
                />
                <small id="recovery-send-interval-help">
                  Intervalo entre mensagens programadas no mesmo lote, em segundos.
                </small>
                {!recoveryIntervalValid ? (
                  <small className="error-message">Use um valor entre 3 e 300.</small>
                ) : null}
              </label>

              <div className="field settings-billing-readonly-field">
                <span>Fuso horário</span>
                <strong>{recoverySettings?.timezone ?? 'Indisponível'}</strong>
                <small>Usado para calcular o dia e o horário de cada contato.</small>
              </div>
            </div>

            <div className="settings-recovery-steps" aria-label="Etapas de recuperação">
              {recoverySteps.map((step) => {
                const helpId = `settings-recovery-${step.label.replace('+', '')}-offset-help`;

                return (
                  <article key={step.label} className="settings-recovery-step">
                    <label className="toggle-field">
                      <input
                        checked={step.enabled}
                        disabled={recoveryLoading || recoverySaving || !recoverySettings}
                        type="checkbox"
                        onChange={(event) => step.onEnabledChange(event.target.checked)}
                      />
                      <span>Etapa {step.label}</span>
                    </label>

                    <label className="field">
                      <span>Disparar após</span>
                      <input
                        aria-describedby={helpId}
                        disabled={recoveryLoading || recoverySaving || !recoverySettings}
                        max={365}
                        min={1}
                        required
                        step={1}
                        type="number"
                        value={recoverySettings ? step.offsetDays : ''}
                        onChange={(event) => step.onOffsetDaysChange(event.target.value)}
                      />
                      <small id={helpId}>{step.offsetDays || '?'} dias do vencimento.</small>
                    </label>
                  </article>
                );
              })}
            </div>

            {!recoveryOffsetsValid ? (
              <small className="error-message">
                Use offsets únicos, crescentes e entre 1 e 365 dias.
              </small>
            ) : null}

            <div className="settings-billing-note">
              <Info aria-hidden="true" size={16} />
              <span>
                O nome da etapa identifica o estágio da recuperação. O dia efetivo do envio é
                definido pelo número de dias após o vencimento.
              </span>
            </div>

            <footer className="settings-billing-actions">
              <Button
                icon={RefreshCcw}
                loading={recoveryLoading}
                size="sm"
                variant="secondary"
                onClick={() => void onRecoveryRefresh()}
              >
                Atualizar recuperação
              </Button>
              <Button
                disabled={
                  !recoveryDirty ||
                  !recoveryIntervalValid ||
                  !recoveryOffsetsValid ||
                  !recoverySendTime ||
                  !recoverySettings
                }
                icon={CircleCheck}
                loading={recoverySaving}
                variant="primary"
                onClick={() => void onRecoverySave()}
              >
                Salvar recuperação
              </Button>
            </footer>
          </section>
        </>
      ) : null}

      {activeBillingTab === 'templates' ? (
        <section
          className="settings-billing-section settings-template-panel"
          aria-labelledby="settings-templates-title"
        >
          <header className="settings-billing-header">
            <div>
              <span className="metric-label">Templates de mensagens</span>
              <h3 id="settings-templates-title">Templates de mensagens</h3>
              <p>
                Gerencie os textos utilizados nas cobranças, ativações e recuperações automáticas.
              </p>
            </div>
            <span className="settings-v2-card-icon" aria-hidden="true">
              <MessageSquareText size={18} />
            </span>
          </header>

          {templatesError ? (
            <div className="notice danger" role="alert">
              <span>{templatesError}</span>
              <Button
                icon={RefreshCcw}
                loading={templatesLoading}
                size="sm"
                variant="secondary"
                onClick={() => void loadMessageTemplates()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : null}

          <div className="settings-template-summary" aria-label="Resumo dos templates">
            <article>
              <span>Templates</span>
              <strong>{messageTemplates.length}</strong>
            </article>
            <article>
              <span>Ativos</span>
              <strong>{activeTemplates}</strong>
            </article>
            <article>
              <span>Inativos</span>
              <strong>{inactiveTemplates}</strong>
            </article>
          </div>

          <div className="settings-template-filters">
            <div className="settings-template-filter-group" aria-label="Filtrar por uso">
              {settingsTemplateUsageFilters.map((filter) => (
                <button
                  aria-pressed={templateUsageFilter === filter.id}
                  className={templateUsageFilter === filter.id ? 'active' : ''}
                  key={filter.id}
                  type="button"
                  onClick={() => setTemplateUsageFilter(filter.id)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <label className="field">
              <span>Status</span>
              <select
                value={templateStatusFilter}
                onChange={(event) =>
                  setTemplateStatusFilter(event.target.value as SettingsTemplateStatusFilter)
                }
              >
                {settingsTemplateStatusFilters.map((filter) => (
                  <option key={filter.id} value={filter.id}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Buscar</span>
              <input
                placeholder="Nome ou tipo"
                value={templateSearch}
                onChange={(event) => setTemplateSearch(event.target.value)}
              />
            </label>
          </div>

          {!templatesError ? (
            <div className="table-wrap settings-template-table-wrap">
              <table className="settings-template-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Uso</th>
                    <th>Variáveis</th>
                    <th>Status</th>
                    <th>Atualização</th>
                    <th className="finance-actions-column">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((template) => (
                    <tr key={template.id}>
                      <td data-label="Nome">
                        <strong>{settingsTemplateTypeLabel(template.type)}</strong>
                        <span>{template.name}</span>
                      </td>
                      <td data-label="Uso">
                        <strong>{settingsTemplateUsageLabel(template.type)}</strong>
                        <span>{settingsTemplateDescription(template.type)}</span>
                        {settingsTemplateUsage(template.type) === 'legacy' ? (
                          <span className="settings-template-legacy-badge">Legado</span>
                        ) : null}
                      </td>
                      <td data-label="Variáveis">
                        {template.variables.length} variáveis disponíveis
                      </td>
                      <td data-label="Status">
                        <span
                          className={`finance-status-pill tone-${
                            template.active ? 'success' : 'muted'
                          }`}
                        >
                          {template.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td data-label="Atualização">{formatDateTime(template.updatedAt)}</td>
                      <td className="finance-actions-column" data-label="Ações">
                        <div className="settings-template-actions">
                          <Button
                            icon={Eye}
                            size="sm"
                            variant="secondary"
                            onClick={() => openTemplateDetail(template)}
                          >
                            Visualizar
                          </Button>
                          <Button
                            icon={Pencil}
                            size="sm"
                            variant="secondary"
                            onClick={() => openTemplateEditor(template)}
                          >
                            Editar
                          </Button>
                          <ActionMenu
                            items={[
                              {
                                disabled: templatePreviewLoadingId === template.id,
                                icon: MessageSquareText,
                                label:
                                  templatePreviewLoadingId === template.id
                                    ? 'Gerando preview...'
                                    : 'Pré-visualizar',
                                onSelect: () => void loadTemplatePreview(template),
                              },
                            ]}
                            label="Mais ações do template"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!templatesLoading && templatesLoaded && !messageTemplates.length ? (
                <div className="empty-state">Nenhum template cadastrado.</div>
              ) : null}
              {!templatesLoading &&
              templatesLoaded &&
              messageTemplates.length > 0 &&
              !filteredTemplates.length ? (
                <div className="empty-state">Nenhum template encontrado com os filtros atuais.</div>
              ) : null}
              {templatesLoading ? <div className="empty-state">Carregando templates...</div> : null}
            </div>
          ) : null}

          {selectedTemplate ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={handleTemplateModalBackdrop}
              onKeyDown={handleTemplateModalKeyDown}
            >
              <section
                aria-labelledby="settings-detail-title"
                aria-modal="true"
                className="modal settings-template-modal"
                ref={templateModalRef}
                role="dialog"
                tabIndex={-1}
              >
                <header className="modal-header settings-template-modal-header">
                  <div>
                    <span className="metric-label">Visualizar template</span>
                    <h2 id="settings-detail-title">
                      {settingsTemplateTypeLabel(selectedTemplate.type)}
                    </h2>
                    <p>{settingsTemplateDescription(selectedTemplate.type)}</p>
                  </div>
                  <IconButton icon={X} label="Fechar visualização" onClick={closeTemplateDetail} />
                </header>

                <div className="settings-template-modal-body">
                  <dl className="detail-list settings-template-detail-list">
                    <div>
                      <dt>Nome</dt>
                      <dd>{selectedTemplate.name}</dd>
                    </div>
                    <div>
                      <dt>Tipo</dt>
                      <dd>{settingsTemplateTypeLabel(selectedTemplate.type)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedTemplate.active ? 'Ativo' : 'Inativo'}</dd>
                    </div>
                    <div>
                      <dt>Uso</dt>
                      <dd>{settingsTemplateUsageLabel(selectedTemplate.type)}</dd>
                    </div>
                    <div>
                      <dt>Atualizado em</dt>
                      <dd>{formatDateTime(selectedTemplate.updatedAt)}</dd>
                    </div>
                  </dl>

                  {settingsTemplateUsage(selectedTemplate.type) === 'legacy' ? (
                    <div className="notice warning" role="note">
                      Template legado. Ele pode ser mantido, mas não participa das etapas atuais de
                      recuperação.
                    </div>
                  ) : null}

                  <div className="settings-template-readonly-content">
                    <span>Conteúdo atual</span>
                    <pre>{selectedTemplate.content}</pre>
                  </div>

                  <div className="settings-template-variable-list">
                    <span>Variáveis disponíveis</span>
                    <div>
                      {selectedTemplate.variables.map((variable) => (
                        <code key={variable}>{`{{${variable}}}`}</code>
                      ))}
                      {!selectedTemplate.variables.length ? (
                        <span>Nenhuma variável retornada pela API.</span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <footer className="settings-template-modal-footer">
                  <Button icon={X} variant="secondary" onClick={closeTemplateDetail}>
                    Fechar
                  </Button>
                  <Button
                    icon={MessageSquareText}
                    loading={templatePreviewLoadingId === selectedTemplate.id}
                    variant="secondary"
                    onClick={() => void loadTemplatePreview(selectedTemplate)}
                  >
                    Pré-visualizar
                  </Button>
                </footer>
              </section>
            </div>
          ) : null}

          {editingTemplate ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={handleTemplateModalBackdrop}
              onKeyDown={handleTemplateModalKeyDown}
            >
              <section
                aria-labelledby="settings-editor-title"
                aria-modal="true"
                className="modal settings-template-modal settings-template-editor-modal"
                ref={templateModalRef}
                role="dialog"
                tabIndex={-1}
              >
                <header className="modal-header settings-template-modal-header">
                  <div>
                    <span className="metric-label">Editar template</span>
                    <h2 id="settings-editor-title">
                      {settingsTemplateTypeLabel(editingTemplate.type)}
                    </h2>
                    <p>{settingsTemplateDescription(editingTemplate.type)}</p>
                  </div>
                  <IconButton
                    icon={X}
                    label="Fechar editor"
                    onClick={() => closeTemplateEditor()}
                  />
                </header>

                <div className="settings-template-modal-body">
                  <dl className="detail-list settings-template-detail-list">
                    <div>
                      <dt>Nome</dt>
                      <dd>{editingTemplate.name}</dd>
                    </div>
                    <div>
                      <dt>Tipo</dt>
                      <dd>{settingsTemplateTypeLabel(editingTemplate.type)}</dd>
                    </div>
                    <div>
                      <dt>Uso</dt>
                      <dd>{settingsTemplateUsageLabel(editingTemplate.type)}</dd>
                    </div>
                    <div>
                      <dt>Atualizado em</dt>
                      <dd>{formatDateTime(editingTemplate.updatedAt)}</dd>
                    </div>
                  </dl>

                  {settingsTemplateUsage(editingTemplate.type) === 'legacy' ? (
                    <div className="notice warning" role="note">
                      Template legado. Ele pode ser mantido, mas não participa das etapas atuais de
                      recuperação.
                    </div>
                  ) : null}

                  <label className="toggle-row settings-template-active-toggle">
                    <input
                      checked={templateEditorActive}
                      type="checkbox"
                      onChange={(event) => setTemplateEditorActive(event.target.checked)}
                    />
                    <span>{templateEditorActive ? 'Template ativo' : 'Template inativo'}</span>
                  </label>

                  {!templateEditorActive ? (
                    <div className="notice warning" role="note">
                      Inativar este template pode interromper envios automáticos que dependem dele.
                    </div>
                  ) : null}

                  <label className="field settings-template-editor-content">
                    <span>Conteúdo do template</span>
                    <textarea
                      ref={templateEditorTextareaRef}
                      maxLength={1000}
                      rows={10}
                      value={templateEditorContent}
                      onChange={(event) => setTemplateEditorContent(event.target.value)}
                    />
                  </label>

                  <div className="settings-template-variable-list settings-template-editor-variables">
                    <span>Variáveis disponíveis</span>
                    <div>
                      {editingTemplate.variables.map((variable) => (
                        <button
                          key={variable}
                          type="button"
                          onClick={() => insertTemplateVariable(variable)}
                        >
                          {`{{${variable}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="notice warning" role="note">
                    Pré-visualização com dados de exemplo. Nenhuma mensagem será enviada. Os dados
                    de exemplo seguem o contexto disponível para este tipo de template.
                  </div>

                  {templateEditorPreviewError ? (
                    <div className="notice danger" role="alert">
                      {templateEditorPreviewError}
                    </div>
                  ) : null}
                  {templateEditorPreview ? (
                    <div className="settings-template-preview-result">
                      <span>Prévia do rascunho</span>
                      <pre>{templateEditorPreview}</pre>
                    </div>
                  ) : null}

                  {templateEditorError ? (
                    <div className="notice danger" role="alert">
                      {templateEditorError}
                    </div>
                  ) : null}
                  {templateEditorNotice ? (
                    <div className="notice success" role="status">
                      {templateEditorNotice}
                    </div>
                  ) : null}
                </div>

                <footer className="settings-template-modal-footer">
                  <Button icon={X} variant="secondary" onClick={() => closeTemplateEditor()}>
                    Cancelar
                  </Button>
                  <Button
                    icon={MessageSquareText}
                    loading={templateEditorPreviewLoading}
                    variant="secondary"
                    onClick={() => void previewTemplateEditorDraft()}
                  >
                    Pré-visualizar rascunho
                  </Button>
                  <Button
                    disabled={
                      !templateEditorDirty || templateEditorSaving || !templateEditorContent.trim()
                    }
                    icon={Save}
                    loading={templateEditorSaving}
                    onClick={() => void saveTemplateEditor()}
                  >
                    Salvar template
                  </Button>
                </footer>
              </section>
            </div>
          ) : null}

          {previewingTemplate ? (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={handleTemplateModalBackdrop}
              onKeyDown={handleTemplateModalKeyDown}
            >
              <section
                aria-labelledby="settings-preview-title"
                aria-modal="true"
                className="modal settings-template-modal"
                ref={templateModalRef}
                role="dialog"
                tabIndex={-1}
              >
                <header className="modal-header settings-template-modal-header">
                  <div>
                    <span className="metric-label">Prévia com dados de exemplo</span>
                    <h2 id="settings-preview-title">
                      {settingsTemplateTypeLabel(previewingTemplate.type)}
                    </h2>
                    <p>{previewingTemplate.name}</p>
                  </div>
                  <IconButton icon={X} label="Fechar preview" onClick={closeTemplatePreview} />
                </header>

                <div className="settings-template-modal-body">
                  {settingsTemplateUsage(previewingTemplate.type) === 'legacy' ? (
                    <div className="notice warning" role="note">
                      Template legado. Ele pode ser mantido, mas não participa das etapas atuais de
                      recuperação.
                    </div>
                  ) : null}

                  {templatePreviewError ? (
                    <div className="notice danger" role="alert">
                      <span>{templatePreviewError}</span>
                      <Button
                        icon={RefreshCcw}
                        loading={templatePreviewLoadingId === previewingTemplate.id}
                        size="sm"
                        variant="secondary"
                        onClick={() => void loadTemplatePreview(previewingTemplate)}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  ) : null}
                  <div className="notice warning" role="note">
                    Pré-visualização com dados de exemplo. Nenhuma mensagem será enviada. Os dados
                    de exemplo seguem o contexto disponível para este tipo de template.
                  </div>
                  <span
                    className={`finance-status-pill tone-${previewingTemplate.active ? 'success' : 'muted'}`}
                  >
                    {previewingTemplate.active ? 'Ativo' : 'Inativo'}
                  </span>
                  {templatePreview ? (
                    <div className="settings-template-preview-result">
                      <span>Conteúdo renderizado</span>
                      <pre>{templatePreview}</pre>
                    </div>
                  ) : null}
                  {templatePreviewLoadingId ? (
                    <div className="empty-state">Gerando preview...</div>
                  ) : null}
                </div>

                <footer className="settings-template-modal-footer">
                  <Button icon={X} variant="secondary" onClick={closeTemplatePreview}>
                    Fechar
                  </Button>
                </footer>
              </section>
            </div>
          ) : null}

          <div className="settings-billing-note">
            <Info aria-hidden="true" size={16} />
            <span>
              Configurações é a fonte oficial para visualizar, editar, ativar e pré-visualizar
              templates.
            </span>
          </div>

          <footer className="settings-billing-actions">
            <Button icon={ArrowRight} variant="secondary" onClick={onOpenAutomations}>
              Abrir Automações
            </Button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function SettingsPlaceholderPanel({
  actionLabel,
  description,
  icon: Icon,
  title,
  onAction,
}: {
  actionLabel: string;
  description: string;
  icon: LucideIcon;
  title: string;
  onAction: () => void;
}) {
  return (
    <section className="settings-v2-placeholder-panel">
      <span className="settings-v2-card-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <Button icon={ArrowRight} variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </section>
  );
}

function SettingsSystemPanel({
  healthError,
  healthLoading,
  healthStatus,
  onRefresh,
}: {
  healthError: string;
  healthLoading: boolean;
  healthStatus: HealthStatus | null;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="settings-v2-panel">
      <div className="panel-header">
        <div>
          <h2>Sistema</h2>
          <p>Status seguro da API, sem expor secrets ou infraestrutura sensível.</p>
        </div>
        <Button
          icon={RefreshCcw}
          loading={healthLoading}
          size="sm"
          variant="secondary"
          onClick={() => void onRefresh()}
        >
          Atualizar
        </Button>
      </div>
      {healthError ? <div className="notice danger">{healthError}</div> : null}
      <dl className="detail-list settings-v2-system-details">
        <div>
          <dt>API</dt>
          <dd>{healthLoading ? 'Verificando...' : healthStatus?.ok ? 'Online' : 'Indisponível'}</dd>
        </div>
        <div>
          <dt>Serviço</dt>
          <dd>{healthStatus?.service ?? '-'}</dd>
        </div>
        <div>
          <dt>Última verificação</dt>
          <dd>{healthStatus?.timestamp ? formatDateTime(healthStatus.timestamp) : '-'}</dd>
        </div>
      </dl>
    </section>
  );
}

function PaymentProviderCard({
  credential,
  loading,
  provider,
  onDeactivate,
  onRegisterWebhook,
  onSave,
  onSetDefault,
  onTest,
}: {
  credential: PaymentProviderCredentialStatus;
  loading: boolean;
  provider: ConfigurablePaymentProvider;
  onDeactivate: () => Promise<boolean>;
  onRegisterWebhook: () => Promise<boolean>;
  onSave: (payload: {
    provider: ConfigurablePaymentProvider;
    name: string;
    token: string;
  }) => Promise<boolean>;
  onSetDefault: () => Promise<boolean>;
  onTest: () => Promise<boolean>;
}) {
  const [name, setName] = useState(credential.name ?? paymentProviderLabel(provider));
  const [token, setToken] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [testing, setTesting] = useState(false);
  const actionRef = useRef(false);

  useEffect(() => {
    setName(credential.name ?? paymentProviderLabel(provider));
    setToken('');
  }, [credential.name, provider]);

  const providerName = paymentProviderLabel(provider);
  const configured = credential.configured;
  const statusLabel = paymentProviderStatusLabel(credential.status);
  const webhookRegistered = Boolean(credential.webhookRegisteredAt);
  const canSaveCredential = token.trim().length >= 12;
  const canSubmitConfig = canSaveCredential;
  const webhookUrl = credential.webhookUrl ?? `/payment-webhooks/${provider.toLowerCase()}`;
  const actionDisabled = loading || saving || testing || registeringWebhook;
  const canSetDefault = provider !== 'FASTPIX';

  function closeConfigModal() {
    if (saving) return;
    setConfigOpen(false);
    setToken('');
    setName(credential.name ?? providerName);
  }

  function closeWebhookModal() {
    if (registeringWebhook) return;
    setWebhookOpen(false);
  }

  async function guardedAction(
    action: () => Promise<boolean>,
    setWorking: (value: boolean) => void,
  ) {
    if (actionRef.current) return false;

    actionRef.current = true;
    setWorking(true);

    try {
      return await action();
    } finally {
      setWorking(false);
      actionRef.current = false;
    }
  }

  async function handleConfigSubmit(event: FormEvent) {
    event.preventDefault();

    if (!canSubmitConfig) return;

    const saved = await guardedAction(async () => {
      return onSave({ provider, name, token });
    }, setSaving);

    if (!saved) return;

    setConfigOpen(false);
    setToken('');
  }

  async function handleTestConnection() {
    if (!configured) return;
    await guardedAction(onTest, setTesting);
  }

  async function handleRegisterWebhook() {
    if (!configured) return;
    const registered = await guardedAction(onRegisterWebhook, setRegisteringWebhook);
    if (!registered) return;
    setWebhookOpen(false);
  }

  return (
    <article className="payment-provider-card">
      <header className="payment-provider-card-header">
        <div className="payment-provider-title">
          <h3>{providerName}</h3>
          <p>{paymentProviderDescription(provider)}</p>
        </div>
        <div className="payment-provider-card-actions">
          <span className={`integration-status ${credential.status.toLowerCase()}`}>
            {statusLabel}
          </span>
          <ActionMenu
            items={[
              {
                icon: Pencil,
                label: configured ? 'Editar configuração' : 'Configurar',
                onSelect: () => setConfigOpen(true),
              },
              {
                disabled: !configured || actionDisabled,
                icon: ShieldCheck,
                label: 'Ver webhook',
                onSelect: () => setWebhookOpen(true),
              },
              {
                disabled:
                  !canSetDefault ||
                  !configured ||
                  Boolean(credential.defaultForPix) ||
                  actionDisabled,
                icon: CircleCheck,
                label: 'Definir como padrão',
                onSelect: () => void onSetDefault(),
              },
              {
                disabled: !configured || actionDisabled,
                icon: Workflow,
                label: 'Configurar webhook',
                onSelect: () => setWebhookOpen(true),
              },
              {
                danger: true,
                disabled: !configured || actionDisabled,
                icon: Power,
                label: 'Desativar',
                onSelect: () => void onDeactivate(),
              },
            ]}
          />
        </div>
      </header>

      <dl className="detail-list integration-details">
        <div>
          <dt>Conexão</dt>
          <dd>{configured ? 'Configurada' : 'Não configurada'}</dd>
        </div>
        <div>
          <dt>Webhook</dt>
          <dd>{webhookRegistered ? 'Registrado' : 'Não registrado'}</dd>
        </div>
        {credential.validatedAt ? (
          <div>
            <dt>Última validação</dt>
            <dd>{formatDateTime(credential.validatedAt)}</dd>
          </div>
        ) : null}
        {credential.defaultForPix ? (
          <div>
            <dt>Provedor padrão</dt>
            <dd>Sim</dd>
          </div>
        ) : null}
      </dl>

      <div className="payment-provider-secret-summary">
        <span>Chave API</span>
        <strong>{credential.tokenMask ?? 'Não configurada'}</strong>
      </div>
      <div className="payment-provider-secret-summary">
        <span>Webhook secret</span>
        <strong>{credential.webhookSecretConfigured ? 'Configurado' : 'Não configurado'}</strong>
      </div>

      <div className="button-row payment-provider-primary-actions">
        <button
          className={configured ? 'secondary-button' : 'primary-button'}
          disabled={actionDisabled}
          type="button"
          onClick={() => setConfigOpen(true)}
        >
          <ShieldCheck aria-hidden="true" size={16} />
          {configured ? 'Editar configuração' : 'Configurar'}
        </button>
        <button
          className="secondary-button"
          disabled={actionDisabled || !configured}
          type="button"
          onClick={() => void handleTestConnection()}
        >
          {testing ? 'Testando...' : 'Testar conexão'}
        </button>
      </div>

      {configOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') closeConfigModal();
          }}
        >
          <form
            className="modal payment-provider-config-modal"
            onSubmit={(event) => void handleConfigSubmit(event)}
          >
            <div className="modal-header">
              <div>
                <h2>Configurar {providerName}</h2>
                <p>{paymentProviderDescription(provider)}</p>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button"
                disabled={saving}
                type="button"
                onClick={closeConfigModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <div className="payment-provider-config-body">
              <label className="field">
                <span>Nome da integração</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="field">
                <span>Chave API</span>
                <input
                  autoComplete="off"
                  placeholder={configured ? 'Chave configurada' : 'fdpx_test_123'}
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={saving}
                type="button"
                onClick={closeConfigModal}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={saving || !canSubmitConfig}
                type="submit"
              >
                {saving ? 'Salvando...' : 'Salvar configuração'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {webhookOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') closeWebhookModal();
          }}
        >
          <section
            className="modal payment-provider-config-modal"
            aria-labelledby="payment-webhook-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="payment-webhook-title">Webhook {providerName}</h2>
                <p>
                  O secret será obtido automaticamente após o registro e armazenado de forma
                  criptografada.
                </p>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button"
                disabled={registeringWebhook}
                type="button"
                onClick={closeWebhookModal}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <dl className="detail-list integration-details">
              <div>
                <dt>Provider</dt>
                <dd>{providerName}</dd>
              </div>
              <div>
                <dt>URL</dt>
                <dd>{webhookUrl}</dd>
              </div>
            </dl>

            <div className="payment-provider-secret-summary">
              <span>Eventos</span>
              <strong>
                transaction.created, transaction.approved, transaction.paid, transaction.expired,
                transaction.refunded
              </strong>
            </div>

            <div className="form-actions">
              <button
                className="secondary-button"
                disabled={registeringWebhook}
                type="button"
                onClick={closeWebhookModal}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={registeringWebhook || !configured}
                type="button"
                onClick={() => void handleRegisterWebhook()}
              >
                {registeringWebhook ? 'Registrando...' : 'Confirmar registro'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </article>
  );
}

function paymentProviderLabel(provider: ConfigurablePaymentProvider) {
  if (provider === 'FASTFLOW') return 'FastFlow';
  if (provider === 'FASTPIX') return 'FastPIX';
  return 'FastPay';
}

function paymentProviderDescription(provider: ConfigurablePaymentProvider) {
  if (provider === 'FASTFLOW') return 'Pagamentos via PIX FastFlow';
  if (provider === 'FASTPIX') return 'Pagamentos via PIX FastPIX alternativo manual';
  return 'Pagamentos via PIX FastPay';
}

function paymentProviderStatusLabel(status: PaymentProviderCredentialStatus['status']) {
  if (status === 'VALIDO') return 'Configurado';
  if (status === 'CONFIGURADO') return 'Configurado';
  if (status === 'ERRO') return 'Erro';
  return 'Não configurado';
}

function ClientEventIcon({ type }: { type: string }) {
  if (type === 'PAYMENT_REGISTERED') return <CircleCheck size={14} />;
  if (type === 'WHATSAPP_MESSAGE_SENT') return <MessageCircle size={14} />;
  if (type === 'CLIENT_RENEWED') return <RefreshCw size={14} />;
  if (type === 'CLIENT_CREATED' || type === 'CLIENT_UPDATED') return <Layers size={14} />;
  if (type === 'STATUS_CHANGED') return <RefreshCw size={14} />;
  if (type === 'PIX_PAYMENT_INTENT_CREATED' || type === 'PIX_PAYMENT_STATUS_UPDATED') {
    return <QrCode size={14} />;
  }
  if (type === 'RECEIVABLE_CANCELED') return <XCircle size={14} />;
  if (type.startsWith('RECOVERY')) return <RotateCcw size={14} />;
  if (type.startsWith('REFERRAL')) return <Gift size={14} />;
  return <Activity size={14} />;
}

function ClientSectionHeading({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="client-overview-card-header">
      <div className="client-overview-heading">
        <span className="section-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <div className="client-overview-heading-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {action ? <div className="client-overview-heading-action">{action}</div> : null}
    </div>
  );
}

function AutomationSectionHeading({
  action,
  description,
  icon: Icon,
  iconTone = 'primary',
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  iconTone?: 'primary' | 'info';
  title: string;
}) {
  return (
    <div className="client-overview-card-header automation-section-heading">
      <div className="client-overview-heading">
        <span className={`section-icon tone-${iconTone}`} aria-hidden="true">
          <Icon size={16} />
        </span>
        <div className="client-overview-heading-copy">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {action ? <div className="client-overview-heading-action">{action}</div> : null}
    </div>
  );
}

function AutomationConfigIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="automation-config-icon" aria-hidden="true">
      <Icon size={16} />
    </span>
  );
}

function ClientsView({
  clientFormOpen,
  clients,
  clientsPagination,
  dataLoading,
  detailTabRequest,
  editingClient,
  onApplyFilters,
  onCreate,
  onEdit,
  onNew,
  onClearSelection,
  onCloseForm,
  onReferenceLifecycleAction,
  onRevertRenewal,
  onCreateReference,
  onUpdateReference,
  onReferenceStatusChange,
  onRemoveClient,
  onRemoveReference,
  onSelect,
  onClientsPageChange,
  onFinancialMutation,
  onWhatsAppSent,
  onUpdate,
  planId,
  plans,
  search,
  selectedClient,
  setPlanId,
  setSearch,
  setStatus,
  status,
  renewalNotice,
  renewalReversalPreviewLoadingId,
}: {
  clientFormOpen: boolean;
  clients: Client[];
  clientsPagination: PaginatedClients['pagination'] | null;
  dataLoading: boolean;
  detailTabRequest: ClientDetailTabRequest | null;
  editingClient: Client | null;
  onApplyFilters: () => void;
  onCreate: (payload: ClientPayload) => Promise<void>;
  onEdit: (client: Client) => void;
  onNew: () => void;
  onClearSelection: () => void;
  onReferenceLifecycleAction: (client: Client, reference?: ClientReference) => void;
  onRevertRenewal: (client: Client, renewal: Renewal) => void;
  onCreateReference: (
    client: Client,
    payload: Omit<ClientPayload, 'name' | 'phone' | 'email'>,
  ) => Promise<void>;
  onUpdateReference: (
    reference: ClientReference,
    payload: Partial<Omit<ClientPayload, 'name' | 'phone' | 'email'>>,
  ) => Promise<void>;
  onReferenceStatusChange: (
    reference: ClientReference,
    status: ClientStatus,
    reason?: string,
  ) => void;
  onRemoveClient: (client: Client) => void;
  onRemoveReference: (reference: ClientReference) => void;
  onSelect: (client: Client) => void | Promise<void>;
  onClientsPageChange: (page: number) => void;
  onFinancialMutation: (clientId: string) => Promise<void>;
  onWhatsAppSent: (clientId: string) => Promise<void>;
  onUpdate: (payload: ClientUpdatePayload) => Promise<void>;
  onCloseForm: () => void;
  planId: string;
  plans: Plan[];
  search: string;
  selectedClient: Client | null;
  setPlanId: (value: string) => void;
  setSearch: (value: string) => void;
  setStatus: (value: ClientStatus | '') => void;
  status: ClientStatus | '';
  renewalNotice: string;
  renewalReversalPreviewLoadingId: string | null;
}) {
  const sortedPlans = sortPlansByDuration(plans);
  const selectableClientPlans = sortPlansByDuration(
    plans.filter((plan) => plan.active || plan.id === editingClient?.planId),
  );
  const [detailTab, setDetailTab] = useState<ClientDetailTab>('overview');
  const [whatsAppClient, setWhatsAppClient] = useState<Client | null>(null);
  const [referenceFormOpen, setReferenceFormOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<ClientReference | null>(null);
  const [referenceFilter, setReferenceFilter] = useState<
    'ALL' | 'ATIVO' | 'PENDENTE_PAGAMENTO' | 'INATIVO' | 'CANCELADO'
  >('ALL');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [referenceSort, setReferenceSort] = useState<'recent' | 'dueDate'>('recent');
  const [referenceStatusModal, setReferenceStatusModal] = useState<{
    reference: ClientReference;
    status: Extract<ClientStatus, 'INATIVO' | 'CANCELADO'>;
  } | null>(null);
  const [clientFinanceCategories, setClientFinanceCategories] = useState<FinancialCategory[]>([]);
  const [clientFinanceItems, setClientFinanceItems] = useState<Receivable[]>([]);
  const [clientFinancePagination, setClientFinancePagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [clientFinanceSummary, setClientFinanceSummary] = useState<ReceivablesSummary | null>(null);
  const [clientOverviewSummary, setClientOverviewSummary] = useState<{
    clientId: string;
    summary: ReceivablesSummary;
  } | null>(null);
  const [clientOverviewSummaryError, setClientOverviewSummaryError] = useState('');
  const [clientPixSummary, setClientPixSummary] = useState<{
    clientId: string;
    summary: PaymentIntentsSummary;
  } | null>(null);
  const [clientPixSummaryError, setClientPixSummaryError] = useState('');
  const [clientFinancePage, setClientFinancePage] = useState(1);
  const [clientFinanceReferenceId, setClientFinanceReferenceId] = useState('');
  const [clientFinanceStatus, setClientFinanceStatus] = useState<ReceivableDisplayStatus | ''>('');
  const [clientFinanceLoading, setClientFinanceLoading] = useState(false);
  const [clientFinanceError, setClientFinanceError] = useState('');
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [pixReceivable, setPixReceivable] = useState<Receivable | null>(null);
  const [paymentReceivables, setPaymentReceivables] = useState<Receivable[] | null>(null);
  const [pixReceivables, setPixReceivables] = useState<Receivable[] | null>(null);
  const [cancelingReceivable, setCancelingReceivable] = useState<Receivable | null>(null);
  const [viewingLegacyPayment, setViewingLegacyPayment] = useState<Receivable | null>(null);
  const [selectedReceivableIds, setSelectedReceivableIds] = useState<string[]>([]);
  const [selectedDispatch, setSelectedDispatch] = useState<MessageDispatch | null>(null);
  const [clientBillingDispatches, setClientBillingDispatches] = useState<MessageDispatch[]>([]);
  const [clientBillingPagination, setClientBillingPagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [clientBillingSummary, setClientBillingSummary] = useState<BillingDispatchSummary | null>(
    null,
  );
  const [clientBillingPage, setClientBillingPage] = useState(1);
  const [clientBillingReferenceId, setClientBillingReferenceId] = useState('');
  const [clientBillingStatus, setClientBillingStatus] = useState<MessageDispatch['status'] | ''>(
    '',
  );
  const [clientBillingLoading, setClientBillingLoading] = useState(false);
  const [clientBillingError, setClientBillingError] = useState('');
  const [clientActionNotice, setClientActionNotice] = useState('');
  const [clientActionError, setClientActionError] = useState('');
  const [timelineItems, setTimelineItems] = useState<ClientEvent[]>([]);
  const [timelinePagination, setTimelinePagination] = useState<
    PaginatedClientEvents['pagination'] | null
  >(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const uniqueSelectedReference =
    selectedClient?.references?.length === 1 ? selectedClient.references[0] : null;
  const selectedReferences = selectedClient?.references ?? [];
  const referenceCounts = selectedReferences.reduce(
    (counts, reference) => {
      counts.all += 1;
      if (reference.status === 'ATIVO') counts.active += 1;
      if (reference.status === 'PENDENTE_PAGAMENTO') counts.pending += 1;
      if (reference.status === 'INATIVO') counts.inactive += 1;
      if (reference.status === 'CANCELADO') counts.canceled += 1;
      return counts;
    },
    { active: 0, all: 0, canceled: 0, inactive: 0, pending: 0 },
  );
  const visibleReferences = selectedReferences.filter((reference) => {
    const query = referenceSearch.trim().toLowerCase();
    if (referenceFilter !== 'ALL' && reference.status !== referenceFilter) return false;
    if (!query) return true;
    return (
      reference.reference.toLowerCase().includes(query) ||
      reference.plan.name.toLowerCase().includes(query)
    );
  });
  visibleReferences.sort((a, b) => {
    if (referenceSort === 'dueDate') return a.dueDate.localeCompare(b.dueDate);
    return b.createdAt.localeCompare(a.createdAt);
  });
  const selectedReceivablesForBulk = clientFinanceItems.filter((receivable) =>
    selectedReceivableIds.includes(receivable.id),
  );
  const selectedReceivableTotal = selectedReceivablesForBulk.reduce(
    (total, receivable) => total + Number(receivable.amount),
    0,
  );
  const selectedPendingReceivablesForBulk = selectedReceivablesForBulk.filter(
    (receivable) => receivable.status === 'PENDENTE',
  );
  const selectedClientId = selectedClient?.id;

  const clientOverviewAmount = (key: keyof ReceivablesSummary) => {
    if (clientOverviewSummaryError) return 'Falha';
    const summary = clientOverviewSummary;
    if (!summary || summary.clientId !== selectedClientId) return formatCurrency('0.00');
    return formatCurrency(summary.summary[key]);
  };

  const loadClientOverviewSummary = useCallback(async () => {
    if (!selectedClientId) return;

    setClientOverviewSummaryError('');

    try {
      const nextSummary = await getReceivablesSummary({ clientId: selectedClientId });
      setClientOverviewSummary({ clientId: selectedClientId, summary: nextSummary });
    } catch (err) {
      setClientOverviewSummary(null);
      setClientOverviewSummaryError(
        err instanceof Error ? err.message : 'Não foi possível carregar resumo financeiro.',
      );
    }
  }, [selectedClientId]);

  const loadClientPixSummary = useCallback(async () => {
    if (!selectedClientId) return;

    setClientPixSummaryError('');

    try {
      const nextSummary = await getPaymentIntentsSummary({ clientId: selectedClientId });
      setClientPixSummary({ clientId: selectedClientId, summary: nextSummary });
    } catch (err) {
      setClientPixSummary(null);
      setClientPixSummaryError(
        err instanceof Error ? err.message : 'Não foi possível carregar resumo PIX.',
      );
    }
  }, [selectedClientId]);

  const loadClientFinance = useCallback(async () => {
    if (!selectedClientId) return;

    setClientFinanceLoading(true);
    setClientFinanceError('');

    const baseFilters = {
      clientId: selectedClientId,
      ...(clientFinanceReferenceId ? { clientReferenceId: clientFinanceReferenceId } : {}),
    };

    try {
      const [nextReceivables, nextSummary] = await Promise.all([
        listReceivables({
          ...baseFilters,
          page: clientFinancePage,
          pageSize: clientFinancePageSize,
          status: clientFinanceStatus,
        }),
        getReceivablesSummary(baseFilters),
      ]);

      setClientFinanceItems(nextReceivables.items);
      setClientFinancePagination(nextReceivables.pagination);
      setClientFinanceSummary(nextSummary);
      if (
        !nextReceivables.items.length &&
        nextReceivables.pagination.page > 1 &&
        nextReceivables.pagination.total > 0
      ) {
        setClientFinancePage(Math.max(1, nextReceivables.pagination.totalPages));
      }
    } catch (err) {
      setClientFinanceItems([]);
      setClientFinancePagination(null);
      setClientFinanceSummary(null);
      setClientFinanceError(
        err instanceof Error ? err.message : 'Não foi possível carregar financeiro do cliente.',
      );
    } finally {
      setClientFinanceLoading(false);
    }
  }, [clientFinancePage, clientFinanceReferenceId, clientFinanceStatus, selectedClientId]);

  const loadClientBillingDispatches = useCallback(
    async (pageOverride = clientBillingPage) => {
      if (!selectedClientId) return;

      setClientBillingLoading(true);
      setClientBillingError('');

      const filters = {
        clientId: selectedClientId,
        ...(clientBillingReferenceId ? { clientReferenceId: clientBillingReferenceId } : {}),
        page: pageOverride,
        pageSize: listPageSize,
        status: clientBillingStatus,
      };

      try {
        const nextDispatches = await listBillingDispatches(filters);

        setClientBillingDispatches(nextDispatches.items);
        setClientBillingPagination(nextDispatches.pagination);
        if (
          !nextDispatches.items.length &&
          nextDispatches.pagination.page > 1 &&
          nextDispatches.pagination.total > 0
        ) {
          setClientBillingPage(Math.max(1, nextDispatches.pagination.totalPages));
        }
        setSelectedDispatch((current) => {
          if (!current) return null;
          return nextDispatches.items.find((dispatch) => dispatch.id === current.id) ?? null;
        });
      } catch (err) {
        setClientBillingDispatches([]);
        setClientBillingPagination(null);
        setClientBillingError(
          err instanceof Error ? err.message : 'Não foi possível carregar cobranças do cliente.',
        );
      } finally {
        setClientBillingLoading(false);
      }
    },
    [clientBillingPage, clientBillingReferenceId, clientBillingStatus, selectedClientId],
  );

  const loadClientBillingSummary = useCallback(async () => {
    if (!selectedClientId) return;

    setClientBillingError('');

    const baseFilters = {
      clientId: selectedClientId,
      ...(clientBillingReferenceId ? { clientReferenceId: clientBillingReferenceId } : {}),
    };

    try {
      const nextSummary = await getBillingDispatchSummary(baseFilters);
      setClientBillingSummary(nextSummary);
    } catch (err) {
      setClientBillingSummary(null);
      setClientBillingError(
        err instanceof Error ? err.message : 'Não foi possível carregar resumo de cobranças.',
      );
    }
  }, [clientBillingReferenceId, selectedClientId]);

  useEffect(() => {
    setDetailTab('overview');
    setSelectedReceivableIds([]);
    setSelectedDispatch(null);
    setReferenceStatusModal(null);
    setPaymentReceivable(null);
    setPixReceivable(null);
    setPaymentReceivables(null);
    setPixReceivables(null);
    setCancelingReceivable(null);
    setViewingLegacyPayment(null);
    setClientActionNotice('');
    setClientActionError('');
    setClientFinanceItems([]);
    setClientFinancePagination(null);
    setClientFinanceSummary(null);
    setClientOverviewSummary(null);
    setClientOverviewSummaryError('');
    setClientPixSummary(null);
    setClientPixSummaryError('');
    setClientBillingDispatches([]);
    setClientBillingPagination(null);
    setClientBillingSummary(null);
    setClientBillingPage(1);
    setClientBillingReferenceId('');
    setClientBillingStatus('');
    setClientBillingLoading(false);
    setClientBillingError('');
    setClientFinancePage(1);
    setClientFinanceReferenceId('');
    setClientFinanceStatus('');
    setClientFinanceLoading(false);
    setClientFinanceError('');
    setTimelineItems([]);
    setTimelinePagination(null);
    setTimelinePage(1);
    setTimelineLoading(false);
    setTimelineError('');
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || !detailTabRequest) return;

    setDetailTab(detailTabRequest.tab);

    if (detailTabRequest.receivable) {
      setClientFinanceReferenceId(detailTabRequest.receivable.clientReferenceId ?? '');
      setClientFinanceStatus('');
      setClientFinancePage(1);
      setPixReceivable(detailTabRequest.receivable);
    }
  }, [detailTabRequest, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    void loadClientOverviewSummary();
  }, [loadClientOverviewSummary, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || detailTab !== 'receivables') return;
    void loadClientFinance();
  }, [detailTab, loadClientFinance, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || detailTab !== 'messages') return;
    void loadClientPixSummary();
  }, [detailTab, loadClientPixSummary, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || detailTab !== 'messages') return;
    void loadClientBillingDispatches();
  }, [detailTab, loadClientBillingDispatches, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || detailTab !== 'messages') return;
    void loadClientBillingSummary();
  }, [detailTab, loadClientBillingSummary, selectedClientId]);

  useEffect(() => {
    setSelectedReceivableIds([]);
  }, [clientFinancePage, clientFinanceReferenceId, clientFinanceStatus]);

  useEffect(() => {
    setSelectedDispatch(null);
  }, [clientBillingPage, clientBillingReferenceId, clientBillingStatus]);

  useEffect(() => {
    if (!selectedClient || detailTab !== 'timeline') return undefined;

    let active = true;
    setTimelineLoading(true);
    setTimelineError('');

    getClientEvents(selectedClient.id, { page: timelinePage, pageSize: listPageSize })
      .then((timeline) => {
        if (!active) return;
        setTimelineItems(timeline.items);
        setTimelinePagination(timeline.pagination);
        if (
          !timeline.items.length &&
          timeline.pagination.page > 1 &&
          timeline.pagination.total > 0
        ) {
          setTimelinePage(Math.max(1, timeline.pagination.totalPages));
        }
      })
      .catch((err) => {
        if (!active) return;
        setTimelineItems([]);
        setTimelinePagination(null);
        setTimelineError(
          err instanceof Error ? err.message : 'Não foi possível carregar o histórico.',
        );
      })
      .finally(() => {
        if (active) setTimelineLoading(false);
      });

    return () => {
      active = false;
    };
  }, [detailTab, selectedClient?.id, timelinePage]);

  useEffect(() => {
    if (!selectedClient) return undefined;

    let active = true;

    listFinancialCategories()
      .then((categories) => {
        if (active) {
          setClientFinanceCategories(categories.filter((category) => category.type === 'ENTRADA'));
        }
      })
      .catch(() => {
        if (active) setClientActionError('Não foi possível carregar categorias financeiras.');
      });

    return () => {
      active = false;
    };
  }, [selectedClient]);

  async function refreshClientFinance(message: string) {
    if (!selectedClient) return;
    setClientActionError('');
    setClientActionNotice(message);
    setSelectedReceivableIds([]);
    await Promise.all([
      loadClientFinance(),
      loadClientOverviewSummary(),
      clientPixSummary?.clientId === selectedClient.id ? loadClientPixSummary() : Promise.resolve(),
      onFinancialMutation(selectedClient.id),
    ]);
  }

  function toggleClientReceivableSelection(receivable: Receivable, checked: boolean) {
    if (receivable.status !== 'PENDENTE') return;

    setSelectedReceivableIds((current) =>
      checked
        ? [...new Set([...current, receivable.id])]
        : current.filter((id) => id !== receivable.id),
    );
  }

  return (
    <>
      {!selectedClient ? (
        <div className="clients-page-header">
          <PageHeader
            actions={
              <Button
                className="clients-new-button"
                icon={UserPlus}
                onClick={onNew}
                variant="primary"
              >
                <span className="clients-new-desktop-label">Novo cliente</span>
                <span className="clients-new-mobile-label">+ Cliente</span>
              </Button>
            }
            subtitle="Base de clientes, referências e histórico"
            title="Clientes"
          />
        </div>
      ) : null}
      <div className="clients-layout">
        {!selectedClient ? (
          <section className="workspace-main clients-list-view" aria-label="Lista de clientes">
            {renewalNotice ? <div className="notice success">{renewalNotice}</div> : null}
            <div className="toolbar">
              <div className="search-row">
                <Search aria-hidden="true" size={18} />
                <input
                  placeholder="Buscar por nome, referência ou telefone..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ClientStatus | '')}
              >
                <option value="">Todos os status</option>
                <option value="PENDENTE_PAGAMENTO">Pendente pagamento</option>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                <option value="">Todos os planos</option>
                {sortedPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
              <Button icon={Filter} onClick={onApplyFilters} variant="secondary">
                Aplicar
              </Button>
            </div>

            <div className="table-wrap">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>CLIENTE</th>
                    <th>REFERÊNCIAS</th>
                    <th>WHATSAPP</th>
                    <th>PLANO / RESUMO</th>
                    <th>PRÓX. VENCIMENTO</th>
                    <th>SITUAÇÃO</th>
                    <th>CADASTRO</th>
                    <th>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const references = client.references ?? [];
                    const singleReference = references.length === 1 ? references[0] : null;

                    return (
                      <tr
                        key={client.id}
                        tabIndex={0}
                        onClick={() => void onSelect(client)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            void onSelect(client);
                          }
                        }}
                      >
                        <td>
                          <div className="client-cell">
                            <span className="client-avatar" aria-hidden="true">
                              {clientInitial(client.name)}
                            </span>
                            <span className="client-cell-copy">
                              <span className="client-mobile-title-row">
                                <strong>{client.name}</strong>
                                <IconButton
                                  className="client-mobile-whatsapp-action"
                                  icon={MessageCircle}
                                  label={`Enviar WhatsApp para ${client.name}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setWhatsAppClient(client);
                                  }}
                                />
                              </span>
                              <small>{client.email ?? client.phoneNormalized}</small>
                            </span>
                          </div>
                          <div className="client-mobile-card-meta">
                            <span className="client-mobile-phone">
                              <MessageCircle aria-hidden="true" size={14} />
                              {client.phoneNormalized}
                            </span>
                            <span>
                              <strong>{clientReferenceSummary(references)}</strong>
                              {singleReference ? ` · ${singleReference.plan.name}` : null}
                            </span>
                            <span>
                              {clientPlanSummary(references)} ·{' '}
                              {clientOperationalSummary(references)}
                            </span>
                            <span>Próx. vencimento: {clientNextDueSummary(references)}</span>
                            <span>Cadastro: {formatDate(client.createdAt)}</span>
                            <ClientReferenceStatusSummary
                              items={clientReferenceStatusSummary(client)}
                            />
                          </div>
                        </td>
                        <td>
                          <strong>{clientReferenceSummary(references)}</strong>
                          {singleReference ? <span>{singleReference.plan.name}</span> : null}
                        </td>
                        <td>
                          <span className="inline-icon-cell">
                            <MessageCircle aria-hidden="true" size={14} />
                            {client.phoneNormalized}
                          </span>
                        </td>
                        <td>
                          <strong>{clientPlanSummary(references)}</strong>
                          <span>{clientOperationalSummary(references)}</span>
                        </td>
                        <td>
                          <span>{clientNextDueSummary(references)}</span>
                        </td>
                        <td>
                          <ClientReferenceStatusSummary
                            items={clientReferenceStatusSummary(client)}
                          />
                        </td>
                        <td>
                          <span>{formatDate(client.createdAt)}</span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <IconButton
                              icon={Eye}
                              label={`Abrir cliente ${client.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void onSelect(client);
                              }}
                            />
                            <IconButton
                              icon={Pencil}
                              label={`Editar cliente ${client.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit(client);
                              }}
                            />
                            <ActionMenu
                              items={[
                                {
                                  disabled: !singleReference,
                                  icon: RefreshCw,
                                  label: referenceLifecycleActionLabel(singleReference),
                                  onSelect: () =>
                                    onReferenceLifecycleAction(
                                      client,
                                      singleReference ?? undefined,
                                    ),
                                },
                                {
                                  danger: true,
                                  icon: Trash2,
                                  label: 'Remover cliente',
                                  onSelect: () => onRemoveClient(client),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!clients.length ? (
                <div className="empty-state">
                  {dataLoading ? 'Carregando...' : 'Nenhum cliente encontrado.'}
                </div>
              ) : null}
              <PaginationControls
                itemLabel="clientes"
                pagination={clientsPagination}
                onPageChange={onClientsPageChange}
              />
            </div>
          </section>
        ) : null}

        {selectedClient ? (
          <section className="detail-panel client-detail-view" aria-label="Detalhe do cliente">
            <>
              <Button
                className="client-detail-back-button"
                icon={ArrowLeft}
                size="sm"
                variant="ghost"
                onClick={onClearSelection}
              >
                Voltar para Clientes
              </Button>
              <div className="client-detail-header">
                <span className="client-avatar large" aria-hidden="true">
                  {clientInitial(selectedClient.name)}
                </span>
                <div className="client-detail-title">
                  <h2>{selectedClient.name}</h2>
                  <div className="client-detail-meta">
                    <span>{clientReferenceCountLabel(selectedReferences.length)}</span>
                    <span>WhatsApp: {selectedClient.phoneNormalized}</span>
                    {selectedClient.email ? <span>{selectedClient.email}</span> : null}
                    <span>Cliente desde {formatDate(selectedClient.createdAt)}</span>
                  </div>
                </div>
                <div className="client-detail-actions">
                  <Button
                    className="client-detail-renew-action"
                    icon={RefreshCw}
                    disabled={!uniqueSelectedReference}
                    size="sm"
                    variant="primary"
                    onClick={() => onReferenceLifecycleAction(selectedClient)}
                  >
                    {referenceLifecycleActionLabel(uniqueSelectedReference)}
                  </Button>
                  <Button
                    className="client-detail-whatsapp-action"
                    icon={Send}
                    size="sm"
                    variant="secondary"
                    onClick={() => setWhatsAppClient(selectedClient)}
                  >
                    WhatsApp
                  </Button>
                  <IconButton
                    className="client-detail-edit-action"
                    icon={Pencil}
                    label="Editar cliente"
                    onClick={() => onEdit(selectedClient)}
                  />
                  <span className="client-detail-more-action">
                    <ActionMenu
                      label="Mais"
                      items={[
                        {
                          icon: Pencil,
                          label: 'Editar',
                          onSelect: () => onEdit(selectedClient),
                        },
                        {
                          danger: true,
                          icon: Trash2,
                          label: 'Remover cliente',
                          onSelect: () => onRemoveClient(selectedClient),
                        },
                      ]}
                    />
                  </span>
                </div>
              </div>

              <div className="client-detail-kpis">
                <StatCard label="Referências" value={selectedReferences.length} />
                <StatCard label="A receber" value={clientOverviewAmount('pendingAmount')} />
                <StatCard
                  label="Próximo vencimento"
                  value={clientNextDueSummary(selectedReferences)}
                />
                <StatCard label="Total pago" value={clientOverviewAmount('paidAmount')} />
              </div>

              <div className="tabs">
                <button
                  className={detailTab === 'overview' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('overview')}
                >
                  Visão Geral
                </button>
                <button
                  className={detailTab === 'references' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('references')}
                >
                  Referências
                </button>
                <button
                  className={detailTab === 'receivables' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('receivables')}
                >
                  Financeiro
                </button>
                <button
                  className={detailTab === 'messages' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('messages')}
                >
                  Cobranças/PIX
                </button>
                <button
                  className={detailTab === 'timeline' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('timeline')}
                >
                  Histórico
                </button>
                <button
                  className={detailTab === 'more' ? 'active' : ''}
                  type="button"
                  onClick={() => setDetailTab('more')}
                >
                  Mais
                </button>
              </div>

              {detailTab === 'overview' ? (
                <div className="client-overview-grid">
                  <section className="client-overview-card client-profile-card">
                    <ClientSectionHeading
                      description="Dados cadastrais e contato"
                      icon={UserRound}
                      title="Informações pessoais"
                      action={
                        <IconButton
                          icon={Pencil}
                          label="Editar cliente"
                          onClick={() => onEdit(selectedClient)}
                        />
                      }
                    />
                    <dl className="client-info-grid">
                      {[
                        {
                          icon: UserRound,
                          label: 'Nome',
                          muted: false,
                          value: selectedClient.name,
                        },
                        {
                          icon: MessageCircle,
                          label: 'WhatsApp',
                          muted: false,
                          value:
                            normalizeWhatsAppDisplayPhone(selectedClient.phoneNormalized) ??
                            selectedClient.phoneNormalized,
                        },
                        {
                          icon: Mail,
                          label: 'E-mail',
                          muted: !selectedClient.email,
                          value: selectedClient.email ?? 'Não informado',
                        },
                        {
                          icon: CalendarDays,
                          label: 'Cliente desde',
                          muted: false,
                          value: formatDate(selectedClient.createdAt),
                        },
                      ].map((item) => {
                        const Icon = item.icon;

                        return (
                          <div className="client-info-item" key={item.label}>
                            <Icon aria-hidden="true" size={15} />
                            <div>
                              <dt>{item.label}</dt>
                              <dd className={item.muted ? 'muted-value' : ''}>{item.value}</dd>
                            </div>
                          </div>
                        );
                      })}
                    </dl>
                    <div className="client-notes-block">
                      <div className="client-notes-title">
                        <FileText aria-hidden="true" size={15} />
                        <span>Observações internas</span>
                      </div>
                      <p className={!selectedClient.notes ? 'muted-value' : ''}>
                        {selectedClient.notes ?? 'Nenhuma observação cadastrada.'}
                      </p>
                    </div>
                  </section>
                  <section className="client-overview-card client-summary-card">
                    <ClientSectionHeading
                      description="Situação atual do cliente"
                      icon={Activity}
                      title="Resumo operacional"
                    />
                    <div className="client-summary-compact">
                      <div className="client-summary-status-row">
                        <span>{clientReferenceCountLabel(selectedReferences.length)}</span>
                      </div>
                      <dl className="client-summary-metrics">
                        <div>
                          <dt>Referências</dt>
                          <dd className="metric-value-primary">{selectedReferences.length}</dd>
                        </div>
                        <div>
                          <dt>Ativas</dt>
                          <dd className="metric-value-success">{referenceCounts.active}</dd>
                        </div>
                        <div>
                          <dt>A receber</dt>
                          <dd className="metric-value-primary">
                            {clientOverviewAmount('pendingAmount')}
                          </dd>
                        </div>
                        <div>
                          <dt>Total pago</dt>
                          <dd className="metric-value-success">
                            {clientOverviewAmount('paidAmount')}
                          </dd>
                        </div>
                        <div>
                          <dt>Próx. vencimento</dt>
                          <dd className="metric-value-info">
                            {clientNextDueSummary(selectedReferences)}
                          </dd>
                        </div>
                        {uniqueSelectedReference ? (
                          <div>
                            <dt>Cobrança</dt>
                            <dd>{uniqueSelectedReference.billingNoticeDays} dias antes</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  </section>
                  <section className="client-overview-card client-activity-card">
                    <ClientSectionHeading
                      description="Últimos movimentos do cliente"
                      icon={History}
                      title="Atividade recente"
                      action={
                        <Button
                          icon={History}
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailTab('timeline')}
                        >
                          Ver histórico completo
                        </Button>
                      }
                    />
                    <ol className="timeline compact-timeline">
                      {(selectedClient.events ?? []).slice(0, 5).map((event) => (
                        <li key={event.id}>
                          <span className="client-timeline-icon" aria-hidden="true">
                            <ClientEventIcon type={event.type} />
                          </span>
                          <div>
                            <strong>{event.title}</strong>
                            <span>{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                            {event.description ? <p>{event.description}</p> : null}
                          </div>
                        </li>
                      ))}
                      {!selectedClient.events?.length ? (
                        <li>
                          <span className="client-timeline-icon" aria-hidden="true">
                            <History size={14} />
                          </span>
                          <div>
                            <strong>Nenhuma atividade recente.</strong>
                            <span>O histórico aparecerá aqui quando houver atividade.</span>
                          </div>
                        </li>
                      ) : null}
                    </ol>
                  </section>
                </div>
              ) : null}

              {detailTab === 'timeline' ? (
                <>
                  {timelineLoading ? (
                    <div className="empty-state">Carregando histórico...</div>
                  ) : null}
                  {timelineError ? <div className="notice danger">{timelineError}</div> : null}
                  <ol className="timeline">
                    {timelineItems.map((event) => (
                      <li key={event.id}>
                        <span className="client-timeline-icon" aria-hidden="true">
                          <ClientEventIcon type={event.type} />
                        </span>
                        <div>
                          <strong>{event.title}</strong>
                          <span>{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                          {event.description ? <p>{event.description}</p> : null}
                        </div>
                      </li>
                    ))}
                    {!timelineLoading && !timelineError && !timelineItems.length ? (
                      <li>
                        <span className="client-timeline-icon" aria-hidden="true">
                          <Activity size={14} />
                        </span>
                        <div>
                          <strong>Sem eventos recentes</strong>
                          <span>O histórico aparecerá aqui quando houver atividade.</span>
                        </div>
                      </li>
                    ) : null}
                  </ol>
                  {timelinePagination && timelinePagination.total > 0 ? (
                    <PaginationControls
                      itemLabel="eventos"
                      pagination={timelinePagination}
                      onPageChange={setTimelinePage}
                    />
                  ) : null}
                </>
              ) : null}

              {detailTab === 'references' ? (
                <div className="client-tab-panel references-section">
                  <div className="references-header">
                    <div className="references-title">
                      <span className="section-icon" aria-hidden="true">
                        <Layers size={16} />
                      </span>
                      <div>
                        <h3>Referências</h3>
                        <p>Gerencie as referências deste cliente.</p>
                        <p>Cada referência possui seu próprio plano, valor e vencimento.</p>
                      </div>
                    </div>
                    <Button
                      icon={Plus}
                      variant="primary"
                      onClick={() => {
                        setEditingReference(null);
                        setReferenceFormOpen(true);
                      }}
                    >
                      Nova referência
                    </Button>
                  </div>
                  <div className="reference-toolbar" aria-label="Filtros de referências">
                    {[
                      {
                        count: referenceCounts.all,
                        label: 'Todos',
                        tone: 'primary',
                        value: 'ALL' as const,
                      },
                      {
                        count: referenceCounts.active,
                        label: 'Ativas',
                        tone: 'success',
                        value: 'ATIVO' as const,
                      },
                      {
                        count: referenceCounts.pending,
                        label: 'Pendentes',
                        tone: 'warning',
                        value: 'PENDENTE_PAGAMENTO' as const,
                      },
                      {
                        count: referenceCounts.inactive,
                        label: 'Inativas',
                        tone: 'info',
                        value: 'INATIVO' as const,
                      },
                      {
                        count: referenceCounts.canceled,
                        label: 'Canceladas',
                        tone: 'danger',
                        value: 'CANCELADO' as const,
                      },
                    ].map((item) => (
                      <button
                        className={`reference-filter tone-${item.tone} ${
                          referenceFilter === item.value ? 'active' : ''
                        }`}
                        key={item.value}
                        type="button"
                        onClick={() => setReferenceFilter(item.value)}
                      >
                        <span className="reference-filter-dot" aria-hidden="true" />
                        <span className="reference-filter-label">{item.label}</span>
                        <span className="reference-filter-count">[{item.count}]</span>
                      </button>
                    ))}
                  </div>
                  <div className="reference-controls">
                    <label className="reference-search">
                      <Search aria-hidden="true" size={16} />
                      <input
                        placeholder="Buscar referência..."
                        value={referenceSearch}
                        onChange={(event) => setReferenceSearch(event.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Ordenar referências"
                      value={referenceSort}
                      onChange={(event) =>
                        setReferenceSort(event.target.value as typeof referenceSort)
                      }
                    >
                      <option value="recent">Mais recentes</option>
                      <option value="dueDate">Vencimento</option>
                    </select>
                  </div>
                  <div className="reference-grid">
                    {visibleReferences.map((reference) => (
                      <article
                        className={`reference-card status-${reference.status.toLowerCase()}`}
                        key={reference.id}
                      >
                        <header>
                          <div>
                            <strong>{reference.reference}</strong>
                            <span>{reference.plan.name}</span>
                          </div>
                          <StatusBadge status={reference.status} />
                        </header>
                        <div className="reference-price">
                          <strong>{formatCurrency(reference.recurringValue)}</strong>
                          <span>/ mês</span>
                        </div>
                        <div className="reference-card-divider" aria-hidden="true" />
                        <div className="reference-metrics">
                          <div className="reference-metric-due">
                            <CalendarClock aria-hidden="true" size={15} />
                            <span>Vencimento</span>
                            <strong>{formatDate(reference.dueDate)}</strong>
                          </div>
                          <div className="reference-metric-billing">
                            <ShieldCheck aria-hidden="true" size={15} />
                            <span>Cobrança</span>
                            <strong>{reference.billingNoticeDays} dias antes</strong>
                          </div>
                        </div>
                        {reference.inactivatedAt ? (
                          <p>
                            Inativada em {formatDateTime(reference.inactivatedAt)}
                            {reference.inactivationReason
                              ? ` | ${reference.inactivationReason}`
                              : ''}
                          </p>
                        ) : null}
                        {reference.canceledAt ? (
                          <p>
                            Cancelada em {formatDateTime(reference.canceledAt)}
                            {reference.cancellationReason
                              ? ` | ${reference.cancellationReason}`
                              : ''}
                          </p>
                        ) : null}
                        <div className="reference-card-divider" aria-hidden="true" />
                        <span className="reference-created">
                          Criada em {formatDate(reference.createdAt)}
                        </span>
                        <div className="reference-actions">
                          <Button
                            icon={RefreshCw}
                            size="sm"
                            variant="secondary"
                            onClick={() => onReferenceLifecycleAction(selectedClient, reference)}
                          >
                            {referenceLifecycleActionLabel(reference)}
                          </Button>
                          <IconButton
                            icon={Pencil}
                            label={`Editar referência ${reference.reference}`}
                            onClick={() => {
                              setEditingReference(reference);
                              setReferenceFormOpen(true);
                            }}
                          />
                          <ActionMenu
                            items={[
                              {
                                disabled: reference.status === 'CANCELADO',
                                icon: CircleCheck,
                                label: 'Ativar',
                                onSelect: () => onReferenceStatusChange(reference, 'ATIVO'),
                              },
                              {
                                icon: Power,
                                label: 'Inativar',
                                onSelect: () =>
                                  setReferenceStatusModal({ reference, status: 'INATIVO' }),
                              },
                              {
                                danger: true,
                                icon: XCircle,
                                label: 'Cancelar',
                                onSelect: () =>
                                  setReferenceStatusModal({ reference, status: 'CANCELADO' }),
                              },
                              {
                                danger: true,
                                icon: Trash2,
                                label: 'Remover',
                                onSelect: () => onRemoveReference(reference),
                              },
                            ]}
                          />
                        </div>
                      </article>
                    ))}
                  </div>
                  {!visibleReferences.length ? (
                    <div className="empty-state">Sem referências cadastradas.</div>
                  ) : null}
                  <footer className="references-info">
                    <span className="section-icon" aria-hidden="true">
                      <Info size={15} />
                    </span>
                    <div>
                      <strong>Sobre referências</strong>
                      <p>
                        Cada referência possui seu próprio plano, valor, vencimento e regras de
                        cobrança.
                      </p>
                      <p>
                        <span className="reference-info-status status-inativo-text">INATIVO</span>{' '}
                        indica serviço temporariamente parado;{' '}
                        <span className="reference-info-status status-cancelado-text">
                          CANCELADO
                        </span>{' '}
                        indica encerramento definitivo.
                      </p>
                    </div>
                  </footer>
                </div>
              ) : null}

              {detailTab === 'more' ? (
                <div className="client-tab-panel client-more-workspace">
                  <section className="client-overview-card client-more-card">
                    <ClientSectionHeading
                      description="Histórico de renovações deste cliente."
                      icon={RefreshCw}
                      title="Renovações"
                    />
                    {(selectedClient.renewals ?? []).length ? (
                      <div className="client-more-list">
                        {(selectedClient.renewals ?? []).map((renewal) => {
                          const canRequestReversal = renewal.status !== 'REVERTED';
                          const loadingReversalPreview =
                            renewalReversalPreviewLoadingId === renewal.id;

                          return (
                            <article className="client-more-list-item" key={renewal.id}>
                              <div>
                                <div>
                                  <strong>{renewal.planName}</strong>
                                  <span>{formatDateTime(renewal.createdAt)}</span>
                                </div>
                                <div className="client-more-item-actions">
                                  {loadingReversalPreview ? (
                                    <span className="client-more-status-pill">
                                      Carregando prévia
                                    </span>
                                  ) : null}
                                  {renewal.status === 'REVERTED' ? (
                                    <span className="client-more-status-pill">Revertida</span>
                                  ) : null}
                                  {canRequestReversal ? (
                                    <ActionMenu
                                      items={[
                                        {
                                          disabled: loadingReversalPreview,
                                          icon: RotateCcw,
                                          label: loadingReversalPreview
                                            ? 'Carregando prévia...'
                                            : 'Desfazer renovação',
                                          onSelect: () => onRevertRenewal(selectedClient, renewal),
                                        },
                                      ]}
                                    />
                                  ) : null}
                                </div>
                              </div>
                              <dl>
                                <div>
                                  <dt>Valor</dt>
                                  <dd>{formatCurrency(renewal.amount)}</dd>
                                </div>
                                <div>
                                  <dt>Vencimento</dt>
                                  <dd>
                                    {formatDate(renewal.previousDueDate)} para{' '}
                                    {formatDate(renewal.newDueDate)}
                                  </dd>
                                </div>
                              </dl>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="client-more-empty">
                        <RefreshCw aria-hidden="true" size={18} />
                        <div>
                          <strong>Nenhuma renovação registrada</strong>
                          <span>As renovações deste cliente aparecerão aqui.</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="client-overview-card client-more-card">
                    <ClientSectionHeading
                      description="Acompanhamento de campanhas de inadimplência."
                      icon={Activity}
                      title="Recuperação"
                    />
                    {(selectedClient.recoveryCampaigns ?? []).length ? (
                      <div className="client-more-list">
                        {(selectedClient.recoveryCampaigns ?? []).map((campaign) => {
                          const nextStep =
                            campaign.steps.find((step) => !step.sentAt && !step.canceledAt) ??
                            campaign.steps.at(-1);

                          return (
                            <article className="client-recovery-card" key={campaign.id}>
                              <header>
                                <div>
                                  <strong>Campanha de recuperação</strong>
                                  <span>Início {formatDateTime(campaign.startedAt)}</span>
                                </div>
                                <span
                                  className={`finance-status-pill tone-${recoveryCampaignStatusTone(
                                    campaign.status,
                                  )}`}
                                >
                                  {recoveryCampaignStatusLabel(campaign.status)}
                                </span>
                              </header>
                              <dl className="client-more-meta-grid">
                                <div>
                                  <dt>Etapa atual</dt>
                                  <dd>{nextStep ? `D+${nextStep.delayDays}` : '-'}</dd>
                                </div>
                                <div>
                                  <dt>Próxima ação</dt>
                                  <dd>{nextStep ? formatDateTime(nextStep.scheduledFor) : '-'}</dd>
                                </div>
                              </dl>
                              <div className="client-recovery-steps">
                                {campaign.steps.map((step) => (
                                  <span key={step.id}>
                                    D+{step.delayDays} · {recoveryStepStatusLabel(step.status)} ·{' '}
                                    {formatDateTime(step.scheduledFor)}
                                    {step.sentAt ? ` · enviada ${formatDateTime(step.sentAt)}` : ''}
                                  </span>
                                ))}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="client-more-empty">
                        <Activity aria-hidden="true" size={18} />
                        <div>
                          <strong>Nenhuma campanha de recuperação</strong>
                          <span>Este cliente não possui campanha de recuperação ativa.</span>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="client-overview-card client-more-card client-referrals-panel">
                    <ClientSectionHeading
                      description="Indicações recebidas e realizadas pelo cliente."
                      icon={UsersRound}
                      title="Indicações"
                    />

                    <div className="client-referral-section">
                      <div className="client-more-subheading">
                        <span className="section-icon" aria-hidden="true">
                          <UserRoundPlus size={16} />
                        </span>
                        <h4>Indicação recebida</h4>
                      </div>
                      {selectedClient.referralReceived ? (
                        <article className="client-referral-card">
                          <div>
                            <span>Indicado por</span>
                            <strong>{selectedClient.referralReceived.referrerClient.name}</strong>
                          </div>
                          <div>
                            <span>Benefício</span>
                            <strong>{referralBenefitLabel(selectedClient.referralReceived)}</strong>
                          </div>
                          <span
                            className={`finance-status-pill tone-${referralStatusTone(
                              selectedClient.referralReceived.status,
                            )}`}
                          >
                            {referralStatusLabel(selectedClient.referralReceived.status)}
                          </span>
                          {selectedClient.referralReceived.qualifiedAt ? (
                            <small>
                              Qualificada em{' '}
                              {formatDateTime(selectedClient.referralReceived.qualifiedAt)}
                            </small>
                          ) : null}
                          {selectedClient.referralReceived.appliedAt ? (
                            <small>
                              Benefício aplicado em{' '}
                              {formatDateTime(selectedClient.referralReceived.appliedAt)}
                            </small>
                          ) : null}
                        </article>
                      ) : (
                        <div className="client-more-empty compact">
                          <Inbox aria-hidden="true" size={18} />
                          <div>
                            <strong>Este cliente não possui indicação recebida.</strong>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="client-referral-section">
                      <div className="client-more-subheading">
                        <span className="section-icon" aria-hidden="true">
                          <UsersRound size={16} />
                        </span>
                        <h4>Indicações feitas</h4>
                      </div>
                      <div className="client-referral-summary">
                        <div>
                          <span>Total</span>
                          <strong>{selectedClient.referralsMade?.total ?? 0}</strong>
                        </div>
                        <div>
                          <span>Qualificadas</span>
                          <strong>{selectedClient.referralsMade?.qualified ?? 0}</strong>
                        </div>
                        <div>
                          <span>Benefícios aplicados</span>
                          <strong>{selectedClient.referralsMade?.rewarded ?? 0}</strong>
                        </div>
                      </div>
                      {(selectedClient.referralsMade?.items ?? []).length ? (
                        <div className="client-referral-list">
                          {(selectedClient.referralsMade?.items ?? []).map((referral) => (
                            <article className="client-referral-card" key={referral.id}>
                              <div>
                                <strong>{referral.referredClient.name}</strong>
                                <span>{referralBenefitLabel(referral)}</span>
                              </div>
                              <span
                                className={`finance-status-pill tone-${referralStatusTone(
                                  referral.status,
                                )}`}
                              >
                                {referralStatusLabel(referral.status)}
                              </span>
                              {referral.qualifiedAt ? (
                                <small>Qualificada em {formatDateTime(referral.qualifiedAt)}</small>
                              ) : null}
                              {referral.appliedAt ? (
                                <small>
                                  Benefício aplicado em {formatDateTime(referral.appliedAt)}
                                </small>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="client-more-empty compact">
                          <Inbox aria-hidden="true" size={18} />
                          <div>
                            <strong>Nenhuma indicação realizada.</strong>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : null}

              {detailTab === 'receivables' ? (
                <div className="client-tab-panel finance-client-panel">
                  {clientActionError ? (
                    <div className="notice danger">{clientActionError}</div>
                  ) : null}
                  {clientActionNotice ? (
                    <div className="notice success">{clientActionNotice}</div>
                  ) : null}
                  {clientFinanceError ? (
                    <div className="notice danger">{clientFinanceError}</div>
                  ) : null}
                  <div className="client-tab-summary">
                    <StatCard
                      label="A receber"
                      value={formatCurrency(clientFinanceSummary?.pendingAmount ?? '0.00')}
                    />
                    <StatCard
                      label="Pago"
                      tone="success"
                      value={formatCurrency(clientFinanceSummary?.paidAmount ?? '0.00')}
                    />
                    <StatCard
                      label="Vencido"
                      tone="danger"
                      value={formatCurrency(clientFinanceSummary?.overdueAmount ?? '0.00')}
                    />
                    <StatCard
                      label="Cancelado"
                      tone="warning"
                      value={formatCurrency(clientFinanceSummary?.canceledAmount ?? '0.00')}
                    />
                  </div>
                  <div className="toolbar finance-toolbar">
                    <select
                      value={clientFinanceReferenceId}
                      onChange={(event) => {
                        setClientFinanceReferenceId(event.target.value);
                        setClientFinancePage(1);
                      }}
                    >
                      <option value="">Todas as referências</option>
                      {selectedReferences.map((reference) => (
                        <option key={reference.id} value={reference.id}>
                          {reference.reference}
                        </option>
                      ))}
                    </select>
                    <select
                      value={clientFinanceStatus}
                      onChange={(event) => {
                        setClientFinanceStatus(event.target.value as ReceivableDisplayStatus | '');
                        setClientFinancePage(1);
                      }}
                    >
                      <option value="">Todas as situações</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="PAGO">Pago</option>
                      <option value="VENCIDO">Vencido</option>
                      <option value="CANCELADO">Cancelado</option>
                    </select>
                    <Button
                      icon={Filter}
                      variant="secondary"
                      onClick={() => void loadClientFinance()}
                    >
                      Aplicar
                    </Button>
                  </div>
                  {selectedReceivableIds.length ? (
                    <div className="selection-bar finance-selection-bar">
                      <span>
                        {selectedPendingReceivablesForBulk.length} conta(s) pendente(s) ·{' '}
                        {formatCurrency(selectedReceivableTotal)}
                      </span>
                      <div className="button-row">
                        <Button
                          disabled={!selectedPendingReceivablesForBulk.length}
                          icon={QrCode}
                          size="sm"
                          variant="secondary"
                          onClick={() => setPixReceivables(selectedPendingReceivablesForBulk)}
                        >
                          Gerar PIX selecionados
                        </Button>
                        <Button
                          disabled={!selectedPendingReceivablesForBulk.length}
                          icon={CircleCheck}
                          size="sm"
                          variant="secondary"
                          onClick={() => setPaymentReceivables(selectedPendingReceivablesForBulk)}
                        >
                          Dar baixa selecionados
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="table-wrap compact-table">
                    <table className="client-finance-table">
                      <thead>
                        <tr>
                          <th aria-label="Selecionar" className="finance-select-column"></th>
                          <th>Descrição</th>
                          <th>Referência</th>
                          <th>Vencimento</th>
                          <th className="finance-amount-column">Valor</th>
                          <th className="finance-status-column">Situação</th>
                          <th className="finance-actions-column">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientFinanceItems.map((receivable) => {
                          const checked = selectedReceivableIds.includes(receivable.id);
                          const status = receivableVisualStatus(receivable);
                          const legacyImport = isLegacyImportReceivable(receivable);

                          return (
                            <tr key={receivable.id}>
                              <td className="finance-select-column">
                                <input
                                  aria-label={`Selecionar ${receivable.description}`}
                                  checked={checked}
                                  disabled={legacyImport || receivable.status !== 'PENDENTE'}
                                  type="checkbox"
                                  onChange={(event) => {
                                    toggleClientReceivableSelection(
                                      receivable,
                                      event.target.checked,
                                    );
                                  }}
                                />
                              </td>
                              <td>
                                <strong>{receivable.description}</strong>
                                {receivable.paymentIntents?.length ? (
                                  <span>{receivable.paymentIntents.length} PIX vinculado(s)</span>
                                ) : null}
                              </td>
                              <td>{receivable.clientReference?.reference ?? '-'}</td>
                              <td>{formatDate(receivable.dueDate)}</td>
                              <td className="finance-amount-column">
                                {formatCurrency(receivable.amount)}
                              </td>
                              <td className="finance-status-column">
                                <span
                                  className={`finance-status-pill tone-${receivableStatusTone(
                                    receivable,
                                  )}`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td className="finance-actions-column">
                                {legacyImport ? (
                                  <Button
                                    icon={Eye}
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setViewingLegacyPayment(receivable)}
                                  >
                                    Visualizar
                                  </Button>
                                ) : (
                                  <div className="table-actions">
                                    <IconButton
                                      disabled={
                                        receivable.status !== 'PENDENTE' &&
                                        !receivable.paymentIntents?.length
                                      }
                                      icon={QrCode}
                                      label="Gerar ou ver PIX"
                                      onClick={() => setPixReceivable(receivable)}
                                    />
                                    <ActionMenu
                                      items={[
                                        {
                                          disabled: receivable.status !== 'PENDENTE',
                                          icon: QrCode,
                                          label: 'Gerar PIX',
                                          onSelect: () => setPixReceivable(receivable),
                                        },
                                        {
                                          disabled: receivable.status !== 'PENDENTE',
                                          icon: CircleCheck,
                                          label: 'Dar baixa',
                                          onSelect: () => setPaymentReceivable(receivable),
                                        },
                                        {
                                          disabled: receivable.status !== 'PENDENTE',
                                          icon: XCircle,
                                          label: 'Cancelar',
                                          onSelect: () => setCancelingReceivable(receivable),
                                        },
                                      ]}
                                    />
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {!clientFinanceItems.length ? (
                      <div className="empty-state">
                        {clientFinanceLoading
                          ? 'Carregando financeiro...'
                          : 'Sem contas a receber.'}
                      </div>
                    ) : null}
                    <PaginationControls
                      itemLabel="contas"
                      pagination={clientFinancePagination}
                      onPageChange={setClientFinancePage}
                    />
                  </div>
                  {clientFinanceItems.some((receivable) => receivable.paymentIntents?.length) ? (
                    <div className="pix-intent-list">
                      {clientFinanceItems.flatMap((receivable) =>
                        (receivable.paymentIntents ?? []).map((intent) => (
                          <article className="pix-intent-card" key={intent.id}>
                            <QrCode aria-hidden="true" size={15} />
                            <div>
                              <strong>{formatCurrency(intent.amount)}</strong>
                              <span>
                                {paymentIntentStatusLabel(intent.status)} ·{' '}
                                {paymentProviderDisplay(intent.provider)} · criado em{' '}
                                {formatDateTime(intent.createdAt)}
                                {intent.paidAt ? ` · pago em ${formatDateTime(intent.paidAt)}` : ''}
                              </span>
                            </div>
                          </article>
                        )),
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === 'messages' ? (
                <div className="client-tab-panel billing-client-panel">
                  {clientBillingError ? (
                    <div className="notice danger">{clientBillingError}</div>
                  ) : null}
                  <div className="client-tab-summary">
                    <StatCard label="Agendadas" value={clientBillingSummary?.scheduled ?? 0} />
                    <StatCard
                      label="Enviadas"
                      tone="success"
                      value={clientBillingSummary?.sent ?? 0}
                    />
                    <StatCard
                      label="Falhas"
                      tone="danger"
                      value={clientBillingSummary?.failed ?? 0}
                    />
                    <StatCard
                      label="PIX vinculados"
                      tone="info"
                      value={
                        clientPixSummaryError
                          ? 'Falha'
                          : clientPixSummary && clientPixSummary.clientId === selectedClientId
                            ? clientPixSummary.summary.total
                            : 0
                      }
                    />
                  </div>
                  <div className="toolbar finance-toolbar">
                    <select
                      value={clientBillingReferenceId}
                      onChange={(event) => {
                        setClientBillingReferenceId(event.target.value);
                        setClientBillingPage(1);
                      }}
                    >
                      <option value="">Todas as referências</option>
                      {selectedReferences.map((reference) => (
                        <option key={reference.id} value={reference.id}>
                          {reference.reference}
                        </option>
                      ))}
                    </select>
                    <select
                      value={clientBillingStatus}
                      onChange={(event) => {
                        setClientBillingStatus(
                          event.target.value as MessageDispatch['status'] | '',
                        );
                        setClientBillingPage(1);
                      }}
                    >
                      <option value="">Todos os status</option>
                      <option value="SCHEDULED">Agendadas</option>
                      <option value="PROCESSING">Processando</option>
                      <option value="SENT">Enviadas</option>
                      <option value="FAILED">Falhas</option>
                      <option value="CANCELED">Canceladas</option>
                      <option value="IGNORED">Ignoradas</option>
                    </select>
                    <Button
                      icon={Filter}
                      variant="secondary"
                      onClick={() => {
                        if (clientBillingPage !== 1) {
                          setClientBillingPage(1);
                        } else {
                          void loadClientBillingDispatches();
                        }
                      }}
                    >
                      Aplicar
                    </Button>
                  </div>
                  <div className="table-wrap compact-table">
                    <table className="client-billing-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Referências</th>
                          <th>Valor</th>
                          <th>Tipo</th>
                          <th className="finance-status-column">Status</th>
                          <th className="finance-attempts-column">Tentativas</th>
                          <th className="finance-actions-column">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientBillingDispatches.map((dispatch) => (
                          <tr key={dispatch.id}>
                            <td>{formatDateTime(dispatch.createdAt)}</td>
                            <td>{dispatchReferenceSummaryFromDispatch(dispatch)}</td>
                            <td>{dispatchTotalAmountLabel(dispatch)}</td>
                            <td>{messageOriginLabel(dispatch.origin)}</td>
                            <td className="finance-status-column">
                              <span
                                className={`finance-status-pill tone-${dispatchStatusTone(
                                  dispatch.status,
                                )}`}
                              >
                                {billingStatusLabel(dispatch.status)}
                              </span>
                            </td>
                            <td className="finance-attempts-column">{dispatch.attempts ?? 0}</td>
                            <td className="finance-actions-column">
                              <div className="table-actions">
                                <IconButton
                                  icon={Eye}
                                  label="Abrir detalhe da cobrança"
                                  onClick={() => setSelectedDispatch(dispatch)}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!clientBillingDispatches.length ? (
                      <div className="empty-state">
                        {clientBillingLoading
                          ? 'Carregando cobranças...'
                          : 'Sem mensagens ou cobranças recentes.'}
                      </div>
                    ) : null}
                    <PaginationControls
                      itemLabel="cobranças"
                      pagination={clientBillingPagination}
                      onPageChange={setClientBillingPage}
                    />
                  </div>
                </div>
              ) : null}
            </>
          </section>
        ) : null}
        {clientFormOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className={`modal client-form-modal ${editingClient ? '' : 'client-create-modal'}`}
              aria-labelledby="client-form-title"
            >
              <header className="modal-header modal-header-with-icon">
                <span className="modal-icon" aria-hidden="true">
                  {editingClient ? <Pencil size={15} /> : <UserPlus size={15} />}
                </span>
                <div>
                  <span className="metric-label">
                    {editingClient ? 'Editar cliente' : 'Novo cliente'}
                  </span>
                  <h2 id="client-form-title">
                    {editingClient ? 'Editar cliente' : 'Novo cliente'}
                  </h2>
                  {!editingClient ? (
                    <p>Cadastre um novo cliente e, se desejar, já crie a primeira referência.</p>
                  ) : null}
                </div>
                <IconButton icon={X} label="Fechar cadastro de cliente" onClick={onCloseForm} />
              </header>
              <ClientForm
                client={editingClient ?? undefined}
                onCancel={onCloseForm}
                plans={selectableClientPlans}
                submitLabel={editingClient ? 'Salvar cliente' : 'Salvar cliente'}
                onSubmit={async (payload) => {
                  if (editingClient) {
                    await onUpdate(payload);
                  } else {
                    await onCreate(payload as ClientPayload);
                  }
                }}
              />
            </section>
          </div>
        ) : null}
        {selectedClient && referenceFormOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="modal reference-form-modal" aria-labelledby="reference-form-title">
              <header className="modal-header modal-header-with-icon">
                <span className="modal-icon" aria-hidden="true">
                  <Layers size={15} />
                </span>
                <div>
                  <span className="metric-label">Referência</span>
                  <h2 id="reference-form-title">
                    {editingReference ? 'Editar referência' : 'Nova referência'}
                  </h2>
                  <p>
                    {editingReference
                      ? `Atualize os dados da referência para o cliente ${selectedClient.name}.`
                      : `Crie uma nova referência para o cliente ${selectedClient.name}. Ela ficará aguardando pagamento inicial.`}
                  </p>
                </div>
                <IconButton
                  icon={X}
                  label="Fechar referência"
                  onClick={() => {
                    setReferenceFormOpen(false);
                    setEditingReference(null);
                  }}
                />
              </header>
              <ClientReferenceForm
                plans={plans}
                reference={editingReference}
                onCancel={() => {
                  setReferenceFormOpen(false);
                  setEditingReference(null);
                }}
                onSubmit={async (payload) => {
                  if (editingReference) {
                    await onUpdateReference(editingReference, payload);
                  } else {
                    await onCreateReference(selectedClient, payload);
                  }
                  setReferenceFormOpen(false);
                  setEditingReference(null);
                }}
              />
            </section>
          </div>
        ) : null}
        {referenceStatusModal ? (
          <ReferenceStatusConfirmationModal
            target={referenceStatusModal}
            onClose={() => setReferenceStatusModal(null)}
            onConfirm={(reason) => {
              onReferenceStatusChange(
                referenceStatusModal.reference,
                referenceStatusModal.status,
                reason,
              );
              setReferenceStatusModal(null);
            }}
          />
        ) : null}
        {selectedDispatch ? (
          <DispatchDetailModal
            dispatch={selectedDispatch}
            onClose={() => setSelectedDispatch(null)}
          />
        ) : null}
        {paymentReceivable ? (
          <PayReceivableModal
            categories={clientFinanceCategories}
            receivable={paymentReceivable}
            onClose={() => setPaymentReceivable(null)}
            onConfirm={async (payload) => {
              await payReceivable(paymentReceivable.id, payload);
              setPaymentReceivable(null);
              await refreshClientFinance('Pagamento registrado.');
            }}
          />
        ) : null}
        {paymentReceivables ? (
          <PayReceivablesModal
            categories={clientFinanceCategories}
            receivables={paymentReceivables}
            onClose={() => setPaymentReceivables(null)}
            onConfirm={async (payload) => {
              await payReceivables({
                receivableIds: paymentReceivables.map((receivable) => receivable.id),
                ...payload,
              });
              setPaymentReceivables(null);
              await refreshClientFinance('Pagamento agrupado registrado.');
            }}
          />
        ) : null}
        {pixReceivable ? (
          <PixReceivableModal
            receivable={pixReceivable}
            onClose={() => setPixReceivable(null)}
            onChanged={async (message) => {
              await refreshClientFinance(message);
            }}
          />
        ) : null}
        {pixReceivables ? (
          <PixReceivablesModal
            receivables={pixReceivables}
            onClose={() => setPixReceivables(null)}
            onChanged={async (message) => {
              await refreshClientFinance(message);
            }}
          />
        ) : null}
        {cancelingReceivable ? (
          <CancelReceivableModal
            receivable={cancelingReceivable}
            onClose={() => setCancelingReceivable(null)}
            onConfirm={async (reason) => {
              await cancelReceivable(cancelingReceivable.id, { reason });
              setCancelingReceivable(null);
              await refreshClientFinance('Conta a receber cancelada.');
            }}
          />
        ) : null}
        {viewingLegacyPayment ? (
          <LegacyPaymentDetailModal
            receivable={viewingLegacyPayment}
            onClose={() => setViewingLegacyPayment(null)}
          />
        ) : null}
        {whatsAppClient ? (
          <SendWhatsAppModal
            client={whatsAppClient}
            onClose={() => setWhatsAppClient(null)}
            onSent={async () => {
              await onWhatsAppSent(whatsAppClient.id);
              setWhatsAppClient(null);
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function ReferenceStatusConfirmationModal({
  target,
  onClose,
  onConfirm,
}: {
  target: { reference: ClientReference; status: Extract<ClientStatus, 'INATIVO' | 'CANCELADO'> };
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isCanceling = target.status === 'CANCELADO';
  const actionLabel = isCanceling ? 'cancelar' : 'inativar';
  const title = isCanceling ? 'Cancelar referência' : 'Inativar referência';

  async function submit() {
    if (!reason.trim()) {
      setError('Informe uma justificativa para continuar.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a referência.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal reference-status-modal" aria-labelledby="reference-status-title">
        <header className="modal-header modal-header-with-icon">
          <span className={`modal-icon ${isCanceling ? 'danger' : 'warning'}`} aria-hidden="true">
            {isCanceling ? <XCircle size={15} /> : <Power size={15} />}
          </span>
          <div>
            <span className="metric-label">Referência</span>
            <h2 id="reference-status-title">{title}</h2>
            <p>Confirme a ação e registre a justificativa para {actionLabel} esta referência.</p>
          </div>
          <IconButton icon={X} label="Fechar confirmação" onClick={onClose} />
        </header>
        {error ? <div className="notice danger">{error}</div> : null}
        <dl className="detail-list compact-detail-list">
          <div>
            <dt>Referência</dt>
            <dd>{target.reference.reference}</dd>
          </div>
          <div>
            <dt>Ação</dt>
            <dd>{title}</dd>
          </div>
        </dl>
        <label className="field">
          <span>Justificativa</span>
          <textarea
            autoFocus
            required
            placeholder={`Informe o motivo para ${actionLabel} esta referência`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button disabled={saving} icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !reason.trim()}
              icon={isCanceling ? XCircle : Power}
              loading={saving}
              variant={isCanceling ? 'danger' : 'primary'}
              onClick={() => void submit()}
            >
              {isCanceling ? 'Confirmar cancelamento' : 'Confirmar inativação'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DispatchDetailModal({
  dispatch,
  onClose,
}: {
  dispatch: MessageDispatch;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal dispatch-detail-modal" aria-labelledby="dispatch-detail-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <MessageCircle size={15} />
          </span>
          <div>
            <span className="metric-label">Cobrança/PIX</span>
            <h2 id="dispatch-detail-title">Detalhe da cobrança</h2>
            <p>Dados disponíveis da mensagem de cobrança selecionada.</p>
          </div>
          <IconButton icon={X} label="Fechar detalhe da cobrança" onClick={onClose} />
        </header>
        <dl className="detail-list compact-detail-list">
          <div>
            <dt>Data</dt>
            <dd>{formatDateTime(dispatch.createdAt)}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{dispatch.phone}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{billingStatusLabel(dispatch.status)}</dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{dispatch.attempts ?? 0}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{messageOriginLabel(dispatch.origin)}</dd>
          </div>
          <div>
            <dt>Referências</dt>
            <dd>{dispatchReferenceSummaryFromDispatch(dispatch)}</dd>
          </div>
          <div>
            <dt>Valor total</dt>
            <dd>{dispatchTotalAmountLabel(dispatch)}</dd>
          </div>
        </dl>
        {dispatch.items?.length ? (
          <div className="table-wrap compact-table">
            <table className="client-billing-table">
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>Conta</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {dispatch.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reference}</td>
                    <td>{item.receivableId}</td>
                    <td>{formatCurrency(item.amount)}</td>
                    <td>{formatDate(item.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {dispatch.errorMessage ? (
          <div className="notice danger">
            <strong>Erro</strong>
            <span>{dispatch.errorMessage}</span>
          </div>
        ) : null}
        {(dispatch.renderedContent ?? dispatch.body) ? (
          <div className="notes-box">
            <span className="metric-label">Mensagem</span>
            <p>{dispatch.renderedContent ?? dispatch.body}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SendWhatsAppModal({
  client,
  onClose,
  onSent,
}: {
  client: Client;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [body, setBody] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadConnection() {
      setLoading(true);
      setError('');

      try {
        const nextConnection = await getWhatsAppConnection();
        if (active) setConnection(nextConnection);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar WhatsApp.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadConnection();

    return () => {
      active = false;
    };
  }, []);

  async function handleSend() {
    setError('');
    setNotice('');
    setSending(true);

    try {
      const dispatch = await sendWhatsAppMessage({ clientId: client.id, body, requestId });
      if (dispatch.status === 'SENT') {
        setNotice('Mensagem enviada com sucesso.');
        await onSent();
        return;
      }

      setError(dispatch.errorMessage ?? 'Não foi possível enviar a mensagem.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  const canSend =
    !loading && connection?.status === 'CONNECTED' && body.trim().length > 0 && !sending;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="whatsapp-send-title">
        <header className="modal-header">
          <h2 id="whatsapp-send-title">Enviar WhatsApp</h2>
          <IconButton icon={X} label="Fechar envio de WhatsApp" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Nome</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{client.phoneNormalized}</dd>
          </div>
          <div>
            <dt>Conexao</dt>
            <dd>{loading ? 'Carregando...' : (connection?.name ?? 'Nenhuma conexao')}</dd>
          </div>
        </dl>

        <label className="field">
          <span>Mensagem</span>
          <textarea
            maxLength={2000}
            rows={7}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>

        {connection && connection.status !== 'CONNECTED' ? (
          <div className="notice warning">A conexao WhatsApp não está operacional.</div>
        ) : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!canSend}
              icon={Send}
              loading={sending}
              variant="primary"
              onClick={() => void handleSend()}
            >
              Enviar mensagem
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function BillingView() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [dispatches, setDispatches] = useState<MessageDispatch[]>([]);
  const [selected, setSelected] = useState<MessageDispatch | null>(null);
  const [status, setStatus] = useState<MessageDispatch['status'] | ''>('');
  const [search, setSearch] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginatedClients['pagination'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const filters: Parameters<typeof listBillingDispatches>[0] = {
        status,
        page,
        pageSize: listPageSize,
      };
      const searchTerm = search.trim();

      if (searchTerm) filters.search = searchTerm;
      if (dueDate) filters.dueDate = dueDate;

      const [nextSummary, nextDispatches] = await Promise.all([
        getBillingSummary(),
        listBillingDispatches(filters),
      ]);
      setSummary(nextSummary);
      setDispatches(nextDispatches.items);
      setPagination(nextDispatches.pagination);
      if (
        !nextDispatches.items.length &&
        nextDispatches.pagination.page > 1 &&
        nextDispatches.pagination.total > 0
      ) {
        setPage(Math.max(1, nextDispatches.pagination.totalPages));
      }
      setSelected((current) => {
        if (!current) return null;
        return nextDispatches.items.find((dispatch) => dispatch.id === current.id) ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar cobranças.');
    } finally {
      setLoading(false);
    }
  }, [dueDate, page, search, status]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  async function selectDispatch(dispatch: MessageDispatch) {
    setError('');

    try {
      setSelected(await getBillingDispatch(dispatch.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a cobrança.');
    }
  }

  async function runReconcile() {
    setWorking('reconcile');
    setError('');

    try {
      await reconcileBilling();
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reconciliar cobranças.');
    } finally {
      setWorking('');
    }
  }

  async function runSendNow(dispatch: MessageDispatch) {
    setWorking(dispatch.id);
    setError('');

    try {
      await sendBillingNow(dispatch.id);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível processar a cobrança.');
    } finally {
      setWorking('');
    }
  }

  const billingKpis = [
    {
      icon: CalendarClock,
      label: 'Agendadas',
      tone: 'warning' as const,
      value: summary?.scheduled ?? 0,
    },
    {
      icon: Send,
      label: 'Enviadas',
      tone: 'success' as const,
      value: summary?.sent ?? 0,
    },
    {
      icon: XCircle,
      label: 'Falhas',
      tone: 'danger' as const,
      value: summary?.failed ?? 0,
    },
    {
      icon: Minus,
      label: 'Ignoradas/Canceladas',
      tone: 'info' as const,
      value: summary?.ignoredOrCanceled ?? 0,
    },
  ];

  return (
    <div className="billing-view">
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid billing-kpis">
        {billingKpis.map((item) => (
          <StatCard
            icon={item.icon}
            key={item.label}
            label={item.label}
            tone={item.tone}
            value={loading ? '-' : item.value}
          />
        ))}
      </div>

      <section className="workspace-main billing-workspace">
        <AutomationSectionHeading
          icon={Bell}
          title="Cobranças"
          description="Acompanhe os envios e a situação das cobranças dos clientes."
        />
        <div className="toolbar billing-toolbar">
          <div className="search-row">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Buscar cliente/referência"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as MessageDispatch['status'] | '');
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            <option value="SCHEDULED">Agendadas</option>
            <option value="PROCESSING">Processando</option>
            <option value="SENT">Enviadas</option>
            <option value="FAILED">Falhas</option>
            <option value="CANCELED">Canceladas</option>
            <option value="IGNORED">Ignoradas</option>
          </select>
          <input
            aria-label="Vencimento"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              setPage(1);
            }}
          />
          <button className="secondary-button" type="button" onClick={() => void loadBilling()}>
            <RefreshCcw aria-hidden="true" size={16} />
            Atualizar
          </button>
          <button
            className="primary-button"
            disabled={working === 'reconcile'}
            type="button"
            onClick={() => void runReconcile()}
          >
            <CalendarClock aria-hidden="true" size={16} />
            Reconciliar
          </button>
        </div>

        <div className="table-wrap billing-table-wrap">
          <table className="billing-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Referência/Referências</th>
                <th className="billing-amount-column">Valor</th>
                <th>Vencimento</th>
                <th>Agendado para</th>
                <th>Enviado em</th>
                <th className="finance-status-column">Status</th>
                <th className="finance-attempts-column">Tentativas</th>
                <th className="finance-actions-column">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dispatches.map((dispatch) => (
                <tr
                  className={selected?.id === dispatch.id ? 'selected-row' : ''}
                  key={dispatch.id}
                >
                  <td className="billing-client-column" data-label="Cliente">
                    {dispatch.client?.name ?? 'Cliente não vinculado'}
                  </td>
                  <td data-label="Referência/Referências">
                    {billingDispatchReferenceLabel(dispatch)}
                  </td>
                  <td className="billing-amount-column" data-label="Valor">
                    {billingDispatchAmountLabel(dispatch)}
                  </td>
                  <td data-label="Vencimento">{billingDispatchDueDateLabel(dispatch)}</td>
                  <td className="billing-scheduled-column" data-label="Agendada">
                    {dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}
                  </td>
                  <td className="billing-sent-column" data-label="Enviada">
                    {dispatch.sentAt ? formatDateTime(dispatch.sentAt) : '-'}
                  </td>
                  <td className="finance-status-column" data-label="Status">
                    <span
                      className={`finance-status-pill tone-${billingDispatchStatusTone(
                        dispatch.status,
                      )}`}
                    >
                      {billingStatusLabel(dispatch.status)}
                    </span>
                    <span className="billing-mobile-origin">
                      {messageDispatchOriginLabel(dispatch.origin)}
                      {dispatch.connection ? ` · ${dispatch.connection.name}` : ''}
                    </span>
                  </td>
                  <td className="finance-attempts-column" data-label="Tentativas">
                    {dispatch.attempts ?? 0}/3
                  </td>
                  <td className="finance-actions-column" data-label="Ações">
                    <IconButton
                      icon={Eye}
                      label="Ver detalhes"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void selectDispatch(dispatch);
                      }}
                    />
                    <button
                      className="secondary-button"
                      disabled={
                        working === dispatch.id ||
                        !['SCHEDULED', 'FAILED'].includes(dispatch.status)
                      }
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void runSendNow(dispatch);
                      }}
                    >
                      <Send aria-hidden="true" size={16} />
                      Enviar agora
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!dispatches.length ? (
            <div className="empty-state">
              {loading ? 'Carregando...' : 'Nenhuma cobrança encontrada.'}
            </div>
          ) : null}
          <PaginationControls
            itemLabel="cobranças"
            pagination={pagination}
            onPageChange={setPage}
          />
        </div>
      </section>

      {selected ? (
        <BillingDispatchDetailModal dispatch={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function BillingDispatchDetailModal({
  dispatch,
  onClose,
}: {
  dispatch: MessageDispatch;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal dispatch-detail-modal billing-dispatch-modal"
        aria-labelledby="billing-dispatch-detail-title"
      >
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <MessageSquare size={16} />
          </span>
          <div>
            <h2 id="billing-dispatch-detail-title">Detalhes da cobrança</h2>
            <p>
              {dispatch.client?.name ?? 'Cliente não vinculado'} |{' '}
              {billingStatusLabel(dispatch.status)}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <dl className="detail-list compact-detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{dispatch.client?.name ?? 'Cliente não vinculado'}</dd>
          </div>
          <div>
            <dt>Referência(s)</dt>
            <dd>{billingDispatchReferenceLabel(dispatch)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{billingDispatchAmountLabel(dispatch)}</dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{billingDispatchDueDateLabel(dispatch)}</dd>
          </div>
          <div>
            <dt>Agendado para</dt>
            <dd>{dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}</dd>
          </div>
          <div>
            <dt>Enviado em</dt>
            <dd>{dispatch.sentAt ? formatDateTime(dispatch.sentAt) : '-'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span
                className={`finance-status-pill tone-${billingDispatchStatusTone(dispatch.status)}`}
              >
                {billingStatusLabel(dispatch.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Tentativas</dt>
            <dd>{dispatch.attempts ?? 0}/3</dd>
          </div>
          <div>
            <dt>Erro</dt>
            <dd>{dispatch.errorCode ?? dispatch.errorMessage ?? '-'}</dd>
          </div>
          <div>
            <dt>providerMessageId</dt>
            <dd>{dispatch.providerMessageId ?? '-'}</dd>
          </div>
        </dl>

        {dispatch.items?.length ? (
          <div className="billing-dispatch-items">
            <span className="metric-label">Itens consolidados</span>
            <div className="mini-list">
              {dispatch.items.map((item) => (
                <article key={item.id}>
                  <strong>{item.reference}</strong>
                  <span>
                    {formatCurrency(item.amount)} | {formatDate(item.dueDate)} | {item.status}
                  </span>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {(dispatch.renderedContent ?? dispatch.body) ? (
          <div className="preview-box">
            <span>Mensagem renderizada</span>
            <strong>{dispatch.renderedContent ?? dispatch.body}</strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}

type AutomationTab = 'billing' | 'recovery' | 'monitoring';
type RecoveryTemplateCard = (typeof recoveryTemplateCards)[number];

const automationTabs = [
  { id: 'billing', label: 'Cobrança automática' },
  { id: 'recovery', label: 'Recuperação por inadimplência' },
  { id: 'monitoring', label: 'Monitoramento' },
] satisfies Array<{ id: AutomationTab; label: string }>;

function recoveryAutomationTemplateTitle(card: RecoveryTemplateCard) {
  return card.templateType.replace('RECOVERY_DAY_', 'D+');
}

function shortUuid(value: string | null | undefined) {
  if (!value) return '-';
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function AutomationsView({
  onOpenBillingSettings,
}: {
  onOpenBillingSettings: (tab?: SettingsBillingTab) => void;
}) {
  const [automationTab, setAutomationTab] = useState<AutomationTab>('billing');
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingAutomationSettings | null>(null);
  const [recoverySettings, setRecoverySettings] = useState<RecoveryAutomationSettings | null>(null);
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary | null>(null);
  const [campaigns, setCampaigns] = useState<RecoveryCampaign[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedAutomationDispatch, setSelectedAutomationDispatch] =
    useState<MessageDispatch | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<RecoveryCampaign | null>(null);
  const [campaignPagination, setCampaignPagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [status, setStatus] = useState<RecoveryCampaignStatus | ''>('ATIVA');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const billingTemplates = billingMessageTemplates(templates);
  const recoveryTemplates = recoveryMessageTemplates(templates);
  const activeBillingTemplates = billingTemplates.filter((template) => template.active).length;
  const activeRecoveryTemplates = recoveryTemplates.filter((template) => template.active).length;

  const loadAutomations = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        nextBilling,
        nextBillingSettings,
        nextRecoverySettings,
        nextRecovery,
        nextCampaigns,
        nextTemplates,
      ] = await Promise.all([
        getBillingSummary(),
        getBillingAutomationSettings(),
        getRecoveryAutomationSettings(),
        getRecoverySummary(),
        listRecoveryCampaigns({
          ...(status ? { status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          page,
          pageSize: 20,
        }),
        listMessageTemplates(),
      ]);
      setBillingSummary(nextBilling);
      setBillingSettings(nextBillingSettings);
      setRecoverySettings(nextRecoverySettings);
      setRecoverySummary(nextRecovery);
      setCampaigns(nextCampaigns.items);
      setTemplates(nextTemplates);
      setCampaignPagination(nextCampaigns.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar automações.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  async function runRecoveryReconcile() {
    setWorking('reconcile');
    setError('');

    try {
      await reconcileRecovery();
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reconciliar recuperação.');
    } finally {
      setWorking('');
    }
  }

  async function runBillingReceivablesReconcile() {
    setWorking('billing-receivables');
    setError('');

    try {
      await reconcileBillingReceivables();
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reconciliar ciclos.');
    } finally {
      setWorking('');
    }
  }

  async function runGenerateCycleReceivable(clientReferenceId: string) {
    setWorking(`cycle-${clientReferenceId}`);
    setError('');

    try {
      const preview = await previewCurrentCycleReceivable(clientReferenceId);

      if (!preview.allowed || !preview.preview) {
        throw new Error(preview.status.reason);
      }

      const confirmed = window.confirm(
        [
          'Gerar conta a receber do ciclo?',
          `Referência: ${preview.preview.reference}`,
          `Valor: ${formatCurrency(preview.preview.amount)}`,
          `Vencimento: ${formatDate(preview.preview.dueDate)}`,
          `Purpose: ${preview.preview.purpose}`,
        ].join('\n'),
      );

      if (!confirmed) {
        return;
      }

      await generateCurrentCycleReceivable(clientReferenceId);
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar conta a receber.');
    } finally {
      setWorking('');
    }
  }

  async function runCancelCampaign(campaign: RecoveryCampaign) {
    setWorking(campaign.id);
    setError('');

    try {
      await cancelRecoveryCampaign(campaign.id);
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar campanha.');
    } finally {
      setWorking('');
    }
  }

  return (
    <div className="automations-view">
      <section className="workspace-main automations-workspace">
        {error ? <div className="notice danger">{error}</div> : null}
        <AutomationSectionHeading
          icon={Workflow}
          title="Automações"
          description="Rotinas operacionais e recuperação"
        />
        <div className="metric-grid billing-kpis">
          <StatCard
            icon={Bot}
            label="Cobrança automática"
            tone={billingSettings?.enabled ? 'success' : 'info'}
            value={billingSettings?.enabled ? 'Ativada' : 'Desativada'}
          />
          <StatCard
            icon={CalendarClock}
            label="Agendadas hoje"
            tone="warning"
            value={billingSummary?.scheduledToday ?? 0}
          />
          <StatCard
            icon={Activity}
            label="Campanhas ativas"
            tone="info"
            value={recoverySummary?.active ?? 0}
          />
          <StatCard
            icon={XCircle}
            label="Pendências"
            tone={(recoverySummary?.failed ?? 0) > 0 ? 'danger' : 'success'}
            value={recoverySummary?.failed ?? 0}
          />
        </div>

        <div className="tabs automation-tabs" role="tablist" aria-label="Automações">
          {automationTabs.map((tab) => (
            <button
              aria-selected={automationTab === tab.id}
              className={automationTab === tab.id ? 'active' : ''}
              key={tab.id}
              role="tab"
              type="button"
              onClick={() => setAutomationTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {automationTab === 'billing' ? (
          <div className="automation-tab-panel" role="tabpanel">
            <section className="settings-card automation-section automation-billing-section">
              <AutomationSectionHeading
                action={
                  <Button
                    icon={Settings}
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenBillingSettings('rules')}
                  >
                    Configurar automação
                  </Button>
                }
                icon={Send}
                title="Cobrança automática"
                description="Acompanhe a operação da rotina de envio de lembretes de cobrança."
              />
              <span
                className={`finance-status-pill tone-${
                  billingSettings?.enabled ? 'success' : 'muted'
                }`}
              >
                {billingSettings?.enabled ? 'Ativada' : 'Desativada'}
              </span>
              <div className="automation-billing-operation-grid">
                <article>
                  <strong>{billingSummary?.scheduled ?? 0}</strong>
                  <span>Envios agendados</span>
                </article>
                <article>
                  <strong>{billingSummary?.sentToday ?? 0}</strong>
                  <span>Enviadas hoje</span>
                </article>
                <article>
                  <strong>{billingSummary?.failedToday ?? 0}</strong>
                  <span>Falhas hoje</span>
                </article>
                <article>
                  <strong>1 comunicação</strong>
                  <span>por execução automática</span>
                </article>
              </div>
              <div className="settings-billing-note">
                <Info aria-hidden="true" size={16} />
                <span>Os envios dependem de uma conexão WhatsApp operacional.</span>
              </div>
            </section>

            <section className="settings-card automation-section automation-message-section">
              <AutomationSectionHeading
                action={
                  <Button
                    icon={ArrowRight}
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenBillingSettings('templates')}
                  >
                    Gerenciar templates
                  </Button>
                }
                icon={MessageSquareText}
                title="Templates de mensagens"
                description="Resumo operacional dos templates usados pela cobrança automática."
              />
              <div
                className="automation-template-summary"
                aria-label="Resumo dos templates de cobrança"
              >
                <article>
                  <strong>{billingTemplates.length}</strong>
                  <span>templates de cobrança</span>
                </article>
                <article>
                  <strong>{activeBillingTemplates}</strong>
                  <span>ativos</span>
                </article>
                <article>
                  <strong>{billingTemplates.length - activeBillingTemplates}</strong>
                  <span>inativos</span>
                </article>
              </div>
            </section>

            <section className="settings-card automation-section">
              <AutomationSectionHeading
                icon={CalendarClock}
                iconTone="info"
                title="Próximos envios"
                description="Comunicações programadas da cobrança automática."
              />
              <div className="table-wrap automation-schedule-wrap">
                <table className="billing-table automation-schedule-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Referência(s)</th>
                      <th>Vencimento</th>
                      <th>Aviso</th>
                      <th>Agendado para</th>
                      <th className="finance-status-column">Status</th>
                      <th className="finance-actions-column">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(billingSummary?.next ?? []).map((dispatch) => (
                      <tr key={dispatch.id}>
                        <td data-label="Cliente">{dispatch.client?.name ?? '-'}</td>
                        <td data-label="Referência">{billingDispatchReferenceLabel(dispatch)}</td>
                        <td data-label="Vencimento">{billingDispatchDueDateLabel(dispatch)}</td>
                        <td data-label="Aviso">
                          {dispatch.idempotencyKey?.startsWith('billing-group')
                            ? '-'
                            : `${dispatch.idempotencyKey?.split(':').at(4) ?? '-'} dias`}
                        </td>
                        <td data-label="Agendado para">
                          {dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}
                        </td>
                        <td className="finance-status-column" data-label="Status">
                          <span
                            className={`finance-status-pill tone-${billingDispatchStatusTone(
                              dispatch.status,
                            )}`}
                          >
                            {billingStatusLabel(dispatch.status)}
                          </span>
                        </td>
                        <td className="finance-actions-column" data-label="Ações">
                          <IconButton
                            icon={Eye}
                            label="Ver detalhes"
                            size="sm"
                            onClick={() => setSelectedAutomationDispatch(dispatch)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!(billingSummary?.next ?? []).length ? (
                  <div className="empty-state">
                    {loading ? 'Carregando...' : 'Nenhum envio futuro encontrado.'}
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {automationTab === 'recovery' ? (
          <div className="automation-tab-panel" role="tabpanel">
            <section className="settings-card automation-section recovery-section">
              <AutomationSectionHeading
                action={
                  <Button
                    icon={Settings}
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenBillingSettings('rules')}
                  >
                    Configurar recuperação
                  </Button>
                }
                icon={Activity}
                title="Recuperação por inadimplência"
                description="Acompanhamento automático de contas vencidas."
              />
              <span
                className={`finance-status-pill tone-${
                  recoverySettings?.enabled ? 'success' : 'muted'
                }`}
              >
                {recoverySettings?.enabled
                  ? 'Envios automáticos ativos'
                  : 'Envios automáticos pausados'}
              </span>
              <div className="automation-config-grid">
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Clock} />
                  <div>
                    <span>Horário de recuperação</span>
                    <strong>{recoverySettings?.sendTime ?? '09:00'}</strong>
                  </div>
                </article>
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Timer} />
                  <div>
                    <span>Intervalo entre mensagens</span>
                    <strong>{recoverySettings?.sendIntervalSeconds ?? 8} segundos</strong>
                  </div>
                </article>
                <article className="automation-config-card readonly">
                  <AutomationConfigIcon icon={Globe2} />
                  <div>
                    <span>Timezone</span>
                    <strong>America/Sao_Paulo</strong>
                  </div>
                </article>
              </div>
            </section>

            <section className="settings-card automation-section recovery-steps-section">
              <AutomationSectionHeading
                action={
                  <Button
                    icon={Settings}
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenBillingSettings('rules')}
                  >
                    Configurar em Settings
                  </Button>
                }
                icon={Layers}
                title="Etapas de comunicação"
                description="Configuração dos lembretes por tempo de atraso."
              />
              <div className="recovery-steps-timeline">
                {(recoverySettings?.steps ?? []).map((step) => (
                  <article className={step.enabled ? 'enabled' : 'disabled'} key={step.stepNumber}>
                    <div className="recovery-step-marker">D+{step.offsetDays}</div>
                    <div className="recovery-step-body">
                      <strong>Etapa {step.stepNumber}</strong>
                      <span>{messageTemplateTypeLabel(step.templateType)}</span>
                      <small>{step.enabled ? 'Ativa' : 'Inativa'}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="settings-card automation-section template-panel">
              <AutomationSectionHeading
                action={
                  <Button
                    icon={ArrowRight}
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenBillingSettings('templates')}
                  >
                    Gerenciar templates
                  </Button>
                }
                icon={MessageSquareText}
                title="Templates de recuperação"
                description="Resumo operacional dos templates usados nas etapas de recuperação."
              />
              <div
                className="automation-template-summary"
                aria-label="Resumo dos templates de recuperação"
              >
                <article>
                  <strong>{recoveryTemplates.length}</strong>
                  <span>templates de recuperação</span>
                </article>
                <article>
                  <strong>{activeRecoveryTemplates}</strong>
                  <span>ativos</span>
                </article>
                <article>
                  <strong>
                    {recoveryTemplateCards.map(recoveryAutomationTemplateTitle).join(', ')}
                  </strong>
                  <span>etapas operacionais</span>
                </article>
              </div>
            </section>
          </div>
        ) : null}

        {automationTab === 'monitoring' ? (
          <div className="automation-tab-panel" role="tabpanel">
            <section className="settings-card automation-section">
              <AutomationSectionHeading
                action={
                  <Button
                    disabled={working === 'billing-receivables'}
                    icon={RefreshCcw}
                    size="sm"
                    variant="secondary"
                    onClick={() => void runBillingReceivablesReconcile()}
                  >
                    Verificar ciclos
                  </Button>
                }
                icon={CircleAlert}
                title="Pendências operacionais"
                description="Ciclos financeiros que exigem conferência antes da automação."
              />
              <div className="table-wrap compact-table automation-issues-wrap">
                <table className="automation-issues-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Referência</th>
                      <th>Plano</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Motivo</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(billingSummary?.cycleIssues ?? []).map((issue) => (
                      <tr key={issue.clientReferenceId}>
                        <td data-label="Cliente">{issue.clientName}</td>
                        <td data-label="Referência">{issue.reference}</td>
                        <td data-label="Plano">{issue.planName}</td>
                        <td data-label="Valor">{formatCurrency(issue.amount)}</td>
                        <td data-label="Vencimento">{formatDate(issue.dueDate)}</td>
                        <td data-label="Motivo">{issue.reason}</td>
                        <td data-label="Ações">
                          <button
                            className="secondary-button"
                            disabled={
                              issue.code !== 'MISSING_RECEIVABLE' ||
                              working === `cycle-${issue.clientReferenceId}`
                            }
                            type="button"
                            onClick={() => void runGenerateCycleReceivable(issue.clientReferenceId)}
                          >
                            <Plus aria-hidden="true" size={16} />
                            Gerar conta
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!(billingSummary?.cycleIssues ?? []).length ? (
                  <div className="empty-state">
                    {loading ? 'Carregando...' : 'Nenhuma pendência de ciclo financeiro.'}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="settings-card automation-section recovery-campaigns-section">
              <AutomationSectionHeading
                icon={Activity}
                title="Campanhas de recuperação"
                description="Acompanhe campanhas e etapas de inadimplência em andamento."
              />
              <div className="toolbar recovery-toolbar">
                <div className="search-row">
                  <Search aria-hidden="true" size={18} />
                  <input
                    placeholder="Buscar cliente ou referência"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as RecoveryCampaignStatus | '');
                    setPage(1);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="ATIVA">Ativas</option>
                  <option value="CONCLUIDA">Concluídas</option>
                  <option value="CANCELADA">Canceladas</option>
                </select>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadAutomations()}
                >
                  <RefreshCcw aria-hidden="true" size={16} />
                  Atualizar
                </button>
                <button
                  className="primary-button"
                  disabled={working === 'reconcile'}
                  type="button"
                  onClick={() => void runRecoveryReconcile()}
                >
                  <CalendarClock aria-hidden="true" size={16} />
                  Reconciliar
                </button>
              </div>

              <div className="table-wrap recovery-campaign-wrap">
                <table className="recovery-campaign-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Referência</th>
                      <th>Receivable</th>
                      <th>Vencimento</th>
                      <th>Atraso</th>
                      <th className="finance-status-column">Status</th>
                      <th>Etapa atual/próxima</th>
                      <th>Próxima data</th>
                      <th>Início</th>
                      <th className="finance-actions-column">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign) => {
                      const receivableId = campaign.receivable?.id ?? campaign.receivableId;
                      const nextStep =
                        campaign.steps.find((step) =>
                          ['SCHEDULED', 'FAILED'].includes(step.status),
                        ) ?? campaign.steps.at(-1);
                      return (
                        <tr key={campaign.id}>
                          <td data-label="Cliente">
                            <strong>{campaign.client?.name ?? 'Cliente'}</strong>
                            <span>{campaign.client?.reference ?? campaign.clientId}</span>
                          </td>
                          <td data-label="Referência">
                            {campaign.clientReference?.reference ??
                              campaign.client?.reference ??
                              '-'}
                          </td>
                          <td data-label="Receivable">
                            <span className="technical-id" title={receivableId ?? undefined}>
                              {shortUuid(receivableId)}
                            </span>
                          </td>
                          <td data-label="Vencimento">
                            {campaign.receivable ? formatDate(campaign.receivable.dueDate) : '-'}
                          </td>
                          <td data-label="Atraso">
                            {campaign.receivable ? `${campaign.receivable.daysOverdue} dias` : '-'}
                          </td>
                          <td className="finance-status-column" data-label="Status">
                            <span
                              className={`finance-status-pill tone-${recoveryCampaignStatusTone(
                                campaign.status,
                              )}`}
                            >
                              {recoveryCampaignStatusLabel(campaign.status)}
                            </span>
                          </td>
                          <td data-label="Etapa atual/próxima">
                            {nextStep ? `D+${nextStep.delayDays}` : '-'}
                          </td>
                          <td data-label="Próxima data">
                            {nextStep ? formatDateTime(nextStep.scheduledFor) : '-'}
                          </td>
                          <td data-label="Início">{formatDateTime(campaign.startedAt)}</td>
                          <td className="finance-actions-column" data-label="Ações">
                            <IconButton
                              icon={Eye}
                              label="Ver etapas"
                              size="sm"
                              onClick={() => setSelectedCampaign(campaign)}
                            />
                            <ActionMenu
                              items={[
                                {
                                  danger: true,
                                  disabled: campaign.status !== 'ATIVA' || working === campaign.id,
                                  icon: X,
                                  label: 'Cancelar campanha',
                                  onSelect: () => void runCancelCampaign(campaign),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!campaigns.length ? (
                  <div className="empty-state">
                    {loading ? 'Carregando...' : 'Nenhuma campanha encontrada.'}
                  </div>
                ) : null}
                <PaginationControls pagination={campaignPagination} onPageChange={setPage} />
              </div>
            </section>
          </div>
        ) : null}
      </section>

      {selectedAutomationDispatch ? (
        <BillingDispatchDetailModal
          dispatch={selectedAutomationDispatch}
          onClose={() => setSelectedAutomationDispatch(null)}
        />
      ) : null}
      {selectedCampaign ? (
        <RecoveryCampaignDetailModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
        />
      ) : null}
    </div>
  );
}

function RecoveryCampaignDetailModal({
  campaign,
  onClose,
}: {
  campaign: RecoveryCampaign;
  onClose: () => void;
}) {
  const nextStep =
    campaign.steps.find((step) => ['SCHEDULED', 'FAILED'].includes(step.status)) ??
    campaign.steps.at(-1);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal recovery-campaign-modal"
        aria-labelledby="recovery-campaign-detail-title"
      >
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon warning" aria-hidden="true">
            <Activity size={16} />
          </span>
          <div>
            <h2 id="recovery-campaign-detail-title">Detalhes da campanha</h2>
            <p>
              {campaign.client?.name ?? 'Cliente'} | {recoveryCampaignStatusLabel(campaign.status)}
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <dl className="detail-list compact-detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{campaign.client?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{campaign.clientReference?.reference ?? campaign.client?.reference ?? '-'}</dd>
          </div>
          <div>
            <dt>Receivable</dt>
            <dd>
              <span
                className="technical-id"
                title={campaign.receivable?.id ?? campaign.receivableId}
              >
                {shortUuid(campaign.receivable?.id ?? campaign.receivableId)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{campaign.receivable ? formatDate(campaign.receivable.dueDate) : '-'}</dd>
          </div>
          <div>
            <dt>Atraso</dt>
            <dd>{campaign.receivable ? `${campaign.receivable.daysOverdue} dias` : '-'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span
                className={`finance-status-pill tone-${recoveryCampaignStatusTone(
                  campaign.status,
                )}`}
              >
                {recoveryCampaignStatusLabel(campaign.status)}
              </span>
            </dd>
          </div>
          <div>
            <dt>Início</dt>
            <dd>{formatDateTime(campaign.startedAt)}</dd>
          </div>
          <div>
            <dt>Etapa atual/próxima</dt>
            <dd>{nextStep ? `D+${nextStep.delayDays}` : '-'}</dd>
          </div>
          <div>
            <dt>Próxima data</dt>
            <dd>{nextStep ? formatDateTime(nextStep.scheduledFor) : '-'}</dd>
          </div>
        </dl>

        <AutomationSectionHeading
          icon={Activity}
          title="Etapas da campanha"
          description="Status operacional de cada lembrete da recuperação."
        />
        <div className="recovery-campaign-steps">
          {campaign.steps.map((step) => (
            <article key={step.id}>
              <span className="recovery-step-marker">D+{step.delayDays}</span>
              <div>
                <strong>
                  Etapa {step.stepNumber} | {recoveryStepStatusLabel(step.status)}
                </strong>
                <span>{step.template?.name ?? 'Template não cadastrado'}</span>
                <small>
                  Agendada para {formatDateTime(step.scheduledFor)}
                  {step.sentAt ? ` | enviada em ${formatDateTime(step.sentAt)}` : ''}
                </small>
              </div>
              <span className={`finance-status-pill tone-${recoveryStepStatusTone(step.status)}`}>
                {recoveryStepStatusLabel(step.status)}
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function WhatsAppView() {
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [messages, setMessages] = useState<MessageDispatch[]>([]);
  const [health, setHealth] = useState<WhatsAppProviderHealth | null>(null);
  const [connectionName, setConnectionName] = useState('CRM Principal');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [qrStatus, setQrStatus] = useState<string>(whatsappQrStatus.preparing);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeModal, setActiveModal] = useState<
    'webhook' | 'diagnostic' | 'logout-confirm' | null
  >(null);
  const [webhookInfo, setWebhookInfo] = useState<unknown>(null);
  const pollerRef = useRef<WhatsAppQrPoller | null>(null);
  const workingRef = useRef('');

  function setWorkingState(action: string) {
    workingRef.current = action;
    setWorking(action);
  }

  const loadWhatsApp = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [nextConnection, nextMessages, nextHealth] = await Promise.all([
        getWhatsAppConnection(),
        listWhatsAppMessages(),
        getWhatsAppProviderHealth(),
      ]);
      setConnection(nextConnection);
      setMessages(nextMessages);
      setHealth(nextHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshWhatsAppPanel = useCallback(async () => {
    if (!canStartWhatsAppAction(workingRef.current)) return;

    setWorkingState('refresh');
    setError('');
    setNotice('');

    try {
      const [nextConnection, nextMessages, nextHealth] = await Promise.all([
        connection ? refreshWhatsAppStatus() : getWhatsAppConnection(),
        listWhatsAppMessages(),
        getWhatsAppProviderHealth(),
      ]);
      setConnection(nextConnection);
      setMessages(nextMessages);
      setHealth(nextHealth);

      setNotice('Painel WhatsApp atualizado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar WhatsApp.');
    } finally {
      setWorkingState('');
    }
  }, [connection]);

  useEffect(() => {
    void loadWhatsApp();
  }, [loadWhatsApp]);

  useEffect(() => {
    return () => stopQrPolling();
  }, []);

  useEffect(() => {
    if (!activeModal) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveModal(null);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  function stopQrPolling() {
    pollerRef.current?.stop();
    pollerRef.current = null;
  }

  async function closeQrModal(syncStatus = true) {
    stopQrPolling();

    if (syncStatus) {
      try {
        await syncWhatsAppConnectionStatus({
          refreshStatus: refreshWhatsAppStatus,
          onConnection: setConnection,
          onConnected: (nextConnection) => {
            setConnection(nextConnection);
            setNotice(whatsappQrStatus.connected);
            void loadMessagesOnly();
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível atualizar WhatsApp.');
      }
    }

    setQrOpen(false);
    setQrCode('');
  }

  function startQrPolling() {
    stopQrPolling();

    const poller = createWhatsAppQrPoller({
      refreshStatus: refreshWhatsAppStatus,
      fetchQrCode: async () => {
        const payload = await getWhatsAppQrCode();
        return payload.qrCode;
      },
      onConnection: setConnection,
      onQrCode: setQrCode,
      onStatus: setQrStatus,
      onConnected: (nextConnection) => {
        setConnection(nextConnection);
        setNotice(whatsappQrStatus.connected);
        void loadMessagesOnly();
        window.setTimeout(() => {
          setQrOpen(false);
          setQrCode('');
        }, 900);
      },
      onError: setError,
    });

    pollerRef.current = poller;
    poller.start();
  }

  async function runAction(
    action: string,
    operation: () => Promise<WhatsAppConnection>,
    successMessage?: string,
  ) {
    if (!canStartWhatsAppAction(workingRef.current)) return false;

    setWorkingState(action);
    setError('');
    setNotice('');

    try {
      const nextConnection = await operation();
      setConnection(nextConnection);
      if (successMessage) setNotice(successMessage);
      await loadMessagesOnly();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a operação.');
      return false;
    } finally {
      setWorkingState('');
    }
  }

  async function handleDisconnect() {
    if (!canStartWhatsAppAction(workingRef.current)) return;

    const confirmed = window.confirm(
      'Deseja desconectar temporariamente este WhatsApp? A configuração será preservada.',
    );

    if (!confirmed) return;

    await runAction('disconnect', disconnectWhatsApp, 'WhatsApp desconectado.');
  }

  async function openWebhookModal() {
    if (!canStartWhatsAppAction(workingRef.current)) return;

    setActiveModal('webhook');
    setWebhookInfo(null);
    setWorkingState('webhook-info');
    setError('');
    setNotice('');

    try {
      setWebhookInfo(await getWhatsAppWebhook());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar webhook.');
    } finally {
      setWorkingState('');
    }
  }

  async function configureWebhookFromModal() {
    const success = await runAction('webhook', configureWhatsAppWebhook, 'Webhook configurado.');
    if (success) setActiveModal(null);
  }

  async function handleManualStatusRefresh() {
    await runAction('manual-status', refreshWhatsAppStatus, 'Status do WhatsApp atualizado.');
  }

  function openDiagnosticModal() {
    setActiveModal('diagnostic');
  }

  function openLogoutConfirmation() {
    setActiveModal('logout-confirm');
  }

  async function confirmLogout() {
    const success = await runAction('logout', logoutWhatsApp, 'WhatsApp deslogado.');
    if (success) setActiveModal(null);
  }

  async function loadMessagesOnly() {
    const nextMessages = await listWhatsAppMessages();
    setMessages(nextMessages);
  }

  async function handleConnectFlow() {
    if (!canStartWhatsAppAction(workingRef.current)) return;

    setWorkingState('connectFlow');
    setError('');
    setNotice('');
    setQrStatus(whatsappQrStatus.preparing);

    try {
      const result = await startWhatsAppConnectionFlow({
        currentConnection: connection,
        connectionName,
        createConnection: createWhatsAppConnection,
        connect: connectWhatsApp,
        getQrCode: getWhatsAppQrCode,
        onConnection: setConnection,
        onQrCode: setQrCode,
        onStatus: setQrStatus,
      });

      if (!result.qrOpened) {
        setNotice(whatsappQrStatus.connected);
        await loadMessagesOnly();
        return;
      }

      setQrOpen(true);
      startQrPolling();
    } catch (err) {
      void closeQrModal(false);
      setError(err instanceof Error ? err.message : 'Não foi possível conectar WhatsApp.');
    } finally {
      setWorkingState('');
    }
  }

  const connected = connection?.status === 'CONNECTED';
  const remoteInstanceMissing = connection?.status === 'ERROR';
  const connectActionLabel = remoteInstanceMissing
    ? 'Criar nova conexão'
    : connection
      ? 'Reconectar WhatsApp'
      : 'Conectar WhatsApp';
  const isConnectingFlow = working === 'connectFlow';
  const hasWorkingAction = Boolean(working);
  const displayPhone = normalizeWhatsAppDisplayPhone(connection?.phone) ?? '-';
  const webhookUrl = extractWebhookUrl(webhookInfo);
  const connectionStatus = getWhatsAppConnectionStatusPresentation(connection, loading);
  const healthLabel = health?.online
    ? `Online${health.version ? ` | v${health.version}` : ''}`
    : 'Indisponível';

  return (
    <>
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="notice success" role="status">
          {notice}
        </div>
      ) : null}
      <div className="whatsapp-grid">
        <section className="panel whatsapp-panel">
          <div className="panel-header whatsapp-panel-header">
            <div className="whatsapp-title">
              <span className="whatsapp-title-icon">
                <MessageCircle aria-hidden="true" size={18} />
              </span>
              <div>
                <h2>Conexão WhatsApp</h2>
                <p>Status da integração com a API Kirago</p>
              </div>
            </div>
            <Button
              icon={RefreshCcw}
              loading={working === 'refresh'}
              size="sm"
              variant="secondary"
              disabled={hasWorkingAction}
              onClick={() => void refreshWhatsAppPanel()}
            >
              Atualizar
            </Button>
          </div>

          <div className={`provider-health ${health?.online ? 'online' : 'offline'}`}>
            <ShieldCheck aria-hidden="true" size={16} />
            <span>API Kirago: {healthLabel}</span>
          </div>

          {!connection ? (
            <div className="empty-card">
              <MessageCircle aria-hidden="true" size={28} />
              <strong>Nenhuma conexão WhatsApp configurada.</strong>
              <span>Integre o CRM ao WhatsApp em um único passo.</span>
              <label className="field compact-field">
                <span>Nome da conexão</span>
                <input
                  placeholder="CRM Principal"
                  value={connectionName}
                  onChange={(event) => setConnectionName(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                aria-busy={isConnectingFlow}
                disabled={hasWorkingAction}
                type="button"
                onClick={() => void handleConnectFlow()}
              >
                <MessageCircle aria-hidden="true" size={16} />
                {isConnectingFlow ? 'Preparando...' : 'Conectar WhatsApp'}
              </button>
            </div>
          ) : (
            <>
              <div className={`connection-status ${connectionStatus.tone}`}>
                {connectionStatus.icon === 'connected' ? (
                  <Wifi aria-hidden="true" size={18} />
                ) : connectionStatus.icon === 'loading' ? (
                  <RefreshCw aria-hidden="true" size={18} />
                ) : (
                  <WifiOff aria-hidden="true" size={18} />
                )}
                <strong>{connectionStatus.title}</strong>
                <span>{connectionStatus.badge}</span>
              </div>

              <dl className="detail-list whatsapp-connection-details">
                <div>
                  <dt>Conexão</dt>
                  <dd>{connection.name}</dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{connection.provider}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{displayPhone}</dd>
                </div>
                <div>
                  <dt>Ultima verificação</dt>
                  <dd>
                    {connection.lastStatusAt
                      ? new Date(connection.lastStatusAt).toLocaleString('pt-BR')
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Webhook</dt>
                  <dd>{connection.webhookConfigured ? 'Configurado' : 'Pendente'}</dd>
                </div>
              </dl>

              <div className="whatsapp-operational-note">
                <Info aria-hidden="true" size={16} />
                <span>
                  O WhatsApp é utilizado para o envio de cobranças, lembretes e comunicações
                  automáticas do sistema.
                </span>
              </div>

              <div className="button-row wrap whatsapp-actions-row">
                {connected ? null : (
                  <Button
                    icon={Power}
                    loading={isConnectingFlow}
                    variant="primary"
                    disabled={hasWorkingAction}
                    onClick={() => void handleConnectFlow()}
                  >
                    {connectActionLabel}
                  </Button>
                )}
                <Button
                  icon={RefreshCcw}
                  loading={working === 'manual-status'}
                  variant="secondary"
                  disabled={hasWorkingAction}
                  onClick={() =>
                    void runAction('manual-status', refreshWhatsAppStatus, 'Status atualizado.')
                  }
                >
                  Atualizar conexão
                </Button>
                {connected ? (
                  <Button
                    icon={Power}
                    loading={working === 'disconnect'}
                    variant="secondary"
                    disabled={hasWorkingAction}
                    onClick={() => void handleDisconnect()}
                  >
                    Desconectar
                  </Button>
                ) : null}
                <ActionMenu
                  label="Mais ações"
                  items={[
                    {
                      disabled: hasWorkingAction,
                      icon: Workflow,
                      label:
                        working === 'webhook-info' ? 'Carregando webhook...' : 'Configurar webhook',
                      onSelect: () => void openWebhookModal(),
                    },
                    {
                      disabled: hasWorkingAction,
                      icon: RefreshCw,
                      label:
                        working === 'manual-status'
                          ? 'Atualizando status...'
                          : 'Atualizar status manualmente',
                      onSelect: () => void handleManualStatusRefresh(),
                    },
                    {
                      disabled: hasWorkingAction,
                      icon: Activity,
                      label: 'Visualizar diagnóstico',
                      onSelect: openDiagnosticModal,
                    },
                    {
                      danger: true,
                      disabled: hasWorkingAction,
                      icon: Power,
                      label: 'Deslogar WhatsApp',
                      onSelect: openLogoutConfirmation,
                    },
                  ]}
                />
              </div>
            </>
          )}

          {loading ? (
            <div className="empty-state whatsapp-loading">Carregando WhatsApp...</div>
          ) : null}
        </section>

        <section className="panel whatsapp-panel">
          <div className="panel-header whatsapp-panel-header">
            <div className="whatsapp-title">
              <span className="whatsapp-title-icon secondary">
                <Send aria-hidden="true" size={18} />
              </span>
              <div>
                <h2>Últimos envios</h2>
                <p>Mensagens operacionais enviadas pelo sistema</p>
              </div>
            </div>
          </div>
          <div className="message-history">
            {messages.map((message) => (
              <article key={message.id}>
                <div className="message-history-header">
                  <div>
                    <strong>{message.client?.name ?? 'Cliente não vinculado'}</strong>
                    <span>{normalizeWhatsAppDisplayPhone(message.phone) ?? message.phone}</span>
                  </div>
                  <span className={`dispatch-status ${dispatchStatusTone(message.status)}`}>
                    {messageDispatchStatusLabel(message.status)}
                  </span>
                </div>
                <p className="message-preview">{message.renderedContent ?? message.body}</p>
                <footer>
                  <span>{messageDispatchOriginLabel(message.origin)}</span>
                  <span>{new Date(message.createdAt).toLocaleString('pt-BR')}</span>
                </footer>
              </article>
            ))}
            {!messages.length ? (
              <div className="empty-state whatsapp-empty-state">
                <strong>Nenhum envio recente.</strong>
                <span>Os envios realizados pelo sistema aparecerão aqui.</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {qrOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal qr-modal" aria-labelledby="qr-title">
            <header className="modal-header">
              <h2 id="qr-title">Conectar WhatsApp</h2>
              <button className="icon-button" type="button" onClick={() => void closeQrModal()}>
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <p>
              Abra o WhatsApp no celular &rarr; Aparelhos conectados &rarr; Conectar aparelho &rarr;
              escaneie o QR Code.
            </p>
            {/* QR Code vem como Data URI temporario da Kirago; next/image não otimiza esse caso. */}
            <div className="qr-frame">
              {qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="QR Code do WhatsApp" className="qr-image" src={qrCode} />
              ) : (
                <div className="qr-placeholder">Preparando...</div>
              )}
            </div>
            <div className="qr-status" aria-live="polite">
              {qrStatus}
            </div>
          </section>
        </div>
      ) : null}

      {activeModal === 'webhook' ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveModal(null);
          }}
        >
          <section className="modal" aria-labelledby="whatsapp-webhook-title">
            <header className="modal-header">
              <h2 id="whatsapp-webhook-title">Webhook WhatsApp</h2>
              <button className="icon-button" type="button" onClick={() => setActiveModal(null)}>
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <dl className="detail-list">
              <div>
                <dt>URL atual</dt>
                <dd>{working === 'webhook-info' ? 'Carregando...' : (webhookUrl ?? '-')}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{connection?.webhookConfigured ? 'Configurado' : 'Não configurado'}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setActiveModal(null)}
              >
                Fechar
              </button>
              <button
                className="primary-button"
                aria-busy={working === 'webhook'}
                disabled={hasWorkingAction}
                type="button"
                onClick={() => void configureWebhookFromModal()}
              >
                {working === 'webhook' ? 'Configurando...' : 'Configurar webhook'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeModal === 'diagnostic' ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveModal(null);
          }}
        >
          <section className="modal" aria-labelledby="whatsapp-diagnostic-title">
            <header className="modal-header">
              <h2 id="whatsapp-diagnostic-title">Diagnóstico WhatsApp</h2>
              <button className="icon-button" type="button" onClick={() => setActiveModal(null)}>
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <dl className="detail-list">
              <div>
                <dt>Kirago</dt>
                <dd>{health?.online ? 'Online' : 'Offline'}</dd>
              </div>
              <div>
                <dt>Versao</dt>
                <dd>{health?.version ?? '-'}</dd>
              </div>
              <div>
                <dt>Conexao</dt>
                <dd>{connection?.name ?? '-'}</dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>{connection?.provider ?? '-'}</dd>
              </div>
              <div>
                <dt>Status CRM</dt>
                <dd>{connection?.status ?? '-'}</dd>
              </div>
              <div>
                <dt>connected</dt>
                <dd>{connection?.connected ? 'true' : 'false'}</dd>
              </div>
              <div>
                <dt>loggedIn</dt>
                <dd>{connection?.loggedIn ? 'true' : 'false'}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{displayPhone}</dd>
              </div>
              <div>
                <dt>providerUserId</dt>
                <dd>{maskProviderUserId(connection?.providerUserId)}</dd>
              </div>
              <div>
                <dt>Ultima verificação</dt>
                <dd>
                  {connection?.lastStatusAt
                    ? new Date(connection.lastStatusAt).toLocaleString('pt-BR')
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>Webhook</dt>
                <dd>{connection?.webhookConfigured ? 'Configurado' : 'Pendente'}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setActiveModal(null)}
              >
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeModal === 'logout-confirm' ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveModal(null);
          }}
        >
          <section className="modal" aria-labelledby="whatsapp-logout-title">
            <header className="modal-header">
              <h2 id="whatsapp-logout-title">Deslogar WhatsApp</h2>
              <button className="icon-button" type="button" onClick={() => setActiveModal(null)}>
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <p>
              Deseja realmente deslogar este WhatsApp? Será necessário escanear um novo QR Code para
              conectar novamente.
            </p>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setActiveModal(null)}
              >
                Cancelar
              </button>
              <button
                className="danger-button"
                aria-busy={working === 'logout'}
                disabled={hasWorkingAction}
                type="button"
                onClick={() => void confirmLogout()}
              >
                {working === 'logout' ? 'Deslogando...' : 'Deslogar WhatsApp'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function getWhatsAppConnectionStatusPresentation(
  connection: WhatsAppConnection | null,
  loading: boolean,
) {
  if (loading) {
    return {
      badge: 'Atualizando',
      icon: 'loading',
      title: 'Carregando status do WhatsApp',
      tone: 'loading',
    } as const;
  }

  if (!connection) {
    return {
      badge: 'Desconectado',
      icon: 'offline',
      title: 'WhatsApp desconectado',
      tone: 'warning',
    } as const;
  }

  if (connection.status === 'CONNECTED') {
    return {
      badge: 'Conectado',
      icon: 'connected',
      title: 'WhatsApp conectado',
      tone: 'success',
    } as const;
  }

  if (connection.status === 'CONNECTING' || connection.status === 'QR_REQUIRED') {
    return {
      badge: 'Conectando',
      icon: 'loading',
      title: 'WhatsApp em conexão',
      tone: 'loading',
    } as const;
  }

  if (connection.status === 'ERROR') {
    return {
      badge: 'Erro',
      icon: 'offline',
      title: 'Instância Kirago ausente',
      tone: 'danger',
    } as const;
  }

  return {
    badge: 'Desconectado',
    icon: 'offline',
    title: 'WhatsApp aguardando conexão',
    tone: 'warning',
  } as const;
}

function messageDispatchStatusLabel(status: MessageDispatch['status']) {
  const labels = {
    CANCELED: 'Cancelado',
    FAILED: 'Falha',
    IGNORED: 'Ignorado',
    PENDING: 'Pendente',
    PROCESSING: 'Processando',
    SCHEDULED: 'Agendado',
    SENT: 'Enviado',
  } satisfies Record<MessageDispatch['status'], string>;

  return labels[status];
}

function messageDispatchOriginLabel(origin: MessageDispatch['origin']) {
  const labels = {
    BILLING: 'Cobrança',
    INITIAL_ACTIVATION: 'Ativação inicial',
    MANUAL: 'Manual',
    RECOVERY: 'Recuperação',
  } satisfies Record<MessageDispatch['origin'], string>;

  return labels[origin];
}

function WaitlistView({
  plans,
  onClientCreated,
}: {
  plans: Plan[];
  onClientCreated: (client: Client) => Promise<void>;
}) {
  const [summary, setSummary] = useState<WhatsAppPendingContactsSummary | null>(null);
  const [contacts, setContacts] = useState<WhatsAppPendingContact[]>([]);
  const [detailContact, setDetailContact] = useState<WhatsAppPendingContact | null>(null);
  const [approveContact, setApproveContact] = useState<WhatsAppPendingContact | null>(null);
  const [ignoreContact, setIgnoreContact] = useState<WhatsAppPendingContact | null>(null);
  const [status, setStatus] = useState<WhatsAppPendingContactStatus | ''>('PENDENTE');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginatedClients['pagination'] | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const total = pagination?.total ?? contacts.length;
  const waitlistMetrics = [
    {
      description: 'Aguardando atendimento',
      icon: Clock,
      label: 'Pendentes',
      tone: 'warning',
      value: summary?.pending ?? 0,
    },
    {
      description: 'Convertidos em clientes',
      icon: UserCheck,
      label: 'Aprovados hoje',
      tone: 'success',
      value: summary?.approvedToday ?? 0,
    },
    {
      description: 'Descartados',
      icon: EyeOff,
      label: 'Ignorados',
      tone: 'info',
      value: summary?.ignored ?? 0,
    },
    {
      description: 'Contatos nesta visualização',
      icon: BarChart3,
      label: 'Total filtrado',
      tone: 'primary',
      value: total,
    },
  ] as const;

  const loadWaitlist = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const filters: Parameters<typeof listWhatsAppPendingContacts>[0] = {
        status,
        page,
        pageSize: listPageSize,
      };
      const searchTerm = search.trim();

      if (searchTerm) {
        filters.search = searchTerm;
      }

      const [nextSummary, nextContacts] = await Promise.all([
        getWhatsAppPendingContactsSummary(),
        listWhatsAppPendingContacts(filters),
      ]);
      setSummary(nextSummary);
      setContacts(nextContacts.items);
      setPagination(nextContacts.pagination);
      if (
        !nextContacts.items.length &&
        nextContacts.pagination.page > 1 &&
        nextContacts.pagination.total > 0
      ) {
        setPage(Math.max(1, nextContacts.pagination.totalPages));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a lista.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    void loadWaitlist();
  }, [loadWaitlist]);

  async function selectContact(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const detail = await getWhatsAppPendingContact(contact.id);
      setDetailContact(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o contato.');
    }
  }

  async function handleIgnore(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const updated = await ignoreWhatsAppPendingContact(
        contact.id,
        ignoreReason.trim() || undefined,
      );
      setIgnoreReason('');
      setIgnoreContact(null);
      setDetailContact((current) => (current?.id === updated.id ? updated : current));
      await loadWaitlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ignorar o contato.');
    }
  }

  async function handleReopen(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const updated = await reopenWhatsAppPendingContact(contact.id);
      setDetailContact((current) => (current?.id === updated.id ? updated : current));
      await loadWaitlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reabrir o contato.');
    }
  }

  return (
    <>
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid waitlist-kpis">
        {waitlistMetrics.map((item) => {
          const Icon = item.icon;
          return (
            <article className={`metric-card compact stat-card tone-${item.tone}`} key={item.label}>
              <div className="stat-card-top">
                <span className="metric-label">{item.label}</span>
                <span className="stat-icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
              </div>
              <strong className="metric-value">{loading ? '-' : item.value}</strong>
              <span className="waitlist-kpi-helper">{item.description}</span>
            </article>
          );
        })}
      </div>

      <section className="workspace-main waitlist-workspace">
        <div className="toolbar waitlist-toolbar">
          <div className="search-row">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as WhatsAppPendingContactStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos os status</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="APROVADO">Aprovados</option>
            <option value="IGNORADO">Ignorados</option>
          </select>
          <Button icon={RefreshCcw} onClick={() => void loadWaitlist()} variant="secondary">
            Atualizar
          </Button>
        </div>

        <div className="table-wrap waitlist-table-wrap">
          <table className="waitlist-table">
            <thead>
              <tr>
                <th>Contato</th>
                <th>WhatsApp</th>
                <th>Ultima mensagem</th>
                <th>Mensagens</th>
                <th>Ultima interação</th>
                <th className="finance-status-column">Status</th>
                <th className="finance-actions-column">Ações</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td data-label="Contato">
                    <div className="waitlist-contact-cell">
                      <WaitlistContactAvatar contact={contact} />
                      <div>
                        <strong>{waitlistContactName(contact)}</strong>
                        <span>{contact.connection.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="waitlist-phone-cell" data-label="WhatsApp">
                    {formatWaitlistPhone(contact.phoneNormalized)}
                  </td>
                  <td data-label="Ultima mensagem">
                    <span className="waitlist-message-preview" title={waitlistFullMessage(contact)}>
                      {waitlistFullMessage(contact)}
                    </span>
                  </td>
                  <td data-label="Mensagens">
                    <span className="waitlist-message-count">
                      <MessageCircle aria-hidden="true" size={15} />
                      {contact.messageCount}
                    </span>
                  </td>
                  <td data-label="Ultima interação">{formatDateTime(contact.lastContactAt)}</td>
                  <td className="finance-status-column" data-label="Status">
                    <WaitlistStatusBadge status={contact.status} />
                  </td>
                  <td className="finance-actions-column" data-label="Ações">
                    <div className="button-row waitlist-row-actions">
                      <IconButton
                        icon={Eye}
                        label="Visualizar contato"
                        onClick={() => void selectContact(contact)}
                        size="sm"
                        variant="secondary"
                      />
                      {contact.status === 'PENDENTE' ? (
                        <>
                          <Button
                            className="waitlist-approve-button"
                            icon={UserPlus}
                            onClick={() => setApproveContact(contact)}
                            size="sm"
                            variant="primary"
                          >
                            Aprovar
                          </Button>
                          <ActionMenu
                            label="Mais ações do contato"
                            items={[
                              {
                                danger: true,
                                icon: EyeOff,
                                label: 'Ignorar',
                                onSelect: () => {
                                  setIgnoreReason('');
                                  setIgnoreContact(contact);
                                },
                              },
                            ]}
                          />
                        </>
                      ) : null}
                      {contact.status === 'IGNORADO' ? (
                        <IconButton
                          icon={RotateCcw}
                          label="Reabrir contato"
                          onClick={() => void handleReopen(contact)}
                          size="sm"
                          variant="secondary"
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!contacts.length ? (
            <div className="empty-state waitlist-empty-state">
              {loading ? 'Carregando...' : 'Nenhum contato encontrado.'}
              {!loading ? (
                <span>Novos contatos recebidos pelo WhatsApp aparecerão aqui.</span>
              ) : null}
            </div>
          ) : null}
          <PaginationControls itemLabel="contatos" pagination={pagination} onPageChange={setPage} />
        </div>
      </section>

      {detailContact ? (
        <WaitlistContactDetailModal
          contact={detailContact}
          onApprove={(contact) => {
            setDetailContact(null);
            setApproveContact(contact);
          }}
          onClose={() => setDetailContact(null)}
          onIgnore={(contact) => {
            setDetailContact(null);
            setIgnoreReason('');
            setIgnoreContact(contact);
          }}
          onReopen={(contact) => void handleReopen(contact)}
        />
      ) : null}

      {approveContact ? (
        <ApprovePendingContactModal
          contact={approveContact}
          plans={plans}
          onClose={() => setApproveContact(null)}
          onApproved={async (client) => {
            setApproveContact(null);
            setDetailContact(null);
            await onClientCreated(client);
          }}
        />
      ) : null}

      {ignoreContact ? (
        <IgnorePendingContactModal
          contact={ignoreContact}
          reason={ignoreReason}
          onChangeReason={setIgnoreReason}
          onClose={() => {
            setIgnoreContact(null);
            setIgnoreReason('');
          }}
          onConfirm={() => void handleIgnore(ignoreContact)}
        />
      ) : null}
    </>
  );
}

function WaitlistContactDetailModal({
  contact,
  onApprove,
  onClose,
  onIgnore,
  onReopen,
}: {
  contact: WhatsAppPendingContact;
  onApprove: (contact: WhatsAppPendingContact) => void;
  onClose: () => void;
  onIgnore: (contact: WhatsAppPendingContact) => void;
  onReopen: (contact: WhatsAppPendingContact) => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal waitlist-detail-modal" aria-labelledby="waitlist-detail-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <UserRound size={16} />
          </span>
          <div>
            <h2 id="waitlist-detail-title">Detalhes do contato</h2>
            <p>Informações recebidas pelo WhatsApp.</p>
          </div>
          <IconButton icon={X} label="Fechar detalhes do contato" onClick={onClose} />
        </header>

        <div className="waitlist-detail-hero">
          <WaitlistContactAvatar contact={contact} />
          <div>
            <strong>{waitlistContactName(contact)}</strong>
            <span>{formatWaitlistPhone(contact.phoneNormalized)}</span>
          </div>
          <WaitlistStatusBadge status={contact.status} />
        </div>

        <dl className="detail-list waitlist-detail-grid">
          <div>
            <dt>Origem</dt>
            <dd>WhatsApp</dd>
          </div>
          <div>
            <dt>Conexão</dt>
            <dd>{contact.connection.name}</dd>
          </div>
          <div>
            <dt>Primeiro contato</dt>
            <dd>{formatDateTime(contact.firstContactAt)}</dd>
          </div>
          <div>
            <dt>Último contato</dt>
            <dd>{formatDateTime(contact.lastContactAt)}</dd>
          </div>
          <div>
            <dt>Mensagens</dt>
            <dd>{contact.messageCount}</dd>
          </div>
          {contact.status === 'APROVADO' && contact.client ? (
            <div>
              <dt>Cliente criado</dt>
              <dd>
                {contact.client.name} · {contact.client.reference}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="waitlist-message-pair">
          <article>
            <span>Primeira mensagem</span>
            <p>{contact.firstMessageText ?? messageTypePreview(contact.firstMessageType)}</p>
          </article>
          <article>
            <span>Última mensagem</span>
            <p>{contact.lastMessageText ?? messageTypePreview(contact.lastMessageType)}</p>
          </article>
        </div>

        <section className="waitlist-history">
          <WaitlistSectionTitle icon={MessageCircle} title="Conversa" />
          <div className="mini-list">
            {(contact.inboundMessages ?? []).map((message) => (
              <article key={message.id}>
                <strong>{messageTypeLabel(message.messageType)}</strong>
                <span>{formatDateTime(message.messageTimestamp ?? message.receivedAt)}</span>
                <p>{message.text ?? messageTypePreview(message.messageType)}</p>
              </article>
            ))}
            {!contact.inboundMessages?.length ? (
              <div className="empty-state">Nenhum histórico recebido disponível.</div>
            ) : null}
          </div>
        </section>

        <div className="form-actions">
          <Button onClick={onClose} variant="secondary">
            Fechar
          </Button>
          <div className="button-row">
            {contact.status === 'PENDENTE' ? (
              <>
                <Button icon={EyeOff} onClick={() => onIgnore(contact)} variant="danger">
                  Ignorar
                </Button>
                <Button icon={UserCheck} onClick={() => onApprove(contact)} variant="primary">
                  Aprovar
                </Button>
              </>
            ) : null}
            {contact.status === 'IGNORADO' ? (
              <Button icon={RotateCcw} onClick={() => onReopen(contact)} variant="secondary">
                Reabrir
              </Button>
            ) : null}
            {contact.status === 'APROVADO' ? (
              <div className="notice">
                <CircleCheck aria-hidden="true" size={16} />
                Cliente criado
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function IgnorePendingContactModal({
  contact,
  onChangeReason,
  onClose,
  onConfirm,
  reason,
}: {
  contact: WhatsAppPendingContact;
  onChangeReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  reason: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal waitlist-ignore-modal" aria-labelledby="waitlist-ignore-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon danger" aria-hidden="true">
            <UserX size={16} />
          </span>
          <div>
            <h2 id="waitlist-ignore-title">Ignorar contato</h2>
            <p>Este contato será removido da fila de atendimento.</p>
          </div>
          <IconButton icon={X} label="Fechar confirmação de ignorar" onClick={onClose} />
        </header>
        <div className="waitlist-contact-summary">
          <span>{waitlistContactName(contact)}</span>
          <span>{formatWaitlistPhone(contact.phoneNormalized)}</span>
        </div>
        <label className="field">
          <span>Motivo (opcional)</span>
          <textarea value={reason} onChange={(event) => onChangeReason(event.target.value)} />
        </label>
        <div className="form-actions">
          <div />
          <div className="button-row">
            <Button onClick={onClose} variant="secondary">
              Cancelar
            </Button>
            <Button icon={EyeOff} onClick={onConfirm} variant="danger">
              Ignorar contato
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function WaitlistSectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="waitlist-section-title">
      <Icon aria-hidden="true" size={16} />
      <h3>{title}</h3>
    </div>
  );
}

type WaitlistApprovalStep = 'client' | 'reference' | 'billing' | 'referral';

const waitlistApprovalSteps: ReadonlyArray<{
  id: WaitlistApprovalStep;
  label: string;
}> = [
  { id: 'client', label: 'Cliente' },
  { id: 'reference', label: 'Referência' },
  { id: 'billing', label: 'Cobrança' },
  { id: 'referral', label: 'Indicação' },
];

function ApprovePendingContactModal({
  contact,
  plans,
  onClose,
  onApproved,
}: {
  contact: WhatsAppPendingContact;
  plans: Plan[];
  onClose: () => void;
  onApproved: (client: Client) => Promise<void>;
}) {
  const sortedPlans = sortPlansByDuration(plans);
  const initialPlan = sortedPlans[0];
  const [name, setName] = useState(contact.contactName ?? '');
  const [phone] = useState(contact.phoneNormalized);
  const [email, setEmail] = useState('');
  const [reference, setReference] = useState('');
  const [planId, setPlanId] = useState(initialPlan?.id ?? '');
  const [recurringValue, setRecurringValue] = useState(initialPlan?.defaultValue ?? '0.00');
  const [dueDate, setDueDate] = useState('');
  const [billingNoticeDays, setBillingNoticeDays] = useState('0');
  const [notes, setNotes] = useState('');
  const [generateInitialReceivable, setGenerateInitialReceivable] = useState(true);
  const [sendPixWhatsAppNow, setSendPixWhatsAppNow] = useState(true);
  const [referrerClientId, setReferrerClientId] = useState('');
  const [activeStep, setActiveStep] = useState<WaitlistApprovalStep>('client');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const approvalSubmittingRef = useRef(false);
  const shouldSendPix = generateInitialReceivable && sendPixWhatsAppNow;
  const activeStepIndex = waitlistApprovalSteps.findIndex((step) => step.id === activeStep);
  const isLastStep = activeStep === 'referral';
  const selectedPlan = sortedPlans.find((plan) => plan.id === planId);

  function goToStep(step: WaitlistApprovalStep) {
    setActiveStep(step);
  }

  function handleNext() {
    const nextIndex = Math.min(activeStepIndex + 1, waitlistApprovalSteps.length - 1);

    setActiveStep(waitlistApprovalSteps[nextIndex]?.id ?? activeStep);
  }

  function handlePrevious() {
    const nextIndex = Math.max(activeStepIndex - 1, 0);

    setActiveStep(waitlistApprovalSteps[nextIndex]?.id ?? activeStep);
  }

  function handleFormKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    event.preventDefault();
  }

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = sortedPlans.find((plan) => plan.id === nextPlanId);
    if (selectedPlan) setRecurringValue(selectedPlan.defaultValue);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!isLastStep) {
      return;
    }

    if (loading || approvalSubmittingRef.current) return;

    approvalSubmittingRef.current = true;
    setLoading(true);

    try {
      const client = await approveWhatsAppPendingContact(contact.id, {
        name,
        email: email || undefined,
        reference,
        planId,
        recurringValue: Number(recurringValue),
        dueDate,
        billingNoticeDays: Number(billingNoticeDays),
        notes: notes || undefined,
        generateInitialReceivable,
        sendPixWhatsAppNow: generateInitialReceivable && sendPixWhatsAppNow,
        referrerClientId: referrerClientId || undefined,
        referralRewardType: referrerClientId ? 'FREE_MONTH' : undefined,
      });
      await onApproved(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aprovar o contato.');
    } finally {
      approvalSubmittingRef.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal waitlist-approve-modal" aria-labelledby="approve-pending-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <UserCheck size={17} />
          </span>
          <div>
            <h2 id="approve-pending-title">Aprovar contato</h2>
            <p>Converta este contato em cliente e configure o primeiro serviço.</p>
          </div>
          <IconButton icon={X} label="Fechar aprovação" type="button" onClick={onClose} />
        </header>
        <div className="waitlist-contact-summary">
          <span>{waitlistContactName(contact)}</span>
          <span>{formatWaitlistPhone(contact.phoneNormalized)}</span>
          <span>{contact.connection.name}</span>
        </div>
        <form
          className="entity-form"
          onKeyDown={handleFormKeyDown}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="waitlist-stepper" aria-label="Etapas da aprovação">
            {waitlistApprovalSteps.map((step, index) => (
              <button
                className={[
                  'waitlist-step',
                  index === activeStepIndex ? 'active' : '',
                  index < activeStepIndex ? 'complete' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={step.id}
                type="button"
                onClick={() => goToStep(step.id)}
              >
                <span>{index + 1}</span>
                {step.label}
              </button>
            ))}
          </div>

          {activeStep === 'client' ? (
            <section className="waitlist-approval-section">
              <WaitlistSectionTitle icon={UserRound} title="Dados do cliente" />
              <div className="form-grid">
                <label className="field">
                  <span>Nome</span>
                  <input required value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="field">
                  <span>WhatsApp</span>
                  <input readOnly value={formatWaitlistPhone(phone)} />
                </label>
                <label className="field">
                  <span>E-mail</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
              </div>
              <label className="field">
                <span>Observações</span>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </section>
          ) : null}

          {activeStep === 'reference' ? (
            <section className="waitlist-approval-section">
              <WaitlistSectionTitle icon={Layers} title="Primeira referência" />
              <div className="form-grid">
                <label className="field">
                  <span>Referência</span>
                  <input
                    required
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Plano</span>
                  <select
                    required
                    value={planId}
                    onChange={(event) => handlePlanChange(event.target.value)}
                  >
                    {sortedPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Valor</span>
                  <input
                    min="0"
                    step="0.01"
                    type="number"
                    value={recurringValue}
                    onChange={(event) => setRecurringValue(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Vencimento</span>
                  <input
                    required
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Avisar cobrança</span>
                  <input
                    min="0"
                    type="number"
                    value={billingNoticeDays}
                    onChange={(event) => setBillingNoticeDays(event.target.value)}
                  />
                </label>
              </div>
              <div className="notice">
                Cliente e primeira referência serão criados como Pendente pagamento.
              </div>
            </section>
          ) : null}

          {activeStep === 'billing' ? (
            <section className="waitlist-approval-section">
              <WaitlistSectionTitle icon={Receipt} title="Cobrança inicial" />
              <p className="section-note">
                Cria uma cobrança de ativação vinculada à primeira referência.
              </p>
              <label className="checkbox-row">
                <input
                  checked={generateInitialReceivable}
                  type="checkbox"
                  onChange={(event) => setGenerateInitialReceivable(event.target.checked)}
                />
                Gerar cobrança inicial
              </label>
              {generateInitialReceivable ? (
                <>
                  <label className="checkbox-row">
                    <input
                      checked={sendPixWhatsAppNow}
                      type="checkbox"
                      onChange={(event) => setSendPixWhatsAppNow(event.target.checked)}
                    />
                    Enviar PIX pelo WhatsApp agora
                  </label>
                  <p className="section-note">
                    Após criar o cliente e a cobrança, o sistema tentará gerar o PIX e enviá-lo pelo
                    WhatsApp.
                  </p>
                  <div className="notice">
                    O cadastro pode ser concluído mesmo se a geração ou o envio do PIX falhar.
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {activeStep === 'referral' ? (
            <>
              <section className="waitlist-approval-section">
                <WaitlistSectionTitle icon={UsersRound} title="Indicação" />
                <label className="field">
                  <span>Indicado por</span>
                  <ClientReferralSelect value={referrerClientId} onChange={setReferrerClientId} />
                </label>
                <div className="notice">
                  {referrerClientId ? 'Benefício padrão: Mês grátis.' : 'Nenhuma indicação.'}
                </div>
              </section>

              <section className="waitlist-approval-section waitlist-approval-summary">
                <WaitlistSectionTitle icon={CircleCheck} title="Resumo antes de aprovar" />
                <ul>
                  {name ? <li>Cliente: {name}</li> : null}
                  {reference ? <li>Referência: {reference}</li> : null}
                  {selectedPlan ? <li>Plano: {selectedPlan.name}</li> : null}
                  {generateInitialReceivable ? (
                    <li>Cobrança inicial: {formatCurrency(Number(recurringValue || 0))}</li>
                  ) : null}
                  {referrerClientId ? <li>Indicação pendente</li> : null}
                  {shouldSendPix ? <li>Tentará gerar e enviar PIX após o cadastro</li> : null}
                </ul>
              </section>
            </>
          ) : null}

          <div
            className={['form-actions', isLastStep ? 'waitlist-final-actions' : '']
              .filter(Boolean)
              .join(' ')}
          >
            <span className="error-message">{error}</span>
            <div className="button-row">
              <Button type="button" onClick={onClose} variant="secondary">
                Cancelar
              </Button>
              {activeStepIndex > 0 ? (
                <Button icon={ArrowLeft} type="button" onClick={handlePrevious} variant="secondary">
                  Voltar
                </Button>
              ) : null}
              {isLastStep ? (
                <Button
                  icon={UserCheck}
                  key="approve-contact"
                  loading={loading}
                  type="submit"
                  variant="primary"
                >
                  Aprovar contato
                </Button>
              ) : (
                <Button
                  icon={ArrowRight}
                  key="continue-approval-step"
                  type="button"
                  onClick={handleNext}
                  variant="primary"
                >
                  Continuar
                </Button>
              )}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function waitlistFullMessage(contact: WhatsAppPendingContact) {
  return contact.lastMessageText ?? messageTypePreview(contact.lastMessageType);
}

function waitlistContactName(contact: WhatsAppPendingContact) {
  return contact.contactName ?? 'Contato sem nome';
}

function WaitlistContactAvatar({ contact }: { contact: WhatsAppPendingContact }) {
  return (
    <span className="waitlist-avatar" aria-hidden="true">
      {waitlistContactName(contact).slice(0, 1).toUpperCase()}
    </span>
  );
}

function formatWaitlistPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith('55')) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return value;
}

function waitlistStatusLabel(status: WhatsAppPendingContactStatus) {
  const labels: Record<WhatsAppPendingContactStatus, string> = {
    APROVADO: 'Aprovado',
    IGNORADO: 'Ignorado',
    PENDENTE: 'Pendente',
  };

  return labels[status];
}

function WaitlistStatusBadge({ status }: { status: WhatsAppPendingContactStatus }) {
  return <span className={`pill ${status.toLowerCase()}`}>{waitlistStatusLabel(status)}</span>;
}

function messageTypePreview(type: WhatsAppInboundMessageType) {
  const labels: Record<WhatsAppInboundMessageType, string> = {
    text: '[Texto]',
    image: '[Imagem]',
    video: '[Video]',
    audio: '[Audio]',
    document: '[Documento]',
    sticker: '[Figurinha]',
    location: '[Localização]',
    live_location: '[Localização ao vivo]',
    contact: '[Contato]',
    contacts: '[Contatos]',
    reaction: '[Reação]',
    button_response: '[Resposta de botão]',
    list_response: '[Resposta de lista]',
    interactive_response: '[Resposta interativa]',
    unknown: '[Mensagem]',
  };

  return labels[type] ?? '[Mensagem]';
}

function messageTypeLabel(type: WhatsAppInboundMessageType) {
  return messageTypePreview(type).replace('[', '').replace(']', '');
}

function billingStatusLabel(status: MessageDispatch['status']) {
  const labels: Record<MessageDispatch['status'], string> = {
    PENDING: 'Pendente',
    SCHEDULED: 'Agendada',
    PROCESSING: 'Processando',
    SENT: 'Enviada',
    FAILED: 'Falha',
    CANCELED: 'Cancelada',
    IGNORED: 'Ignorada',
  };

  return labels[status];
}

function billingDispatchReferenceLabel(dispatch: MessageDispatch) {
  if ((dispatch.itemCount ?? 0) > 1) {
    return `${dispatch.itemCount} referências`;
  }

  return dispatch.clientReference?.reference ?? dispatch.client?.reference ?? '-';
}

function billingDispatchAmountLabel(dispatch: MessageDispatch) {
  if (dispatch.totalAmount) return formatCurrency(dispatch.totalAmount);
  if (dispatch.receivable?.amount) return formatCurrency(dispatch.receivable.amount);
  return '-';
}

function billingDispatchDueDateLabel(dispatch: MessageDispatch) {
  if (dispatch.dueDateLabel === 'Vários') return 'Vários';
  if (dispatch.dueDateLabel) return formatDate(dispatch.dueDateLabel);
  if (dispatch.receivable?.dueDate) return formatDate(dispatch.receivable.dueDate);
  return '-';
}

function billingDispatchStatusTone(status: MessageDispatch['status']) {
  if (status === 'SENT') return 'success';
  if (status === 'FAILED' || status === 'CANCELED') return 'danger';
  if (status === 'IGNORED') return 'muted';
  if (status === 'PROCESSING') return 'info';
  return 'warning';
}

function recoveryCampaignStatusLabel(status: RecoveryCampaignStatus) {
  const labels: Record<RecoveryCampaignStatus, string> = {
    ATIVA: 'Ativa',
    CONCLUIDA: 'Concluída',
    CANCELADA: 'Cancelada',
  };

  return labels[status];
}

function recoveryStepStatusLabel(status: RecoveryCampaign['steps'][number]['status']) {
  const labels: Record<RecoveryCampaign['steps'][number]['status'], string> = {
    SCHEDULED: 'Agendada',
    SENT: 'Enviada',
    FAILED: 'Falha',
    CANCELED: 'Cancelada',
    IGNORED: 'Ignorada',
  };

  return labels[status];
}

function recoveryCampaignStatusTone(status: RecoveryCampaignStatus) {
  if (status === 'CONCLUIDA') return 'success';
  if (status === 'CANCELADA') return 'muted';
  return 'warning';
}

function recoveryStepStatusTone(status: RecoveryCampaign['steps'][number]['status']) {
  if (status === 'SENT') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELED' || status === 'IGNORED') return 'muted';
  return 'warning';
}

function messageOriginLabel(origin: MessageDispatch['origin']) {
  const labels: Record<MessageDispatch['origin'], string> = {
    MANUAL: 'Mensagem manual',
    INITIAL_ACTIVATION: 'Ativação inicial',
    BILLING: 'Cobrança',
    RECOVERY: 'Recuperação',
  };

  return labels[origin];
}

function paymentProviderDisplay(provider: PaymentProviderCode) {
  const labels: Record<PaymentProviderCode, string> = {
    MOCK: 'Mock',
    FASTFLOW: 'FastFlow',
    FASTPIX: 'FastPIX',
    FASTPAY: 'FastPay',
    DEPIX: 'Depix',
  };

  return labels[provider];
}

function isOperationalPixProviderCredential(credential: PaymentProviderCredentialStatus) {
  return (
    credential.configured &&
    credential.active !== false &&
    (credential.status === 'CONFIGURADO' || credential.status === 'VALIDO')
  );
}

function replacementProviderLabel(
  provider: ConfigurablePaymentProvider,
  defaultProvider: ConfigurablePaymentProvider | null,
) {
  const label = paymentProviderDisplay(provider);
  return provider === defaultProvider ? `${label} - padrão` : label;
}

function paymentIntentStatusLabel(status: PaymentIntentStatus) {
  const labels: Record<PaymentIntentStatus, string> = {
    CREATED: 'Criado',
    WAITING_PAYMENT: 'Aguardando pagamento',
    SUPERSEDED: 'Substituído',
    PAID: 'Pago',
    EXPIRED: 'Expirado',
    CANCELED: 'Cancelado',
    FAILED: 'Falhou',
    REFUNDED: 'Estornado',
  };

  return labels[status];
}

function paymentIntentStatusIcon(status: PaymentIntentStatus): LucideIcon {
  const icons: Record<PaymentIntentStatus, LucideIcon> = {
    CREATED: Clock,
    WAITING_PAYMENT: Clock,
    SUPERSEDED: RotateCcw,
    PAID: CircleCheck,
    EXPIRED: Timer,
    CANCELED: XCircle,
    FAILED: CircleAlert,
    REFUNDED: RotateCcw,
  };

  return icons[status];
}

function paymentIntentStatusTone(status: PaymentIntentStatus) {
  if (status === 'PAID') return 'success';
  if (status === 'WAITING_PAYMENT' || status === 'CREATED') return 'warning';
  if (status === 'FAILED' || status === 'EXPIRED') return 'danger';
  if (status === 'SUPERSEDED' || status === 'CANCELED' || status === 'REFUNDED') return 'muted';

  return 'info';
}

function paymentIntentStatusSummary(status: PaymentIntentStatus) {
  const summaries: Record<PaymentIntentStatus, string> = {
    CREATED: 'PIX criado. Aguarde o processamento antes de orientar o cliente.',
    WAITING_PAYMENT: 'PIX disponível para pagamento.',
    SUPERSEDED: 'Esta tentativa foi substituída por outro PIX.',
    PAID: 'Recebimento processado com sucesso.',
    EXPIRED: 'O prazo informado para este PIX expirou.',
    CANCELED: 'Esta tentativa foi cancelada.',
    FAILED: 'O provider retornou falha para esta tentativa.',
    REFUNDED: 'Pagamento estornado no provider.',
  };

  return summaries[status];
}

function paymentIntentDisplayTransactionId(intent: PaymentIntent) {
  return intent.providerTransactionId ? `#${intent.providerTransactionId}` : '-';
}

function paymentIntentShortDate(value: string | null | undefined) {
  if (!value) return '-';

  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

function isActivePixIntent(intent: PaymentIntent) {
  return ['CREATED', 'WAITING_PAYMENT'].includes(intent.status);
}

function isSelectablePixIntent(intent: PaymentIntent) {
  return intent.status !== 'SUPERSEDED';
}

function paymentIntentFreshness(intent: PaymentIntent) {
  return Math.max(
    Date.parse(intent.updatedAt) || 0,
    intent.lastSyncAt ? Date.parse(intent.lastSyncAt) || 0 : 0,
  );
}

function mergePaymentIntentsWithFallback(
  intents: PaymentIntent[],
  fallbackIntent: PaymentIntent | undefined,
  receivableId: string,
) {
  if (!fallbackIntent || fallbackIntent.receivableId !== receivableId) return intents;

  const sameIntentIndex = intents.findIndex((intent) => intent.id === fallbackIntent.id);

  if (sameIntentIndex === -1) return [fallbackIntent, ...intents];

  const sameIntent = intents[sameIntentIndex]!;

  if (paymentIntentFreshness(sameIntent) >= paymentIntentFreshness(fallbackIntent)) {
    return intents;
  }

  return intents.map((intent, index) => (index === sameIntentIndex ? fallbackIntent : intent));
}

function paymentIntentTimelineTime(intent: PaymentIntent) {
  return Math.max(
    intent.paidAt ? Date.parse(intent.paidAt) || 0 : 0,
    intent.updatedAt ? Date.parse(intent.updatedAt) || 0 : 0,
    intent.createdAt ? Date.parse(intent.createdAt) || 0 : 0,
  );
}

function sortPaymentIntentsForDisplay(intents: PaymentIntent[]) {
  return [...intents].sort((left, right) => {
    const timeDiff = paymentIntentTimelineTime(right) - paymentIntentTimelineTime(left);
    if (timeDiff !== 0) return timeDiff;

    return right.id.localeCompare(left.id);
  });
}

function pixSyncNotice(intent: PaymentIntent, grouped = false) {
  if (intent.status === 'PAID') {
    return grouped ? 'Pagamento PIX agrupado confirmado.' : 'Pagamento confirmado.';
  }
  if (intent.status === 'EXPIRED') return grouped ? 'PIX agrupado expirado.' : 'PIX expirado.';
  if (intent.status === 'CANCELED') {
    return grouped ? 'PIX agrupado cancelado.' : 'PIX cancelado.';
  }
  if (intent.status === 'FAILED') {
    return grouped ? 'PIX agrupado falhou no provider.' : 'PIX falhou no provider.';
  }
  if (intent.status === 'WAITING_PAYMENT') {
    return grouped
      ? 'PIX agrupado sincronizado. O provedor ainda informa pagamento pendente.'
      : 'PIX sincronizado. O provedor ainda informa pagamento pendente.';
  }

  return grouped ? 'Status do PIX agrupado sincronizado.' : 'Status do PIX sincronizado.';
}

function isPixTemporallyExpired(intent: PaymentIntent) {
  return (
    intent.status === 'WAITING_PAYMENT' &&
    Boolean(intent.expiresAt) &&
    Date.parse(intent.expiresAt!) <= Date.now()
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function formatSaoPauloDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : formatBusinessDate(date);
}

function isReactivationReference(reference?: Pick<ClientReference, 'status'> | null) {
  return reference?.status === 'CANCELADO';
}

function referenceLifecycleActionLabel(reference?: Pick<ClientReference, 'status'> | null) {
  return isReactivationReference(reference) ? 'Reativar' : 'Renovar';
}

function ClientReferenceForm({
  plans,
  reference,
  onCancel,
  onSubmit,
}: {
  plans: Plan[];
  reference: ClientReference | null;
  onCancel: () => void;
  onSubmit: (payload: Omit<ClientPayload, 'name' | 'phone' | 'email'>) => Promise<void>;
}) {
  const sortedPlans = sortPlansByDuration(plans);
  const initialPlan = reference?.plan ?? sortedPlans[0];
  const [referenceValue, setReferenceValue] = useState(reference?.reference ?? '');
  const [planId, setPlanId] = useState(reference?.planId ?? initialPlan?.id ?? '');
  const [recurringValue, setRecurringValue] = useState(
    reference?.recurringValue ?? initialPlan?.defaultValue ?? '0.00',
  );
  const [dueDate, setDueDate] = useState(reference?.dueDate ?? '');
  const [billingNoticeDays, setBillingNoticeDays] = useState(
    String(reference?.billingNoticeDays ?? 5),
  );
  const [notes, setNotes] = useState(reference?.notes ?? '');
  const [activeTab, setActiveTab] = useState<'data' | 'billing'>('data');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const creatingReference = !reference;

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = sortedPlans.find((plan) => plan.id === nextPlanId);
    if (selectedPlan && !reference) setRecurringValue(selectedPlan.defaultValue);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      await onSubmit({
        reference: referenceValue,
        planId,
        recurringValue: Number(recurringValue),
        dueDate,
        billingNoticeDays: Number(billingNoticeDays),
        notes: notes || undefined,
        referrerClientId: undefined,
        referralRewardType: undefined,
        referralRewardValue: undefined,
        referralRewardDescription: undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a referência.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="entity-form client-reference-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="form-tabs" role="tablist" aria-label="Dados da referência">
        <button
          aria-selected={activeTab === 'data'}
          className={activeTab === 'data' ? 'active' : ''}
          type="button"
          role="tab"
          onClick={() => setActiveTab('data')}
        >
          <FileText aria-hidden="true" size={15} />
          Dados da referência
        </button>
        <button
          aria-selected={activeTab === 'billing'}
          className={activeTab === 'billing' ? 'active' : ''}
          type="button"
          role="tab"
          onClick={() => setActiveTab('billing')}
        >
          <Bell aria-hidden="true" size={15} />
          Cobrança e notificações
        </button>
      </div>
      {creatingReference ? (
        <div className="notice">
          A nova referência será criada como pendente de pagamento. Gere o PIX manualmente em
          Cobranças/PIX; nenhum WhatsApp automático será enviado para essa primeira cobrança.
        </div>
      ) : null}
      {activeTab === 'data' ? (
        <div className="form-grid">
          <label className="field">
            <span>Nome da referência</span>
            <input
              required
              value={referenceValue}
              onChange={(event) => setReferenceValue(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Plano</span>
            <select
              required
              value={planId}
              onChange={(event) => handlePlanChange(event.target.value)}
            >
              {sortedPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor</span>
            <input
              min="0"
              step="0.01"
              type="number"
              value={recurringValue}
              onChange={(event) => setRecurringValue(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input
              required
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <label className="field form-grid-full">
            <span>Observações</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>
      ) : null}
      {activeTab === 'billing' ? (
        <div className="form-grid">
          <label className="field">
            <span>Avisar cobrança (dias antes)</span>
            <input
              min="0"
              type="number"
              value={billingNoticeDays}
              onChange={(event) => setBillingNoticeDays(event.target.value)}
            />
            <small>
              A cobrança automática passa a usar este aviso somente depois do pagamento inicial e da
              criação do próximo ciclo.
            </small>
          </label>
        </div>
      ) : null}
      <div className="form-actions">
        <span className="error-message">{error}</span>
        <div className="button-row">
          <Button icon={X} variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={saving} icon={Save} loading={saving} type="submit" variant="primary">
            Salvar referência
          </Button>
        </div>
      </div>
    </form>
  );
}

function RenewalModal({
  target,
  plans,
  onClose,
  onConfirm,
}: {
  target: RenewalTarget;
  plans: Plan[];
  onClose: () => void;
  onConfirm: (payload: { planId: string; amount: number; idempotencyKey: string }) => Promise<void>;
}) {
  const { client, reference } = target;
  const sortedPlans = sortPlansByDuration(plans);
  const [planId, setPlanId] = useState(reference.planId);
  const [amount, setAmount] = useState(reference.recurringValue);
  const [preview, setPreview] = useState<RenewalPreview | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const parsedAmount = Number(amount);

    if (!planId || Number.isNaN(parsedAmount)) {
      setPreview(null);
      return;
    }

    async function loadPreview() {
      setLoadingPreview(true);
      setError('');

      try {
        const nextPreview = await previewReferenceRenewal(reference.id, {
          planId,
          amount: parsedAmount,
        });
        if (active) setPreview(nextPreview);
      } catch (err) {
        if (active) {
          setPreview(null);
          setError(err instanceof Error ? err.message : 'Não foi possível calcular a renovação.');
        }
      } finally {
        if (active) setLoadingPreview(false);
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [amount, planId, reference.id]);

  async function handleConfirm() {
    setError('');
    setSaving(true);

    try {
      await onConfirm({ planId, amount: Number(amount), idempotencyKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar a renovação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="renewal-title">
        <header className="modal-header">
          <h2 id="renewal-title">Renovar referência</h2>
          <IconButton icon={X} label="Fechar renovação" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{reference.reference}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{reference.status}</dd>
          </div>
          <div>
            <dt>Plano atual</dt>
            <dd>{reference.plan.name}</dd>
          </div>
          <div>
            <dt>Vencimento atual</dt>
            <dd>{formatDate(reference.dueDate)}</dd>
          </div>
          <div>
            <dt>Valor atual</dt>
            <dd>{formatCurrency(reference.recurringValue)}</dd>
          </div>
        </dl>

        {reference.status === 'CANCELADO' ? (
          <div className="notice warning">
            Esta referência está CANCELADA. Renovação não reativa referências canceladas; use o
            fluxo de reativação separado.
          </div>
        ) : null}

        <div className="form-grid">
          <label className="field">
            <span>Plano</span>
            <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {sortedPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor</span>
            <input
              min="0"
              step="0.01"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </div>

        <section className="preview-box">
          {loadingPreview ? <span>Calculando...</span> : null}
          {preview ? (
            <>
              <strong>Novo vencimento: {formatDate(preview.newDueDate)}</strong>
              <span>Sera criada uma conta a receber de {formatCurrency(preview.amount)}.</span>
              {preview.planChanged ? (
                <span>
                  Plano alterado de {preview.currentPlan.name} para {preview.selectedPlan.name}.
                </span>
              ) : null}
            </>
          ) : null}
        </section>

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !preview}
              icon={RefreshCw}
              loading={saving}
              variant="primary"
              onClick={() => void handleConfirm()}
            >
              Confirmar renovação
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReactivationModal({
  target,
  plans,
  onClose,
  onConfirm,
  onGeneratePix,
  onGoToBilling,
}: {
  target: ReactivationTarget;
  plans: Plan[];
  onClose: () => void;
  onConfirm: (payload: {
    planId: string;
    amount: number;
    activationDate: string;
    idempotencyKey: string;
  }) => Promise<void>;
  onGeneratePix: (reactivation: ReactivationResult) => Promise<void>;
  onGoToBilling: (reactivation: ReactivationResult) => Promise<void>;
}) {
  const { client, reference } = target;
  const reactivationPlans = sortPlansByDuration(plans);
  const firstReactivationPlan = reactivationPlans[0] ?? null;
  const initialAmount =
    Number(reference.recurringValue) > 0
      ? reference.recurringValue
      : (firstReactivationPlan?.defaultValue ?? '');
  const [planId, setPlanId] = useState(firstReactivationPlan?.id ?? '');
  const [amount, setAmount] = useState(initialAmount);
  const [activationDate, setActivationDate] = useState(() => formatSaoPauloDateInput(new Date()));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingReactivation, setPendingReactivation] = useState<ReactivationResult | null>(null);
  const selectedPlan = reactivationPlans.find((plan) => plan.id === planId) ?? null;
  const parsedAmount = Number(amount);
  const reactivationPreview = useMemo(() => {
    if (!selectedPlan || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return null;
    }

    try {
      const parsedActivationDate = parseBusinessDate(activationDate);
      const anchorDay = parsedActivationDate.getUTCDate();
      const nextDueDate = addCalendarMonthsPreservingAnchor(
        parsedActivationDate,
        selectedPlan.durationMonths,
        anchorDay,
      );

      return {
        anchorDay,
        nextDueDate: formatBusinessDate(nextDueDate),
      };
    } catch {
      return null;
    }
  }, [activationDate, parsedAmount, selectedPlan]);
  const canSubmit = Boolean(planId) && Boolean(reactivationPreview);

  async function handleConfirm() {
    if (!canSubmit) {
      setError('Preencha plano, valor e data de ativação válidos.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      await onConfirm({
        planId,
        amount: parsedAmount,
        activationDate,
        idempotencyKey,
      });
    } catch (err) {
      const existingReactivation = pendingReactivationFromError(err);
      if (existingReactivation) {
        setPendingReactivation(existingReactivation);
        return;
      }

      setError(err instanceof Error ? err.message : 'Não foi possível criar a reativação.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePendingAction(action: (reactivation: ReactivationResult) => Promise<void>) {
    if (!pendingReactivation) return;

    setSaving(true);
    setError('');

    try {
      await action(pendingReactivation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a cobrança existente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="reactivation-title">
        <header className="modal-header">
          <h2 id="reactivation-title">Reativar referência</h2>
          <IconButton icon={X} label="Fechar reativação" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{reference.reference}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{reference.status}</dd>
          </div>
          <div>
            <dt>Plano histórico</dt>
            <dd>{reference.plan.name}</dd>
          </div>
          <div>
            <dt>Valor histórico</dt>
            <dd>{formatCurrency(reference.recurringValue)}</dd>
          </div>
        </dl>

        <div className="notice warning">
          A reativação cria uma cobrança manual. A referência permanece CANCELADA até o pagamento
          ser confirmado.
        </div>

        {pendingReactivation ? (
          <section className="preview-box">
            <strong>Já existe reativação aguardando pagamento.</strong>
            <span>Nenhuma nova reativação ou conta a receber foi criada.</span>
            <span>
              Cobrança {shortEntityId(pendingReactivation.receivable.id)} ·{' '}
              {formatCurrency(pendingReactivation.receivable.amount)} · vence em{' '}
              {formatDate(pendingReactivation.receivable.dueDate)}.
            </span>
            <span>
              Status da cobrança: {receivableVisualStatus(pendingReactivation.receivable)}.
            </span>
            <span>
              PIX vinculados: {pendingReactivation.receivable.paymentIntents?.length ?? 0}.
            </span>
            <span>A referência permanece CANCELADA até o pagamento ser confirmado.</span>
          </section>
        ) : (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Plano</span>
                <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                  {reactivationPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor</span>
                <input
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Data de ativação</span>
                <input
                  type="date"
                  value={activationDate}
                  onChange={(event) => setActivationDate(event.target.value)}
                />
              </label>
            </div>

            <section className="preview-box">
              {reactivationPreview && selectedPlan ? (
                <>
                  <strong>Cobrança de reativação: {formatCurrency(parsedAmount)}</strong>
                  <span>Vencimento da reativação: {formatDate(activationDate)}.</span>
                  <span>
                    Após o pagamento, próximo ciclo em {formatDate(reactivationPreview.nextDueDate)}
                    .
                  </span>
                  <span>
                    Plano {selectedPlan.name}; anchor {reactivationPreview.anchorDay}.
                  </span>
                </>
              ) : (
                <span>Preencha os dados para visualizar o próximo ciclo.</span>
              )}
            </section>

            <div className="notice">
              Nenhum PIX ou WhatsApp será gerado automaticamente. Use Cobranças/PIX depois da
              criação.
            </div>
          </>
        )}

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            {pendingReactivation ? (
              <>
                <Button
                  disabled={saving}
                  icon={Bell}
                  loading={saving}
                  variant="secondary"
                  onClick={() => void handlePendingAction(onGoToBilling)}
                >
                  Ir para Cobranças/PIX
                </Button>
                <Button
                  disabled={saving}
                  icon={QrCode}
                  loading={saving}
                  variant="primary"
                  onClick={() => void handlePendingAction(onGeneratePix)}
                >
                  Ver ou gerar PIX
                </Button>
              </>
            ) : (
              <Button
                disabled={saving || !canSubmit}
                icon={RefreshCw}
                loading={saving}
                variant="primary"
                onClick={() => void handleConfirm()}
              >
                Criar reativação
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function RenewalReversalModal({
  target,
  onClose,
  onConfirm,
}: {
  target: RenewalReversalTarget;
  onClose: () => void;
  onConfirm: (payload: { reason: string; idempotencyKey: string }) => Promise<void>;
}) {
  const { preview } = target;
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState('');
  const trimmedReason = reason.trim();
  const canConfirm = preview.reversible && trimmedReason.length >= 3;
  const impacts = renewalReversalImpactMessages(preview);
  const warnings = renewalReversalWarningMessages(preview);
  const blockers = renewalReversalBlockerMessages(preview);

  async function handleConfirm() {
    if (!canConfirm || savingRef.current) return;

    savingRef.current = true;
    setError('');
    setSaving(true);

    try {
      await onConfirm({ reason: trimmedReason, idempotencyKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desfazer a renovação.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal renewal-reversal-modal" aria-labelledby="renewal-reversal-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon warning" aria-hidden="true">
            <RotateCcw size={17} />
          </span>
          <div>
            <h2 id="renewal-reversal-title">Desfazer renovação</h2>
            <p>Revise o estado que será restaurado e os impactos antes de confirmar.</p>
          </div>
          <IconButton icon={X} label="Fechar reversão" onClick={onClose} />
        </header>

        <div className="renewal-reversal-summary">
          <section className="renewal-reversal-panel">
            <h3>Estado atual</h3>
            <dl className="detail-list">
              <div>
                <dt>Plano</dt>
                <dd>{preview.current.planName}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatCurrency(preview.current.amount)}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{formatDate(preview.current.dueDate)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{clientStatusLabel(preview.current.status)}</dd>
              </div>
            </dl>
          </section>

          <section className="renewal-reversal-panel restore">
            <h3>Restaurar para</h3>
            <dl className="renewal-restore-list">
              <div>
                <dt>Plano</dt>
                <dd>{preview.restore.planName ?? '—'}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{preview.restore.amount ? formatCurrency(preview.restore.amount) : '—'}</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>{preview.restore.dueDate ? formatDate(preview.restore.dueDate) : '—'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{preview.restore.status ? clientStatusLabel(preview.restore.status) : '—'}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="renewal-reversal-impacts">
          <h3>Impactos da reversão</h3>
          <ul>
            {impacts.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </section>

        {preview.warnings.length ? (
          <section className="renewal-reversal-messages warning">
            <h3>Atenção</h3>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {!preview.reversible ? (
          <section className="renewal-reversal-messages danger">
            <h3>Reversão bloqueada</h3>
            <p>Esta renovação não pode ser desfeita.</p>
            <ul>
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {preview.reversible ? (
          <label className="field renewal-reversal-reason">
            <span>Motivo da reversão *</span>
            <textarea
              maxLength={500}
              minLength={3}
              placeholder="Descreva o motivo operacional."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <small>{trimmedReason.length}/500 caracteres</small>
          </label>
        ) : null}

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !canConfirm}
              icon={RotateCcw}
              loading={saving}
              variant="danger"
              onClick={() => void handleConfirm()}
            >
              Desfazer renovação
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function renewalReversalImpactMessages(preview: RenewalRevertPreview) {
  const messages: string[] = [];

  if (preview.receivable.action === 'CANCEL' && preview.receivable.dueDate) {
    messages.push(`Cobrança de ${formatDate(preview.receivable.dueDate)} será cancelada.`);
  } else if (preview.receivable.action === 'PRESERVE_CANCELED' && preview.receivable.dueDate) {
    messages.push(`Cobrança de ${formatDate(preview.receivable.dueDate)} já está cancelada.`);
  } else if (preview.receivable.action === 'BLOCK_PAID' && preview.receivable.dueDate) {
    messages.push(`Cobrança de ${formatDate(preview.receivable.dueDate)} já foi paga.`);
  }

  if (preview.previousCycle.action === 'PRESERVE' && preview.previousCycle.dueDate) {
    messages.push(
      `Cobrança anterior de ${formatDate(preview.previousCycle.dueDate)} será preservada.`,
    );
  } else if (
    preview.previousCycle.action === 'PRESERVE_CANCELED' &&
    preview.previousCycle.dueDate
  ) {
    messages.push(
      `Cobrança anterior de ${formatDate(preview.previousCycle.dueDate)} continuará cancelada.`,
    );
  } else if (preview.previousCycle.status === 'INEXISTENTE' && preview.previousCycle.dueDate) {
    messages.push(
      `Não existe cobrança anterior para ${formatDate(preview.previousCycle.dueDate)}.`,
    );
  }

  if (preview.billing.futureToCancel > 0) {
    messages.push(`${preview.billing.futureToCancel} cobrança/agendamento futuro será cancelado.`);
  } else {
    messages.push('Nenhuma cobrança/agendamento futuro será cancelado.');
  }

  if (preview.billing.sentToPreserve > 0) {
    messages.push('Existem cobranças que já foram enviadas e permanecerão no histórico.');
  }

  if (preview.pix.total === 0) {
    messages.push('Nenhum PIX vinculado.');
  } else if (preview.pix.paid > 0) {
    messages.push('Existe PIX pago vinculado.');
  } else if (preview.pix.active > 0) {
    messages.push('Existe PIX ativo vinculado.');
  } else {
    messages.push('PIX finalizado será preservado como histórico.');
  }

  messages.push(
    preview.recovery.active ? 'Recuperação ativa será cancelada.' : 'Nenhuma recuperação ativa.',
  );

  return messages;
}

function renewalReversalWarningMessages(preview: RenewalRevertPreview) {
  const mappedWarnings: Record<string, string> = {
    PREVIOUS_CYCLE_CANCELED:
      'Ciclo anterior com cobrança cancelada. A referência será restaurada, mas a cobrança anterior continuará cancelada e não será reativada.',
    PREVIOUS_CYCLE_RECEIVABLE_MISSING: 'Não existe cobrança histórica para o vencimento anterior.',
    PREVIOUS_DUE_DATE_PAST: 'O vencimento a restaurar já passou.',
    SENT_BILLING_WILL_BE_PRESERVED:
      'Existem cobranças que já foram enviadas e permanecerão no histórico.',
  };

  return preview.warnings.map((warning) => mappedWarnings[warning.code] ?? warning.message);
}

function renewalReversalBlockerMessages(preview: RenewalRevertPreview) {
  const mappedBlockers: Record<string, string> = {
    ALREADY_REVERTED: 'Esta renovação já foi desfeita.',
    FINANCIAL_TRANSACTION_EXISTS: 'Existe movimentação financeira vinculada.',
    LEGACY_RENEWAL: 'Renovação antiga sem dados suficientes para reversão automática.',
    NOT_LATEST_RENEWAL: 'Apenas a renovação mais recente pode ser desfeita.',
    PIX_ACTIVE: 'Existe PIX aguardando pagamento. Cancele-o antes de desfazer.',
    PIX_PAID: 'Existe PIX pago vinculado.',
    PREVIOUS_CYCLE_FINANCIAL_TRANSACTION_EXISTS:
      'Existe movimentação financeira vinculada à cobrança anterior.',
    PREVIOUS_CYCLE_PIX_ACTIVE: 'Existe PIX ativo vinculado à cobrança anterior.',
    PREVIOUS_CYCLE_PIX_PAID: 'Existe PIX pago vinculado à cobrança anterior.',
    PREVIOUS_CYCLE_OVERDUE_RECEIVABLE_MISSING:
      'O ciclo anterior está vencido e não possui cobrança para preservar.',
    PREVIOUS_CYCLE_PAID: 'A cobrança anterior já foi paga.',
    RECEIVABLE_NOT_FOUND: 'A renovação não possui cobrança vinculada.',
    RECEIVABLE_PAID: 'A cobrança desta renovação já foi paga.',
    REFERENCE_STATE_CHANGED: 'A referência foi alterada depois desta renovação.',
  };

  return preview.blockers.map((blocker) => mappedBlockers[blocker.code] ?? blocker.message);
}

function clientStatusLabel(status: ClientStatus) {
  const labels: Record<ClientStatus, string> = {
    ATIVO: 'Ativo',
    CANCELADO: 'Cancelado',
    INATIVO: 'Inativo',
    PENDENTE_PAGAMENTO: 'Pendente de pagamento',
  };

  return labels[status] ?? status;
}

function FinanceView({ clients, initialTab }: { clients: Client[]; initialTab: FinanceTab }) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>(() => currentFinancePeriod());
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [receivablesSummary, setReceivablesSummary] = useState<ReceivablesSummary | null>(null);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [entries, setEntries] = useState<FinancialTransaction[]>([]);
  const [expenses, setExpenses] = useState<FinancialTransaction[]>([]);
  const [receivablesPagination, setReceivablesPagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [entriesPagination, setEntriesPagination] = useState<PaginatedClients['pagination'] | null>(
    null,
  );
  const [expensesPagination, setExpensesPagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [receivableStatus, setReceivableStatus] = useState<ReceivableDisplayStatus | ''>('');
  const [receivableDueDate, setReceivableDueDate] = useState('');
  const [activeQuickFilter, setActiveQuickFilter] = useState<FinanceQuickFilterId | null>(null);
  const [financeSearch, setFinanceSearch] = useState('');
  const [receivablesPage, setReceivablesPage] = useState(1);
  const [entriesPage, setEntriesPage] = useState(1);
  const [expensesPage, setExpensesPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [pixReceivable, setPixReceivable] = useState<Receivable | null>(null);
  const [paymentReceivables, setPaymentReceivables] = useState<Receivable[] | null>(null);
  const [pixReceivables, setPixReceivables] = useState<Receivable[] | null>(null);
  const [selectedReceivableIds, setSelectedReceivableIds] = useState<string[]>([]);
  const [cancelingReceivable, setCancelingReceivable] = useState<Receivable | null>(null);
  const [viewingLegacyPayment, setViewingLegacyPayment] = useState<Receivable | null>(null);
  const [transactionModal, setTransactionModal] = useState<{
    kind: FinancialTransactionType;
    transaction: FinancialTransaction | undefined;
  } | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const trimmedSearch = financeSearch.trim();
      const receivableDateFilters = receivableDueDate
        ? { dueDate: receivableDueDate }
        : activeQuickFilter === 'overdue'
          ? {}
          : { endDate: financePeriod.endDate, startDate: financePeriod.startDate };
      const receivableFilters: Parameters<typeof listReceivables>[0] = {
        ...receivableDateFilters,
        page: receivablesPage,
        pageSize: listPageSize,
        status: receivableStatus,
        sort: 'dueDateAsc',
      };

      if (trimmedSearch) {
        receivableFilters.search = trimmedSearch;
      }
      const receivableSummaryFilters = {
        ...receivableDateFilters,
        ...(receivableStatus ? { status: receivableStatus } : {}),
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
      };

      const [
        nextSummary,
        nextReceivablesSummary,
        nextCategories,
        nextReceivables,
        nextEntries,
        nextExpenses,
      ] = await Promise.all([
        getFinancialSummary({
          endDate: financePeriod.endDate,
          startDate: financePeriod.startDate,
        }),
        getReceivablesSummary(receivableSummaryFilters),
        listFinancialCategories(),
        listReceivables(receivableFilters),
        listFinancialTransactions({
          endDate: financePeriod.endDate,
          page: entriesPage,
          pageSize: listPageSize,
          startDate: financePeriod.startDate,
          type: 'ENTRADA',
        }),
        listFinancialTransactions({
          endDate: financePeriod.endDate,
          page: expensesPage,
          pageSize: listPageSize,
          startDate: financePeriod.startDate,
          type: 'SAIDA',
        }),
      ]);

      setSummary(nextSummary);
      setReceivablesSummary(nextReceivablesSummary);
      setCategories(nextCategories);
      setReceivables(nextReceivables.items);
      setReceivablesPagination(nextReceivables.pagination);
      setEntries(nextEntries.items);
      setEntriesPagination(nextEntries.pagination);
      setExpenses(nextExpenses.items);
      setExpensesPagination(nextExpenses.pagination);
      if (
        !nextReceivables.items.length &&
        nextReceivables.pagination.page > 1 &&
        nextReceivables.pagination.total > 0
      ) {
        setReceivablesPage(Math.max(1, nextReceivables.pagination.totalPages));
      }
      if (
        !nextEntries.items.length &&
        nextEntries.pagination.page > 1 &&
        nextEntries.pagination.total > 0
      ) {
        setEntriesPage(Math.max(1, nextEntries.pagination.totalPages));
      }
      if (
        !nextExpenses.items.length &&
        nextExpenses.pagination.page > 1 &&
        nextExpenses.pagination.total > 0
      ) {
        setExpensesPage(Math.max(1, nextExpenses.pagination.totalPages));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar financeiro.');
    } finally {
      setLoading(false);
    }
  }, [
    activeQuickFilter,
    entriesPage,
    expensesPage,
    financePeriod.endDate,
    financePeriod.startDate,
    financeSearch,
    receivableDueDate,
    receivableStatus,
    receivablesPage,
  ]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setSelectedReceivableIds([]);
  }, [
    financePeriod.startDate,
    financeSearch,
    receivableDueDate,
    receivableStatus,
    receivablesPage,
  ]);

  async function reloadWithNotice(message: string) {
    setSelectedReceivableIds([]);
    setNotice(message);
    await loadFinance();
  }

  function changeFinanceMonth(months: number) {
    setFinancePeriod((current) => shiftFinancePeriod(current, months));
    setActiveQuickFilter(null);
    setReceivableDueDate('');
    setReceivablesPage(1);
    setEntriesPage(1);
    setExpensesPage(1);
  }

  function resetFinancePages() {
    setReceivablesPage(1);
    setEntriesPage(1);
    setExpensesPage(1);
  }

  function applyQuickFilter(filter: FinanceQuickFilterId | null) {
    const today = formatSaoPauloDateInput(new Date());
    const nextSevenDays = addBusinessDaysInput(today, 7);

    setActiveQuickFilter(filter);

    if (!filter) {
      if (
        activeQuickFilter === 'pendingToday' ||
        activeQuickFilter === 'overdue' ||
        activeQuickFilter === 'nextSevenDays'
      ) {
        setReceivableStatus('');
      }
      setFinancePeriod(currentFinancePeriod());
      setReceivableDueDate('');
      resetFinancePages();
      return;
    }

    if (filter === 'today') {
      setFinancePeriod(buildCustomFinancePeriod('Hoje', today));
      setReceivableDueDate(tab === 'receivables' ? today : '');
      setReceivableStatus('');
      resetFinancePages();
      return;
    }

    if (filter === 'pendingToday') {
      setTab('receivables');
      setFinancePeriod(buildCustomFinancePeriod('Pendentes hoje', today));
      setReceivableDueDate(today);
      setReceivableStatus('PENDENTE');
      resetFinancePages();
      return;
    }

    if (filter === 'receivedToday') {
      setTab('summary');
      setFinancePeriod(buildCustomFinancePeriod('Recebidos hoje', today));
      setReceivableDueDate('');
      setReceivableStatus('');
      resetFinancePages();
      return;
    }

    if (filter === 'overdue') {
      setTab('receivables');
      setFinancePeriod(currentFinancePeriod());
      setReceivableDueDate('');
      setReceivableStatus('VENCIDO');
      resetFinancePages();
      return;
    }

    setTab('receivables');
    setFinancePeriod(buildCustomFinancePeriod('Próximos 7 dias', today, nextSevenDays));
    setReceivableDueDate('');
    setReceivableStatus('PENDENTE');
    resetFinancePages();
  }

  const quickFilters = [
    { id: null, label: 'Todos', mobileLabel: 'Todos' },
    { id: 'today', label: 'Hoje', mobileLabel: 'Hoje' },
    { id: 'pendingToday', label: 'Pendentes hoje', mobileLabel: 'Pendentes hoje' },
    { id: 'receivedToday', label: 'Recebidos hoje', mobileLabel: 'Recebidos hoje' },
    { id: 'overdue', label: 'Vencidos', mobileLabel: 'Vencidos' },
    { id: 'nextSevenDays', label: 'Próximos 7 dias', mobileLabel: '7 dias' },
  ] satisfies Array<{
    id: FinanceQuickFilterId | null;
    label: string;
    mobileLabel: string;
  }>;

  const entryCategories = categories.filter(
    (category) => category.type === 'ENTRADA' && category.active !== false,
  );
  const expenseCategories = categories.filter(
    (category) => category.type === 'SAIDA' && category.active !== false,
  );
  const selectedReceivables = selectedReceivableIds
    .map((id) => receivables.find((receivable) => receivable.id === id))
    .filter((receivable): receivable is Receivable => Boolean(receivable));
  const selectedClientId = selectedReceivables[0]?.clientId ?? null;
  const selectedTotal = selectedReceivables.reduce(
    (total, receivable) => total + Number(receivable.amount),
    0,
  );
  const financeKpis = summary
    ? ([
        {
          icon: DollarSign,
          label: 'A receber',
          tone: 'info',
          value: summary.receivablePending,
        },
        {
          icon: CircleCheck,
          label: 'Recebido',
          tone: 'success',
          value: summary.received,
        },
        {
          icon: Bell,
          label: 'Vencido',
          tone: 'danger',
          value: summary.receivableOverdue,
        },
        {
          icon: Minus,
          label: 'Saídas',
          tone: 'warning',
          value: summary.expenses,
        },
        {
          icon: CreditCard,
          label: 'Saldo',
          tone: Number(summary.balance) < 0 ? 'danger' : 'success',
          value: summary.balance,
        },
      ] satisfies Array<{
        icon: LucideIcon;
        label: string;
        tone: 'success' | 'warning' | 'danger' | 'info';
        value: string;
      }>)
    : [];
  const receivableKpis = [
    {
      icon: DollarSign,
      label: 'A receber',
      tone: 'warning',
      value: receivablesSummary?.pendingAmount ?? '0.00',
    },
    {
      icon: CircleCheck,
      label: 'Pago',
      tone: 'success',
      value: receivablesSummary?.paidAmount ?? '0.00',
    },
    {
      icon: Bell,
      label: 'Vencido',
      tone: 'danger',
      value: receivablesSummary?.overdueAmount ?? '0.00',
    },
    {
      icon: XCircle,
      label: 'Cancelado',
      tone: 'neutral',
      value: receivablesSummary?.canceledAmount ?? '0.00',
    },
  ] satisfies Array<{
    icon: LucideIcon;
    label: string;
    tone: 'neutral' | 'success' | 'warning' | 'danger';
    value: string;
  }>;

  function toggleReceivableSelection(receivable: Receivable) {
    if (receivable.status !== 'PENDENTE') return;

    setSelectedReceivableIds((current) => {
      if (current.includes(receivable.id)) {
        return current.filter((id) => id !== receivable.id);
      }

      const currentReceivables = current
        .map((id) => receivables.find((item) => item.id === id))
        .filter((item): item is Receivable => Boolean(item));
      const currentClientId = currentReceivables[0]?.clientId;

      if (currentClientId && currentClientId !== receivable.clientId) {
        setError('Selecione contas de apenas um cliente por pagamento agrupado.');
        return current;
      }

      setError('');
      return [...current, receivable.id];
    });
  }

  function openTransactionModal(
    kind: FinancialTransactionType,
    transaction?: FinancialTransaction,
  ) {
    setTransactionModal({ kind, transaction });
  }

  return (
    <section className="workspace-main finance-workspace">
      <PageHeader
        title="Financeiro"
        subtitle="Controle de contas, movimentações e fluxo financeiro"
        actions={
          <div className="quick-actions">
            <Button icon={Plus} variant="primary" onClick={() => openTransactionModal('ENTRADA')}>
              <span className="finance-action-label-full">Nova entrada</span>
              <span className="finance-action-label-compact">Entrada</span>
            </Button>
            <Button icon={Minus} variant="secondary" onClick={() => openTransactionModal('SAIDA')}>
              <span className="finance-action-label-full">Nova saída</span>
              <span className="finance-action-label-compact">Saída</span>
            </Button>
          </div>
        }
      />

      {error ? <div className="notice danger">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="finance-period-bar" aria-label="Período financeiro">
        <CalendarDays aria-hidden="true" size={18} />
        <IconButton
          icon={ArrowLeft}
          label="Mês anterior"
          size="sm"
          variant="secondary"
          onClick={() => changeFinanceMonth(-1)}
        />
        <strong>{financePeriod.label}</strong>
        <IconButton
          icon={ArrowRight}
          label="Próximo mês"
          size="sm"
          variant="secondary"
          onClick={() => changeFinanceMonth(1)}
        />
        <span>
          {formatDate(financePeriod.startDate)} até {formatDate(financePeriod.endDate)}
        </span>
      </div>

      <div className="finance-quick-filters" aria-label="Filtros rápidos do financeiro">
        {quickFilters.map((filter) => {
          const active = activeQuickFilter === filter.id;

          return (
            <button
              aria-pressed={active}
              className={active ? 'active' : ''}
              key={filter.id ?? 'all'}
              type="button"
              onClick={() => applyQuickFilter(filter.id)}
            >
              <span className="finance-quick-label-full">{filter.label}</span>
              <span className="finance-quick-label-compact">{filter.mobileLabel}</span>
            </button>
          );
        })}
      </div>

      <div className="tabs finance-tabs">
        <button
          className={tab === 'summary' ? 'active' : ''}
          type="button"
          onClick={() => setTab('summary')}
        >
          Visao Geral
        </button>
        <button
          className={tab === 'receivables' ? 'active' : ''}
          type="button"
          onClick={() => setTab('receivables')}
        >
          Contas a Receber
        </button>
        <button
          className={tab === 'entries' ? 'active' : ''}
          type="button"
          onClick={() => setTab('entries')}
        >
          Entradas
        </button>
        <button
          className={tab === 'expenses' ? 'active' : ''}
          type="button"
          onClick={() => setTab('expenses')}
        >
          Saídas
        </button>
      </div>

      {tab === 'summary' && summary ? (
        <>
          <div className="metric-grid finance-kpis">
            {financeKpis.map((item) => (
              <StatCard
                icon={item.icon}
                key={item.label}
                label={item.label}
                tone={item.tone}
                value={loading ? '-' : item.value}
              />
            ))}
          </div>

          <Card className="finance-summary-panel">
            <SectionHeader eyebrow="Visão Geral" title="Resumo financeiro do período" />
            <div className="finance-summary-grid">
              <div>
                <span className="metric-label">Período</span>
                <strong>
                  {formatDate(summary.startDate)} até {formatDate(summary.endDate)}
                </strong>
              </div>
              <div>
                <span className="metric-label">Entradas manuais</span>
                <strong>{loading ? '-' : formatCurrency(summary.entries)}</strong>
              </div>
              <div>
                <span className="metric-label">Receita confirmada</span>
                <strong>{loading ? '-' : formatCurrency(summary.received)}</strong>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {tab === 'receivables' ? (
        <Card className="finance-panel">
          <SectionHeader eyebrow="Contas a Receber" title="Carteira de recebíveis" />
          <div className="metric-grid finance-receivable-kpis">
            {receivableKpis.map((item) => (
              <StatCard
                icon={item.icon}
                key={item.label}
                label={item.label}
                tone={item.tone}
                value={loading ? '-' : formatCurrency(item.value)}
              />
            ))}
          </div>
          <div className="toolbar finance-toolbar">
            <div className="search-row">
              <Search aria-hidden="true" size={18} />
              <input
                placeholder="Buscar cliente, pagador, telefone ou descrição"
                value={financeSearch}
                onChange={(event) => {
                  setFinanceSearch(event.target.value);
                  setReceivablesPage(1);
                }}
              />
            </div>
            <select
              value={receivableStatus}
              onChange={(event) => {
                setReceivableStatus(event.target.value as ReceivableDisplayStatus | '');
                setReceivableDueDate('');
                setActiveQuickFilter(null);
                setReceivablesPage(1);
              }}
            >
              <option value="">Todas as situações</option>
              <option value="PENDENTE">Pendente</option>
              <option value="VENCIDO">Vencido</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <Button icon={Filter} variant="secondary" onClick={() => void loadFinance()}>
              Aplicar
            </Button>
          </div>
          {selectedReceivables.length ? (
            <div className="selection-bar finance-selection-bar">
              <strong>
                {selectedReceivables.length} conta{selectedReceivables.length > 1 ? 's' : ''}{' '}
                selecionada{selectedReceivables.length > 1 ? 's' : ''}
              </strong>
              <span>Total: {formatCurrency(selectedTotal)}</span>
              <div className="button-row">
                <Button
                  icon={QrCode}
                  variant="secondary"
                  onClick={() => setPixReceivables(selectedReceivables)}
                >
                  Gerar PIX selecionados
                </Button>
                <Button
                  icon={CircleCheck}
                  variant="primary"
                  onClick={() => setPaymentReceivables(selectedReceivables)}
                >
                  Dar baixa selecionados
                </Button>
              </div>
            </div>
          ) : null}
          <div className="table-wrap finance-table-wrap">
            <table className="finance-global-table finance-receivables-table">
              <thead>
                <tr>
                  <th className="finance-select-column">Selecionar</th>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th className="finance-amount-column">Valor</th>
                  <th className="finance-status-column">Situação</th>
                  <th className="finance-actions-column">Ações</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => {
                  const legacyImport = isLegacyImportReceivable(receivable);

                  return (
                    <tr key={receivable.id}>
                      <td className="finance-select-column">
                        <input
                          aria-label={`Selecionar ${receivable.description}`}
                          checked={selectedReceivableIds.includes(receivable.id)}
                          disabled={
                            legacyImport ||
                            receivable.status !== 'PENDENTE' ||
                            isManualChargeReceivable(receivable) ||
                            Boolean(selectedClientId && selectedClientId !== receivable.clientId)
                          }
                          type="checkbox"
                          onChange={() => toggleReceivableSelection(receivable)}
                        />
                      </td>
                      <td>
                        {receivablePayerLabel(receivable)}
                        {isManualChargeReceivable(receivable) ? (
                          <span>{receivablePurposeLabel(receivable)}</span>
                        ) : null}
                      </td>
                      <td>{receivableReferenceLabel(receivable)}</td>
                      <td>{receivable.description}</td>
                      <td>{formatDate(receivable.dueDate)}</td>
                      <td className="finance-amount-column">{formatCurrency(receivable.amount)}</td>
                      <td className="finance-status-column">
                        <span
                          className={`finance-status-pill tone-${financeReceivableTone(receivable)}`}
                        >
                          {receivable.displayStatus}
                        </span>
                      </td>
                      <td className="finance-actions-column">
                        {legacyImport ? (
                          <Button
                            icon={Eye}
                            size="sm"
                            variant="secondary"
                            onClick={() => setViewingLegacyPayment(receivable)}
                          >
                            Visualizar
                          </Button>
                        ) : (
                          <div className="table-actions">
                            <IconButton
                              disabled={receivable.status !== 'PENDENTE'}
                              icon={QrCode}
                              label={`Gerar PIX para ${receivable.description}`}
                              variant="secondary"
                              onClick={() => setPixReceivable(receivable)}
                            />
                            <ActionMenu
                              items={[
                                {
                                  disabled: receivable.status !== 'PENDENTE',
                                  icon: CircleCheck,
                                  label: 'Dar baixa',
                                  onSelect: () => setPaymentReceivable(receivable),
                                },
                                {
                                  danger: true,
                                  disabled: receivable.status !== 'PENDENTE',
                                  icon: XCircle,
                                  label: 'Cancelar',
                                  onSelect: () => setCancelingReceivable(receivable),
                                },
                              ]}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!receivables.length ? (
              <div className="empty-state">
                {loading ? 'Carregando...' : 'Nenhuma conta a receber encontrada.'}
              </div>
            ) : null}
            <PaginationControls
              itemLabel="contas"
              pagination={receivablesPagination}
              onPageChange={setReceivablesPage}
            />
          </div>
        </Card>
      ) : null}

      {tab === 'entries' ? (
        <TransactionSection
          items={entries}
          kind="ENTRADA"
          onCreateRequest={() => openTransactionModal('ENTRADA')}
          onDelete={async (id) => {
            await deleteFinancialTransaction(id);
            await reloadWithNotice('Entrada removida.');
          }}
          pagination={entriesPagination}
          onPageChange={setEntriesPage}
          onUpdateRequest={(transaction) => openTransactionModal('ENTRADA', transaction)}
        />
      ) : null}

      {tab === 'expenses' ? (
        <TransactionSection
          items={expenses}
          kind="SAIDA"
          onCreateRequest={() => openTransactionModal('SAIDA')}
          onDelete={async (id) => {
            await deleteFinancialTransaction(id);
            await reloadWithNotice('Saida removida.');
          }}
          pagination={expensesPagination}
          onPageChange={setExpensesPage}
          onUpdateRequest={(transaction) => openTransactionModal('SAIDA', transaction)}
        />
      ) : null}

      {paymentReceivable ? (
        <PayReceivableModal
          categories={entryCategories}
          receivable={paymentReceivable}
          onClose={() => setPaymentReceivable(null)}
          onConfirm={async (payload) => {
            await payReceivable(paymentReceivable.id, payload);
            setPaymentReceivable(null);
            await reloadWithNotice('Pagamento registrado.');
          }}
        />
      ) : null}

      {paymentReceivables ? (
        <PayReceivablesModal
          categories={entryCategories}
          receivables={paymentReceivables}
          onClose={() => setPaymentReceivables(null)}
          onConfirm={async (payload) => {
            await payReceivables({
              receivableIds: paymentReceivables.map((receivable) => receivable.id),
              ...payload,
            });
            setPaymentReceivables(null);
            await reloadWithNotice('Pagamento agrupado registrado.');
          }}
        />
      ) : null}

      {pixReceivable ? (
        <PixReceivableModal
          receivable={pixReceivable}
          onClose={() => setPixReceivable(null)}
          onChanged={async (message) => {
            await reloadWithNotice(message);
          }}
        />
      ) : null}

      {pixReceivables ? (
        <PixReceivablesModal
          receivables={pixReceivables}
          onClose={() => setPixReceivables(null)}
          onChanged={async (message) => {
            await reloadWithNotice(message);
          }}
        />
      ) : null}

      {cancelingReceivable ? (
        <CancelReceivableModal
          receivable={cancelingReceivable}
          onClose={() => setCancelingReceivable(null)}
          onConfirm={async (reason) => {
            await cancelReceivable(cancelingReceivable.id, { reason });
            setCancelingReceivable(null);
            await reloadWithNotice('Conta a receber cancelada.');
          }}
        />
      ) : null}
      {viewingLegacyPayment ? (
        <LegacyPaymentDetailModal
          receivable={viewingLegacyPayment}
          onClose={() => setViewingLegacyPayment(null)}
        />
      ) : null}
      {transactionModal ? (
        <TransactionModal
          categories={transactionModal.kind === 'ENTRADA' ? entryCategories : expenseCategories}
          clients={clients}
          kind={transactionModal.kind}
          transaction={transactionModal.transaction}
          onClose={() => setTransactionModal(null)}
          onCreate={async (payload) => {
            if (transactionModal.kind === 'ENTRADA') {
              await createManualEntry(payload);
              await reloadWithNotice('Entrada registrada.');
              return;
            }

            await createManualExpense(payload);
            await reloadWithNotice('Saida registrada.');
          }}
          onManualChargeChanged={reloadWithNotice}
          onUpdate={async (id, payload) => {
            await updateFinancialTransaction(id, payload);
            await reloadWithNotice(
              transactionModal.kind === 'ENTRADA' ? 'Entrada atualizada.' : 'Saida atualizada.',
            );
          }}
        />
      ) : null}
    </section>
  );
}

type TransactionFormState = {
  description: string;
  categoryId: string;
  amount: string;
  transactionDate: string;
  clientId: string;
  notes: string;
};

type TransactionModalMode = 'MANUAL_ENTRY' | 'MANUAL_PIX';
type ManualChargePayerMode = 'REGISTERED_CLIENT' | 'GUEST';
type ManualChargeStep = 'FORM' | 'SUMMARY' | 'PIX';
type ManualPixWorkingAction = 'create' | 'generate' | 'whatsapp' | 'replace' | 'cancel' | null;

type ManualChargeFormState = {
  description: string;
  categoryId: string;
  amount: string;
  dueDate: string;
  payerType: ManualChargePayerMode;
  clientId: string;
  payerName: string;
  payerPhone: string;
  provider: ConfigurablePaymentProvider | '';
};

function manualChargeInitialForm(categories: FinancialCategory[]): ManualChargeFormState {
  return {
    description: '',
    categoryId: categories[0]?.id ?? '',
    amount: '',
    dueDate: formatSaoPauloDateInput(new Date()),
    payerType: 'REGISTERED_CLIENT',
    clientId: '',
    payerName: '',
    payerPhone: '',
    provider: '',
  };
}

function transactionInitialForm(categories: FinancialCategory[]): TransactionFormState {
  return {
    description: '',
    categoryId: categories[0]?.id ?? '',
    amount: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    clientId: '',
    notes: '',
  };
}

function transactionFormFromRecord(transaction: FinancialTransaction): TransactionFormState {
  return {
    description: transaction.description,
    categoryId: transaction.categoryId,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    clientId: transaction.clientId ?? '',
    notes: transaction.notes ?? '',
  };
}

function TransactionSection({
  items,
  kind,
  onCreateRequest,
  onDelete,
  onPageChange,
  onUpdateRequest,
  pagination,
}: {
  items: FinancialTransaction[];
  kind: FinancialTransactionType;
  onCreateRequest: () => void;
  onDelete: (id: string) => Promise<void>;
  onPageChange: (page: number) => void;
  onUpdateRequest: (transaction: FinancialTransaction) => void;
  pagination: PaginatedClients['pagination'] | null;
}) {
  return (
    <Card className="finance-panel">
      <SectionHeader
        action={
          <Button
            icon={kind === 'ENTRADA' ? Plus : Minus}
            variant="primary"
            onClick={onCreateRequest}
          >
            {kind === 'ENTRADA' ? 'Nova entrada' : 'Nova saída'}
          </Button>
        }
        eyebrow={kind === 'ENTRADA' ? 'Entradas' : 'Saídas'}
        title={kind === 'ENTRADA' ? 'Movimentações de entrada' : 'Movimentações de saída'}
      />

      <div className="table-wrap finance-table-wrap">
        <table className="finance-global-table finance-transactions-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Cliente</th>
              <th className="finance-amount-column">Valor</th>
              <th className="finance-status-column">Origem</th>
              <th className="finance-actions-column">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.id}>
                <td>{formatDate(transaction.transactionDate)}</td>
                <td>{transaction.description}</td>
                <td>{transaction.category.name}</td>
                <td>
                  {transaction.client?.name ?? '-'}
                  {transaction.client?.reference ? (
                    <span>{transaction.client.reference}</span>
                  ) : null}
                </td>
                <td
                  className={`finance-amount-column ${
                    kind === 'ENTRADA' ? 'finance-value-success' : 'finance-value-warning'
                  }`}
                >
                  {formatCurrency(transaction.amount)}
                </td>
                <td className="finance-status-column">
                  <span className="finance-status-pill tone-info">
                    {financialTransactionOriginLabel(transaction.origin)}
                  </span>
                </td>
                <td className="finance-actions-column">
                  <div className="button-row">
                    <Button
                      disabled={
                        transaction.origin !== 'MANUAL' || Boolean(transaction.receivableId)
                      }
                      icon={Pencil}
                      size="sm"
                      variant="secondary"
                      onClick={() => onUpdateRequest(transaction)}
                    >
                      Editar
                    </Button>
                    <Button
                      disabled={
                        transaction.origin !== 'MANUAL' || Boolean(transaction.receivableId)
                      }
                      icon={Trash2}
                      size="sm"
                      variant="danger"
                      onClick={() => void onDelete(transaction.id)}
                    >
                      Remover
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <div className="empty-state">Nenhuma movimentação encontrada.</div> : null}
        <PaginationControls
          itemLabel="movimentações"
          pagination={pagination}
          onPageChange={onPageChange}
        />
      </div>
    </Card>
  );
}

function TransactionModal({
  categories,
  clients,
  kind,
  transaction,
  onClose,
  onCreate,
  onManualChargeChanged,
  onUpdate,
}: {
  categories: FinancialCategory[];
  clients: Client[];
  kind: FinancialTransactionType;
  transaction: FinancialTransaction | undefined;
  onClose: () => void;
  onCreate: (payload: FinancialTransactionPayload) => Promise<void>;
  onManualChargeChanged: (message: string) => Promise<void>;
  onUpdate: (id: string, payload: Partial<FinancialTransactionPayload>) => Promise<void>;
}) {
  const editing = Boolean(transaction);
  const [form, setForm] = useState<TransactionFormState>(() =>
    transaction ? transactionFormFromRecord(transaction) : transactionInitialForm(categories),
  );
  const [mode, setMode] = useState<TransactionModalMode>('MANUAL_ENTRY');
  const [manualChargeForm, setManualChargeForm] = useState<ManualChargeFormState>(() =>
    manualChargeInitialForm(categories),
  );
  const [manualChargeStep, setManualChargeStep] = useState<ManualChargeStep>('FORM');
  const [manualCharge, setManualCharge] = useState<Receivable | null>(null);
  const [manualPixIntent, setManualPixIntent] = useState<PaymentIntent | null>(null);
  const [paymentProviderCredentials, setPaymentProviderCredentials] = useState<
    PaymentProviderCredentialStatus[]
  >([]);
  const [pixNotice, setPixNotice] = useState('');
  const [pixSendingWhatsApp, setPixSendingWhatsApp] = useState(false);
  const [pixWhatsAppFailed, setPixWhatsAppFailed] = useState(false);
  const [manualPixWorkingAction, setManualPixWorkingAction] =
    useState<ManualPixWorkingAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const manualChargeIdempotencyKeyRef = useRef(createFrontendIdempotencyKey('manual-charge'));
  const manualPixActionRef = useRef(false);
  const categoriesRef = useRef(categories);
  const manualChargeEntryMode = kind === 'ENTRADA' && !editing;
  const activeEntryCategories = categories.filter((category) => category.active !== false);
  const eligiblePixProviders = useMemo(
    () =>
      configurablePaymentProviders.filter((provider) => {
        const credential = paymentProviderCredentials.find((item) => item.provider === provider);
        return credential ? isOperationalPixProviderCredential(credential) : false;
      }),
    [paymentProviderCredentials],
  );
  const defaultPixProvider =
    eligiblePixProviders.find((provider) =>
      paymentProviderCredentials.some(
        (credential) =>
          credential.provider === provider &&
          credential.defaultForPix &&
          isOperationalPixProviderCredential(credential),
      ),
    ) ??
    eligiblePixProviders[0] ??
    null;
  const selectedManualPixProvider =
    manualChargeForm.provider && eligiblePixProviders.includes(manualChargeForm.provider)
      ? manualChargeForm.provider
      : defaultPixProvider;
  const selectedClient = clients.find((client) => client.id === manualChargeForm.clientId) ?? null;
  const manualPixBusy = manualPixWorkingAction !== null;

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    setForm(
      transaction
        ? transactionFormFromRecord(transaction)
        : transactionInitialForm(categoriesRef.current),
    );
    setMode('MANUAL_ENTRY');
    setManualChargeForm(manualChargeInitialForm(categoriesRef.current));
    setManualChargeStep('FORM');
    setManualCharge(null);
    setManualPixIntent(null);
    setPixNotice('');
    setPixWhatsAppFailed(false);
    setManualPixWorkingAction(null);
    manualChargeIdempotencyKeyRef.current = createFrontendIdempotencyKey('manual-charge');
    setFormError('');
  }, [kind, transaction]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      categoryId: current.categoryId || categories[0]?.id || '',
    }));
    setManualChargeForm((current) => ({
      ...current,
      categoryId: current.categoryId || categories[0]?.id || '',
    }));
  }, [categories]);

  useEffect(() => {
    if (!manualChargeEntryMode || mode !== 'MANUAL_PIX') return;

    void listPaymentProviderCredentials()
      .then((credentials) => setPaymentProviderCredentials(credentials))
      .catch(() => setPaymentProviderCredentials([]));
  }, [manualChargeEntryMode, mode]);

  useEffect(() => {
    if (!defaultPixProvider) return;
    setManualChargeForm((current) => ({
      ...current,
      provider:
        current.provider && eligiblePixProviders.includes(current.provider)
          ? current.provider
          : defaultPixProvider,
    }));
  }, [defaultPixProvider, eligiblePixProviders]);

  function closeAndReset() {
    setForm(transactionInitialForm(categories));
    setMode('MANUAL_ENTRY');
    setManualChargeForm(manualChargeInitialForm(categories));
    setManualChargeStep('FORM');
    setManualCharge(null);
    setManualPixIntent(null);
    setPixNotice('');
    setPixWhatsAppFailed(false);
    setManualPixWorkingAction(null);
    setFormError('');
    onClose();
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    if (manualChargeEntryMode && mode === 'MANUAL_PIX') {
      await submitManualCharge();
      return;
    }

    const amount = Number(form.amount);
    if (!form.description.trim() || !form.categoryId || !form.transactionDate || amount <= 0) {
      setFormError('Preencha descrição, categoria, valor e data antes de salvar.');
      return;
    }

    const payload = {
      description: form.description.trim(),
      categoryId: form.categoryId,
      amount,
      transactionDate: form.transactionDate,
      ...(form.clientId ? { clientId: form.clientId } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    try {
      setSubmitting(true);
      if (transaction) {
        await onUpdate(transaction.id, payload);
      } else {
        await onCreate(payload);
      }
      closeAndReset();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar movimentação.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitManualCharge() {
    if (manualPixBusy || manualPixActionRef.current) return;

    const amount = Number(manualChargeForm.amount);
    const description = manualChargeForm.description.trim();

    if (!description || !manualChargeForm.categoryId || !manualChargeForm.dueDate || amount <= 0) {
      setFormError('Preencha descrição, categoria, valor e vencimento antes de criar.');
      return;
    }

    if (manualChargeForm.payerType === 'REGISTERED_CLIENT' && !manualChargeForm.clientId) {
      setFormError('Selecione um cliente cadastrado para continuar.');
      return;
    }

    if (manualChargeForm.payerType === 'GUEST') {
      if (!manualChargeForm.payerName.trim()) {
        setFormError('Informe o nome do pagador avulso.');
        return;
      }

      if (
        !manualChargeForm.payerPhone.trim() ||
        onlyDigits(manualChargeForm.payerPhone).length < 10
      ) {
        setFormError('Informe um WhatsApp válido para o pagador.');
        return;
      }
    }

    manualPixActionRef.current = true;
    setManualPixWorkingAction('create');
    setFormError('');

    try {
      const receivable = await createManualCharge({
        amount,
        categoryId: manualChargeForm.categoryId,
        description,
        dueDate: manualChargeForm.dueDate,
        idempotencyKey: manualChargeIdempotencyKeyRef.current,
        payerType: manualChargeForm.payerType,
        ...(manualChargeForm.payerType === 'REGISTERED_CLIENT'
          ? { clientId: manualChargeForm.clientId }
          : {
              payerName: manualChargeForm.payerName.trim(),
              payerPhone: manualChargeForm.payerPhone.trim(),
            }),
      });

      setManualCharge(receivable);
      setManualPixIntent(receivable.activePix ?? receivable.paymentIntents?.[0] ?? null);
      setManualChargeStep(receivable.activePix ? 'PIX' : 'SUMMARY');
      setPixNotice(receivable.activePix ? 'Cobrança encontrada com PIX ativo.' : '');
      setPixWhatsAppFailed(false);
      await onManualChargeChanged('Cobrança PIX criada.');
    } catch (err) {
      setFormError(manualPixFriendlyError(err, 'Não foi possível criar a cobrança PIX.'));
    } finally {
      setManualPixWorkingAction(null);
      manualPixActionRef.current = false;
    }
  }

  async function generateManualPix() {
    if (!manualCharge || manualPixActionRef.current || !selectedManualPixProvider) return;

    manualPixActionRef.current = true;
    setManualPixWorkingAction('generate');
    setFormError('');
    setPixNotice('');

    try {
      const intent = await createReceivablePix(manualCharge.id, selectedManualPixProvider);
      setManualPixIntent(intent);
      setManualChargeStep('PIX');
      setPixNotice('PIX gerado.');
      setPixWhatsAppFailed(false);
      await onManualChargeChanged('PIX gerado.');
    } catch (err) {
      const conflict = activePixConflictPayloadFromError(err);
      if (conflict?.activePix.type === 'INDIVIDUAL') {
        setManualPixIntent(conflict.activePix.paymentIntent);
        setManualChargeStep('PIX');
        setPixNotice('PIX ativo encontrado.');
        setPixWhatsAppFailed(false);
        return;
      }

      setFormError(manualPixFriendlyError(err, 'Não foi possível gerar o PIX.'));
    } finally {
      setManualPixWorkingAction(null);
      manualPixActionRef.current = false;
    }
  }

  async function copyManualPix() {
    if (!manualPixIntent?.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(manualPixIntent.pixCopyPaste);
      setPixNotice('PIX copiado.');
    } catch {
      setFormError('Não foi possível copiar o PIX. Copie o código manualmente.');
    }
  }

  async function sendManualPixWhatsApp() {
    if (!manualPixIntent || manualPixActionRef.current || pixSendingWhatsApp) return;

    manualPixActionRef.current = true;
    setPixSendingWhatsApp(true);
    setManualPixWorkingAction('whatsapp');
    setFormError('');
    setPixNotice('');
    setPixWhatsAppFailed(false);

    try {
      const result = await sendPaymentIntentWhatsApp(manualPixIntent.id);
      if (!result.success) {
        throw new Error(result.errorMessage ?? 'Não foi possível enviar pelo WhatsApp.');
      }

      setPixNotice(
        result.reused || result.idempotent
          ? 'Cobrança já estava enviada pelo WhatsApp.'
          : 'Cobrança enviada pelo WhatsApp.',
      );
      setPixWhatsAppFailed(false);
    } catch (err) {
      setFormError(manualPixFriendlyError(err, 'Não foi possível enviar pelo WhatsApp.'));
      setPixWhatsAppFailed(true);
    } finally {
      setManualPixWorkingAction(null);
      setPixSendingWhatsApp(false);
      manualPixActionRef.current = false;
    }
  }

  async function replaceManualPixProvider() {
    if (
      !manualCharge ||
      !manualPixIntent ||
      !selectedManualPixProvider ||
      manualPixActionRef.current
    ) {
      return;
    }

    manualPixActionRef.current = true;
    setManualPixWorkingAction('replace');
    setFormError('');
    setPixNotice('');

    try {
      const intent = await replaceReceivablePix(manualCharge.id, {
        expectedCurrentIntentId: manualPixIntent.id,
        idempotencyKey: `manual-pix-replace:${manualCharge.id}:${manualPixIntent.id}:${selectedManualPixProvider}`,
        provider: selectedManualPixProvider,
        reason: 'Troca de provider pela cobrança PIX manual',
      });
      setManualPixIntent(intent);
      setPixNotice('Provider trocado e novo PIX gerado.');
      setPixWhatsAppFailed(false);
      await onManualChargeChanged('PIX substituído.');
    } catch (err) {
      setFormError(manualPixFriendlyError(err, 'Não foi possível trocar o provider.'));
    } finally {
      setManualPixWorkingAction(null);
      manualPixActionRef.current = false;
    }
  }

  async function cancelManualCharge() {
    if (!manualCharge || manualCharge.status !== 'PENDENTE' || manualPixActionRef.current) return;
    if (!window.confirm('Cancelar esta cobrança PIX?')) return;

    manualPixActionRef.current = true;
    setManualPixWorkingAction('cancel');
    setFormError('');
    setPixNotice('');

    try {
      const canceled = await cancelReceivable(manualCharge.id, {
        reason: 'Cancelada pelo financeiro',
      });
      setManualCharge(canceled);
      setPixNotice('Cobrança cancelada.');
      setPixWhatsAppFailed(false);
      await onManualChargeChanged('Cobrança cancelada.');
    } catch (err) {
      setFormError(manualPixFriendlyError(err, 'Não foi possível cancelar a cobrança.'));
    } finally {
      setManualPixWorkingAction(null);
      manualPixActionRef.current = false;
    }
  }

  const title = editing
    ? kind === 'ENTRADA'
      ? 'Editar entrada'
      : 'Editar saída'
    : kind === 'ENTRADA'
      ? 'Nova entrada'
      : 'Nova saída';
  const description =
    kind === 'ENTRADA'
      ? 'Registre uma nova movimentação de entrada.'
      : 'Registre uma nova movimentação de saída.';

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal finance-transaction-modal"
        aria-labelledby="transaction-modal-title"
      >
        <header className="modal-header modal-header-with-icon">
          <span
            className={kind === 'ENTRADA' ? 'modal-icon' : 'modal-icon warning'}
            aria-hidden="true"
          >
            {kind === 'ENTRADA' ? <Plus size={16} /> : <Minus size={16} />}
          </span>
          <div>
            <h2 id="transaction-modal-title">{title}</h2>
            <p>{description}</p>
          </div>
          <IconButton icon={X} label="Fechar" onClick={closeAndReset} />
        </header>

        {formError ? (
          <div className="notice danger" id="transaction-form-error" role="alert">
            {formError}
          </div>
        ) : null}

        <form
          aria-describedby={formError ? 'transaction-form-error' : undefined}
          className={`entity-form finance-transaction-modal-form${
            manualChargeEntryMode && mode === 'MANUAL_PIX' ? ' manual-pix-modal-form' : ''
          }`}
          onSubmit={(event) => void submitForm(event)}
        >
          {manualChargeEntryMode ? (
            <fieldset className="manual-charge-choice">
              <legend>Tipo</legend>
              <label className={mode === 'MANUAL_ENTRY' ? 'active' : ''}>
                <input
                  checked={mode === 'MANUAL_ENTRY'}
                  name="transaction-mode"
                  type="radio"
                  value="MANUAL_ENTRY"
                  onChange={() => {
                    setMode('MANUAL_ENTRY');
                    setFormError('');
                  }}
                />
                <span>
                  <strong>Entrada manual</strong>
                  <small>Lança a entrada imediatamente.</small>
                </span>
              </label>
              <label className={mode === 'MANUAL_PIX' ? 'active' : ''}>
                <input
                  checked={mode === 'MANUAL_PIX'}
                  name="transaction-mode"
                  type="radio"
                  value="MANUAL_PIX"
                  onChange={() => {
                    setMode('MANUAL_PIX');
                    setFormError('');
                  }}
                />
                <span>
                  <strong>Cobrança PIX</strong>
                  <small>Cria uma conta a receber para gerar PIX.</small>
                </span>
              </label>
            </fieldset>
          ) : null}

          {mode === 'MANUAL_ENTRY' || !manualChargeEntryMode ? (
            <>
              <label className="field">
                <span>Descrição</span>
                <input
                  required
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Categoria</span>
                <select
                  required
                  value={form.categoryId}
                  onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor</span>
                <input
                  min="0.01"
                  required
                  step="0.01"
                  type="number"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Data</span>
                <input
                  required
                  type="date"
                  value={form.transactionDate}
                  onChange={(event) => setForm({ ...form, transactionDate: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Cliente</span>
                <select
                  value={form.clientId}
                  onChange={(event) => setForm({ ...form, clientId: event.target.value })}
                >
                  <option value="">Sem cliente</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Observação</span>
                <input
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </>
          ) : null}

          {manualChargeEntryMode && mode === 'MANUAL_PIX' ? (
            <ManualPixChargeContent
              categories={activeEntryCategories}
              clients={clients}
              defaultPixProvider={defaultPixProvider}
              eligiblePixProviders={eligiblePixProviders}
              form={manualChargeForm}
              manualCharge={manualCharge}
              pixIntent={manualPixIntent}
              pixNotice={pixNotice}
              pixWhatsAppFailed={pixWhatsAppFailed}
              selectedClient={selectedClient}
              selectedPixProvider={selectedManualPixProvider}
              step={manualChargeStep}
              workingAction={manualPixWorkingAction}
              whatsAppSending={pixSendingWhatsApp}
              onCancelCharge={() => void cancelManualCharge()}
              onCopyPix={() => void copyManualPix()}
              onGeneratePix={() => void generateManualPix()}
              onReplaceProvider={() => void replaceManualPixProvider()}
              onSendWhatsApp={() => void sendManualPixWhatsApp()}
              onUpdateForm={setManualChargeForm}
            />
          ) : null}
          <div className="form-actions">
            <Button icon={X} variant="secondary" onClick={closeAndReset}>
              Cancelar
            </Button>
            <Button
              disabled={manualChargeEntryMode && mode === 'MANUAL_PIX' && Boolean(manualCharge)}
              icon={Save}
              loading={
                manualChargeEntryMode && mode === 'MANUAL_PIX'
                  ? manualPixWorkingAction === 'create'
                  : submitting
              }
              type="submit"
              variant="primary"
            >
              {manualChargeEntryMode && mode === 'MANUAL_PIX'
                ? manualCharge
                  ? 'Cobrança criada'
                  : 'Criar cobrança'
                : kind === 'ENTRADA'
                  ? 'Salvar entrada'
                  : 'Salvar saída'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ManualPixChargeContent({
  categories,
  clients,
  defaultPixProvider,
  eligiblePixProviders,
  form,
  manualCharge,
  pixIntent,
  pixNotice,
  pixWhatsAppFailed,
  selectedClient,
  selectedPixProvider,
  step,
  workingAction,
  whatsAppSending,
  onCancelCharge,
  onCopyPix,
  onGeneratePix,
  onReplaceProvider,
  onSendWhatsApp,
  onUpdateForm,
}: {
  categories: FinancialCategory[];
  clients: Client[];
  defaultPixProvider: ConfigurablePaymentProvider | null;
  eligiblePixProviders: ConfigurablePaymentProvider[];
  form: ManualChargeFormState;
  manualCharge: Receivable | null;
  pixIntent: PaymentIntent | null;
  pixNotice: string;
  pixWhatsAppFailed: boolean;
  selectedClient: Client | null;
  selectedPixProvider: ConfigurablePaymentProvider | null;
  step: ManualChargeStep;
  workingAction: ManualPixWorkingAction;
  whatsAppSending: boolean;
  onCancelCharge: () => void;
  onCopyPix: () => void;
  onGeneratePix: () => void;
  onReplaceProvider: () => void;
  onSendWhatsApp: () => void;
  onUpdateForm: (form: ManualChargeFormState) => void;
}) {
  const canUsePixActions = Boolean(manualCharge && manualCharge.status === 'PENDENTE');
  const busy = workingAction !== null;
  const hasActivePixIntent = Boolean(
    pixIntent && ['CREATED', 'WAITING_PAYMENT'].includes(pixIntent.status),
  );
  const canSendWhatsApp = Boolean(
    canUsePixActions && pixIntent?.status === 'WAITING_PAYMENT' && pixIntent.pixCopyPaste,
  );
  const canReplaceProvider = Boolean(
    canUsePixActions &&
    pixIntent?.status === 'WAITING_PAYMENT' &&
    selectedPixProvider &&
    selectedPixProvider !== pixIntent.provider,
  );
  const canCancel = Boolean(manualCharge?.status === 'PENDENTE');
  const payerLabel = manualCharge ? receivablePayerLabel(manualCharge) : '';
  const chargeCategory = manualCharge?.category?.name ?? '-';
  const canRenderQrImage =
    pixIntent?.qrCodeData?.startsWith('data:') || pixIntent?.qrCodeData?.startsWith('http');

  return (
    <div className="manual-pix-flow">
      <div className="manual-pix-stepper" aria-label="Etapas da cobrança PIX">
        {[
          ['FORM', 'Dados'],
          ['SUMMARY', 'Cobrança'],
          ['PIX', 'PIX'],
        ].map(([id, label], index) => {
          const currentIndex = ['FORM', 'SUMMARY', 'PIX'].indexOf(step);
          return (
            <span
              className={index <= currentIndex ? 'active' : ''}
              key={id}
              aria-current={step === id ? 'step' : undefined}
            >
              {label}
            </span>
          );
        })}
      </div>

      {step === 'FORM' ? (
        <>
          <fieldset className="manual-charge-choice compact">
            <legend>Pagador</legend>
            <label className={form.payerType === 'REGISTERED_CLIENT' ? 'active' : ''}>
              <input
                checked={form.payerType === 'REGISTERED_CLIENT'}
                name="manual-charge-payer"
                type="radio"
                value="REGISTERED_CLIENT"
                onChange={() => onUpdateForm({ ...form, payerType: 'REGISTERED_CLIENT' })}
              />
              <span>
                <strong>Cliente cadastrado</strong>
                <small>Usa o cadastro como origem do snapshot.</small>
              </span>
            </label>
            <label className={form.payerType === 'GUEST' ? 'active' : ''}>
              <input
                checked={form.payerType === 'GUEST'}
                name="manual-charge-payer"
                type="radio"
                value="GUEST"
                onChange={() => onUpdateForm({ ...form, payerType: 'GUEST' })}
              />
              <span>
                <strong>Pagador avulso</strong>
                <small>Não cria cliente automaticamente.</small>
              </span>
            </label>
          </fieldset>

          {form.payerType === 'REGISTERED_CLIENT' ? (
            <label className="field manual-pix-full">
              <span>Cliente</span>
              <select
                required
                value={form.clientId}
                onChange={(event) => onUpdateForm({ ...form, clientId: event.target.value })}
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {selectedClient ? (
                <small>
                  {selectedClient.name} ·{' '}
                  {normalizeWhatsAppDisplayPhone(selectedClient.phoneNormalized) ??
                    selectedClient.phoneNormalized}
                </small>
              ) : null}
            </label>
          ) : (
            <>
              <label className="field">
                <span>Nome</span>
                <input
                  required
                  value={form.payerName}
                  onChange={(event) => onUpdateForm({ ...form, payerName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>WhatsApp</span>
                <input
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  required
                  value={form.payerPhone}
                  onChange={(event) => onUpdateForm({ ...form, payerPhone: event.target.value })}
                />
              </label>
            </>
          )}

          <label className="field">
            <span>Descrição</span>
            <input
              required
              value={form.description}
              onChange={(event) => onUpdateForm({ ...form, description: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Categoria</span>
            <select
              required
              value={form.categoryId}
              onChange={(event) => onUpdateForm({ ...form, categoryId: event.target.value })}
            >
              <option value="">Selecione</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Valor</span>
            <input
              min="0.01"
              required
              step="0.01"
              type="number"
              value={form.amount}
              onChange={(event) => onUpdateForm({ ...form, amount: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Vencimento</span>
            <input
              required
              type="date"
              value={form.dueDate}
              onChange={(event) => onUpdateForm({ ...form, dueDate: event.target.value })}
            />
          </label>
          <label className="field manual-pix-full">
            <span>Provider PIX</span>
            <select
              disabled={!eligiblePixProviders.length}
              value={selectedPixProvider ?? ''}
              onChange={(event) =>
                onUpdateForm({
                  ...form,
                  provider: event.target.value as ConfigurablePaymentProvider,
                })
              }
            >
              {!eligiblePixProviders.length ? (
                <option value="">Nenhum provider ativo</option>
              ) : null}
              {eligiblePixProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {replacementProviderLabel(provider, defaultPixProvider)}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      {manualCharge ? (
        <section className="manual-pix-summary manual-pix-full">
          <div className="pix-status-row">
            <strong>{manualCharge.status === 'CANCELADO' ? 'CANCELADO' : 'PENDENTE'}</strong>
            <span>{receivablePurposeLabel(manualCharge)}</span>
          </div>
          <dl className="detail-list compact-detail-list">
            <div>
              <dt>Pagador</dt>
              <dd>{payerLabel}</dd>
            </div>
            <div>
              <dt>Descrição</dt>
              <dd>{manualCharge.description}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{chargeCategory}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{formatCurrency(manualCharge.amount)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{formatDate(manualCharge.dueDate)}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{manualCharge.payerPhoneMasked ?? '-'}</dd>
            </div>
          </dl>
          {pixNotice ? <div className="notice success">{pixNotice}</div> : null}
          <div className="button-row manual-pix-actions">
            <Button
              disabled={busy || !selectedPixProvider || !canUsePixActions || hasActivePixIntent}
              icon={QrCode}
              loading={workingAction === 'generate'}
              variant="primary"
              onClick={onGeneratePix}
            >
              Gerar PIX
            </Button>
            <Button
              disabled={busy || !canCancel}
              icon={XCircle}
              loading={workingAction === 'cancel'}
              variant="danger"
              onClick={onCancelCharge}
            >
              Cancelar cobrança
            </Button>
          </div>
        </section>
      ) : null}

      {pixIntent ? (
        <section className="pix-panel manual-pix-result manual-pix-full">
          <div className="pix-status-row">
            <strong>{paymentIntentStatusLabel(pixIntent.status)}</strong>
            <span>{paymentProviderDisplay(pixIntent.provider)}</span>
          </div>
          <dl className="detail-list compact-detail-list pix-current-details">
            <div>
              <dt>Valor</dt>
              <dd>{formatCurrency(pixIntent.amount)}</dd>
            </div>
            <div>
              <dt>Transação</dt>
              <dd>{paymentIntentDisplayTransactionId(pixIntent)}</dd>
            </div>
            <div>
              <dt>Expiração</dt>
              <dd>{pixIntent.expiresAt ? formatDateTime(pixIntent.expiresAt) : '-'}</dd>
            </div>
          </dl>
          <label className="field pix-copy-field">
            <span>PIX copia e cola</span>
            <div className="pix-copy-row">
              <input readOnly value={pixIntent.pixCopyPaste ?? ''} />
              <button
                className="secondary-button compact"
                disabled={!pixIntent.pixCopyPaste}
                type="button"
                onClick={onCopyPix}
              >
                <Copy aria-hidden="true" size={16} />
                {pixNotice === 'PIX copiado.' ? 'Copiado' : 'Copiar PIX'}
              </button>
            </div>
          </label>
          {pixIntent.qrCodeData ? (
            <div className="pix-qr" aria-label="QR Code PIX">
              {canRenderQrImage ? (
                <img alt="QR Code PIX" src={pixIntent.qrCodeData} />
              ) : (
                <>
                  <QrCode aria-hidden="true" size={92} />
                  <span>{pixIntent.qrCodeData}</span>
                </>
              )}
            </div>
          ) : null}
          <div className="button-row manual-pix-actions">
            <Button
              disabled={!pixIntent.pixCopyPaste}
              icon={Copy}
              variant="secondary"
              onClick={onCopyPix}
            >
              Copiar PIX
            </Button>
            <Button
              disabled={!canSendWhatsApp || busy || whatsAppSending}
              icon={MessageCircle}
              loading={whatsAppSending}
              variant="primary"
              onClick={onSendWhatsApp}
            >
              {pixWhatsAppFailed && !whatsAppSending ? 'Tentar novamente' : 'Enviar no WhatsApp'}
            </Button>
          </div>
          {eligiblePixProviders.length ? (
            <div className="manual-pix-provider-swap">
              <label className="field">
                <span>Trocar provider</span>
                <select
                  value={selectedPixProvider ?? ''}
                  onChange={(event) =>
                    onUpdateForm({
                      ...form,
                      provider: event.target.value as ConfigurablePaymentProvider,
                    })
                  }
                >
                  {eligiblePixProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {replacementProviderLabel(provider, defaultPixProvider)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={!canReplaceProvider || busy}
                icon={RefreshCcw}
                loading={workingAction === 'replace'}
                variant="secondary"
                onClick={onReplaceProvider}
              >
                Trocar provider
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function FinancialCategoriesView({
  categories,
  onCreate,
  onDelete,
  onUpdate,
}: {
  categories: FinancialCategory[];
  onCreate: (payload: {
    name: string;
    type: FinancialTransactionType;
    active?: boolean;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (
    id: string,
    payload: Partial<{ name: string; type: FinancialTransactionType; active: boolean }>,
  ) => Promise<void>;
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialTransactionType>('ENTRADA');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<FinancialTransactionType>('ENTRADA');
  const [editActive, setEditActive] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FinancialTransactionType | ''>('');
  const [statusFilter, setStatusFilter] = useState<FinancialCategoryStatusFilter>('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const { canSubmit, nameTooLong } = getFinancialCategoryFormState(name, working);
  const { canSubmit: canSubmitEdit, nameTooLong: editNameTooLong } = getFinancialCategoryFormState(
    editName,
    working,
  );
  const filteredCategories = filterFinancialCategories(categories, {
    search,
    status: statusFilter,
    type: typeFilter,
  });
  const categorySummary = summarizeFinancialCategories(categories);
  const hasFilters = Boolean(search.trim() || typeFilter || statusFilter);
  const emptyTitle = categories.length
    ? 'Nenhuma categoria encontrada.'
    : 'Nenhuma categoria cadastrada.';
  const emptyDescription = categories.length
    ? 'Ajuste a busca ou filtros para encontrar outra categoria.'
    : 'Crie a primeira categoria para classificar entradas e saídas.';

  function resetCreateModal() {
    setName('');
    setType('ENTRADA');
    setError('');
    setWorking(false);
    submittingRef.current = false;
  }

  function openCreateModal() {
    resetCreateModal();
    setCreateModalOpen(true);
  }

  function closeCreateModal() {
    setCreateModalOpen(false);
    resetCreateModal();
  }

  function openEditModal(category: FinancialCategory) {
    setError('');
    setEditName(category.name);
    setEditType(category.type);
    setEditActive(category.active);
    setEditingCategory(category);
  }

  function closeEditModal() {
    setEditingCategory(null);
    setEditName('');
    setEditType('ENTRADA');
    setEditActive(true);
    setError('');
    setWorking(false);
    submittingRef.current = false;
  }

  useEffect(() => {
    if (!createModalOpen && !editingCategory) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingRef.current) {
        if (createModalOpen) closeCreateModal();
        if (editingCategory) closeEditModal();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [createModalOpen, editingCategory]);

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (submittingRef.current) return;

    let payload: ReturnType<typeof buildFinancialCategoryCreatePayload>;
    try {
      payload = buildFinancialCategoryCreatePayload({ name, type });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria.');
      return;
    }

    submittingRef.current = true;
    setWorking(true);

    try {
      await onCreate(payload);
      closeCreateModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a categoria.');
    } finally {
      submittingRef.current = false;
      setWorking(false);
    }
  }

  async function submitEditCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!editingCategory || submittingRef.current) return;

    const formState = getFinancialCategoryFormState(editName);
    if (!formState.canSubmit) {
      setError(
        formState.nameTooLong ? 'Nome da categoria muito longo.' : 'Informe o nome da categoria.',
      );
      return;
    }

    submittingRef.current = true;
    setWorking(true);

    try {
      await onUpdate(editingCategory.id, {
        active: editActive,
        name: formState.trimmedName,
        type: editType,
      });
      closeEditModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a categoria.');
    } finally {
      submittingRef.current = false;
      setWorking(false);
    }
  }

  async function runCategoryAction(action: () => Promise<void>) {
    setError('');

    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a categoria.');
    }
  }

  return (
    <Card className="finance-panel">
      <SectionHeader
        action={
          <Button icon={Plus} size="sm" variant="primary" onClick={openCreateModal}>
            Nova categoria
          </Button>
        }
        eyebrow="Categorias"
        title="Classificação financeira"
      />

      <div className="metric-grid finance-category-summary">
        <StatCard
          icon={Layers}
          label="Categorias ativas"
          tone="info"
          value={categorySummary.active}
        />
        <StatCard
          icon={ArrowRight}
          label="Entradas"
          tone="success"
          value={categorySummary.entries}
        />
        <StatCard icon={ArrowLeft} label="Saídas" tone="warning" value={categorySummary.expenses} />
        <StatCard icon={Power} label="Inativas" tone="danger" value={categorySummary.inactive} />
      </div>

      <div className="toolbar finance-category-toolbar">
        <div className="search-row">
          <Search aria-hidden="true" size={18} />
          <input
            placeholder="Buscar categoria..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as FinancialTransactionType | '')}
        >
          <option value="">Todos os tipos</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SAIDA">Saída</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as FinancialCategoryStatusFilter)}
        >
          <option value="">Todos os status</option>
          <option value="active">Ativas</option>
          <option value="inactive">Inativas</option>
        </select>
      </div>

      <div className="table-wrap finance-table-wrap finance-category-table-wrap">
        <table className="finance-global-table finance-category-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th className="finance-status-column">Tipo</th>
              <th className="finance-status-column">Status</th>
              <th className="finance-actions-column">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredCategories.map((category) => (
              <tr key={category.id}>
                <td data-label="Nome">
                  <strong className="category-name">{category.name}</strong>
                </td>
                <td className="finance-status-column" data-label="Tipo">
                  <span
                    className={`finance-status-pill ${
                      category.type === 'ENTRADA' ? 'tone-success' : 'tone-warning'
                    }`}
                  >
                    {financialCategoryTypeLabel(category.type)}
                  </span>
                </td>
                <td className="finance-status-column" data-label="Status">
                  <span
                    className={`finance-status-pill ${
                      category.active ? 'tone-success' : 'tone-danger'
                    }`}
                  >
                    {category.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="finance-actions-column" data-label="Ações">
                  <ActionMenu
                    items={[
                      {
                        icon: Pencil,
                        label: 'Editar',
                        onSelect: () => openEditModal(category),
                      },
                      {
                        icon: Power,
                        label: category.active ? 'Inativar' : 'Ativar',
                        onSelect: () => {
                          if (
                            category.active &&
                            !window.confirm(
                              `Inativar a categoria "${category.name}"? Ela deixará de aparecer para novas movimentações.`,
                            )
                          ) {
                            return;
                          }

                          void runCategoryAction(() =>
                            onUpdate(category.id, { active: !category.active }),
                          );
                        },
                      },
                      {
                        danger: true,
                        icon: Trash2,
                        label: 'Remover',
                        onSelect: () => {
                          if (
                            !window.confirm(
                              `Remover a categoria "${category.name}"? Se ela estiver em uso, será inativada.`,
                            )
                          ) {
                            return;
                          }

                          void runCategoryAction(() => onDelete(category.id));
                        },
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filteredCategories.length ? (
          <div className="empty-state finance-category-empty-state">
            <strong>{hasFilters ? 'Nenhuma categoria encontrada.' : emptyTitle}</strong>
            <span>{emptyDescription}</span>
          </div>
        ) : null}
      </div>

      {createModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="financial-category-modal-title"
            className="modal finance-category-modal"
          >
            <header className="modal-header modal-header-with-icon">
              <span className="modal-icon info" aria-hidden="true">
                <Layers size={16} />
              </span>
              <div>
                <h2 id="financial-category-modal-title">Nova categoria</h2>
                <p>Cadastre uma classificação para suas movimentações financeiras.</p>
              </div>
              <IconButton
                disabled={working}
                icon={X}
                label="Fechar nova categoria"
                onClick={closeCreateModal}
              />
            </header>

            <form
              className="finance-category-modal-form"
              onSubmit={(event) => void submitCategory(event)}
            >
              <label className="field">
                <span>Nome da categoria</span>
                <input
                  aria-describedby="financial-category-error"
                  autoFocus
                  placeholder="Ex.: Marketing"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as FinancialTransactionType)}
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="SAIDA">Saída</option>
                </select>
              </label>

              {error ? (
                <div className="notice danger" id="financial-category-error" role="alert">
                  {error}
                </div>
              ) : null}
              {!error && nameTooLong ? (
                <div className="notice danger" id="financial-category-error" role="alert">
                  Nome da categoria muito longo.
                </div>
              ) : null}

              <div className="form-actions">
                <span />
                <div className="button-row">
                  <Button
                    disabled={working}
                    icon={X}
                    variant="secondary"
                    onClick={closeCreateModal}
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={!canSubmit}
                    icon={Plus}
                    loading={working}
                    type="submit"
                    variant="primary"
                  >
                    Criar categoria
                  </Button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingCategory ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="financial-category-edit-modal-title"
            className="modal finance-category-modal"
          >
            <header className="modal-header modal-header-with-icon">
              <span className="modal-icon info" aria-hidden="true">
                <Layers size={16} />
              </span>
              <div>
                <h2 id="financial-category-edit-modal-title">Editar categoria</h2>
                <p>Ajuste a classificação usada nas movimentações financeiras.</p>
              </div>
              <IconButton
                disabled={working}
                icon={X}
                label="Fechar edição de categoria"
                onClick={closeEditModal}
              />
            </header>

            <form
              className="finance-category-modal-form"
              onSubmit={(event) => void submitEditCategory(event)}
            >
              <label className="field">
                <span>Nome da categoria</span>
                <input
                  aria-describedby="financial-category-edit-error"
                  autoFocus
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Tipo</span>
                <select
                  value={editType}
                  onChange={(event) => setEditType(event.target.value as FinancialTransactionType)}
                >
                  <option value="ENTRADA">Entrada</option>
                  <option value="SAIDA">Saída</option>
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={editActive ? 'active' : 'inactive'}
                  onChange={(event) => setEditActive(event.target.value === 'active')}
                >
                  <option value="active">Ativa</option>
                  <option value="inactive">Inativa</option>
                </select>
              </label>

              {error ? (
                <div className="notice danger" id="financial-category-edit-error" role="alert">
                  {error}
                </div>
              ) : null}
              {!error && editNameTooLong ? (
                <div className="notice danger" id="financial-category-edit-error" role="alert">
                  Nome da categoria muito longo.
                </div>
              ) : null}

              <div className="notice info">
                Categorias utilizadas por processos automáticos podem impactar baixas e
                recebimentos.
              </div>

              <div className="form-actions">
                <span />
                <div className="button-row">
                  <Button disabled={working} icon={X} variant="secondary" onClick={closeEditModal}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={!canSubmitEdit}
                    icon={Save}
                    loading={working}
                    type="submit"
                    variant="primary"
                  >
                    Salvar categoria
                  </Button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </Card>
  );
}

function financeReceivableTone(receivable: Pick<Receivable, 'displayStatus' | 'status'>) {
  const status = receivableVisualStatus(receivable);

  if (status === 'PENDENTE') return 'warning';
  if (status === 'PAGO') return 'success';
  if (status === 'CANCELADO') return 'muted';

  return 'danger';
}

function financialTransactionOriginLabel(origin: FinancialTransactionOrigin) {
  const labels = {
    LEGACY_IMPORT: 'Importação histórica',
    MANUAL: 'Manual',
    RECEIVABLE_PAYMENT: 'Conta a receber',
  } satisfies Record<FinancialTransactionOrigin, string>;

  return labels[origin];
}

function financialPaymentMethodLabel(method: FinancialPaymentMethod | null) {
  if (!method) return '-';

  const labels = {
    BOLETO: 'Boleto',
    CARTAO: 'Cartão',
    PIX: 'PIX',
    TRANSFERENCIA: 'Transferência',
  } satisfies Record<FinancialPaymentMethod, string>;

  return labels[method];
}

function isLegacyImportReceivable(receivable: Receivable) {
  return receivable.sourceKind === 'LEGACY_IMPORT' || receivable.origin === 'LEGACY_IMPORT';
}

function isManualChargeReceivable(receivable: Pick<Receivable, 'purpose'>) {
  return receivable.purpose === 'MANUAL_CHARGE';
}

function receivablePayerLabel(receivable: Pick<Receivable, 'client' | 'payerName'>) {
  return receivable.client?.name ?? receivable.payerName ?? '-';
}

function receivableReferenceLabel(
  receivable: Pick<Receivable, 'client' | 'clientReference' | 'purpose'>,
) {
  if (receivable.clientReference?.reference) return receivable.clientReference.reference;
  if (isManualChargeReceivable(receivable)) return 'Cobrança avulsa';
  return receivable.client?.reference ?? '-';
}

function receivablePurposeLabel(receivable: Pick<Receivable, 'purpose'>) {
  return isManualChargeReceivable(receivable) ? 'Cobrança PIX' : 'Cobrança recorrente';
}

function manualPixFriendlyError(error: unknown, fallback: string) {
  const rawPayload =
    error instanceof ApiError && error.payload && typeof error.payload === 'object'
      ? (error.payload as { code?: unknown; message?: unknown })
      : null;
  const candidates = [
    typeof rawPayload?.code === 'string' ? rawPayload.code : '',
    typeof rawPayload?.message === 'string' ? rawPayload.message : '',
    error instanceof Error ? error.message : '',
  ].filter(Boolean);
  const knownMessage = candidates
    .map((candidate) => manualPixKnownErrorMessage(candidate))
    .find(Boolean);

  if (knownMessage) return knownMessage;

  const message = candidates.find((candidate) => !manualPixLooksTechnical(candidate));
  return message || fallback;
}

function manualPixKnownErrorMessage(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized.includes('active_pix_conflict') || normalized.includes('active intent')) {
    return 'Já existe um PIX ativo para esta cobrança.';
  }
  if (normalized.includes('client') && normalized.includes('not found')) {
    return 'Cliente não encontrado. Atualize a lista e tente novamente.';
  }
  if (normalized.includes('cliente inexistente')) {
    return 'Cliente não encontrado. Atualize a lista e tente novamente.';
  }
  if (normalized.includes('categor') && normalized.includes('invalid')) {
    return 'Categoria inválida ou indisponível.';
  }
  if (normalized.includes('categoria') && normalized.includes('inval')) {
    return 'Categoria inválida ou indisponível.';
  }
  if (normalized.includes('telefone') || normalized.includes('phone')) {
    return 'Telefone inválido para envio pelo WhatsApp.';
  }
  if (normalized.includes('provider') && normalized.includes('unavailable')) {
    return 'Provider PIX indisponível no momento.';
  }
  if (normalized.includes('provider') && normalized.includes('indispon')) {
    return 'Provider PIX indisponível no momento.';
  }
  if (normalized.includes('canceled') || normalized.includes('cancelad')) {
    return 'Esta cobrança está cancelada.';
  }
  if (normalized.includes('expired') || normalized.includes('expirad')) {
    return 'Este PIX expirou. Gere uma nova tentativa quando permitido.';
  }
  if (normalized.includes('superseded')) {
    return 'Este PIX foi substituído por uma tentativa mais recente.';
  }
  if (normalized.includes('whatsapp')) {
    return 'Não foi possível enviar pelo WhatsApp. Tente novamente.';
  }
  if (normalized.includes('idempot')) {
    return 'Esta operação já foi processada. O estado atual foi preservado.';
  }

  return '';
}

function manualPixLooksTechnical(value: string) {
  return /prisma|stack|exception|trace|p20\d{2}|at\s+\w|\{|\}/i.test(value);
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function createFrontendIdempotencyKey(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function LegacyPaymentDetailModal({
  receivable,
  onClose,
}: {
  receivable: Receivable;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="legacy-payment-detail-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <Receipt size={15} />
          </span>
          <div>
            <span className="metric-label">Pagamento</span>
            <h2 id="legacy-payment-detail-title">Detalhe do pagamento</h2>
            <p>Registro financeiro somente para consulta.</p>
          </div>
          <IconButton icon={X} label="Fechar detalhe do pagamento" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Data</dt>
            <dd>{formatDate(receivable.dueDate)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatCurrency(receivable.amount)}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{receivable.clientReference?.reference ?? receivable.client?.reference ?? '-'}</dd>
          </div>
          <div>
            <dt>Método</dt>
            <dd>{financialPaymentMethodLabel(receivable.paymentMethod ?? null)}</dd>
          </div>
          <div>
            <dt>Categoria</dt>
            <dd>{receivable.category?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Descrição</dt>
            <dd>{receivable.originalDescription ?? receivable.description}</dd>
          </div>
          <div>
            <dt>Origem</dt>
            <dd>{financialTransactionOriginLabel(receivable.origin ?? 'LEGACY_IMPORT')}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function PixReceivableModal({
  receivable,
  onClose,
  onChanged,
}: {
  receivable: Receivable;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [activeIntent, setActiveIntent] = useState<PaymentIntent | null>(null);
  const [paymentProviderCredentials, setPaymentProviderCredentials] = useState<
    PaymentProviderCredentialStatus[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showPixData, setShowPixData] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [expandedHistoryIntentId, setExpandedHistoryIntentId] = useState<string | null>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [showReplacement, setShowReplacement] = useState(false);
  const [showReplacementRecovery, setShowReplacementRecovery] = useState(false);
  const [whatsAppConnection, setWhatsAppConnection] = useState<WhatsAppConnection | null>(null);
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [reconcileProvider, setReconcileProvider] =
    useState<ConfigurablePaymentProvider>('FASTFLOW');
  const [reconcileTransactionId, setReconcileTransactionId] = useState('');
  const [reconcileReason, setReconcileReason] = useState('');
  const [reconcilePreview, setReconcilePreview] = useState<PixReconciliationPreview | null>(null);
  const [recoveryProvider, setRecoveryProvider] = useState<ConfigurablePaymentProvider>('FASTFLOW');
  const [recoveryTransactionId, setRecoveryTransactionId] = useState('');
  const [recoveryReason, setRecoveryReason] = useState('');
  const [recoveryPreview, setRecoveryPreview] = useState<PixReplacementRecoveryPreview | null>(
    null,
  );
  const [replaceReason, setReplaceReason] = useState('');
  const [replacementProvider, setReplacementProvider] =
    useState<ConfigurablePaymentProvider>('FASTFLOW');
  const [replacementPreview, setReplacementPreview] = useState<PixReplacementPreview | null>(null);
  const actionRef = useRef(false);
  const previewActionRef = useRef(false);
  const replacePreviewActionRef = useRef(false);
  const recoveryPreviewActionRef = useRef(false);
  const paidIntentRefreshRef = useRef<Set<string>>(new Set());
  const eligibleReplacementProviders = useMemo(
    () =>
      configurablePaymentProviders.filter((provider) => {
        const credential = paymentProviderCredentials.find((item) => item.provider === provider);
        return credential ? isOperationalPixProviderCredential(credential) : false;
      }),
    [paymentProviderCredentials],
  );
  const defaultReplacementProvider =
    eligibleReplacementProviders.find((provider) =>
      paymentProviderCredentials.some(
        (credential) =>
          credential.provider === provider &&
          credential.defaultForPix &&
          isOperationalPixProviderCredential(credential),
      ),
    ) ??
    eligibleReplacementProviders[0] ??
    null;
  const canUseReplacementProvider = eligibleReplacementProviders.includes(replacementProvider);
  const selectedReplacementProvider = canUseReplacementProvider
    ? replacementProvider
    : defaultReplacementProvider;

  const loadIntents = useCallback(
    async (
      fallbackIntent?: PaymentIntent,
      options: { refreshConnection?: boolean; silent?: boolean } = {},
    ) => {
      const { refreshConnection = true, silent = false } = options;
      if (!silent) setLoading(true);
      setError('');

      try {
        const [nextIntents, nextCredentials, nextWhatsAppConnection] = await Promise.all([
          listPaymentIntents(receivable.id),
          listPaymentProviderCredentials(),
          refreshConnection ? getWhatsAppConnection().catch(() => null) : Promise.resolve(null),
        ]);
        const visibleIntents = sortPaymentIntentsForDisplay(
          mergePaymentIntentsWithFallback(nextIntents, fallbackIntent, receivable.id),
        );
        const fallbackFromList = fallbackIntent
          ? visibleIntents.find((intent) => intent.id === fallbackIntent.id)
          : null;

        setIntents(visibleIntents);
        setPaymentProviderCredentials(nextCredentials);
        setActiveIntent(
          fallbackFromList && isSelectablePixIntent(fallbackFromList)
            ? fallbackFromList
            : (visibleIntents.find(isActivePixIntent) ??
                visibleIntents.find(isSelectablePixIntent) ??
                null),
        );
        if (refreshConnection) setWhatsAppConnection(nextWhatsAppConnection);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível carregar o PIX.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [receivable.id],
  );

  useEffect(() => {
    void loadIntents();
  }, [loadIntents]);

  useEffect(() => {
    if (activeIntent?.status !== 'WAITING_PAYMENT') return undefined;

    const intervalId = window.setInterval(() => {
      void loadIntents(activeIntent, { refreshConnection: false, silent: true });
    }, 10_000);

    return () => window.clearInterval(intervalId);
  }, [activeIntent, loadIntents]);

  useEffect(() => {
    if (activeIntent?.status !== 'PAID' || receivable.status === 'PAGO') return;
    if (paidIntentRefreshRef.current.has(activeIntent.id)) return;

    paidIntentRefreshRef.current.add(activeIntent.id);
    void onChanged('Pagamento confirmado.').catch((err) => {
      setError(
        err instanceof Error
          ? err.message
          : 'Pagamento confirmado, mas não foi possível atualizar os dados financeiros.',
      );
    });
  }, [activeIntent?.id, activeIntent?.status, onChanged, receivable.status]);

  useEffect(() => {
    setShowPixData(activeIntent?.status === 'WAITING_PAYMENT');
    setShowAllHistory(false);
    setExpandedHistoryIntentId(null);
    if (defaultReplacementProvider) {
      setReplacementProvider(defaultReplacementProvider);
      setReplacementPreview(null);
    }
  }, [activeIntent?.id, activeIntent?.status, defaultReplacementProvider]);

  useEffect(() => {
    if (!selectedReplacementProvider || selectedReplacementProvider === replacementProvider) return;
    setReplacementProvider(selectedReplacementProvider);
    setReplacementPreview(null);
  }, [replacementProvider, selectedReplacementProvider]);

  async function runAction(
    action: () => Promise<PaymentIntent>,
    success: string | ((intent: PaymentIntent) => string),
  ) {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const intent = await action();
      const successMessage = typeof success === 'function' ? success(intent) : success;
      setActiveIntent(intent);
      await loadIntents(intent);
      setNotice(successMessage);
      if (intent.status === 'PAID') paidIntentRefreshRef.current.add(intent.id);
      await onChanged(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.');
    } finally {
      setBusy(false);
      actionRef.current = false;
    }
  }

  async function copyPix() {
    if (!activeIntent?.pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(activeIntent.pixCopyPaste);
      setNotice('PIX copiado.');
    } catch {
      setError('Não foi possível copiar o PIX. Copie o código manualmente.');
    }
  }

  async function sendPixWhatsApp() {
    if (!activeIntent || whatsAppSending || actionRef.current) return;

    actionRef.current = true;
    setWhatsAppSending(true);
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result: PixWhatsAppSendResult = await sendPaymentIntentWhatsApp(activeIntent.id);
      if (!result.success) {
        throw new Error(result.errorMessage ?? 'Não foi possível enviar o PIX pelo WhatsApp.');
      }

      setNotice('PIX enviado pelo WhatsApp.');
      await loadIntents(activeIntent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o PIX pelo WhatsApp.');
    } finally {
      setBusy(false);
      setWhatsAppSending(false);
      actionRef.current = false;
    }
  }

  async function runReconciliationPreview() {
    if (previewActionRef.current) return;

    if (!reconcileTransactionId.trim()) {
      setError('Informe o transaction ID do provider.');
      return;
    }

    previewActionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setReconcilePreview(null);

    try {
      const preview = await previewReceivablePixReconciliation(receivable.id, {
        provider: reconcileProvider,
        providerTransactionId: reconcileTransactionId.trim(),
      });
      setReconcilePreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pré-visualizar.');
    } finally {
      setBusy(false);
      previewActionRef.current = false;
    }
  }

  async function runReconciliationConfirm() {
    const providerTransactionId = reconcileTransactionId.trim();
    if (
      !reconcilePreview?.adoptable ||
      reconcilePreview.provider !== reconcileProvider ||
      reconcilePreview.providerTransactionId !== providerTransactionId ||
      actionRef.current
    ) {
      return;
    }

    await runAction(
      () =>
        reconcileReceivablePix(receivable.id, {
          provider: reconcileProvider,
          providerTransactionId,
          idempotencyKey: `pix-reconcile:${receivable.id}:${reconcileProvider}:${providerTransactionId}`,
          ...(reconcileReason.trim() ? { reason: reconcileReason.trim() } : {}),
        }),
      'PIX reconciliado.',
    );
    setShowReconciliation(false);
    setReconcilePreview(null);
  }

  async function runReplacementRecoveryPreview() {
    if (!activeIntent || recoveryPreviewActionRef.current) return;

    const providerTransactionId = recoveryTransactionId.trim();
    if (!providerTransactionId) {
      setError('Informe o transaction ID do provider.');
      return;
    }

    recoveryPreviewActionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setRecoveryPreview(null);

    try {
      const preview = await previewReceivablePixReplacementRecovery(receivable.id, {
        provider: recoveryProvider,
        providerTransactionId,
      });
      setRecoveryPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pré-visualizar.');
    } finally {
      setBusy(false);
      recoveryPreviewActionRef.current = false;
    }
  }

  async function runReplacementRecoveryConfirm() {
    const providerTransactionId = recoveryTransactionId.trim();
    if (
      !activeIntent ||
      !recoveryPreview?.recoverable ||
      recoveryPreview.provider !== recoveryProvider ||
      recoveryPreview.providerTransactionId !== providerTransactionId ||
      recoveryPreview.expectedCurrentIntentId !== activeIntent.id ||
      actionRef.current
    ) {
      return;
    }

    await runAction(
      () =>
        recoverReceivablePixReplacement(receivable.id, {
          provider: recoveryProvider,
          providerTransactionId,
          expectedCurrentIntentId: activeIntent.id,
          idempotencyKey: `pix-replace-recovery:${receivable.id}:${activeIntent.id}:${recoveryProvider}:${providerTransactionId}`,
          ...(recoveryReason.trim() ? { reason: recoveryReason.trim() } : {}),
        }),
      'PIX de substituição recuperado.',
    );
    setShowReplacementRecovery(false);
    setRecoveryPreview(null);
  }

  async function runReplacementPreview() {
    if (!activeIntent || replacePreviewActionRef.current) return;

    if (!selectedReplacementProvider) {
      setError('Nenhum provider PIX configurado para gerar substituição.');
      return;
    }

    replacePreviewActionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setReplacementPreview(null);

    try {
      const preview = await previewReceivablePixReplacement(receivable.id, {
        provider: selectedReplacementProvider,
      });
      setReplacementPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível pré-visualizar.');
    } finally {
      setBusy(false);
      replacePreviewActionRef.current = false;
    }
  }

  async function runReplacementConfirm() {
    if (
      !activeIntent ||
      !replacementPreview?.replaceable ||
      replacementPreview.currentIntent?.id !== activeIntent.id ||
      !selectedReplacementProvider ||
      replacementPreview.provider !== selectedReplacementProvider ||
      actionRef.current
    ) {
      return;
    }

    await runAction(
      () =>
        replaceReceivablePix(receivable.id, {
          provider: selectedReplacementProvider,
          expectedCurrentIntentId: activeIntent.id,
          idempotencyKey: `pix-replace:${receivable.id}:${activeIntent.id}:${selectedReplacementProvider}`,
          ...(replaceReason.trim() ? { reason: replaceReason.trim() } : {}),
        }),
      'Novo PIX gerado.',
    );
    setShowReplacement(false);
    setReplacementPreview(null);
  }

  const canCreateNew =
    receivable.status !== 'PAGO' &&
    (!activeIntent || !['CREATED', 'WAITING_PAYMENT'].includes(activeIntent.status));
  const canReplacePix =
    receivable.status !== 'PAGO' &&
    activeIntent?.status === 'WAITING_PAYMENT' &&
    !activeIntent.paymentGroupId;
  const canCancel =
    receivable.status !== 'PAGO' &&
    activeIntent &&
    !['PAID', 'SUPERSEDED', 'CANCELED', 'EXPIRED', 'REFUNDED'].includes(activeIntent.status);
  const canRenderQrImage =
    activeIntent?.qrCodeData?.startsWith('data:') || activeIntent?.qrCodeData?.startsWith('http');
  const canConfirmReconciliation =
    Boolean(reconcilePreview?.adoptable) &&
    reconcilePreview?.provider === reconcileProvider &&
    reconcilePreview.providerTransactionId === reconcileTransactionId.trim();
  const canConfirmReplacement =
    Boolean(replacementPreview?.replaceable) &&
    replacementPreview?.currentIntent?.id === activeIntent?.id &&
    Boolean(selectedReplacementProvider) &&
    replacementPreview?.provider === selectedReplacementProvider;
  const canConfirmReplacementRecovery =
    Boolean(recoveryPreview?.recoverable) &&
    recoveryPreview?.provider === recoveryProvider &&
    recoveryPreview.providerTransactionId === recoveryTransactionId.trim() &&
    recoveryPreview.expectedCurrentIntentId === activeIntent?.id;
  const activeStatus = activeIntent?.status ?? null;
  const activeStatusIcon = activeStatus ? paymentIntentStatusIcon(activeStatus) : Info;
  const ActiveStatusIcon = activeStatusIcon;
  const isWaitingPix = activeStatus === 'WAITING_PAYMENT';
  const isPaidPix = activeStatus === 'PAID' || receivable.status === 'PAGO';
  const canSendPixWhatsApp = Boolean(
    isWaitingPix && receivable.status === 'PENDENTE' && activeIntent?.pixCopyPaste,
  );
  const whatsAppUnavailableReason = !whatsAppConnection
    ? 'Configure a conexão em WhatsApp.'
    : whatsAppConnection.status !== 'CONNECTED'
      ? 'Conexão Kirago não está operacional.'
      : '';
  const shouldShowPixData = isWaitingPix || showPixData;
  const historicalIntents = intents.filter((intent) => intent.id !== activeIntent?.id);
  const orderedHistoryIntents = [activeIntent, ...historicalIntents].filter(
    Boolean,
  ) as PaymentIntent[];
  const visibleHistoryIntents = showAllHistory
    ? orderedHistoryIntents
    : orderedHistoryIntents.slice(0, 3);
  const hasHiddenHistoryIntents = orderedHistoryIntents.length > 3;
  const contextualActionItems = activeIntent
    ? [
        ...(canReplacePix
          ? [
              {
                disabled: busy,
                icon: RefreshCcw,
                label: 'Gerar novo PIX',
                onSelect: () => {
                  setShowReplacement((value) => !value);
                  setShowReconciliation(false);
                  setShowReplacementRecovery(false);
                  setReplacementPreview(null);
                },
              },
            ]
          : []),
        ...(canCancel
          ? [
              {
                danger: true,
                disabled: busy,
                icon: XCircle,
                label: 'Cancelar PIX',
                onSelect: () =>
                  void runAction(
                    () => cancelPaymentIntent(activeIntent.id),
                    'PIX cancelado no provider.',
                  ),
              },
            ]
          : []),
        ...(canReplacePix
          ? [
              {
                disabled: busy,
                icon: Settings,
                label: 'Reconciliar PIX externo',
                section: 'Ferramentas técnicas',
                onSelect: () => {
                  setShowReconciliation((value) => !value);
                  setShowReplacement(false);
                  setShowReplacementRecovery(false);
                  setReconcilePreview(null);
                },
              },
              {
                disabled: busy,
                icon: Search,
                label: 'Recuperar PIX de substituição',
                section: 'Ferramentas técnicas',
                onSelect: () => {
                  setShowReplacementRecovery((value) => !value);
                  setShowReplacement(false);
                  setShowReconciliation(false);
                  setRecoveryPreview(null);
                },
              },
            ]
          : []),
      ]
    : [];

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="pix-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <QrCode size={16} />
          </span>
          <div>
            <h2 id="pix-title">PIX</h2>
            <p>Gerar, acompanhar e receber pagamentos</p>
          </div>
          <IconButton disabled={busy} icon={X} label="Fechar PIX" onClick={onClose} />
        </header>

        <dl className="detail-list pix-summary-list">
          <div>
            <dt>Cliente</dt>
            <dd>{receivable.client?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Descrição</dt>
            <dd>{receivable.description}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatCurrency(receivable.amount)}</dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{formatDate(receivable.dueDate)}</dd>
          </div>
        </dl>

        {error ? <div className="notice danger">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        {loading ? <div className="empty-state">Carregando PIX...</div> : null}

        {activeIntent ? (
          <div className={`pix-panel pix-panel-${paymentIntentStatusTone(activeIntent.status)}`}>
            <div className="pix-current-summary">
              <span
                className={`pix-status-badge tone-${paymentIntentStatusTone(activeIntent.status)}`}
              >
                <ActiveStatusIcon aria-hidden="true" size={15} />
                {paymentIntentStatusLabel(activeIntent.status)}
              </span>
              <strong>
                {isPaidPix ? 'Pagamento confirmado' : paymentIntentStatusLabel(activeIntent.status)}
              </strong>
              <p>{paymentIntentStatusSummary(activeIntent.status)}</p>
              <div className="pix-amount-row">
                <span>Valor</span>
                <strong>{formatCurrency(activeIntent.amount ?? receivable.amount)}</strong>
              </div>
              <dl className="detail-list compact-detail-list pix-current-details">
                <div>
                  <dt>Provider</dt>
                  <dd>{paymentProviderDisplay(activeIntent.provider)}</dd>
                </div>
                <div>
                  <dt>Transação</dt>
                  <dd>{paymentIntentDisplayTransactionId(activeIntent)}</dd>
                </div>
                <div>
                  <dt>{activeIntent.status === 'PAID' ? 'Pago em' : 'Criado em'}</dt>
                  <dd>
                    {activeIntent.status === 'PAID' && activeIntent.paidAt
                      ? formatDateTime(activeIntent.paidAt)
                      : formatDateTime(activeIntent.createdAt)}
                  </dd>
                </div>
                {!isPaidPix ? (
                  <div>
                    <dt>{isWaitingPix ? 'Válido até' : 'Expiração'}</dt>
                    <dd>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</dd>
                  </div>
                ) : null}
              </dl>
              {activeIntent.status === 'FAILED' &&
              (activeIntent.failureMessage || activeIntent.failureCode) ? (
                <div className="notice danger">
                  {activeIntent.failureMessage ?? `Falha informada: ${activeIntent.failureCode}`}
                </div>
              ) : null}
            </div>

            {isWaitingPix && whatsAppUnavailableReason ? (
              <div className="notice warning">{whatsAppUnavailableReason}</div>
            ) : null}

            {!isWaitingPix ? (
              <button
                className="secondary-button pix-disclosure-button"
                type="button"
                aria-expanded={showPixData}
                aria-controls="pix-data-panel"
                onClick={() => setShowPixData((value) => !value)}
              >
                <Eye aria-hidden="true" size={16} />
                {showPixData ? 'Ocultar dados do PIX' : 'Ver dados do PIX'}
              </button>
            ) : null}

            {shouldShowPixData ? (
              <div className="pix-data-panel" id="pix-data-panel">
                <label className="field pix-copy-field">
                  <span>PIX copia e cola</span>
                  <div className="pix-copy-row">
                    <input readOnly value={activeIntent.pixCopyPaste ?? ''} />
                    <button
                      className="secondary-button compact"
                      disabled={!activeIntent.pixCopyPaste}
                      type="button"
                      onClick={() => void copyPix()}
                    >
                      <Copy aria-hidden="true" size={16} />
                      {notice === 'PIX copiado.' ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </label>
                {activeIntent.qrCodeData ? (
                  <div className="pix-qr" aria-label="QR Code PIX">
                    {canRenderQrImage ? (
                      <img alt="QR Code PIX" src={activeIntent.qrCodeData} />
                    ) : (
                      <>
                        <QrCode aria-hidden="true" size={92} />
                        <span>{activeIntent.qrCodeData}</span>
                      </>
                    )}
                  </div>
                ) : null}
                <dl className="detail-list compact-detail-list pix-data-details">
                  <div>
                    <dt>Expiração</dt>
                    <dd>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {isWaitingPix ? (
              <div className="pix-waiting-actions">
                <button
                  className="secondary-button"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => syncPaymentIntent(activeIntent.id),
                      (intent) => pixSyncNotice(intent),
                    )
                  }
                >
                  <RefreshCcw aria-hidden="true" size={16} />
                  {busy ? 'Sincronizando...' : 'Sincronizar'}
                </button>
                <button
                  className="primary-button pix-whatsapp-send-button"
                  disabled={
                    busy ||
                    whatsAppSending ||
                    !canSendPixWhatsApp ||
                    Boolean(whatsAppUnavailableReason)
                  }
                  title={whatsAppUnavailableReason || undefined}
                  type="button"
                  onClick={() => void sendPixWhatsApp()}
                >
                  <MessageCircle aria-hidden="true" size={16} />
                  {whatsAppSending ? 'Enviando...' : 'Enviar no WhatsApp'}
                </button>
                {activeIntent.provider === 'MOCK' ? (
                  <button
                    className="primary-button"
                    disabled={busy || activeIntent.status === 'PAID'}
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => confirmMockPaymentIntent(activeIntent.id),
                        'Pagamento PIX mock confirmado.',
                      )
                    }
                  >
                    <ShieldCheck aria-hidden="true" size={16} />
                    Confirmar mock
                  </button>
                ) : null}
              </div>
            ) : null}

            {isPixTemporallyExpired(activeIntent) ? (
              <div className="notice warning">Prazo informado para este PIX expirou.</div>
            ) : null}
          </div>
        ) : null}

        {intents.length ? (
          <section className="pix-history-section">
            <button
              className="pix-history-toggle"
              type="button"
              aria-controls="pix-history-list"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((value) => !value)}
            >
              <span>Tentativas ({intents.length})</span>
              <span>{showHistory ? 'Ocultar histórico' : 'Ver histórico'}</span>
            </button>
            {showHistory ? (
              <div className="pix-history-list" id="pix-history-list">
                {visibleHistoryIntents.map((intent) => {
                  const StatusIcon = paymentIntentStatusIcon(intent.status);
                  const expanded = expandedHistoryIntentId === intent.id;

                  return (
                    <article className="pix-history-item" key={intent.id}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={`pix-history-detail-${intent.id}`}
                        onClick={() =>
                          setExpandedHistoryIntentId((current) =>
                            current === intent.id ? null : intent.id,
                          )
                        }
                      >
                        <StatusIcon aria-hidden="true" size={15} />
                        <span>
                          <strong>{paymentIntentDisplayTransactionId(intent)}</strong>
                          {intent.id === activeIntent?.id ? ' Atual' : ''}
                        </span>
                        <span>{paymentIntentStatusLabel(intent.status)}</span>
                        <span>{paymentIntentShortDate(intent.paidAt ?? intent.createdAt)}</span>
                        <span>{formatCurrency(intent.amount)}</span>
                      </button>
                      {expanded ? (
                        <div className="pix-history-detail" id={`pix-history-detail-${intent.id}`}>
                          <dl className="detail-list compact-detail-list">
                            <div>
                              <dt>Provider</dt>
                              <dd>{paymentProviderDisplay(intent.provider)}</dd>
                            </div>
                            <div>
                              <dt>Transação</dt>
                              <dd>{intent.providerTransactionId ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>Status</dt>
                              <dd>{paymentIntentStatusLabel(intent.status)}</dd>
                            </div>
                            <div>
                              <dt>Status técnico</dt>
                              <dd>{intent.status}</dd>
                            </div>
                            <div>
                              <dt>Status externo</dt>
                              <dd>{intent.externalStatus ?? '-'}</dd>
                            </div>
                            <div>
                              <dt>Criado em</dt>
                              <dd>{formatDateTime(intent.createdAt)}</dd>
                            </div>
                            <div>
                              <dt>Expira em</dt>
                              <dd>{intent.expiresAt ? formatDateTime(intent.expiresAt) : '-'}</dd>
                            </div>
                            <div>
                              <dt>Pago em</dt>
                              <dd>{intent.paidAt ? formatDateTime(intent.paidAt) : '-'}</dd>
                            </div>
                          </dl>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {hasHiddenHistoryIntents ? (
                  <button
                    className="pix-history-limit-toggle"
                    type="button"
                    aria-controls="pix-history-list"
                    aria-expanded={showAllHistory}
                    onClick={() => setShowAllHistory((value) => !value)}
                  >
                    {showAllHistory
                      ? 'Mostrar menos'
                      : `Ver todas (${orderedHistoryIntents.length})`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="form-actions">
          <span>
            {receivable.status === 'PAGO'
              ? 'Pagamento concluído. Ações operacionais encerradas.'
              : canCreateNew
                ? ''
                : 'Já existe um PIX ativo para esta conta.'}
          </span>
          <div className="button-row">
            <button className="secondary-button" disabled={busy} type="button" onClick={onClose}>
              Fechar
            </button>
            {contextualActionItems.length ? (
              <ActionMenu items={contextualActionItems} trigger="text" />
            ) : null}
            {canCreateNew ? (
              <button
                className="primary-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void runAction(() => createReceivablePix(receivable.id), 'PIX gerado.')
                }
              >
                <QrCode aria-hidden="true" size={16} />
                Gerar PIX
              </button>
            ) : null}
          </div>
        </div>

        {showReplacement && activeIntent ? (
          <section className="pix-panel pix-tool-panel">
            <div className="pix-status-row">
              <strong>Gerar novo PIX</strong>
              <span>
                {selectedReplacementProvider
                  ? paymentProviderDisplay(selectedReplacementProvider)
                  : 'Nenhum provider configurado'}
              </span>
            </div>
            <ol className="pix-step-list" aria-label="Etapas para gerar novo PIX">
              <li>Configurar</li>
              <li className={replacementPreview ? 'complete' : ''}>Pré-visualizar</li>
              <li>Confirmar</li>
            </ol>
            <p>
              Um novo PIX será criado para esta cobrança. O PIX atual continuará registrado no
              histórico e poderá continuar existindo no provedor.
            </p>
            <div className="notice warning">
              Use esta opção somente quando o PIX atual não puder mais ser utilizado.
            </div>
            <dl className="detail-list">
              <div>
                <dt>Cliente</dt>
                <dd>{receivable.client?.name ?? '-'}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatCurrency(receivable.amount)}</dd>
              </div>
              <div>
                <dt>Provider atual</dt>
                <dd>{paymentProviderDisplay(activeIntent.provider)}</dd>
              </div>
              <div>
                <dt>Novo provider</dt>
                <dd>
                  {selectedReplacementProvider
                    ? paymentProviderDisplay(selectedReplacementProvider)
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>Transaction ID atual</dt>
                <dd>{activeIntent.providerTransactionId ?? '-'}</dd>
              </div>
              <div>
                <dt>Status atual</dt>
                <dd>{paymentIntentStatusLabel(activeIntent.status)}</dd>
              </div>
              <div>
                <dt>Expiração atual</dt>
                <dd>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</dd>
              </div>
            </dl>
            <fieldset className="field">
              <span>Provedor</span>
              {eligibleReplacementProviders.length ? (
                eligibleReplacementProviders.map((provider) => (
                  <label className="choice-row" key={provider}>
                    <input
                      checked={selectedReplacementProvider === provider}
                      name="replacement-provider"
                      type="radio"
                      value={provider}
                      onChange={() => {
                        setReplacementProvider(provider);
                        setReplacementPreview(null);
                      }}
                    />
                    <span>{replacementProviderLabel(provider, defaultReplacementProvider)}</span>
                  </label>
                ))
              ) : (
                <span className="field-hint">
                  Configure ao menos um provider PIX ativo para gerar uma substituição.
                </span>
              )}
            </fieldset>
            <label className="field">
              <span>Motivo</span>
              <select
                value={replaceReason}
                onChange={(event) => {
                  setReplaceReason(event.target.value);
                  setReplacementPreview(null);
                }}
              >
                <option value="">Selecione um motivo</option>
                <option value="QR expirado">QR expirado</option>
                <option value="Cliente não consegue pagar">Cliente não consegue pagar</option>
                <option value="Nova tentativa solicitada">Nova tentativa solicitada</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={busy || !selectedReplacementProvider}
                type="button"
                onClick={() => void runReplacementPreview()}
              >
                Pré-visualizar
              </button>
              <button
                className="primary-button"
                disabled={busy || !canConfirmReplacement}
                type="button"
                onClick={() => void runReplacementConfirm()}
              >
                <QrCode aria-hidden="true" size={16} />
                Confirmar novo PIX
              </button>
            </div>
            {replacementPreview ? (
              <>
                <div className="mini-list">
                  {replacementPreview.impact.map((item) => (
                    <article key={item}>
                      <strong>Impacto</strong>
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
                {replacementPreview.blockers.length ? (
                  <div className="mini-list">
                    {replacementPreview.blockers.map((blocker) => (
                      <article key={blocker.code}>
                        <strong>{blocker.code}</strong>
                        <p>{blocker.message}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {showReplacementRecovery && activeIntent ? (
          <section className="pix-panel pix-tool-panel">
            <div className="pix-status-row">
              <strong>Recuperar PIX de substituição</strong>
              <span>{paymentProviderDisplay(activeIntent.provider)}</span>
            </div>
            <ol className="pix-step-list" aria-label="Etapas para recuperar PIX de substituição">
              <li>Provider + Transaction ID</li>
              <li className={recoveryPreview ? 'complete' : ''}>Buscar</li>
              <li className={recoveryPreview ? 'complete' : ''}>Preview</li>
              <li>Confirmar recuperação</li>
            </ol>
            <div className="notice warning">
              Esta ação recupera um PIX que já foi criado no provedor durante uma substituição que
              não foi concluída localmente. Nenhum novo PIX será criado.
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Provider</span>
                <select
                  value={recoveryProvider}
                  onChange={(event) => {
                    setRecoveryProvider(event.target.value as typeof recoveryProvider);
                    setRecoveryPreview(null);
                    setError('');
                  }}
                >
                  <option value="FASTFLOW">FastFlow</option>
                  <option value="FASTPIX">FastPIX</option>
                  <option value="FASTPAY">FastPay</option>
                </select>
              </label>
              <label className="field">
                <span>Transaction ID externo</span>
                <input
                  value={recoveryTransactionId}
                  onChange={(event) => {
                    setRecoveryTransactionId(event.target.value);
                    setRecoveryPreview(null);
                    setError('');
                  }}
                  placeholder="Ex.: 75739"
                />
              </label>
            </div>
            <label className="field">
              <span>Motivo</span>
              <textarea
                rows={3}
                value={recoveryReason}
                onChange={(event) => setRecoveryReason(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={busy}
                type="button"
                onClick={() => void runReplacementRecoveryPreview()}
              >
                <Search aria-hidden="true" size={16} />
                Buscar
              </button>
              <button
                className="primary-button"
                disabled={busy || !canConfirmReplacementRecovery}
                type="button"
                onClick={() => void runReplacementRecoveryConfirm()}
              >
                <ShieldCheck aria-hidden="true" size={16} />
                Confirmar recuperação
              </button>
            </div>
            {recoveryPreview ? (
              <>
                <div className="mini-list">
                  {recoveryPreview.impact.map((item) => (
                    <article key={item}>
                      <strong>Impacto</strong>
                      <p>{item}</p>
                    </article>
                  ))}
                </div>
                {recoveryPreview.blockers.length ? (
                  <div className="mini-list">
                    {recoveryPreview.blockers.map((blocker) => (
                      <article key={blocker.code}>
                        <strong>{blocker.code}</strong>
                        <p>{blocker.message}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {showReconciliation ? (
          <section className="pix-panel pix-tool-panel">
            <div className="pix-status-row">
              <strong>Reconciliação técnica</strong>
              <span>Reconciliação manual de PIX existente</span>
            </div>
            <ol className="pix-step-list" aria-label="Etapas para reconciliar PIX externo">
              <li>Provider + Transaction ID</li>
              <li className={reconcilePreview ? 'complete' : ''}>Buscar</li>
              <li className={reconcilePreview ? 'complete' : ''}>Preview</li>
              <li>Confirmar adoção</li>
            </ol>
            <div className="notice warning">
              Esta ação vinculará ao CRM um PIX que já existe no provedor. Nenhum novo PIX será
              criado.
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Provider</span>
                <select
                  value={reconcileProvider}
                  onChange={(event) => {
                    setReconcileProvider(event.target.value as typeof reconcileProvider);
                    setReconcilePreview(null);
                    setError('');
                  }}
                >
                  <option value="FASTFLOW">FastFlow</option>
                  <option value="FASTPIX">FastPIX</option>
                  <option value="FASTPAY">FastPay</option>
                </select>
              </label>
              <label className="field">
                <span>Transaction ID</span>
                <input
                  value={reconcileTransactionId}
                  onChange={(event) => {
                    setReconcileTransactionId(event.target.value);
                    setReconcilePreview(null);
                    setError('');
                  }}
                  placeholder="Ex.: 12345"
                />
              </label>
            </div>
            <label className="field">
              <span>Motivo</span>
              <textarea
                rows={3}
                value={reconcileReason}
                onChange={(event) => setReconcileReason(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={busy}
                type="button"
                onClick={() => void runReconciliationPreview()}
              >
                <Search aria-hidden="true" size={16} />
                Buscar
              </button>
              <button
                className="primary-button"
                disabled={busy || !canConfirmReconciliation}
                type="button"
                onClick={() => void runReconciliationConfirm()}
              >
                <ShieldCheck aria-hidden="true" size={16} />
                Confirmar adoção
              </button>
            </div>
            {reconcilePreview ? (
              <>
                <div className={`notice ${reconcilePreview.adoptable ? 'success' : 'danger'}`}>
                  {reconcilePreview.adoptable
                    ? 'Pode reconciliar.'
                    : 'Reconciliação bloqueada pelo backend.'}
                </div>
                {reconcilePreview.external?.status === 'PAID' ? (
                  <div className="notice warning">PIX já está pago no provider.</div>
                ) : null}
                <dl className="detail-list">
                  <div>
                    <dt>Cliente</dt>
                    <dd>{reconcilePreview.receivable.clientName}</dd>
                  </div>
                  <div>
                    <dt>Receivable</dt>
                    <dd>{reconcilePreview.receivable.id}</dd>
                  </div>
                  <div>
                    <dt>Valor local</dt>
                    <dd>{formatCurrency(reconcilePreview.receivable.amount)}</dd>
                  </div>
                  <div>
                    <dt>Provider</dt>
                    <dd>{reconcilePreview.provider}</dd>
                  </div>
                  <div>
                    <dt>Transaction ID</dt>
                    <dd>{reconcilePreview.providerTransactionId}</dd>
                  </div>
                  <div>
                    <dt>Status externo</dt>
                    <dd>{reconcilePreview.external?.status ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Valor externo</dt>
                    <dd>
                      {reconcilePreview.external
                        ? formatCurrency(reconcilePreview.external.amount)
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>Expiração</dt>
                    <dd>
                      {reconcilePreview.external?.expiresAt
                        ? formatDateTime(reconcilePreview.external.expiresAt)
                        : '-'}
                    </dd>
                  </div>
                </dl>
                <div className="mini-list">
                  {reconcilePreview.impact.map((item) => (
                    <article key={item}>
                      <strong>{item}</strong>
                    </article>
                  ))}
                  {reconcilePreview.blockers.map((blocker) => (
                    <article key={blocker.code}>
                      <strong>{blocker.code}</strong>
                      <p>{blocker.message}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </section>
    </div>
  );
}

function activePixConflictPayloadFromError(error: unknown): ActivePixConflictPayload | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  const payload = error.payload;
  if (!payload || typeof payload !== 'object') return null;

  const candidate = payload as Partial<ActivePixConflictPayload>;
  if (candidate.code !== 'ACTIVE_PIX_CONFLICT' || !candidate.activePix?.paymentIntent) {
    return null;
  }

  return candidate as ActivePixConflictPayload;
}

function PixReceivablesModal({
  receivables,
  onClose,
  onChanged,
}: {
  receivables: Receivable[];
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const [activeIntent, setActiveIntent] = useState<PaymentIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [paymentProviderCredentials, setPaymentProviderCredentials] = useState<
    PaymentProviderCredentialStatus[]
  >([]);
  const [selectedProvider, setSelectedProvider] = useState<ConfigurablePaymentProvider>('FASTFLOW');
  const [replacementProvider, setReplacementProvider] =
    useState<ConfigurablePaymentProvider>('FASTFLOW');
  const [showReplacement, setShowReplacement] = useState(false);
  const [whatsAppConnection, setWhatsAppConnection] = useState<WhatsAppConnection | null>(null);
  const [whatsAppSending, setWhatsAppSending] = useState(false);
  const [activePixConflict, setActivePixConflict] = useState<
    ActivePixConflictPayload['activePix'] | null
  >(null);
  const [showConflictPix, setShowConflictPix] = useState(false);
  const actionRef = useRef(false);
  const total = receivables.reduce((sum, receivable) => sum + Number(receivable.amount), 0);
  const isWaitingPix = activeIntent?.status === 'WAITING_PAYMENT';
  const canSendPixWhatsApp = Boolean(isWaitingPix && activeIntent?.pixCopyPaste);
  const conflictIntent = activePixConflict?.paymentIntent ?? null;
  const canSendConflictPixWhatsApp = Boolean(
    conflictIntent?.status === 'WAITING_PAYMENT' &&
    conflictIntent.pixCopyPaste &&
    (activePixConflict?.type === 'INDIVIDUAL' || activePixConflict?.matchesSelectedGroup),
  );
  const whatsAppUnavailableReason = !whatsAppConnection
    ? 'Configure a conexão em WhatsApp.'
    : whatsAppConnection.status !== 'CONNECTED'
      ? 'Conexão Kirago não está operacional.'
      : '';
  const canCancel =
    activeIntent &&
    !['PAID', 'SUPERSEDED', 'CANCELED', 'EXPIRED', 'REFUNDED'].includes(activeIntent.status);
  const canRenderQrImage =
    activeIntent?.qrCodeData?.startsWith('data:') || activeIntent?.qrCodeData?.startsWith('http');
  const eligiblePixProviders = useMemo(
    () =>
      configurablePaymentProviders.filter((provider) => {
        const credential = paymentProviderCredentials.find((item) => item.provider === provider);
        return credential ? isOperationalPixProviderCredential(credential) : false;
      }),
    [paymentProviderCredentials],
  );
  const defaultPixProvider =
    eligiblePixProviders.find((provider) =>
      paymentProviderCredentials.some(
        (credential) =>
          credential.provider === provider &&
          credential.defaultForPix &&
          isOperationalPixProviderCredential(credential),
      ),
    ) ??
    eligiblePixProviders[0] ??
    null;
  const canUseSelectedProvider = eligiblePixProviders.includes(selectedProvider);
  const groupedPixProvider = canUseSelectedProvider ? selectedProvider : defaultPixProvider;
  const canUseReplacementProvider = eligiblePixProviders.includes(replacementProvider);
  const groupedReplacementProvider = canUseReplacementProvider
    ? replacementProvider
    : defaultPixProvider;
  const canReplaceGroupedPix = Boolean(
    activePixConflict?.type === 'GROUPED' &&
    activePixConflict.matchesSelectedGroup &&
    activePixConflict.paymentIntent.status === 'WAITING_PAYMENT',
  );

  useEffect(() => {
    void Promise.all([getWhatsAppConnection().catch(() => null), listPaymentProviderCredentials()])
      .then(([nextWhatsAppConnection, nextCredentials]) => {
        setWhatsAppConnection(nextWhatsAppConnection);
        setPaymentProviderCredentials(nextCredentials);
      })
      .catch(() => {
        setWhatsAppConnection(null);
        setPaymentProviderCredentials([]);
      });
  }, []);

  useEffect(() => {
    if (!groupedPixProvider || groupedPixProvider === selectedProvider) return;
    setSelectedProvider(groupedPixProvider);
  }, [groupedPixProvider, selectedProvider]);

  useEffect(() => {
    if (!groupedReplacementProvider || groupedReplacementProvider === replacementProvider) return;
    setReplacementProvider(groupedReplacementProvider);
  }, [groupedReplacementProvider, replacementProvider]);

  async function runAction(
    action: () => Promise<PaymentIntent>,
    success: string | ((intent: PaymentIntent) => string),
  ) {
    if (actionRef.current) return;

    actionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const intent = await action();
      const successMessage = typeof success === 'function' ? success(intent) : success;
      setActiveIntent(intent);
      setActivePixConflict(null);
      setShowConflictPix(false);
      setNotice(successMessage);
      await onChanged(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.');
    } finally {
      setBusy(false);
      actionRef.current = false;
    }
  }

  async function copyPix() {
    if (!activeIntent?.pixCopyPaste) return;
    await navigator.clipboard.writeText(activeIntent.pixCopyPaste);
    setNotice('PIX copiado.');
  }

  async function sendPixWhatsApp(
    intent: PaymentIntent | null = activeIntent,
    successMessage = 'PIX agrupado enviado pelo WhatsApp.',
  ) {
    if (!intent || whatsAppSending || actionRef.current) return;

    actionRef.current = true;
    setWhatsAppSending(true);
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const result: PixWhatsAppSendResult = await sendPaymentIntentWhatsApp(intent.id);
      if (!result.success) {
        throw new Error(result.errorMessage ?? 'Não foi possível enviar o PIX pelo WhatsApp.');
      }

      setNotice(successMessage);
      await onChanged(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o PIX pelo WhatsApp.');
    } finally {
      setBusy(false);
      setWhatsAppSending(false);
      actionRef.current = false;
    }
  }

  async function createGroupedPix() {
    if (actionRef.current) return;

    if (!groupedPixProvider) {
      setError('Nenhum provider PIX configurado para gerar PIX agrupado.');
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setActivePixConflict(null);
    setShowConflictPix(false);

    try {
      const intent = await createReceivablesPix(
        receivables.map((receivable) => receivable.id),
        groupedPixProvider,
      );
      setActiveIntent(intent);
      setNotice('PIX agrupado gerado.');
      await onChanged('PIX agrupado gerado.');
    } catch (err) {
      const conflict = activePixConflictPayloadFromError(err);
      if (conflict) {
        setActivePixConflict(conflict.activePix);
        setNotice('PIX ativo encontrado.');
        return;
      }

      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.');
    } finally {
      setBusy(false);
      actionRef.current = false;
    }
  }

  async function replaceGroupedPix() {
    if (!activePixConflict || actionRef.current) return;

    if (!canReplaceGroupedPix) {
      setError('A substituição vale apenas para PIX agrupado ativo correspondente.');
      return;
    }

    if (!groupedReplacementProvider) {
      setError('Nenhum provider PIX configurado para substituir o PIX agrupado.');
      return;
    }

    actionRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const intent = await replaceReceivablesPix({
        receivableIds: receivables.map((receivable) => receivable.id),
        provider: groupedReplacementProvider,
        expectedCurrentIntentId: activePixConflict.paymentIntent.id,
        idempotencyKey: `grouped-pix-replace:${activePixConflict.paymentIntent.id}:${groupedReplacementProvider}`,
        reason: 'Operador solicitou novo PIX agrupado para substituir a tentativa anterior.',
      });
      setActiveIntent(intent);
      setActivePixConflict(null);
      setShowConflictPix(false);
      setShowReplacement(false);
      setNotice('Novo PIX agrupado gerado.');
      await onChanged('Novo PIX agrupado gerado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível substituir o PIX agrupado.');
    } finally {
      setBusy(false);
      actionRef.current = false;
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="group-pix-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <QrCode size={16} />
          </span>
          <div>
            <h2 id="group-pix-title">PIX selecionados</h2>
            <p>Gerar um único PIX para as contas selecionadas.</p>
          </div>
          <IconButton icon={X} label="Fechar PIX selecionados" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{receivables[0]?.client?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Contas</dt>
            <dd>{receivables.length}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatCurrency(total)}</dd>
          </div>
        </dl>

        <div className="mini-list">
          {receivables.map((receivable) => (
            <article key={receivable.id}>
              <strong>
                {receivable.clientReference?.reference ?? receivable.client?.reference}
              </strong>
              <span>{formatDate(receivable.dueDate)}</span>
              <p>{formatCurrency(receivable.amount)}</p>
            </article>
          ))}
        </div>

        {error ? <div className="notice danger">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        {!activeIntent && !activePixConflict ? (
          <fieldset className="field">
            <span>Provider PIX</span>
            {eligiblePixProviders.length ? (
              eligiblePixProviders.map((provider) => (
                <label className="choice-row" key={provider}>
                  <input
                    checked={groupedPixProvider === provider}
                    name="grouped-pix-provider"
                    type="radio"
                    value={provider}
                    onChange={() => setSelectedProvider(provider)}
                  />
                  <span>{replacementProviderLabel(provider, defaultPixProvider)}</span>
                </label>
              ))
            ) : (
              <span className="field-hint">
                Configure ao menos um provider PIX ativo para gerar PIX agrupado.
              </span>
            )}
          </fieldset>
        ) : null}

        {activePixConflict ? (
          <div className="pix-panel pix-tool-panel">
            <div className="pix-status-row">
              <strong>PIX ativo encontrado</strong>
              <span>
                {activePixConflict.type === 'GROUPED'
                  ? activePixConflict.matchesSelectedGroup
                    ? 'Agrupado correspondente'
                    : 'Agrupado relacionado'
                  : 'Individual'}
              </span>
            </div>
            <div className="notice warning">
              {activePixConflict.type === 'INDIVIDUAL' && activePixConflict.receivable
                ? `A referência ${activePixConflict.receivable.reference} já possui um PIX ativo.`
                : 'Já existe um PIX ativo para uma das contas selecionadas.'}
            </div>
            <dl className="detail-list compact-detail-list">
              <div>
                <dt>Provider</dt>
                <dd>{paymentProviderDisplay(activePixConflict.paymentIntent.provider)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{paymentIntentStatusLabel(activePixConflict.paymentIntent.status)}</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>{formatCurrency(activePixConflict.paymentIntent.amount)}</dd>
              </div>
              <div>
                <dt>Expiração</dt>
                <dd>
                  {activePixConflict.paymentIntent.expiresAt
                    ? formatDateTime(activePixConflict.paymentIntent.expiresAt)
                    : '-'}
                </dd>
              </div>
              <div>
                <dt>Referência</dt>
                <dd>
                  {activePixConflict.type === 'INDIVIDUAL'
                    ? (activePixConflict.receivable?.reference ?? '-')
                    : `${activePixConflict.paymentGroup?.itemCount ?? 0} contas`}
                </dd>
              </div>
            </dl>
            {activePixConflict.type === 'INDIVIDUAL' && activePixConflict.receivable ? (
              <div className="mini-list">
                <article>
                  <strong>{activePixConflict.receivable.reference}</strong>
                  <span>{formatDate(activePixConflict.receivable.dueDate)}</span>
                  <p>{formatCurrency(activePixConflict.receivable.amount)}</p>
                </article>
              </div>
            ) : null}
            {activePixConflict.type === 'GROUPED' ? (
              <div className="mini-list">
                {(activePixConflict.paymentGroup?.items ?? []).map((item) => (
                  <article key={item.id}>
                    <strong>{item.reference}</strong>
                    <span>{formatDate(item.dueDate)}</span>
                    <p>{formatCurrency(item.amount)}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {showConflictPix ? (
              <label className="field">
                <span>PIX copia e cola</span>
                <textarea
                  readOnly
                  rows={4}
                  value={activePixConflict.paymentIntent.pixCopyPaste ?? ''}
                />
              </label>
            ) : null}
            {conflictIntent?.status === 'WAITING_PAYMENT' && whatsAppUnavailableReason ? (
              <div className="notice warning">{whatsAppUnavailableReason}</div>
            ) : null}
            {activePixConflict.type === 'GROUPED' && !activePixConflict.matchesSelectedGroup ? (
              <div className="notice warning">
                O PIX agrupado ativo não corresponde exatamente ao conjunto selecionado.
              </div>
            ) : null}
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={!activePixConflict.paymentIntent.pixCopyPaste}
                type="button"
                onClick={() => setShowConflictPix((value) => !value)}
              >
                <QrCode aria-hidden="true" size={16} />
                {showConflictPix
                  ? 'Ocultar PIX'
                  : activePixConflict.type === 'GROUPED' && activePixConflict.matchesSelectedGroup
                    ? 'Ver PIX'
                    : 'Ver PIX ativo'}
              </button>
              <button
                className="primary-button pix-whatsapp-send-button"
                disabled={
                  busy ||
                  whatsAppSending ||
                  !canSendConflictPixWhatsApp ||
                  Boolean(whatsAppUnavailableReason)
                }
                title={whatsAppUnavailableReason || undefined}
                type="button"
                onClick={() =>
                  void sendPixWhatsApp(
                    activePixConflict.paymentIntent,
                    activePixConflict.type === 'GROUPED'
                      ? 'PIX agrupado enviado pelo WhatsApp.'
                      : 'PIX ativo enviado pelo WhatsApp.',
                  )
                }
              >
                <Send aria-hidden="true" size={16} />
                {whatsAppSending ? 'Enviando...' : 'Enviar no WhatsApp'}
              </button>
              {canReplaceGroupedPix ? (
                <button
                  className="secondary-button"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setShowReplacement((value) => !value);
                    setError('');
                    setNotice('');
                  }}
                >
                  <RefreshCcw aria-hidden="true" size={16} />
                  Gerar novo PIX
                </button>
              ) : null}
              <button className="secondary-button" type="button" onClick={onClose}>
                Fechar
              </button>
            </div>
            {showReplacement && canReplaceGroupedPix ? (
              <section className="pix-panel pix-tool-panel">
                <div className="pix-status-row">
                  <strong>Gerar novo PIX agrupado</strong>
                  <span>
                    {groupedReplacementProvider
                      ? paymentProviderDisplay(groupedReplacementProvider)
                      : 'Nenhum provider configurado'}
                  </span>
                </div>
                <div className="notice warning">
                  Ao gerar um novo PIX, o PIX agrupado anterior deixará de ser o ativo para este
                  grupo.
                </div>
                <fieldset className="field">
                  <span>Provider PIX</span>
                  {eligiblePixProviders.length ? (
                    eligiblePixProviders.map((provider) => (
                      <label className="choice-row" key={provider}>
                        <input
                          checked={groupedReplacementProvider === provider}
                          name="grouped-pix-replacement-provider"
                          type="radio"
                          value={provider}
                          onChange={() => setReplacementProvider(provider)}
                        />
                        <span>{replacementProviderLabel(provider, defaultPixProvider)}</span>
                      </label>
                    ))
                  ) : (
                    <span className="field-hint">
                      Configure ao menos um provider PIX ativo para substituir o PIX agrupado.
                    </span>
                  )}
                </fieldset>
                <div className="button-row">
                  <button
                    className="primary-button"
                    disabled={busy || !groupedReplacementProvider}
                    type="button"
                    onClick={() => void replaceGroupedPix()}
                  >
                    <QrCode aria-hidden="true" size={16} />
                    Confirmar novo PIX
                  </button>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {activeIntent ? (
          <div className="pix-panel">
            <div className="pix-status-row">
              <strong>{activeIntent.status}</strong>
              <span>{paymentProviderDisplay(activeIntent.provider)}</span>
            </div>
            <dl className="detail-list compact-detail-list">
              <div>
                <dt>Expiração</dt>
                <dd>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</dd>
              </div>
            </dl>
            <label className="field">
              <span>PIX copia e cola</span>
              <textarea readOnly rows={4} value={activeIntent.pixCopyPaste ?? ''} />
            </label>
            {activeIntent.qrCodeData ? (
              <div className="pix-qr" aria-label="QR Code PIX">
                {canRenderQrImage ? (
                  <img alt="QR Code PIX" src={activeIntent.qrCodeData} />
                ) : (
                  <>
                    <QrCode aria-hidden="true" size={92} />
                    <span>{activeIntent.qrCodeData}</span>
                  </>
                )}
              </div>
            ) : null}
            {isWaitingPix && whatsAppUnavailableReason ? (
              <div className="notice warning">{whatsAppUnavailableReason}</div>
            ) : null}
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={!activeIntent.pixCopyPaste}
                type="button"
                onClick={() => void copyPix()}
              >
                <Copy aria-hidden="true" size={16} />
                Copiar
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void runAction(
                    () => syncPaymentIntent(activeIntent.id),
                    (intent) => pixSyncNotice(intent, true),
                  )
                }
              >
                <RefreshCcw aria-hidden="true" size={16} />
                Sincronizar
              </button>
              {isWaitingPix ? (
                <button
                  className="primary-button pix-whatsapp-send-button"
                  disabled={
                    busy ||
                    whatsAppSending ||
                    !canSendPixWhatsApp ||
                    Boolean(whatsAppUnavailableReason)
                  }
                  title={whatsAppUnavailableReason || undefined}
                  type="button"
                  onClick={() => void sendPixWhatsApp()}
                >
                  <Send aria-hidden="true" size={16} />
                  {whatsAppSending ? 'Enviando...' : 'Enviar no WhatsApp'}
                </button>
              ) : null}
              {activeIntent.provider === 'MOCK' ? (
                <button
                  className="primary-button"
                  disabled={busy || activeIntent.status === 'PAID'}
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => confirmMockPaymentIntent(activeIntent.id),
                      'Pagamento PIX agrupado mock confirmado.',
                    )
                  }
                >
                  <ShieldCheck aria-hidden="true" size={16} />
                  Confirmar mock
                </button>
              ) : null}
              {canCancel ? (
                <button
                  className="danger-button"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => cancelPaymentIntent(activeIntent.id),
                      'PIX agrupado cancelado no provider.',
                    )
                  }
                >
                  Cancelar
                </button>
              ) : null}
            </div>
            {isPixTemporallyExpired(activeIntent) ? (
              <div className="notice warning">Prazo informado para este PIX expirou.</div>
            ) : null}
          </div>
        ) : null}

        <div className="form-actions">
          <span>Confirme para gerar um único PIX com o total selecionado.</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Fechar
            </button>
            <button
              className="primary-button"
              disabled={
                busy || Boolean(activeIntent) || Boolean(activePixConflict) || !groupedPixProvider
              }
              type="button"
              onClick={() => void createGroupedPix()}
            >
              <QrCode aria-hidden="true" size={16} />
              Gerar PIX
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PayReceivableModal({
  categories,
  receivable,
  onClose,
  onConfirm,
}: {
  categories: FinancialCategory[];
  receivable: Receivable;
  onClose: () => void;
  onConfirm: (payload: {
    paymentDate: string;
    categoryId?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const renewalCategory = categories.find((category) => category.name === 'Renovação');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(renewalCategory?.id ?? categories[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setCategoryId(renewalCategory?.id ?? categories[0]?.id ?? '');
  }, [categories, renewalCategory?.id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="payment-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <CircleCheck size={16} />
          </span>
          <div>
            <h2 id="payment-title">Dar baixa</h2>
            <p>Registrar pagamento desta conta a receber.</p>
          </div>
          <IconButton icon={X} label="Fechar baixa" onClick={onClose} />
        </header>
        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{receivable.client?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Descrição</dt>
            <dd>{receivable.description}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatCurrency(receivable.amount)}</dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{formatDate(receivable.dueDate)}</dd>
          </div>
        </dl>
        <div className="form-grid">
          <label className="field">
            <span>Data do pagamento</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Categoria</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observação</span>
            <input
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <span>Confirme para registrar a entrada financeira vinculada a esta conta.</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void onConfirm({ paymentDate, categoryId, notes })}
            >
              Confirmar pagamento
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PayReceivablesModal({
  categories,
  receivables,
  onClose,
  onConfirm,
}: {
  categories: FinancialCategory[];
  receivables: Receivable[];
  onClose: () => void;
  onConfirm: (payload: {
    paymentDate: string;
    categoryId?: string;
    notes?: string;
  }) => Promise<void>;
}) {
  const renewalCategory = categories.find((category) => category.name === 'Renovação');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(renewalCategory?.id ?? categories[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const total = receivables.reduce((sum, receivable) => sum + Number(receivable.amount), 0);

  useEffect(() => {
    setCategoryId(renewalCategory?.id ?? categories[0]?.id ?? '');
  }, [categories, renewalCategory?.id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="group-payment-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon" aria-hidden="true">
            <CircleCheck size={16} />
          </span>
          <div>
            <h2 id="group-payment-title">Dar baixa selecionados</h2>
            <p>Registrar pagamento agrupado das contas selecionadas.</p>
          </div>
          <IconButton icon={X} label="Fechar baixa agrupada" onClick={onClose} />
        </header>
        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{receivables[0]?.client?.name ?? '-'}</dd>
          </div>
          <div>
            <dt>Contas</dt>
            <dd>{receivables.length}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatCurrency(total)}</dd>
          </div>
        </dl>
        <div className="mini-list">
          {receivables.map((receivable) => (
            <article key={receivable.id}>
              <strong>
                {receivable.clientReference?.reference ?? receivable.client?.reference}
              </strong>
              <span>{formatDate(receivable.dueDate)}</span>
              <p>{formatCurrency(receivable.amount)}</p>
            </article>
          ))}
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Data do pagamento</span>
            <input
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Categoria</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Observação</span>
            <input
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <span>Confirme para quitar integralmente todas as contas selecionadas.</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => void onConfirm({ paymentDate, categoryId, notes })}
            >
              Confirmar pagamento
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CancelReceivableModal({
  receivable,
  onClose,
  onConfirm,
}: {
  receivable: Receivable;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="cancel-receivable-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon danger" aria-hidden="true">
            <XCircle size={16} />
          </span>
          <div>
            <h2 id="cancel-receivable-title">Cancelar recebivel</h2>
            <p>Informar o motivo antes de cancelar esta conta.</p>
          </div>
          <IconButton icon={X} label="Fechar cancelamento" onClick={onClose} />
        </header>
        <p>{receivable.description}</p>
        <label className="field">
          <span>Motivo do cancelamento</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        <div className="form-actions">
          <span />
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="danger-button"
              disabled={!reason.trim()}
              type="button"
              onClick={() => void onConfirm(reason)}
            >
              Confirmar cancelamento
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PlansView({
  editingPlan,
  onCreate,
  onDelete,
  onEdit,
  onCloseForm,
  onNew,
  onUpdate,
  planFormOpen,
  plans,
}: {
  editingPlan: Plan | null;
  onCreate: Parameters<typeof PlanForm>[0]['onSubmit'];
  onDelete: (id: string) => Promise<void>;
  onEdit: (plan: Plan) => void;
  onCloseForm: () => void;
  onNew: () => void;
  onUpdate: Parameters<typeof PlanForm>[0]['onSubmit'];
  planFormOpen: boolean;
  plans: Plan[];
}) {
  const activePlans = plans.filter((plan) => plan.active).length;
  const inactivePlans = plans.length - activePlans;
  const sortedPlans = sortPlansByDuration(plans);

  return (
    <>
      <PageHeader
        icon={Layers}
        title="Planos"
        subtitle="Gerencie os planos utilizados nas referências dos clientes."
        actions={
          <button className="primary-button plans-new-button" type="button" onClick={onNew}>
            <Plus aria-hidden="true" size={17} />
            <span className="plans-new-desktop-label">Novo plano</span>
            <span className="plans-new-mobile-label">+ Novo plano</span>
          </button>
        }
      />

      {planFormOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal plan-form-modal" aria-labelledby="plan-form-title">
            <header className="modal-header modal-header-with-icon">
              <span className="modal-icon info" aria-hidden="true">
                <Package size={17} />
              </span>
              <div>
                <span className="metric-label">Plano</span>
                <h2 id="plan-form-title">{editingPlan ? 'Editar plano' : 'Novo plano'}</h2>
                <p>
                  {editingPlan
                    ? 'Atualize o plano preservando as regras atuais de referências.'
                    : 'Cadastre um novo plano para utilização nas referências.'}
                </p>
              </div>
              <IconButton icon={X} label="Fechar plano" onClick={onCloseForm} />
            </header>
            <PlanForm
              onCancel={onCloseForm}
              plan={editingPlan ?? undefined}
              submitLabel="Salvar plano"
              onSubmit={editingPlan ? onUpdate : onCreate}
            />
          </section>
        </div>
      ) : null}

      <section className="plans-view">
        <div className="metric-grid plans-kpis">
          <StatCard icon={Package} label="Planos" tone="primary" value={plans.length} />
          <StatCard icon={CircleCheck} label="Ativos" tone="success" value={activePlans} />
          <StatCard icon={Minus} label="Inativos" tone="info" value={inactivePlans} />
        </div>

        <section className="workspace-main plans-workspace" aria-label="Lista de planos">
          {sortedPlans.length ? (
            <div className="plans-grid">
              {sortedPlans.map((plan) => (
                <article className="plan-card" key={plan.id}>
                  <div className="plan-card-header">
                    <span className="plan-card-icon" aria-hidden="true">
                      <Package size={17} />
                    </span>
                    <div>
                      <h3>{plan.name}</h3>
                      <span>Plano comercial</span>
                    </div>
                    <span className={`status-badge status-${plan.active ? 'ativo' : 'inativo'}`}>
                      {plan.active ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </div>

                  <div className="plan-card-body">
                    <strong className="plan-card-value">{formatCurrency(plan.defaultValue)}</strong>

                    <dl className="plan-card-meta">
                      <div>
                        <dt>
                          <Clock aria-hidden="true" size={14} />
                          Duração
                        </dt>
                        <dd>{formatPlanDuration(plan.durationMonths)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="plan-card-actions">
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => onEdit(plan)}
                    >
                      <Pencil aria-hidden="true" size={14} />
                      Editar
                    </button>
                    <ActionMenu
                      items={[
                        {
                          danger: true,
                          icon: Trash2,
                          label: 'Remover',
                          onSelect: () => void onDelete(plan.id),
                        },
                      ]}
                      label={`Mais ações de ${plan.name}`}
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state plans-empty-state">
              <PackageOpen aria-hidden="true" size={32} />
              <strong>Nenhum plano cadastrado</strong>
              <span>Cadastre um plano para começar a utilizá-lo nas referências.</span>
              <button className="primary-button" type="button" onClick={onNew}>
                <Plus aria-hidden="true" size={16} />
                Novo plano
              </button>
            </div>
          )}
        </section>
      </section>
    </>
  );
}

function formatPlanDuration(durationMonths: number) {
  return durationMonths === 1 ? '1 mês' : `${durationMonths} meses`;
}
