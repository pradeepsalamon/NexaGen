"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  Download,
  Play,
  PlayCircle
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { RecordingPlayerDialog } from "@/features/student-dashboard/components/RecordingPlayerDialog";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatFullDate,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";

type ScheduledClass = {
  id: string;
  startsAt: string;
  coach: string;
  topic: string;
  status: string;
};

type PastClass = {
  id: string;
  topic: string;
  coachName: string;
  startsAt: string;
  status: string;
  hasRecording: boolean;
};

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function useElapsed(since: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since ? formatElapsed(now - new Date(since).getTime()) : null;
}

export function StudentLiveClassesClient() {
  const { data, isLoading, error, refetch } = useStudentDashboard();
  const timeZone = useUserTimeZone();

  const [recordingPlayerConfig, setRecordingPlayerConfig] = useState<{
    isOpen: boolean;
    classId: string | null;
    topic: string;
  }>({ isOpen: false, classId: null, topic: "" });

  const liveClass = data?.liveClass;
  const todaysClass = data?.todaysClass;
  const upcomingClasses: ScheduledClass[] = data?.upcomingClasses ?? [];
  const pastClasses: PastClass[] = data?.pastClasses ?? [];

  const uptime = useElapsed(liveClass?.startedAt ?? liveClass?.startsAt);

  const handleDownload = async (classId: string) => {
    try {
      const result = await getRecordingDownloadUrl(classId, { download: true });
      if (result?.url) {
        window.open(result.url, "_blank");
      }
    } catch (err) {
      console.error("Failed to download recording:", err);
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Live Classes"
        description="Join ongoing batch sessions with your coach and peers, and review past class recordings."
        actions={
          <Button asChild variant="outline">
            <Link href="/student/schedule">
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Class Schedule
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-app" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-app" />
            <Skeleton className="h-64 rounded-app" />
          </div>
        </div>
      ) : error ? (
        <WidgetError
          message="Could not load live class sessions. Please check your network connection."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="space-y-8">
          {/* Active Live Session or Next Up Card */}
          {liveClass ? (
            <Card className="flex flex-col gap-6 border-app-danger/40 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-danger)_10%,var(--color-surface)),var(--color-surface))] p-6 shadow-md sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="min-w-0 space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-app-danger/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-app-danger-ink">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full rounded-full bg-app-danger opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-app-danger" />
                  </span>
                  Class in Progress
                </div>
                <h2 className="text-2xl font-black leading-tight tracking-tight text-app-text">
                  {liveClass.topic}
                </h2>
                <p className="text-sm font-medium text-app-muted">
                  Coach {liveClass.coachName}
                  {uptime ? ` · Live for ${uptime}` : ""}
                  {` · Scheduled until ${formatTime(liveClass.endsAt, timeZone)}`}
                </p>
                {liveClass.participantCount != null && (
                  <p className="text-xs text-app-muted">
                    {liveClass.participantCount} participant{liveClass.participantCount === 1 ? "" : "s"} joined
                  </p>
                )}
                {liveClass.coachPresent === false && (
                  <p className="text-xs font-semibold text-warning-ink">
                    Coach hasn&apos;t joined the room yet. You can join now and wait.
                  </p>
                )}
              </div>
              <Button asChild className="shrink-0 text-base font-bold shadow-lg" size="lg" variant="destructive">
                <Link href={`/live-class/${liveClass.id}`}>
                  <Play aria-hidden="true" className="size-5 fill-current" strokeWidth={2.5} />
                  Join Class Now
                </Link>
              </Button>
            </Card>
          ) : todaysClass && todaysClass.topic ? (
            <Card className="flex flex-col gap-5 border-primary/20 bg-app-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-primary-ink">
                    {formatRelativeDay(todaysClass.startsAt, timeZone) === "Today"
                      ? "Today's Class"
                      : "Next Class"}
                  </span>
                  {todaysClass.status === "COMPLETED" && (
                    <ClassStatusBadge status="COMPLETED" />
                  )}
                </div>
                <h2 className="text-2xl font-black leading-tight tracking-tight text-app-text">
                  {todaysClass.topic}
                </h2>
                <p className="text-sm text-app-muted">
                  Coach {todaysClass.coachName} · {formatFullDate(todaysClass.startsAt, timeZone)} at{" "}
                  {formatTime(todaysClass.startsAt, timeZone)}
                  {todaysClass.durationMinutes ? ` (${todaysClass.durationMinutes} min)` : ""}
                </p>
              </div>
              <Button asChild className="shrink-0" variant={todaysClass.status === "COMPLETED" ? "outline" : "primary"}>
                <Link href={`/classes/${todaysClass.id}`}>
                  {todaysClass.status === "COMPLETED" ? "View Summary" : "Class Details"}
                  <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Link>
              </Button>
            </Card>
          ) : (
            <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-app-soft">
                  <CalendarOff aria-hidden="true" className="size-6 text-app-muted" strokeWidth={2.25} />
                </span>
                <div>
                  <h2 className="font-extrabold text-lg text-app-text">No classes live right now</h2>
                  <p className="text-sm text-app-muted">
                    Check the upcoming schedule below or solve chess puzzles in the meantime.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline">
                <Link href="/student/puzzles">Solve Puzzles</Link>
              </Button>
            </Card>
          )}

          {/* 2-Column Split: Upcoming Classes + Past Recordings */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming Classes */}
            <SectionCard
              title="Upcoming classes"
              description="Upcoming scheduled classes across your enrolled batches."
            >
              {upcomingClasses.length === 0 ? (
                <div className="py-8 text-center text-sm text-app-muted">
                  No upcoming classes scheduled.
                </div>
              ) : (
                <ul className="-my-2 divide-y divide-app-border">
                  {upcomingClasses.map((cls) => (
                    <li key={cls.id}>
                      <Link
                        className="-mx-2 flex items-center justify-between gap-3.5 rounded-control px-3 py-3.5 transition-colors hover:bg-app-soft"
                        href={`/classes/${cls.id}`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
                            <span className="text-[0.65rem] font-bold uppercase leading-none text-app-muted">
                              {formatMonthShort(cls.startsAt, timeZone)}
                            </span>
                            <span className="mt-0.5 text-base font-extrabold leading-none text-app-text">
                              {formatDayOfMonth(cls.startsAt, timeZone)}
                            </span>
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-bold text-app-text">
                              {cls.topic}
                            </span>
                            <span className="block truncate text-xs text-app-muted">
                              Coach {cls.coach} · {formatTime(cls.startsAt, timeZone)}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="text-xs font-semibold text-app-muted">
                            {formatRelativeDay(cls.startsAt, timeZone)}
                          </span>
                          <ArrowRight aria-hidden="true" className="size-4 text-app-muted" strokeWidth={2.5} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Past Classes & Recordings */}
            <SectionCard
              title="Class Recordings & Past Sessions"
              description="Review previous lessons and watch session replays."
            >
              {pastClasses.length === 0 ? (
                <div className="py-8 text-center text-sm text-app-muted">
                  No past class recordings yet.
                </div>
              ) : (
                <ul className="-my-2 divide-y divide-app-border">
                  {pastClasses.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-app-text">{c.topic}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-app-muted">
                          <span>Coach {c.coachName}</span>
                          <span>·</span>
                          <span>{formatFullDate(c.startsAt, timeZone)}</span>
                          {c.status === "CANCELLED" && (
                            <Badge variant="secondary">Cancelled</Badge>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {c.hasRecording ? (
                          <>
                            <Button
                              onClick={() =>
                                setRecordingPlayerConfig({
                                  isOpen: true,
                                  classId: c.id,
                                  topic: c.topic
                                })
                              }
                              size="sm"
                              variant="outline"
                            >
                              <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              Watch
                            </Button>
                            <SimpleTooltip label="Download recording">
                              <Button
                                aria-label={`Download recording for ${c.topic}`}
                                className="size-8 rounded-full p-0 text-app-muted hover:text-app-text"
                                onClick={() => handleDownload(c.id)}
                                size="icon"
                                variant="ghost"
                              >
                                <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
                              </Button>
                            </SimpleTooltip>
                          </>
                        ) : (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/classes/${c.id}`}>Details</Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      <RecordingPlayerDialog
        isOpen={recordingPlayerConfig.isOpen}
        classId={recordingPlayerConfig.classId}
        topic={recordingPlayerConfig.topic}
        onClose={() =>
          setRecordingPlayerConfig({ isOpen: false, classId: null, topic: "" })
        }
      />
    </div>
  );
}
