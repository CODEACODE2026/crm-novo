import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const templates = [
    {
      type: 'INITIAL_ACTIVATION' as const,
      name: 'Ativacao inicial',
      content:
        'Olá, {{primeiroNome}}!\n\nSeu cadastro foi realizado.\n\nPara ativar seu serviço, realize o pagamento de {{valor}} com vencimento em {{vencimento}}.\n\nSegue o PIX:\n\n{{pix}}',
    },
    {
      type: 'BILLING_DUE' as const,
      name: 'Cobranca padrao',
      content:
        'Bom dia, *{{primeiroNome}}*! Seu serviço vence em {{vencimento}} no valor de {{valor}}. Queria saber se tem interesse em renovar?',
    },
    {
      type: 'RECOVERY_DAY_3' as const,
      name: 'Recuperacao 3 dias',
      content:
        'Olá, *{{primeiroNome}}*! Passando para saber se tem interesse em renovar seu serviço de suporte. Se quiser continuar, posso te ajudar com a renovação.',
    },
    {
      type: 'RECOVERY_DAY_10' as const,
      name: 'Recuperacao 10 dias',
      content:
        'Olá, *{{primeiroNome}}*! Seu serviço continua inativo no momento. Caso queira reativar, me chama que posso te ajudar com a renovação.',
    },
    {
      type: 'RECOVERY_DAY_15' as const,
      name: 'Recuperacao 15 dias',
      content:
        'Oi, *{{primeiroNome}}*! Só passando novamente para saber se deseja voltar a utilizar o serviço. Se tiver interesse, posso organizar a renovação para você.',
    },
    {
      type: 'RECOVERY_DAY_30' as const,
      name: 'Recuperacao 30 dias',
      content:
        'Olá, *{{primeiroNome}}*! Este é nosso último lembrete automático sobre a reativação do serviço. Se quiser voltar futuramente, é só entrar em contato.',
    },
  ];

  for (const template of templates) {
    await prisma.messageTemplate.upsert({
      where: {
        type_name: {
          type: template.type,
          name: template.name,
        },
      },
      update: {
        content: template.content,
        active: true,
      },
      create: {
        ...template,
        active: true,
      },
    });
  }

  console.info('Billing and recovery message templates ensured.');
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
