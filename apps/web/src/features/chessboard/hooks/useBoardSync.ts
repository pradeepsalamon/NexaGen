import { useContext, useEffect, useCallback, useRef } from "react";
import { useDataChannel, useLocalParticipant, useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useBoardStore, BoardContext } from "../context/BoardProvider";
import { useBoardStore as usePersistedStore } from "../store/boardStore";
import { BoardSyncMessage } from "../types/sync";
import { useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { toast } from "sonner";

const BOARD_SYNC_TOPIC = "board_sync";

export function useBoardSync() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";
  const { localParticipant } = useLocalParticipant();
  const liveClassState = useOptionalLiveClassState();
  
  const store = useContext(BoardContext);
  
  const { 
    fen, pgn, orientation, arrows, squareStyles, permissionMode, selectedStudentId,
    syncFromRemote
  } = useBoardStore();

  const lastMoveType = usePersistedStore((state) => state.lastMoveType);

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
    broadcastMsg({
      type,
      payload: { fen, pgn, orientation, moveType: type === "MOVE" ? lastMoveType : undefined }
    });
  }, [broadcastMsg, fen, pgn, orientation, lastMoveType]);

  const broadcastAnnotations = useCallback(() => {
    broadcastMsg({
      type: "UPDATE_ANNOTATIONS",
      payload: { arrows, squares: squareStyles }
    });
  }, [broadcastMsg, arrows, squareStyles]);

  const broadcastPermissions = useCallback(() => {
    broadcastMsg({
      type: "UPDATE_PERMISSIONS",
      payload: { mode: permissionMode, selectedStudentId }
    });
  }, [broadcastMsg, permissionMode, selectedStudentId]);

  const requestControl = useCallback(() => {
    if (!user) return;
    const name = `${user.firstName} ${user.lastName || ""}`.trim();
    broadcastMsg({
      type: "REQUEST_CONTROL",
      payload: { studentId: user.id, studentName: name }
    });
    toast.success("Requested board control from coach");
  }, [broadcastMsg, user]);

  const isRemoteUpdateRef = useRef(false);

  // Mark the next store change as remote-originated so it isn't echoed back.
  // The flag auto-expires because some remote messages (e.g. UPDATE_PERMISSIONS)
  // don't produce a board change, and would otherwise suppress the following
  // local move broadcast.
  const markRemoteUpdate = useCallback(() => {
    isRemoteUpdateRef.current = true;
    setTimeout(() => {
      isRemoteUpdateRef.current = false;
    }, 0);
  }, []);

  const handleIncomingSync = useCallback((msg: BoardSyncMessage) => {
    switch (msg.type) {
      case "MOVE":
      case "UNDO":
      case "REDO":
      case "RESET":
      case "FORCE_SYNC":
        if (msg.payload && msg.payload.fen) {
          markRemoteUpdate();
          syncFromRemote({
            fen: msg.payload.fen,
            pgn: msg.payload.pgn || "",
            ...(msg.payload.orientation ? { orientation: msg.payload.orientation } : {})
          });
        }
        break;
      case "UPDATE_ANNOTATIONS":
        if (msg.payload) {
          markRemoteUpdate();
          syncFromRemote({
            arrows: msg.payload.arrows || [],
            squareStyles: msg.payload.squares || {}
          });
        }
        break;
      case "UPDATE_PERMISSIONS":
        if (msg.payload && msg.payload.mode) {
          markRemoteUpdate();
          syncFromRemote({
            permissionMode: msg.payload.mode,
            selectedStudentId: msg.payload.selectedStudentId
          });
          if (liveClassState?.setBoardControlStudent) {
            liveClassState.setBoardControlStudent(msg.payload.selectedStudentId || null);
          }
        }
        break;
      case "REQUEST_SYNC":
        // A late joiner requested a sync. If we are the coach, send full state.
        if (isCoach) {
          broadcastState("FORCE_SYNC");
        }
        break;
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
  }, [isCoach, syncFromRemote, broadcastState, liveClassState, markRemoteUpdate]);

  // Zustand Store Subscription for Immediate Syncing
  // This bypasses React's batching behavior, ensuring that rapidly consecutive moves
  // are ALL broadcasted over LiveKit without skipping intermediate FENs.
  useEffect(() => {
    if (!store) return;
    
    const unsubscribe = store.subscribe((state, prevState) => {
      const boardChanged = state.fen !== prevState.fen || state.pgn !== prevState.pgn || state.orientation !== prevState.orientation;
      const annotationsChanged = state.arrows !== prevState.arrows || state.squareStyles !== prevState.squareStyles;
      
      if (boardChanged || annotationsChanged) {
        // If the change came from a remote sync event, we don't broadcast it back.
        if (isRemoteUpdateRef.current) {
          isRemoteUpdateRef.current = false;
          return;
        }

        if (boardChanged) {
          broadcastMsg({
            type: "MOVE",
            payload: { 
              fen: state.fen, 
              pgn: state.pgn, 
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
      }
    });
    
    return unsubscribe;
  }, [store, broadcastMsg]);

  const onMessageReceived = useCallback((msg: any) => {
    try {
      const decoder = new TextDecoder();
      const messageStr = decoder.decode(msg.payload);
      const data = JSON.parse(messageStr) as BoardSyncMessage;
      
      handleIncomingSync(data);
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
