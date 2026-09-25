import { Prisma } from '@prisma/client';

export type PixWhatsAppTemplateInput = {
  clientName?: string | null;
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
  const firstName = input.clientName?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `Ola, ${firstName}!` : 'Ola!';
  const amount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(input.amount));

  return {
    title: 'Pagamento via PIX',
    body: [
      greeting,
      '',
      `Valor: ${amount}`,
      '',
      'Clique no botao abaixo para copiar o codigo PIX e realizar o pagamento.',
      '',
      'Caso seu banco informe que o PIX expirou ou nao esteja mais disponivel, solicite uma nova chave.',
      '',
      'Importante: ao realizar o pagamento, confira o valor antes de confirmar. O nome do recebedor podera corresponder ao parceiro responsavel pelo processamento do PIX.',
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
