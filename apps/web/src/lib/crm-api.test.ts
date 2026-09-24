import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiFetch,
  applyReferralReward,
  cancelPaymentIntent,
  confirmRenewalReversal,
  createClient,
  deleteClient,
  formatCurrency,
  formatDate,
  getBillingDispatchSummary,
  getFinancialSummary,
  getPaymentIntentsSummary,
  getReferralSummary,
  getReceivablesSummary,
  listBillingDispatches,
  listClientOptions,
  listClients,
  listFinancialTransactions,
  listReferrals,
  listReceivables,
  listWhatsAppPendingContacts,
  payReceivable,
  payReceivables,
  previewReceivablePixReplacement,
  previewReceivablePixReplacementRecovery,
  previewRenewalReversal,
  registerPaymentWebhook,
  recoverReceivablePixReplacement,
  replaceReceivablePix,
  resetUnauthorizedRedirectForTests,
  savePaymentProviderCredential,
  testPaymentProviderCredential,
  updateMessageTemplate,
} from './crm-api';

function latestJsonBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined] | undefined;
  const body = call?.[1]?.body;

  expect(typeof body).toBe('string');

  return JSON.parse(body as string) as Record<string, unknown>;
}

describe('CRM UI formatters', () => {
  afterEach(() => {
    resetUnauthorizedRedirectForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('formats business dates without timezone conversion', () => {
    expect(formatDate('2026-10-10')).toBe('10/10/2026');
  });

  it('formats ISO business dates without leaking the time segment', () => {
    expect(formatDate('2026-09-14T00:00:00.000Z')).toBe('14/09/2026');
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
      message: 'Não foi possível concluir a operação.',
      status: 500,
    } satisfies Partial<ApiError>);
  });

  it('redirects to login when the API returns 401', async () => {
    const assign = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    vi.stubGlobal('window', { location: { assign } });

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Não autenticado.',
      status: 401,
    } satisfies Partial<ApiError>);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('keeps the session when cancel PIX returns a translated provider integration error', async () => {
    const assign = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Credencial do provider invalida ou nao autorizada.' }),
          {
            status: 502,
          },
        ),
      ),
    );
    vi.stubGlobal('window', { location: { assign, pathname: '/dashboard' } });

    await expect(cancelPaymentIntent('intent-1')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Credencial do provider invalida ou nao autorizada.',
      status: 502,
    } satisfies Partial<ApiError>);
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the session when saving a provider credential returns a provider auth error', async () => {
    const assign = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Credencial do provider invalida ou nao autorizada.' }),
          {
            status: 502,
          },
        ),
      ),
    );
    vi.stubGlobal('window', { location: { assign, pathname: '/dashboard' } });

    await expect(
      savePaymentProviderCredential({
        provider: 'FASTFLOW',
        name: 'FastFlow principal',
        token: 'fdpx_test_token_A7F2',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Credencial do provider invalida ou nao autorizada.',
      status: 502,
    } satisfies Partial<ApiError>);
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the session when testing a provider credential returns a provider auth error', async () => {
    const assign = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Credencial do provider invalida ou nao autorizada.' }),
          {
            status: 502,
          },
        ),
      ),
    );
    vi.stubGlobal('window', { location: { assign, pathname: '/dashboard' } });

    await expect(testPaymentProviderCredential('FASTFLOW')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Credencial do provider invalida ou nao autorizada.',
      status: 502,
    } satisfies Partial<ApiError>);
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the session when webhook registration returns a provider auth error', async () => {
    const assign = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Credencial do provider invalida ou nao autorizada.' }),
          {
            status: 502,
          },
        ),
      ),
    );
    vi.stubGlobal('window', { location: { assign, pathname: '/dashboard' } });

    await expect(registerPaymentWebhook('FASTFLOW')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Credencial do provider invalida ou nao autorizada.',
      status: 502,
    } satisfies Partial<ApiError>);
    expect(assign).not.toHaveBeenCalled();
  });

  it('redirects to login once when parallel API requests return 401', async () => {
    const assign = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    vi.stubGlobal('window', { location: { assign } });

    await Promise.all([
      expect(apiFetch('/dashboard')).rejects.toMatchObject({ status: 401 }),
      expect(apiFetch('/clients')).rejects.toMatchObject({ status: 401 }),
      expect(apiFetch('/finance')).rejects.toMatchObject({ status: 401 }),
    ]);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login');
  });

  it('does not redirect again when a 401 happens on the login page', async () => {
    const assign = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    vi.stubGlobal('window', { location: { assign, pathname: '/login' } });

    await expect(apiFetch('/auth/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Não autenticado.',
      status: 401,
    } satisfies Partial<ApiError>);
    expect(assign).not.toHaveBeenCalled();
  });

  it('fetches lightweight client options with trimmed search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await listClientOptions('  bruno  ');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/clients/options?search=bruno'),
      expect.any(Object),
    );
  });

  it('posts the unchanged new-client payload contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'client-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = {
      name: 'Atualiza',
      phone: '(44) 99999-9999',
      email: 'contato@atualiza.test',
      reference: 'ATUALIZA-001',
      planId: 'plan-1',
      recurringValue: 150,
      dueDate: '2026-10-20',
      billingNoticeDays: 3,
      generateInitialReceivable: true,
      notes: 'Observação',
      referrerClientId: 'referrer-1',
      referralRewardType: 'FREE_MONTH' as const,
    };

    await createClient(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/clients'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(latestJsonBody(fetchMock)).toEqual(payload);
  });

  it('sends client list pagination parameters to the API', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 2, pageSize: 10, total: 27, totalPages: 3 },
          }),
          {
            status: 200,
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listClients({ page: 2, pageSize: 10, search: 'ana', status: 'ATIVO' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/clients?page=2&pageSize=10&search=ana&status=ATIVO'),
      expect.any(Object),
    );
  });

  it('uses the backend renewal reversal preview and execution endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ reversible: true, blockers: [], warnings: [] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ idempotentReplay: false }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await previewRenewalReversal('reference-1', 'renewal-1');
    await confirmRenewalReversal('reference-1', 'renewal-1', {
      idempotencyKey: 'reversal-key-123',
      reason: 'Ajuste operacional',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/client-references/reference-1/renewals/renewal-1/revert/preview'),
      expect.not.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/client-references/reference-1/renewals/renewal-1/revert'),
      expect.objectContaining({ method: 'POST' }),
    );
    const secondCall = fetchMock.mock.calls[1] as
      [RequestInfo | URL, RequestInit | undefined] | undefined;
    expect(JSON.parse(secondCall?.[1]?.body as string)).toEqual({
      idempotencyKey: 'reversal-key-123',
      reason: 'Ajuste operacional',
    });
  });

  it('sends only the destructive confirmation DTO when deleting a client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'client-1', removed: true, counts: {} }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const largePreviewKeptInMemory = {
      target: { id: 'client-1', name: 'Atualiza', reference: 'ATUALIZA' },
      counts: { receivables: 1000 },
      receivables: Array.from({ length: 1000 }, (_, index) => ({
        id: `receivable-${index}`,
        description: 'x'.repeat(100),
      })),
    };

    await deleteClient(largePreviewKeptInMemory.target.id, 'REMOVER');

    const call = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const requestUrl =
      typeof call[0] === 'string' ? call[0] : call[0] instanceof URL ? call[0].href : call[0].url;
    const body = call[1]?.body;

    expect(requestUrl).toContain('/clients/client-1');
    expect(JSON.parse(body as string)).toEqual({ confirmation: 'REMOVER' });
    expect(new TextEncoder().encode(body as string).byteLength).toBeLessThan(100);
  });

  it('sends finance pagination independently for receivables, entries and expenses', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 2, pageSize: 10, total: 27, totalPages: 3 },
          }),
          {
            status: 200,
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listReceivables({
      endDate: '2026-09-30',
      page: 2,
      pageSize: 10,
      search: 'boleto',
      startDate: '2026-09-01',
      status: 'PENDENTE',
    });
    await listFinancialTransactions({
      endDate: '2026-09-30',
      page: 2,
      pageSize: 10,
      startDate: '2026-09-01',
      type: 'ENTRADA',
    });
    await listFinancialTransactions({
      endDate: '2026-09-30',
      page: 3,
      pageSize: 10,
      startDate: '2026-09-01',
      type: 'SAIDA',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/receivables?status=PENDENTE&search=boleto&startDate=2026-09-01&endDate=2026-09-30&page=2&pageSize=10',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '/financial-transactions?type=ENTRADA&startDate=2026-09-01&endDate=2026-09-30&page=2&pageSize=10',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        '/financial-transactions?type=SAIDA&startDate=2026-09-01&endDate=2026-09-30&page=3&pageSize=10',
      ),
      expect.any(Object),
    );
  });

  it('sends financial period filters to summaries', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getFinancialSummary({ startDate: '2026-09-01', endDate: '2026-09-30' });
    await getReceivablesSummary({
      endDate: '2026-09-30',
      search: 'Bruno',
      startDate: '2026-09-01',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/finance/summary?startDate=2026-09-01&endDate=2026-09-30'),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '/receivables/summary?search=Bruno&startDate=2026-09-01&endDate=2026-09-30',
      ),
      expect.any(Object),
    );
  });

  it('sends client finance filters to receivables endpoints', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
          }),
          {
            status: 200,
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listReceivables({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      clientReferenceId: '550e8400-e29b-41d4-a716-446655440001',
      endDate: '2026-09-30',
      page: 3,
      pageSize: 10,
      startDate: '2026-09-01',
      status: 'VENCIDO',
    });
    await getReceivablesSummary({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      clientReferenceId: '550e8400-e29b-41d4-a716-446655440001',
      endDate: '2026-09-30',
      startDate: '2026-09-01',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/receivables?clientId=550e8400-e29b-41d4-a716-446655440000&clientReferenceId=550e8400-e29b-41d4-a716-446655440001&status=VENCIDO&startDate=2026-09-01&endDate=2026-09-30&page=3&pageSize=10',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '/receivables/summary?clientId=550e8400-e29b-41d4-a716-446655440000&clientReferenceId=550e8400-e29b-41d4-a716-446655440001&startDate=2026-09-01&endDate=2026-09-30',
      ),
      expect.any(Object),
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('status=');
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('page=');
  });

  it('sends payment intent summary filters by client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 4 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getPaymentIntentsSummary({ clientId: '550e8400-e29b-41d4-a716-446655440000' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/payment-intents/summary?clientId=550e8400-e29b-41d4-a716-446655440000',
      ),
      expect.any(Object),
    );
  });

  it('uses explicit endpoints for PIX replacement preview and confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await previewReceivablePixReplacement('receivable-1', { provider: 'FASTFLOW' });
    await replaceReceivablePix('receivable-1', {
      provider: 'FASTFLOW',
      expectedCurrentIntentId: 'intent-1',
      reason: 'QR expirado',
      idempotencyKey: 'pix-replace:receivable-1:intent-1',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/receivables/receivable-1/pix/replace-preview?provider=FASTFLOW'),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/receivables/receivable-1/pix/replace'),
      expect.objectContaining({ method: 'POST' }),
    );
    const confirmCall = fetchMock.mock.calls[1] as
      [RequestInfo | URL, RequestInit | undefined] | undefined;
    const confirmBody = confirmCall?.[1]?.body;
    expect(typeof confirmBody).toBe('string');
    expect(JSON.parse(confirmBody as string)).toEqual({
      provider: 'FASTFLOW',
      expectedCurrentIntentId: 'intent-1',
      reason: 'QR expirado',
      idempotencyKey: 'pix-replace:receivable-1:intent-1',
    });
  });

  it('uses explicit endpoints for PIX replacement recovery preview and confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);

    await previewReceivablePixReplacementRecovery('receivable-1', {
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
    });
    await recoverReceivablePixReplacement('receivable-1', {
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      expectedCurrentIntentId: 'intent-75148',
      reason: 'Replace órfão',
      idempotencyKey: 'pix-replace-recovery:receivable-1:intent-75148:FASTFLOW:75739',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/receivables/receivable-1/pix/replace-recovery-preview?provider=FASTFLOW&providerTransactionId=75739',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/receivables/receivable-1/pix/replace-recovery'),
      expect.objectContaining({ method: 'POST' }),
    );
    const confirmCall = fetchMock.mock.calls[1] as
      [RequestInfo | URL, RequestInit | undefined] | undefined;
    const confirmBody = confirmCall?.[1]?.body;
    expect(typeof confirmBody).toBe('string');
    expect(JSON.parse(confirmBody as string)).toEqual({
      provider: 'FASTFLOW',
      providerTransactionId: '75739',
      expectedCurrentIntentId: 'intent-75148',
      reason: 'Replace órfão',
      idempotencyKey: 'pix-replace-recovery:receivable-1:intent-75148:FASTFLOW:75739',
    });
  });

  it('sends referrals pagination and summary filters without status in summary', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 2, pageSize: 10, total: 27, totalPages: 3 },
          }),
          {
            status: 200,
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listReferrals({
      page: 2,
      pageSize: 10,
      referrerClientId: 'client-bruno',
      search: 'soraia',
      status: 'QUALIFIED',
    });
    await getReferralSummary({
      referrerClientId: 'client-bruno',
      search: 'soraia',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/referrals?page=2&pageSize=10&referrerClientId=client-bruno&search=soraia&status=QUALIFIED',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/referrals/summary?referrerClientId=client-bruno&search=soraia'),
      expect.any(Object),
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain('status=');
  });

  it('sends billing and waitlist pagination with their filters', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { page: 2, pageSize: 10, total: 26, totalPages: 3 },
          }),
          {
            status: 200,
          },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listBillingDispatches({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      clientReferenceId: '550e8400-e29b-41d4-a716-446655440001',
      dueDate: '2026-09-19',
      endDate: '2026-09-30',
      page: 2,
      pageSize: 10,
      search: 'maria',
      startDate: '2026-09-01',
      status: 'SCHEDULED',
    });
    await listWhatsAppPendingContacts({
      page: 2,
      pageSize: 10,
      search: 'maria',
      status: 'PENDENTE',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        '/billing/dispatches?clientId=550e8400-e29b-41d4-a716-446655440000&clientReferenceId=550e8400-e29b-41d4-a716-446655440001&status=SCHEDULED&search=maria&startDate=2026-09-01&endDate=2026-09-30&dueDate=2026-09-19&page=2&pageSize=10',
      ),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        '/whatsapp/pending-contacts?status=PENDENTE&search=maria&page=2&pageSize=10',
      ),
      expect.any(Object),
    );
  });

  it('sends billing dispatch summary filters without pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ scheduled: 3, sent: 2, failed: 1, ignoredOrCanceled: 4 }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await getBillingDispatchSummary({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      clientReferenceId: '550e8400-e29b-41d4-a716-446655440001',
      dueDate: '2026-09-19',
      endDate: '2026-09-30',
      search: 'maria',
      startDate: '2026-09-01',
      status: 'FAILED',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/billing/dispatches/summary?clientId=550e8400-e29b-41d4-a716-446655440000&clientReferenceId=550e8400-e29b-41d4-a716-446655440001&status=FAILED&search=maria&startDate=2026-09-01&endDate=2026-09-30&dueDate=2026-09-19',
      ),
      expect.any(Object),
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('page=');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('pageSize=');
  });

  it('applies a referral reward with exactly one POST carrying only the selected reference id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await applyReferralReward('referral-id', { clientReferenceId: 'reference-id' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/referrals/referral-id/apply-reward'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientReferenceId: 'reference-id' }),
      }),
    );
  });

  it('persists edited message template name and content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'template-id',
          name: 'Recuperação 7 dias ajustada',
          type: 'RECOVERY_DAY_7',
          content: 'Olá, {{primeiroNome}}.',
          active: true,
          variables: [],
          createdAt: '2026-09-14T00:00:00.000Z',
          updatedAt: '2026-09-14T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await updateMessageTemplate('template-id', {
      name: 'Recuperação 7 dias ajustada',
      content: 'Olá, {{primeiroNome}}.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/billing/templates/template-id'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          name: 'Recuperação 7 dias ajustada',
          content: 'Olá, {{primeiroNome}}.',
        }),
      }),
    );
  });

  it('sends a compact payment DTO even when the caller passes a large object', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const largeNotes = `  ${'x'.repeat(74000)}  `;

    await payReceivable('receivable-id', {
      paymentDate: '2026-09-17',
      categoryId: '11111111-1111-4111-8111-111111111111',
      notes: largeNotes,
      receivable: { qrCodeData: 'data:image/png;base64,ignored' },
    } as never);

    const body = latestJsonBody(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/receivables/receivable-id/payment'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body).toEqual({
      paymentDate: '2026-09-17',
      categoryId: '11111111-1111-4111-8111-111111111111',
      notes: 'x'.repeat(2000),
    });
    expect(JSON.stringify(body).length).toBeLessThan(2500);
  });

  it('sends grouped payment ids with the same compact payment DTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await payReceivables({
      receivableIds: ['77777777-7777-4777-8777-777777777777'],
      paymentDate: '2026-09-17',
      notes: '  Pago via conferência manual  ',
      paymentGroup: { items: [{ qrCodeData: 'ignored' }] },
    } as never);

    const body = latestJsonBody(fetchMock);

    expect(body).toEqual({
      receivableIds: ['77777777-7777-4777-8777-777777777777'],
      paymentDate: '2026-09-17',
      notes: 'Pago via conferência manual',
    });
  });
});
