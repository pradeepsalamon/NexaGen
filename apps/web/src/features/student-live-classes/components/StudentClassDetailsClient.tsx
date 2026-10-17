"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarX,
  Clock,
  Download,
  GraduationCap,
  Layers3,
  Play,
  PlayCircle,
  Video
} from "lucide-react";
import { toast } from "sonner";
import {
  canJoinClass,
  resolveClassDisplayStatus,
  type StudentClassDetail
} from "@nexa-chess/types";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { AttendanceStatusBadge } from "@/features/attendance/components/AttendanceStatusBadge";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { RecordingPlayerDialog } from "@/features/student-dashboard/components/RecordingPlayerDialog";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDuration,
  formatFullDate,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";
import { useStudentClassDetail } from "../hooks/useStudentClassDetail";

/**
 * `/classes/:id` for a student: what the class is, who teaches it, when, and
 * the one action that fits its state — Join while live, Watch once a
 * recording exists. Every state is decided by the shared rules in
 * `@nexa-chess/types`, the same ones the server enforces.
 */
export function StudentClassDetailsClient({ classId }: { classId: string }) {
  const { data, error, isLoading, refetch } = useStudentClassDetail(classId);
  const cls = data?.class;

  useEffect(() => {
    if (cls) document.title = `${cls.title} - Nexa Chess`;
  }, [cls]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8 animate-fade-in">
      <BackButton />
      {isLoading ? (
        <DetailsSkeleton />
      ) : error || !cls ? (
        <div className="space-y-4">
          <WidgetError
            message="We couldn't load this class. It may have been removed, or you may no longer be enrolled in its batch."
            onRetry={() => refetch()}
          />
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/student/schedule">
                <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Back to your schedule
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <ClassDetails cls={cls} />
      )}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading class" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28 rounded-app" />
        <Skeleton className="h-28 rounded-app" />
      </div>
      <Skeleton className="h-40 rounded-app" />
      <Skeleton className="h-32 rounded-app" />
    </div>
  );
}

function ClassDetails({ cls }: { cls: StudentClassDetail }) {
  const timeZone = useUserTimeZone();
  const scheduledMinutes = Math.round(
    (new Date(cls.endsAt).getTime() - new Date(cls.startsAt).getTime()) / 60_000
  );

  return (
    <>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
            {cls.title}
          </h1>
          <ClassStatusBadge endsAt={cls.endsAt} status={cls.status} />
        </div>
        {cls.topic && cls.topic !== cls.title ? (
          <p className="text-base font-medium text-app-text">Topic: {cls.topic}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm text-app-muted">
          {cls.batchName ? (
            <span className="inline-flex items-center gap-1.5">
              <Layers3 aria-hidden="true" className="size-4" strokeWidth={2.25} />
              {cls.batchName}
            </span>
          ) : null}
          <BatchTypeBadge type={cls.batchType} />
          {cls.sessionNumber ? <span>· Session {cls.sessionNumber}</span> : null}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold text-app-muted">Schedule</h2>
          <p className="flex items-center gap-2 font-semibold text-app-text">
            <CalendarDays aria-hidden="true" className="size-4 text-primary-ink" strokeWidth={2.25} />
            {formatFullDate(cls.startsAt, timeZone)}
            <span className="text-xs font-medium text-app-muted">
              ({formatRelativeDay(cls.startsAt, timeZone)})
            </span>
          </p>
          <p className="flex items-center gap-2 font-semibold text-app-text">
            <Clock aria-hidden="true" className="size-4 text-primary-ink" strokeWidth={2.25} />
            {formatTime(cls.startsAt, timeZone)} – {formatTime(cls.endsAt, timeZone)}
            <span className="text-xs font-medium text-app-muted">({scheduledMinutes} min)</span>
          </p>
          {cls.actualStartedAt ? (
            <p className="text-xs text-app-muted">
              Started {formatTime(cls.actualStartedAt, timeZone)}
              {cls.actualEndedAt
                ? ` · ended ${formatTime(cls.actualEndedAt, timeZone)} (ran ${formatDuration(
                    (new Date(cls.actualEndedAt).getTime() - new Date(cls.actualStartedAt).getTime()) /
                      1000
                  )})`
                : ""}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold text-app-muted">Coach</h2>
          <div className="flex items-center gap-3">
            {cls.coach.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="size-12 rounded-full border border-app-border object-cover"
                src={cls.coach.avatarUrl}
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary-ink"
              >
                {cls.coach.name.charAt(0) || <GraduationCap className="size-5" />}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-app-text">{cls.coach.name || "Your coach"}</p>
              <p className="text-xs text-app-muted">Coach</p>
            </div>
          </div>
        </Card>
      </div>

      <ClassActionCard cls={cls} />

      <Card className="space-y-4 p-5 sm:p-6">
        <h2 className="text-lg font-bold text-app-text">About this class</h2>
        <DetailBlock empty="No description yet." label="Description" value={cls.description} />
        {cls.objectives ? <DetailBlock label="Objectives" value={cls.objectives} /> : null}
        <DetailBlock empty="No homework set for this class." label="Homework" value={cls.homework} />
      </Card>
    </>
  );
}

function DetailBlock({ empty, label, value }: { empty?: string; label: string; value: string | null }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-app-muted">{label}</h3>
      <p className={value ? "mt-1 whitespace-pre-line text-app-text" : "mt-1 text-sm italic text-app-muted"}>
        {value || empty}
      </p>
    </div>
  );
}

/** The one thing a student can do with the class right now. */
function ClassActionCard({ cls }: { cls: StudentClassDetail }) {
  const timeZone = useUserTimeZone();
  const [playerOpen, setPlayerOpen] = useState(false);
  const shown = resolveClassDisplayStatus(cls);

  const download = async () => {
    try {
      const result = await getRecordingDownloadUrl(cls.id, { download: true });
      if (result?.url) window.open(result.url, "_blank");
    } catch {
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };

  let body: ReactNode;
  if (canJoinClass(cls)) {
    body = (
      <ActionLayout
        icon={<Video aria-hidden="true" className="size-7" />}
        text="Your coach has started the class. Join now."
        title="Class is live"
      >
        <Button asChild size="lg" variant="destructive">
          <Link href={`/live-class/${cls.id}`}>
            <Play aria-hidden="true" className="size-4 fill-current" strokeWidth={2.5} />
            Join class
          </Link>
        </Button>
      </ActionLayout>
    );
  } else if (shown === "SCHEDULED") {
    body = (
      <ActionLayout
        icon={<CalendarDays aria-hidden="true" className="size-7" />}
        text={`Scheduled for ${formatRelativeDay(cls.startsAt, timeZone)} at ${formatTime(cls.startsAt, timeZone)}. Join opens when your coach starts the class — this page updates by itself.`}
        title="Not started yet"
      >
        <Button aria-describedby={`join-hint-${cls.id}`} disabled size="lg" variant="outline">
          <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Join class
        </Button>
        <span className="sr-only" id={`join-hint-${cls.id}`}>
          Opens when your coach starts the class
        </span>
      </ActionLayout>
    );
  } else if (shown === "CANCELLED") {
    body = (
      <ActionLayout
        icon={<CalendarX aria-hidden="true" className="size-7" />}
        text="This class was cancelled and will not take place. Check your schedule for the next one."
        title="Class cancelled"
      >
        <ScheduleLink />
      </ActionLayout>
    );
  } else if (shown === "NOT_HELD") {
    body = (
      <ActionLayout
        icon={<CalendarX aria-hidden="true" className="size-7" />}
        text="This class's time has passed without it being started, so there is no recording or attendance for it."
        title="Class not held"
      >
        <ScheduleLink />
      </ActionLayout>
    );
  } else {
    body = (
      <ActionLayout
        icon={<PlayCircle aria-hidden="true" className="size-7" />}
        text={
          cls.hasRecording
            ? "This class has ended. Watch the recording any time."
            : "This class has ended. No recording is available for it."
        }
        title="Class ended"
      >
        {cls.hasRecording ? (
          <>
            <Button onClick={() => setPlayerOpen(true)} size="lg">
              <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Watch recording
            </Button>
            <SimpleTooltip label="Download recording">
              <Button
                aria-label="Download recording"
                className="size-11 rounded-full"
                onClick={download}
                size="icon"
                variant="outline"
              >
                <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          </>
        ) : null}
        {cls.attendance ? (
          <div className="flex w-full flex-wrap items-center justify-center gap-2 text-sm text-app-muted sm:justify-start">
            <span>Your attendance:</span>
            <AttendanceStatusBadge status={cls.attendance.status} />
            <span>
              {formatDuration(cls.attendance.attendedSeconds)} · {Math.round(cls.attendance.attendancePercent)}%
            </span>
            <Link className="font-semibold text-primary-ink hover:underline" href="/student/attendance">
              View logs
            </Link>
          </div>
        ) : null}
      </ActionLayout>
    );
  }

  return (
    <>
      <Card className="p-5 sm:p-6">{body}</Card>
      {cls.hasRecording ? (
        <RecordingPlayerDialog
          classId={playerOpen ? cls.id : null}
          isOpen={playerOpen}
          onClose={() => setPlayerOpen(false)}
          topic={cls.title}
        />
      ) : null}
    </>
  );
}

function ActionLayout({
  children,
  icon,
  text,
  title
}: {
  children?: ReactNode;
  icon: ReactNode;
  text: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="text-xl font-bold text-app-text">{title}</h2>
          <p className="mt-1 text-sm text-app-muted">{text}</p>
        </div>
        {children ? (
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

function ScheduleLink() {
  return (
    <Button asChild variant="outline">
      <Link href="/student/schedule">
        <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
        View schedule
      </Link>
    </Button>
  );
}
