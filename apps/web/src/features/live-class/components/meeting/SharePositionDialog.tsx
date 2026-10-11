"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { sanitizeCastlingRights, type PuzzleDetail, type SolutionMove } from "@nexa-chess/types";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { SolutionEditor } from "@/features/assignments/components/SolutionEditor";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { getPuzzle } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useShareLivePuzzleFromBoard } from "../../hooks/useLivePuzzle";
import { loadPuzzleCursor, savePuzzleCursor } from "../../lib/puzzleCursor";
import { loadLastShareOptions, saveLastShareOptions } from "../../lib/puzzleShareOptions";
import { PuzzleBoardTile } from "./PuzzleBoardTile";

const DEFAULT_TITLE = "What is the best move?";

/** Board, side to move, castling and en passant — move counters don't make it a different position. */
function samePosition(a: string, b: string) {
  // A stored FEN may carry a castling flag its placement can't support; the
  // board never does, so compare both after dropping those.
  const key = (fen: string) => sanitizeCastlingRights(fen).split(" ").slice(0, 4).join(" ");
  return key(a) === key(b);
}

function toInt(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

/**
 * "Share current": the main board's position as a puzzle, editable before it
 * goes out. When the position is the puzzle last shared/loaded (or the one the
 * class is solving), its title and line are prefilled and an unchanged share
 * reuses it; anything edited is saved as a new private puzzle.
 */
export function SharePositionDialog({
  classId,
  activePuzzleId,
  open,
  onOpenChange
}: {
  classId: string;
  activePuzzleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const boardFen = useBoardStore((s) => s.fen);
  const boardOrientation = useBoardStore((s) => s.orientation);
  // Frozen when the dialog opens, so a student's move on the shared board can't shift it.
  const [fen, setFen] = useState(boardFen);
  const [orientation, setOrientation] = useState(boardOrientation);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);

  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [seconds, setSeconds] = useState("60");
  const [points, setPoints] = useState("10");
  const [penalty, setPenalty] = useState("1");
  const [solution, setSolution] = useState<SolutionMove[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const share = useShareLivePuzzleFromBoard(classId);

  useEffect(() => {
    if (!open) return;
    const last = loadLastShareOptions();
    setFen(boardFen);
    setOrientation(boardOrientation);
    setTitle(DEFAULT_TITLE);
    setSeconds(last.durationSeconds || "60");
    setPoints(String(last.scoring.basePoints ?? 10));
    setPenalty(String(last.scoring.wrongMovePenalty ?? 1));
    setSolution([]);
    setSourceId(null);
    setEditing(false);
    setShowSolution(false);
    const ids = [activePuzzleId, loadPuzzleCursor().puzzleId].filter((id): id is string => !!id);
    setCandidateIds([...new Set(ids)]);
    // Only on open: the board moving afterwards must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useQuery({
    queryKey: [...queryKeys.puzzles.all, "share-candidates", candidateIds],
    queryFn: async () => {
      const found = await Promise.all(
        candidateIds.map((id) => getPuzzle(id).then((r) => r.puzzle).catch(() => null))
      );
      return found.filter((p): p is PuzzleDetail => !!p);
    },
    enabled: open && candidateIds.length > 0,
    staleTime: 30_000
  });

  // Prefill from the library puzzle this position came from, once it arrives.
  useEffect(() => {
    if (!open || sourceId) return;
    const match = candidates.data?.find((p) => samePosition(p.fen, fen));
    if (!match) return;
    setSourceId(match.id);
    setTitle(match.title);
    setSolution(match.solutionMoves ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidates.data, fen]);

  const durationSeconds = toInt(seconds);
  const basePoints = toInt(points);
  const wrongMovePenalty = toInt(penalty);
  const durationError =
    durationSeconds !== null && (Number.isNaN(durationSeconds) || durationSeconds < 30 || durationSeconds > 3600)
      ? "30 to 3600 seconds, or leave empty for no timer."
      : null;
  const pointsError = basePoints === null || Number.isNaN(basePoints) || basePoints < 0 ? "Enter the points." : null;
  const penaltyError =
    wrongMovePenalty !== null && (Number.isNaN(wrongMovePenalty) || wrongMovePenalty < 0)
      ? "Zero or more."
      : null;
  const canShare =
    title.trim().length > 0 && solution.length > 0 && !durationError && !pointsError && !penaltyError;

  const submit = () => {
    if (!canShare || basePoints === null) return;
    const scoring = { basePoints, wrongMovePenalty: wrongMovePenalty ?? 0 };
    share.mutate(
      {
        title: title.trim(),
        fen,
        orientation,
        solutionMoves: solution,
        sourcePuzzleId: sourceId ?? undefined,
        durationSeconds,
        scoring
      },
      {
        onSuccess: (res) => {
          const last = loadLastShareOptions();
          saveLastShareOptions({
            ...last,
            durationSeconds: durationSeconds === null ? "" : String(durationSeconds),
            scoring: { ...last.scoring, ...scoring }
          });
          // An unchanged library puzzle keeps the folder cursor on it.
          if (res.assignment && res.assignment.puzzleId === sourceId) {
            savePuzzleCursor({ puzzleId: sourceId });
          }
          onOpenChange(false);
        }
      }
    );
  };

  const solutionText = solution.map((m) => m.san).join(" ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Set the solution" : "Share puzzle"}</DialogTitle>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <SolutionEditor startFen={fen} value={solution} onChange={setSolution} orientation={orientation} />
            <div className="flex justify-end">
              <Button type="button" onClick={() => setEditing(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form
            id="share-position-form"
            className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="mx-auto w-full max-w-[360px]">
              <PuzzleBoardTile fen={fen} orientation={orientation} />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="share-title">Title</Label>
                <Input id="share-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="share-seconds">Time in seconds</Label>
                <Input
                  id="share-seconds"
                  type="number"
                  inputMode="numeric"
                  placeholder="No timer"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                />
                {durationError ? <p className="text-xs text-app-danger-ink">{durationError}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="share-points">Points</Label>
                  <Input
                    id="share-points"
                    type="number"
                    inputMode="numeric"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                  {pointsError ? <p className="text-xs text-app-danger-ink">{pointsError}</p> : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-penalty">Negative points</Label>
                  <Input
                    id="share-penalty"
                    type="number"
                    inputMode="numeric"
                    value={penalty}
                    onChange={(e) => setPenalty(e.target.value)}
                  />
                  {penaltyError ? <p className="text-xs text-app-danger-ink">{penaltyError}</p> : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="share-solution">Solution</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-solution"
                    readOnly
                    placeholder="Add a solution"
                    value={
                      solution.length === 0
                        ? ""
                        : showSolution
                          ? solutionText
                          : `${solution.length} move${solution.length === 1 ? "" : "s"} set`
                    }
                    onClick={() => setEditing(true)}
                    className="cursor-pointer"
                  />
                  <SimpleTooltip label="Edit the solution">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Edit the solution"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                </div>
                {solution.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowSolution((v) => !v)}
                    className="text-sm font-medium text-primary-ink hover:underline"
                  >
                    {showSolution ? "Hide solution" : "Show solution"}
                  </button>
                ) : (
                  <p className="text-xs text-app-muted">Play the answer on the board — students are scored against it.</p>
                )}
              </div>
            </div>
          </form>
        )}

        {!editing ? (
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="share-position-form" disabled={!canShare} isLoading={share.isPending}>
              Share
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
