"use client";

import { memo } from "react";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { TimerBadge, LiveBadge, RecordingBadge } from "./MeetingStatus";
import { Header } from "@/components/layout/Header";

export const MeetingHeader = memo(function MeetingHeader() {
  const { topic, startedAt, endsAt } = useLiveClassState();

  const leftSlot = (
    <div className="flex min-w-0 items-center gap-2">
      <LiveBadge className="hidden sm:flex shrink-0" />
      <RecordingBadge className="hidden sm:flex shrink-0" />
    </div>
  );

  const centerSlot = (
    <h1 className="max-w-[46vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-[40vw] sm:text-base lg:max-w-[55vw]">
      {topic || "Live Class"}
    </h1>
  );

  const rightSlot = (
    <div className="flex items-center gap-2 mr-1">
      <TimerBadge startedAt={startedAt} endsAt={endsAt} />
    </div>
  );

  return <Header compact leftSlot={leftSlot} centerSlot={centerSlot} rightSlot={rightSlot} />;
});
