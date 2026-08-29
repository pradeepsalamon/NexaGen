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
import { getRoleDashboardHref, isStaffRole, useAuthStore } from "@/stores/authStore";
import { MeetingLayout } from "../meeting/MeetingLayout";
import { ChatProvider } from "../../providers/ChatProvider";
import { ConnectionLost, RoomEnded } from "../states/ErrorStates";
import { clearJoinedSession } from "../../lib/joinedSession";
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

  if (ended) {
    // The coach ended the class (room deleted) while this tab was in the
    // meeting. Show an explicit "class ended" screen instead of silently
    // bouncing the student to their dashboard.
    return <RoomEnded />;
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
      onConnected={() => setError(null)}
      onDisconnected={(reason) => {
        toast.dismiss("lk-reconnecting");
        if (reason === DisconnectReason.ROOM_DELETED) {
          // The coach ended the class. Clear the flag so a reload doesn't try to
          // rejoin a room that no longer exists. Students land on an explicit
          // "class ended" screen instead of a silent redirect; staff (who just
          // clicked "End class") are sent straight back to their dashboard.
          clearJoinedSession(classId);
          if (isStaffRole(user?.role)) {
            router.push(getRoleDashboardHref(user?.role));
          } else {
            setEnded(true);
          }
          return;
        }
        if (!reason || reason === DisconnectReason.CLIENT_INITIATED) {
          // Intentional leave — this tab is done with the room.
          clearJoinedSession(classId);
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
      <ChatProvider classId={classId}>
        <MeetingLayout />
      </ChatProvider>
      <RoomAudioRenderer />
      <StartAudio label="Click to allow audio playback" />
    </LiveKitRoom>
  );
}

