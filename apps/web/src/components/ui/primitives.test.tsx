import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pencil, Save } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  ActionMenu,
  Button,
  IconButton,
  PaginationControls,
  calculateActionMenuPosition,
  getActionMenuPageNumbers,
  getPaginationRange,
} from './primitives';

const currentDir = dirname(fileURLToPath(import.meta.url));
const primitivesSource = readFileSync(resolve(currentDir, 'primitives.tsx'), 'utf8');

describe('UI primitives', () => {
  it('renders button variants with icon and label', () => {
    const html = renderToStaticMarkup(
      <Button icon={Save} type="submit" variant="primary">
        Salvar
      </Button>,
    );

    expect(html).toContain('ui-button-primary');
    expect(html).toContain('type="submit"');
    expect(html).toContain('Salvar');
    expect(html).toContain('<svg');
  });

  it('renders icon button with accessible label and title', () => {
    const html = renderToStaticMarkup(<IconButton icon={Pencil} label="Editar cliente" />);

    expect(html).toContain('aria-label="Editar cliente"');
    expect(html).toContain('title="Editar cliente"');
    expect(html).toContain('ui-icon-button');
  });

  it('renders action menu trigger closed by default', () => {
    const html = renderToStaticMarkup(
      <ActionMenu items={[{ icon: Pencil, label: 'Editar', onSelect: () => undefined }]} />,
    );

    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menuitem"');
  });

  it('uses a body portal and fixed menu layer for open action menus', () => {
    expect(primitivesSource).toContain('createPortal(');
    expect(primitivesSource).toContain('document.body');
    expect(primitivesSource).toContain('action-menu-portal');
    expect(primitivesSource).toContain('getBoundingClientRect()');
    expect(primitivesSource).toContain("window.addEventListener('scroll'");
    expect(primitivesSource).toContain("window.addEventListener('resize'");
    expect(primitivesSource).toContain("event.key === 'Escape'");
    expect(primitivesSource).toContain('item.onSelect()');
  });

  it('positions the action menu below or above while keeping viewport margins', () => {
    const below = calculateActionMenuPosition({
      menuHeight: 120,
      menuWidth: 180,
      triggerRect: { bottom: 120, left: 140, right: 180, top: 90 },
      viewportHeight: 600,
      viewportWidth: 360,
    });
    const above = calculateActionMenuPosition({
      menuHeight: 120,
      menuWidth: 180,
      triggerRect: { bottom: 575, left: 320, right: 350, top: 545 },
      viewportHeight: 600,
      viewportWidth: 360,
    });

    expect(below.placement).toBe('bottom');
    expect(below.top).toBe(126);
    expect(below.left).toBeGreaterThanOrEqual(8);
    expect(above.placement).toBe('top');
    expect(above.left).toBeLessThanOrEqual(172);
    expect(above.top).toBeGreaterThanOrEqual(8);
  });

  it('renders compact pagination summary, pages and disabled edges', () => {
    const html = renderToStaticMarkup(
      <PaginationControls
        pagination={{ page: 1, pageSize: 10, total: 47, totalPages: 5 }}
        onPageChange={() => undefined}
      />,
    );

    expect(html).toContain('Mostrando 1–10 de 47 registros');
    expect(html).toContain('Página 1 de 5');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Próxima');
  });

  it('calculates pagination ranges and compact page windows', () => {
    expect(getPaginationRange({ page: 2, pageSize: 10, total: 47 })).toEqual({
      from: 11,
      to: 20,
    });
    expect(getPaginationRange({ page: 1, pageSize: 10, total: 0 })).toEqual({ from: 0, to: 0 });
    expect(getActionMenuPageNumbers(8, 30)).toEqual([1, 'ellipsis', 7, 8, 9, 'ellipsis', 30]);
    expect(getActionMenuPageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
