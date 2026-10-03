import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { getIntegrationDatabaseUrl, integrationDatabaseName } from "./database-url";

// A non-UTC session zone (IST, +05:30) for every connection, so raw SQL that
// binds a `Date` next to a `timestamp WITHOUT time zone` column shifts by the
// offset and fails here instead of only on a dev box (CLAUDE.md §3.4).
const SESSION_TIME_ZONE = "Asia/Kolkata";

export default async function globalSetup() {
  const url = getIntegrationDatabaseUrl();

  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(__dirname, "../../.."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const name = integrationDatabaseName(url).replace(/"/g, '""');
    await prisma.$executeRawUnsafe(`ALTER DATABASE "${name}" SET timezone TO '${SESSION_TIME_ZONE}'`);
  } finally {
    await prisma.$disconnect();
  }
}
