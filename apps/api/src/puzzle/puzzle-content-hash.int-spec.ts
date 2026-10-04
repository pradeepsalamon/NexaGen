import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PuzzleDifficulty, PuzzleType, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { resetDatabase } from "../test/integration/db";
import { puzzleContentHash } from "./puzzle-content-hash";

// The contentHash backfill is SQL inside a migration; new rows hash in
// TypeScript. Re-run the migration's own statement over fixtures and require
// both sides to agree, so a drift fails CI rather than splitting the seen-set.
const MIGRATION = join(__dirname, "../../prisma/migrations/20261004100000_puzzle_catalogue/migration.sql");
const backfillSql = () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf('UPDATE "puzzles" p');
  return sql.slice(start, sql.indexOf(";", start) + 1);
};

const FIXTURES: Array<{ fen: string; solution: { uci: string; san: string }[] }> = [
  { fen: "7k/6pp/8/8/8/8/1R6/R5K1 w - - 0 1", solution: [{ uci: "a1a8", san: "Ra8#" }] },
  // Same content, different move counters: must hash the same.
  { fen: "7k/6pp/8/8/8/8/1R6/R5K1 w - - 12 40", solution: [{ uci: "a1a8", san: "Ra8#" }] },
  {
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",
    solution: [
      { uci: "g1f3", san: "Nf3" },
      { uci: "b8c6", san: "Nc6" }
    ]
  },
  { fen: "8/P6k/8/8/8/8/8/K7 w - - 0 1", solution: [{ uci: "A7A8Q", san: "a8=Q" }] },
  { fen: "8/8/8/8/8/8/k7/K7 w - - 0 1", solution: [] }
];

describe("puzzle contentHash (real Postgres)", () => {
  const prisma = new PrismaService();

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it("the migration's SQL backfill matches puzzleContentHash", async () => {
    const topic = await prisma.puzzleTopic.create({ data: { name: "Int topic", slug: "int-topic" } });
    const rows = [];
    for (const [i, fx] of FIXTURES.entries()) {
      rows.push(
        await prisma.puzzle.create({
          data: {
            title: `Fixture ${i}`,
            topicId: topic.id,
            puzzleType: PuzzleType.TACTICAL,
            difficulty: PuzzleDifficulty.BEGINNER,
            fen: fx.fen,
            solutionMovesJson: fx.solution,
            createdByRole: UserRole.ADMIN
          }
        })
      );
    }

    await prisma.$executeRawUnsafe(backfillSql());

    for (const [i, fx] of FIXTURES.entries()) {
      const row = await prisma.puzzle.findUniqueOrThrow({ where: { id: rows[i].id } });
      expect(row.contentHash).toBe(puzzleContentHash(fx.fen, fx.solution));
    }
    const [a, b] = await prisma.puzzle.findMany({ where: { id: { in: [rows[0].id, rows[1].id] } } });
    expect(a.contentHash).toBe(b.contentHash);
  });
});
