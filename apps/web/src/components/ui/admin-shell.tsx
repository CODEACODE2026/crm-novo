'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  Menu,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  X,
} from 'lucide-react';

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  function handleNavigate(id: T) {
    onNavigate(id);
    setMobileMenuOpen(false);
  }

  return (
    <div
      data-active-view={activeId}
      className={`app-shell ${collapsed ? 'is-collapsed' : ''} ${mobileMenuOpen ? 'mobile-menu-open' : ''}`}
    >
      <button
        aria-hidden={!mobileMenuOpen}
        aria-label="Fechar menu"
        className="sidebar-backdrop"
        tabIndex={mobileMenuOpen ? 0 : -1}
        type="button"
        onClick={() => setMobileMenuOpen(false)}
      />
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
          <button
            aria-label="Fechar menu"
            className="icon-button sidebar-mobile-close"
            type="button"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X aria-hidden="true" size={16} />
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
                onClick={() => handleNavigate(item.id)}
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
          <button
            aria-expanded={mobileMenuOpen}
            aria-label="Abrir menu"
            className="icon-button topbar-menu-button"
            type="button"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu aria-hidden="true" size={18} />
          </button>
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
            <span
              aria-label={`Usuário ${userName || 'Admin'}`}
              className="topbar-user"
              title={userName || 'Admin'}
            >
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
