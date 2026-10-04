import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/** Empties every table (migrations history excepted). */
export async function resetDatabase(prisma: PrismaService) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (!tables.length) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$queryRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

let seq = 0;

export function createUser(prisma: PrismaService, role: UserRole, overrides: { email?: string } = {}) {
  seq += 1;
  return prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}-${seq}@int.test`,
      firstName: `${role} ${seq}`,
      password: "not-a-real-hash",
      role,
    },
  });
}
