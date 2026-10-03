import { getIntegrationDatabaseUrl } from "./database-url";

// PrismaService builds its client from DATABASE_URL.
process.env.DATABASE_URL = getIntegrationDatabaseUrl();
