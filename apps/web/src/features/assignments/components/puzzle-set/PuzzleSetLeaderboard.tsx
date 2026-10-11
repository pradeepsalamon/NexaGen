"use client";

import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { useAssignmentLeaderboard } from "../../hooks/useAssignmentsApi";
import { formatSeconds } from "../../lib/puzzleSetFormat";
import { RankChip } from "./PuzzleSetResults";

const RESTRICTION_TEXT = {
  AFTER_DUE_DATE: "Everyone's results appear after the due date. For now you see your own.",
  HIDDEN: "Your coach keeps this leaderboard private — you see only your own result.",
  TOP_N: "Showing the top of the board and your own place."
} as const;

/**
 * The set's leaderboard as this student may see it. Which rows, names and stats
 * come back is decided server-side by the set's leaderboard options — nothing
 * is filtered here.
 */
export function PuzzleSetLeaderboard({ assignmentId }: { assignmentId: string }) {
  const { data, isLoading, isError, refetch } = useAssignmentLeaderboard(assignmentId);

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-app-muted">
        <Trophy className="size-4 text-secondary-ink" strokeWidth={2.5} />
        Leaderboard
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError || !data ? (
        <WidgetError message="Could not load the leaderboard." onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-2">
          {data.restriction ? (
            <p className="text-xs text-app-muted">{RESTRICTION_TEXT[data.restriction]}</p>
          ) : null}
          {data.entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-app-muted">
              {data.rankedCount === 0
                ? "No one has finished a puzzle yet — be the first!"
                : "Finish a puzzle to see where you stand."}
            </p>
          ) : (
            <ol className="space-y-1.5">
              {data.entries.map((entry) => (
                <li
                  key={`${entry.rank}-${entry.studentName}`}
                  className={cn(
                    "flex items-center gap-3 rounded-control border p-2.5",
                    entry.isSelf ? "border-primary/50 bg-primary/10" : "border-app-border bg-app-surface"
                  )}
                  aria-current={entry.isSelf ? "true" : undefined}
                >
                  <RankChip rank={entry.rank} small />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-app-text">
                      {entry.studentName}
                      {entry.isSelf ? <span className="text-app-muted"> (you)</span> : null}
                    </p>
                    <p className="text-xs text-app-muted">
                      {entry.solvedCount}/{data.puzzleCount} solved
                      {entry.timeSpentSeconds !== null ? ` · ${formatSeconds(entry.timeSpentSeconds)}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-app-text">
                    {entry.points}
                    <span className="font-normal text-app-muted"> / {data.maxPoints}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
          {!data.showingAll && data.rankedCount > data.entries.length ? (
            <p className="text-xs text-app-muted">{data.rankedCount} students on the board.</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
