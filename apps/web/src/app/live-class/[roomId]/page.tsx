"use client";

import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { resolveJoinState } from "@nexa-chess/types";
import { useLiveClass } from "@/features/live-class/hooks/useLiveClass";
import { hasJoinedSession, markJoinedSession } from "@/features/live-class/lib/joinedSession";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
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

  const user = useAuthStore((state) => state.user);
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);

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

  // Auto-join: when the class policy enables it, skip the pre-join card. A
  // device that is meant to be on is pre-flighted first — if the browser
  // denies it, we fall back to the card so the student can sort it out.
  const autoJoinTried = useRef(false);
  useEffect(() => {
    if (hasJoined || autoJoinTried.current || isLoading || error || !settings) return;
    const joinState = resolveJoinState(settings, isStaff ? "COACH" : "STUDENT");
    if (!joinState.autoJoin) return;
    autoJoinTried.current = true;
    void (async () => {
      const wantMic = joinState.mic.defaultOn;
      const wantCam = joinState.camera.defaultOn;
      if ((wantMic || wantCam) && typeof navigator !== "undefined" && navigator.mediaDevices) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: wantMic,
            video: wantCam,
          });
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          return; // permissions denied — show the pre-join card instead
        }
      }
      join();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- join is stable enough; ref guards re-entry
  }, [hasJoined, isLoading, error, settings, isStaff]);

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
          settings={settings}
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
