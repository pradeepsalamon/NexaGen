import { API_ROUTES, DEFAULT_TENANT_ID, type SoloRushBatchBattlesLeaderboard } from "@nexa-chess/types";
import { BatchStatus, UserRole, UserStatus, type User } from "@prisma/client";
import { EntitlementService } from "../platform/entitlement.service";
import { runInTenant } from "../tenancy/tenant-context";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Batch Battles' raw query on real Postgres (docs/PUZZLE_RUSH_SOLO.md
// § "Batch Battles"): which batches compete, each student's best finished run,
// the average, hidden names, and the academy guard.
const OTHER = "tenant_int_battles";
const DAY = 24 * 60 * 60 * 1000;

describe("Batch Battles (real Postgres)", () => {
  let t: TestApp;
  let viewer: User;
  let coach: User;
  let ids: Record<string, string>;

  async function student(firstName: string, lastName: string | null = null) {
    const user = await createUser(t.prisma, UserRole.STUDENT);
    return t.prisma.user.update({ data: { firstName, lastName, status: UserStatus.ACTIVE }, where: { id: user.id } });
  }
  async function batch(name: string, students: User[], data: Record<string, unknown> = {}) {
    const row = await t.prisma.batch.create({ data: { name, ...data } });
    for (const s of students) await t.prisma.batchStudent.create({ data: { batchId: row.id, studentId: s.id } });
    return row.id;
  }
  async function run(s: User, score: number, over: { daysAgo?: number; finished?: boolean; mode?: "STORM" | "RACER" } = {}) {
    const at = new Date(Date.now() - (over.daysAgo ?? 1) * DAY);
    await t.prisma.soloPuzzleRushRun.create({
      data: {
        finishedAt: over.finished === false ? null : at,
        mode: over.mode ?? "STORM",
        puzzles: [],
        score,
        startsAt: at,
        studentId: s.id
      }
    });
  }
  const board = async (period: "WEEK" | "ALL" = "WEEK") => {
    const res = await t.call(viewer, "GET", `${API_ROUTES.puzzleRushSolo.battles}?mode=STORM&period=${period}`);
    expect(res.status).toBe(200);
    return res.body as SoloRushBatchBattlesLeaderboard;
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);

    viewer = await student("Viewer", "Self");
    coach = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.COACH)).id }
    });
    const [a1, a2, a3] = [await student("Asha", "Rao"), await student("Ben", "Das"), await student("Chitra")];
    const [b1, b2, b3, b4] = [await student("Dev"), await student("Esha"), await student("Farid"), await student("Gita")];
    const [s1, s2] = [await student("Hari"), await student("Isha")];
    const gone = await student("Gone");

    ids = {
      // Viewer's group batch: 15 + 9 + 6 (best runs only) → 10.0 over 3 players.
      alpha: await batch("Alpha", [viewer, a1, a2, a3, gone]),
      // 12 + 12 + 12 + 12 → 12.0 over 4 players; names shown.
      bravo: await batch("Bravo", [b1, b2, b3, b4], { battlesShowNames: true }),
      // Only 2 players: listed, not ranked.
      small: await batch("Small", [s1, s2, await student("Idle")]),
      // A 1:1 batch: left out unless turned on.
      solo: await batch("Solo", [viewer]),
      completed: await batch("Done", [b1, b2, b3], { status: BatchStatus.COMPLETED }),
      noTraining: await batch("No training", [b1, b2, b3], { puzzleTrainingEnabled: false })
    };
    await t.prisma.batchCoach.create({ data: { batchId: ids.solo, coachId: coach.id } });

    await run(a1, 15);
    await run(a1, 11); // not their best
    await run(a2, 9);
    await run(a2, 40, { finished: false }); // unfinished: never counts
    await run(a3, 6);
    await run(viewer, 30, { daysAgo: 20 }); // outside this week
    await run(viewer, 50, { mode: "RACER" }); // another mode
    for (const s of [b1, b2, b3, b4]) await run(s, 12);
    await run(s1, 20);
    await run(s2, 10);
    await run(gone, 99);
    await t.prisma.user.update({ data: { isDeleted: true }, where: { id: gone.id } });

    // Another academy's group batch with far higher scores.
    await t.prisma.tenant.create({ data: { id: OTHER, name: "Other Academy", slug: "int-battles" } });
    await t.prisma.tenantSubscription.create({ data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: OTHER } });
    await runInTenant(OTHER, "test:battles-other", async () => {
      const others = [await student("Xavi"), await student("Yara"), await student("Zoe")];
      ids.other = await batch("Other academy", others);
      for (const s of others) await run(s, 90);
    });
    t.app.get(EntitlementService).invalidate();
    t.app.get(TenantResolverService).invalidate();
  });
  afterAll(async () => {
    await t?.close();
  });

  it("ranks the academy's competing batches by their players' average best run", async () => {
    const res = await board();
    expect(res.rows.map((r) => [r.batchName, r.rank, r.players, r.avgScore])).toEqual([
      ["Bravo", 1, 4, 12],
      ["Alpha", 2, 3, 10],
      ["Small", null, 2, 15]
    ]);
    expect(res).toMatchObject({ minPlayers: 3, myBest: null });
  });

  it("names a top player only in the viewer's own batch or a batch that shows names", async () => {
    const rows = Object.fromEntries((await board()).rows.map((r) => [r.batchName, r.topPlayerName]));
    expect(rows).toEqual({ Alpha: "Asha R.", Bravo: "Dev", Small: null });
  });

  it("reports the viewer's batches, including one that isn't in Batch Battles", async () => {
    expect((await board()).myBatches).toEqual([
      { avgScore: 10, batchId: ids.alpha, batchName: "Alpha", players: 3, rank: 2, takesPart: true },
      { avgScore: null, batchId: ids.solo, batchName: "Solo", players: 0, rank: null, takesPart: false }
    ]);
  });

  it("all time counts the older run", async () => {
    const res = await board("ALL");
    expect(res.myBest).toBe(30);
    expect(res.rows.find((r) => r.batchId === ids.alpha)).toMatchObject({ avgScore: 15, players: 4, rank: 1 });
  });

  it("the batch's coach can bring a 1:1 batch in", async () => {
    const res = await t.call(coach, "PATCH", API_ROUTES.puzzleRushSolo.battleSettings(ids.solo), { battlesEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ batchId: ids.solo, battlesEnabled: true, battlesShowNames: false, takesPart: true });
    const all = await board("ALL");
    expect(all.rows.find((r) => r.batchId === ids.solo)).toMatchObject({ players: 1, rank: null });
    expect(all.myBatches.find((b) => b.batchId === ids.solo)).toMatchObject({ takesPart: true });
  });

  it("never shows another academy's batch, nor a finished or training-off one", async () => {
    const shown = (await board("ALL")).rows.map((r) => r.batchId);
    for (const id of [ids.other, ids.completed, ids.noTraining]) expect(shown).not.toContain(id);
    expect(DEFAULT_TENANT_ID).not.toBe(OTHER);
  });
});
