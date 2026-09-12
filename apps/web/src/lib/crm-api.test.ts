import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, formatCurrency, formatDate } from './crm-api';

describe('CRM UI formatters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('formats business dates without timezone conversion', () => {
    expect(formatDate('2026-10-10')).toBe('10/10/2026');
  });

  it('formats BRL values', () => {
    expect(formatCurrency('50.00')).toContain('50,00');
  });

  it('does not parse an empty successful response as JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await expect(apiFetch('/plans/plan-id', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('preserves HTTP status when an error response has no JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 500, statusText: 'Server Error' })),
    );

    await expect(apiFetch('/whatsapp/connection', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Nao foi possivel concluir a operacao.',
      status: 500,
    } satisfies Partial<ApiError>);
  });
});
