import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../lib/queryKeys";
import { useToast } from "../../../providers/ToastProvider";
import type { CreateClassRequest, UpdateClassRequest } from "@nexa-gen/types";
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

export function useClassDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.coach.classDetail(id),
    queryFn: () => getClassById(id),
    enabled: !!id
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

export function useCancelClass(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: () => cancelClass(id),
    onSuccess: () => {
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
