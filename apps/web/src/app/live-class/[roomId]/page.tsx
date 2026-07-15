"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLiveClass } from "@/features/live-class/hooks/useLiveClass";
import { LiveClassProvider } from "@/features/live-class/providers/LiveClassProvider";
import { MeetingRoom } from "@/features/live-class/components/room/MeetingRoom";
import { PreJoinCard } from "@/features/live-class/components/prejoin/PreJoinCard";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { ConnectionLost, PermissionDenied, RoomEnded, ClassNotStarted } from "@/features/live-class/components/states/ErrorStates";

export default function LiveClassPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [hasJoined, setHasJoined] = useState(false);
  const { token, topic, error, isLoading } = useLiveClass(roomId, hasJoined);

  if (!hasJoined) {
    return (
      <PreJoinCard 
        onJoin={() => setHasJoined(true)} 
      />
    );
  }

  if (isLoading) {
    return <LoadingMeeting message="Preparing your Live Class..." />;
  }

  if (error) {
    const errorStr = error.toLowerCase();
    
    if (errorStr.includes("not been started")) {
      return <ClassNotStarted onRetry={() => window.location.reload()} />;
    }
    
    if (errorStr.includes("not authorized") || errorStr.includes("permission")) {
      return <PermissionDenied />;
    }
    
    if (errorStr.includes("ended")) {
      return <RoomEnded />;
    }
    
    return (
      <ConnectionLost 
        onRetry={() => window.location.reload()} 
      />
    );
  }

  if (!token) {
    return <LoadingMeeting message="Connecting..." />;
  }



  return (
    <LiveClassProvider topic={topic}>
      <MeetingRoom token={token} />
    </LiveClassProvider>
  );
}
