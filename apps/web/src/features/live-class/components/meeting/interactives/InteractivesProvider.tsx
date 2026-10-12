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
import { useParams } from "next/navigation";
import type { LiveClassInteractiveId, PresentingState } from "@nexa-chess/types";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useClassroomTimer } from "../../../hooks/useClassroomTimer";
import {
  useClassroomTool,
  useClassroomToolsSync,
  useSaveClassroomTool,
} from "../../../hooks/useClassroomTools";

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
 * and what the coach is presenting. Students never open a tool themselves —
 * when the coach presents one it opens on their main stage, read-only.
 */
export function InteractivesProvider({ children }: { children: ReactNode }) {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const user = useAuthStore((s) => s.user);
  // Same rule as the rest of the toolbar; the API re-checks class ownership.
  const isManager = user?.role === "COACH" || isStaffRole(user?.role);

  useClassroomToolsSync(classId);
  const timer = useClassroomTimer(classId, isManager);
  const { state: presenting } = useClassroomTool(classId, "PRESENTING");
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
  const presentedKey = presenting?.toolId ? `${presenting.toolId}@${presenting.startedAt ?? ""}` : null;
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
