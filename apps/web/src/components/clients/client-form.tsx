'use client';

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import {
  listPaymentProviderCredentials,
  type Client,
  type ClientPayload,
  type ClientUpdatePayload,
  type ConfigurablePaymentProvider,
  type PaymentProviderCode,
  type PaymentProviderCredentialStatus,
  type Plan,
} from '../../lib/crm-api';
import { sortPlansByDuration } from '../../lib/plan-utils';
import { Button } from '../ui/primitives';
import { ClientReferralSelect } from './client-referral-select';

interface ClientFormProps {
  client?: Client | undefined;
  plans: Plan[];
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (payload: ClientPayload | ClientUpdatePayload) => Promise<void>;
}

const clientPreferredPixProviders = [
  'FASTFLOW',
  'FASTPAY',
  'FASTPIX',
] satisfies ConfigurablePaymentProvider[];
const unavailableProviderValue = '__UNAVAILABLE__';

type PreferredPixProviderFormValue =
  ConfigurablePaymentProvider | '' | typeof unavailableProviderValue;

export function ClientForm({ client, plans, submitLabel, onCancel, onSubmit }: ClientFormProps) {
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
  const initialPreferredPixProvider = client?.preferredPixProvider ?? null;
  const [preferredPixProvider, setPreferredPixProvider] = useState<PreferredPixProviderFormValue>(
    initialPreferredPixProvider && isConfigurablePixProvider(initialPreferredPixProvider)
      ? initialPreferredPixProvider
      : initialPreferredPixProvider
        ? unavailableProviderValue
        : '',
  );
  const [preferredPixProviderTouched, setPreferredPixProviderTouched] = useState(false);
  const [paymentProviderCredentials, setPaymentProviderCredentials] = useState<
    PaymentProviderCredentialStatus[]
  >([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [generateInitialReceivable, setGenerateInitialReceivable] = useState(false);
  const [referrerClientId, setReferrerClientId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const editing = Boolean(client);
  const eligiblePixProviders = useMemo(
    () =>
      clientPreferredPixProviders.filter((provider) => {
        const credential = paymentProviderCredentials.find((item) => item.provider === provider);
        return credential ? isOperationalPixProviderCredential(credential) : false;
      }),
    [paymentProviderCredentials],
  );
  const providerValueAvailable =
    isConfigurablePixProvider(preferredPixProvider) &&
    eligiblePixProviders.includes(preferredPixProvider);
  const unavailablePreferredProvider =
    providersLoaded &&
    initialPreferredPixProvider &&
    (!isConfigurablePixProvider(initialPreferredPixProvider) ||
      !eligiblePixProviders.includes(initialPreferredPixProvider))
      ? initialPreferredPixProvider
      : null;

  useEffect(() => {
    let active = true;

    void listPaymentProviderCredentials()
      .then((credentials) => {
        if (!active) return;
        setPaymentProviderCredentials(credentials);
      })
      .catch(() => {
        if (!active) return;
        setPaymentProviderCredentials([]);
      })
      .finally(() => {
        if (active) setProvidersLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  function handlePlanChange(nextPlanId: string) {
    setPlanId(nextPlanId);
    const selectedPlan = sortedPlans.find((plan) => plan.id === nextPlanId);

    if (!valueTouched && selectedPlan) {
      setRecurringValue(selectedPlan.defaultValue);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;
    setError('');
    setLoading(true);

    try {
      if (editing) {
        const payload: ClientUpdatePayload = { name, phone };
        const nextPreferredPixProvider =
          preferredPixProvider && preferredPixProvider !== unavailableProviderValue
            ? preferredPixProvider
            : null;

        if (email) payload.email = email;
        if (notes) payload.notes = notes;
        if (
          preferredPixProviderTouched &&
          nextPreferredPixProvider !== initialPreferredPixProvider
        ) {
          payload.preferredPixProvider = nextPreferredPixProvider;
        }

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
        preferredPixProvider:
          preferredPixProvider && preferredPixProvider !== unavailableProviderValue
            ? preferredPixProvider
            : null,
        generateInitialReceivable,
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
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter') return;
    if (event.target instanceof HTMLTextAreaElement) return;

    event.preventDefault();
  }

  return (
    <form
      className={`entity-form client-form-modern ${editing ? 'client-form-edit' : 'client-form-create'}`}
      onKeyDown={handleKeyDown}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="client-form-body">
        <section className="form-section client-personal-section">
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
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
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
          <section className="form-section client-billing-section">
            <div className="form-section-title">
              <span className="section-eyebrow">Primeira referência</span>
              <h2>Plano e cobrança inicial</h2>
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
            <div className="initial-billing-choice form-grid-full">
              <label className="checkbox-row">
                <input
                  checked={generateInitialReceivable}
                  type="checkbox"
                  onChange={(event) => setGenerateInitialReceivable(event.target.checked)}
                />
                <span>Aguardar pagamento para ativar este serviço</span>
              </label>
              <p>O serviço ficará pendente até a confirmação do primeiro pagamento.</p>
              <dl className="initial-billing-summary">
                <div>
                  <dt>Status inicial</dt>
                  <dd>
                    <span className="status-dot" aria-hidden="true" />
                    {generateInitialReceivable ? 'Pendente de pagamento' : 'Ativo'}
                  </dd>
                </div>
                <div>
                  <dt>Primeira cobrança</dt>
                  <dd>
                    <span className="status-dot" aria-hidden="true" />
                    {generateInitialReceivable ? 'Ativação inicial' : 'Renovação'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}

        <section className="form-section client-pix-section">
          <div className="form-section-title">
            <span className="section-eyebrow">PIX</span>
            <h2>Cobrança PIX</h2>
          </div>
          <label className="field form-grid-full">
            <span>Provider PIX padrão</span>
            <select
              value={
                providerValueAvailable
                  ? preferredPixProvider
                  : unavailablePreferredProvider
                    ? unavailableProviderValue
                    : ''
              }
              onChange={(event) => {
                setPreferredPixProvider(event.target.value as PreferredPixProviderFormValue);
                setPreferredPixProviderTouched(true);
              }}
            >
              <option value="">Padrão do sistema</option>
              {unavailablePreferredProvider ? (
                <option value={unavailableProviderValue}>
                  {paymentProviderLabel(unavailablePreferredProvider)} indisponível
                </option>
              ) : null}
              {eligiblePixProviders.map((provider) => (
                <option key={provider} value={provider}>
                  {paymentProviderLabel(provider)}
                </option>
              ))}
            </select>
            <small>Se não definido, será usado o provider padrão do sistema.</small>
          </label>
          {unavailablePreferredProvider ? (
            <div className="notice warning compact-notice form-grid-full">
              Provider PIX preferido atual indisponível:{' '}
              {paymentProviderLabel(unavailablePreferredProvider)}.
            </div>
          ) : null}
        </section>

        <section className="form-section client-contact-section">
          <div className="form-section-title">
            <span className="section-eyebrow">Contato e observações</span>
            <h2>Contato e observações</h2>
          </div>
          <label className="field">
            <span>Observações (opcional)</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {!editing ? (
            <div className="field">
              <span>Indicado por (opcional)</span>
              <ClientReferralSelect value={referrerClientId} onChange={setReferrerClientId} />
              {referrerClientId && !generateInitialReceivable ? (
                <div className="notice warning compact-notice">
                  Sem cobrança inicial, esta indicação não será qualificada automaticamente por
                  pagamento de ativação.
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="form-actions client-form-actions">
        <span className="error-message">{error}</span>
        <div className="button-row">
          {onCancel ? (
            <Button disabled={loading} variant="secondary" onClick={onCancel}>
              Cancelar
            </Button>
          ) : null}
          <Button disabled={loading} icon={Save} loading={loading} type="submit" variant="primary">
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function isOperationalPixProviderCredential(credential: PaymentProviderCredentialStatus) {
  return (
    credential.configured &&
    credential.active !== false &&
    (credential.status === 'CONFIGURADO' || credential.status === 'VALIDO')
  );
}

function isConfigurablePixProvider(provider: unknown): provider is ConfigurablePaymentProvider {
  return clientPreferredPixProviders.includes(provider as ConfigurablePaymentProvider);
}

function paymentProviderLabel(provider: PaymentProviderCode) {
  if (provider === 'FASTFLOW') return 'FastFlow';
  if (provider === 'FASTPAY') return 'FastPay';
  if (provider === 'FASTPIX') return 'FastPIX';
  return provider;
}
