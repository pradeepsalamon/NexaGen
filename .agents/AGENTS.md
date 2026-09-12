# New Feature Rule

**CRITICAL RULE:** Before implementing any new feature, read
[docs/BACKLOG.md](../docs/BACKLOG.md) — especially its "Root causes" section.
It documents recurring traps: (1) the backend endpoint + `packages/types` shape +
service auth for the thing you are about to build may already exist with only the
frontend missing — grep `API_ROUTES` and `apps/web` first; (2) importer-less code
tied to an `NEXA-####` or `agent/task_*` commit may be half-reverted output from
a retired autonomous manager (`.ai/` and `.nexa-agent/`, both removed 2026-09-08)
that should be deleted, not extended. If the feature is a BACKLOG.md entry, move
it to "Resolved" or narrow it in the same change.

# Production Safety Boundary

**CRITICAL RULE:** Any autonomous / VPS-side tooling MUST honour
[SAFETY.md](SAFETY.md): all work stays in `/opt/nexa-chess/NexaGen-dev`, the only
database is `vps_dev`, production containers and LiveKit/Postgres infra are never
touched, and nothing pushes, merges or deploys without explicit human approval.

# Prisma Models Rule

**CRITICAL RULE:** Whenever you add a new model to `apps/api/prisma/schema.prisma`, you MUST also add a corresponding getter for it in `apps/api/src/prisma/prisma.service.ts`. 

The `PrismaService` manually defines getters for each model (e.g., `get classAttendance() { return this.client.classAttendance; }`), so the TypeScript compiler will throw errors if you forget to add the new getters after generating the client.

# Prisma Migration Rule

**CRITICAL RULE:** Whenever you modify the Prisma schema (`schema.prisma`), you MUST explicitly run `npx prisma migrate dev --name <migration_name>` to generate the corresponding SQL migration file. Never rely solely on `db push` for schema changes, as this will result in missing tables during production deployment.

# Date & Time Rule

**CRITICAL RULE:** All timestamps are stored and moved as **UTC**, and localized
**only in the browser, per viewer**.

- **DB**: `DateTime` columns (Prisma default = `timestamp WITHOUT time zone`,
  holding UTC wall-clock). Only ever read/write them through the Prisma ORM. Raw
  SQL that puts a JS `Date` / `timestamptz` next to one of these columns shifts it
  by the DB server's offset on any non-UTC box — bind `${d.toISOString()}::timestamp`
  instead (see `attendance.service.ts#closeOpenAttendanceLogs`).
- **API**: services return ISO-8601 strings via `.toISOString()`. **Never**
  pre-format a date to words/local time on the server — Node uses the *server's*
  zone (AUDIT H11).
- **Web**: never `new Date(iso).toLocaleDateString/toLocaleTimeString/toLocaleString`
  in a component (an ESLint rule blocks it). Format with `lib/datetime.ts`
  (`formatTime`, `formatFullDate`, `formatLongDate`, `formatDateTime`,
  `formatRelativeDay`, `formatDuration`, or `formatDate(iso, tz, opts)`), passing
  the zone from `useUserTimeZone()`. Analytics uses `features/analytics/lib/format.ts`
  with an optional `timeZone` arg — pass `useUserTimeZone()`. Duration helpers take
  seconds and carry no zone. Date-only `"YYYY-MM-DD"` values format with `"UTC"`.

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
