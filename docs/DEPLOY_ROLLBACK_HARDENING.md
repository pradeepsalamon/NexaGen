# Safe deployment and rollback

**Status (2026-11-24): the minimum workflow (§3) is built on `dev`; it reaches production with the
next release.** Later work (§6) waits until a specific risk calls for it. How the pipeline works
day to day is in [DEPLOYMENT.md](DEPLOYMENT.md) § "CI, automated deploys and rollback"; the
recovery runbooks are in [DATABASE_RESTORE.md](DATABASE_RESTORE.md) §7–§8. The SaaS-only stages
(enforce, D5 contract, first academy) add their steps on top: [SAAS_CUTOVER_RUNBOOK.md](SAAS_CUTOVER_RUNBOOK.md).

Aim: something the team can read in one sitting and operate without help. Prefer a check that
stops a deploy to automation that repairs one.

---

## 1. The rules

1. **Production changes only through `deploy-production.sh`.** No `docker compose up --build`,
   no migration typed by hand outside a runbook. One path: one lock, one migration step, one
   health gate, one rollback.
2. **Every release is classified before it is merged** (§2): can its images be rolled back, or
   only rolled forward or restored? The release PR says which.
3. **No migration runs without a checked backup taken minutes before it.**
4. **Old code must keep working on the new schema** (expand/contract). A change old code can't
   live with ships in two releases, and CI enforces the marker.
5. **A rollback never makes things worse.** It refuses when the schema is ahead of the code it
   would restore by a class C migration, and says what to do instead.
6. **Someone hears about a failure.** For now: the red deploy run and the post-deploy check (§3).
   Alerting comes later (§6).
7. **Every path is tried before production needs it**: on staging, or as a read-only check
   against production.

## 2. Rollback classes

`scripts/migration-class.sh` classifies migrations; CI puts the classes in the job summary of
every PR that adds one, and fails an unmarked class C.

| Class | What the migration does | Image rollback afterwards |
|---|---|---|
| **A: additive** | New table, nullable column, column with a default, new index | **Safe**: old code ignores it |
| **B: enum value** | `ALTER TYPE … ADD VALUE` | **Safe until a row uses the new value.** Then an old Prisma client errors reading that row; roll forward instead |
| **C: contract** | `DROP TABLE/COLUMN/TYPE`, `RENAME`, `SET NOT NULL`, a type change, a trigger, `TRUNCATE`, a new `NOT NULL` column without a default | **Never.** Roll forward with a fix, or restore the pre-deploy backup |

A class C migration needs the comment `-- nexa:contract <reason>` and ships one release after the
code stopped using the old shape (the D5 folder `apps/api/prisma/contract/` is the precedent).
`UPDATE`/`DELETE`/`DROP INDEX`/`DROP CONSTRAINT` are flagged "review": class A if old code reads
the result fine, which the release note says. A release takes the class of its worst migration.

**The next release (dev → main, 21 migrations, checked 2026-11-24): class B.** Four migrations add
enum values (`DAILY_PUZZLE` and `CLASS_RESCHEDULED` to two enums each, `DEMO_CONFIRMED`,
`NO_SHOW`, `DAILY`); three
`UPDATE`s are readable by old code (plan features, referral terms, lowercased emails). An image
rollback is fine in the first hour; once daily-puzzle notifications have gone out, roll forward.
It also carries the B1 backup-download fix (0e2baf0b), needed before a second academy exists.

## 3. The minimum workflow (built)

**Release PR** (branch off `dev`, `main` merged in before CI, `gh pr create --base main`). Its
description carries:
- the migrations and their classes (copy CI's job summary) and the release's class;
- new feature switches (risky features ship **off**) and env vars to add to the prod `.env` first;
- what to check after the deploy.

Merge outside class hours. Merging is the deploy.

**The deploy** (`scripts/deploy-production.sh`; each step stops the deploy on failure):

| # | Step | Protects | On failure |
|---|---|---|---|
| 1 | Lock (`flock`, max 15 min wait, below the 45 min SSH timeout); skip a commit older than the live one | Exclusivity | Abort, nothing changed |
| 2 | Migration state from `_prisma_migrations`: refuse a failed migration or one the commit doesn't know; list the pending ones with their class | Migration safety | Abort, nothing changed |
| 3 | `TENANT_SCOPE_MODE` must not drop from `enforce` | Tenant isolation | Abort, nothing changed |
| 4 | Build the images | — | Abort, nothing changed |
| 5 | If migrations are pending: `backup_db.sh --predeploy` (dump, gzip test, pg_dump's completion marker, OCI upload with the size compared, copy in `.deploy/backups/`; only the newest is kept, locally and in OCI) | Backup integrity | Abort, nothing changed |
| 6 | `prisma migrate deploy` from the new image, while the old API serves. The only place production migrates (`MIGRATE_ON_START=false`) | Migration safety | Abort; old API keeps serving. Runbook §7 |
| 7 | Swap containers, then the health gate: `/health/ready` now reads `users` through Prisma, so code on a schema it doesn't match fails | Health check | Restore `:last-good`* |
| 8 | Smoke test through nginx: home and sign-in pages 200, API ready 200, the academy resolves for the site's origin, a signed-out `/auth/me` is 401 | Smoke test, tenant isolation | Restore `:last-good`* |
| 9 | Mark good; `history.log` records the commit and the backup key | — | — |

\* Before restoring, the script classifies the migrations the old code doesn't know. Past a class
C one it does **not** restore and prints "NOT ROLLED BACK" with the backup key: roll forward, or
follow DATABASE_RESTORE.md §8. Manual rollback (Actions → `action: rollback`) runs the same check
and refuses (`ROLLBACK_PAST_CONTRACT=1` on the box overrides, a human decision).

**After the deploy:** the person who merged signs in as each role and opens a class, a puzzle set
and the payments page, then leaves the release alone for 24 h unless a hotfix is needed.

Also built: `nexa.sh start|restart prod` no longer rebuilds (start = existing images, restart =
recreate `api` + `web` only, never Postgres or LiveKit).

Checked 2026-11-24 against production, read-only: the migration-state queries (156 applied, 21
pending, none failed or unknown), every smoke check (all pass), the rollback check (allows
`main`, refuses a pre-November commit), and a real pre-deploy backup to OCI (uploaded and
size-checked; a truncated dump and one without the completion marker were both rejected).

## 4. When something goes wrong

| Situation | Do this |
|---|---|
| A new feature misbehaves and has a switch | Turn the switch off (admin setting, or `.env` + `nexa.sh restart prod`) |
| Lock, migration state, build, backup or migration fails | Nothing to undo: production is unchanged. A failed migration: DATABASE_RESTORE.md §7 |
| Health gate or smoke test fails | The script restored `:last-good`. Read its logs, fix, redeploy |
| Deploy went green, then errors climb; class A, or B before new values are used | Actions → Deploy Production → `action: rollback` |
| Class B after the new values are written, or class C | Roll forward: hotfix PR into `main`. Maintenance page meanwhile if unusable |
| Data damaged, or "NOT ROLLED BACK" with no quick fix | Restore the pre-deploy backup: DATABASE_RESTORE.md §8 (owner's call: writes since it are lost) |

## 5. Before the first release with this

Nothing to set up: the release that ships this runs it (the workflow runs the target commit's
script). Only the newest pre-deploy backup is kept, so the script removes older ones itself.

## 6. Later (when a specific risk calls for it)

Not built on purpose. Each line says what would justify it.

- **Alerting** (Sentry DSNs, an uptime check, a watch window after deploy): once deploys happen
  while nobody watches, or the first incident is found by a user. Owner picks the channel.
- **Images in a registry** (GHCR or OCIR) for rollback to any release and surviving a lost box:
  when the box's disk or a second server makes local tags insufficient.
- **Off-box copies of `.env`, recordings and Cloudinary media**: before relying on rebuilding the
  box; decide Cloudinary export vs accepting the risk.
- **`lock_timeout` and `CONCURRENTLY` conventions**: when a migration touches a large, busy table.
- **Graceful shutdown** (`enableShutdownHooks`, `stop_grace_period`): if the few seconds of
  errors during a swap start to matter.
- **Migrations tested on a sanitised production copy in CI**: after a migration fails on real data.
- **Drills** (monthly restore into scratch Postgres, quarterly broken build on staging),
  **containerised staging**, **bats tests for the deploy script**: when the team grows, or before
  the D5 contract release.
- **Required reviewer on production runs and `prod-…` git tags**: when someone other than the
  owner can merge to `main`.

## 7. Evidence (audit 2026-11-23)

What made the §3 items necessary, each checked in code, config or the prod box:
- Rollback had never run in production (0 of 64 history events) and never compared the
  schema with the code it restored; the health check was `SELECT 1`.
- Every API container start ran `prisma migrate deploy`; after a failed migration (P3009) any
  restart of the old API would crash-loop.
- No backup was taken before migrating: up to a day of data at risk.
- `nexa.sh restart prod` rebuilt everything with no lock, migration step, health gate or
  rollback, and stopped Postgres and LiveKit.
- The deploy lock could wait 40 min inside a 45 min SSH timeout.
- 14 of 177 migrations are class C, 34 class B; nothing enforced "keep them additive".
- Not addressed yet (§6): Sentry DSNs unset, no uptime monitor, images only on the box, no copy
  of the prod `.env`, no `lock_timeout`, no graceful shutdown.
