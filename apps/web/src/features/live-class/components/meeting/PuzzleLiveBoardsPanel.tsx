"use client";

import type { LivePuzzleBoardEntry, LivePuzzleBoardStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useLivePuzzleBoards } from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { PuzzleBoardTile } from "./PuzzleBoardTile";
import { EndPuzzleButton, PuzzleTimerBadge } from "./PuzzleSessionControls";

const STATUS_LABEL: Record<LivePuzzleBoardStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Solving…",
  SOLVED: "Solved",
  FAILED: "Failed",
  ABANDONED: "Abandoned"
};

const STATUS_VARIANT: Record<
  LivePuzzleBoardStatus,
  "outline" | "warning" | "success" | "destructive" | "secondary"
> = {
  NOT_STARTED: "outline",
  IN_PROGRESS: "warning",
  SOLVED: "success",
  FAILED: "destructive",
  ABANDONED: "secondary"
};

/** "12." / "12…" prefix read off the position the move was played from. */
function moveNumber(fenBefore: string) {
  const [, side, , , , fullmove] = fenBefore.split(" ");
  const n = Number(fullmove) || 1;
  return side === "b" ? `${n}…` : `${n}.`;
}

/** Coach-only: every enrolled student's live board for the active class puzzle. */
export function PuzzleLiveBoardsGrid({ classId, enabled = true }: { classId: string; enabled?: boolean }) {
  const boards = useLivePuzzleBoards(classId, enabled);
  const data = boards.data;

  if (!data || data.boards.length === 0) {
    return (
      <p className="text-sm text-app-muted">
        {boards.isLoading ? "Loading…" : "No students to show yet."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] gap-4">
      {data.boards.map((board: LivePuzzleBoardEntry) => {
        const fen = board.fen ?? data.puzzleFen;
        const lastMistake = board.mistakes[board.mistakes.length - 1];
        // Arrow only while the student is still on the position they went wrong in.
        const wrongMove = lastMistake && lastMistake.fenBefore === fen ? lastMistake.uci : undefined;
        return (
        <div
          key={board.studentId}
          className={cn(
            "flex flex-col gap-1.5 rounded-app border bg-app-surface p-2",
            board.mistakes.length > 0 && board.status === "IN_PROGRESS"
              ? "border-app-danger/50"
              : "border-app-border"
          )}
        >
          <PuzzleBoardTile fen={fen} orientation={data.orientation} wrongMove={wrongMove} />
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-xs font-semibold text-app-text">{board.studentName}</span>
            <Badge variant={STATUS_VARIANT[board.status]} className="shrink-0">
              {STATUS_LABEL[board.status]}
            </Badge>
          </div>
          {board.moveCount > 0 ? (
            <p className="truncate text-[11px] text-app-muted">
              {board.moveCount} move{board.moveCount === 1 ? "" : "s"}
              {board.lastMoveSan ? ` · last: ${board.lastMoveSan}` : ""}
            </p>
          ) : null}
          {board.mistakes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              <span className="font-semibold text-app-danger-ink">
                {board.mistakes.length} wrong:
              </span>
              {board.mistakes.map((m, i) => (
                <span
                  key={`${m.at}-${i}`}
                  className="rounded-full bg-app-danger/10 px-1.5 font-medium tabular-nums text-app-danger-ink"
                >
                  {moveNumber(m.fenBefore)}
                  {m.san}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        );
      })}
    </div>
  );
}

/** The live-boards grid as a dialog — phones, where there is no stage tab for it. */
export function PuzzleLiveBoardsPanel({
  classId,
  open,
  onOpenChange
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { activePuzzle } = useLiveClassState("activePuzzle");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live boards</DialogTitle>
          {activePuzzle ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <PuzzleTimerBadge endsAt={activePuzzle.endsAt} />
              <EndPuzzleButton classId={classId} />
            </div>
          ) : null}
        </DialogHeader>
        <PuzzleLiveBoardsGrid classId={classId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
