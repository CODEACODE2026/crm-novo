'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarClock,
  CircleCheck,
  Copy,
  CreditCard,
  Download,
  DollarSign,
  Eye,
  Filter,
  Gift,
  LayoutDashboard,
  Layers,
  ListChecks,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCcw,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  ToggleLeft,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import type { AuthenticatedUser } from '@crm-novo/shared';
import { buildApiUrl } from '../../lib/api';
import { ClientForm } from '../../components/clients/client-form';
import { ClientReferralSelect } from '../../components/clients/client-referral-select';
import { StatusBadge } from '../../components/clients/status-badge';
import {
  clientDisplayStatus,
  clientInitial,
  clientNextDueSummary,
  clientOperationalSummary,
  clientPlanSummary,
  clientReceivableTotals,
  clientReferenceCountLabel,
  clientReferenceSummary,
  dispatchReferenceSummary,
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
  SectionHeader,
  StatCard,
} from '../../components/ui/primitives';
import {
  cancelReceivable,
  cancelPaymentIntent,
  confirmMockPaymentIntent,
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
  getDashboardSummary,
  getReport,
  getFinancialSummary,
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
  getBillingSummary,
  generateCurrentCycleReceivable,
  getRecoverySummary,
  getRecoveryAutomationSettings,
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
  type BillingAutomationSettings,
  type Client,
  type ClientMessageDispatch,
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
  type PaymentIntent,
  type PaymentIntentStatus,
  type PaymentProviderCredentialStatus,
  type PaymentProviderCode,
  type Receivable,
  type ReceivableDisplayStatus,
  type OperationalReport,
  type Plan,
  type ReportFilters,
  type ReportType,
  type RenewalPreview,
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
  nextWhatsAppActionsMenuOpen,
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

type RenewalTarget = {
  client: Client;
  reference: ClientReference;
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
  const [deletionTarget, setDeletionTarget] = useState<DeletionDialogTarget | null>(null);
  const [renewalNotice, setRenewalNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

  const clients = clientsPayload?.items ?? [];

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setError('');

    try {
      const [nextPlans, nextClients] = await Promise.all([
        listPlans(),
        listClients({ search: search.trim() || undefined, status, planId: planId || undefined }),
      ]);

      setPlans(nextPlans);
      setClientsPayload(nextClients);
      setSelectedClient((current) => {
        if (!current) return null;
        return nextClients.items.some((client) => client.id === current.id) ? current : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar clientes e planos.');
    } finally {
      setDataLoading(false);
    }
  }, [planId, search, status]);

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
      setDeletionTarget(null);
      await loadData();
      return;
    }

    await deleteClient(target.client.id, 'REMOVER');
    setSelectedClient(null);
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
          setPlanId={setPlanId}
          setSearch={setSearch}
          setStatus={setStatus}
          status={status}
          renewalNotice={renewalNotice}
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
            setPlanFormOpen((open) => !open);
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
    waitlist: 'Contatos pendentes de triagem',
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
  const isClient = target.kind === 'client';
  const title = isClient ? 'Remover cliente' : 'Remover referência';
  const targetLabel = isClient ? target.client.name : target.reference.reference;
  const counts = Object.entries(target.preview.counts).filter(([, value]) => value > 0);

  async function submit() {
    if (confirmation !== 'REMOVER') {
      setError('Digite REMOVER para confirmar.');
      return;
    }

    setWorking(true);
    setError('');

    try {
      await onConfirm(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="deletion-title">
        <header className="modal-header">
          <div>
            <span className="metric-label">AÇÃO DESTRUTIVA</span>
            <h2 id="deletion-title">{title}</h2>
          </div>
          <IconButton icon={X} label="Fechar confirmação" onClick={onClose} />
        </header>
        {error ? <div className="notice danger">{error}</div> : null}
        <div className="notice danger">
          Esta ação removerá permanentemente {isClient ? 'o cliente' : 'a referência'} e os dados
          vinculados listados abaixo. Esta ação não pode ser desfeita.
        </div>
        <dl className="detail-list">
          <div>
            <dt>Alvo</dt>
            <dd>{targetLabel}</dd>
          </div>
          <div>
            <dt>Confirmação</dt>
            <dd>Digite REMOVER</dd>
          </div>
        </dl>
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Dado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {counts.map(([key, value]) => (
                <tr key={key}>
                  <td>{removalCountLabel(key)}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="field">
          <span>Confirmação</span>
          <input
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <div className="button-row">
          <Button disabled={working} icon={X} variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={working || confirmation !== 'REMOVER'}
            icon={Trash2}
            variant="danger"
            onClick={() => void submit()}
          >
            Remover definitivamente
          </Button>
        </div>
      </section>
    </div>
  );
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

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const filters = buildDashboardPeriod(periodMode, customStart, customEnd);
      const nextSummary = await getDashboardSummary(filters);
      setSummary(nextSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o dashboard.');
    } finally {
      setLoading(false);
    }
  }, [customEnd, customStart, periodMode]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const cashflowMax = maxChartValue(
    summary?.charts.cashflow.flatMap((item) => [item.entries, item.expenses]) ?? [],
  );
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
          <div className="finance-split">
            <div className="bar-chart">
              {(summary?.charts.cashflow ?? []).map((item) => (
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
              {!summary?.charts.cashflow.length ? (
                <div className="empty-state">Sem dados.</div>
              ) : null}
            </div>
            <div className="finance-side-metrics">
              {[
                ['Entradas', summary?.finance.entries],
                ['Saídas', summary?.finance.expenses],
                ['Saldo', summary?.finance.balance],
                ['Valor renovado', summary?.renewals.amount],
              ].map(([label, value]) => (
                <div key={label}>
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
            {(summary?.lists.recentActivity ?? []).map((event) => (
              <button
                className="activity-item"
                key={event.id}
                type="button"
                onClick={() => void onOpenClient(event.client.id)}
              >
                <Activity aria-hidden="true" size={16} />
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
              <div className="empty-state">Sem atividade recente.</div>
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
              <div className="empty-state">Sem pendências operacionais.</div>
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

function PanelHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <SectionHeader
      title={title}
      action={
        onViewAll ? (
          <button className="secondary-button compact" type="button" onClick={onViewAll}>
            Ver todos
          </button>
        ) : null
      }
    />
  );
}

function PaginationControls({
  pagination,
  onPageChange,
}: {
  pagination: PaginatedClients['pagination'] | null;
  onPageChange: (page: number) => void;
}) {
  if (!pagination || pagination.totalPages <= 1) return null;

  return (
    <div className="pagination-row">
      <button
        className="secondary-button"
        disabled={pagination.page <= 1}
        type="button"
        onClick={() => onPageChange(pagination.page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {pagination.page} de {pagination.totalPages} | {pagination.total} registros
      </span>
      <button
        className="secondary-button"
        disabled={pagination.page >= pagination.totalPages}
        type="button"
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Próxima
      </button>
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
    return <div className="empty-state">Nenhum cliente nesta lista.</div>;
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
    return <div className="empty-state">Nenhuma conta vencida.</div>;
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
  const [confirming, setConfirming] = useState<Referral | null>(null);
  const [rewardClientReferenceId, setRewardClientReferenceId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadReferrals = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [list, nextSummary] = await Promise.all([
        listReferrals({ search, status, referrerClientId }),
        getReferralSummary(),
      ]);
      setItems(list.items);
      setSummary(nextSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar indicações.');
    } finally {
      setLoading(false);
    }
  }, [referrerClientId, search, status]);

  useEffect(() => {
    void loadReferrals();
  }, [loadReferrals]);

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
    const reason = window.prompt('Motivo do cancelamento');

    if (!reason) return;

    setError('');

    try {
      await cancelReferral(referral.id, reason);
      await loadReferrals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar a indicação.');
    }
  }

  return (
    <section className="workspace-main">
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid">
        {[
          ['Pendentes', summary?.pending ?? 0],
          ['Qualificadas', summary?.qualified ?? 0],
          ['Benefícios aplicados', summary?.rewarded ?? 0],
          ['Aguardando benefício', summary?.awaitingReward ?? 0],
        ].map(([label, value]) => (
          <article className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="toolbar">
        <div className="search-row">
          <Search aria-hidden="true" size={18} />
          <input
            placeholder="Buscar indicador ou indicado"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as ReferralStatus | '')}
        >
          <option value="">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="QUALIFIED">Qualificada</option>
          <option value="REWARDED">Recompensada</option>
          <option value="CANCELED">Cancelada</option>
        </select>
        <select
          value={referrerClientId}
          onChange={(event) => setReferrerClientId(event.target.value)}
        >
          <option value="">Todos os indicadores</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name} · {client.reference}
            </option>
          ))}
        </select>
        <button className="secondary-button" type="button" onClick={() => void loadReferrals()}>
          Aplicar
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Indicado</th>
              <th>Indicador</th>
              <th>Data</th>
              <th>Status</th>
              <th>Beneficio</th>
              <th>Qualificação</th>
              <th>Aplicação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((referral) => (
              <tr key={referral.id}>
                <td>
                  <strong>{referral.referredClient.name}</strong>
                  <span>{referral.referredClient.reference}</span>
                </td>
                <td>
                  <strong>{referral.referrerClient.name}</strong>
                  <span>{referral.referrerClient.status}</span>
                </td>
                <td>{formatDateTime(referral.createdAt)}</td>
                <td>{referralStatusLabel(referral.status)}</td>
                <td>{referral.rewardLabel}</td>
                <td>{referral.qualifiedAt ? formatDateTime(referral.qualifiedAt) : '-'}</td>
                <td>{referral.appliedAt ? formatDateTime(referral.appliedAt) : '-'}</td>
                <td>
                  <div className="row-actions">
                    {referral.status === 'QUALIFIED' ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => {
                          setRewardClientReferenceId('');
                          setConfirming(referral);
                        }}
                      >
                        Aplicar benefício
                      </button>
                    ) : null}
                    {referral.status !== 'REWARDED' && referral.status !== 'CANCELED' ? (
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={() => void cancelCurrentReferral(referral)}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td colSpan={8}>{loading ? 'Carregando...' : 'Nenhuma indicação encontrada.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {confirming ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal">
            <header className="modal-header">
              <h2>Aplicar benefício</h2>
              <button className="icon-button" type="button" onClick={() => setConfirming(null)}>
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <div className="mini-list">
              <article>
                <strong>Indicador</strong>
                <span>{confirming.referrerClient.name}</span>
                <p>Status atual: {confirming.referrerClient.status}</p>
              </article>
              <article>
                <strong>Beneficio</strong>
                <span>{confirming.rewardLabel}</span>
              </article>
              {confirming.rewardType === 'FREE_MONTH' ? (
                <label className="field">
                  <span>Referência beneficiada</span>
                  <select
                    required
                    value={rewardClientReferenceId}
                    onChange={(event) => setRewardClientReferenceId(event.target.value)}
                  >
                    <option value="">Selecione uma referência</option>
                    {clients
                      .find((client) => client.id === confirming.referrerClientId)
                      ?.references?.filter((reference) => reference.status !== 'CANCELADO')
                      .map((reference) => (
                        <option key={reference.id} value={reference.id}>
                          {reference.reference} · {formatDate(reference.dueDate)}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <article>
                <strong>Vencimento atual</strong>
                <span>{confirming.rewardPreview?.currentDueDate ?? '-'}</span>
              </article>
              <article>
                <strong>Novo vencimento</strong>
                <span>{confirming.rewardPreview?.newDueDate ?? '-'}</span>
              </article>
            </div>
            <div className="form-actions">
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setConfirming(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  disabled={confirming.rewardType === 'FREE_MONTH' && !rewardClientReferenceId}
                  type="button"
                  onClick={() => void applyReward(confirming)}
                >
                  Aplicar benefício
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function referralStatusLabel(status: ReferralStatus) {
  const labels = {
    PENDING: 'Pendente',
    QUALIFIED: 'Qualificada',
    REWARDED: 'Recompensada',
    CANCELED: 'Cancelada',
  } satisfies Record<ReferralStatus, string>;

  return labels[status];
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
              {plans.map((plan) => (
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

function ClientEventIcon({ type }: { type: NonNullable<Client['events']>[number]['type'] }) {
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

function ClientsView({
  clientFormOpen,
  clients,
  dataLoading,
  editingClient,
  onApplyFilters,
  onCreate,
  onEdit,
  onNew,
  onClearSelection,
  onCloseForm,
  onRenew,
  onCreateReference,
  onUpdateReference,
  onReferenceStatusChange,
  onRemoveClient,
  onRemoveReference,
  onSelect,
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
}: {
  clientFormOpen: boolean;
  clients: Client[];
  dataLoading: boolean;
  editingClient: Client | null;
  onApplyFilters: () => void;
  onCreate: (payload: ClientPayload) => Promise<void>;
  onEdit: (client: Client) => void;
  onNew: () => void;
  onClearSelection: () => void;
  onRenew: (client: Client, reference?: ClientReference) => void;
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
}) {
  const [detailTab, setDetailTab] = useState<
    'overview' | 'references' | 'receivables' | 'messages' | 'timeline' | 'more'
  >('overview');
  const [whatsAppClient, setWhatsAppClient] = useState<Client | null>(null);
  const [referenceFormOpen, setReferenceFormOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<ClientReference | null>(null);
  const [referenceStatusModal, setReferenceStatusModal] = useState<{
    reference: ClientReference;
    status: Extract<ClientStatus, 'INATIVO' | 'CANCELADO'>;
  } | null>(null);
  const [clientFinanceCategories, setClientFinanceCategories] = useState<FinancialCategory[]>([]);
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [pixReceivable, setPixReceivable] = useState<Receivable | null>(null);
  const [paymentReceivables, setPaymentReceivables] = useState<Receivable[] | null>(null);
  const [pixReceivables, setPixReceivables] = useState<Receivable[] | null>(null);
  const [cancelingReceivable, setCancelingReceivable] = useState<Receivable | null>(null);
  const [selectedReceivableIds, setSelectedReceivableIds] = useState<string[]>([]);
  const [selectedDispatch, setSelectedDispatch] = useState<ClientMessageDispatch | null>(null);
  const [clientActionNotice, setClientActionNotice] = useState('');
  const [clientActionError, setClientActionError] = useState('');
  const uniqueSelectedReference =
    selectedClient?.references?.length === 1 ? selectedClient.references[0] : null;
  const selectedReferences = selectedClient?.references ?? [];
  const selectedReceivables = selectedClient?.receivables ?? [];
  const receivableTotals = clientReceivableTotals(selectedReceivables);
  const selectedReceivablesForBulk = selectedReceivables.filter((receivable) =>
    selectedReceivableIds.includes(receivable.id),
  );
  const selectedReceivableTotal = selectedReceivablesForBulk.reduce(
    (total, receivable) => total + Number(receivable.amount),
    0,
  );
  const selectedPendingReceivablesForBulk = selectedReceivablesForBulk.filter(
    (receivable) => receivable.status === 'PENDENTE',
  );
  const billingTotal = selectedReceivables.reduce(
    (total, receivable) => total + Number(receivable.amount),
    0,
  );
  const selectedDispatches = selectedClient?.messageDispatches ?? [];
  const billingSummary = selectedDispatches.reduce(
    (summary, dispatch) => {
      if (dispatch.status === 'SENT') summary.sent += 1;
      else if (dispatch.status === 'FAILED') summary.failed += 1;
      else summary.scheduled += 1;

      return summary;
    },
    { failed: 0, scheduled: 0, sent: 0 },
  );
  const pixIntentCount = selectedReceivables.reduce(
    (total, receivable) => total + (receivable.paymentIntents?.length ?? 0),
    0,
  );

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
  }, [selectedClient?.id]);

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
    await onFinancialMutation(selectedClient.id);
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
                {plans.map((plan) => (
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
                    <th>STATUS</th>
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
                          <StatusBadge status={clientDisplayStatus(client)} />
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
                    <StatusBadge
                      status={uniqueSelectedReference?.status ?? selectedClient.status}
                    />
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
                <StatCard
                  label="A receber"
                  value={formatCurrency(
                    (selectedClient.receivables ?? [])
                      .filter((receivable) => receivable.status === 'PENDENTE')
                      .reduce((total, receivable) => total + Number(receivable.amount), 0),
                  )}
                />
                <StatCard
                  label="Próximo vencimento"
                  value={clientNextDueSummary(selectedReferences)}
                />
                <StatCard
                  label="Total pago"
                  value={formatCurrency(
                    (selectedClient.receivables ?? [])
                      .filter((receivable) => receivable.status === 'PAGO')
                      .reduce((total, receivable) => total + Number(receivable.amount), 0),
                  )}
                />
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
                  <section className="client-overview-card">
                    <SectionHeader eyebrow="Cliente" title="Informações pessoais" />
                    <dl className="detail-list">
                      <div>
                        <dt>Nome</dt>
                        <dd>{selectedClient.name}</dd>
                      </div>
                      <div>
                        <dt>WhatsApp</dt>
                        <dd>{selectedClient.phone}</dd>
                      </div>
                      <div>
                        <dt>E-mail</dt>
                        <dd>{selectedClient.email ?? '-'}</dd>
                      </div>
                      <div>
                        <dt>Cliente desde</dt>
                        <dd>{formatDate(selectedClient.createdAt)}</dd>
                      </div>
                    </dl>
                    <div className="notes-box">
                      <span className="metric-label">Observações internas</span>
                      <p>{selectedClient.notes ?? 'Sem observações.'}</p>
                    </div>
                  </section>
                  <section className="client-overview-card">
                    <SectionHeader eyebrow="Operação" title="Resumo atual" />
                    <div className="client-kpi-grid">
                      <StatCard label="Referências" value={selectedReferences.length} />
                      {uniqueSelectedReference ? (
                        <>
                          <StatCard
                            label="Recorrência"
                            value={formatCurrency(uniqueSelectedReference.recurringValue)}
                          />
                          <StatCard
                            label="Próximo vencimento"
                            value={formatDate(uniqueSelectedReference.dueDate)}
                          />
                          <StatCard
                            label="Cobrança"
                            value={`${uniqueSelectedReference.billingNoticeDays} dias antes`}
                          />
                        </>
                      ) : null}
                    </div>
                  </section>
                  <section className="client-overview-card client-activity-card">
                    <SectionHeader eyebrow="Histórico" title="Atividade recente" />
                    <ol className="timeline compact-timeline">
                      {(selectedClient.events ?? []).slice(0, 4).map((event) => (
                        <li key={event.id}>
                          <span className="timeline-icon" aria-hidden="true">
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
                          <span className="timeline-icon" aria-hidden="true">
                            <Activity size={14} />
                          </span>
                          <div>
                            <strong>Sem eventos recentes</strong>
                            <span>O histórico aparecerá aqui quando houver atividade.</span>
                          </div>
                        </li>
                      ) : null}
                    </ol>
                  </section>
                </div>
              ) : null}

              {detailTab === 'timeline' ? (
                <ol className="timeline">
                  {(selectedClient.events ?? []).map((event) => (
                    <li key={event.id}>
                      <span className="timeline-icon" aria-hidden="true">
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
                      <span className="timeline-icon" aria-hidden="true">
                        <Activity size={14} />
                      </span>
                      <div>
                        <strong>Sem eventos recentes</strong>
                        <span>O histórico aparecerá aqui quando houver atividade.</span>
                      </div>
                    </li>
                  ) : null}
                </ol>
              ) : null}

              {detailTab === 'references' ? (
                <div className="mini-list">
                  <div className="button-row">
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
                  <div className="status-guidance">
                    <div className="notice">
                      INATIVO = serviço temporariamente parado e elegivel para recuperação.
                      CANCELADO = encerramento definitivo da referência, sem continuidade de
                      recuperação.
                    </div>
                  </div>
                  <div className="reference-grid">
                    {(selectedClient.references ?? []).map((reference) => (
                      <article className="reference-card" key={reference.id}>
                        <header>
                          <div>
                            <strong>{reference.reference}</strong>
                            <span>{reference.plan.name}</span>
                          </div>
                          <StatusBadge status={reference.status} />
                        </header>
                        <div className="reference-metrics">
                          <div>
                            <strong>{formatCurrency(reference.recurringValue)}</strong>
                            <span>Mensalidade</span>
                          </div>
                          <div>
                            <strong>{formatDate(reference.dueDate)}</strong>
                            <span>Próx. vencimento</span>
                          </div>
                          <div>
                            <strong>{reference.billingNoticeDays} dias antes</strong>
                            <span>Cobrança</span>
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
                  {!selectedClient.references?.length ? (
                    <div className="empty-state">Sem referências cadastradas.</div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === 'more' ? (
                <div className="mini-list">
                  <SectionHeader eyebrow="Mais" title="Renovações" />
                  {(selectedClient.renewals ?? []).map((renewal) => (
                    <article key={renewal.id}>
                      <strong>{renewal.planName}</strong>
                      <span>{new Date(renewal.createdAt).toLocaleString('pt-BR')}</span>
                      <p>
                        {formatCurrency(renewal.amount)} | {formatDate(renewal.previousDueDate)}{' '}
                        para {formatDate(renewal.newDueDate)}
                      </p>
                    </article>
                  ))}
                  {!selectedClient.renewals?.length ? (
                    <div className="empty-state">Sem renovações.</div>
                  ) : null}
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
                  <div className="client-tab-summary">
                    <StatCard label="A receber" value={formatCurrency(receivableTotals.pending)} />
                    <StatCard
                      label="Pago"
                      tone="success"
                      value={formatCurrency(receivableTotals.paid)}
                    />
                    <StatCard
                      label="Vencido"
                      tone="danger"
                      value={formatCurrency(receivableTotals.overdue)}
                    />
                    <StatCard
                      label="Cancelado"
                      tone="warning"
                      value={formatCurrency(receivableTotals.canceled)}
                    />
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
                          <th aria-label="Selecionar"></th>
                          <th>Descrição</th>
                          <th>Referência</th>
                          <th>Vencimento</th>
                          <th>Valor</th>
                          <th>Situação</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReceivables.map((receivable) => {
                          const checked = selectedReceivableIds.includes(receivable.id);
                          const status = receivableVisualStatus(receivable);

                          return (
                            <tr key={receivable.id}>
                              <td>
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
                              <td>{formatCurrency(receivable.amount)}</td>
                              <td>
                                <span
                                  className={`finance-status-pill tone-${receivableStatusTone(
                                    receivable,
                                  )}`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td>
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
                    {!selectedReceivables.length ? (
                      <div className="empty-state">Sem contas a receber.</div>
                    ) : null}
                  </div>
                  {selectedReceivables.some((receivable) => receivable.paymentIntents?.length) ? (
                    <div className="pix-intent-list">
                      {selectedReceivables.flatMap((receivable) =>
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
                  <div className="client-tab-summary">
                    <StatCard label="Agendadas" value={billingSummary.scheduled} />
                    <StatCard label="Enviadas" tone="success" value={billingSummary.sent} />
                    <StatCard label="Falhas" tone="danger" value={billingSummary.failed} />
                    <StatCard label="PIX vinculados" tone="info" value={pixIntentCount} />
                  </div>
                  <div className="table-wrap compact-table">
                    <table className="client-billing-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Referências</th>
                          <th>Valor</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Tentativas</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDispatches.map((dispatch) => (
                          <tr key={dispatch.id}>
                            <td>{formatDateTime(dispatch.createdAt)}</td>
                            <td>{dispatchReferenceSummary(selectedReferences.length)}</td>
                            <td>{formatCurrency(billingTotal)}</td>
                            <td>{messageOriginLabel(dispatch.origin)}</td>
                            <td>
                              <span
                                className={`finance-status-pill tone-${dispatchStatusTone(
                                  dispatch.status,
                                )}`}
                              >
                                {billingStatusLabel(dispatch.status)}
                              </span>
                            </td>
                            <td>{dispatch.attempts}</td>
                            <td>
                              <IconButton
                                icon={Eye}
                                label="Abrir detalhe da cobrança"
                                onClick={() => setSelectedDispatch(dispatch)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!selectedDispatches.length ? (
                      <div className="empty-state">Sem mensagens ou cobranças recentes.</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {detailTab === 'more' ? (
                <div className="mini-list">
                  <SectionHeader eyebrow="Mais" title="Recuperação" />
                  {(selectedClient.recoveryCampaigns ?? []).map((campaign) => (
                    <article key={campaign.id}>
                      <strong>Campanha {recoveryCampaignStatusLabel(campaign.status)}</strong>
                      <span>Inicio: {formatDateTime(campaign.startedAt)}</span>
                      <div className="step-list">
                        {campaign.steps.map((step) => (
                          <span key={step.id}>
                            {step.delayDays}d · {recoveryStepStatusLabel(step.status)} ·{' '}
                            {formatDateTime(step.scheduledFor)}
                            {step.sentAt ? ` · enviada ${formatDateTime(step.sentAt)}` : ''}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                  {!selectedClient.recoveryCampaigns?.length ? (
                    <div className="empty-state">Sem campanha de recuperação.</div>
                  ) : null}
                </div>
              ) : null}

              {detailTab === 'more' ? (
                <div className="mini-list">
                  <SectionHeader eyebrow="Mais" title="Indicações" />
                  {selectedClient.referralReceived ? (
                    <article>
                      <strong>
                        Indicado por {selectedClient.referralReceived.referrerClient.name}
                      </strong>
                      <span>{referralStatusLabel(selectedClient.referralReceived.status)}</span>
                      <p>
                        {selectedClient.referralReceived.rewardType}
                        {selectedClient.referralReceived.rewardDescription
                          ? ` · ${selectedClient.referralReceived.rewardDescription}`
                          : ''}
                      </p>
                    </article>
                  ) : null}
                  {selectedClient.referralsMade ? (
                    <article>
                      <strong>{selectedClient.referralsMade.total} indicação(oes) feitas</strong>
                      <span>
                        {selectedClient.referralsMade.qualified} qualificadas ·{' '}
                        {selectedClient.referralsMade.rewarded} recompensadas
                      </span>
                    </article>
                  ) : null}
                  {(selectedClient.referralsMade?.items ?? []).map((referral) => (
                    <article key={referral.id}>
                      <strong>{referral.referredClient.name}</strong>
                      <span>{referralStatusLabel(referral.status)}</span>
                      <p>{referral.rewardType}</p>
                    </article>
                  ))}
                  {!selectedClient.referralReceived &&
                  !selectedClient.referralsMade?.items.length ? (
                    <div className="empty-state">Sem indicações vinculadas.</div>
                  ) : null}
                </div>
              ) : null}
            </>
          </section>
        ) : null}
        {clientFormOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="modal client-form-modal" aria-labelledby="client-form-title">
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
                plans={plans.filter((plan) => plan.active || plan.id === editingClient?.planId)}
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
                  {editingReference ? <Pencil size={15} /> : <Plus size={15} />}
                </span>
                <div>
                  <span className="metric-label">Referência</span>
                  <h2 id="reference-form-title">
                    {editingReference ? 'Editar referência' : 'Nova referência'}
                  </h2>
                  <p>
                    {editingReference
                      ? 'Atualize os dados operacionais desta referência.'
                      : 'Cadastre uma nova referência para este cliente.'}
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
            referenceCount={selectedReferences.length}
            totalAmount={billingTotal}
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
  referenceCount,
  totalAmount,
  onClose,
}: {
  dispatch: ClientMessageDispatch;
  referenceCount: number;
  totalAmount: number;
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
            <dd>{dispatch.attempts}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd>{messageOriginLabel(dispatch.origin)}</dd>
          </div>
          <div>
            <dt>Referências</dt>
            <dd>{dispatchReferenceSummary(referenceCount)}</dd>
          </div>
          <div>
            <dt>Valor total</dt>
            <dd>{formatCurrency(totalAmount)}</dd>
          </div>
        </dl>
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
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState<MessageDispatch | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateContent, setTemplateContent] = useState('');
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState<MessageDispatch['status'] | ''>('');
  const [search, setSearch] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const visibleTemplates = billingMessageTemplates(templates);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const filters: Parameters<typeof listBillingDispatches>[0] = { status, pageSize: 50 };
      const searchTerm = search.trim();

      if (searchTerm) filters.search = searchTerm;
      if (dueDate) filters.dueDate = dueDate;

      const [nextSummary, nextDispatches, nextTemplates] = await Promise.all([
        getBillingSummary(),
        listBillingDispatches(filters),
        listMessageTemplates(),
      ]);
      setSummary(nextSummary);
      setDispatches(nextDispatches.items);
      setTemplates(nextTemplates);
      setSelected((current) => {
        if (!current) return nextDispatches.items[0] ?? null;
        return (
          nextDispatches.items.find((dispatch) => dispatch.id === current.id) ??
          nextDispatches.items[0] ??
          null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar cobranças.');
    } finally {
      setLoading(false);
    }
  }, [dueDate, search, status]);

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

  function openTemplate(template: MessageTemplate) {
    setEditingTemplate(template);
    setTemplateContent(template.content);
    setPreview('');
  }

  async function saveTemplate() {
    if (!editingTemplate) return;
    setWorking('template');
    setError('');

    try {
      await updateMessageTemplate(editingTemplate.id, { content: templateContent });
      setEditingTemplate(null);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o template.');
    } finally {
      setWorking('');
    }
  }

  async function toggleTemplate(template: MessageTemplate) {
    setWorking(template.id);
    setError('');

    try {
      await updateMessageTemplate(template.id, { active: !template.active });
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar o template.');
    } finally {
      setWorking('');
    }
  }

  async function loadPreview() {
    if (!editingTemplate) return;
    setWorking('preview');
    setError('');

    try {
      const result = await previewMessageTemplate(editingTemplate.id, { content: templateContent });
      setPreview(result.renderedContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar preview.');
    } finally {
      setWorking('');
    }
  }

  return (
    <>
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid billing-kpis">
        {[
          ['Agendadas', summary?.scheduled ?? 0],
          ['Enviadas', summary?.sent ?? 0],
          ['Falhas', summary?.failed ?? 0],
          ['Ignoradas/canceladas', summary?.ignoredOrCanceled ?? 0],
        ].map(([label, value]) => (
          <article className="metric-card compact" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{loading ? '-' : value}</strong>
          </article>
        ))}
      </div>

      <div className="workspace-grid billing-grid">
        <section className="workspace-main">
          <div className="toolbar">
            <div className="search-row">
              <Search aria-hidden="true" size={18} />
              <input
                placeholder="Buscar por cliente, referência ou telefone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as MessageDispatch['status'] | '')}
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
              onChange={(event) => setDueDate(event.target.value)}
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
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Agendado para</th>
                  <th>Enviado em</th>
                  <th>Status</th>
                  <th>Tentativas</th>
                  <th>Erro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((dispatch) => (
                  <tr
                    className={selected?.id === dispatch.id ? 'selected-row' : ''}
                    key={dispatch.id}
                    onClick={() => void selectDispatch(dispatch)}
                  >
                    <td>{dispatch.client?.name ?? 'Cliente não vinculado'}</td>
                    <td>{billingDispatchReferenceLabel(dispatch)}</td>
                    <td>
                      {dispatch.totalAmount
                        ? formatCurrency(dispatch.totalAmount)
                        : dispatch.receivable?.amount
                          ? formatCurrency(dispatch.receivable.amount)
                          : '-'}
                    </td>
                    <td>
                      {dispatch.dueDateLabel === 'Vários'
                        ? 'Vários'
                        : dispatch.dueDateLabel
                          ? formatDate(dispatch.dueDateLabel)
                          : dispatch.receivable?.dueDate
                            ? formatDate(dispatch.receivable.dueDate)
                            : '-'}
                    </td>
                    <td>{dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}</td>
                    <td>{dispatch.sentAt ? formatDateTime(dispatch.sentAt) : '-'}</td>
                    <td>
                      <span className={`pill ${dispatch.status.toLowerCase()}`}>
                        {billingStatusLabel(dispatch.status)}
                      </span>
                    </td>
                    <td>{dispatch.attempts ?? 0}/3</td>
                    <td>{dispatch.errorCode ?? dispatch.errorMessage ?? '-'}</td>
                    <td>
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
                        Enviar
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
          </div>

          <section className="panel template-panel">
            <div className="settings-card-header">
              <div>
                <span className="metric-label">MENSAGEM DE COBRANÇA</span>
                <h2>Mensagem de cobrança</h2>
              </div>
            </div>
            <p className="helper-text">
              Mensagem utilizada nas cobranças automáticas antes ou no dia do vencimento.
            </p>
            <div className="mini-list">
              {visibleTemplates.map((template) => (
                <article key={template.id}>
                  <strong>{template.name}</strong>
                  <span>
                    {messageTemplateTypeLabel(template.type)} |{' '}
                    {template.active ? 'Ativo' : 'Inativo'}
                  </span>
                  <p>{template.content}</p>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => openTemplate(template)}
                    >
                      <Pencil aria-hidden="true" size={16} />
                      Editar
                    </button>
                    <button
                      className="secondary-button"
                      disabled={working === template.id}
                      type="button"
                      onClick={() => void toggleTemplate(template)}
                    >
                      {template.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </article>
              ))}
              {!visibleTemplates.length ? (
                <div className="empty-state">Nenhum template cadastrado.</div>
              ) : null}
            </div>
          </section>
        </section>

        <aside className="detail-panel">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <h2>{selected.client?.name ?? 'Cobrança'}</h2>
                  <span>{selected.idempotencyKey ?? selected.requestId}</span>
                </div>
                <span className={`pill ${selected.status.toLowerCase()}`}>
                  {billingStatusLabel(selected.status)}
                </span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Referência</dt>
                  <dd>{billingDispatchReferenceLabel(selected)}</dd>
                </div>
                <div>
                  <dt>Plano</dt>
                  <dd>{selected.client?.planName ?? '-'}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>
                    {selected.totalAmount
                      ? formatCurrency(selected.totalAmount)
                      : selected.receivable?.amount
                        ? formatCurrency(selected.receivable.amount)
                        : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Vencimento</dt>
                  <dd>
                    {selected.dueDateLabel === 'Vários'
                      ? 'Vários'
                      : selected.dueDateLabel
                        ? formatDate(selected.dueDateLabel)
                        : selected.receivable?.dueDate
                          ? formatDate(selected.receivable.dueDate)
                          : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Agendado para</dt>
                  <dd>{selected.scheduledFor ? formatDateTime(selected.scheduledFor) : '-'}</dd>
                </div>
                <div>
                  <dt>Próxima tentativa</dt>
                  <dd>{selected.nextAttemptAt ? formatDateTime(selected.nextAttemptAt) : '-'}</dd>
                </div>
                <div>
                  <dt>Tentativas</dt>
                  <dd>{selected.attempts ?? 0}/3</dd>
                </div>
                <div>
                  <dt>Provider</dt>
                  <dd>{selected.providerMessageId ?? '-'}</dd>
                </div>
                <div>
                  <dt>Enviada em</dt>
                  <dd>{selected.sentAt ? formatDateTime(selected.sentAt) : '-'}</dd>
                </div>
              </dl>
              <div className="preview-box">
                <span>Mensagem renderizada</span>
                <strong>{selected.renderedContent ?? selected.body}</strong>
              </div>
              {selected.items?.length && selected.items.length > 1 ? (
                <div className="mini-list">
                  {selected.items.map((item) => (
                    <article key={item.id}>
                      <strong>{item.reference}</strong>
                      <span>
                        {formatCurrency(item.amount)} | {formatDate(item.dueDate)} | {item.status}
                      </span>
                    </article>
                  ))}
                </div>
              ) : null}
              {selected.errorMessage ? (
                <div className="notice warning">
                  {selected.errorCode ? `${selected.errorCode}: ` : ''}
                  {selected.errorMessage}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Selecione uma cobrança para visualizar detalhes.</div>
          )}
        </aside>
      </div>

      {editingTemplate ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" aria-labelledby="billing-template-title">
            <header className="modal-header">
              <h2 id="billing-template-title">Editar template</h2>
              <button
                className="icon-button"
                type="button"
                onClick={() => setEditingTemplate(null)}
              >
                <X aria-hidden="true" size={17} />
              </button>
            </header>
            <label className="field">
              <span>Conteudo</span>
              <textarea
                rows={7}
                value={templateContent}
                onChange={(event) => setTemplateContent(event.target.value)}
              />
            </label>
            <div className="mini-list">
              <article>
                <strong>Variaveis</strong>
                <span>
                  {editingTemplate.variables.map((variable) => `{{${variable}}}`).join(' ')}
                </span>
              </article>
            </div>
            {preview ? (
              <div className="preview-box">
                <span>Preview</span>
                <strong>{preview}</strong>
              </div>
            ) : null}
            <div className="form-actions">
              <span className="error-message">{error}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadPreview()}
                >
                  <Eye aria-hidden="true" size={16} />
                  Preview
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancelar
                </button>
                <button
                  className="primary-button"
                  disabled={working === 'template' || !templateContent.trim()}
                  type="button"
                  onClick={() => void saveTemplate()}
                >
                  Salvar
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
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

function AutomationsView() {
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
  const [editingRecoveryTemplate, setEditingRecoveryTemplate] = useState<MessageTemplate | null>(
    null,
  );
  const [recoveryTemplateContent, setRecoveryTemplateContent] = useState('');
  const [recoveryTemplateName, setRecoveryTemplateName] = useState('');
  const [recoveryTemplatePreview, setRecoveryTemplatePreview] = useState('');
  const [campaignPagination, setCampaignPagination] = useState<
    PaginatedClients['pagination'] | null
  >(null);
  const [status, setStatus] = useState<RecoveryCampaignStatus | ''>('ATIVA');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');

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
    <div className="workspace-grid">
      <section className="workspace-main">
        {error ? <div className="notice danger">{error}</div> : null}
        <div className="metric-grid billing-kpis">
          <article className="metric-card compact">
            <span className="metric-label">Cobrança automática</span>
            <strong className="metric-value">
              {billingSettings?.enabled ? 'ATIVA' : 'DESATIVADA'}
            </strong>
            <p>{billingSummary?.scheduledToday ?? 0} agendadas hoje</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Recuperação de clientes</span>
            <strong className="metric-value">ATIVA</strong>
            <p>{recoverySummary?.active ?? 0} campanhas ativas</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Recuperação concluida</span>
            <strong className="metric-value">{recoverySummary?.completed ?? 0}</strong>
            <p>{recoverySummary?.canceled ?? 0} canceladas</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Pendencias</span>
            <strong className="metric-value">{recoverySummary?.failed ?? 0}</strong>
            <p>{recoverySummary?.scheduled ?? 0} mensagens futuras</p>
          </article>
        </div>

        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="metric-label">COBRANCA AUTOMATICA</span>
              <h2>{billingSettings?.enabled ? 'Ativa' : 'Desativada'}</h2>
            </div>
            <label className="toggle-field compact-toggle">
              <input
                checked={Boolean(billingSettings?.enabled)}
                disabled={!billingSettings || working === 'billing-settings'}
                type="checkbox"
                onChange={(event) => void saveBillingSettings({ enabled: event.target.checked })}
              />
              <span>Ativar cobrança automática</span>
            </label>
          </div>
          <div className="form-grid automation-settings-grid">
            <label className="field">
              <span>Horário de envio</span>
              <input
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
            </label>
            <label className="field">
              <span>Intervalo entre mensagens</span>
              <input
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
            </label>
            <label className="field">
              <span>Timezone</span>
              <input disabled value="America/Sao_Paulo" readOnly />
            </label>
          </div>
          <p className="helper-text">
            As cobranças começam as {billingSettings?.sendTime ?? '09:00'} e sao enviadas com
            intervalo mínimo de {billingSettings?.sendIntervalSeconds ?? 8} segundos entre
            mensagens.
          </p>
          <p className="helper-text">
            Define o intervalo mínimo entre o envio de uma cobrança e a próxima.
          </p>
        </section>

        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="metric-label">RECUPERAÇÃO</span>
              <h2>{recoverySettings?.enabled ? 'Ativa' : 'Desativada'}</h2>
            </div>
            <label className="toggle-field compact-toggle">
              <input
                checked={Boolean(recoverySettings?.enabled)}
                disabled={!recoverySettings || working === 'recovery-settings'}
                type="checkbox"
                onChange={(event) => void saveRecoverySettings({ enabled: event.target.checked })}
              />
              <span>Ativar recuperação automática</span>
            </label>
          </div>
          <div className="form-grid automation-settings-grid">
            <label className="field">
              <span>Horário de recuperação</span>
              <input
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
            </label>
            <label className="field">
              <span>Intervalo entre mensagens</span>
              <input
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
            </label>
            <label className="field">
              <span>Timezone</span>
              <input disabled value="America/Sao_Paulo" readOnly />
            </label>
          </div>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Dias após vencimento</th>
                  <th>Template</th>
                  <th>Ativa</th>
                </tr>
              </thead>
              <tbody>
                {(recoverySettings?.steps ?? []).map((step, index) => (
                  <tr key={step.stepNumber}>
                    <td>Etapa {step.stepNumber}</td>
                    <td>
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
                            void saveRecoverySettings(recoveryPayloadFromOffsets(recoveryOffsets));
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : 'Etapas de recuperação invalidas.',
                            );
                          }
                        }}
                      />
                    </td>
                    <td>{messageTemplateTypeLabel(step.templateType)}</td>
                    <td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="settings-card template-panel">
          <div className="settings-card-header">
            <div>
              <span className="metric-label">MENSAGENS POR ETAPA</span>
              <h2>Recuperação</h2>
            </div>
          </div>
          <div className="mini-list">
            {recoveryTemplateCards.map((card) => {
              const template = templates.find((item) => item.type === card.templateType);

              return (
                <article key={card.templateType}>
                  <strong>{card.title}</strong>
                  <span>
                    {template?.name ?? 'Template não cadastrado'} |{' '}
                    {template?.active ? 'Ativo' : 'Inativo'}
                  </span>
                  <p>{template?.content ?? 'Template da etapa indisponível.'}</p>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={!template}
                      type="button"
                      onClick={() => template && openRecoveryTemplate(template)}
                    >
                      <Pencil aria-hidden="true" size={16} />
                      Editar
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!template || working === template.id}
                      type="button"
                      onClick={() => template && void toggleRecoveryTemplate(template)}
                    >
                      {template?.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <div className="metric-grid billing-kpis">
          <article className="metric-card compact">
            <span className="metric-label">Agendadas hoje</span>
            <strong className="metric-value">{billingSummary?.scheduledToday ?? 0}</strong>
            <p>{billingSummary?.scheduled ?? 0} futuras totais</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Enviadas hoje</span>
            <strong className="metric-value">{billingSummary?.sentToday ?? 0}</strong>
            <p>{billingSummary?.sent ?? 0} histórico</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Falhas hoje</span>
            <strong className="metric-value">{billingSummary?.failedToday ?? 0}</strong>
            <p>{billingSummary?.failed ?? 0} pendentes de retry</p>
          </article>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Referência</th>
                <th>Vencimento</th>
                <th>Aviso</th>
                <th>Agendado para</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(billingSummary?.next ?? []).map((dispatch) => (
                <tr key={dispatch.id}>
                  <td>{dispatch.client?.name ?? '-'}</td>
                  <td>{billingDispatchReferenceLabel(dispatch)}</td>
                  <td>
                    {dispatch.dueDateLabel === 'Vários'
                      ? 'Vários'
                      : dispatch.dueDateLabel
                        ? formatDate(dispatch.dueDateLabel)
                        : dispatch.receivable?.dueDate
                          ? formatDate(dispatch.receivable.dueDate)
                          : '-'}
                  </td>
                  <td>
                    {dispatch.idempotencyKey?.startsWith('billing-group')
                      ? '-'
                      : `${dispatch.idempotencyKey?.split(':').at(4) ?? '-'} dias`}
                  </td>
                  <td>{dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}</td>
                  <td>
                    <span className={`pill ${dispatch.status.toLowerCase()}`}>
                      {billingStatusLabel(dispatch.status)}
                    </span>
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

        <section className="settings-card">
          <div className="settings-card-header">
            <div>
              <span className="metric-label">CICLO FINANCEIRO</span>
              <h2>Pendencias operacionais</h2>
            </div>
            <button
              className="secondary-button"
              disabled={working === 'billing-receivables'}
              type="button"
              onClick={() => void runBillingReceivablesReconcile()}
            >
              <RefreshCcw aria-hidden="true" size={16} />
              Verificar ciclos
            </button>
          </div>
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

        <div className="toolbar">
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
            <option value="CONCLUIDA">Concluidas</option>
            <option value="CANCELADA">Canceladas</option>
          </select>
          <button className="secondary-button" type="button" onClick={() => void loadAutomations()}>
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
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Referência</th>
                <th>Receivable</th>
                <th>Vencimento</th>
                <th>Atraso</th>
                <th>Status</th>
                <th>Etapa atual/próxima</th>
                <th>Próxima data</th>
                <th>Início</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const nextStep =
                  campaign.steps.find((step) => ['SCHEDULED', 'FAILED'].includes(step.status)) ??
                  campaign.steps.at(-1);
                return (
                  <tr key={campaign.id}>
                    <td>
                      <strong>{campaign.client?.name ?? 'Cliente'}</strong>
                      <span>{campaign.client?.reference ?? campaign.clientId}</span>
                    </td>
                    <td>
                      {campaign.clientReference?.reference ?? campaign.client?.reference ?? '-'}
                    </td>
                    <td>{campaign.receivable?.id ?? campaign.receivableId}</td>
                    <td>{campaign.receivable ? formatDate(campaign.receivable.dueDate) : '-'}</td>
                    <td>{campaign.receivable ? `${campaign.receivable.daysOverdue} dias` : '-'}</td>
                    <td>
                      <span className={`pill ${campaign.status.toLowerCase()}`}>
                        {recoveryCampaignStatusLabel(campaign.status)}
                      </span>
                    </td>
                    <td>{nextStep ? `${nextStep.delayDays} dias` : '-'}</td>
                    <td>{nextStep ? formatDateTime(nextStep.scheduledFor) : '-'}</td>
                    <td>{formatDateTime(campaign.startedAt)}</td>
                    <td>
                      <button
                        className="secondary-button"
                        disabled={campaign.status !== 'ATIVA' || working === campaign.id}
                        type="button"
                        onClick={() => void runCancelCampaign(campaign)}
                      >
                        <X aria-hidden="true" size={16} />
                        Cancelar
                      </button>
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

      <aside className="detail-panel">
        <PanelHeader title="Configuração" />
        <dl className="detail-list">
          <div>
            <dt>Recuperação</dt>
            <dd>{recoverySettings?.enabled ? 'Ativa' : 'Desativada'}</dd>
          </div>
          <div>
            <dt>Etapas</dt>
            <dd>
              {(recoverySettings?.steps ?? [])
                .filter((step) => step.enabled)
                .map((step) => `${step.offsetDays} dias`)
                .join(', ') || '-'}
            </dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd>{recoverySettings?.sendTime ?? '09:00'}</dd>
          </div>
          <div>
            <dt>Retry</dt>
            <dd>3 tentativas</dd>
          </div>
          <div>
            <dt>Kirago real</dt>
            <dd>PENDENTE</dd>
          </div>
        </dl>
      </aside>

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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'webhook' | 'diagnostic' | 'logout-confirm' | null
  >(null);
  const [webhookInfo, setWebhookInfo] = useState<unknown>(null);
  const pollerRef = useRef<WhatsAppQrPoller | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
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
    if (!actionsOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      if (!actionsRef.current?.contains(event.target as Node)) {
        setActionsOpen(nextWhatsAppActionsMenuOpen(true, 'outside'));
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActionsOpen(nextWhatsAppActionsMenuOpen(true, 'escape'));
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [actionsOpen]);

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

  function toggleActionsMenu() {
    setActionsOpen((current) => nextWhatsAppActionsMenuOpen(current, 'toggle'));
  }

  function closeActionsMenuForSelection() {
    setActionsOpen(nextWhatsAppActionsMenuOpen(true, 'select'));
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

    closeActionsMenuForSelection();
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
    closeActionsMenuForSelection();
    await runAction('manual-status', refreshWhatsAppStatus, 'Status do WhatsApp atualizado.');
  }

  function openDiagnosticModal() {
    closeActionsMenuForSelection();
    setActiveModal('diagnostic');
  }

  function openLogoutConfirmation() {
    closeActionsMenuForSelection();
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
          <div className="panel-header">
            <h2>Conexao WhatsApp</h2>
            <button
              className="secondary-button"
              aria-busy={working === 'refresh'}
              disabled={hasWorkingAction}
              type="button"
              onClick={() => void refreshWhatsAppPanel()}
            >
              <RefreshCcw aria-hidden="true" size={16} />
              {working === 'refresh' ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          <div className={`provider-health ${health?.online ? 'online' : 'offline'}`}>
            <ShieldCheck aria-hidden="true" size={16} />
            API Kirago: {health?.online ? 'Online' : 'Indisponivel'}
            {health?.version ? <span>v{health.version}</span> : null}
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
              <div className="connection-status">
                {connected ? (
                  <Wifi aria-hidden="true" size={18} />
                ) : (
                  <WifiOff aria-hidden="true" size={18} />
                )}
                <strong>
                  {connected
                    ? 'WhatsApp conectado'
                    : remoteInstanceMissing
                      ? 'Instância Kirago ausente'
                      : 'WhatsApp aguardando conexão'}
                </strong>
                <span>{connection.status}</span>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>Conexao</dt>
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

              <div className="button-row wrap">
                {connected ? null : (
                  <button
                    className="primary-button"
                    aria-busy={isConnectingFlow}
                    disabled={hasWorkingAction}
                    type="button"
                    onClick={() => void handleConnectFlow()}
                  >
                    <Power aria-hidden="true" size={16} />
                    {isConnectingFlow ? 'Preparando...' : connectActionLabel}
                  </button>
                )}
                <button
                  className="secondary-button"
                  aria-busy={working === 'manual-status'}
                  disabled={hasWorkingAction}
                  type="button"
                  onClick={() =>
                    void runAction('manual-status', refreshWhatsAppStatus, 'Status atualizado.')
                  }
                >
                  <RefreshCcw aria-hidden="true" size={16} />
                  {working === 'manual-status' ? 'Atualizando...' : 'Atualizar'}
                </button>
                {connected ? (
                  <button
                    className="secondary-button"
                    aria-busy={working === 'disconnect'}
                    disabled={hasWorkingAction}
                    type="button"
                    onClick={() => void handleDisconnect()}
                  >
                    <Power aria-hidden="true" size={16} />
                    {working === 'disconnect' ? 'Desconectando...' : 'Desconectar'}
                  </button>
                ) : null}
                <div className="technical-actions" ref={actionsRef}>
                  <button
                    aria-controls="whatsapp-actions-menu"
                    aria-expanded={actionsOpen}
                    aria-haspopup="menu"
                    className="secondary-button technical-actions-trigger"
                    type="button"
                    onClick={toggleActionsMenu}
                  >
                    <Settings aria-hidden="true" size={16} />
                    Mais ações
                  </button>
                  {actionsOpen ? (
                    <div className="technical-actions-menu" id="whatsapp-actions-menu" role="menu">
                      <button
                        className="secondary-button"
                        aria-busy={working === 'webhook-info'}
                        disabled={hasWorkingAction}
                        role="menuitem"
                        type="button"
                        onClick={() => void openWebhookModal()}
                      >
                        {working === 'webhook-info' ? 'Carregando...' : 'Configurar webhook'}
                      </button>
                      <button
                        className="secondary-button"
                        aria-busy={working === 'manual-status'}
                        disabled={hasWorkingAction}
                        role="menuitem"
                        type="button"
                        onClick={() => void handleManualStatusRefresh()}
                      >
                        {working === 'manual-status'
                          ? 'Atualizando...'
                          : 'Atualizar status manualmente'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={hasWorkingAction}
                        role="menuitem"
                        type="button"
                        onClick={openDiagnosticModal}
                      >
                        Visualizar diagnóstico
                      </button>
                      <button
                        className="danger-button"
                        disabled={hasWorkingAction}
                        role="menuitem"
                        type="button"
                        onClick={openLogoutConfirmation}
                      >
                        Deslogar WhatsApp
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}

          {loading ? <div className="empty-state">Carregando...</div> : null}
        </section>

        <section className="panel whatsapp-panel">
          <h2>Últimos envios</h2>
          <div className="message-history">
            {messages.map((message) => (
              <article key={message.id}>
                <div>
                  <strong>{message.client?.name ?? 'Cliente não vinculado'}</strong>
                  <span>{message.phone}</span>
                </div>
                <p>{message.body}</p>
                <footer>
                  <span>{message.origin}</span>
                  <span>{message.status}</span>
                  <span>{new Date(message.createdAt).toLocaleString('pt-BR')}</span>
                </footer>
              </article>
            ))}
            {!messages.length ? <div className="empty-state">Nenhum envio registrado.</div> : null}
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

function WaitlistView({
  plans,
  onClientCreated,
}: {
  plans: Plan[];
  onClientCreated: (client: Client) => Promise<void>;
}) {
  const [summary, setSummary] = useState<WhatsAppPendingContactsSummary | null>(null);
  const [contacts, setContacts] = useState<WhatsAppPendingContact[]>([]);
  const [selected, setSelected] = useState<WhatsAppPendingContact | null>(null);
  const [status, setStatus] = useState<WhatsAppPendingContactStatus | ''>('PENDENTE');
  const [search, setSearch] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadWaitlist = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const filters: Parameters<typeof listWhatsAppPendingContacts>[0] = { status, pageSize: 50 };
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
      setSelected((current) => {
        if (!current) return nextContacts.items[0] ?? null;
        return (
          nextContacts.items.find((contact) => contact.id === current.id) ??
          nextContacts.items[0] ??
          null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a lista.');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void loadWaitlist();
  }, [loadWaitlist]);

  async function selectContact(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const detail = await getWhatsAppPendingContact(contact.id);
      setSelected(detail);
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
      setSelected(updated);
      await loadWaitlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ignorar o contato.');
    }
  }

  async function handleReopen(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const updated = await reopenWhatsAppPendingContact(contact.id);
      setSelected(updated);
      await loadWaitlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reabrir o contato.');
    }
  }

  return (
    <>
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid waitlist-kpis">
        {[
          ['Pendentes', summary?.pending ?? 0],
          ['Aprovados hoje', summary?.approvedToday ?? 0],
          ['Ignorados', summary?.ignored ?? 0],
        ].map(([label, value]) => (
          <article className="metric-card compact" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{loading ? '-' : value}</strong>
          </article>
        ))}
      </div>

      <div className="workspace-grid waitlist-grid">
        <section className="workspace-main">
          <div className="toolbar">
            <div className="search-row">
              <Search aria-hidden="true" size={18} />
              <input
                placeholder="Buscar por nome ou telefone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as WhatsAppPendingContactStatus | '')
              }
            >
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="APROVADO">Aprovados</option>
              <option value="IGNORADO">Ignorados</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => void loadWaitlist()}>
              <RefreshCcw aria-hidden="true" size={16} />
              Atualizar
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>WhatsApp</th>
                  <th>Ultima mensagem</th>
                  <th>Primeiro contato</th>
                  <th>Ultimo contato</th>
                  <th>Mensagens</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    className={selected?.id === contact.id ? 'selected-row' : ''}
                    key={contact.id}
                    onClick={() => void selectContact(contact)}
                  >
                    <td>{contact.contactName ?? 'Contato sem nome'}</td>
                    <td>{contact.phoneNormalized}</td>
                    <td>{waitlistMessagePreview(contact)}</td>
                    <td>{formatDateTime(contact.firstContactAt)}</td>
                    <td>{formatDateTime(contact.lastContactAt)}</td>
                    <td>{contact.messageCount}</td>
                    <td>
                      <span className={`pill ${contact.status.toLowerCase()}`}>
                        {contact.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void selectContact(contact);
                        }}
                      >
                        <Eye aria-hidden="true" size={16} />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!contacts.length ? (
              <div className="empty-state">
                {loading ? 'Carregando...' : 'Nenhum contato na lista de espera.'}
              </div>
            ) : null}
          </div>
        </section>

        <aside className="detail-panel">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <h2>{selected.contactName ?? 'Contato WhatsApp'}</h2>
                  <span>{selected.phoneNormalized}</span>
                </div>
                <span className={`pill ${selected.status.toLowerCase()}`}>{selected.status}</span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Instancia</dt>
                  <dd>{selected.connection.name}</dd>
                </div>
                <div>
                  <dt>Primeiro contato</dt>
                  <dd>{formatDateTime(selected.firstContactAt)}</dd>
                </div>
                <div>
                  <dt>Ultimo contato</dt>
                  <dd>{formatDateTime(selected.lastContactAt)}</dd>
                </div>
                <div>
                  <dt>Mensagens</dt>
                  <dd>{selected.messageCount}</dd>
                </div>
              </dl>

              <div className="button-row detail-actions">
                <button
                  className="primary-button"
                  disabled={selected.status === 'APROVADO'}
                  type="button"
                  onClick={() => setApproveOpen(true)}
                >
                  <Plus aria-hidden="true" size={16} />
                  Aprovar
                </button>
                {selected.status === 'IGNORADO' ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleReopen(selected)}
                  >
                    Reabrir
                  </button>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleIgnore(selected)}
                  >
                    Ignorar
                  </button>
                )}
              </div>

              {selected.status !== 'IGNORADO' ? (
                <label className="field">
                  <span>Motivo para ignorar</span>
                  <textarea
                    value={ignoreReason}
                    onChange={(event) => setIgnoreReason(event.target.value)}
                  />
                </label>
              ) : null}

              <div className="mini-list">
                {(selected.inboundMessages ?? []).map((message) => (
                  <article key={message.id}>
                    <strong>{messageTypeLabel(message.messageType)}</strong>
                    <span>{formatDateTime(message.messageTimestamp ?? message.receivedAt)}</span>
                    <p>{message.text ?? messageTypePreview(message.messageType)}</p>
                  </article>
                ))}
                {!selected.inboundMessages?.length ? (
                  <div className="empty-state">Abra um contato para ver o histórico mínimo.</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="empty-state">Selecione um contato para visualizar detalhes.</div>
          )}
        </aside>
      </div>

      {approveOpen && selected ? (
        <ApprovePendingContactModal
          contact={selected}
          plans={plans}
          onClose={() => setApproveOpen(false)}
          onApproved={async (client) => {
            setApproveOpen(false);
            await onClientCreated(client);
          }}
        />
      ) : null}
    </>
  );
}

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
  const initialPlan = plans[0];
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = plans.find((plan) => plan.id === nextPlanId);
    if (selectedPlan) setRecurringValue(selectedPlan.defaultValue);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
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
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="approve-pending-title">
        <header className="modal-header">
          <h2 id="approve-pending-title">Transformar contato em cliente</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>
        <form className="entity-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="field">
              <span>Nome</span>
              <input required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field">
              <span>WhatsApp</span>
              <input readOnly value={phone} />
            </label>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
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
                {plans.map((plan) => (
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
          <label className="field">
            <span>Observações</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="field">
            <span>Indicado por</span>
            <ClientReferralSelect value={referrerClientId} onChange={setReferrerClientId} />
          </label>
          <section className="inline-panel">
            <div>
              <strong>Cobrança inicial</strong>
              <p>
                O cliente será criado como pendente de pagamento. A ativação acontece somente depois
                do primeiro pagamento.
              </p>
            </div>
            <label className="checkbox-row">
              <input
                checked={generateInitialReceivable}
                type="checkbox"
                onChange={(event) => setGenerateInitialReceivable(event.target.checked)}
              />
              Gerar cobrança inicial
            </label>
            {generateInitialReceivable ? (
              <label className="checkbox-row">
                <input
                  checked={sendPixWhatsAppNow}
                  type="checkbox"
                  onChange={(event) => setSendPixWhatsAppNow(event.target.checked)}
                />
                Enviar PIX pelo WhatsApp agora
              </label>
            ) : null}
            <div className="notice">
              <strong>Resumo</strong>
              <span>
                {name || 'Cliente'} ficara como Pendente pagamento
                {generateInitialReceivable
                  ? `, com cobrança inicial de ${formatCurrency(Number(recurringValue || 0))} para ${dueDate || 'data selecionada'}`
                  : ', sem cobrança inicial gerada agora'}
                {generateInitialReceivable && sendPixWhatsAppNow
                  ? ' e envio imediato do PIX.'
                  : '.'}
              </span>
            </div>
          </section>
          <div className="form-actions">
            <span className="error-message">{error}</span>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={onClose}>
                Cancelar
              </button>
              <button className="primary-button" disabled={loading} type="submit">
                {loading ? 'Criando...' : 'Criar cliente'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function waitlistMessagePreview(contact: WhatsAppPendingContact) {
  const text = contact.lastMessageText ?? messageTypePreview(contact.lastMessageType);
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
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

function recoveryCampaignStatusLabel(status: RecoveryCampaignStatus) {
  const labels: Record<RecoveryCampaignStatus, string> = {
    ATIVA: 'Ativa',
    CONCLUIDA: 'Concluida',
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
  const initialPlan = reference?.plan ?? plans[0];
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = plans.find((plan) => plan.id === nextPlanId);
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
      <div className="form-section-title">
        <span className="section-eyebrow">Dados cobrança</span>
        <h2>{reference ? 'Editar referência' : 'Criar referência'}</h2>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Referência</span>
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
            {plans.map((plan) => (
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
          <span>Antecedência da cobrança</span>
          <input
            min="0"
            type="number"
            value={billingNoticeDays}
            onChange={(event) => setBillingNoticeDays(event.target.value)}
          />
          <small>Define quantos dias antes do vencimento a cobrança automática será enviada.</small>
        </label>
        <label className="field">
          <span>Observações</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <span className="error-message">{error}</span>
        <div className="button-row">
          <Button icon={X} variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={saving} icon={Save} loading={saving} type="submit" variant="primary">
            {reference ? 'Atualizar referência' : 'Criar referência'}
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
              {plans.map((plan) => (
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

function FinanceView({ clients, initialTab }: { clients: Client[]; initialTab: FinanceTab }) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [entries, setEntries] = useState<FinancialTransaction[]>([]);
  const [expenses, setExpenses] = useState<FinancialTransaction[]>([]);
  const [receivableStatus, setReceivableStatus] = useState<ReceivableDisplayStatus | ''>('');
  const [financeSearch, setFinanceSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentReceivable, setPaymentReceivable] = useState<Receivable | null>(null);
  const [pixReceivable, setPixReceivable] = useState<Receivable | null>(null);
  const [paymentReceivables, setPaymentReceivables] = useState<Receivable[] | null>(null);
  const [pixReceivables, setPixReceivables] = useState<Receivable[] | null>(null);
  const [selectedReceivableIds, setSelectedReceivableIds] = useState<string[]>([]);
  const [cancelingReceivable, setCancelingReceivable] = useState<Receivable | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const receivableFilters: Parameters<typeof listReceivables>[0] = {
        status: receivableStatus,
        pageSize: 50,
      };
      const trimmedSearch = financeSearch.trim();

      if (trimmedSearch) {
        receivableFilters.search = trimmedSearch;
      }

      const [nextSummary, nextCategories, nextReceivables, nextEntries, nextExpenses] =
        await Promise.all([
          getFinancialSummary(),
          listFinancialCategories(),
          listReceivables(receivableFilters),
          listFinancialTransactions({ type: 'ENTRADA', pageSize: 50 }),
          listFinancialTransactions({ type: 'SAIDA', pageSize: 50 }),
        ]);

      setSummary(nextSummary);
      setCategories(nextCategories);
      setReceivables(nextReceivables.items);
      setEntries(nextEntries.items);
      setExpenses(nextExpenses.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar financeiro.');
    } finally {
      setLoading(false);
    }
  }, [financeSearch, receivableStatus]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  async function reloadWithNotice(message: string) {
    setSelectedReceivableIds([]);
    setNotice(message);
    await loadFinance();
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

  return (
    <section className="workspace-main">
      {error ? <div className="notice danger">{error}</div> : null}
      {notice ? <div className="notice success">{notice}</div> : null}

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
        <div className="metric-grid">
          {(
            [
              ['Recebido', summary.received],
              ['A receber', summary.receivablePending],
              ['Vencido', summary.receivableOverdue],
              ['Entradas', summary.entries],
              ['Saídas', summary.expenses],
              ['Saldo', summary.balance],
            ] satisfies Array<[string, string]>
          ).map(([label, value]) => (
            <article className="metric-card" key={label}>
              <span className="metric-label">{label}</span>
              <strong className="metric-value">{loading ? '-' : formatCurrency(value)}</strong>
            </article>
          ))}
        </div>
      ) : null}

      {tab === 'receivables' ? (
        <>
          <div className="toolbar">
            <div className="search-row">
              <Search aria-hidden="true" size={18} />
              <input
                placeholder="Buscar cliente, referência ou descrição"
                value={financeSearch}
                onChange={(event) => setFinanceSearch(event.target.value)}
              />
            </div>
            <select
              value={receivableStatus}
              onChange={(event) =>
                setReceivableStatus(event.target.value as ReceivableDisplayStatus | '')
              }
            >
              <option value="">Todas as situações</option>
              <option value="PENDENTE">Pendente</option>
              <option value="VENCIDO">Vencido</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => void loadFinance()}>
              Aplicar
            </button>
          </div>
          {selectedReceivables.length ? (
            <div className="selection-bar">
              <strong>
                {selectedReceivables.length} conta{selectedReceivables.length > 1 ? 's' : ''}{' '}
                selecionada{selectedReceivables.length > 1 ? 's' : ''}
              </strong>
              <span>Total: {formatCurrency(selectedTotal)}</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setPixReceivables(selectedReceivables)}
                >
                  <QrCode aria-hidden="true" size={16} />
                  Gerar PIX selecionados
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setPaymentReceivables(selectedReceivables)}
                >
                  Dar baixa selecionados
                </button>
              </div>
            </div>
          ) : null}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Selecionar</th>
                  <th>Cliente</th>
                  <th>Referência</th>
                  <th>Descrição</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
                    <td>
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
                    <td>{formatCurrency(receivable.amount)}</td>
                    <td>{receivable.displayStatus}</td>
                    <td>
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          disabled={receivable.status !== 'PENDENTE'}
                          type="button"
                          onClick={() => setPixReceivable(receivable)}
                        >
                          <QrCode aria-hidden="true" size={16} />
                          Gerar PIX
                        </button>
                        <button
                          className="secondary-button"
                          disabled={receivable.status !== 'PENDENTE'}
                          type="button"
                          onClick={() => setPaymentReceivable(receivable)}
                        >
                          Dar baixa
                        </button>
                        <button
                          className="danger-button"
                          disabled={receivable.status !== 'PENDENTE'}
                          type="button"
                          onClick={() => setCancelingReceivable(receivable)}
                        >
                          Cancelar
                        </button>
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
          </div>
        </>
      ) : null}

      {tab === 'entries' ? (
        <TransactionSection
          categories={entryCategories}
          clients={clients}
          items={entries}
          kind="ENTRADA"
          onCreate={async (payload) => {
            await createManualEntry(payload);
            await reloadWithNotice('Entrada registrada.');
          }}
          onDelete={async (id) => {
            await deleteFinancialTransaction(id);
            await reloadWithNotice('Entrada removida.');
          }}
          onUpdate={async (id, payload) => {
            await updateFinancialTransaction(id, payload);
            await reloadWithNotice('Entrada atualizada.');
          }}
        />
      ) : null}

      {tab === 'expenses' ? (
        <TransactionSection
          categories={expenseCategories}
          clients={clients}
          items={expenses}
          kind="SAIDA"
          onCreate={async (payload) => {
            await createManualExpense(payload);
            await reloadWithNotice('Saida registrada.');
          }}
          onDelete={async (id) => {
            await deleteFinancialTransaction(id);
            await reloadWithNotice('Saida removida.');
          }}
          onUpdate={async (id, payload) => {
            await updateFinancialTransaction(id, payload);
            await reloadWithNotice('Saida atualizada.');
          }}
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
    </section>
  );
}

function TransactionSection({
  categories,
  clients,
  items,
  kind,
  onCreate,
  onDelete,
  onUpdate,
}: {
  categories: FinancialCategory[];
  clients: Client[];
  items: FinancialTransaction[];
  kind: FinancialTransactionType;
  onCreate: (payload: FinancialTransactionPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, payload: Partial<FinancialTransactionPayload>) => Promise<void>;
}) {
  const [editing, setEditing] = useState<FinancialTransaction | null>(null);
  const [form, setForm] = useState({
    description: '',
    categoryId: categories[0]?.id ?? '',
    amount: '',
    transactionDate: new Date().toISOString().slice(0, 10),
    clientId: '',
    notes: '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      categoryId: current.categoryId || categories[0]?.id || '',
    }));
  }, [categories]);

  function startEdit(transaction: FinancialTransaction) {
    setEditing(transaction);
    setForm({
      description: transaction.description,
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      transactionDate: transaction.transactionDate,
      clientId: transaction.clientId ?? '',
      notes: transaction.notes ?? '',
    });
  }

  function resetForm() {
    setEditing(null);
    setForm({
      description: '',
      categoryId: categories[0]?.id ?? '',
      amount: '',
      transactionDate: new Date().toISOString().slice(0, 10),
      clientId: '',
      notes: '',
    });
  }

  async function submitForm() {
    const payload = {
      description: form.description,
      categoryId: form.categoryId,
      amount: Number(form.amount),
      transactionDate: form.transactionDate,
      ...(form.clientId ? { clientId: form.clientId } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    if (editing) {
      await onUpdate(editing.id, payload);
    } else {
      await onCreate(payload);
    }

    resetForm();
  }

  return (
    <>
      <div className="entity-form">
        <label className="field">
          <span>Descrição</span>
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select
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
            step="0.01"
            type="number"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Data</span>
          <input
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
          <span />
          <div className="button-row">
            {editing ? (
              <button className="secondary-button" type="button" onClick={resetForm}>
                Cancelar edicao
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={() => void submitForm()}>
              <DollarSign aria-hidden="true" size={16} />
              {editing ? 'Atualizar' : kind === 'ENTRADA' ? 'Nova entrada' : 'Nova saída'}
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Origem</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.id}>
                <td>{formatDate(transaction.transactionDate)}</td>
                <td>{transaction.description}</td>
                <td>{transaction.category.name}</td>
                <td>{transaction.client?.name ?? '-'}</td>
                <td>{formatCurrency(transaction.amount)}</td>
                <td>{transaction.origin}</td>
                <td>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      disabled={
                        transaction.origin !== 'MANUAL' || Boolean(transaction.receivableId)
                      }
                      type="button"
                      onClick={() => startEdit(transaction)}
                    >
                      Editar
                    </button>
                    <button
                      className="danger-button"
                      disabled={
                        transaction.origin !== 'MANUAL' || Boolean(transaction.receivableId)
                      }
                      type="button"
                      onClick={() => void onDelete(transaction.id)}
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <div className="empty-state">Nenhuma movimentação encontrada.</div> : null}
      </div>
    </>
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
  const [name, setName] = useState('');
  const [type, setType] = useState<FinancialTransactionType>('ENTRADA');

  async function submitCategory() {
    await onCreate({ name, type, active: true });
    setName('');
    setType('ENTRADA');
  }

  return (
    <>
      <div className="compact-form">
        <label className="field">
          <span>Nome</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="field">
          <span>Tipo</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as FinancialTransactionType)}
          >
            <option value="ENTRADA">Entrada</option>
            <option value="SAIDA">Saida</option>
          </select>
        </label>
        <button className="primary-button" type="button" onClick={() => void submitCategory()}>
          <Plus aria-hidden="true" size={16} />
          Categoria
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id}>
                <td>{category.name}</td>
                <td>{category.type}</td>
                <td>{category.active ? 'Ativa' : 'Inativa'}</td>
                <td>
                  <div className="button-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void onUpdate(category.id, { active: !category.active })}
                    >
                      {category.active ? 'Inativar' : 'Ativar'}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void onDelete(category.id)}
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
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
        <header className="modal-header">
          <h2 id="pix-title">PIX</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
        <header className="modal-header">
          <h2 id="group-pix-title">PIX selecionados</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
        <header className="modal-header">
          <h2 id="payment-title">Dar baixa</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
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
        <header className="modal-header">
          <h2 id="group-payment-title">Dar baixa selecionados</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
            <input value={notes} onChange={(event) => setNotes(event.target.value)} />
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
        <header className="modal-header">
          <h2 id="cancel-receivable-title">Cancelar recebivel</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
  onNew,
  onUpdate,
  planFormOpen,
  plans,
}: {
  editingPlan: Plan | null;
  onCreate: Parameters<typeof PlanForm>[0]['onSubmit'];
  onDelete: (id: string) => Promise<void>;
  onEdit: (plan: Plan) => void;
  onNew: () => void;
  onUpdate: Parameters<typeof PlanForm>[0]['onSubmit'];
  planFormOpen: boolean;
  plans: Plan[];
}) {
  return (
    <section className="workspace-main">
      <div className="toolbar">
        <button className="primary-button" type="button" onClick={onNew}>
          <Plus aria-hidden="true" size={17} />
          Plano
        </button>
      </div>

      {planFormOpen ? (
        <PlanForm
          plan={editingPlan ?? undefined}
          submitLabel={editingPlan ? 'Atualizar plano' : 'Criar plano'}
          onSubmit={editingPlan ? onUpdate : onCreate}
        />
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Plano</th>
              <th>Duração</th>
              <th>Valor padrão</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>
                  <strong>{plan.name}</strong>
                </td>
                <td>{plan.durationMonths} meses</td>
                <td>{formatCurrency(plan.defaultValue)}</td>
                <td>{plan.active ? 'Ativo' : 'Inativo'}</td>
                <td>
                  <div className="button-row">
                    <button className="secondary-button" type="button" onClick={() => onEdit(plan)}>
                      Editar
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => void onDelete(plan.id)}
                    >
                      Remover
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
