"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAllBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { DailyPuzzleScheduleManager } from "./DailyPuzzleScheduleManager";

/** Admin: the academy's Puzzle of the Day, or any active batch's (docs/PUZZLE_OF_THE_DAY.md). */
export function DailyPuzzleAdminClient() {
  const batches = useAllBatchesQuery({ status: "ACTIVE" });
  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <PageHeader
        description="Three puzzles a day, picked automatically. Choose your own for any day and level, for the whole academy or one batch, or turn it off."
        title="Puzzle of the Day"
      />
      {batches.isError ? (
        <WidgetError message="Couldn't load batches." onRetry={() => void batches.refetch()} />
      ) : !batches.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DailyPuzzleScheduleManager
          scopes={[
            { id: null, label: "Whole academy" },
            ...batches.data.batches.map((b) => ({ id: b.id, label: `Batch: ${b.name}` }))
          ]}
        />
      )}
    </div>
  );
}
