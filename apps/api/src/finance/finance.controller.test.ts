import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FinanceController } from './finance.controller';

describe('FinanceController', () => {
  it('keeps finance endpoints behind the admin auth guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, FinanceController) as unknown;

    expect(guards).toEqual([JwtAuthGuard, AdminGuard]);
  });

  it('resolves PIX copy through the read-only finance service method', async () => {
    const financeService = {
      resolvePaymentIntentPixCopy: vi.fn().mockResolvedValue({
        available: true,
        pixCopyPaste: 'PIX-COPY',
        status: 'WAITING_PAYMENT',
        expiresAt: '2099-10-10T00:30:00.000Z',
        isExpired: false,
      }),
    };
    const controller = new FinanceController(financeService as never, {} as never);

    await expect(controller.resolvePaymentIntentPixCopy('intent-1')).resolves.toMatchObject({
      available: true,
      pixCopyPaste: 'PIX-COPY',
    });
    expect(financeService.resolvePaymentIntentPixCopy).toHaveBeenCalledWith('intent-1');
  });
});
