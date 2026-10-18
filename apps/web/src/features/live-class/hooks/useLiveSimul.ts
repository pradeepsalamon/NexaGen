import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  LiveSimulGame,
  LiveSimulGameActionRequest,
  LiveSimulStateResponse,
  SimulSide,
  StartLiveSimulRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  addLiveSimulPlayer,
  endLiveSimul,
  getLiveSimul,
  liveSimulGameAction,
  playLiveSimulEngineMove,
  playLiveSimulMove,
  startLiveSimul
} from "../api/liveClassSimul";

export function useLiveSimulState(classId: string) {
  return useQuery({
    queryKey: queryKeys.liveSimul.state(classId),
    queryFn: () => getLiveSimul(classId),
    enabled: !!classId,
    // Packets drive updates; the slow poll only heals a dropped one.
    refetchInterval: 20_000
  });
}

/**
 * Merge one game into the cached simul. A copy older than what we hold (lower
 * `ply`) is ignored, so a late packet never rewinds an optimistic move.
 * Returns the game it replaced, or null when nothing changed.
 */
export function mergeSimulGame(
  qc: QueryClient,
  classId: string,
  game: LiveSimulGame
): { previous: LiveSimulGame } | null {
  let result: { previous: LiveSimulGame } | null = null;
  qc.setQueryData<LiveSimulStateResponse>(queryKeys.liveSimul.state(classId), (old) => {
    if (!old?.simul || old.simul.id !== game.simulId) return old;
    const index = old.simul.games.findIndex((g) => g.id === game.id);
    if (index === -1) return old;
    const current = old.simul.games[index];
    // A finished game never reopens, even from a same-ply ongoing copy.
    if (current.ply > game.ply || (current.status === "FINISHED" && game.status === "ONGOING")) return old;
    result = { previous: current };
    const games = [...old.simul.games];
    games[index] = game;
    return { simul: { ...old.simul, games } };
  });
  return result;
}

function useInvalidateSimul(classId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.liveSimul.state(classId) });
}

// undo: intentionally excluded — starting a simul is a mid-class broadcast every
// participant sees at once, same policy as sharing a puzzle.
export function useStartLiveSimul(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: StartLiveSimulRequest) => startLiveSimul(classId, body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.liveSimul.state(classId), data);
      toast.success({ title: "Simul started", message: `${data.simul?.games.length ?? 0} boards are live.` });
    },
    onError: (error: Error) => toast.error({ title: "Couldn't start the simul", message: error.message })
  });
}

// undo: intentionally excluded — same reasoning as useStartLiveSimul.
export function useEndLiveSimul(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => endLiveSimul(classId),
    onSuccess: (data) => qc.setQueryData(queryKeys.liveSimul.state(classId), data),
    onError: (error: Error) => toast.error({ title: "Couldn't end the simul", message: error.message })
  });
}

// undo: intentionally excluded — the added student is dropped straight into a game.
export function useAddLiveSimulPlayer(classId: string) {
  const invalidate = useInvalidateSimul(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (studentId: string) => addLiveSimulPlayer(classId, { studentId }),
    onSuccess: (data) => {
      toast.success({ title: `${data.game.studentName} joined the simul` });
      void invalidate();
    },
    onError: (error: Error) => toast.error({ title: "Couldn't add the player", message: error.message })
  });
}

type MoveVars = { game: LiveSimulGame; uci: string; san: string; fen: string };

// undo: intentionally excluded — a chess move is never taken back.
export function useLiveSimulMove(classId: string, side: SimulSide) {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateSimul(classId);
  return useMutation({
    mutationFn: ({ game, uci }: MoveVars) => playLiveSimulMove(classId, game.id, { uci, ply: game.ply }),
    onMutate: ({ game, uci, san, fen }) => {
      mergeSimulGame(qc, classId, {
        ...game,
        drawOfferedBy: null,
        fen,
        moves: [...game.moves, { by: side, san, uci }],
        ply: game.ply + 1,
        turn: side === "COACH" ? "STUDENT" : "COACH",
        turnSince: new Date().toISOString()
      });
    },
    onSuccess: (data) => mergeSimulGame(qc, classId, data.game),
    onError: (error: Error) => {
      toast.error({ title: "Move not played", message: error.message });
      void invalidate();
    }
  });
}

// undo: intentionally excluded — same as useLiveSimulMove.
export function useLiveSimulEngineMove(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateSimul(classId);
  return useMutation({
    mutationFn: ({ game, skillLevel }: { game: LiveSimulGame; skillLevel?: number }) =>
      playLiveSimulEngineMove(classId, game.id, { ply: game.ply, skillLevel }),
    onSuccess: (data) => mergeSimulGame(qc, classId, data.game),
    onError: (error: Error, { game }) => {
      toast.error({ title: `Engine move failed on ${game.studentName}'s board`, message: error.message });
      void invalidate();
    }
  });
}

// undo: intentionally excluded — resign / draw / adjudication end a game the
// opponent sees immediately.
export function useLiveSimulAction(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const invalidate = useInvalidateSimul(classId);
  return useMutation({
    mutationFn: ({ game, body }: { game: LiveSimulGame; body: LiveSimulGameActionRequest }) =>
      liveSimulGameAction(classId, game.id, body),
    onSuccess: (data) => mergeSimulGame(qc, classId, data.game),
    onError: (error: Error) => {
      toast.error({ title: "Couldn't update the game", message: error.message });
      void invalidate();
    }
  });
}
