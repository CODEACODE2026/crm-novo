import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateReceivablePixDto } from './create-receivables-pix.dto';
import { ReplaceReceivablePixDto } from './replace-receivable-pix.dto';

describe('Mercado Pago payer email DTO contract', () => {
  it('trims and accepts a valid transient email for individual creation', async () => {
    const dto = plainToInstance(CreateReceivablePixDto, {
      provider: 'MERCADO_PAGO',
      payerEmail: '  cliente@example.com  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.payerEmail).toBe('cliente@example.com');
  });

  it.each(['invalido', 'cliente@', '@example.com'])(
    'rejects invalid transient email %j',
    async (payerEmail) => {
      const dto = plainToInstance(CreateReceivablePixDto, {
        provider: 'MERCADO_PAGO',
        payerEmail,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it('validates transient email on individual replacement', async () => {
    const dto = plainToInstance(ReplaceReceivablePixDto, {
      provider: 'MERCADO_PAGO',
      expectedCurrentIntentId: '550e8400-e29b-41d4-a716-446655440000',
      payerEmail: 'cliente@example.com',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
