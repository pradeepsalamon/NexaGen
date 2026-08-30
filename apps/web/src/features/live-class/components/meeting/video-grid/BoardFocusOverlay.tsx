"use client";

import { createPortal } from "react-dom";
import { Crown, Minimize2 } from "lucide-react";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { ChessClock } from "@/features/chessboard/components/panels/ChessClock";
import { RequestControlButton } from "./RequestControlButton";

export function BoardFocusOverlay({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-background/95 p-2 backdrop-blur-md sm:p-4">
      <div className="relative flex h-full w-full max-w-7xl flex-col gap-2 sm:gap-3">
        {/* Header bar — stays a single compact row on phones */}
        <div className="flex shrink-0 items-center justify-between gap-1.5">
          <div className="hidden shrink-0 items-center gap-2 text-sm font-semibold text-app-text sm:flex">
            <Crown className="size-4 text-amber-500" />
            <span>Shared Board</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto sm:flex-none sm:justify-end">
            <ChessClock layout="horizontal" />
            <RequestControlButton />
          </div>
          <button
            type="button"
            className="flex shrink-0 items-center gap-2 rounded-full border border-app-border bg-app-surface px-3 py-2 text-sm font-medium text-app-text shadow-sm transition-colors hover:bg-app-soft sm:px-4"
            onClick={onClose}
            aria-label="Exit full screen"
          >
            <Minimize2 className="size-4" />
            <span className="hidden sm:inline">Exit full screen</span>
          </button>
        </div>

        {/* Board container — square, centered, uses same BoardProvider context */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl flex items-center justify-center">
          <div className="aspect-square w-full sm:h-full sm:w-auto sm:max-w-full">
            <ChessgroundBoard />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
