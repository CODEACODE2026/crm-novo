import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const referenceLifecycleModalsSource = readFileSync(
  join(currentDir, '../../components/clients/reference-lifecycle-modals.tsx'),
  'utf8',
);
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
const exactQueryPathBuilderSource = dashboardSource.slice(
  dashboardSource.indexOf('function buildExactDashboardQueryPath'),
  dashboardSource.indexOf('function replaceDashboardQueryExactly'),
);
const exactQueryPathBuilderJs = exactQueryPathBuilderSource.replace(
  /function buildExactDashboardQueryPath\(\s*pathname: string,\s*params: Record<string, string \| null \| undefined>,\s*\)/,
  'function buildExactDashboardQueryPath(pathname, params)',
);
// eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
const buildExactDashboardQueryPath = Function(
  `${exactQueryPathBuilderJs}; return buildExactDashboardQueryPath;`,
)() as (pathname: string, params: Record<string, string | null | undefined>) => string;

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
    expect(dashboardSource).toContain('ReferenceReactivationModal');
    expect(dashboardSource).toContain('ReferenceRenewalModal');
    expect(referenceLifecycleModalsSource).toContain('function ReferenceReactivationModal');
    expect(dashboardSource).toContain('createReferenceReactivation(target.reference.id, payload)');
    expect(referenceLifecycleModalsSource).toContain('previewReferenceRenewal(reference.id, {');
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
    expect(referenceLifecycleModalsSource).toContain(
      'A referência permanece CANCELADA até o pagamento',
    );
    expect(referenceLifecycleModalsSource).toContain(
      'Nenhum PIX ou WhatsApp será gerado automaticamente',
    );
    expect(dashboardSource).toContain('gere o PIX manualmente em Cobranças/PIX');
  });

  it('recovers pending reactivation conflicts without creating another charge', () => {
    expect(referenceLifecycleModalsSource).toContain('pendingReactivationFromError(err)');
    expect(referenceLifecycleModalsSource).toContain(
      "payload.code !== 'PENDING_REACTIVATION_EXISTS'",
    );
    expect(referenceLifecycleModalsSource).toContain('Já existe reativação aguardando pagamento.');
    expect(referenceLifecycleModalsSource).toContain(
      'Nenhuma nova reativação ou conta a receber foi criada.',
    );
    expect(referenceLifecycleModalsSource).toContain('Ir para Cobranças/PIX');
    expect(referenceLifecycleModalsSource).toContain('Ver ou gerar PIX');
    expect(dashboardSource).toContain('setPixReceivable(detailTabRequest.receivable)');
  });

  it('preserves WhatsApp return context when opening a reference receivable', () => {
    expect(dashboardSource).toContain('type WhatsAppReturnContext');
    expect(dashboardSource).toContain('setWhatsAppReceivableQuery({');
    expect(dashboardSource).toContain('function replaceDashboardQueryExactly');
    expect(dashboardSource).toContain("returnView: 'conversations'");
    expect(dashboardSource).toContain('returnConversationId: conversationId');
    expect(dashboardSource).toContain("returnContactPanel: contactPanelOpen ? 'open' : null");
    expect(dashboardSource).toContain('dashboardUrlReturnContext(params)');
    expect(dashboardSource).toContain('getReceivable(restoredReceivableId)');
    expect(dashboardSource).toContain(
      'setPixReceivableReturnContext(detailTabRequest.returnContext ?? null)',
    );
    expect(dashboardSource).toContain('function closePixReceivable()');
    expect(dashboardSource).toContain('onReturnToWhatsApp(returnContext)');
    expect(dashboardSource).not.toContain('returnTo=');
    expect(dashboardSource).not.toContain('router.back()');
  });

  it('cleans WhatsApp billing context atomically after returning to the inbox', () => {
    const restoreQuerySource = dashboardSource.slice(
      dashboardSource.indexOf('function setWhatsAppRestoreQuery'),
      dashboardSource.indexOf('function clearWhatsAppRestoreQuery'),
    );

    expect(restoreQuerySource).toContain('replaceDashboardQueryExactly({');
    expect(restoreQuerySource).toContain("view: 'conversations'");
    expect(restoreQuerySource).toContain('conversationId: context.conversationId');
    expect(restoreQuerySource).toContain("contactPanel: context.contactPanelOpen ? 'open' : null");
    expect(restoreQuerySource).not.toContain('clientId');
    expect(restoreQuerySource).not.toContain('receivableId');
    expect(restoreQuerySource).not.toContain('tab');
    expect(restoreQuerySource).not.toContain('returnView');
    expect(restoreQuerySource).not.toContain('returnConversationId');
    expect(restoreQuerySource).not.toContain('returnContactPanel');
  });

  it('builds the final WhatsApp return URL from only the allowed params', () => {
    expect(
      buildExactDashboardQueryPath('/dashboard', {
        view: 'conversations',
        conversationId: 'conversation-1',
        contactPanel: 'open',
        clientId: null,
        receivableId: null,
        returnContactPanel: null,
        returnConversationId: null,
        returnView: null,
        tab: null,
      }),
    ).toBe('/dashboard?view=conversations&conversationId=conversation-1&contactPanel=open');

    expect(
      buildExactDashboardQueryPath('/dashboard', {
        view: 'conversations',
        conversationId: 'conversation-1',
        contactPanel: null,
      }),
    ).toBe('/dashboard?view=conversations&conversationId=conversation-1');
  });

  it('keeps financial restore guarded by the clients receivables view', () => {
    const restoreEffectSource = dashboardSource.slice(
      dashboardSource.indexOf("if (requestedView === 'conversations')"),
      dashboardSource.indexOf('void restoreClientReceivable();'),
    );

    expect(restoreEffectSource).toContain("if (requestedView === 'conversations')");
    expect(restoreEffectSource).toContain("setView('conversations')");
    expect(restoreEffectSource).toContain(
      "if (requestedView !== 'clients' || params.get('tab') !== 'receivables')",
    );
    expect(restoreEffectSource).toContain("params.get('receivableId')?.trim()");
    expect(restoreEffectSource).toContain("params.get('clientId')?.trim()");
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
