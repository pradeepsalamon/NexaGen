import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Every raw query, reviewed for academy scoping (docs/SAAS_MULTI_TENANCY.md §E
 * "Raw SQL", § "Phase 3 plan" slice 4). Raw SQL never passes through the
 * tenant-scope extension, so a new `$queryRaw`/`$executeRaw` (or a changed count
 * in a listed file) fails here until someone decides which kind it is:
 *
 * - `tenant-filtered`: reads or writes academy rows by a condition, so it carries
 *   `tenantFilter(alias)` / `sqlTenantId()` (the file must use one of them).
 * - `id-keyed`: a row lock or read by primary key, or by ids/one student that
 *   scoped Prisma reads already resolved; the rows can't belong to another academy.
 * - `platform`: platform tables only (Lichess catalogue, job locks, health).
 * - `global-claim`: claims work across academies on purpose; each claimed row is
 *   then handled inside its own academy (`runInTenant(row.tenantId)`).
 * - `infra`: not a query on academy data (client bindings, docs, advisory locks).
 * - `integrity`: reads across every academy on purpose to find rows linked to
 *   another academy (monitoring only, read-only, platform operators).
 */
type Kind = "global-claim" | "id-keyed" | "infra" | "integrity" | "platform" | "tenant-filtered";

const REVIEWED: Record<string, { calls: number; kind: Kind; why: string }> = {
  "activity-queue/activity-queue.service.ts": { calls: 2, kind: "id-keyed", why: "FOR UPDATE on one queue by id" },
  "analytics/analytics-support.ts": { calls: 1, kind: "tenant-filtered", why: "bucketedCounts filters its table" },
  "analytics/analytics.service.ts": { calls: 2, kind: "tenant-filtered", why: "classes c" },
  "analytics/sections/batches.section.ts": { calls: 12, kind: "tenant-filtered", why: "driving table of each query" },
  "analytics/sections/classes.section.ts": { calls: 5, kind: "tenant-filtered", why: "classes c / batch_students bs" },
  "analytics/sections/coaches.section.ts": { calls: 9, kind: "tenant-filtered", why: "users u / classes c / batch_coaches bc" },
  "analytics/sections/operations.section.ts": { calls: 2, kind: "tenant-filtered", why: "classes c / users u" },
  "analytics/sections/recordings.section.ts": { calls: 1, kind: "tenant-filtered", why: "live_sessions" },
  "analytics/sections/users.section.ts": { calls: 4, kind: "tenant-filtered", why: "users / analytics_events" },
  "approval/handlers/attendance-correction.handler.ts": { calls: 2, kind: "id-keyed", why: "locks a class and one attendance row" },
  "approval/handlers/batch-enrolment.handler.ts": { calls: 1, kind: "id-keyed", why: "locks one batch_students row" },
  "approval/handlers/class-cancel.handler.ts": { calls: 1, kind: "id-keyed", why: "locks one class" },
  "approval/handlers/class-change.handler.ts": { calls: 4, kind: "id-keyed", why: "locks batch, batch coach, user, class by id" },
  "approval/handlers/class-substitute.handler.ts": { calls: 2, kind: "id-keyed", why: "locks a class and a user" },
  "approval/handlers/live-class-guest-student.handler.ts": { calls: 1, kind: "id-keyed", why: "locks one class" },
  "approval/handlers/live-setting-exception.handler.ts": {
    calls: 3,
    kind: "tenant-filtered",
    why: "active-policy lock is filtered; batch/class locks by id"
  },
  "approval/handlers/tournament-publish.handler.ts": { calls: 1, kind: "id-keyed", why: "FOR UPDATE on one tournament by id" },
  "attendance/attendance.service.ts": { calls: 4, kind: "tenant-filtered", why: "stale-log sweeps filtered; correction locks by id" },
  "game-analysis/game-analysis.worker.ts": { calls: 2, kind: "global-claim", why: "claim, then run in the row's academy; heartbeat by id" },
  "health/health.service.ts": { calls: 1, kind: "platform", why: "SELECT 1" },
  "knowledge/knowledge.service.ts": { calls: 1, kind: "tenant-filtered", why: "ranks articles a" },
  "live-class/live-class-settings.service.ts": { calls: 5, kind: "id-keyed", why: "policy/batch/class locks by id" },
  "messaging/messaging-delivery.worker.ts": { calls: 1, kind: "global-claim", why: "outbox claim; each row sent in its academy" },
  "payments/credit-note.service.ts": { calls: 1, kind: "id-keyed", why: "locks one invoice" },
  "payments/payment.service.ts": { calls: 1, kind: "id-keyed", why: "locks one payment" },
  "payments/refund.service.ts": { calls: 1, kind: "id-keyed", why: "locks a refund's payment" },
  "payroll/payroll-record-totals.util.ts": { calls: 1, kind: "id-keyed", why: "locks one payroll record" },
  "platform/entitlement.service.ts": { calls: 1, kind: "infra", why: "advisory lock keyed by the academy" },
  "prisma/job-lock.service.ts": { calls: 3, kind: "platform", why: "job_locks" },
  "prisma/prisma.service.ts": { calls: 12, kind: "infra", why: "the client's own $queryRaw/$executeRaw bindings" },
  "progress/activity-history.service.ts": { calls: 10, kind: "id-keyed", why: "every subquery is one student's rows" },
  "progress/progress-recorder.service.ts": { calls: 1, kind: "id-keyed", why: "locks one student's progress row" },
  "puzzle-activity/library-activity.service.ts": { calls: 2, kind: "tenant-filtered", why: "GLOBAL means academy-wide" },
  "puzzle-rush/live-class-puzzle-rush.service.ts": { calls: 4, kind: "platform", why: "lichess_puzzles + SET LOCAL" },
  "puzzle/live-class-puzzle.service.ts": { calls: 1, kind: "id-keyed", why: "locks one assignment" },
  "puzzle/puzzle-catalog.service.ts": { calls: 3, kind: "platform", why: "lichess_puzzles + SET LOCAL" },
  "puzzle/puzzle-training.service.ts": { calls: 4, kind: "platform", why: "lichess_puzzles + SET LOCAL" },
  "referral/referral-credits.service.ts": { calls: 1, kind: "infra", why: "advisory lock per user id (global cuid)" },
  "retention/retention-policy.service.ts": { calls: 2, kind: "tenant-filtered", why: "retentionParams on academy tables" },
  "retention/retention.service.ts": { calls: 1, kind: "tenant-filtered", why: "retentionParams on academy tables" },
  "revision/revision.service.ts": { calls: 2, kind: "id-keyed", why: "one student's attempts; one item lock" },
  "student-match/live-class-match.service.ts": { calls: 1, kind: "id-keyed", why: "locks one round" },
  "tenancy/integrity/tenant-integrity.service.ts": {
    calls: 4,
    kind: "integrity",
    why: "catalogue read, SET LOCAL timeout, cross-academy sample + count per FK (read-only)"
  },
  "tenancy/tenant-sql.ts": { calls: 2, kind: "infra", why: "doc comment" },
  "tournament/tournament-registration.service.ts": { calls: 1, kind: "id-keyed", why: "FOR UPDATE on one tournament by id (capacity)" },
  "tournament/tournament-settings.service.ts": { calls: 1, kind: "infra", why: "advisory lock keyed by the academy" },
  "trash/trash.service.ts": { calls: 2, kind: "id-keyed", why: "one user's avatar by id (+ its type)" }
};

const SRC = join(__dirname, "..");
const RAW = /\$(queryRaw|executeRaw)(Unsafe)?\b/g;
const USES_TENANT_SQL = /\b(tenantFilter|sqlTenantId|retentionParams)\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : sourceFiles(path);
    return name.endsWith(".ts") && !name.endsWith("spec.ts") ? [path] : [];
  });
}

describe("raw SQL is reviewed for academy scoping", () => {
  const found = new Map<string, { calls: number; text: string }>();
  for (const path of sourceFiles(SRC)) {
    const text = readFileSync(path, "utf8");
    const calls = text.match(RAW)?.length ?? 0;
    if (calls) found.set(relative(SRC, path).split("\\").join("/"), { calls, text });
  }

  it("lists every file with raw SQL, at its current call count", () => {
    const unreviewed = [...found]
      .filter(([file, { calls }]) => REVIEWED[file]?.calls !== calls)
      .map(([file, { calls }]) => `${file}: ${calls} raw call(s), reviewed ${REVIEWED[file]?.calls ?? 0}`);
    // Fix: decide the kind (see the comment above), add tenantFilter() if it
    // reads academy rows by a condition, then update REVIEWED.
    expect(unreviewed).toEqual([]);
  });

  it("drops entries for files that no longer have raw SQL", () => {
    expect(Object.keys(REVIEWED).filter((file) => !found.has(file))).toEqual([]);
  });

  it("filtered files really use the tenant SQL helpers", () => {
    const missing = Object.entries(REVIEWED)
      .filter(([, review]) => review.kind === "tenant-filtered")
      .filter(([file]) => !USES_TENANT_SQL.test(found.get(file)?.text ?? ""))
      .map(([file]) => file);
    expect(missing).toEqual([]);
  });
});
