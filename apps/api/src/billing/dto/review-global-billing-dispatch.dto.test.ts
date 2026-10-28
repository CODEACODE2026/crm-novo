import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ReviewGlobalBillingDispatchDto } from './review-global-billing-dispatch.dto';

async function errorsFor(scheduledFor: string, reason = 'Revisão administrativa explícita.') {
  const dto = plainToInstance(ReviewGlobalBillingDispatchDto, { scheduledFor, reason });
  return validate(dto);
}

describe('ReviewGlobalBillingDispatchDto', () => {
  it('accepts an ISO-8601 instant with explicit timezone and a review reason', async () => {
    await expect(errorsFor('2026-11-20T12:00:00.000-03:00')).resolves.toHaveLength(0);
  });

  it.each(['2026-11-20T12:00:00', 'not-a-date'])(
    'rejects a schedule without a valid explicit timezone: %s',
    async (scheduledFor) => {
      expect(await errorsFor(scheduledFor)).not.toHaveLength(0);
    },
  );

  it('rejects a review without a meaningful reason', async () => {
    expect(await errorsFor('2026-11-20T12:00:00.000Z', 'curto')).not.toHaveLength(0);
  });

  it.each(['          ', '\t\t\t\t\t\t\t\t\t\t', '\n\n\n\n\n\n\n\n\n\n', '   curto   '])(
    'rejects a blank or short normalized reason: %j',
    async (reason) => {
      expect(await errorsFor('2026-11-20T12:00:00.000Z', reason)).not.toHaveLength(0);
    },
  );

  it('normalizes the accepted reason before persistence', async () => {
    const dto = plainToInstance(ReviewGlobalBillingDispatchDto, {
      scheduledFor: '2026-11-20T12:00:00.000Z',
      reason: '   Revisão administrativa explícita.   ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.reason).toBe('Revisão administrativa explícita.');
  });
});
