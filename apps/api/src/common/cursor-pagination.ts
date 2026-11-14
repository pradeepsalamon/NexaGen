import { BadRequestException } from "@nestjs/common";

/**
 * Keyset pagination for newest-first feeds ordered by `(createdAt desc, id desc)`
 * — notifications, announcements, the message delivery log. The cursor is the
 * last row's `[createdAt, id]`, base64url-encoded and opaque to the client.
 * Ties on `createdAt` are broken by `id`, so no row is skipped or repeated even
 * when several share a timestamp or new rows arrive while the user scrolls.
 * See docs/PAGINATION.md.
 */
export interface CreatedAtCursor {
  createdAt: Date;
  id: string;
}

export const CREATED_AT_DESC_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const satisfies ReadonlyArray<
  Record<string, "desc">
>;

export function encodeCreatedAtCursor(row: CreatedAtCursor): string {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}

/** A tampered or stale cursor is a 400, never a 500. */
export function decodeCreatedAtCursor(cursor: string): CreatedAtCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error("shape");
    const [iso, id] = parsed as unknown[];
    if (typeof iso !== "string" || typeof id !== "string" || id.length === 0 || id.length > 100) {
      throw new Error("fields");
    }
    const createdAt = new Date(iso);
    if (Number.isNaN(createdAt.getTime())) throw new Error("date");
    return { createdAt, id };
  } catch {
    throw new BadRequestException("That page link has expired — reload the list.");
  }
}

/**
 * The `where` fragment selecting rows strictly after the cursor in
 * `(createdAt desc, id desc)` order. Empty when there is no cursor (first page).
 * Spread it into an `AND` with the list's own filters.
 */
export function createdAtCursorWhere(cursor: string | undefined): {
  OR?: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }>;
} {
  if (!cursor) return {};
  const { createdAt, id } = decodeCreatedAtCursor(cursor);
  return { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] };
}

/**
 * Splits a `take: limit + 1` result into the page and its `nextCursor`
 * (null when the extra probe row is missing, i.e. this is the last page).
 */
export function toCursorPage<T extends CreatedAtCursor>(
  rows: T[],
  limit: number
): { items: T[]; nextCursor: string | null } {
  const items = rows.length > limit ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: rows.length > limit && last ? encodeCreatedAtCursor(last) : null
  };
}
