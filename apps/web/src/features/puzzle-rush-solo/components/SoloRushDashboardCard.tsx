"use client";

import { Zap } from "lucide-react";
import Link from "next/link";
import type { PuzzleRushMode } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { RUSH_LABEL } from "@/features/live-class/components/meeting/interactives/tools/puzzle-rush/RushParts";
import { useSoloRushOverview } from "../hooks/useSoloRush";

const MODES: PuzzleRushMode[] = ["STORM", "RACER"];

/**
 * Student dashboard: this week's best Storm / Racer runs, or an invitation to
 * play. Shown only to a student of a batch with puzzle training on; while it
 * loads, or if it fails, the dashboard simply goes without it.
 */
export function SoloRushDashboardCard() {
  const { data } = useSoloRushOverview();
  if (!data?.enabled) return null;

  const played = MODES.flatMap((mode) => {
    const best = data.weekBests.find((b) => b.mode === mode);
    return best ? [{ mode, score: best.score }] : [];
  });

  return (
    <SectionCard
      actions={
        played.length > 0 ? (
          <Button asChild className="-mr-3" size="sm" variant="ghost">
            <Link href="/student/puzzle-rush">Play</Link>
          </Button>
        ) : null
      }
      description="Timed puzzle runs on your own. Your best score goes on your batch's leaderboard."
      title="Storm and Racer"
    >
      {played.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2">
          {played.map(({ mode, score }) => (
            <div className="rounded-control border border-app-border bg-app-soft p-3" key={mode}>
              <dt className="text-xs font-medium text-app-muted">{RUSH_LABEL[mode]}: best this week</dt>
              <dd className="mt-1.5 font-display text-xl font-bold leading-none tabular-nums text-app-text">
                {score}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-app-muted">No runs this week yet.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/student/puzzle-rush">
              <Zap aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              Try Puzzle Storm
            </Link>
          </Button>
        </div>
      )}
    </SectionCard>
  );
}
