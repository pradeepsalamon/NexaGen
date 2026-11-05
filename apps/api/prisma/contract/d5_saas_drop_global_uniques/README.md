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

## 2. Promote (after the rehearsal passes and the owner approves)

1. `git apply apps/api/prisma/contract/d5_saas_drop_global_uniques/schema.patch`
2. Create the migration folder with the real current UTC time:
   `apps/api/prisma/migrations/<yyyymmddhhmmss>_saas_d5_contract/migration.sql`
   (copy `migration.sql`), then delete this folder.
3. `npm run db:generate && npm run typecheck && npm run test && npm run test:integration`
4. Release it alone, right after a fresh backup, once the previous release has
   been stable for a full cycle (§J-11). Rolling back means restoring that backup.
