"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
} from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { MeetingLayout } from "../meeting/MeetingLayout";
import { ChatProvider } from "../../providers/ChatProvider";
import { ConnectionLost } from "../states/ErrorStates";
import { getWebEnv } from "@nexa-gen/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL,
});

interface MeetingRoomProps {
  token: string;
}

function isIgnorableRoomError(message: string) {
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "client initiated disconnect" ||
    normalized.includes("disconnect")
  );
}

export function MeetingRoom({ token }: MeetingRoomProps) {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  
  if (error) {
    return (
      <ConnectionLost 
        onRetry={() => {
          setError(null);
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
        if (!reason || reason === DisconnectReason.CLIENT_INITIATED) {
          const homeHref = user?.role === "SUPER_ADMIN" ? "/admin" : user?.role === "COACH" ? "/coach" : "/dashboard/student";
          router.push(homeHref);
          return;
        }
        setError(`Disconnected: ${reason}`);
      }}
      onError={(roomError) => {
        if (isIgnorableRoomError(roomError.message)) return;
        setError(roomError.message);
      }}
    >
      <ChatProvider>
        <MeetingLayout />
      </ChatProvider>
      <RoomAudioRenderer />
      <StartAudio label="Click to allow audio playback" />
    </LiveKitRoom>
  );
}
