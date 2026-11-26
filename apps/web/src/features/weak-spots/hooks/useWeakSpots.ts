import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReadWeakSpotTipRequest, TacticMotif, WeakSpotHomeworkRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  getMyWeakSpots,
  getWeakSpotTips,
  getWeakSpots,
  makeWeakSpotHomework,
  readWeakSpotTip,
  unreadWeakSpotTip
} from "../api/weakSpotsApi";

/** A student's weak spots and strengths (computed on the server, never stored). */
export function useWeakSpots(studentId: string) {
  return useQuery({ queryKey: queryKeys.playReview.weakSpots(studentId), queryFn: () => getWeakSpots(studentId) });
}

/** The signed-in student's own (tips only once their academy read them). */
export function useMyWeakSpots() {
  return useQuery({ queryKey: queryKeys.playReview.weakSpotsMine, queryFn: getMyWeakSpots });
}

export function useWeakSpotTips(enabled = true) {
  return useQuery({ enabled, queryKey: queryKeys.playReview.weakSpotTips, queryFn: getWeakSpotTips });
}

/** Read (or reword) / hide one tip; every weak-spot view picks up the change. */
export function useWeakSpotTipMutations() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: queryKeys.playReview.all });
  return {
    read: useMutation({
      mutationFn: ({ motif, body }: { motif: TacticMotif; body: ReadWeakSpotTipRequest }) => readWeakSpotTip(motif, body),
      onSuccess
    }),
    unread: useMutation({ mutationFn: (motif: TacticMotif) => unreadWeakSpotTip(motif), onSuccess })
  };
}

export function useMakeWeakSpotHomework(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WeakSpotHomeworkRequest) => makeWeakSpotHomework(studentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assignments.all })
  });
}
