import { describe, expect, it } from 'vitest';
import { removalCountLabel } from './display-labels';

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
});
