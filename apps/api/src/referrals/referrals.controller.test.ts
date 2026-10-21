import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReferralsController } from './referrals.controller';

describe('ReferralsController management contract', () => {
  it('keeps every referral operation behind JWT and admin authorization', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReferralsController)).toEqual([
      JwtAuthGuard,
      AdminGuard,
    ]);
  });

  it('forwards the authenticated actor to manual creation and pending edit', async () => {
    const service = {
      createManual: vi.fn().mockResolvedValue({ id: 'referral-id' }),
      update: vi.fn().mockResolvedValue({ id: 'referral-id' }),
    };
    const controller = new ReferralsController(service as never);
    const request = { user: { id: 'actor-id', role: 'ADMIN' } } as never;
    const createDto = {
      referredClientId: '11111111-1111-4111-8111-111111111111',
      referredClientReferenceId: '44444444-4444-4444-8444-444444444444',
      referrerClientId: '22222222-2222-4222-8222-222222222222',
      rewardType: 'FREE_MONTH' as const,
    };
    const updateDto = {
      referrerClientId: '33333333-3333-4333-8333-333333333333',
      rewardType: 'FREE_MONTH' as const,
      expectedUpdatedAt: '2026-10-19T00:00:00.000Z',
    };

    await controller.create(createDto, request);
    await controller.update('referral-id', updateDto, request);

    expect(service.createManual).toHaveBeenCalledWith(createDto, 'actor-id');
    expect(service.update).toHaveBeenCalledWith('referral-id', updateDto, 'actor-id');
  });
});
