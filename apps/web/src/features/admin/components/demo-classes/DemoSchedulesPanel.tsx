"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { DEMO_CLASS_ACCESS_MODE_LABELS, type DemoScheduleDto } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { DAY_SHORT, formatWallTime } from "@/features/batch-schedules/lib/scheduleFormat";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useToast } from "@/providers/ToastProvider";
import { deleteDemoSchedule } from "../../api/adminApi";
import {
  demoQueryKeys,
  useDemoSchedulesQuery,
  useToggleDemoScheduleMutation
} from "../../hooks/useAdminDemoClasses";
import { demoShareText } from "../../lib/demoLinks";
import { DemoScheduleFormDialog } from "./DemoScheduleFormDialog";

function describeSlots(schedule: DemoScheduleDto): string {
  const byTime = new Map<string, number[]>();
  for (const slot of schedule.slots) {
    byTime.set(slot.startTime, [...(byTime.get(slot.startTime) ?? []), slot.dayOfWeek]);
  }
  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, days]) => `${[...new Set(days)].sort().map((d) => DAY_SHORT[d]).join(", ")} · ${formatWallTime(time)}`)
    .join("  |  ");
}

/** Static demo slots — each one permanent link backed by generated sessions. */
export function DemoSchedulesPanel() {
  const timeZone = useUserTimeZone();
  const toast = useToast();
  const { data, isLoading } = useDemoSchedulesQuery();
  const toggle = useToggleDemoScheduleMutation();
  const [editing, setEditing] = useState<DemoScheduleDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const schedules = (data?.schedules ?? []).filter((s) => !hiddenIds.includes(s.id));

  const { run: runDelete } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (schedule: DemoScheduleDto) => deleteDemoSchedule(schedule.id),
    undo: async () => undefined,
    toast: (schedule) => ({
      title: "Demo schedule deleted",
      message: `/demo/${schedule.slug} stops working. Sessions with guests are kept.`
    }),
    invalidates: [[...demoQueryKeys.schedules], [...demoQueryKeys.classes]],
    onSchedule: (schedule) => setHiddenIds((ids) => [...ids, schedule.id]),
    onCancel: (schedule) => setHiddenIds((ids) => ids.filter((id) => id !== schedule.id))
  });

  const openForm = (schedule: DemoScheduleDto | null) => {
    setEditing(schedule);
    setFormOpen(true);
  };

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-app-text">Demo schedules</h2>
          <p className="text-sm text-app-muted">
            A recurring trial slot behind one link that never changes: share it on the website, in WhatsApp or with every lead.
          </p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus aria-hidden="true" className="size-4" /> New schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No demo schedules yet"
          description="Create one to get a permanent demo link like /demo/free-trial."
        />
      ) : (
        <ul className="grid gap-3">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-col gap-3 rounded-control border border-app-border p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-extrabold text-app-text">
                  {schedule.topic}
                  <Badge variant="info">/demo/{schedule.slug}</Badge>
                  {!schedule.isActive && <Badge variant="secondary">Paused</Badge>}
                </p>
                <p className="text-sm text-app-text">
                  {describeSlots(schedule)}{" "}
                  <span className="text-app-muted">
                    ({schedule.timezone}, {schedule.durationMinutes} min) · {schedule.coachName}
                  </span>
                </p>
                <p className="text-xs text-app-muted">
                  {DEMO_CLASS_ACCESS_MODE_LABELS[schedule.accessMode]}
                  {schedule.accessMode === "PASSCODE" && schedule.passcode && (
                    <> · passcode <code className="font-mono tracking-widest">{schedule.passcode}</code></>
                  )}
                  {" · "}
                  {schedule.nextSession
                    ? schedule.nextSession.status === "LIVE"
                      ? "Live now"
                      : `Next: ${formatDateTime(schedule.nextSession.startsAt, timeZone)}`
                    : "No upcoming session"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Switch
                  checked={schedule.isActive}
                  disabled={toggle.isPending}
                  onCheckedChange={(isActive) => toggle.mutate({ id: schedule.id, isActive })}
                  aria-label={schedule.isActive ? `Pause ${schedule.topic}` : `Resume ${schedule.topic}`}
                />
                <RowActions
                  actions={[
                    {
                      icon: Copy,
                      label: schedule.accessMode === "PASSCODE" ? "Copy link + passcode" : "Copy link",
                      onSelect: () => {
                        void navigator.clipboard.writeText(
                          demoShareText(`/demo/${schedule.slug}`, schedule.accessMode, schedule.passcode)
                        );
                        toast.success({ title: "Link copied" });
                      }
                    },
                    { icon: Pencil, label: "Edit", ariaLabel: `Edit ${schedule.topic}`, tone: "warning", onSelect: () => openForm(schedule) },
                    { icon: Trash2, label: "Delete", ariaLabel: `Delete ${schedule.topic}`, tone: "danger", onSelect: () => runDelete(schedule) }
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <DemoScheduleFormDialog open={formOpen} onOpenChange={setFormOpen} schedule={editing} />
    </Card>
  );
}
