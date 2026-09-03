"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Crown } from "lucide-react";
import { LiveKitRoom } from "@livekit/components-react";
import { Button } from "@/components/ui/Button";
import { BoardWorkspace } from "@/features/chessboard/components/layout/BoardWorkspace";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";
import { useLiveClass } from "@/features/live-class/hooks/useLiveClass";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { ConnectionLost, PermissionDenied, ClassNotStarted } from "@/features/live-class/components/states/ErrorStates";
import { getWebEnv } from "@nexa-chess/config/web";
import { LiveBoardSyncBridge } from "@/features/live-class/components/meeting/LiveBoardSyncBridge";
import { LiveClassProvider, useLiveClassState } from "@/features/live-class/providers/LiveClassProvider";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
});

import { isStaffRole, useAuthStore } from "@/stores/authStore";

function ForceOpenBoard() {
  const { isChessboardOpen, setIsChessboardOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  
  // Force the local LiveClassProvider to think the board is open
  // so that LiveBoardSyncBridge properly broadcasts state and permissions.
  // Must run as an effect — calling setState during render triggers React's
  // "Cannot update a component while rendering a different component" warning
  // and can loop (AUDIT H22).
  useEffect(() => {
    if (!isChessboardOpen && isCoach) {
      setIsChessboardOpen(true);
    }
  }, [isChessboardOpen, isCoach, setIsChessboardOpen]);
  return null;
}

/**
 * The shared board is a desktop/tablet authoring surface (chessground + engine
 * panels). On phones we never mount `BoardWorkspace` or its LiveKit room — the
 * coach gets a "use a larger screen" notice and students use the responsive
 * inline board tile / full-screen view inside the meeting instead.
 *
 * `null` = not yet measured (matches the SSR output, so no hydration mismatch).
 */
function useIsBoardViewport() {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  return isDesktop;
}

export default function LiveClassBoardPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const isDesktop = useIsBoardViewport();

  // We automatically set hasJoined to true because the coach is opening this from an active class
  // Pass "board" as clientId so the backend appends _board to the identity, preventing disconnects
  const { token, settings, error, isLoading, classStatus } = useLiveClass(
    roomId,
    isDesktop === true,
    "board",
  );

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return;
    try {
      const channel = new BroadcastChannel(`live-class-board-${roomId}`);
      channel.onmessage = (e) => {
        if (e.data?.type === "CLOSE_BOARD_TAB") {
          window.close();
        }
      };
      return () => channel.close();
    } catch {}
  }, [roomId]);

  if (isDesktop === null) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-app-background">
        <LoadingMeeting message="Loading Board..." />
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-app-background px-6 text-center text-app-text">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <Crown className="size-8 text-amber-500" strokeWidth={2} />
        </span>
        <h1 className="text-lg font-bold">Shared Board</h1>
        <p className="max-w-xs text-sm text-app-muted">
          Please open the shared board on a laptop or desktop for the full teaching
          experience. You can keep running the class from your phone in the meeting
          tab.
        </p>
        <Button asChild variant="outline">
          <a href={`/live-class/${roomId}`}>Back to Live Class</a>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-app-background">
        <LoadingMeeting message="Connecting to board…" />
      </div>
    );
  }

  if (error) {
    const errorStr = error.toLowerCase();
    if (errorStr.includes("not been started") || classStatus === "SCHEDULED") {
      return <ClassNotStarted roomId={roomId} onRetry={() => window.location.reload()} />;
    }
    if (errorStr.includes("not authorized") || errorStr.includes("permission")) {
      return <PermissionDenied />;
    }
    return <ConnectionLost onRetry={() => window.location.reload()} />;
  }

  if (!token) {
    return null;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-app-background text-app-text">
      <main className="relative min-h-0 flex-1">
        <LiveKitRoom
          token={token}
          serverUrl={env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={true}
          audio={false}
          video={false}
          className="h-full w-full"
        >
          {/* LiveClassProvider so LiveBoardSyncBridge can access useLiveClassState */}
          <LiveClassProvider topic="Board" settings={settings}>
            <BoardProvider>
              <LiveBoardSyncBridge>
                <ForceOpenBoard />
                <BoardWorkspace />
              </LiveBoardSyncBridge>
            </BoardProvider>
          </LiveClassProvider>
        </LiveKitRoom>
      </main>
    </div>
  );
}
