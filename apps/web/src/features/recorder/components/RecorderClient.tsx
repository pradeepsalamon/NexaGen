"use client";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import {
  ConnectionState,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardSyncMessage, BoardColor } from "@/features/chessboard/types/sync";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

/** The data-channel topic the live class broadcasts board state on. */
const BOARD_SYNC_TOPIC = "board_sync";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Egress watches the headless Chrome console for these exact strings — see the
 * built-in template in the egress binary, which does the same. Recording only
 * begins once START_RECORDING is logged, so it must not fire before the board
 * and the video tiles have actually painted, or the opening seconds are blank.
 */
function signalStart() {
  console.log("START_RECORDING");
}
function signalEnd() {
  console.log("END_RECORDING");
}

/** A participant's role is signed into their LiveKit metadata by the API. */
function isCoach(p: Participant | undefined) {
  if (!p?.metadata) return false;
  try {
    return (JSON.parse(p.metadata) as { role?: string }).role === "COACH";
  } catch {
    return false;
  }
}

type BoardState = {
  fen: string;
  orientation: BoardColor;
  arrows: string[][];
  squares: Record<string, string>;
};

/** Read-only chessground, driven purely by the synced FEN and annotations. */
function RecorderBoard({ state }: { state: BoardState }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  useEffect(() => {
    if (!hostRef.current || apiRef.current) return;
    apiRef.current = Chessground(hostRef.current, {
      fen: state.fen,
      orientation: state.orientation,
      viewOnly: true,
      coordinates: true,
      animation: { enabled: true, duration: 200 },
      drawable: { enabled: false, visible: true },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cg = apiRef.current;
    if (!cg) return;
    cg.set({
      fen: state.fen,
      orientation: state.orientation,
      drawable: {
        autoShapes: [
          ...state.arrows.map(([orig, dest, brush]) => ({
            orig,
            dest,
            brush: brush || "green",
          })),
          ...Object.entries(state.squares).map(([orig, brush]) => ({
            orig,
            brush: brush || "green",
          })),
        ],
      },
    } as Parameters<Api["set"]>[0]);
  }, [state]);

  return <div className="recorder-board" ref={hostRef} />;
}

/** One participant's camera tile; falls back to initials when video is off. */
function VideoTile({
  participant,
  track,
}: {
  participant: Participant;
  track?: RemoteTrack;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  const name = participant.name || participant.identity;
  const initials = name
    .split(/[\s_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="recorder-tile">
      {track ? (
        <video ref={videoRef} autoPlay muted playsInline />
      ) : (
        <div className="recorder-tile-avatar">{initials || "?"}</div>
      )}
      <span className="recorder-tile-name">
        {name}
        {isCoach(participant) ? " (Coach)" : ""}
      </span>
    </div>
  );
}

export function RecorderClient({ classId }: { classId: string }) {
  const [board, setBoard] = useState<BoardState>({
    fen: START_FEN,
    orientation: "white",
    arrows: [],
    squares: {},
  });
  const [tiles, setTiles] = useState<
    { participant: Participant; track?: RemoteTrack }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startedRef = useRef(false);
  /**
   * Room-composite egress records the headless tab's audio output, so every
   * remote mic / screen-share audio track has to actually be *playing* in the
   * page — otherwise the recording is silent. The camera <video> tiles stay
   * muted (they would double up); audio rides these dedicated elements instead.
   */
  const audioSinkRef = useRef<HTMLDivElement>(null);
  const audioElsRef = useRef<Map<string, HTMLMediaElement[]>>(new Map());

  const attachAudio = useCallback((track: RemoteTrack) => {
    const sid = track.sid;
    if (track.kind !== Track.Kind.Audio || !sid || audioElsRef.current.has(sid)) return;
    const el = track.attach();
    el.autoplay = true;
    (el as HTMLAudioElement).muted = false;
    el.setAttribute("data-lk-recorder-audio", "");
    audioSinkRef.current?.appendChild(el);
    audioElsRef.current.set(sid, [el]);
    void (el as HTMLAudioElement).play?.().catch(() => {
      /* egress Chrome autoplays; a failure here must not stop the recording */
    });
  }, []);

  const detachAudio = useCallback((track: RemoteTrack) => {
    const sid = track.sid;
    if (track.kind !== Track.Kind.Audio || !sid) return;
    for (const el of track.detach()) el.remove();
    audioElsRef.current.delete(sid);
  }, []);

  /** Board state only ever comes from the coach or a student holding control. */
  const applyMessage = useCallback((msg: BoardSyncMessage) => {
    switch (msg.type) {
      case "MOVE":
      case "UNDO":
      case "REDO":
      case "RESET":
      case "FORCE_SYNC": {
        const p = msg.payload;
        if (!p?.fen) return;
        setBoard((prev) => ({
          fen: p.fen,
          orientation: p.orientation ?? prev.orientation,
          arrows: Array.isArray(p.arrows) ? p.arrows : prev.arrows,
          squares: p.squares ?? prev.squares,
        }));
        return;
      }
      case "UPDATE_ANNOTATIONS": {
        const p = msg.payload;
        if (!p) return;
        setBoard((prev) => ({
          ...prev,
          arrows: p.arrows ?? [],
          squares: p.squares ?? {},
        }));
        return;
      }
      default:
        // Permissions, clock and UI-state messages don't affect what is filmed.
        return;
    }
  }, []);

  const refreshTiles = useCallback((room: Room) => {
    const next: { participant: Participant; track?: RemoteTrack }[] = [];
    for (const p of room.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.Camera);
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      const chosen = screen?.track ? screen : pub;
      next.push({
        participant: p,
        track: chosen?.isSubscribed && !chosen.isMuted ? (chosen.track as RemoteTrack) : undefined,
      });
    }
    // Coach first — the inset column reads top-down.
    next.sort((a, b) => Number(isCoach(b.participant)) - Number(isCoach(a.participant)));
    setTiles(next);
  }, []);

  useEffect(() => {
    const audioEls = audioElsRef.current;
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    const token = params.get("token");
    if (!url || !token) {
      setError("Missing url or token in query string");
      return;
    }

    const room = new Room({ adaptiveStream: false, dynacast: false });
    roomRef.current = room;

    const onChanged = () => refreshTiles(room);
    const onSubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication) => {
      attachAudio(track);
      onChanged();
    };
    const onUnsubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication) => {
      detachAudio(track);
      onChanged();
    };

    room
      .on(RoomEvent.TrackSubscribed, onSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onUnsubscribed)
      .on(RoomEvent.TrackMuted, onChanged)
      .on(RoomEvent.TrackUnmuted, onChanged)
      .on(RoomEvent.ParticipantConnected, onChanged)
      .on(RoomEvent.ParticipantDisconnected, onChanged)
      .on(RoomEvent.Disconnected, () => signalEnd())
      .on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, _from?: RemoteParticipant, _kind?: unknown, topic?: string) => {
          if (topic !== BOARD_SYNC_TOPIC) return;
          try {
            applyMessage(JSON.parse(new TextDecoder().decode(payload)) as BoardSyncMessage);
          } catch {
            // A malformed packet must never take the recording down.
          }
        },
      );

    let cancelled = false;
    room
      .connect(url, token)
      .then(() => {
        if (cancelled) return;
        // Play any audio tracks that were already subscribed before the
        // listener was wired (autoSubscribe races the `connect()` resolve).
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track && pub.kind === Track.Kind.Audio) attachAudio(pub.track as RemoteTrack);
          }
        }
        refreshTiles(room);
        // Give the first video frames and the board a moment to paint before
        // telling egress to roll, otherwise the recording opens on a blank page.
        window.setTimeout(() => {
          if (!cancelled && !startedRef.current) {
            startedRef.current = true;
            signalStart();
          }
        }, 1500);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to connect");
      });

    return () => {
      cancelled = true;
      for (const els of audioEls.values()) {
        for (const el of els) el.remove();
      }
      audioEls.clear();
      void room.disconnect();
    };
  }, [applyMessage, refreshTiles, attachAudio, detachAudio]);

  const connectionLost = useMemo(
    () => roomRef.current?.state === ConnectionState.Disconnected,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tiles],
  );

  if (error) {
    // Still surface something on camera rather than a white page — a recording
    // of an error is far easier to diagnose than a recording of nothing.
    return <div className="recorder-error">Recorder error: {error}</div>;
  }

  return (
    <div className="recorder-stage" data-class-id={classId} data-lost={connectionLost}>
      <div className="recorder-board-wrap">
        <RecorderBoard state={board} />
      </div>
      <div className="recorder-rail">
        {tiles.map((t) => (
          <VideoTile key={t.participant.identity} participant={t.participant} track={t.track} />
        ))}
      </div>
      {/* Off-screen: carries the live audio egress records from the tab. */}
      <div ref={audioSinkRef} className="recorder-audio-sink" aria-hidden />
    </div>
  );
}
