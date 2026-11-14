"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { canJoinClass, resolveClassDisplayStatus } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayOfMonth, formatMonthShort, formatRelativeDay, formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type RowClass = {
  batchName?: string | null;
  coachName?: string | null;
  endsAt: string;
  id: string;
  startsAt: string;
  status: string;
  title: string;
  topic?: string | null;
};

interface ClassRowProps {
  /** Replaces the join and view buttons. */
  actions?: ReactNode;
  /** Extra badges beside the status, such as the batch type. */
  badges?: ReactNode;
  cls: RowClass;
  /** Replaces the line of date, time, coach and batch. */
  meta?: string;
  /** Join stays outlined where another control on the page is the primary action. */
  quietJoin?: boolean;
  /** Off where the list already says which day it is. */
  showDate?: boolean;
  /** Defaults to showing every status but a plain scheduled class. */
  showStatus?: boolean;
  testId?: string;
}

/** One class in a list: an item of `ClassRowList`, driven by `class-availability`. */
export function ClassRow({
  actions,
  badges,
  cls,
  meta,
  quietJoin = false,
  showDate = true,
  showStatus,
  testId
}: ClassRowProps) {
  const timeZone = useUserTimeZone();
  const shown = resolveClassDisplayStatus(cls);
  const details = [
    showDate ? formatRelativeDay(cls.startsAt, timeZone) : null,
    `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`,
    cls.coachName ? `Coach ${cls.coachName}` : null,
    cls.batchName && cls.batchName !== cls.title ? cls.batchName : null
  ];

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid={testId}>
      {showDate ? (
        <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
          <span className="text-xs font-semibold leading-none text-app-muted">
            {formatMonthShort(cls.startsAt, timeZone)}
          </span>
          <span className="mt-0.5 text-base font-bold leading-none tabular-nums text-app-text">
            {formatDayOfMonth(cls.startsAt, timeZone)}
          </span>
        </span>
      ) : null}

      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              "min-w-0 break-words text-sm font-semibold text-app-text",
              shown === "CANCELLED" && "text-app-muted line-through"
            )}
          >
            {cls.title}
          </span>
          {(showStatus ?? shown !== "SCHEDULED") ? (
            <ClassStatusBadge endsAt={cls.endsAt} status={cls.status} />
          ) : null}
          {badges}
        </div>
        {cls.topic && cls.topic !== cls.title ? <p className="break-words text-sm text-app-text">Topic: {cls.topic}</p> : null}
        <p className="mt-0.5 text-xs text-app-muted">{meta ?? details.filter(Boolean).join(" · ")}</p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {actions ?? (canJoinClass(cls) ? (
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/classes/${cls.id}`}>View class</Link>
            </Button>
            <Button asChild size="sm" variant={quietJoin ? "outline" : "primary"}>
              <Link href={`/live-class/${cls.id}`}>
                <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={2.5} />
                Join class
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={`/classes/${cls.id}`}>View class</Link>
          </Button>
        ))}
      </div>
    </li>
  );
}

export function ClassRowList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-app-border">{children}</ul>;
}
