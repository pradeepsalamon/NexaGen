"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

interface ClassroomTopBarProps {
  /** Class topic — the page's one `h1`. */
  title: string;
  /** Second line (batch · head count). Hidden on phones. */
  subtitle?: string | null;
  /** Left cluster after the logo: Live, Recording, the queue pill. */
  status?: ReactNode;
  /** Right cluster before the account menu: connection, time left. */
  actions?: ReactNode;
  /**
   * The logo, notifications and account menu open in a new tab instead of
   * routing this one away — used in the live room so a click can't silently
   * unmount the LiveKit room. Not set on the entry screens.
   */
  openLinksInNewTab?: boolean;
}

/**
 * Top bar (spec component 1): 56px (48px on phones), full width, navy.
 * Left: logo, Live, Recording and queue chips. Centre: the topic with its
 * batch and head count. Right: connection, time left, account. Shared by the
 * live room (`MeetingTopBar`) and every entry screen (`ClassroomStateShell`).
 * `surface-brand` makes everything inside read the dark palette in both themes.
 */
export function ClassroomTopBar({
  title,
  subtitle,
  status,
  actions,
  openLinksInNewTab = false,
}: ClassroomTopBarProps) {
  const user = useAuthStore((state) => state.user);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const activeUser = isSessionChecked ? user : undefined;
  const newTab = openLinksInNewTab ? ({ target: "_blank", rel: "noopener noreferrer" } as const) : {};

  return (
    <header
      className={cn(
        "surface-brand fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 border-b border-app-border bg-brand-800 px-2 text-on-brand md:h-14 md:gap-3 md:px-4",
      )}
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <Link
          aria-label={activeUser ? "Go to dashboard (opens in a new tab)" : "Go to home"}
          className="hidden shrink-0 items-center rounded-control transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus md:flex"
          href={activeUser ? getRoleDashboardHref(activeUser.role) : "/"}
          {...newTab}
        >
          <Logo iconOnlyOnMobile onDark size={32} />
        </Link>
        {status ? <div className="flex min-w-0 items-center gap-1.5">{status}</div> : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center">
        <h1 className="w-full truncate text-sm font-semibold leading-5 text-app-text md:text-[0.9375rem]">{title}</h1>
        {subtitle ? <p className="hidden w-full truncate text-xs leading-4 text-app-muted md:block">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {actions}
        <span className="hidden lg:block">
          <ThemeToggle />
        </span>
        {activeUser ? (
          <span className="hidden lg:block">
            <NotificationBell openLinksInNewTab={openLinksInNewTab} />
          </span>
        ) : null}
        {activeUser ? (
          <UserNavMenu user={activeUser} openLinksInNewTab={openLinksInNewTab} />
        ) : isSessionChecked ? null : (
          <span aria-label="Checking session" className="inline-flex size-9 items-center justify-center text-app-muted" role="status">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={2} />
          </span>
        )}
      </div>
    </header>
  );
}
