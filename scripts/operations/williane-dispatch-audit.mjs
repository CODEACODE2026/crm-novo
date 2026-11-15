import crypto from 'node:crypto';

const CRITICAL_FIELDS = [
  'id',
  'clientId',
  'clientReferenceId',
  'receivableId',
  'whatsAppConnectionId',
  'recoveryCampaignId',
  'phone',
  'origin',
  'status',
  'requestId',
  'idempotencyKey',
  'scheduledFor',
  'nextAttemptAt',
  'attempts',
  'providerMessageId',
  'errorCode',
  'errorMessage',
  'sentAt',
  'createdAt',
];

const CONTENT_FIELDS = ['templateId', 'body', 'renderedContent'];
const VOLATILE_FIELDS = ['updatedAt'];
const ITEM_FIELDS = [
  'receivableId',
  'clientReferenceId',
  'amount',
  'dueDate',
  'referenceSnapshot',
  'statusSnapshot',
];

function normalize(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toJSON === 'function') {
    return normalize(value.toJSON());
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const text = value.toString();
    if (text !== '[object Object]') return text;
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fieldHashes(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, hash(normalize(source[field]))]));
}

function semanticItem(item) {
  return Object.fromEntries(ITEM_FIELDS.map((field) => [field, normalize(item[field])]));
}

function semanticItems(items = []) {
  return items.map(semanticItem).sort((left, right) => {
    return JSON.stringify(left).localeCompare(JSON.stringify(right));
  });
}

export function buildDispatchAudit(dispatch) {
  const items = semanticItems(dispatch.items);
  return {
    criticalFieldHashes: fieldHashes(dispatch, CRITICAL_FIELDS),
    contentFieldHashes: fieldHashes(dispatch, CONTENT_FIELDS),
    volatileFieldHashes: fieldHashes(dispatch, VOLATILE_FIELDS),
    semanticItemsFingerprint: hash(items),
    semanticItemsCount: items.length,
  };
}

function changedFields(before = {}, current = {}, prefix) {
  const fields = new Set([...Object.keys(before), ...Object.keys(current)]);
  return [...fields]
    .filter((field) => before[field] !== current[field])
    .sort()
    .map((field) => `${prefix}.${field}`);
}

export function compareDispatchAudits(before, current) {
  const criticalChanges = changedFields(
    before.criticalFieldHashes,
    current.criticalFieldHashes,
    'dispatch',
  );
  const contentChanges = changedFields(
    before.contentFieldHashes,
    current.contentFieldHashes,
    'dispatch',
  );
  const volatileChanges = changedFields(
    before.volatileFieldHashes,
    current.volatileFieldHashes,
    'metadata',
  );
  const itemChanges = [];
  if (
    before.semanticItemsFingerprint !== current.semanticItemsFingerprint ||
    before.semanticItemsCount !== current.semanticItemsCount
  ) {
    itemChanges.push('items.semantic');
  }
  const blockingChanges = [...criticalChanges, ...contentChanges, ...itemChanges];
  return {
    safe: blockingChanges.length === 0,
    blockingChanges,
    allowedVolatileChanges: volatileChanges,
  };
}

export const dispatchAuditFields = Object.freeze({
  critical: [...CRITICAL_FIELDS],
  content: [...CONTENT_FIELDS],
  volatile: [...VOLATILE_FIELDS],
  items: [...ITEM_FIELDS],
});
