import type { PuzzleRushPuzzle } from "@nexa-chess/types";
import { PUZZLE_RUSH_MAX_RATING_DEVIATION, PUZZLE_RUSH_RATING_BUCKETS } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";

type CatalogueRow = { id: string; fen: string; moves: string; rating: number; randKey: number };

/** Below this many puzzles the catalogue isn't really loaded (a fresh dev box). */
export const MIN_RUN_SIZE = 20;
/** §6 catalogue guard, same as the browse routes. */
const STATEMENT_TIMEOUT = "3s";

/**
 * Lichess' Storm ladder: for each rating bucket, that many random puzzles
 * from the three 50-point bands around it (a seek into the walk index from a
 * random `randKey`, wrapping round), quality-gated and with a settled
 * rating; then the whole run in rising rating order.
 */
export async function selectPuzzleRushRun(prisma: PrismaService): Promise<PuzzleRushPuzzle[]> {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
    // Same reason as the catalogue browse: keep Postgres on custom plans.
    await tx.$executeRawUnsafe(`SET LOCAL plan_cache_mode = force_custom_plan`);
    const picked: CatalogueRow[] = [];
    for (const [rating, count] of PUZZLE_RUSH_RATING_BUCKETS) {
      const centre = Math.floor(rating / 50);
      const candidates: CatalogueRow[] = [];
      for (const band of [centre - 1, centre, centre + 1]) {
        const seed = Math.floor(Math.random() * 2 ** 31);
        const after = await tx.$queryRaw<CatalogueRow[]>`
          SELECT id, fen, moves, rating, "randKey" FROM lichess_puzzles
          WHERE "ratingBand" = ${band}::smallint AND "randKey" >= ${seed}::int
            AND "passesQualityGate" AND "ratingDeviation" <= ${PUZZLE_RUSH_MAX_RATING_DEVIATION}::smallint
          ORDER BY "ratingBand", "randKey", id LIMIT ${count}`;
        candidates.push(...after);
        if (after.length < count) {
          const before = await tx.$queryRaw<CatalogueRow[]>`
            SELECT id, fen, moves, rating, "randKey" FROM lichess_puzzles
            WHERE "ratingBand" = ${band}::smallint AND "randKey" < ${seed}::int
              AND "passesQualityGate" AND "ratingDeviation" <= ${PUZZLE_RUSH_MAX_RATING_DEVIATION}::smallint
            ORDER BY "ratingBand", "randKey", id LIMIT ${count - after.length}`;
          candidates.push(...before);
        }
      }
      picked.push(...shuffle(candidates).slice(0, count));
    }
    return picked;
  });

  const seen = new Set<string>();
  return rows
    .filter((row) => !seen.has(row.id) && seen.add(row.id))
    .map((row) => ({ fen: row.fen, id: row.id, moves: row.moves.split(" ").filter(Boolean), rating: row.rating }))
    .filter((puzzle) => puzzle.moves.length >= 2)
    .sort((a, b) => a.rating - b.rating);
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
