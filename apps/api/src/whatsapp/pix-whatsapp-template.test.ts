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

  it('builds a grouped PIX message with one total without item references', () => {
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
    expect(template.body).toContain(
      'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
    );
    expect(template.body).toContain('Caso a chave esteja expirada, solicite uma nova.');
    expect(template.body).not.toContain('Referências:');
    expect(template.body).not.toContain('robertoserour333');
    expect(template.body).not.toContain('Zm4Bc1');
    expect(template.body).not.toContain('robertoserour');
    expect(template.body).not.toContain('25,00');
    expect(template.button.buttonParamsJson.copy_code).toBe('GROUPED-PIX-COPY-CODE');
    expect(template.button.buttonParamsJson.display_text).toBe('Copiar Chave PIX');
  });

  it('builds a manual charge PIX message with payer, description, due date, and optional expiration', () => {
    const template = buildPixWhatsAppTemplate({
      context: 'MANUAL_CHARGE',
      payerName: 'Joao',
      description: 'Manutencao do equipamento',
      amount: new Prisma.Decimal('80.00'),
      dueDate: '10/10/2026',
      expiresAt: '11/10/2026',
      pixCopyPaste: 'MANUAL-PIX-COPY-CODE',
    });

    expect(template.body).toContain('Ola, Joao.');
    expect(template.body).toContain('Segue sua cobranca:');
    expect(template.body).toContain('Manutencao do equipamento');
    expect(template.body).toContain('Valor: R$ 80,00');
    expect(template.body).toContain('Vencimento: 10/10/2026');
    expect(template.body).toContain('Esta chave PIX possui validade ate 11/10/2026.');
    expect(template.body).not.toContain('MANUAL_CHARGE');
    expect(template.body).not.toContain('RENEWAL');
    expect(template.body).not.toContain('Renovação');
    expect(template.button.buttonParamsJson).toEqual({
      display_text: 'Copiar Chave PIX',
      copy_code: 'MANUAL-PIX-COPY-CODE',
    });
  });

  it('omits manual charge expiration when the payment intent has no expiration', () => {
    const template = buildPixWhatsAppTemplate({
      context: 'MANUAL_CHARGE',
      payerName: 'Joao',
      description: 'Manutencao do equipamento',
      amount: new Prisma.Decimal('80.00'),
      dueDate: '10/10/2026',
      pixCopyPaste: 'MANUAL-PIX-COPY-CODE',
    });

    expect(template.body).not.toContain('validade');
    expect(template.body).not.toContain('expirada');
  });
});
