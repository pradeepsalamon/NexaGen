"use client";

import { useState } from "react";
import { ChevronDown, Loader2, MicOff, UserCog, VideoOff, type LucideIcon } from "lucide-react";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { moderateAll } from "../../api/live-class";
import { meetingToast } from "../../lib/meetingToasts";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { setAtPath } from "../../settings/fields";
import { useClassLiveSettings, useUpdateLiveSettingsMidClass } from "../../settings/hooks";
import { CONTROL_BUTTON_BASE, CONTROL_BUTTON_VARIANTS } from "./MeetingControlButton";

type Source = "microphone" | "camera";

/**
 * Class-wide student controls: Mute all, Cameras off, and switches for Lock
 * microphones, Lock cameras and Reactions. Everything here only ever turns
 * students' media OFF — nobody's mic or camera is turned on for them. The
 * switches are mid-class settings changes, so they reach every student's
 * grants at once and also cover late joiners.
 *
 * Rendered inside the Students menu (control bar), or a dialog when the bar
 * has no room for that control.
 */
export function StudentControlsList({ classId, className }: { classId: string; className?: string }) {
  const { settings } = useLiveClassState("settings");
  const classSettings = useClassLiveSettings(classId);
  const apply = useUpdateLiveSettingsMidClass(classId);
  const [busy, setBusy] = useState<Source | null>(null);

  const micLocked = settings?.student.mic === "FORCED_OFF";
  const cameraLocked = settings?.student.camera === "FORCED_OFF";
  const reactionsOn = settings?.student.reactions !== "DISABLED";

  const patch = (path: string, value: string) => {
    const base: LiveClassSettingsOverride = classSettings.data?.classOverride ?? {};
    apply.mutate({ liveClassSettings: setAtPath(base, path, value) });
  };

  const turnOffAll = async (source: Source) => {
    setBusy(source);
    const label = source === "microphone" ? "microphones" : "cameras";
    try {
      const { mutedCount } = await moderateAll(classId, { sources: [source] });
      meetingToast({
        tone: mutedCount > 0 ? "success" : "info",
        title:
          mutedCount > 0
            ? `Turned off ${mutedCount} student ${mutedCount === 1 ? label.slice(0, -1) : label}`
            : `All student ${label} were already off`,
        description: mutedCount > 0 ? "Students can turn them back on unless you lock them." : undefined,
      });
    } catch (error) {
      meetingToast({
        tone: "warning",
        title: `Couldn't turn off student ${label}`,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(null);
    }
  };

  const switching = apply.isPending || classSettings.isLoading;
  // Without the class's stored override a lock switch would overwrite the
  // coach's other per-class settings, so the switches wait for it.
  const unavailable = classSettings.isError ? "Couldn't load this class's settings" : undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)} role="group" aria-label="Class-wide student controls">
      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          icon={MicOff}
          label="Mute all"
          hint="Turn off every student's microphone. They can turn it back on unless mics are locked."
          busy={busy === "microphone"}
          disabled={busy !== null}
          onClick={() => void turnOffAll("microphone")}
        />
        <ActionButton
          icon={VideoOff}
          label="Cameras off"
          hint="Turn off every student's camera. They can turn it back on unless cameras are locked."
          busy={busy === "camera"}
          disabled={busy !== null}
          onClick={() => void turnOffAll("camera")}
        />
      </div>
      <div className="mt-1 border-t border-app-border pt-1">
        <SwitchRow
          label="Lock microphones"
          hint={micLocked ? "Students can't unmute" : "Students may unmute"}
          checked={micLocked}
          disabled={switching || !!unavailable}
          busy={apply.isPending}
          onChange={() => patch("student.mic", micLocked ? "JOIN_MUTED" : "FORCED_OFF")}
        />
        <SwitchRow
          label="Lock cameras"
          hint={cameraLocked ? "Students can't turn cameras on" : "Students may turn cameras on"}
          checked={cameraLocked}
          disabled={switching || !!unavailable}
          busy={apply.isPending}
          onChange={() => patch("student.camera", cameraLocked ? "JOIN_OFF" : "FORCED_OFF")}
        />
        <SwitchRow
          label="Reactions"
          hint={reactionsOn ? "Students can send reactions" : "Student reactions are off"}
          checked={reactionsOn}
          disabled={switching || !!unavailable}
          busy={apply.isPending}
          onChange={() => patch("student.reactions", reactionsOn ? "DISABLED" : "ENABLED")}
        />
      </div>
      {unavailable ? <p className="px-2 pb-1 text-xs text-warning-ink">{unavailable}. The switches are off until it loads.</p> : null}
    </div>
  );
}

/**
 * Student controls menu (spec component 6): one "Students" control in the
 * control bar opening a 280px popover, replacing five separate buttons.
 */
export function StudentControlsMenu({ classId }: { classId: string }) {
  const [open, setOpen] = useState(false);
  const { settings } = useLiveClassState("settings");
  const anyLock = settings?.student.mic === "FORCED_OFF" || settings?.student.camera === "FORCED_OFF";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SimpleTooltip label="Class-wide student controls">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={anyLock ? "Student controls (locks on)" : "Student controls"}
            aria-haspopup="dialog"
            aria-expanded={open}
            className={cn(
              CONTROL_BUTTON_BASE,
              CONTROL_BUTTON_VARIANTS[open ? "active" : "default"],
              "w-auto gap-1.5 px-2.5 text-sm font-medium",
            )}
          >
            <UserCog aria-hidden="true" className="size-5" strokeWidth={1.75} />
            <span className="hidden lg:inline">Students</span>
            <ChevronDown aria-hidden="true" className="hidden size-4 lg:block" strokeWidth={2} />
            {anyLock ? (
              <span aria-hidden="true" className="absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-app-surface" />
            ) : null}
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent side="top" align="center" sideOffset={12} className="w-[17.5rem] p-2">
        <p className="px-2 pb-2 pt-1 text-sm font-semibold text-app-text">Students</p>
        <StudentControlsList classId={classId} />
      </PopoverContent>
    </Popover>
  );
}

function ActionButton({
  icon: Icon,
  label,
  hint,
  busy,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <SimpleTooltip label={hint}>
      <button
        type="button"
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex h-11 min-w-0 items-center justify-center gap-2 rounded-control border border-app-line-strong/60 bg-app-surface px-2 text-sm font-medium text-app-text transition-colors hover:bg-app-soft",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <Icon aria-hidden="true" className="size-4" strokeWidth={2} />
        )}
        <span className="truncate">{label}</span>
      </button>
    </SimpleTooltip>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  busy,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-chip px-2 py-1.5 hover:bg-app-soft">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-app-text">{label}</span>
        <span className="block text-xs text-app-muted">{hint}</span>
      </span>
      <Switch checked={checked} disabled={disabled} aria-busy={busy || undefined} aria-label={label} onCheckedChange={onChange} />
    </label>
  );
}
