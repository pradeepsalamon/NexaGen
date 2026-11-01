"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";
import type { NotificationItem } from "@nexa-chess/types";
import { FormattedText } from "@/components/ui/FormattedText";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useMarkNotificationsRead, useNotifications } from "../hooks/useNotificationsApi";

export function NotificationBell({
  openLinksInNewTab = false,
}: {
  /** Live class only: notification links open in a new tab instead of unmounting the room. */
  openLinksInNewTab?: boolean;
} = {}) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);

  const { data } = useNotifications(!!user);
  const markRead = useMarkNotificationsRead();

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = data?.unreadCount ?? 0;

  if (!user) return null;

  const handleOpen = (next: boolean) => {
    setOpen(next);
  };

  /** Only a link in the body takes clicks; the rest of it falls through to the row's button. */
  const handleLinkClick = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    setOpen(false);
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    setOpen(false);
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
          className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-soft text-app-text shadow-card transition hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
        >
          <Bell aria-hidden="true" className="size-4" strokeWidth={2.5} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold leading-4 text-on-primary">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
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

        <div className="max-h-[22rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-app-muted">
              You&apos;re all caught up.
            </p>
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
                  <span className="text-[11px] text-app-muted/80">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
