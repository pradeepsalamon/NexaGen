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
import { useAuthStore } from "@/stores/authStore";
import { MeetingLayout } from "../meeting/MeetingLayout";
import { ChatProvider } from "../../providers/ChatProvider";
import { ConnectionLost } from "../states/ErrorStates";
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

function isIgnorableRoomError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "client initiated disconnect" ||
    normalized.includes("disconnect")
  );
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
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  
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
        if (
          !reason ||
          reason === DisconnectReason.CLIENT_INITIATED ||
          reason === DisconnectReason.ROOM_DELETED
        ) {
          // Intentional leave / room closed — this tab is done with the room.
          clearJoinedSession(classId);
          const homeHref = user?.role === "SUPER_ADMIN" ? "/admin" : user?.role === "COACH" ? "/coach" : "/student";
          router.push(homeHref);
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

