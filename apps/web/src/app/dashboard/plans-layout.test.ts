import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(currentDir, 'page.tsx'), 'utf8');
const stylesSource = readFileSync(join(currentDir, '../globals.css'), 'utf8');
const planFormSource = readFileSync(
  join(currentDir, '../../components/plans/plan-form.tsx'),
  'utf8',
);
const clientFormSource = readFileSync(
  join(currentDir, '../../components/clients/client-form.tsx'),
  'utf8',
);

function sourceOccurrences(source: string, value: string) {
  return source.split(value).length - 1;
}

describe('plans UI 2.0 presentation source', () => {
  it('renders the approved header, real payload KPIs, and compact cards', () => {
    expect(dashboardSource).toContain('title="Planos"');
    expect(dashboardSource).toContain(
      'subtitle="Gerencie os planos utilizados nas referências dos clientes."',
    );
    expect(dashboardSource).toContain(
      'const activePlans = plans.filter((plan) => plan.active).length;',
    );
    expect(dashboardSource).toContain('<StatCard icon={Package} label="Planos"');
    expect(dashboardSource).toContain('<StatCard icon={CircleCheck} label="Ativos"');
    expect(dashboardSource).toContain('<StatCard icon={Minus} label="Inativos"');
    expect(dashboardSource).toContain('className="plans-grid"');
    expect(stylesSource).toContain('.plans-grid');
  });

  it('keeps plan cards bound to existing Plan fields only', () => {
    expect(dashboardSource).toContain('plan.name');
    expect(dashboardSource).toContain('plan.durationMonths');
    expect(dashboardSource).toContain('plan.defaultValue');
    expect(dashboardSource).toContain('plan.active');
    expect(dashboardSource).toContain('formatCurrency(plan.defaultValue)');
    expect(dashboardSource).toContain('formatPlanDuration(plan.durationMonths)');
    expect(dashboardSource).not.toContain('plan.mrr');
    expect(dashboardSource).not.toContain('plan.clientsCount');
  });

  it('formats duration as presentation only', () => {
    expect(dashboardSource).toContain('function formatPlanDuration(durationMonths: number)');
    expect(dashboardSource).toContain(
      "return durationMonths === 1 ? '1 mês' : `${durationMonths} meses`;",
    );
    expect(dashboardSource).not.toContain('plan.durationMonths =');
  });

  it('opens create and edit through the same central modal', () => {
    expect(dashboardSource).toContain('modal plan-form-modal');
    expect(dashboardSource).toContain("editingPlan ? 'Editar plano' : 'Novo plano'");
    expect(dashboardSource).toContain('plan={editingPlan ?? undefined}');
    expect(dashboardSource).toContain('onSubmit={editingPlan ? onUpdate : onCreate}');
    expect(dashboardSource).toContain('submitLabel="Salvar plano"');
    expect(planFormSource).toContain('onCancel?: () => void;');
  });

  it('keeps opening and closing the modal free of create/update API calls', () => {
    expect(dashboardSource).toContain('setPlanFormOpen(true);');
    expect(dashboardSource).toContain('setPlanFormOpen(false);');
    expect(dashboardSource).not.toContain('setPlanFormOpen((open) => !open)');
    expect(dashboardSource).toContain('await createPlan(payload);');
    expect(dashboardSource).toContain('await updatePlan(editingPlan.id, payload);');
    expect(planFormSource).toContain('type="submit"');
    expect(planFormSource).toContain('type="button" onClick={onCancel}');
  });

  it('preserves existing secondary actions and empty state affordances', () => {
    expect(dashboardSource).toContain('<ActionMenu');
    expect(dashboardSource).toContain("label: 'Remover'");
    expect(dashboardSource).toContain('onSelect: () => void onDelete(plan.id)');
    expect(dashboardSource).toContain('Nenhum plano cadastrado');
    expect(dashboardSource).toContain(
      'Cadastre um plano para começar a utilizá-lo nas referências.',
    );
    expect(stylesSource).toContain('.plans-empty-state');
  });

  it('keeps responsive card and modal structure available', () => {
    expect(stylesSource).toContain('.plan-form-modal-body');
    expect(stylesSource).toContain('.plans-kpis,');
    expect(stylesSource).toContain('.plans-grid {');
    expect(stylesSource).toContain('@media (max-width: 620px)');
    expect(stylesSource).toContain('.plan-form-modal-body {');
  });

  it('uses the shared duration ordering helper for cards and plan selects', () => {
    expect(dashboardSource).toContain(
      "import { sortPlansByDuration } from '../../lib/plan-utils';",
    );
    expect(
      sourceOccurrences(dashboardSource, 'const sortedPlans = sortPlansByDuration(plans);'),
    ).toBe(6);
    expect(dashboardSource).toContain(
      'plans.filter((plan) => plan.active || plan.id === editingClient?.planId)',
    );
    expect(sourceOccurrences(dashboardSource, '{sortedPlans.map((plan) => (')).toBe(6);
    expect(dashboardSource).toContain('plans={selectableClientPlans}');
    expect(clientFormSource).toContain(
      "import { sortPlansByDuration } from '../../lib/plan-utils';",
    );
    expect(clientFormSource).toContain(
      'const sortedPlans = useMemo(() => sortPlansByDuration(plans), [plans]);',
    );
    expect(clientFormSource).toContain('{sortedPlans.map((plan) => (');
    expect(clientFormSource).toContain('value={plan.id}');
  });
});
