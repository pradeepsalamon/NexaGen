"use client";

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
import { ReadOnlySyncedBoard } from "@/features/chessboard/components/board/ReadOnlySyncedBoard";
import {
  INITIAL_READ_ONLY_BOARD,
  decodeBoardSyncPacket,
  reduceReadOnlyBoard,
  type ReadOnlyBoardState,
} from "@/features/chessboard/lib/readOnlyBoard";
import { HAND_RAISE_TOPIC, decodeHandRaise } from "@/features/live-class/lib/handRaise";
import {
  RECENT_SPEAKER_MS,
  SPEAKING_HOLD_MS,
  compareByActivity,
  createSpeakerTracker,
  trackSpeakers,
} from "@/features/live-class/lib/participantActivity";

/** The data-channel topic the live class broadcasts board state on. */
const BOARD_SYNC_TOPIC = "board_sync";

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
  const [board, setBoard] = useState<ReadOnlyBoardState>(INITIAL_READ_ONLY_BOARD);
  const [tiles, setTiles] = useState<
    { participant: Participant; track?: RemoteTrack }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startedRef = useRef(false);
  /** Who spoke when, and whose hand is up — drives the rail's activity order. */
  const speakersRef = useRef(createSpeakerTracker());
  const handsRef = useRef(new Map<string, number>());
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
    // Screen shares, then the coach, then whoever is active — speaking, hand
    // up, spoke recently, camera on — the same order the live class shows
    // (lib/participantActivity.ts). The rail reads top-down.
    const ctx = {
      lastSpokeAt: speakersRef.current.lastSpokeAt,
      now: Date.now(),
      raisedHandAt: handsRef.current,
    };
    const sharing = (p: Participant) =>
      !!p.getTrackPublication(Track.Source.ScreenShare)?.track;
    next.sort((a, b) => {
      if (sharing(a.participant) !== sharing(b.participant)) return sharing(a.participant) ? -1 : 1;
      if (isCoach(a.participant) !== isCoach(b.participant)) return isCoach(a.participant) ? -1 : 1;
      return compareByActivity(a.participant, b.participant, ctx);
    });
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
    // Re-sort again once a speaking hold / recent-speaker window lapses, so a
    // quiet participant drops back without waiting for the next event.
    const settleTimers: Record<"hold" | "recent", number | undefined> = {
      hold: undefined,
      recent: undefined,
    };
    const onSpeakers = (speakers: Participant[]) => {
      trackSpeakers(speakersRef.current, speakers);
      onChanged();
      window.clearTimeout(settleTimers.hold);
      window.clearTimeout(settleTimers.recent);
      settleTimers.hold = window.setTimeout(onChanged, SPEAKING_HOLD_MS + 50);
      settleTimers.recent = window.setTimeout(onChanged, RECENT_SPEAKER_MS + 50);
    };
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
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        handsRef.current.delete(p.identity);
        onChanged();
      })
      .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      .on(RoomEvent.Disconnected, () => signalEnd())
      .on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, from?: RemoteParticipant, _kind?: unknown, topic?: string) => {
          if (topic === HAND_RAISE_TOPIC) {
            // Identity from the LiveKit envelope, never the payload (handRaise.ts).
            const msg = decodeHandRaise(payload);
            if (!from || msg?.type !== "HAND_RAISE") return;
            if (msg.raised) handsRef.current.set(from.identity, msg.at);
            else handsRef.current.delete(from.identity);
            onChanged();
            return;
          }
          if (topic !== BOARD_SYNC_TOPIC) return;
          // A malformed packet decodes to null and must never take the recording down.
          const msg = decodeBoardSyncPacket(payload);
          if (msg) setBoard((prev) => reduceReadOnlyBoard(prev, msg, from));
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
      window.clearTimeout(settleTimers.hold);
      window.clearTimeout(settleTimers.recent);
      for (const els of audioEls.values()) {
        for (const el of els) el.remove();
      }
      audioEls.clear();
      void room.disconnect();
    };
  }, [refreshTiles, attachAudio, detachAudio]);

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
        {/* No LiveKit-authenticated user exists in egress, so the appearance always
            resolves to the system default — recordings look the same whoever coaches. */}
        <ReadOnlySyncedBoard className="recorder-board" state={board} />
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
