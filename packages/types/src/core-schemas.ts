import { z } from "zod";

/**
 * Schemas that both `index.ts` and feature modules (`puzzle.ts`,
 * `analytics.ts`, …) build on. They live here, not in `index.ts`, so no
 * module has to import runtime values back from the barrel — a cycle that the
 * ESM build (`dist/esm`, what the web bundle tree-shakes) cannot evaluate.
 */

export const paginationMetaSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number()
});

export const chessColorSchema = z.enum(["white", "black"]);

const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/;

/** One move of a stored solution line. `uci` is the source of truth for scoring. */
export const solutionMoveSchema = z.object({
  uci: z.string().regex(UCI_RE, "Invalid UCI move."),
  san: z.string().min(1).max(12)
});

/** One move a student played during an attempt. Sent by the client on save. */
export const attemptMoveSchema = z.object({
  ply: z.number().int().min(1).max(400),
  uci: z.string().regex(UCI_RE, "Invalid UCI move."),
  san: z.string().min(1).max(12),
  fenAfter: z.string().min(1).max(120),
  elapsedMs: z.number().int().min(0).max(86_400_000).optional()
});
