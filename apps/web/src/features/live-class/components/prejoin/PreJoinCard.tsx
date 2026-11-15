"use client";

import { useMemo, useState } from "react";
import { PreJoin, type LocalUserChoices } from "@livekit/components-react";
import { CalendarClock, GraduationCap } from "lucide-react";
import { resolveJoinState, type LiveClassSettings } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { RoomEnded } from "../states/ErrorStates";
import { ClassStatus } from "../../types/live-class";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import {
  describeMediaError,
  isMediaCaptureAvailable,
  loadMediaPrefs,
  saveDevicePref,
  saveJoinPrefs,
  scanMediaDevices,
  type MediaErrorInfo,
  type MediaKind,
} from "../../lib/mediaDevices";

interface PreJoinCardProps {
  status?: ClassStatus;
  topic?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  /** Resolved pre-class settings; null for legacy classes with no policy. */
  settings?: LiveClassSettings | null;
  onJoin: () => void;
}

function formatSchedule(
  timeZone: string,
  startedAt?: string | null,
  endsAt?: string | null,
) {
  if (!startedAt) return null;
  const day = formatDate(startedAt, timeZone, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const startTime = formatTime(startedAt, timeZone);
  const endTime = endsAt ? formatTime(endsAt, timeZone) : null;
  return endTime ? `${day} · ${startTime}–${endTime}` : `${day} · ${startTime}`;
}

/** Student-facing plain-language summary of what the coach has locked. */
function policySummary(settings: LiveClassSettings): string[] {
  const lines: string[] = [];
  if (settings.student.mic === "FORCED_OFF") {
    lines.push("Your microphone stays off for this class.");
  } else if (settings.student.mic === "JOIN_MUTED") {
    lines.push("You'll join muted — you can unmute yourself once inside.");
  }
  if (settings.student.camera === "FORCED_OFF") {
    lines.push("Your camera stays off for this class.");
  }
  if (settings.student.screenShare === "DISABLED") {
    lines.push("Screen sharing is turned off.");
  }
  if (settings.student.chat === "DISABLED") {
    lines.push("Chat is disabled for students.");
  }
  if (settings.recording === "AUTO_START") {
    lines.push("This class is recorded automatically.");
  }
  if (settings.waitingRoom === "ENABLED") {
    lines.push("The coach will need to let you in — hang tight after you join.");
  }
  return lines;
}

export function PreJoinCard({ status, topic, startedAt, endsAt, settings, onJoin }: PreJoinCardProps) {
  const user = useAuthStore((state) => state.user);
  const displayName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Student";
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);
  const roleLabel = isStaff ? "Coach" : "Student";
  const tz = useUserTimeZone();
  const schedule = formatSchedule(tz, startedAt, endsAt);

  // Device picks and the last mic / camera toggle are remembered on this
  // browser (lib/mediaDevices.ts) — the same store the in-room Settings panel
  // writes, so a switch made mid-class is what the next pre-join shows.
  const prefs = useMemo(() => loadMediaPrefs(), []);
  const joinState = settings
    ? resolveJoinState(settings, isStaff ? "COACH" : "STUDENT", {
        camera: prefs.cameraOn,
        mic: prefs.micOn,
      })
    : null;
  const [mediaError, setMediaError] = useState<MediaErrorInfo | null>(() =>
    isMediaCaptureAvailable() ? null : describeMediaError(null),
  );
  const [previewKey, setPreviewKey] = useState(0);
  const [checking, setChecking] = useState(false);

  const handleSubmit = (values: LocalUserChoices) => {
    saveJoinPrefs({ cameraOn: values.videoEnabled, micOn: values.audioEnabled });
    // Save the ids now (the room reads them on connect), then add the labels
    // that let a device be found again if its id rotates.
    const picks: Array<[MediaKind, string]> = [
      ["audioinput", values.audioDeviceId],
      ["videoinput", values.videoDeviceId],
    ];
    for (const [kind, deviceId] of picks) {
      if (deviceId && deviceId !== "default") saveDevicePref(kind, { deviceId, label: "" });
    }
    void (async () => {
      for (const [kind, deviceId] of picks) {
        if (!deviceId || deviceId === "default") continue;
        const { devices } = await scanMediaDevices(kind, false);
        const device = devices.find((d) => d.deviceId === deviceId);
        if (device?.label) saveDevicePref(kind, { deviceId, label: device.label });
      }
    })();
    onJoin();
  };

  const handleCheckAgain = async () => {
    setChecking(true);
    const [audio, video] = await Promise.all([
      scanMediaDevices("audioinput", true),
      scanMediaDevices("videoinput", true),
    ]);
    setChecking(false);
    const failure = audio.error ?? video.error;
    setMediaError(failure ? describeMediaError(failure) : null);
    // Remount the preview so it re-acquires the camera / mic with fresh access.
    setPreviewKey((k) => k + 1);
  };
  const micLocked = joinState?.mic.locked ?? false;
  const cameraLocked = joinState?.camera.locked ?? false;
  const summary = settings && !isStaff ? policySummary(settings) : [];

  if (status === "COMPLETED") {
    return <RoomEnded />;
  }

  return (
    <div className="flex w-full items-center justify-center py-6">
      <Card className="w-full max-w-3xl">
        <CardContent className="grid grid-cols-1 gap-6 p-5 sm:p-8 md:grid-cols-[1fr_1.1fr] md:gap-8">
          {/* Class info */}
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium text-app-muted">
              You&apos;re about to join
            </p>
            {/* The top bar holds the page's h1 (the class topic). */}
            <h2 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-app-text">
              {topic || "Live class"}
            </h2>

            <dl className="mt-5 space-y-3 text-sm">
              {schedule && (
                <div className="flex items-center gap-2.5 text-app-muted">
                  <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-app-muted" strokeWidth={2.25} />
                  <span className="text-app-text">{schedule}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-app-muted">
                <GraduationCap aria-hidden="true" className="size-4 shrink-0 text-app-muted" strokeWidth={2.25} />
                <span className="text-app-text">
                  Joining as <span className="font-semibold">{displayName}</span>
                </span>
                <Badge variant="secondary">{roleLabel}</Badge>
              </div>
            </dl>

            {summary.length > 0 ? (
              <Alert className="mt-5" variant="info">
                <ul className="space-y-1">
                  {summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <p className="mt-5 text-sm text-app-muted">
                Check your camera and microphone below, then join.
              </p>
            )}
          </div>

          {/* Device preview + join */}
          <div
            className={cn(
              "custom-prejoin [&_.lk-username-container]:hidden [&_input[type='text']]:hidden",
              // A locked device has no meaningful toggle or picker — hide its
              // button group. First group is the mic, second is the camera.
              micLocked && "[&_.lk-button-group-container>.lk-button-group:nth-child(1)]:hidden",
              cameraLocked && "[&_.lk-button-group-container>.lk-button-group:nth-child(2)]:hidden",
              (micLocked || cameraLocked) &&
                "[&_.lk-button-group-container>.lk-button-group]:!w-full",
            )}
          >
            <PreJoin
              key={previewKey}
              onSubmit={handleSubmit}
              onValidate={() => true}
              onError={(error) => setMediaError(describeMediaError(error))}
              // Persistence is ours (lib/mediaDevices.ts), not LiveKit's: its
              // store would override the class policy's join defaults.
              persistUserChoices={false}
              defaults={{
                audioDeviceId: prefs.audioinput?.deviceId,
                audioEnabled: joinState ? joinState.mic.defaultOn : prefs.micOn ?? true,
                username: displayName,
                videoDeviceId: prefs.videoinput?.deviceId,
                videoEnabled: joinState ? joinState.camera.defaultOn : prefs.cameraOn ?? true,
              }}
            />
            {mediaError && (
              <Alert className="mt-3" role="alert" title={mediaError.title} variant="warning">
                <div className="space-y-2">
                  <p className="leading-snug">{mediaError.description}</p>
                  <p className="leading-snug">
                    You can still join and fix this from Settings inside the class.
                  </p>
                  {isMediaCaptureAvailable() && (
                    <Button
                      isLoading={checking}
                      onClick={() => void handleCheckAgain()}
                      size="sm"
                      variant="neutral"
                    >
                      Scan devices again
                    </Button>
                  )}
                </div>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
