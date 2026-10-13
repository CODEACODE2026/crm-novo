type DashboardLocationView = 'conversations' | 'clients';

type DashboardLocation =
  | {
      contactPanelOpen?: boolean;
      conversationId?: string | null;
      view: 'conversations';
    }
  | {
      clientId?: string | null;
      receivableId?: string | null;
      tab?: string | null;
      view: 'clients';
    };

export function buildExactDashboardQueryPath(
  pathname: string,
  params: Record<string, string | null | undefined>,
) {
  const nextParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    nextParams.set(key, value);
  });

  const query = nextParams.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}

export function buildDashboardLocationPath(pathname: string, location: DashboardLocation) {
  if (location.view === 'conversations') {
    return buildExactDashboardQueryPath(pathname, {
      view: 'conversations',
      conversationId: location.conversationId,
      contactPanel: location.contactPanelOpen ? 'open' : null,
    });
  }

  return buildExactDashboardQueryPath(pathname, {
    view: 'clients',
    clientId: location.clientId,
    tab: location.tab,
    receivableId:
      location.tab === 'receivables' && location.clientId ? location.receivableId : null,
  });
}

export function parseDashboardView(params: URLSearchParams): DashboardLocationView | null {
  const view = params.get('view');
  return view === 'conversations' || view === 'clients' ? view : null;
}

export function parseDashboardLocation(params: URLSearchParams): DashboardLocation | null {
  const view = parseDashboardView(params);

  if (view === 'conversations') {
    return {
      contactPanelOpen: params.get('contactPanel') === 'open',
      conversationId: params.get('conversationId')?.trim() || null,
      view,
    };
  }

  if (view === 'clients') {
    return {
      clientId: params.get('clientId')?.trim() || null,
      receivableId: params.get('receivableId')?.trim() || null,
      tab: params.get('tab')?.trim() || null,
      view,
    };
  }

  return null;
}

export function isDashboardClientLocation(
  params: URLSearchParams,
  clientId?: string,
  tab?: string,
) {
  const location = parseDashboardLocation(params);
  if (location?.view !== 'clients') return false;
  if (clientId && location.clientId !== clientId) return false;
  if (tab && location.tab !== tab) return false;
  return true;
}

export function isDashboardConversationLocation(params: URLSearchParams, conversationId?: string) {
  const location = parseDashboardLocation(params);
  if (location?.view !== 'conversations') return false;
  if (conversationId && location.conversationId !== conversationId) return false;
  return true;
}
