# §D5 contract: drop the global uniques (not applied anywhere)

docs/SAAS_MULTI_TENANCY.md §D (D5), §J-10 (rehearsal), §J-11 (rollback), Phase 7.

This folder is deliberately **outside `prisma/migrations/`**: CI, the drift
check and `scripts/deploy-production.sh` never see it. It is the point of no
return for multi-tenancy, so it ships alone, after a rehearsal and a backup,
and only with the owner's approval.

| File | What |
|---|---|
| `migration.sql` | The contract: 23 global uniques dropped (their per-academy twins stay), number sequences keyed by `(tenantId, year)`, four hand-written global partial uniques dropped, and the `'tenant_nexa'` default of every `tenantId` column replaced by `nexa_tenant_required()`, which raises (a row without an academy is an error, never Nexa's; keeping *a* default leaves Prisma's create types unchanged). Generated with `prisma migrate diff` from the schema patch, plus the partial indexes Prisma doesn't model. |
| `schema.patch` | The matching `schema.prisma` change (`git apply` from the repo root). The API type-checks against it with no code change: every lookup by those keys already uses the `tenantId_…` compound key (Phase 3 slice 5; the seed was switched on 2026-11-05). |

## 1. Rehearse (staging box, never production)

```bash
# A plain-SQL backup from scripts/backup_db.sh, copied to the staging box
scripts/saas/rehearse-d5.sh --dump nexa-db-<date>.sql.gz \
  --target-url postgresql://<user>:<pass>@127.0.0.1:5432/nexa_d5_rehearsal
```

It restores the dump, runs `migrate deploy`, applies `migration.sql`, and fails
unless row counts, money totals and foreign keys are unchanged, every `tenantId`
default is the raising one (and an insert without an academy fails), and the
sequences are re-keyed. Then it restores the same dump
into `<name>_rb` (the rollback drill) and prints the timings. Run the e2e suite
against the rehearsal database afterwards (§J-10).

### Rehearsal log

| Date | Source | Result |
|---|---|---|
| 2026-11-05 | `vps_dev` dumped with the backup script's flags (Lichess puzzle rows excluded, 113 KB gzip). It's production-sized and at the referral migrations, without the 9 SaaS ones, so it went through the same D1–D4 steps production will | **PASS.** Restore 6 s, `migrate deploy` (all 9 SaaS migrations) 4 s, **contract under 1 s**. 178 tables, 1,148 rows; counts, money totals and FKs unchanged; 0 rows without an academy; raising default on every `tenantId`; an insert without one refused; 3/3 sequences re-keyed; sampled global uniques gone. Rollback drill: restore 6 s, migrate 3 s, counts match. Both databases dropped afterwards |

Still to do before promoting: the same run on a **real production backup**
(Phase 7; the owner fetches it from the backup bucket), because production may
hold rows `vps_dev` doesn't. The e2e half of §J-10 is already covered by
staging: `vps_dev_saas` has run with D5 applied since 2026-11-04, and the full
Chromium and WebKit suites pass against it.

## 2. Promote (after the rehearsal passes and the owner approves)

1. `git apply apps/api/prisma/contract/d5_saas_drop_global_uniques/schema.patch`
2. Create the migration folder with the real current UTC time:
   `apps/api/prisma/migrations/<yyyymmddhhmmss>_saas_d5_contract/migration.sql`
   (copy `migration.sql`), then delete this folder.
3. `npm run db:generate && npm run typecheck && npm run test && npm run test:integration`
4. Release it alone, right after a fresh backup, once the previous release has
   been stable for a full cycle (§J-11). Rolling back means restoring that backup.

## 3. Release day (production)

What the contract does to a live database, measured above: dropping indexes and
re-keying three small sequence tables takes `ACCESS EXCLUSIVE` locks for
milliseconds at today's size, and changing a column default only touches the
catalog. The deploy script runs migrations before swapping the API (§6 of
CLAUDE.md), so the old API keeps serving during the run.

1. The release before it has been stable for a full cycle, with **no
   `tenant-audit` `scope: "request"` lines from browsers**
   (`docker logs nexa_api 2>&1 | grep tenant-audit`).
2. Take a fresh backup (`scripts/backup_db.sh`) and check it restores (step 1
   against it). This backup is the rollback.
3. Merge the promoted migration alone, with nothing else in the release.
4. After deploy: `select count(*) from pg_indexes where indexname = 'users_email_key'`
   is 0; signing in, a new class and an invoice number all still work.
5. **Rollback is the backup, not an image rollback:** an old image would write
   rows without `tenantId`, and the raising default now refuses them. If
   something is wrong, restore the step 2 backup (`docs/DATABASE_RESTORE.md`),
   which loses everything written since.

