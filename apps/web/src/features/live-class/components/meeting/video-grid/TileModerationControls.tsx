"use client";

import { useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useIsMuted, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Loader2, Mic, MicOff, MonitorOff, Video, VideoOff } from "lucide-react";
import { MODERATED_SOURCE_LABEL, type ModeratableSource } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { moderateParticipant, requestTrackOn } from "../../../api/live-class";
import { meetingToast } from "../../../lib/meetingToasts";
import { useOptionalLiveClassState } from "../../../providers/LiveClassProvider";
import { getRole } from "./videoGrid.utils";

type Participant = TrackReferenceOrPlaceholder["participant"];
type Pending = "microphone" | "camera" | "screen_share" | null;

/**
 * Coach-only quick actions on a student's video tile: mute the mic, stop the
 * camera, stop a screen share — the same server-side force-mute as the People
 * panel (`POST live-class/:id/moderate`, LiveKit `mutePublishedTrack`), so the
 * track goes silent for everyone, not just on the coach's speakers.
 *
 * Turning a source back ON is deliberately a request ("Ask to unmute"): the
 * API never re-opens someone's mic or camera, and a browser only starts
 * capture from its own user's gesture. The student gets a prompt and decides.
 *
 * Renders nothing for anyone but a coach / admin looking at a student.
 */
export function TileModerationControls({
  participant,
  name,
  screenShare = false,
  size = "md",
  className
}: {
  participant: Participant;
  name: string;
  /** The tile shows this participant's screen share rather than their camera. */
  screenShare?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const role = useAuthStore((state) => state.user?.role);
  const isCoach = role === "COACH" || isStaffRole(role);
  if (!isCoach || participant.isLocal || getRole(participant)?.toUpperCase() !== "STUDENT") return null;
  return (
    <Controls participant={participant} name={name} screenShare={screenShare} size={size} className={className} />
  );
}

function Controls({
  participant,
  name,
  screenShare,
  size,
  className
}: {
  participant: Participant;
  name: string;
  screenShare: boolean;
  size: "sm" | "md";
  className?: string;
}) {
  const params = useParams();
  const roomId = params?.roomId as string | undefined;
  // Subscribed per participant, so the icon flips the moment LiveKit reports
  // the mute — no waiting for the grid's own track list to re-render.
  const micOff = useIsMuted({ participant, source: Track.Source.Microphone });
  const cameraOff = useIsMuted({ participant, source: Track.Source.Camera });
  const micLocked = !!useOptionalLiveClassState((s) => s.settings?.student.mic === "FORCED_OFF");
  const cameraLocked = !!useOptionalLiveClassState((s) => s.settings?.student.camera === "FORCED_OFF");
  const [pending, setPending] = useState<Pending>(null);

  if (!roomId) return null;

  const turnOff = async (source: ModeratableSource) => {
    const label = MODERATED_SOURCE_LABEL[source];
    setPending(source);
    try {
      const result = await moderateParticipant(roomId, { identity: participant.identity, source });
      if (!result.muted) meetingToast({ tone: "info", title: `${name}'s ${label} was already off` });
    } catch (error) {
      meetingToast({
        tone: "warning",
        title: `Couldn't turn off ${name}'s ${label}`,
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setPending(null);
    }
  };

  const askOn = async (source: "microphone" | "camera") => {
    setPending(source);
    try {
      const result = await requestTrackOn(roomId, { identity: participant.identity, source });
      meetingToast({
        tone: "info",
        id: `ask-on-${participant.identity}-${source}`,
        title: result.sent
          ? `Asked ${name} to turn on their ${MODERATED_SOURCE_LABEL[source]}`
          : `${name}'s ${MODERATED_SOURCE_LABEL[source]} is already on`,
        description: result.sent ? "They'll see a prompt and can accept it." : undefined
      });
    } catch (error) {
      meetingToast({
        tone: "warning",
        title: `Couldn't ask ${name}`,
        description: error instanceof Error ? error.message : undefined
      });
    } finally {
      setPending(null);
    }
  };

  const icon = size === "sm" ? "size-3" : "size-3.5";
  const spinner = <Loader2 className={cn(icon, "animate-spin")} strokeWidth={2.5} />;

  if (screenShare) {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <TileButton
          size={size}
          label={`Stop ${name}'s screen share`}
          tone="danger"
          disabled={pending !== null}
          onClick={() => void turnOff("screen_share")}
        >
          {pending === "screen_share" ? spinner : <MonitorOff className={icon} strokeWidth={2.5} />}
        </TileButton>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label={`Controls for ${name}`}>
      <TileButton
        size={size}
        label={micOff ? (micLocked ? "Microphones are locked off for this class" : `Ask ${name} to unmute`) : `Mute ${name}`}
        tone={micOff ? "off" : "on"}
        pressed={micOff}
        disabled={pending !== null || (micOff && micLocked)}
        onClick={() => void (micOff ? askOn("microphone") : turnOff("microphone"))}
      >
        {pending === "microphone" ? spinner : micOff ? <MicOff className={icon} strokeWidth={2.5} /> : <Mic className={icon} strokeWidth={2.5} />}
      </TileButton>
      <TileButton
        size={size}
        label={
          cameraOff ? (cameraLocked ? "Cameras are locked off for this class" : `Ask ${name} to start video`) : `Stop ${name}'s video`
        }
        tone={cameraOff ? "off" : "on"}
        pressed={cameraOff}
        disabled={pending !== null || (cameraOff && cameraLocked)}
        onClick={() => void (cameraOff ? askOn("camera") : turnOff("camera"))}
      >
        {pending === "camera" ? spinner : cameraOff ? <VideoOff className={icon} strokeWidth={2.5} /> : <Video className={icon} strokeWidth={2.5} />}
      </TileButton>
    </div>
  );
}

/**
 * A round control: "on" = the source is live (click turns it off, red on hover);
 * "off" = already off (red fill; click asks them to turn it on); "danger" = stop.
 */
function TileButton({
  children,
  label,
  tone,
  pressed,
  disabled,
  size,
  onClick
}: {
  children: ReactNode;
  label: string;
  tone: "on" | "off" | "danger";
  pressed?: boolean;
  disabled?: boolean;
  size: "sm" | "md";
  onClick: () => void;
}) {
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={(e) => {
          // Tiles open the participant full screen on click elsewhere.
          e.stopPropagation();
          onClick();
        }}
        className={cn(
          "pointer-events-auto flex touch-manipulation items-center justify-center rounded-full border border-white/10 shadow-card backdrop-blur-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "size-6" : "size-8",
          tone === "on" && "bg-black/55 text-white hover:bg-app-danger",
          tone === "off" && "bg-app-danger/90 text-white hover:bg-app-danger",
          tone === "danger" && "bg-app-danger/90 text-white hover:bg-app-danger"
        )}
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}
