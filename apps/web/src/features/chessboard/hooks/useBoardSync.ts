import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  useDataChannel,
  useLocalParticipant,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState, type DataPublishOptions } from "livekit-client";
import { useParams } from "next/navigation";
import { useBoardStore, BoardContext } from "../context/BoardProvider";
import { useBoardStore as usePersistedStore } from "../store/boardStore";
import { BoardControlSide, BoardSyncMessage } from "../types/sync";
import { moverColorFromFen, senderMayMutateBoard } from "../lib/boardSyncRules";
import { applyMoveToClock } from "../lib/clock";
import { toLiveBoardState } from "../lib/boardSnapshot";
import { useBoardPersistence, type RestoreGate } from "./useBoardPersistence";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassStore } from "@/features/live-class/providers/LiveClassProvider";
import { toast } from "sonner";
import { useRoster } from "@/features/live-class/hooks/useRoster";

const BOARD_SYNC_TOPIC = "board_sync";

/**
 * Role comes from LiveKit participant metadata, which the server signs into the
 * access token. Students are issued `canUpdateOwnMetadata: false`, so this
 * cannot be forged client-side.
 */
function isCoachParticipant(from?: { metadata?: string }) {
  if (!from?.metadata) return false;
  try {
    return JSON.parse(from.metadata).role === "COACH";
  } catch {
    return false;
  }
}

export interface BoardSyncActions {
  broadcastState: (type?: BoardSyncMessage["type"]) => void;
  broadcastAnnotations: () => void;
  broadcastPermissions: () => void;
  requestControl: () => void;
  /** Student: stop following the coach and snap back later via "resync". */
  requestResync: () => void;
}

/**
 * Context so the sync engine runs exactly once per board (in
 * `LiveBoardSyncBridge`) while any component can still call the actions.
 * Registering the LiveKit data channel / store subscriber in multiple
 * components duplicated every broadcast and played move sounds N times.
 */
export const BoardSyncContext = createContext<BoardSyncActions | null>(null);

export function useBoardSync(): BoardSyncActions {
  const ctx = useContext(BoardSyncContext);
  if (!ctx) {
    throw new Error("useBoardSync must be used within a <LiveBoardSyncBridge>");
  }
  return ctx;
}

/**
 * The single sync engine. Call once, inside both `<BoardProvider>` and
 * `<LiveKitRoom>`; provide the result through `BoardSyncContext`.
 */
export function useBoardSyncEngine(): BoardSyncActions {
  const user = useAuthStore((state) => state.user);
  // ADMIN was previously omitted here, leaving admins driving the board as if
  // they were students (AUDIT L6).
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const participants = useRoster();
  const liveClassStore = useOptionalLiveClassStore();

  const store = useContext(BoardContext);

  // `syncFromRemote` is a stable store action. Everything else is read via
  // `store.getState()` inside the callbacks below rather than destructured
  // reactively, so a board change doesn't re-render this hook (and re-register
  // the LiveKit data channel) on every move (AUDIT M28).
  const syncFromRemote = useBoardStore((state) => state.syncFromRemote);

  const sendRef = useRef<
    ((payload: Uint8Array, options: DataPublishOptions) => Promise<void>) | null
  >(null);
  const connectionState = useConnectionState();

  // The coach's board pop-out window (`${userId}_board`) is authoritative while
  // it is open: the main meeting window then mirrors it read-only and must not
  // also broadcast, or moves echo/reorder between the two coach participants.
  const suppressBroadcast = useMemo(() => {
    if (!isCoach || !user?.id || !localParticipant) return false;
    const boardIdentity = `${user.id}_board`;
    if (localParticipant.identity === boardIdentity) return false;
    return participants.some((p) => p.identity === boardIdentity);
  }, [isCoach, user?.id, localParticipant, participants]);

  const broadcastMsg = useCallback(
    (msg: BoardSyncMessage) => {
      if (
        !localParticipant ||
        !sendRef.current ||
        connectionState !== ConnectionState.Connected
      ) {
        return;
      }
      try {
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify(msg));
        sendRef.current(payload, { reliable: true });
      } catch (e) {
        console.error("Failed to broadcast board sync message", e);
      }
    },
    [localParticipant, connectionState],
  );

  // Full mainline + the viewed ply so receivers step history with us instead
  // of snapping to the end (AUDIT H21).
  const snapshot = useCallback(() => {
    const s = store?.getState();
    return s ? toLiveBoardState(s) : null;
  }, [store]);

  // Closed while a refreshed coach is still restoring the saved board.
  const restoreGate = useRef<RestoreGate>({ ready: !isCoach, pendingForceSync: false });

  const broadcastState = useCallback(
    (type: BoardSyncMessage["type"] = "MOVE") => {
      if (type === "FORCE_SYNC" && !restoreGate.current.ready) {
        restoreGate.current.pendingForceSync = true;
        return;
      }
      const snap = snapshot();
      if (!snap) return;
      broadcastMsg({
        type: type as "MOVE" | "UNDO" | "REDO" | "RESET" | "FORCE_SYNC",
        payload: {
          fen: snap.fen,
          pgn: snap.pgn,
          historyIndex: snap.historyIndex,
          orientation: snap.orientation,
          ...(type === "FORCE_SYNC"
            ? {
                arrows: snap.arrows,
                squares: snap.squares,
                activeTab: snap.activeTab,
                clock: snap.clock,
              }
            : {}),
          ...(type === "MOVE"
            ? { moveType: usePersistedStore.getState().lastMoveType }
            : {}),
        },
      });
    },
    [broadcastMsg, snapshot],
  );

  const broadcastAnnotations = useCallback(() => {
    const s = store?.getState();
    if (!s) return;
    broadcastMsg({
      type: "UPDATE_ANNOTATIONS",
      payload: { arrows: s.arrows, squares: s.squareStyles },
    });
  }, [broadcastMsg, store]);

  const broadcastPermissions = useCallback(() => {
    const s = store?.getState();
    if (!s) return;
    broadcastMsg({
      type: "UPDATE_PERMISSIONS",
      payload: {
        mode: s.permissionMode,
        selectedStudentIds: s.selectedStudentIds,
        selectedStudentSides: s.selectedStudentSides,
      },
    });
  }, [broadcastMsg, store]);

  const requestControl = useCallback(() => {
    if (!user || !localParticipant) return;
    const name = `${user.firstName} ${user.lastName || ""}`.trim();
    broadcastMsg({
      type: "REQUEST_CONTROL",
      payload: { identity: localParticipant.identity, studentName: name },
    });
    toast.success("Requested board control from coach");
  }, [broadcastMsg, user, localParticipant]);

  const requestResync = useCallback(() => {
    store?.getState().resyncBoard();
    broadcastMsg({ type: "REQUEST_SYNC" });
  }, [broadcastMsg, store]);

  const handleIncomingSync = useCallback(
    (msg: BoardSyncMessage, isFromCoach: boolean, fromIdentity: string | undefined) => {
      if (!store) return;
      const current = store.getState();

      if (
        !senderMayMutateBoard({
          type: msg.type,
          fromIdentity,
          isFromCoach,
          permissionMode: current.permissionMode,
          selectedStudentIds: current.selectedStudentIds,
          selectedStudentSides: current.selectedStudentSides,
          // Per-side grants are enforced on the colour that actually played:
          // a white-only student's packet moving a black piece is dropped.
          moverColor: msg.type === "MOVE" ? moverColorFromFen(msg.payload?.fen) : undefined,
        })
      ) {
        console.warn(
          `Ignored board sync message "${msg.type}" from a participant without board control`,
        );
        return;
      }

      switch (msg.type) {
        case "MOVE":
        case "UNDO":
        case "REDO":
        case "RESET":
        case "FORCE_SYNC":
          if (msg.payload && msg.payload.fen) {
            syncFromRemote({
              fen: msg.payload.fen,
              pgn: msg.payload.pgn || "",
              ...(typeof msg.payload.historyIndex === "number"
                ? { historyIndex: msg.payload.historyIndex }
                : {}),
              ...(msg.payload.orientation
                ? { orientation: msg.payload.orientation }
                : {}),
              // FORCE_SYNC carries the full board snapshot.
              ...(Array.isArray(msg.payload.arrows)
                ? { arrows: msg.payload.arrows }
                : {}),
              ...(msg.payload.squares ? { squareStyles: msg.payload.squares } : {}),
              ...(msg.payload.clock ? { clock: msg.payload.clock } : {}),
              // Only a MOVE carries a real move sound; the rest reposition the
              // board rather than play a move (AUDIT H6).
              ...(msg.type === "MOVE" && msg.payload.moveType
                ? { moveType: msg.payload.moveType }
                : {}),
            });

            // The coach is the clock authority. A controlling student's MOVE
            // carries no clock update, so re-derive it here and broadcast.
            if (msg.type === "MOVE" && isCoach && !isFromCoach && !suppressBroadcast) {
              const after = store.getState();
              const mover = after.turn === "white" ? "black" : "white";
              const nextClock = applyMoveToClock(after.clock, mover, Date.now());
              if (nextClock !== after.clock) after.setClock(nextClock);
            }
          }
          break;
        case "UPDATE_ANNOTATIONS":
          if (msg.payload) {
            syncFromRemote({
              arrows: msg.payload.arrows || [],
              squareStyles: msg.payload.squares || {},
            });
          }
          break;
        case "UPDATE_PERMISSIONS":
          if (msg.payload && msg.payload.mode) {
            const grantedIds = msg.payload.selectedStudentIds ?? [];
            const remoteSides = msg.payload.selectedStudentSides ?? {};
            // A grant with no recorded side means "both" — that is what
            // clients predating per-side control send.
            const grantedSides = grantedIds.reduce<Record<string, BoardControlSide>>(
              (acc, id) => {
                acc[id] = remoteSides[id] ?? "both";
                return acc;
              },
              {},
            );
            syncFromRemote({
              permissionMode: msg.payload.mode,
              selectedStudentIds: grantedIds,
              selectedStudentSides: grantedSides,
            });
            liveClassStore?.getState().setBoardControlStudents(grantedSides);
          }
          break;
        case "SET_CLOCK":
          if (msg.payload?.clock) {
            syncFromRemote({ clock: msg.payload.clock });
          }
          break;
        case "SET_UI_STATE":
          if (msg.payload && msg.payload.activeTab !== undefined) {
            syncFromRemote({ activeTab: msg.payload.activeTab });
          }
          break;
        case "REQUEST_SYNC": {
          // A late joiner asked for a sync. If we are the coach, send full
          // state. Read straight from the store so this callback doesn't close
          // over ~10 reactive fields (AUDIT M28).
          if (isCoach && !suppressBroadcast) {
            if (!restoreGate.current.ready) {
              restoreGate.current.pendingForceSync = true;
              break;
            }
            const snap = snapshot();
            if (!snap) break;
            broadcastMsg({
              type: "FORCE_SYNC",
              payload: {
                fen: snap.fen,
                pgn: snap.pgn,
                historyIndex: snap.historyIndex,
                orientation: snap.orientation,
                arrows: snap.arrows,
                squares: snap.squares,
                activeTab: snap.activeTab,
                clock: snap.clock,
              },
            });
          }
          break;
        }
        case "REQUEST_CONTROL":
          if (isCoach && msg.payload?.identity) {
            const identity = msg.payload.identity;
            const studentName = msg.payload.studentName || "A student";
            const side = msg.payload.side ?? "both";
            const sideLabel = side === "both" ? "both sides" : side;
            toast(`${studentName} requested board control`, {
              id: `req-board-control-${identity}`,
              description: "Pick a side for them in the board's Class panel.",
              action: {
                label: side === "both" ? "Grant Control" : `Grant ${sideLabel}`,
                onClick: () => {
                  if (liveClassStore) {
                    liveClassStore.getState().grantBoardControl(identity, side);
                    toast.success(`Granted ${sideLabel} to ${studentName}`, {
                      id: `grant-board-control-${identity}`,
                    });
                  }
                },
              },
              duration: 10000,
            });
          }
          break;
      }
    },
    [isCoach, store, syncFromRemote, broadcastMsg, liveClassStore, snapshot, suppressBroadcast],
  );

  // Zustand store subscription for immediate syncing. Bypasses React batching
  // so rapid consecutive moves all broadcast without skipping intermediate FENs.
  useEffect(() => {
    if (!store) return;

    const unsubscribe = store.subscribe((state, prevState) => {
      // A detached student's local exploration must never leave their board;
      // the coach's mirror window (pop-out open) must stay quiet.
      if (state.isDetached || suppressBroadcast) return;

      const boardChanged =
        state.fen !== prevState.fen ||
        state.pgn !== prevState.pgn ||
        state.orientation !== prevState.orientation;
      const annotationsChanged =
        state.arrows !== prevState.arrows ||
        state.squareStyles !== prevState.squareStyles;
      const uiChanged = state.activeTab !== prevState.activeTab;
      const clockChanged = state.clock !== prevState.clock;

      if (!boardChanged && !annotationsChanged && !uiChanged && !clockChanged) return;

      // If this transition came from a remote sync, don't echo it back
      // (`remoteSyncId` is bumped atomically inside `syncFromRemote`) (AUDIT H20).
      if (state.remoteSyncId !== prevState.remoteSyncId) return;

      if (boardChanged) {
        broadcastMsg({
          type: "MOVE",
          payload: {
            fen: state.fen,
            pgn: state.fullPgn || state.pgn,
            historyIndex: state.historyIndex,
            orientation: state.orientation,
            moveType: usePersistedStore.getState().lastMoveType,
          },
        });
      }
      if (annotationsChanged) {
        broadcastMsg({
          type: "UPDATE_ANNOTATIONS",
          payload: { arrows: state.arrows, squares: state.squareStyles },
        });
      }
      if (uiChanged) {
        broadcastMsg({
          type: "SET_UI_STATE",
          payload: { activeTab: state.activeTab },
        });
      }
      if (clockChanged) {
        broadcastMsg({ type: "SET_CLOCK", payload: { clock: state.clock } });
      }
    });

    return unsubscribe;
  }, [store, broadcastMsg, suppressBroadcast]);

  const onMessageReceived = useCallback(
    (msg: { payload: Uint8Array; from?: { identity?: string; metadata?: string } }) => {
      try {
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(msg.payload)) as BoardSyncMessage;
        handleIncomingSync(data, isCoachParticipant(msg.from), msg.from?.identity);
      } catch (e) {
        console.error("Failed to parse board sync message", e);
      }
    },
    [handleIncomingSync],
  );

  const { send } = useDataChannel(BOARD_SYNC_TOPIC, onMessageReceived);

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // A FORCE_SYNC held back by the restore gate goes out once the board is
  // restored and the room is connected.
  const flushForceSync = useCallback(() => {
    const gate = restoreGate.current;
    if (!gate.ready || !gate.pendingForceSync || connectionState !== ConnectionState.Connected) return;
    gate.pendingForceSync = false;
    broadcastState("FORCE_SYNC");
  }, [connectionState, broadcastState]);

  useEffect(() => {
    flushForceSync();
  }, [flushForceSync]);

  const params = useParams<{ roomId?: string }>();
  useBoardPersistence({
    store,
    classId: params?.roomId,
    writer: isCoach && !suppressBroadcast,
    // Signed-in students only: a demo guest has no session to read with.
    reader: !isCoach && !!user,
    gate: restoreGate,
    flushForceSync,
  });

  // On mount, if student, request current state from coach.
  useEffect(() => {
    if (!isCoach) {
      broadcastMsg({ type: "REQUEST_SYNC" });
    }
  }, [isCoach, broadcastMsg]);

  // A student's LiveKit connection recovering from a drop does not replay
  // whatever MOVE/annotation broadcasts it missed while Reconnecting — the
  // data channel has no backlog. Re-request state on that transition the same
  // way a late joiner does on mount (design doc §2.6/§4.3: this was the open
  // question of whether REQUEST_SYNC auto-fires on reconnect — confirmed it
  // did not, so this closes that gap without a new protocol message).
  const wasRecoveringRef = useRef(false);
  useEffect(() => {
    const recovering =
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting;
    if (recovering) {
      wasRecoveringRef.current = true;
    } else if (connectionState === ConnectionState.Connected && wasRecoveringRef.current) {
      wasRecoveringRef.current = false;
      if (!isCoach) {
        broadcastMsg({ type: "REQUEST_SYNC" });
      }
    }
  }, [connectionState, isCoach, broadcastMsg]);

  return useMemo(
    () => ({
      broadcastState,
      broadcastAnnotations,
      broadcastPermissions,
      requestControl,
      requestResync,
    }),
    [broadcastState, broadcastAnnotations, broadcastPermissions, requestControl, requestResync],
  );
}
