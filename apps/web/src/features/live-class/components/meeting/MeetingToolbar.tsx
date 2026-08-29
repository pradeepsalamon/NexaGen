"use client";

import { memo, useEffect, useState } from "react";
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
} from "lucide-react";
import {
  useTrackToggle,
  useDisconnectButton,
  useParticipants,
  useLocalParticipant,
  useIsRecording,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingControlButton } from "./MeetingControlButton";
import { RecordingBadge } from "./MeetingStatus";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { useParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { endLiveClass, startRecording, stopRecording } from "../../api/live-class";
import { toast } from "sonner";

export const MeetingToolbar = memo(function MeetingToolbar() {
  const params = useParams();
  const roomId = params?.roomId as string;

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
  } = useLiveClassState();

  const lkRecording = useIsRecording();
  const isRecording = lkRecording || contextRecording;
  const [isTogglingRecording, setIsTogglingRecording] = useState(false);

  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const { unreadCount } = useLiveClassChat();

  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;
    
    // Use attributes instead of metadata so the client has permission to update it
    const currentHandRaised = localParticipant.attributes?.handRaised === "true";
    if (currentHandRaised !== handRaised) {
      localParticipant.setAttributes({ handRaised: handRaised.toString() })
        .catch((err) => {
          console.warn("Failed to update local attributes for hand raise:", err);
        });
    }
  }, [handRaised, localParticipant, localParticipant?.attributes]);


  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });
  const participants = useParticipants();

  // Extract button props without className (we use our own styling)
  const extractProps = <T extends { className?: string }>(props: T) => {
    const { className: _cls, ...rest } = props;
    return rest;
  };

  const handleEndClass = async () => {
    if (!roomId) return;
    try {
      await endLiveClass(roomId);
      toast.success("Class ended successfully");
      // The disconnect webhook will automatically handle redirecting the coach
    } catch (error) {
      toast.error("Failed to end class");
    }
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
    } catch (error: any) {
      toast.error(error.message || "Failed to toggle recording");
    } finally {
      setIsTogglingRecording(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
      className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none pb-[env(safe-area-inset-bottom)]"
      role="toolbar"
      aria-label="Meeting controls"
    >
      <div className="pointer-events-auto flex flex-wrap items-center justify-center max-w-full gap-1.5 rounded-2xl border border-app-border bg-app-surface/90 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:flex-nowrap sm:gap-2 sm:px-4 sm:py-3">
        {/* ── Media controls ────────────────── */}
        <MeetingControlButton
          icon={mic.enabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
          label={mic.enabled ? "Mute (M)" : "Unmute (M)"}
          variant={mic.enabled ? "default" : "danger"}
          {...extractProps(mic.buttonProps)}
        />

        <MeetingControlButton
          icon={camera.enabled ? <Video className="size-5" /> : <VideoOff className="size-5" />}
          label={camera.enabled ? "Stop Video (V)" : "Start Video (V)"}
          variant={camera.enabled ? "default" : "danger"}
          {...extractProps(camera.buttonProps)}
        />

        <MeetingControlButton
          icon={<MonitorUp className="size-5" />}
          label={screen.enabled ? "Stop Share" : "Share Screen"}
          variant={screen.enabled ? "active" : "default"}
          {...extractProps(screen.buttonProps)}
        />

        {/* ── Chessboard share (coach only) ── */}
        {isCoach && (
          <MeetingControlButton
            icon={
              <Crown
                className={cn(
                  "size-5 transition-transform",
                  isChessboardOpen && "text-amber-400 scale-110",
                )}
              />
            }
            label={isChessboardOpen ? "Close Board" : "Share Board"}
            variant={isChessboardOpen ? "active" : "default"}
            onClick={() => {
              const newState = !isChessboardOpen;
              toggleChessboard();
              // Students watch this attribute to mirror the board open/close
              // (MeetingLayout). The coach edits it in-meeting via
              // LiveChessboardPanel; a dedicated window is opt-in from there.
              localParticipant?.setAttributes({ isChessboardOpen: newState.toString() }).catch(console.warn);
            }}
          />
        )}

        {/* ── Record (coach only) ── */}
        {isCoach && (
          <MeetingControlButton
            icon={
              <Circle
                className={cn(
                  "size-5 transition-transform",
                  isRecording && "fill-red-500 text-red-500 scale-110 animate-pulse",
                )}
              />
            }
            label={
              isTogglingRecording
                ? "Updating recording..."
                : isRecording
                ? "Stop Recording"
                : "Record Class"
            }
            variant={isRecording ? "active" : "default"}
            onClick={handleToggleRecording}
            disabled={isTogglingRecording}
          />
        )}

        {/* Divider */}
        <div className="mx-1 h-8 w-px bg-app-border sm:mx-2" aria-hidden="true" />

        {/* ── Utility controls ──────────────── */}
        <MeetingControlButton
          icon={<Users className="size-5" />}
          label="Participants"
          badge={participants.filter(p => !p.identity.endsWith('_board')).length}
          variant={activeSidebar === "participants" ? "active" : "default"}
          onClick={() => toggleSidebar("participants")}
        />

        <MeetingControlButton
          icon={<MessageSquareText className="size-5" />}
          label={activeSidebar === "chat" ? "Close Chat" : "Open Chat"}
          variant={activeSidebar === "chat" ? "active" : "default"}
          onClick={() => toggleSidebar("chat")}
          badge={unreadCount}
        />

        <MeetingControlButton
          icon={
            <Hand
              className={cn(
                "size-5 transition-transform",
                handRaised && "text-amber-400 scale-110",
              )}
            />
          }
          label={handRaised ? "Lower Hand" : "Raise Hand"}
          variant={handRaised ? "active" : "default"}
          onClick={toggleHandRaised}
        />

        <MeetingControlButton
          icon={<Settings className="size-5" />}
          label="Settings"
          variant={activeSidebar === "settings" ? "active" : "default"}
          onClick={() => toggleSidebar("settings")}
        />

        {/* Fullscreen — hidden on mobile */}
        <div className="hidden sm:block">
          <MeetingControlButton
            icon={
              isFullscreen ? (
                <Minimize className="size-5" />
              ) : (
                <Maximize className="size-5" />
              )
            }
            label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          />
        </div>

        {/* Divider */}
        <div className="mx-0.5 h-7 w-px bg-app-border sm:mx-1" aria-hidden="true" />

        {/* Recording indicator (visible when recording) */}
        <RecordingBadge className="hidden sm:flex" />

        {/* ── Leave ─────────────────────────── */}
        {isCoach ? (
          <Dialog>
            <DialogTrigger asChild>
              <MeetingControlButton
                icon={<LogOut className="size-5" />}
                label="Leave Meeting"
                variant="danger"
              />
            </DialogTrigger>
            <DialogContent className="sm:max-w-md" hideCloseButton>
              <DialogHeader>
                <DialogTitle>Leave Meeting?</DialogTitle>
                <DialogDescription>
                  Are you leaving the room temporarily, or would you like to end the class for everyone?
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 py-4">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    className="justify-start gap-3 h-auto py-3 px-4 text-left"
                    onClick={(e) => leaveProps.onClick?.(e as any)}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-app-text">Leave Quietly</span>
                      <span className="text-sm text-app-muted font-normal">The room will stay open for students.</span>
                    </div>
                  </Button>
                </DialogClose>
                
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    className="justify-start gap-3 h-auto py-3 px-4 text-left"
                    onClick={handleEndClass}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-white">End class for everyone</span>
                      <span className="text-sm text-white/80 font-normal">Finalizes attendance immediately.</span>
                    </div>
                  </Button>
                </DialogClose>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <MeetingControlButton
            icon={<LogOut className="size-5" />}
            label="Leave Meeting"
            variant="danger"
            {...extractProps(leaveProps)}
          />
        )}
      </div>
    </motion.div>
  );
});
