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
    expect(dashboardSource).toContain("{view === 'imports' ? <LegacyImportPreviewView /> : null}");
    expect(dashboardSource).toContain("imports: 'Preview temporário da migração legado'");
  });

  it('keeps IMPORT1.1 as preview only without a functional import action', () => {
    expect(dashboardSource).toContain("from '../../lib/legacy-import-file'");
    expect(importViewSource).toContain('readLegacyImportJsonFile(file)');
    expect(importViewSource).toContain('previewLegacyClients(payload)');
    expect(importViewSource).toContain('disabled={!fileText || loading}');
    expect(importViewSource).toContain('Importação real será habilitada na próxima etapa.');
    expect(importViewSource).not.toContain('Importar</Button>');
    expect(importViewSource).not.toContain('confirmImport');
  });

  it('renders summary, filtering, table and read-only details', () => {
    expect(importViewSource).toContain('Prontos para criar');
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
});
