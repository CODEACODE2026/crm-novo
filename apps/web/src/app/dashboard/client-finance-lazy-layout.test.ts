import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const clientsServiceSource = readFileSync(
  join(currentDir, '../../../../api/src/clients/clients.service.ts'),
  'utf8',
);
const clientsSource = dashboardSource.slice(
  dashboardSource.indexOf('function ClientsView'),
  dashboardSource.indexOf('function ReferenceStatusConfirmationModal'),
);
const clientFinanceSource = clientsSource.slice(
  clientsSource.indexOf("{detailTab === 'receivables' ? ("),
  clientsSource.indexOf("{detailTab === 'messages' ? ("),
);

describe('phase E2A client finance lazy loading source', () => {
  it('loads client finance only when the Financeiro tab is opened', () => {
    expect(clientsSource).toContain(
      "if (!selectedClientId || detailTab !== 'receivables') return;",
    );
    expect(clientsSource).toContain('void loadClientFinance();');
    expect(clientsSource).toContain('const loadClientFinance = useCallback(async () => {');
    expect(clientsSource).toContain('listReceivables({');
    expect(clientsSource).toContain('getReceivablesSummary(baseFilters)');
  });

  it('keeps the client finance table independent from selectedClient.receivables', () => {
    expect(clientsSource).toContain('const [clientFinanceItems, setClientFinanceItems]');
    expect(clientsSource).toContain('const [clientFinanceSummary, setClientFinanceSummary]');
    expect(clientFinanceSource).toContain('clientFinanceItems.map((receivable)');
    expect(clientFinanceSource).toContain('clientFinanceSummary?.pendingAmount');
    expect(clientFinanceSource).not.toContain('selectedReceivables.map((receivable)');
    expect(clientFinanceSource).not.toContain('receivableTotals.pending');
  });

  it('uses server-side client filters, monthly period and page size ten', () => {
    expect(clientsSource).toContain('clientId: selectedClientId');
    expect(clientsSource).toContain('clientReferenceId: clientFinanceReferenceId');
    expect(clientsSource).toContain('startDate: clientFinancePeriod.startDate');
    expect(clientsSource).toContain('endDate: clientFinancePeriod.endDate');
    expect(clientsSource).toContain('page: clientFinancePage');
    expect(clientsSource).toContain('pageSize: listPageSize');
    expect(clientFinanceSource).toContain('Todas as referências');
    expect(clientFinanceSource).toContain('Todas as situações');
    expect(clientFinanceSource).toContain('finance-period-bar');
  });

  it('keeps summary independent from table status and pagination', () => {
    expect(clientsSource).toContain('const baseFilters = {');
    expect(clientsSource).toContain('status: clientFinanceStatus');
    expect(clientsSource).toContain('getReceivablesSummary(baseFilters)');
    expect(clientFinanceSource).not.toContain('getReceivablesSummary({');
    expect(clientFinanceSource).toContain('pagination={clientFinancePagination}');
    expect(clientFinanceSource).toContain('onPageChange={setClientFinancePage}');
  });

  it('clears client finance state and current-page selection on safe boundaries', () => {
    expect(clientsSource).toContain('setClientFinanceItems([]);');
    expect(clientsSource).toContain('setClientFinancePagination(null);');
    expect(clientsSource).toContain('setClientFinanceSummary(null);');
    expect(clientsSource).toContain('setClientFinancePeriod(currentFinancePeriod());');
    expect(clientsSource).toContain('setClientFinanceReferenceId');
    expect(clientsSource).toContain('setClientFinanceStatus');
    expect(clientsSource).toContain('setSelectedReceivableIds([]);');
    expect(clientsSource).toContain('clientFinancePage');
    expect(clientsSource).toContain('clientFinanceReferenceId');
    expect(clientsSource).toContain('clientFinanceStatus');
  });

  it('keeps client detail payload free from embedded receivables after E2B', () => {
    const getClientSource = clientsServiceSource.slice(
      clientsServiceSource.indexOf('async get(id: string)'),
      clientsServiceSource.indexOf('async listEvents'),
    );

    expect(getClientSource).not.toContain('receivables: {');
    expect(getClientSource).not.toContain('paymentIntents');
    expect(dashboardSource).toContain('listPaymentIntents(receivable.id)');
  });
});
