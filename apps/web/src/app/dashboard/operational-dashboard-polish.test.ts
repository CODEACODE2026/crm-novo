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
    expect(dashboardSource).toContain("['current', 'Mês atual']");
    expect(dashboardSource).toContain("['previous', 'Mês anterior']");
    expect(dashboardSource).toContain("['last30', 'Últimos 30 dias']");
    expect(dashboardSource).toContain("['custom', 'Personalizado']");
    expect(dashboardSource).toContain('const dashboardRequestRef = useRef(0);');
    expect(dashboardSource).toContain('setSummary(null);');
    expect(dashboardSource).toContain('dashboardRequestRef.current !== requestId');
    expect(dashboardSource).toContain('buildDashboardPeriod(periodMode, customStart, customEnd)');
    expect(dashboardSource).toContain('onClick={onNewClient}');
    expect(dashboardSource).toContain("onClick={() => onOpenFinance('entries')}");
    expect(dashboardSource).toContain("onClick={() => onOpenFinance('receivables')}");
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
      'data-tooltip={`${formatPeriodLabel(point.period)} | Entradas',
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
