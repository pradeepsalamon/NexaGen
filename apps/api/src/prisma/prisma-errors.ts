import { Prisma } from "@prisma/client";

/**
 * True when `error` is a Postgres `ON DELETE RESTRICT` foreign-key violation —
 * a hard delete blocked because another row still references it (e.g. a
 * CourseModule pointing at the Assignment/Puzzle being deleted). Prisma's own
 * referential-integrity checks surface this as `P2003`, but when the *database*
 * enforces the RESTRICT itself (SQLSTATE 23001), Prisma instead wraps it as a
 * `PrismaClientUnknownRequestError` with no structured error code — so this
 * also falls back to matching the raw Postgres message.
 */
export function isForeignKeyRestrictError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
    return true;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /violates RESTRICT setting of foreign key constraint/.test(error.message);
  }
  return false;
}
