import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type ActivityQueueProgressResponse,
  type ActivityQueueResponse,
  type ActivityQueuesResponse,
  type AddActivityQueueItemsRequest,
  type AdvanceActivityQueueRequest,
  type CreateActivityQueueRequest,
  type RenameActivityQueueRequest,
  type ReorderActivityQueueRequest,
  type StudentActivityQueueResponse
} from "@nexa-chess/types";

export const getActivityQueues = (classId: string): Promise<ActivityQueuesResponse> =>
  apiFetch<ActivityQueuesResponse>(API_ROUTES.liveClass.activityQueues(classId));

export const createActivityQueue = (
  classId: string,
  body: CreateActivityQueueRequest
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueues(classId), { method: "POST", body });

export const renameActivityQueue = (
  classId: string,
  queueId: string,
  body: RenameActivityQueueRequest
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueue(classId, queueId), { method: "PATCH", body });

export const deleteActivityQueue = (classId: string, queueId: string): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>(API_ROUTES.liveClass.activityQueue(classId, queueId), { method: "DELETE" });

export const addActivityQueueItems = (
  classId: string,
  queueId: string,
  body: AddActivityQueueItemsRequest
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueItems(classId, queueId), {
    method: "POST",
    body
  });

export const reorderActivityQueue = (
  classId: string,
  queueId: string,
  body: ReorderActivityQueueRequest
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueItemOrder(classId, queueId), {
    method: "PUT",
    body
  });

export const removeActivityQueueItem = (
  classId: string,
  queueId: string,
  itemId: string
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueItem(classId, queueId, itemId), {
    method: "DELETE"
  });

export const launchActivityQueue = (classId: string, queueId: string): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueLaunch(classId, queueId), { method: "POST" });

export const advanceActivityQueue = (
  classId: string,
  queueId: string,
  body: AdvanceActivityQueueRequest
): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueAdvance(classId, queueId), {
    method: "POST",
    body
  });

export const finishActivityQueue = (classId: string, queueId: string): Promise<ActivityQueueResponse> =>
  apiFetch<ActivityQueueResponse>(API_ROUTES.liveClass.activityQueueFinish(classId, queueId), { method: "POST" });

export const getActivityQueueProgress = (classId: string, queueId: string): Promise<ActivityQueueProgressResponse> =>
  apiFetch<ActivityQueueProgressResponse>(API_ROUTES.liveClass.activityQueueProgress(classId, queueId));

export const getCurrentActivityQueue = (classId: string): Promise<StudentActivityQueueResponse> =>
  apiFetch<StudentActivityQueueResponse>(API_ROUTES.liveClass.activityQueueCurrent(classId));
