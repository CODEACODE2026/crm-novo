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
    expect(dashboardSource).toContain('Buscar referência...');
    expect(dashboardSource).toContain('Mais recentes');
  });

  it('keeps reference cards bound to ClientReference fields', () => {
    expect(dashboardSource).toContain('reference.reference');
    expect(dashboardSource).toContain('reference.plan.name');
    expect(dashboardSource).toContain('reference.recurringValue');
    expect(dashboardSource).toContain('reference.dueDate');
    expect(dashboardSource).toContain('reference.billingNoticeDays');
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
