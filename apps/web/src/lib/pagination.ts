import type { PaginatedQuery } from "@nexa-chess/types";

/** Server list params: pagination + free-text search + an optional status filter. */
export type ListParams = PaginatedQuery & { status?: string };

/** Serialises {@link ListParams} into a `?a=b&c=d` string (empty string when no params). */
export function toQueryString(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.sort) sp.set("sort", params.sort);
  if (params.order) sp.set("order", params.order);
  if (params.status && params.status !== "ALL") sp.set("status", params.status);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
