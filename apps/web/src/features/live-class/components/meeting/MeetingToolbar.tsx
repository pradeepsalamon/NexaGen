"use client";

import { memo, useEffect } from "react";
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
} from "lucide-react";
import {
  useTrackToggle,
  useDisconnectButton,
  useParticipants,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingControlButton } from "./MeetingControlButton";
import { RecordingBadge } from "./MeetingStatus";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../providers/ChatProvider";

export const MeetingToolbar = memo(function MeetingToolbar() {
  const {
    activeSidebar,
    toggleSidebar,
    handRaised,
    toggleHandRaised,
    isFullscreen,
    toggleFullscreen,
    isChessboardOpen,
    toggleChessboard,
  } = useLiveClassState();

  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  const { unreadCount } = useLiveClassChat();

  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;
    
    let currentMeta: any = {};
    try {
      currentMeta = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};
    } catch (e) {
      // Ignore parse errors
    }

    if (currentMeta.handRaised !== handRaised) {
      localParticipant.setMetadata(JSON.stringify({ ...currentMeta, handRaised }))
        .catch((err) => {
          console.warn("Failed to update local metadata for hand raise:", err);
        });
    }
  }, [handRaised, localParticipant, localParticipant?.metadata]);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
      className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none pb-[env(safe-area-inset-bottom)]"
      role="toolbar"
      aria-label="Meeting controls"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-app-border bg-app-surface/90 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:gap-2 sm:px-4 sm:py-3">
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
            onClick={toggleChessboard}
          />
        )}

        {/* Divider */}
        <div className="mx-1 h-8 w-px bg-app-border sm:mx-2" aria-hidden="true" />

        {/* ── Utility controls ──────────────── */}
        <MeetingControlButton
          icon={<Users className="size-5" />}
          label="Participants"
          badge={participants.length}
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
        <MeetingControlButton
          icon={<LogOut className="size-5" />}
          label="Leave Meeting"
          variant="danger"
          {...extractProps(leaveProps)}
        />
      </div>
    </motion.div>
  );
});
