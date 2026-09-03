"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { LiveClassSettings } from "@nexa-chess/types";

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

  /** Time the class officially started */
  startedAt: string | null;

  /** Time the class officially ends */
  endsAt: string | null;

  /** Whether the shared chessboard is open in the meeting */
  isChessboardOpen: boolean;
  setIsChessboardOpen: (val: boolean) => void;
  toggleChessboard: () => void;

  /** Participant identities currently granted board control (empty = coach only) */
  boardControlStudentIds: string[];
  /** Add one student to the granted set. */
  grantBoardControl: (identity: string) => void;
  /** Remove one student from the granted set. */
  revokeBoardControl: (identity: string) => void;
  /** Grant if absent, revoke if present. */
  toggleBoardControl: (identity: string) => void;
  /** Replace the whole granted set (used when applying a remote permission sync). */
  setBoardControlStudents: (identities: string[]) => void;
  /** Revoke everyone — back to coach-only. */
  clearBoardControl: () => void;

  /** Whether the class is currently being recorded */
  isRecording: boolean;
  setIsRecording: (val: boolean) => void;
  toggleRecording: () => void;

  /**
   * Resolved pre-class settings enforced for this session (null = legacy class
   * with no policy). The mic/camera/screen-share locks and the default board
   * interaction level are derived from this; it matches the LiveKit token
   * grants, so the UI never shows an action the SFU would reject.
   */
  settings: LiveClassSettings | null;
  /**
   * Replace the live settings after a mid-class coach change (driven by the
   * `SETTINGS_UPDATE` LiveKit data message). The token grants are pushed
   * server-side in the same operation.
   */
  applySettingsUpdate: (next: LiveClassSettings) => void;
}

const LiveClassContext = createContext<LiveClassContextValue | undefined>(undefined);

export function LiveClassProvider({
  children,
  topic,
  startedAt,
  endsAt,
  settings: initialSettings = null,
}: {
  children: ReactNode;
  topic?: string | null;
  startedAt?: string | null;
  endsAt?: string | null;
  settings?: LiveClassSettings | null;
}) {
  const [activeSidebar, setActiveSidebar] = useState<SidebarTab>(null);
  const [pinnedParticipantSid, setPinnedParticipantSid] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [boardControlStudentIds, setBoardControlStudentIds] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [settings, setSettings] = useState<LiveClassSettings | null>(initialSettings);

  // Adopt a fresh snapshot from the token response (e.g. after a reconnect /
  // token refresh) without clobbering a newer mid-class update.
  useEffect(() => {
    if (initialSettings) setSettings(initialSettings);
  }, [initialSettings]);

  const applySettingsUpdate = useCallback((next: LiveClassSettings) => {
    setSettings(next);
  }, []);

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

  const grantBoardControl = useCallback((identity: string) => {
    setBoardControlStudentIds((prev) =>
      prev.includes(identity) ? prev : [...prev, identity],
    );
  }, []);

  const revokeBoardControl = useCallback((identity: string) => {
    setBoardControlStudentIds((prev) => prev.filter((id) => id !== identity));
  }, []);

  const toggleBoardControl = useCallback((identity: string) => {
    setBoardControlStudentIds((prev) =>
      prev.includes(identity) ? prev.filter((id) => id !== identity) : [...prev, identity],
    );
  }, []);

  const setBoardControlStudents = useCallback((identities: string[]) => {
    setBoardControlStudentIds((prev) => {
      const same =
        prev.length === identities.length && prev.every((id) => identities.includes(id));
      return same ? prev : identities;
    });
  }, []);

  const clearBoardControl = useCallback(() => {
    setBoardControlStudentIds((prev) => (prev.length === 0 ? prev : []));
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
        boardControlStudentIds,
        grantBoardControl,
        revokeBoardControl,
        toggleBoardControl,
        setBoardControlStudents,
        clearBoardControl,
        isRecording,
        setIsRecording,
        toggleRecording,
        settings,
        applySettingsUpdate,
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
