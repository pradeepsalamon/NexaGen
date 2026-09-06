import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarkNotificationsReadRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { getNotifications, markNotificationsRead } from "../api/notificationsApi";

/** Poll notifications while the tab is open. `enabled` gates it on an active session. */
export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: getNotifications,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });
}

// undo: intentionally excluded — no reverse endpoint, and marking read carries
// no real risk of an unwanted "oops" (see docs/UNDO_ARCHITECTURE.md §4).
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data?: MarkNotificationsReadRequest) => markNotificationsRead(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    }
  });
}
