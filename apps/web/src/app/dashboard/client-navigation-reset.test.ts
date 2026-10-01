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

describe('NAVIGATION1 client detail reset', () => {
  it('routes main menu navigation through the client reset boundary', () => {
    expect(dashboardPageSource).toContain('onNavigate={handlePrimaryNavigation}');
    expect(primaryNavigationSource).toContain("if (view === 'clients' && nextView !== 'clients')");
    expect(primaryNavigationSource).toContain('resetClientDetailState();');
    expect(primaryNavigationSource).toContain('setView(nextView);');
  });

  it('clears client detail state without resetting client list filters', () => {
    expect(clientResetSource).toContain('setSelectedClient(null);');
    expect(clientResetSource).toContain('setEditingClient(null);');
    expect(clientResetSource).toContain('setClientFormOpen(false);');
    expect(clientResetSource).toContain('setRenewalTarget(null);');
    expect(clientResetSource).toContain('setReactivationTarget(null);');
    expect(clientResetSource).toContain('setRenewalReversalTarget(null);');
    expect(clientResetSource).toContain('setRenewalReversalPreviewLoadingId(null);');
    expect(clientResetSource).toContain('setDeletionTarget(null);');
    expect(clientResetSource).toContain("setRenewalNotice('');");
    expect(clientResetSource).not.toContain('setSearch');
    expect(clientResetSource).not.toContain('setStatus');
    expect(clientResetSource).not.toContain('setPlanId');
    expect(clientResetSource).not.toContain('setClientsPage');
  });

  it('keeps client detail tabs as internal state that does not use primary navigation', () => {
    expect(clientsViewSource).toContain('const [detailTab, setDetailTab] = useState<');
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('references')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('receivables')}");
    expect(clientsViewSource).toContain("onClick={() => setDetailTab('timeline')}");
    expect(clientsViewSource).not.toContain('handlePrimaryNavigation');
  });

  it('keeps explicit client opens able to select a fresh client after reset', () => {
    expect(dashboardPageSource).toContain('onSelect={async (client) => {');
    expect(dashboardPageSource).toContain('const detailed = await getClient(client.id);');
    expect(dashboardPageSource).toContain('setSelectedClient(detailed);');
    expect(dashboardPageSource).toContain('onClearSelection={() => setSelectedClient(null)}');
  });
});
