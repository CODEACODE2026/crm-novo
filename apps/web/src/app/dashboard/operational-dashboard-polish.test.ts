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

  it('uses real cashflow series when available and compact comparison for one point', () => {
    expect(dashboardSource).toContain('const hasCashflowSeries = cashflowPoints.length > 1;');
    expect(dashboardSource).toContain('hasCashflowSeries ?');
    expect(dashboardSource).toContain('cashflow-comparison');
    expect(dashboardSource).toContain('summary?.charts.cashflow');
    expect(dashboardSource).not.toContain('fakeCashflow');
    expect(stylesSource).toContain('.dashboard-finance-body');
    expect(stylesSource).toContain('.cashflow-comparison-row');
  });

  it('renders financial summary with positive and negative balance tones', () => {
    expect(dashboardSource).toContain("financeBalance < 0 ? 'is-negative'");
    expect(dashboardSource).toContain("financeBalance > 0 ? 'is-positive'");
    expect(dashboardSource).toContain("['Saldo', summary?.finance.balance, financeBalanceTone]");
    expect(stylesSource).toContain('.finance-side-metrics div.is-negative');
    expect(stylesSource).toContain('.finance-side-metrics div.is-positive');
  });

  it('shows recent activity without an internal scroll panel', () => {
    const activityStyles = sourceBlock(
      stylesSource,
      '.activity-panel .activity-list',
      '.operational-grid',
    );

    expect(dashboardSource).toContain(
      'const recentActivity = summary?.lists.recentActivity.slice(0, 6)',
    );
    expect(dashboardSource).toContain('<ClientEventIcon type={event.type} />');
    expect(dashboardSource).toContain('Sem atividade recente.');
    expect(activityStyles).toContain('.activity-panel .activity-list');
    expect(activityStyles).not.toContain('max-height: 420px;');
    expect(activityStyles).not.toContain('overflow-y: auto;');
  });

  it('keeps compact empty states for activity, due dates, overdue accounts and pending items', () => {
    expect(dashboardSource).toContain('compact-empty-state">Sem atividade recente.');
    expect(dashboardSource).toContain('compact-empty-state">Nenhum cliente nesta lista.');
    expect(dashboardSource).toContain('compact-empty-state">Nenhuma conta vencida.');
    expect(dashboardSource).toContain('compact-empty-state">Sem pendências operacionais.');
    expect(stylesSource).toContain('.compact-empty-state');
  });

  it('keeps responsive dashboard structure without horizontal overflow helpers', () => {
    expect(stylesSource).toContain('.dashboard-kpis');
    expect(stylesSource).toContain('grid-template-columns: repeat(6, minmax(0, 1fr));');
    expect(stylesSource).toContain('.dashboard-primary-grid');
    expect(stylesSource).toContain('.dashboard-secondary-grid');
    expect(stylesSource).toContain('.dashboard-finance-body,');
    expect(stylesSource).toContain('grid-template-columns: 1fr;');
  });
});
