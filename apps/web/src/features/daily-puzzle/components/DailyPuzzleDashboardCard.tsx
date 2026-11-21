"use client";

import { CheckCircle2, Flame } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { useDailyPuzzleToday } from "../hooks/useDailyPuzzle";

/**
 * Student dashboard: today's Puzzle of the Day and the streak. Shown only when
 * it is on for the student and there is a puzzle; while it loads, or if it
 * fails, the dashboard simply goes without it.
 */
export function DailyPuzzleDashboardCard() {
  const { data } = useDailyPuzzleToday();
  if (!data?.enabled || data.puzzles.length === 0) return null;

  return (
    <SectionCard
      description="A new puzzle every day. Finish one to keep your streak."
      title="Puzzle of the Day"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-app-text">
          <Flame aria-hidden="true" className="size-4 text-accent-ink" strokeWidth={2.5} />
          {data.streak} {data.streak === 1 ? "day" : "days"} in a row
        </p>
        {data.doneToday ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/student/daily-puzzle">
              <CheckCircle2 aria-hidden="true" className="size-3.5 text-success-ink" strokeWidth={2.5} />
              Done today
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href="/student/daily-puzzle">Solve today&apos;s puzzle</Link>
          </Button>
        )}
      </div>
    </SectionCard>
  );
}
