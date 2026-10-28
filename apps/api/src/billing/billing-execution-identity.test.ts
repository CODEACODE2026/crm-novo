import { describe, expect, it } from 'vitest';
import { buildBillingExecutionIdentity } from './billing-execution-identity';

describe('buildBillingExecutionIdentity', () => {
  it('builds the same identity for the same exact receivable set in any order', () => {
    const first = buildBillingExecutionIdentity({
      clientId: 'client-1',
      cycleKey: '2026-11',
      receivables: [
        { id: 'receivable-b', amount: '20', dueDate: '2026-11-20' },
        { id: 'receivable-a', amount: '10', dueDate: '2026-11-10' },
      ],
    });
    const second = buildBillingExecutionIdentity({
      clientId: 'client-1',
      cycleKey: '2026-11',
      receivables: [
        { id: 'receivable-a', amount: '10.00', dueDate: '2026-11-10' },
        { id: 'receivable-b', amount: 20, dueDate: '2026-11-20' },
      ],
    });

    expect(first).toEqual(second);
    expect(first.receivableIds).toEqual(['receivable-a', 'receivable-b']);
    expect(first.receivableSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.executionKey).toMatch(/^billing-execution:v2:[0-9a-f]{64}$/);
  });

  it('changes identity when the cycle, client or exact receivable set changes', () => {
    const base = {
      clientId: 'client-1',
      cycleKey: '2026-11',
      receivables: [{ id: 'receivable-a', amount: 30, dueDate: '2026-11-10' }],
    } as const;

    const keys = [
      buildBillingExecutionIdentity(base).executionKey,
      buildBillingExecutionIdentity({ ...base, clientId: 'client-2' }).executionKey,
      buildBillingExecutionIdentity({ ...base, cycleKey: '2026-12' }).executionKey,
      buildBillingExecutionIdentity({
        ...base,
        receivables: [{ id: 'receivable-b', amount: 30, dueDate: '2026-11-10' }],
      }).executionKey,
      buildBillingExecutionIdentity({
        ...base,
        receivables: [{ id: 'receivable-a', amount: 31, dueDate: '2026-11-10' }],
      }).executionKey,
      buildBillingExecutionIdentity({
        ...base,
        receivables: [{ id: 'receivable-a', amount: 30, dueDate: '2026-11-11' }],
      }).executionKey,
    ];

    expect(new Set(keys).size).toBe(6);
  });

  it.each([
    [
      {
        clientId: ' ',
        cycleKey: '2026-11',
        receivables: [{ id: 'receivable-a', amount: 30, dueDate: '2026-11-10' }],
      },
    ],
    [
      {
        clientId: 'client-1',
        cycleKey: '\n',
        receivables: [{ id: 'receivable-a', amount: 30, dueDate: '2026-11-10' }],
      },
    ],
    [{ clientId: 'client-1', cycleKey: '2026-11', receivables: [] }],
    [
      {
        clientId: 'client-1',
        cycleKey: '2026-11',
        receivables: [
          { id: 'receivable-a', amount: 30, dueDate: '2026-11-10' },
          { id: 'receivable-a', amount: 30, dueDate: '2026-11-10' },
        ],
      },
    ],
  ])('rejects incomplete or duplicate identity input', (input) => {
    expect(() => buildBillingExecutionIdentity(input)).toThrow();
  });
});
