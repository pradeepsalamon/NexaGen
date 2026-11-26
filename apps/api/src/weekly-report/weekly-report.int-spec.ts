import { API_ROUTES, DEFAULT_TENANT_ID, type WeeklyFacts, type WeeklyReportListResponse } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";
import { WeeklyReportJob } from "./weekly-report.job";

// The weekly facts read many features' own rows with date filters on the
// academy's calendar (a Monday 00:00 IST is Sunday 18:30 UTC; Puzzle of the
// Day days are a DATE column), so the honest test is real rows in Postgres.

const WEEK = "2026-11-16";
// Monday 2026-11-23, 08:30 in Kolkata: last week is due.
const NOW = new Date("2026-11-23T03:00:00.000Z");

describe("Weekly reports (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    const p = t.prisma;
    const { a } = w;
    await p.tenant.update({ data: { timezone: "Asia/Kolkata" }, where: { id: DEFAULT_TENANT_ID } });

    const klass = (startsAt: string, topic: string) =>
      p.coachClass.create({
        data: {
          batchId: a.batch.id,
          coachId: a.coach.id,
          endsAt: new Date(new Date(startsAt).getTime() + 3_600_000),
          startsAt: new Date(startsAt),
          status: "COMPLETED",
          topic
        }
      });
    // Monday 00:30 IST (Sunday 19:00 UTC): in the week.
    const early = await klass("2026-11-15T19:00:00.000Z", "Forks");
    await p.classAttendance.create({ data: { classId: early.id, status: "PRESENT", studentId: a.student.id } });
    await p.classRecap.create({
      data: {
        classId: early.id,
        contentJson: { keyPoints: ["A fork hits two pieces."], practice: [], recap: "Forks." },
        status: "PUBLISHED"
      }
    });
    // Wednesday, missed (no attendance row).
    await klass("2026-11-18T11:00:00.000Z", "Pins");
    // Monday 05:30 IST of the next week: not this week.
    await klass("2026-11-23T00:00:00.000Z", "Skewers");

    const assignment = await p.assignment.create({ data: { createdById: a.coach.id, pgn: "*", title: "Fork homework" } });
    const deployment = await p.assignmentBatch.create({
      data: { assignmentId: assignment.id, batchId: a.batch.id, dueDate: new Date("2026-11-20T18:29:00.000Z") }
    });
    await p.studentAssignment.create({
      data: { assignmentBatchId: deployment.id, completedAt: new Date("2026-11-19T10:00:00.000Z"), status: "COMPLETED", studentId: a.student.id }
    });

    // Puzzle of the Day on Sat + Sun (and the next Monday, outside the week).
    for (const [n, day] of ["2026-11-21", "2026-11-22", "2026-11-23"].entries()) {
      const attempt = await p.puzzleAttempt.create({
        data: {
          attemptNumber: 10 + n,
          completedAt: new Date(`${day}T06:00:00.000Z`),
          context: "DAILY",
          puzzleId: a.privatePuzzle.id,
          status: "SOLVED",
          studentId: a.student.id
        }
      });
      await p.dailyPuzzleEntry.create({
        data: {
          attemptId: attempt.id,
          day: new Date(`${day}T00:00:00.000Z`),
          finishedAt: attempt.completedAt,
          level: "EASY",
          puzzleId: a.privatePuzzle.id,
          solved: true,
          studentId: a.student.id
        }
      });
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  it("builds last week once per student, from that week only, on the academy's calendar", async () => {
    const job = t.app.get(WeeklyReportJob);
    const built = await runInTenant(DEFAULT_TENANT_ID, "spec", () => job.runForAcademy(new AbortController().signal, NOW));
    expect(built).toBeGreaterThanOrEqual(2); // A's and B's students (B's week is quiet)
    const again = await runInTenant(DEFAULT_TENANT_ID, "spec", () => job.runForAcademy(new AbortController().signal, NOW));
    expect(again).toBe(0);

    const row = await t.prisma.weeklyReport.findFirstOrThrow({ where: { studentId: w.a.student.id } });
    expect(row.weekStart.toISOString().slice(0, 10)).toBe(WEEK);
    const facts = row.factsJson as unknown as WeeklyFacts;
    expect(facts.classes).toMatchObject({ attended: 1, held: 2, topics: ["Forks", "Pins"] });
    expect(facts.classes.missed).toEqual([{ startsAt: "2026-11-18T11:00:00.000Z", title: "Pins" }]);
    expect(facts.recapPoints).toEqual(["A fork hits two pieces."]);
    expect(facts.homework).toMatchObject({ done: 1, due: 1, late: 0 });
    expect(facts.practice).toMatchObject({ dailyPuzzleDays: 2, dailyPuzzleStreak: 2, puzzlesSolved: 2, puzzlesTried: 2 });
    expect(row.finalText).toContain("Classes: attended 1 of 2 classes.");
  });

  it("shows the student their own reports and staff the student's, never another's", async () => {
    const mine = (await t.call(w.a.student, "GET", API_ROUTES.weeklyReports.mine)).body as WeeklyReportListResponse;
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]).toMatchObject({ status: "DRAFT", weekEnd: "2026-11-22", weekStart: WEEK });

    const coach = (await t.call(w.a.coach, "GET", API_ROUTES.weeklyReports.forStudent(w.a.student.id))).body as WeeklyReportListResponse;
    expect(coach.items.map((r) => r.id)).toEqual(mine.items.map((r) => r.id));
    expect((await t.call(w.b.coach, "GET", API_ROUTES.weeklyReports.forStudent(w.a.student.id))).status).toBe(403);

    const preview = await t.call(w.a.coach, "GET", API_ROUTES.weeklyReports.preview(w.a.student.id));
    expect(preview.status).toBe(200);
    expect(await t.prisma.weeklyReport.count({ where: { studentId: w.a.student.id } })).toBe(1);
  });
});
