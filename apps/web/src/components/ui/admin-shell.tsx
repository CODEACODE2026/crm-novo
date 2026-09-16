'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, type LucideIcon, PanelLeftClose, PanelLeftOpen, User } from 'lucide-react';

export interface AdminNavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface AdminShellProps<T extends string> {
  activeId: T;
  children: ReactNode;
  collapsed: boolean;
  disabledItems?: ReadonlyArray<{ label: string; icon: LucideIcon }>;
  items: ReadonlyArray<AdminNavItem<T>>;
  onNavigate: (id: T) => void;
  onToggleCollapsed: () => void;
  subtitle?: string;
  title: string;
  userName?: string | undefined;
}

export function AdminShell<T extends string>({
  activeId,
  children,
  collapsed,
  disabledItems = [],
  items,
  onNavigate,
  onToggleCollapsed,
  subtitle,
  title,
  userName,
}: AdminShellProps<T>) {
  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark">CN</span>
            <span className="brand-copy">
              <strong>CRM Novo</strong>
              <small>Admin Suite</small>
            </span>
          </div>
          <button
            aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
            className="icon-button sidebar-collapse"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            type="button"
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={16} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={16} />
            )}
          </button>
        </div>

        <nav className="nav-list">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-current={activeId === item.id ? 'page' : undefined}
                className={`nav-item ${activeId === item.id ? 'active' : ''}`}
                key={item.id}
                title={collapsed ? item.label : undefined}
                type="button"
                onClick={() => onNavigate(item.id)}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
          {disabledItems.map((item) => {
            const Icon = item.icon;
            return (
              <span
                className="nav-item muted"
                key={item.label}
                title={collapsed ? item.label : undefined}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </span>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="profile-avatar" aria-hidden="true">
            {userName?.slice(0, 1).toUpperCase() || 'A'}
          </span>
          <span className="profile-copy">
            <strong>{userName || 'Admin'}</strong>
            <small>Perfil</small>
          </span>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <span className="breadcrumb">
              <ChevronLeft aria-hidden="true" size={13} />
              CRM Novo
            </span>
            <div>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
          </div>
          <div className="topbar-actions">
            <span className="topbar-user">
              <User aria-hidden="true" size={15} />
              {userName || 'Admin'}
            </span>
          </div>
        </header>

        <section className="content">{children}</section>
      </main>
    </div>
  );
}

export function PageHeader({
  actions,
  eyebrow,
  icon: Icon,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <span className="page-eyebrow">{eyebrow}</span> : null}
        <h2 className={Icon ? 'page-title-with-icon' : undefined}>
          {Icon ? <Icon aria-hidden="true" size={20} /> : null}
          {title}
        </h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
