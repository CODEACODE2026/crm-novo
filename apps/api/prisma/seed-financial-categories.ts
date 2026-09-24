import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = [
  { name: 'Ativação', type: 'ENTRADA' },
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
    const existing = await prisma.financialCategory.findFirst({
      where: {
        name: { equals: category.name, mode: 'insensitive' },
        type: category.type,
      },
    });

    if (existing) continue;

    await prisma.financialCategory.create({ data: category });
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
