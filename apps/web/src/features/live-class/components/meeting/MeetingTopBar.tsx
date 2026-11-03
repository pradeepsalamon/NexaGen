"use client";

import { memo } from "react";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useRoster } from "../../hooks/useRoster";
import { isHumanParticipant } from "../../lib/participants";
import { ActivityQueueStatusPill } from "../activity-queue/ActivityQueueStatusPill";
import { ClassroomTopBar } from "./ClassroomTopBar";
import { ConnectionChip, LiveChip, RecordingBadge, TimerBadge } from "./MeetingStatus";

/** "Batch A · 12 here": the people in the room right now (spectators and the recorder excluded). */
function useHeadcountLine(batchName: string | null) {
  const roster = useRoster();
  const here = roster.filter(isHumanParticipant).length;
  const count = `${here} here`;
  return batchName ? `${batchName} · ${count}` : count;
}

export const MeetingTopBar = memo(function MeetingTopBar() {
  const { topic, batchName, startedAt, endsAt } = useLiveClassState("topic", "batchName", "startedAt", "endsAt");
  const subtitle = useHeadcountLine(batchName);

  return (
    <ClassroomTopBar
      title={topic || "Live class"}
      subtitle={subtitle}
      openLinksInNewTab
      status={
        <>
          <LiveChip />
          <RecordingBadge />
          <ActivityQueueStatusPill />
        </>
      }
      // Leaving is deliberately only in the control bar: one unmistakable
      // exit, well away from the controls a coach reaches for mid-class.
      actions={
        <>
          <span className="hidden md:contents">
            <ConnectionChip />
          </span>
          <TimerBadge startedAt={startedAt} endsAt={endsAt} />
        </>
      }
    />
  );
});
