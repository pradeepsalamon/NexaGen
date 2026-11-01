"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  decodeActivityRunMessage,
  LIVE_CLASS_ACTIVITY_RUN_TOPIC,
  type ActivityRunStateResponse,
  type ActivityRunSummary,
  type PlayoutMonitorUpdate
} from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { mergeMonitorUpdates, useActivityRunState } from "../hooks/useActivityRun";
import { useMemberClassId } from "./LiveRoomContext";

/** Several students can move at once: the gallery takes their boards in one paint per this many ms. */
const MONITOR_FLUSH_MS = 300;

type ActivityRunContextValue = {
  classId: string;
  run: ActivityRunSummary | null;
  state: ActivityRunStateResponse | null;
  /** Coach-owner or admin: watches, never plays. */
  isManager: boolean;
  /** The activity's stage / dialog is showing. */
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ActivityRunContext = createContext<ActivityRunContextValue | null>(null);

export function useActivityRun(): ActivityRunContextValue {
  const ctx = useContext(ActivityRunContext);
  if (!ctx) throw new Error("useActivityRun must be used inside <ActivityRunProvider>.");
  return ctx;
}

/** Null outside the room (the class page's queue card). */
export function useOptionalActivityRun(): ActivityRunContextValue | null {
  return useContext(ActivityRunContext);
}

/**
 * The MCQ / Playout running in the class. State comes from REST; the API's
 * packets on `activity_run` only tell this client something changed, or carry
 * one game's small update to a manager. Demo guests have no account to own an
 * answer or a game, so for them this stays empty (`useMemberClassId`).
 */
export function ActivityRunProvider({ children }: { children: ReactNode }) {
  const classId = useMemberClassId();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const isManager = role === "COACH" || isStaffRole(role);
  const state = useActivityRunState(classId);
  const run = state.data?.run ?? null;
  const [open, setOpen] = useState(false);

  // A new activity opens on everyone's stage, once. Closing it stays closed.
  const seenRunId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!state.data) return;
    const id = run?.status === "ACTIVE" ? run.id : null;
    if (seenRunId.current === id) return;
    // Mid-class reload: the running activity reopens too, so a student is put back in their game.
    seenRunId.current = id;
    if (id) setOpen(true);
    else if (!run) setOpen(false);
  }, [state.data, run]);

  // Game updates, batched so a busy class is one paint rather than dozens.
  const pending = useRef<{ runId: string; update: PlayoutMonitorUpdate }[]>([]);
  const flushTimer = useRef<number | null>(null);
  const answerTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
      if (answerTimer.current !== null) window.clearTimeout(answerTimer.current);
    },
    []
  );

  useDataChannel(LIVE_CLASS_ACTIVITY_RUN_TOPIC, (msg) => {
    // Only the API sends on this topic; a packet with a sender is a peer forging it.
    if (msg.from || !classId) return;
    const message = decodeActivityRunMessage(msg.payload);
    if (!message) return;

    if (message.type === "RUN_CHANGED") {
      void qc.invalidateQueries({ queryKey: queryKeys.activityRun.all(classId) });
      void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.current(classId) });
      return;
    }
    if (!isManager) return;
    if (message.type === "MCQ_ANSWERED") {
      if (answerTimer.current !== null) return;
      answerTimer.current = window.setTimeout(() => {
        answerTimer.current = null;
        void qc.invalidateQueries({ queryKey: queryKeys.activityRun.monitor(classId, message.runId) });
      }, 500);
      return;
    }
    pending.current.push({ runId: message.runId, update: message.entry });
    if (flushTimer.current !== null) return;
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      const batch = pending.current;
      pending.current = [];
      const byRun = new Map<string, PlayoutMonitorUpdate[]>();
      for (const item of batch) byRun.set(item.runId, [...(byRun.get(item.runId) ?? []), item.update]);
      for (const [runId, updates] of byRun) {
        if (!mergeMonitorUpdates(qc, classId, runId, updates)) {
          void qc.invalidateQueries({ queryKey: queryKeys.activityRun.monitor(classId, runId) });
        }
      }
    }, MONITOR_FLUSH_MS);
  });

  const value = useMemo<ActivityRunContextValue>(
    () => ({ classId, isManager, open, run, setOpen, state: state.data ?? null }),
    [classId, isManager, open, run, state.data]
  );
  return <ActivityRunContext.Provider value={value}>{children}</ActivityRunContext.Provider>;
}
