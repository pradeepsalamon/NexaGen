"use client";

import { useState } from "react";
import { Loader2, Play, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CoachClass } from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useStartLiveClass } from "@/features/live-class/hooks/useLiveClassApi";

// Starting opens the LiveKit room and tells students the class is live, so a
// misclick on a card days ahead gets a confirmation. Inside this window it is
// one click, like the class page.
const EARLY_START_CONFIRM_MS = 15 * 60_000;

/**
 * The coach's Start / Return action on a dashboard card — the same start
 * mutation and redirect as `/classes/:id`, so the server's rules apply as-is.
 */
export function StartClassButton({ classItem }: { classItem: CoachClass }) {
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const start = useStartLiveClass(classItem.id);
  const [confirming, setConfirming] = useState(false);

  if (classItem.status === "LIVE" || classItem.status === "IN_PROGRESS") {
    return (
      <Button asChild className="flex-1" variant="destructive">
        <Link href={`/live-class/${classItem.id}`}>
          <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Return to class
        </Link>
      </Button>
    );
  }

  if (classItem.status !== "SCHEDULED") return null;

  const doStart = () =>
    start.mutate(undefined, {
      onSettled: () => setConfirming(false),
      onSuccess: () => router.push(`/live-class/${classItem.id}`)
    });

  const onClick = () => {
    const early = new Date(classItem.startsAt).getTime() - Date.now() > EARLY_START_CONFIRM_MS;
    if (early) setConfirming(true);
    else doStart();
  };

  return (
    <>
      <Button className="flex-1" disabled={start.isPending} onClick={onClick}>
        {start.isPending ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <Play aria-hidden="true" className="size-4 fill-current" strokeWidth={2.5} />
        )}
        {start.isPending ? "Starting..." : "Start Class"}
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
