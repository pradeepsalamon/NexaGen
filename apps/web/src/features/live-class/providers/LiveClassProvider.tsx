"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  LiveClassSettings,
  LivePuzzleAssignment,
  ScreenShareRequestEntry,
  WaitingRoomEntry,
} from "@nexa-chess/types";
import type { BoardControlSide } from "@/features/chessboard/types/sync";
import type { ClassroomPresentation, PresentationState } from "../lib/classroomPresentation";
import type { RaisedHand } from "../lib/handRaise";

export type SidebarTab = "chat" | "participants" | "settings" | "notes" | "puzzle" | null;

export interface LiveClassState {
  /** Which sidebar panel is currently open */
  activeSidebar: SidebarTab;
  setActiveSidebar: (sidebar: SidebarTab) => void;
  toggleSidebar: (tab: Exclude<SidebarTab, null>) => void;
  /** The board-first classroom layout has its Chat tab on screen. */
  classroomChatOpen: boolean;
  setClassroomChatOpen: (open: boolean) => void;

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
   * What the coach presents as the main stage (`lib/classroomPresentation.ts`):
   * gallery (a class starts here), the main board, or the board pushed into
   * the gallery. The coach sets it; students mirror the coach's attribute.
   */
  classroomPresentation: ClassroomPresentation;
  /** Grows with every press (`PresentationState.seq`), so re-presenting the same thing still lands. */
  presentationSeq: number;
  /** Coach: present `presentation` now (a new press). */
  presentClassroom: (presentation: ClassroomPresentation) => void;
  /** Take a press as published by the coach (or restored after a reload). */
  applyClassroomPresentation: (state: PresentationState) => void;

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

  /**
   * Recording state known before LiveKit's own `isRecording` catches up (it
   * lags a stop by the egress finalize). null = trust LiveKit. Read it through
   * `useRecordingState`, not directly.
   */
  recordingOverride: boolean | null;
  setRecordingOverride: (val: boolean | null) => void;

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

  /**
   * The puzzle a coach has pushed into the room (null = none). Seeded from
   * `GET /live-class/:id/puzzle` and kept current by `<PuzzleBridge>` off the
   * `live_class_puzzle` data channel. Never carries the solution line.
   */
  activePuzzle: LivePuzzleAssignment | null;
  /** Set (or replace) the active puzzle after a `PUZZLE_ASSIGNED` message. */
  applyPuzzleAssignment: (assignment: LivePuzzleAssignment | null) => void;
  /** Clear the active puzzle after a `PUZZLE_ENDED` message. */
  clearActivePuzzle: (assignmentId?: string) => void;
  /**
   * Whether the student's main stage shows the puzzle (`PuzzleStage`) instead
   * of the shared board. The grid tile, the Puzzle panel, the "Solve puzzle"
   * pills and a new assignment all set it, so two boards never run one attempt.
   */
  puzzleSolverOpen: boolean;
  setPuzzleSolverOpen: (open: boolean) => void;
  /** Coach: whether the main stage shows every student's live puzzle board. */
  puzzleBoardsOpen: boolean;
  setPuzzleBoardsOpen: (open: boolean) => void;

  /**
   * Students currently pending admission (coach/admin view only), keyed by
   * studentId. Seeded from `GET /live-class/:id/waiting-room` and kept
   * current by `<WaitingRoomBridge>` off the `waiting_room` data channel.
   */
  waitingRoomEntries: Record<string, WaitingRoomEntry>;
  /** Replace the whole pending set (the initial REST fetch). */
  setWaitingRoomEntries: (entries: WaitingRoomEntry[]) => void;
  /** Add or update one pending entry (a `JOIN_REQUESTED` event). */
  upsertWaitingRoomEntry: (entry: WaitingRoomEntry) => void;
  /** Drop one entry once it's no longer PENDING (a `REQUEST_RESOLVED` event). */
  removeWaitingRoomEntry: (studentId: string) => void;

  /**
   * Screen-share requests currently PENDING or APPROVED, keyed by studentId.
   * Seeded from `GET /live-class/:id/screen-share-requests` and kept current
   * by `<ScreenShareRequestBridge>` off the `screen_share_request` data
   * channel. Unlike the waiting room, an APPROVED entry stays here (the
   * student is already in the room) so the coach panel can still show a
   * Revoke action.
   */
  screenShareRequests: Record<string, ScreenShareRequestEntry>;
  /** Replace the whole set (the initial REST fetch). */
  setScreenShareRequests: (entries: ScreenShareRequestEntry[]) => void;
  /** Add or update one entry (a `REQUESTED` or `RESOLVED` event). */
  upsertScreenShareRequest: (entry: ScreenShareRequestEntry) => void;
}

type LiveClassStore = StoreApi<LiveClassState>;

const LiveClassContext = createContext<LiveClassStore | null>(null);

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function createLiveClassStore(init: {
  topic: string | null;
  startedAt: string | null;
  endsAt: string | null;
  settings: LiveClassSettings | null;
}): LiveClassStore {
  return createStore<LiveClassState>()((set, get) => {
    // Keeps `boardControlStudentIds` derived from the same write.
    const setBoardControl = (
      update: (prev: Record<string, BoardControlSide>) => Record<string, BoardControlSide>,
    ) => {
      const prev = get().boardControlStudents;
      const next = update(prev);
      if (next !== prev) set({ boardControlStudents: next, boardControlStudentIds: Object.keys(next) });
    };

    return {
      ...init,
      activeSidebar: null,
      setActiveSidebar: (activeSidebar) => set({ activeSidebar }),
      toggleSidebar: (tab) => set((s) => ({ activeSidebar: s.activeSidebar === tab ? null : tab })),
      classroomChatOpen: false,
      setClassroomChatOpen: (classroomChatOpen) => set({ classroomChatOpen }),

      pinnedParticipantSid: null,
      setPinnedParticipantSid: (pinnedParticipantSid) => set({ pinnedParticipantSid }),

      handRaised: false,
      setHandRaised: (handRaised) => set({ handRaised }),
      toggleHandRaised: () => set((s) => ({ handRaised: !s.handRaised })),

      raisedHands: {},
      applyHandRaise: (hand, raised) => {
        const prev = get().raisedHands;
        if (!raised) {
          const next = withoutKey(prev, hand.identity);
          if (next !== prev) set({ raisedHands: next });
          return;
        }
        // Keep the original `at` so re-announcements (a late joiner's query)
        // don't reorder who asked first.
        const existing = prev[hand.identity];
        if (existing && existing.at === hand.at && existing.name === hand.name) return;
        set({ raisedHands: { ...prev, [hand.identity]: existing ? { ...hand, at: existing.at } : hand } });
      },
      pruneRaisedHands: (presentIdentities) => {
        const prev = get().raisedHands;
        const present = new Set(presentIdentities);
        const kept = Object.keys(prev).filter((id) => present.has(id));
        if (kept.length === Object.keys(prev).length) return;
        set({ raisedHands: Object.fromEntries(kept.map((id) => [id, prev[id]])) });
      },

      isFullscreen: false,
      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
      toggleFullscreen: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {
            // Fullscreen request denied — ignore silently
          });
          set({ isFullscreen: true });
        } else {
          document.exitFullscreen().catch(() => {});
          set({ isFullscreen: false });
        }
      },

      isChessboardOpen: false,
      setIsChessboardOpen: (isChessboardOpen) => set({ isChessboardOpen }),
      toggleChessboard: () => set((s) => ({ isChessboardOpen: !s.isChessboardOpen })),

      classroomPresentation: "gallery",
      presentationSeq: 0,
      presentClassroom: (classroomPresentation) =>
        set((s) => ({ classroomPresentation, presentationSeq: s.presentationSeq + 1 })),
      applyClassroomPresentation: ({ presentation, seq }) =>
        set((s) =>
          s.classroomPresentation === presentation && s.presentationSeq === seq
            ? s
            : { classroomPresentation: presentation, presentationSeq: seq },
        ),

      boardControlStudents: {},
      boardControlStudentIds: [],
      grantBoardControl: (identity, side = "both") =>
        setBoardControl((prev) => (prev[identity] === side ? prev : { ...prev, [identity]: side })),
      revokeBoardControl: (identity) => setBoardControl((prev) => withoutKey(prev, identity)),
      toggleBoardControl: (identity, side = "both") =>
        setBoardControl((prev) =>
          prev[identity] === side ? withoutKey(prev, identity) : { ...prev, [identity]: side },
        ),
      setBoardControlSide: (identity, side) =>
        setBoardControl((prev) => {
          if (side === null) return withoutKey(prev, identity);
          return prev[identity] === side ? prev : { ...prev, [identity]: side };
        }),
      setBoardControlStudents: (students) =>
        setBoardControl((prev) => {
          const prevKeys = Object.keys(prev);
          const nextKeys = Object.keys(students);
          const same =
            prevKeys.length === nextKeys.length && nextKeys.every((id) => prev[id] === students[id]);
          return same ? prev : students;
        }),
      clearBoardControl: () =>
        setBoardControl((prev) => (Object.keys(prev).length === 0 ? prev : {})),

      recordingOverride: null,
      setRecordingOverride: (recordingOverride) => set({ recordingOverride }),

      applySettingsUpdate: (settings) => set({ settings }),

      activePuzzle: null,
      applyPuzzleAssignment: (assignment) => {
        const prev = get().activePuzzle;
        // Same assignment, same content → keep the reference (no re-render).
        // A PUZZLE_UPDATED edit keeps the id but changes the rules, so compare
        // the payload rather than just the id.
        if (prev && assignment && JSON.stringify(prev) === JSON.stringify(assignment)) return;
        if (prev !== assignment) set({ activePuzzle: assignment });
      },
      clearActivePuzzle: (assignmentId) => {
        const prev = get().activePuzzle;
        // A late "ended" for an earlier puzzle must not close the current one's views.
        if (prev && assignmentId !== undefined && prev.id !== assignmentId) return;
        set({ activePuzzle: null, puzzleBoardsOpen: false, puzzleSolverOpen: false });
      },
      puzzleBoardsOpen: false,
      puzzleSolverOpen: false,
      setPuzzleBoardsOpen: (puzzleBoardsOpen) => set({ puzzleBoardsOpen }),
      setPuzzleSolverOpen: (puzzleSolverOpen) => set({ puzzleSolverOpen }),

      waitingRoomEntries: {},
      setWaitingRoomEntries: (entries) =>
        set({ waitingRoomEntries: Object.fromEntries(entries.map((e) => [e.studentId, e])) }),
      upsertWaitingRoomEntry: (entry) =>
        set((s) => ({ waitingRoomEntries: { ...s.waitingRoomEntries, [entry.studentId]: entry } })),
      removeWaitingRoomEntry: (studentId) => {
        const prev = get().waitingRoomEntries;
        const next = withoutKey(prev, studentId);
        if (next !== prev) set({ waitingRoomEntries: next });
      },

      screenShareRequests: {},
      setScreenShareRequests: (entries) =>
        set({ screenShareRequests: Object.fromEntries(entries.map((e) => [e.studentId, e])) }),
      upsertScreenShareRequest: (entry) =>
        set((s) => ({ screenShareRequests: { ...s.screenShareRequests, [entry.studentId]: entry } })),
    };
  });
}

/**
 * Per-room UI state. Backed by a store rather than a context value so a
 * consumer re-renders only for the fields it asks for — see `useLiveClassState`.
 */
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
  const [store] = useState(() =>
    createLiveClassStore({
      topic: topic ?? null,
      startedAt: startedAt ?? null,
      endsAt: endsAt ?? null,
      settings: initialSettings,
    }),
  );

  useEffect(() => {
    store.setState({ topic: topic ?? null, startedAt: startedAt ?? null, endsAt: endsAt ?? null });
  }, [store, topic, startedAt, endsAt]);

  // Adopt a fresh snapshot from the token response (e.g. after a reconnect /
  // token refresh) without clobbering a newer mid-class update.
  useEffect(() => {
    if (initialSettings) store.setState({ settings: initialSettings });
  }, [store, initialSettings]);

  // Never let an override outlive a failed egress: after a minute LiveKit is
  // the only authority again.
  const recordingOverride = useStore(store, (s) => s.recordingOverride);
  useEffect(() => {
    if (recordingOverride === null) return;
    const timer = window.setTimeout(() => store.setState({ recordingOverride: null }), 60_000);
    return () => window.clearTimeout(timer);
  }, [store, recordingOverride]);

  return <LiveClassContext.Provider value={store}>{children}</LiveClassContext.Provider>;
}

function pick<K extends keyof LiveClassState>(state: LiveClassState, keys: readonly K[]) {
  const out = {} as Pick<LiveClassState, K>;
  for (const key of keys) out[key] = state[key];
  return out;
}

const EMPTY_STORE = createStore<LiveClassState | undefined>()(() => undefined);

/**
 * Pass the fields you read — `useLiveClassState("activePuzzle", "puzzleSolverOpen")` —
 * and the component re-renders only when one of them changes. With no keys it
 * subscribes to everything.
 */
export function useLiveClassState(): LiveClassState;
export function useLiveClassState<K extends keyof LiveClassState>(
  ...keys: K[]
): Pick<LiveClassState, K>;
export function useLiveClassState<K extends keyof LiveClassState>(...keys: K[]) {
  const store = useContext(LiveClassContext);
  if (!store) {
    throw new Error("useLiveClassState must be used within a LiveClassProvider");
  }
  return useStore(
    store,
    useShallow((state: LiveClassState) => (keys.length ? pick(state, keys) : state)),
  );
}

/** Outside a LiveClassProvider this yields undefined. The selector must return a stable value. */
export function useOptionalLiveClassState(): LiveClassState | undefined;
export function useOptionalLiveClassState<T>(selector: (state: LiveClassState) => T): T | undefined;
export function useOptionalLiveClassState<T>(selector?: (state: LiveClassState) => T) {
  const store = useContext(LiveClassContext);
  return useStore(store ?? EMPTY_STORE, (state) =>
    state === undefined ? undefined : selector ? selector(state) : state,
  );
}

/** The store itself, for reading state inside callbacks without subscribing. */
export function useOptionalLiveClassStore(): LiveClassStore | null {
  return useContext(LiveClassContext);
}
