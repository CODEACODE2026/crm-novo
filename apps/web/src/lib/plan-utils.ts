import type { Plan } from './crm-api';

export function sortPlansByDuration<T extends Pick<Plan, 'durationMonths' | 'name'>>(plans: T[]) {
  return [...plans].sort((current, next) => {
    const durationOrder = current.durationMonths - next.durationMonths;

    if (durationOrder !== 0) return durationOrder;

    return current.name.localeCompare(next.name, 'pt-BR');
  });
}
