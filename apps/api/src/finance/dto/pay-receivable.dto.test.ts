import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PayReceivableDto } from './pay-receivable.dto';
import { PayReceivablesDto } from './pay-receivables.dto';

describe('payment DTO validation', () => {
  it('keeps single payment notes bounded', async () => {
    const dto = Object.assign(new PayReceivableDto(), {
      paymentDate: '2026-09-17',
      notes: 'x'.repeat(2001),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'notes',
        }),
      ]),
    );
  });

  it('keeps grouped payment notes bounded', async () => {
    const dto = Object.assign(new PayReceivablesDto(), {
      receivableIds: ['77777777-7777-4777-8777-777777777777'],
      paymentDate: '2026-09-17',
      notes: 'x'.repeat(2001),
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'notes',
        }),
      ]),
    );
  });
});
