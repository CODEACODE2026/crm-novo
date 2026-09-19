'use client';

import React from 'react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    className = '',
    icon: Icon,
    label,
    size = 'md',
    title,
    type = 'button',
    variant = 'ghost',
    ...props
  },
  ref,
) {
  return (
    <button
      aria-label={label}
      className={`ui-icon-button ui-icon-button-${variant} ui-icon-button-${size} ${className}`.trim()}
      ref={ref}
      title={title ?? label}
      type={type}
      {...props}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 14 : 16} />
    </button>
  );
});

export interface ActionMenuItem {
  danger?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  label: string;
  onSelect: () => void;
}

const actionMenuOpenEvent = 'crm-action-menu-open';
const actionMenuViewportMargin = 8;
const actionMenuGap = 6;
const actionMenuFallbackSize = { height: 160, width: 192 };

type ActionMenuLayer = 'modal' | 'normal';

interface ActionMenuPosition {
  left: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
  top: number;
}

export function getActionMenuPageNumbers(page: number, totalPages: number) {
  if (totalPages <= 1) return [1];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page]);
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let current = start; current <= end; current += 1) {
    pages.add(current);
  }

  const ordered = [...pages].sort((left, right) => left - right);
  return ordered.reduce<Array<number | 'ellipsis'>>((result, current, index) => {
    const previous = ordered[index - 1];
    if (previous && current - previous > 1) {
      result.push('ellipsis');
    }
    result.push(current);
    return result;
  }, []);
}

export function getPaginationRange({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total <= 0) return { from: 0, to: 0 };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

export function calculateActionMenuPosition({
  menuHeight,
  menuWidth,
  triggerRect,
  viewportHeight,
  viewportMargin = actionMenuViewportMargin,
  viewportWidth,
}: {
  menuHeight: number;
  menuWidth: number;
  triggerRect: Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>;
  viewportHeight: number;
  viewportMargin?: number;
  viewportWidth: number;
}): ActionMenuPosition {
  const safeMenuWidth = Math.min(menuWidth, Math.max(80, viewportWidth - viewportMargin * 2));
  const preferredLeft = triggerRect.right - safeMenuWidth;
  const left = Math.min(
    Math.max(preferredLeft, viewportMargin),
    Math.max(viewportMargin, viewportWidth - viewportMargin - safeMenuWidth),
  );
  const spaceBelow = viewportHeight - triggerRect.bottom - actionMenuGap - viewportMargin;
  const spaceAbove = triggerRect.top - actionMenuGap - viewportMargin;
  const opensAbove = menuHeight > spaceBelow && spaceAbove > spaceBelow;
  const availableHeight = Math.max(opensAbove ? spaceAbove : spaceBelow, 80);
  const maxHeight = Math.max(80, Math.min(menuHeight, availableHeight));
  const top = opensAbove
    ? Math.max(viewportMargin, triggerRect.top - actionMenuGap - maxHeight)
    : Math.min(triggerRect.bottom + actionMenuGap, viewportHeight - viewportMargin - maxHeight);

  return {
    left,
    maxHeight,
    placement: opensAbove ? 'top' : 'bottom',
    top: Math.max(viewportMargin, top),
  };
}

function getActionMenuLayer(trigger: HTMLElement | null): ActionMenuLayer {
  return trigger?.closest('.modal') ? 'modal' : 'normal';
}

export function ActionMenu({
  items,
  label = 'Mais ações',
}: {
  items: ActionMenuItem[];
  label?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<ActionMenuLayer>('normal');
  const [position, setPosition] = useState<ActionMenuPosition | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function updatePosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();

    setLayer(getActionMenuLayer(trigger));
    setPosition(
      calculateActionMenuPosition({
        menuHeight: menuRect?.height ?? actionMenuFallbackSize.height,
        menuWidth: menuRect?.width ?? actionMenuFallbackSize.width,
        triggerRect,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      }),
    );
  }

  useEffect(() => {
    if (!open) return undefined;

    function closeOnPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function closeOnKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function closeMenu() {
      setOpen(false);
    }

    window.setTimeout(updatePosition, 0);
    document.addEventListener('pointerdown', closeOnPointerDown, true);
    document.addEventListener('keydown', closeOnKeyDown);
    window.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown, true);
      document.removeEventListener('keydown', closeOnKeyDown);
      window.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [open]);

  useEffect(() => {
    function closeOtherMenus(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) {
        setOpen(false);
      }
    }

    window.addEventListener(actionMenuOpenEvent, closeOtherMenus);
    return () => window.removeEventListener(actionMenuOpenEvent, closeOtherMenus);
  }, [id]);

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`action-menu-portal action-menu-portal-${layer}`}
            data-placement={position?.placement ?? 'bottom'}
            ref={menuRef}
            role="menu"
            style={
              position
                ? {
                    left: position.left,
                    maxHeight: position.maxHeight,
                    top: position.top,
                  }
                : undefined
            }
          >
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="action-menu">
      <IconButton
        aria-expanded={open}
        aria-haspopup="menu"
        icon={Ellipsis}
        label={label}
        ref={triggerRef}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => {
            const nextOpen = !value;
            if (nextOpen) {
              window.dispatchEvent(new CustomEvent(actionMenuOpenEvent, { detail: id }));
              updatePosition();
              window.setTimeout(updatePosition, 0);
            }
            return nextOpen;
          });
        }}
      />
      {panel}
    </div>
  );
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function PaginationControls({
  itemLabel = 'registros',
  onPageChange,
  pagination,
}: {
  itemLabel?: string;
  onPageChange: (page: number) => void;
  pagination: PaginationMeta | null;
}) {
  if (!pagination) return null;

  const totalPages = Math.max(1, pagination.totalPages);
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  const { from, to } = getPaginationRange({
    page,
    pageSize: pagination.pageSize,
    total: pagination.total,
  });
  const pages = getActionMenuPageNumbers(page, totalPages);
  const showPages = totalPages > 1;

  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="pagination-summary">
        Mostrando {from}-{to} de {pagination.total} {itemLabel}
      </span>
      {showPages ? (
        <div className="pagination-actions">
          <button
            className="secondary-button pagination-button"
            disabled={page <= 1}
            type="button"
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </button>
          <div className="pagination-pages">
            {pages.map((item, index) =>
              item === 'ellipsis' ? (
                <span className="pagination-ellipsis" key={`ellipsis-${index}`} aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  aria-current={item === page ? 'page' : undefined}
                  className="pagination-page-button"
                  disabled={item === page}
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </button>
              ),
            )}
          </div>
          <button
            className="secondary-button pagination-button"
            disabled={page >= totalPages}
            type="button"
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
          </button>
        </div>
      ) : null}
    </nav>
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
