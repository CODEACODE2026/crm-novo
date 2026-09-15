'use client';

import React from 'react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Ellipsis, type LucideIcon } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className = '',
  disabled,
  icon: Icon,
  loading = false,
  size = 'md',
  type = 'button',
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button-${variant} ui-button-${size} ${className}`.trim()}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={size === 'sm' ? 14 : 16} /> : null}
      <span>{loading ? 'Carregando...' : children}</span>
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  size?: ButtonSize;
  variant?: Extract<ButtonVariant, 'secondary' | 'ghost' | 'danger'>;
}

export function IconButton({
  className = '',
  icon: Icon,
  label,
  size = 'md',
  title,
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={`ui-icon-button ui-icon-button-${variant} ui-icon-button-${size} ${className}`.trim()}
      title={title ?? label}
      type={type}
      {...props}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 14 : 16} />
    </button>
  );
}

export interface ActionMenuItem {
  danger?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  onSelect: () => void;
}

export function ActionMenu({
  items,
  label = 'Mais ações',
}: {
  items: ActionMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeOnClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', closeOnClick);
    return () => document.removeEventListener('mousedown', closeOnClick);
  }, [open]);

  return (
    <div className="action-menu" ref={menuRef}>
      <IconButton
        aria-expanded={open}
        aria-haspopup="menu"
        icon={Ellipsis}
        label={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      />
      {open ? (
        <div className="action-menu-panel" role="menu">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`action-menu-item ${item.danger ? 'danger' : ''}`.trim()}
                disabled={item.disabled}
                key={item.label}
                role="menuitem"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon ? <Icon aria-hidden="true" size={14} /> : null}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`.trim()}>{children}</section>;
}

export function SectionHeader({
  action,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="panel-header section-header">
      <div>
        {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  tone = 'neutral',
  value,
}: {
  icon?: LucideIcon;
  label: string;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  value: ReactNode;
}) {
  return (
    <article className={`metric-card compact stat-card tone-${tone}`}>
      <div className="stat-card-top">
        <span className="metric-label">{label}</span>
        {Icon ? (
          <span className="stat-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
        ) : null}
      </div>
      <strong className="metric-value">{value}</strong>
    </article>
  );
}
