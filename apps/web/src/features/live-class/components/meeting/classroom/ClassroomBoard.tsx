"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ChevronsRight, Crown, Loader2, Puzzle as PuzzleIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { SendPositionButton } from "@/features/assignments/components/SendPositionButton";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { PromotionDialog } from "@/features/chessboard/components/dialogs/PromotionDialog";
import { SetupPositionDialog } from "@/features/chessboard/components/dialogs/SetupPositionDialog";
import { ChessClock } from "@/features/chessboard/components/panels/ChessClock";
import { BoardNavigation, NavIconButton } from "@/features/chessboard/components/toolbars/BoardNavigation";
import { DrawingToolbar } from "@/features/chessboard/components/toolbars/DrawingToolbar";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardShortcuts } from "@/features/chessboard/hooks/useBoardShortcuts";
import { useLoadNextPuzzle } from "../../../hooks/useLoadNextPuzzle";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { PuzzleAssignModal } from "../PuzzleAssignModal";
import { FlipBoardButton } from "../video-grid/FlipBoardButton";
import { RequestControlButton } from "../video-grid/RequestControlButton";

function CoachBoardShortcuts() {
  useBoardShortcuts();
  return null;
}

/** The board half of the classroom layout. Coaches author; students watch (or play with granted control). */
export function ClassroomBoard({ isCoach, stageSwitch }: { isCoach: boolean; stageSwitch: ReactNode }) {
  const fen = useBoardStore((s) => s.fen);
  const { activePuzzle, setPuzzleSolverOpen, isChessboardOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
    "isChessboardOpen",
  );
  const waiting = !isCoach && !isChessboardOpen;

  return (
    // lg+: bottom padding clears the floating toolbar (below lg it floats over the panel).
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-3 pb-3 pt-3 lg:px-6 lg:pb-24">
      <PromotionDialog />
      {isCoach ? (
        <>
          <CoachBoardShortcuts />
          <SetupPositionDialog />
        </>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-app-text">
          <Crown className="size-4 text-amber-500" />
          Shared Board
          {isCoach ? <SendPositionButton fen={fen} className="ml-1" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto">
          <ChessClock layout="horizontal" />
          {!isCoach ? <RequestControlButton /> : null}
          {!isCoach && activePuzzle ? (
            <button
              type="button"
              onClick={() => setPuzzleSolverOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary px-2.5 py-1 text-[11px] font-semibold text-white shadow-card transition active:scale-95"
            >
              <PuzzleIcon className="size-3" strokeWidth={2.5} />
              Solve puzzle
            </button>
          ) : null}
        </div>
        {isCoach ? <DrawingToolbar /> : null}
        <FlipBoardButton className="size-8 shrink-0" />
        {stageSwitch}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
        <div className="relative shadow-card" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
          <ChessgroundBoard />
          {waiting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-app-background/60 backdrop-blur-[2px]">
              <span className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-4 py-2 text-sm font-semibold text-app-muted shadow-card">
                <Loader2 className="size-4 animate-spin" />
                Waiting for your coach&apos;s board…
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {isCoach ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
          <BoardNavigation />
          <CoachPuzzleButtons />
        </div>
      ) : null}
    </section>
  );
}

/** Ask = share a puzzle (opens where the coach left off); Load next = next puzzle onto the board, not shared. */
function CoachPuzzleButtons() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const [assignOpen, setAssignOpen] = useState(false);
  const openAsk = useCallback(() => setAssignOpen(true), []);
  const { loadNext, loading } = useLoadNextPuzzle({ onNoFolder: openAsk });

  return (
    <div className="mt-4 flex items-center gap-2 text-app-muted">
      <SimpleTooltip label="Ask — share a puzzle">
        <NavIconButton
          aria-label="Ask — share a puzzle"
          icon={<PuzzleIcon className="size-4" strokeWidth={2.5} />}
          onClick={openAsk}
        />
      </SimpleTooltip>
      <SimpleTooltip label="Load next puzzle (not shared)">
        <NavIconButton
          aria-label="Load next puzzle"
          icon={
            loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronsRight className="size-4" strokeWidth={2.5} />
            )
          }
          onClick={() => void loadNext()}
          disabled={loading}
        />
      </SimpleTooltip>
      <PuzzleAssignModal classId={classId} open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  );
}
