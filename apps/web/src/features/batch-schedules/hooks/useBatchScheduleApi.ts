import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateBatchScheduleRequest,
  PreviewBatchScheduleRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import {
  createBatchSchedule,
  getBatchSchedule,
  getScheduleCalendar,
  listBatchSchedules,
  previewBatchSchedule,
  regenerateBatchSchedule
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

// undo: intentionally excluded — generates potentially hundreds of classes at
// once and navigates away on success (see docs/UNDO_ARCHITECTURE.md §4); no
// delete endpoint exists to revert to anyway.
export function useCreateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBatchScheduleRequest) => createBatchSchedule(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}

// undo: intentionally excluded — complex bulk/recurring operation, regenerates
// every future class in the schedule (see docs/UNDO_ARCHITECTURE.md §4).
export function useRegenerateScheduleMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => regenerateBatchSchedule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.batchSchedules.all })
  });
}
