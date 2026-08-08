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
import { Header } from "@/components/layout/Header";

export default function LiveClassPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [hasJoined, setHasJoined] = useState(false);
  const { token, topic, error, isLoading, classStatus } = useLiveClass(roomId, hasJoined);

  const headerCenter = (
    <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
      {topic || "Live Class"}
    </h1>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
          <LoadingMeeting message="Preparing your Live Class..." />
        </div>
      </div>
    );
  }

  if (error) {
    const errorStr = error.toLowerCase();

    if (errorStr.includes("not been started") || classStatus === "SCHEDULED") {
      return (
        <div className="flex flex-col h-screen">
          <Header centerSlot={headerCenter} />
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
            <ClassNotStarted roomId={roomId} onRetry={() => window.location.reload()} />
          </div>
        </div>
      );
    }

    if (errorStr.includes("not authorized") || errorStr.includes("permission")) {
      return (
        <div className="flex flex-col h-screen">
          <Header centerSlot={headerCenter} />
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
            <PermissionDenied />
          </div>
        </div>
      );
    }

    if (errorStr.includes("ended") || classStatus === "COMPLETED" || classStatus === "CANCELLED") {
      return (
        <div className="flex flex-col h-screen">
          <Header centerSlot={headerCenter} />
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
            <RoomEnded />
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
          <ConnectionLost onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16">
          <PreJoinCard topic={topic} status={classStatus as any} onJoin={() => setHasJoined(true)} />
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex flex-col h-screen">
        <Header centerSlot={headerCenter} />
        <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 pt-16 flex items-center justify-center">
          <LoadingMeeting message="Connecting..." />
        </div>
      </div>
    );
  }

  return (
    <LiveClassProvider topic={topic}>
      <MeetingRoom token={token} classId={roomId} />
    </LiveClassProvider>
  );
}
