"use client";

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import {
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Crown,
  User,
} from "lucide-react";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { DrawingToolbar } from "@/features/chessboard/components/toolbars/DrawingToolbar";
import { PromotionDialog } from "@/features/chessboard/components/dialogs/PromotionDialog";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useAuthStore } from "@/stores/authStore";
import { useParticipants } from "@livekit/components-react";

// ─── Board Control Badge ─────────────────────────────────────

function BoardControlBadge() {
  const { boardControlStudentId } = useLiveClassState();
  const participants = useParticipants();

  const controllerName = useMemo(() => {
    if (!boardControlStudentId) return "Coach";
    const p = participants.find((p) => p.identity === boardControlStudentId);
    return p?.name || p?.identity || "Student";
  }, [boardControlStudentId, participants]);

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-app-surface/80 border border-app-border px-3 py-1.5 backdrop-blur-md shadow-sm">
      {boardControlStudentId ? (
        <User className="size-3.5 text-emerald-500" />
      ) : (
        <Crown className="size-3.5 text-amber-500" />
      )}
      <span className="text-xs font-semibold text-app-text">
        {controllerName}
      </span>
      <span className="text-[10px] text-app-muted">has control</span>
    </div>
  );
}

// ─── Compact Navigation Bar ──────────────────────────────────

const CompactBoardNav = memo(function CompactBoardNav() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  const { undo, redo, reset, setOrientation, orientation, historyIndex, moveHistory } =
    useBoardStore();

  if (!isCoach) return null;

  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < moveHistory.length - 1;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={reset}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
        aria-label="Reset board"
        title="Reset"
      >
        <ChevronsLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Undo"
        title="Undo"
      >
        <ChevronLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Redo"
        title="Redo"
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        type="button"
        onClick={reset}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
        aria-label="Go to end"
        title="Go to end"
      >
        <ChevronsRight className="size-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-app-border" aria-hidden="true" />

      <button
        type="button"
        onClick={() => setOrientation(orientation === "white" ? "black" : "white")}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
        aria-label="Flip board"
        title="Flip board"
      >
        <FlipVertical2 className="size-4" />
      </button>
      <button
        type="button"
        onClick={reset}
        className="flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
        aria-label="New game"
        title="New game"
      >
        <RotateCcw className="size-4" />
      </button>
    </div>
  );
});

// ─── Main Panel ──────────────────────────────────────────────

export const LiveChessboardPanel = memo(function LiveChessboardPanel() {
  const { toggleChessboard } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="flex flex-1 flex-col items-center justify-center relative h-full w-full overflow-hidden"
    >
      {/* Top bar: control badge + close */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <BoardControlBadge />
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          {isCoach && (
            <div className="bg-app-surface/80 border border-app-border rounded-xl backdrop-blur-md shadow-sm p-1">
              <DrawingToolbar />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              toggleChessboard();
              try {
                window.close();
              } catch {}
            }}
            className="flex size-9 items-center justify-center rounded-xl border border-app-border bg-app-surface/80 text-app-muted shadow-sm backdrop-blur-md transition-all hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
            aria-label="Close chessboard"
            title="Close chessboard"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Promotion dialog */}
      <PromotionDialog />

      {/* Board container — maintains square aspect ratio */}
      <div
        className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 relative min-h-0"
      >
        <div className="flex flex-col items-center justify-center gap-3 w-full h-full min-h-0">
          {/* The board itself */}
          <div className="aspect-square max-h-[85%] max-w-full rounded-xl shadow-lg overflow-hidden border border-app-border/50 bg-[#e0d8c8] flex-shrink-0">
            <ChessgroundBoard />
          </div>

          {/* Navigation bar (coach-only) */}
          <div className="flex items-center justify-center shrink-0">
            <div className="bg-app-surface/80 border border-app-border rounded-xl backdrop-blur-md shadow-sm px-2 py-1">
              <CompactBoardNav />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
