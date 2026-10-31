# AGENTS.md

Entry point for any AI coding agent (Claude Code, Codex, Cursor, Copilot,
Gemini, …) working in this repository.

**The full agent guide is [CLAUDE.md](CLAUDE.md)** — it is tool-agnostic despite
the name. Read it before changing anything. Everything below is the short list
of rules that break the build or production when ignored; CLAUDE.md §7 has the
complete list and the docs index is [docs/README.md](docs/README.md).

## New Feature Rule

Before implementing any new feature, read [docs/BACKLOG.md](docs/BACKLOG.md) —
especially its "Root causes" section. It documents recurring traps: (1) the
backend endpoint + `packages/types` shape + service auth for the thing you are
about to build may already exist with only the frontend missing — grep
`API_ROUTES` and `apps/web` first; (2) importer-less code tied to an `NEXA-####`
or `agent/task_*` commit may be half-reverted output from a retired autonomous
manager (`.ai/` and `.nexa-agent/`, both removed 2026-09-08) that should be
deleted, not extended. If the feature is a BACKLOG.md entry, move it to
"Resolved" or narrow it in the same change.

## Production Safety Boundary

Any autonomous / VPS-side tooling MUST honour
[.agents/SAFETY.md](.agents/SAFETY.md): all work stays in
`/opt/nexa-chess/NexaGen-dev`, the only database is `vps_dev`, production
containers and LiveKit/Postgres infra are never touched, and nothing pushes,
merges or deploys without explicit human approval.

## Prisma Models Rule

Whenever you add a new model to `apps/api/prisma/schema.prisma`, you MUST also
add a corresponding getter for it in `apps/api/src/prisma/prisma.service.ts`.
`PrismaService` manually defines a getter per model (e.g.
`get classAttendance() { return this.client.classAttendance; }`), so the build
fails if one is missing.

## Prisma Migration Rule

Every `schema.prisma` change needs a committed migration generated with
`npx prisma migrate dev --name <migration_name>` (run from `apps/api`). Never
rely on `db push` — production would be missing the tables. Never hand-write or
rename a migration folder's timestamp (CLAUDE.md §3.4).

## Date & Time Rule

All timestamps are stored and moved as **UTC**, and localized **only in the
browser, per viewer**.

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

## UI Consistency Rule

Data-table row actions (Edit, Delete, Archive, Restore, Download) are
`rounded-full` icon buttons, never square or text buttons. Use the shared
`RowActions` component (`apps/web/src/components/ui/RowActions.tsx`):

```tsx
<RowActions
  actions={[
    { icon: Pencil, label: "Edit", ariaLabel: `Edit ${row.name}`, onSelect: () => onEdit(row) },
    { icon: Trash2, label: "Delete", tone: "danger", onSelect: () => onDelete(row) },
  ]}
/>
```

It renders filled buttons in the action's `tone` (`default` / `warning` /
`danger`) with an `aria-label`, a tooltip and `strokeWidth={2.5}` icons,
identically in both themes. A hand-written action button must match it:
`size="icon"`, `rounded-full`, `aria-label`, Lucide icon with
`strokeWidth={2.5}`. All other UI rules: [docs/UI_RULES.md](docs/UI_RULES.md).

## Working agreements

- npm only (never pnpm/yarn). Windows dev box; use forward slashes in paths.
- Never commit, push or merge unless a human asks. A merge into `dev` or `main`
  needs explicit human approval — passing tests are not permission.
- Update the relevant doc in the same change when behaviour, commands or env
  vars change. A new env var goes in `.env.example`, `apps/api/.env.example`
  and `docker-compose.yml`.
