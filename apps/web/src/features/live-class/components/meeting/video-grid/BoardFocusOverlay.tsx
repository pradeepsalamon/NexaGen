"use client";

import { createPortal } from "react-dom";
import { Crown, Minimize2 } from "lucide-react";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { ChessClock } from "@/features/chessboard/components/panels/ChessClock";
import { RequestControlButton } from "./RequestControlButton";

export function BoardFocusOverlay({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-background/95 p-4 backdrop-blur-md">
      <div className="relative flex h-full w-full max-w-7xl flex-col gap-3">
        {/* Header bar */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-app-text font-semibold">
            <Crown className="size-4 text-amber-500" />
            <span>Shared Board</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChessClock layout="horizontal" />
            <RequestControlButton />
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-4 py-2 text-sm font-medium text-app-text shadow-sm transition-colors hover:bg-app-soft"
              onClick={onClose}
            >
              <Minimize2 className="size-4" />
              Exit full screen
            </button>
          </div>
        </div>

        {/* Board container — square, centered, uses same BoardProvider context */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-app-border bg-app-surface shadow-2xl flex items-center justify-center">
          <div className="h-full aspect-square max-w-full">
            <ChessgroundBoard />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
