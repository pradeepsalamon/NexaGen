import type { JwtService } from "@nestjs/jwt";
import { LICHESS_FOLDER_SLUG } from "@nexa-chess/types";
import { PuzzleSource, UserRole, UserStatus } from "@prisma/client";
import { AssignmentEvaluationService } from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import type { StockfishService } from "../stockfish/stockfish.service";
import { createUser, resetDatabase } from "../test/integration/db";
import { TrashRepository } from "../trash/trash.repository";
import { PuzzleCatalogService } from "./puzzle-catalog.service";

// Rxe4 sets it up, then Qb1+ Kf2 Qxe4 (a real 2026-10-02 catalogue row).
const BASE = {
  fen: "8/p4p1p/1p3R2/6pk/3Bb3/1qP3P1/8/4R1K1 w - - 2 38",
  moves: "e1e4 b3b1 g1f2 b1e4",
  ratingDeviation: 75,
  popularity: 90,
  nbPlays: 800,
  themes: ["endgame", "fork"],
  gameUrl: "https://lichess.org/abc#76",
  contentHash: "0000000000000000",
  releaseId: "int"
};

describe("Lichess catalogue (real Postgres)", () => {
  const prisma = new PrismaService();
  const evaluation = new AssignmentEvaluationService({ isAvailable: () => false } as unknown as StockfishService);
  let userId = "";
  const jwt = { verifyAsync: async () => ({ sub: userId, type: "access" }) } as unknown as JwtService;
  const service = new PuzzleCatalogService(jwt, prisma, new TrashRepository(prisma), evaluation);

  beforeEach(async () => {
    await resetDatabase(prisma);
    userId = (await createUser(prisma, UserRole.ADMIN)).id;
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE } });
  });
  afterAll(() => prisma.$disconnect());

  const seed = (rows: { id: string; rating: number; randKey: number; passesQualityGate?: boolean; themes?: string[] }[]) =>
    prisma.lichessPuzzle.createMany({
      data: rows.map((row) => ({
        ...BASE,
        ...row,
        ratingBand: Math.floor(row.rating / 50),
        passesQualityGate: row.passesQualityGate ?? true
      }))
    });

  it("concurrent materialisations of one Lichess id make one row and one system folder", async () => {
    await seed([{ id: "KsvGQ", rating: 1444, randKey: 1 }]);

    const ids = await Promise.all(
      Array.from({ length: 6 }, () => service.materialiseOne("t", { sourceId: "KsvGQ" }))
    );

    expect(new Set(ids.map((r) => r.puzzleId)).size).toBe(1);
    expect(await prisma.puzzle.count({ where: { source: PuzzleSource.LICHESS, sourceId: "KsvGQ" } })).toBe(1);
    expect(await prisma.puzzleTopic.count({ where: { slug: LICHESS_FOLDER_SLUG } })).toBe(1);
  });

  it("pages the walk-index order over real SQL, each row once, inside the rating window", async () => {
    await seed([
      { id: "AAAA1", rating: 1210, randKey: 50 },
      { id: "AAAA2", rating: 1220, randKey: 50 }, // same randKey: the id breaks the tie
      { id: "AAAA3", rating: 1230, randKey: 10 },
      { id: "AAAA4", rating: 1260, randKey: 5 },
      { id: "AAAA5", rating: 1290, randKey: 7, passesQualityGate: false },
      { id: "AAAA6", rating: 1310, randKey: 1 }, // outside the window
      { id: "AAAA7", rating: 1199, randKey: 99 } // band 23, outside the window
    ]);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const res = await service.list("t", { ratingMin: 1200, ratingMax: 1300, pageSize: 2, cursor });
      expect(res.timedOut).toBe(false);
      seen.push(...res.puzzles.map((p) => p.sourceId));
      if (!res.hasMore) break;
      cursor = res.nextCursor ?? undefined;
    }

    // band 24 by (randKey, id), then band 25; the below-gate row is skipped.
    expect(seen).toEqual(["AAAA3", "AAAA1", "AAAA2", "AAAA4"]);

    const withBelowGate = await service.list("t", { ratingMin: 1200, ratingMax: 1300, includeBelowGate: true });
    expect(withBelowGate.puzzles.map((p) => p.sourceId)).toContain("AAAA5");

    const fork = await service.list("t", { themes: ["fork", "pin"], themeMode: "all" });
    expect(fork.puzzles).toEqual([]);
  });

  it("adopting moves a materialised copy out of the system folder, and browse reports it", async () => {
    await seed([{ id: "KsvGQ", rating: 1444, randKey: 1 }]);
    const { puzzleId } = await service.materialiseOne("t", { sourceId: "KsvGQ" });
    const folder = await prisma.puzzleTopic.create({ data: { name: "Forks", slug: "forks" } });

    const before = await service.list("t", {});
    expect(before.puzzles[0].inLibrary).toEqual({ puzzleId, topicName: "Lichess", adopted: false });

    const res = await service.adopt("t", { sourceIds: ["KsvGQ"], topicId: folder.id });
    expect(res.results[0]).toMatchObject({ outcome: "MOVED", puzzleId });

    const after = await service.list("t", {});
    expect(after.puzzles[0].inLibrary).toEqual({ puzzleId, topicName: "Forks", adopted: true });
  });
});
