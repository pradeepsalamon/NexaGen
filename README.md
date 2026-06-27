# NexaGen Chess

NexaGen Chess is an npm workspaces monorepo with a Next.js frontend, a NestJS API, shared TypeScript packages, Prisma/PostgreSQL persistence, and HTTP-only cookie based auth.

## Workspaces

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS backend API
- `packages/types`: Shared request/response/domain types
- `packages/ui`: Shared UI package shell
- `packages/utils`: Shared utilities package shell
- `packages/config`: Shared configuration package shell

## Current Features

- Responsive landing page at `/`
- Auth pages for login, register, forgot password, and reset password
- Sample protected super-admin dashboard at `/dashboard/super-admin`
- Logout button on the protected super-admin dashboard
- Zustand for client UI/session metadata state
- TanStack Query for API/cache state
- Prisma schema for users, profiles, auth sessions, and password reset tokens
- Idempotent Prisma seed data for local auth testing
- JWT auth with HTTP-only access and refresh cookies
- bcrypt password and refresh-token hashing
- Auth action endpoints return `200 OK`; registration returns `201 Created`
- Refresh-token rotation and logout session revocation
- Remember-me refresh lifetime:
  - unchecked: `JWT_REFRESH_SHORT_TTL=1d`
  - checked: `JWT_REFRESH_TTL=7d`
- Password reset magic link sent through SMTP with neutral account-existence messaging and timing
- Login timing protection for unknown-email and wrong-password attempts
- Quiet API startup logs with request logging for method, path, status, duration, and client address

## Development

Install dependencies:

```bash
npm install
```

Run web and API together:

```bash
npm run dev
```

Run one app:

```bash
npm run dev:web
npm run dev:api
```

If Next dev mode serves unstyled HTML after editing files or reports a missing
`.next/server` chunk, stop the web server and restart it with a clean cache:

```bash
npm run dev:web:clean
```

If the API watch process reports a missing module from `apps/api/dist` after an
edit, stop the API server and restart it with a clean build output:

```bash
npm run dev:api:clean
```

Default local URLs:

- Web: http://localhost:3000
- API: http://localhost:3001

## Environment

API env lives in `apps/api/.env`.

Important values:

```env
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL=15m
JWT_REFRESH_SHORT_TTL=1d
JWT_REFRESH_TTL=7d
LOGIN_RESPONSE_DELAY=500ms
PASSWORD_RESET_RESPONSE_DELAY=5s
CORS_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=...
```

For production, replace JWT secrets with long random values and set `FRONTEND_URL` / `CORS_ORIGIN` to the live frontend origin.

## Prisma

Validate schema and generate client:

```bash
npm run prisma:validate -w apps/api
npm run db:generate
```

Create and apply a local migration:

```bash
npm run db:migrate:dev -- --name migration_name
```

Seed local test users:

```bash
npm run db:seed
```

Seeded login accounts all use `Test@12345`:

- `superadmin@nexagen.test`
- `coach@nexagen.test`
- `student@nexagen.test`

Apply committed migrations in production:

```bash
npm run db:migrate:deploy
```

Build for production and apply migrations first:

```bash
npm run build:prod
```

More Prisma notes live in `apps/api/prisma/README.md`.

## Verification

Common checks:

```bash
npm run typecheck
npm run build
```

App-specific checks:

```bash
npm run typecheck -w apps/api
npm run typecheck -w apps/web
npm run build -w apps/api
npm run build -w apps/web
```

## Project Rule

When implementing or updating a feature, update the relevant README in the same change so setup, commands, env variables, and behavior stay current.
