"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Crown, Grid2x2, LayoutGrid, ListChecks, Puzzle, Shapes, SquareUser, Swords, Undo2, Users, Video } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { RoomTabs } from "../../room-ui/RoomTabs";
import { StageHeader, StagePresentationProvider } from "./StageHeader";
import { cn } from "@/lib/utils";
import {
  stageForPresentation,
  type ClassroomPresentation
} from "../../../lib/classroomPresentation";
import { useActivityRun } from "../../../providers/ActivityRunProvider";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { useMatch } from "../../../providers/MatchProvider";
import { useSimul } from "../../../providers/SimulProvider";
import { LazyView, MatchCoachView, SimulCoachView } from "../lazyViews";
import { MatchStudentView } from "../match/MatchStudentView";
import { Button } from "@/components/ui/Button";
import { ActivityRunStage } from "../activity-run/ActivityRunStage";
import { MeetingVideoGrid } from "../MeetingVideoGrid";
import { PuzzleLiveBoardsGrid } from "../PuzzleLiveBoardsPanel";
import { EndPuzzleButton, PuzzleTimerBadge } from "../PuzzleSessionControls";
import { PuzzleStage } from "../PuzzleStage";
import { SimulStudentBoard } from "../simul/SimulStudentBoard";
import { ClassroomBoard } from "./ClassroomBoard";
import { ClassroomPanel } from "./ClassroomPanel";
import { useInteractives } from "../interactives/InteractivesProvider";
import { InteractiveStage, useStageTool } from "../interactives/InteractiveStage";
import { InlineStage } from "./InlineStage";

/** Activity stages exist only while their activity does; board and video always. */
type ActivityStage = "puzzle" | "boards" | "simul" | "match" | "interactive" | "activity";
export type ClassroomStage = "board" | "video" | ActivityStage;

const ACTIVITY_STAGES: ActivityStage[] = ["puzzle", "boards", "simul", "match", "interactive", "activity"];

type StageOption = { id: ClassroomStage; label: string; icon: ReactNode; badge?: number };

/** The main-stage switch: board, gallery and every running activity. Four show; the rest go under More. */
export function StageSwitch({
  stage,
  options,
  onChange
}: {
  stage: ClassroomStage;
  options: StageOption[];
  onChange: (stage: ClassroomStage) => void;
}) {
  return <RoomTabs ariaLabel="Main view" items={options} value={stage} onChange={onChange} maxVisible={4} />;
}

/**
 * Coach only, beside the stage tabs: what everyone's main stage presents.
 * "Pull back to main board" puts the class on the main board; "Push to video"
 * puts the board's content (position, PGN, the class puzzle) into the gallery
 * as tiles. The stage tabs themselves stay the coach's own view.
 */
function PresentationControls({
  presentation,
  onPresent
}: {
  presentation: ClassroomPresentation;
  onPresent: (presentation: ClassroomPresentation) => void;
}) {
  const actions = [
    {
      id: "board" as const,
      label: "Class on board",
      hint: "Pull everyone back to the main board",
      icon: <Undo2 aria-hidden="true" className="size-4" strokeWidth={2} />
    },
    {
      id: "pushed" as const,
      label: "Board in gallery",
      hint: "Push to video: the board joins the gallery as a tile",
      icon: <Video aria-hidden="true" className="size-4" strokeWidth={2} />
    }
  ];
  return (
    <div
      className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-control bg-app-soft p-1"
      role="group"
      aria-label="What the class sees"
    >
      {actions.map((a) => {
        const active = presentation === a.id;
        return (
          <SimpleTooltip key={a.id} label={a.hint}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onPresent(a.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-chip px-2.5 text-[0.8125rem] font-medium transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-app-focus",
                active ? "bg-primary text-on-primary shadow-card" : "text-app-muted hover:bg-app-surface hover:text-app-text"
              )}
            >
              {a.icon}
              <span className="hidden 2xl:inline">{a.label}</span>
              <span className="sr-only 2xl:hidden">{a.label}</span>
            </button>
          </SimpleTooltip>
        );
      })}
    </div>
  );
}

/**
 * The single-page live class (md and up) — everything on one screen. On a tall
 * tablet (portrait, below lg) the panel stacks under the stage, video beside
 * the tabs; at lg, or on a short tablet (`room` screen), it sits beside it:
 *
 *  ┌───────────────────────────────────┬──────────────┐
 *  │ [Board | Video | Puzzle | Simul…] │ Video        │
 *  │                                   ├──────────────┤
 *  │  Shared board, the video grid     │ Tabs: Moves, │
 *  │  or a running activity            │ Chat, People │
 *  └───────────────────────────────────┴──────────────┘
 *
 * It opens on the stage the coach presents (`classroomPresentation`: a new
 * class starts on the gallery) and follows the coach's Pull back / Push to
 * video; anyone can still switch tabs themselves in between.
 *
 * Each activity tab mirrors the open flag its phone dialog uses
 * (`puzzleSolverOpen`, `puzzleBoardsOpen`, simul / match `coachOpen` or
 * `studentOpen`, the Interactives' `stageOpen`), so whatever "opens" an
 * activity — a new assignment, a toast's action, a panel button, the coach
 * opening or presenting a tool — switches to its tab instead of a pop-up.
 *
 * Must render inside `<BoardProvider>` + `<LiveBoardSyncBridge>`, `<ChatProvider>`,
 * `<SimulProvider>` and `<MatchProvider>`.
 */
export function ClassroomLayout({ isCoach, toolbar }: { isCoach: boolean; toolbar?: ReactNode }) {
  const [sideColumnFits, setSideColumnFits] = useState(false);
  const {
    activePuzzle,
    classroomPresentation,
    puzzleSolverOpen,
    setPuzzleSolverOpen,
    puzzleBoardsOpen,
    setPuzzleBoardsOpen,
    presentationSeq,
    presentClassroom
  } = useLiveClassState(
    "activePuzzle",
    "classroomPresentation",
    "puzzleSolverOpen",
    "setPuzzleSolverOpen",
    "puzzleBoardsOpen",
    "setPuzzleBoardsOpen",
    "presentationSeq",
    "presentClassroom"
  );
  const [stage, setStage] = useState<ClassroomStage>(() => stageForPresentation(classroomPresentation));
  // The press this layout last applied, and what it presents (the fallback when an activity closes).
  const appliedSeq = useRef(presentationSeq);
  const presentationRef = useRef(classroomPresentation);
  presentationRef.current = classroomPresentation;
  const simul = useSimul();
  const match = useMatch();
  const interactives = useInteractives();
  const stageTool = useStageTool();
  const activityRun = useActivityRun();

  const available: Record<ActivityStage, boolean> = {
    // The coach's "Activity" is a practice copy of the class puzzle.
    puzzle: !!activePuzzle,
    boards: isCoach && !!activePuzzle,
    simul: simul.isManager ? !!simul.simul : !!simul.myGame,
    match: !!match.round,
    // An Interactive, in the board's place: the coach's open tool, or the one the coach presents.
    interactive: !!stageTool,
    // An MCQ / Playout: while it runs, and afterwards for whoever still has its results open.
    activity: !!activityRun.run && (activityRun.run.status === "ACTIVE" || activityRun.open)
  };
  const flags: Record<ActivityStage, boolean> = {
    puzzle: puzzleSolverOpen,
    boards: puzzleBoardsOpen,
    simul: simul.isManager ? simul.coachOpen : simul.studentOpen,
    match: match.isManager ? match.coachOpen : match.studentOpen,
    interactive: interactives.stageOpen,
    activity: activityRun.open
  };
  const setters: Record<ActivityStage, (open: boolean) => void> = {
    puzzle: setPuzzleSolverOpen,
    boards: setPuzzleBoardsOpen,
    simul: simul.isManager ? simul.setCoachOpen : simul.setStudentOpen,
    match: match.isManager ? match.setCoachOpen : match.setStudentOpen,
    interactive: interactives.setStageOpen,
    activity: activityRun.setOpen
  };
  // Starts closed, so a flag already open at mount (a resize from the phone layout) counts as opening.
  const flagsRef = useRef<Record<ActivityStage, boolean>>({
    activity: false,
    boards: false,
    interactive: false,
    match: false,
    puzzle: false,
    simul: false
  });
  const settersRef = useRef(setters);
  settersRef.current = setters;

  const changeStage = useCallback((next: ClassroomStage) => {
    setStage(next);
    for (const key of ACTIVITY_STAGES) {
      if (flagsRef.current[key] !== (key === next)) settersRef.current[key](key === next);
    }
  }, []);

  // A new press of Pull back / Push to video (a student hears it through the coach's attribute).
  useEffect(() => {
    if (appliedSeq.current === presentationSeq) return;
    appliedSeq.current = presentationSeq;
    changeStage(stageForPresentation(classroomPresentation));
  }, [presentationSeq, classroomPresentation, changeStage]);

  const present = useCallback((next: ClassroomPresentation) => presentClassroom(next), [presentClassroom]);

  // Something opened an activity → show its tab. Its flag closing (Esc, the
  // puzzle ending) or the activity going away → back to what the coach presents.
  useEffect(() => {
    const before = flagsRef.current;
    // A flag raised before its activity's data arrived stays "unseen" until it does.
    flagsRef.current = {
      activity: flags.activity && available.activity,
      boards: flags.boards && available.boards,
      interactive: flags.interactive && available.interactive,
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
      setStage(stageForPresentation(presentationRef.current));
      if (flags[stage]) settersRef.current[stage](false);
    }
    // The flag/availability booleans are the real inputs; the records are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    flags.puzzle,
    flags.boards,
    flags.simul,
    flags.match,
    flags.interactive,
    flags.activity,
    available.puzzle,
    available.boards,
    available.simul,
    available.match,
    available.interactive,
    available.activity,
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
      { id: "board", label: "Board", icon: <Crown aria-hidden="true" className="size-4" strokeWidth={2} />, show: true },
      { id: "video", label: "Gallery", icon: <Grid2x2 aria-hidden="true" className="size-4" strokeWidth={2} />, show: true },
      {
        id: "puzzle",
        label: isCoach ? "Activity" : "Puzzle",
        icon: <Puzzle aria-hidden="true" className="size-4" strokeWidth={2} />,
        show: available.puzzle
      },
      { id: "boards", label: "Live boards", icon: <LayoutGrid aria-hidden="true" className="size-4" strokeWidth={2} />, show: available.boards },
      { id: "simul", label: "Simul", icon: <Users aria-hidden="true" className="size-4" strokeWidth={2} />, show: available.simul, badge: simulBadge },
      { id: "match", label: "Matches", icon: <Swords aria-hidden="true" className="size-4" strokeWidth={2} />, show: available.match, badge: matchBadge },
      {
        id: "interactive",
        label: stageTool?.label ?? "Interactive",
        icon: <Shapes aria-hidden="true" className="size-4" strokeWidth={2} />,
        show: available.interactive
      },
      {
        id: "activity",
        label: activityRun.run?.kind === "PLAYOUT" ? (isCoach ? "Student boards" : "Playout") : isCoach ? "MCQ results" : "Question",
        icon: <ListChecks aria-hidden="true" className="size-4" strokeWidth={2} />,
        show: available.activity
      }
    ];
    return all.filter((o) => o.show);
  }, [
    isCoach,
    available.puzzle,
    available.boards,
    available.simul,
    available.match,
    available.interactive,
    available.activity,
    activityRun.run?.kind,
    stageTool?.label,
    simulBadge,
    matchBadge
  ]);

  const stageSwitch = <StageSwitch stage={stage} options={options} onChange={changeStage} />;
  const presentation = isCoach ? <PresentationControls presentation={classroomPresentation} onPresent={present} /> : null;
  // Stacked, a student playing or answering gets the whole height.
  const solving = stage === "puzzle" || (stage === "activity" && !isCoach);

  return (
    <StagePresentationProvider value={presentation}>
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden room:flex-row">
      {/* The stage column: the control bar floats over its bottom, never over the panel.
          The stage view is its first child and mounts fresh on a switch, so it cross-fades in. */}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col motion-safe:[&>*:first-child]:animate-stage-in"
        data-classroom-stage
      >
      {stage === "puzzle" ? (
        <PuzzleStage stageSwitch={stageSwitch} className="px-3 pb-24 pt-3 room:px-6" />
      ) : stage === "boards" ? (
        <InlineStage
          title={activePuzzle?.title}
          stageSwitch={stageSwitch}
          fullWidth
          actions={
            activePuzzle ? (
              <>
                <PuzzleTimerBadge endsAt={activePuzzle.endsAt} />
                <EndPuzzleButton classId={match.classId} />
              </>
            ) : null
          }
        >
          <PuzzleLiveBoardsGrid classId={match.classId} />
        </InlineStage>
      ) : stage === "simul" ? (
        simul.isManager ? (
          <LazyView>
            <SimulCoachView stageSwitch={stageSwitch} />
          </LazyView>
        ) : (
          <SimulStudentBoard stageSwitch={stageSwitch} />
        )
      ) : stage === "match" ? (
        match.isManager ? (
          <LazyView>
            <MatchCoachView stageSwitch={stageSwitch} />
          </LazyView>
        ) : (
          <MatchStudentView stageSwitch={stageSwitch} />
        )
      ) : stage === "interactive" ? (
        <InteractiveStage stageSwitch={stageSwitch} />
      ) : stage === "activity" ? (
        <ActivityRunStage stageSwitch={stageSwitch} />
      ) : stage === "video" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <StageHeader
            nav={stageSwitch}
            className="px-3 pt-3 room:px-6"
            actions={
              // Gallery ⇄ speaker: the speaker view is the panel's spotlight beside the board, so "back" is the board stage.
              <Button size="sm" variant="neutral" onClick={() => changeStage("board")}>
                <SquareUser aria-hidden="true" className="size-4" strokeWidth={2} />
                Speaker view
              </Button>
            }
          />
          {/* Pushed: the board's content joins the participants as tiles. */}
          <MeetingVideoGrid hideBoard={classroomPresentation !== "pushed"} presentBoard />
        </section>
      ) : (
        <ClassroomBoard
          isCoach={isCoach}
          stageSwitch={stageSwitch}
          sideColumn={sideColumnFits}
          onSideColumnChange={setSideColumnFits}
        />
      )}
      {toolbar}
      </div>
      <PanelResizer />
      {/* Stacked, the panel sits under the stage; give a solving student the whole height. */}
      <div className={solving ? "hidden room:contents" : "contents"}>
        <ClassroomPanel
          isCoach={isCoach}
          showVideo={stage !== "video"}
          onOpenGallery={() => changeStage("video")}
          sideColumn={isCoach && stage === "board" && sideColumnFits}
        />
      </div>
    </div>
    </StagePresentationProvider>
  );
}

/**
 * Width of `ClassroomPanel` beside the stage (xl+), so the floating toolbar can centre on it.
 * Below xl the stage is narrower than the toolbar (~710px), so it spans the
 * width and the panel keeps its bottom padding, as when stacked.
 */
export const CLASSROOM_PANEL_OFFSET = "xl:right-[var(--classroom-panel-w,420px)]";

const PANEL_WIDTH_KEY = "nexa-live-class-panel-width";
const PANEL_MIN = 300;
const STAGE_MIN = 420;
// xl+: the toolbar centres on the stage, so the stage must stay wide enough to hold it.
const STAGE_MIN_XL = 740;

function clampPanelWidth(width: number) {
  const stageMin = window.innerWidth >= 1280 ? STAGE_MIN_XL : STAGE_MIN;
  const max = Math.max(PANEL_MIN, Math.min(760, window.innerWidth - stageMin));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, width)));
}

function applyPanelWidth(width: number | null) {
  const root = document.documentElement.style;
  if (width === null) root.removeProperty("--classroom-panel-w");
  else root.setProperty("--classroom-panel-w", `${width}px`);
}

/**
 * Drag handle between the stage and the panel (`room` screen): resizes board vs video.
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
        // Only when reached by keyboard: after a drag the handle keeps focus, and the arrows belong to the board.
        if (!e.currentTarget.matches(":focus-visible")) return;
        if (e.key === "ArrowLeft") commit(clampPanelWidth(current() + 24));
        else if (e.key === "ArrowRight") commit(clampPanelWidth(current() - 24));
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -mx-1.5 hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none room:flex"
    >
      <span className="h-12 w-1 rounded-full bg-app-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
