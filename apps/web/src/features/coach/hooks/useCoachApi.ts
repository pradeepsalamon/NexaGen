import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import type { CoachClassResponse } from "@nexa-chess/types";
import {
  getCalendarClasses,
  getClassById,
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

export function useClassHistory() {
  return useQuery({
    queryKey: queryKeys.coach.classHistory,
    queryFn: getClassHistory
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

async function getCoachClassDetails(id: string): Promise<import("@nexa-chess/types").CoachClassDetailsResponse> {
  const { API_ROUTES } = await import("@nexa-chess/types");
  const { apiFetch } = await import("@/lib/api");
  return await apiFetch(API_ROUTES.coach.classDetails(id));
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
