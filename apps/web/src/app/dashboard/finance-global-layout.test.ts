import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

describe('global finance presentation source', () => {
  it('keeps the Financeiro page header and actions bound to existing tabs', () => {
    expect(dashboardSource).toContain('title="Financeiro"');
    expect(dashboardSource).toContain(
      'subtitle="Controle de contas, movimentações e fluxo financeiro"',
    );
    expect(dashboardSource).toContain("onClick={() => setTab('entries')}");
    expect(dashboardSource).toContain("onClick={() => setTab('expenses')}");
  });

  it('renders the operational KPI row from existing summary fields only', () => {
    expect(dashboardSource).toContain('const financeKpis = summary');
    expect(dashboardSource).toContain('value: summary.receivablePending');
    expect(dashboardSource).toContain('value: summary.received');
    expect(dashboardSource).toContain('value: summary.receivableOverdue');
    expect(dashboardSource).toContain('value: summary.expenses');
    expect(dashboardSource).toContain('value: summary.balance');
    expect(dashboardSource).toContain('finance-summary-grid');
    expect(dashboardSource).toContain('summary.entries');
  });

  it('renders receivable status KPIs and preserves grouped selection actions', () => {
    expect(dashboardSource).toContain(
      'const receivableTotals = clientReceivableTotals(receivables)',
    );
    expect(dashboardSource).toContain("label: 'A receber'");
    expect(dashboardSource).toContain("label: 'Pago'");
    expect(dashboardSource).toContain("label: 'Vencido'");
    expect(dashboardSource).toContain("label: 'Cancelado'");
    expect(dashboardSource).toContain('{selectedReceivables.length} conta');
    expect(dashboardSource).toContain('Total: {formatCurrency(selectedTotal)}');
    expect(dashboardSource).toContain('setPixReceivables(selectedReceivables)');
    expect(dashboardSource).toContain('setPaymentReceivables(selectedReceivables)');
  });

  it('keeps semantic financial statuses and centered finance columns', () => {
    expect(dashboardSource).toContain('function financeReceivableTone');
    expect(dashboardSource).toContain("if (status === 'PENDENTE') return 'warning'");
    expect(dashboardSource).toContain("if (status === 'PAGO') return 'success'");
    expect(dashboardSource).toContain("if (status === 'CANCELADO') return 'muted'");
    expect(dashboardSource).toContain('className="finance-status-column">Situação');
    expect(dashboardSource).toContain('className="finance-actions-column">Ações');
    expect(stylesSource).toContain('.finance-status-pill.tone-muted');
    expect(stylesSource).toContain('.finance-select-column,');
    expect(stylesSource).toContain('text-align: center;');
  });

  it('uses compact action menus and keeps empty states available', () => {
    expect(dashboardSource).toContain('<ActionMenu');
    expect(dashboardSource).toContain("label: 'Dar baixa'");
    expect(dashboardSource).toContain("label: 'Cancelar'");
    expect(dashboardSource).toContain('Nenhuma conta a receber encontrada.');
    expect(dashboardSource).toContain('Nenhuma movimentação encontrada.');
    expect(dashboardSource).toContain('Nenhuma categoria encontrada.');
  });

  it('keeps central UI 2.0 modal headers for finance flows', () => {
    expect(dashboardSource).toContain('modal-header modal-header-with-icon');
    expect(dashboardSource).toContain('Gerar, copiar e sincronizar pagamento desta conta.');
    expect(dashboardSource).toContain('Gerar um único PIX para as contas selecionadas.');
    expect(dashboardSource).toContain('Registrar pagamento desta conta a receber.');
    expect(dashboardSource).toContain('Registrar pagamento agrupado das contas selecionadas.');
    expect(dashboardSource).toContain('Informar o motivo antes de cancelar esta conta.');
  });

  it('uses dense semantic styling for finance tabs, panels, and tables', () => {
    expect(dashboardSource).toContain('workspace-main finance-workspace');
    expect(dashboardSource).toContain('className="tabs finance-tabs"');
    expect(dashboardSource).toContain('finance-panel');
    expect(dashboardSource).toContain('finance-global-table');
    expect(dashboardSource).toContain('finance-status-pill');
    expect(stylesSource).toContain('.finance-workspace');
    expect(stylesSource).toContain('.finance-tabs button.active');
    expect(stylesSource).toContain('.finance-summary-panel,');
    expect(stylesSource).toContain('.finance-receivable-kpis');
    expect(stylesSource).toContain('.finance-global-table');
  });
});
