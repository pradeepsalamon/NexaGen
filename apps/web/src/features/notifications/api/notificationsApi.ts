import { API_ROUTES } from "@nexa-chess/types";
import type {
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  NotificationListResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getNotifications(): Promise<NotificationListResponse> {
  return apiFetch(API_ROUTES.notifications.list);
}

export function markNotificationsRead(
  data: MarkNotificationsReadRequest = {}
): Promise<MarkNotificationsReadResponse> {
  return apiFetch(API_ROUTES.notifications.markRead, { method: "POST", body: data });
}
