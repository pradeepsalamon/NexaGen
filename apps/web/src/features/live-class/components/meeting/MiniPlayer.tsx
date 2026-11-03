"use client";

import { createPortal } from "react-dom";
import {
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Hand, Mic, MicOff, Pin, PinOff, Scaling, Undo2, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { usePip } from "../../providers/PipProvider";
import { useSpotlightTrack } from "../../hooks/useSpotlightTrack";
import { ParticipantAvatar } from "./ParticipantAvatar";

// Native `title` throughout: Radix tooltips portal into the main document, not this PiP window.
function MiniPlayerContent() {
  const { close, cycleSize, pinned, togglePinned } = usePip();
  const { pinnedParticipantSid, raisedHands, settings } = useLiveClassState(
    "pinnedParticipantSid",
    "raisedHands",
    "settings",
  );
  const { localParticipant } = useLocalParticipant();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const spotlight = useSpotlightTrack(pinnedParticipantSid);
  const participant = spotlight?.participant;
  const hasVideo = !!spotlight && isTrackReference(spotlight) && !spotlight.publication.isMuted;

  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant
    ? participant.name || (participant.isLocal ? localName : participant.identity)
    : "Waiting for the class…";

  const micOn = !!localParticipant?.isMicrophoneEnabled;
  const cameraOn = !!localParticipant?.isCameraEnabled;
  // Same locks the toolbar honours — the SFU would reject the publish anyway.
  const micLocked = !isCoach && settings?.student.mic === "FORCED_OFF";
  const cameraLocked = !isCoach && settings?.student.camera === "FORCED_OFF";

  const handCount = Object.keys(raisedHands).length;

  const returnToClass = () => {
    close();
    window.focus();
  };

  // 32px controls on the scrim (fixed navy in both themes), 8px radius.
  const scrimButton =
    "flex size-8 items-center justify-center rounded-control text-on-scrim transition-colors hover:bg-on-scrim/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus";

  // Mini player (spec component 26): 320 × 180 by default, video with the Live chip, name and controls on the scrim.
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-scrim text-on-scrim">
      {hasVideo && spotlight ? (
        <VideoTrack
          trackRef={spotlight}
          className={cn(
            "h-full w-full",
            spotlight.source === Track.Source.ScreenShare ? "object-contain" : "object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-brand-900">
          <ParticipantAvatar name={name} size="lg" className="size-14 bg-brand-700 text-base" />
        </div>
      )}

      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-scrim/80 px-2 text-xs font-semibold text-on-scrim">
          <span aria-hidden="true" className="size-2 rounded-full bg-app-danger" />
          Live
        </span>
        {handCount > 0 ? (
          <span
            className="inline-flex h-6 items-center gap-1 rounded-chip bg-warning px-1.5 text-xs font-semibold text-on-warning"
            title={`${handCount} hand${handCount > 1 ? "s" : ""} raised`}
          >
            <Hand aria-hidden="true" className="size-3.5" strokeWidth={2} />
            {handCount}
          </span>
        ) : null}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-scrim/80 px-2 py-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-xs font-semibold">{participant?.isLocal ? "You" : name}</span>
          {participant && !participant.isMicrophoneEnabled ? (
            <MicOff className="size-3.5 shrink-0 text-on-scrim-danger" aria-label="Muted" />
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => localParticipant?.setMicrophoneEnabled(!micOn)}
          disabled={micLocked}
          aria-label={micLocked ? "Microphone turned off by the coach" : micOn ? "Mute microphone" : "Unmute microphone"}
          title={micLocked ? "Microphone turned off by the coach" : micOn ? "Mute" : "Unmute"}
          className={cn(scrimButton, !micOn && "text-on-scrim-danger")}
        >
          {micOn ? <Mic className="size-4" strokeWidth={1.75} /> : <MicOff className="size-4" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={() => localParticipant?.setCameraEnabled(!cameraOn)}
          disabled={cameraLocked}
          aria-label={cameraLocked ? "Camera turned off by the coach" : cameraOn ? "Turn camera off" : "Turn camera on"}
          title={cameraLocked ? "Camera turned off by the coach" : cameraOn ? "Stop video" : "Start video"}
          className={cn(scrimButton, !cameraOn && "text-on-scrim-danger")}
        >
          {cameraOn ? <Video className="size-4" strokeWidth={1.75} /> : <VideoOff className="size-4" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={togglePinned}
          aria-label={pinned ? "Unpin mini player" : "Keep open in class"}
          aria-pressed={pinned}
          title={pinned ? "Unpin: closes when you return to the class" : "Keep open while in the class tab"}
          className={cn(scrimButton, pinned && "bg-on-scrim/20")}
        >
          {pinned ? <PinOff className="size-4" strokeWidth={1.75} /> : <Pin className="size-4" strokeWidth={1.75} />}
        </button>
        <button
          type="button"
          onClick={cycleSize}
          aria-label="Change mini player size"
          title="Change size (or drag the window edges)"
          className={scrimButton}
        >
          <Scaling className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={returnToClass}
          aria-label="Back to class"
          title="Back to class"
          className={scrimButton}
        >
          <Undo2 className="size-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

/**
 * Renders the meeting's mini player into the Document Picture-in-Picture
 * window while one is open. Nothing is mounted otherwise, so the LiveKit
 * subscriptions it holds only exist while the window does.
 *
 * Leaving the class is deliberately absent: its confirmation dialog belongs to
 * the main document, and a one-tap exit in a 360px window is too easy to hit.
 */
export function MiniPlayer() {
  const { pipWindow } = usePip();
  if (!pipWindow) return null;
  return createPortal(<MiniPlayerContent />, pipWindow.document.body);
}
