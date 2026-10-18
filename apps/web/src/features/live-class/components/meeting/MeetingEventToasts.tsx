"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import {
  ConnectionState,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrackPublication,
} from "livekit-client";
import {
  Crown,
  Lock,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  UserMinus,
  UserPlus,
  Video,
  VideoOff,
} from "lucide-react";
import {
  LIVE_CLASS_MODERATION_TOPIC,
  MODERATED_SOURCE_LABEL,
  type ModerationNotice,
} from "@nexa-chess/types";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { ROOM_THREAD, useLiveClassChat } from "../../providers/ChatProvider";
import { isHumanParticipant } from "../../lib/participants";
import { meetingToast, summariseNames } from "../../lib/meetingToasts";

/** How long joins/leaves are pooled before one summary toast is shown. */
const BURST_WINDOW_MS = 1200;

/**
 * The room settles for a moment after `Connected` — LiveKit replays nothing,
 * but a straggler arriving in the same second as you would otherwise read as
 * "someone joined" the instant your own screen appears.
 */
const SETTLE_MS = 1500;

function displayName(participant: Participant) {
  return participant.name || participant.identity.split("_")[0] || "Someone";
}

/**
 * Announces the things that happen around you in a live class: people arriving
 * and leaving, screen and board shares, the coach switching a track off, and
 * chat you would otherwise miss with the panel closed.
 *
 * Bursts are pooled — several students routinely join within the same second at
 * the top of a class, and one toast each buries the screen. Colour is assigned
 * centrally in `lib/meetingToasts.ts` so the same kind of event always looks
 * the same.
 *
 * Must render inside `<LiveKitRoom>`, `<LiveClassProvider>` and `<ChatProvider>`.
 */
export function MeetingEventToasts() {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const { activeSidebar, classroomChatOpen, isChessboardOpen, setActiveSidebar } = useLiveClassState(
    "activeSidebar",
    "classroomChatOpen",
    "isChessboardOpen",
    "setActiveSidebar",
  );
  const { activeThread, chatMessages, setActiveThread } = useLiveClassChat();

  // ── join / leave, pooled ──────────────────────────────────────────
  const joinBuffer = useRef<string[]>([]);
  const leaveBuffer = useRef<string[]>([]);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledAt = useRef<number>(0);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      settledAt.current = Date.now() + SETTLE_MS;
    }
  }, [connectionState]);

  const flushJoins = useCallback(() => {
    joinTimer.current = null;
    const names = joinBuffer.current;
    joinBuffer.current = [];
    if (names.length === 0) return;
    const { title, description } = summariseNames(names, "joined");
    meetingToast({ tone: "success", title, description, icon: <UserPlus className="size-4" /> });
  }, []);

  const flushLeaves = useCallback(() => {
    leaveTimer.current = null;
    const names = leaveBuffer.current;
    leaveBuffer.current = [];
    if (names.length === 0) return;
    const { title, description } = summariseNames(names, "left");
    meetingToast({ tone: "info", title, description, icon: <UserMinus className="size-4" /> });
  }, []);

  useEffect(() => {
    if (!room) return;

    const onJoined = (participant: Participant) => {
      if (!isHumanParticipant(participant)) return;
      if (Date.now() < settledAt.current) return;
      joinBuffer.current.push(displayName(participant));
      if (!joinTimer.current) joinTimer.current = setTimeout(flushJoins, BURST_WINDOW_MS);
    };

    const onLeft = (participant: Participant) => {
      if (!isHumanParticipant(participant)) return;
      leaveBuffer.current.push(displayName(participant));
      if (!leaveTimer.current) leaveTimer.current = setTimeout(flushLeaves, BURST_WINDOW_MS);
    };

    const onTrackPublished = (pub: RemoteTrackPublication, participant: Participant) => {
      if (pub.source !== Track.Source.ScreenShare) return;
      if (!isHumanParticipant(participant)) return;
      meetingToast({
        tone: "info",
        id: `screenshare-${participant.identity}`,
        title: `${displayName(participant)} started sharing their screen`,
        icon: <MonitorUp className="size-4" />,
      });
    };

    const onTrackUnpublished = (pub: RemoteTrackPublication, participant: Participant) => {
      if (pub.source !== Track.Source.ScreenShare) return;
      if (!isHumanParticipant(participant)) return;
      meetingToast({
        tone: "info",
        id: `screenshare-${participant.identity}`,
        title: `${displayName(participant)} stopped sharing their screen`,
        icon: <MonitorOff className="size-4" />,
      });
    };

    room.on(RoomEvent.ParticipantConnected, onJoined);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    room.on(RoomEvent.TrackPublished, onTrackPublished);
    room.on(RoomEvent.TrackUnpublished, onTrackUnpublished);

    return () => {
      room.off(RoomEvent.ParticipantConnected, onJoined);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      room.off(RoomEvent.TrackPublished, onTrackPublished);
      room.off(RoomEvent.TrackUnpublished, onTrackUnpublished);
      if (joinTimer.current) clearTimeout(joinTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      joinTimer.current = null;
      leaveTimer.current = null;
    };
  }, [room, flushJoins, flushLeaves]);

  // ── shared board opened / closed ──────────────────────────────────
  const lastBoardOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastBoardOpen.current === null) {
      lastBoardOpen.current = isChessboardOpen;
      return;
    }
    if (lastBoardOpen.current === isChessboardOpen) return;
    lastBoardOpen.current = isChessboardOpen;

    meetingToast({
      tone: "info",
      id: "shared-board",
      title: isChessboardOpen ? "The chessboard is now shared" : "The shared chessboard closed",
      icon: <Crown className="size-4" />,
    });
  }, [isChessboardOpen]);

  // ── the coach switched someone's track off ────────────────────────
  const onModerationNotice = useCallback(
    (msg: { payload: Uint8Array; from?: Participant }) => {
      // Moderation notices only ever come from the API (no `from`). Students
      // hold canPublishData, so a peer packet on this topic is a forgery.
      if (msg.from) return;
      let notice: ModerationNotice;
      try {
        notice = JSON.parse(new TextDecoder().decode(msg.payload)) as ModerationNotice;
      } catch {
        return;
      }

      // The coach asks you to turn a source back on. Accepting is the student's own click — the browser only
      // starts capture from a user gesture, and nothing is switched on remotely.
      if (notice?.type === "REQUEST_ON") {
        if (notice.identity !== localParticipant?.identity || !localParticipant) return;
        const isMic = notice.source === "microphone";
        const lp = localParticipant;
        meetingToast({
          tone: "info",
          id: `request-on-${notice.source}`,
          title: `${notice.byName} asks you to turn on your ${isMic ? "microphone" : "camera"}`,
          durationMs: 15000,
          icon: isMic ? <Mic className="size-4" /> : <Video className="size-4" />,
          action: {
            label: isMic ? "Unmute" : "Start video",
            onClick: () => {
              // A capture failure is reported by MediaDeviceProvider
              // (RoomEvent.MediaDevicesError), so it needs no toast here.
              const turnOn = isMic ? lp.setMicrophoneEnabled(true) : lp.setCameraEnabled(true);
              void turnOn.catch(() => undefined);
            },
          },
        });
        return;
      }

      if (notice?.type !== "FORCE_MUTE") return;

      const label = MODERATED_SOURCE_LABEL[notice.source];
      // Only the person it happened to needs telling — the coach saw their own
      // click confirmed, and it is nobody else's business.
      if (notice.identity !== localParticipant?.identity) return;

      meetingToast({
        tone: "warning",
        id: `force-mute-${notice.source}`,
        title: `${notice.byName} turned off your ${label}`,
        description: "You can turn it back on unless the class settings lock it off.",
        icon:
          notice.source === "camera" ? (
            <VideoOff className="size-4" />
          ) : notice.source === "screen_share" ? (
            <MonitorOff className="size-4" />
          ) : (
            <MicOff className="size-4" />
          ),
      });
    },
    [localParticipant],
  );

  useDataChannel(LIVE_CLASS_MODERATION_TOPIC, onModerationNotice);

  // ── chat you would otherwise miss ─────────────────────────────────
  // Only fires for messages arriving in a thread that is not on screen, so an
  // open chat panel never double-reports what the user is already reading.
  const seenChatIds = useRef<Set<string>>(new Set());
  const chatVisibleRef = useRef(false);
  chatVisibleRef.current = activeSidebar === "chat" || classroomChatOpen;
  // Anything older than this arrived before we were watching. A seen-set alone
  // is not enough: chat history loads asynchronously (and reloads after a
  // reconnect), so priming on the first render would catch an empty list and
  // then toast the whole backlog the moment it landed.
  const watchingSince = useRef(Date.now());

  useEffect(() => {
    const fresh = chatMessages.filter((m) => !seenChatIds.current.has(m.id));
    fresh.forEach((m) => seenChatIds.current.add(m.id));

    for (const msg of fresh) {
      if (msg.isOwn) continue;
      if (msg.timestamp.getTime() < watchingSince.current) continue;
      const thread = msg.recipientId ? msg.senderId ?? ROOM_THREAD : ROOM_THREAD;
      if (chatVisibleRef.current && thread === activeThread) continue;

      const isPrivate = !!msg.recipientId;
      meetingToast({
        tone: "info",
        id: `chat-${msg.id}`,
        title: isPrivate ? `${msg.senderName} messaged you privately` : msg.senderName,
        description: msg.message.length > 120 ? `${msg.message.slice(0, 120)}…` : msg.message,
        icon: isPrivate ? <Lock className="size-4" /> : <MessageSquareText className="size-4" />,
        action: {
          label: "Open",
          onClick: () => {
            setActiveThread(thread);
            setActiveSidebar("chat");
          },
        },
      });
    }
  }, [chatMessages, activeThread, setActiveSidebar, setActiveThread]);

  return null;
}
