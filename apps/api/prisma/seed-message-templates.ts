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
      name: 'Recuperação 3 dias',
      content:
        'Olá, {{primeiroNome}}! Tudo bem? Identificamos que o pagamento referente à sua referência {{referencia}}, no valor de {{valor}}, venceu em {{vencimento}} e ainda consta como pendente. Se já realizou o pagamento, pode desconsiderar esta mensagem. Se precisar, estamos à disposição.',
    },
    {
      type: 'RECOVERY_DAY_7' as const,
      name: 'Recuperação 7 dias',
      content:
        'Olá, {{primeiroNome}}. O pagamento da referência {{referencia}}, vencido em {{vencimento}}, ainda consta em aberto no valor de {{valor}}. Para evitar que a pendência continue, pedimos que regularize assim que possível. Se precisar de ajuda, fale conosco.',
    },
    {
      type: 'RECOVERY_DAY_15' as const,
      name: 'Recuperação 15 dias',
      content:
        'Olá, {{primeiroNome}}. Sua referência {{referencia}} está com pagamento pendente há alguns dias. O valor em aberto é {{valor}}, com vencimento em {{vencimento}}. Pedimos que entre em contato conosco para regularizar a situação.',
    },
    {
      type: 'RECOVERY_DAY_30' as const,
      name: 'Recuperação 30 dias',
      content:
        'Olá, {{primeiroNome}}. O pagamento da referência {{referencia}}, vencido em {{vencimento}}, continua pendente no valor de {{valor}}. Esta é uma notificação de cobrança referente à pendência em aberto. Entre em contato conosco para regularização.',
    },
  ];

  for (const template of templates) {
    const existing = await prisma.messageTemplate.findFirst({
      where: { type: template.type },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      await prisma.messageTemplate.update({
        where: { id: existing.id },
        data: {
          name: template.name,
          content: template.content,
          active: true,
        },
      });
      continue;
    }

    await prisma.messageTemplate.create({
      data: {
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
