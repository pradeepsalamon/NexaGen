"use client";

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
} from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveBoardState } from "@nexa-chess/types";
import {
  decodeBoardSyncPacket,
  readOnlyBoardFromSnapshot,
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

const BOARD_SYNC_TOPIC = "board_sync";

export type SpectatorTile = {
  participant: Participant;
  /** Screen share when they are sharing, else their camera; undefined when off. */
  track?: RemoteTrack;
  isScreenShare: boolean;
  isCoach: boolean;
  handRaised: boolean;
  micOn: boolean;
};

export type SpectatorConnection = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";

/** A participant's role is signed into their LiveKit metadata by the API. */
export function participantRole(p: Participant | undefined): string | undefined {
  if (!p?.metadata) return undefined;
  try {
    return (JSON.parse(p.metadata) as { role?: string }).role;
  } catch {
    return undefined;
  }
}


/**
 * A hidden, receive-only seat in a live class (admin spectator). Mirrors the
 * recorder template: it subscribes to every track, plays the room's audio,
 * and rebuilds the shared board from `board_sync` packets — it never
 * publishes anything (the token grants no publish or data rights).
 */
export function useSpectatorRoom(options: {
  serverUrl: string | undefined;
  token: string | undefined;
  boardSnapshot: LiveBoardState | null;
  /** Bump to tear down and reconnect with the same token. */
  connectKey: number;
}) {
  const { serverUrl, token, boardSnapshot, connectKey } = options;
  const [board, setBoard] = useState<ReadOnlyBoardState>(() => readOnlyBoardFromSnapshot(boardSnapshot));
  const [tiles, setTiles] = useState<SpectatorTile[]>([]);
  const [connection, setConnection] = useState<SpectatorConnection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const speakersRef = useRef(createSpeakerTracker());
  const handsRef = useRef(new Map<string, number>());
  const audioSinkRef = useRef<HTMLDivElement>(null);
  const audioElsRef = useRef(new Map<string, HTMLMediaElement>());
  const audioMutedRef = useRef(false);
  /** Once a live packet arrives the saved snapshot is stale — never re-apply it. */
  const liveBoardSeenRef = useRef(false);

  const snapshotRef = useRef(boardSnapshot);
  snapshotRef.current = boardSnapshot;

  useEffect(() => {
    if (!liveBoardSeenRef.current) setBoard(readOnlyBoardFromSnapshot(boardSnapshot));
  }, [boardSnapshot]);

  const attachAudio = useCallback((track: RemoteTrack) => {
    const sid = track.sid;
    if (track.kind !== Track.Kind.Audio || !sid || audioElsRef.current.has(sid)) return;
    const el = track.attach();
    el.autoplay = true;
    el.muted = audioMutedRef.current;
    el.setAttribute("playsinline", "");
    audioSinkRef.current?.appendChild(el);
    audioElsRef.current.set(sid, el);
  }, []);

  const detachAudio = useCallback((track: RemoteTrack) => {
    const sid = track.sid;
    if (track.kind !== Track.Kind.Audio || !sid) return;
    for (const el of track.detach()) el.remove();
    audioElsRef.current.delete(sid);
  }, []);

  const refreshTiles = useCallback((room: Room) => {
    const next: SpectatorTile[] = [];
    for (const p of room.remoteParticipants.values()) {
      // The coach's pop-out board window is a second connection, not a person.
      if (p.identity.endsWith("_board")) continue;
      const camera = p.getTrackPublication(Track.Source.Camera);
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      const sharing = !!screen?.track && !screen.isMuted;
      const chosen = sharing ? screen : camera;
      const mic = p.getTrackPublication(Track.Source.Microphone);
      next.push({
        participant: p,
        track: chosen?.isSubscribed && !chosen.isMuted ? (chosen.track as RemoteTrack) : undefined,
        isScreenShare: sharing,
        isCoach: participantRole(p) === "COACH",
        handRaised: handsRef.current.has(p.identity),
        micOn: !!mic && !mic.isMuted,
      });
    }
    const ctx = {
      lastSpokeAt: speakersRef.current.lastSpokeAt,
      now: Date.now(),
      raisedHandAt: handsRef.current,
    };
    next.sort((a, b) => {
      if (a.isScreenShare !== b.isScreenShare) return a.isScreenShare ? -1 : 1;
      if (a.isCoach !== b.isCoach) return a.isCoach ? -1 : 1;
      return compareByActivity(a.participant, b.participant, ctx);
    });
    setTiles(next);
  }, []);

  useEffect(() => {
    if (!serverUrl || !token) return;
    // A (re)connection starts from the latest saved snapshot until a live packet lands.
    liveBoardSeenRef.current = false;
    setBoard(readOnlyBoardFromSnapshot(snapshotRef.current));
    const audioEls = audioElsRef.current;
    const hands = handsRef.current;
    const room = new Room({ adaptiveStream: true, dynacast: false });
    roomRef.current = room;
    setConnection("connecting");
    setError(null);

    const onChanged = () => refreshTiles(room);
    const settle: Record<"hold" | "recent", number | undefined> = { hold: undefined, recent: undefined };
    const onSpeakers = (speakers: Participant[]) => {
      trackSpeakers(speakersRef.current, speakers);
      onChanged();
      window.clearTimeout(settle.hold);
      window.clearTimeout(settle.recent);
      settle.hold = window.setTimeout(onChanged, SPEAKING_HOLD_MS + 50);
      settle.recent = window.setTimeout(onChanged, RECENT_SPEAKER_MS + 50);
    };

    room
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        attachAudio(track);
        onChanged();
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        detachAudio(track);
        onChanged();
      })
      .on(RoomEvent.TrackMuted, onChanged)
      .on(RoomEvent.TrackUnmuted, onChanged)
      .on(RoomEvent.TrackPublished, onChanged)
      .on(RoomEvent.TrackUnpublished, onChanged)
      .on(RoomEvent.ParticipantConnected, onChanged)
      .on(RoomEvent.ParticipantMetadataChanged, onChanged)
      .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        handsRef.current.delete(p.identity);
        onChanged();
      })
      .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (state === ConnectionState.Connected) setConnection("connected");
        else if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting)
          setConnection("reconnecting");
        else if (state === ConnectionState.Disconnected) setConnection("disconnected");
      })
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
          const msg = decodeBoardSyncPacket(payload);
          if (!msg) return;
          liveBoardSeenRef.current = true;
          setBoard((prev) => reduceReadOnlyBoard(prev, msg, from));
        },
      );

    let cancelled = false;
    room
      .connect(serverUrl, token, { autoSubscribe: true })
      .then(() => {
        if (cancelled) return;
        setConnection("connected");
        for (const p of room.remoteParticipants.values()) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track && pub.kind === Track.Kind.Audio) attachAudio(pub.track as RemoteTrack);
          }
        }
        setAudioBlocked(!room.canPlaybackAudio);
        refreshTiles(room);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setConnection("failed");
        setError(e instanceof Error ? e.message : "Could not connect to the class.");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(settle.hold);
      window.clearTimeout(settle.recent);
      for (const el of audioEls.values()) el.remove();
      audioEls.clear();
      hands.clear();
      roomRef.current = null;
      // Detach first: the old room's disconnect events must not update the next connection's state.
      room.removeAllListeners();
      void room.disconnect();
    };
  }, [serverUrl, token, connectKey, refreshTiles, attachAudio, detachAudio]);

  const enableAudio = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.startAudio();
    } finally {
      setAudioBlocked(!room.canPlaybackAudio);
    }
  }, []);

  const toggleAudioMuted = useCallback(() => {
    setAudioMuted((prev) => {
      const next = !prev;
      audioMutedRef.current = next;
      for (const el of audioElsRef.current.values()) el.muted = next;
      return next;
    });
  }, []);

  const leave = useCallback(() => {
    void roomRef.current?.disconnect();
  }, []);

  return {
    audioBlocked,
    audioMuted,
    audioSinkRef,
    board,
    connection,
    enableAudio,
    error,
    leave,
    tiles,
    toggleAudioMuted,
  };
}
