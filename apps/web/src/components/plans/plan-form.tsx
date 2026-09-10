'use client';

import { FormEvent, useState } from 'react';
import type { Plan, PlanPayload } from '../../lib/crm-api';

interface PlanFormProps {
  plan?: Plan | undefined;
  submitLabel: string;
  onSubmit: (payload: PlanPayload) => Promise<void>;
}

export function PlanForm({ plan, submitLabel, onSubmit }: PlanFormProps) {
  const [name, setName] = useState(plan?.name ?? '');
  const [durationMonths, setDurationMonths] = useState(String(plan?.durationMonths ?? 1));
  const [defaultValue, setDefaultValue] = useState(plan?.defaultValue ?? '0.00');
  const [active, setActive] = useState(plan?.active ?? true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit({
        name,
        durationMonths: Number(durationMonths),
        defaultValue: Number(defaultValue),
        active,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nao foi possivel salvar o plano.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="compact-form" onSubmit={(event) => void handleSubmit(event)}>
      <label className="field">
        <span>Nome</span>
        <input required value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Meses</span>
        <input
          min="1"
          required
          type="number"
          value={durationMonths}
          onChange={(event) => setDurationMonths(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Valor padrao</span>
        <input
          min="0"
          required
          step="0.01"
          type="number"
          value={defaultValue}
          onChange={(event) => setDefaultValue(event.target.value)}
        />
      </label>
      <label className="toggle-field">
        <input
          checked={active}
          type="checkbox"
          onChange={(event) => setActive(event.target.checked)}
        />
        <span>Ativo</span>
      </label>
      <div className="form-actions">
        <span className="error-message">{error}</span>
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
