"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  useLocalParticipant,
  useRoomContext,
  useTrackVolume,
} from "@livekit/components-react";
import { RoomEvent, type LocalAudioTrack } from "livekit-client";
import { AlertTriangle, Camera, Mic, RefreshCw, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { useMediaDeviceList } from "../../hooks/useMediaDeviceList";
import {
  MEDIA_KIND_LABEL,
  describeMediaError,
  deviceDisplayName,
  isAudioOutputSelectionSupported,
  isMediaCaptureAvailable,
  playTestSound,
  saveDevicePref,
  type MediaKind,
} from "../../lib/mediaDevices";
import { useMediaDeviceManager } from "../../providers/MediaDeviceProvider";

function useActiveDeviceId(kind: MediaKind) {
  const room = useRoomContext();
  const [activeId, setActiveId] = useState(() => room.getActiveDevice(kind));

  useEffect(() => {
    setActiveId(room.getActiveDevice(kind));
    const onChange = (changedKind: MediaDeviceKind, deviceId: string) => {
      if (changedKind === kind) setActiveId(deviceId);
    };
    room.on(RoomEvent.ActiveDeviceChanged, onChange);
    return () => {
      room.off(RoomEvent.ActiveDeviceChanged, onChange);
    };
  }, [kind, room]);

  return activeId;
}

/** Live input level of the local microphone, so a student can see it hears them. */
function MicLevelMeter() {
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const track = microphoneTrack?.track as LocalAudioTrack | undefined;
  const volume = useTrackVolume(isMicrophoneEnabled ? track : undefined);

  if (!isMicrophoneEnabled || !track) {
    return <p className="text-[11px] text-app-muted">Unmute to check your input level.</p>;
  }

  const bars = 12;
  const lit = Math.min(bars, Math.round(Math.min(1, volume * 4) * bars));
  return (
    <div className="flex items-center gap-2" aria-label="Microphone input level">
      <span className="text-[11px] text-app-muted">Level</span>
      <div className="flex h-2 flex-1 gap-0.5" aria-hidden="true">
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              i < lit ? "bg-success" : "bg-app-soft",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function IssueNotice({
  children,
  description,
  title,
}: {
  children?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-control border border-app-danger/40 bg-app-danger/10 p-2.5 text-xs text-app-text"
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-app-danger" strokeWidth={2.5} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-semibold">{title}</p>
        <p className="leading-snug text-app-muted">{description}</p>
        {children}
      </div>
    </div>
  );
}

function DeviceSelector({
  icon,
  kind,
  scanSignal,
}: {
  icon: ReactNode;
  kind: MediaKind;
  /** Bumped by the section's "Scan devices" button. */
  scanSignal: number;
}) {
  const label = MEDIA_KIND_LABEL[kind];
  const manager = useMediaDeviceManager();
  const room = useRoomContext();
  const { devices, error, needsPermission, scan, scanned, scanning } = useMediaDeviceList(kind);
  const activeId = useActiveDeviceId(kind);
  const [retrying, setRetrying] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (scanSignal > 0) void scan();
  }, [scan, scanSignal]);

  const outputUnsupported = kind === "audiooutput" && !isAudioOutputSelectionSupported();
  const issue = manager?.issues[kind] ?? (scanned && error ? describeMediaError(error, kind) : null);

  const options = devices.map((device, i) => ({
    label: deviceDisplayName(device, kind, i),
    value: device.deviceId,
  }));
  const hasActive = !!activeId && options.some((o) => o.value === activeId);

  const onSelect = async (deviceId: string) => {
    const device = devices.find((d) => d.deviceId === deviceId);
    if (!device) return;
    if (manager) {
      const ok = await manager.selectDevice(kind, device);
      if (ok) toast.success(`${label}: ${deviceDisplayName(device, kind)}`, { duration: 2000 });
      return;
    }
    await room.switchActiveDevice(kind, device.deviceId, false);
    saveDevicePref(kind, { deviceId: device.deviceId, label: device.label });
  };

  const onRetry = async () => {
    setRetrying(true);
    try {
      await manager?.retry(kind);
      await scan();
    } finally {
      setRetrying(false);
    }
  };

  const onTestSound = async () => {
    setTesting(true);
    try {
      await playTestSound(activeId);
    } catch (e) {
      toast.error("Couldn't play the test sound", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-w-0 space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
        <span className="text-app-muted">{icon}</span>
        {label}
        {devices.length > 0 && (
          <span className="font-normal text-app-muted">· {devices.length} found</span>
        )}
      </label>

      {outputUnsupported ? (
        <p className="rounded-control border border-dashed border-app-border bg-app-soft/50 px-3 py-2 text-xs text-app-muted">
          This browser plays class audio through your system output. Change the speaker in your
          device&apos;s sound settings.
        </p>
      ) : options.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-control border border-dashed border-app-border bg-app-soft/50 px-3 py-2 text-xs text-app-muted">
          <span>{scanning ? `Looking for ${label.toLowerCase()}s…` : `No ${label.toLowerCase()} found`}</span>
          <Button size="sm" variant="ghost" className="min-h-7 px-2 text-xs" isLoading={scanning} onClick={() => void scan()}>
            Scan
          </Button>
        </div>
      ) : (
        <Select
          className="min-h-10 min-w-0 text-sm"
          options={options}
          placeholder={hasActive ? undefined : "System default"}
          value={hasActive ? activeId : ""}
          onChange={(e) => void onSelect(e.target.value)}
          aria-label={`Select ${label.toLowerCase()}`}
        />
      )}

      {options.length > 0 && needsPermission && !issue && (
        <p className="text-[11px] text-app-muted">
          Device names are hidden until you allow access —{" "}
          <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline" onClick={() => void scan()}>
            allow &amp; scan
          </button>
          .
        </p>
      )}

      {kind === "audioinput" && !issue && options.length > 0 && <MicLevelMeter />}

      {kind === "audiooutput" && !outputUnsupported && options.length > 0 && (
        <Button size="sm" variant="outline" className="min-h-8 text-xs" isLoading={testing} onClick={() => void onTestSound()}>
          <Volume2 className="size-3.5" strokeWidth={2.5} />
          Play test sound
        </Button>
      )}

      {issue && (
        <IssueNotice title={issue.title} description={issue.description}>
          <Button size="sm" variant="outline" className="min-h-7 px-2.5 text-xs" isLoading={retrying} onClick={() => void onRetry()}>
            Try again
          </Button>
        </IssueNotice>
      )}
    </div>
  );
}

/** "Your devices" body of the meeting Settings panel. */
export function MeetingDeviceSettings() {
  const [scanSignal, setScanSignal] = useState(0);
  const [scanning, setScanning] = useState(false);

  if (!isMediaCaptureAvailable()) {
    const info = describeMediaError(null);
    return <IssueNotice title={info.title} description={info.description} />;
  }

  const onScanAll = () => {
    setScanning(true);
    setScanSignal((n) => n + 1);
    // The selectors scan in parallel; this only drives the button spinner.
    window.setTimeout(() => setScanning(false), 1200);
  };

  return (
    <div className="space-y-3">
      <DeviceSelector kind="audioinput" icon={<Mic className="size-3.5" />} scanSignal={scanSignal} />
      <DeviceSelector kind="videoinput" icon={<Camera className="size-3.5" />} scanSignal={scanSignal} />
      <DeviceSelector kind="audiooutput" icon={<Volume2 className="size-3.5" />} scanSignal={scanSignal} />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border pt-3">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-app-muted">
          Plugged something in? Scan to list every camera, microphone and speaker. Your choices are
          saved on this device.
        </p>
        <Button size="sm" variant="outline" className="min-h-8 text-xs" isLoading={scanning} onClick={onScanAll}>
          {!scanning && <RefreshCw className="size-3.5" strokeWidth={2.5} />}
          Scan devices
        </Button>
      </div>
    </div>
  );
}
