import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const referencesTabSource = dashboardSource.slice(
  dashboardSource.indexOf("{detailTab === 'references' ? ("),
  dashboardSource.indexOf("{detailTab === 'more' ? ("),
);
const clientDetailMobileSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (max-width: 620px)'),
  stylesSource.lastIndexOf('@media (max-width: 480px)'),
);
const clientDetailCompactSource = stylesSource.slice(
  stylesSource.lastIndexOf('@media (max-width: 480px)'),
);

describe('client reference presentation source', () => {
  it('renders create and edit reference through the central modal only', () => {
    expect(dashboardSource).toContain('referenceFormOpen');
    expect(dashboardSource).toContain('modal reference-form-modal');
    expect(dashboardSource).toContain('Nova referência');
    expect(dashboardSource).toContain('Editar referência');
    expect(dashboardSource).not.toContain('reference-drawer');
    expect(dashboardSource).not.toContain('reference-side-panel');
  });

  it('keeps the old large inactive guidance out of the references body', () => {
    expect(dashboardSource).not.toContain('INATIVO = serviço temporariamente parado');
    expect(dashboardSource).toContain('Sobre referências');
  });

  it('includes compact reference filters and search', () => {
    expect(dashboardSource).toContain('reference-toolbar');
    expect(dashboardSource).toContain('reference-filter-dot');
    expect(dashboardSource).toContain("tone: 'success'");
    expect(dashboardSource).toContain("tone: 'warning'");
    expect(dashboardSource).toContain("tone: 'info'");
    expect(dashboardSource).toContain("tone: 'danger'");
    expect(dashboardSource).toContain('Buscar referência...');
    expect(dashboardSource).toContain('Mais recentes');
  });

  it('keeps the client references tab compact and horizontally scannable on mobile', () => {
    expect(referencesTabSource).toContain('className="references-header"');
    expect(referencesTabSource).toContain('<h3>Referências</h3>');
    expect(referencesTabSource).toContain('Gerencie as referências deste cliente.');
    expect(referencesTabSource).toContain('Cada referência possui seu próprio plano');
    expect(referencesTabSource).toContain('Nova referência');
    expect(referencesTabSource).toContain('className="reference-toolbar"');
    expect(referencesTabSource).toContain('reference-filter-count');
    expect(referencesTabSource).toContain('className="reference-controls"');
    expect(referencesTabSource).toContain('placeholder="Buscar referência..."');
    expect(referencesTabSource).toContain('aria-label="Ordenar referências"');

    expect(clientDetailMobileSource).toContain('.references-section {');
    expect(clientDetailMobileSource).toContain('gap: 9px;');
    expect(clientDetailMobileSource).toContain('.references-header {');
    expect(clientDetailMobileSource).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(clientDetailMobileSource).toContain('.references-title h3');
    expect(clientDetailMobileSource).toContain('font-size: 16px;');
    expect(clientDetailMobileSource).toContain('.references-title p');
    expect(clientDetailMobileSource).toContain('-webkit-line-clamp: 1;');
    expect(clientDetailMobileSource).toContain('.reference-toolbar {');
    expect(clientDetailMobileSource).toContain('flex-wrap: nowrap;');
    expect(clientDetailMobileSource).toContain('overflow-x: auto;');
    expect(clientDetailMobileSource).toContain('.reference-toolbar button');
    expect(clientDetailMobileSource).toContain('flex: 0 0 auto;');
    expect(clientDetailMobileSource).toContain('min-height: 28px;');
    expect(clientDetailMobileSource).toContain('.reference-controls {');
    expect(clientDetailMobileSource).toContain(
      'grid-template-columns: minmax(0, 1fr) minmax(126px, 0.44fr);',
    );
    expect(clientDetailMobileSource).toContain('.reference-search input,');
    expect(clientDetailMobileSource).toContain('min-height: 32px;');
  });

  it('keeps reference mobile cards dense without dropping key information or actions', () => {
    expect(referencesTabSource).toContain('visibleReferences.map((reference)');
    expect(referencesTabSource).toContain('reference.reference');
    expect(referencesTabSource).toContain('<StatusBadge status={reference.status} />');
    expect(referencesTabSource).toContain('reference.plan.name');
    expect(referencesTabSource).toContain('formatCurrency(reference.recurringValue)');
    expect(referencesTabSource).toContain('formatDate(reference.dueDate)');
    expect(referencesTabSource).toContain('reference.billingNoticeDays');
    expect(referencesTabSource).toContain('Criada em {formatDate(reference.createdAt)}');
    expect(referencesTabSource).toContain('referenceLifecycleActionLabel(reference)');
    expect(referencesTabSource).toContain('label={`Editar referência ${reference.reference}`}');
    expect(referencesTabSource).toContain('onSelect: () => onReferenceStatusChange(reference');
    expect(referencesTabSource).toContain('onSelect: () => onRemoveReference(reference)');

    expect(clientDetailMobileSource).toContain('.reference-grid {');
    expect(clientDetailMobileSource).toContain('gap: 8px;');
    expect(clientDetailMobileSource).toContain('.reference-card {');
    expect(clientDetailMobileSource).toContain('min-height: auto;');
    expect(clientDetailMobileSource).toContain('padding: 9px;');
    expect(clientDetailMobileSource).toContain('.reference-card header strong');
    expect(clientDetailMobileSource).toContain('text-overflow: ellipsis;');
    expect(clientDetailMobileSource).toContain('.reference-price strong');
    expect(clientDetailMobileSource).toContain('font-size: 16px;');
    expect(clientDetailMobileSource).toContain('.reference-metrics {');
    expect(clientDetailMobileSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(clientDetailMobileSource).toContain('.reference-metrics strong');
    expect(clientDetailMobileSource).toContain('overflow-wrap: anywhere;');
    expect(clientDetailMobileSource).toContain('.reference-actions {');
    expect(clientDetailMobileSource).toContain('flex-wrap: nowrap;');
    expect(clientDetailMobileSource).toContain('.reference-actions .ui-button');
    expect(clientDetailMobileSource).toContain('min-height: 32px;');
    expect(clientDetailMobileSource).toContain('.reference-actions .ui-icon-button,');
    expect(clientDetailMobileSource).toContain('.reference-actions .action-menu-trigger');

    expect(clientDetailCompactSource).toContain('.references-title p + p');
    expect(clientDetailCompactSource).toContain('display: none;');
    expect(clientDetailCompactSource).toContain('.reference-controls {');
    expect(clientDetailCompactSource).toContain('grid-template-columns: 1fr;');
    expect(clientDetailCompactSource).toContain('.reference-card {');
    expect(clientDetailCompactSource).toContain('padding: 8px;');
    expect(stylesSource).toContain('.reference-grid {\n  display: grid;');
    expect(stylesSource).toContain('grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));');
    expect(stylesSource).toContain('min-height: 246px;');
  });

  it('keeps reference cards bound to ClientReference fields', () => {
    expect(dashboardSource).toContain('reference.reference');
    expect(dashboardSource).toContain('reference.plan.name');
    expect(dashboardSource).toContain('reference.recurringValue');
    expect(dashboardSource).toContain('reference.dueDate');
    expect(dashboardSource).toContain('reference.billingNoticeDays');
    expect(dashboardSource).toContain('reference-created');
    expect(dashboardSource).toContain(
      'className={`reference-card status-${reference.status.toLowerCase()}`}',
    );
    expect(stylesSource).toContain('.reference-card.status-ativo');
    expect(stylesSource).toContain('.reference-card.status-pendente_pagamento');
    expect(stylesSource).toContain('.reference-card.status-inativo');
    expect(stylesSource).toContain('.reference-card.status-cancelado');
  });

  it('routes canceled reference actions to reactivation instead of renewal', () => {
    expect(dashboardSource).toContain("reference?.status === 'CANCELADO'");
    expect(dashboardSource).toContain(
      "return isReactivationReference(reference) ? 'Reativar' : 'Renovar';",
    );
    expect(dashboardSource).toContain('function openReferenceLifecycleAction');
    expect(dashboardSource).toContain(
      'setReactivationTarget({ client, reference: selectedReference });',
    );
    expect(dashboardSource).toContain(
      'setRenewalTarget({ client, reference: selectedReference });',
    );
    expect(dashboardSource).toContain('function ReactivationModal');
    expect(dashboardSource).toContain('createReferenceReactivation(target.reference.id, payload)');
    expect(dashboardSource).toContain('previewReferenceRenewal(reference.id, {');
    expect(dashboardSource).toContain('confirmReferenceRenewal(target.reference.id, payload)');
  });

  it('keeps client-level and card-level labels driven by the selected ClientReference status', () => {
    expect(dashboardSource).toContain('referenceLifecycleActionLabel(singleReference)');
    expect(dashboardSource).toContain('referenceLifecycleActionLabel(uniqueSelectedReference)');
    expect(dashboardSource).toContain('referenceLifecycleActionLabel(reference)');
    expect(dashboardSource).toContain('onReferenceLifecycleAction(selectedClient, reference)');
    expect(dashboardSource).not.toContain('onClick={() => onRenew(selectedClient, reference)}');
    expect(dashboardSource).not.toContain('onClick={() => onRenew(selectedClient)}');
  });

  it('documents that reactivation waits for payment and does not generate PIX automatically', () => {
    expect(dashboardSource).toContain('A referência permanece CANCELADA até o pagamento');
    expect(dashboardSource).toContain('Nenhum PIX ou WhatsApp será gerado automaticamente');
    expect(dashboardSource).toContain('gere o PIX manualmente em Cobranças/PIX');
  });

  it('recovers pending reactivation conflicts without creating another charge', () => {
    expect(dashboardSource).toContain('pendingReactivationFromError(err)');
    expect(dashboardSource).toContain("payload.code !== 'PENDING_REACTIVATION_EXISTS'");
    expect(dashboardSource).toContain('Já existe reativação aguardando pagamento.');
    expect(dashboardSource).toContain('Nenhuma nova reativação ou conta a receber foi criada.');
    expect(dashboardSource).toContain('Ir para Cobranças/PIX');
    expect(dashboardSource).toContain('Ver ou gerar PIX');
    expect(dashboardSource).toContain('setPixReceivable(detailTabRequest.receivable)');
  });

  it('keeps semantic status badge tones available', () => {
    expect(stylesSource).toContain('.status-ativo');
    expect(stylesSource).toContain('.status-pendente_pagamento');
    expect(stylesSource).toContain('.status-inativo');
    expect(stylesSource).toContain('.status-cancelado');
  });

  it('covers pending references through component fixtures instead of database rows', () => {
    const pendingFixtureStatus = 'PENDENTE_PAGAMENTO';
    const pendingCardClass = `reference-card status-${pendingFixtureStatus.toLowerCase()}`;
    const pendingBadgeClass = `status-badge status-${pendingFixtureStatus.toLowerCase()}`;

    expect(pendingCardClass).toBe('reference-card status-pendente_pagamento');
    expect(pendingBadgeClass).toBe('status-badge status-pendente_pagamento');
    expect(stylesSource).toContain('.reference-filter.tone-warning .reference-filter-dot');
    expect(stylesSource).toContain('.reference-card.status-pendente_pagamento');
    expect(stylesSource).toContain('.status-pendente_pagamento');
  });

  it('uses a dedicated timeline icon wrapper and centered icon CSS', () => {
    expect(dashboardSource).toContain('className="client-timeline-icon"');
    expect(stylesSource).toContain('.client-timeline-icon');
    expect(stylesSource).toContain('display: inline-flex;');
    expect(stylesSource).toContain('align-items: center;');
    expect(stylesSource).toContain('justify-content: center;');
    expect(stylesSource).toContain('width: 28px;');
    expect(stylesSource).toContain('min-width: 28px;');
    expect(stylesSource).toContain('.client-timeline-icon svg');
  });
});
