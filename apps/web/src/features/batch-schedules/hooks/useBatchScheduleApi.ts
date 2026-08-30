import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateBatchScheduleRequest,
  PreviewBatchScheduleRequest,
  ScheduleOccurrenceActionRequest,
  UpdateBatchScheduleRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  createBatchSchedule,
  deactivateBatchSchedule,
  getBatchSchedule,
  getScheduleCalendar,
  listBatchSchedules,
  previewBatchSchedule,
  regenerateBatchSchedule,
  scheduleOccurrenceAction,
  updateBatchSchedule
} from "../api/batchScheduleApi";

export function useBatchSchedulesQuery(batchId?: string) {
  return useQuery({
    queryFn: () => listBatchSchedules(batchId),
    queryKey: queryKeys.batchSchedules.list(batchId)
  });
}

export function useBatchScheduleQuery(id: string | null) {
  return useQuery({
    enabled: Boolean(id),
    queryFn: () => getBatchSchedule(id as string),
    queryKey: queryKeys.batchSchedules.detail(id ?? "")
  });
}

export function useScheduleCalendarQuery(params: {
  from: string;
  to: string;
  batchId?: string;
  enabled?: boolean;
}) {
  const { enabled = true, ...rest } = params;
  return useQuery({
    enabled,
    queryFn: () => getScheduleCalendar(rest),
    queryKey: queryKeys.batchSchedules.calendar(rest)
  });
}

export function usePreviewScheduleMutation() {
  return useMutation({
    mutationFn: (payload: PreviewBatchScheduleRequest) => previewBatchSchedule(payload)
  });
}

export function useCreateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBatchScheduleRequest) => createBatchSchedule(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}

export function useUpdateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBatchScheduleRequest }) =>
      updateBatchSchedule(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}

export function useDeactivateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateBatchSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}

export function useRegenerateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => regenerateBatchSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}

export function useOccurrenceActionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      payload
    }: {
      classId: string;
      payload: ScheduleOccurrenceActionRequest;
    }) => scheduleOccurrenceAction(classId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}
