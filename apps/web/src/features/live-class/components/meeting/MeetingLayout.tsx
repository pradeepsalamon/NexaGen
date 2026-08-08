"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useParticipants } from "@livekit/components-react";
import { useAuthStore } from "@/stores/authStore";
import { MeetingHeader } from "./MeetingHeader";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useLiveClassState } from "../../providers/LiveClassProvider";

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

  const { setIsChessboardOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  const participants = useParticipants();

  // Watch for the _board participant and coach presence to sync board state for students
  useEffect(() => {
    if (isCoach) return; // Coach controls their own local state/tab
    
    // If the coach has opened the board tab, the _board participant will be in the room
    const hasBoardParticipant = participants.some(p => p.identity.endsWith("_board"));
    
    // Check if at least one coach is in the room
    const hasCoachInRoom = participants.some(p => {
      try {
        if (!p.metadata) return false;
        const meta = JSON.parse(p.metadata);
        return meta.role === "COACH" || meta.role === "SUPER_ADMIN";
      } catch {
        return false;
      }
    });

    // Board is destroyed/hidden if coach stops board OR leaves meeting
    setIsChessboardOpen(hasBoardParticipant && hasCoachInRoom);
  }, [participants, isCoach, setIsChessboardOpen]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background text-app-text pt-16">
      {/* Fixed header */}
      <MeetingHeader />

      {/* Main content — fills remaining space */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Content area — takes all available space */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col relative">
          <AnimatePresence mode="wait">
            <div key="video-grid" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col relative">
              <MeetingVideoGrid />
            </div>
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
