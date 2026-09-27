"use client";

import { useState } from "react";
import { Crown, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { MeetingVideoGrid } from "../MeetingVideoGrid";
import { ClassroomBoard } from "./ClassroomBoard";
import { ClassroomPanel } from "./ClassroomPanel";

export type ClassroomStage = "board" | "video";

/** Board / Video switch for the main stage. */
export function StageSwitch({ stage, onChange }: { stage: ClassroomStage; onChange: (stage: ClassroomStage) => void }) {
  const options: { id: ClassroomStage; label: string; icon: React.ReactNode }[] = [
    { id: "board", label: "Board", icon: <Crown className="size-3.5" strokeWidth={2.5} /> },
    { id: "video", label: "Video", icon: <Video className="size-3.5" strokeWidth={2.5} /> }
  ];
  return (
    <div className="flex shrink-0 rounded-full border border-app-border bg-app-surface p-0.5 shadow-card" role="tablist" aria-label="Main view">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={stage === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
            stage === o.id ? "bg-primary text-white" : "text-app-muted hover:text-app-text"
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The single-page live class (md and up) — everything on one screen. Below lg
 * (tablet portrait) the panel stacks under the stage, video beside the tabs:
 *
 *  ┌──────────────────────────┬──────────────┐
 *  │ [Board | Video]          │ Video        │
 *  │                          ├──────────────┤
 *  │  Shared board            │ Tabs: Moves, │
 *  │  (or the video grid)     │ Chat, People │
 *  └──────────────────────────┴──────────────┘
 *
 * Must render inside `<BoardProvider>` + `<LiveBoardSyncBridge>` and `<ChatProvider>`.
 */
export function ClassroomLayout({ isCoach }: { isCoach: boolean }) {
  const [stage, setStage] = useState<ClassroomStage>("board");

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      {stage === "board" ? (
        <ClassroomBoard isCoach={isCoach} stageSwitch={<StageSwitch stage={stage} onChange={setStage} />} />
      ) : (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 justify-end px-3 pt-3 lg:px-6">
            <StageSwitch stage={stage} onChange={setStage} />
          </div>
          <MeetingVideoGrid hideBoard />
        </section>
      )}
      <ClassroomPanel isCoach={isCoach} showVideo={stage === "board"} />
    </div>
  );
}

/** Width of `ClassroomPanel` beside the stage (lg+), so the floating toolbar can centre on it. Below lg the panel sits underneath. */
export const CLASSROOM_PANEL_OFFSET = "lg:right-[380px] xl:right-[420px]";
