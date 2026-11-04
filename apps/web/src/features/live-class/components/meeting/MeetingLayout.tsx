"use client";

import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { MeetingTopBar } from "./MeetingTopBar";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useClassroomPresentation } from "../../hooks/useClassroomPresentation";
import { useCoachBoardOpen } from "../../hooks/useCoachBoardOpen";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";
import { PromotionDialog } from "@/features/chessboard/components/dialogs/PromotionDialog";
import { LiveBoardSyncBridge } from "./LiveBoardSyncBridge";
import { BoardControlToasts } from "./BoardControlToasts";
import { MiniPlayer } from "./MiniPlayer";
import { VideoPipSurface } from "./VideoPipSurface";
import { PipProvider } from "../../providers/PipProvider";
import { useIsBoardViewport } from "../../hooks/useIsBoardViewport";
import { ClassroomLayout } from "./classroom/ClassroomLayout";
import { InteractivesProvider } from "./interactives/InteractivesProvider";
import { InteractivePhoneStage, useInteractiveStageShown } from "./interactives/InteractiveStage";

/** Room-wide hooks, rendered as a leaf so their LiveKit / store updates don't re-render the layout. */
function MeetingLayoutEffects({ autoShare }: { autoShare: boolean }) {
  useKeyboardShortcuts();
  useCoachBoardOpen({ autoShare });
  useClassroomPresentation();
  return null;
}

/**
 * Phones: the video grid (with its Board / Video switch and full-stage board,
 * for the coach as well as students), or — while an Interactive is open —
 * that tool in its place. The grid stays mounted, only hidden, so going back
 * keeps its board / spotlight state.
 */
function PhoneStage({ toolbar }: { toolbar: React.ReactNode }) {
  const toolShown = useInteractiveStageShown();
  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden" data-classroom-stage>
      {/* A promotion on the phone board (coach, or a student with control) needs its picker. */}
      <PromotionDialog />
      <div
        className={cn(
          "custom-scrollbar relative flex min-h-0 flex-1 flex-col overflow-y-auto",
          toolShown && "hidden",
        )}
      >
        <MeetingVideoGrid />
      </div>
      {toolShown ? <InteractivePhoneStage /> : null}
      {toolbar}
    </div>
  );
}

/**
 * Main meeting layout orchestrator.
 *
 * md and up is a single page — `ClassroomLayout`: board (or video grid) on
 * the left, video + one tab bar on the right. The coach's board is always
 * shared, on every screen size. Phones keep the video grid with a Board /
 * Video switch whose board is the full-stage `BoardStage`.
 * Interactives always open in the board's place (a stage tab on md+, the
 * grid's place on phones), never as a floating panel.
 */
export function MeetingLayout() {
  const wide = useIsBoardViewport();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const classroom = wide;

  return (
    <PipProvider>
      <InteractivesProvider>
        <MeetingLayoutEffects autoShare />
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background pt-12 text-app-text md:pt-14">
          <MeetingTopBar />

          <main className="relative flex flex-1 overflow-hidden">
            <BoardProvider>
              <LiveBoardSyncBridge>
                <BoardControlToasts />
                {/* The control bar floats over the stage (never over the panel), so the stage hosts it. */}
                {classroom ? (
                  <ClassroomLayout isCoach={isCoach} toolbar={<MeetingToolbar />} />
                ) : (
                  <PhoneStage toolbar={<MeetingToolbar />} />
                )}
              </LiveBoardSyncBridge>
            </BoardProvider>

            <MeetingSidebar inlinePanels={classroom} />
          </main>

        </div>
      </InteractivesProvider>

      {/* Whichever mini player this browser supports; each no-ops otherwise. */}
      <MiniPlayer />
      <VideoPipSurface />
    </PipProvider>
  );
}
