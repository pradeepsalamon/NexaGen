import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignLeadDemoClassRequest,
  CreateLeadNoteRequest,
  UpdateLeadStatusRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import type { ListParams } from "@/lib/pagination";
import { useToast } from "@/providers/ToastProvider";
import {
  addLeadNote,
  assignLeadDemoClass,
  deleteLead,
  getLeadDetails,
  getLeadMetrics,
  getLeads,
  getUpcomingDemoClasses,
  updateLeadStatus
} from "../api/leadAdminApi";

export function useLeadsQuery(params: ListParams = {}) {
  return useQuery({
    queryKey: queryKeys.leads.list(params),
    queryFn: () => getLeads(params),
    placeholderData: keepPreviousData
  });
}

export function useLeadDetailsQuery(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: () => getLeadDetails(id),
    enabled
  });
}

export function useLeadMetricsQuery() {
  return useQuery({
    queryKey: queryKeys.leads.metrics,
    queryFn: getLeadMetrics
  });
}

export function useUpdateLeadStatusMutation(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: UpdateLeadStatusRequest) => updateLeadStatus(id, body),
    onSuccess: () => {
      toast.success({ title: "Lead status updated" });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to update lead status", message: error.message });
    }
  });
}

export function useAddLeadNoteMutation(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: CreateLeadNoteRequest) => addLeadNote(id, body),
    onSuccess: () => {
      toast.success({ title: "Note added" });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.detail(id) });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to add note", message: error.message });
    }
  });
}

export function useUpcomingDemoClassesQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.leads.upcomingDemoClasses,
    queryFn: getUpcomingDemoClasses,
    enabled
  });
}

export function useAssignLeadDemoClassMutation(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (body: AssignLeadDemoClassRequest) => assignLeadDemoClass(id, body),
    onSuccess: () => {
      toast.success({ title: "Lead assigned to demo class" });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to assign demo class", message: error.message });
    }
  });
}

export function useDeleteLeadMutation() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => {
      toast.success({ title: "Lead deleted" });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all });
    },
    onError: (error: Error) => {
      toast.error({ title: "Failed to delete lead", message: error.message });
    }
  });
}
