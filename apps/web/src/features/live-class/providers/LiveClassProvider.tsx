"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

export type LayoutMode = "grid" | "speaker";
export type SidebarType = "chat" | "participants" | null;

interface LiveClassContextValue {
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  activeSidebar: SidebarType;
  setActiveSidebar: (sidebar: SidebarType) => void;
  pinnedParticipantSid: string | null;
  setPinnedParticipantSid: (sid: string | null) => void;
  activeScreenShareSid: string | null;
  setActiveScreenShareSid: (sid: string | null) => void;
  topic: string | null;
}

const LiveClassContext = createContext<LiveClassContextValue | undefined>(undefined);

export function LiveClassProvider({ children, topic }: { children: ReactNode, topic?: string | null }) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [activeSidebar, setActiveSidebar] = useState<SidebarType>(null);
  const [pinnedParticipantSid, setPinnedParticipantSid] = useState<string | null>(null);
  const [activeScreenShareSid, setActiveScreenShareSid] = useState<string | null>(null);

  return (
    <LiveClassContext.Provider
      value={{
        layoutMode,
        setLayoutMode,
        activeSidebar,
        setActiveSidebar,
        pinnedParticipantSid,
        setPinnedParticipantSid,
        activeScreenShareSid,
        setActiveScreenShareSid,
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
