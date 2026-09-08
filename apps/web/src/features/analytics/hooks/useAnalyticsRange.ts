"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

const KEYS = [
  "preset",
  "from",
  "to",
  "compare",
  "granularity",
  "role",
  "batchId",
  "coachId",
  "classType",
  "acquisitionSource",
  "status",
  "threshold"
] as const;

type Key = (typeof KEYS)[number];

export interface AnalyticsRangeState {
  query: AnalyticsRangeQuery;
  /** Shallow-merge params into the URL (null clears a key). Resets to page 1 semantics is caller's job. */
  update: (patch: Partial<Record<Key, string | number | null | undefined>>) => void;
  reset: () => void;
}

/**
 * Reads the analytics range/filter state from the URL query string so a filtered
 * dashboard is shareable and bookmarkable, and writes changes back with a
 * shallow `router.replace` (no scroll, no history spam).
 */
export function useAnalyticsRange(
  defaults: Partial<AnalyticsRangeQuery> = { preset: "last30" }
): AnalyticsRangeState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = useMemo<AnalyticsRangeQuery>(() => {
    const q: Record<string, string | number> = {};
    for (const key of KEYS) {
      const value = searchParams.get(key);
      if (value !== null && value !== "") {
        q[key] = key === "threshold" ? Number(value) : value;
      }
    }
    return { ...defaults, ...q } as AnalyticsRangeQuery;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const update = useCallback(
    (patch: Partial<Record<Key, string | number | null | undefined>>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const reset = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  return { query, update, reset };
}
