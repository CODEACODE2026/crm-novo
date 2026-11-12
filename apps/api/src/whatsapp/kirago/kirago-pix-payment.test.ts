import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildKiragoPixPayment } from './kirago-pix-payment';

describe('buildKiragoPixPayment', () => {
  it('preserves the original provider BR Code and converts amount to cents', () => {
    const original = '00020101021226890014br.gov.bcb.pix2567provider.example/charge/abc6304ABCD';

    expect(
      buildKiragoPixPayment({
        phone: '5544999999999',
        body: 'Mensagem original da cobranca',
        merchantName: 'ATIVO CHEK OUT',
        pixCopyPaste: original,
        amount: new Prisma.Decimal('100.00'),
        referenceId: 'payment-intent-id',
        itemName: 'Pagamento CRM NOVO',
      }),
    ).toEqual({
      phone: '5544999999999',
      title: 'PIX',
      body: 'Mensagem original da cobranca',
      pixPayment: {
        merchantName: 'ATIVO CHEK OUT',
        key: original,
        keyType: 'EVP',
        displayText: 'Copiar Chave PIX',
        amount: 10000,
        offset: 100,
        currency: 'BRL',
        referenceId: 'payment-intent-id',
        itemName: 'Pagamento CRM NOVO',
      },
    });
  });

  it.each([
    { merchantName: 'A', amount: '10.00', pixCopyPaste: 'PIX' },
    { merchantName: 'Recebedor', amount: '10.001', pixCopyPaste: 'PIX' },
    { merchantName: 'Recebedor', amount: '10.00', pixCopyPaste: '   ' },
  ])('fails closed for invalid financial input %#', (override) => {
    expect(() =>
      buildKiragoPixPayment({
        phone: '5544999999999',
        body: 'PIX',
        merchantName: override.merchantName,
        pixCopyPaste: override.pixCopyPaste,
        amount: override.amount,
        referenceId: 'payment-intent-id',
        itemName: 'Pagamento CRM NOVO',
      }),
    ).toThrow();
  });
});
