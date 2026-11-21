"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { DailyPuzzleScheduleManager } from "./DailyPuzzleScheduleManager";

/** Coach: Puzzle of the Day for the batches they teach (docs/PUZZLE_OF_THE_DAY.md). */
export function DailyPuzzleCoachClient() {
  const batches = useCoachBatches();
  const active = (batches.data?.batches ?? []).filter((b) => b.status === "ACTIVE");
  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <PageHeader
        description="Your students get three puzzles a day, picked automatically. Choose your own for any day and level, or turn it off for a batch."
        title="Puzzle of the Day"
      />
      {batches.isError ? (
        <WidgetError message="Couldn't load your batches." onRetry={() => void batches.refetch()} />
      ) : !batches.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DailyPuzzleScheduleManager scopes={active.map((b) => ({ id: b.id, label: b.name }))} />
      )}
    </div>
  );
}
