"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Users,
  Settings,
  LogOut,
  MessageSquareText,
  Hand,
  Maximize,
  Minimize,
  Crown,
  Circle,
  PictureInPicture2,
  Puzzle as PuzzleIcon,
} from "lucide-react";
import {
  useTrackToggle,
  useParticipants,
  useLocalParticipant,
  useIsRecording,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingControlButton } from "./MeetingControlButton";
import { MoreControlsMenu, type MoreControlItem } from "./MoreControlsMenu";
import { useOptionalPip } from "../../providers/PipProvider";
import { LeaveClassControl } from "./LeaveClassControl";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { isHumanParticipant } from "../../lib/participants";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { Z, useReducedMotion } from "../../lib/meetingUi";
import { useParams } from "next/navigation";
import { startRecording, stopRecording, requestScreenShare, endScreenShare } from "../../api/live-class";
import { toast } from "sonner";

export const MeetingToolbar = memo(function MeetingToolbar() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const reducedMotion = useReducedMotion();

  const {
    activeSidebar,
    toggleSidebar,
    handRaised,
    toggleHandRaised,
    isFullscreen,
    toggleFullscreen,
    isChessboardOpen,
    toggleChessboard,
    isRecording: contextRecording,
    setIsRecording,
    settings,
    activePuzzle,
    screenShareRequests,
    upsertScreenShareRequest,
  } = useLiveClassState();

  const lkRecording = useIsRecording();
  const isRecording = lkRecording || contextRecording;
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  // Pre-class settings enforcement (students only; the LiveKit token already
  // withholds the capability — this just makes the button reflect that).
  const micLocked = !isCoach && settings?.student.mic === "FORCED_OFF";
  const cameraLocked = !isCoach && settings?.student.camera === "FORCED_OFF";
  const screenShareLocked =
    !isCoach && !!settings && settings.student.screenShare !== "ALLOWED";

  const { unreadCount } = useLiveClassChat();
  const { localParticipant } = useLocalParticipant();
  const pip = useOptionalPip();

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: { audio: true, selfBrowserSurface: "include" },
    onDeviceError: (error) => {
      const dismissed =
        error.name === "NotAllowedError" &&
        /permission denied by (system|user)/i.test(error.message);
      if (dismissed) return;
      console.error("Screen share failed:", error);
      toast.error(
        error.name === "NotAllowedError"
          ? "Screen sharing is blocked by your browser or OS settings."
          : error.name === "NotSupportedError" || error.name === "DeviceUnsupportedError"
            ? "This browser doesn't support screen sharing."
            : `Couldn't start screen share: ${error.message}`,
      );
    },
  });
  const participants = useParticipants();

  // Screen-share request -> coach approval (Phase 3 of pre-class settings).
  // `screenShareLocked` is the class-wide policy; an APPROVED per-student
  // override widens just this student's token grant server-side, so the
  // button behaves like the normal unlocked one once approved.
  const myScreenShareRequest = !isCoach && user?.id ? screenShareRequests[user.id] : undefined;
  const screenShareStatus = myScreenShareRequest?.status;
  const screenShareApproved = screenShareStatus === "APPROVED";
  const screenShareUnlocked = !screenShareLocked || screenShareApproved;
  const [isRequestingScreenShare, setIsRequestingScreenShare] = useState(false);
  const wasSharingRef = useRef(false);

  // The student's own client is the source of truth for "I stopped sharing" —
  // report it so the coach can see the grant is no longer in use.
  useEffect(() => {
    if (!screenShareApproved) {
      wasSharingRef.current = false;
      return;
    }
    if (wasSharingRef.current && !screen.enabled && roomId) {
      endScreenShare(roomId).catch(() => {
        // Best-effort — the coach can still revoke, or the class-end sweep cleans it up.
      });
    }
    wasSharingRef.current = screen.enabled;
  }, [screen.enabled, screenShareApproved, roomId]);

  const handleRequestScreenShare = async () => {
    if (!roomId || isRequestingScreenShare) return;
    setIsRequestingScreenShare(true);
    try {
      const entry = await requestScreenShare(roomId);
      upsertScreenShareRequest(entry);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request screen sharing");
    } finally {
      setIsRequestingScreenShare(false);
    }
  };

  const extractProps = <T extends { className?: string }>(props: T) => {
    const { className: _cls, ...rest } = props;
    return rest;
  };

  const handleToggleRecording = async () => {
    if (!roomId || isTogglingRecording) return;
    setIsTogglingRecording(true);
    try {
      if (isRecording) {
        await stopRecording(roomId);
        setIsRecording(false);
        toast.success("Recording stopped and saved to backup storage.");
      } else {
        await startRecording(roomId);
        setIsRecording(true);
        toast.success("Recording started successfully.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle recording");
    } finally {
      setIsTogglingRecording(false);
    }
  };

  const handleToggleBoard = () => {
    const opening = !isChessboardOpen;
    toggleChessboard();
    // Students watch this attribute to mirror the board open/close.
    localParticipant?.setAttributes({ isChessboardOpen: opening.toString() }).catch(console.warn);
    if (opening) {
      window.open(`/live-class/${roomId}/board`, `board-${roomId}`);
    } else {
      try {
        const channel = new BroadcastChannel(`live-class-board-${roomId}`);
        channel.postMessage({ type: "CLOSE_BOARD_TAB" });
        channel.close();
      } catch {
        /* BroadcastChannel unsupported — the coach can close the tab manually */
      }
    }
  };

  const participantCount = participants.filter(isHumanParticipant).length;

  const moreItems: MoreControlItem[] = [
    {
      icon: <Hand className={cn("size-5", handRaised && "text-amber-500")} />,
      label: handRaised ? "Lower hand" : "Raise hand",
      onClick: toggleHandRaised,
      active: handRaised,
    },
    {
      icon: <PuzzleIcon className={cn("size-5", activePuzzle && "text-primary")} />,
      label: "Puzzle",
      onClick: () => toggleSidebar("puzzle"),
      active: activeSidebar === "puzzle",
    },
    {
      icon: <Settings className="size-5" />,
      label: "Settings",
      onClick: () => toggleSidebar("settings"),
      active: activeSidebar === "settings",
    },
    {
      icon: isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />,
      label: isFullscreen ? "Exit fullscreen" : "Fullscreen",
      onClick: toggleFullscreen,
    },
  ];

  // Hidden where no Picture-in-Picture mechanism exists at all (Firefox),
  // rather than offering a control that silently does nothing.
  if (pip?.supported) {
    moreItems.push({
      icon: <PictureInPicture2 className={cn("size-5", pip.active && "text-primary")} />,
      label: pip.active ? "Close mini player" : "Mini player",
      onClick: pip.toggle,
      active: pip.active,
    });
  }

  if (isCoach) {
    moreItems.splice(1, 0, {
      icon: (
        <Circle className={cn("size-5", isRecording && "fill-app-danger text-app-danger")} />
      ),
      label: isTogglingRecording
        ? "Updating recording…"
        : isRecording
          ? "Stop recording"
          : "Record class",
      onClick: handleToggleRecording,
      disabled: isTogglingRecording,
    });
  }

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-1.5 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:px-4",
        Z.toolbar,
        // On a phone the sidebar is a full-screen panel with its own controls.
        activeSidebar && "hidden sm:flex",
      )}
      role="toolbar"
      aria-label="Meeting controls"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-2xl border border-app-border bg-app-surface/90 px-2 py-2 shadow-card backdrop-blur-xl sm:gap-1.5 sm:px-3 sm:py-2.5">
        <MeetingControlButton
          icon={mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          label={micLocked ? "Microphone disabled by the coach" : mic.enabled ? "Mute" : "Unmute"}
          shortcut="M"
          variant={mic.enabled ? "default" : "danger"}
          {...extractProps(mic.buttonProps)}
          disabled={micLocked || mic.buttonProps.disabled}
        />

        <MeetingControlButton
          icon={camera.enabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          label={
            cameraLocked ? "Camera disabled by the coach" : camera.enabled ? "Stop video" : "Start video"
          }
          shortcut="V"
          variant={camera.enabled ? "default" : "danger"}
          {...extractProps(camera.buttonProps)}
          disabled={cameraLocked || camera.buttonProps.disabled}
        />

        {/* Screen share — unreliable on mobile browsers, desktop only */}
        <div className="hidden sm:block">
          {screenShareUnlocked ? (
            <MeetingControlButton
              icon={<MonitorUp className="size-5" />}
              label={screen.enabled ? "Stop sharing" : "Share screen"}
              variant={screen.enabled ? "active" : "default"}
              {...extractProps(screen.buttonProps)}
              disabled={screen.buttonProps.disabled}
            />
          ) : (
            <MeetingControlButton
              icon={<MonitorUp className="size-5" />}
              label={
                screenShareStatus === "PENDING"
                  ? "Request sent — waiting for approval"
                  : "Request to share screen"
              }
              variant="default"
              loading={isRequestingScreenShare}
              disabled={screenShareStatus === "PENDING"}
              onClick={handleRequestScreenShare}
            />
          )}
        </div>

        {/* Shared board — coach, large screens (the board page needs a desktop) */}
        {isCoach && (
          <div className="hidden lg:block">
            <MeetingControlButton
              icon={
                <Crown
                  className={cn("size-5", isChessboardOpen && "text-amber-500")}
                />
              }
              label={isChessboardOpen ? "Close board" : "Share board"}
              variant={isChessboardOpen ? "active" : "default"}
              onClick={handleToggleBoard}
            />
          </div>
        )}

        <span className="mx-0.5 hidden h-7 w-px bg-app-border sm:block" aria-hidden="true" />

        <MeetingControlButton
          icon={<MessageSquareText className="size-5" />}
          label={activeSidebar === "chat" ? "Close chat" : "Open chat"}
          badge={unreadCount}
          variant={activeSidebar === "chat" ? "active" : "default"}
          onClick={() => toggleSidebar("chat")}
        />

        <MeetingControlButton
          icon={<Users className="size-5" />}
          label="Participants"
          badge={participantCount}
          variant={activeSidebar === "participants" ? "active" : "default"}
          onClick={() => toggleSidebar("participants")}
        />

        <MoreControlsMenu items={moreItems} />

        <span className="mx-0.5 hidden h-7 w-px bg-app-border sm:block" aria-hidden="true" />

        <LeaveClassControl>
          {(open) => (
            <MeetingControlButton
              icon={<LogOut className="size-5" />}
              label="Leave class"
              variant="danger"
              onClick={open}
            />
          )}
        </LeaveClassControl>
      </div>
    </motion.div>
  );
});
