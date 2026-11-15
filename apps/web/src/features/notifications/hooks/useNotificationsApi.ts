import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData
} from "@tanstack/react-query";
import type { MarkNotificationsReadRequest, NotificationListResponse } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { getNotifications, markNotificationsRead } from "../api/notificationsApi";

/**
 * Poll notifications while the tab is open. `enabled` gates it on an active
 * session. Keyset-paged: older pages load as the bell's list scrolls; a poll
 * refetches the loaded pages (TanStack re-derives each cursor from the fresh
 * page before it, so nothing is skipped when new ones arrive).
 */
export function useNotifications(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.all,
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: NotificationListResponse) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });
}

/** Drop every page but the newest, so the background poll stays one request once the bell closes. */
export function useTrimNotificationPages() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.setQueryData<InfiniteData<NotificationListResponse, string | undefined>>(
      queryKeys.notifications.all,
      (data) =>
        data && data.pages.length > 1
          ? { pageParams: data.pageParams.slice(0, 1), pages: data.pages.slice(0, 1) }
          : data
    );
  }, [queryClient]);
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
