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

describe('AdminShell mobile navigation', () => {
  it('renders desktop navigation landmarks and a mobile menu trigger', () => {
    const html = renderToStaticMarkup(
      <AdminShell
        activeId="dashboard"
        collapsed={false}
        items={[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'clients', label: 'Clientes', icon: Users },
        ]}
        title="Dashboard"
        onNavigate={() => undefined}
        onToggleCollapsed={() => undefined}
      >
        <div>Conteúdo</div>
      </AdminShell>,
    );

    expect(html).toContain('aria-label="Navegação principal"');
    expect(html).toContain('aria-label="Abrir menu"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Clientes');
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
