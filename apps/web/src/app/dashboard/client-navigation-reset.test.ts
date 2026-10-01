import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const dashboardPageSource = dashboardSource.slice(
  dashboardSource.indexOf('export default function DashboardPage'),
  dashboardSource.indexOf('function viewTitle'),
);
const primaryNavigationSource = dashboardPageSource.slice(
  dashboardPageSource.indexOf('function handlePrimaryNavigation'),
  dashboardPageSource.indexOf('async function handleReferenceStatusChange'),
);
const clientResetSource = dashboardPageSource.slice(
  dashboardPageSource.indexOf('function resetClientDetailState'),
  dashboardPageSource.indexOf('function handlePrimaryNavigation'),
);
const clientsViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function ClientsView'),
  dashboardSource.indexOf('function ReferenceStatusConfirmationModal'),
);

describe('NAVIGATION2 client module reset', () => {
  it('routes main menu navigation through the client reset boundaries', () => {
    expect(dashboardPageSource).toContain('onNavigate={handlePrimaryNavigation}');
    expect(primaryNavigationSource).toContain("if (nextView === 'clients')");
    expect(primaryNavigationSource).toContain('resetClientModuleState();');
    expect(primaryNavigationSource).toContain("} else if (view === 'clients') {");
    expect(primaryNavigationSource).toContain('resetClientDetailState();');
    expect(primaryNavigationSource).toContain('setView(nextView);');
  });

  it('clears client detail state for module exits and direct client module resets', () => {
    expect(clientResetSource).toContain('setSelectedClient(null);');
    expect(clientResetSource).toContain('setEditingClient(null);');
    expect(clientResetSource).toContain('setClientFormOpen(false);');
    expect(clientResetSource).toContain('setRenewalTarget(null);');
    expect(clientResetSource).toContain('setReactivationTarget(null);');
    expect(clientResetSource).toContain('setRenewalReversalTarget(null);');
    expect(clientResetSource).toContain('setRenewalReversalPreviewLoadingId(null);');
    expect(clientResetSource).toContain('setDeletionTarget(null);');
    expect(clientResetSource).toContain("setRenewalNotice('');");
    expect(clientResetSource).toContain('setClientDetailTabRequest(null);');
  });

  it('resets client list search filters and pagination to project defaults', () => {
    expect(clientResetSource).toContain('function resetClientListState()');
    expect(clientResetSource).toContain("setSearch('');");
    expect(clientResetSource).toContain("setStatus('');");
    expect(clientResetSource).toContain("setPlanId('');");
    expect(clientResetSource).toContain('setClientsPage(1);');
    expect(clientResetSource).toContain('function resetClientModuleState()');
    expect(clientResetSource).toContain('resetClientDetailState();');
    expect(clientResetSource).toContain('resetClientListState();');
  });

  it('keeps NAVIGATION1 behavior when leaving clients for another module', () => {
    expect(primaryNavigationSource).toContain("} else if (view === 'clients') {");
    expect(primaryNavigationSource).toContain('resetClientDetailState();');
    expect(primaryNavigationSource).toContain('setView(nextView);');
  });

  it('resets newly opened clients to overview without hijacking same-client tab navigation', () => {
    expect(clientsViewSource).toContain('const [detailTab, setDetailTab] = useState<');
    expect(clientsViewSource).toContain("setDetailTab('overview');");
    expect(clientsViewSource).toContain('}, [selectedClientId]);');
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('overview')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('references')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('receivables')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('messages')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('timeline')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('more')}");
    expect(clientsViewSource).not.toContain('handlePrimaryNavigation');
  });

  it('keeps explicit client opens able to select a fresh client after reset', () => {
    expect(dashboardPageSource).toContain('onSelect={async (client) => {');
    expect(dashboardPageSource).toContain('const detailed = await getClient(client.id);');
    expect(dashboardPageSource).toContain('setSelectedClient(detailed);');
    expect(dashboardPageSource).toContain('onClearSelection={() => setSelectedClient(null)}');
  });
});
