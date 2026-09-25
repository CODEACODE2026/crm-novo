import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildFinancialCategoryCreatePayload,
  filterFinancialCategories,
  financialCategoryNameMaxLength,
  financialCategoryNameMinLength,
  getFinancialCategoryFormState,
  summarizeFinancialCategories,
} from '../../lib/financial-categories';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const categoriesSource = dashboardSource.slice(
  dashboardSource.indexOf('function FinancialCategoriesView'),
  dashboardSource.indexOf('function financeReceivableTone'),
);

describe('finance categories polish source', () => {
  const categories = [
    { active: true, id: 'entry-1', name: 'RENOVAÇÕES', type: 'ENTRADA' as const },
    { active: true, id: 'expense-1', name: 'Marketing', type: 'SAIDA' as const },
    { active: false, id: 'expense-2', name: 'Servidor', type: 'SAIDA' as const },
  ];

  it('renders a compact modal create flow with guarded submit', () => {
    expect(financialCategoryNameMinLength).toBe(2);
    expect(financialCategoryNameMaxLength).toBe(120);
    expect(categoriesSource).not.toContain('className="finance-category-quick-form"');
    expect(categoriesSource).toContain('Nova categoria');
    expect(categoriesSource).toContain(
      'Cadastre uma classificação para suas movimentações financeiras.',
    );
    expect(categoriesSource).toContain('className="modal finance-category-modal"');
    expect(categoriesSource).toContain('className="finance-category-modal-form"');
    expect(categoriesSource).toContain('Nome da categoria');
    expect(categoriesSource).toContain('placeholder="Ex.: Marketing"');
    expect(categoriesSource).toContain('autoFocus');
    expect(categoriesSource).toContain('type="submit"');
    expect(categoriesSource).toContain('disabled={!canSubmit}');
    expect(categoriesSource).toContain('const submittingRef = useRef(false);');
    expect(categoriesSource).toContain('if (submittingRef.current) return;');
    expect(categoriesSource).toContain('buildFinancialCategoryCreatePayload({ name, type })');
    expect(categoriesSource).toContain('await onCreate(payload);');
    expect(categoriesSource).toContain('closeCreateModal();');
    expect(categoriesSource).toContain("setType('ENTRADA');");
    expect(categoriesSource).toContain('Cancelar');
    expect(categoriesSource).toContain('Criar categoria');
    expect(stylesSource).toContain('.finance-category-modal');
  });

  it('validates empty, whitespace, long and valid names before creating a payload', () => {
    expect(getFinancialCategoryFormState('').canSubmit).toBe(false);
    expect(getFinancialCategoryFormState('   ').canSubmit).toBe(false);
    expect(getFinancialCategoryFormState('A').canSubmit).toBe(false);
    expect(getFinancialCategoryFormState('AB').canSubmit).toBe(true);
    expect(getFinancialCategoryFormState('Marketing').canSubmit).toBe(true);
    expect(getFinancialCategoryFormState('Marketing', true).canSubmit).toBe(false);
    expect(getFinancialCategoryFormState('x'.repeat(121)).nameTooLong).toBe(true);
    expect(() => buildFinancialCategoryCreatePayload({ name: '', type: 'ENTRADA' })).toThrow(
      'Informe o nome da categoria.',
    );
    expect(() => buildFinancialCategoryCreatePayload({ name: 'A', type: 'ENTRADA' })).toThrow(
      'Informe o nome da categoria.',
    );
    expect(() =>
      buildFinancialCategoryCreatePayload({ name: 'x'.repeat(121), type: 'SAIDA' }),
    ).toThrow('Nome da categoria muito longo.');
    expect(buildFinancialCategoryCreatePayload({ name: ' Marketing ', type: 'SAIDA' })).toEqual({
      active: true,
      name: 'Marketing',
      type: 'SAIDA',
    });
  });

  it('filters by case-insensitive search, type, status and combined criteria', () => {
    expect(
      filterFinancialCategories(categories, { search: 'renov', status: '', type: '' }),
    ).toEqual([categories[0]]);
    expect(
      filterFinancialCategories(categories, { search: '', status: '', type: 'SAIDA' }),
    ).toEqual([categories[1], categories[2]]);
    expect(
      filterFinancialCategories(categories, { search: '', status: 'inactive', type: '' }),
    ).toEqual([categories[2]]);
    expect(
      filterFinancialCategories(categories, {
        search: 'serv',
        status: 'inactive',
        type: 'SAIDA',
      }),
    ).toEqual([categories[2]]);
  });

  it('summarizes the full category collection independently from filters', () => {
    const filtered = filterFinancialCategories(categories, {
      search: 'serv',
      status: 'inactive',
      type: 'SAIDA',
    });

    expect(filtered).toHaveLength(1);
    expect(summarizeFinancialCategories(categories)).toEqual({
      active: 2,
      entries: 1,
      expenses: 2,
      inactive: 1,
      total: 3,
    });
  });

  it('keeps frontend validation before POST for empty, whitespace, and long names', () => {
    expect(dashboardSource).toContain('getFinancialCategoryFormState(name, working)');
    expect(dashboardSource).toContain('buildFinancialCategoryCreatePayload({ name, type })');
    expect(categoriesSource).toContain('disabled={!canSubmit}');
    expect(categoriesSource).toContain('setError(err instanceof Error ? err.message');
    expect(categoriesSource).toContain('Nome da categoria muito longo.');
    expect(categoriesSource).toContain("event.key === 'Escape'");
    expect(categoriesSource).toContain('closeCreateModal');
    expect(categoriesSource).toContain('resetCreateModal');
  });

  it('adds real local summary cards from the loaded full category collection', () => {
    expect(categoriesSource).toContain('summarizeFinancialCategories(categories)');
    expect(categoriesSource).toContain('label="Categorias ativas"');
    expect(categoriesSource).toContain('label="Entradas"');
    expect(categoriesSource).toContain('label="Saídas"');
    expect(categoriesSource).toContain('label="Inativas"');
    expect(stylesSource).toContain('.finance-category-summary');
  });

  it('filters categories by search, type, and status without changing persisted values', () => {
    expect(categoriesSource).toContain('const [search, setSearch]');
    expect(categoriesSource).toContain('const [typeFilter, setTypeFilter]');
    expect(categoriesSource).toContain('const [statusFilter, setStatusFilter]');
    expect(categoriesSource).toContain('placeholder="Buscar categoria..."');
    expect(categoriesSource).toContain('Todos os tipos');
    expect(categoriesSource).toContain('Todos os status');
    expect(categoriesSource).toContain('Ativas');
    expect(categoriesSource).toContain('Inativas');
    expect(categoriesSource).toContain('filteredCategories.map');
    expect(stylesSource).toContain('.finance-category-toolbar');
  });

  it('uses friendly labels, status badges, and the global ActionMenu for row actions', () => {
    expect(dashboardSource).toContain('financialCategoryTypeLabel');
    expect(categoriesSource).toContain('category.active ?');
    expect(categoriesSource).toContain('Ativa');
    expect(categoriesSource).toContain('Inativa');
    expect(categoriesSource).toContain('<ActionMenu');
    expect(categoriesSource).toContain("label: 'Editar'");
    expect(categoriesSource).toContain("label: category.active ? 'Inativar' : 'Ativar'");
    expect(categoriesSource).toContain("label: 'Remover'");
    expect(categoriesSource).toContain('onUpdate(category.id, { active: !category.active })');
    expect(categoriesSource).toContain('onDelete(category.id)');
  });

  it('keeps edit and destructive category actions explicit and accessible', () => {
    expect(categoriesSource).toContain('const [editingCategory, setEditingCategory]');
    expect(categoriesSource).toContain('function openEditModal(category: FinancialCategory)');
    expect(categoriesSource).toContain('Editar categoria');
    expect(categoriesSource).toContain('Nome da categoria');
    expect(categoriesSource).toContain('<span>Tipo</span>');
    expect(categoriesSource).toContain('<span>Status</span>');
    expect(categoriesSource).toContain('await onUpdate(editingCategory.id');
    expect(categoriesSource).toContain('Salvar categoria');
    expect(categoriesSource).toContain('window.confirm');
    expect(categoriesSource).toContain('será inativada');
    expect(categoriesSource).toContain(
      'Categorias utilizadas por processos automáticos podem impactar baixas e',
    );
  });

  it('adapts category rows on mobile without a wide horizontal table', () => {
    expect(categoriesSource).toContain('data-label="Nome"');
    expect(categoriesSource).toContain('data-label="Tipo"');
    expect(categoriesSource).toContain('data-label="Status"');
    expect(categoriesSource).toContain('data-label="Ações"');
    expect(stylesSource).toContain('.finance-category-table thead');
    expect(stylesSource).toContain('content: attr(data-label);');
    expect(stylesSource).toContain('.finance-category-table-wrap');
    expect(stylesSource).toContain('overflow-x: visible;');
  });

  it('distinguishes empty data from filtered empty results', () => {
    expect(categoriesSource).toContain('Nenhuma categoria cadastrada.');
    expect(categoriesSource).toContain('Nenhuma categoria encontrada.');
    expect(categoriesSource).toContain(
      'Crie a primeira categoria para classificar entradas e saídas.',
    );
    expect(categoriesSource).toContain('Ajuste a busca ou filtros para encontrar outra categoria.');
    expect(stylesSource).toContain('.finance-category-empty-state');
  });
});
