import { Crown } from "lucide-react";
import { SendPositionButton } from "@/features/assignments/components/SendPositionButton";
import { useBoardStore } from "../../context/BoardProvider";
import { ChessgroundBoard } from "../board/ChessgroundBoard";
import { DrawingToolbar } from "../toolbars/DrawingToolbar";
import { PromotionDialog } from "../dialogs/PromotionDialog";
import { SetupPositionDialog } from "../dialogs/SetupPositionDialog";
import { useBoardShortcuts } from "../../hooks/useBoardShortcuts";
import { BoardNavigation } from "../toolbars/BoardNavigation";
import { ChessClock } from "../panels/ChessClock";
import { SidebarTabs } from "../panels/SidebarTabs";

export function BoardWorkspace() {
  useBoardShortcuts();
  const fen = useBoardStore((state) => state.fen);

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-transparent text-app-text p-0 md:p-4 overflow-hidden gap-4">

      {/* Left: Board Area */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col md:h-full">
        <PromotionDialog />

        {/* Header row — keeps the clock above the board instead of floating over it */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pt-3 md:px-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-app-text">
            <Crown className="size-4 text-secondary-ink" />
            <span>Shared Board</span>
            <SendPositionButton fen={fen} className="ml-1" />
          </div>
          <ChessClock
            layout="horizontal"
            className="rounded-control border border-app-border bg-app-surface/95 px-1.5 py-1 shadow-card backdrop-blur"
          />
        </div>

        <div
          className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center px-4 md:px-8"
          style={{ containerType: "size" }}
        >
          <div className="absolute inset-0 m-auto flex flex-col items-center justify-center">
            {/* The board itself, bounded by a square */}
            <div
              className="overflow-hidden bg-[#e0d8c8] shadow-card"
              style={{
                width: "min(100cqw - 2rem, 100cqh - 5rem)",
                height: "min(100cqw - 2rem, 100cqh - 5rem)",
              }}
            >
              <ChessgroundBoard />
            </div>

            {/* Board Navigation Row */}
            <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-3">
              <BoardNavigation />
              <DrawingToolbar />
            </div>
          </div>
        </div>
      </div>

      {/* Right Sidebar Area */}
      <div className="w-full h-[46dvh] md:w-[480px] lg:w-[550px] flex-shrink-0 bg-app-surface shadow-card border border-app-border md:h-full flex flex-col overflow-hidden">
        <SidebarTabs />
      </div>

      <SetupPositionDialog />
    </div>
  );
}
