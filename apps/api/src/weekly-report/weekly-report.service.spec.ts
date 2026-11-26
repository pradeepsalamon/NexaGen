import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { runInTenant } from "../tenancy/tenant-context";
import { WeeklyReportJob } from "./weekly-report.job";
import { WeeklyReportService } from "./weekly-report.service";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));
const authenticate = authenticateUser as jest.MockedFunction<typeof authenticateUser>;

const NOW = new Date("2026-11-23T03:00:00.000Z"); // Monday 08:30 in Kolkata

function setup(coachShares = true) {
  const empty = { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) };
  const prisma = {
    aiPlayReview: { findMany: jest.fn(async () => []) },
    batchStudent: { findFirst: jest.fn(async () => (coachShares ? { id: "bs1" } : null)) },
    coachClass: {
      findMany: jest.fn(async () => [
        {
          attendances: [{ status: "PRESENT" }],
          classRecap: { contentJson: { keyPoints: ["Forks hit two pieces."], practice: [], recap: "x" }, status: "PUBLISHED" },
          endsAt: new Date("2026-11-18T12:00:00Z"),
          startsAt: new Date("2026-11-18T11:00:00Z"),
          status: "COMPLETED",
          title: "Tuesday class",
          topic: "Forks"
        }
      ])
    },
    dailyPuzzleEntry: { findMany: jest.fn(async () => [{ day: new Date("2026-11-21T00:00:00Z") }]) },
    puzzleAttempt: empty,
    soloPuzzleRushRun: { findMany: jest.fn(async () => []) },
    studentAssignment: { findMany: jest.fn(async () => []) },
    tenant: { findUnique: jest.fn(async () => ({ timezone: "Asia/Kolkata" })) },
    user: {
      findFirst: jest.fn(async () => ({ id: "s1" })),
      findMany: jest.fn(async () => [{ id: "s1" }, { id: "s2" }]),
      findUnique: jest.fn(async () => ({ firstName: "Asha" }))
    },
    weakSpotTipReview: { findMany: jest.fn(async () => []) },
    weeklyReport: {
      create: jest.fn(async () => ({})),
      findFirst: jest.fn(async (): Promise<{ id: string } | null> => null),
      findMany: jest.fn(async () => [])
    }
  };
  const service = new WeeklyReportService({} as never, prisma as never);
  const inAcademy = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  return { inAcademy, prisma, service };
}

describe("WeeklyReportService", () => {
  afterEach(() => authenticate.mockReset());

  it("freezes a finished week once, from the student's own classes and published recaps", async () => {
    const { inAcademy, prisma, service } = setup();
    expect(await inAcademy(() => service.buildWeek("s1", "2026-11-16", "Asia/Kolkata", NOW))).toBe(true);
    const { data } = (prisma.weeklyReport.create.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ studentId: "s1", tenantId: "tenant_nexa", weekStart: new Date("2026-11-16T00:00:00Z") });
    expect(data.finalText).toBe(data.templateText);
    expect(data.templateText).toMatch(/^Asha's week, 16–22 Nov\nClasses: attended 1 of 1 class\.\nCovered: Forks\.\nFrom the class recaps: Forks hit two pieces\./);
    // The week in the academy's zone: Monday 00:00 IST is Sunday 18:30 UTC.
    expect(prisma.coachClass.findMany.mock.calls[0]).toMatchObject([
      { where: { isDemo: false, startsAt: { gte: new Date("2026-11-15T18:30:00Z"), lt: new Date("2026-11-22T18:30:00Z") } } }
    ]);

    prisma.weeklyReport.findFirst.mockResolvedValueOnce({ id: "r1" });
    expect(await inAcademy(() => service.buildWeek("s1", "2026-11-16", "Asia/Kolkata", NOW))).toBe(false);
    prisma.weeklyReport.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" }));
    expect(await inAcademy(() => service.buildWeek("s1", "2026-11-16", "Asia/Kolkata", NOW))).toBe(false);
  });

  it("lets a student read only their own list, and staff only a student they may see", async () => {
    const { inAcademy, prisma, service } = setup(false);
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    await inAcademy(() => service.listMine("t", {}));
    expect(prisma.weeklyReport.findMany.mock.calls[0]).toMatchObject([{ take: 9, where: { AND: [{ studentId: "s1" }, {}] } }]);
    await expect(inAcademy(() => service.listFor("t", "s1", {}))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(inAcademy(() => service.preview("t", "s1"))).rejects.toBeInstanceOf(ForbiddenException);

    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    await expect(inAcademy(() => service.listMine("t", {}))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(inAcademy(() => service.listFor("t", "s2", {}))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(inAcademy(() => service.preview("t", "s2"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("previews this week so far for the student's coach, without storing it", async () => {
    const { inAcademy, prisma, service } = setup();
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const preview = await inAcademy(() => service.preview("t", "s1", new Date("2026-11-26T10:00:00Z")));
    expect(preview).toMatchObject({ weekEnd: "2026-11-29", weekStart: "2026-11-23" });
    expect(prisma.weeklyReport.create).not.toHaveBeenCalled();
  });

  it("job: builds the last finished week for every student still without one", async () => {
    const { inAcademy, prisma, service } = setup();
    const job = new WeeklyReportJob({} as never, service);
    const built = await inAcademy(() => job.runForAcademy(new AbortController().signal, NOW));
    expect(built).toBe(2);
    expect(prisma.user.findMany.mock.calls[0]).toMatchObject([
      { where: { role: "STUDENT", status: "ACTIVE", weeklyReports: { none: { weekStart: new Date("2026-11-16T00:00:00Z") } } } }
    ]);
  });

  it("job: one student's failure doesn't stop the rest", async () => {
    const { inAcademy, prisma, service } = setup();
    prisma.weeklyReport.create.mockRejectedValueOnce(new Error("boom"));
    const job = new WeeklyReportJob({} as never, service);
    expect(await inAcademy(() => job.runForAcademy(new AbortController().signal, NOW))).toBe(1);
  });
});
