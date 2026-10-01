import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildPixWhatsAppTemplate } from './pix-whatsapp-template';

describe('buildPixWhatsAppTemplate', () => {
  it('builds a short provider-neutral PIX copy-button message', () => {
    const template = buildPixWhatsAppTemplate({
      amount: new Prisma.Decimal('1250.50'),
      pixCopyPaste: 'PIX-COPY-CODE',
    });

    expect(template.title).toBe('PIX');
    expect(template.body).toBe(
      [
        '💰 Valor: R$ 1.250,50',
        '',
        'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
        '',
        'Caso a chave esteja expirada, solicite uma nova.',
      ].join('\n'),
    );
    expect(template.body).not.toContain('Cliente Teste');
    expect(template.body).not.toContain('Pagamento via PIX');
    expect(template.body).not.toContain('Gatebridge');
    expect(template.body).not.toContain('FastFlow');
    expect(template.body).not.toContain('FastPay');
    expect(template.body).not.toContain('24 horas');
    expect(template.body).not.toContain('2 horas');
    expect(template.body).not.toContain('parceiro responsável');
    expect(template.body).not.toContain('nome do recebedor');
    expect(template.button).toEqual({
      name: 'cta_copy',
      buttonParamsJson: {
        display_text: 'Copiar Chave PIX',
        copy_code: 'PIX-COPY-CODE',
      },
    });
  });

  it('builds a grouped PIX message with one total and item references', () => {
    const template = buildPixWhatsAppTemplate({
      context: 'GROUPED',
      amount: new Prisma.Decimal('75.00'),
      pixCopyPaste: 'GROUPED-PIX-COPY-CODE',
      itemCount: 3,
      items: [
        { reference: 'robertoserour333', amount: new Prisma.Decimal('25.00') },
        { reference: 'Zm4Bc1', amount: new Prisma.Decimal('25.00') },
        { reference: 'robertoserour', amount: new Prisma.Decimal('25.00') },
      ],
    });

    expect(template.body).toContain('Segue um único PIX referente às suas cobranças.');
    expect(template.body).toContain('3 contas');
    expect(template.body).toContain('💰 Total: R$ 75,00');
    expect(template.body).toContain('Referências:');
    expect(template.body).toContain('- robertoserour333 — R$ 25,00');
    expect(template.body).toContain('- Zm4Bc1 — R$ 25,00');
    expect(template.body).toContain('- robertoserour — R$ 25,00');
    expect(template.button.buttonParamsJson.copy_code).toBe('GROUPED-PIX-COPY-CODE');
  });
});
