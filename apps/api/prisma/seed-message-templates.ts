import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.messageTemplate.upsert({
    where: {
      type_name: {
        type: 'BILLING_DUE',
        name: 'Cobranca padrao',
      },
    },
    update: {
      content:
        'Bom dia, *{{primeiroNome}}*! Seu serviço vence em {{vencimento}} no valor de {{valor}}. Queria saber se tem interesse em renovar?',
      active: true,
    },
    create: {
      name: 'Cobranca padrao',
      type: 'BILLING_DUE',
      content:
        'Bom dia, *{{primeiroNome}}*! Seu serviço vence em {{vencimento}} no valor de {{valor}}. Queria saber se tem interesse em renovar?',
      active: true,
    },
  });

  console.info('Billing message template ensured.');
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
