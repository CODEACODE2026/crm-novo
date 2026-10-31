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
  Construction,
  CreditCard,
  Info,
  Layers3,
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
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getReportsIntelligenceOverview,
  type ReportsIntelligenceMetric,
  type ReportsIntelligenceOverview,
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
  { id: 'finance', label: 'Financeiro', description: 'Em desenvolvimento' },
  { id: 'clients', label: 'Clientes', description: 'Em desenvolvimento' },
  { id: 'renewals', label: 'Renovações', description: 'Em desenvolvimento' },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customError, setCustomError] = useState('');
  const [reloadSequence, setReloadSequence] = useState(0);
  const requestSequence = useRef(0);
  const reducedMotion = useReducedMotion();

  const loadOverview = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++requestSequence.current;
      setLoading(true);
      setError('');

      try {
        const payload = await getReportsIntelligenceOverview(
          {
            preset: location.preset,
            ...(location.preset === 'custom'
              ? { startDate: location.startDate, endDate: location.endDate }
              : {}),
          },
          signal,
        );
        if (requestSequence.current === requestId) setOverview(payload);
      } catch (cause) {
        if (signal?.aborted || requestSequence.current !== requestId) return;
        setOverview(null);
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível carregar a inteligência de Relatórios.',
        );
      } finally {
        if (requestSequence.current === requestId) setLoading(false);
      }
    },
    [location.endDate, location.preset, location.startDate],
  );

  useEffect(() => {
    if (
      location.preset === 'custom' &&
      !isValidCustomReportsPeriod(location.startDate, location.endDate)
    ) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview, location.endDate, location.preset, location.startDate, reloadSequence]);

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
            <strong>{overview ? formatRange(overview.meta.period) : 'Aguardando dados'}</strong>
            <small>
              {overview
                ? `Comparado com ${formatRange(overview.meta.comparisonPeriod)}`
                : 'Timezone America/Sao_Paulo'}
            </small>
          </div>
        </div>
      </header>

      <nav className="reports-section-nav" aria-label="Seções de Relatórios">
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
        <div className="reports-preset-list" role="group" aria-label="Atalhos de período">
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

      {location.section !== 'overview' ? (
        <ReportsComingSoon section={location.section} />
      ) : loading ? (
        <ReportsSkeleton />
      ) : error ? (
        <ReportsError message={error} onRetry={() => setReloadSequence((current) => current + 1)} />
      ) : overview ? (
        <OverviewContent overview={overview} reducedMotion={reducedMotion} />
      ) : (
        <ReportsEmptyState />
      )}
    </section>
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
                  labelFormatter={(label) => formatBucketLong(chartLabel(label))}
                />
                <Legend formatter={(value) => chartSeriesLabel(String(value))} />
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
                <YAxis allowDecimals={false} {...axisProps} />
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
                <YAxis allowDecimals={false} {...axisProps} />
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
  definition: KpiDefinition;
  metric: ReportsIntelligenceMetric<number | string>;
}) {
  const Icon = definition.icon;
  const value =
    definition.kind === 'money'
      ? currencyFormatter.format(Number(metric.value))
      : integerFormatter.format(Number(metric.value));
  const positive = metric.changePercent !== null && Number(metric.changePercent) >= 0;

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
          className={`reports-comparison ${metric.comparison === 'new' ? 'new' : positive ? 'positive' : 'negative'}`}
        >
          {metric.comparison === 'new' ? (
            'Novo no período'
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

function ReportsComingSoon({
  section,
}: {
  section: Exclude<ReportsIntelligenceSection, 'overview'>;
}) {
  const label = sectionOptions.find((item) => item.id === section)?.label ?? 'Seção';
  return (
    <div className="reports-coming-soon">
      <span>
        <Construction aria-hidden="true" size={24} />
      </span>
      <div>
        <small>Próxima etapa</small>
        <h3>{label} está em desenvolvimento</h3>
        <p>
          Esta área será conectada a agregações próprias. Nenhum gráfico ou indicador fictício é
          exibido enquanto a fonte real ainda não estiver disponível.
        </p>
      </div>
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

const chartMargin = { bottom: 2, left: 0, right: 12, top: 12 };
const axisProps = {
  axisLine: false,
  tick: { fill: '#94a3b8', fontSize: 11 },
  tickLine: false,
};
const tooltipStyle = {
  background: 'rgba(9, 15, 26, 0.96)',
  border: '1px solid rgba(45, 212, 191, 0.24)',
  borderRadius: 12,
  boxShadow: '0 18px 48px rgba(0, 0, 0, 0.34)',
  color: '#e2e8f0',
};
