"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  RefreshCw,
  RotateCcw,
  Ban,
  PauseCircle,
  PlayCircle
} from "lucide-react";
import type {
  ScheduleCalendarClass,
  ScheduleOccurrenceActionRequest
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/providers/ToastProvider";
import {
  useBatchScheduleQuery,
  useDeactivateScheduleMutation,
  useOccurrenceActionMutation,
  useRegenerateScheduleMutation,
  useScheduleCalendarQuery,
  useUpdateScheduleMutation
} from "../hooks/useBatchScheduleApi";
import { BatchScheduleCalendar } from "./BatchScheduleCalendar";
import { DAY_LABELS, formatInZone, formatWallTime } from "../lib/scheduleFormat";

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string") return m;
  }
  return "Something went wrong.";
}

const STATUS_BADGE: Record<string, "default" | "success" | "secondary" | "destructive"> = {
  SCHEDULED: "default",
  LIVE: "success",
  IN_PROGRESS: "success",
  COMPLETED: "secondary",
  CANCELLED: "destructive"
};

export function ScheduleDetailClient({ scheduleId }: { scheduleId: string }) {
  const toast = useToast();
  const { data, isLoading } = useBatchScheduleQuery(scheduleId);
  const schedule = data?.schedule;

  const regenerate = useRegenerateScheduleMutation();
  const deactivate = useDeactivateScheduleMutation();
  const updateSchedule = useUpdateScheduleMutation();
  const occurrenceAction = useOccurrenceActionMutation();

  const [rescheduleTarget, setRescheduleTarget] = useState<ScheduleCalendarClass | null>(null);

  const calRange = useMemo(() => {
    if (!schedule) return null;
    return {
      from: `${schedule.startDate}T00:00:00.000Z`,
      to: `${schedule.endDate}T23:59:59.999Z`,
      batchId: schedule.batchId
    };
  }, [schedule]);

  const { data: calData } = useScheduleCalendarQuery({
    from: calRange?.from ?? "",
    to: calRange?.to ?? "",
    batchId: calRange?.batchId,
    enabled: Boolean(calRange)
  });

  const scheduleClasses = useMemo(
    () => (calData?.classes ?? []).filter((c) => c.scheduleId === scheduleId),
    [calData, scheduleId]
  );

  const upcoming = useMemo(
    () =>
      [...scheduleClasses]
        .filter((c) => c.status === "SCHEDULED" || c.status === "CANCELLED")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 40),
    [scheduleClasses]
  );

  if (isLoading || !schedule) {
    return (
      <main className="min-h-[calc(100vh-64px)] bg-app-background p-6">
        <Skeleton className="mx-auto h-64 max-w-5xl w-full" />
      </main>
    );
  }

  const runAction = async (
    classId: string,
    payload: ScheduleOccurrenceActionRequest,
    successMsg: string
  ) => {
    try {
      await occurrenceAction.mutateAsync({ classId, payload });
      toast.success({ title: successMsg });
      setRescheduleTarget(null);
    } catch (error) {
      toast.error({ title: "Action failed", message: getErrorMessage(error) });
    }
  };

  const setStatus = async (status: "ACTIVE" | "PAUSED") => {
    try {
      await updateSchedule.mutateAsync({ id: scheduleId, payload: { status } });
      toast.success({ title: status === "PAUSED" ? "Schedule paused" : "Schedule resumed" });
    } catch (error) {
      toast.error({ title: "Update failed", message: getErrorMessage(error) });
    }
  };

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-5">
        <div>
          <Link
            href="/admin/schedule"
            className="inline-flex items-center gap-1 text-xs font-bold text-app-muted hover:text-app-text"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All schedules
          </Link>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">{schedule.batchName}</p>
            <h1 className="mt-1 text-2xl font-extrabold text-app-text">{schedule.title}</h1>
            <p className="mt-1 text-sm text-app-muted">
              {schedule.startDate} → {schedule.endDate} · {schedule.timezone}
            </p>
          </div>
          <Badge
            variant={
              schedule.status === "ACTIVE"
                ? "success"
                : schedule.status === "PAUSED"
                  ? "warning"
                  : "secondary"
            }
          >
            {schedule.status}
          </Badge>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total", schedule.totalClasses],
            ["Upcoming", schedule.upcomingClasses],
            ["Completed", schedule.completedClasses],
            ["Cancelled", schedule.cancelledClasses]
          ].map(([label, value]) => (
            <Card key={label} className="grid gap-1 p-3">
              <p className="text-xs font-bold uppercase text-app-muted">{label}</p>
              <p className="text-lg font-extrabold text-app-text">{value}</p>
            </Card>
          ))}
        </div>

        {schedule.status !== "ENDED" && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              isLoading={regenerate.isPending}
              onClick={async () => {
                try {
                  const res = await regenerate.mutateAsync(scheduleId);
                  toast.success({
                    title: "Regenerated",
                    message: `${res.generatedCount ?? 0} new classes added.`
                  });
                } catch (error) {
                  toast.error({ title: "Regenerate failed", message: getErrorMessage(error) });
                }
              }}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Regenerate future classes
            </Button>
            {schedule.status === "ACTIVE" ? (
              <Button variant="outline" size="sm" onClick={() => setStatus("PAUSED")}>
                <PauseCircle className="size-4" aria-hidden="true" />
                Pause
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setStatus("ACTIVE")}>
                <PlayCircle className="size-4" aria-hidden="true" />
                Resume
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="border-app-danger text-app-danger hover:bg-app-danger hover:text-white"
              onClick={() =>
                toast.undoable({
                  title: "Ending schedule — future classes will be cancelled",
                  onCommit: async () => {
                    try {
                      const res = await deactivate.mutateAsync(scheduleId);
                      toast.success({
                        title: "Schedule ended",
                        message: `${res.cancelledCount ?? 0} upcoming classes cancelled.`
                      });
                    } catch (error) {
                      toast.error({ title: "Failed", message: getErrorMessage(error) });
                    }
                  }
                })
              }
            >
              <Ban className="size-4" aria-hidden="true" />
              End schedule
            </Button>
          </div>
        )}

        <Card className="grid gap-2 p-4">
          <p className="text-sm font-extrabold text-app-text">Weekly pattern</p>
          <div className="grid gap-1.5">
            {schedule.rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-app-border bg-app-background px-3 py-2 text-sm"
              >
                <span className="font-bold text-app-text">{DAY_LABELS[r.dayOfWeek]}</span>
                <span className="text-app-muted">
                  {formatWallTime(r.startTime)} – {formatWallTime(r.endTime)}
                </span>
                <span className="text-app-muted">{r.coachName}</span>
              </div>
            ))}
          </div>
          {schedule.exceptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs font-bold text-app-muted">Excluded:</span>
              {schedule.exceptions.map((e) => (
                <Badge key={e.id} variant="secondary">
                  {e.date}
                </Badge>
              ))}
            </div>
          )}
        </Card>

        <BatchScheduleCalendar
          classes={scheduleClasses}
          timezone={schedule.timezone}
          onSelectClass={(cls) => {
            if (cls.status === "SCHEDULED") setRescheduleTarget(cls);
          }}
        />

        <Card className="grid gap-2 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-app-text">
            <CalendarClock className="size-4 text-primary" aria-hidden="true" />
            Sessions
          </p>
          <div className="max-h-96 overflow-y-auto">
            <div className="grid gap-1">
              {upcoming.map((cls) => (
                <div
                  key={cls.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-app-border bg-app-background px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-app-muted">
                    #{cls.sessionNumber ?? "—"}
                  </span>
                  <span className="flex-1 font-medium text-app-text">
                    {formatInZone(cls.startsAt, schedule.timezone, { weekday: "short" })}
                  </span>
                  <span className="text-app-muted">{cls.coachName}</span>
                  <Badge variant={STATUS_BADGE[cls.status] ?? "secondary"}>{cls.status}</Badge>
                  <div className="flex gap-1">
                    {cls.status === "SCHEDULED" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRescheduleTarget(cls)}
                        >
                          Reschedule
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-app-danger"
                          onClick={() =>
                            runAction(cls.id, { action: "CANCEL" }, "Class cancelled")
                          }
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                    {cls.status === "CANCELLED" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => runAction(cls.id, { action: "RESTORE" }, "Class restored")}
                      >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        Restore
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <p className="py-4 text-center text-sm text-app-muted">No sessions.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      <RescheduleDialog
        target={rescheduleTarget}
        timezone={schedule.timezone}
        isPending={occurrenceAction.isPending}
        onClose={() => setRescheduleTarget(null)}
        onSubmit={(startsAt, endsAt) =>
          rescheduleTarget &&
          runAction(
            rescheduleTarget.id,
            { action: "RESCHEDULE", startsAt, endsAt },
            "Class rescheduled"
          )
        }
      />
    </main>
  );
}

function RescheduleDialog({
  target,
  timezone,
  isPending,
  onClose,
  onSubmit
}: {
  target: ScheduleCalendarClass | null;
  timezone: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (startsAt: string, endsAt: string) => void;
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  // Seed inputs from the target when it changes.
  useEffect(() => {
    if (target) {
      setStart(target.startsAt.slice(0, 16));
      setEnd(target.endsAt.slice(0, 16));
    }
  }, [target]);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule this class</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-app-muted">
          Times are in UTC. Current: {target ? formatInZone(target.startsAt, timezone) : ""}
        </p>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-bold text-app-muted">
            New start (UTC)
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-app-muted">
            New end (UTC)
            <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={isPending}
            disabled={!start || !end}
            onClick={() =>
              onSubmit(new Date(`${start}:00Z`).toISOString(), new Date(`${end}:00Z`).toISOString())
            }
          >
            Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
