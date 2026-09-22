import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const clientFormSource = readFileSync(join(currentDir, 'client-form.tsx'), 'utf8');

describe('ClientForm manual initial billing source', () => {
  it('keeps manual initial activation explicit and warns referrals without it', () => {
    expect(clientFormSource).toContain('generateInitialReceivable');
    expect(clientFormSource).toContain('Aguardar pagamento para ativar este serviço');
    expect(clientFormSource).toContain('Status inicial');
    expect(clientFormSource).toContain('Pendente de pagamento');
    expect(clientFormSource).toContain('Primeira cobrança');
    expect(clientFormSource).toContain('Ativação inicial');
    expect(clientFormSource).toContain('Sem cobrança inicial, esta indicação não será qualificada');
  });

  it('keeps the compact new-client sections and fields visible in one form', () => {
    expect(clientFormSource).toContain('client-form-create');
    expect(clientFormSource).toContain('Dados pessoais');
    expect(clientFormSource).toContain('Plano e cobrança inicial');
    expect(clientFormSource).toContain('Contato e observações');
    expect(clientFormSource).toContain('Nome');
    expect(clientFormSource).toContain('WhatsApp');
    expect(clientFormSource).toContain('E-mail');
    expect(clientFormSource).toContain('Referência');
    expect(clientFormSource).toContain('Plano');
    expect(clientFormSource).toContain('Valor');
    expect(clientFormSource).toContain('Vencimento');
    expect(clientFormSource).toContain('Antecedência da cobrança');
    expect(clientFormSource).toContain('Observações (opcional)');
    expect(clientFormSource).toContain('Indicado por (opcional)');
  });

  it('preserves the create payload contract during the UI redesign', () => {
    expect(clientFormSource).toContain('const payload: ClientPayload = {');
    expect(clientFormSource).toContain('name,');
    expect(clientFormSource).toContain('phone,');
    expect(clientFormSource).toContain('reference,');
    expect(clientFormSource).toContain('planId,');
    expect(clientFormSource).toContain('recurringValue: Number(recurringValue)');
    expect(clientFormSource).toContain('dueDate,');
    expect(clientFormSource).toContain('billingNoticeDays: Number(billingNoticeDays)');
    expect(clientFormSource).toContain('generateInitialReceivable,');
    expect(clientFormSource).toContain('payload.referrerClientId = referrerClientId');
    expect(clientFormSource).toContain("payload.referralRewardType = 'FREE_MONTH'");
  });

  it('keeps cancel, enter, textarea and double-submit safeguards local to the form', () => {
    expect(clientFormSource).toContain('onCancel');
    expect(clientFormSource).toContain('Cancelar');
    expect(clientFormSource).toContain('loadingRef.current');
    expect(clientFormSource).toContain("event.key !== 'Enter'");
    expect(clientFormSource).toContain('event.target instanceof HTMLTextAreaElement');
    expect(clientFormSource).toContain('event.preventDefault()');
  });
});
