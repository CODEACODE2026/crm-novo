import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const loginSource = readFileSync(join(currentDir, '../login/page.tsx'), 'utf8');
const inboxSource = readFileSync(
  join(currentDir, '../../components/whatsapp/WhatsAppInbox.tsx'),
  'utf8',
);

describe('CHAT22 mobile Inbox history and authentication', () => {
  it('creates list and conversation history entries without replacing the dashboard entry', () => {
    expect(dashboardSource).toContain('function pushDashboardLocation(');
    expect(dashboardSource).toContain('window.history.pushState(');
    expect(dashboardSource).toContain('setWhatsAppConversationListLocation();');
    expect(dashboardSource).toContain("pushDashboardLocation(location, 'conversation')");
    expect(dashboardSource).toContain("'conversations-list'");
    expect(dashboardSource).toContain(
      'currentParams && isDashboardConversationLocation(currentParams) && currentConversationId',
    );
    expect(dashboardSource).toContain('replaceDashboardLocation(location);');
  });

  it('restores conversation, list, and dashboard state from scoped popstate navigation', () => {
    expect(dashboardSource).toContain(
      "window.addEventListener('popstate', handleDashboardPopState)",
    );
    expect(dashboardSource).toContain(
      "window.removeEventListener('popstate', handleDashboardPopState)",
    );
    expect(dashboardSource).toContain(
      'const location = parseDashboardLocation(new URLSearchParams(window.location.search))',
    );
    expect(dashboardSource).toContain('conversationId: location.conversationId ?? null');
    expect(dashboardSource).toContain("setView('dashboard')");
    expect(dashboardSource).toContain("setView('conversations')");
  });

  it('uses browser history for app-created back actions and safe local fallbacks for deep links', () => {
    expect(dashboardSource).toContain('const handleBackToWhatsAppConversationList = useCallback');
    expect(dashboardSource).toContain("currentDashboardHistoryState() === 'conversation'");
    expect(dashboardSource).toContain("currentDashboardHistoryState() === 'conversations-list'");
    expect(dashboardSource).toContain('const state: unknown = window.history.state;');
    expect(dashboardSource).toContain('window.history.back();');
    expect(dashboardSource).toContain(
      "replaceDashboardLocation({ view: 'conversations', conversationId: null })",
    );
    expect(dashboardSource).toContain(
      'onBackToConversationList={handleBackToWhatsAppConversationList}',
    );
    expect(inboxSource).toContain('onBack={onBackToConversationList}');
  });

  it('clears the selected conversation when history returns to the Inbox list', () => {
    expect(inboxSource).toContain('conversationId: string | null;');
    expect(inboxSource).toContain('if (!request.conversationId)');
    expect(inboxSource).toContain('activeConversationIdRef.current = null;');
    expect(inboxSource).toContain('setSelectedConversation(null);');
    expect(inboxSource).toContain("setMobileMode('list');");
    expect(inboxSource).toContain('onRestoreRequestConsumed?.(request.sequence);');
  });

  it('redirects only confirmed unauthorized session responses to login', () => {
    expect(dashboardSource).toContain('response.status === 401 || response.status === 403');
    expect(dashboardSource).toContain("window.location.replace('/login')");
    expect(dashboardSource).toContain("if (!response.ok) throw new Error('Falha temporária");
    expect(dashboardSource).not.toContain("catch {\n        window.location.assign('/login')");
  });

  it('keeps abort, network, and temporary failures recoverable without bypassing authentication', () => {
    expect(dashboardSource).toContain('const controller = new AbortController();');
    expect(dashboardSource).toContain("err.name === 'AbortError'");
    expect(dashboardSource).toContain('controller.abort();');
    expect(dashboardSource).toContain('setSessionError(');
    expect(dashboardSource).toContain('setSessionReloadSequence((current) => current + 1)');
    expect(dashboardSource).toContain('Não foi possível validar sua sessão');
  });

  it('replaces the login route after login and redirects an already authenticated visitor', () => {
    expect(loginSource).toContain("fetch(buildApiUrl('/auth/me')");
    expect(loginSource).toContain("router.replace('/dashboard')");
    expect(loginSource).not.toContain("window.location.assign('/dashboard')");
    expect(loginSource).toContain('const controller = new AbortController();');
    expect(loginSource).toContain('controller.abort();');
  });
});
