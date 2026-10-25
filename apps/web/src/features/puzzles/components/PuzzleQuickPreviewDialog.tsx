"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { Chess } from "@/lib/chess";
import { cn } from "@/lib/utils";
import { usePuzzle } from "../hooks/usePuzzlesApi";
import { PUZZLE_DIFFICULTY_LABELS, PUZZLE_TYPE_LABELS, difficultyBadgeVariant } from "../lib/puzzleMeta";

type Step = { fen: string; from: string; to: string; san: string };

/**
 * Read-only look at a library puzzle — position, solution line (stepped on the
 * board), difficulty, type and tags — without leaving the current flow. Opened
 * from the assignment puzzle picker and the Puzzle Library's selection. With
 * `sequence` it steps through a list (a folder's bulk preview): Previous / Next,
 * "Puzzle 3 of 21", and the solution stays hidden until revealed.
 */
export function PuzzleQuickPreviewDialog({
  puzzleId,
  onOpenChange,
  action,
  sequence
}: {
  puzzleId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Optional footer action, e.g. "Add to set". */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  sequence?: { index: number; total: number; onIndexChange: (index: number) => void };
}) {
  const open = puzzleId !== null;
  const query = usePuzzle(puzzleId ?? "", open);
  const puzzle = query.data?.puzzle ?? null;
  const [ply, setPly] = useState(0);
  const [revealed, setRevealed] = useState(!sequence);

  useEffect(() => {
    setPly(0);
    setRevealed(!sequence);
    // Only a new puzzle resets the board and hides its solution again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  const steps = useMemo<Step[] | null>(() => {
    if (!puzzle?.solutionMoves) return [];
    try {
      const chess = new Chess(puzzle.fen);
      return puzzle.solutionMoves.map((m) => {
        const move = chess.move({ from: m.uci.slice(0, 2), promotion: m.uci[4], to: m.uci.slice(2, 4) });
        return { fen: chess.fen(), from: move.from, san: move.san, to: move.to };
      });
    } catch {
      return null;
    }
  }, [puzzle]);

  const current = steps && ply > 0 ? steps[ply - 1] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          {sequence ? (
            <p aria-live="polite" className="text-xs font-semibold text-app-muted">
              Puzzle {sequence.index + 1} of {sequence.total}
            </p>
          ) : null}
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 text-primary-ink" strokeWidth={2.5} />
            {puzzle?.title ?? "Puzzle preview"}
          </DialogTitle>
          <DialogDescription>
            {puzzle
              ? `${puzzle.sideToMove === "white" ? "White" : "Black"} to move · ${puzzle.solutionLength}-move solution`
              : "Loading the puzzle…"}
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="mx-auto aspect-square w-full max-w-[22rem]" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : query.isError || !puzzle ? (
          <WidgetError message="Could not load this puzzle." onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
                {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
              </Badge>
              <Badge variant="secondary">{PUZZLE_TYPE_LABELS[puzzle.puzzleType]}</Badge>
              {puzzle.topicName ? <Badge variant="outline">{puzzle.topicName}</Badge> : null}
              {puzzle.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  #{tag}
                </Badge>
              ))}
            </div>
            {puzzle.description ? <p className="text-sm text-app-muted">{puzzle.description}</p> : null}

            <div className="mx-auto w-full max-w-[22rem]">
              <PracticeBoard
                fen={current?.fen ?? puzzle.fen}
                interactive={false}
                lastMove={current ? [current.from, current.to] : null}
                orientation={puzzle.orientation}
              />
            </div>

            {!revealed ? (
              <div className="flex justify-center">
                <Button onClick={() => setRevealed(true)} type="button" variant="outline">
                  <Eye className="mr-2 size-4" strokeWidth={2.5} />
                  Show solution
                </Button>
              </div>
            ) : steps === null ? (
              <p className="text-center text-sm text-app-danger-ink">This puzzle&apos;s solution line couldn&apos;t be replayed.</p>
            ) : steps.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2">
                  <SimpleTooltip label="Start position">
                    <Button aria-label="Start position" disabled={ply === 0} onClick={() => setPly(0)} size="icon" type="button" variant="outline">
                      <ChevronsLeft className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                  <SimpleTooltip label="Previous move">
                    <Button aria-label="Previous move" disabled={ply === 0} onClick={() => setPly(ply - 1)} size="icon" type="button" variant="outline">
                      <ChevronLeft className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                  <SimpleTooltip label="Next move">
                    <Button aria-label="Next move" disabled={ply >= steps.length} onClick={() => setPly(ply + 1)} size="icon" type="button" variant="outline">
                      <ChevronRight className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                </div>
                <ol aria-label="Solution" className="flex flex-wrap justify-center gap-1 text-sm">
                  {steps.map((s, i) => (
                    <li key={i}>
                      <button
                        aria-current={i === ply - 1 ? "step" : undefined}
                        className={cn(
                          "rounded-control px-1.5 py-0.5 transition-colors hover:bg-app-soft",
                          i === ply - 1 ? "bg-primary font-bold text-white hover:bg-primary" : "text-app-text"
                        )}
                        onClick={() => setPly(i + 1)}
                        type="button"
                      >
                        {s.san}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-center text-sm text-app-muted">No solution line recorded.</p>
            )}
            {revealed && sequence && (puzzle.explanation || puzzle.hints.length > 0) ? (
              <div className="space-y-2 rounded-control bg-app-soft p-3 text-sm">
                {puzzle.hints.length > 0 ? (
                  <p className="text-app-muted">
                    <span className="font-semibold text-app-text">Hints: </span>
                    {puzzle.hints.join(" · ")}
                  </p>
                ) : null}
                {puzzle.explanation ? (
                  <p className="text-app-muted">
                    <span className="font-semibold text-app-text">Explanation: </span>
                    {puzzle.explanation}
                  </p>
                ) : null}
              </div>
            ) : null}
            {revealed && sequence ? (
              <div className="flex justify-center">
                <Button onClick={() => { setRevealed(false); setPly(0); }} size="sm" type="button" variant="ghost">
                  <EyeOff className="mr-2 size-4" strokeWidth={2.5} />
                  Hide solution
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className={sequence ? "flex-row flex-wrap justify-between gap-2 sm:justify-between" : undefined}>
          {sequence ? (
            <div className="flex gap-2">
              <Button
                disabled={sequence.index <= 0}
                onClick={() => sequence.onIndexChange(sequence.index - 1)}
                type="button"
                variant="outline"
              >
                <ChevronLeft className="mr-1 size-4" strokeWidth={2.5} />
                Previous puzzle
              </Button>
              <Button
                disabled={sequence.index >= sequence.total - 1}
                onClick={() => sequence.onIndexChange(sequence.index + 1)}
                type="button"
                variant="outline"
              >
                Next puzzle
                <ChevronRight className="ml-1 size-4" strokeWidth={2.5} />
              </Button>
            </div>
          ) : null}
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Close
          </Button>
          {action ? (
            <Button disabled={action.disabled || !puzzle} onClick={action.onClick} type="button">
              {action.label}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
