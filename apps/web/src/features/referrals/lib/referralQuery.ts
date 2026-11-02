import type { PaginatedQuery } from "@nexa-chess/types";

/** List params for the referral endpoints: paging, search and named filters. */
export type ReferralListParams = PaginatedQuery & { [filter: string]: string | number | undefined };

export function withQuery(path: string, params: ReferralListParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === "ALL") continue;
    if (key === "page" && Number(value) <= 1) continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
