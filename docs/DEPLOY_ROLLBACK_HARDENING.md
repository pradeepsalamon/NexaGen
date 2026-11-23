# Deploy and rollback hardening (plan)

**Status: planned, nothing built yet (2026-11-23).** This doc lists what has to change so a
production deploy, and a rollback after one, are safe when database migrations are involved.
It is based on a read-only audit of the current setup on 2026-11-23. How the pipeline works
today is in [DEPLOYMENT.md](DEPLOYMENT.md) § "CI, automated deploys and rollback". Update this
doc as items ship: mark them done here, then describe the new behaviour in DEPLOYMENT.md.

## Why: what the audit found

Every claim below was checked in the code, the config, or the production box's deploy history.

- **Rollback has never run in production.** `.deploy/history.log` on the prod checkout holds
  64 events since 2026-10-11: successful deploys and 4 aborted builds. There are 0 automatic
  rollbacks and 0 manual ones, and no test covers `scripts/deploy-production.sh`.
- **A rollback puts old code on the migrated schema, unchecked.** Migrations are never reversed
  (`deploy-production.sh:33`). The restore path (`:393-408`, `restore_generation` `:210-253`)
  never compares the database with the code it restores. The health check is
  `GET /health/ready`, which runs `SELECT 1` plus a Redis check (compose `api` healthcheck,
  `apps/api/src/health/health.service.ts`), so old code on an incompatible schema still passes.
  "Keep migrations additive" is enforced by nothing, and the repo has already shipped
  migrations old code can't run on:
  - `20261101100736_class_requests_into_approvals` puts a write-refusing trigger on `class_change_requests`.
  - `20261107083808_system_message_channels` renames and deletes template rows.
  - 36 migrations add enum values that an older Prisma client can't read.
  - 11 contain `DROP`, `RENAME` or `SET NOT NULL`.
- **Every container start runs migrations.** `apps/api/entrypoint.sh:5` runs
  `npx prisma migrate deploy` before `node`. After a failed migration, Prisma refuses with P3009
  until someone runs `migrate resolve`. Any restart of the old API that is still serving (a
  crash, a reboot, `nexa.sh`) would then exit and crash-loop. A restored old image runs it too.
- **No backup right before migrating.** The only backups are the nightly `scripts/backup_db.sh`
  (cron `0 20 * * *` UTC on the box, 14 days in OCI) and the admin "Backup now". A bad data
  migration can lose up to a day of data.
- **Only two image generations, on the same server.** Each service has `:latest`, `:last-good`
  and `:previous`, stored locally (`deploy-production.sh:24-25,505-512`). Manual rollback goes
  back one step, only for the services the last deploy changed (`:314-361`). Losing the box loses
  every artifact.
- **Nobody is alerted.** `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are unset in the prod `.env`.
  No uptime monitor exists. The only failure signal is a red GitHub Actions run.
- **A second deploy path skips every safeguard.** `scripts/nexa.sh:388-391` (`restart prod`) runs
  `docker compose down` and `up -d --build`, with no lock, no CI, no migrations-first step, no
  image tags, no health gate and no rollback. It also stops Postgres and LiveKit.
- **The SSH timeout can cut a deploy short.** `deploy-production.yml:189` sets
  `command_timeout: 45m`, while the script may wait up to 2400 s for the lock (`:94`) before a
  build of roughly 5–8 min. No signal trap rolls back an interrupted run.
- **Migrations run on the live database without guards.** None of the 170 sets `lock_timeout` or
  builds an index `CONCURRENTLY`, while the old API keeps serving during the migration step
  (`:452-476`). CI applies migrations only to an empty database (`ci.yml:171-172`).
- **Every deploy causes a short outage.** Containers are replaced in place, with no
  `enableShutdownHooks()` in `apps/api/src/main.ts` and no `stop_grace_period` in
  `docker-compose.yml`.
- **State outside the database isn't backed up:** the prod `.env` (edited by hand on the box,
  `DEPLOYMENT.md:49`), Cloudinary media, recordings (local disk, pruned after 14 days under disk
  pressure), and Redis/BullMQ.
- **`last-good-commit` can drift from the image.** It is written only when empty during the
  snapshot (`:306-308`), so after an out-of-band change the image and the commit can disagree.

## The plan, in order

Each item says what changes, where, and how to know it's done. **P0 items come first.**

### P0 — before the next release that contains a migration

1. **Stop migrating in the container entrypoint.** In `apps/api/entrypoint.sh`, run
   `prisma migrate deploy` only when `MIGRATE_ON_START=true`, and set it to `false` for the `api`
   service in `docker-compose.yml`. Local and staging can keep it on. After this,
   `deploy-production.sh`'s migration step is the only thing that migrates production, and no
   rollback ever runs migrations.
   *Done when:* restarting `nexa_api` logs no migration run, and a drill with a failed migration
   (P3009 state) followed by `docker restart nexa_api` keeps the API up.
2. **Back up right before migrating.** In `deploy-production.sh`, before the migration step, run
   `prisma migrate status` from the new image. If any migration is pending:
   - `pg_dump`, using the same `--exclude-table-data` flags as `backup_db.sh`, to
     `.deploy/backups/<UTC timestamp>-<sha>.sql.gz`;
   - upload it to OCI under `database/predeploy/`;
   - keep the last 5 locally and 30 days in OCI;
   - write the backup's key to `history.log`.

   Abort the deploy if the dump or the upload fails.
   *Done when:* a deploy with a pending migration leaves a dump locally and in OCI, and a deploy
   without one takes no dump.
3. **Check migration state before building.** In the same `migrate status` step, abort with a
   clear message, before anything is built or replaced, if the database has a failed migration
   or one the target commit doesn't know about.
4. **Write the runbooks:**
   - a failed migration: P3009, `prisma migrate resolve --rolled-back` or `--applied`, when to
     restore instead;
   - a database restore from the pre-deploy dump (extend [DATABASE_RESTORE.md](DATABASE_RESTORE.md));
   - an incident checklist: maintenance page, rollback, restore, who to tell.

   Link all three from DEPLOYMENT.md.
5. **Remove or fix `nexa.sh restart prod`.** Either refuse with a pointer to the workflow, or
   make it call `deploy-production.sh` with the current commit (same lock, migrations step,
   health gate and rollback). It must never stop Postgres or LiveKit.
6. **Fix the timeout race and handle interruption.** Cut the lock wait well below the SSH
   timeout (for example 15 min), or run the script detached (`systemd-run` or `nohup`) and have
   the workflow poll `history.log`. Add `trap … HUP INT TERM` that restores `:last-good` when
   the run stops after containers were replaced.

### P1 — make rollback trustworthy

7. **Check schema compatibility before any rollback.** Bake a manifest of the image's migration
   names into the API image, or read them from its `prisma/migrations`. Before restoring, compare
   the newest migration applied in `_prisma_migrations` with what the target image knows. If the
   database is ahead and any of those newer migrations is non-additive (item 8's marker), stop:
   don't restore, print why, alert (item 10), and point to the restore runbook. An additive-only
   gap rolls back as today.
8. **Make migrations expand/contract, with a CI check.** Add a CI step that fails on `DROP`,
   `RENAME`, `SET NOT NULL`, `ALTER TYPE … ADD VALUE`, triggers that refuse writes, and
   `UPDATE`/`DELETE` data rewrites, unless the migration declares itself with a marker comment
   (for example `-- nexa:contract <reason>`). A contract change ships one release after the code
   stops depending on the old shape; the D5 folder (`apps/api/prisma/contract/`) is the
   precedent.
   *Done when:* a new migration containing `DROP COLUMN` without the marker fails CI.
9. **Make migrations safe on a live database.** Convention plus CI check: each migration starts
   with `SET lock_timeout = '5s';`. Large-table indexes are built `CONCURRENTLY` in a migration of
   their own (Prisma can't run `CONCURRENTLY` inside a transaction).
10. **Monitoring and a watch window.**
    - Set the Sentry DSNs (API and web), with an alert rule on error-rate spikes.
    - Add an external uptime check on a deep health endpoint (item 13).
    - Send both to a channel someone reads (owner decision below).
    - After the swap, run a smoke test that hits login plus one key read path (for example the
      student dashboard) through nginx. If it fails, roll back exactly as a failed health check
      does.
    - Keep a 10-minute watch window in which the workflow polls the error rate before marking
      the deploy good.
11. **Keep images in a registry.** After a successful deploy, push both images tagged with the
    commit SHA to a registry, and keep at least 5 per service. Rollback becomes pull + retag to
    any of them, and survives losing the box. Allow rolling back **any** service to **any**
    retained SHA, not only one step and not only the last deploy's services.
12. **Keep `last-good-commit` true to the image.** Label each image with its commit
    (`org.opencontainers.image.revision` at build) and read the commit from the running image's
    label during the snapshot, instead of trusting the file.
13. **Make readiness more than `SELECT 1`.** Add `/health/deep` (or extend `/health/ready`) to run
    a few cheap real queries through Prisma: a count on `users`, `classes` and `payments` with
    `LIMIT 1`, and one enum-typed column. Old code on an incompatible schema then fails the gate
    and the uptime check.
14. **Shut down gracefully.** Add `app.enableShutdownHooks()` in `main.ts`, set
    `stop_grace_period: 30s` on `api` and `web`, and stop BullMQ workers and the Stockfish pool on
    shutdown.

### P2 — prove it and protect it

15. **Drill monthly.**
    - Restore the latest backup into a scratch Postgres and check row counts per table against
      production (`scripts/saas/rehearse-d5.sh` shows the pattern).
    - Every quarter, deploy a deliberately broken build to a containerised staging (item 18) to
      exercise automatic rollback, manual rollback and the item 7 refusal.
    - Record each drill in DEPLOYMENT.md.
16. **Test migrations against a sanitised copy of production.** Run CI's migration job against
    an anonymised dump, not only an empty database: names, emails, phones and free text scrubbed,
    keys and secrets dropped. That catches `NOT NULL`/`UNIQUE` failures that depend on real data.
17. **Back up the state outside the database.**
    - Encrypt the prod `.env` (age or gpg) into OCI nightly, or move the secrets to OCI Vault.
    - Back up recordings (they are on local disk only).
    - Cloudinary: either export it periodically or accept the risk in writing.
    - Redis: decide whether BullMQ state needs a backup; the outbox rows that drive it are in
      Postgres.
18. **Containerise staging** and run it through the same `deploy-production.sh` with its own
    compose project and `.deploy/` state, so every deploy and rollback path runs on staging
    first.
19. **Test the deploy script in CI.** Use bats (or similar) with `docker`/`git` stubbed, and
    cover:
    - build fails
    - migration fails
    - `up` fails
    - health check times out
    - crash loop
    - rollback fails
    - manual rollback, then a second one (refused)
    - stale commit skipped
    - lock contention
    - missing `:last-good`
    - the item 7 refusal
20. **Protect production runs.** Put the `deploy` and `rollback` jobs behind a GitHub
    `environment: production` with a required reviewer. Required reviewers work on public repos
    and on paid plans, but **not on a private repo on GitHub Free**. If the repo goes private on
    Free, gate the jobs on `github.actor` being in an allow-list instead.
21. **Tag every successful production deploy** with `prod-YYYYMMDD-HHMM-<short sha>` from the
    workflow, so releases can be found without reading `history.log` on the box.

## Owner decisions needed

- **Registry for item 11.** GHCR's free storage for private packages is small next to ~1.9 GB of
  images per release (api ~1.4 GB, web ~0.5 GB, `docker images`), so it costs money once the repo
  is private. Oracle's OCIR sits next to the server and the existing OCI bucket.
- **Where alerts go (item 10):** email, WhatsApp, Telegram or Slack, and who reads them.
- **Sentry:** create the projects and put the DSNs in the prod `.env`. Students are minors, so
  the scrubbing rules in INFRASTRUCTURE.md §3.6d2 stay as they are.
- **Cloudinary:** back it up, or accept the risk (item 17).
- **Whether the repo stays public** (item 20: free required reviewers).
