import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/providers/ToastProvider";
import { queryKeys } from "@/lib/queryKeys";
import { getDemoClasses, createDemoClass, updateDemoClass, cancelDemoClass, restoreDemoClass, getDemoClassDetails } from "../api/adminApi";
import type { CreateDemoClassRequest, UpdateDemoClassRequest, DemoClass, ListDemoClassesResponse } from "@nexa-chess/types";

export function useDemoClassesQuery() {
  return useQuery<ListDemoClassesResponse, Error>({
    queryKey: [...queryKeys.admin.base, "demo-classes"],
    queryFn: getDemoClasses
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
