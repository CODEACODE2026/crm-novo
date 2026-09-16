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

  it('renders the operational summary with existing frontend metrics and no global client status', () => {
    expect(dashboardSource).toContain('Resumo operacional');
    expect(dashboardSource).toContain('Situação atual do cliente');
    expect(dashboardSource).toContain('<ClientSectionHeading');
    expect(dashboardSource).toContain('client-summary-status-row');
    expect(dashboardSource).not.toMatch(
      /<StatusBadge\s+status=\{uniqueSelectedReference\?\.status \?\? selectedClient\.status\}\s+\/>/,
    );
    expect(dashboardSource).toContain('referenceCounts.active');
    expect(dashboardSource).toContain('formatCurrency(receivableTotals.pending)');
    expect(dashboardSource).toContain('formatCurrency(receivableTotals.paid)');
    expect(dashboardSource).toContain('clientNextDueSummary(selectedReferences)');
    expect(stylesSource).toContain('.client-summary-metrics');
    expect(stylesSource).toContain('.metric-value-primary');
    expect(stylesSource).toContain('.metric-value-success');
    expect(stylesSource).toContain('.metric-value-info');
  });

  it('does not render the legacy aggregated client status in the detail header', () => {
    expect(dashboardSource).toContain('<h2>{selectedClient.name}</h2>');
    expect(dashboardSource).toContain(
      '<span>{clientReferenceCountLabel(selectedReferences.length)}</span>',
    );
    expect(dashboardSource).toContain('<span>WhatsApp: {selectedClient.phoneNormalized}</span>');
    expect(dashboardSource).toContain(
      '<span>Cliente desde {formatDate(selectedClient.createdAt)}</span>',
    );
    expect(dashboardSource).not.toMatch(
      /<StatusBadge\s+status=\{uniqueSelectedReference\?\.status \?\? selectedClient\.status\}\s+\/>/,
    );
  });

  it('keeps reference and receivable statuses bound to their operational sources', () => {
    expect(dashboardSource).toContain('<StatusBadge status={reference.status} />');
    expect(dashboardSource).toContain('{receivable.displayStatus}');
    expect(dashboardSource).toContain("receivable.status === 'PENDENTE'");
  });

  it('uses a shared overview section heading primitive with fixed icon geometry', () => {
    expect(dashboardSource).toContain('function ClientSectionHeading');
    expect(dashboardSource).toContain('client-overview-heading-copy');
    expect(dashboardSource).toContain('client-overview-heading-action');
    expect(dashboardSource.match(/<ClientSectionHeading/g)).toHaveLength(3);
    expect(stylesSource).toContain('.client-overview-heading .section-icon');
    expect(stylesSource).toContain('flex: 0 0 32px;');
    expect(stylesSource).toContain('width: 32px;');
    expect(stylesSource).toContain('height: 32px;');
    expect(stylesSource).toContain('.client-overview-heading .section-icon svg');
    expect(stylesSource).toContain('width: 16px;');
    expect(stylesSource).toContain('height: 16px;');
  });

  it('renders the client list situation from reference status summaries', () => {
    expect(dashboardSource).toContain('<th>SITUAÇÃO</th>');
    expect(dashboardSource).toContain('items={clientReferenceStatusSummary(client)}');
    expect(dashboardSource).toContain('Situação baseada nas referências do cliente.');
    expect(stylesSource).toContain('.reference-status-summary');
    expect(stylesSource).toContain('.reference-status-item.tone-success');
    expect(stylesSource).toContain('.reference-status-item.tone-warning');
    expect(stylesSource).toContain('.reference-status-item.tone-info');
    expect(stylesSource).toContain('.reference-status-item.tone-danger');
    expect(dashboardSource).not.toContain('clientDisplayStatus(client)');
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

  it('centers finance and billing status/actions with dedicated table columns', () => {
    expect(dashboardSource).toContain('className="finance-status-column">Situação');
    expect(dashboardSource).toContain('className="finance-status-column">Status');
    expect(dashboardSource).toContain('<td className="finance-status-column">');
    expect(dashboardSource).toContain('className="finance-actions-column">Ações');
    expect(dashboardSource).toContain('<td className="finance-actions-column">');
    expect(dashboardSource).toContain('className="finance-select-column"');
    expect(dashboardSource).toContain('className="finance-amount-column"');
    expect(stylesSource).toContain('.finance-status-column');
    expect(stylesSource).toContain('text-align: center;');
    expect(stylesSource).toContain('justify-content: center;');
    expect(stylesSource).toContain('min-width: 76px;');
    expect(stylesSource).toContain('vertical-align: middle;');
  });

  it('filters recovery dispatches out of the Cobranças/PIX tab only', () => {
    expect(dashboardSource).toContain('selectedBillingDispatches = selectedDispatches.filter');
    expect(dashboardSource).toContain('summarizeClientBillingDispatches(selectedDispatches)');
    expect(dashboardSource).toContain('selectedBillingDispatches.map((dispatch)');
    expect(dashboardSource).toContain('selectedClient.recoveryCampaigns ?? []');
  });
});
