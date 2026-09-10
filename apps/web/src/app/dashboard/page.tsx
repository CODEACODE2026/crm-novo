'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  RefreshCcw,
  Settings,
  Users,
} from 'lucide-react';
import type { AuthenticatedUser } from '@crm-novo/shared';
import { buildApiUrl } from '../../lib/api';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Clientes', icon: Users },
  { label: 'Renovacoes', icon: RefreshCcw },
  { label: 'Financeiro', icon: CreditCard },
  { label: 'Cobrancas', icon: Bell },
  { label: 'WhatsApp', icon: MessageCircle },
  { label: 'Relatorios', icon: BarChart3 },
  { label: 'Configuracoes', icon: Settings },
];

const metrics = [
  { label: 'Clientes ativos', value: '-' },
  { label: 'A receber', value: '-' },
  { label: 'Vencimentos hoje', value: '-' },
  { label: 'Pendentes WhatsApp', value: '-' },
];

export default function DashboardPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch(buildApiUrl('/auth/me'), { credentials: 'include' });

        if (!response.ok) {
          window.location.assign('/login');
          return;
        }

        const payload = (await response.json()) as { user: AuthenticatedUser };
        setUser(payload.user);
      } catch {
        window.location.assign('/login');
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, []);

  if (loading) {
    return (
      <main className="login-page">
        <section className="login-panel">Carregando area administrativa...</section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navegacao principal">
        <div className="brand">
          <span className="brand-mark">C</span>
          <span>CRM Novo</span>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <span className={`nav-item ${item.active ? 'active' : ''}`} key={item.label}>
                <Icon aria-hidden="true" size={18} />
                {item.label}
              </span>
            );
          })}
        </nav>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <h1>Dashboard</h1>
          <span className="topbar-user">{user?.name}</span>
        </header>

        <section className="content">
          <div className="metric-grid">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <span className="metric-label">{metric.label}</span>
                <strong className="metric-value">{metric.value}</strong>
              </article>
            ))}
          </div>

          <div className="status-row">
            <span className="status-pill">Fundacao tecnica</span>
            <span className="status-pill">Autenticacao inicial</span>
            <span className="status-pill">Layout administrativo</span>
          </div>

          <section className="panel">
            <h2>Base operacional pronta para evoluir</h2>
            <p>
              Esta tela e estrutural. Dados reais de clientes, financeiro, cobrancas e WhatsApp
              entram nas proximas Sprints homologadas.
            </p>
          </section>
        </section>
      </main>
    </div>
  );
}
