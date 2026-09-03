"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLiveClass } from "@/features/live-class/hooks/useLiveClass";
import { hasJoinedSession, markJoinedSession } from "@/features/live-class/lib/joinedSession";
import { LiveClassProvider } from "@/features/live-class/providers/LiveClassProvider";
import { MeetingRoom } from "@/features/live-class/components/room/MeetingRoom";
import { PreJoinCard } from "@/features/live-class/components/prejoin/PreJoinCard";
import { LoadingMeeting } from "@/features/live-class/components/states/LoadingMeeting";
import { ClassroomStateShell } from "@/features/live-class/components/states/ClassroomStateShell";
import {
  ConnectionLost,
  PermissionDenied,
  ClassNotStarted,
  WaitingForCoach,
} from "@/features/live-class/components/states/ErrorStates";
import { ClassSummary } from "@/features/live-class/components/summary/ClassSummary";

export default function LiveClassPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [hasJoined, setHasJoined] = useState(false);
  const { token, topic, settings, error, errorCode, isLoading, classStatus, startedAt, endsAt, retry } =
    useLiveClass(roomId, hasJoined);

  // Rehydrate the "already joined" flag so a mid-class refresh / reconnect
  // reload skips PreJoin instead of forcing a full re-join (AUDIT H16). Done in
  // an effect (not lazy init) to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    if (hasJoinedSession(roomId)) setHasJoined(true);
  }, [roomId]);

  const join = () => {
    markJoinedSession(roomId);
    setHasJoined(true);
  };

  if (isLoading) {
    return (
      <ClassroomStateShell topic={topic}>
        <LoadingMeeting message="Preparing your Live Class…" />
      </ClassroomStateShell>
    );
  }

  if (error) {
    const errorStr = error.toLowerCase();

    if (errorStr.includes("not been started") || classStatus === "SCHEDULED") {
      return (
        <ClassroomStateShell topic={topic}>
          <ClassNotStarted roomId={roomId} onRetry={() => window.location.reload()} />
        </ClassroomStateShell>
      );
    }

    if (errorCode === "COACH_NOT_JOINED") {
      return (
        <ClassroomStateShell topic={topic}>
          <WaitingForCoach onRetry={retry} />
        </ClassroomStateShell>
      );
    }

    if (errorStr.includes("not authorized") || errorStr.includes("permission")) {
      return (
        <ClassroomStateShell topic={topic}>
          <PermissionDenied />
        </ClassroomStateShell>
      );
    }

    if (errorStr.includes("ended") || classStatus === "COMPLETED" || classStatus === "CANCELLED") {
      return <ClassSummary classId={roomId} />;
    }

    return (
      <ClassroomStateShell topic={topic}>
        <ConnectionLost onRetry={() => window.location.reload()} />
      </ClassroomStateShell>
    );
  }

  if (!hasJoined) {
    return (
      <ClassroomStateShell topic={topic}>
        <PreJoinCard
          topic={topic}
          startedAt={startedAt}
          endsAt={endsAt}
          status={classStatus as never}
          onJoin={join}
        />
      </ClassroomStateShell>
    );
  }

  if (!token) {
    return (
      <ClassroomStateShell topic={topic}>
        <LoadingMeeting message="Connecting…" />
      </ClassroomStateShell>
    );
  }

  return (
    <LiveClassProvider topic={topic} startedAt={startedAt} endsAt={endsAt} settings={settings}>
      <MeetingRoom token={token} classId={roomId} />
    </LiveClassProvider>
  );
}
