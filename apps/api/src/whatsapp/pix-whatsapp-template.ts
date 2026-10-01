import { Prisma } from '@prisma/client';

export type PixWhatsAppTemplateInput = {
  amount: Prisma.Decimal | number | string;
  pixCopyPaste: string;
  context?: 'INDIVIDUAL' | 'GROUPED';
  itemCount?: number;
  items?: Array<{
    reference: string;
    amount: Prisma.Decimal | number | string;
  }>;
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
  const body =
    input.context === 'GROUPED'
      ? buildGroupedPixBody(input, amount)
      : buildIndividualPixBody(amount);

  return {
    title: 'PIX',
    body,
    button: {
      name: 'cta_copy',
      buttonParamsJson: {
        display_text: 'Copiar Chave PIX',
        copy_code: input.pixCopyPaste,
      },
    },
  };
}

function buildIndividualPixBody(amount: string) {
  return [
    `💰 Valor: ${amount}`,
    '',
    'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
    '',
    'Caso a chave esteja expirada, solicite uma nova.',
  ].join('\n');
}

function buildGroupedPixBody(input: PixWhatsAppTemplateInput, amount: string) {
  const itemCount = input.itemCount ?? input.items?.length ?? 0;
  const countLabel = itemCount === 1 ? '1 conta' : `${itemCount} contas`;
  const itemLines =
    input.items?.map((item) => {
      const itemAmount = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(Number(item.amount));

      return `- ${item.reference} — ${itemAmount}`;
    }) ?? [];

  return [
    'Segue um único PIX referente às suas cobranças.',
    '',
    `${countLabel}`,
    `💰 Total: ${amount}`,
    ...(itemLines.length ? ['', 'Referências:', ...itemLines] : []),
    '',
    'Clique no botão abaixo para copiar a chave PIX e realizar o pagamento.',
    '',
    'Caso a chave esteja expirada, solicite uma nova.',
  ].join('\n');
}
