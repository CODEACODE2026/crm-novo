import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const clientsSource = dashboardSource.slice(
  dashboardSource.indexOf('function ClientsView'),
  dashboardSource.indexOf('function ReferenceStatusConfirmationModal'),
);
const clientBillingSource = clientsSource.slice(
  clientsSource.indexOf("{detailTab === 'messages' ? ("),
  clientsSource.indexOf('{selectedDispatch ? ('),
);

describe('phase E3B client billing lazy loading source', () => {
  it('loads client billing only when the Cobranças/PIX tab is opened', () => {
    expect(clientsSource).toContain("if (!selectedClientId || detailTab !== 'messages') return;");
    expect(clientsSource).toContain('void loadClientPixSummary();');
    expect(clientsSource).toContain('void loadClientBillingDispatches();');
    expect(clientsSource).toContain('void loadClientBillingSummary();');
    expect(clientsSource).toContain('const loadClientBillingDispatches = useCallback(');
    expect(clientsSource).toContain('const loadClientBillingSummary = useCallback(async () => {');
    expect(clientsSource).toContain('listBillingDispatches(filters)');
    expect(clientsSource).toContain('getBillingDispatchSummary(baseFilters)');
    expect(clientsSource).not.toContain(
      'void Promise.all([loadClientPixSummary(), loadClientBilling()]);',
    );
  });

  it('keeps client billing independent from embedded selectedClient.messageDispatches', () => {
    expect(clientsSource).toContain('const [clientBillingDispatches, setClientBillingDispatches]');
    expect(clientsSource).toContain('const [clientBillingSummary, setClientBillingSummary]');
    expect(clientBillingSource).toContain('clientBillingDispatches.map((dispatch)');
    expect(clientBillingSource).toContain('clientBillingSummary?.scheduled');
    expect(clientBillingSource).not.toContain('selectedClient?.messageDispatches');
    expect(clientBillingSource).not.toContain('summarizeClientBillingDispatches');
  });

  it('uses server-side client billing filters and page size ten', () => {
    expect(clientsSource).toContain('clientId: selectedClientId');
    expect(clientsSource).toContain('clientReferenceId: clientBillingReferenceId');
    expect(clientsSource).toContain('pageOverride = clientBillingPage');
    expect(clientsSource).toContain('pageSize: listPageSize');
    expect(clientsSource).toContain('status: clientBillingStatus');
    expect(clientBillingSource).toContain('Todas as referências');
    expect(clientBillingSource).toContain('Todos os status');
    expect(clientBillingSource).toContain('pagination={clientBillingPagination}');
    expect(clientBillingSource).toContain('onPageChange={setClientBillingPage}');
  });

  it('keeps client billing summary independent from table status and pagination', () => {
    expect(clientsSource).toContain('const baseFilters = {');
    expect(clientsSource).toContain('status: clientBillingStatus');
    expect(clientsSource).toContain('getBillingDispatchSummary(baseFilters)');
    expect(clientBillingSource).not.toContain('getBillingDispatchSummary({');
    expect(clientsSource).toContain('}, [clientBillingReferenceId, selectedClientId]);');
  });

  it('does not refetch PIX summary when billing page, status or reference changes', () => {
    const pixEffectSource = clientsSource.slice(
      clientsSource.indexOf('void loadClientPixSummary();'),
      clientsSource.indexOf('void loadClientBillingDispatches();'),
    );

    expect(pixEffectSource).toContain('[detailTab, loadClientPixSummary, selectedClientId]');
    expect(pixEffectSource).not.toContain('clientBillingPage');
    expect(pixEffectSource).not.toContain('clientBillingStatus');
    expect(pixEffectSource).not.toContain('clientBillingReferenceId');
  });

  it('keeps billing list reloads separate from summary reloads', () => {
    expect(clientsSource).toContain(
      '[clientBillingPage, clientBillingReferenceId, clientBillingStatus, selectedClientId]',
    );
    expect(clientsSource).toContain('[clientBillingReferenceId, selectedClientId]');
    expect(clientsSource).toContain('void loadClientBillingDispatches();');
    expect(clientsSource).toContain('void loadClientBillingSummary();');
    expect(clientBillingSource).not.toContain('getPaymentIntentsSummary');
  });

  it('clears client billing state on safe boundaries', () => {
    expect(clientsSource).toContain('setClientBillingDispatches([]);');
    expect(clientsSource).toContain('setClientBillingPagination(null);');
    expect(clientsSource).toContain('setClientBillingSummary(null);');
    expect(clientsSource).toContain("setClientBillingReferenceId('');");
    expect(clientsSource).toContain("setClientBillingStatus('');");
    expect(clientsSource).toContain('setSelectedDispatch(null);');
    expect(clientsSource).toContain('clientBillingPage');
    expect(clientsSource).toContain('clientBillingReferenceId');
    expect(clientsSource).toContain('clientBillingStatus');
  });
});
