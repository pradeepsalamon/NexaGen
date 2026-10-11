import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateAssignmentRequest,
  DeployAssignmentRequest,
  SaveAttemptProgressRequest,
  SubmitAttemptRequest,
  UpdateAssignmentStatusRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { STUDENT_KEYS } from "@/features/student-dashboard/hooks/useStudentApi";
import { useToast } from "@/providers/ToastProvider";
import {
  createAssignment,
  deployAssignment,
  getAssignmentDeployment,
  getAssignmentDeployments,
  getAssignmentLibrary,
  getAssignmentLibraryItem,
  getAssignmentLeaderboard,
  getAttemptHistory,
  getMyAssignment,
  getMyAssignments,
  saveAttemptProgress,
  startAttempt,
  submitAttempt,
  updateMyAssignmentStatus
} from "../api/assignmentApi";

// ── Library ──

export function useAssignmentLibrary() {
  return useQuery({
    queryKey: queryKeys.assignments.library,
    queryFn: getAssignmentLibrary
  });
}

export function useAssignmentLibraryItem(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.libraryItem(id),
    queryFn: () => getAssignmentLibraryItem(id),
    enabled: !!id && enabled
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateAssignmentRequest) => createAssignment(data),
    onSuccess: () => {
      toast.success({ title: "Assignment saved" });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    },
    onError: (error: Error) =>
      toast.error({ title: "Failed to save assignment", message: error.message })
  });
}

// ── Deployments (coach) ──

export function useAssignmentDeployments() {
  return useQuery({
    queryKey: queryKeys.assignments.deployments,
    queryFn: getAssignmentDeployments
  });
}

export function useAssignmentDeployment(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.deployment(id),
    queryFn: () => getAssignmentDeployment(id),
    enabled: !!id && enabled
  });
}

export function useDeployAssignment() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: DeployAssignmentRequest) => deployAssignment(data),
    onSuccess: () => {
      toast.success({ title: "Assignment sent to your batch" });
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
    },
    onError: (error: Error) =>
      toast.error({ title: "Failed to assign", message: error.message })
  });
}

// ── Student ──

export function useMyAssignments() {
  return useQuery({
    queryKey: queryKeys.assignments.mine,
    queryFn: getMyAssignments
  });
}

export function useMyAssignment(id: string) {
  return useQuery({
    queryKey: queryKeys.assignments.mineItem(id),
    queryFn: () => getMyAssignment(id),
    enabled: !!id
  });
}

/** A puzzle set's leaderboard, as this student may see it (filtered server-side). */
export function useAssignmentLeaderboard(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.mineLeaderboard(id),
    queryFn: () => getAssignmentLeaderboard(id),
    enabled: !!id && enabled
  });
}

export function useUpdateMyAssignmentStatus(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: UpdateAssignmentStatusRequest) => updateMyAssignmentStatus(id, data),
    onSuccess: (_data, variables) => {
      if (variables.status === "COMPLETED") {
        toast.success({ title: "Marked as complete" });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      queryClient.invalidateQueries({ queryKey: STUDENT_KEYS.dashboard });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not update assignment", message: error.message })
  });
}

// ── Attempts (evaluated activities) ──

export function useAttemptHistory(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.assignments.mineAttempts(id),
    queryFn: () => getAttemptHistory(id),
    enabled: !!id && enabled
  });
}

export function useStartAttempt(id: string) {
  const toast = useToast();
  return useMutation({
    mutationFn: () => startAttempt(id),
    onError: (error: Error) =>
      toast.error({ title: "Could not start the assignment", message: error.message })
  });
}

export function useSaveAttemptProgress(id: string) {
  return useMutation({
    mutationFn: ({ attemptId, data }: { attemptId: string; data: SaveAttemptProgressRequest }) =>
      saveAttemptProgress(id, attemptId, data)
  });
}

export function useSubmitAttempt(id: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ attemptId, data }: { attemptId: string; data: SubmitAttemptRequest }) =>
      submitAttempt(id, attemptId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assignments.all });
      queryClient.invalidateQueries({ queryKey: STUDENT_KEYS.dashboard });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not submit your attempt", message: error.message })
  });
}
