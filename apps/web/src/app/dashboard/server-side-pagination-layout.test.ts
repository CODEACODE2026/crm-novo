import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const clientsSource = dashboardSource.slice(
  dashboardSource.indexOf('export default function DashboardPage'),
  dashboardSource.indexOf('function AppShellChrome'),
);
const billingSource = dashboardSource.slice(
  dashboardSource.indexOf('function BillingView'),
  dashboardSource.indexOf('function BillingDispatchDetailModal'),
);
const waitlistSource = dashboardSource.slice(
  dashboardSource.indexOf('function WaitlistView'),
  dashboardSource.indexOf('function WaitlistContactDetailModal'),
);
const financeSource = dashboardSource.slice(
  dashboardSource.indexOf('function FinanceView'),
  dashboardSource.indexOf('type TransactionFormState'),
);

describe('phase B server-side pagination wiring', () => {
  it('uses server pagination for clients and resets page on search and filters', () => {
    expect(dashboardSource).toContain('const listPageSize = 10;');
    expect(clientsSource).toContain('const [clientsPage, setClientsPage] = useState(1);');
    expect(clientsSource).toContain('page: clientsPage');
    expect(clientsSource).toContain('pageSize: listPageSize');
    expect(clientsSource).toContain('clientsPagination={clientsPayload?.pagination ?? null}');
    expect(clientsSource).toContain('onClientsPageChange={setClientsPage}');
    expect(clientsSource.match(/setClientsPage\(1\);/g)).toHaveLength(3);
    expect(dashboardSource).toContain('itemLabel="clientes"');
    expect(dashboardSource).toContain(
      'setClientsPage(Math.max(1, nextClients.pagination.totalPages))',
    );
  });

  it('keeps finance pages independent and clears selected receivables on page changes', () => {
    expect(financeSource).toContain('const [receivablesPage, setReceivablesPage] = useState(1);');
    expect(financeSource).toContain('const [entriesPage, setEntriesPage] = useState(1);');
    expect(financeSource).toContain('const [expensesPage, setExpensesPage] = useState(1);');
    expect(financeSource).toContain('page: receivablesPage');
    expect(financeSource).toContain('page: entriesPage');
    expect(financeSource).toContain('page: expensesPage');
    expect(financeSource).toContain('setSelectedReceivableIds([]);');
    expect(financeSource).toContain('}, [financeSearch, receivableStatus, receivablesPage]);');
  });

  it('renders pagination for receivables, entries and expenses with current page reload semantics', () => {
    expect(financeSource).toContain('pagination={receivablesPagination}');
    expect(financeSource).toContain('onPageChange={setReceivablesPage}');
    expect(financeSource).toContain('pagination={entriesPagination}');
    expect(financeSource).toContain('onPageChange={setEntriesPage}');
    expect(financeSource).toContain('pagination={expensesPagination}');
    expect(financeSource).toContain('onPageChange={setExpensesPage}');
    expect(financeSource).toContain(
      'setReceivablesPage(Math.max(1, nextReceivables.pagination.totalPages))',
    );
    expect(financeSource).toContain(
      'setEntriesPage(Math.max(1, nextEntries.pagination.totalPages))',
    );
    expect(financeSource).toContain(
      'setExpensesPage(Math.max(1, nextExpenses.pagination.totalPages))',
    );
  });

  it('keeps finance KPIs away from the current page collection', () => {
    expect(financeSource).toContain('getFinancialSummary()');
    expect(financeSource).toContain('value: summary.receivablePending');
    expect(financeSource).toContain('value: summary.received');
    expect(financeSource).toContain('value: summary.receivableOverdue');
    expect(financeSource).toContain('value: summary.expenses');
    expect(financeSource).toContain('const [receivableStatusTotals, setReceivableStatusTotals]');
    expect(financeSource).toContain('pendingReceivables.pagination.total');
    expect(financeSource).not.toContain(
      'const receivableTotals = clientReceivableTotals(receivables);',
    );
  });

  it('uses server pagination for billing while preserving summary KPIs and filter resets', () => {
    expect(billingSource).toContain('getBillingSummary()');
    expect(billingSource).toContain('listBillingDispatches(filters)');
    expect(billingSource).toContain('pageSize: listPageSize');
    expect(billingSource.match(/setPage\(1\);/g)).toHaveLength(3);
    expect(billingSource).toContain('itemLabel="cobranças"');
    expect(billingSource).toContain('setPage(Math.max(1, nextDispatches.pagination.totalPages))');
    expect(dashboardSource).toContain('Enviar agora');
    expect(dashboardSource).toContain('await reconcileBilling();');
  });

  it('uses server pagination for waitlist while preserving summary KPIs and approval flow', () => {
    expect(waitlistSource).toContain('getWhatsAppPendingContactsSummary()');
    expect(waitlistSource).toContain('listWhatsAppPendingContacts(filters)');
    expect(waitlistSource).toContain('const total = pagination?.total ?? contacts.length;');
    expect(waitlistSource).toContain('pageSize: listPageSize');
    expect(waitlistSource.match(/setPage\(1\);/g)).toHaveLength(2);
    expect(waitlistSource).toContain('itemLabel="contatos"');
    expect(waitlistSource).toContain('setPage(Math.max(1, nextContacts.pagination.totalPages))');
    expect(dashboardSource).toContain('function ApprovePendingContactModal');
    expect(dashboardSource).toContain('approveWhatsAppPendingContact(contact.id, {');
  });
});
