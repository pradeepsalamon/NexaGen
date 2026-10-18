"use client";

import { useState } from "react";
import {
  Loader2,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  Smile,
  SmilePlus,
  Video,
  VideoOff,
  type LucideIcon,
} from "lucide-react";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { moderateAll } from "../../api/live-class";
import { meetingToast } from "../../lib/meetingToasts";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { setAtPath } from "../../settings/fields";
import { useClassLiveSettings, useUpdateLiveSettingsMidClass } from "../../settings/hooks";

type Source = "microphone" | "camera";

/**
 * Coach-only room-wide controls, one compact strip: Mute all, All cameras
 * off, Lock mics, Lock cameras, Student reactions. On the single page it sits
 * under the panel video, above the tabs; in the phone sidebar it heads the
 * People panel. Everything
 * here only ever turns students' media OFF — nobody's mic or camera is turned
 * on for them. The switches are mid-class settings changes, so they reach
 * every student's grants at once and also cover late joiners.
 */
export function CoachRoomControls({ classId, className }: { classId: string; className?: string }) {
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
  const unavailable = classSettings.isError
    ? "Unavailable — couldn't load this class's settings"
    : undefined;

  return (
    <div
      role="toolbar"
      aria-label="Class-wide student controls"
      className={cn("grid shrink-0 grid-cols-5 gap-1 border-b border-app-border/60 px-2 py-1.5", className)}
    >
      <StripButton
        icon={MicOff}
        label="Mute all"
        hint="Turn off every student's microphone (they can turn it back on unless mics are locked)"
        busy={busy === "microphone"}
        disabled={busy !== null}
        onClick={() => void turnOffAll("microphone")}
      />
      <StripButton
        icon={VideoOff}
        label="Cams off"
        hint="Turn off every student's camera (they can turn it back on unless cameras are locked)"
        busy={busy === "camera"}
        disabled={busy !== null}
        onClick={() => void turnOffAll("camera")}
      />
      <StripButton
        icon={micLocked ? Lock : LockOpen}
        secondaryIcon={Mic}
        label="Lock mics"
        hint={unavailable ?? (micLocked ? "Student mics are locked off — click to let students unmute" : "Lock student mics off — students can't unmute")}
        pressed={micLocked}
        busy={switching && !classSettings.isLoading}
        disabled={switching || !!unavailable}
        onClick={() => patch("student.mic", micLocked ? "JOIN_MUTED" : "FORCED_OFF")}
      />
      <StripButton
        icon={cameraLocked ? Lock : LockOpen}
        secondaryIcon={Video}
        label="Lock cams"
        hint={unavailable ?? (cameraLocked ? "Student cameras are locked off — click to let students turn them on" : "Lock student cameras off — students can't turn them on")}
        pressed={cameraLocked}
        busy={switching && !classSettings.isLoading}
        disabled={switching || !!unavailable}
        onClick={() => patch("student.camera", cameraLocked ? "JOIN_OFF" : "FORCED_OFF")}
      />
      <StripButton
        icon={reactionsOn ? Smile : SmilePlus}
        label="Reactions"
        hint={unavailable ?? (reactionsOn ? "Student reactions are on — click to turn them off" : "Student reactions are off — click to turn them on")}
        pressed={reactionsOn}
        busy={switching && !classSettings.isLoading}
        disabled={switching || !!unavailable}
        onClick={() => patch("student.reactions", reactionsOn ? "DISABLED" : "ENABLED")}
      />
    </div>
  );
}

/**
 * One cell of the strip: icon over a short label. `pressed` makes it a toggle
 * (aria-pressed, filled while on); without it it is a one-shot action.
 */
function StripButton({
  icon: Icon,
  secondaryIcon: SecondaryIcon,
  label,
  hint,
  pressed,
  busy = false,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  /** Small badge icon, to tell the two lock toggles apart at a glance. */
  secondaryIcon?: LucideIcon;
  label: string;
  hint: string;
  pressed?: boolean;
  busy?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <SimpleTooltip label={hint}>
      <button
        type="button"
        aria-label={hint}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1.5 text-[0.6875rem] font-semibold leading-tight transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
          pressed
            ? "bg-primary/10 text-primary-ink ring-1 ring-inset ring-primary/40 hover:bg-primary/15"
            : "text-app-muted hover:bg-app-soft hover:text-app-text",
        )}
      >
        <span className="relative flex size-4 items-center justify-center">
          {busy ? (
            <Loader2 className="size-4 animate-spin" strokeWidth={2.5} />
          ) : (
            <Icon className="size-4" strokeWidth={2.5} />
          )}
          {SecondaryIcon && !busy ? (
            <SecondaryIcon className="absolute -bottom-1 -right-1.5 size-2.5" strokeWidth={3} aria-hidden="true" />
          ) : null}
        </span>
        <span className="w-full truncate text-center">{label}</span>
      </button>
    </SimpleTooltip>
  );
}
