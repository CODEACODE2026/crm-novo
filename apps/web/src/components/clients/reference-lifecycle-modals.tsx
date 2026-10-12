'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, QrCode, RefreshCw, X } from 'lucide-react';
import {
  addCalendarMonthsPreservingAnchor,
  formatBusinessDate,
  parseBusinessDate,
} from '@crm-novo/shared';
import {
  ApiError,
  formatCurrency,
  formatDate,
  previewReferenceRenewal,
  type Client,
  type ClientReference,
  type Plan,
  type ReactivationResult,
  type RenewalPreview,
} from '../../lib/crm-api';
import { Button, IconButton } from '../ui/primitives';

export type ReferenceLifecycleTarget = {
  client: Client;
  reference: ClientReference;
};

type RenewalConfirmPayload = {
  amount: number;
  idempotencyKey: string;
  planId: string;
};

type ReactivationConfirmPayload = {
  activationDate: string;
  amount: number;
  idempotencyKey: string;
  planId: string;
};

function sortPlansByDuration(plans: Plan[]) {
  return [...plans].sort((a, b) => a.durationMonths - b.durationMonths);
}

function formatSaoPauloDateInput(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return year && month && day ? `${year}-${month}-${day}` : formatBusinessDate(date);
}

function pendingReactivationFromError(error: unknown) {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  if (typeof error.payload !== 'object' || error.payload === null || Array.isArray(error.payload)) {
    return null;
  }

  const payload = error.payload as { code?: unknown; reactivation?: unknown };

  if (payload.code !== 'PENDING_REACTIVATION_EXISTS') return null;
  if (
    typeof payload.reactivation !== 'object' ||
    payload.reactivation === null ||
    Array.isArray(payload.reactivation)
  ) {
    return null;
  }

  return payload.reactivation as ReactivationResult;
}

function shortEntityId(id: string) {
  return id.slice(0, 8);
}

export function ReferenceRenewalModal({
  target,
  plans,
  modalClassName = '',
  onClose,
  onConfirm,
}: {
  target: ReferenceLifecycleTarget;
  plans: Plan[];
  modalClassName?: string;
  onClose: () => void;
  onConfirm: (payload: RenewalConfirmPayload) => Promise<void>;
}) {
  const { client, reference } = target;
  const sortedPlans = sortPlansByDuration(plans);
  const [planId, setPlanId] = useState(reference.planId);
  const [amount, setAmount] = useState(reference.recurringValue);
  const [preview, setPreview] = useState<RenewalPreview | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const parsedAmount = Number(amount);

    if (!planId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setPreview(null);
      return undefined;
    }

    async function loadPreview() {
      setLoadingPreview(true);
      setError('');

      try {
        const nextPreview = await previewReferenceRenewal(reference.id, {
          planId,
          amount: parsedAmount,
        });
        if (active) setPreview(nextPreview);
      } catch (err) {
        if (active) {
          setPreview(null);
          setError(err instanceof Error ? err.message : 'Não foi possível calcular a renovação.');
        }
      } finally {
        if (active) setLoadingPreview(false);
      }
    }

    void loadPreview();

    return () => {
      active = false;
    };
  }, [amount, planId, reference.id]);

  async function handleConfirm() {
    setError('');
    setSaving(true);

    try {
      await onConfirm({ planId, amount: Number(amount), idempotencyKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível confirmar a renovação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal ${modalClassName}`.trim()} aria-labelledby="renewal-title">
        <header className="modal-header">
          <h2 id="renewal-title">Renovar referência</h2>
          <IconButton icon={X} label="Fechar renovação" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{reference.reference}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{reference.status}</dd>
          </div>
          <div>
            <dt>Plano atual</dt>
            <dd>{reference.plan.name}</dd>
          </div>
          <div>
            <dt>Vencimento atual</dt>
            <dd>{formatDate(reference.dueDate)}</dd>
          </div>
          <div>
            <dt>Valor atual</dt>
            <dd>{formatCurrency(reference.recurringValue)}</dd>
          </div>
        </dl>

        {reference.status === 'CANCELADO' ? (
          <div className="notice warning">
            Esta referência está CANCELADA. Renovação não reativa referências canceladas; use o
            fluxo de reativação separado.
          </div>
        ) : null}

        <div className="form-grid">
          <label className="field">
            <span>Plano</span>
            <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
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
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </div>

        <section className="preview-box">
          {loadingPreview ? <span>Calculando...</span> : null}
          {preview ? (
            <>
              <strong>Novo vencimento: {formatDate(preview.newDueDate)}</strong>
              <span>Será criada uma conta a receber de {formatCurrency(preview.amount)}.</span>
              {preview.planChanged ? (
                <span>
                  Plano alterado de {preview.currentPlan.name} para {preview.selectedPlan.name}.
                </span>
              ) : null}
            </>
          ) : null}
        </section>

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !preview}
              icon={RefreshCw}
              loading={saving}
              variant="primary"
              onClick={() => void handleConfirm()}
            >
              Confirmar renovação
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ReferenceReactivationModal({
  target,
  plans,
  modalClassName = '',
  onClose,
  onConfirm,
  onGeneratePix,
  onGoToBilling,
  receivableStatusLabel,
}: {
  target: ReferenceLifecycleTarget;
  plans: Plan[];
  modalClassName?: string;
  onClose: () => void;
  onConfirm: (payload: ReactivationConfirmPayload) => Promise<void>;
  onGeneratePix?: (reactivation: ReactivationResult) => Promise<void>;
  onGoToBilling?: (reactivation: ReactivationResult) => Promise<void>;
  receivableStatusLabel?: (receivable: ReactivationResult['receivable']) => string;
}) {
  const { client, reference } = target;
  const reactivationPlans = sortPlansByDuration(plans);
  const firstReactivationPlan = reactivationPlans[0] ?? null;
  const initialAmount =
    Number(reference.recurringValue) > 0
      ? reference.recurringValue
      : (firstReactivationPlan?.defaultValue ?? '');
  const [planId, setPlanId] = useState(firstReactivationPlan?.id ?? '');
  const [amount, setAmount] = useState(initialAmount);
  const [activationDate, setActivationDate] = useState(() => formatSaoPauloDateInput(new Date()));
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingReactivation, setPendingReactivation] = useState<ReactivationResult | null>(null);
  const selectedPlan = reactivationPlans.find((plan) => plan.id === planId) ?? null;
  const parsedAmount = Number(amount);
  const reactivationPreview = useMemo(() => {
    if (!selectedPlan || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return null;
    }

    try {
      const parsedActivationDate = parseBusinessDate(activationDate);
      const anchorDay = parsedActivationDate.getUTCDate();
      const nextDueDate = addCalendarMonthsPreservingAnchor(
        parsedActivationDate,
        selectedPlan.durationMonths,
        anchorDay,
      );

      return {
        anchorDay,
        nextDueDate: formatBusinessDate(nextDueDate),
      };
    } catch {
      return null;
    }
  }, [activationDate, parsedAmount, selectedPlan]);
  const canSubmit = Boolean(planId) && Boolean(reactivationPreview);
  const hasPendingActions = Boolean(onGeneratePix || onGoToBilling);

  async function handleConfirm() {
    if (!canSubmit) {
      setError('Preencha plano, valor e data de ativação válidos.');
      return;
    }

    setError('');
    setSaving(true);

    try {
      await onConfirm({
        planId,
        amount: parsedAmount,
        activationDate,
        idempotencyKey,
      });
    } catch (err) {
      const existingReactivation = pendingReactivationFromError(err);
      if (existingReactivation) {
        setPendingReactivation(existingReactivation);
        return;
      }

      setError(err instanceof Error ? err.message : 'Não foi possível criar a reativação.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePendingAction(
    action: ((reactivation: ReactivationResult) => Promise<void>) | undefined,
  ) {
    if (!pendingReactivation || !action) return;

    setSaving(true);
    setError('');

    try {
      await action(pendingReactivation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a cobrança existente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal ${modalClassName}`.trim()} aria-labelledby="reactivation-title">
        <header className="modal-header">
          <h2 id="reactivation-title">Reativar referência</h2>
          <IconButton icon={X} label="Fechar reativação" onClick={onClose} />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Cliente</dt>
            <dd>{client.name}</dd>
          </div>
          <div>
            <dt>Referência</dt>
            <dd>{reference.reference}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{reference.status}</dd>
          </div>
          <div>
            <dt>Plano histórico</dt>
            <dd>{reference.plan.name}</dd>
          </div>
          <div>
            <dt>Valor histórico</dt>
            <dd>{formatCurrency(reference.recurringValue)}</dd>
          </div>
        </dl>

        <div className="notice warning">
          A reativação cria uma cobrança manual. A referência permanece CANCELADA até o pagamento
          ser confirmado.
        </div>

        {pendingReactivation ? (
          <section className="preview-box">
            <strong>Já existe reativação aguardando pagamento.</strong>
            <span>Nenhuma nova reativação ou conta a receber foi criada.</span>
            <span>
              Cobrança {shortEntityId(pendingReactivation.receivable.id)} ·{' '}
              {formatCurrency(pendingReactivation.receivable.amount)} · vence em{' '}
              {formatDate(pendingReactivation.receivable.dueDate)}.
            </span>
            {receivableStatusLabel ? (
              <span>
                Status da cobrança: {receivableStatusLabel(pendingReactivation.receivable)}.
              </span>
            ) : null}
            <span>
              PIX vinculados: {pendingReactivation.receivable.paymentIntents?.length ?? 0}.
            </span>
            <span>A referência permanece CANCELADA até o pagamento ser confirmado.</span>
          </section>
        ) : (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Plano</span>
                <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                  {reactivationPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Valor</span>
                <input
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Data de ativação</span>
                <input
                  type="date"
                  value={activationDate}
                  onChange={(event) => setActivationDate(event.target.value)}
                />
              </label>
            </div>

            <section className="preview-box">
              {reactivationPreview && selectedPlan ? (
                <>
                  <strong>Cobrança de reativação: {formatCurrency(parsedAmount)}</strong>
                  <span>Vencimento da reativação: {formatDate(activationDate)}.</span>
                  <span>
                    Após o pagamento, próximo ciclo em {formatDate(reactivationPreview.nextDueDate)}
                    .
                  </span>
                  <span>
                    Plano {selectedPlan.name}; anchor {reactivationPreview.anchorDay}.
                  </span>
                </>
              ) : (
                <span>Preencha os dados para visualizar o próximo ciclo.</span>
              )}
            </section>

            <div className="notice">
              Nenhum PIX ou WhatsApp será gerado automaticamente. Use Cobranças/PIX depois da
              criação.
            </div>
          </>
        )}

        <div className="form-actions">
          <span className="error-message">{error}</span>
          <div className="button-row">
            <Button icon={X} variant="secondary" onClick={onClose}>
              {pendingReactivation && !hasPendingActions ? 'Fechar' : 'Cancelar'}
            </Button>
            {pendingReactivation ? (
              <>
                {onGoToBilling ? (
                  <Button
                    disabled={saving}
                    icon={Bell}
                    loading={saving}
                    variant="secondary"
                    onClick={() => void handlePendingAction(onGoToBilling)}
                  >
                    Ir para Cobranças/PIX
                  </Button>
                ) : null}
                {onGeneratePix ? (
                  <Button
                    disabled={saving}
                    icon={QrCode}
                    loading={saving}
                    variant="primary"
                    onClick={() => void handlePendingAction(onGeneratePix)}
                  >
                    Ver ou gerar PIX
                  </Button>
                ) : null}
              </>
            ) : (
              <Button
                disabled={saving || !canSubmit}
                icon={RefreshCw}
                loading={saving}
                variant="primary"
                onClick={() => void handleConfirm()}
              >
                Criar reativação
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
