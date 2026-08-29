# New Feature Rule

**CRITICAL RULE:** Before implementing any new feature, read
[docs/BACKLOG.md](../docs/BACKLOG.md) — especially its "Root causes" section.
It documents recurring traps: (1) the backend endpoint + `packages/types` shape +
service auth for the thing you are about to build may already exist with only the
frontend missing — grep `API_ROUTES` and `apps/web` first; (2) importer-less code
tied to an `NEXA-####` commit may be half-reverted `.ai/`-manager output that
should be deleted, not extended. If the feature is a BACKLOG.md entry, move it to
"Resolved" or narrow it in the same change.

# Prisma Models Rule

**CRITICAL RULE:** Whenever you add a new model to `apps/api/prisma/schema.prisma`, you MUST also add a corresponding getter for it in `apps/api/src/prisma/prisma.service.ts`. 

The `PrismaService` manually defines getters for each model (e.g., `get classAttendance() { return this.client.classAttendance; }`), so the TypeScript compiler will throw errors if you forget to add the new getters after generating the client.

# Prisma Migration Rule

**CRITICAL RULE:** Whenever you modify the Prisma schema (`schema.prisma`), you MUST explicitly run `npx prisma migrate dev --name <migration_name>` to generate the corresponding SQL migration file. Never rely solely on `db push` for schema changes, as this will result in missing tables during production deployment.
# UI Consistency Rule

**CRITICAL RULE:** For UI consistency across the Nexa application, all action buttons inside Data Tables (such as Edit, Delete, Archive, Restore, Download) MUST be styled as rounded-full icons.
Do NOT use square or mildly-rounded text buttons for table actions.

Use the following exact styling template for action buttons in tables:
`	sx
<Button
  variant="outline"
  size="icon"
  className="size-8 rounded-full border-[color] p-0 text-app-text transition-colors hover:bg-[color] hover:text-white"
  onClick={handler}
>
  <IconName className="size-4" strokeWidth={2.5} />
</Button>
`
*Note: Ensure you include strokeWidth={2.5} on the Lucide icon.*
