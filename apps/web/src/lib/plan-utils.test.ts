import { describe, expect, it } from 'vitest';
import { sortPlansByDuration } from './plan-utils';

describe('plan utils', () => {
  it('sorts plans by duration ascending', () => {
    const plans = [
      { name: 'Anual', durationMonths: 12 },
      { name: 'Mensal', durationMonths: 1 },
      { name: 'Semestral', durationMonths: 6 },
      { name: 'Trimestral', durationMonths: 3 },
      { name: 'Bimestral', durationMonths: 2 },
    ];

    expect(sortPlansByDuration(plans).map((plan) => plan.name)).toEqual([
      'Mensal',
      'Bimestral',
      'Trimestral',
      'Semestral',
      'Anual',
    ]);
  });

  it('does not mutate the original array', () => {
    const plans = [
      { name: 'Anual', durationMonths: 12 },
      { name: 'Mensal', durationMonths: 1 },
    ];
    const original = [...plans];

    sortPlansByDuration(plans);

    expect(plans).toEqual(original);
  });

  it('sorts ties by name using pt-BR locale', () => {
    const plans = [
      { name: 'Plano Z', durationMonths: 1 },
      { name: 'Plano A', durationMonths: 1 },
      { name: 'Bimestral', durationMonths: 2 },
    ];

    expect(sortPlansByDuration(plans).map((plan) => plan.name)).toEqual([
      'Plano A',
      'Plano Z',
      'Bimestral',
    ]);
  });

  it('preserves plan identity and active status while sorting', () => {
    const plans = [
      { id: 'annual-plan', name: 'Anual', durationMonths: 12, active: false },
      { id: 'monthly-plan', name: 'Mensal', durationMonths: 1, active: true },
      { id: 'semester-plan', name: 'Semestral', durationMonths: 6, active: false },
    ];

    expect(sortPlansByDuration(plans)).toEqual([
      { id: 'monthly-plan', name: 'Mensal', durationMonths: 1, active: true },
      { id: 'semester-plan', name: 'Semestral', durationMonths: 6, active: false },
      { id: 'annual-plan', name: 'Anual', durationMonths: 12, active: false },
    ]);
  });
});
