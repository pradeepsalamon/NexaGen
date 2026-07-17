"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useMediaDeviceSelect } from "@livekit/components-react";
import { Mic, Camera, Volume2, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Device Selector ─────────────────────────────────────────

interface DeviceSelectorProps {
  kind: MediaDeviceKind;
  icon: React.ReactNode;
  label: string;
}

function DeviceSelector({ kind, icon, label }: DeviceSelectorProps) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeDevice = devices.find((d) => d.deviceId === activeDeviceId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (deviceId: string) => {
      setActiveMediaDevice(deviceId);
      setIsOpen(false);
    },
    [setActiveMediaDevice],
  );

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-app-border bg-app-soft/50 p-4">
        <div className="flex items-center gap-3 text-app-muted">
          {icon}
          <div>
            <p className="text-sm font-medium text-app-text">{label}</p>
            <p className="text-xs text-app-muted">No devices found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-app-surface p-4 transition-all duration-200",
          isOpen
            ? "border-primary/40 ring-2 ring-primary/10"
            : "border-app-border hover:border-primary/30",
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs font-semibold text-app-muted uppercase tracking-wider">{label}</p>
          <p className="text-sm font-medium text-app-text truncate mt-0.5">
            {activeDevice?.label || "Default"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-app-muted transition-transform shrink-0",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-app-border bg-app-surface shadow-lg custom-scrollbar">
          {devices.map((device) => (
            <button
              key={device.deviceId}
              type="button"
              onClick={() => handleSelect(device.deviceId)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-app-soft",
                device.deviceId === activeDeviceId && "bg-primary/5",
              )}
            >
              <span className="flex-1 truncate text-app-text">
                {device.label || `Device ${device.deviceId.slice(0, 8)}`}
              </span>
              {device.deviceId === activeDeviceId && (
                <Check className="size-4 text-primary shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel Content ──────────────────────────────────

export function MeetingSettings() {
  return (
    <div className="flex h-full flex-col">
      {/* Sub-header */}
      <div className="flex h-12 shrink-0 items-center border-b border-app-border/40 px-4">
        <span className="text-xs font-semibold text-app-muted uppercase tracking-wider">
          Device Settings
        </span>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 custom-scrollbar">
        {/* Microphone */}
        <DeviceSelector
          kind="audioinput"
          icon={<Mic className="size-5" />}
          label="Microphone"
        />

        {/* Camera */}
        <DeviceSelector
          kind="videoinput"
          icon={<Camera className="size-5" />}
          label="Camera"
        />

        {/* Speaker */}
        <DeviceSelector
          kind="audiooutput"
          icon={<Volume2 className="size-5" />}
          label="Speaker"
        />

        {/* Keyboard shortcuts info */}
        <div className="rounded-xl border border-app-border bg-app-soft/30 p-4">
          <h4 className="text-xs font-semibold text-app-muted uppercase tracking-wider mb-3">
            Keyboard Shortcuts
          </h4>
          <div className="space-y-2.5">
            {[
              { key: "M", action: "Toggle microphone" },
              { key: "V", action: "Toggle camera" },
              { key: "Esc", action: "Close panel / Exit fullscreen" },
            ].map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-app-text">{action}</span>
                <kbd className="rounded-md border border-app-border bg-app-surface px-2 py-0.5 text-xs font-mono font-semibold text-app-muted shadow-sm">
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
