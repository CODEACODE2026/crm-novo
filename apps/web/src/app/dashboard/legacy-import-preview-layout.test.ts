import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const importViewSource = dashboardSource.slice(
  dashboardSource.indexOf('function LegacyImportPreviewView'),
  dashboardSource.indexOf('function CodeList'),
);

describe('legacy import preview UI', () => {
  it('adds an isolated temporary import view to the dashboard navigation', () => {
    expect(dashboardSource).toContain("| 'imports'");
    expect(dashboardSource).toContain("{ id: 'imports', label: 'Importação', icon: FileText }");
    expect(dashboardSource).toContain(
      "{view === 'imports' ? <LegacyImportPreviewView plans={plans} /> : null}",
    );
    expect(dashboardSource).toContain("imports: 'Preview temporário da migração legado'");
  });

  it('keeps IMPORT1 client import isolated from financial import state', () => {
    expect(dashboardSource).toContain("from '../../lib/legacy-import-file'");
    expect(importViewSource).toContain('readLegacyImportJsonFile(file)');
    expect(importViewSource).toContain('previewLegacyClients(buildLegacyImportPayload())');
    expect(importViewSource).toContain('disabled={!fileText || loading || importing}');
    expect(importViewSource).toContain(
      'Na migração final, somente clientes com status Ativo serão importados.',
    );
    expect(importViewSource).toContain('Cancelado permanecem fora da migração.');
    expect(importViewSource).toContain('importConfirmOpen');
  });

  it('adds temporary explicit plan mapping controls before preview', () => {
    expect(importViewSource).toContain('legacyPlanCycles.map');
    expect(importViewSource).toContain('Mapeamento de planos do lote');
    expect(importViewSource).toContain('aria-label={`Plano CRM para ciclo ${item.label}`}');
    expect(importViewSource).toContain('{ ...payload, planMapping }');
    expect(importViewSource).toContain('setPreview(null)');
    expect(stylesSource).toContain('.legacy-import-plan-mapping');
    expect(stylesSource).toContain('.legacy-import-plan-row');
  });

  it('makes plan mapping clearly batch-scoped with cycle counts and completeness', () => {
    expect(importViewSource).toContain('countLegacyImportCycles(fileText)');
    expect(importViewSource).toContain('Mapeamento do lote');
    expect(importViewSource).toContain('ciclos utilizados configurados');
    expect(importViewSource).toContain('Nenhum cliente deste ciclo no arquivo.');
    expect(importViewSource).toContain('clientes dependem');
    expect(importViewSource).toContain('Selecionado automaticamente — único plano compatível.');
    expect(importViewSource).toContain('Selecionado para todos os clientes');
    expect(importViewSource).toContain('será aplicada automaticamente a todos os clientes');
    expect(stylesSource).toContain('.legacy-import-plan-status');
  });

  it('preserves client values and temporary browser mapping without making storage authoritative', () => {
    expect(importViewSource).toContain('legacyPlanMappingSessionKey');
    expect(importViewSource).toContain('window.sessionStorage.setItem');
    expect(importViewSource).toContain(
      'O valor do plano é apenas referência; o valor recorrente de cada cliente será preservado do arquivo legado.',
    );
    expect(importViewSource).toContain('setPreview(null)');
    expect(importViewSource).toContain('setFileText(fileRead.text)');
  });

  it('adds guarded batch import UX for READY_CREATE clients only', () => {
    expect(importViewSource).toContain('importLegacyClients(buildLegacyImportPayload())');
    expect(importViewSource).toContain('importInFlightRef.current');
    expect(importViewSource).toContain('Importar prontos');
    expect(importViewSource).toContain('readyCreateCount === 0');
    expect(importViewSource).toContain('Importar {readyCreateCount} clientes prontos?');
    expect(importViewSource).toContain('Receivables');
    expect(importViewSource).toContain('Cobranças');
    expect(importViewSource).toContain('PIX');
    expect(importViewSource).toContain('Resultado da importação');
    expect(importViewSource).toContain('runPreview({ preserveImportResult: true })');
    expect(stylesSource).toContain('.legacy-import-result');
    expect(stylesSource).toContain('.legacy-import-confirm-grid');
  });

  it('renders summary, filtering, table and read-only details', () => {
    expect(importViewSource).toContain('Prontos para criar');
    expect(importViewSource).toContain('Fora da migração');
    expect(dashboardSource).toContain("SKIPPED_NOT_ACTIVE: 'Fora da migração'");
    expect(dashboardSource).toContain("{ id: 'SKIPPED_NOT_ACTIVE', label: 'Não ativos' }");
    expect(importViewSource).toContain('Possíveis correspondências');
    expect(importViewSource).toContain('legacyImportFilters.map');
    expect(importViewSource).toContain('legacy-import-table');
    expect(importViewSource).toContain('candidateMatches.map');
    expect(importViewSource).toContain('payloadHash');
  });

  it('has a mobile card layout for preview rows', () => {
    expect(stylesSource).toContain('.legacy-import-summary');
    expect(stylesSource).toContain('@media (max-width: 640px)');
    expect(stylesSource).toContain('.legacy-import-table thead');
    expect(stylesSource).toContain('.legacy-import-table td:nth-child(1)::before');
    expect(stylesSource).toContain("content: 'Cliente';");
  });

  it('adds guarded financial import for ready paid history only', () => {
    expect(importViewSource).toContain('<LegacyFinancialImportPreviewView />');
    expect(importViewSource).toContain('previewLegacyPayments(buildLegacyPaymentPreviewPayload())');
    expect(importViewSource).toContain('importLegacyPayments(buildLegacyPaymentPreviewPayload())');
    expect(importViewSource).toContain('readyPaidHistoryCount === 0');
    expect(importViewSource).toContain('Importar {readyPaidHistoryCount} pagamento histórico?');
    expect(importViewSource).toContain(
      'Não cria contas a receber, novas cobranças, PIX operacionais',
    );
    expect(importViewSource).toContain('schemaVersion: 1');
    expect(importViewSource).toContain("source: 'legacy'");
    expect(importViewSource).toContain('Prontos histórico');
    expect(importViewSource).toContain('Cliente não importado');
    expect(importViewSource).toContain('legacyPaymentPageSize');
    expect(importViewSource).toContain('até 2.000 pagamentos por arquivo');
    expect(stylesSource).toContain('.legacy-payment-table td:nth-child(8)::before');
  });

  it('wraps long legacy payment hashes inside the detail modal', () => {
    expect(importViewSource).toContain('legacy-import-hash-value');
    expect(stylesSource).toContain('.legacy-import-hash-value');
    expect(stylesSource).toContain('overflow-wrap: anywhere;');
  });
});
