# Prisma Models Rule

**CRITICAL RULE:** Whenever you add a new model to `apps/api/prisma/schema.prisma`, you MUST also add a corresponding getter for it in `apps/api/src/prisma/prisma.service.ts`. 

The `PrismaService` manually defines getters for each model (e.g., `get classAttendance() { return this.client.classAttendance; }`), so the TypeScript compiler will throw errors if you forget to add the new getters after generating the client.

# Prisma Migration Rule

**CRITICAL RULE:** Whenever you modify the Prisma schema (`schema.prisma`), you MUST explicitly run `npx prisma migrate dev --name <migration_name>` to generate the corresponding SQL migration file. Never rely solely on `db push` for schema changes, as this will result in missing tables during production deployment.
