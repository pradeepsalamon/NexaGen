"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Crown, Grid2x2, LayoutGrid, Puzzle, Shapes, SquareUser, Swords, Undo2, Users, Video } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  stageForPresentation,
  type ClassroomPresentation
} from "../../../lib/classroomPresentation";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { useMatch } from "../../../providers/MatchProvider";
import { useSimul } from "../../../providers/SimulProvider";
import { MatchCoachView } from "../match/MatchCoachView";
import { MatchStudentView } from "../match/MatchStudentView";
import { Button } from "@/components/ui/Button";
import { MeetingVideoGrid } from "../MeetingVideoGrid";
import { PuzzleLiveBoardsGrid } from "../PuzzleLiveBoardsPanel";
import { EndPuzzleButton, PuzzleTimerBadge } from "../PuzzleSessionControls";
import { PuzzleStage } from "../PuzzleStage";
import { SimulCoachView } from "../simul/SimulCoachView";
import { SimulStudentBoard } from "../simul/SimulStudentBoard";
import { ClassroomBoard } from "./ClassroomBoard";
import { ClassroomPanel } from "./ClassroomPanel";
import { useInteractives } from "../interactives/InteractivesProvider";
import { PresentedInteractiveStage, usePresentedTool } from "../interactives/PresentedInteractive";
import { InlineStage } from "./InlineStage";

/** Activity stages exist only while their activity does; board and video always. */
type ActivityStage = "puzzle" | "boards" | "simul" | "match" | "interactive";
export type ClassroomStage = "board" | "video" | ActivityStage;

const ACTIVITY_STAGES: ActivityStage[] = ["puzzle", "boards", "simul", "match", "interactive"];

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
      label: "Pull back to main board",
      icon: <Undo2 className="size-3.5" strokeWidth={2.5} />
    },
    {
      id: "pushed" as const,
      label: "Push to video",
      icon: <Video className="size-3.5" strokeWidth={2.5} />
    }
  ];
  return (
    <div
      className="flex shrink-0 rounded-full border border-app-border bg-app-surface p-0.5 shadow-card"
      role="group"
      aria-label="Present to the class"
    >
      {actions.map((a) => {
        const active = presentation === a.id;
        return (
          <SimpleTooltip key={a.id} label={a.label}>
            <button
              type="button"
              aria-label={a.label}
              aria-pressed={active}
              onClick={() => onPresent(a.id)}
              className={cn(
                "grid size-7 place-items-center rounded-full transition-colors",
                active ? "bg-primary text-white" : "text-app-muted hover:text-app-text"
              )}
            >
              {a.icon}
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
 * `studentOpen`, the Interactives' `studentOpen`), so whatever "opens" an
 * activity — a new assignment, a toast's action, a panel button, the coach
 * presenting a tool — switches to its tab instead of a pop-up.
 *
 * Must render inside `<BoardProvider>` + `<LiveBoardSyncBridge>`, `<ChatProvider>`,
 * `<SimulProvider>` and `<MatchProvider>`.
 */
export function ClassroomLayout({ isCoach }: { isCoach: boolean }) {
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
  const presentedTool = usePresentedTool();

  const available: Record<ActivityStage, boolean> = {
    // The coach's "Activity" is a practice copy of the class puzzle.
    puzzle: !!activePuzzle,
    boards: isCoach && !!activePuzzle,
    simul: simul.isManager ? !!simul.simul : !!simul.myGame,
    match: !!match.round,
    // Students only: the tool the coach is presenting, in the board's place.
    interactive: !!presentedTool
  };
  const flags: Record<ActivityStage, boolean> = {
    puzzle: puzzleSolverOpen,
    boards: puzzleBoardsOpen,
    simul: simul.isManager ? simul.coachOpen : simul.studentOpen,
    match: match.isManager ? match.coachOpen : match.studentOpen,
    interactive: interactives.studentOpen
  };
  const setters: Record<ActivityStage, (open: boolean) => void> = {
    puzzle: setPuzzleSolverOpen,
    boards: setPuzzleBoardsOpen,
    simul: simul.isManager ? simul.setCoachOpen : simul.setStudentOpen,
    match: match.isManager ? match.setCoachOpen : match.setStudentOpen,
    interactive: interactives.setStudentOpen
  };
  // Starts closed, so a flag already open at mount (a resize from the phone layout) counts as opening.
  const flagsRef = useRef<Record<ActivityStage, boolean>>({
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
    available.puzzle,
    available.boards,
    available.simul,
    available.match,
    available.interactive,
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
      { id: "video", label: "Gallery", icon: <Grid2x2 className="size-3.5" strokeWidth={2.5} />, show: true },
      {
        id: "puzzle",
        label: isCoach ? "Activity" : "Puzzle",
        icon: <Puzzle className="size-3.5" strokeWidth={2.5} />,
        show: available.puzzle
      },
      { id: "boards", label: "Live boards", icon: <LayoutGrid className="size-3.5" strokeWidth={2.5} />, show: available.boards },
      { id: "simul", label: "Simul", icon: <Users className="size-3.5" strokeWidth={2.5} />, show: available.simul, badge: simulBadge },
      { id: "match", label: "Matches", icon: <Swords className="size-3.5" strokeWidth={2.5} />, show: available.match, badge: matchBadge },
      {
        id: "interactive",
        label: presentedTool?.label ?? "Interactive",
        icon: <Shapes className="size-3.5" strokeWidth={2.5} />,
        show: available.interactive
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
    presentedTool?.label,
    simulBadge,
    matchBadge
  ]);

  const stageSwitch = (
    <div className="flex shrink-0 items-center gap-1.5">
      {isCoach ? <PresentationControls presentation={classroomPresentation} onPresent={present} /> : null}
      <StageSwitch stage={stage} options={options} onChange={changeStage} />
    </div>
  );
  const solving = stage === "puzzle";

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden room:flex-row">
      {stage === "puzzle" ? (
        <PuzzleStage stageSwitch={stageSwitch} className="px-3 pb-24 pt-3 room:px-6" />
      ) : stage === "boards" ? (
        <InlineStage
          title={activePuzzle ? `Live boards · ${activePuzzle.title}` : "Live boards"}
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
      ) : stage === "interactive" ? (
        <PresentedInteractiveStage stageSwitch={stageSwitch} />
      ) : stage === "video" ? (
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 px-3 pt-3 room:px-6">
            {/* Gallery ⇄ speaker: the speaker view is the panel's spotlight
                beside the board, so "back" is the board stage. */}
            <Button size="sm" variant="ghost" onClick={() => changeStage("board")}>
              <SquareUser className="mr-1.5 size-4" strokeWidth={2.5} />
              Speaker view
            </Button>
            {stageSwitch}
          </div>
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
