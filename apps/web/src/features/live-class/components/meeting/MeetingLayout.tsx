"use client";

import { lazy, Suspense } from "react";
import { AnimatePresence } from "framer-motion";
import { MeetingHeader } from "./MeetingHeader";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";

// Lazy-load chessboard panel for code splitting
const LiveChessboardPanel = lazy(() =>
  import("./LiveChessboardPanel").then((m) => ({ default: m.LiveChessboardPanel })),
);
const LiveBoardSyncBridge = lazy(() =>
  import("./LiveBoardSyncBridge").then((m) => ({ default: m.LiveBoardSyncBridge })),
);

/**
 * Main meeting layout orchestrator.
 *
 * Structure (normal mode):
 *  ┌─────────────────────────────────┐
 *  │  MeetingHeader                  │
 *  ├───────────────────────┬─────────┤
 *  │                       │         │
 *  │  MeetingVideoGrid     │ Sidebar │
 *  │                       │         │
 *  ├───────────────────────┴─────────┤
 *  │  MeetingToolbar (floating)      │
 *  └─────────────────────────────────┘
 *
 * Structure (chessboard mode):
 *  ┌─────────────────────────────────┐
 *  │  MeetingHeader                  │
 *  ├───────────────────────┬─────────┤
 *  │                       │         │
 *  │  LiveChessboardPanel  │ Sidebar │
 *  │                       │         │
 *  ├───────────────────────┤         │
 *  │  VideoFilmstrip       │         │
 *  ├───────────────────────┴─────────┤
 *  │  MeetingToolbar (floating)      │
 *  └─────────────────────────────────┘
 */
export function MeetingLayout() {
  // Register keyboard shortcuts (M, V, Escape)
  useKeyboardShortcuts();

  const { isChessboardOpen } = useLiveClassState();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background text-app-text pt-16">
      {/* Fixed header */}
      <MeetingHeader />

      {/* Main content — fills remaining space */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Content area — takes all available space */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {isChessboardOpen ? (
              <BoardProvider key="board-session">
                <Suspense fallback={null}>
                  <LiveBoardSyncBridge />
                  {/* Chessboard takes the majority of space */}
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <LiveChessboardPanel />
                  </div>
                  {/* Video filmstrip at the bottom */}
                  <div className="shrink-0 border-t border-app-border/60 bg-app-surface/30 backdrop-blur-sm">
                    <MeetingVideoGrid compact />
                  </div>
                </Suspense>
              </BoardProvider>
            ) : (
              <div key="video-grid" className="flex-1 min-h-0 overflow-hidden">
                <MeetingVideoGrid />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar — slides in from right */}
        <MeetingSidebar />
      </main>

      {/* Floating toolbar — positioned from within MeetingToolbar */}
      <MeetingToolbar />
    </div>
  );
}
