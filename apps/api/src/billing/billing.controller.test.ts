import { describe, expect, it, vi } from 'vitest';
import { BillingController } from './billing.controller';

describe('BillingController global review contract', () => {
  it('forwards the authenticated admin identity and explicit future schedule', async () => {
    const reviewGlobalDispatch = vi.fn().mockResolvedValue({ id: 'dispatch-id' });
    const controller = new BillingController({ reviewGlobalDispatch } as never);
    const dto = {
      scheduledFor: '2026-11-20T12:00:00.000Z',
      reason: 'Retomada aprovada após revisão financeira completa.',
    };

    await expect(
      controller.reviewGlobalDispatch('dispatch-id', dto, {
        user: { id: 'admin-id', name: 'Admin', email: 'admin@example.com', role: 'ADMIN' },
      } as never),
    ).resolves.toEqual({ id: 'dispatch-id' });
    expect(reviewGlobalDispatch).toHaveBeenCalledWith('dispatch-id', dto, 'admin-id');
  });
});
