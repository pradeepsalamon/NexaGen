"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LiveClassInteractiveId, PresentingState, PuzzleRushMode } from "@nexa-chess/types";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useClassroomTimer } from "../../../hooks/useClassroomTimer";
import {
  useClassroomTool,
  useClassroomToolsSync,
  useSaveClassroomTool,
} from "../../../hooks/useClassroomTools";
import { usePuzzleRush, usePuzzleRushSync } from "../../../hooks/usePuzzleRush";
import { useMemberClassId } from "../../../providers/LiveRoomContext";

/** The Interactive that plays each Storm / Racer round. */
const PUZZLE_RUSH_TOOL: Record<PuzzleRushMode, LiveClassInteractiveId> = {
  RACER: "puzzle-racer",
  STORM: "puzzle-storm",
};

/** How long a personal tool's view settles before it is sent to the class. */
const VIEW_DEBOUNCE_MS = 400;

type InteractivesContextValue = {
  classId: string;
  /** Coach-owner or staff: opens tools and presents them. Students only watch. */
  isManager: boolean;
  /** What the coach is showing the class (null until anything was shown). */
  presenting: PresentingState | null;
  /** Coach: show this tool to the class (null stops showing). */
  present: (toolId: LiveClassInteractiveId | null) => void;
  /** Coach: send what a personal tool shows now (debounced; ignored unless that tool is presented). */
  publishView: (toolId: LiveClassInteractiveId, view: unknown) => void;
  /** Student: whether the presented tool is open on their stage. */
  studentOpen: boolean;
  setStudentOpen: (open: boolean) => void;
};

type ClassroomTimer = ReturnType<typeof useClassroomTimer>;

const InteractivesContext = createContext<InteractivesContextValue | null>(null);
// Separate, because the timer re-renders every tick while it runs and the
// layout reading the presentation must not.
const TimerContext = createContext<ClassroomTimer | null>(null);

/**
 * Room-wide Interactives state, mounted once per room (inside `<LiveKitRoom>`):
 * the `classroom_tools` packet listener, the single classroom-timer driver,
 * the `puzzle_rush` listener, and what the coach is presenting. Students never
 * open a tool themselves — when the coach presents one it opens on their main
 * stage, read-only (Storm / Racer are the exception: students play those, and a
 * running round stays on their stage until it ends).
 */
export function InteractivesProvider({ children }: { children: ReactNode }) {
  const classId = useMemberClassId();
  const user = useAuthStore((s) => s.user);
  // Same rule as the rest of the toolbar; the API re-checks class ownership.
  const isManager = user?.role === "COACH" || isStaffRole(user?.role);

  useClassroomToolsSync(classId);
  const timer = useClassroomTimer(classId, isManager);
  const { state: presented } = useClassroomTool(classId, "PRESENTING");
  usePuzzleRushSync(classId);
  const { rush } = usePuzzleRush(classId);

  // A student in a running Storm / Racer round keeps that board on their stage
  // whatever else the coach opens or closes — closing the coach's panel must
  // not pull the game out from under them.
  const rushTool = rush && rush.status !== "ENDED" ? PUZZLE_RUSH_TOOL[rush.mode] : null;
  const rushStartedAt = rush?.createdAt ?? null;
  const presenting = useMemo<PresentingState | null>(() => {
    if (isManager || !rushTool) return presented;
    if (presented?.toolId === rushTool) return presented;
    return { startedAt: rushStartedAt, toolId: rushTool, view: null };
  }, [isManager, presented, rushStartedAt, rushTool]);
  const save = useSaveClassroomTool(classId, "PRESENTING");
  const saveRef = useRef(save.mutate);
  saveRef.current = save.mutate;

  // The coach's own idea of what is presented — the query cache can lag a save.
  const current = useRef<{ toolId: LiveClassInteractiveId | null; startedAt: string | null }>({
    startedAt: null,
    toolId: null,
  });
  const viewTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!isManager || !presenting) return;
    if (!current.current.startedAt) {
      current.current = { startedAt: presenting.startedAt, toolId: presenting.toolId };
    }
  }, [isManager, presenting]);

  const clearPendingView = () => {
    if (viewTimer.current !== null) window.clearTimeout(viewTimer.current);
    viewTimer.current = null;
  };

  const present = useCallback(
    (toolId: LiveClassInteractiveId | null) => {
      if (!isManager) return;
      clearPendingView();
      if (current.current.toolId === toolId) return;
      const startedAt = toolId ? new Date().toISOString() : null;
      current.current = { startedAt, toolId };
      saveRef.current({ startedAt, toolId, view: null });
    },
    [isManager],
  );

  const publishView = useCallback(
    (toolId: LiveClassInteractiveId, view: unknown) => {
      if (!isManager || current.current.toolId !== toolId) return;
      clearPendingView();
      viewTimer.current = window.setTimeout(() => {
        viewTimer.current = null;
        // Re-checked: the coach may have closed or switched tools meanwhile.
        if (current.current.toolId !== toolId) return;
        saveRef.current({ startedAt: current.current.startedAt, toolId, view });
      }, VIEW_DEBOUNCE_MS);
    },
    [isManager],
  );

  useEffect(() => clearPendingView, []);

  // A new presentation opens on every student's stage; ending it closes it.
  const [studentOpen, setStudentOpen] = useState(false);
  // A new Storm / Racer round re-opens it too, even for a student who hid the tool.
  const presentedKey = presenting?.toolId
    ? `${presenting.toolId}@${presenting.startedAt ?? ""}@${rushTool ? rushStartedAt : ""}`
    : null;
  useEffect(() => {
    if (isManager) return;
    setStudentOpen(!!presentedKey);
  }, [isManager, presentedKey]);

  const value = useMemo<InteractivesContextValue>(
    () => ({
      classId,
      isManager,
      present,
      presenting,
      publishView,
      setStudentOpen,
      studentOpen,
    }),
    [classId, isManager, present, presenting, publishView, studentOpen],
  );

  return (
    <InteractivesContext.Provider value={value}>
      <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>
    </InteractivesContext.Provider>
  );
}

/** The room's one classroom-timer driver (owned by the provider, so it runs once). */
export function useInteractivesTimer(): ClassroomTimer {
  const timer = useContext(TimerContext);
  if (!timer) throw new Error("useInteractivesTimer must be used inside <InteractivesProvider>.");
  return timer;
}

export function useInteractives(): InteractivesContextValue {
  const value = useContext(InteractivesContext);
  if (!value) throw new Error("useInteractives must be used inside <InteractivesProvider>.");
  return value;
}

export function useOptionalInteractives(): InteractivesContextValue | null {
  return useContext(InteractivesContext);
}
