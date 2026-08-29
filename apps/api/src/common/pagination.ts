import type { PaginatedQuery, PaginationMeta } from "@nexa-chess/types";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ResolvedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  search: string;
}

/**
 * Normalises the raw query string params for a server-paginated list endpoint
 * (AUDIT H26). Query values arrive as strings; this clamps them to sane bounds
 * so a caller can't ask for `pageSize=100000` or a negative page.
 */
export function resolvePagination(query: PaginatedQuery | undefined): ResolvedPagination {
  const rawPage = Number(query?.page);
  const rawSize = Number(query?.pageSize);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(Math.floor(rawSize), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const search = typeof query?.search === "string" ? query.search.trim() : "";

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search };
}

export function paginationMeta(
  total: number,
  page: number,
  pageSize: number
): PaginationMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/**
 * Resolves a client-supplied `sort`/`order` pair against an allow-list, so the
 * value can be handed straight to Prisma's `orderBy` without opening an
 * injection / arbitrary-column-sort hole.
 */
export function resolveOrderBy<T extends string>(
  query: PaginatedQuery | undefined,
  allowed: readonly T[],
  fallback: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">>
): Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">> {
  const sort = query?.sort;
  const order: "asc" | "desc" = query?.order === "asc" ? "asc" : "desc";
  if (sort && (allowed as readonly string[]).includes(sort)) {
    return { [sort]: order };
  }
  return fallback;
}
