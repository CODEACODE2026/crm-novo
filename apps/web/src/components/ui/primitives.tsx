import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

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
