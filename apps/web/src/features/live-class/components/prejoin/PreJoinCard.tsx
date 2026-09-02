"use client";

import { PreJoin } from "@livekit/components-react";
import { CalendarClock, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { RoomEnded } from "../states/ErrorStates";
import { ClassStatus } from "../../types/live-class";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

interface PreJoinCardProps {
  status?: ClassStatus;
  topic?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  onJoin: () => void;
}

function formatSchedule(startedAt?: string | null, endsAt?: string | null) {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const day = start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  return endTime ? `${day} · ${startTime}–${endTime}` : `${day} · ${startTime}`;
}

export function PreJoinCard({ status, topic, startedAt, endsAt, onJoin }: PreJoinCardProps) {
  const user = useAuthStore((state) => state.user);
  const displayName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "Student";
  const roleLabel =
    user?.role === "COACH" || isStaffRole(user?.role) ? "Coach" : "Student";
  const schedule = formatSchedule(startedAt, endsAt);

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

            <p className="mt-5 text-xs text-app-muted">
              Check your camera and microphone below, then join.
            </p>
          </div>

          {/* Device preview + join */}
          <div className="custom-prejoin [&_.lk-username-container]:hidden [&_input[type='text']]:hidden">
            <PreJoin
              onSubmit={onJoin}
              onValidate={() => true}
              defaults={{
                audioEnabled: true,
                videoEnabled: true,
                username: displayName,
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
