import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LiveClassTranscriptResponse } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { getTranscriptConsent, getTranscriptPage, setTranscriptConsent } from "../api/transcriptApi";

/** The signed-in coach's own consent to being transcribed. */
export const useTranscriptConsent = (enabled = true) =>
  useQuery({
    enabled,
    queryFn: getTranscriptConsent,
    queryKey: queryKeys.liveClassTranscript.consent,
    staleTime: 5 * 60 * 1000,
  });

export function useSetTranscriptConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setTranscriptConsent,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.liveClassTranscript.consent, data);
    },
  });
}

/** A class's stored transcript, oldest first (coach-owner / admin). */
export const useClassTranscript = (classId: string, enabled = true) =>
  useInfiniteQuery({
    enabled: enabled && !!classId,
    getNextPageParam: (page: LiveClassTranscriptResponse) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getTranscriptPage(classId, pageParam),
    queryKey: queryKeys.liveClassTranscript.lines(classId),
    retry: false,
  });
