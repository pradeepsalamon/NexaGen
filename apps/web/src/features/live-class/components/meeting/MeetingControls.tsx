"use client";

import { memo } from "react";
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
} from "lucide-react";
import {
  useTrackToggle,
  useDisconnectButton,
  useParticipants,
  useChat,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetingControlButton } from "./MeetingControlButton";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useState, useEffect } from "react";

export const MeetingControls = memo(function MeetingControls() {
  const { activeSidebar, setActiveSidebar } = useLiveClassState();
  
  const { chatMessages } = useChat();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (activeSidebar === "chat") {
      setUnreadCount(0);
    } else if (chatMessages && chatMessages.length > 0) {
      // Only increment if there are actual messages to prevent initial mount trigger
      setUnreadCount((prev) => prev + 1);
    }
  }, [chatMessages, activeSidebar]);

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screen = useTrackToggle({ source: Track.Source.ScreenShare });
  const { buttonProps: leaveProps } = useDisconnectButton({ stopTracks: true });
  const participants = useParticipants();

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
      className="absolute inset-x-0 bottom-6 z-40 flex justify-center px-4 pointer-events-none pb-[env(safe-area-inset-bottom)]"
    >
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-app-border bg-app-surface/90 px-3 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:gap-2 sm:px-4 sm:py-3">
        {/* Media controls */}
        <MeetingControlButton
          icon={
            mic.enabled ? (
              <Mic className="size-5" />
            ) : (
              <MicOff className="size-5" />
            )
          }
          label={mic.enabled ? "Mute" : "Unmute"}
          variant={mic.enabled ? "default" : "danger"}
          {...(() => {
            const { className: _, ...rest } = mic.buttonProps as any;
            return rest;
          })()}
        />

        <MeetingControlButton
          icon={
            camera.enabled ? (
              <Video className="size-5" />
            ) : (
              <VideoOff className="size-5" />
            )
          }
          label={camera.enabled ? "Stop Video" : "Start Video"}
          variant={camera.enabled ? "default" : "danger"}
          {...(() => {
            const { className: _, ...rest } = camera.buttonProps as any;
            return rest;
          })()}
        />

        <MeetingControlButton
          icon={<MonitorUp className="size-5" />}
          label={screen.enabled ? "Stop Share" : "Share"}
          variant={screen.enabled ? "active" : "default"}
          {...(() => {
            const { className: _, ...rest } = screen.buttonProps as any;
            return rest;
          })()}
        />

        <div className="mx-1 h-8 w-px bg-app-border sm:mx-2" />

        {/* Utility controls */}
        <MeetingControlButton
          icon={<Users className="size-5" />}
          label="Participants"
          badge={participants.length}
          variant={activeSidebar === "participants" ? "active" : "default"}
          onClick={() => setActiveSidebar(activeSidebar === "participants" ? null : "participants")}
        />
        <MeetingControlButton
          icon={<MessageSquareText className="size-5" />}
          label={activeSidebar === "chat" ? "Close Chat" : "Open Chat"}
          variant={activeSidebar === "chat" ? "active" : "default"}
          onClick={() => setActiveSidebar(activeSidebar === "chat" ? null : "chat")}
          badge={unreadCount}
        />

        <MeetingControlButton
          icon={<Settings className="size-5" />}
          label="Settings"
        />

        {/* Divider */}
        <div className="mx-0.5 h-7 w-px bg-app-border sm:mx-1" />

        {/* Leave */}
        <MeetingControlButton
          icon={<LogOut className="size-5" />}
          label="Leave Meeting"
          variant="danger"
          {...(() => {
            const { className: _, ...rest } = leaveProps as any;
            return rest;
          })()}
        />
      </div>
    </motion.div>
  );
});
