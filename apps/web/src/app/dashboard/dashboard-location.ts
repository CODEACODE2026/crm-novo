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
