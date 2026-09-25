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
});
