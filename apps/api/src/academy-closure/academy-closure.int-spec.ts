import { gunzipSync } from "node:zlib";
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type AcademyExportHeader,
  type AcademyExportLine,
  type AcademyClosureResponse,
  type TenantClosureResponse
} from "@nexa-chess/types";
import { UserStatus, type User } from "@prisma/client";
import { SystemNotifier } from "../mail/system-notifier.service";
import { EntitlementService } from "../platform/entitlement.service";
import { setTenantScopeModeForTesting } from "../prisma/tenant-scope.extension";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { TENANT_TABLES } from "../tenancy/tenant-models";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import type { World } from "../test/integration/access/access-cases";
import { createWorld as buildWorld } from "../test/integration/access/world";
import { TEST_ORIGIN } from "../test/integration/app-env";
import { RETAINED_TABLES } from "./academy-data.catalogue";
import { AcademyPurgeService } from "./academy-purge.service";

// Closing an academy end to end (docs/ACADEMY_CLOSURE.md), under enforce: the
// academy's super admin asks, an operator decides, the export holds the
// academy's rows and no secrets, the purge erases everything but the kept
// financial records (anonymising the people they name), and Nexa's data and
// another academy's data are untouched.

const ROOK = "tenant_int_rook";
const ROOK_NAME = "Rook Academy";
const ROOK_ORIGIN = "https://rook.int.test";
const PAWN = "tenant_int_pawn";
const PAWN_ORIGIN = "https://pawn.int.test";
const DAY_MS = 24 * 60 * 60_000;

describe("academy closure (real app, real Postgres, enforce)", () => {
  let t: TestApp;
  let operator: User;
  let rook: World;
  let pawn: World;
  let sends: string[];

  const countsFor = (tenantId: string) =>
    asPlatform("test: counts", async () => {
      const counts: Record<string, number> = {};
      for (const table of [...TENANT_TABLES].sort()) {
        const [{ count }] = await t.prisma.$queryRawUnsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM "${table}" WHERE "tenantId" = $1`,
          tenantId
        );
        if (count) counts[table] = count;
      }
      return counts;
    });

  const academy = async (id: string, name: string, host: string, prefix: string, month: string) => {
    await t.prisma.tenant.create({ data: { id, name, slug: id.replace(/_/g, "-") } });
    await t.prisma.tenantDomain.create({ data: { hostname: host, isPrimary: true, kind: "CUSTOM", status: "ACTIVE", tenantId: id } });
    await t.prisma.tenantSubscription.create({ data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: id } });
    return runInTenant(id, "test: world", () => buildWorld(t.prisma, { periodMonth: month, prefix }));
  };

  const as = (user: User, tenantId: string) => ({ ...user, tenantId });
  /** The messages go out in the background, after the response. */
  const sent = async (key: string) => {
    for (let tries = 0; tries < 50 && !sends.includes(key); tries += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sends).toContain(key);
  };
  const callRook = (user: User, method: string, path: string, body?: unknown) =>
    t.call(as(user, ROOK), method, path, body, { origin: ROOK_ORIGIN });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const nexa = await runInTenant(DEFAULT_TENANT_ID, "test: nexa world", () => buildWorld(t.prisma));
    operator = nexa.superAdmin;
    rook = await academy(ROOK, ROOK_NAME, "rook.int.test", "R", "2026-07");
    pawn = await academy(PAWN, "Pawn Academy", "pawn.int.test", "P", "2026-06");
    // An upload record, to show the purge removes it.
    await t.prisma.uploadedFile.create({ data: { bytes: 10, publicId: "rook/avatar", tenantId: ROOK } });
    t.app.get(EntitlementService).invalidate();
    t.app.get(TenantResolverService).invalidate();
    const notifier = t.app.get(SystemNotifier);
    sends = [];
    jest.spyOn(notifier, "send").mockImplementation(async (key) => {
      sends.push(key);
      return { errors: {}, outcomes: { EMAIL: "SENT", IN_APP: "SKIPPED", WHATSAPP: "SKIPPED" } };
    });
    setTenantScopeModeForTesting("enforce");
  }, 120_000);

  afterAll(async () => {
    setTenantScopeModeForTesting(null);
    await t?.close();
  });

  it("the academy's super admin asks; others can't", async () => {
    expect((await callRook(rook.superAdmin, "GET", API_ROUTES.academyClosure.current)).body).toEqual({ closure: null });
    const wrongName = await callRook(rook.superAdmin, "POST", API_ROUTES.academyClosure.current, {
      choice: "DELETE_DATA",
      confirmName: "Rook",
      reason: "Merging"
    });
    expect(wrongName.status).toBe(400);
    for (const user of [rook.admin, rook.a.coach, rook.a.student]) {
      const refused = await callRook(user, "POST", API_ROUTES.academyClosure.current, {
        choice: "DELETE_DATA",
        confirmName: ROOK_NAME,
        reason: "x"
      });
      expect(refused.status).toBe(403);
    }
    // Nexa can't be closed from its own admin page.
    const nexa = await t.call(operator, "POST", API_ROUTES.academyClosure.current, { choice: "KEEP_DATA", confirmName: "x", reason: "x" });
    expect(nexa.status).toBe(400);

    const asked = await callRook(rook.superAdmin, "POST", API_ROUTES.academyClosure.current, {
      choice: "KEEP_DATA",
      confirmName: "  rook academy ",
      reason: "Merging"
    });
    expect(asked.status).toBe(201);
    expect((asked.body as TenantClosureResponse).closure).toMatchObject({ choice: "KEEP_DATA", status: "REQUESTED", tenantId: ROOK });
    await sent("ACADEMY_CLOSURE_REQUESTED");
    const twice = await callRook(rook.superAdmin, "POST", API_ROUTES.academyClosure.current, {
      choice: "DELETE_DATA",
      confirmName: ROOK_NAME,
      reason: "again"
    });
    expect(twice.status).toBe(409);

    // Withdraw, then ask again for deletion.
    const withdrawn = await callRook(rook.superAdmin, "POST", API_ROUTES.academyClosure.withdraw);
    expect((withdrawn.body as TenantClosureResponse).closure.status).toBe("WITHDRAWN");
    const again = await callRook(rook.superAdmin, "POST", API_ROUTES.academyClosure.current, {
      choice: "DELETE_DATA",
      confirmName: ROOK_NAME,
      reason: "Merging"
    });
    expect(again.status).toBe(201);
  });

  it("the academy's super admin downloads its own data, without secrets", async () => {
    const lines = await download(t, as(rook.superAdmin, ROOK), API_ROUTES.academyClosure.export, ROOK_ORIGIN);
    const header = lines[0] as AcademyExportHeader;
    expect(header).toMatchObject({ format: "nexa-academy-export", tenant: { id: ROOK, name: ROOK_NAME }, version: 1 });
    expect(header.redactedColumns).toEqual(expect.arrayContaining(["password", "tokenHash"]));
    const rows = lines.slice(1) as AcademyExportLine[];
    expect(rows.every((line) => line.row.tenantId === ROOK)).toBe(true);
    const users = rows.filter((line) => line.table === "users");
    expect(users.length).toBeGreaterThan(5);
    expect(users.some((line) => "password" in line.row)).toBe(false);
    expect(rows.some((line) => line.table === "invoices")).toBe(true);
    // Another academy's admin can't.
    expect((await callRook(rook.admin, "GET", API_ROUTES.academyClosure.export)).status).toBe(403);
  });

  it("only platform operators decide; approving needs the name and deactivates the academy", async () => {
    const list = await t.call(operator, "GET", `${API_ROUTES.platform.closures}?status=REQUESTED`);
    const open = (list.body as { closures: TenantClosureResponse["closure"][] }).closures;
    expect(open).toHaveLength(1);
    const id = open[0].id;
    expect((await callRook(rook.superAdmin, "POST", API_ROUTES.platform.closureApprove(id), { confirmName: ROOK_NAME })).status).toBe(403);
    expect((await t.call(operator, "POST", API_ROUTES.platform.closureApprove(id), { confirmName: "Pawn Academy" })).status).toBe(400);

    const approved = await t.call(operator, "POST", API_ROUTES.platform.closureApprove(id), { confirmName: ROOK_NAME, note: "Bye" });
    expect(approved.status).toBe(200);
    const closure = (approved.body as TenantClosureResponse).closure;
    expect(closure.status).toBe("PURGE_SCHEDULED");
    const undo = new Date(closure.purgeAfter!).getTime() - Date.now();
    expect(undo).toBeGreaterThan(6.9 * DAY_MS);
    expect(undo).toBeLessThan(7.1 * DAY_MS);
    expect((await t.prisma.tenant.findUniqueOrThrow({ where: { id: ROOK } })).status).toBe("DEACTIVATED");
    expect(await runInTenant(ROOK, "test", () => t.prisma.authSession.count({ where: { revokedAt: null } }))).toBe(0);
    expect(await t.prisma.platformAuditLog.count({ where: { action: "tenant.close", targetTenantId: ROOK } })).toBe(1);
    await sent("ACADEMY_CLOSURE_DECIDED");
    // The academy's people can't get in any more.
    expect((await callRook(rook.a.student, "GET", API_ROUTES.auth.me)).status).toBeGreaterThanOrEqual(400);
    // Deciding twice loses.
    expect((await t.call(operator, "POST", API_ROUTES.platform.closureApprove(id), { confirmName: ROOK_NAME })).status).toBe(409);
  });

  it("an operator can cancel the deletion and reopen, then close it again on the academy's word", async () => {
    const [scheduled] = (
      (await t.call(operator, "GET", `${API_ROUTES.platform.closures}?tenantId=${ROOK}&status=PURGE_SCHEDULED`)).body as {
        closures: TenantClosureResponse["closure"][];
      }
    ).closures;
    expect((await t.call(operator, "POST", API_ROUTES.platform.closureCancelPurge(scheduled.id), { note: "" })).status).toBe(400);
    const cancelled = await t.call(operator, "POST", API_ROUTES.platform.closureCancelPurge(scheduled.id), { note: "They changed their mind" });
    expect((cancelled.body as TenantClosureResponse).closure).toMatchObject({ purgeAfter: null, status: "CANCELLED" });
    const reopened = await t.call(operator, "POST", API_ROUTES.platform.closureReopen(scheduled.id), { note: "Back" });
    expect((reopened.body as TenantClosureResponse).closure.status).toBe("REOPENED");
    expect((await t.prisma.tenant.findUniqueOrThrow({ where: { id: ROOK } })).status).toBe("ACTIVE");
    // Closing ended every session; after reopening people sign in again (here: the test's sessions).
    await runInTenant(ROOK, "test: sign in again", () => t.prisma.authSession.updateMany({ data: { revokedAt: null } }));
    const own = (await callRook(rook.superAdmin, "GET", API_ROUTES.academyClosure.current)).body as AcademyClosureResponse;
    expect(own.closure?.status).toBe("REOPENED");

    const closed = await t.call(operator, "POST", API_ROUTES.platform.tenantClose(ROOK), {
      choice: "DELETE_DATA",
      confirmName: ROOK_NAME,
      reason: "Email from the owner, 21 Nov"
    });
    expect(closed.status).toBe(201);
    expect((closed.body as TenantClosureResponse).closure).toMatchObject({ requestedByName: null, status: "PURGE_SCHEDULED" });
    expect((await t.call(operator, "POST", API_ROUTES.platform.tenantClose(DEFAULT_TENANT_ID), { choice: "KEEP_DATA", confirmName: "x", reason: "x" })).status).toBe(400);
  });

  it("the operator's export works after closing", async () => {
    const lines = await download(t, operator, API_ROUTES.platform.tenantExport(ROOK));
    expect((lines[0] as AcademyExportHeader).tenant.id).toBe(ROOK);
    expect(lines.length).toBeGreaterThan(20);
    expect((await t.call(rook.superAdmin, "GET", API_ROUTES.platform.tenantExport(ROOK))).status).toBeGreaterThanOrEqual(400);
  });

  it("the purge waits for the undo window, then erases all but the kept financial records", async () => {
    const purge = t.app.get(AcademyPurgeService);
    const nexaBefore = await countsFor(DEFAULT_TENANT_ID);
    const pawnBefore = await countsFor(PAWN);
    const rookBefore = await countsFor(ROOK);
    expect(await purge.purgeDue(new Date())).toBe(0);

    const scheduled = await t.prisma.tenantClosure.findFirstOrThrow({ where: { status: "PURGE_SCHEDULED", tenantId: ROOK } });
    // Straight through purgeClosure so a failure surfaces here (purgeDue logs and retries).
    expect(await purge.purgeClosure(scheduled.id, new Date(Date.now() + 8 * DAY_MS))).toBe(true);
    const [done] = (
      (await t.call(operator, "GET", `${API_ROUTES.platform.closures}?tenantId=${ROOK}&status=PURGED`)).body as {
        closures: TenantClosureResponse["closure"][];
      }
    ).closures;
    expect(done.purgeReport).toMatchObject({ deletedRows: expect.any(Number) });

    const rookAfter = await countsFor(ROOK);
    // Every kept financial record is still there…
    for (const table of RETAINED_TABLES) expect(rookAfter[table] ?? 0).toBe(rookBefore[table] ?? 0);
    expect(rookAfter.invoices).toBeGreaterThan(0);
    // …and almost nothing else: the bulk of the academy is gone.
    const total = (counts: Record<string, number>) => Object.values(counts).reduce((sum, n) => sum + n, 0);
    expect(total(rookAfter)).toBeLessThan(total(rookBefore) / 2);
    for (const table of ["batch_students", "chat_messages", "puzzle_attempts", "uploaded_files", "auth_sessions", "student_profiles"]) {
      expect(rookAfter[table] ?? 0).toBe(0);
    }
    // People a kept record names are anonymised; nobody can sign in.
    const users = await runInTenant(ROOK, "test", () => t.prisma.withDeleted.user.findMany());
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(user).toMatchObject({ firstName: "Deleted", phoneNumber: null, status: UserStatus.DELETED });
      expect(user.email).toMatch(/^deleted-.+@deleted\.invalid$/);
    }
    expect(await t.prisma.tenantDomain.count({ where: { status: "ACTIVE", tenantId: ROOK } })).toBe(0);
    // Nobody else lost anything.
    // (Settings rows an academy creates lazily, such as its messaging rules, may appear meanwhile.)
    const lost = (before: Record<string, number>, after: Record<string, number>) =>
      Object.entries(before).filter(([table, count]) => (after[table] ?? 0) < count);
    expect(lost(nexaBefore, await countsFor(DEFAULT_TENANT_ID))).toEqual([]);
    expect(lost(pawnBefore, await countsFor(PAWN))).toEqual([]);
    // Running again is a no-op.
    expect(await purge.purgeDue(new Date(Date.now() + 9 * DAY_MS))).toBe(0);
  });

  it("KEEP_DATA closes without touching the data, and can be reopened", async () => {
    const before = await countsFor(PAWN);
    const asked = await t.call(as(pawn.superAdmin, PAWN), "POST", API_ROUTES.academyClosure.current, {
      choice: "KEEP_DATA",
      confirmName: "Pawn Academy",
      reason: "Taking a break"
    }, { origin: PAWN_ORIGIN });
    const id = (asked.body as TenantClosureResponse).closure.id;
    const declined = await t.call(operator, "POST", API_ROUTES.platform.closureDecline(id), { note: "Talk to us first" });
    expect((declined.body as TenantClosureResponse).closure.status).toBe("DECLINED");
    expect((await t.prisma.tenant.findUniqueOrThrow({ where: { id: PAWN } })).status).toBe("ACTIVE");

    const again = await t.call(as(pawn.superAdmin, PAWN), "POST", API_ROUTES.academyClosure.current, {
      choice: "KEEP_DATA",
      confirmName: "Pawn Academy",
      reason: "Taking a break"
    }, { origin: PAWN_ORIGIN });
    const second = (again.body as TenantClosureResponse).closure.id;
    const approved = await t.call(operator, "POST", API_ROUTES.platform.closureApprove(second), { confirmName: "Pawn Academy" });
    expect((approved.body as TenantClosureResponse).closure).toMatchObject({ purgeAfter: null, status: "CLOSED" });
    expect((await t.prisma.tenant.findUniqueOrThrow({ where: { id: PAWN } })).status).toBe("DEACTIVATED");
    // Every row is still there (sessions were ended, not deleted).
    const after = await countsFor(PAWN);
    expect(Object.entries(before).filter(([table, count]) => (after[table] ?? 0) < count)).toEqual([]);
    // The purge never touches a closed-and-kept academy.
    expect(await t.app.get(AcademyPurgeService).purgeDue(new Date(Date.now() + 30 * DAY_MS))).toBe(0);
    // Reopen only the latest closure.
    expect((await t.call(operator, "POST", API_ROUTES.platform.closureReopen(id), { note: "old one" })).status).toBe(409);
    const reopened = await t.call(operator, "POST", API_ROUTES.platform.closureReopen(second), { note: "Back after the break" });
    expect((reopened.body as TenantClosureResponse).closure.status).toBe("REOPENED");
    expect((await t.prisma.tenant.findUniqueOrThrow({ where: { id: PAWN } })).status).toBe("ACTIVE");
  });

  it("a coach or student never reaches the console routes", async () => {
    const coach = { ...pawn.a.coach, tenantId: PAWN };
    expect((await t.call(coach, "GET", API_ROUTES.platform.closures, undefined, { origin: PAWN_ORIGIN })).status).toBe(403);
    expect((await t.call(null, "GET", API_ROUTES.platform.closures)).status).toBe(401);
  });
});

/** A gzip NDJSON download, unpacked into its lines. */
async function download(t: TestApp, user: Pick<User, "email" | "id" | "role"> & { tenantId?: string }, path: string, origin?: string) {
  const token = await t.tokenFor(user);
  const res = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${path}`, {
    headers: {
      Cookie: `nexa_access_token=${token}; nexa_h_access_token=${token}`,
      Origin: origin ?? TEST_ORIGIN
    }
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/gzip");
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}
