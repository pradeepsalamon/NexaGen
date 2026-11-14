"use client";

import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";

interface ClassroomTopBarProps {
  /** Class title — the primary line. */
  title: string;
  /** Secondary line (batch · N students). Hidden below `sm`. */
  subtitle?: string | null;
  /** Status chips shown next to the title (LIVE / REC). */
  status?: ReactNode;
  /** Right-aligned cluster (connection, timer, leave…). */
  actions?: ReactNode;
  /**
   * The account menu / Dashboard / notification links open in a new tab
   * instead of routing the current tab away — used by the live meeting so
   * clicking them can't silently unmount the LiveKit room. Not set from the
   * pre-join / error screens, which have no live connection to protect.
   */
  openLinksInNewTab?: boolean;
}

/**
 * The classroom's top bar. Built on the global app `Header` so the account menu,
 * notifications and Dashboard link stay reachable during a class, with the
 * classroom-specific chips (LIVE / REC / connection / timer) layered in through
 * its slots. Shared by the live meeting (`MeetingTopBar`) and the pre-join /
 * error screens (`ClassroomStateShell`).
 */
export function ClassroomTopBar({
  title,
  subtitle,
  status,
  actions,
  openLinksInNewTab = false,
}: ClassroomTopBarProps) {
  return (
    <Header
      compact
      openLinksInNewTab={openLinksInNewTab}
      leftSlot={
        status ? <div className="flex min-w-0 items-center gap-2">{status}</div> : undefined
      }
      centerSlot={
        <div className="flex min-w-0 flex-col items-center">
          <h1 className="min-w-0 max-w-full truncate text-sm font-extrabold text-app-text sm:text-[15px]">
            {title}
          </h1>
          {subtitle && (
            <p className="hidden max-w-full truncate text-xs text-app-muted sm:block">
              {subtitle}
            </p>
          )}
        </div>
      }
      rightSlot={
        actions ? <div className="flex items-center gap-1.5 sm:gap-2">{actions}</div> : undefined
      }
    />
  );
}
