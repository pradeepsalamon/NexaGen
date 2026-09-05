"use client";

import { memo } from "react";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { TimerBadge, LiveBadge, RecordingBadge, ConnectionBadge, NetworkStatusIcon } from "./MeetingStatus";
import { Header } from "@/components/layout/Header";

export const MeetingHeader = memo(function MeetingHeader() {
  const { topic, startedAt, endsAt } = useLiveClassState();

  const leftSlot = (
    <div className="flex items-center gap-2">
      <LiveBadge className="hidden sm:flex shrink-0" />
      <RecordingBadge className="hidden sm:flex shrink-0" />
      <ConnectionBadge compact className="hidden sm:flex shrink-0" />
    </div>
  );

  const centerSlot = (
    <h1 className="truncate text-center text-sm font-extrabold text-app-text sm:text-base">
      {topic || "Live Class"}
    </h1>
  );

  const rightSlot = (
    <div className="flex items-center gap-2 mr-1">
      <NetworkStatusIcon className="sm:hidden shrink-0" />
      <TimerBadge startedAt={startedAt} endsAt={endsAt} />
    </div>
  );

  return <Header leftSlot={leftSlot} centerSlot={centerSlot} rightSlot={rightSlot} />;
});
