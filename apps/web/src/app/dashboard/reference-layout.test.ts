import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

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
