import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";
import type { ListParams } from "@/lib/pagination";
import { addDemoInvitees, createDemoSchedule, getDemoClasses, getDemoSchedules, createDemoClass, updateDemoClass, cancelDemoClass, restoreDemoClass, getDemoClassDetails, updateDemoSchedule } from "../api/adminApi";
import type { AddDemoInviteesRequest, AddDemoInviteesResponse, CreateDemoClassRequest, CreateDemoScheduleRequest, DemoScheduleResponse, ListDemoSchedulesResponse, UpdateDemoClassRequest, DemoClass, ListDemoClassesResponse } from "@nexa-chess/types";

export function useDemoClassesQuery(params: ListParams = {}) {
  return useQuery<ListDemoClassesResponse, Error>({
    queryKey: [...queryKeys.admin.base, "demo-classes", params],
    queryFn: () => getDemoClasses(params),
    placeholderData: keepPreviousData
  });
}

export function useCreateDemoClassMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoClass, Error, CreateDemoClassRequest>({
    mutationFn: createDemoClass,
    onSuccess: () => {
      toast.success({ title: "Demo class created successfully" });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.base, "demo-classes"] });
    },
    onError: (error) => {
      toast.error({ title: "Failed to create demo class", message: error.message });
    }
  });
}

export function useUpdateDemoClassMutation(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoClass, Error, UpdateDemoClassRequest>({
    mutationFn: (data) => updateDemoClass(id, data),
    onSuccess: () => {
      toast.success({ title: "Demo class updated successfully" });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.base, "demo-classes"] });
    },
    onError: (error) => {
      toast.error({ title: "Failed to update demo class", message: error.message });
    }
  });
}

export function useCancelDemoClassMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoClass, Error, string>({
    mutationFn: (id) => cancelDemoClass(id),
    onSuccess: () => {
      toast.success({ title: "Demo class cancelled successfully" });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.base, "demo-classes"] });
    },
    onError: (error) => {
      toast.error({ title: "Failed to cancel demo class", message: error.message });
    }
  });
}

export function useRestoreDemoClassMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoClass, Error, string>({
    mutationFn: (id) => restoreDemoClass(id),
    onSuccess: () => {
      toast.success({ title: "Demo class restored successfully" });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.base, "demo-classes"] });
    },
    onError: (error) => {
      toast.error({ title: "Failed to restore demo class", message: error.message });
    }
  });
}

export function useDemoClassDetailsQuery(classId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: [...queryKeys.admin.base, "demo-class", classId],
    queryFn: () => getDemoClassDetails(classId),
    enabled
  });
}

export const demoQueryKeys = {
  classes: [...queryKeys.admin.base, "demo-classes"] as const,
  classDetails: (classId: string) => [...queryKeys.admin.base, "demo-class", classId] as const,
  schedules: [...queryKeys.admin.base, "demo-schedules"] as const
};

export function useAddDemoInviteesMutation(classId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<AddDemoInviteesResponse, Error, AddDemoInviteesRequest>({
    mutationFn: (body) => addDemoInvitees(classId, body),
    onSuccess: ({ added, skipped }) => {
      toast.success({
        title: added === 1 ? "1 guest invited" : `${added} guests invited`,
        message: skipped > 0 ? `${skipped} already on the list.` : undefined
      });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.classDetails(classId) });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.classes });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
    onError: (error) => {
      toast.error({ title: "Failed to invite guests", message: error.message });
    }
  });
}

export function useDemoSchedulesQuery() {
  return useQuery<ListDemoSchedulesResponse, Error>({
    queryKey: demoQueryKeys.schedules,
    queryFn: getDemoSchedules
  });
}

export function useSaveDemoScheduleMutation(scheduleId: string | null) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoScheduleResponse, Error, CreateDemoScheduleRequest>({
    mutationFn: (body) => (scheduleId ? updateDemoSchedule(scheduleId, body) : createDemoSchedule(body)),
    onSuccess: () => {
      toast.success({ title: scheduleId ? "Demo schedule updated" : "Demo schedule created" });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.schedules });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.classes });
    },
    onError: (error) => {
      toast.error({ title: "Failed to save demo schedule", message: error.message });
    }
  });
}

export function useToggleDemoScheduleMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<DemoScheduleResponse, Error, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => updateDemoSchedule(id, { isActive }),
    onSuccess: ({ schedule }) => {
      toast.success({ title: schedule.isActive ? "Demo schedule resumed" : "Demo schedule paused" });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.schedules });
      queryClient.invalidateQueries({ queryKey: demoQueryKeys.classes });
    },
    onError: (error) => {
      toast.error({ title: "Failed to update demo schedule", message: error.message });
    }
  });
}
