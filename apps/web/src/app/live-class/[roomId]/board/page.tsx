"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { LiveKitRoom } from "@livekit/components-react";
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

import { useAuthStore } from "@/stores/authStore";

function ForceOpenBoard() {
  const { isChessboardOpen, setIsChessboardOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";
  
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

export default function LiveClassBoardPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  // We automatically set hasJoined to true because the coach is opening this from an active class
  // Pass "board" as clientId so the backend appends _board to the identity, preventing disconnects
  const { token, error, isLoading, classStatus } = useLiveClass(roomId, true, "board");

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

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 flex items-center justify-center h-screen">
        <LoadingMeeting message="Connecting to Board..." />
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
    <div className="flex flex-col h-screen bg-app-background text-foreground">
      <main className="flex-1 min-h-0 relative">
        <LiveKitRoom
          token={token}
          serverUrl={env.NEXT_PUBLIC_LIVEKIT_URL}
          connect={true}
          audio={false}
          video={false}
          className="h-full w-full"
        >
          {/* We wrap it in LiveClassProvider so LiveBoardSyncBridge can access useLiveClassState */}
          <LiveClassProvider topic="Board">
            <BoardProvider>
              <ForceOpenBoard />
              <LiveBoardSyncBridge />
              <BoardWorkspace />
            </BoardProvider>
          </LiveClassProvider>
        </LiveKitRoom>
      </main>
    </div>
  );
}
