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
