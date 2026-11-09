import { API_ROUTES } from "@nexa-chess/types";
import type {
  MarkNotificationsReadRequest,
  MarkNotificationsReadResponse,
  NotificationListResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

/** One page, newest first; pass the previous page's `nextCursor` for older ones. */
export function getNotifications(cursor?: string): Promise<NotificationListResponse> {
  return apiFetch(
    cursor
      ? `${API_ROUTES.notifications.list}?${new URLSearchParams({ cursor }).toString()}`
      : API_ROUTES.notifications.list
  );
}

export function markNotificationsRead(
  data: MarkNotificationsReadRequest = {}
): Promise<MarkNotificationsReadResponse> {
  return apiFetch(API_ROUTES.notifications.markRead, { method: "POST", body: data });
}
