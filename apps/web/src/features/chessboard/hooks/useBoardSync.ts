import { useContext, useEffect, useCallback, useRef } from "react";
import { useDataChannel, useLocalParticipant, useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useBoardStore, BoardContext } from "../context/BoardProvider";
import { useBoardStore as usePersistedStore } from "../store/boardStore";
import { BoardSyncMessage } from "../types/sync";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { toast } from "sonner";

const BOARD_SYNC_TOPIC = "board_sync";

/**
 * Message types that mutate shared board state. They are only honoured from the
 * coach — students hold `canPublishData`, so without this check any participant
 * could push arbitrary positions or grant themselves control. See AUDIT.md C7.
 *
 * `REQUEST_SYNC` and `REQUEST_CONTROL` are intentionally excluded: they are
 * requests, not commands, and students are expected to send them.
 */
const COACH_ONLY_MESSAGE_TYPES = new Set<BoardSyncMessage["type"]>([
  "MOVE",
  "UNDO",
  "REDO",
  "RESET",
  "FORCE_SYNC",
  "UPDATE_ANNOTATIONS",
  "UPDATE_PERMISSIONS",
  "SET_UI_STATE"
]);

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

export function useBoardSync() {
  const user = useAuthStore((state) => state.user);
  // ADMIN was previously omitted here, leaving admins driving the board as if
  // they were students (AUDIT L6).
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { localParticipant } = useLocalParticipant();
  const liveClassState = useOptionalLiveClassState();
  
  const store = useContext(BoardContext);

  // `syncFromRemote` is a stable store action. Everything else is read via
  // `store.getState()` inside the callbacks below rather than destructured
  // reactively, so a board change doesn't re-render this hook (and re-register
  // the LiveKit data channel) on every move (AUDIT M28).
  const syncFromRemote = useBoardStore((state) => state.syncFromRemote);

  const sendRef = useRef<any>(null);

  const connectionState = useConnectionState();

  // Helper to send messages
  const broadcastMsg = useCallback((msg: BoardSyncMessage) => {
    if (!localParticipant || !sendRef.current || connectionState !== ConnectionState.Connected) return;
    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(msg));
      sendRef.current(payload, { reliable: true });
    } catch (e) {
      console.error("Failed to broadcast board sync message", e);
    }
  }, [localParticipant, connectionState]);

  // High level actions for UI components to call
  const broadcastState = useCallback((type: BoardSyncMessage["type"] = "MOVE") => {
    const s = store?.getState();
    if (!s) return;
    broadcastMsg({
      type,
      payload: {
        fen: s.fen,
        // Send the complete mainline + the viewed ply so receivers can step
        // history with us instead of snapping to the end (AUDIT H21).
        pgn: s.fullPgn || s.pgn,
        historyIndex: s.historyIndex,
        orientation: s.orientation,
        moveType: type === "MOVE" ? usePersistedStore.getState().lastMoveType : undefined
      }
    });
  }, [broadcastMsg, store]);

  const broadcastAnnotations = useCallback(() => {
    const s = store?.getState();
    if (!s) return;
    broadcastMsg({
      type: "UPDATE_ANNOTATIONS",
      payload: { arrows: s.arrows, squares: s.squareStyles }
    });
  }, [broadcastMsg, store]);

  const broadcastPermissions = useCallback(() => {
    const s = store?.getState();
    if (!s) return;
    broadcastMsg({
      type: "UPDATE_PERMISSIONS",
      payload: { mode: s.permissionMode, selectedStudentId: s.selectedStudentId }
    });
  }, [broadcastMsg, store]);

  const requestControl = useCallback(() => {
    if (!user) return;
    const name = `${user.firstName} ${user.lastName || ""}`.trim();
    broadcastMsg({
      type: "REQUEST_CONTROL",
      payload: { studentId: user.id, studentName: name }
    });
    toast.success("Requested board control from coach");
  }, [broadcastMsg, user]);

  const handleIncomingSync = useCallback((
    msg: BoardSyncMessage,
    isFromCoach: boolean
  ) => {
    // Drop state-mutating messages from non-coach participants.
    if (COACH_ONLY_MESSAGE_TYPES.has(msg.type) && !isFromCoach) {
      console.warn(
        `Ignored board sync message "${msg.type}" from a non-coach participant`
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
            ...(msg.payload.orientation ? { orientation: msg.payload.orientation } : {}),
            // FORCE_SYNC carries the full board snapshot, including annotations
            ...(Array.isArray(msg.payload.arrows) ? { arrows: msg.payload.arrows } : {}),
            ...(msg.payload.squares ? { squareStyles: msg.payload.squares } : {}),
            // Only a MOVE carries a real move sound; UNDO/REDO/RESET/FORCE_SYNC
            // reposition the board rather than play a move (AUDIT H6).
            ...(msg.type === "MOVE" && msg.payload.moveType
              ? { moveType: msg.payload.moveType }
              : {})
          });
        }
        break;
      case "UPDATE_ANNOTATIONS":
        if (msg.payload) {
          syncFromRemote({
            arrows: msg.payload.arrows || [],
            squareStyles: msg.payload.squares || {}
          });
        }
        break;
      case "UPDATE_PERMISSIONS":
        if (msg.payload && msg.payload.mode) {
          syncFromRemote({
            permissionMode: msg.payload.mode,
            selectedStudentId: msg.payload.selectedStudentId
          });
          if (liveClassState?.setBoardControlStudent) {
            liveClassState.setBoardControlStudent(msg.payload.selectedStudentId || null);
          }
        }
        break;
      case "SET_UI_STATE":
        if (msg.payload && (msg.payload.activeTab !== undefined || msg.payload.pdfUrl !== undefined)) {
          syncFromRemote({
            ...(msg.payload.activeTab !== undefined ? { activeTab: msg.payload.activeTab } : {}),
            ...(msg.payload.pdfUrl !== undefined ? { pdfUrl: msg.payload.pdfUrl } : {})
          });
        }
        break;
      case "REQUEST_SYNC": {
        // A late joiner requested a sync. If we are the coach, send full state.
        // Read straight from the store so this callback doesn't close over ~10
        // reactive fields and re-register the data channel on every board
        // change (AUDIT M28).
        if (isCoach) {
          const snapshot = store?.getState();
          if (!snapshot) break;
          broadcastMsg({
            type: "FORCE_SYNC",
            payload: {
              fen: snapshot.fen,
              pgn: snapshot.fullPgn || snapshot.pgn,
              historyIndex: snapshot.historyIndex,
              orientation: snapshot.orientation,
              arrows: snapshot.arrows,
              squares: snapshot.squareStyles,
              activeTab: snapshot.activeTab,
              pdfUrl: snapshot.pdfUrl
            }
          });
        }
        break;
      }
      case "REQUEST_CONTROL":
        if (isCoach && msg.payload?.studentId) {
          const studentId = msg.payload.studentId;
          const studentName = msg.payload.studentName || "A student";
          toast(`${studentName} requested board control`, {
            id: `req-board-control-${studentId}`,
            action: {
              label: "Grant Control",
              onClick: () => {
                if (liveClassState?.setBoardControlStudent) {
                  liveClassState.setBoardControlStudent(studentId);
                  toast.success(`Granted board control to ${studentName}`, {
                    id: `grant-board-control-${studentId}`,
                  });
                }
              }
            },
            duration: 10000,
          });
        }
        break;
    }
  }, [isCoach, store, syncFromRemote, broadcastMsg, liveClassState]);

  // Zustand Store Subscription for Immediate Syncing
  // This bypasses React's batching behavior, ensuring that rapidly consecutive moves
  // are ALL broadcasted over LiveKit without skipping intermediate FENs.
  useEffect(() => {
    if (!store) return;
    
    const unsubscribe = store.subscribe((state, prevState) => {
      const boardChanged = state.fen !== prevState.fen || state.pgn !== prevState.pgn || state.orientation !== prevState.orientation;
      const annotationsChanged = state.arrows !== prevState.arrows || state.squareStyles !== prevState.squareStyles;
      const uiChanged = state.activeTab !== prevState.activeTab || state.pdfUrl !== prevState.pdfUrl;

      if (boardChanged || annotationsChanged || uiChanged) {
        // If this transition came from a remote sync, don't echo it back.
        // `remoteSyncId` is bumped atomically inside `syncFromRemote`'s own
        // `set()` call, so comparing it here can't race the way a
        // `setTimeout`-cleared ref did when two remote messages landed close
        // together (AUDIT H20).
        if (state.remoteSyncId !== prevState.remoteSyncId) {
          return;
        }

        if (boardChanged) {
          broadcastMsg({
            type: "MOVE",
            payload: {
              fen: state.fen,
              // Full mainline + viewed ply, so stepping through history stays
              // in sync for receivers (AUDIT H21).
              pgn: state.fullPgn || state.pgn,
              historyIndex: state.historyIndex,
              orientation: state.orientation,
              moveType: usePersistedStore.getState().lastMoveType
            }
          });
        }

        if (annotationsChanged) {
          broadcastMsg({
            type: "UPDATE_ANNOTATIONS",
            payload: { arrows: state.arrows, squares: state.squareStyles }
          });
        }

        if (uiChanged) {
          broadcastMsg({
            type: "SET_UI_STATE",
            payload: { activeTab: state.activeTab, pdfUrl: state.pdfUrl }
          });
        }
      }
    });
    
    return unsubscribe;
  }, [store, broadcastMsg]);

  const onMessageReceived = useCallback((msg: any) => {
    try {
      const decoder = new TextDecoder();
      const messageStr = decoder.decode(msg.payload);
      const data = JSON.parse(messageStr) as BoardSyncMessage;

      handleIncomingSync(data, isCoachParticipant(msg.from));
    } catch (e) {
      console.error("Failed to parse board sync message", e);
    }
  }, [handleIncomingSync]);

  // Setup receiving messages
  const { send } = useDataChannel(BOARD_SYNC_TOPIC, onMessageReceived);
  
  // Keep send function reference updated
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // On mount, if student, request current state from coach
  useEffect(() => {
    if (!isCoach) {
      broadcastMsg({ type: "REQUEST_SYNC" } as BoardSyncMessage);
    }
  }, [isCoach, broadcastMsg]);

  return {
    broadcastState,
    broadcastAnnotations,
    broadcastPermissions,
    requestControl
  };
}
