"use client";

import { MeetingTopBar } from "./MeetingTopBar";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { ConnectionBanner } from "./MeetingStatus";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useCoachBoardOpen } from "../../hooks/useCoachBoardOpen";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";
import { LiveBoardSyncBridge } from "./LiveBoardSyncBridge";

/**
 * Main meeting layout orchestrator.
 *
 *  ┌─────────────────────────────────┐
 *  │  MeetingTopBar                  │
 *  ├───────────────────────┬─────────┤
 *  │  MeetingVideoGrid     │ Sidebar │
 *  ├───────────────────────┴─────────┤
 *  │  MeetingToolbar (floating)      │
 *  └─────────────────────────────────┘
 *
 * The coach's shared board opens in its own tab (`/live-class/:id/board`); the
 * meeting screen stays a meeting. Students see a synced board tile inside
 * `MeetingVideoGrid` while the coach has it open.
 */
export function MeetingLayout() {
  useKeyboardShortcuts();
  useCoachBoardOpen();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background pt-14 text-app-text">
      <MeetingTopBar />
      <ConnectionBanner />

      <main className="relative flex flex-1 overflow-hidden">
        <BoardProvider>
          <LiveBoardSyncBridge>
            <div className="relative flex flex-1 flex-col overflow-hidden">
              <div className="custom-scrollbar relative flex flex-1 flex-col overflow-y-auto">
                <MeetingVideoGrid />
              </div>
            </div>
          </LiveBoardSyncBridge>
        </BoardProvider>

        <MeetingSidebar />
      </main>

      <MeetingToolbar />
    </div>
  );
}
