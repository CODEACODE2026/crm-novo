import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');

describe('MOBILE1 responsiveness guardrails', () => {
  it('keeps the responsive strategy consolidated around tablet, mobile and compact mobile', () => {
    expect(stylesSource).toContain('@media (max-width: 980px)');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('@media (max-width: 480px)');
    expect(stylesSource).toContain('overflow-x: hidden;');
    expect(stylesSource).toContain('min-width: 0;');
  });

  it('keeps dashboard filters and actions wrap-friendly without removing existing controls', () => {
    expect(dashboardSource).toContain('Hoje');
    expect(dashboardSource).toContain('Mês atual');
    expect(dashboardSource).toContain('Mês anterior');
    expect(dashboardSource).toContain('Últimos 30 dias');
    expect(dashboardSource).toContain('Personalizado');
    expect(dashboardSource).toContain('Novo cliente');
    expect(dashboardSource).toContain('Entrada');
    expect(dashboardSource).toContain('Recebíveis');
    expect(stylesSource).toContain('.period-controls');
    expect(stylesSource).toContain('flex-wrap: wrap;');
    expect(stylesSource).toContain('flex: 1 1 120px;');
  });

  it('contains tables in responsive wrappers instead of allowing page-level horizontal scroll', () => {
    expect(dashboardSource).toContain('className="table-wrap finance-table-wrap"');
    expect(dashboardSource).toContain('className="table-wrap referrals-table-wrap"');
    expect(dashboardSource).toContain('className="clients-table"');
    expect(stylesSource).toContain('.table-wrap');
    expect(stylesSource).toContain('max-width: 100%;');
    expect(stylesSource).toContain('overflow-x: auto;');
    expect(stylesSource).toContain('-webkit-overflow-scrolling: touch;');
  });

  it('keeps client tabs accessible with controlled horizontal scrolling on mobile', () => {
    expect(dashboardSource).toContain('Visão geral');
    expect(dashboardSource).toContain('Referências');
    expect(dashboardSource).toContain('Financeiro');
    expect(dashboardSource).toContain('Cobranças/PIX');
    expect(dashboardSource).toContain('Histórico');
    expect(dashboardSource).toContain('Mais');
    expect(stylesSource).toContain('.tabs {');
    expect(stylesSource).toContain('overflow-x: auto;');
    expect(stylesSource).toContain('.tabs button');
    expect(stylesSource).toContain('flex: 0 0 auto;');
  });

  it('uses mobile-safe modal sizing and PIX content wrapping', () => {
    expect(dashboardSource).toContain('function PixReceivableModal');
    expect(dashboardSource).toContain('function PixReceivablesModal');
    expect(dashboardSource).toContain('className="pix-copy-row"');
    expect(dashboardSource).toContain('className="pix-qr"');
    expect(stylesSource).toContain('max-height: calc(100dvh - 20px);');
    expect(stylesSource).toContain('.pix-copy-row');
    expect(stylesSource).toContain('overflow-wrap: anywhere;');
    expect(stylesSource).toContain('.pix-qr img');
    expect(stylesSource).toContain('width: min(160px, 100%);');
  });
});
