import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const pixModalSource = dashboardSource.slice(
  dashboardSource.indexOf('function PixReceivableModal'),
  dashboardSource.indexOf('function PixReceivablesModal'),
);

describe('PIX reconciliation UI contract', () => {
  it('keeps reconciliation behind the PIX action menu and starts with empty operator inputs', () => {
    expect(pixModalSource).toContain("label: 'Reconciliar PIX externo'");
    expect(pixModalSource).toContain(
      "useState<Extract<PaymentProviderCode, 'FASTFLOW' | 'FASTPAY'>>('FASTFLOW')",
    );
    expect(pixModalSource).toContain(
      "const [reconcileTransactionId, setReconcileTransactionId] = useState('');",
    );
    expect(pixModalSource).toContain("const [reconcileReason, setReconcileReason] = useState('');");
    expect(pixModalSource).toContain(
      'const [reconcilePreview, setReconcilePreview] = useState<PixReconciliationPreview | null>(null);',
    );
    expect(pixModalSource).toContain('Nenhum novo PIX será');
  });

  it('keeps PIX replacement behind the action menu with preview and explicit confirmation', () => {
    expect(pixModalSource).toContain("label: 'Gerar novo PIX'");
    expect(pixModalSource).toContain(
      'const [showReplacement, setShowReplacement] = useState(false);',
    );
    expect(pixModalSource).toContain(
      'const [replacementPreview, setReplacementPreview] = useState<PixReplacementPreview | null>(null);',
    );
    expect(pixModalSource).toContain('previewReceivablePixReplacement(receivable.id');
    expect(pixModalSource).toContain('replaceReceivablePix(receivable.id');
    expect(pixModalSource).toContain('expectedCurrentIntentId: activeIntent.id');
    expect(pixModalSource).toContain('Um novo PIX será criado para esta cobrança.');
    expect(pixModalSource).toContain(
      'Use esta opção somente quando o PIX atual não puder mais ser utilizado.',
    );
    expect(pixModalSource).toContain('replacementPreview.blockers.map');
    expect(pixModalSource).toContain('disabled={busy || !canConfirmReplacement}');
  });

  it('keeps replacement recovery clearly separated from generating a new PIX', () => {
    expect(pixModalSource).toContain("label: 'Recuperar PIX de substituição'");
    expect(pixModalSource).toContain(
      'const [showReplacementRecovery, setShowReplacementRecovery] = useState(false);',
    );
    expect(pixModalSource).toContain('const [recoveryPreview, setRecoveryPreview] =');
    expect(pixModalSource).toContain('PixReplacementRecoveryPreview | null');
    expect(pixModalSource).toContain('previewReceivablePixReplacementRecovery(receivable.id');
    expect(pixModalSource).toContain('recoverReceivablePixReplacement(receivable.id');
    expect(pixModalSource).toContain(
      'Esta ação recupera um PIX que já foi criado no provedor durante uma substituição que',
    );
    expect(pixModalSource).toContain('Nenhum novo PIX será criado.');
    expect(pixModalSource).toContain('disabled={busy || !canConfirmReplacementRecovery}');
  });

  it('labels superseded PIX attempts as historical replacements', () => {
    expect(dashboardSource).toContain("SUPERSEDED: 'Substituído'");
    expect(pixModalSource).toContain("!['PAID', 'SUPERSEDED', 'CANCELED', 'EXPIRED', 'REFUNDED']");
    expect(pixModalSource).not.toContain("SUPERSEDED: 'Cancelado'");
    expect(pixModalSource).not.toContain("SUPERSEDED: 'Expirado'");
  });

  it('keeps the transaction ID display controlled by operator input only', () => {
    expect(pixModalSource).toContain('value={reconcileTransactionId}');
    expect(pixModalSource).toContain('setReconcileTransactionId(event.target.value);');
    expect(pixModalSource).toContain('providerTransactionId: reconcileTransactionId.trim()');
    expect(pixModalSource).toContain('placeholder="Ex.: 12345"');
    expect(pixModalSource).not.toContain('placeholder="75148"');
    expect(pixModalSource).not.toContain('Provider mockado em homologação');
    expect(pixModalSource).toContain('Reconciliação manual de PIX existente');
  });

  it('uses the backend preview contract as the confirm authority', () => {
    expect(pixModalSource).toContain('const canConfirmReconciliation =');
    expect(pixModalSource).toContain('Boolean(reconcilePreview?.adoptable)');
    expect(pixModalSource).toContain('reconcilePreview?.provider === reconcileProvider');
    expect(pixModalSource).toContain(
      'reconcilePreview.providerTransactionId === reconcileTransactionId.trim()',
    );
    expect(pixModalSource).toContain('disabled={busy || !canConfirmReconciliation}');
    expect(pixModalSource).toContain('reconcilePreview.impact.map');
    expect(pixModalSource).toContain('reconcilePreview.blockers.map');
  });

  it('invalidates stale previews and guards duplicate preview and confirm actions', () => {
    expect(pixModalSource).toContain('const previewActionRef = useRef(false);');
    expect(pixModalSource).toContain('if (previewActionRef.current) return;');
    expect(pixModalSource).toContain('previewActionRef.current = true;');
    expect(pixModalSource).toContain('previewActionRef.current = false;');
    expect(pixModalSource).toContain('setReconcilePreview(null);');
    expect(pixModalSource).toContain('if (actionRef.current) return;');
  });

  it('keeps synced PIX visible while authoritative data reloads', () => {
    expect(pixModalSource).toContain('async (fallbackIntent?: PaymentIntent)');
    expect(dashboardSource).toContain('function mergePaymentIntentsWithFallback(');
    expect(dashboardSource).toContain('function sortPaymentIntentsForDisplay');
    expect(dashboardSource).toContain('function isSelectablePixIntent');
    expect(dashboardSource).toContain('sameIntentIndex === -1');
    expect(dashboardSource).toContain('[fallbackIntent, ...intents]');
    expect(dashboardSource).toContain('paymentIntentFreshness(sameIntent)');
    expect(dashboardSource).toContain('paymentIntentFreshness(fallbackIntent)');
    expect(pixModalSource).toContain('sortPaymentIntentsForDisplay(');
    expect(pixModalSource).toContain('mergePaymentIntentsWithFallback(nextIntents, fallbackIntent');
    expect(pixModalSource).toContain(
      'visibleIntents.find((intent) => intent.id === fallbackIntent.id)',
    );
    expect(pixModalSource).toContain('visibleIntents.find(isActivePixIntent)');
    expect(pixModalSource).toContain('visibleIntents.find(isSelectablePixIntent)');
    expect(pixModalSource).toContain('await loadIntents(intent);');
    expect(pixModalSource).toContain('(intent) => pixSyncNotice(intent)');
  });

  it('separates provider status from temporal PIX expiration in the UI', () => {
    expect(dashboardSource).toContain('function isPixTemporallyExpired(intent: PaymentIntent)');
    expect(dashboardSource).toContain("intent.status === 'WAITING_PAYMENT'");
    expect(pixModalSource).toContain('isPixTemporallyExpired(activeIntent)');
    expect(pixModalSource).toContain('Prazo informado para este PIX expirou.');
  });

  it('keeps provider errors in the modal and handles close paths without submitting', () => {
    expect(pixModalSource).toContain(
      "setError(err instanceof Error ? err.message : 'Não foi possível pré-visualizar.')",
    );
    expect(pixModalSource).toContain(
      "setError(err instanceof Error ? err.message : 'Não foi possível atualizar o PIX.')",
    );
    expect(pixModalSource).toContain("if (event.key === 'Escape' && !busy)");
    expect(pixModalSource).toContain('onClick={onClose}');
    expect(pixModalSource).toContain('disabled={busy}');
  });

  it('guards cancel PIX against double click and keeps errors inside the modal', () => {
    expect(pixModalSource).toContain('const actionRef = useRef(false);');
    expect(pixModalSource).toContain('if (actionRef.current) return;');
    expect(pixModalSource).toContain('actionRef.current = true;');
    expect(pixModalSource).toContain('actionRef.current = false;');
    expect(pixModalSource).toContain('() => cancelPaymentIntent(activeIntent.id)');
    expect(pixModalSource).toContain('disabled={busy}');
    expect(pixModalSource).not.toContain("window.location.assign('/login')");
  });

  it('updates cancel success from the returned intent without auto-creating another PIX', () => {
    expect(pixModalSource).toContain('setActiveIntent(intent);');
    expect(pixModalSource).toContain('await loadIntents(intent);');
    expect(pixModalSource).toContain("'PIX cancelado no provider.'");
    expect(pixModalSource).toContain("!['PAID', 'SUPERSEDED', 'CANCELED', 'EXPIRED', 'REFUNDED']");
    expect(pixModalSource).toContain("receivable.status !== 'PAGO'");
    expect(pixModalSource).toContain('{canCreateNew ? (');
    expect(pixModalSource).toContain('() => createReceivablePix(receivable.id)');
    expect(pixModalSource).not.toContain('await createReceivablePix(receivable.id)');
  });

  it('maps technical PIX statuses to friendly labels and visual tones', () => {
    expect(dashboardSource).toContain("WAITING_PAYMENT: 'Aguardando pagamento'");
    expect(dashboardSource).toContain("PAID: 'Pago'");
    expect(dashboardSource).toContain("SUPERSEDED: 'Substituído'");
    expect(dashboardSource).toContain("EXPIRED: 'Expirado'");
    expect(dashboardSource).toContain("CANCELED: 'Cancelado'");
    expect(dashboardSource).toContain("FAILED: 'Falhou'");
    expect(pixModalSource).toContain('activeIntent.failureMessage ??');
    expect(pixModalSource).toContain('Falha informada: ${activeIntent.failureCode}');
    expect(dashboardSource).toContain('function paymentIntentStatusIcon');
    expect(dashboardSource).toContain('function paymentIntentStatusTone');
    expect(stylesSource).toContain('.pix-status-badge.tone-success');
    expect(stylesSource).toContain('.pix-status-badge.tone-warning');
    expect(stylesSource).toContain('.pix-status-badge.tone-danger');
    expect(stylesSource).toContain('.pix-status-badge.tone-muted');
  });

  it('keeps WAITING_PAYMENT QR and copy actions prominent', () => {
    expect(pixModalSource).toContain("const isWaitingPix = activeStatus === 'WAITING_PAYMENT';");
    expect(pixModalSource).toContain('const shouldShowPixData = isWaitingPix || showPixData;');
    expect(pixModalSource).toContain('className="pix-waiting-actions"');
    expect(pixModalSource).toContain('PIX copia e cola');
    expect(pixModalSource).toContain('aria-label="QR Code PIX"');
    expect(pixModalSource).toContain('(intent) => pixSyncNotice(intent)');
    expect(pixModalSource).toContain("notice === 'PIX copiado.' ? 'Copiado' : 'Copiar'");
    expect(pixModalSource).toContain(
      "setError('Não foi possível copiar o PIX. Copie o código manualmente.')",
    );
  });

  it('keeps WhatsApp send visible for waiting PIX and points missing configuration to WhatsApp', () => {
    expect(pixModalSource).toContain('sendPaymentIntentWhatsApp(activeIntent.id)');
    expect(pixModalSource).toContain('Enviar no WhatsApp');
    expect(pixModalSource).toContain('setWhatsAppConfirmOpen(true)');
    expect(pixModalSource).toContain('Configure a conexão em WhatsApp.');
    expect(pixModalSource).not.toContain('Configurações > Integrações');
  });

  it('keeps PAID focused on confirmation and hides creation/recovery actions', () => {
    expect(pixModalSource).toContain(
      "const isPaidPix = activeStatus === 'PAID' || receivable.status === 'PAGO';",
    );
    expect(pixModalSource).toContain('Pagamento confirmado');
    expect(dashboardSource).toContain('Recebimento processado com sucesso.');
    expect(pixModalSource).toContain('Ver dados do PIX');
    expect(pixModalSource).toContain("activeIntent.status === 'PAID' && activeIntent.paidAt");
    expect(pixModalSource).toContain('formatDateTime(activeIntent.paidAt)');
    expect(pixModalSource).not.toContain('activeIntent.paidAt ?? activeIntent.expiresAt');
    expect(pixModalSource).not.toContain('activeIntent.paidAt ?? activeIntent.updatedAt');
    expect(pixModalSource).not.toContain('activeIntent.paidAt ?? activeIntent.lastSyncAt');
    expect(pixModalSource).toContain('{!isPaidPix ? (');
    expect(pixModalSource).toContain("<dt>{isWaitingPix ? 'Válido até' : 'Expiração'}</dt>");
    expect(pixModalSource).toContain(
      'className="detail-list compact-detail-list pix-data-details"',
    );
    expect(pixModalSource).toContain('<dt>Expiração</dt>');
    expect(pixModalSource).toContain("receivable.status !== 'PAGO' &&");
    expect(pixModalSource).toContain('Pagamento concluído. Ações operacionais encerradas.');
    expect(pixModalSource).toContain('{contextualActionItems.length ? (');
  });

  it('documents the homologated paid activation fixture with two superseded attempts', () => {
    const fixture = {
      receivable: {
        amount: '30.00',
        description: 'Cobrança inicial de ativação - Mensal',
        status: 'PAGO',
      },
      intents: [
        { amount: '30.00', current: true, providerTransactionId: '75975', status: 'PAID' },
        { amount: '30.00', providerTransactionId: '75739', status: 'SUPERSEDED' },
        { amount: '30.00', providerTransactionId: '75148', status: 'SUPERSEDED' },
      ],
    };

    expect(fixture.receivable).toMatchObject({
      amount: '30.00',
      description: 'Cobrança inicial de ativação - Mensal',
      status: 'PAGO',
    });
    expect(fixture.intents).toEqual([
      { amount: '30.00', current: true, providerTransactionId: '75975', status: 'PAID' },
      { amount: '30.00', providerTransactionId: '75739', status: 'SUPERSEDED' },
      { amount: '30.00', providerTransactionId: '75148', status: 'SUPERSEDED' },
    ]);
    expect(dashboardSource).toContain("SUPERSEDED: 'Substituído'");
    expect(dashboardSource).toContain("PAID: 'Pago'");
    expect(pixModalSource).toContain('Pagamento confirmado');
    expect(pixModalSource).toContain('Tentativas ({intents.length})');
    expect(pixModalSource).toContain("{intent.id === activeIntent?.id ? ' Atual' : ''}");
    expect(pixModalSource).toContain('orderedHistoryIntents.length > 3');
    expect(pixModalSource).toContain('orderedHistoryIntents.slice(0, 3)');
  });

  it('renders compact expandable history without duplicating the current intent as a large card', () => {
    expect(pixModalSource).toContain('Tentativas ({intents.length})');
    expect(pixModalSource).toContain('const historicalIntents = intents.filter');
    expect(pixModalSource).toContain(
      'const orderedHistoryIntents = [activeIntent, ...historicalIntents].filter',
    );
    expect(pixModalSource).toContain('const visibleHistoryIntents = showAllHistory');
    expect(pixModalSource).toContain('visibleHistoryIntents.map');
    expect(pixModalSource).toContain('expandedHistoryIntentId');
    expect(pixModalSource).toContain('paymentIntentDisplayTransactionId(intent)');
    expect(pixModalSource).toContain('Status técnico');
    expect(pixModalSource).toContain('aria-controls="pix-history-list"');
    expect(pixModalSource).toContain('aria-controls={`pix-history-detail-${intent.id}`}');
    expect(pixModalSource).toContain('id={`pix-history-detail-${intent.id}`}');
    expect(stylesSource).toContain('.pix-history-list');
    expect(stylesSource).toContain('.pix-history-item > button');
    expect(stylesSource).toContain('min-height: 36px;');
    expect(stylesSource).toContain('.pix-history-limit-toggle');
  });

  it('limits PIX history to three rows before local expansion and can collapse again', () => {
    const fixture = {
      intents: Array.from({ length: 6 }, (_, index) => ({
        id: `intent-${index + 1}`,
        status: index === 0 ? 'PAID' : 'SUPERSEDED',
      })),
    };

    expect(fixture.intents).toHaveLength(6);
    expect(fixture.intents.slice(0, 3)).toHaveLength(3);
    expect(pixModalSource).toContain(
      'const [showAllHistory, setShowAllHistory] = useState(false);',
    );
    expect(pixModalSource).toContain('orderedHistoryIntents.slice(0, 3)');
    expect(pixModalSource).toContain('Ver todas (${orderedHistoryIntents.length})');
    expect(pixModalSource).toContain('Mostrar menos');
    expect(pixModalSource).toContain('setShowAllHistory((value) => !value)');
    expect(pixModalSource).toContain('aria-expanded={showAllHistory}');
    expect(pixModalSource).toContain('aria-controls="pix-history-list"');
  });

  it('keeps contextual actions and technical tools separated in Mais ações', () => {
    expect(pixModalSource).toContain('const contextualActionItems = activeIntent');
    expect(pixModalSource).toContain("section: 'Ferramentas técnicas'");
    expect(pixModalSource).toContain('trigger="text"');
    expect(stylesSource).toContain('.action-menu-trigger');
    expect(stylesSource).toContain('.action-menu-section');
    expect(pixModalSource).toContain('setShowReplacement(false);');
    expect(pixModalSource).toContain('setShowReconciliation(false);');
    expect(pixModalSource).toContain('setShowReplacementRecovery(false);');
  });

  it('shows replacement, recovery, and reconciliation as step panels', () => {
    expect(pixModalSource).toContain('aria-label="Etapas para gerar novo PIX"');
    expect(pixModalSource).toContain('Configurar');
    expect(pixModalSource).toContain('Pré-visualizar');
    expect(pixModalSource).toContain('aria-label="Etapas para recuperar PIX de substituição"');
    expect(pixModalSource).toContain('Nenhum novo PIX será criado.');
    expect(pixModalSource).toContain('aria-label="Etapas para reconciliar PIX externo"');
    expect(pixModalSource).toContain('Reconciliação manual de PIX existente');
  });

  it('keeps the modal constrained for mobile and desktop surfaces', () => {
    expect(stylesSource).toContain('width: min(100%, 760px);');
    expect(stylesSource).toContain('max-height: min(820px, calc(100vh - 36px));');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('max-height: calc(100vh - 20px);');
    expect(stylesSource).toContain('.pix-data-panel,');
    expect(stylesSource).toContain('.pix-copy-row');
    expect(stylesSource).toContain('.pix-history-item > button');
    expect(stylesSource).toContain('.button-row {');
    expect(stylesSource).toContain('flex-wrap: wrap;');
  });
});
