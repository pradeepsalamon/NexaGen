# Prisma workflow

Set `DATABASE_URL` in `apps/api/.env` before running migrations.

## Development

Create and apply a new migration locally:

```bash
npm run db:migrate:dev
```

Create a migration file without applying it:

```bash
npm run db:migrate:create
```

Regenerate Prisma Client after schema changes:

```bash
npm run db:generate
```

Seed local test users:

```bash
npm run db:seed
```

The seed script is idempotent, refuses to run when `NODE_ENV=production`, and
creates these active accounts with password `Test@12345`:

- `superadmin@nexa.test`
- `coach@nexa.test`
- `student@nexa.test`

## Production

Apply committed migrations in production:

```bash
npm run db:migrate:deploy
```

Build for production and apply committed migrations first:

```bash
npm run build:prod
```

Check migration state:

```bash
npm run db:migrate:status
```

The same scripts can be run directly in the API workspace:

```bash
npm run migrate:dev -w apps/api
npm run migrate:deploy -w apps/api
```

prod prisma studio
ssh -L 5433:127.0.0.1:5432 ubuntu@146.56.55.170

## Analytics recording-size backfill (one-off, manual)

Migration `20260831050015_analytics_foundations` added `LiveSession.recordingBytes`
/ `recordingDurationSeconds` / `recordingStatus`. New recordings populate these
from the egress webhook automatically; older rows stay null (→ "unknown" in the
analytics UI). To backfill from files still on disk / in object storage, run
`apps/api/prisma/scripts/backfill-recording-sizes.ts` on the VPS:

```bash
docker compose exec api node dist/prisma/scripts/backfill-recording-sizes.js
```

It only touches rows where `recordingUrl` is set and `recordingBytes` is null;
missing files are left null. Safe to re-run.