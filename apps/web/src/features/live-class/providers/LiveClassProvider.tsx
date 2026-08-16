"use client";

import React, { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type SidebarTab = "chat" | "participants" | "settings" | "notes" | null;
export type BoardControlStudentId = string | null;

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

  /** Time the class officially started */
  startedAt: string | null;

  /** Time the class officially ends */
  endsAt: string | null;

  /** Whether the shared chessboard is open in the meeting */
  isChessboardOpen: boolean;
  setIsChessboardOpen: (val: boolean) => void;
  toggleChessboard: () => void;

  /** The participant identity currently given board control (null = coach only) */
  boardControlStudentId: BoardControlStudentId;
  setBoardControlStudent: (identity: BoardControlStudentId) => void;

  /** Whether the class is currently being recorded */
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  toggleRecording: () => void;
}

const LiveClassContext = createContext<LiveClassContextValue | undefined>(undefined);

export function LiveClassProvider({
  children,
  topic,
  startedAt,
  endsAt,
}: {
  children: ReactNode;
  topic?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
}) {
  const [activeSidebar, setActiveSidebar] = useState<SidebarTab>(null);
  const [pinnedParticipantSid, setPinnedParticipantSid] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [boardControlStudentId, setBoardControlStudentId] = useState<BoardControlStudentId>(null);
  const [isRecording, setIsRecording] = useState(false);

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

  const toggleChessboard = useCallback(() => {
    setIsChessboardOpen((prev) => !prev);
  }, []);

  const setBoardControlStudent = useCallback((identity: BoardControlStudentId) => {
    setBoardControlStudentId(identity);
  }, []);

  const toggleRecording = useCallback(() => {
    setIsRecording((prev) => !prev);
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
        topic: topic ?? null,
        startedAt: startedAt ?? null,
        endsAt: endsAt ?? null,
        isChessboardOpen,
        setIsChessboardOpen,
        toggleChessboard,
        boardControlStudentId,
        setBoardControlStudent,
        isRecording,
        setIsRecording,
        toggleRecording,
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

export function useOptionalLiveClassState() {
  return useContext(LiveClassContext);
}
