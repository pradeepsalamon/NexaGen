"use client";

import { useState } from "react";
import { MicOff, VideoOff } from "lucide-react";
import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { moderateAll } from "../../api/live-class";
import { meetingToast } from "../../lib/meetingToasts";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { setAtPath } from "../../settings/fields";
import { useClassLiveSettings, useUpdateLiveSettingsMidClass } from "../../settings/hooks";

type Source = "microphone" | "camera";

/**
 * Coach-only room-wide controls at the top of the People panel. Everything
 * here only ever turns students' media OFF — nobody's mic or camera is turned
 * on for them. The switches are mid-class settings changes, so they reach
 * every student's grants at once and also cover late joiners.
 */
export function CoachRoomControls({ classId }: { classId: string }) {
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

  return (
    <div className="shrink-0 space-y-2.5 border-b border-app-border/40 px-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          isLoading={busy === "microphone"}
          disabled={busy !== null}
          onClick={() => void turnOffAll("microphone")}
        >
          <MicOff className="mr-1.5 size-3.5" strokeWidth={2.5} />
          Mute all
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          isLoading={busy === "camera"}
          disabled={busy !== null}
          onClick={() => void turnOffAll("camera")}
        >
          <VideoOff className="mr-1.5 size-3.5" strokeWidth={2.5} />
          All cameras off
        </Button>
      </div>
      <div className="space-y-1.5">
        <RoomSwitch
          label="Lock student mics"
          checked={micLocked}
          disabled={switching}
          onChange={(on) => patch("student.mic", on ? "FORCED_OFF" : "JOIN_MUTED")}
        />
        <RoomSwitch
          label="Lock student cameras"
          checked={cameraLocked}
          disabled={switching}
          onChange={(on) => patch("student.camera", on ? "FORCED_OFF" : "JOIN_OFF")}
        />
        <RoomSwitch
          label="Student reactions"
          checked={reactionsOn}
          disabled={switching}
          onChange={(on) => patch("student.reactions", on ? "ENABLED" : "DISABLED")}
        />
      </div>
    </div>
  );
}

function RoomSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-medium text-app-text">
      {label}
      <Switch checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
    </label>
  );
}
