import {
  BadGatewayException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MercadoPagoApiClient } from './mercado-pago-api.client';
import { MercadoPagoPaymentProvider } from './mercado-pago-payment.provider';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';
import type { CreatePixInput } from './payment-provider';

const apiClient = {
  createOrder: vi.fn<MercadoPagoApiClient['createOrder']>(),
  getOrder: vi.fn<MercadoPagoApiClient['getOrder']>(),
};
const credentials = {
  getActiveMercadoPagoAccess: vi.fn().mockResolvedValue({
    token: 'encrypted-test-token',
    credentialId: '11111111-1111-4111-8111-111111111111',
    environment: 'TEST',
    credentialFingerprint: 'sha256:credential',
    accountIdHash: 'sha256:account',
    proofExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
  }),
};
const config = {
  get: vi.fn((key: string): string | undefined =>
    key === 'MERCADO_PAGO_ENABLED' ? 'true' : undefined,
  ),
};

const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ORD-1',
    live_mode: false,
    total_amount: '50.00',
    total_paid_amount: '0.00',
    country_code: 'BRA',
    currency: 'BRL',
    external_reference: 'intent-1',
    status: 'action_required',
    status_detail: 'waiting_transfer',
    created_date: '2026-11-01T20:00:00.000Z',
    integration_data: { application_id: 'sandbox-application-1' },
    transactions: {
      payments: [
        {
          id: 'PAY-1',
          amount: '50.00',
          expiration_time: 'PT30M',
          status: 'action_required',
          status_detail: 'waiting_transfer',
          payment_method: {
            id: 'pix',
            type: 'bank_transfer',
            ticket_url: 'https://sandbox.example.test/ticket',
            qr_code: '000201-pix-copy-paste',
            qr_code_base64: VALID_PNG_BASE64,
          },
        },
      ],
    },
    ...overrides,
  };
}

function input(): CreatePixInput {
  return {
    provider: 'MERCADO_PAGO' as const,
    receivableId: 'receivable-1',
    amount: new Prisma.Decimal('50.00'),
    description: 'Mensalidade',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    clientName: 'Cliente',
    payerEmail: ' cliente@example.com ',
    idempotencyKey: 'intent-1',
    externalReference: 'intent-1',
    notificationUrl: null,
  };
}

describe('MercadoPagoPaymentProvider', () => {
  const provider = new MercadoPagoPaymentProvider(
    apiClient as unknown as MercadoPagoApiClient,
    credentials as unknown as PaymentProviderCredentialsService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    config.get.mockImplementation((key: string) =>
      key === 'MERCADO_PAGO_ENABLED' ? 'true' : undefined,
    );
    credentials.getActiveMercadoPagoAccess.mockResolvedValue({
      token: 'encrypted-test-token',
      credentialId: '11111111-1111-4111-8111-111111111111',
      environment: 'TEST',
      credentialFingerprint: 'sha256:credential',
      accountIdHash: 'sha256:account',
      proofExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    apiClient.createOrder.mockResolvedValue(orderFixture());
    apiClient.getOrder.mockResolvedValue(orderFixture());
  });

  it('creates Pix Orders with email, stable identifiers, QR and copy-paste', async () => {
    const result = await provider.createPix(input());

    const [token, idempotencyKey, payload] = apiClient.createOrder.mock.calls[0] ?? [];
    expect(token).toBe('encrypted-test-token');
    expect(idempotencyKey).toBe('intent-1');
    expect(payload).toMatchObject({
      total_amount: '50.00',
      external_reference: 'intent-1',
      processing_mode: 'automatic',
      payer: { email: 'cliente@example.com' },
    });
    expect(payload?.payer).not.toHaveProperty('first_name');
    expect(payload?.transactions.payments[0]).toMatchObject({
      amount: '50.00',
      payment_method: { id: 'pix', type: 'bank_transfer' },
    });
    expect(payload?.transactions.payments[0].expiration_time).toMatch(/^PT\d+S$/);
    expect(result).toMatchObject({
      provider: 'MERCADO_PAGO',
      providerEnvironment: 'TEST',
      providerTransactionId: 'ORD-1',
      externalReference: 'intent-1',
      externalDepixId: 'PAY-1',
      externalStatus: 'action_required/waiting_transfer',
      status: 'WAITING_PAYMENT',
      pixCopyPaste: '000201-pix-copy-paste',
      qrCodeData: `data:image/png;base64,${VALID_PNG_BASE64}`,
      providerCredentialId: '11111111-1111-4111-8111-111111111111',
      providerApplicationId: 'sandbox-application-1',
    });
  });

  it('adds APRO only behind the explicit TEST sandbox gate', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_ENABLED') return 'true';
      if (key === 'MERCADO_PAGO_ENVIRONMENT') return 'TEST';
      if (key === 'MERCADO_PAGO_SANDBOX_APRO_ENABLED') return 'true';
      return undefined;
    });

    await provider.createPix(input());

    expect(apiClient.createOrder.mock.calls[0]?.[2].payer).toEqual({
      email: 'cliente@example.com',
      first_name: 'APRO',
    });
  });

  it('blocks APRO in PRODUCTION before creating an order', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_ENABLED') return 'true';
      if (key === 'MERCADO_PAGO_ENVIRONMENT') return 'PRODUCTION';
      if (key === 'MERCADO_PAGO_SANDBOX_APRO_ENABLED') return 'true';
      return undefined;
    });

    await expect(provider.createPix(input())).rejects.toThrow('PRODUCTION permanece bloqueado');
    expect(apiClient.createOrder).not.toHaveBeenCalled();
  });

  it('blocks every PRODUCTION Pix before credentials or external calls', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'MERCADO_PAGO_ENABLED') return 'true';
      if (key === 'MERCADO_PAGO_ENVIRONMENT') return 'PRODUCTION';
      return undefined;
    });

    await expect(provider.createPix(input())).rejects.toThrow('PRODUCTION permanece bloqueado');
    expect(credentials.getActiveMercadoPagoAccess).not.toHaveBeenCalled();
    expect(apiClient.createOrder).not.toHaveBeenCalled();
  });

  it('normalizes raw and existing safe QR image data URIs', async () => {
    const payment = orderFixture().transactions.payments[0]!;
    apiClient.createOrder.mockResolvedValueOnce(orderFixture());
    await expect(provider.createPix(input())).resolves.toMatchObject({
      qrCodeData: `data:image/png;base64,${VALID_PNG_BASE64}`,
    });

    apiClient.createOrder.mockResolvedValueOnce(
      orderFixture({
        transactions: {
          payments: [
            {
              ...payment,
              payment_method: {
                ...payment.payment_method,
                qr_code_base64: `data:image/png;base64,${VALID_PNG_BASE64}`,
              },
            },
          ],
        },
      }),
    );
    await expect(provider.createPix(input())).resolves.toMatchObject({
      qrCodeData: `data:image/png;base64,${VALID_PNG_BASE64}`,
    });
  });

  it('accepts an absent QR image while preserving Pix Copia e Cola', async () => {
    const payment = orderFixture().transactions.payments[0]!;
    apiClient.createOrder.mockResolvedValueOnce(
      orderFixture({
        transactions: {
          payments: [
            {
              ...payment,
              payment_method: {
                ...payment.payment_method,
                qr_code_base64: undefined,
              },
            },
          ],
        },
      }),
    );

    await expect(provider.createPix(input())).resolves.toMatchObject({
      qrCodeData: null,
      pixCopyPaste: '000201-pix-copy-paste',
    });
  });

  it.each([
    'not-base64',
    'aGVsbG8=',
    `data:text/html;base64,${VALID_PNG_BASE64}`,
    `data:image/jpeg;base64,${VALID_PNG_BASE64}`,
  ])('rejects an invalid or unsafe QR image without exposing its contents: %s', async (qr) => {
    const payment = orderFixture().transactions.payments[0]!;
    apiClient.createOrder.mockResolvedValueOnce(
      orderFixture({
        transactions: {
          payments: [
            {
              ...payment,
              payment_method: { ...payment.payment_method, qr_code_base64: qr },
            },
          ],
        },
      }),
    );

    await expect(provider.createPix(input())).rejects.toThrow('QR Code em formato invalido');
  });

  it.each([undefined, '', '   ', 'invalid-email'])(
    'rejects missing or invalid payer email: %s',
    async (payerEmail) => {
      const request = input();
      if (payerEmail === undefined) delete request.payerEmail;
      else request.payerEmail = payerEmail;
      await expect(provider.createPix(request)).rejects.toBeInstanceOf(BadRequestException);
      expect(apiClient.createOrder).not.toHaveBeenCalled();
    },
  );

  it('rejects an external reference outside the official Orders contract', async () => {
    await expect(
      provider.createPix({ ...input(), externalReference: 'pix:reference:invalid' }),
    ).rejects.toThrow('Referencia externa Mercado Pago invalida.');
    expect(apiClient.createOrder).not.toHaveBeenCalled();
  });

  it('rejects a response with divergent reference, currency or payment method', async () => {
    apiClient.createOrder.mockResolvedValueOnce(
      orderFixture({ external_reference: 'other-reference' }),
    );
    await expect(provider.createPix(input())).rejects.toThrow('referencia externa divergente');

    apiClient.createOrder.mockResolvedValueOnce(orderFixture({ currency: 'USD' }));
    await expect(provider.createPix(input())).rejects.toThrow('moeda divergente');

    apiClient.createOrder.mockResolvedValueOnce(
      orderFixture({
        transactions: {
          payments: [
            {
              ...orderFixture().transactions.payments[0],
              payment_method: { id: 'bolbradesco', type: 'ticket' },
            },
          ],
        },
      }),
    );
    await expect(provider.createPix(input())).rejects.toThrow('meio de pagamento divergente');
  });

  it('fails closed when Mercado Pago is disabled', async () => {
    config.get.mockReturnValue('false');
    await expect(provider.createPix(input())).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(provider.getPixTransaction('ORD-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(apiClient.getOrder).not.toHaveBeenCalled();
  });

  it('rejects a provider response with a divergent amount', async () => {
    apiClient.createOrder.mockResolvedValue(
      orderFixture({
        total_amount: '51.00',
        transactions: {
          payments: [
            {
              ...orderFixture().transactions.payments[0],
              amount: '51.00',
            },
          ],
        },
      }),
    );
    await expect(provider.createPix(input())).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('uses the confirmed paid amount when reconciling an accredited payment', async () => {
    apiClient.getOrder.mockResolvedValue(
      orderFixture({
        status: 'processed',
        status_detail: 'accredited',
        total_paid_amount: '49.99',
        transactions: {
          payments: [
            {
              ...orderFixture().transactions.payments[0],
              paid_amount: '49.99',
              status: 'processed',
              status_detail: 'accredited',
              date_approved: '2026-11-02T12:00:00.000Z',
            },
          ],
        },
      }),
    );

    await expect(provider.getPixTransaction('ORD-1')).resolves.toMatchObject({
      amount: new Prisma.Decimal('49.99'),
      status: 'PAID',
    });
  });

  it.each([
    ['processed', 'accredited', 'PAID'],
    ['action_required', 'waiting_transfer', 'WAITING_PAYMENT'],
    ['processing', 'in_process', 'WAITING_PAYMENT'],
    ['canceled', 'expired', 'EXPIRED'],
    ['canceled', 'canceled', 'CANCELED'],
    ['refunded', 'refunded', 'REFUNDED'],
    ['failed', 'failed', 'FAILED'],
  ])('maps %s/%s to %s', async (status, statusDetail, expected) => {
    apiClient.getOrder.mockResolvedValue(
      orderFixture({
        status,
        status_detail: statusDetail,
        ...(expected === 'PAID' ? { total_paid_amount: '50.00' } : {}),
        transactions: {
          payments: [
            {
              ...orderFixture().transactions.payments[0],
              status,
              status_detail: statusDetail,
              ...(expected === 'PAID' ? { paid_amount: '50.00' } : {}),
            },
          ],
        },
      }),
    );
    await expect(provider.getPixTransaction('ORD-1')).resolves.toMatchObject({
      status: expected,
    });
  });

  it('keeps a processed order fail-closed when the payment is not accredited', async () => {
    apiClient.getOrder.mockResolvedValue(
      orderFixture({
        status: 'processed',
        status_detail: 'accredited',
        total_paid_amount: '50.00',
      }),
    );

    await expect(provider.getPixTransaction('ORD-1')).resolves.toMatchObject({
      status: 'WAITING_PAYMENT',
      orderStatus: 'processed',
      paymentStatus: 'action_required',
    });
  });

  it('parses the documented Pix pending example without inventing optional fields', async () => {
    apiClient.getOrder.mockResolvedValue(
      orderFixture({
        live_mode: undefined,
        currency: undefined,
        total_paid_amount: undefined,
        country_code: 'BRA',
        status: 'action_required',
        status_detail: 'waiting_transfer',
      }),
    );

    await expect(provider.getPixTransaction('ORD-1')).resolves.toMatchObject({
      providerTransactionId: 'ORD-1',
      externalDepixId: 'PAY-1',
      externalReference: 'intent-1',
      status: 'WAITING_PAYMENT',
      amount: new Prisma.Decimal('50.00'),
      orderTotalAmount: new Prisma.Decimal('50.00'),
      orderTotalPaidAmount: null,
      countryCode: 'BRA',
      currency: null,
      liveMode: null,
      orderStatus: 'action_required',
      paymentStatus: 'action_required',
    });
  });

  it('reuses the same idempotency key on a safe retry', async () => {
    await provider.createPix(input());
    await provider.createPix(input());
    expect(apiClient.createOrder.mock.calls.map((call) => call[1])).toEqual([
      'intent-1',
      'intent-1',
    ]);
  });
});
