import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { Z } from "../../lib/meetingUi";

interface ClassroomTopBarProps {
  /** Class title — the primary line. */
  title: string;
  /** Secondary line (batch · N students). Hidden below `sm`. */
  subtitle?: string | null;
  /** Status chips shown next to the title (LIVE / REC). */
  status?: ReactNode;
  /** Right-aligned cluster (connection, timer, leave…). */
  actions?: ReactNode;
  className?: string;
}

/**
 * The classroom's own top bar — deliberately lighter than the global app
 * `Header`: no dashboard nav, notifications, or account menu, so the meeting
 * reads as a dedicated environment. Shared by the live meeting
 * (`MeetingTopBar`) and the pre-join / error screens (`ClassroomStateShell`).
 */
export function ClassroomTopBar({
  title,
  subtitle,
  status,
  actions,
  className,
}: ClassroomTopBarProps) {
  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 flex h-14 items-center gap-3 border-b border-app-border bg-app-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-app-surface/85 sm:px-4",
        Z.topbar,
        className,
      )}
    >
      <Link
        href="/"
        aria-label="Nexa Chess home"
        className="shrink-0 rounded-control transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      >
        <Logo compact size={30} wordmarkClassName="hidden" />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-sm font-extrabold text-app-text sm:text-[15px]">
            {title}
          </h1>
          {status}
        </div>
        {subtitle && (
          <p className="hidden truncate text-xs text-app-muted sm:block">{subtitle}</p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">{actions}</div>
      )}
    </header>
  );
}
