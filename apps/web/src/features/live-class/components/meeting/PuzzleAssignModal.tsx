"use client";

import { useState } from "react";
import type { PuzzleDifficulty } from "@nexa-chess/types";
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
import { usePuzzles } from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAssignLivePuzzle } from "../../hooks/useLivePuzzle";

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
  const [revealLeaderboard, setRevealLeaderboard] = useState(true);
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
        revealLeaderboard
      },
      { onSuccess: () => onOpenChange(false) }
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
          <label className="flex cursor-pointer items-center gap-2 text-sm text-app-text">
            <input
              type="checkbox"
              checked={revealLeaderboard}
              onChange={(e) => setRevealLeaderboard(e.target.checked)}
              className="size-4 accent-primary"
            />
            Show leaderboard to students
          </label>
        </div>

        <div className="max-h-[46vh] space-y-2 overflow-y-auto">
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
