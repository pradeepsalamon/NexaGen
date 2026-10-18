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
import { isStaffRole } from "@/lib/routeAccess";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useLoadNextPuzzle } from "../../../hooks/useLoadNextPuzzle";
import {
  COACH_BOARD_SHORTCUT_KEY,
  matchCoachBoardShortcut,
  useCoachBoardActions
} from "../../../lib/coachBoardShortcuts";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { PuzzleAssignModal } from "../PuzzleAssignModal";
import { SharePositionDialog } from "../SharePositionDialog";
import { FlipBoardButton } from "../video-grid/FlipBoardButton";
import { RequestControlButton } from "../video-grid/RequestControlButton";
import { ROOM_ROW_QUERY } from "./roomLayout";
import { ClassroomSidebar } from "./sidebar/ClassroomSidebar";

/** Board shortcuts plus Space = engine move and S = setup position (also offered to the toolbar). */
function CoachBoardShortcuts() {
  useBoardShortcuts();
  const { playEngineMove } = useEngineMove();
  const setIsSetupPositionOpen = useBoardStore((s) => s.setIsSetupPositionOpen);

  useEffect(() => {
    const openSetup = () => setIsSetupPositionOpen(true);
    useCoachBoardActions.setState({ openSetup });
    const onKey = (e: KeyboardEvent) => {
      if (matchCoachBoardShortcut(e) !== "setup") return;
      e.preventDefault();
      openSetup();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      useCoachBoardActions.setState({ openSetup: null });
    };
  }, [setIsSetupPositionOpen]);

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

  // Chessground cancels mousedown, so clicking the board after typing in chat
  // never blurs the text box and every shortcut is swallowed by it. Release
  // focus whenever the press lands on something that can't take focus itself.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || active.contains(target)) return;
      if (target.closest('input,textarea,select,button,a[href],[contenteditable="true"],[tabindex]')) return;
      active.blur();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return null;
}

export const SIDE_COLUMN_W = 320;
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
    const wide = window.matchMedia(ROOM_ROW_QUERY);
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

/** The board half of the classroom layout. Coaches author; students watch (or play with granted control). */
export function ClassroomBoard({
  isCoach,
  stageSwitch,
  sideColumn = false,
  onSideColumnChange
}: {
  isCoach: boolean;
  stageSwitch: ReactNode;
  /** Coach only: the chapters / members / leaderboard / chat sidebar fills the empty space left of the board. */
  sideColumn?: boolean;
  onSideColumnChange?: (fits: boolean) => void;
}) {
  const fen = useBoardStore((s) => s.fen);
  const classId = (useParams()?.roomId as string) ?? "";
  const { activePuzzle, setPuzzleSolverOpen, isChessboardOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
    "isChessboardOpen",
  );
  const userRole = useAuthStore((s) => s.user?.role);
  const waiting = !isCoach && !isChessboardOpen;
  const boardBoxRef = useSideColumnFit(isCoach, onSideColumnChange);

  return (
    // Side by side: bottom padding clears the floating toolbar (stacked, it floats over the panel).
    <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-3 pb-3 pt-3 room:px-6 room:pb-24">
      <PromotionDialog />
      {isCoach ? (
        <>
          <CoachBoardShortcuts />
          <SetupPositionDialog
            pdfImport={{
              activityNote: activePuzzle
                ? "The puzzle the class is solving keeps running — students' puzzle boards are not affected."
                : undefined,
              libraryBasePath: isStaffRole(userRole) ? "/admin/puzzles" : "/coach/puzzles",
            }}
          />
        </>
      ) : null}

      {/* Wraps on a narrow stage instead of running under the side panel. */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-app-text">
          <Crown className="size-4 text-secondary-ink" />
          Shared Board
          {isCoach ? <SendPositionButton fen={fen} className="ml-1" /> : null}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-x-auto">
          <ChessClock layout="horizontal" />
          {!isCoach ? <RequestControlButton surface /> : null}
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
        {sideColumn ? <ClassroomSidebar classId={classId} width={SIDE_COLUMN_W} /> : null}
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

type MenuItem = {
  label: string;
  hint: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
};

/**
 * An icon button whose menu opens on hover (mouse) or tap (touch), so the
 * three steps sit behind one button without a click to discover them.
 */
const MENU_TONES = {
  // Lichess-style: blue shares to the class, green only loads the board.
  info: { idle: "border-info/50 bg-info/10 text-info-ink hover:bg-info hover:text-white", open: "bg-info text-white" },
  success: { idle: "border-success/50 bg-success/10 text-success-ink hover:bg-success hover:text-white", open: "bg-success text-white" }
} as const;

function HoverMenuButton({
  label,
  icon,
  items,
  disabled,
  tone
}: {
  label: string;
  icon: ReactNode;
  items: MenuItem[];
  disabled?: boolean;
  tone: keyof typeof MENU_TONES;
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
            "grid size-9 place-items-center rounded-full border shadow-card transition-colors disabled:opacity-50",
            MENU_TONES[tone].idle,
            open && MENU_TONES[tone].open
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
        <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-app-muted">{label}</p>
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
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-app-text">{item.label}</span>
              <span className="block text-xs text-app-muted">{item.hint}</span>
            </span>
            {item.shortcut ? (
              <kbd className="mt-0.5 shrink-0 rounded border border-app-border px-1.5 font-mono text-[11px] font-semibold text-app-muted">
                {item.shortcut}
              </kbd>
            ) : null}
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

  // . / , share, ] / [ load, / asks about the current position — same actions as the menus.
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const id = matchCoachBoardShortcut(e);
      if (!id || id === "setup") return;
      e.preventDefault();
      if (id === "askCurrent") {
        setShareCurrentOpen(true);
        return;
      }
      if (loadingRef.current) return;
      if (id === "shareNext") void share(1);
      else if (id === "sharePrevious") void share(-1);
      else if (id === "loadNext") void load(1);
      else void load(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [share, load]);

  return (
    <div className="mt-4 flex items-center gap-2 text-app-muted">
      <HoverMenuButton
        label="Share puzzle"
        tone="info"
        disabled={loading}
        icon={loading ? <Loader2 className="size-4 animate-spin" /> : <PuzzleIcon className="size-4" strokeWidth={2.5} />}
        items={[
          {
            label: "Share previous",
            hint: "The puzzle before, in this folder",
            icon: stepIcons.previous,
            onSelect: () => void share(-1),
            shortcut: COACH_BOARD_SHORTCUT_KEY.sharePrevious
          },
          {
            label: "Share current",
            hint: "This board position — edit it first",
            icon: stepIcons.current,
            onSelect: () => setShareCurrentOpen(true),
            shortcut: COACH_BOARD_SHORTCUT_KEY.askCurrent
          },
          {
            label: "Share next",
            hint: "The next puzzle in this folder",
            icon: stepIcons.next,
            onSelect: () => void share(1),
            shortcut: COACH_BOARD_SHORTCUT_KEY.shareNext
          }
        ]}
      />
      <HoverMenuButton
        label="Load on board"
        tone="success"
        disabled={loading}
        icon={<ArrowDownToLine className="size-4" strokeWidth={2.5} />}
        items={[
          {
            label: "Load previous",
            hint: "Board only — not shared",
            icon: stepIcons.previous,
            onSelect: () => void load(-1),
            shortcut: COACH_BOARD_SHORTCUT_KEY.loadPrevious
          },
          {
            label: "Load current",
            hint: activePuzzle ? "The puzzle the class is solving" : "No puzzle shared right now",
            icon: stepIcons.current,
            onSelect: () => void loadCurrent(),
            disabled: !activePuzzle
          },
          {
            label: "Load next",
            hint: "Board only — not shared",
            icon: stepIcons.next,
            onSelect: () => void load(1),
            shortcut: COACH_BOARD_SHORTCUT_KEY.loadNext
          }
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
