"use client";

import { createPortal } from "react-dom";
import {
  VideoTrack,
  isTrackReference,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { Hand, Mic, MicOff, Undo2, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { usePip } from "../../providers/PipProvider";
import { useSpotlightTrack } from "../../hooks/useSpotlightTrack";
import { ParticipantAvatar } from "./ParticipantAvatar";

function MiniPlayerContent() {
  const { close } = usePip();
  const { pinnedParticipantSid, raisedHands, settings } = useLiveClassState();
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

  const pillButton =
    "flex size-8 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex h-screen w-screen flex-col bg-app-background text-app-text">
      <div className="relative flex-1 overflow-hidden bg-black">
        {hasVideo && spotlight ? (
          <VideoTrack
            trackRef={spotlight}
            className={cn(
              "h-full w-full",
              spotlight.source === Track.Source.ScreenShare ? "object-contain" : "object-cover",
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-app-soft">
            <ParticipantAvatar name={name} size="lg" className="size-12 text-sm" />
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1.5 rounded-full bg-black/65 px-2 py-1 backdrop-blur-md">
          <span className="truncate text-[11px] font-semibold text-white/90">
            {participant?.isLocal ? "You" : name}
          </span>
          {participant && !participant.isMicrophoneEnabled && (
            <MicOff className="size-3 shrink-0 text-red-400" aria-label="Muted" />
          )}
        </div>

        {handCount > 0 && (
          <div
            className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-amber-500 px-1.5 py-1 text-[11px] font-bold text-white shadow-card"
            title={`${handCount} hand${handCount > 1 ? "s" : ""} raised`}
          >
            <Hand className="size-3" />
            {handCount}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-app-border bg-app-surface px-2 py-1.5">
        <button
          type="button"
          onClick={() => localParticipant?.setMicrophoneEnabled(!micOn)}
          disabled={micLocked}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          title={micLocked ? "Microphone disabled by the coach" : micOn ? "Mute" : "Unmute"}
          className={cn(
            pillButton,
            micOn
              ? "border-app-border bg-app-surface text-app-text hover:bg-app-soft"
              : "border-app-danger/40 bg-app-danger/10 text-app-danger hover:bg-app-danger/20",
          )}
        >
          {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </button>

        <button
          type="button"
          onClick={() => localParticipant?.setCameraEnabled(!cameraOn)}
          disabled={cameraLocked}
          aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
          title={cameraLocked ? "Camera disabled by the coach" : cameraOn ? "Stop video" : "Start video"}
          className={cn(
            pillButton,
            cameraOn
              ? "border-app-border bg-app-surface text-app-text hover:bg-app-soft"
              : "border-app-danger/40 bg-app-danger/10 text-app-danger hover:bg-app-danger/20",
          )}
        >
          {cameraOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
        </button>

        <button
          type="button"
          onClick={returnToClass}
          aria-label="Back to class"
          title="Back to class"
          className="flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 text-[11px] font-bold text-primary-ink transition-colors hover:bg-primary hover:text-white"
        >
          <Undo2 className="size-3.5" strokeWidth={2.5} />
          Back
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
