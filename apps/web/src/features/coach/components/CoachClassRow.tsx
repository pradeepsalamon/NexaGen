"use client";

import Link from "next/link";
import { CalendarClock, MoreVertical, NotebookPen, UserRoundCog, XCircle } from "lucide-react";
import { canJoinClass, getClassStartAvailability, type CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassRow } from "@/components/ui/ClassRow";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";
import { useNow } from "@/hooks/useNow";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay, formatTime } from "@/lib/datetime";
import { StartClassButton } from "./upcoming/StartClassButton";

export type CoachClassActions = {
  onCancel?: (cls: CoachClass) => void;
  onEdit?: (cls: CoachClass) => void;
  onRequestReschedule?: (cls: CoachClass) => void;
  onRequestSubstitute?: (cls: CoachClass) => void;
};

/** The class's own title, else its topic, else the batch it belongs to. */
export function coachClassTitle(cls: Pick<CoachClass, "batchName" | "title" | "topic">): string {
  return cls.title || cls.topic || cls.batchName;
}

function studentCountLabel(count: number) {
  return count === 1 ? "1 student" : `${count} students`;
}

/**
 * One of the coach's classes in a `ClassRowList`: Start (or Return) while the
 * class can be started, View class, and a menu for notes and the requests.
 */
export function CoachClassRow({
  cls,
  onCancel,
  onEdit,
  onRequestReschedule,
  onRequestSubstitute,
  showDate = true
}: CoachClassActions & { cls: CoachClass; showDate?: boolean }) {
  const timeZone = useUserTimeZone();
  const now = useNow();
  const title = coachClassTitle(cls);
  const startable = canJoinClass(cls) || getClassStartAvailability(cls, now).canStart;
  const meta = [
    showDate ? formatRelativeDay(cls.startsAt, timeZone) : null,
    `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`,
    title !== cls.batchName ? cls.batchName : null,
    studentCountLabel(cls.studentCount)
  ]
    .filter(Boolean)
    .join(" · ");

  const scheduled = cls.status === "SCHEDULED";
  const menu = [
    cls.status !== "CANCELLED" && onEdit
      ? { icon: NotebookPen, label: "Edit notes", run: onEdit }
      : null,
    scheduled && onRequestReschedule
      ? { icon: CalendarClock, label: "Request reschedule", run: onRequestReschedule }
      : null,
    scheduled && onRequestSubstitute
      ? { icon: UserRoundCog, label: "Request substitute", run: onRequestSubstitute }
      : null
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const canCancel = scheduled && Boolean(onCancel);

  return (
    <ClassRow
      actions={
        <>
          {startable ? <StartClassButton classItem={cls} compact /> : null}
          <Button asChild size="sm" variant={startable ? "ghost" : "outline"}>
            <Link aria-label={`View class: ${title}`} href={`/classes/${cls.id}`}>
              View class
            </Link>
          </Button>
          {menu.length > 0 || canCancel ? (
            <DropdownMenu>
              {/* A Radix trigger already; a tooltip wrapper would break its composition. */}
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`More actions for ${title}`}
                  className="size-8"
                  size="icon"
                  title="More actions"
                  type="button"
                  variant="neutral"
                >
                  <MoreVertical aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                {menu.map(({ icon: Icon, label, run }) => (
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold"
                    key={label}
                    onSelect={() => run(cls)}
                  >
                    <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
                    {label}
                  </DropdownMenuItem>
                ))}
                {canCancel ? (
                  <>
                    {menu.length > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold text-app-danger-ink focus:bg-app-danger-soft focus:text-app-danger-ink"
                      onSelect={() => onCancel?.(cls)}
                    >
                      <XCircle aria-hidden="true" className="size-4" strokeWidth={2.25} />
                      Cancel class
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      }
      badges={<BatchTypeBadge type={cls.batchType} />}
      cls={{ ...cls, title }}
      meta={meta}
      showDate={showDate}
    />
  );
}
