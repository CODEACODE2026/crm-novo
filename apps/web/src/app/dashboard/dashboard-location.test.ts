import { describe, expect, it } from 'vitest';
import {
  buildDashboardLocationPath,
  buildExactDashboardQueryPath,
  isDashboardClientLocation,
  isDashboardConversationLocation,
  parseDashboardLocation,
  parseDashboardView,
} from './dashboard-location';

describe('dashboard location helpers', () => {
  it('builds a canonical WhatsApp conversation URL without financial params', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        contactPanelOpen: true,
        conversationId: 'conversation-b',
        view: 'conversations',
      }),
    ).toBe('/dashboard?view=conversations&conversationId=conversation-b&contactPanel=open');

    expect(
      buildExactDashboardQueryPath('/dashboard', {
        view: 'conversations',
        conversationId: 'conversation-b',
        contactPanel: null,
        clientId: null,
        receivableId: null,
        returnContactPanel: null,
        returnConversationId: null,
        returnView: null,
        tab: null,
      }),
    ).toBe('/dashboard?view=conversations&conversationId=conversation-b');
  });

  it('models A to billing to B to refresh with B as the only restored context', () => {
    const billingA = buildExactDashboardQueryPath('/dashboard', {
      view: 'clients',
      clientId: 'client-a',
      tab: 'receivables',
      receivableId: 'receivable-a',
      returnView: 'conversations',
      returnConversationId: 'conversation-a',
      returnContactPanel: 'open',
    });
    expect(billingA).toContain('clientId=client-a');
    expect(billingA).toContain('receivableId=receivable-a');

    const returnedA = buildDashboardLocationPath('/dashboard', {
      contactPanelOpen: true,
      conversationId: 'conversation-a',
      view: 'conversations',
    });
    expect(returnedA).toBe(
      '/dashboard?view=conversations&conversationId=conversation-a&contactPanel=open',
    );

    const selectedB = buildDashboardLocationPath('/dashboard', {
      contactPanelOpen: true,
      conversationId: 'conversation-b',
      view: 'conversations',
    });
    expect(selectedB).toBe(
      '/dashboard?view=conversations&conversationId=conversation-b&contactPanel=open',
    );
    expect(selectedB).not.toContain('client-a');
    expect(selectedB).not.toContain('receivable-a');
    expect(selectedB).not.toContain('return');

    const refreshParams = new URLSearchParams(selectedB.split('?')[1]);
    expect(parseDashboardView(refreshParams)).toBe('conversations');
    expect(refreshParams.get('conversationId')).toBe('conversation-b');
    expect(refreshParams.get('contactPanel')).toBe('open');
    expect(refreshParams.get('clientId')).toBeNull();
    expect(refreshParams.get('receivableId')).toBeNull();
    expect(refreshParams.get('tab')).toBeNull();
  });

  it('keeps A in conversations after closing billing and refreshing without switching conversations', () => {
    const returnedA = buildDashboardLocationPath('/dashboard', {
      contactPanelOpen: true,
      conversationId: 'conversation-a',
      view: 'conversations',
    });

    const refreshParams = new URLSearchParams(returnedA.split('?')[1]);
    expect(parseDashboardView(refreshParams)).toBe('conversations');
    expect(refreshParams.get('conversationId')).toBe('conversation-a');
    expect(refreshParams.get('contactPanel')).toBe('open');
    expect(refreshParams.get('clientId')).toBeNull();
    expect(refreshParams.get('receivableId')).toBeNull();
    expect(refreshParams.get('tab')).toBeNull();
  });

  it('removes contactPanel from the canonical URL after the drawer is closed', () => {
    const drawerClosed = buildDashboardLocationPath('/dashboard', {
      contactPanelOpen: false,
      conversationId: 'conversation-a',
      view: 'conversations',
    });

    expect(drawerClosed).toBe('/dashboard?view=conversations&conversationId=conversation-a');

    const refreshParams = new URLSearchParams(drawerClosed.split('?')[1]);
    expect(refreshParams.get('contactPanel')).toBeNull();
  });

  it('keeps the drawer closed when returning to conversations after leaving the inbox', () => {
    const returnedFromClients = buildDashboardLocationPath('/dashboard', {
      conversationId: 'conversation-a',
      view: 'conversations',
    });

    expect(returnedFromClients).toBe('/dashboard?view=conversations&conversationId=conversation-a');
    expect(new URLSearchParams(returnedFromClients.split('?')[1]).get('contactPanel')).toBeNull();
  });

  it('drops contact panel params from non-conversation module URLs', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-a',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-a');

    expect(
      buildExactDashboardQueryPath('/dashboard', {
        view: 'finance',
        contactPanel: null,
        conversationId: null,
        returnContactPanel: null,
      }),
    ).toBe('/dashboard?view=finance');

    expect(
      buildExactDashboardQueryPath('/dashboard', {
        view: null,
        contactPanel: null,
        conversationId: null,
        returnContactPanel: null,
      }),
    ).toBe('/dashboard');
  });

  it('keeps conversations authoritative when a mixed financial query is manually provided', () => {
    const mixedParams = new URLSearchParams(
      'view=conversations&conversationId=conversation-b&clientId=client-a&receivableId=receivable-a&tab=receivables',
    );

    expect(parseDashboardView(mixedParams)).toBe('conversations');
    expect(
      buildDashboardLocationPath('/dashboard', {
        conversationId: mixedParams.get('conversationId'),
        view: 'conversations',
      }),
    ).toBe('/dashboard?view=conversations&conversationId=conversation-b');
  });

  it('keeps normal client receivable URLs canonical for direct financial restore', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-a',
        receivableId: 'receivable-a',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-a&tab=receivables&receivableId=receivable-a');
  });

  it('builds canonical client detail URLs for WhatsApp and menu opens', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-a',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-a');

    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-a',
        tab: 'receivables',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-a&tab=receivables');
  });

  it('keeps client and conversation locations separate when switching contexts', () => {
    const clientFinance = buildDashboardLocationPath('/dashboard', {
      clientId: 'client-a',
      tab: 'receivables',
      view: 'clients',
    });
    expect(clientFinance).toBe('/dashboard?view=clients&clientId=client-a&tab=receivables');
    expect(clientFinance).not.toContain('conversationId');
    expect(clientFinance).not.toContain('contactPanel');

    const conversation = buildDashboardLocationPath('/dashboard', {
      contactPanelOpen: true,
      conversationId: 'conversation-a',
      view: 'conversations',
    });
    expect(conversation).toBe(
      '/dashboard?view=conversations&conversationId=conversation-a&contactPanel=open',
    );
    expect(conversation).not.toContain('clientId');
    expect(conversation).not.toContain('tab=');
  });

  it('does not include a receivable without the clients receivables context', () => {
    expect(
      buildDashboardLocationPath('/dashboard', {
        clientId: 'client-a',
        receivableId: 'receivable-a',
        tab: 'overview',
        view: 'clients',
      }),
    ).toBe('/dashboard?view=clients&clientId=client-a&tab=overview');
  });

  it('parses dashboard locations for URL/state consistency guards', () => {
    expect(
      parseDashboardLocation(
        new URLSearchParams('view=clients&clientId=client-a&tab=receivables&receivableId=r1'),
      ),
    ).toEqual({
      clientId: 'client-a',
      receivableId: 'r1',
      tab: 'receivables',
      view: 'clients',
    });

    expect(
      parseDashboardLocation(
        new URLSearchParams('view=conversations&conversationId=conversation-b&contactPanel=open'),
      ),
    ).toEqual({
      contactPanelOpen: true,
      conversationId: 'conversation-b',
      view: 'conversations',
    });
  });

  it('guards stale client and conversation callbacks against the current URL', () => {
    const clientParams = new URLSearchParams(
      'view=clients&clientId=client-a&tab=receivables&receivableId=r1',
    );
    expect(isDashboardClientLocation(clientParams, 'client-a')).toBe(true);
    expect(isDashboardClientLocation(clientParams, 'client-a', 'receivables')).toBe(true);
    expect(isDashboardClientLocation(clientParams, 'client-b')).toBe(false);
    expect(isDashboardConversationLocation(clientParams)).toBe(false);

    const conversationParams = new URLSearchParams(
      'view=conversations&conversationId=conversation-b&contactPanel=open',
    );
    expect(isDashboardConversationLocation(conversationParams, 'conversation-b')).toBe(true);
    expect(isDashboardConversationLocation(conversationParams, 'conversation-a')).toBe(false);
    expect(isDashboardClientLocation(conversationParams, 'client-a')).toBe(false);
  });

  it('keeps a stale financial callback from reopening a client after conversation navigation', () => {
    const financialActionStartedAt = new URLSearchParams(
      'view=clients&clientId=client-a&tab=receivables&receivableId=r1',
    );
    const locationAfterUserNavigation = new URLSearchParams(
      'view=conversations&conversationId=conversation-b&contactPanel=open',
    );

    expect(isDashboardClientLocation(financialActionStartedAt, 'client-a')).toBe(true);
    expect(isDashboardClientLocation(locationAfterUserNavigation, 'client-a')).toBe(false);
    expect(isDashboardConversationLocation(locationAfterUserNavigation, 'conversation-b')).toBe(
      true,
    );
  });

  it('allows the normal client financial callback while the URL still matches that client', () => {
    const locationAfterFinancialAction = new URLSearchParams(
      'view=clients&clientId=client-a&tab=receivables&receivableId=r1',
    );

    expect(isDashboardClientLocation(locationAfterFinancialAction, 'client-a')).toBe(true);
    expect(isDashboardClientLocation(locationAfterFinancialAction, 'client-a', 'receivables')).toBe(
      true,
    );
    expect(isDashboardConversationLocation(locationAfterFinancialAction)).toBe(false);
  });

  it('keeps URL and render target consistency mutually exclusive', () => {
    function renderTargetFor(params: URLSearchParams) {
      if (isDashboardConversationLocation(params)) return 'conversations';
      if (isDashboardClientLocation(params)) return 'clients';
      return null;
    }

    const conversationParams = new URLSearchParams(
      'view=conversations&conversationId=conversation-b&clientId=client-a',
    );
    const clientParams = new URLSearchParams(
      'view=clients&clientId=client-a&conversationId=conversation-b',
    );

    expect(renderTargetFor(conversationParams)).toBe('conversations');
    expect(isDashboardClientLocation(conversationParams)).toBe(false);
    expect(renderTargetFor(clientParams)).toBe('clients');
    expect(isDashboardConversationLocation(clientParams)).toBe(false);
  });
});
