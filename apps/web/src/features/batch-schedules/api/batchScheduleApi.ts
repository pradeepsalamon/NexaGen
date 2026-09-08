import type {
  BatchScheduleListResponse,
  BatchScheduleResponse,
  CreateBatchScheduleRequest,
  PreviewBatchScheduleRequest,
  PreviewBatchScheduleResponse,
  ScheduleCalendarResponse,
  ScheduleOccurrenceActionRequest,
  UpdateBatchScheduleRequest
} from "@nexa-chess/types";
import { API_ROUTES } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listBatchSchedules(batchId?: string) {
  const qs = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
  return apiFetch<BatchScheduleListResponse>(API_ROUTES.batchSchedules.list + qs);
}

export function getBatchSchedule(id: string) {
  return apiFetch<BatchScheduleResponse>(API_ROUTES.batchSchedules.get(id));
}

export function previewBatchSchedule(payload: PreviewBatchScheduleRequest) {
  return apiFetch<PreviewBatchScheduleResponse>(API_ROUTES.batchSchedules.preview, {
    body: payload,
    method: "POST"
  });
}

export function createBatchSchedule(payload: CreateBatchScheduleRequest) {
  return apiFetch<BatchScheduleResponse>(API_ROUTES.batchSchedules.create, {
    body: payload,
    method: "POST"
  });
}

export function updateBatchSchedule(id: string, payload: UpdateBatchScheduleRequest) {
  return apiFetch<BatchScheduleResponse>(API_ROUTES.batchSchedules.update(id), {
    body: payload,
    method: "PATCH"
  });
}

export function deactivateBatchSchedule(id: string) {
  return apiFetch<BatchScheduleResponse>(API_ROUTES.batchSchedules.deactivate(id), {
    method: "DELETE"
  });
}

export function regenerateBatchSchedule(id: string) {
  return apiFetch<BatchScheduleResponse>(API_ROUTES.batchSchedules.regenerate(id), {
    method: "POST"
  });
}

export function scheduleOccurrenceAction(
  classId: string,
  payload: ScheduleOccurrenceActionRequest
) {
  return apiFetch<{ class: ScheduleCalendarResponse["classes"][number] }>(
    API_ROUTES.batchSchedules.occurrenceAction(classId),
    { body: payload, method: "PATCH" }
  );
}

export function getScheduleCalendar(params: {
  from: string;
  to: string;
  batchId?: string;
}) {
  const qs = new URLSearchParams({ from: params.from, to: params.to });
  if (params.batchId) qs.set("batchId", params.batchId);
  return apiFetch<ScheduleCalendarResponse>(
    `${API_ROUTES.batchSchedules.calendar}?${qs.toString()}`
  );
}
