"use client";

import { memo } from "react";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ActivityQueueStatusPill } from "../activity-queue/ActivityQueueStatusPill";
import { ClassroomTopBar } from "./ClassroomTopBar";
import { ConnectionPill, RecordingBadge, TimerBadge } from "./MeetingStatus";

export const MeetingTopBar = memo(function MeetingTopBar() {
  const { topic, startedAt, endsAt } = useLiveClassState("topic", "startedAt", "endsAt");

  return (
    <ClassroomTopBar
      title={topic || "Live Class"}
      openLinksInNewTab
      status={
        <span className="flex shrink-0 items-center gap-1.5">
          <RecordingBadge />
          <ActivityQueueStatusPill />
        </span>
      }
      // Leaving is deliberately only in the bottom toolbar: one unmistakable
      // exit, well away from the controls a coach reaches for mid-class.
      actions={
        <>
          <ConnectionPill />
          <TimerBadge startedAt={startedAt} endsAt={endsAt} />
        </>
      }
    />
  );
});
