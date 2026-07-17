import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`UPDATE "classes" SET status = 'SCHEDULED' WHERE status = 'IN_PROGRESS'`);
  await prisma.$executeRawUnsafe(`DELETE FROM "live_classes"`);
  console.log("Database fixed");
}

main().catch(console.error).finally(() => prisma.$disconnect());
