import { describe, expect, it, vi } from 'vitest';
import { PaymentWebhookController } from './payment-webhook.controller';

describe('PaymentWebhookController', () => {
  it('forwards the official Mercado Pago signature headers and signed order query', async () => {
    const financeService = {
      processPaymentWebhook: vi.fn().mockResolvedValue({ status: 'PAID' }),
    };
    const controller = new PaymentWebhookController(financeService as never);
    const rawBody = Buffer.from('{"type":"order"}');
    const payload = { type: 'order', data: { id: 'ORD-1' } };

    await controller.processWebhook(
      'mercado_pago' as never,
      'legacy-signature',
      'ts=1742505638683,v1=abcdef',
      'request-1',
      'ORD-1',
      'order',
      { rawBody } as never,
      payload,
    );

    expect(financeService.processPaymentWebhook).toHaveBeenCalledWith(
      'MERCADO_PAGO',
      'ts=1742505638683,v1=abcdef',
      rawBody,
      payload,
      { requestId: 'request-1', dataId: 'ORD-1', topic: 'order' },
    );
  });

  it('preserves the legacy signature contract for existing Pix providers', async () => {
    const financeService = {
      processPaymentWebhook: vi.fn().mockResolvedValue({ status: 'PAID' }),
    };
    const controller = new PaymentWebhookController(financeService as never);
    const rawBody = Buffer.from('{"status":"paid"}');
    const payload = { status: 'paid' };

    await controller.processWebhook(
      'fastflow' as never,
      'sha256=legacy',
      'ts=ignored,v1=ignored',
      undefined,
      undefined,
      undefined,
      { rawBody } as never,
      payload,
    );

    expect(financeService.processPaymentWebhook).toHaveBeenCalledWith(
      'FASTFLOW',
      'sha256=legacy',
      rawBody,
      payload,
      {},
    );
  });
});
