import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WhatsAppPreparedSuccessorGuardService } from './whatsapp-prepared-successor-guard.service';

describe('WhatsAppPreparedSuccessorGuardService', () => {
  it('allows outbound when the destination has no prepared successor', async () => {
    type FindFirstArgs = {
      where: { status: string; targetConnectionId: string };
    };
    const findFirst = vi.fn((args: FindFirstArgs) => {
      void args;
      return Promise.resolve(null);
    });
    const service = new WhatsAppPreparedSuccessorGuardService({
      whatsAppConversationSuccessorPreparation: { findFirst },
    } as never);

    await expect(
      service.assertAutomatedOutboundAllowed('connection-id', '5544999999999'),
    ).resolves.toBeUndefined();
    const call = findFirst.mock.calls[0]?.[0];
    expect(call?.where).toMatchObject({
      status: 'PREPARED',
      targetConnectionId: 'connection-id',
    });
  });

  it('blocks automated outbound before the provider when the successor is prepared', async () => {
    const service = new WhatsAppPreparedSuccessorGuardService({
      whatsAppConversationSuccessorPreparation: {
        findFirst: vi.fn().mockResolvedValue({ id: 'preparation-id' }),
      },
    } as never);

    const error: unknown = await service
      .assertAutomatedOutboundAllowed('connection-id', '5544999999999')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    if (!(error instanceof ConflictException)) throw error;
    expect(error.getResponse()).toMatchObject({
      code: 'WHATSAPP_PREPARED_SUCCESSOR_AUTOMATION_BLOCKED',
    });
  });

  it('matches canonical and legacy Brazilian mobile variants', () => {
    const service = new WhatsAppPreparedSuccessorGuardService({} as never);
    expect(service.phoneCandidates('5544999999999')).toEqual(
      expect.arrayContaining(['5544999999999', '554499999999']),
    );
  });
});
