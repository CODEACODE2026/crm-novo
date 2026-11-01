import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(
  resolve(currentDir, 'reports-intelligence-overview.tsx'),
  'utf8',
);
const dashboardSource = readFileSync(resolve(currentDir, '../../app/dashboard/page.tsx'), 'utf8');
const routeSource = readFileSync(
  resolve(currentDir, '../../app/dashboard/relatorios/page.tsx'),
  'utf8',
);
const stylesSource = readFileSync(resolve(currentDir, '../../app/globals.css'), 'utf8');

describe('reports intelligence overview UI contract', () => {
  it('uses the canonical route and the existing authenticated dashboard shell', () => {
    expect(routeSource).toContain("import DashboardPage from '../page'");
    expect(routeSource).toContain('<DashboardPage initialView="reports" />');
    expect(dashboardSource).toContain("window.location.pathname === '/dashboard/relatorios'");
    expect(dashboardSource).toContain('<AdminShell');
    expect(dashboardSource).toContain('<ReportsIntelligenceOverviewView />');
  });

  it('loads only intelligence endpoints and contains no CSV or legacy report calls', () => {
    expect(componentSource).toContain('getReportsIntelligenceOverview');
    expect(componentSource).toContain('getReportsIntelligenceFinance');
    expect(componentSource).toContain('getReportsIntelligenceClients');
    expect(componentSource).toContain('getReportsIntelligenceRenewals');
    expect(componentSource).not.toContain('downloadReportCsv');
    expect(componentSource).not.toContain('getReport(');
    expect(componentSource).not.toContain('CSV');
    expect(componentSource).not.toContain('<table');
  });

  it('renders the approved KPI definitions and distinguishes stocks from flows', () => {
    for (const label of [
      'Total efetivamente recebido',
      'Novos clientes',
      'Renovações pagas',
      'Ticket médio operacional',
      'Clientes ativos',
      'Valores pendentes',
      'Valores vencidos',
      'Novas ativações pagas',
      'Reativações pagas',
      'Referências canceladas',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(componentSource).toContain(
      "definition.stock ? 'Estoque no fechamento' : 'Fluxo no período'",
    );
  });

  it('uses Recharts for four purposeful visualizations with accessible empty states', () => {
    expect(componentSource).toContain('<AreaChart accessibilityLayer');
    expect(componentSource.match(/<BarChart(?:\s|>)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(componentSource.match(/accessibilityLayer/g)?.length).toBeGreaterThanOrEqual(4);
    expect(componentSource).toContain('Evolução financeira');
    expect(componentSource).toContain('Atual × anterior');
    expect(componentSource).toContain('Novos clientes');
    expect(componentSource).toContain('Ativações × renovações × reativações');
    expect(componentSource).toContain('<ChartEmptyState />');
  });

  it('implements Financeiro with real KPIs and purposeful visualizations', () => {
    for (const label of [
      'Receita operacional',
      'Histórico importado',
      'Entradas manuais',
      'Pagamentos recebidos',
      'Evolução do ticket médio',
      'Recebimentos por origem',
      'Recebido, pendente e vencido',
    ]) {
      expect(componentSource).toContain(label);
    }
    expect(componentSource).toContain('<FinanceContent');
    expect(componentSource).toContain('<PieChart accessibilityLayer>');
    expect(componentSource).toContain('<LineChart accessibilityLayer');
    expect(componentSource).toContain("location.section === 'finance'");
  });

  it('implements Clientes without confusing clients and references', () => {
    for (const label of [
      'Novos clientes',
      'Clientes ativos',
      'Sem referência ativa',
      'Referências ativas',
      'Novas referências',
      'Clientes com cancelamento',
      'Evolução da carteira ativa',
      'Referências ativas por plano',
    ])
      expect(componentSource).toContain(label);
    expect(componentSource).toContain('<ClientsContent');
    expect(componentSource).toContain("location.section === 'clients'");
    expect(componentSource).toContain('hard deletes históricos não são recuperáveis');
  });

  it('implements Renovações from paid lifecycle and ledger-backed revenue', () => {
    for (const label of [
      'Receita de renovações',
      'Ticket médio de renovação',
      'Ativações pagas',
      'Reativações pagas',
      'Reversões de renovação',
      'Receita por finalidade',
    ])
      expect(componentSource).toContain(label);
    expect(componentSource).toContain('<RenewalsContent');
    expect(componentSource).toContain("location.section === 'renewals'");
    expect(componentSource).toContain('sem subtração contábil fictícia');
  });

  it('supports loading, retry and no-data states', () => {
    expect(componentSource).toContain('<ReportsSkeleton />');
    expect(componentSource).toContain('<ReportsError');
    expect(componentSource).toContain('<ReportsEmptyState />');
    expect(componentSource).toContain('role="alert"');
  });

  it('covers responsive mobile layouts and reduced motion', () => {
    expect(stylesSource).toContain('@media (max-width: 680px)');
    expect(stylesSource).toContain('@media (max-width: 390px)');
    expect(stylesSource).toContain('@media (prefers-reduced-motion: reduce)');
    expect(componentSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(componentSource).toContain('isAnimationActive={!reducedMotion}');
  });
});
