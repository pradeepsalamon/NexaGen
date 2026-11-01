import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  mergePlayoutMonitorEntry,
  type ActivityRunMonitorResponse,
  type ActivityRunStateResponse,
  type PlayoutGameResponse,
  type PlayoutMonitorUpdate,
  type SubmitMcqAnswerRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  askPlayoutHint,
  continuePlayoutGame,
  endActivityRun,
  getActivityRunGame,
  getActivityRunMonitor,
  getActivityRunState,
  playPlayoutMove,
  resignPlayoutGame,
  retryPlayoutGame,
  revealActivityRun,
  startPlayoutGame,
  submitMcqAnswer
} from "../api/liveClassActivityRun";
import { noteServerTime } from "./useCountdown";

/** The caller's own view. Packets nudge it; the slow poll is what recovers a dropped one or a reconnect. */
export function useActivityRunState(classId: string) {
  return useQuery({
    enabled: !!classId,
    queryFn: async () => {
      const state = await getActivityRunState(classId);
      noteServerTime(state.serverTime);
      return state;
    },
    queryKey: queryKeys.activityRun.state(classId),
    refetchInterval: 15_000,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true
  });
}

/** Coach-owner / admin: everyone's boards or answers. REST is the record, so a reconnect restores it all. */
export function useActivityRunMonitor(classId: string, runId: string | null) {
  return useQuery({
    enabled: !!classId && !!runId,
    queryFn: async () => {
      const monitor = await getActivityRunMonitor(classId, runId as string);
      noteServerTime(monitor.serverTime);
      return monitor;
    },
    queryKey: queryKeys.activityRun.monitor(classId, runId ?? ""),
    refetchInterval: 15_000,
    refetchOnReconnect: true
  });
}

/** One student's game for the enlarged board. Refetched as its ply moves. */
export function useActivityRunGame(classId: string, runId: string, gameId: string | null, ply: number) {
  return useQuery({
    enabled: !!gameId,
    queryFn: () => getActivityRunGame(classId, runId, gameId as string),
    queryKey: queryKeys.activityRun.game(classId, gameId ?? "", ply)
  });
}

/** Apply a batch of game updates to the coach's gallery; false if a new student needs a refetch. */
export function mergeMonitorUpdates(qc: QueryClient, classId: string, runId: string, updates: PlayoutMonitorUpdate[]): boolean {
  let complete = true;
  qc.setQueryData<ActivityRunMonitorResponse>(queryKeys.activityRun.monitor(classId, runId), (old) => {
    if (!old || old.kind !== "PLAYOUT") return old;
    let entries = old.entries;
    for (const update of updates) {
      const index = entries.findIndex((e) => e.studentId === update.studentId);
      if (index === -1) {
        complete = false;
        continue;
      }
      const merged = mergePlayoutMonitorEntry(entries[index], update);
      if (merged !== entries[index]) {
        entries = [...entries];
        entries[index] = merged;
      }
    }
    return entries === old.entries ? old : { ...old, entries };
  });
  return complete;
}

function usePutPlayoutGame(classId: string) {
  const qc = useQueryClient();
  return (response: PlayoutGameResponse) => {
    noteServerTime(response.serverTime);
    qc.setQueryData<ActivityRunStateResponse>(queryKeys.activityRun.state(classId), (old) =>
      old?.playout
        ? {
            ...old,
            playout: {
              ...old.playout,
              attemptsUsed: response.attemptsUsed,
              canRetry: response.canRetry,
              game: response.game
            }
          }
        : old
    );
  };
}

export function usePlayoutActions(classId: string) {
  const put = usePutPlayoutGame(classId);
  const toast = useToast();
  const onError = (title: string) => (error: Error) => toast.error({ message: error.message, title });

  // undo: intentionally excluded — chess moves and a student's own game state are not undoable.
  const start = useMutation({
    mutationFn: (runId: string) => startPlayoutGame(classId, runId),
    onError: onError("Couldn't open your game"),
    onSuccess: put
  });
  const move = useMutation({
    mutationFn: (vars: { runId: string; gameId: string; uci: string; ply: number }) =>
      playPlayoutMove(classId, vars.runId, vars.gameId, { ply: vars.ply, uci: vars.uci }),
    onSuccess: put
  });
  // Quiet: the student just sees "computer is thinking" until a retry lands.
  const continueGame = useMutation({
    mutationFn: (vars: { runId: string; gameId: string }) => continuePlayoutGame(classId, vars.runId, vars.gameId),
    onSuccess: put
  });
  const hint = useMutation({
    mutationFn: (vars: { runId: string; gameId: string }) => askPlayoutHint(classId, vars.runId, vars.gameId),
    onError: onError("Couldn't get a hint"),
    onSuccess: put
  });
  const retry = useMutation({
    mutationFn: (vars: { runId: string; gameId: string }) => retryPlayoutGame(classId, vars.runId, vars.gameId),
    onError: onError("Couldn't start again"),
    onSuccess: put
  });
  const resign = useMutation({
    mutationFn: (vars: { runId: string; gameId: string }) => resignPlayoutGame(classId, vars.runId, vars.gameId),
    onError: onError("Couldn't end the game"),
    onSuccess: put
  });
  return { continueGame, hint, move, resign, retry, start };
}

// undo: intentionally excluded — an answer submitted to the class is final, within its tries.
export function useSubmitMcq(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (vars: { runId: string; body: SubmitMcqAnswerRequest }) => submitMcqAnswer(classId, vars.runId, vars.body),
    onError: (error: Error) => {
      toast.error({ message: error.message, title: "Couldn't submit your answer" });
      void qc.invalidateQueries({ queryKey: queryKeys.activityRun.state(classId) });
    },
    onSuccess: (data) => {
      noteServerTime(data.serverTime);
      qc.setQueryData<ActivityRunStateResponse>(queryKeys.activityRun.state(classId), (old) => (old ? { ...old, mcq: data.mcq } : old));
    }
  });
}

// undo: intentionally excluded — ending or revealing is broadcast to the class at once.
export function useActivityRunControls(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.activityRun.all(classId) });
    void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.list(classId) });
  };
  const end = useMutation({
    mutationFn: (runId: string) => endActivityRun(classId, runId),
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't end the activity" }),
    onSuccess: refresh
  });
  const reveal = useMutation({
    mutationFn: (runId: string) => revealActivityRun(classId, runId),
    onError: (error: Error) => toast.error({ message: error.message, title: "Couldn't reveal the answer" }),
    onSuccess: refresh
  });
  return { end, reveal };
}
