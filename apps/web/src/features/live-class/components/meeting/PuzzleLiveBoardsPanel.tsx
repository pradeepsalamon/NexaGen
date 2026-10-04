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
      {data.boards.map((board: LivePuzzleBoardEntry) => (
        <div
          key={board.studentId}
          className="flex flex-col gap-1.5 rounded-app border border-app-border bg-app-surface p-2"
        >
          <PuzzleBoardTile fen={board.fen ?? data.puzzleFen} orientation={data.orientation} />
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
        </div>
      ))}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live boards</DialogTitle>
        </DialogHeader>
        <PuzzleLiveBoardsGrid classId={classId} enabled={open} />
      </DialogContent>
    </Dialog>
  );
}
