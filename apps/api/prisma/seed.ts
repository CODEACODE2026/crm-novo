import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '12');

  if (!email || !name || !password) {
    throw new Error('ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD are required to seed admin user.');
  }

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must have at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, rounds);

  await prisma.user.upsert({
    where: { email },
    update: { name, passwordHash, active: true, role: 'ADMIN' },
    create: { email, name, passwordHash, role: 'ADMIN' },
  });

  console.info(`Admin user ensured for ${email}. Password was not printed.`);
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
