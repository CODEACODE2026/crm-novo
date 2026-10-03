import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const financeViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function FinanceView'),
  dashboardSource.indexOf('function TransactionSection'),
);
const financeMobileSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (width <= 620px)'),
  stylesSource.lastIndexOf('@media (width <= 480px)'),
);
const financeCompactSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (width <= 480px)'),
);

describe('global finance presentation source', () => {
  it('keeps the Financeiro page header and actions bound to existing tabs', () => {
    expect(dashboardSource).toContain('title="Financeiro"');
    expect(dashboardSource).toContain(
      'subtitle="Controle de contas, movimentações e fluxo financeiro"',
    );
    expect(dashboardSource).toContain("onClick={() => openTransactionModal('ENTRADA')}");
    expect(dashboardSource).toContain("onClick={() => openTransactionModal('SAIDA')}");
  });

  it('keeps Financeiro focused on operational tabs after category administration moves to Settings', () => {
    expect(financeViewSource).toContain("setTab('summary')");
    expect(financeViewSource).toContain("setTab('receivables')");
    expect(financeViewSource).toContain("setTab('entries')");
    expect(financeViewSource).toContain("setTab('expenses')");
    expect(financeViewSource).not.toContain("setTab('categories')");
    expect(financeViewSource).not.toContain("tab === 'categories'");
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

  it('uses a shared monthly finance period for summaries and paginated finance lists', () => {
    expect(dashboardSource).toContain('const [financePeriod, setFinancePeriod]');
    expect(dashboardSource).toContain('function changeFinanceMonth(months: number)');
    expect(dashboardSource).toContain('setReceivablesPage(1);');
    expect(dashboardSource).toContain('setEntriesPage(1);');
    expect(dashboardSource).toContain('setExpensesPage(1);');
    expect(dashboardSource).toContain('startDate: financePeriod.startDate');
    expect(dashboardSource).toContain('endDate: financePeriod.endDate');
    expect(dashboardSource).toContain('aria-label="Período financeiro"');
  });

  it('renders receivable status KPIs and preserves grouped selection actions', () => {
    expect(dashboardSource).toContain('const [receivablesSummary, setReceivablesSummary]');
    expect(dashboardSource).toContain('getReceivablesSummary(receivableSummaryFilters)');
    expect(dashboardSource).toContain('...(receivableStatus ? { status: receivableStatus } : {})');
    expect(dashboardSource).toContain("value: receivablesSummary?.pendingAmount ?? '0.00'");
    expect(dashboardSource).toContain("value: receivablesSummary?.paidAmount ?? '0.00'");
    expect(dashboardSource).toContain("value: receivablesSummary?.overdueAmount ?? '0.00'");
    expect(dashboardSource).toContain("value: receivablesSummary?.canceledAmount ?? '0.00'");
    expect(dashboardSource).toContain("label: 'A receber'");
    expect(dashboardSource).toContain("label: 'Pago'");
    expect(dashboardSource).toContain("label: 'Vencido'");
    expect(dashboardSource).toContain("label: 'Cancelado'");
    expect(dashboardSource).toContain('{selectedReceivables.length} conta');
    expect(dashboardSource).toContain('Total: {formatCurrency(selectedTotal)}');
    expect(dashboardSource).toContain('setPixReceivables(selectedReceivables)');
    expect(dashboardSource).toContain('setPaymentReceivables(selectedReceivables)');
  });

  it('adds operational quick filters with Sao Paulo business date and due-date sorting', () => {
    expect(financeViewSource).toContain('const [receivableDueDate, setReceivableDueDate]');
    expect(financeViewSource).toContain('const [activeQuickFilter, setActiveQuickFilter]');
    expect(financeViewSource).toContain("sort: 'dueDateAsc'");
    expect(financeViewSource).toContain('function applyQuickFilter');
    expect(financeViewSource).toContain('const today = formatSaoPauloDateInput(new Date());');
    expect(financeViewSource).toContain('const nextSevenDays = addBusinessDaysInput(today, 7);');
    expect(financeViewSource).toContain("setReceivableStatus('PENDENTE');");
    expect(financeViewSource).toContain("setReceivableStatus('VENCIDO');");
    expect(financeViewSource).toContain('dueDate: receivableDueDate');
    expect(financeViewSource).toContain("activeQuickFilter === 'overdue'");
    expect(financeViewSource).toContain(
      "setFinancePeriod(buildCustomFinancePeriod('Hoje', today));",
    );
    expect(financeViewSource).toContain(
      "setFinancePeriod(buildCustomFinancePeriod('Próximos 7 dias', today, nextSevenDays));",
    );
    expect(financeViewSource).toContain('Hoje');
    expect(financeViewSource).toContain('Pendentes hoje');
    expect(financeViewSource).toContain('Recebidos hoje');
    expect(financeViewSource).toContain('Vencidos');
    expect(financeViewSource).toContain('Próximos 7 dias');
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

  it('labels legacy imported financial transactions without enabling manual actions', () => {
    expect(dashboardSource).toContain('function financialTransactionOriginLabel');
    expect(dashboardSource).toContain("LEGACY_IMPORT: 'Importação histórica'");
    expect(dashboardSource).toContain(
      '<option value="LEGACY_IMPORT">Importação histórica</option>',
    );
    expect(dashboardSource).toContain("transaction.origin !== 'MANUAL'");
  });

  it('keeps central UI 2.0 modal headers for finance flows', () => {
    expect(dashboardSource).toContain('modal-header modal-header-with-icon');
    expect(dashboardSource).toContain('modal finance-transaction-modal');
    expect(dashboardSource).toContain('Registre uma nova movimentação de entrada.');
    expect(dashboardSource).toContain('Registre uma nova movimentação de saída.');
    expect(dashboardSource).toContain('Gerar, acompanhar e receber pagamentos');
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

  it('adds the manual PIX charge mode without removing the manual entry path', () => {
    expect(dashboardSource).toContain("type TransactionModalMode = 'MANUAL_ENTRY' | 'MANUAL_PIX'");
    expect(dashboardSource).toContain('<strong>Entrada manual</strong>');
    expect(dashboardSource).toContain('<strong>Cobrança PIX</strong>');
    expect(dashboardSource).toContain('await createManualEntry(payload);');
    expect(dashboardSource).toContain('await createManualCharge({');
    expect(dashboardSource).toContain("payerType: 'REGISTERED_CLIENT'");
    expect(dashboardSource).toContain("payerType: 'GUEST'");
  });

  it('keeps manual PIX actions on existing endpoints and providers', () => {
    expect(dashboardSource).toContain(
      'createReceivablePix(manualCharge.id, selectedManualPixProvider)',
    );
    expect(dashboardSource).toContain('sendPaymentIntentWhatsApp(manualPixIntent.id)');
    expect(dashboardSource).toContain('replaceReceivablePix(manualCharge.id');
    expect(dashboardSource).toContain('cancelReceivable(manualCharge.id');
    expect(dashboardSource).toContain('activePixConflictPayloadFromError(err)');
    expect(dashboardSource).toContain("setPixNotice('PIX ativo encontrado.')");
    expect(dashboardSource).toContain("'Tentar novamente' : 'Enviar no WhatsApp'");
    expect(dashboardSource).toContain(
      "type ManualPixWorkingAction = 'create' | 'generate' | 'whatsapp' | 'replace' | 'cancel' | null;",
    );
    expect(dashboardSource).toContain("setManualPixWorkingAction('create')");
    expect(dashboardSource).toContain("setManualPixWorkingAction('generate')");
    expect(dashboardSource).toContain("setManualPixWorkingAction('whatsapp')");
    expect(dashboardSource).toContain("setManualPixWorkingAction('replace')");
    expect(dashboardSource).toContain("setManualPixWorkingAction('cancel')");
    expect(dashboardSource).toContain(
      'disabled={busy || !selectedPixProvider || !canUsePixActions || hasActivePixIntent}',
    );
    expect(dashboardSource).toContain(
      "manualCharge.status === 'CANCELADO' ? 'CANCELADO' : 'PENDENTE'",
    );
    expect(dashboardSource).toContain('listPaymentProviderCredentials()');
    expect(dashboardSource).toContain('isOperationalPixProviderCredential(credential)');
    expect(dashboardSource).toContain('replacementProviderLabel(provider, defaultPixProvider)');
    expect(dashboardSource).not.toContain('/manual-charges/whatsapp');
  });

  it('keeps manual PIX errors friendly and accessible', () => {
    expect(dashboardSource).toContain('function manualPixFriendlyError');
    expect(dashboardSource).toContain('function manualPixKnownErrorMessage');
    expect(dashboardSource).toContain('Categoria inválida ou indisponível.');
    expect(dashboardSource).toContain('Telefone inválido para envio pelo WhatsApp.');
    expect(dashboardSource).toContain('Provider PIX indisponível no momento.');
    expect(dashboardSource).toContain('Este PIX foi substituído por uma tentativa mais recente.');
    expect(dashboardSource).toContain('id="transaction-form-error" role="alert"');
    expect(dashboardSource).toContain(
      "aria-describedby={formError ? 'transaction-form-error' : undefined}",
    );
  });

  it('presents manual charge receivables with user-facing labels', () => {
    expect(dashboardSource).toContain("return receivable.purpose === 'MANUAL_CHARGE';");
    expect(dashboardSource).toContain(
      "if (isManualChargeReceivable(receivable)) return 'Cobrança avulsa';",
    );
    expect(dashboardSource).toContain(
      "return isManualChargeReceivable(receivable) ? 'Cobrança PIX' : 'Cobrança recorrente';",
    );
    expect(dashboardSource).toContain('receivablePayerLabel(receivable)');
    expect(dashboardSource).toContain('receivableReferenceLabel(receivable)');
    expect(dashboardSource).toContain('isManualChargeReceivable(receivable) ||');
    expect(dashboardSource).not.toContain('>MANUAL_CHARGE<');
  });

  it('keeps manual PIX modal controls mobile-aware', () => {
    expect(stylesSource).toContain('.manual-charge-choice');
    expect(stylesSource).toContain('.manual-pix-stepper');
    expect(stylesSource).toContain('.manual-pix-provider-swap');
    expect(stylesSource).toContain('.manual-pix-actions .ui-button');
    expect(stylesSource).toContain('.manual-charge-choice,');
    expect(stylesSource).toContain('.manual-pix-stepper,');
    expect(stylesSource).toContain('.manual-pix-provider-swap');
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
    expect(dashboardSource).toContain('finance-global-table finance-receivables-table');
    expect(dashboardSource).toContain('finance-global-table finance-transactions-table');
    expect(dashboardSource).toContain('finance-status-pill');
    expect(stylesSource).toContain('.finance-workspace');
    expect(stylesSource).toContain('.finance-tabs button.active');
    expect(stylesSource).toContain('.finance-summary-panel,');
    expect(stylesSource).toContain('.finance-receivable-kpis');
    expect(stylesSource).toContain('.finance-global-table');
  });

  it('compacts the global finance header, actions, month navigation and tabs on mobile', () => {
    expect(financeMobileSource).toContain('.finance-workspace .page-header');
    expect(financeMobileSource).toContain('.finance-workspace .page-actions');
    expect(financeMobileSource).toContain('.finance-workspace .quick-actions');
    expect(financeMobileSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(financeViewSource).toContain('finance-action-label-full');
    expect(financeViewSource).toContain('finance-action-label-compact');
    expect(stylesSource).toContain(
      '.finance-workspace .quick-actions .ui-button .finance-action-label-compact',
    );
    expect(financeMobileSource).toContain(
      '.finance-workspace .quick-actions .ui-button .finance-action-label-full,',
    );
    expect(financeMobileSource).toContain(
      '.finance-workspace .quick-actions .ui-button .finance-action-label-compact,',
    );
    expect(financeMobileSource).toContain('.finance-period-bar');
    expect(financeMobileSource).toContain('grid-template-columns: 28px 30px minmax(0, 1fr) 30px;');
    expect(financeMobileSource).toContain('.finance-quick-filters');
    expect(financeMobileSource).toContain('overscroll-behavior-x: contain;');
    expect(financeMobileSource).toContain('.finance-tabs');
    expect(financeMobileSource).toContain('overflow-x: auto;');
    expect(financeMobileSource).toContain('white-space: nowrap;');
  });

  it('keeps overview and receivable KPI grids compact on mobile', () => {
    expect(financeMobileSource).toContain('.finance-kpis,');
    expect(financeMobileSource).toContain('.finance-receivable-kpis');
    expect(financeMobileSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(financeMobileSource).toContain('.finance-kpis .metric-card:last-child');
    expect(financeMobileSource).toContain('grid-column: 1 / -1;');
    expect(financeMobileSource).toContain('min-height: 66px;');
    expect(financeCompactSource).toContain('min-height: 58px;');
  });

  it('compacts receivable filters while preserving quick filters, grouped PIX and pagination hooks', () => {
    expect(financeMobileSource).toContain('.finance-toolbar {');
    expect(financeMobileSource).toContain('.finance-toolbar .search-row');
    expect(financeMobileSource).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(financeViewSource).toContain('aria-label="Filtros rápidos do financeiro"');
    expect(financeViewSource).not.toContain('toggleTodayReceivablesFilter');
    expect(financeViewSource).toContain('setPixReceivables(selectedReceivables)');
    expect(financeViewSource).toContain('pagination={receivablesPagination}');
    expect(financeViewSource).toContain('onPageChange={setReceivablesPage}');
  });

  it('renders receivables and transactions as mobile cards without removing data columns', () => {
    expect(financeMobileSource).toContain('.finance-workspace .finance-global-table thead');
    expect(financeMobileSource).toContain('.finance-workspace .finance-global-table tbody tr');
    expect(financeMobileSource).toContain('.finance-receivables-table td:nth-child(1)::before');
    expect(financeMobileSource).toContain("content: 'Selecionar';");
    expect(financeMobileSource).toContain("content: 'Cliente';");
    expect(financeMobileSource).toContain("content: 'Referência';");
    expect(financeMobileSource).toContain("content: 'Descrição';");
    expect(financeMobileSource).toContain("content: 'Vencimento';");
    expect(financeMobileSource).toContain("content: 'Valor';");
    expect(financeMobileSource).toContain("content: 'Status';");
    expect(financeMobileSource).toContain("content: 'Ações';");
    expect(financeMobileSource).toContain('.finance-transactions-table td:nth-child(1)::before');
  });

  it('keeps mobile selection, status badges, actions and pagination accessible', () => {
    expect(financeMobileSource).toContain('.finance-selection-bar {');
    expect(financeMobileSource).toContain('align-items: stretch;');
    expect(financeMobileSource).toContain('overflow: hidden;');
    expect(financeMobileSource).toContain('.finance-selection-bar > strong,');
    expect(financeMobileSource).toContain('.finance-selection-bar .button-row');
    expect(financeMobileSource).toContain('grid-template-columns: 1fr;');
    expect(financeMobileSource).toContain('white-space: normal;');
    expect(financeMobileSource).toContain(
      ".finance-receivables-table tbody tr:has(input[type='checkbox']:checked)",
    );
    expect(financeMobileSource).toContain(
      ".finance-workspace .finance-select-column input[type='checkbox']",
    );
    expect(financeMobileSource).toContain('.finance-workspace .finance-status-pill');
    expect(financeMobileSource).toContain(
      '.finance-workspace .finance-actions-column .table-actions',
    );
    expect(financeMobileSource).toContain('.finance-workspace .pagination');
    expect(financeMobileSource).toContain('.finance-workspace .pagination-current');
    expect(financeCompactSource).toContain(
      '.finance-workspace .finance-actions-column .button-row',
    );
  });
});
