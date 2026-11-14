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

/** Strips `.default()` / `.prefault()` / `.optional()` wrappers, keeping `.nullable()`. */
function withoutDefault(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodPrefault || schema instanceof z.ZodOptional) {
    return withoutDefault(schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodNullable) return withoutDefault(schema.unwrap() as z.ZodType).nullable();
  return schema;
}

type PartialShape<Shape extends z.core.$ZodShape, Keys extends PropertyKey> = {
  -readonly [K in keyof Shape]: K extends Keys ? z.ZodOptional<Shape[K]> : Shape[K];
};

/**
 * `.partial()` for update requests. Zod 4 still applies a field's `.default()`
 * after `.partial()` makes it optional, so an omitted field would parse as its
 * create default and overwrite the stored value. Here it stays absent.
 */
export function partialWithoutDefaults<
  Shape extends z.core.$ZodShape,
  Config extends z.core.$ZodObjectConfig,
  Keys extends keyof Shape = keyof Shape
>(schema: z.ZodObject<Shape, Config>, keys?: readonly Keys[]): z.ZodObject<PartialShape<Shape, Keys>, Config> {
  const shape: Record<string, z.ZodType> = {};
  for (const key of keys ?? (Object.keys(schema.shape) as Keys[])) {
    shape[key as string] = withoutDefault(schema.shape[key] as unknown as z.ZodType).optional();
  }
  return schema.extend(shape) as unknown as z.ZodObject<PartialShape<Shape, Keys>, Config>;
}

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
