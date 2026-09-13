'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  CalendarClock,
  Copy,
  CreditCard,
  Download,
  DollarSign,
  Eye,
  Gift,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCcw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ToggleLeft,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { AuthenticatedUser } from '@crm-novo/shared';
import { buildApiUrl } from '../../lib/api';
import { ClientForm } from '../../components/clients/client-form';
import { ClientReferralSelect } from '../../components/clients/client-referral-select';
import { StatusBadge } from '../../components/clients/status-badge';
import { PlanForm } from '../../components/plans/plan-form';
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
  createPlan,
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
  syncPaymentIntent,
  deactivatePaymentProviderCredential,
  registerPaymentWebhook,
  type BillingSummary,
  type BillingAutomationSettings,
  type Client,
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
  { id: 'referrals', label: 'Indicacoes', icon: Gift },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'plans', label: 'Planos', icon: ToggleLeft },
  { id: 'billing', label: 'Cobrancas', icon: Bell },
  { id: 'automations', label: 'Automacoes', icon: Activity },
  { id: 'reports', label: 'Relatorios', icon: BarChart3 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'waitlist', label: 'Lista de Espera', icon: ListChecks },
  { id: 'settings', label: 'Configuracoes', icon: Settings },
] satisfies Array<{ id: View; label: string; icon: typeof LayoutDashboard }>;

const futureNavItems = [{ label: 'Renovacoes', icon: RefreshCcw }];

type RenewalTarget = {
  client: Client;
  reference: ClientReference;
};

export default function DashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientsPayload, setClientsPayload] = useState<PaginatedClients | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [financeInitialTab, setFinanceInitialTab] = useState<FinanceTab>('summary');
  const [renewalTarget, setRenewalTarget] = useState<RenewalTarget | null>(null);
  const [renewalNotice, setRenewalNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [planId, setPlanId] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [startRecovery, setStartRecovery] = useState(false);
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
        if (!current) return nextClients.items[0] ?? null;
        return (
          nextClients.items.find((client) => client.id === current.id) ??
          nextClients.items[0] ??
          null
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar clientes e planos.');
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

  async function handleReferenceStatusChange(reference: ClientReference, nextStatus: ClientStatus) {
    if (!selectedClient) return;

    await updateClientReferenceStatus(
      reference.id,
      nextStatus,
      statusReason.trim() || undefined,
      nextStatus === 'INATIVO' && startRecovery,
    );
    setStatusReason('');
    setStartRecovery(false);
    const detailed = await getClient(selectedClient.id);
    setSelectedClient(detailed);
    await loadData();
  }

  function openRenewal(client: Client, reference?: ClientReference) {
    const selectedReference =
      reference ?? (client.references?.length === 1 ? client.references[0] : null);

    if (!selectedReference) {
      setSelectedClient(client);
      setView('clients');
      setRenewalNotice('Selecione uma referencia especifica para renovar.');
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
      `Referencia ${target.reference.reference} renovada com sucesso. Novo vencimento: ${formatDate(result.newDueDate)}. Conta a receber criada: ${formatCurrency(result.receivable.amount)}.`,
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
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brand-mark">C</span>
          <span>CRM Novo</span>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
              >
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </button>
            );
          })}
          {futureNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <span className="nav-item muted" key={item.label}>
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </span>
            );
          })}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <h1>
            {view === 'plans'
              ? 'Planos'
              : view === 'dashboard'
                ? 'Dashboard'
                : view === 'finance'
                  ? 'Financeiro'
                  : view === 'whatsapp'
                    ? 'WhatsApp'
                    : view === 'referrals'
                      ? 'Indicacoes'
                      : view === 'billing'
                        ? 'Cobrancas'
                        : view === 'automations'
                          ? 'Automacoes'
                          : view === 'reports'
                            ? 'Relatorios'
                            : view === 'waitlist'
                              ? 'Lista de Espera'
                              : view === 'settings'
                                ? 'Configuracoes'
                                : 'Clientes'}
          </h1>
          <span className="topbar-user">{user?.name}</span>
        </header>

        <section className="content">
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
                setClientFormOpen((open) => !open);
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
              onSelect={setSelectedClient}
              onReferenceStatusChange={(reference, nextStatus) =>
                void handleReferenceStatusChange(reference, nextStatus)
              }
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
              setStatusReason={setStatusReason}
              setStartRecovery={setStartRecovery}
              status={status}
              statusReason={statusReason}
              startRecovery={startRecovery}
              renewalNotice={renewalNotice}
            />
          ) : null}
          {view === 'finance' ? (
            <FinanceView clients={clients} initialTab={financeInitialTab} />
          ) : null}
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
        </section>
        {renewalTarget ? (
          <RenewalModal
            target={renewalTarget}
            plans={plans.filter(
              (plan) => plan.active || plan.id === renewalTarget.reference.planId,
            )}
            onClose={() => setRenewalTarget(null)}
            onConfirm={async (payload) => handleRenewalConfirm(renewalTarget, payload)}
          />
        ) : null}
      </main>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o dashboard.');
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
      <div className="dashboard-toolbar">
        <div className="period-controls">
          {[
            ['current', 'Mes atual'],
            ['previous', 'Mes anterior'],
            ['last30', 'Ultimos 30 dias'],
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

      <div className="quick-actions">
        <button className="primary-button" type="button" onClick={onNewClient}>
          <Plus aria-hidden="true" size={16} />
          Novo cliente
        </button>
        <button className="secondary-button" type="button" onClick={() => onOpenFinance('entries')}>
          <DollarSign aria-hidden="true" size={16} />
          Nova entrada
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onOpenFinance('expenses')}
        >
          <CreditCard aria-hidden="true" size={16} />
          Nova saida
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onOpenFinance('receivables')}
        >
          Ver contas a receber
        </button>
      </div>

      <div className="metric-grid dashboard-kpis">
        {[
          ['Clientes ativos', summary?.clients.active],
          ['Clientes inativos', summary?.clients.inactive],
          ['Clientes cancelados', summary?.clients.canceled],
          ['Novos clientes', summary?.clients.newInPeriod],
          ['Vencem hoje', summary?.dueDates.dueToday],
          ['Proximos 7 dias', summary?.dueDates.upcomingSevenDays],
          ['Clientes vencidos', summary?.dueDates.overdueClients],
          ['Renovacoes', summary?.renewals.count],
        ].map(([label, value]) => (
          <article className="metric-card compact" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">{loading ? '-' : String(value ?? 0)}</strong>
          </article>
        ))}
      </div>

      <div className="metric-grid finance-kpis">
        {[
          ['Recebido', summary?.finance.received],
          ['A receber', summary?.finance.receivablePending],
          ['Vencido', summary?.finance.receivableOverdue],
          ['Entradas', summary?.finance.entries],
          ['Saidas', summary?.finance.expenses],
          ['Saldo', summary?.finance.balance],
          ['Valor renovado', summary?.renewals.amount],
        ].map(([label, value]) => (
          <article className="metric-card compact" key={label}>
            <span className="metric-label">{label}</span>
            <strong className="metric-value">
              {loading ? '-' : formatCurrency(String(value ?? '0'))}
            </strong>
          </article>
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <h2>Entradas x saidas</h2>
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
        </section>

        <section className="panel chart-panel">
          <h2>Recebimentos</h2>
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
        </section>

        <section className="panel chart-panel">
          <h2>Clientes</h2>
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
        </section>
      </div>

      <div className="dashboard-grid operational-grid">
        <section className="panel">
          <PanelHeader title="Pendencias" />
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
              <div className="empty-state">Sem pendencias operacionais.</div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <PanelHeader title="Vencimentos de hoje" />
          <CompactClientDueTable
            items={summary?.lists.dueToday ?? []}
            onOpen={onOpenClient}
            onRenew={onRenew}
          />
        </section>

        <section className="panel">
          <PanelHeader title="Proximos vencimentos" />
          <CompactClientDueTable
            items={summary?.lists.upcomingDue ?? []}
            onOpen={onOpenClient}
            onRenew={onRenew}
          />
        </section>

        <section className="panel">
          <PanelHeader title="Contas vencidas" onViewAll={() => onOpenFinance('receivables')} />
          <OverdueReceivablesTable
            items={summary?.lists.overdueReceivables ?? []}
            onOpenFinance={() => onOpenFinance('receivables')}
          />
        </section>

        <section className="panel">
          <h2>Atividade recente</h2>
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
        </section>
      </div>
    </>
  );
}

function PanelHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {onViewAll ? (
        <button className="secondary-button" type="button" onClick={onViewAll}>
          Ver todos
        </button>
      ) : null}
    </div>
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
        Pagina {pagination.page} de {pagination.totalPages} | {pagination.total} registros
      </span>
      <button
        className="secondary-button"
        disabled={pagination.page >= pagination.totalPages}
        type="button"
        onClick={() => onPageChange(pagination.page + 1)}
      >
        Proxima
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
              className="secondary-button"
              type="button"
              onClick={() => void onOpen(client.id)}
            >
              Ver
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void onRenew(client.id, client.clientReferenceId)}
            >
              Renovar
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
          <button className="secondary-button" type="button" onClick={onOpenFinance}>
            Dar baixa
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar indicacoes.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel aplicar o beneficio.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel cancelar a indicacao.');
    }
  }

  return (
    <section className="workspace-main">
      {error ? <div className="notice danger">{error}</div> : null}
      <div className="metric-grid">
        {[
          ['Pendentes', summary?.pending ?? 0],
          ['Qualificadas', summary?.qualified ?? 0],
          ['Beneficios aplicados', summary?.rewarded ?? 0],
          ['Aguardando beneficio', summary?.awaitingReward ?? 0],
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
              <th>Qualificacao</th>
              <th>Aplicacao</th>
              <th>Acoes</th>
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
                        Aplicar beneficio
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
                <td colSpan={8}>{loading ? 'Carregando...' : 'Nenhuma indicacao encontrada.'}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {confirming ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal">
            <header className="modal-header">
              <h2>Aplicar beneficio</h2>
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
                  <span>Referencia beneficiada</span>
                  <select
                    required
                    value={rewardClientReferenceId}
                    onChange={(event) => setRewardClientReferenceId(event.target.value)}
                  >
                    <option value="">Selecione uma referencia</option>
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
                  Aplicar beneficio
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
  { id: 'references', label: 'Referencias/Servicos' },
  { id: 'renewals', label: 'Renovacoes' },
  { id: 'receivables', label: 'Contas a receber' },
  { id: 'finance', label: 'Financeiro' },
  { id: 'billing', label: 'Cobrancas' },
  { id: 'recovery', label: 'Recuperacao' },
  { id: 'referrals', label: 'Indicacoes' },
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar relatorio.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel exportar CSV.');
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
            placeholder="Buscar cliente, referencia ou descricao"
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
            <option value="">Todas as situacoes</option>
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
              <option value="">Entradas e saidas</option>
              <option value="ENTRADA">Entradas</option>
              <option value="SAIDA">Saidas</option>
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
          <p>{report?.limited ? 'Exibicao limitada para manter performance.' : 'Filtro atual'}</p>
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

function reportSummaryLabel(key: string) {
  const labels: Record<string, string> = {
    amount: 'Valor total',
    entries: 'Entradas',
    expenses: 'Saidas',
    balance: 'Saldo',
    byStatus: 'Status',
    byPlan: 'Planos',
  };

  return labels[key] ?? key;
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar integracoes.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar integracao.');
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
          Integracoes
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
        <span>Nome da integracao</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Chave API</span>
        <input
          autoComplete="off"
          placeholder={credential.configured ? 'Chave salva nao exibida' : 'fdpx_...'}
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
          <dd>{credential.webhookRegisteredAt ? 'Registrado' : 'Nao registrado'}</dd>
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
          Testar conexao
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

function ClientsView({
  clientFormOpen,
  clients,
  dataLoading,
  editingClient,
  onApplyFilters,
  onCreate,
  onEdit,
  onNew,
  onRenew,
  onCreateReference,
  onUpdateReference,
  onReferenceStatusChange,
  onSelect,
  onWhatsAppSent,
  onUpdate,
  planId,
  plans,
  search,
  selectedClient,
  setPlanId,
  setSearch,
  setStatus,
  setStatusReason,
  setStartRecovery,
  status,
  statusReason,
  startRecovery,
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
  onRenew: (client: Client, reference?: ClientReference) => void;
  onCreateReference: (
    client: Client,
    payload: Omit<ClientPayload, 'name' | 'phone' | 'email'>,
  ) => Promise<void>;
  onUpdateReference: (
    reference: ClientReference,
    payload: Partial<Omit<ClientPayload, 'name' | 'phone' | 'email'>>,
  ) => Promise<void>;
  onReferenceStatusChange: (reference: ClientReference, status: ClientStatus) => void;
  onSelect: (client: Client) => void;
  onWhatsAppSent: (clientId: string) => Promise<void>;
  onUpdate: (payload: ClientUpdatePayload) => Promise<void>;
  planId: string;
  plans: Plan[];
  search: string;
  selectedClient: Client | null;
  setPlanId: (value: string) => void;
  setSearch: (value: string) => void;
  setStatus: (value: ClientStatus | '') => void;
  setStatusReason: (value: string) => void;
  setStartRecovery: (value: boolean) => void;
  status: ClientStatus | '';
  statusReason: string;
  startRecovery: boolean;
  renewalNotice: string;
}) {
  const [detailTab, setDetailTab] = useState<
    'timeline' | 'references' | 'renewals' | 'receivables' | 'messages' | 'recovery' | 'referrals'
  >('timeline');
  const [whatsAppClient, setWhatsAppClient] = useState<Client | null>(null);
  const [referenceFormOpen, setReferenceFormOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<ClientReference | null>(null);
  const uniqueSelectedReference =
    selectedClient?.references?.length === 1 ? selectedClient.references[0] : null;

  return (
    <div className="workspace-grid">
      <section className="workspace-main">
        {renewalNotice ? <div className="notice success">{renewalNotice}</div> : null}
        <div className="toolbar">
          <div className="search-row">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Buscar por nome, referencia ou telefone"
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
          <button className="secondary-button" type="button" onClick={onApplyFilters}>
            Aplicar
          </button>
          <button className="primary-button" type="button" onClick={onNew}>
            <Plus aria-hidden="true" size={17} />
            Cliente
          </button>
        </div>

        {clientFormOpen ? (
          <ClientForm
            client={editingClient ?? undefined}
            plans={plans.filter((plan) => plan.active || plan.id === editingClient?.planId)}
            submitLabel={editingClient ? 'Atualizar cliente' : 'Cadastrar cliente'}
            onSubmit={async (payload) => {
              if (editingClient) {
                await onUpdate(payload);
              } else {
                await onCreate(payload as ClientPayload);
              }
            }}
          />
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Referencias</th>
                <th>Resumo operacional</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const references = client.references ?? [];
                const singleReference = references.length === 1 ? references[0] : null;
                const referenceSummary = singleReference
                  ? `${singleReference.reference} | ${singleReference.plan.name}`
                  : `${references.length} referencias`;
                const operationalSummary = singleReference
                  ? `${formatCurrency(singleReference.recurringValue)} | ${formatDate(singleReference.dueDate)}`
                  : references.map((reference) => reference.reference).join(', ') || '-';

                return (
                  <tr
                    className={selectedClient?.id === client.id ? 'selected-row' : ''}
                    key={client.id}
                    onClick={() => onSelect(client)}
                  >
                    <td>
                      <strong>{client.name}</strong>
                      <span>{client.phoneNormalized}</span>
                    </td>
                    <td>{referenceSummary}</td>
                    <td>
                      <span>{operationalSummary}</span>
                      {singleReference ? <StatusBadge status={singleReference.status} /> : null}
                    </td>
                    <td>
                      {singleReference ? (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRenew(client, singleReference);
                          }}
                        >
                          <CalendarClock aria-hidden="true" size={16} />
                          Renovar
                        </button>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(client);
                          }}
                        >
                          Ver referencias
                        </button>
                      )}
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

      <aside className="detail-panel">
        {selectedClient ? (
          <>
            <div className="detail-header">
              <div>
                <h2>{selectedClient.name}</h2>
                <span>{selectedClient.references?.length ?? 0} referencias operacionais</span>
              </div>
              <button
                className="icon-button"
                title="Editar cliente"
                type="button"
                onClick={() => onEdit(selectedClient)}
              >
                <Pencil aria-hidden="true" size={17} />
              </button>
            </div>
            <div className="button-row detail-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => onRenew(selectedClient)}
              >
                <CalendarClock aria-hidden="true" size={16} />
                Renovar
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setWhatsAppClient(selectedClient)}
              >
                <Send aria-hidden="true" size={16} />
                Enviar WhatsApp
              </button>
            </div>
            <dl className="detail-list">
              <div>
                <dt>WhatsApp</dt>
                <dd>{selectedClient.phone}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{selectedClient.email ?? '-'}</dd>
              </div>
              <div>
                <dt>Referencias</dt>
                <dd>{selectedClient.references?.length ?? 0}</dd>
              </div>
              {uniqueSelectedReference ? (
                <>
                  <div>
                    <dt>Plano</dt>
                    <dd>{uniqueSelectedReference.plan.name}</dd>
                  </div>
                  <div>
                    <dt>Recorrencia</dt>
                    <dd>{formatCurrency(uniqueSelectedReference.recurringValue)}</dd>
                  </div>
                  <div>
                    <dt>Cobranca</dt>
                    <dd>{uniqueSelectedReference.billingNoticeDays} dias antes</dd>
                  </div>
                </>
              ) : null}
            </dl>

            <div className="tabs">
              <button
                className={detailTab === 'timeline' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('timeline')}
              >
                Timeline
              </button>
              <button
                className={detailTab === 'references' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('references')}
              >
                Referencias
              </button>
              <button
                className={detailTab === 'renewals' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('renewals')}
              >
                Renovacoes
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
                Cobrancas/PIX
              </button>
              <button
                className={detailTab === 'recovery' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('recovery')}
              >
                Recuperacao
              </button>
              <button
                className={detailTab === 'referrals' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('referrals')}
              >
                Indicacoes
              </button>
            </div>

            {detailTab === 'timeline' ? (
              <ol className="timeline">
                {(selectedClient.events ?? []).map((event) => (
                  <li key={event.id}>
                    <strong>{event.title}</strong>
                    <span>{new Date(event.createdAt).toLocaleString('pt-BR')}</span>
                    {event.description ? <p>{event.description}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}

            {detailTab === 'references' ? (
              <div className="mini-list">
                <div className="button-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      setEditingReference(null);
                      setReferenceFormOpen((open) => !open);
                    }}
                  >
                    <Plus aria-hidden="true" size={16} />
                    Adicionar referencia
                  </button>
                </div>
                {referenceFormOpen ? (
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
                ) : null}
                <div className="status-actions">
                  <textarea
                    placeholder="Justificativa para inativar ou cancelar referencia"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                  />
                  <label className="checkbox-row">
                    <input
                      checked={startRecovery}
                      type="checkbox"
                      onChange={(event) => setStartRecovery(event.target.checked)}
                    />
                    <span>Tentar recuperar esta referencia automaticamente</span>
                  </label>
                  {startRecovery ? (
                    <div className="step-chips">
                      {[3, 10, 15, 30].map((day) => (
                        <span key={day}>{day} dias</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                {(selectedClient.references ?? []).map((reference) => (
                  <article key={reference.id}>
                    <strong>{reference.reference}</strong>
                    <span>{reference.plan.name}</span>
                    <p>
                      {formatCurrency(reference.recurringValue)} | {formatDate(reference.dueDate)} |{' '}
                      {reference.billingNoticeDays} dias antes
                    </p>
                    <StatusBadge status={reference.status} />
                    <div className="button-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onRenew(selectedClient, reference)}
                      >
                        <CalendarClock aria-hidden="true" size={16} />
                        Renovar
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                          setEditingReference(reference);
                          setReferenceFormOpen(true);
                        }}
                      >
                        <Pencil aria-hidden="true" size={16} />
                        Editar
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onReferenceStatusChange(reference, 'ATIVO')}
                      >
                        Ativar
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => onReferenceStatusChange(reference, 'INATIVO')}
                      >
                        Inativar
                      </button>
                      <button
                        className="danger-button"
                        type="button"
                        onClick={() => onReferenceStatusChange(reference, 'CANCELADO')}
                      >
                        Cancelar
                      </button>
                    </div>
                  </article>
                ))}
                {!selectedClient.references?.length ? (
                  <div className="empty-state">Sem referencias cadastradas.</div>
                ) : null}
              </div>
            ) : null}

            {detailTab === 'renewals' ? (
              <div className="mini-list">
                {(selectedClient.renewals ?? []).map((renewal) => (
                  <article key={renewal.id}>
                    <strong>{renewal.planName}</strong>
                    <span>{new Date(renewal.createdAt).toLocaleString('pt-BR')}</span>
                    <p>
                      {formatCurrency(renewal.amount)} | {formatDate(renewal.previousDueDate)} para{' '}
                      {formatDate(renewal.newDueDate)}
                    </p>
                  </article>
                ))}
                {!selectedClient.renewals?.length ? (
                  <div className="empty-state">Sem renovacoes.</div>
                ) : null}
              </div>
            ) : null}

            {detailTab === 'receivables' ? (
              <div className="mini-list">
                {(selectedClient.receivables ?? []).map((receivable) => (
                  <article key={receivable.id}>
                    <strong>{receivable.description}</strong>
                    <span>{formatDate(receivable.dueDate)}</span>
                    <p>
                      {formatCurrency(receivable.amount)} | {receivable.displayStatus}
                    </p>
                    {receivable.paymentIntents?.length ? (
                      <div className="step-list">
                        {receivable.paymentIntents.map((intent) => (
                          <span key={intent.id}>
                            PIX {paymentProviderDisplay(intent.provider)} ·{' '}
                            {paymentIntentStatusLabel(intent.status)}
                            {intent.externalStatus ? ` · ${intent.externalStatus}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
                {!selectedClient.receivables?.length ? (
                  <div className="empty-state">Sem contas a receber.</div>
                ) : null}
              </div>
            ) : null}

            {detailTab === 'messages' ? (
              <div className="mini-list">
                {(selectedClient.messageDispatches ?? []).map((dispatch) => (
                  <article key={dispatch.id}>
                    <strong>{messageOriginLabel(dispatch.origin)}</strong>
                    <span>{formatDateTime(dispatch.createdAt)}</span>
                    <p>
                      {billingStatusLabel(dispatch.status)} | {dispatch.phone} | {dispatch.attempts}{' '}
                      tentativa(s)
                    </p>
                    {dispatch.errorMessage ? <p>{dispatch.errorMessage}</p> : null}
                  </article>
                ))}
                {!selectedClient.messageDispatches?.length ? (
                  <div className="empty-state">Sem mensagens ou cobrancas recentes.</div>
                ) : null}
              </div>
            ) : null}

            {detailTab === 'recovery' ? (
              <div className="mini-list">
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
                  <div className="empty-state">Sem campanha de recuperacao.</div>
                ) : null}
              </div>
            ) : null}

            {detailTab === 'referrals' ? (
              <div className="mini-list">
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
                    <strong>{selectedClient.referralsMade.total} indicacao(oes) feitas</strong>
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
                {!selectedClient.referralReceived && !selectedClient.referralsMade?.items.length ? (
                  <div className="empty-state">Sem indicacoes vinculadas.</div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state">Selecione um cliente para visualizar detalhes.</div>
        )}
      </aside>
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
          setError(err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.');
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

      setError(dispatch.errorMessage ?? 'Nao foi possivel enviar a mensagem.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel enviar a mensagem.');
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
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
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
          <div className="notice warning">A conexao WhatsApp nao esta operacional.</div>
        ) : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={!canSend}
              type="button"
              onClick={() => void handleSend()}
            >
              {sending ? 'Enviando...' : 'Enviar mensagem'}
            </button>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar cobrancas.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel abrir a cobranca.');
    }
  }

  async function runReconcile() {
    setWorking('reconcile');
    setError('');

    try {
      await reconcileBilling();
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel reconciliar cobrancas.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel processar a cobranca.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar o template.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel alterar o template.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel gerar preview.');
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
                placeholder="Buscar por cliente, referencia ou telefone"
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
                  <th>Telefone</th>
                  <th>Vencimento</th>
                  <th>Agendada para</th>
                  <th>Tentativas</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((dispatch) => (
                  <tr
                    className={selected?.id === dispatch.id ? 'selected-row' : ''}
                    key={dispatch.id}
                    onClick={() => void selectDispatch(dispatch)}
                  >
                    <td>{dispatch.client?.name ?? 'Cliente nao vinculado'}</td>
                    <td>{dispatch.phone}</td>
                    <td>
                      {dispatch.receivable?.dueDate ? formatDate(dispatch.receivable.dueDate) : '-'}
                    </td>
                    <td>{dispatch.scheduledFor ? formatDateTime(dispatch.scheduledFor) : '-'}</td>
                    <td>{dispatch.attempts ?? 0}/3</td>
                    <td>
                      <span className={`pill ${dispatch.status.toLowerCase()}`}>
                        {billingStatusLabel(dispatch.status)}
                      </span>
                    </td>
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
                {loading ? 'Carregando...' : 'Nenhuma cobranca encontrada.'}
              </div>
            ) : null}
          </div>

          <section className="panel template-panel">
            <PanelHeader title="Templates" />
            <div className="mini-list">
              {templates.map((template) => (
                <article key={template.id}>
                  <strong>{template.name}</strong>
                  <span>
                    {template.type} | {template.active ? 'Ativo' : 'Inativo'}
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
              {!templates.length ? (
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
                  <h2>{selected.client?.name ?? 'Cobranca'}</h2>
                  <span>{selected.idempotencyKey ?? selected.requestId}</span>
                </div>
                <span className={`pill ${selected.status.toLowerCase()}`}>
                  {billingStatusLabel(selected.status)}
                </span>
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Referencia</dt>
                  <dd>{selected.client?.reference ?? '-'}</dd>
                </div>
                <div>
                  <dt>Plano</dt>
                  <dd>{selected.client?.planName ?? '-'}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>
                    {selected.receivable?.amount ? formatCurrency(selected.receivable.amount) : '-'}
                  </dd>
                </div>
                <div>
                  <dt>Proxima tentativa</dt>
                  <dd>{selected.nextAttemptAt ? formatDateTime(selected.nextAttemptAt) : '-'}</dd>
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
              {selected.errorMessage ? (
                <div className="notice warning">
                  {selected.errorCode ? `${selected.errorCode}: ` : ''}
                  {selected.errorMessage}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state">Selecione uma cobranca para visualizar detalhes.</div>
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

function AutomationsView() {
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingSettings, setBillingSettings] = useState<BillingAutomationSettings | null>(null);
  const [sendTime, setSendTime] = useState('09:00');
  const [recoverySummary, setRecoverySummary] = useState<RecoverySummary | null>(null);
  const [campaigns, setCampaigns] = useState<RecoveryCampaign[]>([]);
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
      const [nextBilling, nextBillingSettings, nextRecovery, nextCampaigns] = await Promise.all([
        getBillingSummary(),
        getBillingAutomationSettings(),
        getRecoverySummary(),
        listRecoveryCampaigns({
          ...(status ? { status } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          page,
          pageSize: 20,
        }),
      ]);
      setBillingSummary(nextBilling);
      setBillingSettings(nextBillingSettings);
      setSendTime(nextBillingSettings.sendTime);
      setRecoverySummary(nextRecovery);
      setCampaigns(nextCampaigns.items);
      setCampaignPagination(nextCampaigns.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar automacoes.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel reconciliar recuperacao.');
    } finally {
      setWorking('');
    }
  }

  async function saveBillingSettings(
    payload: Partial<Pick<BillingAutomationSettings, 'enabled' | 'sendTime'>>,
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
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar cobranca automatica.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel reconciliar ciclos.');
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
          `Referencia: ${preview.preview.reference}`,
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel gerar conta a receber.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel cancelar campanha.');
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
            <span className="metric-label">Cobranca automatica</span>
            <strong className="metric-value">
              {billingSettings?.enabled ? 'ATIVA' : 'DESATIVADA'}
            </strong>
            <p>{billingSummary?.scheduledToday ?? 0} agendadas hoje</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Recuperacao de clientes</span>
            <strong className="metric-value">ATIVA</strong>
            <p>{recoverySummary?.active ?? 0} campanhas ativas</p>
          </article>
          <article className="metric-card compact">
            <span className="metric-label">Recuperacao concluida</span>
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
              <span>Ativar cobranca automatica</span>
            </label>
          </div>
          <div className="form-grid automation-settings-grid">
            <label className="field">
              <span>Horario de envio</span>
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
              <span>Timezone</span>
              <input disabled value="America/Sao_Paulo" readOnly />
            </label>
          </div>
          <p className="helper-text">
            As cobrancas serao processadas diariamente a partir das{' '}
            {billingSettings?.sendTime ?? '09:00'}.
          </p>
          <p className="helper-text">
            A data de envio de cada cliente e definida pelo vencimento da referencia e pelos dias de
            antecedencia configurados nela.
          </p>
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
            <p>{billingSummary?.sent ?? 0} historico</p>
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
                <th>Referencia</th>
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
                  <td>{dispatch.clientReference?.reference ?? '-'}</td>
                  <td>
                    {dispatch.receivable?.dueDate ? formatDate(dispatch.receivable.dueDate) : '-'}
                  </td>
                  <td>{dispatch.idempotencyKey?.split(':').at(4) ?? '-'} dias</td>
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
                  <th>Referencia</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Motivo</th>
                  <th>Acoes</th>
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
                {loading ? 'Carregando...' : 'Nenhuma pendencia de ciclo financeiro.'}
              </div>
            ) : null}
          </div>
        </section>

        <div className="toolbar">
          <div className="search-row">
            <Search aria-hidden="true" size={18} />
            <input
              placeholder="Buscar cliente ou referencia"
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
                <th>Status</th>
                <th>Etapa atual/proxima</th>
                <th>Proxima data</th>
                <th>Inicio</th>
                <th>Acoes</th>
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
        <PanelHeader title="Configuracao" />
        <dl className="detail-list">
          <div>
            <dt>Recuperacao</dt>
            <dd>RECOVERY_SEND_HOUR=9</dd>
          </div>
          <div>
            <dt>Etapas</dt>
            <dd>3, 10, 15 e 30 dias</dd>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar WhatsApp.');
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
        setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar WhatsApp.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel concluir a operacao.');
      return false;
    } finally {
      setWorkingState('');
    }
  }

  async function handleDisconnect() {
    if (!canStartWhatsAppAction(workingRef.current)) return;

    const confirmed = window.confirm(
      'Deseja desconectar temporariamente este WhatsApp? A configuracao sera preservada.',
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar webhook.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel conectar WhatsApp.');
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
                  <dt>Ultima verificacao</dt>
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
                  <strong>{message.client?.name ?? 'Cliente nao vinculado'}</strong>
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
            {/* QR Code vem como Data URI temporario da Kirago; next/image nao otimiza esse caso. */}
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
                <dd>{connection?.webhookConfigured ? 'Configurado' : 'Nao configurado'}</dd>
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
                <dt>Ultima verificacao</dt>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar a lista.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel abrir o contato.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel ignorar o contato.');
    }
  }

  async function handleReopen(contact: WhatsAppPendingContact) {
    setError('');

    try {
      const updated = await reopenWhatsAppPendingContact(contact.id);
      setSelected(updated);
      await loadWaitlist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel reabrir o contato.');
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
                  <th>Acoes</th>
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
                  <div className="empty-state">Abra um contato para ver o historico minimo.</div>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel aprovar o contato.');
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
              <span>Referencia</span>
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
              <span>Avisar cobranca</span>
              <input
                min="0"
                type="number"
                value={billingNoticeDays}
                onChange={(event) => setBillingNoticeDays(event.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span>Observacoes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <label className="field">
            <span>Indicado por</span>
            <ClientReferralSelect value={referrerClientId} onChange={setReferrerClientId} />
          </label>
          <section className="inline-panel">
            <div>
              <strong>Cobranca inicial</strong>
              <p>
                O cliente sera criado como pendente de pagamento. A ativacao acontece somente depois
                do primeiro pagamento.
              </p>
            </div>
            <label className="checkbox-row">
              <input
                checked={generateInitialReceivable}
                type="checkbox"
                onChange={(event) => setGenerateInitialReceivable(event.target.checked)}
              />
              Gerar cobranca inicial
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
                  ? `, com cobranca inicial de ${formatCurrency(Number(recurringValue || 0))} para ${dueDate || 'data selecionada'}`
                  : ', sem cobranca inicial gerada agora'}
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
    location: '[Localizacao]',
    live_location: '[Localizacao ao vivo]',
    contact: '[Contato]',
    contacts: '[Contatos]',
    reaction: '[Reacao]',
    button_response: '[Resposta de botao]',
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
    INITIAL_ACTIVATION: 'Ativacao inicial',
    BILLING: 'Cobranca',
    RECOVERY: 'Recuperacao',
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar a referencia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="form-grid">
        <label className="field">
          <span>Referencia</span>
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
          <span>Antecedencia da cobranca</span>
          <input
            min="0"
            type="number"
            value={billingNoticeDays}
            onChange={(event) => setBillingNoticeDays(event.target.value)}
          />
          <small>Define quantos dias antes do vencimento a cobranca automatica sera enviada.</small>
        </label>
        <label className="field">
          <span>Observacoes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <span className="error-message">{error}</span>
        <div className="button-row">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-button" disabled={saving} type="submit">
            {saving ? 'Salvando...' : reference ? 'Atualizar referencia' : 'Criar referencia'}
          </button>
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
          setError(err instanceof Error ? err.message : 'Nao foi possivel calcular a renovacao.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel confirmar a renovacao.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" aria-labelledby="renewal-title">
        <header className="modal-header">
          <h2 id="renewal-title">Renovar referencia</h2>
          <button className="icon-button" type="button" onClick={onClose}>
            <X aria-hidden="true" size={17} />
          </button>
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Referencia</dt>
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
            Esta referencia esta CANCELADA. Ao confirmar a renovacao, ela sera reativada e voltara
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
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={saving || !preview}
              type="button"
              onClick={() => void handleConfirm()}
            >
              {saving ? 'Confirmando...' : 'Confirmar renovacao'}
            </button>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar financeiro.');
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
    setNotice(message);
    await loadFinance();
  }

  const entryCategories = categories.filter((category) => category.type === 'ENTRADA');
  const expenseCategories = categories.filter((category) => category.type === 'SAIDA');

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
          Saidas
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
              ['Saidas', summary.expenses],
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
                placeholder="Buscar cliente, referencia ou descricao"
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
              <option value="">Todas as situacoes</option>
              <option value="PENDENTE">Pendente</option>
              <option value="VENCIDO">Vencido</option>
              <option value="PAGO">Pago</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
            <button className="secondary-button" type="button" onClick={() => void loadFinance()}>
              Aplicar
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Referencia</th>
                  <th>Descricao</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Situacao</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {receivables.map((receivable) => (
                  <tr key={receivable.id}>
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

      {pixReceivable ? (
        <PixReceivableModal
          receivable={pixReceivable}
          onClose={() => setPixReceivable(null)}
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
          <span>Descricao</span>
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
          <span>Observacao</span>
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
              {editing ? 'Atualizar' : kind === 'ENTRADA' ? 'Nova entrada' : 'Nova saida'}
            </button>
          </div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descricao</th>
              <th>Categoria</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Origem</th>
              <th>Acoes</th>
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
        {!items.length ? <div className="empty-state">Nenhuma movimentacao encontrada.</div> : null}
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
              <th>Acoes</th>
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel carregar o PIX.');
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
      setError(err instanceof Error ? err.message : 'Nao foi possivel atualizar o PIX.');
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
            <dt>Descricao</dt>
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
          <span>{canCreateNew ? '' : 'Ja existe um PIX ativo para esta conta.'}</span>
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
            <dt>Descricao</dt>
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
            <span>Observacao</span>
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
              <th>Duracao</th>
              <th>Valor padrao</th>
              <th>Status</th>
              <th>Acoes</th>
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
