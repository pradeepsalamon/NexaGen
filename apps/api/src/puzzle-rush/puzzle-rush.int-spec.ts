import { API_ROUTES, PUZZLE_RUSH_RATING_BUCKETS, type PuzzleRushStateResponse } from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";

type World = Awaited<ReturnType<typeof createWorld>>;

const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 b - - 0 1";

/** Four catalogue puzzles in every band the Storm ladder reads, plus decoys it must skip. */
async function seedCatalogue(t: TestApp) {
  const rows: Prisma.LichessPuzzleCreateManyInput[] = [];
  let n = 0;
  const add = (rating: number, over: Partial<Prisma.LichessPuzzleCreateManyInput> = {}) => {
    n += 1;
    rows.push({
      contentHash: `h${n}`,
      fen: FEN,
      gameUrl: "https://lichess.org/x",
      id: `T${String(n).padStart(4, "0")}`,
      moves: "g7g6 a1a8",
      nbPlays: 500,
      passesQualityGate: true,
      popularity: 90,
      randKey: (n * 7919) % 2_000_000_000,
      rating,
      ratingBand: Math.floor(rating / 50),
      ratingDeviation: 75,
      releaseId: "int",
      themes: ["mateIn1"],
      ...over
    });
  };
  for (const [rating] of PUZZLE_RUSH_RATING_BUCKETS) {
    for (const offset of [-40, -10, 10, 40]) add(rating + offset);
    add(rating, { ratingDeviation: 200 }); // rating not settled — Lichess leaves it out
    add(rating, { passesQualityGate: false }); // below the ingestion gate
  }
  await t.prisma.lichessPuzzle.createMany({ data: rows });
}

describe("Puzzle Storm / Racer (real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    // The world opens a Storm round in each live class; start from none here.
    await t.prisma.liveClassPuzzleRush.deleteMany({});
    await seedCatalogue(t);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("draws a rising run from the catalogue, skipping unsettled and below-gate puzzles", async () => {
    const res = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.puzzleRush(w.a.liveClass.id), { mode: "STORM" });
    expect(res.status).toBe(201);
    const body = res.body as PuzzleRushStateResponse;
    const ratings = body.rush!.puzzles.map((p) => p.rating);
    expect(ratings.length).toBe(PUZZLE_RUSH_RATING_BUCKETS.length * 4);
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));

    const ids = body.rush!.puzzles.map((p) => p.id);
    const decoys = await t.prisma.lichessPuzzle.findMany({
      where: { OR: [{ ratingDeviation: { gt: 85 } }, { passesQualityGate: false }] },
      select: { id: true }
    });
    for (const { id } of decoys) expect(ids).not.toContain(id);
    expect(body.rush!.puzzles[0].moves).toEqual(["g7g6", "a1a8"]);
  });

  it("a new round ends the old one, and the index allows only one open round per class", async () => {
    const res = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.puzzleRush(w.a.liveClass.id), { mode: "RACER" });
    expect(res.status).toBe(201);
    expect(await t.prisma.liveClassPuzzleRush.count({ where: { liveClassId: w.a.liveClass.id, endedAt: null } })).toBe(1);

    await expect(
      t.prisma.liveClassPuzzleRush.create({
        data: { liveClassId: w.a.liveClass.id, mode: "STORM", puzzles: [], startsAt: new Date() }
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("hides a Racer run during the countdown and refuses moves before the start", async () => {
    const res = await t.call(w.a.student, "GET", API_ROUTES.liveClass.puzzleRush(w.a.liveClass.id));
    const rush = (res.body as PuzzleRushStateResponse).rush!;
    expect(rush.status).toBe("COUNTDOWN");
    expect(rush.puzzles).toEqual([]);

    const early = await t.call(w.a.student, "PUT", API_ROUTES.liveClass.puzzleRushProgress(w.a.liveClass.id), {
      bestCombo: 1,
      clockEndsAt: null,
      errors: 0,
      finished: false,
      highestRating: null,
      moves: 1,
      puzzleIndex: 1,
      rushId: rush.id,
      score: 1,
      skipsUsed: 0,
      solved: 1
    });
    expect(early.status).toBe(400);
  });

  it("clamps a Storm report end to end and ranks the class", async () => {
    const started = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.puzzleRush(w.a.liveClass.id), { mode: "STORM" });
    const rushId = (started.body as PuzzleRushStateResponse).rush!.id;

    const report = await t.call(w.a.student, "PUT", API_ROUTES.liveClass.puzzleRushProgress(w.a.liveClass.id), {
      bestCombo: 3,
      clockEndsAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      errors: 0,
      finished: false,
      highestRating: 4000,
      moves: 99,
      puzzleIndex: 3,
      rushId,
      score: 99,
      skipsUsed: 0,
      solved: 3
    });
    expect(report.status).toBe(200);
    const row = await t.prisma.liveClassPuzzleRushEntry.findFirstOrThrow({ where: { rushId } });
    expect(row).toMatchObject({ moves: 4, score: 3, solved: 3 });
    // 3:00 + the bonus 4 moves can earn (none) + grace.
    expect(row.clockEndsAt!.getTime()).toBeLessThanOrEqual(row.startedAt!.getTime() + 185_000);

    const state = await t.call(w.a.coach, "GET", API_ROUTES.liveClass.puzzleRush(w.a.liveClass.id));
    expect((state.body as PuzzleRushStateResponse).rush!.standings).toMatchObject([
      { rank: 1, score: 3, studentId: w.a.student.id }
    ]);
  });
});
