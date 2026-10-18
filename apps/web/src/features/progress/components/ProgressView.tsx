"use client";

import { ClipboardCheck, Flame, Puzzle, TrendingUp } from "lucide-react";
import type { StudentProgressDto } from "@nexa-chess/types";
import { LineChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatTile } from "@/components/ui/StatTile";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayMonth, formatRelativeDay } from "@/lib/datetime";
import { PUZZLE_DIFFICULTY_LABELS, difficultyBadgeVariant } from "@/features/puzzles/lib/puzzleMeta";

/** Rating, streak and recent results — shared by the student's page and the coach's view of a student. */
export function ProgressView({ progress }: { progress: StudentProgressDto }) {
  const tz = useUserTimeZone();
  const points = progress.ratingHistory.map((p) => ({ date: p.at, Rating: p.rating }));
  const solveRate =
    progress.puzzlesAttempted > 0
      ? Math.round((progress.puzzlesSolved / progress.puzzlesAttempted) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          context={`Peak ${progress.peakRating}`}
          icon={TrendingUp}
          label="Puzzle rating"
          tone="primary"
          value={String(progress.puzzleRating)}
        />
        <StatTile
          context={`Best ${progress.longestStreak}`}
          icon={Flame}
          label="Day streak"
          tone="warm"
          value={`${progress.currentStreak} ${progress.currentStreak === 1 ? "day" : "days"}`}
        />
        <StatTile
          context={solveRate === null ? undefined : `${solveRate}% solved`}
          icon={Puzzle}
          label="Puzzles solved"
          progress={solveRate ?? undefined}
          tone="accent"
          value={`${progress.puzzlesSolved} / ${progress.puzzlesAttempted}`}
        />
        <StatTile
          context={
            progress.averageAssignmentScore === null ? undefined : `Avg ${progress.averageAssignmentScore}%`
          }
          icon={ClipboardCheck}
          label="Assignments done"
          tone="secondary"
          value={String(progress.assignmentsCompleted)}
        />
      </div>

      <SectionCard
        title="Rating over time"
        description="Each puzzle counts once — the first time it's finished. Harder puzzles move the rating more."
      >
        <ChartContainer
          isEmpty={points.length < 2}
          emptyMessage="Solve a few puzzles to see the rating line."
        >
          <LineChartCard
            data={points}
            series={[{ key: "Rating", label: "Rating" }]}
            xFormat={(d) => formatDayMonth(d, tz)}
            xKey="date"
          />
        </ChartContainer>
      </SectionCard>

      <SectionCard title="Recent puzzles">
        {progress.recentPuzzles.length === 0 ? (
          <p className="text-sm text-app-muted">No puzzles finished yet.</p>
        ) : (
          <ul className="divide-y divide-app-border">
            {progress.recentPuzzles.map((p) => (
              <li key={`${p.puzzleId}-${p.at}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-text">{p.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-app-muted">
                    <Badge variant={difficultyBadgeVariant(p.difficulty)}>
                      {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                    </Badge>
                    <span>{formatRelativeDay(p.at, tz)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={p.solved ? "success" : "destructive"}>{p.solved ? "Solved" : "Missed"}</Badge>
                  {p.ratingChange !== null ? (
                    <span
                      className={`w-12 text-right text-sm font-bold ${
                        p.ratingChange >= 0 ? "text-accent-ink" : "text-warning-ink"
                      }`}
                    >
                      {p.ratingChange >= 0 ? `+${p.ratingChange}` : p.ratingChange}
                    </span>
                  ) : (
                    <span className="rounded-full bg-app-soft px-2 py-0.5 text-[11px] font-semibold text-app-muted" title="Repeat attempt — rating unchanged">
                      Repeat
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
