"use client";

import { useMediaDeviceSelect } from "@livekit/components-react";
import { Camera, Mic, SlidersHorizontal, Volume2 } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { InRoomClassControls } from "../../settings/InRoomClassControls";
import { PanelHeader } from "./PanelHeader";

interface DeviceSelectorProps {
  kind: MediaDeviceKind;
  icon: React.ReactNode;
  label: string;
}

function DeviceSelector({ kind, icon, label }: DeviceSelectorProps) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });

  const options = devices.map((device, i) => ({
    value: device.deviceId,
    label: device.label || `${label} ${i + 1}`,
  }));

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-app-muted">
        <span className="text-app-muted">{icon}</span>
        {label}
      </label>
      {options.length === 0 ? (
        <p className="rounded-control border border-app-border bg-app-soft/50 px-3.5 py-2.5 text-sm text-app-muted">
          No devices found
        </p>
      ) : (
        <Select
          options={options}
          value={activeDeviceId}
          onChange={(e) => setActiveMediaDevice(e.target.value)}
          aria-label={`Select ${label.toLowerCase()}`}
        />
      )}
    </div>
  );
}

export function MeetingSettings() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Settings" />

      <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        <DeviceSelector kind="audioinput" icon={<Mic className="size-4" />} label="Microphone" />
        <DeviceSelector kind="videoinput" icon={<Camera className="size-4" />} label="Camera" />
        <DeviceSelector kind="audiooutput" icon={<Volume2 className="size-4" />} label="Speaker" />

        {isCoach && (
          <div className="rounded-app border border-app-border bg-app-soft/30 p-4">
            <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-app-muted">
              <SlidersHorizontal className="size-4" />
              Class settings
            </h4>
            <InRoomClassControls />
          </div>
        )}

        <div className="rounded-app border border-app-border bg-app-soft/30 p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-app-muted">
            Keyboard shortcuts
          </h4>
          <div className="space-y-2.5">
            {[
              { key: "M", action: "Toggle microphone" },
              { key: "V", action: "Toggle camera" },
              { key: "Esc", action: "Close panel / exit fullscreen" },
            ].map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-app-text">{action}</span>
                <kbd className="rounded-md border border-app-border bg-app-surface px-2 py-0.5 font-mono text-xs font-semibold text-app-muted shadow-sm">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
