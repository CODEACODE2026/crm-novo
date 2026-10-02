import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const clientFinanceTabSource = dashboardSource.slice(
  dashboardSource.indexOf("{detailTab === 'receivables' ? ("),
  dashboardSource.indexOf("{detailTab === 'messages' ? ("),
);
const clientBillingTabSource = dashboardSource.slice(
  dashboardSource.indexOf("{detailTab === 'messages' ? ("),
  dashboardSource.indexOf('{selectedDispatch ? ('),
);
const clientDetailMobileSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (max-width: 620px)'),
  stylesSource.lastIndexOf('@media (max-width: 480px)'),
);
const clientDetailCompactSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (max-width: 480px)'),
);

describe('MOBILE1 responsiveness guardrails', () => {
  it('keeps the responsive strategy consolidated around tablet, mobile and compact mobile', () => {
    expect(stylesSource).toContain('@media (max-width: 980px)');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('@media (max-width: 480px)');
    expect(stylesSource).toContain('overflow-x: hidden;');
    expect(stylesSource).toContain('min-width: 0;');
  });

  it('keeps dashboard filters and actions wrap-friendly without removing existing controls', () => {
    expect(dashboardSource).toContain('Hoje');
    expect(dashboardSource).toContain('Mês atual');
    expect(dashboardSource).toContain('Mês anterior');
    expect(dashboardSource).toContain('Últimos 30 dias');
    expect(dashboardSource).toContain('Personalizado');
    expect(dashboardSource).toContain('Novo cliente');
    expect(dashboardSource).toContain('Entrada');
    expect(dashboardSource).toContain('Recebíveis');
    expect(stylesSource).toContain('.period-controls');
    expect(stylesSource).toContain('flex-wrap: wrap;');
    expect(stylesSource).toContain('flex: 1 1 120px;');
  });

  it('contains tables in responsive wrappers instead of allowing page-level horizontal scroll', () => {
    expect(dashboardSource).toContain('className="table-wrap finance-table-wrap"');
    expect(dashboardSource).toContain('className="table-wrap referrals-table-wrap"');
    expect(dashboardSource).toContain('className="clients-table"');
    expect(stylesSource).toContain('.table-wrap');
    expect(stylesSource).toContain('max-width: 100%;');
    expect(stylesSource).toContain('overflow-x: auto;');
    expect(stylesSource).toContain('-webkit-overflow-scrolling: touch;');
  });

  it('keeps client tabs accessible with controlled horizontal scrolling on mobile', () => {
    expect(dashboardSource).toContain('Visão geral');
    expect(dashboardSource).toContain('Referências');
    expect(dashboardSource).toContain('Financeiro');
    expect(dashboardSource).toContain('Cobranças/PIX');
    expect(dashboardSource).toContain('Histórico');
    expect(dashboardSource).toContain('Mais');
    expect(stylesSource).toContain('.tabs {');
    expect(stylesSource).toContain('overflow-x: auto;');
    expect(stylesSource).toContain('.tabs button');
    expect(stylesSource).toContain('flex: 0 0 auto;');
  });

  it('keeps the Clients module compact and card-based on mobile without changing desktop tables', () => {
    expect(dashboardSource).toContain('className="clients-page-header"');
    expect(dashboardSource).toContain('className="clients-new-mobile-label"');
    expect(dashboardSource).toContain('className="client-mobile-card-meta"');
    expect(dashboardSource).toContain('className="client-mobile-whatsapp-action"');
    expect(dashboardSource).toContain('placeholder="Buscar por nome, referência ou telefone..."');
    expect(dashboardSource).toContain('Todos os status');
    expect(dashboardSource).toContain('Todos os planos');
    expect(dashboardSource).toContain('onClick={() => void onSelect(client)}');
    expect(dashboardSource).toContain('clientReferenceSummary(references)');
    expect(dashboardSource).toContain('clientPlanSummary(references)');
    expect(dashboardSource).toContain('{client.phoneNormalized}');
    expect(dashboardSource).toContain('event.stopPropagation();');
    expect(dashboardSource).toContain('setWhatsAppClient(client);');
    expect(dashboardSource).toContain('pagination={clientsPagination}');
    expect(dashboardSource).toContain("clients: 'Base de clientes, referências e histórico'");
    expect(stylesSource).toContain(".app-shell[data-active-view='clients'] .topbar");
    expect(stylesSource).toContain('.clients-page-header .page-header > div:first-child');
    expect(stylesSource).toContain('.clients-list-view .toolbar');
    expect(stylesSource).toContain('@media (max-width: 370px)');
    expect(stylesSource).toContain('.clients-table thead,');
    expect(stylesSource).toContain('.clients-table tbody tr');
    expect(stylesSource).toContain('.client-mobile-card-meta');
    expect(stylesSource).toContain('.client-mobile-whatsapp-action');
  });

  it('keeps the client detail compact on mobile while preserving renewal and reactivation actions', () => {
    expect(dashboardSource).toContain('className="client-detail-back-button"');
    expect(dashboardSource).toContain('className="client-detail-renew-action"');
    expect(dashboardSource).toContain('className="client-detail-whatsapp-action"');
    expect(dashboardSource).toContain('className="client-detail-edit-action"');
    expect(dashboardSource).toContain('className="client-detail-more-action"');
    expect(dashboardSource).toContain('referenceLifecycleActionLabel(uniqueSelectedReference)');
    expect(dashboardSource).toContain(
      "return isReactivationReference(reference) ? 'Reativar' : 'Renovar';",
    );
    expect(stylesSource).toContain('.client-detail-header .client-avatar.large');
    expect(stylesSource).toContain('.client-detail-actions {');
    expect(stylesSource).toContain(
      'grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) 38px 38px;',
    );
    expect(stylesSource).toContain('.client-detail-kpis {');
    expect(stylesSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(stylesSource).toContain('.client-detail-view .tabs');
    expect(stylesSource).toContain('flex-wrap: nowrap;');
    expect(stylesSource).toContain('overflow-x: auto;');
    expect(stylesSource).toContain('text-overflow: ellipsis;');
  });

  it('keeps client finance and billing KPIs as compact 2x2 grids on mobile', () => {
    expect(clientFinanceTabSource).toContain('className="client-tab-summary"');
    expect(clientFinanceTabSource).toContain('label="A receber"');
    expect(clientFinanceTabSource).toContain("clientFinanceSummary?.pendingAmount ?? '0.00'");
    expect(clientFinanceTabSource).toContain('label="Pago"');
    expect(clientFinanceTabSource).toContain("clientFinanceSummary?.paidAmount ?? '0.00'");
    expect(clientFinanceTabSource).toContain('label="Vencido"');
    expect(clientFinanceTabSource).toContain("clientFinanceSummary?.overdueAmount ?? '0.00'");
    expect(clientFinanceTabSource).toContain('label="Cancelado"');
    expect(clientFinanceTabSource).toContain("clientFinanceSummary?.canceledAmount ?? '0.00'");
    expect(clientFinanceTabSource).toContain('className="toolbar finance-toolbar"');
    expect(clientFinanceTabSource.indexOf('className="client-tab-summary"')).toBeLessThan(
      clientFinanceTabSource.indexOf('className="toolbar finance-toolbar"'),
    );
    expect(clientFinanceTabSource).toContain('Todas as referências');
    expect(clientFinanceTabSource).toContain('Todas as situações');
    expect(clientFinanceTabSource).toContain('pagination={clientFinancePagination}');

    expect(clientBillingTabSource).toContain('className="client-tab-summary"');
    expect(clientBillingTabSource).toContain('label="Agendadas"');
    expect(clientBillingTabSource).toContain('clientBillingSummary?.scheduled ?? 0');
    expect(clientBillingTabSource).toContain('label="Enviadas"');
    expect(clientBillingTabSource).toContain('clientBillingSummary?.sent ?? 0');
    expect(clientBillingTabSource).toContain('label="Falhas"');
    expect(clientBillingTabSource).toContain('clientBillingSummary?.failed ?? 0');
    expect(clientBillingTabSource).toContain('label="PIX vinculados"');
    expect(clientBillingTabSource).toContain('clientPixSummary.summary.total');
    expect(clientBillingTabSource).toContain('className="toolbar finance-toolbar"');
    expect(clientBillingTabSource.indexOf('className="client-tab-summary"')).toBeLessThan(
      clientBillingTabSource.indexOf('className="toolbar finance-toolbar"'),
    );
    expect(clientBillingTabSource).toContain('Todas as referências');
    expect(clientBillingTabSource).toContain('Todos os status');
    expect(clientBillingTabSource).toContain('pagination={clientBillingPagination}');

    expect(clientDetailMobileSource).toContain('.client-tab-summary {');
    expect(clientDetailMobileSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(clientDetailMobileSource).toContain('.client-tab-summary .metric-card');
    expect(clientDetailMobileSource).toContain('min-width: 0;');
    expect(clientDetailMobileSource).toContain('min-height: 72px;');
    expect(clientDetailMobileSource).toContain('padding: 10px;');
    expect(clientDetailMobileSource).toContain('.client-tab-panel .finance-toolbar');
    expect(clientDetailMobileSource).toContain('margin-bottom: 0;');
    expect(clientDetailCompactSource).toContain('.client-tab-summary {');
    expect(clientDetailCompactSource).toContain('gap: 7px;');
    expect(clientDetailCompactSource).toContain('font-size: clamp(13px, 4.4vw, 15px);');
    expect(clientDetailCompactSource).not.toContain(
      '.client-tab-summary {\n    grid-template-columns: 1fr;',
    );
  });

  it('uses mobile-safe modal sizing and PIX content wrapping', () => {
    expect(dashboardSource).toContain('function PixReceivableModal');
    expect(dashboardSource).toContain('function PixReceivablesModal');
    expect(dashboardSource).toContain('className="pix-copy-row"');
    expect(dashboardSource).toContain('className="pix-qr"');
    expect(stylesSource).toContain('max-height: calc(100dvh - 20px);');
    expect(stylesSource).toContain('.pix-copy-row');
    expect(stylesSource).toContain('overflow-wrap: anywhere;');
    expect(stylesSource).toContain('.pix-qr img');
    expect(stylesSource).toContain('width: min(160px, 100%);');
  });
});
