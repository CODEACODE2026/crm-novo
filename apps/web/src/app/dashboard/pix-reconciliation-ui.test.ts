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
    expect(dashboardSource).toContain('sameIntentIndex === -1');
    expect(dashboardSource).toContain('[fallbackIntent, ...intents]');
    expect(dashboardSource).toContain('paymentIntentFreshness(sameIntent)');
    expect(dashboardSource).toContain('paymentIntentFreshness(fallbackIntent)');
    expect(pixModalSource).toContain('mergePaymentIntentsWithFallback(');
    expect(pixModalSource).toContain(
      'visibleIntents.find((intent) => intent.id === fallbackIntent.id)',
    );
    expect(pixModalSource).toContain('visibleIntents.find(isActivePixIntent)');
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
    expect(pixModalSource).toContain("!['PAID', 'CANCELED', 'EXPIRED', 'REFUNDED']");
    expect(pixModalSource).toContain('disabled={busy || !canCreateNew}');
    expect(pixModalSource).toContain('() => createReceivablePix(receivable.id)');
    expect(pixModalSource).not.toContain('await createReceivablePix(receivable.id)');
  });

  it('keeps the modal constrained for mobile and desktop surfaces', () => {
    expect(stylesSource).toContain('width: min(100%, 680px);');
    expect(stylesSource).toContain('max-height: min(820px, calc(100vh - 36px));');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('max-height: calc(100vh - 20px);');
    expect(stylesSource).toContain('.button-row {');
    expect(stylesSource).toContain('flex-wrap: wrap;');
  });
});
