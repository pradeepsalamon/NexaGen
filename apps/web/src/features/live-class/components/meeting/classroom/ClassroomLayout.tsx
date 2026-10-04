"use client";

import { useEffect, useState } from "react";
import { Crown, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { MeetingVideoGrid } from "../MeetingVideoGrid";
import { PuzzleStage } from "../PuzzleStage";
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
  const { activePuzzle, puzzleSolverOpen } = useLiveClassState("activePuzzle", "puzzleSolverOpen");
  const solving = !isCoach && !!activePuzzle && puzzleSolverOpen;

  // Opening the puzzle (or the coach sharing one) brings the student back from the video stage.
  useEffect(() => {
    if (solving) setStage("board");
  }, [solving]);

  const stageSwitch = <StageSwitch stage={stage} onChange={setStage} />;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      {stage === "board" && solving ? (
        <PuzzleStage stageSwitch={stageSwitch} className="px-3 pb-24 pt-3 lg:px-6" />
      ) : stage === "board" ? (
        <ClassroomBoard isCoach={isCoach} stageSwitch={stageSwitch} />
      ) : (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 justify-end px-3 pt-3 lg:px-6">{stageSwitch}</div>
          <MeetingVideoGrid hideBoard />
        </section>
      )}
      <PanelResizer />
      {/* Below lg the panel stacks under the stage; give a solving student the whole height. */}
      <div className={solving && stage === "board" ? "hidden lg:contents" : "contents"}>
        <ClassroomPanel isCoach={isCoach} showVideo={stage === "board"} />
      </div>
    </div>
  );
}

/** Width of `ClassroomPanel` beside the stage (lg+), so the floating toolbar can centre on it. Below lg the panel sits underneath. */
export const CLASSROOM_PANEL_OFFSET =
  "lg:right-[var(--classroom-panel-w,380px)] xl:right-[var(--classroom-panel-w,420px)]";

const PANEL_WIDTH_KEY = "nexa-live-class-panel-width";
const PANEL_MIN = 300;
const STAGE_MIN = 420;

function clampPanelWidth(width: number) {
  const max = Math.max(PANEL_MIN, Math.min(760, window.innerWidth - STAGE_MIN));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, width)));
}

function applyPanelWidth(width: number | null) {
  const root = document.documentElement.style;
  if (width === null) root.removeProperty("--classroom-panel-w");
  else root.setProperty("--classroom-panel-w", `${width}px`);
}

/**
 * Drag handle between the stage and the panel (lg+): resizes board vs video.
 * The width lives in a CSS variable on <html> so the floating toolbar, which
 * renders outside this layout, stays centred on the board. Double-click resets.
 */
function PanelResizer() {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    let saved: number | null = null;
    try {
      const raw = window.localStorage.getItem(PANEL_WIDTH_KEY);
      saved = raw ? clampPanelWidth(Number(raw)) : null;
    } catch {
      saved = null;
    }
    if (saved && Number.isFinite(saved)) {
      setWidth(saved);
      applyPanelWidth(saved);
    }
    return () => applyPanelWidth(null);
  }, []);

  const commit = (next: number | null) => {
    setWidth(next);
    applyPanelWidth(next);
    try {
      if (next === null) window.localStorage.removeItem(PANEL_WIDTH_KEY);
      else window.localStorage.setItem(PANEL_WIDTH_KEY, String(next));
    } catch {
      // per-browser convenience only
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let latest = width;
    const onMove = (e: PointerEvent) => {
      latest = clampPanelWidth(window.innerWidth - e.clientX);
      setWidth(latest);
      applyPanelWidth(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      commit(latest);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const current = () =>
    width ?? (document.querySelector<HTMLElement>("[data-classroom-panel]")?.offsetWidth || 380);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize board and video panel"
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => commit(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") commit(clampPanelWidth(current() + 24));
        else if (e.key === "ArrowRight") commit(clampPanelWidth(current() - 24));
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -mx-1.5 hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <span className="h-12 w-1 rounded-full bg-app-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
