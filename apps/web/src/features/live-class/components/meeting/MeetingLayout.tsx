"use client";

import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { MeetingTopBar } from "./MeetingTopBar";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { ConnectionBanner } from "./MeetingStatus";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useCoachBoardOpen } from "../../hooks/useCoachBoardOpen";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";
import { LiveBoardSyncBridge } from "./LiveBoardSyncBridge";
import { BoardControlToasts } from "./BoardControlToasts";
import { MiniPlayer } from "./MiniPlayer";
import { VideoPipSurface } from "./VideoPipSurface";
import { PipProvider } from "../../providers/PipProvider";
import { useIsBoardViewport } from "../../hooks/useIsBoardViewport";
import { ClassroomLayout, CLASSROOM_PANEL_OFFSET } from "./classroom/ClassroomLayout";

/** Room-wide hooks, rendered as a leaf so their LiveKit / store updates don't re-render the layout. */
function MeetingLayoutEffects({ autoShare }: { autoShare: boolean }) {
  useKeyboardShortcuts();
  useCoachBoardOpen({ autoShare });
  return null;
}

/**
 * Main meeting layout orchestrator.
 *
 * md and up is a single page — `ClassroomLayout`: board (or video grid) on
 * the left, video + one tab bar on the right, the coach's board always shared.
 * Phones keep the video grid, with the student's full-stage `BoardStage`.
 */
export function MeetingLayout() {
  const wide = useIsBoardViewport();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const classroom = wide;

  return (
    <PipProvider>
      <MeetingLayoutEffects autoShare={wide} />
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background pt-16 text-app-text">
        <MeetingTopBar />
        <ConnectionBanner />

        <main className="relative flex flex-1 overflow-hidden">
          <BoardProvider>
            <LiveBoardSyncBridge>
              <BoardControlToasts />
              {classroom ? (
                <ClassroomLayout isCoach={isCoach} />
              ) : (
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                  <div className="custom-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto">
                    <MeetingVideoGrid />
                  </div>
                </div>
              )}
            </LiveBoardSyncBridge>
          </BoardProvider>

          <MeetingSidebar inlinePanels={classroom} />
        </main>

        {/* In the classroom layout the toolbar centres on the board, clear of the side panel. */}
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 top-0", classroom && CLASSROOM_PANEL_OFFSET)}>
          <MeetingToolbar />
        </div>
      </div>

      {/* Whichever mini player this browser supports; each no-ops otherwise. */}
      <MiniPlayer />
      <VideoPipSurface />
    </PipProvider>
  );
}
