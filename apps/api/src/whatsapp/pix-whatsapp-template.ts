import { Prisma } from '@prisma/client';

export type PixWhatsAppTemplateInput = {
  amount: Prisma.Decimal | number | string;
  pixCopyPaste: string;
};

export type PixWhatsAppTemplate = {
  title: string;
  body: string;
  button: {
    name: 'cta_copy';
    buttonParamsJson: {
      display_text: 'Copiar Chave PIX';
      copy_code: string;
    };
  };
};

export function buildPixWhatsAppTemplate(input: PixWhatsAppTemplateInput): PixWhatsAppTemplate {
  const amount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(input.amount));

  return {
    title: 'PIX',
    body: [
      `💰 Valor: ${amount}`,
      '',
      'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
      '',
      'Caso a chave esteja expirada, solicite uma nova.',
    ].join('\n'),
    button: {
      name: 'cta_copy',
      buttonParamsJson: {
        display_text: 'Copiar Chave PIX',
        copy_code: input.pixCopyPaste,
      },
    },
  };
}
