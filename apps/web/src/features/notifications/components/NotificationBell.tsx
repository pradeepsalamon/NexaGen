"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationItem } from "@nexa-chess/types";
import { EmptyStateIllustration } from "@/components/ui/EmptyState";
import { FormattedText } from "@/components/ui/FormattedText";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { HEADER_ICON_BUTTON } from "@/components/layout/headerStyles";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import {
  useMarkNotificationsRead,
  useNotifications,
  useTrimNotificationPages
} from "../hooks/useNotificationsApi";

export function NotificationBell({
  openLinksInNewTab = false,
}: {
  /** Live class only: notification links open in a new tab instead of unmounting the room. */
  openLinksInNewTab?: boolean;
} = {}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);

  const query = useNotifications(!!user);
  const { data } = query;
  const markRead = useMarkNotificationsRead();
  const trimPages = useTrimNotificationPages();
  const listRef = useRef<HTMLDivElement>(null);

  const notifications = useMemo(() => data?.pages.flatMap((page) => page.notifications) ?? [], [data]);
  // Every page carries the current unread total; the newest page's is freshest.
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;

  if (!user) return null;

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (!next) trimPages();
  };

  /** Only a link in the body takes clicks; the rest of it falls through to the row's button. */
  const handleLinkClick = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    handleOpen(false);
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    handleOpen(false);
    if (!item.linkPath) return;
    if (openLinksInNewTab) {
      window.open(item.linkPath, "_blank", "noopener,noreferrer");
    } else {
      router.push(item.linkPath);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"
          }
          className={cn(HEADER_ICON_BUTTON, "relative")}
        >
          <Bell aria-hidden="true" className="size-4" strokeWidth={2.5} />
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold leading-4 text-on-primary">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-app-border px-3 py-2">
          <span className="text-sm font-bold text-app-text">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(undefined)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline disabled:opacity-60"
            >
              <CheckCheck className="size-3.5" strokeWidth={2.5} />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[22rem] overflow-y-auto" ref={listRef}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center px-3 py-6 text-center">
              <EmptyStateIllustration name="notifications" size="sm" />
              <p className="mt-2 text-sm text-app-muted">You&apos;re all caught up.</p>
            </div>
          ) : (
            <ul className="divide-y divide-app-border/60">
              {notifications.map((item) => (
                <li
                  className={cn(
                    "relative flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-app-soft",
                    !item.readAt && "bg-primary/5"
                  )}
                  key={item.id}
                >
                  <span className="flex items-center gap-2">
                    {!item.readAt && (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    )}
                    {/* The button covers the whole row; a link in the body sits above it, as a link can't go inside a button. */}
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className="text-left text-sm font-semibold text-app-text after:absolute after:inset-0 after:content-['']"
                    >
                      {item.title}
                    </button>
                  </span>
                  <FormattedText
                    className="pointer-events-none relative text-xs text-app-muted [&_a]:pointer-events-auto"
                    onClick={() => handleLinkClick(item)}
                    pageLinksInNewTab={openLinksInNewTab}
                    source={item.body}
                  />
                  <span className="text-xs text-app-muted/80">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {notifications.length > 0 ? (
            <InfiniteScrollTrigger
              className="px-3"
              label="Show older"
              query={query}
              root={listRef}
              size="sm"
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
