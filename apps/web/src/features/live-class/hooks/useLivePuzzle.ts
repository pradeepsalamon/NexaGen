import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdjustLivePuzzlePointsRequest,
  AssignLivePuzzleRequest,
  UpdateLivePuzzleRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  adjustLivePuzzlePoints,
  assignLivePuzzle,
  endLivePuzzle,
  getLivePuzzleBoards,
  getLivePuzzleLeaderboard,
  getLivePuzzleState,
  updateLivePuzzle
} from "../api/liveClassPuzzle";

export function useLivePuzzleState(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.livePuzzle.state(classId),
    queryFn: () => getLivePuzzleState(classId),
    enabled: enabled && !!classId
  });
}

export function useLivePuzzleLeaderboard(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.livePuzzle.leaderboard(classId),
    queryFn: () => getLivePuzzleLeaderboard(classId),
    enabled: enabled && !!classId,
    // The board changes only when a student finishes; a short poll keeps every
    // viewer roughly current without a per-attempt broadcast.
    refetchInterval: enabled ? 4000 : false
  });
}

// Coach-only. A faster poll than the leaderboard's since this is the live
// "walk the room" view — only fetched while the panel is actually open.
export function useLivePuzzleBoards(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.livePuzzle.boards(classId),
    queryFn: () => getLivePuzzleBoards(classId),
    enabled: enabled && !!classId,
    refetchInterval: enabled ? 3000 : false
  });
}

// undo: intentionally excluded — a mid-class server broadcast reaches every
// participant instantly; a silent client revert would not re-broadcast.
export function useAssignLivePuzzle(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: AssignLivePuzzleRequest) => assignLivePuzzle(classId, body),
    onSuccess: () => {
      toast.success({ title: "Puzzle shared with the class" });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.state(classId) });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.boards(classId) });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't share the puzzle", message: error.message })
  });
}

// undo: intentionally excluded — same reasoning as useAssignLivePuzzle.
export function useEndLivePuzzle(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => endLivePuzzle(classId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.state(classId) });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.boards(classId) });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't end the puzzle", message: error.message })
  });
}

// undo: intentionally excluded — a mid-class broadcast (PUZZLE_UPDATED) reaches
// every participant instantly; same policy as mid-class settings changes.
export function useUpdateLivePuzzle(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateLivePuzzleRequest) => updateLivePuzzle(classId, body),
    onSuccess: () => {
      toast.success({ title: "Puzzle rules updated", message: "Points were recalculated for everyone." });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.state(classId) });
      qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update the puzzle", message: error.message })
  });
}

// undo: intentionally excluded — an adjustment is its own reverse (the opposite
// +/- button), and the running total is on screen immediately.
export function useAdjustLivePuzzlePoints(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: AdjustLivePuzzlePointsRequest) => adjustLivePuzzlePoints(classId, body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.livePuzzle.leaderboard(classId), data);
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't adjust points", message: error.message })
  });
}
