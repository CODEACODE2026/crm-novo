'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Clock3,
  CreditCard,
  HandCoins,
  Info,
  Layers3,
  Minus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  TrendingUp,
  UserPlus,
  UserRoundCheck,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getReportsIntelligenceClients,
  getReportsIntelligenceFinance,
  getReportsIntelligenceOverview,
  getReportsIntelligenceRenewals,
  type ReportsIntelligenceClients,
  type ReportsIntelligenceFinance,
  type ReportsIntelligenceMetric,
  type ReportsIntelligenceOverview,
  type ReportsIntelligenceRenewals,
  type ReportsIntelligencePreset,
} from '../../lib/crm-api';
import {
  buildReportsIntelligencePath,
  isValidCustomReportsPeriod,
  parseReportsIntelligenceLocation,
  type ReportsIntelligenceLocation,
  type ReportsIntelligenceSection,
} from './reports-intelligence-url';

const presetOptions = [
  { id: 'today', label: 'Hoje' },
  { id: 'last_7_days', label: 'Últimos 7 dias' },
  { id: 'this_month', label: 'Este mês' },
  { id: 'previous_month', label: 'Mês anterior' },
  { id: 'last_3_months', label: 'Últimos 3 meses' },
  { id: 'last_6_months', label: 'Últimos 6 meses' },
  { id: 'last_12_months', label: 'Últimos 12 meses' },
  { id: 'this_year', label: 'Este ano' },
  { id: 'previous_year', label: 'Ano anterior' },
  { id: 'custom', label: 'Personalizado' },
] as const satisfies ReadonlyArray<{ id: ReportsIntelligencePreset; label: string }>;

const sectionOptions = [
  { id: 'overview', label: 'Visão geral', description: 'Indicadores executivos' },
  { id: 'finance', label: 'Financeiro', description: 'Receita e recebíveis' },
  { id: 'clients', label: 'Clientes', description: 'Aquisição e carteira' },
  { id: 'renewals', label: 'Renovações', description: 'Recorrência e ciclos pagos' },
] as const satisfies ReadonlyArray<{
  id: ReportsIntelligenceSection;
  label: string;
  description: string;
}>;

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});
const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  maximumFractionDigits: 1,
  notation: 'compact',
  style: 'currency',
});
const integerFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

type KpiDefinition = {
  description: string;
  icon: LucideIcon;
  id: keyof ReportsIntelligenceOverview['kpis'];
  kind: 'count' | 'money';
  label: string;
  stock?: boolean;
  tone: 'amber' | 'blue' | 'danger' | 'neutral' | 'teal' | 'violet';
};

type KpiCardDefinition = Omit<KpiDefinition, 'id'>;

type FinanceKpiDefinition = KpiCardDefinition & {
  id: keyof ReportsIntelligenceFinance['kpis'];
};

type ClientsMetricKey = Exclude<
  keyof ReportsIntelligenceClients['kpis'],
  'monthlyAverageNewClients'
>;
type ClientsKpiDefinition = KpiCardDefinition & { id: ClientsMetricKey };
type RenewalsKpiDefinition = KpiCardDefinition & {
  id: keyof ReportsIntelligenceRenewals['kpis'];
};

const kpiDefinitions: KpiDefinition[] = [
  {
    id: 'received',
    label: 'Total efetivamente recebido',
    description: 'Liquidações operacionais e histórico importado.',
    icon: CircleDollarSign,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'newClients',
    label: 'Novos clientes',
    description: 'Cadastros criados no período selecionado.',
    icon: UserPlus,
    kind: 'count',
    tone: 'blue',
  },
  {
    id: 'paidRenewals',
    label: 'Renovações pagas',
    description: 'Renovações com recebível efetivamente liquidado.',
    icon: RefreshCw,
    kind: 'count',
    tone: 'violet',
  },
  {
    id: 'averageTicket',
    label: 'Ticket médio operacional',
    description: 'Recebido operacional por recebível liquidado.',
    icon: CreditCard,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'activeClients',
    label: 'Clientes ativos',
    description: 'Clientes distintos com ao menos uma referência ativa.',
    icon: Users,
    kind: 'count',
    stock: true,
    tone: 'blue',
  },
  {
    id: 'pendingReceivables',
    label: 'Valores pendentes',
    description: 'Contas ainda abertas e não vencidas no fechamento.',
    icon: Clock3,
    kind: 'money',
    stock: true,
    tone: 'amber',
  },
  {
    id: 'overdueReceivables',
    label: 'Valores vencidos',
    description: 'Contas abertas com vencimento anterior ao fechamento.',
    icon: XCircle,
    kind: 'money',
    stock: true,
    tone: 'danger',
  },
  {
    id: 'paidActivations',
    label: 'Novas ativações pagas',
    description: 'Ativações iniciais com pagamento confirmado.',
    icon: Activity,
    kind: 'count',
    tone: 'teal',
  },
  {
    id: 'paidReactivations',
    label: 'Reativações pagas',
    description: 'Reativações concluídas e financeiramente liquidadas.',
    icon: UserRoundCheck,
    kind: 'count',
    tone: 'violet',
  },
  {
    id: 'canceledReferences',
    label: 'Referências canceladas',
    description: 'Serviços cancelados no período selecionado.',
    icon: XCircle,
    kind: 'count',
    tone: 'neutral',
  },
];

const financeKpiDefinitions: FinanceKpiDefinition[] = [
  {
    id: 'received',
    label: 'Total efetivamente recebido',
    description: 'Receita operacional e histórico importado no período.',
    icon: CircleDollarSign,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'operational',
    label: 'Receita operacional',
    description: 'Recebíveis operacionais efetivamente liquidados.',
    icon: HandCoins,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'legacy',
    label: 'Histórico importado',
    description: 'Entradas legadas identificadas separadamente.',
    icon: Layers3,
    kind: 'money',
    tone: 'violet',
  },
  {
    id: 'manual',
    label: 'Entradas manuais',
    description: 'Lançamentos manuais fora da receita recebida.',
    icon: ReceiptText,
    kind: 'money',
    tone: 'blue',
  },
  {
    id: 'payments',
    label: 'Pagamentos recebidos',
    description: 'Liquidações elegíveis registradas no razão.',
    icon: CreditCard,
    kind: 'count',
    tone: 'teal',
  },
  {
    id: 'averageTicket',
    label: 'Ticket médio operacional',
    description: 'Receita operacional por recebível liquidado.',
    icon: TrendingUp,
    kind: 'money',
    tone: 'violet',
  },
  {
    id: 'pending',
    label: 'Valores pendentes',
    description: 'Estoque ainda aberto e não vencido no fechamento.',
    icon: Clock3,
    kind: 'money',
    stock: true,
    tone: 'amber',
  },
  {
    id: 'overdue',
    label: 'Valores vencidos',
    description: 'Estoque aberto e vencido no fechamento.',
    icon: XCircle,
    kind: 'money',
    stock: true,
    tone: 'danger',
  },
];

const clientsKpiDefinitions: ClientsKpiDefinition[] = [
  {
    id: 'newClients',
    label: 'Novos clientes',
    description: 'Cadastros criados no período.',
    icon: UserPlus,
    kind: 'count',
    tone: 'teal',
  },
  {
    id: 'activeClients',
    label: 'Clientes ativos',
    description: 'Clientes distintos com referência ativa.',
    icon: Users,
    kind: 'count',
    stock: true,
    tone: 'blue',
  },
  {
    id: 'clientsWithoutActiveReference',
    label: 'Sem referência ativa',
    description: 'Clientes sem qualquer serviço ativo no fechamento.',
    icon: UserRoundCheck,
    kind: 'count',
    stock: true,
    tone: 'neutral',
  },
  {
    id: 'activeReferences',
    label: 'Referências ativas',
    description: 'Serviços ativos, sem deduplicar por cliente.',
    icon: Activity,
    kind: 'count',
    stock: true,
    tone: 'teal',
  },
  {
    id: 'newReferences',
    label: 'Novas referências',
    description: 'Serviços criados no período, inclusive para clientes existentes.',
    icon: Layers3,
    kind: 'count',
    tone: 'blue',
  },
  {
    id: 'canceledReferences',
    label: 'Referências canceladas',
    description: 'Serviços cancelados no período.',
    icon: XCircle,
    kind: 'count',
    tone: 'danger',
  },
  {
    id: 'clientsAffectedByCancellation',
    label: 'Clientes com cancelamento',
    description: 'Clientes distintos afetados; não implica perda total.',
    icon: XCircle,
    kind: 'count',
    tone: 'amber',
  },
  {
    id: 'activePortfolioVariation',
    label: 'Variação da carteira ativa',
    description: 'Referências ativas no fechamento versus período anterior.',
    icon: TrendingUp,
    kind: 'count',
    stock: true,
    tone: 'violet',
  },
];

const renewalsKpiDefinitions: RenewalsKpiDefinition[] = [
  {
    id: 'paidRenewals',
    label: 'Renovações pagas',
    description: 'Recebíveis RENEWAL liquidados no período.',
    icon: RefreshCw,
    kind: 'count',
    tone: 'violet',
  },
  {
    id: 'renewalRevenue',
    label: 'Receita de renovações',
    description: 'Entradas operacionais vinculadas a renovações.',
    icon: CircleDollarSign,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'renewalAverageTicket',
    label: 'Ticket médio de renovação',
    description: 'Receita de renovação por recebível liquidado.',
    icon: CreditCard,
    kind: 'money',
    tone: 'blue',
  },
  {
    id: 'paidActivations',
    label: 'Ativações pagas',
    description: 'Ativações iniciais efetivamente liquidadas.',
    icon: UserRoundCheck,
    kind: 'count',
    tone: 'blue',
  },
  {
    id: 'activationRevenue',
    label: 'Receita de ativações',
    description: 'Entradas operacionais de ativações iniciais.',
    icon: HandCoins,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'paidReactivations',
    label: 'Reativações pagas',
    description: 'Recebível pago e reativação relacionada PAID.',
    icon: Activity,
    kind: 'count',
    tone: 'violet',
  },
  {
    id: 'reactivationRevenue',
    label: 'Receita de reativações',
    description: 'Entradas operacionais de reativações válidas.',
    icon: ReceiptText,
    kind: 'money',
    tone: 'teal',
  },
  {
    id: 'renewalReversals',
    label: 'Reversões de renovação',
    description: 'Eventos operacionais separados da receita.',
    icon: RotateCcw,
    kind: 'count',
    tone: 'danger',
  },
];

function initialLocation(): ReportsIntelligenceLocation {
  if (typeof window === 'undefined') {
    return { section: 'overview', preset: 'this_month' };
  }
  return parseReportsIntelligenceLocation(window.location.search);
}

export function ReportsIntelligenceOverviewView() {
  const [location, setLocation] = useState<ReportsIntelligenceLocation>(initialLocation);
  const [customStart, setCustomStart] = useState(location.startDate ?? '');
  const [customEnd, setCustomEnd] = useState(location.endDate ?? '');
  const [overview, setOverview] = useState<ReportsIntelligenceOverview | null>(null);
  const [finance, setFinance] = useState<ReportsIntelligenceFinance | null>(null);
  const [clients, setClients] = useState<ReportsIntelligenceClients | null>(null);
  const [renewals, setRenewals] = useState<ReportsIntelligenceRenewals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customError, setCustomError] = useState('');
  const [reloadSequence, setReloadSequence] = useState(0);
  const requestSequence = useRef(0);
  const sectionNavRef = useRef<HTMLElement>(null);
  const presetListRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const loadReport = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError('');

      try {
        const filters = {
          preset: location.preset,
          ...(location.preset === 'custom'
            ? { startDate: location.startDate, endDate: location.endDate }
            : {}),
        };
        if (location.section === 'finance') {
          const payload = await getReportsIntelligenceFinance(filters, signal);
          if (requestSequence.current === requestId) setFinance(payload);
        } else if (location.section === 'clients') {
          const payload = await getReportsIntelligenceClients(filters, signal);
          if (requestSequence.current === requestId) setClients(payload);
        } else if (location.section === 'renewals') {
          const payload = await getReportsIntelligenceRenewals(filters, signal);
          if (requestSequence.current === requestId) setRenewals(payload);
        } else {
          const payload = await getReportsIntelligenceOverview(filters, signal);
          if (requestSequence.current === requestId) setOverview(payload);
        }
      } catch (cause) {
        if (signal?.aborted || requestSequence.current !== requestId) return;
        setOverview(null);
        setFinance(null);
        setClients(null);
        setRenewals(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar a inteligência de Relatórios.',
        );
      } finally {
        if (requestSequence.current === requestId) setLoading(false);
      }
    },
    [location.endDate, location.preset, location.section, location.startDate],
  );

  useEffect(() => {
    if (
      (location.section !== 'overview' &&
        location.section !== 'finance' &&
        location.section !== 'clients' &&
        location.section !== 'renewals') ||
      (location.preset === 'custom' &&
        !isValidCustomReportsPeriod(location.startDate, location.endDate))
    ) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    void loadReport(controller.signal);
    return () => controller.abort();
  }, [
    loadReport,
    location.endDate,
    location.preset,
    location.section,
    location.startDate,
    reloadSequence,
  ]);

  useEffect(() => {
    function restoreFromHistory() {
      const restored = parseReportsIntelligenceLocation(window.location.search);
      setLocation(restored);
      setCustomStart(restored.startDate ?? '');
      setCustomEnd(restored.endDate ?? '');
      setCustomError('');
    }

    window.addEventListener('popstate', restoreFromHistory);
    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, []);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 680px)').matches) return;
    revealActiveControl(sectionNavRef.current, '[aria-current="page"]', reducedMotion);
    revealActiveControl(presetListRef.current, '[aria-pressed="true"]', reducedMotion);
  }, [location.preset, location.section, reducedMotion]);

  function navigate(next: ReportsIntelligenceLocation, mode: 'push' | 'replace' = 'push') {
    const path = buildReportsIntelligencePath(next);
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](window.history.state, '', path);
    setLocation(next);
  }

  function selectPreset(preset: ReportsIntelligencePreset) {
    setCustomError('');
    if (preset === 'custom') {
      setError('');
      setOverview(null);
      setFinance(null);
      setClients(null);
      setRenewals(null);
      setLocation((current) => ({ ...current, preset }));
      return;
    }
    navigate({ section: location.section, preset });
  }

  function applyCustomPeriod() {
    if (!isValidCustomReportsPeriod(customStart, customEnd)) {
      setCustomError('Informe um período válido, com início anterior ou igual ao fim.');
      return;
    }
    setCustomError('');
    navigate({
      section: location.section,
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd,
    });
  }

  function selectSection(section: ReportsIntelligenceSection) {
    navigate({ ...location, section });
  }

  const reportMeta =
    location.section === 'finance'
      ? finance?.meta
      : location.section === 'clients'
        ? clients?.meta
        : location.section === 'renewals'
          ? renewals?.meta
          : overview?.meta;

  return (
    <section className="reports-intelligence" aria-busy={loading}>
      <header className="reports-hero">
        <div className="reports-hero-copy">
          <span className="reports-eyebrow">
            <TrendingUp aria-hidden="true" size={15} />
            Intelligence center
          </span>
          <h2>Decisões melhores começam com uma visão confiável.</h2>
          <p>
            Receita efetiva, evolução da base e ciclos pagos em um único painel — sempre calculados
            no servidor e respeitando o fechamento financeiro.
          </p>
        </div>
        <div className="reports-period-summary" aria-label="Período analisado">
          <CalendarRange aria-hidden="true" size={18} />
          <div>
            <span>Período analisado</span>
            <strong>{reportMeta ? formatRange(reportMeta.period) : 'Aguardando dados'}</strong>
            <small>
              {reportMeta
                ? `Comparado com ${formatRange(reportMeta.comparisonPeriod)}`
                : 'Timezone America/Sao_Paulo'}
            </small>
          </div>
        </div>
      </header>

      <nav ref={sectionNavRef} className="reports-section-nav" aria-label="Seções de Relatórios">
        {sectionOptions.map((section) => (
          <button
            aria-current={location.section === section.id ? 'page' : undefined}
            className={location.section === section.id ? 'active' : ''}
            key={section.id}
            type="button"
            onClick={() => selectSection(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.description}</small>
          </button>
        ))}
      </nav>

      <div className="reports-filter-panel">
        <div className="reports-filter-heading">
          <div>
            <span>Período global</span>
            <small>Todos os indicadores e gráficos usam o mesmo recorte.</small>
          </div>
          <button
            aria-label="Atualizar indicadores"
            className="reports-refresh-button"
            disabled={loading}
            type="button"
            onClick={() => setReloadSequence((current) => current + 1)}
          >
            <RotateCcw aria-hidden="true" size={15} />
            Atualizar
          </button>
        </div>
        <div
          ref={presetListRef}
          className="reports-preset-list"
          role="group"
          aria-label="Atalhos de período"
        >
          {presetOptions.map((preset) => (
            <button
              aria-pressed={location.preset === preset.id}
              className={location.preset === preset.id ? 'active' : ''}
              key={preset.id}
              type="button"
              onClick={() => selectPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {location.preset === 'custom' ? (
          <div className="reports-custom-period">
            <label>
              <span>Data inicial</span>
              <input
                aria-invalid={Boolean(customError)}
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <label>
              <span>Data final</span>
              <input
                aria-invalid={Boolean(customError)}
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
            <button type="button" onClick={applyCustomPeriod}>
              Aplicar período
            </button>
            {customError ? <p role="alert">{customError}</p> : null}
          </div>
        ) : null}
      </div>

      {reportMeta && partialPeriodLabel(reportMeta) ? (
        <div className="reports-partial-period-note" role="note">
          <Clock3 aria-hidden="true" size={15} />
          <span>
            <strong>Último bucket parcial.</strong> {partialPeriodLabel(reportMeta)} Os valores
            exibidos são os realizados até o fechamento do período, não uma projeção nem uma queda
            de período completo.
          </span>
        </div>
      ) : null}

      {loading ? (
        <ReportsSkeleton />
      ) : error ? (
        <ReportsError message={error} onRetry={() => setReloadSequence((current) => current + 1)} />
      ) : location.section === 'finance' && finance ? (
        <FinanceContent finance={finance} reducedMotion={reducedMotion} />
      ) : location.section === 'clients' && clients ? (
        <ClientsContent clients={clients} reducedMotion={reducedMotion} />
      ) : location.section === 'renewals' && renewals ? (
        <RenewalsContent renewals={renewals} reducedMotion={reducedMotion} />
      ) : overview ? (
        <OverviewContent overview={overview} reducedMotion={reducedMotion} />
      ) : (
        <ReportsEmptyState />
      )}
    </section>
  );
}

function RenewalsContent({
  renewals,
  reducedMotion,
}: {
  renewals: ReportsIntelligenceRenewals;
  reducedMotion: boolean;
}) {
  const revenue = renewals.charts.renewalRevenue.map((point) => ({
    ...point,
    value: Number(point.value),
  }));
  const comparison = renewals.charts.renewalComparison;
  const composition = renewals.charts.revenueComposition.map((point) => ({
    ...point,
    label: `${point.label} (${point.sharePercent}%)`,
    value: Number(point.value),
  }));
  const ticket = renewals.charts.renewalAverageTicket.map((point) => ({
    ...point,
    value: Number(point.value),
  }));
  const hasPaid = renewals.charts.paidRenewals.some((point) => point.total);
  const hasRevenue = revenue.some((point) => point.value);
  const hasLifecycle = renewals.charts.paidLifecycle.some(
    (point) => point.activations || point.renewals || point.reactivations,
  );
  const hasComparison = comparison.some((point) => point.current || point.previous);
  const hasComposition = composition.some((point) => point.value);
  const hasTicket = ticket.some((point) => point.value);
  const hasReversals = renewals.charts.reversals.some((point) => point.total);

  return (
    <>
      <div className="reports-kpi-grid reports-finance-kpi-grid">
        {renewalsKpiDefinitions.map((definition) => (
          <KpiCard
            definition={definition}
            key={definition.id}
            metric={renewals.kpis[definition.id]}
          />
        ))}
      </div>

      <div className="reports-chart-grid">
        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Recorrência"
          title="Renovações pagas"
          description="Recebíveis RENEWAL efetivamente liquidados, agrupados no backend."
        >
          {hasPaid ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={renewals.charts.paidRenewals} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [integerFormatter.format(Number(value ?? 0)), 'Renovações']}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Bar
                  dataKey="total"
                  fill="#8b5cf6"
                  isAnimationActive={!reducedMotion}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Razão financeiro"
          title="Receita de renovações"
          description="Somente entradas operacionais vinculadas a recebíveis de renovação."
        >
          {hasRevenue ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart accessibilityLayer data={revenue} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={currencyTooltip}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Area
                  dataKey="value"
                  fill="rgba(45, 212, 191, 0.2)"
                  isAnimationActive={!reducedMotion}
                  stroke="#2dd4bf"
                  strokeWidth={2.4}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Ciclos pagos"
          title="Ativações × renovações × reativações"
          description="Contagens baseadas no recebível pago; reativação também exige relação PAID."
        >
          {hasLifecycle ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={renewals.charts.paidLifecycle}
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend
                  formatter={(value) =>
                    value === 'activations'
                      ? 'Ativações'
                      : value === 'renewals'
                        ? 'Renovações'
                        : 'Reativações'
                  }
                />
                <Bar
                  dataKey="activations"
                  fill="#38bdf8"
                  isAnimationActive={!reducedMotion}
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="renewals"
                  fill="#8b5cf6"
                  isAnimationActive={!reducedMotion}
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="reactivations"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Período equivalente"
          title="Renovações pagas: atual × anterior"
          description="Comparação das quantidades liquidadas, resolvida no servidor em America/Sao_Paulo."
        >
          {hasComparison ? (
            <ResponsiveContainer height="100%" width="100%">
              <LineChart accessibilityLayer data={comparison} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => integerFormatter.format(Number(value ?? 0))}
                />
                <Legend
                  formatter={(value) =>
                    value === 'current' ? 'Período atual' : 'Período anterior'
                  }
                />
                <Line
                  dataKey="current"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="#2dd4bf"
                  strokeWidth={2.4}
                  type="monotone"
                />
                <Line
                  dataKey="previous"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="#64748b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Composição operacional"
          title="Receita por finalidade"
          description="Ativações, renovações e reativações sem legado ou entradas manuais."
        >
          {hasComposition ? (
            <ResponsiveContainer height="100%" width="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={composition}
                  dataKey="value"
                  innerRadius="48%"
                  isAnimationActive={!reducedMotion}
                  nameKey="label"
                  outerRadius="76%"
                  paddingAngle={3}
                >
                  {composition.map((point, index) => (
                    <Cell
                      fill={clientChartColors[index % clientChartColors.length] ?? '#2dd4bf'}
                      key={point.purpose}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={currencyTooltip} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Eficiência"
          title="Ticket médio de renovação"
          description="Receita de renovação por recebível operacional liquidado em cada bucket."
        >
          {hasTicket ? (
            <ResponsiveContainer height="100%" width="100%">
              <LineChart accessibilityLayer data={ticket} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={currencyTooltip} />
                <Line
                  dataKey="value"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="#38bdf8"
                  strokeWidth={2.4}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Eventos separados"
          title="Reversões de renovação"
          description="Eventos operacionais exibidos sem subtração contábil fictícia."
        >
          {hasReversals ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={renewals.charts.reversals} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => integerFormatter.format(Number(value ?? 0))}
                />
                <Bar
                  dataKey="total"
                  fill="#fb7185"
                  isAnimationActive={!reducedMotion}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>
      </div>

      <aside className="reports-quality-note">
        <Info aria-hidden="true" size={18} />
        <div>
          <strong>Recorrência sem receita presumida</strong>
          <p>{renewals.meta.dataQuality.map((item) => item.message).join(' ')}</p>
        </div>
      </aside>
    </>
  );
}

function ClientsContent({
  clients,
  reducedMotion,
}: {
  clients: ReportsIntelligenceClients;
  reducedMotion: boolean;
}) {
  const hasNewClients = clients.charts.newClients.some((point) => point.total);
  const hasReferenceMovement = clients.charts.referenceMovement.some(
    (point) => point.created || point.canceled,
  );
  const hasPortfolio = clients.charts.activePortfolio.some(
    (point) => point.activeClients || point.activeReferences,
  );
  const monthlyAverage = clients.kpis.monthlyAverageNewClients;

  return (
    <>
      <div className="reports-kpi-grid reports-clients-kpi-grid">
        {clientsKpiDefinitions.map((definition) => (
          <KpiCard
            definition={definition}
            key={definition.id}
            metric={clients.kpis[definition.id]}
          />
        ))}
        <article className="reports-kpi reports-kpi-blue">
          <div className="reports-kpi-heading">
            <span className="reports-kpi-icon">
              <UserPlus aria-hidden="true" size={18} />
            </span>
            <span className="reports-kpi-kind">Média do recorte</span>
          </div>
          <div>
            <span className="reports-kpi-label">Média mensal de novos clientes</span>
            <strong>
              {monthlyAverage.applicable && monthlyAverage.value
                ? Number(monthlyAverage.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
                : '—'}
            </strong>
          </div>
          <div className="reports-kpi-footer">
            <p>
              {monthlyAverage.applicable
                ? `Média em ${monthlyAverage.months} mês(es) do recorte.`
                : 'Disponível para períodos com pelo menos 28 dias.'}
            </p>
          </div>
        </article>
      </div>

      <div className="reports-chart-grid">
        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Aquisição"
          title="Evolução de novos clientes"
          description="Cadastros reais por bucket, sem contar alterações de status."
        >
          {hasNewClients ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={clients.charts.newClients} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    integerFormatter.format(Number(value ?? 0)),
                    'Novos clientes',
                  ]}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Bar
                  dataKey="total"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Período equivalente"
          title="Novos clientes: atual × anterior"
          description="Comparação resolvida integralmente pelo backend."
        >
          <ResponsiveContainer height="100%" width="100%">
            <BarChart
              accessibilityLayer
              data={clients.charts.periodComparison}
              margin={chartMargin}
            >
              <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => integerFormatter.format(Number(value ?? 0))}
              />
              <Bar
                dataKey="value"
                fill="#38bdf8"
                isAnimationActive={!reducedMotion}
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          eyebrow="Serviços"
          title="Novas referências × canceladas"
          description="Contratações de serviços e cancelamentos, sem confundir referência com cliente."
        >
          {hasReferenceMovement ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={clients.charts.referenceMovement}
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend
                  formatter={(value) => (value === 'created' ? 'Novas referências' : 'Canceladas')}
                />
                <Bar
                  dataKey="created"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="canceled"
                  fill="#fb7185"
                  isAnimationActive={!reducedMotion}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Snapshot atual"
          title="Referências por status"
          description="Distribuição atual; não representa a composição histórica do período."
        >
          {clients.charts.statusDistribution.length ? (
            <ResponsiveContainer height="100%" width="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={clients.charts.statusDistribution}
                  dataKey="total"
                  innerRadius="48%"
                  isAnimationActive={!reducedMotion}
                  nameKey="label"
                  outerRadius="76%"
                  paddingAngle={3}
                >
                  {clients.charts.statusDistribution.map((point, index) => (
                    <Cell
                      fill={clientChartColors[index % clientChartColors.length] ?? '#2dd4bf'}
                      key={point.status}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => integerFormatter.format(Number(value ?? 0))}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Snapshot atual"
          title="Referências ativas por plano"
          description="Planos atuais das referências ativas; sem inferência de plano histórico."
        >
          {clients.charts.planDistribution.length ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={clients.charts.planDistribution}
                layout="vertical"
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
                <XAxis allowDecimals={false} type="number" {...axisProps} />
                <YAxis dataKey="planName" type="category" width={120} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => integerFormatter.format(Number(value ?? 0))}
                />
                <Bar
                  dataKey="total"
                  fill="#818cf8"
                  isAnimationActive={!reducedMotion}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Carteira preservada"
          title="Evolução da carteira ativa"
          description="Reconstrução por eventos preservados; hard deletes históricos não são recuperáveis."
        >
          {hasPortfolio ? (
            <ResponsiveContainer height="100%" width="100%">
              <LineChart
                accessibilityLayer
                data={clients.charts.activePortfolio}
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend
                  formatter={(value) =>
                    value === 'activeClients' ? 'Clientes ativos' : 'Referências ativas'
                  }
                />
                <Line
                  dataKey="activeClients"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="#38bdf8"
                  strokeWidth={2.4}
                  type="monotone"
                />
                <Line
                  dataKey="activeReferences"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  stroke="#2dd4bf"
                  strokeWidth={2.4}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        {clients.charts.monthlyAcquisition ? (
          <ChartPanel
            eyebrow="Período anual"
            title="Aquisição mensal"
            description="Novos clientes mês a mês no recorte selecionado."
          >
            {hasNewClients ? (
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart
                  accessibilityLayer
                  data={clients.charts.monthlyAcquisition}
                  margin={chartMargin}
                >
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                  <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => integerFormatter.format(Number(value ?? 0))}
                  />
                  <Area
                    dataKey="total"
                    fill="rgba(56, 189, 248, 0.18)"
                    isAnimationActive={!reducedMotion}
                    stroke="#38bdf8"
                    strokeWidth={2.4}
                    type="monotone"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState />
            )}
          </ChartPanel>
        ) : null}
      </div>

      <aside className="reports-quality-note">
        <Info aria-hidden="true" size={18} />
        <div>
          <strong>Leitura responsável da carteira</strong>
          <p>{clients.meta.dataQuality.map((item) => item.message).join(' ')}</p>
        </div>
      </aside>
    </>
  );
}

function FinanceContent({
  finance,
  reducedMotion,
}: {
  finance: ReportsIntelligenceFinance;
  reducedMotion: boolean;
}) {
  const evolution = useMemo(
    () =>
      finance.charts.evolution.map((point) => ({
        ...point,
        legacy: Number(point.legacy),
        manual: Number(point.manual),
        operational: Number(point.operational),
        received: Number(point.received),
      })),
    [finance.charts.evolution],
  );
  const comparison = useMemo(
    () =>
      finance.charts.periodComparison.map((point) => ({
        ...point,
        current: Number(point.current),
        previous: Number(point.previous),
      })),
    [finance.charts.periodComparison],
  );
  const averageTicket = useMemo(
    () => finance.charts.averageTicket.map((point) => ({ ...point, value: Number(point.value) })),
    [finance.charts.averageTicket],
  );
  const origins = useMemo(
    () => finance.charts.byOrigin.map((point) => ({ ...point, value: Number(point.value) })),
    [finance.charts.byOrigin],
  );
  const flowAndStock = useMemo(
    () => finance.charts.flowAndStock.map((point) => ({ ...point, value: Number(point.value) })),
    [finance.charts.flowAndStock],
  );
  const annual = useMemo(
    () =>
      finance.charts.annualComparison?.map((point) => ({
        ...point,
        current: Number(point.current),
        previous: Number(point.previous),
      })) ?? [],
    [finance.charts.annualComparison],
  );
  const hasEvolution = evolution.some((point) => point.received !== 0 || point.manual !== 0);
  const hasComparison = comparison.some((point) => point.current || point.previous);
  const hasTicket = averageTicket.some((point) => point.value !== 0);
  const hasOrigins = origins.some((point) => point.value !== 0);
  const hasFlowAndStock = flowAndStock.some((point) => point.value !== 0);
  const partialBucket = partialPeriodLabel(finance.meta) ? evolution.at(-1)?.bucket : null;

  return (
    <>
      <div className="reports-kpi-grid reports-finance-kpi-grid">
        {financeKpiDefinitions.map((definition) => (
          <KpiCard
            definition={definition}
            key={definition.id}
            metric={finance.kpis[definition.id]}
          />
        ))}
      </div>

      <div className="reports-chart-grid">
        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Razão financeiro"
          title="Evolução da receita"
          description="Operacional, legado e entradas manuais permanecem visualmente separados."
        >
          {hasEvolution ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart accessibilityLayer data={evolution} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={currencyTooltip}
                  labelFormatter={(label) =>
                    formatPartialBucketLabel(chartLabel(label), partialBucket)
                  }
                />
                <Legend formatter={(value) => financeSeriesLabel(String(value))} />
                {partialBucket ? <PartialBucketMarker bucket={partialBucket} /> : null}
                <Area
                  dataKey="operational"
                  fill="rgba(45, 212, 191, 0.2)"
                  isAnimationActive={!reducedMotion}
                  name="operational"
                  stroke="#2dd4bf"
                  strokeWidth={2.4}
                  type="monotone"
                />
                <Area
                  dataKey="legacy"
                  fill="transparent"
                  isAnimationActive={!reducedMotion}
                  name="legacy"
                  stroke="#818cf8"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  dataKey="manual"
                  fill="transparent"
                  isAnimationActive={!reducedMotion}
                  name="manual"
                  stroke="#38bdf8"
                  strokeDasharray="3 4"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Períodos equivalentes"
          title="Atual × anterior"
          description="Buckets alinhados pelo backend, sem recomputar datas no navegador."
        >
          {hasComparison ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={comparison} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={currencyTooltip}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend
                  formatter={(value) =>
                    value === 'current' ? 'Período atual' : 'Período anterior'
                  }
                />
                <Bar
                  dataKey="current"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  name="current"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="previous"
                  fill="#475569"
                  isAnimationActive={!reducedMotion}
                  name="previous"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Eficiência comercial"
          title="Evolução do ticket médio"
          description="Receita operacional dividida por recebíveis liquidados em cada bucket."
        >
          {hasTicket ? (
            <ResponsiveContainer height="100%" width="100%">
              <LineChart accessibilityLayer data={averageTicket} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    currencyFormatter.format(Number(value ?? 0)),
                    'Ticket médio',
                  ]}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Line
                  dataKey="value"
                  dot={false}
                  isAnimationActive={!reducedMotion}
                  name="Ticket médio"
                  stroke="#a78bfa"
                  strokeWidth={2.5}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Composição"
          title="Recebimentos por origem"
          description="O total recebido exclui entradas manuais, exibidas separadamente."
        >
          {hasOrigins ? (
            <ResponsiveContainer height="100%" width="100%">
              <PieChart accessibilityLayer>
                <Pie
                  data={origins}
                  dataKey="value"
                  innerRadius="48%"
                  isAnimationActive={!reducedMotion}
                  nameKey="label"
                  outerRadius="76%"
                  paddingAngle={3}
                >
                  {origins.map((point, index) => (
                    <Cell
                      fill={financeChartColors[index % financeChartColors.length] ?? '#2dd4bf'}
                      key={point.origin}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => currencyFormatter.format(Number(value ?? 0))}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Fluxo × estoque"
          title="Recebido, pendente e vencido"
          description="Recebido é fluxo; pendente e vencido são posições no fechamento."
        >
          {hasFlowAndStock ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={flowAndStock}
                layout="vertical"
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <YAxis dataKey="label" type="category" width={132} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => currencyFormatter.format(Number(value ?? 0))}
                />
                <Bar
                  dataKey="value"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        {finance.charts.annualComparison ? (
          <ChartPanel
            eyebrow="Visão anual"
            title="Comparativo anual"
            description="Meses equivalentes do ano selecionado e do ano anterior."
          >
            {annual.some((point) => point.current || point.previous) ? (
              <ResponsiveContainer height="100%" width="100%">
                <LineChart accessibilityLayer data={annual} margin={chartMargin}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                  <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                  <YAxis
                    tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                    {...axisProps}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={currencyTooltip}
                    labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                  />
                  <Legend
                    formatter={(value) =>
                      value === 'current' ? 'Ano selecionado' : 'Ano anterior'
                    }
                  />
                  <Line
                    dataKey="current"
                    dot={false}
                    isAnimationActive={!reducedMotion}
                    name="current"
                    stroke="#2dd4bf"
                    strokeWidth={2.4}
                    type="monotone"
                  />
                  <Line
                    dataKey="previous"
                    dot={false}
                    isAnimationActive={!reducedMotion}
                    name="previous"
                    stroke="#64748b"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    type="monotone"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartEmptyState />
            )}
          </ChartPanel>
        ) : null}
      </div>

      <aside className="reports-quality-note">
        <Info aria-hidden="true" size={18} />
        <div>
          <strong>Leitura financeira responsável</strong>
          <p>{finance.meta.dataQuality.map((item) => item.message).join(' ')}</p>
        </div>
      </aside>
    </>
  );
}

function OverviewContent({
  overview,
  reducedMotion,
}: {
  overview: ReportsIntelligenceOverview;
  reducedMotion: boolean;
}) {
  const financialData = useMemo(
    () =>
      overview.charts.financialEvolution.map((point) => ({
        ...point,
        legacy: Number(point.legacy),
        operational: Number(point.operational),
        received: Number(point.received),
      })),
    [overview.charts.financialEvolution],
  );
  const comparisonData = useMemo(
    () => [
      comparisonPoint('Recebido', overview.kpis.received),
      comparisonPoint('Operacional', overview.kpis.receivedOperational),
      comparisonPoint('Legado', overview.kpis.receivedLegacy),
      comparisonPoint('Manual', overview.kpis.manualEntries),
    ],
    [overview.kpis],
  );
  const hasFinancialData = financialData.some((point) => point.received !== 0);
  const hasClientData = overview.charts.newClients.some((point) => point.total !== 0);
  const hasLifecycleData = overview.charts.paidLifecycle.some(
    (point) => point.activations || point.renewals || point.reactivations,
  );
  const hasComparisonData = comparisonData.some((point) => point.current || point.previous);
  const partialBucket = partialPeriodLabel(overview.meta) ? financialData.at(-1)?.bucket : null;

  return (
    <>
      <div className="reports-kpi-grid">
        {kpiDefinitions.map((definition) => (
          <KpiCard
            definition={definition}
            key={definition.id}
            metric={overview.kpis[definition.id]}
          />
        ))}
      </div>

      <div className="reports-chart-grid">
        <ChartPanel
          className="reports-chart-wide"
          eyebrow="Receita confirmada"
          title="Evolução financeira"
          description="Recebimentos operacionais e histórico importado, sem intents ou PIX pendentes."
        >
          {hasFinancialData ? (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart accessibilityLayer data={financialData} margin={chartMargin}>
                <defs>
                  <linearGradient id="reportsOperational" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.38} />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    currencyFormatter.format(Number(value ?? 0)),
                    chartSeriesLabel(String(name)),
                  ]}
                  labelFormatter={(label) =>
                    formatPartialBucketLabel(chartLabel(label), partialBucket)
                  }
                />
                <Legend formatter={(value) => chartSeriesLabel(String(value))} />
                {partialBucket ? <PartialBucketMarker bucket={partialBucket} /> : null}
                <Area
                  dataKey="operational"
                  fill="url(#reportsOperational)"
                  isAnimationActive={!reducedMotion}
                  name="operational"
                  stroke="#2dd4bf"
                  strokeWidth={2.4}
                  type="monotone"
                />
                <Area
                  dataKey="legacy"
                  fill="transparent"
                  isAnimationActive={!reducedMotion}
                  name="legacy"
                  stroke="#818cf8"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Período equivalente"
          title="Atual × anterior"
          description="Comparação financeira usando os valores entregues pelo servidor."
        >
          {hasComparisonData ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={comparisonData} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis
                  tickFormatter={(value) => compactCurrencyFormatter.format(Number(value))}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    currencyFormatter.format(Number(value ?? 0)),
                    name === 'current' ? 'Período atual' : 'Período anterior',
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === 'current' ? 'Período atual' : 'Período anterior'
                  }
                />
                <Bar
                  dataKey="current"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  name="current"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="previous"
                  fill="#475569"
                  isAnimationActive={!reducedMotion}
                  name="previous"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Aquisição"
          title="Novos clientes"
          description="Cadastros efetivamente criados em cada bucket do período."
        >
          {hasClientData ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart accessibilityLayer data={overview.charts.newClients} margin={chartMargin}>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [
                    integerFormatter.format(Number(value ?? 0)),
                    'Novos clientes',
                  ]}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Bar
                  dataKey="total"
                  fill="#38bdf8"
                  isAnimationActive={!reducedMotion}
                  name="Novos clientes"
                  radius={[7, 7, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>

        <ChartPanel
          eyebrow="Ciclo comercial pago"
          title="Ativações × renovações × reativações"
          description="Somente eventos ligados a recebíveis liquidados."
        >
          {hasLifecycleData ? (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart
                accessibilityLayer
                data={overview.charts.paidLifecycle}
                margin={chartMargin}
              >
                <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" vertical={false} />
                <XAxis dataKey="bucket" tickFormatter={formatBucket} {...axisProps} />
                <YAxis allowDecimals={false} domain={[0, 'dataMax']} {...axisProps} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [
                    integerFormatter.format(Number(value ?? 0)),
                    chartSeriesLabel(String(name)),
                  ]}
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend formatter={(value) => chartSeriesLabel(String(value))} />
                <Bar
                  dataKey="activations"
                  fill="#2dd4bf"
                  isAnimationActive={!reducedMotion}
                  name="activations"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="renewals"
                  fill="#818cf8"
                  isAnimationActive={!reducedMotion}
                  name="renewals"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="reactivations"
                  fill="#f59e0b"
                  isAnimationActive={!reducedMotion}
                  name="reactivations"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState />
          )}
        </ChartPanel>
      </div>

      <aside className="reports-quality-note">
        <Info aria-hidden="true" size={18} />
        <div>
          <strong>Leitura responsável dos dados</strong>
          <p>{overview.meta.dataQuality.map((item) => item.message).join(' ')}</p>
        </div>
      </aside>
    </>
  );
}

function KpiCard({
  definition,
  metric,
}: {
  definition: KpiCardDefinition;
  metric: ReportsIntelligenceMetric<number | string>;
}) {
  const Icon = definition.icon;
  const value =
    definition.kind === 'money'
      ? currencyFormatter.format(Number(metric.value))
      : integerFormatter.format(Number(metric.value));
  const positive = metric.changePercent !== null && Number(metric.changePercent) >= 0;
  const unchanged = metric.changePercent !== null && Number(metric.changePercent) === 0;

  return (
    <article className={`reports-kpi reports-kpi-${definition.tone}`}>
      <div className="reports-kpi-heading">
        <span className="reports-kpi-icon">
          <Icon aria-hidden="true" size={18} />
        </span>
        <span className={`reports-kpi-kind ${definition.stock ? 'stock' : ''}`}>
          {definition.stock ? 'Estoque no fechamento' : 'Fluxo no período'}
        </span>
      </div>
      <div>
        <span className="reports-kpi-label">{definition.label}</span>
        <strong>{value}</strong>
      </div>
      <div className="reports-kpi-footer">
        <p>{definition.description}</p>
        <span
          className={`reports-comparison ${metric.comparison === 'new' ? 'new' : unchanged ? 'neutral' : positive ? 'positive' : 'negative'}`}
        >
          {metric.comparison === 'new' ? (
            'Novo no período'
          ) : unchanged ? (
            <>
              <Minus aria-hidden="true" size={13} />
              {formatPercent(metric.changePercent)}
            </>
          ) : (
            <>
              {positive ? (
                <ArrowUpRight aria-hidden="true" size={13} />
              ) : (
                <ArrowDownRight aria-hidden="true" size={13} />
              )}
              {formatPercent(metric.changePercent)}
            </>
          )}
        </span>
      </div>
    </article>
  );
}

function ChartPanel({
  children,
  className = '',
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <article className={`reports-chart-card ${className}`.trim()}>
      <header>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </header>
      <div className="reports-chart-canvas">{children}</div>
    </article>
  );
}

function ChartEmptyState() {
  return (
    <div className="reports-chart-empty">
      <BarChart3 aria-hidden="true" size={28} />
      <strong>Sem movimentação neste período</strong>
      <span>Escolha outro recorte para visualizar a evolução.</span>
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="reports-skeleton" aria-label="Carregando indicadores" role="status">
      <span className="sr-only">Carregando inteligência de Relatórios.</span>
      <div className="reports-kpi-grid">
        {Array.from({ length: 10 }, (_, index) => (
          <div className="reports-kpi reports-skeleton-card" key={index} />
        ))}
      </div>
      <div className="reports-chart-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="reports-chart-card reports-skeleton-chart" key={index} />
        ))}
      </div>
    </div>
  );
}

function ReportsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="reports-state-card reports-error-state" role="alert">
      <XCircle aria-hidden="true" size={28} />
      <h3>Não foi possível carregar os indicadores</h3>
      <p>{message}</p>
      <button type="button" onClick={onRetry}>
        <RefreshCw aria-hidden="true" size={15} />
        Tentar novamente
      </button>
    </div>
  );
}

function ReportsEmptyState() {
  return (
    <div className="reports-state-card">
      <Layers3 aria-hidden="true" size={28} />
      <h3>Nenhum dado disponível</h3>
      <p>Não há dados consolidados para o período selecionado.</p>
    </div>
  );
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reducedMotion;
}

function comparisonPoint(label: string, metric: ReportsIntelligenceMetric<string>) {
  return { label, current: Number(metric.value), previous: Number(metric.previousValue) };
}

function formatPercent(value: string | null) {
  if (value === null) return 'Novo';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatRange(range: { startDate: string; endDate: string }) {
  return range.startDate === range.endDate
    ? formatBusinessDate(range.startDate)
    : `${formatBusinessDate(range.startDate)} — ${formatBusinessDate(range.endDate)}`;
}

function formatBusinessDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatBucket(value: string) {
  if (value.length === 4) return value;
  if (value.length === 7) return `${value.slice(5, 7)}/${value.slice(2, 4)}`;
  return `${value.slice(8, 10)}/${value.slice(5, 7)}`;
}

function formatBucketLong(value: string) {
  if (value.length === 10) return formatBusinessDate(value);
  if (value.length === 7) return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
  return value;
}

function partialPeriodLabel(meta: ReportsIntelligenceOverview['meta']) {
  const { endDate } = meta.period;
  if (meta.granularity === 'year') {
    return endDate.endsWith('-12-31') ? null : `O ano termina em ${formatBusinessDate(endDate)}.`;
  }
  if (meta.granularity === 'month') {
    const [year, month, day] = endDate.split('-').map(Number);
    if (!year || !month || !day) return null;
    const monthEnd = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return day === monthEnd ? null : `O mês termina em ${formatBusinessDate(endDate)}.`;
  }
  return meta.preset === 'today'
    ? `O dia considera dados até ${formatBusinessDate(endDate)}.`
    : null;
}

function PartialBucketMarker({ bucket }: { bucket: string }) {
  return (
    <ReferenceLine
      ifOverflow="extendDomain"
      label={<PartialBucketMarkerLabel />}
      stroke="#f59e0b"
      strokeDasharray="4 4"
      strokeOpacity={0.78}
      x={bucket}
    />
  );
}

function PartialBucketMarkerLabel({ viewBox }: { viewBox?: { x?: number; y?: number } }) {
  if (viewBox?.x === undefined || viewBox.y === undefined) return null;
  return (
    <text
      aria-hidden="true"
      fill="#fbbf24"
      fontSize={10}
      textAnchor="end"
      x={viewBox.x - 6}
      y={viewBox.y + 12}
    >
      Parcial
    </text>
  );
}

function formatPartialBucketLabel(value: string, partialBucket?: string | null) {
  const label = formatBucketLong(value);
  return value === partialBucket ? `${label} · parcial` : label;
}

function revealActiveControl(
  container: HTMLElement | null,
  selector: string,
  reducedMotion: boolean,
) {
  const active = container?.querySelector<HTMLElement>(selector);
  if (!container || !active) return;
  const left = active.offsetLeft - (container.clientWidth - active.clientWidth) / 2;
  container.scrollTo({ behavior: reducedMotion ? 'auto' : 'smooth', left: Math.max(0, left) });
}

function chartLabel(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function chartSeriesLabel(value: string) {
  const labels: Record<string, string> = {
    activations: 'Ativações',
    legacy: 'Histórico importado',
    operational: 'Recebido operacional',
    reactivations: 'Reativações',
    renewals: 'Renovações',
  };
  return labels[value] ?? value;
}

function financeSeriesLabel(value: string) {
  const labels: Record<string, string> = {
    legacy: 'Histórico importado',
    manual: 'Entradas manuais',
    operational: 'Receita operacional',
  };
  return labels[value] ?? value;
}

function currencyTooltip(value: unknown, name: unknown) {
  return [currencyFormatter.format(Number(value ?? 0)), financeSeriesLabel(String(name))];
}

const chartMargin = { bottom: 0, left: -8, right: 4, top: 4 };
const financeChartColors = ['#2dd4bf', '#818cf8', '#38bdf8'];
const clientChartColors = ['#2dd4bf', '#38bdf8', '#818cf8', '#f59e0b', '#fb7185'];
const axisProps = {
  axisLine: false,
  minTickGap: 14,
  tick: { fill: '#9fb0c3', fontSize: 10.5 },
  tickLine: false,
};
const tooltipStyle = {
  background: 'rgba(9, 15, 26, 0.96)',
  border: '1px solid rgba(45, 212, 191, 0.24)',
  borderRadius: 12,
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.34)',
  color: '#e2e8f0',
};
