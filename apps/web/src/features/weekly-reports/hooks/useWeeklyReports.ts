import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { WeeklyReportListResponse } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { getMyWeeklyReports, getStudentWeeklyReports, getWeeklyReportPreview } from "../api/weeklyReportsApi";

const nextCursor = (last: WeeklyReportListResponse) => last.nextCursor ?? undefined;

/** The signed-in student's reports, newest week first. */
export function useMyWeeklyReports() {
  return useInfiniteQuery({
    getNextPageParam: nextCursor,
    initialPageParam: undefined as string | undefined,
    queryKey: queryKeys.weeklyReports.mine,
    queryFn: ({ pageParam }) => getMyWeeklyReports(pageParam)
  });
}

/** Staff: one student's reports. */
export function useStudentWeeklyReports(studentId: string) {
  return useInfiniteQuery({
    getNextPageParam: nextCursor,
    initialPageParam: undefined as string | undefined,
    queryKey: queryKeys.weeklyReports.forStudent(studentId),
    queryFn: ({ pageParam }) => getStudentWeeklyReports(studentId, pageParam)
  });
}

/** Staff: this week so far (built on request). */
export function useWeeklyReportPreview(studentId: string) {
  return useQuery({ queryKey: queryKeys.weeklyReports.preview(studentId), queryFn: () => getWeeklyReportPreview(studentId) });
}
