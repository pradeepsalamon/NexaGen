import { useEffect, useCallback, useRef } from "react";
import { useDataChannel, useLocalParticipant, useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useBoardStore } from "../context/BoardProvider";
import { BoardSyncMessage } from "../types/sync";
import { useAuthStore } from "@/stores/authStore";

const BOARD_SYNC_TOPIC = "board_sync";

export function useBoardSync() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";
  const { localParticipant } = useLocalParticipant();
  
  const { 
    fen, pgn, orientation, arrows, squareStyles, permissionMode, selectedStudentId,
    syncFromRemote 
  } = useBoardStore();

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
      payload: { fen, pgn, orientation }
    });
  }, [broadcastMsg, fen, pgn, orientation]);

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

  const handleIncomingSync = useCallback((msg: BoardSyncMessage) => {
    switch (msg.type) {
      case "MOVE":
      case "UNDO":
      case "REDO":
      case "RESET":
      case "FORCE_SYNC":
        // Sync full state for simplicity and robust state
        if (msg.payload && msg.payload.fen) {
          syncFromRemote({
            fen: msg.payload.fen,
            pgn: msg.payload.pgn || "",
            ...(msg.payload.orientation ? { orientation: msg.payload.orientation } : {})
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
        }
        break;
      case "REQUEST_SYNC":
        // A late joiner requested a sync. If we are the coach, send full state.
        if (isCoach) {
          broadcastState("FORCE_SYNC");
        }
        break;
    }
  }, [isCoach, syncFromRemote, broadcastState]);

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
    broadcastPermissions
  };
}
