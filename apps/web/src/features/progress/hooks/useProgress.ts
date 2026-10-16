import type {
  StudentActivityHistoryQuery,
  StudentActivityHistoryResponse,
  StudentActivityScope
} from "@nexa-chess/types";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getActivityHistory, getActivitySummary, getMyProgress, getStudentProgress } from "../api/progressApi";

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
