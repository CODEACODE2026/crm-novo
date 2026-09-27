import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

type Category = {
  active: boolean;
  name: string;
  type: 'ENTRADA' | 'SAIDA';
};

const migrationSql = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260927192500_add_legacy_financial_domain/migration.sql',
  ),
  'utf8',
);

function ensureHistoricalRevenueCategory(existing: Category[]) {
  if (
    existing.some(
      (category) =>
        category.name.toLocaleLowerCase('pt-BR') === 'receita histórica' &&
        category.type === 'ENTRADA' &&
        !category.active,
    )
  ) {
    throw new Error('Categoria financeira "Receita histórica" ENTRADA existe, mas está inativa.');
  }

  if (
    !existing.some(
      (category) =>
        category.name.toLocaleLowerCase('pt-BR') === 'receita histórica' &&
        category.type === 'ENTRADA',
    )
  ) {
    existing.push({ active: true, name: 'Receita histórica', type: 'ENTRADA' });
  }

  return existing;
}

describe('legacy financial domain migration contract', () => {
  it('keeps the historical revenue category as migration-owned infrastructure', () => {
    expect(migrationSql).toContain('RAISE EXCEPTION');
    expect(migrationSql).toContain('AND "active" = false');
    expect(migrationSql).toContain('lower("name") = lower(\'Receita histórica\')');
    expect(migrationSql).toContain(
      "SELECT gen_random_uuid(), 'Receita histórica', 'ENTRADA', true",
    );
  });

  it('covers safe category creation and collision scenarios without operational database writes', () => {
    expect(ensureHistoricalRevenueCategory([])).toEqual([
      { active: true, name: 'Receita histórica', type: 'ENTRADA' },
    ]);

    expect(
      ensureHistoricalRevenueCategory([
        { active: true, name: 'Receita histórica', type: 'ENTRADA' },
      ]),
    ).toEqual([{ active: true, name: 'Receita histórica', type: 'ENTRADA' }]);

    expect(() =>
      ensureHistoricalRevenueCategory([
        { active: false, name: 'Receita histórica', type: 'ENTRADA' },
      ]),
    ).toThrow('está inativa');

    expect(
      ensureHistoricalRevenueCategory([{ active: true, name: 'Receita histórica', type: 'SAIDA' }]),
    ).toEqual([
      { active: true, name: 'Receita histórica', type: 'SAIDA' },
      { active: true, name: 'Receita histórica', type: 'ENTRADA' },
    ]);

    expect(
      ensureHistoricalRevenueCategory([
        { active: true, name: 'receita histórica', type: 'ENTRADA' },
      ]),
    ).toEqual([{ active: true, name: 'receita histórica', type: 'ENTRADA' }]);

    expect(() =>
      ensureHistoricalRevenueCategory([
        { active: false, name: 'RECEITA HISTÓRICA', type: 'ENTRADA' },
      ]),
    ).toThrow('está inativa');
  });
});
