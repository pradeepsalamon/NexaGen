"use client";

import { useEffect } from "react";
import { useParticipants } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { MeetingHeader } from "./MeetingHeader";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";
import { LiveBoardSyncBridge } from "./LiveBoardSyncBridge";

/**
 * Main meeting layout orchestrator.
 *
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
 * The coach's shared board opens in its own tab (`/live-class/:id/board`); the
 * meeting screen stays a meeting. Students see a synced board tile inside
 * `MeetingVideoGrid` while the coach has it open.
 */
export function MeetingLayout() {
  // Register keyboard shortcuts (M, V, Escape)
  useKeyboardShortcuts();

  const { setIsChessboardOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const participants = useParticipants();

  // Watch for coach presence and their isChessboardOpen attribute to sync board state for students
  useEffect(() => {
    if (isCoach) return; // Coach controls their own local state
    
    // Check if at least one coach in the room has the board open
    const isBoardOpenByCoach = participants.some(p => {
      let isCoachRole = false;
      try {
        if (p.metadata) {
          const meta = JSON.parse(p.metadata);
          isCoachRole = meta.role === "COACH" || isStaffRole(meta.role);
        }
      } catch {}
      
      const isOpenAttr = p.attributes?.isChessboardOpen === "true";
      return isCoachRole && isOpenAttr;
    });

    // Board is destroyed/hidden if coach stops board OR leaves meeting
    setIsChessboardOpen(isBoardOpenByCoach);
  }, [participants, isCoach, setIsChessboardOpen]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background text-app-text pt-16">
      {/* Fixed header */}
      <MeetingHeader />

      {/* Main content — fills remaining space */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Content area — takes all available space */}
        <BoardProvider>
          <LiveBoardSyncBridge>
            <div className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col relative">
                <MeetingVideoGrid />
              </div>
            </div>
          </LiveBoardSyncBridge>
        </BoardProvider>

        {/* Sidebar — slides in from right */}
        <MeetingSidebar />
      </main>

      {/* Floating toolbar — positioned from within MeetingToolbar */}
      <MeetingToolbar />
    </div>
  );
}
