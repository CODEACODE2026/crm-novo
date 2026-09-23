import type { FinancialCategory, FinancialTransactionType } from './crm-api';

export const financialCategoryNameMaxLength = 120;
export const financialCategoryNameMinLength = 2;

export type FinancialCategoryStatusFilter = 'active' | 'inactive' | '';

export function financialCategoryTypeLabel(type: FinancialTransactionType) {
  return type === 'ENTRADA' ? 'Entrada' : 'Saída';
}

export function getFinancialCategoryFormState(name: string, working = false) {
  const trimmedName = name.trim();
  const nameTooLong = trimmedName.length > financialCategoryNameMaxLength;

  return {
    canSubmit: trimmedName.length >= financialCategoryNameMinLength && !nameTooLong && !working,
    nameTooLong,
    trimmedName,
  };
}

export function buildFinancialCategoryCreatePayload({
  name,
  type,
}: {
  name: string;
  type: FinancialTransactionType;
}) {
  const { canSubmit, nameTooLong, trimmedName } = getFinancialCategoryFormState(name);

  if (!canSubmit) {
    throw new Error(
      nameTooLong ? 'Nome da categoria muito longo.' : 'Informe o nome da categoria.',
    );
  }

  return { active: true, name: trimmedName, type };
}

export function filterFinancialCategories(
  categories: FinancialCategory[],
  filters: {
    search: string;
    status: FinancialCategoryStatusFilter;
    type: FinancialTransactionType | '';
  },
) {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('pt-BR');

  return categories.filter((category) => {
    const matchesSearch = normalizedSearch
      ? category.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
      : true;
    const matchesType = filters.type ? category.type === filters.type : true;
    const matchesStatus =
      filters.status === 'active'
        ? category.active
        : filters.status === 'inactive'
          ? !category.active
          : true;

    return matchesSearch && matchesType && matchesStatus;
  });
}

export function summarizeFinancialCategories(categories: FinancialCategory[]) {
  return {
    entries: categories.filter((category) => category.type === 'ENTRADA').length,
    expenses: categories.filter((category) => category.type === 'SAIDA').length,
    inactive: categories.filter((category) => !category.active).length,
    total: categories.length,
  };
}
