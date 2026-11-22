# SaaS production cutover runbook

Written 2026-11-21 (branch `feat/saas-finish`). How the multi-academy code goes
from `dev` to production, in the order that keeps a rollback open at every step
but the last. **Nothing here has been run on production.** Each step is the
owner's call. A release goes `dev` → PR into `main` → owner merges → the
automatic deploy (CLAUDE.md §6).

Background: [SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) (§D schema steps,
§J migrating Nexa, Phase 7), the D5 contract's
[README](../apps/api/prisma/contract/d5_saas_drop_global_uniques/README.md),
[DEPLOYMENT.md](DEPLOYMENT.md) Step 4c (academy addresses), and
[DATABASE_RESTORE.md](DATABASE_RESTORE.md).

| Stage | What changes | Rollback |
|---|---|---|
| A. Release the SaaS code | Additive migrations, API and web; `TENANT_SCOPE_MODE=audit` | Image rollback (`:last-good`). The extra columns are ignored by old code |
| B. Enforce | One env var: `TENANT_SCOPE_MODE=enforce` | Set it back to `audit`, recreate the API |
| C. D5 contract | Global uniques dropped, `tenantId` default raises | **Restore the backup taken just before.** No image rollback |
| D. First academy | Console rows, DNS, nginx, certificate | Close the academy (KEEP_DATA) or suspend it |

Production on 2026-11-21: one academy (Nexa, `tenant_nexa`), 32 users, 218
tables after `migrate deploy` of `dev` (measured on a read-only copy, below).

---

## A. Release the SaaS code (audit mode)

1. **Before the PR.** On `dev`, everything for the release is merged and staging
   (`vps_dev_saas`, enforce, D5 applied) has run it for a few days. Then check:
   - Staging runs under enforce (`scripts/nexa.sh`, `STAGE_TENANT_SCOPE_MODE`),
     so a gap there is a refusal, not an audit line. Its log
     (`api-prod.log` in the main checkout) has no new `TenantScopeViolation` /
     `AcademyNotResolved` errors since the last fix.
   - CI on the release PR is green, including the integration suites and the
     migration drift check.
   - `npm run test:integration:d5` against a D5 database is green (see C.2):
     it runs the whole integration suite against the contracted schema.
2. **The release PR.** A branch off `dev`, `main` merged into it before CI
   (memory: two releases needed that), `gh pr create --base main`. The PR lists
   the migrations it brings. Every one is additive (columns with the
   `'tenant_nexa'` default, composite uniques beside the old ones, new tables).
3. **Deploy** (automatic on merge). The script migrates before swapping the API.
   No env change is needed. `TENANT_SCOPE_MODE` is unset in the root `.env`,
   and compose passes `audit` by default (`docker-compose.yml`; before
   2026-11-21 compose didn't pass it through at all, so setting it in the root
   `.env` did nothing).
4. **Check after deploy.**
   - `docker exec nexa_api printenv TENANT_SCOPE_MODE` prints `audit`.
   - Sign in as each role. Open a class, a puzzle set and the payments page.
     Create an invoice on a test order if one is due.
   - The platform console (`/platform`) opens for Nexa's super admins. Nexa is
     the only academy, on Enterprise.
   - `select count(*) from tenants` is 1.
5. **Watch for a full cycle** (at least a week of normal classes and one
   payroll and invoice run):
   ```bash
   docker logs --since 24h nexa_api 2>&1 | grep tenant-audit | grep '"scope":"request"' | head
   docker logs --since 24h nexa_api 2>&1 | grep tenant-audit | grep -v '"scope":"request"' | head
   ```
   A line is a query that ran without an academy. Under enforce it would have
   been refused. Fix each in code (a `runInTenant` around a job, or a missing
   `requireTenantId()`) and release the fix before stage B. Zero lines for the
   whole cycle is the bar.

## B. Enforce

Only after A's watch is clean.

1. Root `.env` on the production box: `TENANT_SCOPE_MODE=enforce`.
2. `docker compose up -d --no-build api` (recreates the API container with the
   new env; no image change). `docker exec nexa_api printenv TENANT_SCOPE_MODE`
   prints `enforce`.
3. Check: the same tour as A.4, plus a cron-driven message (a class reminder
   arrives) and a webhook (a test Razorpay payment, or the LiveKit room events
   of a short class).
4. **Rollback:** `TENANT_SCOPE_MODE=audit` and the same `docker compose up`.
   Nothing in the data changes either way.

## C. The D5 contract (point of no return)

Only after B has been stable for a full cycle, with the owner's approval, in a
release of its own.

1. **Rehearse on a fresh production copy** (read-only `pg_dump` with the backup
   script's flags, restored into a throwaway local database, never production):
   ```bash
   scripts/saas/rehearse-d5.sh --dump <dump>.sql.gz \
     --target-url postgresql://<user>:<pass>@127.0.0.1:<port>/nexa_d5_rehearsal
   ```
   It must PASS: unchanged counts, money totals and FKs; every `tenantId`
   default raising; an insert without an academy refused; the sequences
   re-keyed; the rollback drill matching. Also run
   `prisma migrate diff --from-url <rehearsal> --to-schema-datamodel <patched schema>`.
   It must print "No difference detected". Then drop the databases and shred the
   dump. Add a row to the contract README's rehearsal log.
2. **Run the whole integration suite on the contracted schema.** Create a
   `*_d5_int` database, `migrate deploy`, apply the contract's `migration.sql`,
   apply `schema.patch` to a scratch checkout, `npx prisma generate`, then:
   ```bash
   INTEGRATION_DATABASE_URL=postgresql://…/nexa_gen_d5_int npm run test:integration:d5 -w apps/api
   ```
   `test:integration:d5` stamps the suite's own fixtures (writes made with
   no context at all) with Nexa's academy, as the old column default did
   (`test/integration/d5-default-context.ts`). Everything inside a request, a
   `runInTenant` or an `asPlatform` runs as the app would. A failure there is
   a write that would break after D5, for example a nested create the
   extension didn't stamp. Fix it in code, release it (stage A rules), and
   re-run. Restore the scratch schema afterwards. This run doesn't prove that
   background jobs set their academy; the audit watch in A.5 does.
3. **Promote.** Follow the contract README §2: apply `schema.patch`, create
   `prisma/migrations/<real UTC now>_saas_d5_contract/migration.sql` from the
   contract, delete the contract folder, then `npm run db:generate && npm run
   typecheck && npm run test && npm run test:integration`. A PR with only that
   change.
4. **Release day** (contract README §3):
   - A fresh backup (`scripts/backup_db.sh`), restored once to prove it works.
     **This backup is the rollback.**
   - Merge the promotion PR alone. The deploy migrates before swapping. The
     contract takes `ACCESS EXCLUSIVE` locks for milliseconds; it took under 1 s
     on every rehearsal.
   - Check: `select count(*) from pg_indexes where indexname = 'users_email_key'`
     is 0. Then sign in, create a class, issue an invoice number, and send a chat
     message (a nested create).
5. **Rollback** is restoring the release-day backup ([DATABASE_RESTORE.md](DATABASE_RESTORE.md)).
   That loses everything written since. An old image can't run on the contracted
   database: it would write rows without `tenantId`, and the raising default
   refuses them.

## D. The first other academy

Can start after stage B. Stage C isn't needed for a second academy: until then
the old global uniques stay, so two academies can't share an email address or a
username.

1. **Address.** A subdomain (`<slug>.nexachess.in`) needs the wildcard DNS
   record, a wildcard certificate and the nginx block (DEPLOYMENT.md Step 4c
   §2). An academy's own domain needs the plan feature `customDomain` and
   Step 4c §3: add the block, run certbot, then press **Check** in the console.
2. **Create it** in the console (Academies → New): name, slug, plan and its
   first super admin. That person gets an email with a link to set their
   password (`ACCOUNT_INVITE`-style reset link, 7 days).
3. **The academy sets itself up**:
   - branding (`/admin/branding`);
   - its legal pages (`/admin/legal-pages`; until it writes its own, its
     `/privacy` and `/terms` show the built-in text, which names NexaChess);
   - payment gateway keys (Phase 6; never falls back to Nexa's);
   - WhatsApp, if its plan has it.
4. **People.** Users → Import takes a CSV of students and coaches
   ([ROSTER_IMPORT.md](ROSTER_IMPORT.md)). Each person with an email gets an
   invite; rows without one import but can't sign in. Seats are checked per row
   against the plan. An operator can run the import on a support visit.
5. **Check isolation** on the new address. Sign in there as its admin: no Nexa
   batch, student or puzzle appears. A Nexa login on that address is refused
   (401). Console → Integrity shows no findings the next morning.

## Closing an academy later

On the academy's request only ([ACADEMY_CLOSURE.md](ACADEMY_CLOSURE.md)).
Console → Closures, or the academy's page. KEEP_DATA can be reopened.
DELETE_DATA waits 7 days, then the hourly purge runs. Financial records are
always kept. Download the export first if anyone may need it.

## Log

| Date | What | Result |
|---|---|---|
| 2026-11-21 | Stage C.1 rehearsal on a read-only production dump (`dev` + `feat/saas-finish` migrations; 218 tables, 12,780 rows), throwaway Postgres 15 container | PASS. Restore 9 s, migrate 4 s, contract under 1 s. `migrate diff` to the patched schema is empty. Rollback drill matches. Dump shredded, container removed |
| 2026-11-21 | Stage C.2 `test:integration:d5` on a contracted scratch database | See the PR into `dev` for the run |
