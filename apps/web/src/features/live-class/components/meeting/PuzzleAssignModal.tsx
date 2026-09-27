"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import {
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring,
  type PuzzleDifficulty,
  type PuzzleLeaderboardOptions,
  type PuzzleLeaderboardOverride,
  type PuzzleScoring,
  type PuzzleScoringOverride
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePuzzleScoringSettings, usePuzzles } from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  PuzzleLeaderboardFields,
  PuzzleScoringFields,
  PuzzleScoringPreview
} from "@/features/puzzles/components/scoring/PuzzleScoringFields";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAssignLivePuzzle } from "../../hooks/useLivePuzzle";

/**
 * The coach's last share options, remembered per browser so a coach who always
 * runs "−10 per wrong move, leaderboard after the end" sets it once. Only the
 * fields they actually changed are kept (and sent), so a puzzle's own points
 * still apply to everything else.
 */
const LAST_OPTIONS_KEY = "nexa-live-puzzle-share-options";

type ShareOptions = {
  durationSeconds: string;
  leaderboard: PuzzleLeaderboardOverride;
  scoring: PuzzleScoringOverride;
};

function loadLastOptions(): ShareOptions {
  const empty: ShareOptions = { durationSeconds: "", leaderboard: {}, scoring: {} };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(LAST_OPTIONS_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<ShareOptions>) } : empty;
  } catch {
    return empty;
  }
}

function saveLastOptions(options: ShareOptions) {
  try {
    window.localStorage.setItem(LAST_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Storage blocked — the options just aren't remembered.
  }
}

export function PuzzleAssignModal({
  classId,
  open,
  onOpenChange
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty | "">("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [scoringOverride, setScoringOverride] = useState<PuzzleScoringOverride>({});
  const [leaderboardOverride, setLeaderboardOverride] = useState<PuzzleLeaderboardOverride>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const defaults = usePuzzleScoringSettings(open);

  useEffect(() => {
    if (!open) return;
    const last = loadLastOptions();
    setDurationSeconds(last.durationSeconds);
    setScoringOverride(last.scoring);
    setLeaderboardOverride(last.leaderboard);
  }, [open]);

  // What the fields show: admin default + the coach's changes. A puzzle's own
  // override is applied server-side for any field the coach left alone.
  const shownScoring = useMemo(
    () => resolvePuzzleScoring(defaults.data?.settings.scoring, scoringOverride),
    [defaults.data, scoringOverride]
  );
  const shownLeaderboard = useMemo(
    () => resolvePuzzleLeaderboard(defaults.data?.settings.leaderboard, leaderboardOverride),
    [defaults.data, leaderboardOverride]
  );
  const customized =
    Object.keys(scoringOverride).length + Object.keys(leaderboardOverride).length > 0;
  const debouncedSearch = useDebouncedValue(search, 300);

  const puzzles = usePuzzles({
    status: "PUBLISHED",
    scope: "all",
    search: debouncedSearch || undefined,
    difficulty: difficulty || undefined,
    pageSize: 25
  });

  const assign = useAssignLivePuzzle(classId);

  const handleAssign = (puzzleId: string) => {
    assign.mutate(
      {
        puzzleId,
        durationSeconds: durationSeconds ? Number(durationSeconds) : null,
        leaderboard: leaderboardOverride,
        scoring: scoringOverride
      },
      {
        onSuccess: () => {
          saveLastOptions({ durationSeconds, leaderboard: leaderboardOverride, scoring: scoringOverride });
          onOpenChange(false);
        }
      }
    );
  };

  const rows = puzzles.data?.puzzles ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share a puzzle</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Search puzzles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty | "")}
            placeholder="Any difficulty"
            options={PUZZLE_DIFFICULTY_OPTIONS}
            className="sm:w-44"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-app-text">
            <span className="text-app-muted">Timer</span>
            <Select
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(e.target.value)}
              placeholder="No timer"
              options={[
                { value: "120", label: "2 min" },
                { value: "300", label: "5 min" },
                { value: "600", label: "10 min" },
                { value: "900", label: "15 min" }
              ]}
              className="w-32"
            />
          </label>
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-expanded={optionsOpen}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <Trophy className="size-4" strokeWidth={2.5} />
            Points &amp; leaderboard
            {customized ? <Badge variant="secondary">Custom</Badge> : null}
            <ChevronDown
              className={`size-4 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
              strokeWidth={2.5}
            />
          </button>
        </div>

        {optionsOpen ? (
          <div className="max-h-[40vh] space-y-4 overflow-y-auto rounded-app border border-app-border p-3">
            <PuzzleScoringFields
              idPrefix="share-scoring"
              value={shownScoring}
              onChange={(next: PuzzleScoring, key) =>
                setScoringOverride((prev) => ({ ...prev, [key]: next[key] }))
              }
            />
            <PuzzleScoringPreview scoring={shownScoring} />
            <PuzzleLeaderboardFields
              idPrefix="share-lb"
              value={shownLeaderboard}
              onChange={(next: PuzzleLeaderboardOptions, key) =>
                setLeaderboardOverride((prev) => ({ ...prev, [key]: next[key] }))
              }
            />
            <p className="text-xs text-app-muted">
              Fields you don&apos;t change use the puzzle&apos;s own points, else the platform
              default. You can still edit these while the puzzle is running.
            </p>
            {customized ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setScoringOverride({});
                  setLeaderboardOverride({});
                }}
              >
                Reset to defaults
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className={`${optionsOpen ? "max-h-[24vh]" : "max-h-[46vh]"} space-y-2 overflow-y-auto`}>
          {puzzles.isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-app-muted">No published puzzles match.</p>
          ) : (
            rows.map((puzzle) => (
              <div
                key={puzzle.id}
                className="flex items-center justify-between gap-3 rounded-app border border-app-border bg-app-surface p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-text">{puzzle.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{puzzle.topicName}</Badge>
                    <Badge variant="outline">{PUZZLE_TYPE_LABELS[puzzle.puzzleType]}</Badge>
                    <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
                      {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
                    </Badge>
                    {puzzle.scoring?.basePoints !== undefined ? (
                      <Badge variant="outline">{puzzle.scoring.basePoints} pts</Badge>
                    ) : null}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleAssign(puzzle.id)}
                  disabled={assign.isPending}
                >
                  Share
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
