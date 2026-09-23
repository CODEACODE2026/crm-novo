'use client';

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
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
  cancelReceivable,
  cancelPaymentIntent,
  confirmMockPaymentIntent,
  confirmRenewalReversal,
  confirmReferenceRenewal,
  createClient,
  createClientReference,
  createFinancialCategory,
  createManualEntry,
  createManualExpense,
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
  previewDeleteClient,
  previewDeleteClientReference,
  previewReferenceRenewal,
  previewRenewalReversal,
  refreshWhatsAppStatus,
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
  reconcileBilling,
  reconcileBillingReceivables,
  reconcileRecovery,
  sendBillingNow,
  savePaymentProviderCredential,
  savePaymentWebhookSecret,
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
  type Client,
  type ClientEvent,
  type ClientPayload,
  type ClientReference,
  type ClientStatus,
  type ClientUpdatePayload,
  type DashboardSummary as DashboardSummaryPayload,
  type FinancialCategory,
  type FinancialSummary,
  type FinancialTransaction,
  type FinancialTransactionOrigin,
  type FinancialTransactionPayload,
  type FinancialTransactionType,
  type PaginatedClients,
  type PaginatedClientEvents,
  type PaymentIntent,
  type PaymentIntentsSummary,
  type PaymentIntentStatus,
  type PaymentProviderCredentialStatus,
  type PaymentProviderCode,
  type Receivable,
  type ReceivableDisplayStatus,
  type ReceivablesSummary,
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
  | 'settings';
type FinanceTab = 'summary' | 'receivables' | 'entries' | 'expenses' | 'categories';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'referrals', label: 'Indicações', icon: Gift },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'plans', label: 'Planos', icon: ToggleLeft },
  { id: 'billing', label: 'Cobranças', icon: Bell },
  { id: 'automations', label: 'Automações', icon: Activity },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'waitlist', label: 'Lista de Espera', icon: ListChecks },
  { id: 'settings', label: 'Configurações', icon: Settings },
] satisfies Array<{ id: View; label: string; icon: typeof LayoutDashboard }>;

const futureNavItems = [{ label: 'Renovações', icon: RefreshCcw }];
const listPageSize = 10;
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
  const [renewalTarget, setRenewalTarget] = useState<RenewalTarget | null>(null);
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

  function openRenewal(client: Client, reference?: ClientReference) {
    const selectedReference =
      reference ?? (client.references?.length === 1 ? client.references[0] : null);

    if (!selectedReference) {
      setSelectedClient(client);
      setView('clients');
      setRenewalNotice('Selecione uma referência específica para renovar.');
      return;
    }

    setRenewalNotice('');
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
      onNavigate={setView}
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
            openRenewal(client, reference);
          }}
        />
      ) : null}
      {view === 'clients' ? (
        <ClientsView
          clientFormOpen={clientFormOpen}
          clients={clients}
          clientsPagination={clientsPayload?.pagination ?? null}
          dataLoading={dataLoading}
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
          onRenew={openRenewal}
          onRevertRenewal={(client, renewal) => void openRenewalReversal(client, renewal)}
          onCreateReference={async (client, payload) => {
            await createClientReference(client.id, payload);
            const detailed = await getClient(client.id);
            setSelectedClient(detailed);
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
      {view === 'automations' ? <AutomationsView /> : null}
      {view === 'reports' ? <ReportsView clients={clients} plans={plans} /> : null}
      {view === 'settings' ? <SettingsView /> : null}
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
    plans: 'Planos comerciais e recorrências',
    referrals: 'Indicações, benefícios e recompensas',
    reports: 'Exportações e análises administrativas',
    settings: 'Configurações técnicas do CRM',
    waitlist: 'Contatos recebidos pelo WhatsApp aguardando atendimento.',
    whatsapp: 'Conexão e mensagens operacionais',
  } satisfies Record<View, string>;

  return subtitles[view];
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
  const [periodMode, setPeriodMode] = useState<'current' | 'previous' | 'last30' | 'custom'>(
    'current',
  );
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
  const singleCashflowPoint = cashflowPoints[0];
  const hasCashflowSeries = cashflowPoints.length > 1;
  const recentActivity = summary?.lists.recentActivity.slice(0, 6) ?? [];
  const financeBalance = Number(summary?.finance.balance ?? 0);
  const financeBalanceTone =
    financeBalance < 0 ? 'is-negative' : financeBalance > 0 ? 'is-positive' : 'is-neutral';
  const receivedMax = maxChartValue(summary?.charts.received.map((item) => item.amount) ?? []);
  const clientMax = Math.max(...(summary?.charts.clients.map((item) => item.value) ?? [1]), 1);

  return (
    <>
      <PageHeader
        eyebrow="CRM NOVO UI 2.0"
        title="Dashboard operacional"
        subtitle={summary?.period.label ?? 'Indicadores reais do CRM, sem dados simulados.'}
        actions={
          <div className="quick-actions">
            <button className="primary-button" type="button" onClick={onNewClient}>
              <Plus aria-hidden="true" size={16} />
              Novo cliente
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenFinance('entries')}
            >
              <DollarSign aria-hidden="true" size={16} />
              Entrada
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => onOpenFinance('receivables')}
            >
              Recebíveis
            </button>
          </div>
        }
      />

      <div className="dashboard-toolbar">
        <div className="period-controls" aria-label="Período do dashboard">
          {[
            ['current', 'Mês atual'],
            ['previous', 'Mês anterior'],
            ['last30', 'Últimos 30 dias'],
            ['custom', 'Personalizado'],
          ].map(([value, label]) => (
            <button
              className={periodMode === value ? 'active' : ''}
              key={value}
              type="button"
              onClick={() => setPeriodMode(value as typeof periodMode)}
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
          <SectionHeader eyebrow="Financeiro" title="Visão financeira" />
          <div className="dashboard-finance-body">
            <div className="dashboard-cashflow-visual">
              {hasCashflowSeries ? (
                <div className="bar-chart">
                  {cashflowPoints.map((item) => (
                    <div className="bar-group" key={item.period}>
                      <span>{formatPeriodLabel(item.period)}</span>
                      <div className="bar-track">
                        <i
                          className="bar-entry"
                          style={{ width: `${chartPercent(item.entries, cashflowMax)}%` }}
                        />
                        <i
                          className="bar-expense"
                          style={{ width: `${chartPercent(item.expenses, cashflowMax)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : singleCashflowPoint ? (
                <div className="cashflow-comparison">
                  {[
                    ['Entradas', singleCashflowPoint.entries, 'bar-entry'],
                    ['Saídas', singleCashflowPoint.expenses, 'bar-expense'],
                  ].map(([label, value, className]) => (
                    <div className="cashflow-comparison-row" key={label}>
                      <span>{label}</span>
                      <div className="bar-track">
                        <i
                          className={String(className)}
                          style={{ width: `${chartPercent(String(value), cashflowMax)}%` }}
                        />
                      </div>
                      <strong>{formatCurrency(String(value))}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty-state">Sem dados.</div>
              )}
            </div>
            <div className="finance-side-metrics">
              {[
                ['Entradas', summary?.finance.entries, ''],
                ['Saídas', summary?.finance.expenses, ''],
                ['Saldo', summary?.finance.balance, financeBalanceTone],
                ['Valor renovado', summary?.renewals.amount, ''],
              ].map(([label, value, tone]) => (
                <div className={String(tone)} key={label}>
                  <span>{label}</span>
                  <strong>{loading ? '-' : formatCurrency(String(value ?? '0'))}</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="activity-panel">
          <SectionHeader eyebrow="Timeline" title="Atividade recente" />
          <div className="activity-list">
            {recentActivity.map((event) => (
              <button
                className="activity-item"
                key={event.id}
                type="button"
                onClick={() => void onOpenClient(event.client.id)}
              >
                <ClientEventIcon type={event.type} />
                <span>
                  <strong>{event.title}</strong>
                  <small>
                    {event.client.name} | {new Date(event.createdAt).toLocaleString('pt-BR')}
                  </small>
                  {event.description ? <em>{event.description}</em> : null}
                </span>
              </button>
            ))}
            {!summary?.lists.recentActivity.length ? (
              <div className="empty-state compact-empty-state">Sem atividade recente.</div>
            ) : null}
          </div>
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
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
            {!summary?.pending.items.length ? (
              <div className="empty-state compact-empty-state">Sem pendências operacionais.</div>
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

      <div className="dashboard-tertiary-grid">
        <Card>
          <SectionHeader eyebrow="Recebimentos" title="Recebido por período" />
          <div className="single-bar-chart">
            {(summary?.charts.received ?? []).map((item) => (
              <div className="bar-group" key={item.period}>
                <span>{formatPeriodLabel(item.period)}</span>
                <div className="bar-track">
                  <i
                    className="bar-received"
                    style={{ width: `${chartPercent(item.amount, receivedMax)}%` }}
                  />
                </div>
              </div>
            ))}
            {!summary?.charts.received.length ? (
              <div className="empty-state">Sem dados.</div>
            ) : null}
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="Clientes" title="Distribuição" />
          <div className="client-distribution">
            {(summary?.charts.clients ?? []).map((item) => (
              <div className="distribution-row" key={item.label}>
                <span>{item.label}</span>
                <div className="bar-track">
                  <i style={{ width: `${(item.value / clientMax) * 100}%` }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
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
    return <div className="empty-state compact-empty-state">Nenhum cliente nesta lista.</div>;
  }

  return (
    <div className="compact-table">
      {items.map((client) => (
        <article key={client.id}>
          <div>
            <strong>{client.name}</strong>
            <span>
              {client.reference} | {client.planName}
            </span>
          </div>
          <span>{formatCurrency(client.recurringValue)}</span>
          <span>{formatDate(client.dueDate)}</span>
          <StatusBadge status={client.status} />
          <div className="button-row">
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
    return <div className="empty-state compact-empty-state">Nenhuma conta vencida.</div>;
  }

  return (
    <div className="compact-table">
      {items.map((receivable) => (
        <article key={receivable.id}>
          <div>
            <strong>{receivable.clientName}</strong>
            <span>
              {receivable.clientReference} | {receivable.description}
            </span>
          </div>
          <span>{formatCurrency(receivable.amount)}</span>
          <span>{formatDate(receivable.dueDate)}</span>
          <span>{receivable.daysOverdue} dias</span>
          <button
            className="icon-button"
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

function buildDashboardPeriod(
  mode: 'current' | 'previous' | 'last30' | 'custom',
  customStart: string,
  customEnd: string,
) {
  const today = new Date();
  const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

  if (mode === 'custom') {
    return customStart && customEnd ? { startDate: customStart, endDate: customEnd } : {};
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

function maxChartValue(values: string[]) {
  return Math.max(...values.map((value) => Number(value)), 1);
}

function chartPercent(value: string, maxValue: number) {
  return Math.max(3, (Number(value) / maxValue) * 100);
}

function formatPeriodLabel(period: string) {
  if (period.length === 7) {
    const [year, month] = period.split('-');
    return `${month}/${year}`;
  }

  return formatDate(period);
}

type ConfigurablePaymentProvider = Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>;

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
            .map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
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

function SettingsView() {
  const [credentials, setCredentials] = useState<PaymentProviderCredentialStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      setCredentials(await listPaymentProviderCredentials());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar integrações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCredentials();
  }, [loadCredentials]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    setNotice('');
    setError('');

    try {
      await action();
      await loadCredentials();
      setNotice(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar integração.');
    }
  }

  const byProvider = (provider: ConfigurablePaymentProvider) =>
    credentials.find((credential) => credential.provider === provider) ?? {
      provider,
      configured: false,
      status: 'NAO_CONFIGURADO' as const,
    };

  return (
    <section className="workspace-main">
      {error ? <div className="notice danger">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

      <div className="tabs">
        <button className="active" type="button">
          Integrações
        </button>
      </div>

      <div className="settings-section">
        <div className="panel-header">
          <h2>Pagamentos</h2>
          <button className="secondary-button" type="button" onClick={() => void loadCredentials()}>
            <RefreshCcw aria-hidden="true" size={16} />
            Atualizar
          </button>
        </div>
        <div className="payment-provider-grid">
          {(['FASTFLOW', 'FASTPAY'] satisfies ConfigurablePaymentProvider[]).map((provider) => (
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
              onSaveWebhookSecret={(secret) =>
                runAction(
                  () => savePaymentWebhookSecret(provider, secret),
                  `Webhook secret do ${paymentProviderLabel(provider)} configurado.`,
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
  onSaveWebhookSecret,
  onSetDefault,
  onTest,
}: {
  credential: PaymentProviderCredentialStatus;
  loading: boolean;
  provider: ConfigurablePaymentProvider;
  onDeactivate: () => Promise<void>;
  onRegisterWebhook: () => Promise<void>;
  onSave: (payload: {
    provider: ConfigurablePaymentProvider;
    name: string;
    token: string;
  }) => Promise<void>;
  onSaveWebhookSecret: (secret: string) => Promise<void>;
  onSetDefault: () => Promise<void>;
  onTest: () => Promise<void>;
}) {
  const [name, setName] = useState(credential.name ?? paymentProviderLabel(provider));
  const [token, setToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  useEffect(() => {
    setName(credential.name ?? paymentProviderLabel(provider));
    setToken('');
    setWebhookSecret('');
  }, [credential.name, provider]);

  return (
    <article className="payment-provider-card">
      <header>
        <div>
          <h3>{paymentProviderLabel(provider)}</h3>
          <span className={`integration-status ${credential.status.toLowerCase()}`}>
            {paymentProviderStatusLabel(credential.status)}
          </span>
        </div>
        {credential.tokenMask ? <code>{credential.tokenMask}</code> : null}
        {credential.defaultForPix ? <span className="pill">Padrao PIX</span> : null}
      </header>

      <label className="field">
        <span>Nome da integração</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Chave API</span>
        <input
          autoComplete="off"
          placeholder={credential.configured ? 'Chave salva não exibida' : 'fdpx_...'}
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Webhook secret</span>
        <input
          autoComplete="off"
          placeholder={
            credential.webhookSecretConfigured
              ? (credential.webhookSecretMask ?? 'Secret configurado')
              : 'sha256 secret'
          }
          type="password"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
        />
      </label>

      <dl className="detail-list integration-details">
        <div>
          <dt>Validado em</dt>
          <dd>{credential.validatedAt ? formatDateTime(credential.validatedAt) : '-'}</dd>
        </div>
        <div>
          <dt>Status tecnico</dt>
          <dd>{credential.lastValidationStatus ?? '-'}</dd>
        </div>
        <div>
          <dt>Webhook</dt>
          <dd>{credential.webhookRegisteredAt ? 'Registrado' : 'Não registrado'}</dd>
        </div>
        <div>
          <dt>URL</dt>
          <dd>{credential.webhookUrl ?? '-'}</dd>
        </div>
      </dl>

      <div className="button-row">
        <button
          className="primary-button"
          disabled={loading || token.trim().length < 12}
          type="button"
          onClick={() => void onSave({ provider, name, token })}
        >
          <ShieldCheck aria-hidden="true" size={16} />
          {credential.configured ? 'Substituir chave' : 'Salvar'}
        </button>
        <button
          className="secondary-button"
          disabled={loading || !credential.configured || webhookSecret.trim().length < 16}
          type="button"
          onClick={() => void onSaveWebhookSecret(webhookSecret)}
        >
          Secret
        </button>
        <button
          className="secondary-button"
          disabled={loading || !credential.configured}
          type="button"
          onClick={() => void onTest()}
        >
          Testár conexao
        </button>
        <button
          className="secondary-button"
          disabled={loading || !credential.configured || Boolean(credential.defaultForPix)}
          type="button"
          onClick={() => void onSetDefault()}
        >
          Padrao
        </button>
        <button
          className="secondary-button"
          disabled={loading || !credential.configured}
          type="button"
          onClick={() => void onRegisterWebhook()}
        >
          Webhook
        </button>
        <button
          className="danger-button"
          disabled={loading || !credential.configured}
          type="button"
          onClick={() => void onDeactivate()}
        >
          Desativar
        </button>
      </div>
    </article>
  );
}

function paymentProviderLabel(provider: ConfigurablePaymentProvider) {
  return provider === 'FASTFLOW' ? 'FastFlow' : 'FastPay';
}

function paymentProviderStatusLabel(status: PaymentProviderCredentialStatus['status']) {
  if (status === 'VALIDO') return 'VALIDO';
  if (status === 'CONFIGURADO') return 'CONFIGURADO';
  if (status === 'ERRO') return 'ERRO';
  return 'NAO CONFIGURADO';
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
  editingClient,
  onApplyFilters,
  onCreate,
  onEdit,
  onNew,
  onClearSelection,
  onCloseForm,
  onRenew,
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
  editingClient: Client | null;
  onApplyFilters: () => void;
  onCreate: (payload: ClientPayload) => Promise<void>;
  onEdit: (client: Client) => void;
  onNew: () => void;
  onClearSelection: () => void;
  onRenew: (client: Client, reference?: ClientReference) => void;
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
  const [detailTab, setDetailTab] = useState<
    'overview' | 'references' | 'receivables' | 'messages' | 'timeline' | 'more'
  >('overview');
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
  const [clientFinancePeriod, setClientFinancePeriod] = useState<FinancePeriod>(() =>
    currentFinancePeriod(),
  );
  const [clientFinanceReferenceId, setClientFinanceReferenceId] = useState('');
  const [clientFinanceStatus, setClientFinanceStatus] = useState<ReceivableDisplayStatus | ''>('');
  const [clientFinanceLoading, setClientFinanceLoading] = useState(false);
  const [clientFinanceError, setClientFinanceError] = useState('');
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [pixReceivable, setPixReceivable] = useState<Receivable | null>(null);
  const [paymentReceivables, setPaymentReceivables] = useState<Receivable[] | null>(null);
  const [pixReceivables, setPixReceivables] = useState<Receivable[] | null>(null);
  const [cancelingReceivable, setCancelingReceivable] = useState<Receivable | null>(null);
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
      endDate: clientFinancePeriod.endDate,
      startDate: clientFinancePeriod.startDate,
    };

    try {
      const [nextReceivables, nextSummary] = await Promise.all([
        listReceivables({
          ...baseFilters,
          page: clientFinancePage,
          pageSize: listPageSize,
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
  }, [
    clientFinancePage,
    clientFinancePeriod.endDate,
    clientFinancePeriod.startDate,
    clientFinanceReferenceId,
    clientFinanceStatus,
    selectedClientId,
  ]);

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
    setSelectedReceivableIds([]);
    setSelectedDispatch(null);
    setReferenceStatusModal(null);
    setPaymentReceivable(null);
    setPixReceivable(null);
    setPaymentReceivables(null);
    setPixReceivables(null);
    setCancelingReceivable(null);
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
    setClientFinancePeriod(currentFinancePeriod());
    setClientFinanceReferenceId('');
    setClientFinanceStatus('');
    setClientFinanceLoading(false);
    setClientFinanceError('');
    setTimelineItems([]);
    setTimelinePagination(null);
    setTimelinePage(1);
    setTimelineLoading(false);
    setTimelineError('');
  }, [selectedClient]);

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
  }, [
    clientFinancePage,
    clientFinancePeriod.startDate,
    clientFinanceReferenceId,
    clientFinanceStatus,
  ]);

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

  function changeClientFinanceMonth(months: number) {
    setClientFinancePeriod((current) => shiftFinancePeriod(current, months));
    setClientFinancePage(1);
  }

  return (
    <>
      {!selectedClient ? (
        <PageHeader
          actions={
            <Button icon={UserPlus} onClick={onNew} variant="primary">
              Novo cliente
            </Button>
          }
          subtitle="Base de clientes, referências e histórico"
          title="Clientes"
        />
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
                            <span>
                              <strong>{client.name}</strong>
                              <small>{client.email ?? client.phoneNormalized}</small>
                            </span>
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
                                  label: 'Renovar',
                                  onSelect: () => onRenew(client, singleReference ?? undefined),
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
              <Button icon={ArrowLeft} size="sm" variant="ghost" onClick={onClearSelection}>
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
                    icon={RefreshCw}
                    disabled={!uniqueSelectedReference}
                    size="sm"
                    variant="primary"
                    onClick={() => onRenew(selectedClient)}
                  >
                    Renovar
                  </Button>
                  <Button
                    icon={Send}
                    size="sm"
                    variant="secondary"
                    onClick={() => setWhatsAppClient(selectedClient)}
                  >
                    WhatsApp
                  </Button>
                  <IconButton
                    icon={Pencil}
                    label="Editar cliente"
                    onClick={() => onEdit(selectedClient)}
                  />
                  <ActionMenu
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
                            onClick={() => onRenew(selectedClient, reference)}
                          >
                            Renovar
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
                  <div className="finance-period-bar" aria-label="Período financeiro do cliente">
                    <CalendarDays aria-hidden="true" size={18} />
                    <IconButton
                      icon={ArrowLeft}
                      label="Mês anterior"
                      size="sm"
                      variant="secondary"
                      onClick={() => changeClientFinanceMonth(-1)}
                    />
                    <strong>{clientFinancePeriod.label}</strong>
                    <IconButton
                      icon={ArrowRight}
                      label="Próximo mês"
                      size="sm"
                      variant="secondary"
                      onClick={() => changeClientFinanceMonth(1)}
                    />
                    <span>
                      {formatDate(clientFinancePeriod.startDate)} até{' '}
                      {formatDate(clientFinancePeriod.endDate)}
                    </span>
                  </div>
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

                          return (
                            <tr key={receivable.id}>
                              <td className="finance-select-column">
                                <input
                                  aria-label={`Selecionar ${receivable.description}`}
                                  checked={checked}
                                  disabled={receivable.status !== 'PENDENTE'}
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
                      : `Crie uma nova referência para o cliente ${selectedClient.name}.`}
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

        <div className="table-wrap">
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
                  <td>{dispatch.client?.name ?? 'Cliente não vinculado'}</td>
                  <td>{billingDispatchReferenceLabel(dispatch)}</td>
                  <td className="billing-amount-column">{billingDispatchAmountLabel(dispatch)}</td>
                  <td>{billingDispatchDueDateLabel(dispatch)}</td>
                  <td>{dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}</td>
                  <td>{dispatch.sentAt ? formatDateTime(dispatch.sentAt) : '-'}</td>
                  <td className="finance-status-column">
                    <span
                      className={`finance-status-pill tone-${billingDispatchStatusTone(
                        dispatch.status,
                      )}`}
                    >
                      {billingStatusLabel(dispatch.status)}
                    </span>
                  </td>
                  <td className="finance-attempts-column">{dispatch.attempts ?? 0}/3</td>
                  <td className="finance-actions-column">
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

const recoveryTemplateVariables = [
  'nome',
  'primeiroNome',
  'referencia',
  'plano',
  'valor',
  'vencimento',
  'diasAtraso',
];

type AutomationTab = 'billing' | 'recovery' | 'monitoring';
type RecoveryTemplateCard = (typeof recoveryTemplateCards)[number];

const automationTabs = [
  { id: 'billing', label: 'Cobrança automática' },
  { id: 'recovery', label: 'Recuperação por inadimplência' },
  { id: 'monitoring', label: 'Monitoramento' },
] satisfies Array<{ id: AutomationTab; label: string }>;

function billingAutomationTemplateTitle(type: MessageTemplate['type']) {
  if (type === 'BILLING_DUE_GROUPED') return 'Cobrança agrupada';
  return 'Cobrança individual';
}

function billingAutomationTemplateDescription(type: MessageTemplate['type']) {
  if (type === 'BILLING_DUE_GROUPED') {
    return 'Usada quando várias cobranças são consolidadas em uma única mensagem.';
  }

  return 'Usada quando existe uma única cobrança para o cliente.';
}

function recoveryAutomationTemplateTitle(card: RecoveryTemplateCard) {
  return card.templateType.replace('RECOVERY_DAY_', 'D+');
}

function shortUuid(value: string | null | undefined) {
  if (!value) return '-';
  return value.length > 8 ? `${value.slice(0, 8)}…` : value;
}

function BillingAutomationPreviewModal({
  template,
  onClose,
}: {
  template: MessageTemplate;
  onClose: () => void;
}) {
  const grouped = template.type === 'BILLING_DUE_GROUPED';

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal automation-message-modal" aria-labelledby="billing-preview-title">
        <header className="modal-header">
          <div>
            <h2 id="billing-preview-title">Prévia da mensagem</h2>
            <p>Exemplo de visualização</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <div className="automation-preview-card">
          <span className="metric-label">{billingAutomationTemplateTitle(template.type)}</span>
          <strong>João</strong>
          {grouped ? (
            <>
              <p>3 serviços</p>
              <ul>
                <li>teste01 — R$ 30,00 — vence 20/09/2026</li>
                <li>teste02 — R$ 30,00 — vence 20/09/2026</li>
                <li>teste03 — R$ 30,00 — vence 20/09/2026</li>
              </ul>
              <strong>Total: R$ 90,00</strong>
            </>
          ) : (
            <dl>
              <div>
                <dt>Plano</dt>
                <dd>Plano Mensal</dd>
              </div>
              <div>
                <dt>Valor</dt>
                <dd>R$ 30,00</dd>
              </div>
              <div>
                <dt>Vencimento</dt>
                <dd>20/09/2026</dd>
              </div>
            </dl>
          )}
        </div>
      </section>
    </div>
  );
}

function RecoveryAutomationPreviewModal({
  card,
  onClose,
}: {
  card: RecoveryTemplateCard;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal automation-message-modal" aria-labelledby="recovery-preview-title">
        <header className="modal-header">
          <div>
            <h2 id="recovery-preview-title">Prévia da mensagem</h2>
            <p>Exemplo de visualização</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <div className="automation-preview-card">
          <span className="metric-label">{recoveryAutomationTemplateTitle(card)}</span>
          <strong>João</strong>
          <dl>
            <div>
              <dt>Referência</dt>
              <dd>Plano Mensal</dd>
            </div>
            <div>
              <dt>Valor em aberto</dt>
              <dd>R$ 30,00</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>20/09/2026</dd>
            </div>
            <div>
              <dt>Etapa</dt>
              <dd>{card.title}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}

function AutomationsView() {
  const [automationTab, setAutomationTab] = useState<AutomationTab>('billing');
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingAutomationSettings | null>(null);
  const [sendTime, setSendTime] = useState('09:00');
  const [sendIntervalSeconds, setSendIntervalSeconds] = useState('8');
  const [recoverySettings, setRecoverySettings] = useState<RecoveryAutomationSettings | null>(null);
  const [recoverySendTime, setRecoverySendTime] = useState('09:00');
  const [recoverySendIntervalSeconds, setRecoverySendIntervalSeconds] = useState('8');
  const [recoveryOffsets, setRecoveryOffsets] = useState(['3', '7', '15', '30']);
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary | null>(null);
  const [campaigns, setCampaigns] = useState<RecoveryCampaign[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [previewingBillingTemplate, setPreviewingBillingTemplate] =
    useState<MessageTemplate | null>(null);
  const [editingBillingTemplate, setEditingBillingTemplate] = useState<MessageTemplate | null>(
    null,
  );
  const [billingTemplateContent, setBillingTemplateContent] = useState('');
  const [editingRecoveryTemplate, setEditingRecoveryTemplate] = useState<MessageTemplate | null>(
    null,
  );
  const [recoveryTemplateContent, setRecoveryTemplateContent] = useState('');
  const [recoveryTemplateName, setRecoveryTemplateName] = useState('');
  const [recoveryTemplatePreview, setRecoveryTemplatePreview] = useState('');
  const [previewingRecoveryTemplate, setPreviewingRecoveryTemplate] =
    useState<RecoveryTemplateCard | null>(null);
  const [editingRecoverySteps, setEditingRecoverySteps] = useState(false);
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
      setSendTime(nextBillingSettings.sendTime);
      setSendIntervalSeconds(String(nextBillingSettings.sendIntervalSeconds));
      setRecoverySettings(nextRecoverySettings);
      setRecoverySendTime(nextRecoverySettings.sendTime);
      setRecoverySendIntervalSeconds(String(nextRecoverySettings.sendIntervalSeconds));
      setRecoveryOffsets(nextRecoverySettings.steps.map((step) => String(step.offsetDays)));
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

  function openBillingTemplate(template: MessageTemplate) {
    setEditingBillingTemplate(template);
    setBillingTemplateContent(template.content);
    setError('');
  }

  async function saveBillingTemplate() {
    if (!editingBillingTemplate) return;
    setWorking('billing-template');
    setError('');

    try {
      await updateMessageTemplate(editingBillingTemplate.id, { content: billingTemplateContent });
      setEditingBillingTemplate(null);
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar mensagem.');
    } finally {
      setWorking('');
    }
  }

  async function toggleBillingTemplate(template: MessageTemplate) {
    setWorking(template.id);
    setError('');

    try {
      await updateMessageTemplate(template.id, { active: !template.active });
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar mensagem.');
    } finally {
      setWorking('');
    }
  }

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

  function openRecoveryTemplate(template: MessageTemplate) {
    setEditingRecoveryTemplate(template);
    setRecoveryTemplateName(template.name);
    setRecoveryTemplateContent(template.content);
    setRecoveryTemplatePreview('');
    setError('');
  }

  async function saveRecoveryTemplate() {
    if (!editingRecoveryTemplate) return;
    setWorking('recovery-template');
    setError('');

    try {
      await updateMessageTemplate(editingRecoveryTemplate.id, {
        name: recoveryTemplateName,
        content: recoveryTemplateContent,
      });
      setEditingRecoveryTemplate(null);
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar mensagem.');
    } finally {
      setWorking('');
    }
  }

  async function toggleRecoveryTemplate(template: MessageTemplate) {
    setWorking(template.id);
    setError('');

    try {
      await updateMessageTemplate(template.id, { active: !template.active });
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar mensagem.');
    } finally {
      setWorking('');
    }
  }

  async function loadRecoveryTemplatePreview() {
    if (!editingRecoveryTemplate) return;
    setWorking('recovery-preview');
    setError('');

    try {
      const result = await previewMessageTemplate(editingRecoveryTemplate.id, {
        content: recoveryTemplateContent,
      });
      setRecoveryTemplatePreview(result.renderedContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar preview.');
    } finally {
      setWorking('');
    }
  }

  async function saveBillingSettings(
    payload: Partial<
      Pick<BillingAutomationSettings, 'enabled' | 'sendTime' | 'sendIntervalSeconds'>
    >,
  ) {
    setWorking('billing-settings');
    setError('');

    try {
      const next = await updateBillingAutomationSettings({
        ...payload,
        timezone: 'America/Sao_Paulo',
      });
      setBillingSettings(next);
      setSendTime(next.sendTime);
      setSendIntervalSeconds(String(next.sendIntervalSeconds));
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar cobrança automática.');
    } finally {
      setWorking('');
    }
  }

  async function saveRecoverySettings(payload: Partial<RecoveryAutomationSettings>) {
    setWorking('recovery-settings');
    setError('');

    try {
      const next = await updateRecoveryAutomationSettings({
        ...payload,
        timezone: 'America/Sao_Paulo',
      });
      setRecoverySettings(next);
      setRecoverySendTime(next.sendTime);
      setRecoverySendIntervalSeconds(String(next.sendIntervalSeconds));
      setRecoveryOffsets(next.steps.map((step) => String(step.offsetDays)));
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar recuperação.');
    } finally {
      setWorking('');
    }
  }

  function recoveryPayloadFromOffsets(offsets: string[]) {
    const parsed = offsets.map((offset) => Number(offset));

    if (
      parsed.some((offset) => !Number.isInteger(offset) || offset <= 0) ||
      new Set(parsed).size !== parsed.length ||
      parsed.some((offset, index) => index > 0 && offset <= parsed[index - 1]!)
    ) {
      throw new Error(
        'Etapas de recuperação devem ter dias maiores que zero, sem duplicidade e em ordem crescente.',
      );
    }

    return {
      day3OffsetDays: parsed[0]!,
      day10OffsetDays: parsed[1]!,
      day15OffsetDays: parsed[2]!,
      day30OffsetDays: parsed[3]!,
    };
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
                    disabled={!billingSettings || working === 'billing-settings'}
                    icon={Power}
                    size="sm"
                    variant={billingSettings?.enabled ? 'secondary' : 'primary'}
                    onClick={() => void saveBillingSettings({ enabled: !billingSettings?.enabled })}
                  >
                    {billingSettings?.enabled ? 'Desativar automação' : 'Ativar automação'}
                  </Button>
                }
                icon={Send}
                title="Cobrança automática"
                description="Configurações gerais da rotina de envio de lembretes de cobrança."
              />
              <span
                className={`finance-status-pill tone-${
                  billingSettings?.enabled ? 'success' : 'muted'
                }`}
              >
                {billingSettings?.enabled ? 'Ativada' : 'Desativada'}
              </span>
              <div className="automation-config-grid">
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Clock} />
                  <div>
                    <span>Horário de envio</span>
                    <strong>{billingSettings?.sendTime ?? '09:00'}</strong>
                  </div>
                  <input
                    aria-label="Horário de envio"
                    required
                    type="time"
                    value={sendTime}
                    onChange={(event) => setSendTime(event.target.value)}
                    onBlur={() => {
                      if (sendTime && sendTime !== billingSettings?.sendTime) {
                        void saveBillingSettings({ sendTime });
                      }
                    }}
                  />
                </article>
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Timer} />
                  <div>
                    <span>Intervalo entre mensagens</span>
                    <strong>{billingSettings?.sendIntervalSeconds ?? 8} segundos</strong>
                  </div>
                  <input
                    aria-label="Intervalo entre mensagens"
                    min={3}
                    max={300}
                    required
                    step={1}
                    type="number"
                    value={sendIntervalSeconds}
                    onChange={(event) => setSendIntervalSeconds(event.target.value)}
                    onBlur={() => {
                      const parsed = Number(sendIntervalSeconds);

                      if (
                        Number.isInteger(parsed) &&
                        parsed >= 3 &&
                        parsed <= 300 &&
                        parsed !== billingSettings?.sendIntervalSeconds
                      ) {
                        void saveBillingSettings({ sendIntervalSeconds: parsed });
                      }
                    }}
                  />
                </article>
                <article className="automation-config-card readonly">
                  <AutomationConfigIcon icon={Globe2} />
                  <div>
                    <span>Timezone</span>
                    <strong>America/Sao_Paulo</strong>
                  </div>
                </article>
                <article className="automation-config-card readonly">
                  <AutomationConfigIcon icon={Settings} />
                  <div>
                    <span>Processamento</span>
                    <strong>1 comunicação por execução</strong>
                  </div>
                </article>
              </div>
            </section>

            <section className="settings-card automation-section automation-message-section">
              <AutomationSectionHeading
                icon={MessageSquareText}
                title="Mensagens da automação"
                description="Templates usados pela cobrança automática."
              />
              <div className="automation-message-grid">
                {billingTemplates.map((template) => (
                  <article className="automation-message-card" key={template.id}>
                    <header>
                      <div>
                        <strong>{billingAutomationTemplateTitle(template.type)}</strong>
                        <p>{billingAutomationTemplateDescription(template.type)}</p>
                      </div>
                      <span
                        className={`finance-status-pill tone-${
                          template.active ? 'success' : 'muted'
                        }`}
                      >
                        {template.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </header>
                    <div className="automation-message-actions">
                      <Button
                        icon={Eye}
                        size="sm"
                        variant="secondary"
                        onClick={() => setPreviewingBillingTemplate(template)}
                      >
                        Visualizar
                      </Button>
                      <Button
                        icon={Pencil}
                        size="sm"
                        variant="secondary"
                        onClick={() => openBillingTemplate(template)}
                      >
                        Editar
                      </Button>
                      <ActionMenu
                        items={[
                          {
                            disabled: working === template.id,
                            icon: Power,
                            label: template.active ? 'Desativar' : 'Ativar',
                            onSelect: () => void toggleBillingTemplate(template),
                          },
                        ]}
                      />
                    </div>
                  </article>
                ))}
                {!billingTemplates.length ? (
                  <div className="empty-state">Nenhuma mensagem da automação cadastrada.</div>
                ) : null}
              </div>
            </section>

            <section className="settings-card automation-section">
              <AutomationSectionHeading
                icon={CalendarClock}
                iconTone="info"
                title="Próximos envios"
                description="Comunicações programadas da cobrança automática."
              />
              <div className="table-wrap">
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
                        <td>{dispatch.client?.name ?? '-'}</td>
                        <td>{billingDispatchReferenceLabel(dispatch)}</td>
                        <td>{billingDispatchDueDateLabel(dispatch)}</td>
                        <td>
                          {dispatch.idempotencyKey?.startsWith('billing-group')
                            ? '-'
                            : `${dispatch.idempotencyKey?.split(':').at(4) ?? '-'} dias`}
                        </td>
                        <td>
                          {dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}
                        </td>
                        <td className="finance-status-column">
                          <span
                            className={`finance-status-pill tone-${billingDispatchStatusTone(
                              dispatch.status,
                            )}`}
                          >
                            {billingStatusLabel(dispatch.status)}
                          </span>
                        </td>
                        <td className="finance-actions-column">
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
                    disabled={!recoverySettings || working === 'recovery-settings'}
                    icon={Power}
                    size="sm"
                    variant={recoverySettings?.enabled ? 'secondary' : 'primary'}
                    onClick={() =>
                      void saveRecoverySettings({ enabled: !recoverySettings?.enabled })
                    }
                  >
                    {recoverySettings?.enabled ? 'Desativar recuperação' : 'Ativar recuperação'}
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
                {recoverySettings?.enabled ? 'Ativada' : 'Desativada'}
              </span>
              <div className="automation-config-grid">
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Clock} />
                  <div>
                    <span>Horário de recuperação</span>
                    <strong>{recoverySettings?.sendTime ?? '09:00'}</strong>
                  </div>
                  <input
                    aria-label="Horário de recuperação"
                    required
                    type="time"
                    value={recoverySendTime}
                    onChange={(event) => setRecoverySendTime(event.target.value)}
                    onBlur={() => {
                      if (recoverySendTime && recoverySendTime !== recoverySettings?.sendTime) {
                        void saveRecoverySettings({ sendTime: recoverySendTime });
                      }
                    }}
                  />
                </article>
                <article className="automation-config-card">
                  <AutomationConfigIcon icon={Timer} />
                  <div>
                    <span>Intervalo entre mensagens</span>
                    <strong>{recoverySettings?.sendIntervalSeconds ?? 8} segundos</strong>
                  </div>
                  <input
                    aria-label="Intervalo entre mensagens da recuperação"
                    min={3}
                    max={300}
                    required
                    step={1}
                    type="number"
                    value={recoverySendIntervalSeconds}
                    onChange={(event) => setRecoverySendIntervalSeconds(event.target.value)}
                    onBlur={() => {
                      const parsed = Number(recoverySendIntervalSeconds);

                      if (
                        Number.isInteger(parsed) &&
                        parsed >= 3 &&
                        parsed <= 300 &&
                        parsed !== recoverySettings?.sendIntervalSeconds
                      ) {
                        void saveRecoverySettings({ sendIntervalSeconds: parsed });
                      }
                    }}
                  />
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
                    onClick={() => setEditingRecoverySteps((value) => !value)}
                  >
                    Configurar etapas
                  </Button>
                }
                icon={Layers}
                title="Etapas de comunicação"
                description="Configuração dos lembretes por tempo de atraso."
              />
              <div className="recovery-steps-timeline">
                {(recoverySettings?.steps ?? []).map((step, index) => (
                  <article className={step.enabled ? 'enabled' : 'disabled'} key={step.stepNumber}>
                    <div className="recovery-step-marker">D+{step.offsetDays}</div>
                    <div className="recovery-step-body">
                      <strong>Etapa {step.stepNumber}</strong>
                      <span>{messageTemplateTypeLabel(step.templateType)}</span>
                      {editingRecoverySteps ? (
                        <>
                          <label className="field compact-field">
                            <span>Offset</span>
                            <input
                              min={1}
                              required
                              step={1}
                              type="number"
                              value={recoveryOffsets[index] ?? String(step.offsetDays)}
                              onChange={(event) => {
                                const next = [...recoveryOffsets];
                                next[index] = event.target.value;
                                setRecoveryOffsets(next);
                              }}
                              onBlur={() => {
                                try {
                                  void saveRecoverySettings(
                                    recoveryPayloadFromOffsets(recoveryOffsets),
                                  );
                                } catch (err) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Etapas de recuperação inválidas.',
                                  );
                                }
                              }}
                            />
                          </label>
                          <label className="toggle-field compact-toggle">
                            <input
                              checked={step.enabled}
                              type="checkbox"
                              onChange={(event) => {
                                const keys = [
                                  'day3Enabled',
                                  'day10Enabled',
                                  'day15Enabled',
                                  'day30Enabled',
                                ] as const;
                                const key = keys[index];
                                if (key) {
                                  void saveRecoverySettings({ [key]: event.target.checked });
                                }
                              }}
                            />
                            <span>{step.enabled ? 'Ativa' : 'Inativa'}</span>
                          </label>
                        </>
                      ) : (
                        <small>{step.enabled ? 'Ativa' : 'Inativa'}</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="settings-card automation-section template-panel">
              <AutomationSectionHeading
                icon={MessageSquareText}
                title="Mensagens de recuperação"
                description="Mensagens utilizadas em cada etapa da recuperação."
              />
              <div className="automation-message-grid">
                {recoveryTemplateCards.map((card) => {
                  const template = templates.find((item) => item.type === card.templateType);

                  return (
                    <article className="automation-message-card" key={card.templateType}>
                      <header>
                        <div>
                          <strong>{recoveryAutomationTemplateTitle(card)}</strong>
                          <p>{card.title}</p>
                        </div>
                        <span
                          className={`finance-status-pill tone-${
                            template?.active ? 'success' : 'muted'
                          }`}
                        >
                          {template?.active ? 'Ativa' : 'Inativa'}
                        </span>
                      </header>
                      <div className="automation-message-actions">
                        <Button
                          disabled={!template}
                          icon={Eye}
                          size="sm"
                          variant="secondary"
                          onClick={() => setPreviewingRecoveryTemplate(card)}
                        >
                          Visualizar
                        </Button>
                        <Button
                          disabled={!template}
                          icon={Pencil}
                          size="sm"
                          variant="secondary"
                          onClick={() => template && openRecoveryTemplate(template)}
                        >
                          Editar
                        </Button>
                        <ActionMenu
                          items={[
                            {
                              disabled: !template || working === template.id,
                              icon: Power,
                              label: template?.active ? 'Desativar' : 'Ativar',
                              onSelect: () => template && void toggleRecoveryTemplate(template),
                            },
                          ]}
                        />
                      </div>
                    </article>
                  );
                })}
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
              <div className="table-wrap compact-table">
                <table>
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
                        <td>{issue.clientName}</td>
                        <td>{issue.reference}</td>
                        <td>{issue.planName}</td>
                        <td>{formatCurrency(issue.amount)}</td>
                        <td>{formatDate(issue.dueDate)}</td>
                        <td>{issue.reason}</td>
                        <td>
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

              <div className="table-wrap">
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
                          <td>
                            <strong>{campaign.client?.name ?? 'Cliente'}</strong>
                            <span>{campaign.client?.reference ?? campaign.clientId}</span>
                          </td>
                          <td>
                            {campaign.clientReference?.reference ??
                              campaign.client?.reference ??
                              '-'}
                          </td>
                          <td>
                            <span className="technical-id" title={receivableId ?? undefined}>
                              {shortUuid(receivableId)}
                            </span>
                          </td>
                          <td>
                            {campaign.receivable ? formatDate(campaign.receivable.dueDate) : '-'}
                          </td>
                          <td>
                            {campaign.receivable ? `${campaign.receivable.daysOverdue} dias` : '-'}
                          </td>
                          <td className="finance-status-column">
                            <span
                              className={`finance-status-pill tone-${recoveryCampaignStatusTone(
                                campaign.status,
                              )}`}
                            >
                              {recoveryCampaignStatusLabel(campaign.status)}
                            </span>
                          </td>
                          <td>{nextStep ? `D+${nextStep.delayDays}` : '-'}</td>
                          <td>{nextStep ? formatDateTime(nextStep.scheduledFor) : '-'}</td>
                          <td>{formatDateTime(campaign.startedAt)}</td>
                          <td className="finance-actions-column">
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

      {previewingBillingTemplate ? (
        <BillingAutomationPreviewModal
          template={previewingBillingTemplate}
          onClose={() => setPreviewingBillingTemplate(null)}
        />
      ) : null}
      {previewingRecoveryTemplate ? (
        <RecoveryAutomationPreviewModal
          card={previewingRecoveryTemplate}
          onClose={() => setPreviewingRecoveryTemplate(null)}
        />
      ) : null}
      {editingBillingTemplate ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal automation-message-modal"
            aria-labelledby="billing-template-title"
          >
            <header className="modal-header">
              <div>
                <h2 id="billing-template-title">Editar mensagem da automação</h2>
                <p>{billingAutomationTemplateTitle(editingBillingTemplate.type)}</p>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditingBillingTemplate(null)}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <label className="field">
              <span>Conteúdo da mensagem</span>
              <textarea
                maxLength={1000}
                rows={8}
                value={billingTemplateContent}
                onChange={(event) => setBillingTemplateContent(event.target.value)}
              />
            </label>
            <div className="mini-list">
              <article>
                <strong>Variáveis disponíveis</strong>
                <span>
                  {editingBillingTemplate.variables.map((variable) => `{{${variable}}}`).join(' ')}
                </span>
              </article>
            </div>
            <div className="form-actions">
              <span className="error-message">{error}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingBillingTemplate(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  disabled={working === 'billing-template' || !billingTemplateContent.trim()}
                  type="button"
                  onClick={() => void saveBillingTemplate()}
                >
                  Salvar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {editingRecoveryTemplate ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" aria-labelledby="recovery-template-title">
            <header className="modal-header">
              <h2 id="recovery-template-title">Editar mensagem de recuperação</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditingRecoveryTemplate(null)}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <label className="field">
              <span>Nome do template</span>
              <input
                maxLength={80}
                value={recoveryTemplateName}
                onChange={(event) => setRecoveryTemplateName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Conteúdo</span>
              <textarea
                maxLength={1000}
                rows={8}
                value={recoveryTemplateContent}
                onChange={(event) => setRecoveryTemplateContent(event.target.value)}
              />
            </label>
            <div className="mini-list">
              <article>
                <strong>Variáveis disponíveis</strong>
                <span>
                  {recoveryTemplateVariables.map((variable) => `{{${variable}}}`).join(' ')}
                </span>
              </article>
            </div>
            {recoveryTemplatePreview ? (
              <div className="preview-box">
                <span>Preview</span>
                <strong>{recoveryTemplatePreview}</strong>
              </div>
            ) : null}
            <div className="form-actions">
              <span className="error-message">{error}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={working === 'recovery-preview'}
                  type="button"
                  onClick={() => void loadRecoveryTemplatePreview()}
                >
                  <Eye aria-hidden="true" size={16} />
                  Preview
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingRecoveryTemplate(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  disabled={
                    working === 'recovery-template' ||
                    !recoveryTemplateName.trim() ||
                    !recoveryTemplateContent.trim()
                  }
                  type="button"
                  onClick={() => void saveRecoveryTemplate()}
                >
                  Salvar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
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
                  <td>
                    <div className="waitlist-contact-cell">
                      <WaitlistContactAvatar contact={contact} />
                      <div>
                        <strong>{waitlistContactName(contact)}</strong>
                        <span>{contact.connection.name}</span>
                      </div>
                    </div>
                  </td>
                  <td>{formatWaitlistPhone(contact.phoneNormalized)}</td>
                  <td>
                    <span className="waitlist-message-preview" title={waitlistFullMessage(contact)}>
                      {waitlistFullMessage(contact)}
                    </span>
                  </td>
                  <td>
                    <span className="waitlist-message-count">
                      <MessageCircle aria-hidden="true" size={15} />
                      {contact.messageCount}
                    </span>
                  </td>
                  <td>{formatDateTime(contact.lastContactAt)}</td>
                  <td className="finance-status-column">
                    <WaitlistStatusBadge status={contact.status} />
                  </td>
                  <td className="finance-actions-column">
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
    FASTPAY: 'FastPay',
    DEPIX: 'Depix',
  };

  return labels[provider];
}

function paymentIntentStatusLabel(status: PaymentIntentStatus) {
  const labels: Record<PaymentIntentStatus, string> = {
    CREATED: 'Criado',
    WAITING_PAYMENT: 'Aguardando',
    PAID: 'Pago',
    EXPIRED: 'Expirado',
    CANCELED: 'Cancelado',
    FAILED: 'Falha',
    REFUNDED: 'Estornado',
  };

  return labels[status];
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
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
              Define quantos dias antes do vencimento a cobrança automática será enviada.
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
            Esta referência está CANCELADA. Ao confirmar a renovação, ela será reativada e voltará
            para o status ATIVO.
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
  const [transactionModal, setTransactionModal] = useState<{
    kind: FinancialTransactionType;
    transaction: FinancialTransaction | undefined;
  } | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const receivableFilters: Parameters<typeof listReceivables>[0] = {
        endDate: financePeriod.endDate,
        page: receivablesPage,
        pageSize: listPageSize,
        startDate: financePeriod.startDate,
        status: receivableStatus,
      };
      const trimmedSearch = financeSearch.trim();

      if (trimmedSearch) {
        receivableFilters.search = trimmedSearch;
      }
      const receivableSummaryFilters = {
        endDate: financePeriod.endDate,
        ...(trimmedSearch ? { search: trimmedSearch } : {}),
        startDate: financePeriod.startDate,
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
    entriesPage,
    expensesPage,
    financePeriod.endDate,
    financePeriod.startDate,
    financeSearch,
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
  }, [financePeriod.startDate, financeSearch, receivableStatus, receivablesPage]);

  async function reloadWithNotice(message: string) {
    setSelectedReceivableIds([]);
    setNotice(message);
    await loadFinance();
  }

  function changeFinanceMonth(months: number) {
    setFinancePeriod((current) => shiftFinancePeriod(current, months));
    setReceivablesPage(1);
    setEntriesPage(1);
    setExpensesPage(1);
  }

  const entryCategories = categories.filter((category) => category.type === 'ENTRADA');
  const expenseCategories = categories.filter((category) => category.type === 'SAIDA');
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
              Nova entrada
            </Button>
            <Button icon={Minus} variant="secondary" onClick={() => openTransactionModal('SAIDA')}>
              Nova saída
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
        <button
          className={tab === 'categories' ? 'active' : ''}
          type="button"
          onClick={() => setTab('categories')}
        >
          Categorias
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
                placeholder="Buscar cliente, referência ou descrição"
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
            <table className="finance-global-table">
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
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td className="finance-select-column">
                      <input
                        aria-label={`Selecionar ${receivable.description}`}
                        checked={selectedReceivableIds.includes(receivable.id)}
                        disabled={
                          receivable.status !== 'PENDENTE' ||
                          Boolean(selectedClientId && selectedClientId !== receivable.clientId)
                        }
                        type="checkbox"
                        onChange={() => toggleReceivableSelection(receivable)}
                      />
                    </td>
                    <td>{receivable.client?.name ?? '-'}</td>
                    <td>{receivable.client?.reference ?? '-'}</td>
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
                    </td>
                  </tr>
                ))}
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

      {tab === 'categories' ? (
        <FinancialCategoriesView
          categories={categories}
          onCreate={async (payload) => {
            await createFinancialCategory(payload);
            await reloadWithNotice('Categoria criada.');
          }}
          onDelete={async (id) => {
            await deleteFinancialCategory(id);
            await reloadWithNotice('Categoria removida ou inativada.');
          }}
          onUpdate={async (id, payload) => {
            await updateFinancialCategory(id, payload);
            await reloadWithNotice('Categoria atualizada.');
          }}
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
        <table className="finance-global-table">
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
                  <span className="finance-status-pill tone-info">{transaction.origin}</span>
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
  onUpdate,
}: {
  categories: FinancialCategory[];
  clients: Client[];
  kind: FinancialTransactionType;
  transaction: FinancialTransaction | undefined;
  onClose: () => void;
  onCreate: (payload: FinancialTransactionPayload) => Promise<void>;
  onUpdate: (id: string, payload: Partial<FinancialTransactionPayload>) => Promise<void>;
}) {
  const editing = Boolean(transaction);
  const [form, setForm] = useState<TransactionFormState>(() =>
    transaction ? transactionFormFromRecord(transaction) : transactionInitialForm(categories),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setForm(
      transaction ? transactionFormFromRecord(transaction) : transactionInitialForm(categories),
    );
    setFormError('');
  }, [categories, transaction]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      categoryId: current.categoryId || categories[0]?.id || '',
    }));
  }, [categories]);

  function closeAndReset() {
    setForm(transactionInitialForm(categories));
    setFormError('');
    onClose();
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

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

        {formError ? <div className="notice danger">{formError}</div> : null}

        <form
          className="entity-form finance-transaction-modal-form"
          onSubmit={(event) => void submitForm(event)}
        >
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
          <div className="form-actions">
            <Button icon={X} variant="secondary" onClick={closeAndReset}>
              Cancelar
            </Button>
            <Button icon={Save} loading={submitting} type="submit" variant="primary">
              {kind === 'ENTRADA' ? 'Salvar entrada' : 'Salvar saída'}
            </Button>
          </div>
        </form>
      </section>
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
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialTransactionType>('ENTRADA');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<FinancialTransactionType | ''>('');
  const [statusFilter, setStatusFilter] = useState<FinancialCategoryStatusFilter>('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const { canSubmit, nameTooLong } = getFinancialCategoryFormState(name, working);
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

  useEffect(() => {
    if (!createModalOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingRef.current) {
        closeCreateModal();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [createModalOpen]);

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
        <StatCard icon={Layers} label="Total" tone="info" value={categorySummary.total} />
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
                <td>
                  <strong className="category-name">{category.name}</strong>
                </td>
                <td className="finance-status-column">
                  <span
                    className={`finance-status-pill ${
                      category.type === 'ENTRADA' ? 'tone-success' : 'tone-warning'
                    }`}
                  >
                    {financialCategoryTypeLabel(category.type)}
                  </span>
                </td>
                <td className="finance-status-column">
                  <span
                    className={`finance-status-pill ${
                      category.active ? 'tone-success' : 'tone-danger'
                    }`}
                  >
                    {category.active ? 'Ativa' : 'Inativa'}
                  </span>
                </td>
                <td className="finance-actions-column">
                  <ActionMenu
                    items={[
                      {
                        icon: Power,
                        label: category.active ? 'Inativar' : 'Ativar',
                        onSelect: () =>
                          void runCategoryAction(() =>
                            onUpdate(category.id, { active: !category.active }),
                          ),
                      },
                      {
                        danger: true,
                        icon: Trash2,
                        label: 'Remover',
                        onSelect: () => void runCategoryAction(() => onDelete(category.id)),
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadIntents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const nextIntents = await listPaymentIntents(receivable.id);
      setIntents(nextIntents);
      setActiveIntent(
        nextIntents.find((intent) => ['CREATED', 'WAITING_PAYMENT'].includes(intent.status)) ??
          nextIntents[0] ??
          null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o PIX.');
    } finally {
      setLoading(false);
    }
  }, [receivable.id]);

  useEffect(() => {
    void loadIntents();
  }, [loadIntents]);

  async function runAction(action: () => Promise<PaymentIntent>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const intent = await action();
      setActiveIntent(intent);
      await loadIntents();
      setNotice(success);
      await onChanged(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.');
    } finally {
      setBusy(false);
    }
  }

  async function copyPix() {
    if (!activeIntent?.pixCopyPaste) return;
    await navigator.clipboard.writeText(activeIntent.pixCopyPaste);
    setNotice('PIX copiado.');
  }

  const canCreateNew =
    !activeIntent || !['CREATED', 'WAITING_PAYMENT'].includes(activeIntent.status);
  const canCancel =
    activeIntent && !['PAID', 'CANCELED', 'EXPIRED', 'REFUNDED'].includes(activeIntent.status);
  const canRenderQrImage =
    activeIntent?.qrCodeData?.startsWith('data:') || activeIntent?.qrCodeData?.startsWith('http');

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="pix-title">
        <header className="modal-header modal-header-with-icon">
          <span className="modal-icon info" aria-hidden="true">
            <QrCode size={16} />
          </span>
          <div>
            <h2 id="pix-title">PIX</h2>
            <p>Gerar, copiar e sincronizar pagamento desta conta.</p>
          </div>
          <IconButton icon={X} label="Fechar PIX" onClick={onClose} />
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

        {error ? <div className="notice danger">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        {loading ? <div className="empty-state">Carregando PIX...</div> : null}

        {activeIntent ? (
          <div className="pix-panel">
            <div className="pix-status-row">
              <strong>{activeIntent.status}</strong>
              <span>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</span>
            </div>
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
                    'Status do PIX sincronizado.',
                  )
                }
              >
                <RefreshCcw aria-hidden="true" size={16} />
                Sincronizar
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
              {canCancel ? (
                <button
                  className="danger-button"
                  disabled={busy}
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => cancelPaymentIntent(activeIntent.id),
                      'PIX cancelado no provider.',
                    )
                  }
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {intents.length > 1 ? (
          <div className="mini-list">
            {intents.slice(1).map((intent) => (
              <article key={intent.id}>
                <strong>{intent.status}</strong>
                <span>{intent.createdAt ? formatDateTime(intent.createdAt) : '-'}</span>
                <p>{formatCurrency(intent.amount)}</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="form-actions">
          <span>{canCreateNew ? '' : 'Já existe um PIX ativo para esta conta.'}</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Fechar
            </button>
            <button
              className="primary-button"
              disabled={busy || !canCreateNew}
              type="button"
              onClick={() =>
                void runAction(() => createReceivablePix(receivable.id), 'PIX gerado.')
              }
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
  const total = receivables.reduce((sum, receivable) => sum + Number(receivable.amount), 0);
  const canCancel =
    activeIntent && !['PAID', 'CANCELED', 'EXPIRED', 'REFUNDED'].includes(activeIntent.status);
  const canRenderQrImage =
    activeIntent?.qrCodeData?.startsWith('data:') || activeIntent?.qrCodeData?.startsWith('http');

  async function runAction(action: () => Promise<PaymentIntent>, success: string) {
    setBusy(true);
    setError('');
    setNotice('');

    try {
      const intent = await action();
      setActiveIntent(intent);
      setNotice(success);
      await onChanged(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.');
    } finally {
      setBusy(false);
    }
  }

  async function copyPix() {
    if (!activeIntent?.pixCopyPaste) return;
    await navigator.clipboard.writeText(activeIntent.pixCopyPaste);
    setNotice('PIX copiado.');
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

        {activeIntent ? (
          <div className="pix-panel">
            <div className="pix-status-row">
              <strong>{activeIntent.status}</strong>
              <span>{activeIntent.expiresAt ? formatDateTime(activeIntent.expiresAt) : '-'}</span>
            </div>
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
                    'Status do PIX agrupado sincronizado.',
                  )
                }
              >
                <RefreshCcw aria-hidden="true" size={16} />
                Sincronizar
              </button>
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
              disabled={busy || Boolean(activeIntent)}
              type="button"
              onClick={() =>
                void runAction(
                  () => createReceivablesPix(receivables.map((receivable) => receivable.id)),
                  'PIX agrupado gerado.',
                )
              }
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
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus aria-hidden="true" size={17} />
            Novo plano
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
