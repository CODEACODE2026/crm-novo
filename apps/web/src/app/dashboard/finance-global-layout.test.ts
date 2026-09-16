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
    expect(dashboardSource).toContain("onClick={() => openTransactionModal('ENTRADA')}");
    expect(dashboardSource).toContain("onClick={() => openTransactionModal('SAIDA')}");
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
    expect(dashboardSource).toContain('modal finance-transaction-modal');
    expect(dashboardSource).toContain('Registre uma nova movimentação de entrada.');
    expect(dashboardSource).toContain('Registre uma nova movimentação de saída.');
    expect(dashboardSource).toContain('Gerar, copiar e sincronizar pagamento desta conta.');
    expect(dashboardSource).toContain('Gerar um único PIX para as contas selecionadas.');
    expect(dashboardSource).toContain('Registrar pagamento desta conta a receber.');
    expect(dashboardSource).toContain('Registrar pagamento agrupado das contas selecionadas.');
    expect(dashboardSource).toContain('Informar o motivo antes de cancelar esta conta.');
  });

  it('opens entry and expense modals without calling creation endpoints from buttons', () => {
    expect(dashboardSource).toContain('const [transactionModal, setTransactionModal]');
    expect(dashboardSource).toContain("openTransactionModal('ENTRADA')");
    expect(dashboardSource).toContain("openTransactionModal('SAIDA')");
    expect(dashboardSource).toContain('onCreateRequest={() => openTransactionModal');
    expect(dashboardSource).not.toContain('onClick={() => void submitForm()}');
    expect(dashboardSource).not.toContain('onClick={() => void createManualEntry');
    expect(dashboardSource).not.toContain('onClick={() => void createManualExpense');
  });

  it('keeps entry and expense creation behind the modal submit action only', () => {
    expect(dashboardSource).toContain(
      'async function submitForm(event: FormEvent<HTMLFormElement>)',
    );
    expect(dashboardSource).toContain('event.preventDefault();');
    expect(dashboardSource).toContain('await createManualEntry(payload);');
    expect(dashboardSource).toContain('await createManualExpense(payload);');
    expect(dashboardSource).toContain('type="submit" variant="primary"');
    expect(dashboardSource).toContain('Salvar entrada');
    expect(dashboardSource).toContain('Salvar saída');
  });

  it('validates required transaction fields before hitting the API', () => {
    expect(dashboardSource).toContain(
      'if (!form.description.trim() || !form.categoryId || !form.transactionDate || amount <= 0)',
    );
    expect(dashboardSource).toContain(
      'Preencha descrição, categoria, valor e data antes de salvar.',
    );
    expect(dashboardSource).toContain('required');
    expect(dashboardSource).toContain('min="0.01"');
  });

  it('closes transaction modals without API calls and removes inline transaction forms', () => {
    expect(dashboardSource).toContain('function closeAndReset()');
    expect(dashboardSource).toContain('onClick={closeAndReset}');
    expect(dashboardSource).toContain('Cancelar');
    expect(dashboardSource).not.toContain('className="entity-form finance-transaction-form"');
    expect(stylesSource).toContain('.finance-transaction-modal-form');
    expect(stylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('routes edit actions through the same transaction modal', () => {
    expect(dashboardSource).toContain('transactionFormFromRecord(transaction)');
    expect(dashboardSource).toContain(
      "onUpdateRequest={(transaction) => openTransactionModal('ENTRADA', transaction)}",
    );
    expect(dashboardSource).toContain(
      "onUpdateRequest={(transaction) => openTransactionModal('SAIDA', transaction)}",
    );
    expect(dashboardSource).toContain('await updateFinancialTransaction(id, payload);');
    expect(dashboardSource).toContain('Editar entrada');
    expect(dashboardSource).toContain('Editar saída');
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
