"use client";

import { memo } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ClassroomTopBar } from "./ClassroomTopBar";
import { ConnectionPill, RecordingBadge, TimerBadge } from "./MeetingStatus";

export const MeetingTopBar = memo(function MeetingTopBar() {
  const { topic, startedAt, endsAt } = useLiveClassState();

  return (
    <ClassroomTopBar
      title={topic || "Live Class"}
      status={
        <span className="flex shrink-0 items-center gap-1.5">
          <RecordingBadge />
        </span>
      }
      // Leaving is deliberately only in the bottom toolbar: one unmistakable
      // exit, well away from the controls a coach reaches for mid-class.
      actions={
        <>
          <ConnectionPill />
          <TimerBadge startedAt={startedAt} endsAt={endsAt} />
          <span className="hidden md:block">
            <ThemeToggle />
          </span>
        </>
      }
    />
  );
});
