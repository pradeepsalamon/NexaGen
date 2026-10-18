"use client";

import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import {
  createDemoScheduleRequestSchema,
  type DemoClassAccessMode,
  type DemoScheduleDto,
  type DemoScheduleSlot
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { TimePicker } from "@/components/ui/TimePicker";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useAssignableUsersQuery } from "@/features/batches/hooks/useBatchesApi";
import { DAY_LABELS, TIMEZONE_OPTIONS } from "@/features/batch-schedules/lib/scheduleFormat";
import { useSaveDemoScheduleMutation } from "../../hooks/useAdminDemoClasses";
import { DemoAccessFields } from "./DemoAccessFields";

const DURATION_OPTIONS = [30, 45, 60, 90, 120].map((m) => ({ label: `${m} minutes`, value: String(m) }));

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

interface DemoScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: DemoScheduleDto | null;
}

export function DemoScheduleFormDialog({ open, onOpenChange, schedule }: DemoScheduleFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{schedule ? "Edit demo schedule" : "New demo schedule"}</DialogTitle>
          <DialogDescription>
            One permanent link that always opens the live or next session. Sessions are created two weeks ahead.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ScheduleForm key={schedule?.id ?? "new"} schedule={schedule} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({ schedule, onDone }: { schedule: DemoScheduleDto | null; onDone: () => void }) {
  const { data: usersData, isLoading: isLoadingUsers } = useAssignableUsersQuery();
  const save = useSaveDemoScheduleMutation(schedule?.id ?? null);

  const [topic, setTopic] = useState(schedule?.topic ?? "");
  const [slug, setSlug] = useState(schedule?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!schedule);
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [coachId, setCoachId] = useState(schedule?.coachId ?? "");
  const [timezone, setTimezone] = useState(schedule?.timezone ?? "Asia/Kolkata");
  const [durationMinutes, setDurationMinutes] = useState(String(schedule?.durationMinutes ?? 60));
  const [slots, setSlots] = useState<DemoScheduleSlot[]>(
    schedule?.slots ?? [{ dayOfWeek: 6, startTime: "17:00" }]
  );
  const [accessMode, setAccessMode] = useState<DemoClassAccessMode>(schedule?.accessMode ?? "PUBLIC");
  const [passcode, setPasscode] = useState(schedule?.passcode ?? "");
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const timezoneOptions = TIMEZONE_OPTIONS.includes(timezone) ? TIMEZONE_OPTIONS : [timezone, ...TIMEZONE_OPTIONS];
  const coachOptions = (usersData?.coaches ?? []).map((coach) => ({
    label: `${coach.firstName} ${coach.lastName || ""}`.trim(),
    value: coach.id
  }));

  const patchSlot = (index: number, patch: Partial<DemoScheduleSlot>) =>
    setSlots((prev) => prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = createDemoScheduleRequestSchema.safeParse({
      topic,
      slug,
      description: description || undefined,
      coachId,
      timezone,
      durationMinutes: Number(durationMinutes),
      slots,
      accessMode,
      passcode: accessMode === "PASSCODE" ? passcode : undefined,
      isActive
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Topic" error={errors.topic}>
        <Input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="e.g. Free trial class"
          maxLength={120}
        />
      </Field>

      <Field
        label="Link"
        error={errors.slug}
        hint={schedule ? "Changing it breaks links you've already shared." : undefined}
      >
        <div className="flex items-center rounded-control border border-app-border bg-app-surface pl-3 focus-within:border-primary">
          <span className="shrink-0 text-sm text-app-muted">/demo/</span>
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="free-trial"
            maxLength={40}
            aria-label="Link name"
            className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm text-app-text outline-none"
          />
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Coach" error={errors.coachId}>
          <Select
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            options={coachOptions}
            placeholder="Select a coach…"
            disabled={isLoadingUsers}
          />
        </Field>
        <Field label="Duration">
          <Select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            options={DURATION_OPTIONS}
          />
        </Field>
      </div>

      <Field label="Timezone" hint="The weekly times below are in this timezone.">
        <Select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          options={timezoneOptions.map((tz) => ({ label: tz, value: tz }))}
        />
      </Field>

      <Field label="Weekly sessions" error={errors.slots} group>
        <div className="grid gap-2">
          {slots.map((slot, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                className="flex-1"
                aria-label="Day of week"
                value={String(slot.dayOfWeek)}
                onChange={(e) => patchSlot(index, { dayOfWeek: Number(e.target.value) })}
                options={DAY_LABELS.map((label, day) => ({ label, value: String(day) }))}
              />
              <TimePicker
                aria-label="Start time"
                value={slot.startTime}
                onChange={(value) => patchSlot(index, { startTime: value })}
                minuteStep={15}
              />
              <SimpleTooltip label="Remove this session">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove this session"
                  disabled={slots.length === 1}
                  onClick={() => setSlots((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </SimpleTooltip>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              setSlots((prev) => [...prev, prev[prev.length - 1] ?? { dayOfWeek: 6, startTime: "17:00" }])
            }
          >
            <Plus aria-hidden="true" className="size-4" /> Add a session
          </Button>
        </div>
      </Field>

      <Field label="Description (optional)">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What will the demo cover?"
        />
      </Field>

      <div className="border-t border-app-border pt-4">
        <DemoAccessFields
          accessMode={accessMode}
          passcode={passcode}
          onAccessModeChange={setAccessMode}
          onPasscodeChange={setPasscode}
          passcodeError={errors.passcode}
          disabled={save.isPending}
        />
      </div>

      <Switch
        checked={isActive}
        onCheckedChange={setIsActive}
        label={isActive ? "Active: sessions are being scheduled" : "Paused: no new sessions"}
      />

      <div className="flex justify-end gap-3 border-t border-app-border pt-4">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={save.isPending}>
          <Save aria-hidden="true" className="size-4" />
          {schedule ? "Save changes" : "Create schedule"}
        </Button>
      </div>
    </form>
  );
}

/** A `<label>` around a single control; `group` for a set of controls. */
function Field({
  label,
  error,
  hint,
  group,
  children
}: {
  label: string;
  error?: string;
  hint?: string;
  group?: boolean;
  children: React.ReactNode;
}) {
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className="grid gap-1" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="text-sm font-medium text-app-text">{label}</span>
      {children}
      {error ? (
        <p className="text-xs text-app-danger-ink">{error}</p>
      ) : hint ? (
        <p className="text-xs text-app-muted">{hint}</p>
      ) : null}
    </Wrapper>
  );
}
