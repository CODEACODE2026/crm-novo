import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { LayoutDashboard, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { AdminShell } from './admin-shell';

const currentDir = dirname(fileURLToPath(import.meta.url));
const shellSource = readFileSync(resolve(currentDir, 'admin-shell.tsx'), 'utf8');
const stylesSource = readFileSync(resolve(currentDir, '../../app/globals.css'), 'utf8');
const mobileStylesSource = stylesSource.slice(stylesSource.indexOf('@media (max-width: 980px)'));

function cssRule(selector: string, source = stylesSource) {
  const ruleStart = source.indexOf(`${selector} {`);
  if (ruleStart < 0) return '';

  const declarationsStart = source.indexOf('{', ruleStart) + 1;
  return source.slice(declarationsStart, source.indexOf('}', declarationsStart));
}

describe('AdminShell mobile navigation', () => {
  it('renders desktop navigation landmarks and a mobile menu trigger', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        activeId="dashboard"
        collapsed={false}
        items={[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: 3 },
          { id: 'clients', label: 'Clientes', icon: Users },
        ]}
        title="Dashboard"
        userName="Turbo"
        onNavigate={() => undefined}
        onToggleCollapsed={() => undefined}
      >
        <div>Conteúdo</div>
      </AdminShell>,
    );

    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('aria-label="Abrir menu"');
    expect(html).toContain('data-active-view="dashboard"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('CN');
    expect(html).toContain('CRM Novo');
    expect(html).toContain('Admin Suite');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Clientes');
    expect(html).toContain('3 mensagens não lidas em Dashboard');
    expect(html).toContain('Turbo');
    expect(html).toContain('Perfil');
  });

  it('keeps collapsed navigation accessible while hiding visual badges', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        activeId="conversations"
        collapsed
        items={[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'conversations', label: 'Conversas', icon: Users, badge: '99+' },
        ]}
        title="Conversas"
        onNavigate={() => undefined}
        onToggleCollapsed={() => undefined}
      >
        <div>Conteúdo</div>
      </AdminShell>,
    );

    expect(html).toContain('99+');
    expect(html).toContain('aria-label="99+ mensagens não lidas em Conversas"');
    expect(html).toContain('aria-label="Conversas"');
    expect(html).toContain('title="Conversas"');
    expect(stylesSource).toContain('.app-shell.is-collapsed .nav-item-badge');
    expect(stylesSource).toContain('display: none;');
  });

  it('uses a stable icon-only desktop sidebar without leaking collapsed styles into mobile', () => {
    expect(cssRule('.app-shell')).toContain('grid-template-columns: 232px minmax(0, 1fr);');
    expect(cssRule('.app-shell.is-collapsed')).toContain(
      'grid-template-columns: 74px minmax(0, 1fr);',
    );
    expect(cssRule('.sidebar')).toContain('overflow-x: hidden;');
    expect(cssRule('.app-shell.is-collapsed .sidebar-header')).toContain('justify-items: center;');
    expect(cssRule('.app-shell.is-collapsed .sidebar-collapse')).toContain('position: static;');
    expect(cssRule('.app-shell.is-collapsed .nav-item')).toContain('width: 100%;');
    expect(cssRule('.app-shell.is-collapsed .nav-item')).toContain('justify-content: center;');
    expect(cssRule('.app-shell.is-collapsed .nav-item-badge')).toContain('display: none;');
    expect(cssRule('.app-shell.is-collapsed .sidebar-footer')).toContain(
      'justify-content: center;',
    );
    expect(cssRule('.app-shell.is-collapsed .sidebar-header', mobileStylesSource)).toContain(
      'display: flex;',
    );
    expect(cssRule('.app-shell.is-collapsed .nav-item-badge', mobileStylesSource)).toContain(
      'display: inline-grid;',
    );
    expect(cssRule('.app-shell.is-collapsed .sidebar-footer', mobileStylesSource)).toContain(
      'justify-content: flex-start;',
    );
  });

  it('renders repeated controlled collapse cycles without stale shell state', () => {
    function renderShell(collapsed: boolean) {
      return renderToStaticMarkup(
        <AdminShell
          activeId="dashboard"
          collapsed={collapsed}
          items={[{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, badge: 3 }]}
          title="Dashboard"
          userName="Turbo"
          onNavigate={() => undefined}
          onToggleCollapsed={() => undefined}
        >
          <div>Conteúdo</div>
        </AdminShell>,
      );
    }

    const expanded = renderShell(false);
    const collapsed = renderShell(true);

    expect(expanded).not.toContain('app-shell is-collapsed');
    expect(expanded).toContain('aria-label="Recolher menu lateral"');
    expect(expanded).toContain('CRM Novo');
    expect(expanded).toContain('Admin Suite');
    expect(expanded).toContain('Turbo');
    expect(collapsed).toContain('app-shell is-collapsed');
    expect(collapsed).toContain('aria-label="Expandir menu lateral"');
    expect(collapsed).toContain('aria-label="Dashboard"');
    expect(collapsed).toContain('title="Dashboard"');
    expect(renderShell(false)).toBe(expanded);
    expect(renderShell(true)).toBe(collapsed);
  });

  it('keeps mobile drawer behavior in the shell instead of the dashboard page', () => {
    expect(shellSource).toContain('const [mobileMenuOpen, setMobileMenuOpen] = useState(false)');
    expect(shellSource).toContain("event.key === 'Escape'");
    expect(shellSource).toContain('setMobileMenuOpen(false)');
    expect(shellSource).toContain('function handleNavigate(id: T)');
    expect(shellSource).toContain('onNavigate(id);');
    expect(shellSource).toContain('className="sidebar-backdrop"');
    expect(shellSource).toContain('className="icon-button topbar-menu-button"');
    expect(shellSource).toContain('className="icon-button sidebar-mobile-close"');
    expect(shellSource).toContain('data-active-view={activeId}');
    expect(shellSource).toContain('aria-label={`Usuário ${userName ||');
  });

  it('uses an off-canvas sidebar below the tablet breakpoint while preserving desktop columns', () => {
    expect(stylesSource).toContain('grid-template-columns: 232px minmax(0, 1fr);');
    expect(stylesSource).toContain('.app-shell.is-collapsed');
    expect(stylesSource).toContain('@media (max-width: 980px)');
    expect(stylesSource).toContain('position: fixed;');
    expect(stylesSource).toContain('height: 100dvh;');
    expect(stylesSource).toContain('transform: translateX(-105%);');
    expect(stylesSource).toContain('.app-shell.mobile-menu-open .sidebar');
    expect(stylesSource).toContain('.app-shell.mobile-menu-open .sidebar-backdrop');
    expect(stylesSource).toContain('.topbar-menu-button');
  });
});
