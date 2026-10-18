import { createHash } from "node:crypto";
import { puzzleContentKey, type SolutionMove } from "@nexa-chess/types";

/**
 * A puzzle's identity of CONTENT (spec §0.3): the first 16 hex chars of
 * sha256(puzzleContentKey). Indexed, never unique — two authored puzzles may
 * share content. `(source, sourceId)` stays the identity of origin. The SQL
 * backfill in the puzzle_catalogue migration must produce the same value
 * (puzzle-content-hash.int-spec.ts).
 */
export function puzzleContentHash(fen: string, solution: readonly Pick<SolutionMove, "uci">[]): string {
  const key = puzzleContentKey(fen, solution.map((m) => m.uci));
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}
