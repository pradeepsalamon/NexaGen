"use client";

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState, DisconnectReason } from "livekit-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { MeetingLayout } from "../meeting/MeetingLayout";
import { HandRaiseBridge } from "../meeting/HandRaiseBridge";
import { PuzzleBridge } from "../meeting/PuzzleBridge";
import { AudioSessionBridge } from "../meeting/AudioSessionBridge";
import { PipMicCaptureBridge } from "../meeting/PipMicCaptureBridge";
import { MeetingEventToasts } from "../meeting/MeetingEventToasts";
import { LiveClassSettingsBridge } from "../meeting/LiveClassSettingsBridge";
import { WaitingRoomBridge } from "../meeting/WaitingRoomBridge";
import { ScreenShareRequestBridge } from "../meeting/ScreenShareRequestBridge";
import { ChatProvider } from "../../providers/ChatProvider";
import { ConnectionStateManager } from "../../providers/ConnectionStateManager";
import { useClassroomSession } from "../../providers/ClassroomSessionManager";
import { ConnectionLost } from "../states/ErrorStates";
import { ClassSummary } from "../summary/ClassSummary";
import { getWebEnv } from "@nexa-chess/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
});

interface MeetingRoomProps {
  token: string;
  classId: string;
}

// Only the handful of benign strings LiveKit raises when a disconnect we already
// handle in `onDisconnected` also surfaces through `onError`. Matching any
// message containing "disconnect" swallowed genuine failures (AUDIT L7).
const IGNORABLE_ROOM_ERRORS = new Set([
  "client initiated disconnect",
  "a participant with the same identity has been disconnected",
  "room deleted"
]);

function isIgnorableRoomError(message: string) {
  return IGNORABLE_ROOM_ERRORS.has(message.trim().toLowerCase());
}

/**
 * Surfaces LiveKit's own reconnection attempts as a toast instead of tearing
 * the room down and forcing a full re-join (AUDIT H16). LiveKit reconnects
 * transparently; the user just needs to know why the room paused.
 */
function ReconnectToaster() {
  const state = useConnectionState();
  const wasReconnecting = useRef(false);

  useEffect(() => {
    const reconnecting =
      state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
    if (reconnecting) {
      wasReconnecting.current = true;
      toast.loading("Connection interrupted — reconnecting…", { id: "lk-reconnecting" });
    } else if (state === ConnectionState.Connected) {
      toast.dismiss("lk-reconnecting");
      if (wasReconnecting.current) {
        wasReconnecting.current = false;
        toast.success("Reconnected", { duration: 2000 });
      }
    }
  }, [state]);

  return null;
}

export function MeetingRoom({ token, classId }: MeetingRoomProps) {
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const joinToastShown = useRef(false);
  const { clearJoined } = useClassroomSession();

  if (ended) {
    // The class ended (room deleted) while this tab was in the meeting. Show the
    // post-class summary instead of silently bouncing to the dashboard.
    return <ClassSummary classId={classId} />;
  }

  if (error) {
    return (
      <ConnectionLost
        onRetry={() => {
          setError(null);
          // `hasJoined` is persisted in sessionStorage (AUDIT H16), so this
          // reload reconnects straight into the meeting rather than bouncing
          // back to PreJoin.
          window.location.reload();
        }}
      />
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={env.NEXT_PUBLIC_LIVEKIT_URL}
      connect
      audio={false}
      video={false}
      className="flex h-[100dvh] flex-col overflow-hidden"
      data-lk-theme="default"
      onConnected={() => {
        setError(null);
        if (!joinToastShown.current) {
          joinToastShown.current = true;
          toast.success("You joined the class", { duration: 2500 });
        }
      }}
      onDisconnected={(reason) => {
        toast.dismiss("lk-reconnecting");
        if (reason === DisconnectReason.ROOM_DELETED) {
          // The class ended. Clear the flag so a reload doesn't try to rejoin a
          // room that no longer exists, then show everyone the post-class
          // summary (coach/admin get the full report, students their own row).
          clearJoined();
          setEnded(true);
          return;
        }
        if (!reason || reason === DisconnectReason.CLIENT_INITIATED) {
          // Intentional leave — this tab is done with the room.
          clearJoined();
          // getRoleDashboardHref handles ADMIN too (AUDIT L6).
          router.push(getRoleDashboardHref(user?.role));
          return;
        }
        // Reached only after LiveKit exhausted its own reconnection attempts.
        setError(`Disconnected: ${reason}`);
      }}
      onError={(roomError) => {
        if (isIgnorableRoomError(roomError.message)) return;
        setError(roomError.message);
      }}
    >
      <ReconnectToaster />
      <AudioSessionBridge />
      <PipMicCaptureBridge />
      <LiveClassSettingsBridge />
      <WaitingRoomBridge classId={classId} />
      <ScreenShareRequestBridge classId={classId} />
      <HandRaiseBridge />
      <PuzzleBridge classId={classId} />
      <ConnectionStateManager classId={classId}>
        <ChatProvider classId={classId}>
          {/* Inside ChatProvider: it also announces chat arriving with the panel closed. */}
          <MeetingEventToasts />
          <MeetingLayout />
        </ChatProvider>
      </ConnectionStateManager>
      <RoomAudioRenderer />
      <StartAudio label="Click to allow audio playback" />
    </LiveKitRoom>
  );
}

