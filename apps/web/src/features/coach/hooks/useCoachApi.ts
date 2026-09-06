import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { useToast } from "../../../providers/ToastProvider";
import type { CreateClassRequest, CoachClassResponse } from "@nexa-chess/types";
import {
  createClass,
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

export function useTodayClasses() {
  return useQuery({
    queryKey: queryKeys.coach.classes,
    queryFn: getCoachClasses
  });
}

export function useUpcomingClasses() {
  return useQuery({
    queryKey: queryKeys.coach.upcomingClasses,
    queryFn: getUpcomingClasses
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

// undo: intentionally excluded — no delete endpoint exists for coach classes,
// so a created class can't be undone by deleting it (see docs/UNDO_ARCHITECTURE.md §4).
export function useCreateClass() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateClassRequest) => createClass(data),
    onSuccess: () => {
      toast.success({ title: "Class created successfully" });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.upcomingClasses });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to create class", message: error.message });
    }
  });
}
