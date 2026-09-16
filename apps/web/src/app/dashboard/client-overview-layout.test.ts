import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

describe('client overview presentation source', () => {
  it('uses compact profile rows instead of the old large readonly field blocks', () => {
    expect(dashboardSource).toContain('client-info-grid');
    expect(dashboardSource).toContain('client-info-item');
    expect(dashboardSource).not.toContain('className="detail-list client-profile-list"');
    expect(dashboardSource).not.toContain('client-profile-list');
    expect(stylesSource).not.toContain('.client-profile-list');
  });

  it('shows missing email and notes with explicit muted copy', () => {
    expect(dashboardSource).toContain("value: selectedClient.email ?? 'Não informado'");
    expect(dashboardSource).toContain("{selectedClient.notes ?? 'Nenhuma observação cadastrada.'}");
    expect(stylesSource).toContain('.muted-value');
  });

  it('renders the operational summary with existing frontend metrics and status', () => {
    expect(dashboardSource).toContain('Resumo operacional');
    expect(dashboardSource).toContain('Situação atual do cliente');
    expect(dashboardSource).toContain('StatusBadge');
    expect(dashboardSource).toContain('referenceCounts.active');
    expect(dashboardSource).toContain('formatCurrency(receivableTotals.pending)');
    expect(dashboardSource).toContain('formatCurrency(receivableTotals.paid)');
    expect(dashboardSource).toContain('clientNextDueSummary(selectedReferences)');
    expect(stylesSource).toContain('.client-summary-metrics');
    expect(stylesSource).toContain('.metric-value-primary');
    expect(stylesSource).toContain('.metric-value-success');
    expect(stylesSource).toContain('.metric-value-info');
  });

  it('limits overview activity to five events and links to the full history tab', () => {
    expect(dashboardSource).toContain('(selectedClient.events ?? []).slice(0, 5)');
    expect(dashboardSource).toContain('Ver histórico completo');
    expect(dashboardSource).toContain("onClick={() => setDetailTab('timeline')}");
    expect(dashboardSource).toContain('Nenhuma atividade recente.');
  });

  it('keeps timeline icon wrappers centered without generic span overrides', () => {
    expect(stylesSource).toContain('flex: 0 0 28px;');
    expect(stylesSource).toContain('.client-timeline-icon svg,');
    expect(stylesSource).toContain('position: static;');
    expect(stylesSource).toContain('transform: none;');
    expect(stylesSource).toContain('.timeline li > div > span,');
    expect(stylesSource).not.toContain('.timeline span,');
  });

  it('filters recovery dispatches out of the Cobranças/PIX tab only', () => {
    expect(dashboardSource).toContain('selectedBillingDispatches = selectedDispatches.filter');
    expect(dashboardSource).toContain('summarizeClientBillingDispatches(selectedDispatches)');
    expect(dashboardSource).toContain('selectedBillingDispatches.map((dispatch)');
    expect(dashboardSource).toContain('selectedClient.recoveryCampaigns ?? []');
  });
});
