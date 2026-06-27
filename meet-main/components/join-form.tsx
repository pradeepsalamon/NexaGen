"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildMeetingPath, randomRoomName, sanitizeRoomSegment } from "@/lib/meeting";

type JoinFormState = {
  roomName: string;
  userName: string;
  error: string | null;
};

export function JoinForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<JoinFormState>({
    roomName: "",
    userName: "",
    error: null,
  });

  const roomPreview = useMemo(
    () => sanitizeRoomSegment(form.roomName),
    [form.roomName],
  );

  function updateField(field: "roomName" | "userName", value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
      error: null,
    }));
  }

  function joinMeeting() {
    const roomName = sanitizeRoomSegment(form.roomName);
    const userName = form.userName.trim().replace(/\s+/g, " ");

    if (!roomName || !userName) {
      setForm((current) => ({
        ...current,
        error: "Enter both a room name and your display name.",
      }));
      return;
    }

    startTransition(() => {
      router.push(buildMeetingPath(roomName, userName));
    });
  }

  function generateRoom() {
    updateField("roomName", randomRoomName());
  }

  return (
    <section className="rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-2xl shadow-blue-950/10 backdrop-blur xl:p-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">Join a live room</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">
          Start a meeting in under a minute.
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Pick a room name, enter your display name, and jump in. Anyone with
          the same room URL can join the session.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="room-name">
            Room name
          </label>
          <Input
            id="room-name"
            placeholder="team-sync"
            value={form.roomName}
            onChange={(event) => updateField("roomName", event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="user-name">
            Your name
          </label>
          <Input
            id="user-name"
            placeholder="Aarav"
            value={form.userName}
            onChange={(event) => updateField("userName", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                joinMeeting();
              }
            }}
          />
        </div>
      </div>

      <div className="mt-3 min-h-6 text-sm text-muted-foreground">
        {form.error ? (
          <span className="text-destructive">{form.error}</span>
        ) : roomPreview ? (
          <span>
            Room URL preview: <strong className="text-foreground">/meet/{roomPreview}</strong>
          </span>
        ) : (
          <span>Use lowercase letters, numbers, and hyphens for cleaner links.</span>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          className="flex-1"
          onClick={joinMeeting}
          disabled={isPending}
          size="lg"
        >
          {isPending ? "Joining..." : "Join Meeting"}
          <ArrowRight className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="sm:w-auto"
          onClick={generateRoom}
        >
          <Sparkles className="size-4" />
          Random room
        </Button>
      </div>
    </section>
  );
}
