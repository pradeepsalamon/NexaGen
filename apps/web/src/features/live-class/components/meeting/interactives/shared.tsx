"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import type { LiveClassInteractiveId, ToolStudentRef } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { getPullRoster } from "../../../api/live-class";
import type { useClassroomTimer } from "../../../hooks/useClassroomTimer";
import { useRoster } from "../../../hooks/useRoster";

type ClassroomTimer = ReturnType<typeof useClassroomTimer>;

/** Everything a tool needs to know about where it is open. */
export type ToolContext = {
  classId: string;
  /** Coach-owner or staff: may change shared tool state. */
  isManager: boolean;
  /** The room's one timer driver (owned by InteractivesProvider, so it runs once). */
  timer: ClassroomTimer;
};

/**
 * How a personal tool (no server state of its own) is open: `present` on the
 * coach's screen while the class sees it — its view is sent to the class —
 * or `watch` on a student's stage, showing the coach's view read-only.
 */
type PresentedView = {
  toolId: LiveClassInteractiveId;
  mode: "present" | "watch";
  /** watch: the coach's latest view (unvalidated). */
  view: unknown;
  /** present: send the current view to the class. */
  publish: (view: unknown) => void;
};

const PresentedViewContext = createContext<PresentedView | null>(null);

export function PresentedViewProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: PresentedView | null;
}) {
  return (
    <PresentedViewContext.Provider value={value}>
      {children}
    </PresentedViewContext.Provider>
  );
}

/**
 * A personal tool's view, shared with the class: while the coach presents the
 * tool its `local` view is sent on every change; a watching student gets the
 * coach's view (`parse` rejects a malformed one, falling back to `local`) and
 * `watching: true`, so the tool hides its controls.
 */
export function useSharedToolView<T>(
  local: T,
  parse: (raw: unknown) => T | null,
): { shown: T; watching: boolean } {
  const ctx = useContext(PresentedViewContext);
  const presenting = ctx?.mode === "present";
  const publish = ctx?.publish;
  useEffect(() => {
    if (presenting && publish) publish(local);
  }, [presenting, publish, local]);

  if (ctx?.mode !== "watch") return { shown: local, watching: false };
  return { shown: parse(ctx.view) ?? local, watching: true };
}

/** True while a student watches the coach's presentation of this tool. */
export function useIsWatching(): boolean {
  return useContext(PresentedViewContext)?.mode === "watch";
}

function isStudentMetadata(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    return (
      (JSON.parse(metadata) as { role?: string }).role?.toUpperCase() ===
      "STUDENT"
    );
  } catch {
    return false;
  }
}

export type RosterSource = "room" | "batch";

/**
 * The students a tool works with: who is in the room now (LiveKit, signed
 * role) or the whole batch roster (the coach's pull roster, plus anyone in the
 * room who isn't on it — a pulled-in guest still counts).
 */
export function useToolRoster(classId: string, enabled: boolean) {
  const participants = useRoster();
  const [source, setSource] = useState<RosterSource>("room");

  const inRoom = useMemo(() => {
    const seen = new Map<string, ToolStudentRef>();
    for (const p of participants) {
      if (!isStudentMetadata(p.metadata)) continue;
      const id = p.identity.split("_")[0];
      if (!seen.has(id)) seen.set(id, { id, name: p.name || "Student" });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [participants]);

  // Same key as the People panel's "Not in class" section, so they share a fetch.
  const roster = useQuery({
    queryKey: queryKeys.livePull.roster(classId),
    queryFn: () => getPullRoster(classId),
    enabled: enabled && !!classId,
    staleTime: 30_000,
  });

  const batch = useMemo(() => {
    const map = new Map<string, ToolStudentRef>();
    for (const s of roster.data?.students ?? []) {
      if (s.inBatch || s.inClass)
        map.set(s.studentId, { id: s.studentId, name: s.name });
    }
    for (const s of inRoom) if (!map.has(s.id)) map.set(s.id, s);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [roster.data, inRoom]);

  return {
    batch,
    inRoom,
    isError: source === "batch" && roster.isError,
    isLoading: source === "batch" && roster.isLoading,
    refetch: roster.refetch,
    setSource,
    source,
    students: source === "room" ? inRoom : batch,
  };
}

export type ToolRoster = ReturnType<typeof useToolRoster>;

/** "In class now / Whole batch" switch plus the roster's loading/error/empty states. */
export function RosterSourcePicker({
  roster,
  emptyHint,
}: {
  roster: ToolRoster;
  emptyHint?: string;
}) {
  return (
    <div className="space-y-2">
      <Tabs
        onValueChange={(v) => roster.setSource(v as RosterSource)}
        value={roster.source}
      >
        <TabsList className="w-full">
          <TabsTrigger className="flex-1" value="room">
            In class now ({roster.inRoom.length})
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="batch">
            Whole batch
            {roster.source === "batch" && !roster.isLoading
              ? ` (${roster.batch.length})`
              : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {roster.isError ? (
        <Alert
          action={
            <Button
              onClick={() => void roster.refetch()}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          }
          variant="error"
        >
          Couldn&apos;t load the batch roster.
        </Alert>
      ) : roster.isLoading ? (
        <p className="text-sm text-app-muted">Loading the roster…</p>
      ) : roster.students.length === 0 ? (
        <Alert variant="info">
          {roster.source === "room"
            ? "No students are in the class right now."
            : "This class has no students on its roster."}
          {emptyHint ? ` ${emptyHint}` : ""}
        </Alert>
      ) : null}
    </div>
  );
}

/** Shown to students on a tool only the coach drives. */
export function CoachRunsThis({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-control bg-app-soft px-3 py-2 text-xs text-app-muted">
      <Lock
        aria-hidden="true"
        className="size-3.5 shrink-0"
        strokeWidth={2.5}
      />
      {children ?? "Your coach runs this tool — you'll see the results here."}
    </p>
  );
}

export function ToolLoading() {
  return <p className="py-6 text-center text-sm text-app-muted">Loading…</p>;
}

export function ToolLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert
      action={
        <Button onClick={onRetry} size="sm" variant="outline">
          Retry
        </Button>
      }
      variant="error"
    >
      Couldn&apos;t load this tool&apos;s saved state.
    </Alert>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-xs font-bold uppercase tracking-wide text-app-muted",
        className,
      )}
    >
      {children}
    </h3>
  );
}

/** Uniformly random integer in [0, n) — crypto when available, so picks are fair. */
export function randomIndex(n: number): number {
  if (n <= 1) return 0;
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

export const cryptoRandom = () => randomIndex(1_000_000) / 1_000_000;

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

/** Per-browser convenience storage (never shared state). Swallows blocked storage. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage — the tool still works, it just won't remember.
  }
}
