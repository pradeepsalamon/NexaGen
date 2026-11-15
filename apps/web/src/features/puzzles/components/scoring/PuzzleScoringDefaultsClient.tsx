"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  DEFAULT_PUZZLE_LEADERBOARD,
  DEFAULT_PUZZLE_SCORING,
  type PuzzleLeaderboardOptions,
  type PuzzleScoring
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { formatDateTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  usePuzzleScoringSettings,
  useUpdatePuzzleScoringSettings
} from "../../hooks/usePuzzlesApi";
import {
  PuzzleLeaderboardFields,
  PuzzleScoringFields,
  PuzzleScoringPreview
} from "./PuzzleScoringFields";
import { PageHeader } from "@/components/layout/PageHeader";

/**
 * Admin → Puzzle Library → Points & leaderboard. The platform default every
 * live-class puzzle starts from; a puzzle's own override and the coach's
 * choices when sharing sit on top of it.
 */
export function PuzzleScoringDefaultsClient() {
  const tz = useUserTimeZone();
  const settings = usePuzzleScoringSettings();
  const save = useUpdatePuzzleScoringSettings();
  const [scoring, setScoring] = useState<PuzzleScoring | null>(null);
  const [leaderboard, setLeaderboard] = useState<PuzzleLeaderboardOptions | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setScoring(settings.data.settings.scoring);
    setLeaderboard(settings.data.settings.leaderboard);
  }, [settings.data]);

  const meta = settings.data?.settings;

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <PageHeader
        breadcrumbs={[{ href: "/admin/puzzles", label: "Puzzle library" }, { label: "Puzzle points" }]}
        description={
          <>
            Defaults for every puzzle shared in a live class. A puzzle can set its own points in the
            puzzle form, and a coach can change any of these when sharing — or mid-puzzle.
            {meta?.updatedAt ? (
              <span className="mt-1 block text-xs">
                Last changed {formatDateTime(meta.updatedAt, tz)}
                {meta.updatedByName ? ` by ${meta.updatedByName}` : ""}
              </span>
            ) : null}
          </>
        }
        title="Puzzle points"
      />

      {settings.isError && !settings.data ? (
        <WidgetError message="Couldn't load the scoring defaults." onRetry={() => void settings.refetch()} />
      ) : !scoring || !leaderboard ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <Card className="space-y-4 p-4 sm:p-6">
            <h2 className="text-sm font-extrabold text-app-muted">Points</h2>
            <PuzzleScoringFields idPrefix="defaults" value={scoring} onChange={setScoring} />
            <PuzzleScoringPreview scoring={scoring} />
          </Card>

          <Card className="space-y-4 p-4 sm:p-6">
            <h2 className="text-sm font-extrabold text-app-muted">
              Leaderboard
            </h2>
            <PuzzleLeaderboardFields idPrefix="defaults-lb" value={leaderboard} onChange={setLeaderboard} />
          </Card>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setScoring(DEFAULT_PUZZLE_SCORING);
                setLeaderboard(DEFAULT_PUZZLE_LEADERBOARD);
              }}
            >
              <RotateCcw className="size-4" strokeWidth={2.5} />
              Reset to Nexa defaults
            </Button>
            <Button
              type="button"
              isLoading={save.isPending}
              onClick={() => save.mutate({ leaderboard, scoring })}
            >
              Save defaults
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
