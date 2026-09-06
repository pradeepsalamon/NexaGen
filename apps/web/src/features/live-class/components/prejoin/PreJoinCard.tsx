"use client";

import { PreJoin } from "@livekit/components-react";
import { CalendarClock, GraduationCap, Info } from "lucide-react";
import { resolveJoinState, type LiveClassSettings } from "@nexa-chess/types";
import { Card, CardContent } from "@/components/ui/Card";
import { RoomEnded } from "../states/ErrorStates";
import { ClassStatus } from "../../types/live-class";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

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
  return lines;
}

export function PreJoinCard({ status, topic, startedAt, endsAt, settings, onJoin }: PreJoinCardProps) {
  const user = useAuthStore((state) => state.user);
  const displayName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Student";
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);
  const roleLabel = isStaff ? "Coach" : "Student";
  const tz = useUserTimeZone();
  const schedule = formatSchedule(tz, startedAt, endsAt);

  const joinState = settings
    ? resolveJoinState(settings, isStaff ? "COACH" : "STUDENT")
    : null;
  const micLocked = joinState?.mic.locked ?? false;
  const cameraLocked = joinState?.camera.locked ?? false;
  const summary = settings && !isStaff ? policySummary(settings) : [];

  if (status === "COMPLETED") {
    return <RoomEnded />;
  }

  return (
    <div className="flex w-full items-center justify-center py-6">
      <Card className="w-full max-w-3xl border-app-border bg-app-surface shadow-soft">
        <CardContent className="grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_1.1fr] md:gap-8">
          {/* Class info */}
          <div className="flex flex-col justify-center">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              You&apos;re about to join
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-app-text sm:text-3xl">
              {topic || "Live Class"}
            </h1>

            <dl className="mt-5 space-y-3 text-sm">
              {schedule && (
                <div className="flex items-center gap-2.5 text-app-muted">
                  <CalendarClock className="size-4 shrink-0 text-app-muted" />
                  <span className="text-app-text">{schedule}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-app-muted">
                <GraduationCap className="size-4 shrink-0 text-app-muted" />
                <span className="text-app-text">
                  Joining as <span className="font-semibold">{displayName}</span>
                </span>
                <span className="rounded-full bg-app-soft px-2 py-0.5 text-[11px] font-semibold text-app-muted">
                  {roleLabel}
                </span>
              </div>
            </dl>

            {summary.length > 0 ? (
              <div className="mt-5 flex gap-2.5 rounded-control border border-app-border bg-app-soft/40 p-3 text-xs text-app-muted">
                <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                <ul className="space-y-1">
                  {summary.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-5 text-xs text-app-muted">
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
              onSubmit={onJoin}
              onValidate={() => true}
              persistUserChoices
              defaults={{
                audioEnabled: joinState ? joinState.mic.defaultOn : true,
                videoEnabled: joinState ? joinState.camera.defaultOn : true,
                username: displayName,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
