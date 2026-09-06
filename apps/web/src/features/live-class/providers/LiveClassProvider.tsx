"use client";

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import type { LiveClassSettings } from "@nexa-chess/types";
import type { BoardControlSide } from "@/features/chessboard/types/sync";
import type { RaisedHand } from "../lib/handRaise";

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

  /**
   * Everyone currently holding a hand up, keyed by full LiveKit identity — the
   * local participant included. Fed by `<HandRaiseBridge>` off the
   * `hand_raise` data channel; see `lib/handRaise.ts` for why it is a data
   * packet and not a participant attribute.
   */
  raisedHands: Record<string, RaisedHand>;
  /** Record (or clear) one participant's raised hand. */
  applyHandRaise: (hand: RaisedHand, raised: boolean) => void;
  /** Drop hands belonging to participants who have left the room. */
  pruneRaisedHands: (presentIdentities: string[]) => void;

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

  /**
   * Participant identity -> the side that student may move (empty = coach
   * only). A student can be handed white, black, or both, so two students can
   * play each other on the shared board while the coach watches.
   */
  boardControlStudents: Record<string, BoardControlSide>;
  /** Identities currently granted board control (the keys above). */
  boardControlStudentIds: string[];
  /** Add one student to the granted set, or change the side they control. */
  grantBoardControl: (identity: string, side?: BoardControlSide) => void;
  /** Remove one student from the granted set. */
  revokeBoardControl: (identity: string) => void;
  /** Grant `side` if absent, revoke if already granted that same side. */
  toggleBoardControl: (identity: string, side?: BoardControlSide) => void;
  /** Grant `side`, or revoke when `side` is null. */
  setBoardControlSide: (identity: string, side: BoardControlSide | null) => void;
  /** Replace the whole granted set (used when applying a remote permission sync). */
  setBoardControlStudents: (students: Record<string, BoardControlSide>) => void;
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
  const [raisedHands, setRaisedHands] = useState<Record<string, RaisedHand>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isChessboardOpen, setIsChessboardOpen] = useState(false);
  const [boardControlStudents, setBoardControlStudentsState] = useState<
    Record<string, BoardControlSide>
  >({});
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

  const applyHandRaise = useCallback((hand: RaisedHand, raised: boolean) => {
    setRaisedHands((prev) => {
      if (!raised) {
        if (!(hand.identity in prev)) return prev;
        const { [hand.identity]: _removed, ...rest } = prev;
        return rest;
      }
      // Keep the original `at` so re-announcements (a late joiner's query)
      // don't reorder who asked first.
      const existing = prev[hand.identity];
      if (existing && existing.at === hand.at && existing.name === hand.name) return prev;
      return { ...prev, [hand.identity]: existing ? { ...hand, at: existing.at } : hand };
    });
  }, []);

  const pruneRaisedHands = useCallback((presentIdentities: string[]) => {
    setRaisedHands((prev) => {
      const present = new Set(presentIdentities);
      const kept = Object.keys(prev).filter((id) => present.has(id));
      if (kept.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(kept.map((id) => [id, prev[id]]));
    });
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

  const boardControlStudentIds = useMemo(
    () => Object.keys(boardControlStudents),
    [boardControlStudents],
  );

  const grantBoardControl = useCallback(
    (identity: string, side: BoardControlSide = "both") => {
      setBoardControlStudentsState((prev) =>
        prev[identity] === side ? prev : { ...prev, [identity]: side },
      );
    },
    [],
  );

  const revokeBoardControl = useCallback((identity: string) => {
    setBoardControlStudentsState((prev) => {
      if (!(identity in prev)) return prev;
      const { [identity]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const setBoardControlSide = useCallback(
    (identity: string, side: BoardControlSide | null) => {
      setBoardControlStudentsState((prev) => {
        if (side === null) {
          if (!(identity in prev)) return prev;
          const { [identity]: _removed, ...rest } = prev;
          return rest;
        }
        return prev[identity] === side ? prev : { ...prev, [identity]: side };
      });
    },
    [],
  );

  const toggleBoardControl = useCallback(
    (identity: string, side: BoardControlSide = "both") => {
      setBoardControlStudentsState((prev) => {
        if (prev[identity] === side) {
          const { [identity]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [identity]: side };
      });
    },
    [],
  );

  const setBoardControlStudents = useCallback((students: Record<string, BoardControlSide>) => {
    setBoardControlStudentsState((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(students);
      const same =
        prevKeys.length === nextKeys.length &&
        nextKeys.every((id) => prev[id] === students[id]);
      return same ? prev : students;
    });
  }, []);

  const clearBoardControl = useCallback(() => {
    setBoardControlStudentsState((prev) => (Object.keys(prev).length === 0 ? prev : {}));
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
        raisedHands,
        applyHandRaise,
        pruneRaisedHands,
        isFullscreen,
        setIsFullscreen,
        toggleFullscreen,
        topic: topic ?? null,
        startedAt: startedAt ?? null,
        endsAt: endsAt ?? null,
        isChessboardOpen,
        setIsChessboardOpen,
        toggleChessboard,
        boardControlStudents,
        boardControlStudentIds,
        grantBoardControl,
        revokeBoardControl,
        toggleBoardControl,
        setBoardControlSide,
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
