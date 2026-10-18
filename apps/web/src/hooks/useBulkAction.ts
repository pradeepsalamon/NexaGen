"use client";

import { useState } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { BulkResult } from "@/components/common/BulkResultDialog";
import { getErrorMessage } from "@/lib/errors";

/**
 * Runs one per-item API call for every selected row (independently — one
 * failure never stops the rest) and collects a `BulkResult` for
 * `BulkResultDialog`.
 */
export function useBulkAction<T>({
  invalidates,
  labelOf
}: {
  invalidates: QueryKey[];
  labelOf: (item: T) => string;
}) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const run = async (action: string, items: T[], call: (item: T) => Promise<unknown>) => {
    setIsPending(true);
    try {
      const outcomes = await Promise.allSettled(items.map((item) => call(item)));
      const failed = outcomes.flatMap((outcome, index) =>
        outcome.status === "rejected"
          ? [{ label: labelOf(items[index]), reason: getErrorMessage(outcome.reason) }]
          : []
      );
      setResult({ action, failed, succeeded: items.length - failed.length });
      // A failed refetch must not turn finished per-item work into an error.
      await Promise.allSettled(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    } finally {
      setIsPending(false);
    }
  };

  return { clearResult: () => setResult(null), isPending, result, run };
}
