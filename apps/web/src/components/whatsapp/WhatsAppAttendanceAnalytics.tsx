'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  MessageCircle,
  RefreshCw,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '../ui/admin-shell';
import { Button, Card } from '../ui/primitives';
import {
  getWhatsAppAttendanceAnalytics,
  listWhatsAppAttendanceCategories,
  listWhatsAppConnections,
  type WhatsAppAttendanceAnalytics,
  type WhatsAppAttendanceCategory,
  type WhatsAppAttendanceStatus,
  type WhatsAppConnection,
} from '../../lib/crm-api';

type PeriodMode = 'today' | 'seven' | 'thirty' | 'month' | 'custom';

const periodOptions: Array<{ id: PeriodMode; label: string }> = [
  { id: 'today', label: 'Hoje' },
  { id: 'seven', label: '7 dias' },
  { id: 'thirty', label: '30 dias' },
  { id: 'month', label: 'Mês atual' },
  { id: 'custom', label: 'Personalizado' },
];
const statusLabels: Record<WhatsAppAttendanceStatus, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em atendimento',
  RESOLVED: 'Resolvido',
};
const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function formatAttendanceAnalyticsDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  if (minutes < 60) return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${String(remainingMinutes).padStart(2, '0')}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatAttendanceAnalyticsPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function saoPauloToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function rangeFor(mode: PeriodMode, customFrom: string, customTo: string) {
  const today = saoPauloToday();
  if (mode === 'today') return { dateFrom: today, dateTo: today };
  if (mode === 'seven') return { dateFrom: shiftDate(today, -6), dateTo: today };
  if (mode === 'thirty') return { dateFrom: shiftDate(today, -29), dateTo: today };
  if (mode === 'custom') return { dateFrom: customFrom, dateTo: customTo };
  return { dateFrom: monthStart(today), dateTo: today };
}

export function WhatsAppAttendanceAnalyticsView({
  onOpenClient,
}: {
  onOpenClient: (clientId: string) => void;
}) {
  const today = useMemo(() => saoPauloToday(), []);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [customFrom, setCustomFrom] = useState(monthStart(today));
  const [customTo, setCustomTo] = useState(today);
  const [connectionId, setConnectionId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState<WhatsAppAttendanceStatus | ''>('');
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [categories, setCategories] = useState<WhatsAppAttendanceCategory[]>([]);
  const [data, setData] = useState<WhatsAppAttendanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [error, setError] = useState('');
  const initialAnalyticsLoaded = useRef(false);

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true);
    try {
      setConnections(await listWhatsAppConnections());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as conexões.');
    } finally {
      setFiltersLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCategoryId('');
    if (!connectionId) {
      setCategories([]);
      return;
    }
    try {
      setCategories(await listWhatsAppAttendanceCategories(connectionId, true));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as categorias.');
    }
  }, [connectionId]);

  const loadAnalytics = useCallback(async () => {
    const range = rangeFor(periodMode, customFrom, customTo);
    if (!range.dateFrom || !range.dateTo) {
      setError('Informe as duas datas do período personalizado.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setData(
        await getWhatsAppAttendanceAnalytics({
          ...range,
          ...(connectionId ? { connectionId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(status ? { status } : {}),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os atendimentos.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, connectionId, customFrom, customTo, periodMode, status]);

  useEffect(() => {
    void loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    if (initialAnalyticsLoaded.current) return;
    initialAnalyticsLoaded.current = true;
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const empty = !loading && data?.summary.totalAttendances === 0;
  const summary = data?.summary;

  return (
    <div className="attendance-analytics-view">
      <PageHeader
        eyebrow="WhatsApp"
        title="Atendimentos"
        subtitle="Indicadores operacionais dos episódios iniciados por clientes."
        actions={
          <Button
            disabled={loading}
            type="button"
            variant="secondary"
            onClick={() => void loadAnalytics()}
          >
            <RefreshCw aria-hidden="true" size={16} />
            Atualizar
          </Button>
        }
      />

      <Card className="attendance-analytics-filters">
        <div className="period-controls" aria-label="Período dos atendimentos">
          {periodOptions.map((option) => (
            <button
              className={periodMode === option.id ? 'active' : ''}
              key={option.id}
              type="button"
              onClick={() => setPeriodMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {periodMode === 'custom' ? (
          <div className="attendance-custom-period">
            <label>
              <span>De</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <label>
          <span>Conexão</span>
          <select
            disabled={filtersLoading}
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
          >
            <option value="">Todas</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <select
            disabled={!connectionId}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as WhatsAppAttendanceStatus | '')}
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendente</option>
            <option value="IN_PROGRESS">Em atendimento</option>
            <option value="RESOLVED">Resolvido</option>
          </select>
        </label>
        <Button disabled={loading} type="button" onClick={() => void loadAnalytics()}>
          Aplicar filtros
        </Button>
      </Card>

      {error ? (
        <div className="notice danger attendance-analytics-error" role="alert">
          <span>{error}</span>
          <Button type="button" variant="secondary" onClick={() => void loadAnalytics()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {loading ? <AttendanceAnalyticsSkeleton /> : null}
      {!loading && data ? (
        <>
          <p className="attendance-period-context">
            Indicadores de status consideram atendimentos abertos no período selecionado.
          </p>
          <section className="attendance-kpi-grid" aria-label="Indicadores de atendimentos">
            <AnalyticsKpi
              icon={MessageCircle}
              label="Abertos"
              value={summary?.totalAttendances ?? 0}
            />
            <AnalyticsKpi
              icon={Clock3}
              label="Pendentes"
              tone="pending"
              value={summary?.pending ?? 0}
            />
            <AnalyticsKpi
              icon={Timer}
              label="Em atendimento"
              tone="progress"
              value={summary?.inProgress ?? 0}
            />
            <AnalyticsKpi
              icon={CheckCircle2}
              label="Resolvidos"
              tone="resolved"
              value={summary?.resolved ?? 0}
            />
            <AnalyticsKpi
              icon={Clock3}
              label="Primeira resposta média"
              value={formatAttendanceAnalyticsDuration(summary?.firstResponseAvgSeconds ?? 0)}
            />
            <AnalyticsKpi
              icon={Timer}
              label="Resolução média"
              value={formatAttendanceAnalyticsDuration(summary?.resolutionAvgSeconds ?? 0)}
            />
            <AnalyticsKpi
              icon={TrendingUp}
              label="Taxa de resolução"
              value={formatAttendanceAnalyticsPercentage(summary?.resolutionRate ?? 0)}
            />
            <AnalyticsKpi
              icon={CheckCircle2}
              label="Resolvidos hoje"
              value={summary?.resolvedToday ?? 0}
            />
          </section>

          {empty ? (
            <div className="empty-state attendance-analytics-empty">
              Ainda não há atendimentos no período selecionado.
            </div>
          ) : (
            <>
              <section className="attendance-chart-grid">
                <Card className="attendance-chart-card attendance-volume-card">
                  <AnalyticsCardHeader
                    title="Atendimentos por período"
                    subtitle={`${data.period.from} até ${data.period.to}`}
                  />
                  <VolumeChart data={data.dailyVolume} />
                </Card>
                <Card className="attendance-chart-card">
                  <AnalyticsCardHeader
                    title="Distribuição por status"
                    subtitle="Situação atual dos atendimentos abertos no período"
                  />
                  <StatusDistribution data={data.statusDistribution} />
                </Card>
                <Card className="attendance-chart-card">
                  <AnalyticsCardHeader
                    title="Categorias mais frequentes"
                    subtitle="Top atendimentos resolvidos"
                  />
                  <CategoryRanking data={data.topCategories} />
                </Card>
                <Card className="attendance-chart-card">
                  <AnalyticsCardHeader
                    title="Horários de maior movimento"
                    subtitle="Aberturas por hora em America/Sao_Paulo"
                  />
                  <HourlyChart data={data.hourlyDistribution} />
                </Card>
              </section>

              <Card className="attendance-weekday-card">
                <AnalyticsCardHeader
                  title="Volume por dia da semana"
                  subtitle="Aberturas no período selecionado"
                />
                <WeekdayChart data={data.weekdayDistribution} />
              </Card>

              <section className="attendance-message-summary">
                <div>
                  <span>Mensagens recebidas</span>
                  <strong>{summary?.receivedMessages ?? 0}</strong>
                </div>
                <div>
                  <span>Respostas manuais</span>
                  <strong>{summary?.sentManualMessages ?? 0}</strong>
                </div>
                <div>
                  <span>Com resposta automática</span>
                  <strong>{summary?.attendancesWithAutoReply ?? 0}</strong>
                  <small>
                    {formatAttendanceAnalyticsPercentage(summary?.autoReplyCoverageRate ?? 0)} dos
                    atendimentos
                  </small>
                </div>
                <div>
                  <span>Automáticas enviadas</span>
                  <strong>{summary?.autoRepliesSentInPeriod ?? 0}</strong>
                  <small>{summary?.pendingWithAutoReply ?? 0} ainda pendentes</small>
                </div>
              </section>

              <Card className="attendance-ranking-card">
                <AnalyticsCardHeader
                  title="Clientes que mais solicitam atendimento"
                  subtitle="Somente clientes vinculados · top 10"
                />
                <ClientRanking data={data.topClients} onOpenClient={onOpenClient} />
              </Card>

              <section className="attendance-operational-grid">
                <Card>
                  <AnalyticsCardHeader
                    title="Aguardando primeira resposta"
                    subtitle="Estado atual · sem limite do período · mais antigos primeiro"
                  />
                  <OpenAttendanceList
                    data={data.waitingFirstResponse}
                    emptyLabel="Nenhum atendimento aguardando resposta."
                  />
                </Card>
                <Card>
                  <AnalyticsCardHeader
                    title="Atendimentos abertos mais antigos"
                    subtitle="Estado atual · sem limite do período · pendentes e em atendimento"
                  />
                  <OpenAttendanceList
                    data={data.oldestOpenAttendances}
                    emptyLabel="Nenhum atendimento aberto."
                    showStatus
                  />
                </Card>
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function AnalyticsKpi({
  icon: Icon,
  label,
  tone = 'neutral',
  value,
}: {
  icon: typeof Clock3;
  label: string;
  tone?: string;
  value: number | string;
}) {
  return (
    <article className={`attendance-kpi tone-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Icon aria-hidden="true" size={20} />
    </article>
  );
}

function AnalyticsCardHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header className="attendance-card-header">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <BarChart3 aria-hidden="true" size={18} />
    </header>
  );
}

function AttendanceAnalyticsSkeleton() {
  return (
    <div className="attendance-analytics-skeleton" aria-label="Carregando indicadores">
      <div />
      <div />
      <div />
      <div />
      <section />
    </div>
  );
}

function VolumeChart({ data }: { data: WhatsAppAttendanceAnalytics['dailyVolume'] }) {
  if (!data.length) return <div className="empty-state">Sem volume no período.</div>;
  const width = 760;
  const height = 250;
  const margin = 34;
  const max = Math.max(1, ...data.flatMap((item) => [item.opened, item.resolved]));
  const x = (index: number) =>
    margin + (index * (width - margin * 2)) / Math.max(data.length - 1, 1);
  const y = (value: number) => height - margin - (value / max) * (height - margin * 2);
  const points = (key: 'opened' | 'resolved') =>
    data.map((item, index) => `${x(index)},${y(item[key])}`).join(' ');
  return (
    <div className="attendance-volume-chart">
      <div className="attendance-chart-legend">
        <span className="opened">Abertos</span>
        <span className="resolved">Resolvidos</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfico de atendimentos abertos e resolvidos"
      >
        <line
          className="axis"
          x1={margin}
          x2={width - margin}
          y1={height - margin}
          y2={height - margin}
        />
        <polyline className="opened-line" fill="none" points={points('opened')} />
        <polyline className="resolved-line" fill="none" points={points('resolved')} />
        {data.map((item, index) => (
          <g key={item.period}>
            <circle className="opened-dot" cx={x(index)} cy={y(item.opened)} r="4">
              <title>{`${item.period}: ${item.opened} abertos`}</title>
            </circle>
            <circle className="resolved-dot" cx={x(index)} cy={y(item.resolved)} r="4">
              <title>{`${item.period}: ${item.resolved} resolvidos`}</title>
            </circle>
            {index === 0 || index === data.length - 1 || data.length <= 8 ? (
              <text x={x(index)} y={height - 10}>
                {item.period.slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}

function StatusDistribution({ data }: { data: WhatsAppAttendanceAnalytics['statusDistribution'] }) {
  return (
    <div className="attendance-status-distribution">
      {data.map((item) => (
        <div key={item.status}>
          <div>
            <span className={`status-dot ${item.status.toLowerCase()}`} />
            {statusLabels[item.status]}
            <strong>{item.count}</strong>
          </div>
          <span className="analytics-bar">
            <i className={item.status.toLowerCase()} style={{ width: `${item.percentage}%` }} />
          </span>
          <small>{formatAttendanceAnalyticsPercentage(item.percentage)}</small>
        </div>
      ))}
    </div>
  );
}

function CategoryRanking({ data }: { data: WhatsAppAttendanceAnalytics['topCategories'] }) {
  if (!data.length) return <div className="empty-state">Sem categorias resolvidas no período.</div>;
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="attendance-category-ranking">
      {data.map((item) => (
        <div key={item.categoryId}>
          <span title={item.name}>{item.name}</span>
          <span className="analytics-bar">
            <i
              className={`label-${item.color.toLowerCase()}`}
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </span>
          <strong>
            {item.count} · {formatAttendanceAnalyticsPercentage(item.percentage)}
          </strong>
        </div>
      ))}
    </div>
  );
}

function HourlyChart({ data }: { data: WhatsAppAttendanceAnalytics['hourlyDistribution'] }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="attendance-hourly-chart" role="img" aria-label="Distribuição horária">
      <div className="attendance-hour-bars">
        {data.map((item) => (
          <span key={item.hour} title={`${String(item.hour).padStart(2, '0')}h: ${item.count}`}>
            <i style={{ height: `${Math.max(3, (item.count / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="attendance-hour-axis">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  );
}

function WeekdayChart({ data }: { data: WhatsAppAttendanceAnalytics['weekdayDistribution'] }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return (
    <div className="attendance-weekday-chart">
      {data.map((item) => (
        <div key={item.weekday}>
          <span>{weekdayLabels[item.weekday]}</span>
          <span className="analytics-bar">
            <i style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

function ClientRanking({
  data,
  onOpenClient,
}: {
  data: WhatsAppAttendanceAnalytics['topClients'];
  onOpenClient: (clientId: string) => void;
}) {
  if (!data.length) return <div className="empty-state">Sem clientes vinculados no período.</div>;
  return (
    <div className="attendance-client-table">
      <div className="attendance-table-head">
        <span>Cliente</span>
        <span>Atendimentos</span>
        <span>Resolvidos</span>
        <span>Tempo médio</span>
      </div>
      {data.map((item) => (
        <button key={item.clientId} type="button" onClick={() => onOpenClient(item.clientId)}>
          <span>
            <strong>{item.clientName}</strong>
            <small>{item.phone}</small>
          </span>
          <span>{item.attendancesCount}</span>
          <span>{item.resolvedCount}</span>
          <span>{formatAttendanceAnalyticsDuration(item.avgResolutionSeconds)}</span>
        </button>
      ))}
    </div>
  );
}

function OpenAttendanceList({
  data,
  emptyLabel,
  showStatus = false,
}: {
  data: WhatsAppAttendanceAnalytics['oldestOpenAttendances'];
  emptyLabel: string;
  showStatus?: boolean;
}) {
  if (!data.length) return <div className="empty-state">{emptyLabel}</div>;
  return (
    <div className="attendance-open-list">
      {data.map((item) => (
        <article key={item.attendanceId}>
          <div>
            <strong>{item.clientName || item.phone}</strong>
            <small>{item.phone}</small>
          </div>
          {showStatus ? (
            <span className={`attendance-status-pill ${item.status.toLowerCase()}`}>
              {statusLabels[item.status]}
            </span>
          ) : null}
          {item.hasAutoReply ? (
            <span className="attendance-auto-reply-badge" title="Resposta automática enviada">
              <Bot aria-hidden="true" size={13} /> Automática
            </span>
          ) : null}
          <div>
            <strong>{formatAttendanceAnalyticsDuration(item.ageSeconds)}</strong>
            <small>em aberto</small>
          </div>
          <div>
            <strong>{item.inboundMessagesCount}</strong>
            <small>recebidas</small>
          </div>
        </article>
      ))}
    </div>
  );
}
