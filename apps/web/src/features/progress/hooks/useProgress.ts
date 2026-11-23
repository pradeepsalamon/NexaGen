import type {
  StudentActivityHistoryQuery,
  StudentActivityHistoryResponse,
  StudentActivityScope,
  StudentPlayingProfile
} from "@nexa-chess/types";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  getActivityHistory,
  getActivitySummary,
  getMyProgress,
  getPlayingProfile,
  getStudentProgress,
  updatePlayingProfile
} from "../api/progressApi";

/** Rating, date of birth and level, as staff see them (review F1). */
export function usePlayingProfile(studentId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: queryKeys.progress.playingProfile(studentId),
    queryFn: () => getPlayingProfile(studentId)
  });
}

export function useUpdatePlayingProfile(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: StudentPlayingProfile) => updatePlayingProfile(studentId, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.progress.playingProfile(studentId), saved);
    }
  });
}

/** Rating + streak for a student, or for the signed-in student when `studentId` is null. */
export function useProgressFor(studentId: string | null) {
  return useQuery({
    queryKey: studentId ? queryKeys.progress.student(studentId) : queryKeys.progress.mine,
    queryFn: () => (studentId ? getStudentProgress(studentId) : getMyProgress())
  });
}

export function useActivitySummary(studentId: string | null, scope: StudentActivityScope) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryKey: queryKeys.progress.summary(studentId ?? "me", scope),
    queryFn: () => getActivitySummary(studentId, scope)
  });
}

/** Paged with the API's keyset cursor; "Load more" fetches the next page only. */
export function useActivityHistory(studentId: string | null, query: Omit<StudentActivityHistoryQuery, "cursor">) {
  return useInfiniteQuery({
    getNextPageParam: (last: StudentActivityHistoryResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryKey: queryKeys.progress.history(studentId ?? "me", query),
    queryFn: ({ pageParam }) => getActivityHistory(studentId, { ...query, cursor: pageParam })
  });
}
