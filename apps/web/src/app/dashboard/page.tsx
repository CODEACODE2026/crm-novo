'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarClock,
  CreditCard,
  DollarSign,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Settings,
  ToggleLeft,
  Users,
  X,
} from 'lucide-react';
import type { AuthenticatedUser } from '@crm-novo/shared';
import { buildApiUrl } from '../../lib/api';
import { ClientForm } from '../../components/clients/client-form';
import { StatusBadge } from '../../components/clients/status-badge';
import { PlanForm } from '../../components/plans/plan-form';
import {
  cancelReceivable,
  confirmRenewal,
  createClient,
  createFinancialCategory,
  createManualEntry,
  createManualExpense,
  createPlan,
  deletePlan,
  deleteFinancialCategory,
  deleteFinancialTransaction,
  formatCurrency,
  formatDate,
  getClient,
  getFinancialSummary,
  listFinancialCategories,
  listClients,
  listFinancialTransactions,
  listPlans,
  listReceivables,
  payReceivable,
  previewRenewal,
  updateClient,
  updateFinancialCategory,
  updateFinancialTransaction,
  updateClientStatus,
  updatePlan,
  type Client,
  type ClientStatus,
  type FinancialCategory,
  type FinancialSummary,
  type FinancialTransaction,
  type FinancialTransactionPayload,
  type FinancialTransactionType,
  type PaginatedClients,
  type Receivable,
  type ReceivableDisplayStatus,
  type Plan,
  type RenewalPreview,
} from '../../lib/crm-api';

type View = 'dashboard' | 'clients' | 'finance' | 'plans';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'finance', label: 'Financeiro', icon: CreditCard },
  { id: 'plans', label: 'Planos', icon: ToggleLeft },
] satisfies Array<{ id: View; label: string; icon: typeof LayoutDashboard }>;

const futureNavItems = [
  { label: 'Renovacoes', icon: RefreshCcw },
  { label: 'Cobrancas', icon: Bell },
  { label: 'WhatsApp', icon: MessageCircle },
  { label: 'Relatorios', icon: BarChart3 },
  { label: 'Configuracoes', icon: Settings },
];

export default function DashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [view, setView] = useState<View>('clients');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [clientsPayload, setClientsPayload] = useState<PaginatedClients | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [renewalClient, setRenewalClient] = useState<Client | null>(null);
  const [renewalNotice, setRenewalNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ClientStatus | ''>('');
  const [planId, setPlanId] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [error, setError] = useState('');
  const [dataLoading, setDataLoading] = useState(false);

  const clients = clientsPayload?.items ?? [];

  const metrics = useMemo(() => {
    const active = clients.filter((client) => client.status === 'ATIVO').length;
    const inactive = clients.filter((client) => client.status === 'INATIVO').length;
    const cancelled = clients.filter((client) => client.status === 'CANCELADO').length;

    return [
      { label: 'Clientes filtrados', value: String(clientsPayload?.pagination.total ?? 0) },
      { label: 'Ativos nesta lista', value: String(active) },
      { label: 'Inativos nesta lista', value: String(inactive) },
      { label: 'Cancelados nesta lista', value: String(cancelled) },
    ];
  }, [clients, clientsPayload?.pagination.total]);

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

  async function handleStatusChange(nextStatus: ClientStatus) {
    if (!selectedClient) return;

    await updateClientStatus(selectedClient.id, nextStatus, statusReason.trim() || undefined);
    setStatusReason('');
    await loadData();
  }

  async function handleRenewalConfirm(
    client: Client,
    payload: { planId: string; amount: number; idempotencyKey: string },
  ) {
    const result = await confirmRenewal(client.id, payload);
    await loadData();
    const detailed = await getClient(client.id);
    setSelectedClient(detailed);
    setRenewalClient(null);
    setRenewalNotice(
      `Cliente renovado com sucesso. Novo vencimento: ${formatDate(result.newDueDate)}. Conta a receber criada: ${formatCurrency(result.receivable.amount)}.`,
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
                  : 'Clientes'}
          </h1>
          <span className="topbar-user">{user?.name}</span>
        </header>

        <section className="content">
          {error ? <div className="notice danger">{error}</div> : null}
          {view === 'dashboard' ? (
            <DashboardSummary dataLoading={dataLoading} metrics={metrics} />
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
              onRenew={setRenewalClient}
              onSelect={setSelectedClient}
              onStatusChange={(nextStatus) => void handleStatusChange(nextStatus)}
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
              status={status}
              statusReason={statusReason}
              renewalNotice={renewalNotice}
            />
          ) : null}
          {view === 'finance' ? <FinanceView clients={clients} /> : null}
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
        </section>
        {renewalClient ? (
          <RenewalModal
            client={renewalClient}
            plans={plans.filter((plan) => plan.active || plan.id === renewalClient.planId)}
            onClose={() => setRenewalClient(null)}
            onConfirm={async (payload) => handleRenewalConfirm(renewalClient, payload)}
          />
        ) : null}
      </main>
    </div>
  );
}

function DashboardSummary({
  dataLoading,
  metrics,
}: {
  dataLoading: boolean;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">{dataLoading ? '-' : metric.value}</strong>
          </article>
        ))}
      </div>
      <section className="panel">
        <h2>Modulo homologavel da Sprint 2</h2>
        <p>Clientes, planos, filtros, status com justificativa e timeline operacional.</p>
      </section>
    </>
  );
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
  onSelect,
  onStatusChange,
  onUpdate,
  planId,
  plans,
  search,
  selectedClient,
  setPlanId,
  setSearch,
  setStatus,
  setStatusReason,
  status,
  statusReason,
  renewalNotice,
}: {
  clientFormOpen: boolean;
  clients: Client[];
  dataLoading: boolean;
  editingClient: Client | null;
  onApplyFilters: () => void;
  onCreate: Parameters<typeof ClientForm>[0]['onSubmit'];
  onEdit: (client: Client) => void;
  onNew: () => void;
  onRenew: (client: Client) => void;
  onSelect: (client: Client) => void;
  onStatusChange: (status: ClientStatus) => void;
  onUpdate: Parameters<typeof ClientForm>[0]['onSubmit'];
  planId: string;
  plans: Plan[];
  search: string;
  selectedClient: Client | null;
  setPlanId: (value: string) => void;
  setSearch: (value: string) => void;
  setStatus: (value: ClientStatus | '') => void;
  setStatusReason: (value: string) => void;
  status: ClientStatus | '';
  statusReason: string;
  renewalNotice: string;
}) {
  const [detailTab, setDetailTab] = useState<'timeline' | 'renewals' | 'receivables'>('timeline');

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
            onSubmit={editingClient ? onUpdate : onCreate}
          />
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Referencia</th>
                <th>Plano</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  className={selectedClient?.id === client.id ? 'selected-row' : ''}
                  key={client.id}
                  onClick={() => onSelect(client)}
                >
                  <td>
                    <strong>{client.name}</strong>
                    <span>{client.phoneNormalized}</span>
                  </td>
                  <td>{client.reference}</td>
                  <td>{client.plan.name}</td>
                  <td>{formatDate(client.dueDate)}</td>
                  <td>
                    <StatusBadge status={client.status} />
                  </td>
                  <td>{formatCurrency(client.recurringValue)}</td>
                  <td>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRenew(client);
                      }}
                    >
                      <CalendarClock aria-hidden="true" size={16} />
                      Renovar
                    </button>
                  </td>
                </tr>
              ))}
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
                <span>{selectedClient.reference}</span>
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
                <dt>Plano</dt>
                <dd>{selectedClient.plan.name}</dd>
              </div>
              <div>
                <dt>Recorrencia</dt>
                <dd>{formatCurrency(selectedClient.recurringValue)}</dd>
              </div>
              <div>
                <dt>Cobranca</dt>
                <dd>{selectedClient.billingNoticeDays} dias antes</dd>
              </div>
            </dl>

            <div className="status-actions">
              <textarea
                placeholder="Justificativa para inativar ou cancelar"
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onStatusChange('ATIVO')}
                >
                  Ativar
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onStatusChange('INATIVO')}
                >
                  Inativar
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => onStatusChange('CANCELADO')}
                >
                  Cancelar
                </button>
              </div>
            </div>

            <div className="tabs">
              <button
                className={detailTab === 'timeline' ? 'active' : ''}
                type="button"
                onClick={() => setDetailTab('timeline')}
              >
                Timeline
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
                  </article>
                ))}
                {!selectedClient.receivables?.length ? (
                  <div className="empty-state">Sem contas a receber.</div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="empty-state">Selecione um cliente para visualizar detalhes.</div>
        )}
      </aside>
    </div>
  );
}

function RenewalModal({
  client,
  plans,
  onClose,
  onConfirm,
}: {
  client: Client;
  plans: Plan[];
  onClose: () => void;
  onConfirm: (payload: { planId: string; amount: number; idempotencyKey: string }) => Promise<void>;
}) {
  const [planId, setPlanId] = useState(client.planId);
  const [amount, setAmount] = useState(client.recurringValue);
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
        const nextPreview = await previewRenewal(client.id, { planId, amount: parsedAmount });
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
  }, [amount, client.id, planId]);

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
          <h2 id="renewal-title">Renovar cliente</h2>
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
            <dt>Status</dt>
            <dd>{client.status}</dd>
          </div>
          <div>
            <dt>Plano atual</dt>
            <dd>{client.plan.name}</dd>
          </div>
          <div>
            <dt>Vencimento atual</dt>
            <dd>{formatDate(client.dueDate)}</dd>
          </div>
          <div>
            <dt>Valor atual</dt>
            <dd>{formatCurrency(client.recurringValue)}</dd>
          </div>
        </dl>

        {client.status === 'CANCELADO' ? (
          <div className="notice warning">
            Este cliente está CANCELADO. Ao confirmar a renovação, ele será reativado e voltará para
            o status ATIVO.
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

function FinanceView({ clients }: { clients: Client[] }) {
  const [tab, setTab] = useState<'summary' | 'receivables' | 'entries' | 'expenses' | 'categories'>(
    'summary',
  );
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
