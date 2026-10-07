"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Crown, LayoutGrid, Puzzle, Swords, Users, Video } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { useMatch } from "../../../providers/MatchProvider";
import { useSimul } from "../../../providers/SimulProvider";
import { MatchCoachView } from "../match/MatchCoachView";
import { MatchStudentView } from "../match/MatchStudentView";
import { MeetingVideoGrid } from "../MeetingVideoGrid";
import { PuzzleLiveBoardsGrid } from "../PuzzleLiveBoardsPanel";
import { PuzzleStage } from "../PuzzleStage";
import { SimulCoachView } from "../simul/SimulCoachView";
import { SimulStudentBoard } from "../simul/SimulStudentBoard";
import { ClassroomBoard } from "./ClassroomBoard";
import { ClassroomPanel } from "./ClassroomPanel";
import { InlineStage } from "./InlineStage";

/** Activity stages exist only while their activity does; board and video always. */
type ActivityStage = "puzzle" | "boards" | "simul" | "match";
export type ClassroomStage = "board" | "video" | ActivityStage;

const ACTIVITY_STAGES: ActivityStage[] = ["puzzle", "boards", "simul", "match"];

type StageOption = { id: ClassroomStage; label: string; icon: ReactNode; badge?: number };

/** The main-stage tabs: board, video and every running activity. With more than two, inactive tabs show only their icon. */
export function StageSwitch({
  stage,
  options,
  onChange
}: {
  stage: ClassroomStage;
  options: StageOption[];
  onChange: (stage: ClassroomStage) => void;
}) {
  const compact = options.length > 2;
  return (
    <div className="flex shrink-0 rounded-full border border-app-border bg-app-surface p-0.5 shadow-card" role="tablist" aria-label="Main view">
      {options.map((o) => {
        const active = stage === o.id;
        const button = (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.label}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              active ? "bg-primary text-white" : "text-app-muted hover:text-app-text"
            )}
          >
            {o.icon}
            {!compact || active ? o.label : null}
            {o.badge ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-app-danger px-1 text-[8px] font-bold text-white ring-2 ring-app-surface">
                {o.badge > 9 ? "9+" : o.badge}
              </span>
            ) : null}
          </button>
        );
        return compact && !active ? (
          <SimpleTooltip key={o.id} label={o.label}>
            {button}
          </SimpleTooltip>
        ) : (
          <Fragment key={o.id}>{button}</Fragment>
        );
      })}
    </div>
  );
}

/**
 * The single-page live class (md and up) — everything on one screen. Below lg
 * (tablet portrait) the panel stacks under the stage, video beside the tabs:
 *
 *  ┌───────────────────────────────────┬──────────────┐
 *  │ [Board | Video | Puzzle | Simul…] │ Video        │
 *  │                                   ├──────────────┤
 *  │  Shared board, the video grid     │ Tabs: Moves, │
 *  │  or a running activity            │ Chat, People │
 *  └───────────────────────────────────┴──────────────┘
 *
 * Each activity tab mirrors the open flag its phone dialog uses
 * (`puzzleSolverOpen`, `puzzleBoardsOpen`, simul / match `coachOpen` or
 * `studentOpen`), so whatever "opens" an activity — a new assignment, a
 * toast's action, a panel button — switches to its tab instead of a pop-up.
 *
 * Must render inside `<BoardProvider>` + `<LiveBoardSyncBridge>`, `<ChatProvider>`,
 * `<SimulProvider>` and `<MatchProvider>`.
 */
export function ClassroomLayout({ isCoach }: { isCoach: boolean }) {
  const [stage, setStage] = useState<ClassroomStage>("board");
  const [sideColumnFits, setSideColumnFits] = useState(false);
  const { activePuzzle, puzzleSolverOpen, setPuzzleSolverOpen, puzzleBoardsOpen, setPuzzleBoardsOpen } =
    useLiveClassState(
      "activePuzzle",
      "puzzleSolverOpen",
      "setPuzzleSolverOpen",
      "puzzleBoardsOpen",
      "setPuzzleBoardsOpen"
    );
  const simul = useSimul();
  const match = useMatch();

  const available: Record<ActivityStage, boolean> = {
    // The coach's "Activity" is a practice copy of the class puzzle.
    puzzle: !!activePuzzle,
    boards: isCoach && !!activePuzzle,
    simul: simul.isManager ? !!simul.simul : !!simul.myGame,
    match: !!match.round
  };
  const flags: Record<ActivityStage, boolean> = {
    puzzle: puzzleSolverOpen,
    boards: puzzleBoardsOpen,
    simul: simul.isManager ? simul.coachOpen : simul.studentOpen,
    match: match.isManager ? match.coachOpen : match.studentOpen
  };
  const setters: Record<ActivityStage, (open: boolean) => void> = {
    puzzle: setPuzzleSolverOpen,
    boards: setPuzzleBoardsOpen,
    simul: simul.isManager ? simul.setCoachOpen : simul.setStudentOpen,
    match: match.isManager ? match.setCoachOpen : match.setStudentOpen
  };
  // Starts closed, so a flag already open at mount (a resize from the phone layout) counts as opening.
  const flagsRef = useRef<Record<ActivityStage, boolean>>({ boards: false, match: false, puzzle: false, simul: false });
  const settersRef = useRef(setters);
  settersRef.current = setters;

  const changeStage = useCallback((next: ClassroomStage) => {
    setStage(next);
    for (const key of ACTIVITY_STAGES) {
      if (flagsRef.current[key] !== (key === next)) settersRef.current[key](key === next);
    }
  }, []);

  // Something opened an activity → show its tab. Its flag closing (Esc, the
  // puzzle ending) or the activity going away → back to the board.
  useEffect(() => {
    const before = flagsRef.current;
    // A flag raised before its activity's data arrived stays "unseen" until it does.
    flagsRef.current = {
      boards: flags.boards && available.boards,
      match: flags.match && available.match,
      puzzle: flags.puzzle && available.puzzle,
      simul: flags.simul && available.simul
    };
    const opened = ACTIVITY_STAGES.find((key) => flags[key] && !before[key] && available[key]);
    if (opened && opened !== stage) {
      changeStage(opened);
      return;
    }
    if (stage !== "board" && stage !== "video" && ((before[stage] && !flags[stage]) || !available[stage])) {
      setStage("board");
      if (flags[stage]) settersRef.current[stage](false);
    }
    // The flag/availability booleans are the real inputs; the records are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    flags.puzzle,
    flags.boards,
    flags.simul,
    flags.match,
    available.puzzle,
    available.boards,
    available.simul,
    available.match,
    stage,
    changeStage
  ]);

  const simulBadge = simul.isManager
    ? simul.coachToMove
    : simul.myGame?.status === "ONGOING" && simul.myGame.turn === "STUDENT"
      ? 1
      : 0;
  const matchBadge = match.isManager ? 0 : match.incoming.length;

  const options = useMemo(() => {
    const all: (StageOption & { show: boolean })[] = [
      { id: "board", label: "Board", icon: <Crown className="size-3.5" strokeWidth={2.5} />, show: true },
      { id: "video", label: "Video", icon: <Video className="size-3.5" strokeWidth={2.5} />, show: true },
      {
        id: "puzzle",
        label: isCoach ? "Activity" : "Puzzle",
        icon: <Puzzle className="size-3.5" strokeWidth={2.5} />,
        show: available.puzzle
      },
      { id: "boards", label: "Live boards", icon: <LayoutGrid className="size-3.5" strokeWidth={2.5} />, show: available.boards },
      { id: "simul", label: "Simul", icon: <Users className="size-3.5" strokeWidth={2.5} />, show: available.simul, badge: simulBadge },
      { id: "match", label: "Matches", icon: <Swords className="size-3.5" strokeWidth={2.5} />, show: available.match, badge: matchBadge }
    ];
    return all.filter((o) => o.show);
  }, [isCoach, available.puzzle, available.boards, available.simul, available.match, simulBadge, matchBadge]);

  const stageSwitch = <StageSwitch stage={stage} options={options} onChange={changeStage} />;
  const solving = stage === "puzzle";

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row">
      {stage === "puzzle" ? (
        <PuzzleStage stageSwitch={stageSwitch} className="px-3 pb-24 pt-3 lg:px-6" />
      ) : stage === "boards" ? (
        <InlineStage
          title={activePuzzle ? `Live boards · ${activePuzzle.title}` : "Live boards"}
          stageSwitch={stageSwitch}
          fullWidth
        >
          <PuzzleLiveBoardsGrid classId={match.classId} />
        </InlineStage>
      ) : stage === "simul" ? (
        simul.isManager ? (
          <SimulCoachView stageSwitch={stageSwitch} />
        ) : (
          <SimulStudentBoard stageSwitch={stageSwitch} />
        )
      ) : stage === "match" ? (
        match.isManager ? (
          <MatchCoachView stageSwitch={stageSwitch} />
        ) : (
          <MatchStudentView stageSwitch={stageSwitch} />
        )
      ) : stage === "video" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 justify-end px-3 pt-3 lg:px-6">{stageSwitch}</div>
          <MeetingVideoGrid hideBoard />
        </section>
      ) : (
        <ClassroomBoard
          isCoach={isCoach}
          stageSwitch={stageSwitch}
          sideColumn={sideColumnFits}
          onSideColumnChange={setSideColumnFits}
        />
      )}
      <PanelResizer />
      {/* Below lg the panel stacks under the stage; give a solving student the whole height. */}
      <div className={solving ? "hidden lg:contents" : "contents"}>
        <ClassroomPanel
          isCoach={isCoach}
          showVideo={stage !== "video"}
          sideColumn={isCoach && stage === "board" && sideColumnFits}
        />
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
