"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Crosshair,
  Crown,
  FolderOpen,
  Loader2,
  Puzzle as PuzzleIcon,
  StepBack,
  StepForward
} from "lucide-react";
import { useParams } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { SendPositionButton } from "@/features/assignments/components/SendPositionButton";
import { ChessgroundBoard } from "@/features/chessboard/components/board/ChessgroundBoard";
import { PromotionDialog } from "@/features/chessboard/components/dialogs/PromotionDialog";
import { SetupPositionDialog } from "@/features/chessboard/components/dialogs/SetupPositionDialog";
import { ChessClock } from "@/features/chessboard/components/panels/ChessClock";
import { BoardNavigation, NavIconButton } from "@/features/chessboard/components/toolbars/BoardNavigation";
import { DrawingToolbar } from "@/features/chessboard/components/toolbars/DrawingToolbar";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { useBoardShortcuts } from "@/features/chessboard/hooks/useBoardShortcuts";
import { useEngineMove } from "@/features/chessboard/hooks/useEngineMove";
import { cn } from "@/lib/utils";
import { useLoadNextPuzzle } from "../../../hooks/useLoadNextPuzzle";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { PuzzleAssignModal } from "../PuzzleAssignModal";
import { SharePositionDialog } from "../SharePositionDialog";
import { MeetingChat } from "../MeetingChat";
import { MeetingPuzzlePanel } from "../MeetingPuzzlePanel";
import { FlipBoardButton } from "../video-grid/FlipBoardButton";
import { RequestControlButton } from "../video-grid/RequestControlButton";

/** Board shortcuts plus Space = engine move. */
function CoachBoardShortcuts() {
  useBoardShortcuts();
  const { playEngineMove } = useEngineMove();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (target?.closest('[role="dialog"],[role="menu"],[role="listbox"]')) return;
      // Also stops Space from clicking whichever button still has focus.
      e.preventDefault();
      void playEngineMove();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playEngineMove]);

  return null;
}

export const SIDE_COLUMN_W = 300;
const SIDE_COLUMN_GAP = 12;
// Keeps the column from flickering when the spare width sits right at the threshold.
const SIDE_COLUMN_HYSTERESIS = 16;

/**
 * Whether the empty space beside the square board fits the coach's side
 * column. Measured on the board box, adding the column back while it shows,
 * so showing it never changes the answer.
 */
function useSideColumnFit(enabled: boolean, onChange?: (fits: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !onChange || !el) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      const shown = shownRef.current;
      const spare = el.clientWidth - el.clientHeight + (shown ? SIDE_COLUMN_W + SIDE_COLUMN_GAP : 0);
      const need = SIDE_COLUMN_W + SIDE_COLUMN_GAP + (shown ? -SIDE_COLUMN_HYSTERESIS : SIDE_COLUMN_HYSTERESIS);
      const fits = wide.matches && spare >= need;
      if (fits !== shown) {
        shownRef.current = fits;
        onChange(fits);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    wide.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      wide.removeEventListener("change", measure);
      shownRef.current = false;
      onChange(false);
    };
  }, [enabled, onChange]);

  return ref;
}

/** The coach's left column: puzzles / leaderboard on top, chat below. */
function CoachSideColumn() {
  return (
    <aside className="flex min-h-0 shrink-0 flex-col gap-3" style={{ width: SIDE_COLUMN_W }} aria-label="Puzzles and chat">
      <div className="min-h-0 flex-1 overflow-hidden rounded-panel border border-app-border bg-app-surface/60 shadow-card">
        <MeetingPuzzlePanel />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-panel border border-app-border bg-app-surface/60 shadow-card">
        <MeetingChat />
      </div>
    </aside>
  );
}

/** The board half of the classroom layout. Coaches author; students watch (or play with granted control). */
export function ClassroomBoard({
  isCoach,
  stageSwitch,
  sideColumn = false,
  onSideColumnChange
}: {
  isCoach: boolean;
  stageSwitch: ReactNode;
  /** Coach only: puzzles + chat fill the empty space left of the board. */
  sideColumn?: boolean;
  onSideColumnChange?: (fits: boolean) => void;
}) {
  const fen = useBoardStore((s) => s.fen);
  const { activePuzzle, setPuzzleSolverOpen, isChessboardOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
    "isChessboardOpen",
  );
  const waiting = !isCoach && !isChessboardOpen;
  const boardBoxRef = useSideColumnFit(isCoach, onSideColumnChange);

  return (
    // lg+: bottom padding clears the floating toolbar (below lg it floats over the panel).
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-3 pb-3 pt-3 lg:px-6 lg:pb-24">
      <PromotionDialog />
      {isCoach ? (
        <>
          <CoachBoardShortcuts />
          <SetupPositionDialog />
        </>
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-app-text">
          <Crown className="size-4 text-amber-500" />
          Shared Board
          {isCoach ? <SendPositionButton fen={fen} className="ml-1" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto">
          <ChessClock layout="horizontal" />
          {!isCoach ? <RequestControlButton /> : null}
          {!isCoach && activePuzzle ? (
            <button
              type="button"
              onClick={() => setPuzzleSolverOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary px-2.5 py-1 text-[11px] font-semibold text-white shadow-card transition active:scale-95"
            >
              <PuzzleIcon className="size-3" strokeWidth={2.5} />
              Solve puzzle
            </button>
          ) : null}
        </div>
        {isCoach ? <DrawingToolbar /> : null}
        <FlipBoardButton className="size-8 shrink-0" />
        {stageSwitch}
      </div>

      <div className="flex min-h-0 flex-1" style={{ gap: SIDE_COLUMN_GAP }}>
        {sideColumn ? <CoachSideColumn /> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div ref={boardBoxRef} className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
            <div className="relative shadow-card" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
              <ChessgroundBoard />
              {waiting ? (
                <div className="absolute inset-0 flex items-center justify-center bg-app-background/60 backdrop-blur-[2px]">
                  <span className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-4 py-2 text-sm font-semibold text-app-muted shadow-card">
                    <Loader2 className="size-4 animate-spin" />
                    Waiting for your coach&apos;s board…
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {isCoach ? (
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
              <BoardNavigation />
              <CoachPuzzleButtons />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type MenuItem = { label: string; hint: string; icon: ReactNode; onSelect: () => void; disabled?: boolean };

/**
 * An icon button whose menu opens on hover (mouse) or tap (touch), so the
 * three steps sit behind one button without a click to discover them.
 */
function HoverMenuButton({
  label,
  icon,
  items,
  disabled
}: {
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => cancelClose, []);
  const onHover = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || disabled) return;
    cancelClose();
    setOpen(true);
  };
  const onLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") scheduleClose();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onPointerEnter={onHover}
          onPointerLeave={onLeave}
          className={cn(
            "grid size-9 place-items-center rounded-full border border-app-border bg-app-surface text-app-text shadow-card transition-colors hover:bg-primary hover:text-white disabled:opacity-50",
            open && "bg-primary text-white"
          )}
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-60 p-1.5"
        onPointerEnter={onHover}
        onPointerLeave={onLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="px-2 pb-1 pt-0.5 text-xs font-semibold uppercase tracking-wide text-app-muted">{label}</p>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              setOpen(false);
              item.onSelect();
            }}
            className="flex w-full items-start gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-app-soft disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="mt-0.5 text-app-muted">{item.icon}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-app-text">{item.label}</span>
              <span className="block text-xs text-app-muted">{item.hint}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Share (to the class, and onto the board) and Load (board only), each with
 * previous / current / next — both step through the coach's folder from the
 * same place. The folder button opens the picker for any puzzle or folder.
 */
function CoachPuzzleButtons() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const { activePuzzle } = useLiveClassState("activePuzzle");
  const [assignOpen, setAssignOpen] = useState(false);
  const [shareCurrentOpen, setShareCurrentOpen] = useState(false);
  const openPicker = useCallback(() => setAssignOpen(true), []);
  const { share, load, loadCurrent, loading } = useLoadNextPuzzle({
    classId,
    activePuzzleId: activePuzzle?.puzzleId ?? null,
    onNoFolder: openPicker
  });
  const stepIcons = {
    previous: <StepBack className="size-4" strokeWidth={2.5} />,
    current: <Crosshair className="size-4" strokeWidth={2.5} />,
    next: <StepForward className="size-4" strokeWidth={2.5} />
  };

  return (
    <div className="mt-4 flex items-center gap-2 text-app-muted">
      <HoverMenuButton
        label="Share puzzle"
        disabled={loading}
        icon={loading ? <Loader2 className="size-4 animate-spin" /> : <PuzzleIcon className="size-4" strokeWidth={2.5} />}
        items={[
          { label: "Share previous", hint: "The puzzle before, in this folder", icon: stepIcons.previous, onSelect: () => void share(-1) },
          { label: "Share current", hint: "This board position — edit it first", icon: stepIcons.current, onSelect: () => setShareCurrentOpen(true) },
          { label: "Share next", hint: "The next puzzle in this folder", icon: stepIcons.next, onSelect: () => void share(1) }
        ]}
      />
      <HoverMenuButton
        label="Load on board"
        disabled={loading}
        icon={<ArrowDownToLine className="size-4" strokeWidth={2.5} />}
        items={[
          { label: "Load previous", hint: "Board only — not shared", icon: stepIcons.previous, onSelect: () => void load(-1) },
          {
            label: "Load current",
            hint: activePuzzle ? "The puzzle the class is solving" : "No puzzle shared right now",
            icon: stepIcons.current,
            onSelect: () => void loadCurrent(),
            disabled: !activePuzzle
          },
          { label: "Load next", hint: "Board only — not shared", icon: stepIcons.next, onSelect: () => void load(1) }
        ]}
      />
      <SimpleTooltip label="Choose a puzzle to share">
        <NavIconButton
          aria-label="Choose a puzzle to share"
          icon={<FolderOpen className="size-4" strokeWidth={2.5} />}
          onClick={openPicker}
        />
      </SimpleTooltip>
      <PuzzleAssignModal classId={classId} open={assignOpen} onOpenChange={setAssignOpen} />
      <SharePositionDialog
        classId={classId}
        activePuzzleId={activePuzzle?.puzzleId ?? null}
        open={shareCurrentOpen}
        onOpenChange={setShareCurrentOpen}
      />
    </div>
  );
}
