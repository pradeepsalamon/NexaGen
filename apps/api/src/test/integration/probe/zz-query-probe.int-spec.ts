import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { createUser as rawCreateUser, resetDatabase } from "../db";
import type { PrismaService } from "../../../prisma/prisma.service";
const createUser = async (prisma: PrismaService, role: UserRole) => {
  const u = await rawCreateUser(prisma, role);
  return prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: u.id } });
};

type RouteLayer = { route?: { path: string; methods: Record<string, boolean> } };

const KEYS = [
  "status", "difficulty", "visibility", "type", "role", "page", "limit", "pageSize", "sort", "sortBy", "order",
  "from", "to", "dateFrom", "dateTo", "range", "batchId", "coachId", "studentId", "topicId", "topicScope", "q",
  "search", "placement", "classId", "periodId", "provider", "method", "source", "activityType", "entityType",
  "channel", "event", "days", "cursor", "tz", "fresh", "level", "context", "kind", "dueStatus", "planId", "theme",
  "tags", "rating", "ratingMin", "ratingMax", "interval", "includeArchived", "archived", "formId", "trigger"
];

// Diagnostic sweep (~100k requests, logs 500s, asserts nothing). Opt-in:
// RUN_QUERY_PROBE=1 npm run test:integration -- zz-query-probe
const describeProbe = process.env.RUN_QUERY_PROBE === "1" ? describe : describe.skip;

describeProbe("query probe", () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => t?.close());

  it.skip("sanity", async () => {
    const admin = await createUser(t.prisma, UserRole.SUPER_ADMIN);
    for (const q of ["", "?status=A&status=B", "?status=BOGUS", "?difficulty=x", "?page=-1"]) {
      const r = await t.call(admin, "GET", "/puzzles" + q);
      // eslint-disable-next-line no-console
      console.log("SANITY", q, r.status, JSON.stringify(r.body).slice(0, 200));
    }
  });

  it("lists 500s", async () => {
    const stack = (t.app.getHttpAdapter().getInstance() as { router: { stack: RouteLayer[] } }).router.stack;
    const routes = stack.filter((l) => l.route?.methods.get).map((l) => l.route!.path);
    const users = {
      admin: await createUser(t.prisma, UserRole.SUPER_ADMIN),
      coach: await createUser(t.prisma, UserRole.COACH),
      student: await createUser(t.prisma, UserRole.STUDENT)
    };
    await t.prisma.coachProfile.create({ data: { approvalStatus: "ACTIVE", userId: users.coach.id } as never }).catch(() => undefined);
    await t.prisma.studentProfile.create({ data: { parentName: "P", userId: users.student.id } }).catch(() => undefined);
    const variants: [string, string][] = [
      ["dup", KEYS.map((k) => `${k}=a&${k}=b`).join("&")],
      ["bogus", KEYS.map((k) => `${k}=__bogus__`).join("&")],
      ["neg", KEYS.map((k) => `${k}=-1`).join("&")]
    ];
    const found: string[] = [];
    for (const path of routes) {
      if (/webhook|stream|recorder/.test(path)) continue;
      const p = path.replace(/:(\w+)/g, "probe-id");
      for (const [role, user] of Object.entries(users)) {
        const base = await t.call(user, "GET", p);
        for (const [name, qs] of variants) {
          // one key at a time, so each finding names its key
          for (const pair of qs.split("&").reduce<string[][]>((acc, kv, i) => {
            if (name === "dup") { if (i % 2 === 0) acc.push([kv]); else acc[acc.length - 1].push(kv); } else acc.push([kv]);
            return acc;
          }, [])) {
            const res = await t.call(user, "GET", `${p}?${pair.join("&")}`);
            if (res.status >= 500) found.push(`${res.status} [base ${base.status}] ${role} GET ${path} ?${pair.join("&")}`);
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`PROBE ${routes.length} routes\n` + found.join("\n"));
  }, 1_800_000);
});
