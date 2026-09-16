'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import type { Client, ClientPayload, ClientUpdatePayload, Plan } from '../../lib/crm-api';
import { sortPlansByDuration } from '../../lib/plan-utils';
import { Button } from '../ui/primitives';
import { ClientReferralSelect } from './client-referral-select';

interface ClientFormProps {
  client?: Client | undefined;
  plans: Plan[];
  submitLabel: string;
  onSubmit: (payload: ClientPayload | ClientUpdatePayload) => Promise<void>;
}

export function ClientForm({ client, plans, submitLabel, onSubmit }: ClientFormProps) {
  const sortedPlans = useMemo(() => sortPlansByDuration(plans), [plans]);
  const initialPlan = useMemo(
    () => sortedPlans.find((plan) => plan.id === client?.planId) ?? sortedPlans[0],
    [client?.planId, sortedPlans],
  );
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [reference, setReference] = useState(client?.reference ?? '');
  const [planId, setPlanId] = useState(initialPlan?.id ?? '');
  const [recurringValue, setRecurringValue] = useState(
    client?.recurringValue ?? initialPlan?.defaultValue ?? '0.00',
  );
  const [valueTouched, setValueTouched] = useState(Boolean(client));
  const [dueDate, setDueDate] = useState(client?.dueDate ?? '');
  const [billingNoticeDays, setBillingNoticeDays] = useState(
    String(client?.billingNoticeDays ?? 0),
  );
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [referrerClientId, setReferrerClientId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const editing = Boolean(client);

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = sortedPlans.find((plan) => plan.id === nextPlanId);

    if (!valueTouched && selectedPlan) {
      setRecurringValue(selectedPlan.defaultValue);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (editing) {
        const payload: ClientUpdatePayload = { name, phone };

        if (email) payload.email = email;
        if (notes) payload.notes = notes;

        await onSubmit(payload);
        return;
      }

      const payload: ClientPayload = {
        name,
        phone,
        reference,
        planId,
        recurringValue: Number(recurringValue),
        dueDate,
        billingNoticeDays: Number(billingNoticeDays),
      };

      if (email) payload.email = email;
      if (notes) payload.notes = notes;
      if (referrerClientId) {
        payload.referrerClientId = referrerClientId;
        payload.referralRewardType = 'FREE_MONTH';
      }

      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar o cliente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="entity-form client-form-modern" onSubmit={(event) => void handleSubmit(event)}>
      <section className="form-section">
        <div className="form-section-title">
          <span className="section-eyebrow">Cliente</span>
          <h2>Dados pessoais</h2>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input required value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          {!editing ? (
            <label className="field">
              <span>Referência</span>
              <input
                required
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </section>

      {!editing ? (
        <section className="form-section">
          <div className="form-section-title">
            <span className="section-eyebrow">Primeira referência</span>
            <h2>Contrato/recorrência</h2>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Plano</span>
              <select
                required
                value={planId}
                onChange={(event) => handlePlanChange(event.target.value)}
              >
                {sortedPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Valor</span>
              <input
                min="0"
                step="0.01"
                type="number"
                value={recurringValue}
                onChange={(event) => {
                  setValueTouched(true);
                  setRecurringValue(event.target.value);
                }}
              />
            </label>
            <label className="field">
              <span>Vencimento</span>
              <input
                required
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Antecedência da cobrança</span>
              <input
                min="0"
                type="number"
                value={billingNoticeDays}
                onChange={(event) => setBillingNoticeDays(event.target.value)}
              />
              <small>0 no dia do vencimento, 1 um dia antes, 2 dois dias antes.</small>
            </label>
          </div>
        </section>
      ) : null}

      <section className="form-section">
        <div className="form-section-title">
          <span className="section-eyebrow">Contato e notas</span>
          <h2>Observações</h2>
        </div>
        <label className="field">
          <span>Observações</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {!editing ? (
          <div className="field">
            <span>Indicado por</span>
            <ClientReferralSelect value={referrerClientId} onChange={setReferrerClientId} />
          </div>
        ) : null}
      </section>

      <div className="form-actions">
        <span className="error-message">{error}</span>
        <Button disabled={loading} icon={Save} loading={loading} type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
