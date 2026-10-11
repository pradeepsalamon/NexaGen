"use client";

import { useEffect, type ReactNode } from "react";
import { Calendar, CalendarX, Clock, Loader2, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CLASS_START_BLOCK_MESSAGES,
  getClassStartAvailability,
  resolveClassDisplayStatus
} from "@nexa-chess/types";
import { BackButton } from "@/components/ui/BackButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { LiveClassMonitor } from "@/features/attendance/components/LiveClassMonitor";
import { EndClassButton } from "@/features/live-class/components/EndClassButton";
import { useStartLiveClass } from "@/features/live-class/hooks/useLiveClassApi";
import { LiveClassSettingsSection } from "@/features/live-class/settings/LiveClassSettingsSection";
import { useNow } from "@/hooks/useNow";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate, formatTime } from "@/lib/datetime";
import { useClassDetail } from "../hooks/useCoachApi";
import { describeOpensAt } from "./upcoming/StartClassButton";

/**
 * `/classes/:id` for the owning coach (and admins, read + join/end). Start
 * follows the shared start window (`getClassStartAvailability`), the same rule
 * the API enforces, so the button never offers a start the server refuses.
 */
export function StaffClassDetailsClient({ classId, isCoach }: { classId: string; isCoach: boolean }) {
  const router = useRouter();
  const startLiveClassMutation = useStartLiveClass(classId);
  const tz = useUserTimeZone();
  const now = useNow();
  const { data, error, isLoading, refetch } = useClassDetail(classId, { refetchInterval: 20000 });
  const cls = data?.class;

  useEffect(() => {
    if (cls) {
      document.title = `${cls.title || cls.topic || "Class Details"} - Nexa Chess`;
    }
  }, [cls]);

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !cls) {
    return (
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
        <BackButton />
        <WidgetError
          message="We couldn't load this class. It may have been removed, or it isn't one of your classes."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const durationMs =
    new Date(cls.endsAt).getTime() - new Date(cls.startsAt).getTime();
  const durationMins = Math.round(durationMs / 60000);
  const shown = resolveClassDisplayStatus(cls, now);
  const isLive = shown === "LIVE";
  const availability = getClassStartAvailability(cls, now);

  let action: ReactNode;
  if (isLive) {
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Class is Live!</h2>
        <p className="text-app-muted">
          {isCoach
            ? "The live session is currently active. If you left without ending it, rejoin or end it here."
            : "The coach has started the live session."}
        </p>
        <div className="mt-4 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button size="lg" onClick={() => router.push(`/live-class/${classId}`)}>
            {isCoach ? "Return to Live Class" : "Join Live Class"}
          </Button>
          <EndClassButton classId={classId} size="lg" />
        </div>
      </>
    );
  } else if (shown === "CANCELLED") {
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Class Cancelled</h2>
        <p className="text-app-muted">This class was cancelled and will not take place.</p>
      </>
    );
  } else if (shown === "NOT_HELD") {
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Class Not Held</h2>
        <p className="text-app-muted">
          {isCoach
            ? CLASS_START_BLOCK_MESSAGES.WINDOW_PASSED
            : "This class's scheduled time passed without it being started."}
        </p>
        {isCoach ? (
          <Button asChild className="mt-4" size="lg" variant="outline">
            <Link href="/coach/schedule">Go to schedule</Link>
          </Button>
        ) : null}
      </>
    );
  } else if (shown === "COMPLETED") {
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Class Ended</h2>
        <p className="text-app-muted">This live session has already concluded.</p>
      </>
    );
  } else if (isCoach) {
    const hintId = `start-hint-${classId}`;
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Ready to Teach?</h2>
        <p className="text-app-muted" id={hintId}>
          {availability.canStart
            ? "Start the live video class and students will be able to join."
            : availability.reason === "TOO_EARLY"
              ? `${describeOpensAt(availability.opensAt, tz)}. ${CLASS_START_BLOCK_MESSAGES.TOO_EARLY}`
              : CLASS_START_BLOCK_MESSAGES[availability.reason]}
        </p>
        <Button
          aria-describedby={hintId}
          className="mt-4 w-full sm:w-auto"
          size="lg"
          disabled={!availability.canStart || startLiveClassMutation.isPending}
          onClick={() => {
            startLiveClassMutation.mutate(undefined, {
              onSuccess: () => router.push(`/live-class/${classId}`)
            });
          }}
        >
          {startLiveClassMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {startLiveClassMutation.isPending ? "Starting Live Class..." : "Start Live Class"}
        </Button>
      </>
    );
  } else {
    action = (
      <>
        <h2 className="text-2xl font-bold text-app-text">Waiting for Coach</h2>
        <p className="text-app-muted">The live class hasn&apos;t started yet.</p>
      </>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
      <BackButton />

      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
              {cls.title || cls.topic || "Regular Session"}
            </h1>
            <div className="flex items-center gap-2">
              <ClassStatusBadge endsAt={cls.endsAt} status={cls.status} />
            </div>
          </div>
          <p className="text-xl text-app-muted font-medium">
            {cls.batchName}
          </p>
        </div>

        <div className="flex flex-col gap-3 p-4 bg-app-surface border border-app-border rounded-app shadow-soft md:min-w-[200px]">
          <div className="flex items-center gap-2 text-app-text">
            <Calendar className="h-4 w-4 text-primary-ink" />
            <span className="font-semibold">{formatFullDate(cls.startsAt, tz)}</span>
          </div>
          <div className="flex items-center gap-2 text-app-text">
            <Clock className="h-4 w-4 text-primary-ink" />
            <span className="font-semibold">
              {formatTime(cls.startsAt, tz)} ({durationMins}m)
            </span>
          </div>
        </div>
      </div>

      <Card className="p-5 sm:p-8 border-primary/20 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface)),color-mix(in_srgb,var(--color-accent)_5%,var(--color-surface)))]">
        <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-4">
          <div className="p-4 rounded-full bg-primary/10 text-primary-ink mb-2">
            {shown === "CANCELLED" || shown === "NOT_HELD" ? (
              <CalendarX className="h-8 w-8" />
            ) : (
              <Video className="h-8 w-8" />
            )}
          </div>
          {action}
        </div>
      </Card>

      {isLive && <LiveClassMonitor classId={classId} />}

      {(shown === "SCHEDULED" || isLive) && <LiveClassSettingsSection classId={classId} />}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-app-text mb-4">Class Details</h3>
          <div className="space-y-4">
            <div>
              <span className="text-sm font-bold text-app-muted">Description</span>
              <p className="mt-1 text-app-text">{cls.description || "No description provided."}</p>
            </div>
            {cls.objectives && (
              <div>
                <span className="text-sm font-bold text-app-muted">Objectives</span>
                <p className="mt-1 text-app-text">{cls.objectives}</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold text-app-text mb-4">Post-Class</h3>
          <div className="space-y-4">
            <div>
              <span className="text-sm font-bold text-app-muted">Homework</span>
              <p className="mt-1 text-app-text">{cls.homework || "No homework assigned."}</p>
            </div>
            {cls.notes && (
              <div>
                <span className="text-sm font-bold text-app-muted">Private Notes</span>
                <p className="mt-1 text-app-text">{cls.notes}</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
