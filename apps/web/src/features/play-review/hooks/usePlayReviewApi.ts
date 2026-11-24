import type { PlayFeedResponse, PlaySource, SetAiReviewConsentRequest, UpdateAiPlayReviewSettingsRequest } from "@nexa-chess/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  getAiPlayReviewSettings,
  getAiReviewConsent,
  getPlayFeed,
  getPlayItem,
  getPlayRollup,
  setAiReviewConsent,
  updateAiPlayReviewSettings
} from "../api/playReviewApi";

/** Newest first, paged by cursor. `studentId` null = the signed-in student. */
export function usePlayFeed(studentId: string | null, source: PlaySource | undefined) {
  return useInfiniteQuery({
    getNextPageParam: (last: PlayFeedResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryKey: queryKeys.playReview.feed(studentId ?? "me", source ?? "all"),
    queryFn: ({ pageParam }) => getPlayFeed(studentId, { cursor: pageParam, source })
  });
}

export function usePlayItem(studentId: string | null, item: { source: PlaySource; sourceId: string } | null) {
  return useQuery({
    enabled: !!item,
    queryKey: queryKeys.playReview.item(studentId ?? "me", item ? `${item.source}:${item.sourceId}` : ""),
    queryFn: () => getPlayItem(studentId, item!.source, item!.sourceId)
  });
}

export function usePlayRollup(studentId: string | null) {
  return useQuery({ queryKey: queryKeys.playReview.rollup(studentId ?? "me"), queryFn: () => getPlayRollup(studentId) });
}

export function useAiReviewConsent(studentId: string | null, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.playReview.consent(studentId ?? "me"),
    queryFn: () => getAiReviewConsent(studentId)
  });
}

export function useSetAiReviewConsent(studentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetAiReviewConsentRequest) => setAiReviewConsent(studentId, body),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.playReview.consent(studentId ?? "me"), state);
      // Withdrawing deletes the outside AI's comments.
      void queryClient.invalidateQueries({ queryKey: queryKeys.playReview.all });
    }
  });
}

export function useAiPlayReviewSettings() {
  return useQuery({ queryKey: queryKeys.playReview.settings, queryFn: getAiPlayReviewSettings });
}

export function useUpdateAiPlayReviewSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAiPlayReviewSettingsRequest) => updateAiPlayReviewSettings(body),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.playReview.settings, settings)
  });
}
