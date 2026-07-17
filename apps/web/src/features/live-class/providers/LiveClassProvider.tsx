"use client";

import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SidebarTab = "chat" | "participants" | "settings" | "notes" | null;

interface LiveClassContextValue {
  /** Which sidebar panel is currently open */
  activeSidebar: SidebarTab;
  setActiveSidebar: (sidebar: SidebarTab) => void;
  toggleSidebar: (tab: Exclude<SidebarTab, null>) => void;

  /** Pinned participant track key for focus view */
  pinnedParticipantSid: string | null;
  setPinnedParticipantSid: (sid: string | null) => void;

  /** Whether the user has raised their hand */
  handRaised: boolean;
  setHandRaised: (raised: boolean) => void;
  toggleHandRaised: () => void;

  /** Whether the meeting is in browser fullscreen */
  isFullscreen: boolean;
  setIsFullscreen: (fs: boolean) => void;
  toggleFullscreen: () => void;

  /** Class topic / room name from token response */
  topic: string | null;
}

const LiveClassContext = createContext<LiveClassContextValue | undefined>(undefined);

export function LiveClassProvider({
  children,
  topic,
}: {
  children: ReactNode;
  topic?: string | null;
}) {
  const [activeSidebar, setActiveSidebar] = useState<SidebarTab>(null);
  const [pinnedParticipantSid, setPinnedParticipantSid] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleSidebar = useCallback(
    (tab: Exclude<SidebarTab, null>) => {
      setActiveSidebar((prev) => (prev === tab ? null : tab));
    },
    [],
  );

  const toggleHandRaised = useCallback(() => {
    setHandRaised((prev) => !prev);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen request denied — ignore silently
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  return (
    <LiveClassContext.Provider
      value={{
        activeSidebar,
        setActiveSidebar,
        toggleSidebar,
        pinnedParticipantSid,
        setPinnedParticipantSid,
        handRaised,
        setHandRaised,
        toggleHandRaised,
        isFullscreen,
        setIsFullscreen,
        toggleFullscreen,
        topic: topic || null,
      }}
    >
      {children}
    </LiveClassContext.Provider>
  );
}

export function useLiveClassState() {
  const context = useContext(LiveClassContext);
  if (!context) {
    throw new Error("useLiveClassState must be used within a LiveClassProvider");
  }
  return context;
}
