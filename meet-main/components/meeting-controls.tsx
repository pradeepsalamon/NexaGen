"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  MessageSquareText,
  MonitorUp,
  PhoneOff,
  Scan,
  Video,
  VideoOff,
} from "lucide-react";
import { LocalParticipant, Room } from "livekit-client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MeetingControlsProps = {
  isCameraEnabled: boolean;
  isMicrophoneEnabled: boolean;
  isScreenShareEnabled: boolean;
  isPartialShareActive: boolean;
  isChatOpen: boolean;
  localParticipant: LocalParticipant;
  room: Room;
  onOpenPartialShare: () => void;
  onStopPartialShare: () => Promise<void>;
  onToggleChat: () => void;
};

export function MeetingControls({
  isCameraEnabled,
  isMicrophoneEnabled,
  isScreenShareEnabled,
  isPartialShareActive,
  isChatOpen,
  localParticipant,
  room,
  onOpenPartialShare,
  onStopPartialShare,
  onToggleChat,
}: MeetingControlsProps) {
  const router = useRouter();
  const [isLeaving, startTransition] = useTransition();

  async function toggleMicrophone() {
    await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }

  async function toggleCamera() {
    await localParticipant.setCameraEnabled(!isCameraEnabled);
  }

  async function toggleScreenShare() {
    await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
  }

  async function leaveMeeting() {
    room.disconnect();
    startTransition(() => router.push("/"));
  }

  async function handlePartialShare() {
    if (isPartialShareActive) {
      await onStopPartialShare();
      return;
    }

    onOpenPartialShare();
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 rounded-[1.75rem] border border-border/70 bg-card/85 p-3 shadow-xl shadow-black/10 backdrop-blur">
      <ControlButton
        active={isMicrophoneEnabled}
        label={isMicrophoneEnabled ? "Mute" : "Unmute"}
        onClick={toggleMicrophone}
      >
        {isMicrophoneEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
      </ControlButton>

      <ControlButton
        active={isCameraEnabled}
        label={isCameraEnabled ? "Stop camera" : "Start camera"}
        onClick={toggleCamera}
      >
        {isCameraEnabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
      </ControlButton>

      <ControlButton
        active={isScreenShareEnabled}
        label={isScreenShareEnabled ? "Stop sharing" : "Share screen"}
        onClick={toggleScreenShare}
      >
        <MonitorUp className="size-5" />
      </ControlButton>

      <Button
        variant={isPartialShareActive ? "default" : "secondary"}
        className="rounded-2xl px-4"
        onClick={handlePartialShare}
      >
        <Scan className="size-4" />
        {isPartialShareActive ? "Stop Partial Share" : "Partial Share"}
      </Button>

      <Button
        variant={isChatOpen ? "default" : "secondary"}
        className="rounded-2xl px-4"
        onClick={onToggleChat}
      >
        <MessageSquareText className="size-4" />
        {isChatOpen ? "Hide Chat" : "Open Chat"}
      </Button>

      <Button
        variant="destructive"
        size="icon"
        className={cn("size-12 rounded-2xl", isLeaving && "opacity-80")}
        onClick={leaveMeeting}
        disabled={isLeaving}
        aria-label="Leave meeting"
      >
        <PhoneOff className="size-5" />
      </Button>
    </div>
  );
}

type ControlButtonProps = {
  active: boolean;
  label: string;
  onClick: () => Promise<void> | void;
  children: React.ReactNode;
};

function ControlButton({
  active,
  label,
  onClick,
  children,
}: ControlButtonProps) {
  return (
    <Button
      variant={active ? "default" : "secondary"}
      size="icon"
      className="size-12 rounded-2xl"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
