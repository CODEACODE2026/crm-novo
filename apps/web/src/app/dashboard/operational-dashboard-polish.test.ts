import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

function sourceBlock(source: string, start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe('operational dashboard polish source', () => {
  it('keeps the six top KPIs bound to dashboard summary fields', () => {
    expect(dashboardSource).toContain('label="Clientes ativos"');
    expect(dashboardSource).toContain('summary?.clients.active');
    expect(dashboardSource).toContain('label="Vencem hoje"');
    expect(dashboardSource).toContain('summary?.dueDates.dueToday');
    expect(dashboardSource).toContain('label="A receber"');
    expect(dashboardSource).toContain('summary?.finance.receivablePending');
    expect(dashboardSource).toContain('label="Receita do período"');
    expect(dashboardSource).toContain('summary?.finance.received');
    expect(dashboardSource).toContain('label="Inadimplentes"');
    expect(dashboardSource).toContain('summary?.dueDates.overdueClients');
    expect(dashboardSource).toContain('label="Pendências"');
    expect(dashboardSource).toContain('summary?.pending.items.reduce');
  });

  it('preserves period modes and quick actions', () => {
    const optionsBlock = sourceBlock(
      dashboardSource,
      'const dashboardPeriodOptions = [',
      '] satisfies Array<{ value: DashboardPeriodMode; label: string }>;',
    );

    expect(optionsBlock).toContain("{ value: 'today', label: 'Hoje' }");
    expect(optionsBlock).toContain("{ value: 'current', label: 'Mês atual' }");
    expect(optionsBlock).toContain("{ value: 'previous', label: 'Mês anterior' }");
    expect(optionsBlock).toContain("{ value: 'last30', label: 'Últimos 30 dias' }");
    expect(optionsBlock).toContain("{ value: 'custom', label: 'Personalizado' }");
    expect(optionsBlock.indexOf("'today'")).toBeLessThan(optionsBlock.indexOf("'current'"));
    expect(optionsBlock.indexOf("'current'")).toBeLessThan(optionsBlock.indexOf("'previous'"));
    expect(optionsBlock.indexOf("'previous'")).toBeLessThan(optionsBlock.indexOf("'last30'"));
    expect(optionsBlock.indexOf("'last30'")).toBeLessThan(optionsBlock.indexOf("'custom'"));
    expect(dashboardSource).toContain('const dashboardRequestRef = useRef(0);');
    expect(dashboardSource).toContain('setSummary(null);');
    expect(dashboardSource).toContain('dashboardRequestRef.current !== requestId');
    expect(dashboardSource).toContain('buildDashboardPeriod(periodMode, customStart, customEnd)');
    expect(dashboardSource).toContain(
      'return { startDate: todaySaoPaulo, endDate: todaySaoPaulo };',
    );
    expect(dashboardSource).toContain("timeZone: 'America/Sao_Paulo'");
    expect(dashboardSource).toContain('onClick={onNewClient}');
    expect(dashboardSource).toContain("onClick={() => onOpenFinance('entries')}");
    expect(dashboardSource).toContain("onClick={() => onOpenFinance('receivables')}");
  });

  it('maps dashboard period labels to friendly text', () => {
    expect(dashboardSource).toContain("hoje: 'Hoje'");
    expect(dashboardSource).toContain("mes_atual: 'Mês atual'");
    expect(dashboardSource).toContain("mes_anterior: 'Mês anterior'");
    expect(dashboardSource).toContain("ultimos_30_dias: 'Últimos 30 dias'");
    expect(dashboardSource).toContain("periodo_personalizado: 'Período personalizado'");
    expect(dashboardSource).toContain('subtitle={periodLabel}');
  });

  it('uses empty state for zero cashflow points and the temporal chart for 1, 2 or 6 points', () => {
    expect(dashboardSource).toContain('const hasCashflowData = cashflowPoints.length > 0;');
    expect(dashboardSource).not.toContain('cashflowPoints.length > 1');
    expect(dashboardSource).toContain('<CashflowTemporalChart');
    expect(dashboardSource).toContain('function CashflowTemporalChart');
    expect(dashboardSource).toContain('cashflow-temporal-chart');
    expect(dashboardSource).toContain('cashflow-axis-tick');
    expect(dashboardSource).toContain('cashflow-svg-bar');
    expect(dashboardSource).toContain('cashflow-chart-legend');
    expect(dashboardSource).toContain(
      'data-tooltip={`${formatTooltipPeriodLabel(point.period)} | Entradas',
    );
    expect(dashboardSource).not.toContain('cashflow-comparison');
    expect(dashboardSource).not.toContain('cashflow-comparison-row');
    expect(dashboardSource).toContain('summary?.charts.cashflow');
    expect(dashboardSource).toContain('Sem movimentações financeiras no período.');
    expect(dashboardSource).not.toContain('fakeCashflow');
    expect(stylesSource).toContain('.dashboard-finance-body');
    expect(stylesSource).toContain('.cashflow-temporal-chart');
    expect(stylesSource).toContain('.cashflow-svg-bar');
    expect(stylesSource).not.toContain('.cashflow-comparison-row');
  });

  it('formats cashflow period labels for daily and monthly grouping', () => {
    expect(dashboardSource).toContain('const shortMonthNamesPt = [');
    expect(dashboardSource).toContain('return `${monthLabel}/${year}`;');
    expect(dashboardSource).toContain('return day && month ? `${day}/${month}` : period;');
    expect(dashboardSource).toContain('function formatTooltipPeriodLabel');
    expect(dashboardSource).toContain('if (period.length === 10) return formatDate(period);');
  });

  it('reduces visible cashflow x-axis ticks without removing chart data', () => {
    expect(dashboardSource).toContain('function cashflowTickInterval(total: number');
    expect(dashboardSource).toContain('if (total <= 14) return 1;');
    expect(dashboardSource).toContain('if (total <= 31) return compact ? 6 : 3;');
    expect(dashboardSource).toContain('if (total <= 62) return compact ? 10 : 6;');
    expect(dashboardSource).toContain('function shouldShowCashflowTick');
    expect(dashboardSource).toContain(
      'index === 0 || index === total - 1 || index % interval === 0',
    );
    expect(dashboardSource).toContain('{points.map((point, index) => {');
    expect(dashboardSource).toContain('{points.map((point, index) => (');
    expect(dashboardSource).toContain('shouldShowCashflowTick(index, points.length)');
    expect(dashboardSource).toContain('shouldShowCashflowTick(index, points.length, true)');
    expect(stylesSource).toContain('.cashflow-x-label-mobile {\n  display: none;');
    expect(stylesSource).toContain('.cashflow-x-label-desktop {\n    display: none;');
    expect(stylesSource).toContain('.cashflow-x-label-mobile {\n    display: block;');
  });

  it('renders financial summary with positive and negative balance tones', () => {
    expect(dashboardSource).toContain("financeBalance < 0 ? 'is-negative'");
    expect(dashboardSource).toContain("financeBalance > 0 ? 'is-positive'");
    expect(dashboardSource).toContain("label: 'Saldo'");
    expect(dashboardSource).toContain('tone: financeBalanceTone');
    expect(stylesSource).toContain('.finance-side-metrics div.is-negative');
    expect(stylesSource).toContain('.finance-side-metrics div.is-positive');
    expect(stylesSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
  });

  it('removes the recent activity panel from the operational dashboard only', () => {
    const dashboardBlock = sourceBlock(
      dashboardSource,
      'function OperationalDashboard({',
      'function ClientStatusDonut({',
    );

    expect(dashboardBlock).not.toContain('Atividade recente');
    expect(dashboardBlock).not.toContain('summary?.lists.recentActivity');
    expect(dashboardBlock).not.toContain('<ClientEventIcon type={event.type} />');
    expect(dashboardSource).toContain('function ClientEventIcon({ type }: { type: string })');
  });

  it('keeps compact empty states for due dates, overdue accounts and pending items', () => {
    expect(dashboardSource).toContain('<CalendarClock aria-hidden="true" size={20} />');
    expect(dashboardSource).toContain('<Receipt aria-hidden="true" size={20} />');
    expect(dashboardSource).toContain('Nenhum cliente nesta lista.');
    expect(dashboardSource).toContain('Não há vencimentos para hoje.');
    expect(dashboardSource).toContain('Nenhuma conta vencida.');
    expect(dashboardSource).toContain('Não há cobranças em atraso no momento.');
    expect(dashboardSource).toContain('Sem pendências operacionais.');
    expect(dashboardSource).toContain('Nenhuma ação operacional pendente.');
    expect(stylesSource).toContain('.compact-empty-state');
    expect(stylesSource).toContain('.dashboard-empty-state');
    expect(stylesSource).toContain('.dashboard-empty-state {\n  display: grid;');
  });

  it('keeps responsive dashboard structure without horizontal overflow helpers', () => {
    expect(stylesSource).toContain('.dashboard-kpis');
    expect(stylesSource).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(stylesSource).toContain('.dashboard-primary-grid');
    expect(stylesSource).toContain('.dashboard-secondary-grid');
    expect(stylesSource).toContain('.dashboard-finance-body,');
    expect(stylesSource).toContain('grid-template-columns: 1fr;');
    expect(stylesSource).toContain('.period-controls {\n  display: inline-flex;');
    expect(stylesSource).toContain('.period-controls button.active');
    expect(stylesSource).toContain('.period-controls button:focus-visible');
  });

  it('uses a scoped compact dashboard layout without removing filters, KPIs or charts', () => {
    const dashboardBlock = sourceBlock(
      dashboardSource,
      'function OperationalDashboard({',
      'function CashflowTemporalChart({',
    );

    expect(dashboardBlock).toContain('className="dashboard-compact-layout"');
    expect(dashboardBlock).toContain('className="dashboard-toolbar"');
    expect(dashboardBlock).toContain('className="metric-grid dashboard-kpis"');
    expect(dashboardBlock).toContain('className="dashboard-primary-grid"');
    expect(dashboardBlock).toContain('CashflowTemporalChart');
    expect(dashboardSource).toContain("label: 'Hoje'");
    expect(dashboardSource).toContain("label: 'Mês atual'");
    expect(dashboardSource).toContain("label: 'Mês anterior'");
    expect(dashboardSource).toContain("label: 'Últimos 30 dias'");
    expect(dashboardSource).toContain("label: 'Personalizado'");
    expect(stylesSource).toContain('.dashboard-compact-layout .dashboard-kpis .stat-card');
    expect(stylesSource).toContain('min-height: 82px;');
    expect(stylesSource).toContain('.dashboard-compact-layout .cashflow-temporal-chart');
    expect(stylesSource).toContain('min-height: 260px;');
    expect(stylesSource).toContain('.dashboard-compact-layout .compact-table article');
    expect(stylesSource).toContain('.dashboard-compact-layout .quick-actions .primary-button');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('min-height: 38px;');
  });

  it('uses dedicated mobile rows for due today without compressing data into desktop columns', () => {
    const dueTodayBlock = sourceBlock(
      dashboardSource,
      'function CompactClientDueTable({',
      'function OverdueReceivablesTable({',
    );

    expect(dueTodayBlock).toContain('className="compact-table operational-list due-today-list"');
    expect(dueTodayBlock).toContain('className="operational-list-title"');
    expect(dueTodayBlock).toContain('className="operational-list-reference"');
    expect(dueTodayBlock).toContain('className="operational-list-value"');
    expect(dueTodayBlock).toContain('className="operational-list-date"');
    expect(dueTodayBlock).toContain('className="operational-list-status"');
    expect(dueTodayBlock).toContain('className="button-row operational-list-actions"');
    expect(dueTodayBlock).toContain('<StatusBadge status={client.status} />');
    expect(dueTodayBlock).toContain('formatCurrency(client.recurringValue)');
    expect(dueTodayBlock).toContain('formatDate(client.dueDate)');
    expect(dueTodayBlock).toContain('aria-label={`Abrir cliente ${client.name}`}');
    expect(dueTodayBlock).toContain('aria-label={`Renovar ${client.reference}`}');
    expect(stylesSource).toContain('.dashboard-compact-layout .due-today-list article');
    expect(stylesSource).toContain("'main status'");
    expect(stylesSource).toContain("'value date'");
    expect(stylesSource).toContain("'actions actions'");
    expect(stylesSource).toContain(
      '.dashboard-compact-layout .due-today-list .operational-list-date::before',
    );
  });

  it('uses readable mobile rows for overdue accounts while keeping amount, date, days and action', () => {
    const overdueBlock = sourceBlock(
      dashboardSource,
      'function OverdueReceivablesTable({',
      'function buildDashboardPeriod(',
    );

    expect(overdueBlock).toContain('className="compact-table operational-list overdue-list"');
    expect(overdueBlock).toContain('className="operational-list-title"');
    expect(overdueBlock).toContain('className="operational-list-reference"');
    expect(overdueBlock).toContain('className="operational-list-value"');
    expect(overdueBlock).toContain('className="operational-list-date"');
    expect(overdueBlock).toContain('className="operational-list-overdue-days"');
    expect(overdueBlock).toContain('className="icon-button operational-list-actions"');
    expect(overdueBlock).toContain('formatCurrency(receivable.amount)');
    expect(overdueBlock).toContain('formatDate(receivable.dueDate)');
    expect(overdueBlock).toContain('receivable.daysOverdue');
    expect(overdueBlock).toContain('<CreditCard aria-hidden="true" size={16} />');
    expect(stylesSource).toContain('.dashboard-compact-layout .overdue-list article');
    expect(stylesSource).toContain("'main value'");
    expect(stylesSource).toContain("'date days'");
    expect(stylesSource).toContain(
      '.dashboard-compact-layout .overdue-list .operational-list-date::before',
    );
  });

  it('keeps mobile operational actions horizontal and pending items clickable but compact', () => {
    expect(stylesSource).toContain('.dashboard-compact-layout .operational-list-actions');
    expect(stylesSource).toContain('justify-content: flex-end;');
    expect(stylesSource).toContain(
      '.dashboard-compact-layout .operational-list-actions .icon-button,',
    );
    expect(stylesSource).toContain('.dashboard-compact-layout .pending-item');
    expect(stylesSource).toContain('min-height: 42px;');
    expect(stylesSource).toContain('grid-template-columns: auto minmax(0, 1fr) auto auto;');
    expect(stylesSource).toContain('@media (max-width: 480px)');
    expect(stylesSource).toContain('.dashboard-compact-layout .pending-item span');
  });

  it('renders the status donut only from real reference status counts', () => {
    expect(dashboardSource).toContain('summary?.clients.distribution');
    expect(dashboardSource).toContain('function ClientStatusDonut');
    expect(dashboardSource).toContain("label: 'Ativas'");
    expect(dashboardSource).toContain("label: 'Inativas'");
    expect(dashboardSource).toContain("label: 'Canceladas'");
    expect(dashboardSource).toContain('Total de referências por status');
    expect(dashboardSource).toContain('Sem referências classificadas.');
    expect(dashboardSource).toContain('Dados de status indisponíveis no contrato atual.');
    expect(dashboardSource).toContain('referências classificadas.');
    expect(stylesSource).toContain('.donut-segment');
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(160px, 0.55fr) minmax(130px, 0.45fr);',
    );
    expect(stylesSource).toContain('animation: donut-segment-draw 700ms ease-out both;');
  });

  it('adds one-shot microanimations with reduced motion support', () => {
    expect(stylesSource).toContain('@keyframes cashflow-bar-rise');
    expect(stylesSource).toContain('@keyframes donut-segment-draw');
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesSource).toContain('.cashflow-svg-bar,');
    expect(stylesSource).toContain('animation: none;');
    expect(stylesSource).not.toContain('infinite');
  });

  it('keeps the operational bottom row and removes legacy charts from rendering', () => {
    const dashboardBlock = sourceBlock(
      dashboardSource,
      'function OperationalDashboard({',
      'function CashflowTemporalChart({',
    );

    expect(dashboardBlock).toContain('title="Vencimentos de hoje"');
    expect(dashboardBlock).toContain('title="Pendências operacionais"');
    expect(dashboardBlock).toContain('title="Contas vencidas"');
    expect(dashboardBlock).not.toContain('Recebido por período');
    expect(dashboardBlock).not.toContain('title="Distribuição"');
  });
});
