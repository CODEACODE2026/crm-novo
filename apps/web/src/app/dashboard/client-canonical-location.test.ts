import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildDashboardLocationPath } from './dashboard-location';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const dashboardPageSource = dashboardSource.slice(
  dashboardSource.indexOf('export default function DashboardPage'),
  dashboardSource.indexOf('function viewTitle'),
);
const restoreEffectSource = dashboardPageSource.slice(
  dashboardPageSource.indexOf("if (requestedView === 'conversations')"),
  dashboardPageSource.indexOf('return () => {'),
);
const clientsViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function ClientsView'),
  dashboardSource.indexOf('function ReferenceStatusConfirmationModal'),
);
const whatsAppOpenClientSource = dashboardPageSource.slice(
  dashboardPageSource.indexOf('onOpenClient={async (clientId, options) => {'),
  dashboardPageSource.indexOf("        {view === 'finance' ? ("),
);

describe('CHAT7 CONTACTINFO7 canonical client location', () => {
  it('opens clients from WhatsApp into the canonical client URL', () => {
    expect(whatsAppOpenClientSource).toContain('const client = await getClient(clientId);');
    expect(whatsAppOpenClientSource).toContain('setSelectedClient(client);');
    expect(whatsAppOpenClientSource).toContain(
      'setClientDetailLocation(clientId, options?.tab, options?.receivable?.id);',
    );
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x');
  });

  it('models list, detail, receivables tab, and receivable deep-link URLs with the helper', () => {
    expect(buildDashboardLocationPath('/dashboard', { view: 'clients' })).toBe(
      '/dashboard?view=clients',
    );
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x');
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x&tab=receivables');
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        receivableId: 'receivable-y',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x&tab=receivables&receivableId=receivable-y');
  });

  it('persists receivables tab changes in the canonical client URL', () => {
    expect(clientsViewSource).toContain('function selectDetailTab(tab: ClientDetailTab)');
    expect(clientsViewSource).toContain('onDetailTabChange(selectedClientId, tab);');
    expect(clientsViewSource).toContain("onClick={() => selectDetailTab('receivables')}");
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x&tab=receivables');
  });

  it('restores list, detail, and receivables detail states from client URLs', () => {
    expect(restoreEffectSource).toContain("if (requestedView !== 'clients')");
    expect(restoreEffectSource).toContain('if (!clientId)');
    expect(restoreEffectSource).toContain("setView('clients');");
    expect(restoreEffectSource).toContain('const restoredTab = clientDetailTabs.includes');
    expect(restoreEffectSource).toContain('getClient(restoredClientId)');
    expect(restoreEffectSource).toContain('tab: restoredTab');
  });

  it('falls back safely when a restored client URL cannot be loaded', () => {
    expect(restoreEffectSource).toContain('setSelectedClient(null);');
    expect(restoreEffectSource).toContain('setClientDetailTabRequest(null);');
    expect(restoreEffectSource).toContain("setView('clients');");
    expect(restoreEffectSource).toContain('Não foi possível restaurar o cliente selecionado.');
  });

  it('keeps generate and recreate PIX refreshes on the same client receivables route', () => {
    expect(dashboardPageSource).toContain('onFinancialMutation={async (clientId) => {');
    expect(dashboardPageSource).toContain('const detailed = await getClient(clientId);');
    expect(dashboardPageSource).toContain("setClientDetailLocation(clientId, 'receivables');");
    expect(clientsViewSource).toContain('await Promise.all([');
    expect(clientsViewSource).toContain('onFinancialMutation(selectedClient.id)');
  });

  it('keeps normal menu client opens and list fallback canonical', () => {
    expect(dashboardPageSource).toContain('onSelect={async (client) => {');
    expect(dashboardPageSource).toContain('setClientDetailLocation(client.id);');
    expect(dashboardPageSource).toContain('setClientListLocation();');
  });

  it('switches from one client to another without leaking the previous client tab', () => {
    const clientX = buildDashboardLocationPath('/dashboard', {
      clientId: 'client-x',
      tab: 'receivables',
      view: 'clients',
    });
    const list = buildDashboardLocationPath('/dashboard', { view: 'clients' });
    const clientY = buildDashboardLocationPath('/dashboard', {
      clientId: 'client-y',
      view: 'clients',
    });

    expect(clientX).toBe('/dashboard?view=clients&clientId=client-x&tab=receivables');
    expect(list).toBe('/dashboard?view=clients');
    expect(clientY).toBe('/dashboard?view=clients&clientId=client-y');
    expect(clientY).not.toContain('client-x');
    expect(clientY).not.toContain('tab=receivables');
  });

  it('does not mix conversation params into canonical client detail URLs', () => {
    const clientFinance = buildDashboardLocationPath('/dashboard', {
      clientId: 'client-x',
      tab: 'receivables',
      view: 'clients',
    });

    expect(clientFinance).not.toContain('conversationId');
    expect(clientFinance).not.toContain('contactPanel');
    expect(clientFinance).not.toContain('returnConversationId');
  });

  it('drops incompatible receivable params outside the clients receivables context', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-x',
        receivableId: 'receivable-y',
        tab: 'overview',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-x&tab=overview');

    expect(
      buildDashboardLocationPath('/dashboard', {
        receivableId: 'receivable-y',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&tab=receivables');
  });
});
