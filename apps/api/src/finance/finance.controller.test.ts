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

  it('marks only authenticated controller PIX mutations as manually authorized', async () => {
    const financeService = {
      createReceivablePix: vi.fn().mockResolvedValue(undefined),
      replaceReceivablePix: vi.fn().mockResolvedValue(undefined),
      createReceivablesPix: vi.fn().mockResolvedValue(undefined),
      replaceReceivablesPix: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new FinanceController(financeService as never, {} as never);
    const request = { user: { id: 'user-1' } } as never;

    await controller.createReceivablePix('receivable-1', {}, request);
    await controller.replaceReceivablePix(
      'receivable-1',
      {
        provider: 'FASTFLOW',
        expectedCurrentIntentId: 'intent-1',
        idempotencyKey: 'replace-1',
      },
      request,
    );
    await controller.createReceivablesPix({ receivableIds: ['receivable-1'] }, request);
    await controller.replaceReceivablesPix(
      {
        receivableIds: ['receivable-1'],
        provider: 'FASTFLOW',
        expectedCurrentIntentId: 'intent-1',
        idempotencyKey: 'group-replace-1',
      },
      request,
    );

    expect(financeService.createReceivablePix).toHaveBeenCalledWith(
      'receivable-1',
      'user-1',
      {},
      { allowInternationalManual: true },
    );
    expect(financeService.replaceReceivablePix).toHaveBeenCalledWith(
      'receivable-1',
      expect.any(Object),
      'user-1',
      { allowInternationalManual: true },
    );
    expect(financeService.createReceivablesPix).toHaveBeenCalledWith(
      { receivableIds: ['receivable-1'] },
      'user-1',
      { allowInternationalManual: true },
    );
    expect(financeService.replaceReceivablesPix).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      { allowInternationalManual: true },
    );
  });
});
