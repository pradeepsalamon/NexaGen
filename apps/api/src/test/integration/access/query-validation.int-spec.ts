import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

// A query string is untyped: `?status=a&status=b` arrives as an array and an
// unknown enum value only fails inside Prisma. Both used to reach a `where` (or
// raw SQL) and come back as a 500. Each list below now answers 400 instead —
// and still 200 for the same request without the bad value.

type Case = { path: string; key: string; good?: string };

const CASES: Case[] = [
  { key: "status", path: API_ROUTES.batches.list, good: "ACTIVE" },
  { key: "status", path: API_ROUTES.users.list, good: "ACTIVE" },
  { key: "status", path: API_ROUTES.adminLeads.list, good: "NEW" },
  { key: "status", path: API_ROUTES.courses.list },
  { key: "search", path: API_ROUTES.courses.list },
  { key: "status", path: API_ROUTES.admin.demoClasses, good: "SCHEDULED" },
  { key: "status", path: API_ROUTES.admin.batchClasses, good: "SCHEDULED" },
  { key: "formId", path: API_ROUTES.adminFeedback.responses },
  { key: "status", path: API_ROUTES.adminPayments.manual.list, good: "PENDING" },
  { key: "status", path: API_ROUTES.attendance.adminExport, good: "PRESENT" },
  { key: "batchId", path: API_ROUTES.analytics.classes },
  { key: "coachId", path: API_ROUTES.analytics.classes },
  { key: "role", path: API_ROUTES.analytics.usersTable, good: "STUDENT" },
  { key: "status", path: API_ROUTES.analytics.usersTable, good: "ACTIVE" },
  { key: "status", path: API_ROUTES.analytics.classesTable, good: "COMPLETED" },
  { key: "batchId", path: API_ROUTES.analytics.recordingsTable }
];

const ENUM_KEYS = new Set(["status", "role"]);

describe("Malformed query strings are a 400, never a 500", () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof createUser>>;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const user = await createUser(t.prisma, UserRole.SUPER_ADMIN);
    admin = await t.prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it.each(CASES)("$path rejects a repeated `$key`", async ({ path, key }) => {
    const res = await t.call(admin, "GET", `${path}?${key}=a&${key}=b`);
    expect({ path, key, status: res.status }).toEqual({ path, key, status: 400 });
  });

  it.each(CASES.filter((c) => ENUM_KEYS.has(c.key)))("$path rejects an unknown `$key`", async ({ path, key }) => {
    const res = await t.call(admin, "GET", `${path}?${key}=__bogus__`);
    expect({ path, key, status: res.status }).toEqual({ path, key, status: 400 });
  });

  it.each(CASES.filter((c) => c.good))("$path still accepts `$key=$good`", async ({ path, key, good }) => {
    const res = await t.call(admin, "GET", `${path}?${key}=${good}`);
    expect({ path, key, status: res.status }).toEqual({ path, key, status: 200 });
  });

  it("\"ALL\" still means no filter", async () => {
    expect((await t.call(admin, "GET", `${API_ROUTES.batches.list}?status=ALL`)).status).toBe(200);
  });

  it("an unknown payslip is a 404", async () => {
    expect((await t.call(admin, "GET", API_ROUTES.adminPayroll.payslipPdf("no-such-payslip"))).status).toBe(404);
  });

  it("still asks an anonymous caller to sign in first", async () => {
    expect((await t.call(null, "GET", `${API_ROUTES.analytics.classes}?batchId=a&batchId=b`)).status).toBe(401);
  });
});
