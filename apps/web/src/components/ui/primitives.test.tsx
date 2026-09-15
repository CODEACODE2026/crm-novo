import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pencil, Save } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ActionMenu, Button, IconButton } from './primitives';

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
});
