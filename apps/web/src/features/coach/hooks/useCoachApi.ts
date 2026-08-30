import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { useToast } from "../../../providers/ToastProvider";
import type { CreateClassRequest, UpdateClassRequest, CoachClassResponse } from "@nexa-chess/types";
import {
  cancelClass,
  createClass,
  getClassById,
  getClassHistory,
  getCoachBatches,
  getCoachClasses,
  getCoachDashboard,
  getCoachStudents,
  getUpcomingClasses,
  updateClass
} from "../api/coachApi";

export function useCoachDashboard() {
  return useQuery({
    queryKey: queryKeys.coach.dashboard,
    queryFn: getCoachDashboard
  });
}

export function useCoachBatches() {
  return useQuery({
    queryKey: queryKeys.coach.batches,
    queryFn: getCoachBatches
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

export function useUpdateClass(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: UpdateClassRequest) => updateClass(id, data),
    onSuccess: () => {
      toast.success({ title: "Class updated successfully" });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classDetail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.upcomingClasses });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to update class", message: error.message });
    }
  });
}

export function useCancelClass() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => cancelClass(id),
    onSuccess: (_data, id) => {
      toast.success({ title: "Class cancelled successfully" });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classDetail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.upcomingClasses });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.classHistory });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to cancel class", message: error.message });
    }
  });
}
