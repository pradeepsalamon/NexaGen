"use client";

import type { LivePuzzleBoardEntry, LivePuzzleBoardStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useLivePuzzleBoards } from "../../hooks/useLivePuzzle";
import { PuzzleBoardTile } from "./PuzzleBoardTile";

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

/** Coach-only: every enrolled student's live board for the active class puzzle. */
export function PuzzleLiveBoardsPanel({
  classId,
  open,
  onOpenChange
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const boards = useLivePuzzleBoards(classId, open);
  const data = boards.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live boards</DialogTitle>
        </DialogHeader>
        {!data || data.boards.length === 0 ? (
          <p className="text-sm text-app-muted">
            {boards.isLoading ? "Loading…" : "No students to show yet."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.boards.map((board: LivePuzzleBoardEntry) => (
              <div
                key={board.studentId}
                className="flex flex-col gap-1.5 rounded-app border border-app-border bg-app-surface p-2"
              >
                <PuzzleBoardTile
                  fen={board.fen ?? data.puzzleFen}
                  orientation={data.orientation}
                />
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate text-xs font-semibold text-app-text">
                    {board.studentName}
                  </span>
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
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
