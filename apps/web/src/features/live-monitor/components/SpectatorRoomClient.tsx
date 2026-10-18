"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Circle, Eye, Hand, LogOut, MessageSquare, MicOff, MonitorUp, RefreshCw, Volume2, VolumeX } from "lucide-react";
import type { RemoteTrack } from "livekit-client";
import { getWebEnv } from "@nexa-chess/config/web";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { ReadOnlySyncedBoard } from "@/features/chessboard/components/board/ReadOnlySyncedBoard";
import { getChatHistory } from "@/features/live-class/api/live-class";
import { getTabClientId } from "@/features/live-class/lib/joinedSession";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { getErrorMessage } from "@/lib/errors";
import { spectateLiveClass } from "../api/liveMonitorApi";
import { participantRole, useSpectatorRoom, type SpectatorTile } from "../hooks/useSpectatorRoom";
import { formatElapsed, useNow } from "./LiveClassesMonitorClient";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL
});

function initialsOf(name: string) {
  return (
    name
      .split(/[\s_]+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function VideoTile({ tile, large = false }: { tile: SpectatorTile; large?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const track: RemoteTrack | undefined = tile.track;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  const name = tile.participant.name || tile.participant.identity;
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-control bg-app-soft ${
        tile.participant.isSpeaking ? "ring-2 ring-accent" : ""
      }`}
    >
      {track ? (
        <video
          autoPlay
          className={`size-full ${tile.isScreenShare ? "object-contain bg-black" : "object-cover"}`}
          muted
          playsInline
          ref={videoRef}
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <span className={`font-semibold text-app-muted ${large ? "text-4xl" : "text-2xl"}`}>{initialsOf(name)}</span>
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
        <span className="flex min-w-0 items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
          {tile.isScreenShare ? <MonitorUp aria-hidden className="size-3 shrink-0" /> : null}
          {!tile.micOn ? <MicOff aria-hidden className="size-3 shrink-0" /> : null}
          <span className="truncate">
            {name}
            {tile.isCoach ? " (Coach)" : ""}
          </span>
        </span>
        {tile.handRaised ? (
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            <Hand aria-hidden className="size-3" />
            <span className="sr-only">Hand raised</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RoomChat({ classId, enabled }: { classId: string; enabled: boolean }) {
  const tz = useUserTimeZone();
  const { data } = useQuery({
    queryKey: queryKeys.liveMonitor.chat(classId),
    queryFn: () => getChatHistory(classId),
    enabled,
    refetchInterval: 5_000
  });
  // Room chat only: private student ↔ coach threads are never sent to anyone else.
  const messages = useMemo(() => (data ?? []).filter((m) => !m.recipientId), [data]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <Card className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-app-border px-4 py-3">
        <MessageSquare aria-hidden className="size-4 text-app-muted" />
        <h2 className="text-sm font-bold text-app-text">Room chat</h2>
        <span className="ml-auto text-xs text-app-muted">Read only</span>
      </div>
      <div className="max-h-72 min-h-32 flex-1 space-y-3 overflow-y-auto px-4 py-3" ref={listRef}>
        {messages.length === 0 ? (
          <p className="text-sm text-app-muted">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div className="text-sm" key={m.id}>
              <div className="flex items-baseline gap-2">
                <span className="truncate font-semibold text-app-text">{m.senderName}</span>
                {m.senderRole === "COACH" ? (
                  <span className="text-xs font-semibold text-primary-ink">Coach</span>
                ) : null}
                <span className="ml-auto shrink-0 text-xs text-app-muted">{formatTime(m.createdAt, tz)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-app-text">{m.message}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export function SpectatorRoomClient({ classId }: { classId: string }) {
  const router = useRouter();
  const tz = useUserTimeZone();
  const now = useNow();
  const [connectKey, setConnectKey] = useState(0);
  const [left, setLeft] = useState(false);

  const seat = useQuery({
    queryKey: queryKeys.liveMonitor.spectate(classId),
    queryFn: () => spectateLiveClass(classId, { clientId: getTabClientId() }),
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity
  });

  const room = useSpectatorRoom({
    serverUrl: env.NEXT_PUBLIC_LIVEKIT_URL,
    token: left ? undefined : seat.data?.token,
    boardSnapshot: seat.data?.boardState ?? null,
    connectKey
  });

  const info = seat.data?.class;
  const studentsInRoom = useMemo(
    () => room.tiles.filter((t) => participantRole(t.participant) === "STUDENT").length,
    [room.tiles]
  );
  const [main, ...rest] = room.tiles;

  // A new seat token reconnects by itself; only an unchanged one needs a nudge
  // (bumping both would connect twice).
  const rejoin = async () => {
    const previous = seat.data?.token;
    const refreshed = await seat.refetch();
    if (refreshed.data?.token === previous) setConnectKey((k) => k + 1);
  };

  const leave = () => {
    room.leave();
    setLeft(true);
    router.push("/admin/live-classes");
  };

  if (seat.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-app" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="aspect-square w-full max-w-[calc(100dvh-12rem)] rounded-app" />
          <Skeleton className="h-64 rounded-app" />
        </div>
      </div>
    );
  }

  if (seat.error || !info) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10">
        <Alert title="Can't watch this class" variant="error">
          {seat.error ? getErrorMessage(seat.error) : "This class is not live any more."}
        </Alert>
        <Button asChild variant="outline">
          <Link href="/admin/live-classes">
            <ArrowLeft aria-hidden className="size-4" />
            Back to Live Now
          </Link>
        </Button>
      </div>
    );
  }

  const ended = room.connection === "disconnected" || room.connection === "failed";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <SimpleTooltip label="Back to Live Now">
            <Button aria-label="Back to Live Now" asChild size="icon" variant="ghost">
              <Link href="/admin/live-classes">
                <ArrowLeft aria-hidden className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          </SimpleTooltip>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-extrabold leading-tight tracking-tight text-app-text">{info.title}</h1>
              <Badge variant="destructive">
                <Circle aria-hidden className="size-2 fill-current motion-safe:animate-pulse" />
                LIVE
              </Badge>
              {info.isRecording ? <Badge variant="warning">Recording</Badge> : null}
            </div>
            <p className="mt-0.5 truncate text-sm text-app-muted">
              {info.coachName}
              {info.batchName ? ` · ${info.batchName}` : info.isDemo ? " · Demo class" : ""}
              {` · ${formatElapsed(info.startedAt, now)} in · ends ${formatTime(info.endsAt, tz)}`}
              {room.connection === "connected"
                ? ` · ${studentsInRoom} ${studentsInRoom === 1 ? "student" : "students"} in room`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">
            <Eye aria-hidden className="size-3.5" />
            Watching silently
          </Badge>
          <SimpleTooltip label={room.audioMuted ? "Unmute class audio" : "Mute class audio"}>
            <Button
              aria-label={room.audioMuted ? "Unmute class audio" : "Mute class audio"}
              aria-pressed={room.audioMuted}
              onClick={room.toggleAudioMuted}
              size="icon"
              variant="outline"
            >
              {room.audioMuted ? (
                <VolumeX aria-hidden className="size-4" strokeWidth={2.5} />
              ) : (
                <Volume2 aria-hidden className="size-4" strokeWidth={2.5} />
              )}
            </Button>
          </SimpleTooltip>
          <Button onClick={leave} variant="destructive">
            <LogOut aria-hidden className="size-4" />
            Leave
          </Button>
        </div>
      </div>

      {room.audioBlocked && !ended ? (
        <Alert
          action={
            <Button onClick={() => void room.enableAudio()} size="sm" variant="outline">
              Turn on sound
            </Button>
          }
          variant="info"
        >
          Your browser paused the class audio until you interact with the page.
        </Alert>
      ) : null}

      {room.connection === "reconnecting" ? (
        <Alert variant="warning">Connection dropped — reconnecting…</Alert>
      ) : null}

      {ended ? (
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <div>
            <h2 className="text-lg font-bold text-app-text">You&apos;re no longer watching</h2>
            <p className="mt-1 text-sm text-app-muted">
              {room.error ?? "The class may have ended, or the connection was lost."}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void rejoin()} variant="primary">
              <RefreshCw aria-hidden className="size-4" />
              Watch again
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/live-classes">Back to Live Now</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 justify-center">
            <div className="relative aspect-square w-full max-w-[calc(100dvh-12rem)]">
              <ReadOnlySyncedBoard className="size-full [&_.cg-wrap]:size-full" state={room.board} />
              {room.connection === "connecting" ? (
                <div className="absolute inset-0 flex items-center justify-center rounded-control bg-black/40">
                  <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">Connecting…</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {main ? (
              <div className="space-y-2">
                <VideoTile large tile={main} />
                {rest.length > 0 ? (
                  <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto">
                    {rest.map((tile) => (
                      <VideoTile key={tile.participant.identity} tile={tile} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : room.connection === "connected" ? (
              <Card className="p-5 text-sm text-app-muted">Nobody else is in the room right now.</Card>
            ) : (
              <Skeleton className="aspect-video w-full rounded-control" />
            )}
            <RoomChat classId={classId} enabled={room.connection === "connected"} />
          </div>
        </div>
      )}

      {/* Off-screen: the room's audio plays through these elements. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] bottom-0 size-px overflow-hidden" ref={room.audioSinkRef} />
    </div>
  );
}
