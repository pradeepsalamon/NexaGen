import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import type { CoachClassResponse } from "@nexa-chess/types";
import type { ListParams } from "@/lib/pagination";
import {
  getCalendarClasses,
  getClassById,
  getCoachClassDetails,
  getClassHistory,
  getCoachBatches,
  getCoachClasses,
  getCoachDashboard,
  getCoachStudents,
  getUpcomingClasses
} from "../api/coachApi";

export function useCoachDashboard() {
  return useQuery({
    queryKey: queryKeys.coach.dashboard,
    queryFn: getCoachDashboard
  });
}

export function useCoachBatches(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.coach.batches,
    queryFn: getCoachBatches,
    enabled: options?.enabled ?? true
  });
}

/** The schedule calendar's visible range. Keeps the old range on screen while the next one loads. */
export function useCalendarClasses(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.coach.calendarClasses(from, to),
    queryFn: () => getCalendarClasses(from, to),
    placeholderData: keepPreviousData,
    // A class going live (or ending) changes how it is drawn.
    refetchInterval: 60_000
  });
}

export function useTodayClasses() {
  return useQuery({
    queryKey: queryKeys.coach.classes,
    queryFn: getCoachClasses
  });
}

export function useUpcomingClasses(limit?: number) {
  return useQuery({
    queryKey: limit ? queryKeys.coach.upcomingClassesLimited(limit) : queryKeys.coach.upcomingClasses,
    queryFn: () => getUpcomingClasses(limit),
    // A class going live (or ending) changes its card's action, so keep it fresh.
    refetchInterval: limit ? 60_000 : undefined
  });
}

/** Server-paginated (`useServerTable` params); keeps the last page visible while the next loads. */
export function useClassHistory(params: ListParams = {}) {
  return useQuery({
    queryKey: [...queryKeys.coach.classHistory, params],
    queryFn: () => getClassHistory(params),
    placeholderData: keepPreviousData
  });
}

export function useClassDetail(
  id: string,
  options?: Omit<UseQueryOptions<CoachClassResponse, Error>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.coach.classDetail(id),
    queryFn: () => getClassById(id),
    enabled: !!id,
    ...options
  });
}

export function useCoachClassDetailsQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...queryKeys.coach.classes, id, "details"],
    queryFn: () => getCoachClassDetails(id),
    enabled: !!id && enabled,
  });
}

export function useCoachStudents() {
  return useQuery({
    queryKey: queryKeys.coach.students,
    queryFn: getCoachStudents
  });
}
