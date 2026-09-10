import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { name: 'Renovação', type: 'ENTRADA' },
  { name: 'Serviço avulso', type: 'ENTRADA' },
  { name: 'Outros', type: 'ENTRADA' },
  { name: 'Servidor', type: 'SAIDA' },
  { name: 'Contabilidade', type: 'SAIDA' },
  { name: 'Domínio', type: 'SAIDA' },
  { name: 'Equipamentos', type: 'SAIDA' },
  { name: 'Manutenção', type: 'SAIDA' },
  { name: 'Impostos', type: 'SAIDA' },
  { name: 'Outros', type: 'SAIDA' },
] as const;

async function main() {
  for (const category of categories) {
    await prisma.financialCategory.upsert({
      where: {
        name_type: {
          name: category.name,
          type: category.type,
        },
      },
      update: { active: true },
      create: category,
    });
  }

  console.info(
    `Financial category seeds ensured: ${categories
      .map((category) => `${category.name}/${category.type}`)
      .join(', ')}.`,
  );
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
