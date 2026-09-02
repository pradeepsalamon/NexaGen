"use client";

import { memo } from "react";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ClassroomTopBar } from "./ClassroomTopBar";
import { LeaveClassControl } from "./LeaveClassControl";
import { ConnectionPill, LiveBadge, RecordingBadge, TimerBadge } from "./MeetingStatus";

export const MeetingTopBar = memo(function MeetingTopBar() {
  const { topic, startedAt, endsAt } = useLiveClassState();

  return (
    <ClassroomTopBar
      title={topic || "Live Class"}
      status={
        <span className="flex shrink-0 items-center gap-1.5">
          <LiveBadge />
          <RecordingBadge />
        </span>
      }
      actions={
        <>
          <ConnectionPill />
          <TimerBadge startedAt={startedAt} endsAt={endsAt} />
          <span className="hidden md:block">
            <ThemeToggle />
          </span>
          <LeaveClassControl>
            {(open) => (
              <button
                type="button"
                aria-label="Leave class"
                onClick={open}
                className="flex h-9 items-center gap-1.5 rounded-full border border-app-danger/40 bg-app-danger/10 px-2.5 text-xs font-bold text-app-danger transition-colors hover:bg-app-danger hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-danger sm:px-3"
              >
                <LogOut className="size-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">Leave</span>
              </button>
            )}
          </LeaveClassControl>
        </>
      }
    />
  );
});
