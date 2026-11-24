# Safe deployment and rollback plan

**Status (2026-11-24): plan only, nothing below is built yet.** This is the single plan for
deploying production safely and getting back out when a deploy goes wrong. It replaces the
2026-11-23 fix list, which is now folded in (§5) together with the audit evidence (§8).

How the pipeline works **today** is in [DEPLOYMENT.md](DEPLOYMENT.md) § "CI, automated deploys
and rollback". As items here ship, mark them done in §5 and describe the new behaviour in
DEPLOYMENT.md. The SaaS-specific stages (enforce, D5 contract, first academy) stay in
[SAAS_CUTOVER_RUNBOOK.md](SAAS_CUTOVER_RUNBOOK.md); this plan is the general path every release
takes, that runbook adds its extra steps on top.

---

## 1. The rules

1. **Production changes only through `deploy-production.sh`.** No `docker compose up --build`,
   no `nexa.sh restart prod`, no migration typed by hand outside a runbook. One path means one
   lock, one migration step, one health gate and one rollback.
2. **Every release is classified before it is merged** (§3): can its images be rolled back, or
   only rolled forward or restored? The release PR says which.
3. **No migration runs without a fresh backup taken seconds before it.**
4. **Old code must keep working on the new schema** (expand/contract). A change old code can't
   live with ships in two releases, and CI enforces it.
5. **A rollback never makes things worse.** It refuses when the schema is ahead of the code it
   would restore, and says what to do instead.
6. **Someone hears about a failure within minutes**, not when a parent calls.
7. **Every path is rehearsed** on staging before production needs it, and drilled on a calendar.

---

## 2. How a release runs (target procedure)

### Before merging (the release PR)

1. `dev` has run on staging for at least two days with no new errors in its log.
2. The release PR (branch off `dev`, `main` merged in before CI, `gh pr create --base main`)
   carries a **release note** in its description:
   - the migrations it brings, each with its class from §3;
   - the release's overall rollback class (the worst of its migrations);
   - new feature switches and their default (new risky features ship **off**);
   - env vars to add to the prod `.env` **before** merging.
3. CI is green: unit, integration, build, the migration-safety check (§5 item 8) and, once
   built, migrations applied to a sanitised production copy (item 16).
4. Pick the window: outside class hours. The deploy script refuses while a class is `LIVE` or
   `IN_PROGRESS` unless `FORCE_DEPLOY_DURING_CLASS=1` (item 6b).
5. The owner merges. Merging is the deploy.

### The deploy (automatic on merge; each step is a gate)

| # | Step | On failure |
|---|---|---|
| 1 | Lock, skip a stale commit, refuse during a live class | Abort, nothing changed |
| 2 | Build the new images | Abort, nothing changed |
| 3 | `prisma migrate status` from the new image: refuse a failed or unknown migration | Abort, nothing changed |
| 4 | If migrations are pending: `pg_dump` → local + OCI `database/predeploy/` | Abort, nothing changed |
| 5 | `prisma migrate deploy` from the new image (only place production migrates) | Abort; old API keeps serving. Failed-migration runbook |
| 6 | Snapshot running images as `:last-good`; push new images to the registry | Abort before swap |
| 7 | Swap containers (graceful stop) | Automatic restore of `:last-good` |
| 8 | Health gate: `/health/ready` **and** the deep check | Automatic restore of `:last-good` |
| 9 | Smoke test through nginx: login + one student and one admin read path | Automatic restore of `:last-good` |
| 10 | Watch window, 10 min: Sentry error rate and the uptime check | Alert; the human decides (§4) |
| 11 | Mark good: record commit + image SHAs + backup key in `history.log`, tag `prod-YYYYMMDD-HHMM-<sha>` | — |

Steps 7–9 restore automatically because nothing outside the images has changed since step 5
except additive schema (class A/B). For a class C release the automatic restore is refused by
the compatibility check (item 7) and the deploy stops at "needs a human" with an alert.

### After the deploy

- The person who merged checks the release note's "check after deploy" list in a browser:
  sign in as each role, open a class, a puzzle set, the payments page.
- Leave the release alone for 24 h before the next one, unless it is a hotfix.

---

## 3. Rollback classes (decided per migration, per release)

| Class | What the migration does | Image rollback afterwards | Examples |
|---|---|---|---|
| **A: additive** | New table, nullable column, column with a default, new index, new composite unique beside the old | **Safe**: old code ignores it | Most migrations |
| **B: enum value** | `ALTER TYPE … ADD VALUE` | **Safe only until a row uses the new value.** After that, an old Prisma client throws reading that row ("Value not found in enum"), so every screen listing those rows errors | `NotificationType.DAILY_PUZZLE`, `LeadStatus.NO_SHOW` |
| **C: contract** | `DROP`, `RENAME`, `SET NOT NULL`, a type change, a write-refusing trigger, a data rewrite old code can't read | **Never.** Roll forward with a fix, or restore the pre-deploy dump (loses writes since the deploy) | D5 contract, `class_requests_into_approvals` |

Data rewrites (`UPDATE`/`DELETE`) are class C unless the release note shows old code reads the
result fine (then A). A release takes the class of its worst migration.

**The next release (dev → main, 166 commits, 21 migrations, checked 2026-11-24):** class **B**.
Six migrations add enum values (`MessagingEvent`/`NotificationType` `CLASS_RESCHEDULED` and
`DAILY_PUZZLE`, `LeadStatus` `DEMO_CONFIRMED`/`NO_SHOW`, `PuzzleAttemptContext.DAILY`). Three
rewrite data, all readable by old code: plan feature lists gain keys, `referral_redemptions`
gains terms, user emails are lowercased. No `DROP`/`RENAME`/`SET NOT NULL`. So an image rollback
is fine in the first hour; once daily-puzzle notifications have gone out, old code would break
students' notification lists, and the answer is roll forward. That release also carries the
B1 backup-download fix (0e2baf0b), which must be in production before a second academy exists.

---

## 4. When something goes wrong: decide in this order

| Situation | Do this | Time to recover |
|---|---|---|
| A new feature misbehaves and has a switch | **Turn the switch off** (admin setting or env + recreate API) | 1 min |
| Build, `migrate status`, backup or migration fails | Nothing to do: production is unchanged. Failed migration → runbook R1 | 0 |
| Health gate or smoke test fails | Automatic restore of `:last-good`. Read the failure logs, fix, redeploy | Seconds |
| Deploy went green, then errors climb, class A release (or B before the new values are used) | **Image rollback**: Actions → Deploy Production → `action: rollback`, to any retained SHA (item 11) | ~2 min |
| Same, class B after new values are written, or class C | **Roll forward**: hotfix PR into `main` (CI ~15 min, deploy ~8 min). Maintenance page if the app is unusable meanwhile | ~30 min |
| Data damaged by a migration or a bug | **Restore** the pre-deploy dump (runbook R2), then replay or accept the gap. Owner's call, with the data-loss window stated | 30–60 min |
| Box lost | New box, images from the registry, latest dump from OCI, `.env` from the encrypted copy (runbook R3) | Hours |

When in doubt between rollback and roll forward: if the compatibility check (item 7) refuses,
roll forward. Never hand-edit `_prisma_migrations` or tags to get past it.

Runbooks (item 4), linked from DEPLOYMENT.md:
- **R1 failed migration:** P3009, `prisma migrate resolve --rolled-back` or `--applied`, when to
  restore instead.
- **R2 database restore** from the pre-deploy dump ([DATABASE_RESTORE.md](DATABASE_RESTORE.md)
  extended).
- **R3 box lost** (rebuild from the registry, OCI and the `.env` copy).
- **Incident checklist:** maintenance page on (`nexa.sh maintenance on prod`), decide via the
  table above, tell coaches/parents (template), write a short note in `docs/TROUBLESHOOTING.md`.

---

## 5. What to build, in order

Each item: what changes, where, and how we know it's done.

### Phase 0: before the next release that contains a migration

1. **Stop migrating in the container entrypoint.** `apps/api/entrypoint.sh` runs
   `prisma migrate deploy` only when `MIGRATE_ON_START=true`; set `false` for `api` in
   `docker-compose.yml` (local and staging keep it on). The deploy script becomes the only thing
   that migrates production, and no rollback ever migrates.
   *Done when:* restarting `nexa_api` logs no migration run, and a drill with a failed migration
   (P3009 state) followed by `docker restart nexa_api` keeps the API up.
2. **Back up right before migrating** (§2 step 4). `pg_dump` with the same
   `--exclude-table-data` flags as `backup_db.sh` to `.deploy/backups/<UTC>-<sha>.sql.gz`, upload
   to OCI `database/predeploy/`, keep 5 locally and 30 days in OCI, write the key to
   `history.log`. Abort if the dump or upload fails.
   *Done when:* a deploy with a pending migration leaves a dump locally and in OCI; one without
   takes none.
3. **Check migration state before building anything** (§2 step 3): abort with a clear message
   on a failed migration or one the target commit doesn't know.
4. **Write runbooks R1, R2, R3 and the incident checklist** (§4).
5. **Remove `nexa.sh restart prod`'s rebuild path.** Refuse with a pointer to the workflow, or
   call `deploy-production.sh` with the current commit. It must never stop Postgres or LiveKit.
6. **Fix the timeout race and handle interruption.** Lock wait well below the 45 min SSH timeout
   (15 min), or run the script detached and have the workflow poll `history.log`. Add
   `trap … HUP INT TERM` that restores `:last-good` when a run stops after the swap.
   6b. **Refuse to deploy during a live class** (§2 step 1), with the override env var.
7. **Release note template** (§2) in `.github/pull_request_template.md` for PRs into `main`,
   with the §3 classes.

### Phase 1: make rollback trustworthy

8. **Migration-safety check in CI.** Fail on `DROP`, `RENAME`, `SET NOT NULL`, type changes,
   write-refusing triggers and `UPDATE`/`DELETE`, unless the migration carries
   `-- nexa:contract <reason>`; flag `ADD VALUE` as class B in the job summary. A contract change
   ships one release after the code stops depending on the old shape (the D5 folder
   `apps/api/prisma/contract/` is the precedent).
   *Done when:* a new migration containing `DROP COLUMN` without the marker fails CI.
9. **Migrations safe on a live database.** Each starts with `SET lock_timeout = '5s';` (CI
   check). Large-table indexes are built `CONCURRENTLY` in a migration of their own.
10. **Schema compatibility check before any restore** (automatic or manual). Bake the image's
    migration names into the API image; before restoring, compare with `_prisma_migrations`. If
    the database is ahead by a class C migration, refuse, print why, alert, point to R2. Class B:
    refuse if any row uses a value the target image doesn't know (the check reads the enum
    values from both images' `schema.prisma`). Class A rolls back as today.
11. **Images in a registry.** After the swap, push both images tagged with the commit SHA; keep
    at least 5 per service. Rollback = pull + retag to **any** retained SHA, for **any** service,
    and survives losing the box.
12. **Images carry their commit** (`org.opencontainers.image.revision` label); the snapshot reads
    it from the running image instead of trusting `last-good-commit`.
13. **Deep readiness.** `/health/deep` runs a few real Prisma reads (`users`, `classes`,
    `payments` with `LIMIT 1`, one enum-typed column). Old code on an incompatible schema fails
    the gate and the uptime check.
14. **Graceful shutdown.** `app.enableShutdownHooks()` in `main.ts`, `stop_grace_period: 30s` on
    `api` and `web`, BullMQ workers and the Stockfish pool closed on shutdown.
15. **Monitoring and the watch window** (§2 steps 9–10). Sentry DSNs set (API and web) with an
    error-rate alert, an external uptime check on `/health/deep`, both to the alert channel
    (owner decision). Smoke test after the swap; 10-minute watch before marking good.

### Phase 2: prove it and protect it

16. **Migrations against a sanitised production copy in CI** (names, emails, phones, free text
    scrubbed; keys and secrets dropped). Catches `NOT NULL`/`UNIQUE` failures that depend on real
    data.
17. **Back up the state outside the database.** Prod `.env` encrypted (age or gpg) into OCI
    nightly, or OCI Vault. Recordings (local disk only). Cloudinary: export, or accept the risk
    in writing. Redis: decide (the outbox rows that drive BullMQ are in Postgres).
18. **Containerised staging** running the same `deploy-production.sh` with its own compose
    project and `.deploy/` state, so every deploy and rollback path runs there first.
19. **Test the deploy script in CI** (bats, `docker`/`git` stubbed): build fails, migration
    fails, `up` fails, health timeout, crash loop, rollback fails, manual rollback twice, stale
    commit, lock contention, missing `:last-good`, the item 10 refusal, interrupted run.
20. **Drills.** Monthly: restore the latest backup into a scratch Postgres and compare row counts
    (`scripts/saas/rehearse-d5.sh` pattern). Quarterly: a deliberately broken build on staging to
    exercise automatic rollback, manual rollback and the item 10 refusal. Record each drill in
    DEPLOYMENT.md.
21. **Protect production runs.** `deploy` and `rollback` jobs behind `environment: production`
    with a required reviewer (public repo or paid plan), or an `github.actor` allow-list if the
    repo goes private on GitHub Free.
22. **Tag every successful deploy** `prod-YYYYMMDD-HHMM-<short sha>` from the workflow.

**Rough size:** Phase 0 is about a day of work plus one drill on staging; Phase 1 two to three
days; Phase 2 spread over the following weeks.

---

## 6. How we know it works

- A drill per path has passed on staging and is recorded: failed build, failed migration,
  failed health gate, manual rollback (class A), refused rollback (class C), restore from a
  pre-deploy dump, interrupted run.
- Every production deploy since Phase 0 has a pre-deploy dump key (when it migrated), image SHAs
  in the registry and a `prod-…` tag.
- An induced failure on staging reaches the alert channel within 5 minutes.

## 7. Owner decisions needed

- **Registry (item 11):** GHCR is small and paid once the repo is private (~1.9 GB of images per
  release: api ~1.4 GB, web ~0.5 GB); Oracle's OCIR sits beside the server and the OCI bucket.
- **Alert channel (item 15):** email, WhatsApp, Telegram or Slack, and who reads it.
- **Sentry:** create the projects and put the DSNs in the prod `.env`. Students are minors, so
  the scrubbing rules in INFRASTRUCTURE.md stay as they are.
- **Deploy window:** which hours count as "outside class hours".
- **Cloudinary:** back it up, or accept the risk (item 17).
- **Whether the repo stays public** (item 21: free required reviewers).

---

## 8. Evidence: what the 2026-11-23 audit found

Every claim was checked in the code, the config or the production box's deploy history.

- **Rollback has never run in production.** `.deploy/history.log` on the prod checkout holds 64
  events since 2026-10-11 (deploys and 4 aborted builds), 0 rollbacks. No test covers
  `scripts/deploy-production.sh`.
- **A rollback puts old code on the migrated schema, unchecked.** The restore path
  (`restore_generation`) never compares the database with the code it restores. The health check
  is `GET /health/ready` (`SELECT 1` plus Redis), so old code on an incompatible schema passes.
  "Keep migrations additive" is enforced by nothing, and the repo has shipped migrations old code
  can't run on: `20261101100736_class_requests_into_approvals` (write-refusing trigger),
  `20261107083808_system_message_channels` (renames and deletes rows), 36 enum additions, 11
  with `DROP`, `RENAME` or `SET NOT NULL`.
- **Every container start runs migrations** (`apps/api/entrypoint.sh`). After a failed migration
  Prisma refuses with P3009, so any restart of the still-serving old API (crash, reboot,
  `nexa.sh`) or a restored old image exits and crash-loops.
- **No backup right before migrating.** Only the nightly `backup_db.sh` (cron `0 20 * * *` UTC,
  14 days in OCI) and the admin "Backup now": a bad data migration can lose up to a day.
- **Only two image generations, on the same server** (`:last-good`, `:previous`). Manual
  rollback goes back one step, only for the services the last deploy changed. Losing the box
  loses every artifact.
- **Nobody is alerted.** `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are unset in prod; no uptime
  monitor; the only signal is a red Actions run.
- **A second deploy path skips every safeguard.** `nexa.sh restart prod` runs
  `docker compose down` + `up -d --build`: no lock, CI, migrations-first, tags, health gate or
  rollback, and it stops Postgres and LiveKit.
- **The SSH timeout can cut a deploy short.** `deploy-production.yml` `command_timeout: 45m`
  while the script may wait 2400 s for the lock before a 5–8 min build; no trap restores an
  interrupted run.
- **Migrations run on the live database without guards.** None of 170 sets `lock_timeout` or
  builds an index `CONCURRENTLY`; CI applies migrations only to an empty database.
- **Every deploy causes a short outage**: in-place replacement, no `enableShutdownHooks()`, no
  `stop_grace_period`.
- **State outside the database isn't backed up:** the prod `.env` (hand-edited on the box),
  Cloudinary media, recordings (local, pruned after 14 days under disk pressure), Redis.
- **`last-good-commit` can drift from the image**: written only when empty during the snapshot.
