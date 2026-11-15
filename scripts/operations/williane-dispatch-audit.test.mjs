import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDispatchAudit, compareDispatchAudits } from './williane-dispatch-audit.mjs';

function baseline() {
  return {
    id: 'dispatch-1',
    clientId: 'client-1',
    clientReferenceId: 'reference-1',
    receivableId: 'receivable-1',
    templateId: 'template-1',
    whatsAppConnectionId: 'connection-1',
    recoveryCampaignId: null,
    phone: '5581999999999',
    body: 'conteudo renderizado',
    renderedContent: 'conteudo renderizado',
    origin: 'BILLING',
    status: 'SCHEDULED',
    requestId: 'request-1',
    idempotencyKey: 'billing:one',
    scheduledFor: '2030-01-15T12:00:00.000Z',
    nextAttemptAt: '2030-01-15T12:00:00.000Z',
    attempts: 0,
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    items: [
      {
        id: 'item-old',
        messageDispatchId: 'dispatch-1',
        receivableId: 'receivable-1',
        clientReferenceId: 'reference-1',
        amount: '100.00',
        dueDate: '2030-01-15T00:00:00.000Z',
        referenceSnapshot: 'REF-001',
        statusSnapshot: 'PENDING',
        createdAt: '2026-11-14T10:00:00.000Z',
        updatedAt: '2026-11-14T10:00:00.000Z',
      },
    ],
  };
}

function compare(beforeRaw, afterRaw) {
  return compareDispatchAudits(buildDispatchAudit(beforeRaw), buildDispatchAudit(afterRaw));
}

test('aceita reconciliacao que altera apenas updatedAt e recria IDs dos itens', () => {
  const before = baseline();
  const after = structuredClone(before);
  after.updatedAt = '2026-11-15T14:00:00.000Z';
  after.items[0].id = 'item-recreated';
  after.items[0].createdAt = '2026-11-15T14:00:00.000Z';
  after.items[0].updatedAt = '2026-11-15T14:00:00.000Z';

  assert.deepEqual(compare(before, after), {
    safe: true,
    blockingChanges: [],
    allowedVolatileChanges: ['metadata.updatedAt'],
  });
});

test('fingerprint semantico de itens independe da ordem', () => {
  const before = baseline();
  before.items.push({
    ...before.items[0],
    id: 'item-2',
    receivableId: 'receivable-2',
    amount: '250.00',
  });
  const after = structuredClone(before);
  after.items.reverse();
  assert.equal(compare(before, after).safe, true);
});

for (const [field, value] of [
  ['clientId', 'client-2'],
  ['clientReferenceId', 'reference-2'],
  ['receivableId', 'receivable-2'],
  ['whatsAppConnectionId', 'connection-2'],
  ['phone', '5581888888888'],
  ['origin', 'RECOVERY'],
  ['scheduledFor', '2030-01-16T12:00:00.000Z'],
  ['nextAttemptAt', '2030-01-16T12:00:00.000Z'],
  ['attempts', 1],
  ['status', 'PROCESSING'],
  ['providerMessageId', 'provider-message'],
  ['errorCode', 'PROVIDER_FAILURE'],
  ['errorMessage', 'erro financeiro real'],
  ['sentAt', '2026-11-15T14:00:00.000Z'],
  ['templateId', 'template-2'],
  ['body', 'conteudo alterado'],
  ['renderedContent', 'conteudo renderizado alterado'],
]) {
  test(`bloqueia alteracao real em ${field} sem expor valor`, () => {
    const before = baseline();
    const after = structuredClone(before);
    after[field] = value;
    const result = compare(before, after);
    assert.equal(result.safe, false);
    assert.deepEqual(result.blockingChanges, [`dispatch.${field}`]);
    assert.equal(JSON.stringify(result).includes(String(value)), false);
  });
}

for (const [field, value] of [
  ['amount', '101.00'],
  ['dueDate', '2030-01-16T00:00:00.000Z'],
  ['referenceSnapshot', 'REF-CHANGED'],
  ['statusSnapshot', 'PAID'],
]) {
  test(`bloqueia alteracao semantica de item em ${field}`, () => {
    const before = baseline();
    const after = structuredClone(before);
    after.items[0][field] = value;
    const result = compare(before, after);
    assert.equal(result.safe, false);
    assert.deepEqual(result.blockingChanges, ['items.semantic']);
    assert.equal(JSON.stringify(result).includes(String(value)), false);
  });
}
