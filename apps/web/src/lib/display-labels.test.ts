import { describe, expect, it } from 'vitest';
import {
  billingMessageTemplates,
  recoveryMessageTemplates,
  recoveryTemplateCards,
  removalCountLabel,
} from './display-labels';

describe('display labels', () => {
  it('translates removal preview count keys to Brazilian Portuguese labels', () => {
    expect(removalCountLabel('clientReferences')).toBe('Referências do cliente');
    expect(removalCountLabel('receivables')).toBe('Contas a receber');
    expect(removalCountLabel('messageDispatches')).toBe('Mensagens de cobrança');
    expect(removalCountLabel('financialTransactions')).toBe('Transações financeiras');
    expect(removalCountLabel('statusHistory')).toBe('Histórico de status');
  });

  it('uses a friendly fallback instead of exposing unknown technical keys', () => {
    expect(removalCountLabel('someUnexpectedCamelCaseKey')).toBe('Registro relacionado');
  });

  it('keeps the billing screen focused on the standard billing template', () => {
    const templates = [
      { name: 'Cobrança padrão', type: 'BILLING_DUE' },
      { name: 'Recuperação 3 dias', type: 'RECOVERY_DAY_3' },
      { name: 'Recuperação 7 dias', type: 'RECOVERY_DAY_7' },
      { name: 'Recuperação 15 dias', type: 'RECOVERY_DAY_15' },
      { name: 'Recuperação 30 dias', type: 'RECOVERY_DAY_30' },
    ];

    expect(billingMessageTemplates(templates)).toEqual([
      { name: 'Cobrança padrão', type: 'BILLING_DUE' },
    ]);
  });

  it('lists only the recovery step templates for the recovery area', () => {
    const templates = [
      { name: 'Cobrança padrão', type: 'BILLING_DUE' },
      { name: 'Recuperação 3 dias', type: 'RECOVERY_DAY_3' },
      { name: 'Recuperação 7 dias', type: 'RECOVERY_DAY_7' },
      { name: 'Recuperação 15 dias', type: 'RECOVERY_DAY_15' },
      { name: 'Recuperação 30 dias', type: 'RECOVERY_DAY_30' },
    ];

    expect(recoveryMessageTemplates(templates).map((template) => template.name)).toEqual([
      'Recuperação 3 dias',
      'Recuperação 7 dias',
      'Recuperação 15 dias',
      'Recuperação 30 dias',
    ]);
    expect(recoveryTemplateCards.map((card) => card.title)).toEqual([
      '3 dias após vencimento',
      '7 dias após vencimento',
      '15 dias após vencimento',
      '30 dias após vencimento',
    ]);
  });
});
