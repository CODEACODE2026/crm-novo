import { describe, expect, it } from 'vitest';
import {
  buildDashboardLocationPath,
  buildExactDashboardQueryPath,
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
});
