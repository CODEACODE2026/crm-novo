import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const plans = [
  { name: 'Mensal', durationMonths: 1, defaultValue: '0.00' },
  { name: 'Bimestral', durationMonths: 2, defaultValue: '0.00' },
  { name: 'Trimestral', durationMonths: 3, defaultValue: '0.00' },
  { name: 'Semestral', durationMonths: 6, defaultValue: '0.00' },
  { name: 'Anual', durationMonths: 12, defaultValue: '0.00' },
] as const;

async function main() {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        durationMonths: plan.durationMonths,
        defaultValue: plan.defaultValue,
        active: true,
      },
      create: plan,
    });
  }

  console.info(`Plan seeds ensured: ${plans.map((plan) => plan.name).join(', ')}.`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
