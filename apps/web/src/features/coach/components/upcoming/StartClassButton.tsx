"use client";

import { useState } from "react";
import { Loader2, Play, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getClassStartAvailability, type CoachClass } from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { useNow } from "@/hooks/useNow";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatRelativeDay, formatTime } from "@/lib/datetime";
import { useStartLiveClass } from "@/features/live-class/hooks/useLiveClassApi";

// Starting opens the LiveKit room and tells students the class is live, so a
// start well ahead of time gets a confirmation. Inside this window it is one
// click, like the class page. (Earlier than CLASS_EARLY_START_MINUTES the
// server refuses outright, and the button says when it opens.)
const EARLY_START_CONFIRM_MS = 15 * 60_000;

interface StartClassButtonProps {
  classItem: CoachClass;
  /** A class row: small button, and nothing until the start window opens (the row shows the time). */
  compact?: boolean;
  /** Outlined, where another Start on the page is the primary action. */
  quiet?: boolean;
}

/**
 * The coach's Start / Return action — the same start mutation and redirect as
 * `/classes/:id`, so the server's rules apply as-is.
 */
export function StartClassButton({ classItem, compact = false, quiet = false }: StartClassButtonProps) {
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const start = useStartLiveClass(classItem.id);
  const [confirming, setConfirming] = useState(false);
  const now = useNow();

  if (classItem.status === "LIVE" || classItem.status === "IN_PROGRESS") {
    return (
      <Button
        asChild
        className={compact ? undefined : "flex-1"}
        size={compact ? "sm" : undefined}
        variant={quiet ? "outline" : "primary"}
      >
        <Link href={`/live-class/${classItem.id}`}>
          <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Return to class
        </Link>
      </Button>
    );
  }

  if (classItem.status !== "SCHEDULED") return null;

  const availability = getClassStartAvailability(classItem, now);
  if (!availability.canStart) {
    if (compact || availability.reason !== "TOO_EARLY") return null;
    const hintId = `start-hint-${classItem.id}`;
    return (
      <div className="flex flex-1 flex-col items-stretch gap-1">
        <Button aria-describedby={hintId} disabled variant="outline">
          <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Start class
        </Button>
        <span className="text-center text-xs text-app-muted" id={hintId}>
          {describeOpensAt(availability.opensAt, timeZone)}
        </span>
      </div>
    );
  }

  const doStart = () =>
    start.mutate(undefined, {
      onSettled: () => setConfirming(false),
      onSuccess: () => router.push(`/live-class/${classItem.id}`)
    });

  const onClick = () => {
    const early = new Date(classItem.startsAt).getTime() - now > EARLY_START_CONFIRM_MS;
    if (early) setConfirming(true);
    else doStart();
  };

  return (
    <>
      <Button
        className={compact ? undefined : "flex-1"}
        disabled={start.isPending}
        onClick={onClick}
        size={compact ? "sm" : undefined}
        variant={quiet ? "outline" : "primary"}
      >
        {start.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Play aria-hidden="true" className={compact ? "size-3.5 fill-current" : "size-4 fill-current"} strokeWidth={2.5} />
        )}
        {start.isPending ? "Starting..." : "Start class"}
      </Button>
      <ConfirmationModal
        confirmLabel="Start now"
        isConfirming={start.isPending}
        isOpen={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={doStart}
        title="Start this class early?"
      >
        It is scheduled for {formatDateTime(classItem.startsAt, timeZone)}. Starting now opens the
        live room and shows the class as live to its students.
      </ConfirmationModal>
    </>
  );
}

/** "Opens today at 5:30 PM" / "Opens on Friday at 5:30 PM". */
export function describeOpensAt(opensAt: string | undefined, timeZone: string) {
  const day = formatRelativeDay(opensAt, timeZone);
  const when = day === "Today" || day === "Tomorrow" ? day.toLowerCase() : `on ${day}`;
  return `Opens ${when} at ${formatTime(opensAt, timeZone)}`;
}
