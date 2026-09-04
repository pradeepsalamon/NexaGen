# NexaChess AI Agent Safety Boundary

## DEVELOPMENT ROOT

All AI development work MUST happen inside:

/opt/nexa-chess/NexaGen-dev

## PRODUCTION ROOT

The following directory is PRODUCTION and MUST NOT be modified:

/opt/nexa-chess/NexaGen

AI agents MUST NOT:
- edit files under the production root
- checkout branches in the production root
- run git operations intended to modify production
- start production deployments
- stop production services
- restart production services
- rebuild production containers
- execute `docker compose up` for production
- execute `docker compose down`
- execute `docker compose restart`
- execute `docker restart` on production containers
- execute `docker stop` on production containers
- execute `docker rm` on production containers

## PRODUCTION CONTAINERS

These are production infrastructure and MUST NOT be touched:

- nexa_web
- nexa_api
- nexa_postgres
- nexa_redis
- nexa_livekit
- nexa_egress

## LIVEKIT

LiveKit is shared infrastructure.

The agents MUST NOT:
- stop LiveKit
- restart LiveKit
- rebuild LiveKit
- modify LiveKit configuration
- delete LiveKit
- change LiveKit ports
- change LiveKit networking

Existing LiveKit may be used for development testing where appropriate, but its infrastructure configuration is immutable from the AI development system.

## DEVELOPMENT SERVICES

Development services run separately from production.

Current development workspace:

/opt/nexa-chess/NexaGen-dev

Development ports:

Web: 3000
API: 3001

Agents may start, stop, restart, and test development processes when required.

## DATABASE

Agents must never intentionally connect development tooling to the production database.

Database migrations, resets, seeds, and destructive operations must be restricted to the development/staging database.

## GIT

Development work belongs on development branches.

Production branch protection and deployment remain outside the autonomous agent loop.

## HUMAN APPROVAL

No production deployment is considered successful merely because tests pass.

Production deployment requires explicit human approval.

## PRINCIPLE

When uncertain whether an operation affects production:

STOP and request human approval.

## VERIFIED DATABASE BOUNDARY

The development application currently uses:

Host: 127.0.0.1
Port: 5432
Database: vps_dev
User: postgres

The database `vps_dev` is the ONLY database that the autonomous
development/testing workflow is permitted to use.

Agents MUST NOT:
- connect to any other database
- change DATABASE_URL to another database
- run migrations against another database
- reset another database
- seed another database
- delete data from another database
- assume that localhost means development without verifying the database name

The PostgreSQL server/container itself is shared infrastructure.
Do not stop, restart, rebuild, reconfigure, or delete the PostgreSQL
container.

Before any potentially destructive database operation, verify that the
target database is exactly:

vps_dev

If the target cannot be verified as `vps_dev`:

STOP and request human approval.


---

## Amendment 2026-09-04: the supervisor may push and merge

Granted explicitly by the maintainer. This narrows, rather than removes, the
previous blanket "never push".

- **Worker agents still never push and never merge.** They commit to `dev_vps`
  and stop. Nothing in the autonomous loop reaches a remote on its own.
- **The supervisor may `merge` and `push`,** and only when the human asks for it
  in conversation. A passing task is not a request.
- **Pushing `main` is a production deployment.**
  `.github/workflows/deploy-production.yml` fires on push to `main`: it SSHes to
  this VPS, rebuilds the production containers, and runs `prisma migrate deploy`
  against the production database. The CLI refuses without an explicit
  `--deploy-production` acknowledgement so that no one arrives at a deployment
  by way of a generic "push".

Everything else stands: the workspace is still `/opt/nexa-chess/NexaGen-dev`
only, the database is still `vps_dev` only, and the production containers are
still untouchable.

## Amendment 2026-09-04: e2e runs against the dev server, never production

`playwright.config.ts` defaults to `http://localhost:3000` and
`e2e/fixtures.ts` to `:3001`. On this host those are **nexa_web and nexa_api --
production**. The e2e specs sign in with the seeded accounts and create batches,
join classes and post messages, so a default-configured run is a production data
incident rather than a test.

All e2e goes through `.nexa-agent/scripts/e2e-dev.sh`, which targets the dev
stack (web `:3010`, api `:3011`, database `vps_dev`), sets `E2E_BASE_URL` and
`NEXT_PUBLIC_API_URL` explicitly, and aborts via `guard_e2e_target` if either
resolves to a production port.
