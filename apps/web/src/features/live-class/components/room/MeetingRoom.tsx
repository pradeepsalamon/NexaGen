"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
} from "@livekit/components-react";
import { DisconnectReason } from "livekit-client";
import { RoomLayout } from "./RoomLayout";
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
  
  if (error) {
    return (
      <ConnectionLost 
        onRetry={() => {
          setError(null);
          window.location.reload(); // Simple retry strategy for now
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
          return;
        }
        setError(`Disconnected: ${reason}`);
      }}
      onError={(roomError) => {
        if (isIgnorableRoomError(roomError.message)) return;
        setError(roomError.message);
      }}
    >
      <RoomLayout />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
