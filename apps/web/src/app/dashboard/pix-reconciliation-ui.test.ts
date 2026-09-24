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

  it('keeps provider errors in the modal and handles close paths without submitting', () => {
    expect(pixModalSource).toContain(
      "setError(err instanceof Error ? err.message : 'Não foi possível pré-visualizar.')",
    );
    expect(pixModalSource).toContain("if (event.key === 'Escape' && !busy)");
    expect(pixModalSource).toContain('onClick={onClose}');
    expect(pixModalSource).toContain('disabled={busy}');
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
