import { PuzzleDifficulty, PuzzleType, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { resetDatabase } from "../test/integration/db";

describe("puzzle title order (real Postgres)", () => {
  const prisma = new PrismaService();

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  it("orders and pages titles naturally, and keeps case-insensitive search", async () => {
    const topic = await prisma.puzzleTopic.create({ data: { name: "Int topic", slug: "int-topic" } });
    for (const title of ["Puzzle 10", "Puzzle 2", "puzzle 3", "Puzzle 1", "Apple"]) {
      await prisma.puzzle.create({
        data: {
          title,
          topicId: topic.id,
          puzzleType: PuzzleType.TACTICAL,
          difficulty: PuzzleDifficulty.BEGINNER,
          fen: "7k/6pp/8/8/8/8/1R6/R5K1 w - - 0 1",
          createdByRole: UserRole.ADMIN
        }
      });
    }

    const titles = async (args: { skip?: number; take?: number; desc?: boolean } = {}) =>
      (
        await prisma.puzzle.findMany({
          orderBy: [{ title: args.desc ? "desc" : "asc" }, { id: "asc" }],
          select: { title: true },
          skip: args.skip,
          take: args.take
        })
      ).map((p) => p.title);

    expect(await titles()).toEqual(["Apple", "Puzzle 1", "Puzzle 2", "puzzle 3", "Puzzle 10"]);
    expect(await titles({ skip: 2, take: 2 })).toEqual(["Puzzle 2", "puzzle 3"]);
    expect(await titles({ desc: true, take: 2 })).toEqual(["Puzzle 10", "puzzle 3"]);

    const found = await prisma.puzzle.count({ where: { title: { contains: "PUZZLE", mode: "insensitive" } } });
    expect(found).toBe(4);
  });
});
