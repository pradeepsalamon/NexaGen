"use client";

import {
  STUDENT_ACTIVITY_OUTCOME_LABELS,
  STUDENT_ACTIVITY_TYPE_LABELS,
  type StudentActivityEntry,
  type StudentActivityOutcome,
  type StudentActivityScope,
  type StudentActivityStatusFilter
} from "@nexa-chess/types";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatDuration, formatFullDate } from "@/lib/datetime";
import { PUZZLE_DIFFICULTY_LABELS, PUZZLE_TYPE_LABELS } from "@/features/puzzles/lib/puzzleMeta";
import { useActivityHistory } from "../hooks/useProgress";

type BadgeVariant = "success" | "warning" | "destructive" | "info" | "secondary" | "outline";

export const OUTCOME_BADGE: Record<StudentActivityOutcome, BadgeVariant> = {
  CORRECT: "success",
  INCOMPLETE: "warning",
  INCORRECT: "destructive",
  NOT_STARTED: "outline",
  PARTIAL: "warning",
  SKIPPED: "outline",
  UNANSWERED: "secondary",
  UNGRADED: "info"
};

const ENGINE_RESULT: Record<string, string> = { DRAW: "Drew the engine", LOSS: "Lost to the engine", WIN: "Beat the engine" };

function detailText(entry: StudentActivityEntry): string | null {
  if (!entry.detail) return null;
  if (entry.type === "CLASS_QUESTION") return `Played ${entry.detail}`;
  if (entry.type === "HOMEWORK") return ENGINE_RESULT[entry.detail] ?? null;
  return entry.detail;
}

/** "2 tries · solved on try 2 · 1 wrong move · 1 hint · 3 min". */
function statsText(entry: StudentActivityEntry): string[] {
  const parts: string[] = [];
  if (entry.attempts > 1 || (entry.attempts === 1 && entry.type !== "CLASS_QUESTION" && entry.type !== "PUZZLE_RUSH")) {
    parts.push(`${entry.attempts} ${entry.attempts === 1 ? "try" : "tries"}`);
  }
  if (entry.solvedOnAttempt && entry.attempts > 1) parts.push(`right on try ${entry.solvedOnAttempt}`);
  if (entry.wrongMoves > 0) parts.push(`${entry.wrongMoves} wrong ${entry.wrongMoves === 1 ? "move" : "moves"}`);
  if (entry.hintsUsed > 0) parts.push(`${entry.hintsUsed} ${entry.hintsUsed === 1 ? "hint" : "hints"}`);
  if (entry.durationSeconds) {
    // formatDuration rounds to minutes; a 40-second solve shouldn't read "0 min".
    parts.push(entry.durationSeconds < 60 ? `${entry.durationSeconds}s` : formatDuration(entry.durationSeconds));
  }
  return parts;
}

function ActivityRow({ entry }: { entry: StudentActivityEntry }) {
  const tz = useUserTimeZone();
  const detail = detailText(entry);
  const stats = statsText(entry);
  const context: string[] = [];
  if (entry.liveClass) {
    context.push(`${entry.liveClass.title ?? "Class"} (${formatFullDate(entry.liveClass.startsAt, tz)})`);
  }
  if (entry.queue) context.push(`${entry.queue.title}, activity ${entry.queue.position}`);
  if (entry.assignment) context.push(`${entry.assignment.title} · due ${formatFullDate(entry.assignment.dueDate, tz)}`);
  if (entry.batch && !entry.liveClass) context.push(entry.batch.name);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-sm font-semibold text-app-text">{entry.title}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-muted">
          <Badge variant="secondary">{STUDENT_ACTIVITY_TYPE_LABELS[entry.type]}</Badge>
          {entry.puzzle ? (
            <span>
              {PUZZLE_TYPE_LABELS[entry.puzzle.puzzleType]} · {PUZZLE_DIFFICULTY_LABELS[entry.puzzle.difficulty]}
              {entry.puzzle.topicName ? ` · ${entry.puzzle.topicName}` : ""}
            </span>
          ) : null}
          <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt, tz)}</time>
        </div>
        {context.length ? <p className="break-words text-xs text-app-muted">{context.join(" · ")}</p> : null}
        {entry.studentNote ? (
          <p className="break-words text-xs text-app-muted">
            <span className="font-semibold text-app-text">Student note:</span> {entry.studentNote}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          {entry.score !== null ? (
            <span className="text-sm font-bold text-app-text">
              {entry.maxScore !== null ? `${entry.score} / ${entry.maxScore}` : `${entry.score} pts`}
            </span>
          ) : null}
          <Badge variant={OUTCOME_BADGE[entry.outcome]}>{STUDENT_ACTIVITY_OUTCOME_LABELS[entry.outcome]}</Badge>
        </div>
        {detail || stats.length ? (
          <p className="text-xs text-app-muted sm:text-right">{[detail, ...stats].filter(Boolean).join(" · ")}</p>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityHistoryList({
  studentId,
  scope,
  status,
  hasFilters
}: {
  studentId: string | null;
  scope: StudentActivityScope;
  status: StudentActivityStatusFilter | undefined;
  hasFilters: boolean;
}) {
  const query = useActivityHistory(studentId, { ...scope, status });
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  if (query.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading activity history" className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-control" />
        ))}
      </div>
    );
  }
  if (query.isError && !query.data) return <WidgetError message={query.error?.message} onRetry={() => query.refetch()} />;
  if (entries.length === 0) {
    return (
      <EmptyState
        description={
          hasFilters
            ? "Nothing matches these filters. Try a longer period or clear a filter."
            : "Puzzles, class questions and assignments will appear here once they're attempted."
        }
        icon={History}
        title={hasFilters ? "No matching activity" : "No activity yet"}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p aria-live="polite" className="text-xs text-app-muted">
        Showing {entries.length} of {total} {total === 1 ? "activity" : "activities"}
        {query.isFetching && !query.isFetchingNextPage ? " · updating…" : ""}
      </p>
      <ul className="divide-y divide-app-border">
        {entries.map((entry) => (
          <ActivityRow entry={entry} key={entry.id} />
        ))}
      </ul>
      {query.isFetchNextPageError ? (
        <WidgetError onRetry={() => query.fetchNextPage()} />
      ) : query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
            type="button"
            variant="outline"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
